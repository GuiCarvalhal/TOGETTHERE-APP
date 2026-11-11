import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// One actionable row inside a settings card: icon, label + hint, and either a
// trailing value/toggle or a chevron for navigation. Renders a <Link> when `to`
// is given, a <button> when `onClick` is, and a plain row otherwise, so every
// row keeps the same 52px height, spacing and focus ring.
const ROW =
  'flex items-center gap-3 w-full min-h-[52px] px-3 py-2.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const CLICKABLE = 'hover:bg-cream-pale';

export default function SettingsRow({ icon: Icon, label, hint, value, to, onClick, trailing, tone = 'default' }) {
  const body = (
    <>
      {Icon && (
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-cream-pale shrink-0">
          <Icon className="w-4 h-4 text-ink-deep/60" />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span
          className={`block text-sm font-semibold truncate ${tone === 'destructive' ? 'text-destructive' : 'text-ink-deep'}`}
        >
          {label}
        </span>
        {hint ? (
          <span className="block text-xs text-ink-deep/55 leading-relaxed mt-0.5 break-words">{hint}</span>
        ) : null}
      </span>
      {value ? <span className="text-xs text-ink-deep/60 shrink-0">{value}</span> : null}
      {trailing || (to ? <ChevronRight className="w-4 h-4 text-ink-deep/35 shrink-0" /> : null)}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`${ROW} ${CLICKABLE}`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${ROW} ${CLICKABLE}`}>
        {body}
      </button>
    );
  }
  return <div className={ROW}>{body}</div>;
}