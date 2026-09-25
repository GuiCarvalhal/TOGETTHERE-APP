import React from 'react';
import { Sparkles, Lightbulb } from 'lucide-react';

// Group vibe: 2-3 tag badges, a narrative synthesis paragraph, and one
// concrete actionable tip.
export default function VibeCard({ vibe }) {
  if (!vibe) return null;
  return (
    <div className="tt-card p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles className="w-4 h-4 text-terra-deep" />
        <span className="tt-label text-ink-deep/50">Group vibe</span>
      </div>
      {vibe.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {vibe.tags.map((t, i) => (
            <span key={i} className="px-2.5 py-1 rounded-full bg-terra/12 text-terra-deep text-xs font-semibold border border-terra/25">{t}</span>
          ))}
        </div>
      )}
      {vibe.paragraph && <p className="text-sm text-ink-deep/80 leading-relaxed">{vibe.paragraph}</p>}
      {vibe.tip && (
        <div className="mt-2.5 flex items-start gap-2 tt-ink-panel p-2.5">
          <Lightbulb className="w-3.5 h-3.5 text-terra-deep shrink-0 mt-0.5" />
          <p className="text-xs text-ink-deep/75 leading-relaxed">{vibe.tip}</p>
        </div>
      )}
    </div>
  );
}