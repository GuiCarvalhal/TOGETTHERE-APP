import React from 'react';
import { Image as ImageIcon, ImageOff, Plus, Map } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';
import ScopeSwitcher from '@/components/tt/ScopeSwitcher';
import { Button } from '@/components/ui/button';

// Shared per-page toolbar + content shell used by every page that has the
// Mine/Group scope switcher (Journey, Expenses, Members, Agent). The sticky
// strip itself is sourced from StickyBar so it stays identical to the journey
// item detail action bar (single source of truth — no visual drift). Content
// is wrapped in a consistent 20px gap (matching the shell's top padding).
//
// `action` (optional): replaces the default add button on the right — used by
// the Agent page for its Regenerate button. `filterRow` (optional): a
// horizontal filter strip rendered as a second row in the sticky bar — used by
// the Agent page for category pills. `mapRow` (optional): a route-map row
// rendered inside the sticky region (below the filter row) when `mapOpen` is
// on, so the bar + map stay pinned together while the list scrolls. The map
// toggle itself (`showMapToggle` + `mapOpen`/`setMapOpen`) renders as an
// icon-only sibling of the images on/off toggle, sharing its exact
// active/inactive styling. All optional so Journey/Expenses/Members render
// exactly as before when unused.
export default function PageToolbar({ scope, setScope, images, setImages, showImagesToggle = true, mapOpen, setMapOpen, showMapToggle = false, mapRow = null, onAdd, canAdd, addLabel = 'item', action, filterRow, children }) {
  return (
    <div>
      <StickyBar footer={filterRow} mapRow={mapOpen ? mapRow : null}>
        <ScopeSwitcher scope={scope} setScope={setScope} />
        <div className="ml-auto flex items-center gap-2">
          {showMapToggle && (
            <Button
              variant={mapOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMapOpen(!mapOpen)}
              aria-pressed={mapOpen}
              aria-label={mapOpen ? 'Hide route map' : 'Show route map'}
              className={mapOpen ? 'bg-terra/10 text-terra-deep hover:bg-terra/15 border border-terra/25' : ''}
            >
              <Map />
            </Button>
          )}
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
          {action != null ? action : (canAdd && (
            <Button variant="default" size="sm" onClick={onAdd} className="shrink-0">
              <Plus />
              <span className="hidden sm:inline">Add {addLabel}</span>
              <span className="sm:hidden">Add</span>
            </Button>
          ))}
        </div>
      </StickyBar>
      {children != null && <div className="mt-5">{children}</div>}
    </div>
  );
}