import React from 'react';

export default function StatusSelect({ value, statuses, onChange, disabled, label }) {
  const s = value ? statuses[value] : null;
  const style = s ? { background: s.color, color: s.text, borderColor: s.color } : undefined;
  if (disabled) {
    return <span className={`pill ${s ? '' : 'blank'}`} style={style} title={s?.label}>{value || '—'}</span>;
  }
  return (
    <select className={`pill ${s ? '' : 'blank'}`} style={style} value={value || ''} aria-label={label}
      title={s?.label || 'Set status'} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {Object.values(statuses).map((o) => <option key={o.code} value={o.code} title={o.label}>{o.code}</option>)}
    </select>
  );
}
