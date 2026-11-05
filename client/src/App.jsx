import React, { useCallback, useEffect, useState } from 'react';
import { api, ROLE_LABELS } from './api.js';
import Login from './pages/Login.jsx';
import Board from './pages/Board.jsx';
import Users from './pages/Users.jsx';
import Teams from './pages/Teams.jsx';
import PasswordModal from './components/PasswordModal.jsx';

const useHash = () => {
  const [hash, setHash] = useState(window.location.hash.slice(1) || 'board');
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || 'board');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
};

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [meta, setMeta] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const page = useHash();

  const loadMeta = useCallback(() => api.get('/meta').then(setMeta), []);

  useEffect(() => {
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);
  useEffect(() => { if (user) loadMeta(); }, [user, loadMeta]);

  if (user === undefined) return <div className="splash">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    setMeta(null);
    window.location.hash = '';
  };

  const dept = meta?.departments.find((d) => d.id === user.department_id);
  const team = meta?.teams.find((t) => t.id === user.team_id);
  const nav = [
    ['board', 'Job List'],
    ...(user.role !== 'member' ? [['teams', 'Teams']] : []),
    ...(user.role === 'admin' ? [['users', 'Users']] : []),
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden><i /><i /><i /></span>
          <span>Agency Works <b>Job List</b></span>
        </div>
        <nav className="mainnav">
          {nav.map(([key, label]) => (
            <a key={key} href={`#${key}`} className={page === key ? 'active' : ''}>{label}</a>
          ))}
        </nav>
        <div className="userbox">
          <div className="who">
            <strong>{user.name}</strong>
            <span>{ROLE_LABELS[user.role]}{dept ? ` · ${dept.name}` : ''}{team && team.name !== user.name ? ` · ${team.name}` : ''}</span>
          </div>
          <button className="btn ghost sm" onClick={() => setShowPassword(true)}>Password</button>
          <button className="btn ghost sm" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main>
        {!meta ? <div className="splash">Loading…</div>
          : page === 'users' && user.role === 'admin' ? <Users meta={meta} me={user} />
          : page === 'teams' && user.role !== 'member' ? <Teams meta={meta} me={user} reload={loadMeta} />
          : <Board meta={meta} user={user} reloadMeta={loadMeta} />}
      </main>
      {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  );
}
