import React from 'react';
import { User, Users, Image as ImageIcon, ImageOff, Plus } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';
import { Button } from '@/components/ui/button';

// Shared per-page toolbar + content shell used by every page that has the
// Mine/Group scope switcher (Journey, Expenses, Members, Agent). The sticky
// strip itself is sourced from StickyBar so it stays identical to the journey
// item detail action bar (single source of truth — no visual drift). Content
// is wrapped in a consistent 20px gap (matching the shell's top padding).
export default function PageToolbar({ scope, setScope, images, setImages, showImagesToggle = true, onAdd, canAdd, children }) {
  return (
    <div>
      <StickyBar>
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
              <Button
                variant={images ? 'default' : 'outline'}
                size="sm"
                onClick={() => setImages(!images)}
                aria-pressed={images}
                aria-label={images ? 'Hide cover images' : 'Show cover images'}
                className={images ? 'bg-terra/10 text-terra-deep hover:bg-terra/15 border border-terra/25' : ''}
              >
                {images ? <ImageIcon /> : <ImageOff />}
                <span className="hidden sm:inline">{images ? 'Images' : 'Compact'}</span>
              </Button>
            )}
            {canAdd && (
              <Button variant="default" size="sm" onClick={onAdd} className="shrink-0">
                <Plus />
                <span className="hidden sm:inline">Add item</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}
          </div>
      </StickyBar>
      {children != null && <div className="mt-5">{children}</div>}
    </div>
  );
}