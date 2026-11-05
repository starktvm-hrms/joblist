// Job List 2 groups work by client. Jobs have no client field yet, so the client is read from
// the start of the job title ("DoT Brand Campaign" -> DoT). Multi-word clients and aliases are
// listed here; everything else uses the first word.
const MULTI_WORD = ['Tata Coffee', 'St Rochs', 'Kerala Soap'];
const ALIASES = { milma: 'Milma', anani: 'Arunachal' };

export function clientOf(title) {
  const t = (title || '').trim();
  const multi = MULTI_WORD.find((m) => t.toLowerCase().startsWith(m.toLowerCase() + ' '));
  if (multi) return multi;
  const first = t.split(/\s+/)[0] || 'Other';
  return ALIASES[first.toLowerCase()] || first;
}

/** Title without the client prefix, e.g. "DoT Brand Campaign" -> "Brand Campaign". */
export function workName(title, client) {
  const t = (title || '').trim();
  const lower = t.toLowerCase();
  for (const prefix of [client, ...Object.keys(ALIASES).filter((k) => ALIASES[k] === client)]) {
    if (lower.startsWith(prefix.toLowerCase() + ' ')) return t.slice(prefix.length).trim();
  }
  return t;
}

/** Key that treats "KT Campaign" in Copy and "KT  campaign" in Art as the same work. */
export const workKey = (title) => (title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Status order for "how far along" a work is. A work is only as far along as its slowest live job.
const STAGE_ORDER = { NONE: 0, TBB: 1, WIP: 2, OVR: 3 };
export const currentStatus = (j) => j.friday_status || j.monday_status || null;

export function workStage(jobs) {
  const live = jobs.map(currentStatus).filter((s) => s !== 'CAN');
  if (!live.length) return 'CAN';
  return live.map((s) => s || 'NONE').sort((a, b) => STAGE_ORDER[a] - STAGE_ORDER[b])[0];
}
