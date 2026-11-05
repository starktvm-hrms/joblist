// Status codes used in the original joblist, with the same colours as the spreadsheet.
export const STATUSES = [
  { code: 'TBB', label: 'To be briefed', color: '#FF0000', text: '#ffffff' },
  { code: 'WIP', label: 'Work in progress', color: '#FFC000', text: '#1f1f1f' },
  { code: 'OVR', label: 'Over (completed)', color: '#00B050', text: '#ffffff' },
  { code: 'CAN', label: 'Cancelled', color: '#BFBFBF', text: '#1f1f1f' },
];

export const STATUS_CODES = new Set(STATUSES.map((s) => s.code));
export const CLOSED = new Set(['OVR', 'CAN']);

/** Normalise legacy values like "TBB 3" or "wip " to a known code (or null). */
export function normaliseStatus(v) {
  if (v == null || v === '') return null;
  const code = String(v).trim().split(/\s+/)[0].toUpperCase();
  return STATUS_CODES.has(code) ? code : null;
}
