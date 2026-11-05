import express from 'express';
import bcrypt from 'bcryptjs';
import { db, tx } from './db.js';
import { STATUSES, CLOSED, normaliseStatus } from './statuses.js';
import {
  requireAuth, requireRole, setSession, clearSession, publicUser, canEditTeam, canManageDept,
} from './auth.js';

export const api = express.Router();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => { throw new HttpError(400, msg); };
const forbid = () => { throw new HttpError(403, 'You do not have permission to do that'); };
const str = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);

const getTeam = (id) => db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
const getJob = (id) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
const log = (jobId, userId, action, detail) =>
  db.prepare('INSERT INTO job_log (job_id, user_id, action, detail) VALUES (?, ?, ?, ?)').run(jobId, userId, action, detail ?? null);

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) bad('Invalid date');
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

// ---------- auth ----------
api.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username || '').trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

api.post('/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

api.use(requireAuth);

api.get('/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));

api.post('/auth/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) bad('Current password is incorrect');
  if (String(next || '').length < 6) bad('New password must be at least 6 characters');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

// ---------- reference data ----------
api.get('/meta', (req, res) => {
  res.json({
    statuses: STATUSES,
    departments: db.prepare('SELECT * FROM departments ORDER BY sort, id').all(),
    teams: db.prepare('SELECT * FROM teams ORDER BY department_id, sort, id').all(),
    weeks: db.prepare('SELECT id, week_start FROM weeks ORDER BY week_start DESC').all(),
    servicing: db.prepare(
      "SELECT DISTINCT servicing s FROM jobs WHERE servicing IS NOT NULL AND servicing <> '' ORDER BY servicing COLLATE NOCASE"
    ).all().map((r) => r.s),
  });
});

// ---------- weeks / board ----------
api.get('/weeks/:id/jobs', (req, res) => {
  const week = db.prepare('SELECT * FROM weeks WHERE id = ?').get(req.params.id);
  if (!week) throw new HttpError(404, 'Week not found');
  const jobs = db.prepare(`
    SELECT j.*, u.name AS updated_by_name FROM jobs j
    LEFT JOIN users u ON u.id = j.updated_by
    WHERE j.week_id = ? ORDER BY j.team_id, j.sort, j.id`).all(week.id);
  res.json({ week, jobs });
});

// Start a new week. Open jobs (not OVR / CAN) from the most recent earlier week are carried
// forward, with that week's latest status becoming the new Monday status.
api.post('/weeks', requireRole('admin', 'head'), (req, res) => {
  const weekStart = mondayOf(str(req.body?.week_start, 10) || new Date().toISOString().slice(0, 10));
  if (db.prepare('SELECT 1 FROM weeks WHERE week_start = ?').get(weekStart)) bad('That week already exists');
  const week = tx(() => {
    const w = db.prepare('INSERT INTO weeks (week_start) VALUES (?) RETURNING *').get(weekStart);
    const prev = db.prepare('SELECT * FROM weeks WHERE week_start < ? ORDER BY week_start DESC LIMIT 1').get(weekStart);
    if (prev && req.body?.carry_over !== false) {
      const open = db.prepare('SELECT * FROM jobs WHERE week_id = ? ORDER BY team_id, sort, id').all(prev.id)
        .filter((j) => !CLOSED.has(j.friday_status || j.monday_status));
      const ins = db.prepare(`INSERT INTO jobs (week_id, team_id, sort, title, servicing, monday_status, notes, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`);
      const counters = {};
      for (const j of open) {
        counters[j.team_id] = (counters[j.team_id] || 0) + 1;
        const { id } = ins.get(w.id, j.team_id, counters[j.team_id], j.title, j.servicing,
          j.friday_status || j.monday_status, j.notes, req.user.id);
        log(id, req.user.id, 'carried', `Carried over from week of ${prev.week_start}`);
      }
    }
    return w;
  });
  res.status(201).json({ week });
});

api.delete('/weeks/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM weeks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- jobs ----------
api.post('/jobs', (req, res) => {
  const b = req.body || {};
  const team = getTeam(b.team_id);
  if (!team) bad('Choose a team');
  if (!canEditTeam(req.user, team)) forbid();
  if (!db.prepare('SELECT 1 FROM weeks WHERE id = ?').get(b.week_id)) bad('Choose a week');
  const title = str(b.title);
  if (!title) bad('Job name is required');
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 n FROM jobs WHERE week_id = ? AND team_id = ?').get(b.week_id, team.id).n;
  const job = db.prepare(`INSERT INTO jobs (week_id, team_id, sort, title, servicing, monday_status, friday_status, notes, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).get(
    b.week_id, team.id, sort, title, str(b.servicing, 80),
    normaliseStatus(b.monday_status), normaliseStatus(b.friday_status), str(b.notes, 2000), req.user.id);
  log(job.id, req.user.id, 'created', title);
  res.status(201).json({ job });
});

const FIELD_LABELS = {
  title: 'Job', servicing: 'Servicing', monday_status: 'Monday status', friday_status: 'Friday status', notes: 'Notes', team_id: 'Team',
};

api.patch('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) throw new HttpError(404, 'Job not found');
  if (!canEditTeam(req.user, getTeam(job.team_id))) forbid();
  const b = req.body || {};
  const next = {};
  if ('title' in b) next.title = str(b.title) || bad('Job name is required');
  if ('servicing' in b) next.servicing = str(b.servicing, 80);
  if ('monday_status' in b) next.monday_status = normaliseStatus(b.monday_status);
  if ('friday_status' in b) next.friday_status = normaliseStatus(b.friday_status);
  if ('notes' in b) next.notes = str(b.notes, 2000);
  if ('team_id' in b && Number(b.team_id) !== job.team_id) {
    const team = getTeam(b.team_id);
    if (!team || req.user.role === 'member' || !canEditTeam(req.user, team)) forbid();
    next.team_id = team.id;
    next.sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 n FROM jobs WHERE week_id = ? AND team_id = ?').get(job.week_id, team.id).n;
  }
  const changed = Object.keys(next).filter((k) => next[k] !== job[k]);
  if (changed.length) {
    tx(() => {
      const sets = changed.map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE jobs SET ${sets}, updated_by = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(...changed.map((k) => next[k]), req.user.id, job.id);
      for (const k of changed.filter((k) => FIELD_LABELS[k])) {
        const from = k === 'team_id' ? getTeam(job[k])?.name : job[k];
        const to = k === 'team_id' ? getTeam(next[k])?.name : next[k];
        log(job.id, req.user.id, 'updated', `${FIELD_LABELS[k]}: ${from ?? '—'} → ${to ?? '—'}`);
      }
    });
  }
  res.json({ job: db.prepare('SELECT j.*, u.name AS updated_by_name FROM jobs j LEFT JOIN users u ON u.id = j.updated_by WHERE j.id = ?').get(job.id) });
});

api.delete('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) throw new HttpError(404, 'Job not found');
  if (!canManageDept(req.user, getTeam(job.team_id).department_id)) forbid();
  db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
  res.json({ ok: true });
});

api.get('/jobs/:id/log', (req, res) => {
  res.json({
    log: db.prepare(`SELECT l.*, u.name AS user_name FROM job_log l LEFT JOIN users u ON u.id = l.user_id
      WHERE l.job_id = ? ORDER BY l.id DESC`).all(req.params.id),
  });
});

// ---------- teams ----------
api.post('/teams', requireRole('admin', 'head'), (req, res) => {
  const departmentId = Number(req.body?.department_id);
  if (!canManageDept(req.user, departmentId)) forbid();
  const name = str(req.body?.name, 80) || bad('Team name is required');
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 n FROM teams WHERE department_id = ?').get(departmentId).n;
  try {
    res.status(201).json({ team: db.prepare('INSERT INTO teams (department_id, name, sort) VALUES (?, ?, ?) RETURNING *').get(departmentId, name, sort) });
  } catch { bad('A team with that name already exists'); }
});

api.patch('/teams/:id', requireRole('admin', 'head'), (req, res) => {
  const team = getTeam(req.params.id);
  if (!team || !canManageDept(req.user, team.department_id)) forbid();
  const name = 'name' in req.body ? str(req.body.name, 80) || bad('Team name is required') : team.name;
  const active = 'active' in req.body ? (req.body.active ? 1 : 0) : team.active;
  const sort = 'sort' in req.body ? Number(req.body.sort) || 0 : team.sort;
  res.json({ team: db.prepare('UPDATE teams SET name = ?, active = ?, sort = ? WHERE id = ? RETURNING *').get(name, active, sort, team.id) });
});

// ---------- users (admin) ----------
api.get('/users', requireRole('admin'), (req, res) => {
  res.json({ users: db.prepare('SELECT * FROM users ORDER BY role, department_id, name').all().map(publicUser) });
});

function userFields(b, existing = {}) {
  const role = b.role ?? existing.role;
  if (!['admin', 'head', 'member'].includes(role)) bad('Choose a role');
  let departmentId = 'department_id' in b ? (b.department_id ? Number(b.department_id) : null) : existing.department_id;
  let teamId = 'team_id' in b ? (b.team_id ? Number(b.team_id) : null) : existing.team_id;
  if (role === 'admin') { departmentId = null; teamId = null; }
  if (role !== 'admin' && !departmentId) bad('Choose a department');
  if (role === 'member') {
    const team = getTeam(teamId);
    if (!team || team.department_id !== departmentId) bad('Choose a team in that department');
  } else teamId = null;
  return { role, department_id: departmentId, team_id: teamId };
}

api.post('/users', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 80) || bad('Name is required');
  const username = str(b.username, 40) || bad('Username is required');
  if (String(b.password || '').length < 6) bad('Password must be at least 6 characters');
  const f = userFields(b);
  try {
    const u = db.prepare(`INSERT INTO users (name, username, password_hash, role, department_id, team_id)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING *`).get(name, username, bcrypt.hashSync(b.password, 10), f.role, f.department_id, f.team_id);
    res.status(201).json({ user: publicUser(u) });
  } catch { bad('That username is taken'); }
});

api.patch('/users/:id', requireRole('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) throw new HttpError(404, 'User not found');
  const b = req.body || {};
  const f = userFields(b, u);
  const name = 'name' in b ? str(b.name, 80) || bad('Name is required') : u.name;
  const active = 'active' in b ? (b.active ? 1 : 0) : u.active;
  if (u.id === req.user.id && (!active || f.role !== 'admin')) bad('You cannot demote or deactivate yourself');
  db.prepare('UPDATE users SET name = ?, role = ?, department_id = ?, team_id = ?, active = ? WHERE id = ?')
    .run(name, f.role, f.department_id, f.team_id, active, u.id);
  if (b.password) {
    if (String(b.password).length < 6) bad('Password must be at least 6 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(b.password, 10), u.id);
  }
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});

// ---------- errors ----------
api.use((err, req, res, _next) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
});
