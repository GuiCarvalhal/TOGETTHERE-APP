import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useGathering } from '@/lib/gatheringContext';
import { JOURNEY_TYPES, canEditJourneyItem, canDeleteJourneyItem } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import { formatFullDateTz, formatTimeWithCountry } from '@/lib/formatPlaceTime';
import { useItemStartTz, useItemStartCountry, useItemEndTz, useItemEndCountry } from '@/lib/useItemPlace';
import { itemMapPoints } from '@/lib/journeyMap';
import { Image } from '@/components/ui/image';
import AttachmentChip from '@/components/tt/AttachmentChip';
import AvatarStack from '@/components/tt/AvatarStack';
import SegmentMap from '@/components/journey/SegmentMap';
import Skeleton from '@/components/tt/Skeleton';
import { Button } from '@/components/ui/button';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Plane, Car, Train, Hotel, Compass, Ship, MapPin, Clock, ArrowRightLeft, Loader2, Pencil, Trash2 } from 'lucide-react';
import MoveSegmentSheet from '@/components/journey/MoveSegmentSheet';
import FlightStatusCard from '@/components/journey/FlightStatusCard';
import FlightDetailView from '@/components/journey/FlightDetailView';
import RouteDetailsCard from '@/components/journey/RouteDetailsCard';
import VenueInfoBlock from '@/components/journey/VenueInfoBlock';
import SegmentInfoSections from '@/components/journey/SegmentInfoSections';
import JoinSegmentButton from '@/components/journey/JoinSegmentButton';
import DetailActionBar from '@/components/tt/DetailActionBar';

const ICONS = { flight: Plane, car: Car, train: Train, hotel: Hotel, activity: Compass, cruise: Ship, other: MapPin };
const TYPE_LABEL = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.label]));
const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.color]));
const TYPE_STYLE = {
  flight: 'bg-sky-100 text-sky-700',
  car: 'bg-terra/15 text-terra-deep',
  train: 'bg-violet-100 text-violet-700',
  hotel: 'bg-amber-100 text-amber-700',
  activity: 'bg-emerald-100 text-emerald-700',
  cruise: 'bg-teal-100 text-teal-700',
  other: 'bg-cream-pale text-ink-deep/50',
};

const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

function mapsQuery(item) {
  return item.location_name || item.location_to || item.location_from || '';
}

