import React, { useEffect, useMemo, useState } from 'react';
import { api, canEditTeam, formatWeek } from '../api.js';
import StatusSelect from '../components/StatusSelect.jsx';
import JobModal from '../components/JobModal.jsx';
import NewWeekModal from '../components/NewWeekModal.jsx';

const currentStatus = (j) => j.friday_status || j.monday_status || null;

export default function Board({ meta, user, reloadMeta }) {
  const weeksAsc = useMemo(() => [...meta.weeks].sort((a, b) => a.week_start.localeCompare(b.week_start)), [meta.weeks]);
  const [weekId, setWeekId] = useState(() => meta.weeks[0]?.id ?? null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [servicing, setServicing] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [mobileDept, setMobileDept] = useState(user.department_id || meta.departments[0]?.id);
  const [editing, setEditing] = useState(null); // job object, or { team_id } for a new job
  const [newWeek, setNewWeek] = useState(false);

  useEffect(() => {
    if (!weekId) return;
    setLoading(true);
    api.get(`/weeks/${weekId}/jobs`)
      .then((d) => { setJobs(d.jobs); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [weekId]);

  const teamsById = useMemo(() => Object.fromEntries(meta.teams.map((t) => [t.id, t])), [meta.teams]);
  const statusByCode = useMemo(() => Object.fromEntries(meta.statuses.map((s) => [s.code, s])), [meta.statuses]);

  const matches = (j) => {
    if (q && !`${j.title} ${j.servicing || ''} ${teamsById[j.team_id]?.name || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (servicing && (j.servicing || '').toLowerCase() !== servicing.toLowerCase()) return false;
    if (status === 'NONE' ? currentStatus(j) : status && currentStatus(j) !== status) return false;
    if (mine && !canEditTeam(user, teamsById[j.team_id])) return false;
    return true;
  };
  const filtering = !!(q || servicing || status || mine);
  const visible = jobs.filter(matches);

  const counts = useMemo(() => {
    const c = { total: jobs.length, NONE: 0 };
    for (const j of jobs) { const s = currentStatus(j) || 'NONE'; c[s] = (c[s] || 0) + 1; }
    return c;
  }, [jobs]);

  const saveJob = (saved) => setJobs((list) => {
    const i = list.findIndex((j) => j.id === saved.id);
    if (i === -1) return [...list, saved];
    const next = [...list]; next[i] = saved; return next;
  });

  const quickStatus = async (job, field, value) => {
    const before = job;
    saveJob({ ...job, [field]: value || null });
    try {
      const { job: saved } = await api.patch(`/jobs/${job.id}`, { [field]: value || null });
      saveJob(saved);
    } catch (e) {
      saveJob(before);
      alert(e.message);
    }
  };

  const week = meta.weeks.find((w) => w.id === weekId);
  const isLatest = week && week.id === meta.weeks[0]?.id;
  const canStartWeek = user.role !== 'member';

  if (!meta.weeks.length) {
    return (
      <div className="empty-state">
        <h2>No weeks yet</h2>
        <p>Start the first week to begin tracking jobs.</p>
        {canStartWeek && <button className="btn primary" onClick={() => setNewWeek(true)}>Start a week</button>}
        {newWeek && <NewWeekModal meta={meta} onClose={() => setNewWeek(false)} onCreated={async (w) => { await reloadMeta(); setWeekId(w.id); }} />}
      </div>
    );
  }

  return (
    <div className="board">
      <div className="weekbar">
        <div className="weektabs" role="tablist" aria-label="Weeks">
          {weeksAsc.map((w) => (
            <button key={w.id} role="tab" aria-selected={w.id === weekId}
              className={`weektab ${w.id === weekId ? 'active' : ''}`} onClick={() => setWeekId(w.id)}>
              {formatWeek(w.week_start)}
            </button>
          ))}
        </div>
        {canStartWeek && <button className="btn primary sm" onClick={() => setNewWeek(true)}>+ New week</button>}
      </div>

      <div className="titlebar">
        <div>
          <h1>Week of {week && formatWeek(week.week_start, { year: true })}</h1>
          <p className="muted">{isLatest ? 'Current week' : 'Earlier week'} · {counts.total} jobs</p>
        </div>
        <div className="summary">
          {meta.statuses.map((s) => (
            <button key={s.code} className={`chip ${status === s.code ? 'on' : ''}`} onClick={() => setStatus(status === s.code ? '' : s.code)}
              title={s.label}>
              <span className="swatch" style={{ background: s.color }} />
              <span className="code">{s.code}</span>
              <b>{counts[s.code] || 0}</b>
            </button>
          ))}
          <button className={`chip ${status === 'NONE' ? 'on' : ''}`} onClick={() => setStatus(status === 'NONE' ? '' : 'NONE')} title="No status yet">
            <span className="swatch blank" /><span className="code">No status</span><b>{counts.NONE}</b>
          </button>
        </div>
      </div>

      <div className="filters">
        <input type="search" placeholder="Search job, client or team…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={servicing} onChange={(e) => setServicing(e.target.value)} aria-label="Servicing">
          <option value="">All servicing</option>
          {meta.servicing.map((s) => <option key={s}>{s}</option>)}
        </select>
        {user.role !== 'admin' && (
          <label className="toggle"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            {user.role === 'head' ? 'My department' : 'My jobs'}</label>
        )}
        {filtering && <button className="btn ghost sm" onClick={() => { setQ(''); setServicing(''); setStatus(''); setMine(false); }}>Clear filters</button>}
        {filtering && <span className="muted">{visible.length} of {jobs.length} shown</span>}
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => window.print()}>Print</button>
      </div>

      <div className="depttabs">
        {meta.departments.map((d) => (
          <button key={d.id} className={mobileDept === d.id ? 'active' : ''} onClick={() => setMobileDept(d.id)}>{d.name}</button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      <div className={`grid ${loading ? 'loading' : ''}`}>
        {meta.departments.map((d) => {
          const teams = meta.teams.filter((t) => t.department_id === d.id && (t.active || jobs.some((j) => j.team_id === t.id)));
          return (
            <section key={d.id} className={`dept ${mobileDept === d.id ? 'mobile-on' : ''}`}>
              <table>
                <colgroup><col className="c-no" /><col /><col className="c-serv" /><col className="c-st" /><col className="c-st" /></colgroup>
                <thead>
                  <tr className="dept-head"><th colSpan={5}>{d.name}</th></tr>
                  <tr className="col-head"><th>No</th><th>Job</th><th>Servicing</th><th>Monday</th><th>Friday</th></tr>
                </thead>
                {teams.map((t, ti) => {
                  const all = jobs.filter((j) => j.team_id === t.id);
                  const rows = all.filter(matches);
                  if (filtering && !rows.length) return null;
                  const editable = canEditTeam(user, t);
                  return (
                    <tbody key={t.id} className={`team ${editable ? 'editable' : ''}`}>
                      <tr className="team-head">
                        <td>{ti + 1}</td>
                        <td colSpan={2}>
                          {t.name}
                          <span className="count">{all.length} {all.length === 1 ? 'job' : 'jobs'}</span>
                        </td>
                        <td colSpan={2} className="right">
                          {editable && <button className="addbtn" onClick={() => setEditing({ team_id: t.id })}>+ Add job</button>}
                        </td>
                      </tr>
                      {rows.map((j, i) => (
                        <tr key={j.id} className="job">
                          <td className="no">{i + 1}</td>
                          <td className="title"><button className="linkish" onClick={() => setEditing(j)} title={j.notes || 'Open job'}>{j.title}{j.notes && <span className="note-dot" aria-label="has notes" />}</button></td>
                          <td className="serv">{j.servicing}</td>
                          <td className="st"><StatusSelect value={j.monday_status} statuses={statusByCode} disabled={!editable}
                            onChange={(v) => quickStatus(j, 'monday_status', v)} label={`Monday status for ${j.title}`} /></td>
                          <td className="st"><StatusSelect value={j.friday_status} statuses={statusByCode} disabled={!editable}
                            onChange={(v) => quickStatus(j, 'friday_status', v)} label={`Friday status for ${j.title}`} /></td>
                        </tr>
                      ))}
                      {!all.length && <tr className="job empty"><td /><td colSpan={4}>No jobs this week</td></tr>}
                    </tbody>
                  );
                })}
              </table>
            </section>
          );
        })}
      </div>

      <div className="legend">
        {meta.statuses.map((s) => (
          <span key={s.code}><span className="swatch" style={{ background: s.color }} /> <b>{s.code}</b> {s.label}</span>
        ))}
      </div>

      {editing && (
        <JobModal job={editing} weekId={weekId} meta={meta} user={user}
          onClose={() => setEditing(null)}
          onSaved={(j) => { saveJob(j); setEditing(null); }}
          onDeleted={(id) => { setJobs((l) => l.filter((j) => j.id !== id)); setEditing(null); }} />
      )}
      {newWeek && (
        <NewWeekModal meta={meta} onClose={() => setNewWeek(false)}
          onCreated={async (w) => { await reloadMeta(); setWeekId(w.id); setNewWeek(false); }} />
      )}
    </div>
  );
}
