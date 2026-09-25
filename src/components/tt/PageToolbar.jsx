import React from 'react';
import { User, Users, Image as ImageIcon, ImageOff, Plus } from 'lucide-react';

// Per-page sub-toolbar: (a) Personal/Group scope switcher, (b) card cover-
// images on/off toggle, and (c) an Add-item action — all on one line. The Add
// action opens the existing add-item flow (passed in as onAdd) and lives in
// the sticky toolbar so it never obscures the journey below.
export default function PageToolbar({ scope, setScope, images, setImages, showImagesToggle = true, onAdd, canAdd }) {
  return (
    <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-background/60 border-b border-foreground/8 flex items-center gap-3">
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
  );
}