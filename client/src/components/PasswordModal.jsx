import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';

export default function PasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/password', { current, next }); setMsg({ ok: true, text: 'Password changed.' }); setCurrent(''); setNext(''); }
    catch (err) { setMsg({ ok: false, text: err.message }); }
  };

  return (
    <Modal title="Change password" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Current password<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></label>
        <label>New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} autoComplete="new-password" /></label>
        {msg && <div className={msg.ok ? 'success' : 'error'}>{msg.text}</div>}
        <div className="actions"><span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary">Change password</button>
        </div>
      </form>
    </Modal>
  );
}
