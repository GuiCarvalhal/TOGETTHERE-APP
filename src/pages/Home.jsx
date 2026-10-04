import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image } from '@/components/ui/image';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Plus, CalendarDays, Compass, Route, Receipt, Sparkles, X, Plane, Car, Train, Hotel, Ship, MapPin } from 'lucide-react';
import { gatheringDateStatus, gatheringSortKey, formatGatheringRange } from '@/lib/gatheringDates';
import { format, differenceInCalendarDays } from 'date-fns';
import EmptyState from '@/components/tt/EmptyState';
import AppHeader from '@/components/tt/AppHeader';
import Skeleton from '@/components/tt/Skeleton';
import GatheringCard from '@/components/tt/cards/GatheringCard';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import DestinationPicker from '@/components/tt/DestinationPicker';
import ProfileCompleteReminder from '@/components/tt/ProfileCompleteReminder';
import { useI18n } from '@/lib/i18n';

const SAMPLE_COVERS = [
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=80',
  'https://images.unsplash.com/photo-1502602898657-3e9fa60e1900?w=1200&q=80',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80',
];

const FILTER_KEYS = [
  { key: 'all', tk: 'home.filterAll' },
  { key: 'upcoming', tk: 'home.filterUpcoming' },
  { key: 'past', tk: 'home.filterPast' },
];

const EMPTY_FORM = { name: '', description: '', destination_places: [], cover_image: SAMPLE_COVERS[0] };

const JOURNEY_ICONS = { flight: Plane, car: Car, train: Train, hotel: Hotel, activity: Compass, cruise: Ship, other: MapPin };
const JOURNEY_TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.color]));

