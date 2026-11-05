import React, { useState } from 'react';
import { api } from '../api.js';

const LEGEND = [
  ['TBB', '#FF0000'], ['WIP', '#FFC000'], ['OVR', '#00B050'], ['CAN', '#BFBFBF'],
];

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api.post('/auth/login', { username, password });
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-art" aria-hidden>
        <div className="sheet">
          {['Copy', 'Art', 'Production'].map((d, i) => (
            <div className="sheet-col" key={d}>
              <div className="sheet-head">{d}</div>
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <div className="sheet-row" key={r}>
                  <span className="bar" style={{ width: `${45 + ((r * 17 + i * 23) % 45)}%` }} />
                  <span className="dot" style={{ background: LEGEND[(r + i) % 3][1] }} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <h2>Every job, every department, one live list.</h2>
        <p>Copy, Art and Production status for the week — updated by the people doing the work.</p>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="brand big">
            <span className="logo" aria-hidden><i /><i /><i /></span>
            <span>Agency Works <b>Job List</b></span>
          </div>
          <h1>Sign in</h1>
          <label>
            Username
            <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="hint">Forgot your password? Ask your admin to reset it.</p>
        </form>
      </section>
    </div>
  );
}
