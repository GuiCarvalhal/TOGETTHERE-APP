import React from 'react';

// On-brand empty state: illustration-style icon medallion + inviting copy + optional action.
export default function EmptyState({ icon: Icon, title, body, action, className = '' }) {
  return (
    <div className={`tt-card p-10 sm:p-12 text-center max-w-md mx-auto ${className}`}>
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-terra/10 border border-terra/20 flex items-center justify-center mx-auto mb-5">
          <Icon className="w-8 h-8 text-terra" strokeWidth={1.5} />
        </div>
      )}
      <p className="font-display text-2xl mb-2 text-ink-deep">{title}</p>
      {body && <p className="text-ink-deep/60 mb-6 text-sm leading-relaxed">{body}</p>}
      {action}
    </div>
  );
}