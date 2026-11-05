import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { api, canEditTeam, canManageDept } from '../api.js';

export default function JobModal({ job, weekId, meta, user, onClose, onSaved, onDeleted }) {
  const isNew = !job.id;
  const team = meta.teams.find((t) => t.id === job.team_id);
  const editable = canEditTeam(user, team);
  const [form, setForm] = useState({
    title: job.title || '', servicing: job.servicing || '', team_id: job.team_id,
    monday_status: job.monday_status || '', friday_status: job.friday_status || '', notes: job.notes || '',
  });
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!isNew) api.get(`/jobs/${job.id}/log`).then((d) => setLog(d.log)).catch(() => {}); }, [job.id, isNew]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const moveTargets = user.role === 'member' ? [team] : meta.teams.filter((t) => t.active && canEditTeam(user, t));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { ...form, team_id: Number(form.team_id) };
      const { job: saved } = isNew ? await api.post('/jobs', { ...body, week_id: weekId }) : await api.patch(`/jobs/${job.id}`, body);
      onSaved(saved);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  const remove = async () => {
    if (!confirm(`Delete "${job.title}" from this week?`)) return;
    try { await api.del(`/jobs/${job.id}`); onDeleted(job.id); } catch (err) { setError(err.message); }
  };

  const dept = meta.departments.find((d) => d.id === team?.department_id);
  return (
    <Modal title={isNew ? `New job · ${team?.name}` : job.title} onClose={onClose} wide={!isNew}>
      <form onSubmit={save} className="form">
        <fieldset disabled={!editable}>
          <label>Job<input autoFocus value={form.title} onChange={set('title')} required placeholder="e.g. DoT Brand Campaign" /></label>
          <div className="row">
            <label>Servicing
              <input list="servicing-list" value={form.servicing} onChange={set('servicing')} placeholder="Client servicing person" />
              <datalist id="servicing-list">{meta.servicing.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label>Team ({dept?.name})
              <select value={form.team_id} onChange={set('team_id')} disabled={moveTargets.length < 2}>
                {moveTargets.map((t) => <option key={t.id} value={t.id}>{meta.departments.find((d) => d.id === t.department_id)?.name} · {t.name}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            {['monday_status', 'friday_status'].map((k) => (
              <label key={k}>{k === 'monday_status' ? 'Monday status' : 'Friday status'}
                <select value={form[k]} onChange={set(k)}>
                  <option value="">— Not set —</option>
                  {meta.statuses.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.label}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label>Notes<textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="Brief, deadlines, links…" /></label>
        </fieldset>
        {!editable && <p className="muted">You can view this job. Only {team?.name}, the {dept?.name} head or an admin can change it.</p>}
        {error && <div className="error">{error}</div>}
        <div className="actions">
          {!isNew && canManageDept(user, team?.department_id) && <button type="button" className="btn danger" onClick={remove}>Delete</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>{editable ? 'Cancel' : 'Close'}</button>
          {editable && <button className="btn primary" disabled={busy}>{isNew ? 'Add job' : 'Save'}</button>}
        </div>
      </form>
      {!isNew && (
        <div className="history">
          <h3>History</h3>
          {!log.length ? <p className="muted">No changes recorded yet.</p> : (
            <ul>{log.map((l) => (
              <li key={l.id}><span>{l.detail || l.action}</span><small>{l.user_name || 'System'} · {new Date(l.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></li>
            ))}</ul>
          )}
        </div>
      )}
    </Modal>
  );
}
