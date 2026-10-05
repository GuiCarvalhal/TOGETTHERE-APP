import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
import GatheringMetaLine from '@/components/tt/GatheringMetaLine';
import { canManageGathering } from '@/lib/gatheringHelpers';
import { Settings, Music, MessageCircle } from 'lucide-react';

// Cover-photo hero for a gathering shell.
//
// Containment model (fixes long-name overlap with top-right actions):
//  - The cover image + gradient are absolute-fill BACKGROUND only.
//  - The top-right action controls and the bottom text/status/meta each live
//    in their OWN normal-flow band (relative), separated by a flex-1 spacer,
//    so neither overlaps the other and the hero grows to fit content instead
//    of a fixed-height overlap.
//  - The gathering name is a one-line truncated <h1> with a full-text `title`
//    for accessibility; min-w-0 is applied on every ancestor so the truncation
//    chain holds at narrow widths and the shared GatheringMetaLine keeps its
//    own shrink-0 duration tail semantics intact.
// Action touch targets stay 44px (w-11 h-11) and are never hidden.
export default function GatheringHero({ id, gathering, role, dateStatusLabel, meta }) {
  const showActions = canManageGathering(role) || gathering.whatsapp_url || gathering.music_url;
  return (
    <header className="relative w-full overflow-hidden min-h-[124px] sm:min-h-[168px] flex flex-col">
      {gathering.cover_image ? (
        <div className="absolute inset-0">
          <Image src={gathering.cover_image} alt={gathering.name} className="w-full h-full object-cover" fittingType="fill" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-ink-scrim flex items-center justify-center">
          <span className="font-display italic text-white/20 text-4xl">TOGETTHERE</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/25" />
      {showActions && (
        <div className="relative flex justify-end items-center gap-2 p-3">
          {canManageGathering(role) && (
            <Link to={`/gathering/${id}/settings`} aria-label="Gathering settings" className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm text-white hover:bg-black/50 transition-colors">
              <Settings className="w-5 h-5" />
            </Link>
          )}
          {gathering.music_url && (
            <a href={gathering.music_url} target="_blank" rel="noopener noreferrer" aria-label="Open gathering playlist" className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm text-white hover:bg-black/50 transition-colors">
              <Music className="w-5 h-5" />
            </a>
          )}
          {gathering.whatsapp_url && (
            <a href={gathering.whatsapp_url} target="_blank" rel="noopener noreferrer" aria-label="Open WhatsApp group" className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm text-white hover:bg-black/50 transition-colors">
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
        </div>
      )}
      <div className="relative flex-1" />
      <div className="relative p-4 sm:p-6 min-w-0">
        <div className="min-w-0">
          <span className="tt-label text-white/80 block mb-1">{dateStatusLabel}</span>
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-white leading-tight truncate" title={gathering.name}>{gathering.name}</h1>
          <div className="mt-1.5 text-white/85 text-xs sm:text-sm min-w-0">
            <GatheringMetaLine meta={meta} />
          </div>
        </div>
      </div>
    </header>
  );
}