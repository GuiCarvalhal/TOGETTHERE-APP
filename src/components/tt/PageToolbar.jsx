import React from 'react';
import { User, Users, Image as ImageIcon, ImageOff, Plus } from 'lucide-react';

// Shared per-page toolbar + content shell used by every page that has the
// Mine/Group scope switcher (Journey, Expenses, Members, Agent). It renders the
// scope switcher, an optional cover-images toggle and an Add-item action on a
// single bar that sticks flush under the compact app header (TopBar) when the
// page scrolls, then wraps the page content in a consistent gap so every
// toolbar page inherits identical spacing above and below the bar (20px,
// matching the shell's top padding) without per-page margin hacks.
//
// Sticky offset: TopBar is h-12 (3rem) + env(safe-area-inset-top) tall, so the
// bar pins at calc(3rem + env(safe-area-inset-top)) — directly below it. The
// bar is opaque (bg-background) at z-30 (below TopBar's z-40) so content scrolls
// cleanly underneath and never shows through.
export default function PageToolbar({ scope, setScope, images, setImages, showImagesToggle = true, onAdd, canAdd, children }) {
  return (
    <div>
      <div className="-mx-4 sm:-mx-6 sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 bg-background border-b border-foreground/8">
        <div className="px-4 sm:px-6 py-2.5 flex items-center gap-3">
          <div className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10">
            <button
              onClick={() => setScope('mine')}
              aria-pressed={scope === 'mine'}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${scope === 'mine' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
            >
              <User className="w-3.5 h-3.5" /> Mine
            </button>
            <button
              onClick={() => setScope('group')}
              aria-pressed={scope === 'group'}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${scope === 'group' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
            >
              <Users className="w-3.5 h-3.5" /> Group
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showImagesToggle && (
              <button
                onClick={() => setImages(!images)}
                aria-pressed={images}
                aria-label={images ? 'Hide cover images' : 'Show cover images'}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${images ? 'bg-terra/10 text-terra-deep border-terra/25' : 'bg-transparent text-foreground/50 border-foreground/15 hover:bg-foreground/5'}`}
              >
                {images ? <ImageIcon className="w-3.5 h-3.5" /> : <ImageOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{images ? 'Images' : 'Compact'}</span>
              </button>
            )}
            {canAdd && (
              <button
                onClick={onAdd}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold bg-terra text-cream hover:bg-terra-deep transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add item</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {children != null && <div className="mt-5">{children}</div>}
    </div>
  );
}