import React, { useState } from 'react';
import { api, canManageDept } from '../api.js';

export default function Teams({ meta, me, reload }) {
  const [error, setError] = useState('');
  const run = async (fn) => { setError(''); try { await fn(); await reload(); } catch (e) { setError(e.message); } };

  const add = (deptId) => {
    const name = prompt('Team or person name (shown as a block in the job list):');
    if (name?.trim()) run(() => api.post('/teams', { department_id: deptId, name }));
  };
  const rename = (t) => {
    const name = prompt('Rename team', t.name);
    if (name?.trim() && name !== t.name) run(() => api.patch(`/teams/${t.id}`, { name }));
  };
  const move = (list, i, dir) => run(async () => {
    const order = [...list];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    await Promise.all(order.map((t, n) => (t.sort === n + 1 ? null : api.patch(`/teams/${t.id}`, { sort: n + 1 }))));
  });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Teams</h1><p className="muted">Each team is a block in the job list: a person, a pair, or a unit such as Video or KOC.</p></div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="teams-grid">
        {meta.departments.map((d) => {
          const list = meta.teams.filter((t) => t.department_id === d.id);
          const can = canManageDept(me, d.id);
          return (
            <section className="card" key={d.id}>
              <header className="card-head"><h2>{d.name}</h2>{can && <button className="btn primary sm" onClick={() => add(d.id)}>+ Add team</button>}</header>
              <ol className="teamlist">
                {list.map((t, i) => (
                  <li key={t.id} className={t.active ? '' : 'inactive'}>
                    <span className="n">{i + 1}</span><span className="name">{t.name}{!t.active && <em> · hidden</em>}</span>
                    {can && (
                      <span className="tools">
                        <button className="icon" disabled={i === 0} onClick={() => move(list, i, -1)} aria-label="Move up">↑</button>
                        <button className="icon" disabled={i === list.length - 1} onClick={() => move(list, i, 1)} aria-label="Move down">↓</button>
                        <button className="btn ghost sm" onClick={() => rename(t)}>Rename</button>
                        <button className="btn ghost sm" onClick={() => run(() => api.patch(`/teams/${t.id}`, { active: !t.active }))}>{t.active ? 'Hide' : 'Show'}</button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