export default function JourneyDetail() {
  const { itemId } = useParams();
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const { toast } = useToast();
  const startTz = useItemStartTz(item);
  const endTz = useItemEndTz(item);
  const startCc = useItemStartCountry(item);
  const endCc = useItemEndCountry(item);

  async function load(silent) {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await base44.entities.JourneyItem.get(itemId);
      setItem(data);
    } catch (e) {
      if (!silent) setError(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => { load(); }, [itemId]);

  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  // The desktop extra card's "Editing" action lands here with ?edit=1, so the
  // edit form opens straight away (flights use their own full-page surface).
  const editRequestedRef = useRef(false);
  useEffect(() => {
    if (editRequestedRef.current || !item || item.type === 'flight') return;
    if (new URLSearchParams(window.location.search).get('edit') !== '1') return;
    if (!canEditJourneyItem(role, item, currentMember)) return;
    editRequestedRef.current = true;
    setEditing(true);
  }, [item, role, currentMember]);

  // Undo runs from the toast, which outlives this page (we navigate back to the
  // journey list right after deleting), so it must not depend on local state.
  async function undoDelete(title) {
    try {
      const res = await base44.functions.invoke('restoreJourneyItem', { gathering_id: gatheringId, item_id: itemId });
      const data = res?.data || res;
      if (data?.error) throw { message: data.error };
      window.dispatchEvent(new Event('tt-journey-restored'));
      toast({ title: t('recentlyDeleted.restored'), description: t('recentlyDeleted.restoredDesc', { title }) });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.data?.error || e?.message || t('recentlyDeleted.restoreFailed');
      toast({ variant: 'destructive', title: t('recentlyDeleted.restoreFailed'), description: msg });
    }
  }

  async function handleDelete() {
    if (!confirm(t('recentlyDeleted.journeyConfirm'))) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke('deleteJourneyItem', { gathering_id: gatheringId, item_id: itemId });
      const data = res?.data || res;
      if (data?.error) throw { message: data.error };
      const title = item?.title || t('journeyTypes.other');
      // Soft delete + immediate Undo (10s window) — separate from the
      // "Recently deleted" list, which keeps the same item restorable for 30
      // days if the undo window is missed.
      toast({
        title: t('recentlyDeleted.journeyDeleted'),
        description: t('recentlyDeleted.journeyDeletedDesc', { title }),
        duration: 10000,
        action: (
          <ToastAction altText={t('recentlyDeleted.undo')} onClick={() => undoDelete(title)}>
            {t('recentlyDeleted.undo')}
          </ToastAction>
        ),
      });
      navigate(`/gathering/${gatheringId}/journey`);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.data?.error || e?.message || t('journeyDetail.couldNotDelete');
      toast({ variant: 'destructive', title: t('journeyDetail.deleteFailed'), description: msg });
      setDeleting(false);
    }
  }

  const memberById = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const attendees = (item?.attendee_user_ids || []).map((uid) => memberById[uid]).filter(Boolean);
  const canEdit = item && canEditJourneyItem(role, item, currentMember);
  const canDelete = item && canDeleteJourneyItem(role, item, currentMember);
  // Flights edit on the full-page flight surface, not the sheet form.
  const onEdit = () => {
    if (item?.type === 'flight') navigate(`/gathering/${gatheringId}/journey/${item.id}/edit`);
    else setEditing(true);
  };

  const back = () => {
    // Return to the previous page when there's browser history (e.g. coming
    // from Home's "Up next" card or the Journey list). Fall back to the
    // journey list on a direct deep-link/refresh with no prior entry.
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(`/gathering/${gatheringId}/journey`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="tt-card p-4 space-y-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-7 w-2/3" tone="cream" />
          <Skeleton className="h-4 w-1/2" tone="cream" />
        </div>
        <div className="tt-card p-4 space-y-3">
          <Skeleton className="h-4 w-1/3" tone="cream" />
          <Skeleton className="h-32 w-full rounded-xl" tone="cream" />
        </div>
      </div>
    );
  }
  if (error || !item) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="tt-card p-10 text-center max-w-md mx-auto">
          <Compass className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">{t('journeyDetail.segmentNotFound')}</p>
          <p className="text-ink-deep/60 text-sm">{t('journeyDetail.segmentNotFoundBody')}</p>
        </div>
      </div>
    );
  }

  const Icon = ICONS[item.type] || MapPin;
  const typeLabel = t('journeyTypes.' + item.type) || t('journeyTypes.other');
  const typeStyle = TYPE_STYLE[item.type] || TYPE_STYLE.other;
  const typeColor = TYPE_COLOR[item.type] || TYPE_COLOR.other;
  const q = mapsQuery(item);
  const { origin, destination, point } = itemMapPoints(item);
  const images = (item.attachments || []).filter(isImg);
  const docs = (item.attachments || []).filter((u) => !isImg(u));

  const start = item.start_datetime;
  const end = item.end_datetime;

  return (
    <div>
      <DetailActionBar
        onBack={back}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={onEdit}
        onDelete={handleDelete}
        deleting={deleting}
        actions={canEdit ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setMoveOpen(true)} className="shrink-0">
              <ArrowRightLeft />
              <span className="hidden sm:inline">{t('journeyDetail.move')}</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={onEdit} className="shrink-0">
              <Pencil />
              <span className="hidden sm:inline">{t('detailActionBar.edit')}</span>
            </Button>
            {canDelete && (
              <Button variant="destructive" size="icon" onClick={handleDelete} disabled={deleting} aria-label={t('detailActionBar.delete')} className="shrink-0">
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            )}
          </>
        ) : undefined}
      />
      {item.type === 'flight' ? (
        <FlightDetailView item={item} members={members} currentMember={currentMember} onReload={() => load(true)} />
      ) : (
        <div className="mt-5 space-y-4">
      {/* Hero */}
      <div className="tt-card p-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${typeColor}1A`, color: typeColor, border: `1px solid ${typeColor}33` }}>
            <Icon className="w-7 h-7" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <span className="tt-label" style={{ color: typeColor }}>{typeLabel}</span>
            <h1 className="font-display text-2xl font-bold text-ink-deep leading-tight tt-text-balance">{item.title}</h1>
            {item.confirmation_number && (
              <p className="text-xs text-ink-deep/45 mt-1">{t('journeyDetail.confirmation', { code: item.confirmation_number })}</p>
            )}
          </div>
        </div>
      </div>

      {item.type === 'flight' && item.confirmation_number && (
        <FlightStatusCard
          flightNumber={item.confirmation_number}
          date={item.start_datetime ? item.start_datetime.slice(0, 10) : ''}
          originTimezone={item.from_place?.tz}
          destinationTimezone={item.to_place?.tz}
        />
      )}

      {/* Dates / times — Start / End side by side; collapses to one column if no end */}
      {(start || end) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('journeyDetail.when')}</p>
          <div className={`grid gap-3 ${start && end ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {start && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-deep/40 mb-1">{t('journeyDetail.start')}</p>
                <p className="text-sm font-semibold text-ink-deep">{formatFullDateTz(start, startTz)}</p>
                <p className="text-xs text-ink-deep/55 flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeWithCountry(start, startTz, startCc)}</p>
              </div>
            )}
            {end && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-deep/40 mb-1">{t('journeyDetail.end')}</p>
                <p className="text-sm font-semibold text-ink-deep">{formatFullDateTz(end, endTz)}</p>
                <p className="text-xs text-ink-deep/55 flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeWithCountry(end, endTz, endCc)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Locations */}
      {(item.location_from || item.location_to || item.location_name) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('journeyDetail.where')}</p>
          <div className="space-y-2 text-sm text-ink-deep">
            {item.location_from && item.location_to && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_from} → {item.location_to}</span></p>
            )}
            {item.location_from && !item.location_to && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_from}</span></p>
            )}
            {item.location_to && !item.location_from && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_to}</span></p>
            )}
            {item.location_name && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_name}</span></p>
            )}
          </div>

          <div className="mt-4">
            <SegmentMap key={item.id} origin={origin} destination={destination} point={point} query={q} isFlight={item.type === 'flight'} />
          </div>

          {(item.type === 'car' || item.type === 'train') && item.location_from && item.location_to && (
            <RouteDetailsCard origin={item.location_from} destination={item.location_to} />
          )}
          {(item.type === 'hotel' || item.type === 'activity') && item.location_name && (
            <VenueInfoBlock query={item.location_name} />
          )}
        </div>
      )}

      {/* People — participants only (owner display removed; owner field still drives permissions) */}
      <div className="tt-card p-4">
        <div className="flex items-center justify-between mb-2.5">
          <p className="tt-label text-ink-deep/40">{t('journeyDetail.people')}</p>
          {attendees.length > 0 && <span className="text-xs text-ink-deep/45">{t('journeyDetail.onSegment', { count: attendees.length })}</span>}
        </div>
        {attendees.length > 0 ? (
          <AvatarStack people={attendees} max={8} size="sm" />
        ) : (
          <p className="text-sm text-ink-deep/50">{t('journeyDetail.noOneJoined')}</p>
        )}
        <div className="mt-3 pt-3 border-t border-ink-charcoal/10">
          <JoinSegmentButton item={item} currentMember={currentMember} onJoined={() => load(true)} />
        </div>
      </div>

      {/* Notes */}
      {item.notes && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2">{t('journeyDetail.notes')}</p>
          <p className="text-sm text-ink-deep/80 whitespace-pre-wrap leading-relaxed">{item.notes}</p>
        </div>
      )}

      <SegmentInfoSections item={item} currentMember={currentMember} members={members} />

      {/* Attachments */}
      {(images.length > 0 || docs.length > 0) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('journeyDetail.attachments')}</p>
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {images.map((url, i) => (
                <a key={url + i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
                  <Image src={url} alt={t('journeyDetail.attachmentAlt', { n: i + 1 })} className="w-full h-full object-cover" fittingType="fill" />
                </a>
              ))}
            </div>
          )}
          {docs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {docs.map((url, i) => <AttachmentChip key={url + i} url={url} />)}
            </div>
          )}
        </div>
      )}

      {editing && (
        <JourneyItemForm
          gatheringId={gatheringId}
          currentMember={currentMember}
          members={members}
          item={item}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}
      </div>
      )}

      <MoveSegmentSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        item={item}
        currentGatheringId={gatheringId}
        currentMember={currentMember}
        onMoved={(targetId) => navigate(`/gathering/${targetId}/journey`)}
      />
    </div>
  );
}