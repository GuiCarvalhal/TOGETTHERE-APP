import React from 'react';

// One scannable block on a settings-style page: a small icon, a title, an
// optional one-line subtitle, then its content on a consistent vertical rhythm.
// Gives every Account section the same rhythm so the page reads as a list of
// clear groups instead of one long stack of cards.
export default function SettingsSection({ icon: Icon, title, subtitle, children, className = '', id }) {
  return (
    <section id={id} className={`space-y-3 ${className}`}>
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span className="mt-px grid place-items-center w-7 h-7 rounded-full bg-terra/10 text-terra-deep shrink-0">
            <Icon className="w-3.5 h-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-ink-deep leading-tight">{title}</h2>
          {subtitle ? <p className="text-xs text-ink-deep/55 leading-relaxed mt-1">{subtitle}</p> : null}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}