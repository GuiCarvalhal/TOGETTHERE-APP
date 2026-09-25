import React from 'react';
import { Globe, Cloud, Clock, Languages, Plug, ArrowLeftRight } from 'lucide-react';

// Good to know: local currency + live conversion, expected weather/season,
// destination timezone (name + offset + DST note), language, electrical plug.
export default function GoodToKnowCard({ goodToKnow, rate }) {
  if (!goodToKnow) return null;
  const tz = goodToKnow.timezone || {};
  return (
    <div className="tt-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-terra-deep" />
        <span className="tt-label text-ink-deep/50">Good to know</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="tt-ink-panel p-2.5 min-w-0">
          <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> Currency</p>
          <p className="text-sm font-semibold text-ink-deep truncate">{goodToKnow.destinationCurrency || '—'}</p>
          {rate && <p className="text-[0.625rem] text-ink-deep/55 mt-0.5 truncate">1 {rate.homeCurrency} ≈ {rate.homeToDest.toFixed(2)} {rate.destCurrency}</p>}
        </div>
        <div className="tt-ink-panel p-2.5 min-w-0">
          <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Cloud className="w-3 h-3" /> Weather</p>
          <p className="text-xs text-ink-deep/80 leading-snug">{goodToKnow.weather || '—'}</p>
        </div>
        <div className="tt-ink-panel p-2.5 min-w-0">
          <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Timezone</p>
          <p className="text-sm font-semibold text-ink-deep truncate">{tz.name || '—'}</p>
          <p className="text-[0.625rem] text-ink-deep/55 truncate">{tz.offset}{tz.dstNote ? ` · ${tz.dstNote}` : ''}</p>
        </div>
        <div className="tt-ink-panel p-2.5 min-w-0">
          <p className="tt-label text-ink-deep/40 mb-1 flex items-center gap-1"><Languages className="w-3 h-3" /> Language</p>
          <p className="text-sm font-semibold text-ink-deep truncate">{goodToKnow.language || '—'}</p>
          <p className="text-[0.625rem] text-ink-deep/55 mt-1 flex items-center gap-1 truncate"><Plug className="w-3 h-3 shrink-0" /> {goodToKnow.plug || '—'}</p>
        </div>
      </div>
    </div>
  );
}