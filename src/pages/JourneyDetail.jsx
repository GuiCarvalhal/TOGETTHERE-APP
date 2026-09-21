import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useGathering } from '@/lib/gatheringContext';
import { JOURNEY_TYPES, canEditJourneyItem, formatDate } from '@/lib/gatheringHelpers';
import { Image } from '@/components/ui/image';
import AttachmentChip from '@/components/tt/AttachmentChip';
import MemberAvatar from '@/components/tt/MemberAvatar';
import Skeleton from '@/components/tt/Skeleton';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import { Plane, Car, Train, Hotel, Compass, Ship, MapPin, ArrowLeft, Clock, CalendarDays, Pencil, Trash2, Navigation } from 'lucide-react';

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

const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

function mapsQuery(item) {
  return item.location_name || item.location_to || item.location_from || '';
}

export default function JourneyDetail() {
  const { itemId } = useParams();
  const { gatheringId, members, currentMember, role, setFab } = useGathering();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const data = await base44.entities.JourneyItem.get(itemId);
      setItem(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [itemId]);

  useEffect(() => { setFab(null); return () => setFab(null); }, [setFab]);

  async function handleDelete() {
    if (!confirm('Delete this segment?')) return;
    await base44.entities.JourneyItem.delete(itemId);
    navigate(`/gathering/${gatheringId}/journey`);
  }

  const memberById = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const owner = item ? (memberById[item.owner_id] || memberById[item.owner_user_id]) : null;
  const assigned = item?.member_user_ids?.length
    ? item.member_user_ids.map((uid) => memberById[uid]).filter(Boolean)
    : [];
  const canEdit = item && canEditJourneyItem(role, item, currentMember);

  const back = () => navigate(`/gathering/${gatheringId}/journey`);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="tt-card p-5 space-y-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-7 w-2/3" tone="cream" />
          <Skeleton className="h-4 w-1/2" tone="cream" />
        </div>
        <div className="tt-card p-5 space-y-3">
          <Skeleton className="h-4 w-1/3" tone="cream" />
          <Skeleton className="h-32 w-full rounded-xl" tone="cream" />
        </div>
      </div>
    );
  }
  if (error || !item) {
    return (
      <div className="tt-card p-10 text-center max-w-md mx-auto">
        <Compass className="w-10 h-10 text-terra mx-auto mb-4" />
        <p className="font-display text-2xl mb-2 text-ink-deep">Segment not found</p>
        <p className="text-ink-deep/60 mb-6 text-sm">This segment may have been removed or you don't have access.</p>
        <button onClick={back} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back to journey
        </button>
      </div>
    );
  }

  const Icon = ICONS[item.type] || MapPin;
  const typeLabel = TYPE_LABEL[item.type] || 'Segment';
  const typeStyle = TYPE_STYLE[item.type] || TYPE_STYLE.other;
  const q = mapsQuery(item);
  const embedSrc = q ? `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed` : '';
  const openMapsUrl = q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
  const images = (item.attachments || []).filter(isImg);
  const docs = (item.attachments || []).filter((u) => !isImg(u));

  const start = item.start_datetime;
  const end = item.end_datetime;

  return (
    <div className="space-y-5">
      {/* Back affordance */}
      <button
        onClick={back}
        className="inline-flex items-center gap-2 -ml-1 px-3 py-2 rounded-full text-ink-deep/70 hover:text-terra-deep hover:bg-foreground/5 transition-colors"
        aria-label="Back to journey"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-semibold">Journey</span>
      </button>

      {/* Hero */}
      <div className="tt-card p-5">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${typeStyle}`}>
            <Icon className="w-7 h-7" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <span className="tt-label text-terra-deep">{typeLabel}</span>
            <h1 className="font-display text-2xl font-bold text-ink-deep leading-tight tt-text-balance">{item.title}</h1>
            {item.confirmation_number && (
              <p className="text-xs text-ink-deep/45 mt-1">Confirmation #{item.confirmation_number}</p>
            )}
          </div>
        </div>
      </div>

      {/* Dates / times */}
      {(start || end) && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-3">When</p>
          <div className="space-y-2.5">
            {start && (
              <div className="flex items-start gap-3">
                <CalendarDays className="w-4 h-4 text-terra-coral mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink-deep">{formatDate(start, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  <p className="text-xs text-ink-deep/55 flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(start, { hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              </div>
            )}
            {end && (
              <div className="flex items-start gap-3">
                <CalendarDays className="w-4 h-4 text-ink-deep/35 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink-deep">{formatDate(end, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  <p className="text-xs text-ink-deep/55 flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(end, { hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Locations */}
      {(item.location_from || item.location_to || item.location_name) && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-3">Where</p>
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

          {q && (
            <div className="mt-4">
              <iframe
                title={`Map of ${q}`}
                src={embedSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-48 rounded-xl border border-ink-charcoal/15 bg-cream-pale"
              />
              <a
                href={openMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep transition-colors min-h-[44px]"
              >
                <Navigation className="w-4 h-4" /> Open in Google Maps
              </a>
            </div>
          )}
        </div>
      )}

      {/* People */}
      {(owner || assigned.length > 0) && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-3">People</p>
          {owner && (
            <div className="flex items-center gap-2.5">
              <MemberAvatar member={owner} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-deep truncate">{owner.full_name || 'Owner'}</p>
                <p className="text-xs text-ink-deep/50 capitalize">{owner.role}</p>
              </div>
            </div>
          )}
          {assigned.length > 0 && (
            <div className="mt-3 pt-3 border-t border-ink-charcoal/10">
              <p className="text-xs text-ink-deep/45 mb-2">Also on this segment</p>
              <div className="flex flex-wrap gap-2">
                {assigned.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-cream-pale border border-ink-charcoal/10">
                    <MemberAvatar member={m} size="xs" />
                    <span className="text-xs text-ink-deep truncate max-w-[120px]">{m.full_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-2">Notes</p>
          <p className="text-sm text-ink-deep/80 whitespace-pre-wrap leading-relaxed">{item.notes}</p>
        </div>
      )}

      {/* Attachments */}
      {(images.length > 0 || docs.length > 0) && (
        <div className="tt-card p-5">
          <p className="tt-label text-ink-deep/40 mb-3">Attachments</p>
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {images.map((url, i) => (
                <a key={url + i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
                  <Image src={url} alt={`Attachment ${i + 1}`} className="w-full h-full object-cover" fittingType="fill" />
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

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setEditing(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-ink-deep text-cream font-semibold hover:opacity-90 transition-opacity min-h-[44px]"
          >
            <Pencil className="w-4 h-4" /> Edit
          </button>
          <button
            onClick={handleDelete}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full border border-destructive/30 text-destructive font-semibold hover:bg-destructive/10 transition-colors min-h-[44px]"
            aria-label="Delete segment"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {editing && (
        <JourneyItemForm
          gatheringId={gatheringId}
          currentMember={currentMember}
          item={item}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}