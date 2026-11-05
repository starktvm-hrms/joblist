// Seeds the database from server/seed/joblist.json (generated from the legacy Excel file by
// scripts/import_xlsx.py) and creates starter logins.
//   node server/seed.js          -> seed only if the database is empty
//   node server/seed.js --reset  -> wipe and re-seed
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db, tx } from './db.js';
import { normaliseStatus } from './statuses.js';

const SEED_FILE = path.join(import.meta.dirname, 'seed', 'joblist.json');
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'welcome123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

export function seed({ reset = false } = {}) {
  const hasUsers = db.prepare('SELECT COUNT(*) n FROM users').get().n > 0;
  if (hasUsers && !reset) return false;

  const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const hash = (p) => bcrypt.hashSync(p, 10);
  const memberHash = hash(DEFAULT_PASSWORD);

  tx(() => {
    if (reset) {
      db.exec('DELETE FROM job_log; DELETE FROM jobs; DELETE FROM weeks; DELETE FROM users; DELETE FROM teams; DELETE FROM departments;');
    }
    const insDept = db.prepare('INSERT INTO departments (name, sort) VALUES (?, ?) RETURNING id');
    const insTeam = db.prepare('INSERT INTO teams (department_id, name, sort) VALUES (?, ?, ?) RETURNING id');
    const insUser = db.prepare(
      'INSERT INTO users (name, username, password_hash, role, department_id, team_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insWeek = db.prepare('INSERT INTO weeks (week_start) VALUES (?) RETURNING id');
    const insJob = db.prepare(
      'INSERT INTO jobs (week_id, team_id, sort, title, servicing, monday_status, friday_status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    insUser.run('Administrator', 'admin', hash(ADMIN_PASSWORD), 'admin', null, null);

    const deptIds = {};
    const teamIds = {};
    for (const week of data.weeks) {
      for (const [deptName, teams] of Object.entries(week.departments)) {
        if (!deptIds[deptName]) {
          deptIds[deptName] = insDept.get(deptName, Object.keys(deptIds).length + 1).id;
          insUser.run(`${deptName} Head`, `${slug(deptName)}.head`, memberHash, 'head', deptIds[deptName], null);
        }
        for (const t of teams) {
          const key = `${deptName}|${t.name}`;
          if (teamIds[key]) continue;
          const sort = Object.keys(teamIds).filter((k) => k.startsWith(deptName + '|')).length + 1;
          teamIds[key] = insTeam.get(deptIds[deptName], t.name, sort).id;
          let username = slug(t.name);
          if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) username = `${slug(deptName)}.${username}`;
          insUser.run(t.name, username, memberHash, 'member', deptIds[deptName], teamIds[key]);
        }
      }
    }

    for (const week of data.weeks) {
      const weekId = insWeek.get(week.week_start).id;
      for (const [deptName, teams] of Object.entries(week.departments)) {
        for (const t of teams) {
          t.jobs.forEach((j, i) =>
            insJob.run(weekId, teamIds[`${deptName}|${t.name}`], i + 1, j.title, j.servicing,
              normaliseStatus(j.monday), normaliseStatus(j.friday))
          );
        }
      }
    }
  });
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const done = seed({ reset: process.argv.includes('--reset') });
  console.log(done ? 'Database seeded.' : 'Database already has data; use --reset to re-seed.');
}
