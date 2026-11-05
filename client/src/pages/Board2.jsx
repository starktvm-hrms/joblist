import React, { useEffect, useMemo, useState } from 'react';
import { api, formatWeek } from '../api.js';
import { clientOf, workName, workKey, workStage, currentStatus } from '../clients.js';
import JobModal from '../components/JobModal.jsx';

const SORTS = {
  people: { label: 'Most people', fn: (a, b) => b.people.length - a.people.length || b.jobs.length - a.jobs.length },
  behind: { label: 'Needs attention', fn: (a, b) => stageRank(a.stage) - stageRank(b.stage) || b.people.length - a.people.length },
  name: { label: 'A – Z', fn: (a, b) => a.name.localeCompare(b.name) },
};
const RANK = { NONE: 0, TBB: 1, WIP: 2, OVR: 3, CAN: 4 };
const stageRank = (s) => RANK[s] ?? 0;
const initials = (name) => name.split(/[\s/+.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export default function Board2({ meta, user }) {
  const weeksAsc = useMemo(() => [...meta.weeks].sort((a, b) => a.week_start.localeCompare(b.week_start)), [meta.weeks]);
  const [weekId, setWeekId] = useState(() => meta.weeks[0]?.id ?? null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('people');
  const [dept, setDept] = useState('');
  const [stage, setStage] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!weekId) return;
    setLoading(true);
    api.get(`/weeks/${weekId}/jobs`).then((d) => setJobs(d.jobs)).finally(() => setLoading(false));
  }, [weekId]);

  const teamsById = useMemo(() => Object.fromEntries(meta.teams.map((t) => [t.id, t])), [meta.teams]);
  const statusByCode = useMemo(() => Object.fromEntries(meta.statuses.map((s) => [s.code, s])), [meta.statuses]);
  const deptOrder = meta.departments;

  // jobs -> works (same title across teams) -> clients
  const clients = useMemo(() => {
    const works = new Map();
    for (const j of jobs) {
      const client = clientOf(j.title);
      const key = `${client}|${workKey(j.title)}`;
      if (!works.has(key)) works.set(key, { key, client, name: workName(j.title, client), title: j.title, jobs: [] });
      works.get(key).jobs.push(j);
    }
    const byClient = new Map();
    for (const w of works.values()) {
      w.people = [...new Set(w.jobs.map((j) => j.team_id))];
      w.servicing = [...new Set(w.jobs.map((j) => j.servicing).filter(Boolean))];
      w.stage = workStage(w.jobs);
      w.depts = new Set(w.jobs.map((j) => teamsById[j.team_id]?.department_id));
      if (!byClient.has(w.client)) byClient.set(w.client, { name: w.client, works: [] });
      byClient.get(w.client).works.push(w);
    }
    return [...byClient.values()].map((c) => ({
      ...c,
      people: new Set(c.works.flatMap((w) => w.people)),
      jobCount: c.works.reduce((n, w) => n + w.jobs.length, 0),
    }));
  }, [jobs, teamsById]);

  const matchWork = (w) => {
    if (q && !`${w.title} ${w.servicing.join(' ')} ${w.people.map((id) => teamsById[id]?.name).join(' ')}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (dept && !w.depts.has(Number(dept))) return false;
    if (stage && w.stage !== stage) return false;
    return true;
  };
  const filtering = !!(q || dept || stage);

  const shown = clients
    .map((c) => ({ ...c, shownWorks: c.works.filter(matchWork).sort(SORTS[sort].fn) }))
    .filter((c) => c.shownWorks.length)
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.people.size - a.people.size || b.works.length - a.works.length));

  const allWorks = clients.flatMap((c) => c.works);
  const totalPeople = new Set(jobs.map((j) => j.team_id)).size;
  const shared = allWorks.filter((w) => w.people.length > 1).length;
  const stageCounts = allWorks.reduce((m, w) => ({ ...m, [w.stage]: (m[w.stage] || 0) + 1 }), {});
  const week = meta.weeks.find((w) => w.id === weekId);

  const saveJob = (saved) => setJobs((list) => list.map((j) => (j.id === saved.id ? saved : j)).concat(list.some((j) => j.id === saved.id) ? [] : [saved]));

  return (
    <div className="board board2">
      <div className="weekbar">
        <div className="weektabs" role="tablist" aria-label="Weeks">
          {weeksAsc.map((w) => (
            <button key={w.id} role="tab" aria-selected={w.id === weekId} className={`weektab ${w.id === weekId ? 'active' : ''}`} onClick={() => setWeekId(w.id)}>
              {formatWeek(w.week_start)}
            </button>
          ))}
        </div>
        <span className="beta-tag">Preview · by client</span>
      </div>

      <div className="titlebar">
        <div>
          <h1>Work by client</h1>
          <p className="muted">Week of {week && formatWeek(week.week_start, { year: true })} · who is working on what</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{clients.length}</b><span>Clients</span></div>
        <div className="kpi"><b>{allWorks.length}</b><span>Works</span></div>
        <div className="kpi"><b>{totalPeople}</b><span>People / teams busy</span></div>
        <div className="kpi"><b>{shared}</b><span>Works shared by 2+ people</span></div>
        <div className="kpi stages">
          {[...meta.statuses.filter((s) => s.code !== 'CAN'), { code: 'NONE', label: 'No status', color: '#e3e6ec' }].map((s) => (
            <button key={s.code} className={`stagechip ${stage === s.code ? 'on' : ''}`} onClick={() => setStage(stage === s.code ? '' : s.code)} title={s.label}>
              <span className="swatch" style={{ background: s.color }} />{s.code === 'NONE' ? 'Not set' : s.code} <b>{stageCounts[s.code] || 0}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="filters">
        <input type="search" placeholder="Search work, client, person or servicing…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {deptOrder.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
        </select>
        {filtering && <button className="btn ghost sm" onClick={() => { setQ(''); setDept(''); setStage(''); }}>Clear filters</button>}
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => setCollapsed(Object.fromEntries(clients.map((c) => [c.name, true])))}>Collapse all</button>
        <button className="btn ghost sm" onClick={() => setCollapsed({})}>Expand all</button>
      </div>

      <div className={`clients ${loading ? 'loading' : ''}`}>
        {!shown.length && <div className="empty-state"><p className="muted">No work matches these filters.</p></div>}
        {shown.map((c) => {
          const open = !collapsed[c.name];
          const mix = c.works.reduce((m, w) => ({ ...m, [w.stage]: (m[w.stage] || 0) + 1 }), {});
          return (
            <section key={c.name} className="client">
              <button className="client-head" onClick={() => setCollapsed((s) => ({ ...s, [c.name]: open }))} aria-expanded={open}>
                <span className="chev" aria-hidden>{open ? '▾' : '▸'}</span>
                <span className="client-name">{c.name}</span>
                <span className="client-meta">{c.works.length} {c.works.length === 1 ? 'work' : 'works'} · <b>{c.people.size}</b> {c.people.size === 1 ? 'person' : 'people'}</span>
                <span className="mixbar" title={Object.entries(mix).map(([k, n]) => `${k === 'NONE' ? 'Not set' : k}: ${n}`).join(' · ')}>
                  {['TBB', 'WIP', 'OVR', 'CAN', 'NONE'].filter((k) => mix[k]).map((k) => (
                    <i key={k} style={{ flex: mix[k], background: statusByCode[k]?.color || '#e3e6ec' }} />
                  ))}
                </span>
              </button>
              {open && (
                <div className="works">
                  <div className="work work-headrow" aria-hidden>
                    <span>Work</span><span>People</span>
                    {deptOrder.map((d) => <span key={d.id}>{d.name}</span>)}
                    <span>Stage</span>
                  </div>
                  {c.shownWorks.map((w) => {
                    const st = statusByCode[w.stage];
                    return (
                      <div key={w.key} className="work">
                        <div className="w-title">
                          <strong>{w.name}</strong>
                          {w.servicing.length > 0 && <small>Servicing: {w.servicing.join(', ')}</small>}
                        </div>
                        <div className="w-people" title={w.people.map((id) => teamsById[id]?.name).join(', ')}>
                          <span className="avatars">
                            {w.people.slice(0, 4).map((id) => <span key={id} className={`av d${teamsById[id]?.department_id}`}>{initials(teamsById[id]?.name || '?')}</span>)}
                            {w.people.length > 4 && <span className="av more">+{w.people.length - 4}</span>}
                          </span>
                          <span className="pcount"><b>{w.people.length}</b> {w.people.length === 1 ? 'person' : 'people'}</span>
                        </div>
                        {deptOrder.map((d) => {
                          const djobs = w.jobs.filter((j) => teamsById[j.team_id]?.department_id === d.id);
                          return (
                            <div key={d.id} className="w-dept" data-label={d.name}>
                              {djobs.length ? djobs.map((j) => {
                                const s = statusByCode[currentStatus(j)];
                                return (
                                  <button key={j.id} className="who-chip" onClick={() => setEditing(j)} title={`${teamsById[j.team_id]?.name} · Mon ${j.monday_status || '—'} · Fri ${j.friday_status || '—'}`}>
                                    <span className="bar" style={{ background: s?.color || '#d0d4dc' }} />
                                    <span className="nm">{teamsById[j.team_id]?.name}</span>
                                    <span className="st">{currentStatus(j) || '—'}</span>
                                  </button>
                                );
                              }) : <span className="none">—</span>}
                            </div>
                          );
                        })}
                        <div className="w-stage">
                          <span className="pill" style={st ? { background: st.color, color: st.text, borderColor: st.color } : undefined}>{st ? w.stage : '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="muted footnote">
        Clients are read from the start of each job name, and jobs with the same name in different teams are shown as one work.
        A work's stage is its slowest job, so it shows OVR only when everyone on it is done. Click a person to update their status.
      </p>

      {editing && (
        <JobModal job={editing} weekId={weekId} meta={meta} user={user}
          onClose={() => setEditing(null)}
          onSaved={(j) => { saveJob(j); setEditing(null); }}
          onDeleted={(id) => { setJobs((l) => l.filter((j) => j.id !== id)); setEditing(null); }} />
      )}
    </div>
  );
}
