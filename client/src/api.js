async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
};

export const ROLE_LABELS = { admin: 'Admin', head: 'Department head', member: 'Team member' };

export function canEditTeam(user, team) {
  if (!team || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'head') return team.department_id === user.department_id;
  return team.id === user.team_id;
}

export function canManageDept(user, departmentId) {
  return user?.role === 'admin' || (user?.role === 'head' && user.department_id === departmentId);
}

export function formatWeek(weekStart, opts = {}) {
  const d = new Date(`${weekStart}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(opts.year ? { year: 'numeric' } : {}) });
}
