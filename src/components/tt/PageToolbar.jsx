import React from 'react';
import { User, Users, Image as ImageIcon, ImageOff } from 'lucide-react';

// Simplified per-page sub-toolbar: (a) Personal/Group scope switcher and
// (b) card cover-images on/off toggle. Replaces the beta's category filters.
export default function PageToolbar({ scope, setScope, images, setImages }) {
  return (
    <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 bg-background/60 border-b border-foreground/8 flex items-center gap-3">
      <div className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10">
        <button
          onClick={() => setScope('mine')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${scope === 'mine' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
        >
          <User className="w-3.5 h-3.5" /> Mine
        </button>
        <button
          onClick={() => setScope('group')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${scope === 'group' ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
        >
          <Users className="w-3.5 h-3.5" /> Group
        </button>
      </div>
      <button
        onClick={() => setImages(!images)}
        className={`ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${images ? 'bg-terra/10 text-terra-deep border-terra/25' : 'bg-transparent text-foreground/50 border-foreground/15 hover:bg-foreground/5'}`}
        aria-label={images ? 'Hide cover images' : 'Show cover images'}
      >
        {images ? <ImageIcon className="w-3.5 h-3.5" /> : <ImageOff className="w-3.5 h-3.5" />}
        {images ? 'Images' : 'Compact'}
      </button>
    </div>
  );
}