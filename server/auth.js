import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { db, DB_PATH } from './db.js';

const COOKIE = 'joblist_session';

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Persist a generated secret next to the database so sessions survive restarts.
  const file = path.join(path.dirname(DB_PATH), '.jwt-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}
const SECRET = loadSecret();

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, username: u.username, role: u.role,
    department_id: u.department_id, team_id: u.team_id, active: !!u.active,
  };
}

export function setSession(res, user) {
  const token = jwt.sign({ uid: user.id }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIE !== '1',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

export function requireAuth(req, res, next) {
  try {
    const { uid } = jwt.verify(req.cookies?.[COOKIE] || '', SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(uid);
    if (!user) throw new Error('inactive');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in' });
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed' });

// ---- permission rules ----
// admin  : everything
// head   : manage jobs, teams and weeks for their own department
// member : add jobs and update status for their own team; view everything
export function canEditTeam(user, team) {
  if (!team) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'head') return team.department_id === user.department_id;
  return team.id === user.team_id;
}

export function canManageDept(user, departmentId) {
  return user.role === 'admin' || (user.role === 'head' && user.department_id === departmentId);
}
