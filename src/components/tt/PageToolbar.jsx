import React from 'react';
import { Image as ImageIcon, ImageOff, Plus, Map, BarChart3 } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';
import ScopeSwitcher from '@/components/tt/ScopeSwitcher';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

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
//
// `showGraphToggle` + `graphOpen`/`setGraphOpen` + `graphRow`: the Expenses
// graph overlay — same sizing/layout as the map overlay (renders in the same
// StickyBar mapRow slot). Only one overlay is active per page (Expenses has
// graph, Journey/Agent have map), so they never collide.
//
// `hideBar` (optional): when true, the sticky bar is not rendered at all —
// only the children wrapper. No longer used by the Journey page (viewers now
// get a full toolbar with a member-avatar filter replacing Mine/Group).
//
// `switcher` (optional): replaces the default ScopeSwitcher on the left — used
// by the Members page for its Summary/Details toggle, and by the Journey page
// for the viewer's member-avatar filter (replaces Mine/Group).
export default function PageToolbar({ scope, setScope, images, setImages, showImagesToggle = true, mapOpen, setMapOpen, showMapToggle = false, mapRow = null, graphOpen, setGraphOpen, showGraphToggle = false, graphRow = null, onAdd, canAdd, addLabel = 'item', action, filterRow, hideBar = false, switcher, children }) {
  const { t } = useI18n();
  if (hideBar) {
    return <div className="mt-5">{children}</div>;
  }
  const overlayRow = mapOpen ? mapRow : (graphOpen ? graphRow : null);
  return (
    <div>
      <StickyBar footer={filterRow} mapRow={overlayRow}>
        {switcher != null ? switcher : <ScopeSwitcher scope={scope} setScope={setScope} />}
        <div className="ml-auto flex items-center gap-2">
          {showMapToggle && (
            <Button
              variant={mapOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMapOpen(!mapOpen)}
              aria-pressed={mapOpen}
              aria-label={mapOpen ? t('toolbar.hideRouteMap') : t('toolbar.showRouteMap')}
              className={mapOpen ? 'bg-terra/10 text-terra-deep hover:bg-terra/15 border border-terra/25' : ''}
            >
              <Map />
            </Button>
          )}
          {showGraphToggle && (
            <Button
              variant={graphOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => setGraphOpen(!graphOpen)}
              aria-pressed={graphOpen}
              aria-label={graphOpen ? t('toolbar.hideGraph') : t('toolbar.showGraph')}
              className={graphOpen ? 'bg-terra/10 text-terra-deep hover:bg-terra/15 border border-terra/25' : ''}
            >
              <BarChart3 />
            </Button>
          )}
          {showImagesToggle && (
            <Button
              variant={images ? 'default' : 'outline'}
              size="sm"
              onClick={() => setImages(!images)}
              aria-pressed={images}
              aria-label={images ? t('toolbar.hideCoverImages') : t('toolbar.showCoverImages')}
              className={images ? 'bg-terra/10 text-terra-deep hover:bg-terra/15 border border-terra/25' : ''}
            >
              {images ? <ImageIcon /> : <ImageOff />}
              <span className="hidden sm:inline">{images ? t('toolbar.images') : t('toolbar.compact')}</span>
            </Button>
          )}
          {action != null ? action : (canAdd && (
            <Button variant="default" size="sm" onClick={onAdd} className="shrink-0">
              <Plus />
              <span className="hidden sm:inline">{t('common.addLabel', { label: addLabel })}</span>
              <span className="sm:hidden">{t('toolbar.add')}</span>
            </Button>
          ))}
        </div>
      </StickyBar>
      {children != null && <div className="mt-5">{children}</div>}
    </div>
  );
}