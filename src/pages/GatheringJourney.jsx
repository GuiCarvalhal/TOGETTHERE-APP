import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { JOURNEY_TYPES, canEditJourneyItem, canAddJourney, formatDate } from '@/lib/gatheringHelpers';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { Plane, Car, Hotel, Compass, Ship, MapPin, Plus, Pencil, Trash2, Clock, Paperclip, Calendar } from 'lucide-react';
import { Loader2 } from 'lucide-react';

const ICONS = { flight: Plane, car: Car, hotel: Hotel, activity: Compass, cruise: Ship, other: MapPin };
const TYPE_LABEL = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.label]));

function dayKey(d) { return d ? new Date(d).toISOString().slice(0, 10) : 'unscheduled'; }

export default function GatheringJourney() {
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await base44.entities.JourneyItem.filter({ gathering_id: gatheringId });
      data.sort((a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0));
      setItems(data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [gatheringId]);

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

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-terra" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold">Journey</h2>
          <p className="text-cream/60 text-sm mt-1">A shared chronological timeline of everyone's flights, stays and activities.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="tt-card p-10 text-center">
          <Compass className="w-10 h-10 text-terra mx-auto mb-4" />
          <p className="font-display text-2xl mb-2 text-ink-deep">No segments yet</p>
          <p className="text-ink-deep/60 mb-6 text-sm">Add flights, hotel stays, activities and more to build the group's timeline.</p>
          {canAddJourney(role) && (
            <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">
              <Plus className="w-4 h-4" /> Add the first segment
            </button>
          )}
        </div>
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
                        <div className="w-10 h-10 rounded-xl bg-cream-pale border border-ink-charcoal/15 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-terra-deep" />
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
                                <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cream-pale border border-ink-charcoal/15 text-xs text-ink-deep hover:bg-cream-warm">
                                  <Paperclip className="w-3 h-3" /> File {i + 1}
                                </a>
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
                                <button onClick={() => { setEditing(item); setOpen(true); }} className="p-1.5 rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Pencil className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg text-ink-deep/50 hover:bg-cream-pale hover:text-terra-deep"><Trash2 className="w-3.5 h-3.5" /></button>
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