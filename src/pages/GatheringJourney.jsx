import React, { useEffect, useState } from 'react';
import usePolling from '@/hooks/usePolling';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { JOURNEY_TYPES, canEditJourneyItem, canAddJourney, formatDate } from '@/lib/gatheringHelpers';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Plane, Car, Train, Hotel, Compass, Ship, MapPin, Plus, Pencil, Trash2, Clock, Calendar } from 'lucide-react';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { Loader2 } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';

const ICONS = { flight: Plane, car: Car, train: Train, hotel: Hotel, activity: Compass, cruise: Ship, other: MapPin };
const TYPE_LABEL = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.label]));
const TYPE_STYLE = {
  flight: 'bg-sky-100 text-sky-700',
  car: 'bg-terra/15 text-terra-deep',
  train: 'bg-violet-100 text-violet-700',
  hotel: 'bg-amber-100 text-amber-700',
  activity: 'bg-emerald-100 text-emerald-700',
  cruise: 'bg-teal-100 text-teal-700',
  other: 'bg-cream-pale text-ink-deep/50',
};

function dayKey(d) { return d ? new Date(d).toISOString().slice(0, 10) : 'unscheduled'; }

export default function GatheringJourney() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
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

  useEffect(() => {
    if (canAddJourney(role)) {
      setFab({ label: 'Add Segment', icon: Plus, onClick: () => { setEditing(null); setOpen(true); } });
    }
    return () => setFab(null);
  }, [setFab, role]);

  async function handleDelete(item) {
    if (!confirm('Delete this segment?')) return;
    await base44.entities.JourneyItem.delete(item.id);
    load();
  }

  const memberById = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const byDay = {};
  items.forEach((it) => {
    const k = dayKey(it.start_datetime);
    (byDay[k] = byDay[k] || []).push(it);
  });
  const days = Object.keys(byDay).sort();

  if (loading) return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="space-y-2"><Skeleton className="h-3 w-14" /><Skeleton className="h-5 w-36" /></div>
          </div>
          <div className="pl-5 border-l border-white/10 ml-5 space-y-3">
            {[0, 1].map((j) => (
              <div key={j} className="tt-card p-5 space-y-3">
                <Skeleton className="h-4 w-1/4" tone="cream" />
                <Skeleton className="h-3 w-2/3" tone="cream" />
                <Skeleton className="h-3 w-1/2" tone="cream" />
              </div>
            ))}
          </div>
        </div>
      ))}
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
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold">Journey</h2>
          <p className="text-cream/60 text-sm mt-1">A shared chronological timeline of everyone's flights, stays and activities.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No segments yet"
          body="Add flights, hotel stays, activities and more to build the group's shared timeline — everyone stays in sync as the plan comes together."
          action={canAddJourney(role) ? (
            <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep">
              <Plus className="w-4 h-4" /> Add the first segment
            </button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <div key={day}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-terra/15 border border-terra/30 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-terra-coral" />
                </div>
                <div>
                  <p className="tt-label text-terra-coral">{day === 'unscheduled' ? 'Unscheduled' : 'Day'}</p>
                  <p className="font-display text-lg text-cream">{day !== 'unscheduled' ? formatDate(day, { weekday: 'long', month: 'long', day: 'numeric' }) : 'No time set'}</p>
                </div>
                <div className="flex-1 h-px bg-white/10 ml-2" />
              </div>
              <div className="pl-5 border-l border-white/10 ml-5 space-y-3">
                {byDay[day].map((item) => {
                  const Icon = ICONS[item.type] || MapPin;
                  const owner = memberById[item.owner_id];
                  const canEdit = canEditJourneyItem(role, item, currentMember);
                  return (
                    <div key={item.id} className="tt-card p-4 sm:p-5 relative">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TYPE_STYLE[item.type] || TYPE_STYLE.other}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="tt-label text-terra-deep">{TYPE_LABEL[item.type]}</span>
                            {item.confirmation_number && <span className="text-xs text-ink-deep/50">#{item.confirmation_number}</span>}
                          </div>
                          <h3 className="font-display text-lg font-bold text-ink-deep leading-tight">{item.title}</h3>
                          {item.start_datetime && (
                            <p className="text-sm text-ink-deep/60 flex items-center gap-1.5 mt-1"><Clock className="w-3.5 h-3.5" />{formatDate(item.start_datetime, { hour: 'numeric', minute: '2-digit' })}{item.end_datetime ? ` → ${formatDate(item.end_datetime, { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
                          )}
                          {(item.location_from || item.location_to) && (
                            <p className="text-sm text-ink-deep/70 mt-1">{item.location_from} → {item.location_to}</p>
                          )}
                          {item.location_name && <p className="text-sm text-ink-deep/70 mt-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{item.location_name}</p>}
                          {item.notes && <p className="text-sm text-ink-deep/60 mt-2">{item.notes}</p>}
                          {item.attachments?.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {item.attachments.map((url, i) => (
                                <AttachmentChip key={url + i} url={url} />
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-3">
                            {owner && (
                              <div className="flex items-center gap-1.5">
                                <MemberAvatar member={owner} size="xs" />
                                <span className="text-xs text-ink-deep/50">{owner.full_name}</span>
                              </div>
                            )}
                            {canEdit && (
                              <div className="ml-auto flex items-center gap-1">
                                <button onClick={() => { setEditing(item); setOpen(true); }} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Pencil className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(item)} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <JourneyItemForm
          gatheringId={gatheringId}
          currentMember={currentMember}
          item={editing}
          onClose={() => setOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}