export default function Home() {
  const { t } = useI18n();
  const [memberships, setMemberships] = useState([]);
  const [gatherings, setGatherings] = useState([]);
  const [previews, setPreviews] = useState({});
  const [itemsByGathering, setItemsByGathering] = useState({});
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nextUpcoming, setNextUpcoming] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getHomePreviews', {});
      const data = res.data || res;
      setGatherings(data.gatherings || []);
      setMemberships(data.memberships || []);
      setPreviews(data.previews || {});
      setItemsByGathering(data.itemsByGathering || {});
      setUserId(data.userId || null);
      setNextUpcoming(data.nextUpcoming || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await base44.functions.invoke('createGathering', {
        name: form.name.trim(),
        description: form.description,
        destination_places: form.destination_places,
        cover_image: form.cover_image,
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not create gathering');
    } finally {
      setCreating(false);
    }
  }

  const roleOf = (gid) => memberships.find((m) => m.gathering_id === gid)?.role;

  // Derive each gathering's date status + sort key + range from its journey
  // items (current user's items first, falling back to all). Ordering: ongoing
  // first, then future (nearest first), then past (most recent first), TBD last.
  const now = new Date();
  const annotated = gatherings.map((g) => {
    const items = itemsByGathering[g.id] || [];
    const status = gatheringDateStatus(g, items, userId, now);
    const sortKey = gatheringSortKey(g, items, userId, now);
    const dateRange = formatGatheringRange(g, items, userId);
    return { g, status, sortKey, dateRange };
  });
  const filtered = annotated.filter(({ status }) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') return status.key === 'ongoing' || status.key === 'upcoming';
    if (filter === 'past') return status.key === 'past';
    return true;
  });
  const sorted = [...filtered].sort((a, b) =>
    a.sortKey.bucket - b.sortKey.bucket || a.sortKey.ts - b.sortKey.ts
  );

  // Featured eyebrow: date-focused relative + absolute timing for the next
  // upcoming segment (replaces the gathering name). Ongoing → HAPPENING NOW ·
  // TODAY · <today>; upcoming → UP NEXT · <relative> · <start date>. The exact
  // departure clock time lives on the JourneyCard below; this line is the
  // calendar-date + how-soon context, which is the more important line.
  const featuredEyebrow = (() => {
    if (!nextUpcoming) return null;
    const start = nextUpcoming.item.start_datetime ? new Date(nextUpcoming.item.start_datetime) : null;
    const refDate = nextUpcoming.ongoing ? now : start;
    const absDate = refDate ? format(refDate, 'EEE, MMM d') : '';
    const days = start ? differenceInCalendarDays(start, now) : 0;
    const relative = nextUpcoming.ongoing
      ? t('home.today')
      : days <= 0 ? t('home.today') : days === 1 ? t('home.tomorrow') : t('home.inDays', { count: days });
    const statusLabel = nextUpcoming.ongoing ? t('home.happeningNow') : t('home.upNext');
    return { statusLabel, relative, absDate };
  })();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Universal header */}
      <AppHeader />

      {/* Hero intro — or the user's next upcoming journey segment when one exists */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10">
        {nextUpcoming ? (
          <div>
            {featuredEyebrow && (
              <p className="text-sm font-bold mb-3 tracking-wide flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-terra-coral uppercase">{featuredEyebrow.statusLabel}</span>
                <span className="text-ink-deep/30">·</span>
                <span className="text-ink-deep uppercase">{featuredEyebrow.relative}</span>
                <span className="text-ink-deep/30">·</span>
                <span className="text-ink-deep/75">{featuredEyebrow.absDate}</span>
              </p>
            )}
            <JourneyCard
              item={nextUpcoming.item}
              leg={nextUpcoming.item.type === 'hotel' ? 'check-in' : undefined}
              typeColor={JOURNEY_TYPE_COLOR[nextUpcoming.item.type] || JOURNEY_TYPE_COLOR.other}
              icon={JOURNEY_ICONS[nextUpcoming.item.type] || MapPin}
              participants={nextUpcoming.participants}
              showImages
              to={`/gathering/${nextUpcoming.gatheringId}/journey/${nextUpcoming.item.id}`}
            />
          </div>
        ) : (
          <>
            <p className="tt-label text-terra-coral mb-3">{t('home.groupTravel')}</p>
            <h1 className="font-display text-4xl sm:text-6xl font-bold leading-[1.05] tt-text-balance max-w-3xl">
              {t('home.heroLine1')}<br /><span className="italic text-terra-coral">{t('home.heroLine2')}</span>
            </h1>
          </>
        )}
      </section>

      <ProfileCompleteReminder />

      {/* Gatherings grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h2 className="font-display text-2xl font-bold whitespace-nowrap">{t('home.yourGatherings')}</h2>
            {gatherings.length > 1 && (
              <div className="flex items-center gap-2">
                {FILTER_KEYS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${filter === f.key ? 'bg-primary text-primary-foreground' : 'tt-ink-panel text-muted-foreground hover:text-foreground'}`}>
                    {t(f.tk)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button onClick={() => setOpen(true)} size="sm" className="shrink-0"><Plus /> {t('home.new')}</Button>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tt-card overflow-hidden">
                <Skeleton className="h-[155px] w-full" />
                <div className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3" tone="cream" />
                  <Skeleton className="h-3 w-1/2" tone="cream" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-6 w-20 rounded-full" tone="cream" />
                    <Skeleton className="h-7 w-24 rounded-full" tone="cream" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : gatherings.length === 0 ? (
          <EmptyState
            icon={Compass}
            title={t('home.noGatherings')}
            body={t('home.noGatheringsBody')}
            action={<Button onClick={() => setOpen(true)}><Plus /> {t('home.createGathering')}</Button>}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={filter === 'past' ? CalendarDays : Compass}
            title={filter === 'past' ? t('home.noPast') : t('home.noUpcoming')}
            body={filter === 'past' ? t('home.noPastBody') : t('home.noUpcomingBody')}
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(({ g, status, dateRange }) => (
              <GatheringCard
                key={g.id}
                gathering={g}
                dateLabel={status.label}
                dateRange={dateRange}
                role={roleOf(g.id)}
                people={previews[g.id] || []}
                to={`/gathering/${g.id}/journey`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Three pillars — horizontal, icon + headline only, each links to how-it-works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { icon: Route, title: t('home.pillarItinerary') },
            { icon: Receipt, title: t('home.pillarSplits') },
            { icon: Sparkles, title: t('home.pillarAI') },
          ].map((f) => (
            <Link
              key={f.title}
              to="/how-it-works"
              aria-label={f.title}
              className="tt-ink-panel p-3 flex flex-col items-center text-center gap-2 rounded-xl hover:bg-foreground/5 active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
            >
              <div className="w-9 h-9 rounded-lg bg-terra/15 border border-terra/25 flex items-center justify-center shrink-0">
                <f.icon className="w-4 h-4 text-terra-coral" />
              </div>
              <p className="font-display text-xs font-bold text-foreground leading-tight">{f.title}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="tt-card bg-card text-card-foreground rounded-[1.5rem] p-0 max-w-lg">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="font-display text-2xl font-bold text-ink-deep">{t('home.newGathering')}</DialogTitle>
            <DialogDescription className="text-ink-deep/60">{t('home.newGatheringDesc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="px-6 pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="g-name" className="text-ink-deep">{t('home.name')}</Label>
              <Input id="g-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Amalfi Coast Reunion '25" required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <div className="space-y-2">
              <Label className="text-ink-deep">{t('home.destinations')}</Label>
              <DestinationPicker
                places={form.destination_places}
                onChange={(places) => setForm({ ...form, destination_places: places })}
                placeholder={t('home.destPlaceholder')}
              />
              <p className="text-xs text-ink-deep/50">{t('home.destHint')}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-ink-deep">{t('home.coverImage')}</Label>
              <div className="flex gap-2">
                {SAMPLE_COVERS.map((url) => (
                  <button type="button" key={url} onClick={() => setForm({ ...form, cover_image: url })}
                    className={`w-20 h-14 rounded-lg overflow-hidden border-2 ${form.cover_image === url ? 'border-terra' : 'border-transparent'}`}>
                    <Image src={url} alt="cover" className="w-full h-full object-cover" fittingType="fill" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-desc" className="text-ink-deep">{t('home.description')} <span className="text-ink-deep/40 font-normal">({t('common.optional')})</span></Label>
              <Textarea id="g-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}><X /> {t('common.cancel')}</Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Plus />} {t('home.createGatheringBtn')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}