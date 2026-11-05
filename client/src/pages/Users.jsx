import React, { useEffect, useState } from 'react';
import Modal from '../components/Modal.jsx';
import { api, ROLE_LABELS } from '../api.js';

export default function Users({ meta, me }) {
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const load = () => api.get('/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);

  const dept = (id) => meta.departments.find((d) => d.id === id)?.name || '—';
  const team = (id) => meta.teams.find((t) => t.id === id)?.name || '—';
  const shown = users.filter((u) => `${u.name} ${u.username} ${dept(u.department_id)} ${team(u.team_id)}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Users</h1><p className="muted">Admins manage everything. Department heads manage their department. Team members update their own team's jobs.</p></div>
        <button className="btn primary" onClick={() => setEditing({ role: 'member', active: true })}>+ Add user</button>
      </div>
      <div className="filters"><input type="search" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card">
        <table className="list">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Department</th><th>Team</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td><strong>{u.name}</strong></td><td className="mono">{u.username}</td>
                <td><span className={`role role-${u.role}`}>{ROLE_LABELS[u.role]}</span></td>
                <td>{dept(u.department_id)}</td><td>{team(u.team_id)}</td>
                <td>{u.active ? 'Active' : 'Disabled'}</td>
                <td className="right"><button className="btn ghost sm" onClick={() => setEditing(u)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserModal user={editing} meta={meta} me={me} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function UserModal({ user, meta, me, onClose, onSaved }) {
  const isNew = !user.id;
  const [f, setF] = useState({
    name: user.name || '', username: user.username || '', password: '', role: user.role,
    department_id: user.department_id || '', team_id: user.team_id || '', active: user.active,
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const teams = meta.teams.filter((t) => t.department_id === Number(f.department_id) && t.active);

  const save = async (e) => {
    e.preventDefault(); setError('');
    const body = { ...f, department_id: Number(f.department_id) || null, team_id: Number(f.team_id) || null };
    if (!isNew) { delete body.username; if (!body.password) delete body.password; }
    try { isNew ? await api.post('/users', body) : await api.patch(`/users/${user.id}`, body); onSaved(); }
    catch (err) { setError(err.message); }
  };

  return (
    <Modal title={isNew ? 'Add user' : `Edit ${user.name}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="row">
          <label>Full name<input value={f.name} onChange={set('name')} required autoFocus /></label>
          <label>Username<input value={f.username} onChange={set('username')} required disabled={!isNew} autoComplete="off" /></label>
        </div>
        <label>{isNew ? 'Password' : 'Reset password (leave blank to keep)'}
          <input type="password" value={f.password} onChange={set('password')} required={isNew} minLength={6} autoComplete="new-password" /></label>
        <div className="row">
          <label>Role
            <select value={f.role} onChange={set('role')} disabled={user.id === me.id}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {f.role !== 'admin' && (
            <label>Department
              <select value={f.department_id} onChange={(e) => setF((x) => ({ ...x, department_id: e.target.value, team_id: '' }))} required>
                <option value="">Choose…</option>
                {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {f.role === 'member' && (
          <label>Team
            <select value={f.team_id} onChange={set('team_id')} required>
              <option value="">Choose…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        {!isNew && user.id !== me.id && <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> Account active (can sign in)</label>}
        {error && <div className="error">{error}</div>}
        <div className="actions"><span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary">{isNew ? 'Add user' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
