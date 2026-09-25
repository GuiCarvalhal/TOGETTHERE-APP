import React, { useEffect, useState } from 'react';
import usePolling from '@/hooks/usePolling';
import { useViewPrefs } from '@/hooks/useViewPrefs';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { JOURNEY_TYPES, canAddJourney } from '@/lib/gatheringHelpers';
import { tzDateKey, formatDayHeader } from '@/lib/formatPlaceTime';
import { useItemStartTzMap } from '@/lib/useItemPlace';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import PageToolbar from '@/components/tt/PageToolbar';
import { Plane, Car, Train, Hotel, Compass, Ship, MapPin, Plus, Calendar } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';

const ICONS = { flight: Plane, car: Car, train: Train, hotel: Hotel, activity: Compass, cruise: Ship, other: MapPin };
const TYPE_LABEL = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.label]));
const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.color]));

function dayKey(d, tz) { return d ? tzDateKey(d, tz) : 'unscheduled'; }

// Per-item participants: the opt-in attendee_user_ids, or — when no one has
// opted in (e.g. legacy items with empty attendee lists) — just the creator.
// Never falls back to member_user_ids (the ACL list of all gathering members).
function itemParticipants(item, memberById) {
  const ids = (item.attendee_user_ids || []).length
    ? item.attendee_user_ids
    : (item.owner_id ? [item.owner_id] : []);
  return ids.map((uid) => memberById[uid]).filter(Boolean);
}

export default function GatheringJourney() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const { scope, setScope, images, setImages } = useViewPrefs(gatheringId);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load(silent) {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const data = await base44.entities.JourneyItem.filter({ gathering_id: gatheringId });
      data.sort((a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0));
      setItems(data);
    } catch (e) {
      if (!silent) setError(e);
    } finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { load(); }, [gatheringId]);
  usePolling(() => load(true), 25000);

  // No floating Add button on the timeline — it's a terminal rail node below.
  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  const memberById = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const uid = currentMember?.user_id;
  // MINE = items the signed-in user owns/created (owner_id is the item creator)
  // OR is an explicit attendee of (attendee_user_ids is the opt-in list,
  // distinct from the ACL member_user_ids which every visible item shares).
  // owner_user_id is the gathering owner (set on every item), NOT the item
  // creator, so it is intentionally not used here. GROUP = the complete combined
  // journey for all participating members (everything the user can read).
  const visibleItems = scope === 'mine'
    ? items.filter((it) => it.owner_id === uid || (it.attendee_user_ids || []).includes(uid))
    : items;
  const tzMap = useItemStartTzMap(visibleItems);
  // Expand stays (hotel) into a check-in entry at the start and a check-out
  // entry at the end — one underlying record, two timeline positions, each on
  // its correct day in chronological order. Other types stay single.
  const entries = [];
  visibleItems.forEach((it) => {
    if (it.type === 'hotel' && it.start_datetime && it.end_datetime && it.start_datetime !== it.end_datetime) {
      entries.push({ key: `${it.id}-in`, leg: 'check-in', at: it.start_datetime, item: it });
      entries.push({ key: `${it.id}-out`, leg: 'check-out', at: it.end_datetime, item: it });
    } else {
      entries.push({ key: it.id, leg: null, at: it.start_datetime, item: it });
    }
  });
  entries.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  const byDay = {};
  entries.forEach((e) => {
    const k = dayKey(e.at, tzMap[e.item.id]);
    (byDay[k] = byDay[k] || []).push(e);
  });
  const days = Object.keys(byDay).sort();
  const canAdd = canAddJourney(role);

  if (loading) return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-foreground/12" aria-hidden />
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 flex justify-center shrink-0">
                  <Skeleton className="w-10 h-10 rounded-full" />
                </div>
                <div className="space-y-2"><Skeleton className="h-3 w-14" /><Skeleton className="h-5 w-36" /></div>
              </div>
              <div className="space-y-3">
                {[0, 1].map((j) => (
                  <div key={j} className="flex gap-2">
                    <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
                      <Skeleton className="w-10 h-10 rounded-xl" />
                      <Skeleton className="h-3 w-10 mt-1.5" />
                    </div>
                    <div className="flex-1 tt-card p-3 space-y-2">
                      <Skeleton className="h-3 w-1/4" tone="cream" />
                      <Skeleton className="h-4 w-2/3" tone="cream" />
                      <Skeleton className="h-3 w-1/2" tone="cream" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (error) return (
    <div className="tt-card p-10 text-center max-w-md mx-auto">
      <Compass className="w-10 h-10 text-terra mx-auto mb-4" />
      <p className="font-display text-2xl mb-2 text-ink-deep">Couldn't load the journey</p>
      <p className="text-ink-deep/60 mb-6 text-sm">{error.message || 'Something went wrong.'}</p>
      <button onClick={load} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">Try again</button>
    </div>
  );

  return (
    <PageToolbar scope={scope} setScope={setScope} images={images} setImages={setImages} onAdd={() => { setEditing(null); setOpen(true); }} canAdd={canAdd}>
      {visibleItems.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={scope === 'mine' ? 'No segments from you yet' : 'No segments yet'}
          body={scope === 'mine' ? 'Add your own flights, stays and activities to see them here.' : "Add flights, hotel stays, activities and more to build the group's shared timeline — everyone stays in sync as the plan comes together."}
          action={canAdd ? (
            <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep">
              <Plus className="w-4 h-4" /> Add the first segment
            </button>
          ) : undefined}
        />
      ) : (
        <div className="relative">
          {/* Continuous left timeline rail */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-foreground/12" aria-hidden />
          <div className="space-y-8">
            {days.map((day) => (
              <div key={day} className="space-y-3">
                {/* Day marker on the rail */}
                <div className="flex items-center gap-3">
                  <div className="w-12 flex justify-center shrink-0">
                    <div className="w-10 h-10 rounded-full bg-background border-2 border-terra-coral flex items-center justify-center relative z-10">
                      <Calendar className="w-4 h-4 text-terra-coral" />
                    </div>
                  </div>
                  <div>
                    <p className="tt-label text-terra-coral">{day === 'unscheduled' ? 'Unscheduled' : 'Day'}</p>
                    <p className="font-display text-lg text-foreground">{formatDayHeader(day)}</p>
                  </div>
                </div>
                {/* Segment rows */}
                <div className="space-y-3">
                  {byDay[day].map((entry) => (
                    <JourneyCard
                      key={entry.key}
                      item={entry.item}
                      leg={entry.leg}
                      typeColor={TYPE_COLOR[entry.item.type] || TYPE_COLOR.other}
                      icon={ICONS[entry.item.type] || MapPin}
                      participants={itemParticipants(entry.item, memberById)}
                      showImages={images}
                      to={`/gathering/${gatheringId}/journey/${entry.item.id}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (
        <JourneyItemForm
          gatheringId={gatheringId}
          currentMember={currentMember}
          members={members}
          item={editing}
          onClose={() => setOpen(false)}
          onSaved={load}
        />
      )}
    </PageToolbar>
  );
}