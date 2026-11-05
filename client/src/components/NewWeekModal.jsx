import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { api, formatWeek } from '../api.js';

function nextMonday(from) {
  const d = from ? new Date(`${from}T00:00:00Z`) : new Date();
  if (from) d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export default function NewWeekModal({ meta, onClose, onCreated }) {
  const latest = meta.weeks[0]?.week_start;
  const [date, setDate] = useState(nextMonday(latest));
  const [carry, setCarry] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const { week } = await api.post('/weeks', { week_start: date, carry_over: carry }); onCreated(week); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal title="Start a new week" onClose={onClose}>
      <form className="form" onSubmit={create}>
        <label>Week starting (Monday)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        {latest && (
          <label className="check"><input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
            Carry over open jobs from the week of {formatWeek(latest)} (all except OVR and CAN). Their latest status becomes the new Monday status.</label>
        )}
        {error && <div className="error">{error}</div>}
        <div className="actions"><span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>Start week</button>
        </div>
      </form>
    </Modal>
  );
}
