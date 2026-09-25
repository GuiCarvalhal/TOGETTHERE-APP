import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { PRIVACY_MODES } from '@/lib/gatheringHelpers';
import { gatheringDestinations } from '@/lib/gatheringDates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image } from '@/components/ui/image';
import { Loader2, Save, Link2, Copy, Check, UserCheck, UserX, Lock, Globe, ShieldCheck, Eye, Search } from 'lucide-react';
import DestinationPicker from '@/components/tt/DestinationPicker';

const SAMPLE_COVERS = [
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=80',
  'https://images.unsplash.com/photo-1502602898657-3e9fa60e1900?w=1200&q=80',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80',
];

const PRIVACY_ICON = { open: Globe, invite: Lock, approval: ShieldCheck };

export default function GatheringSettings() {
  const { gatheringId, gathering, role, joinRequests, setFab, refresh } = useGathering();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState('');
  const [busyReq, setBusyReq] = useState(null);
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoResults, setPhotoResults] = useState([]);
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    if (gathering) {
      // Prefer structured destination_places; fall back to legacy free-text
      // strings as { name } entries so the owner still sees & can manage them.
      const places = Array.isArray(gathering.destination_places) && gathering.destination_places.length
        ? gathering.destination_places
        : (gathering.destinations || []).map((s) => ({ name: s }));
      setForm({
        name: gathering.name || '',
        cover_image: gathering.cover_image || '',
        destination_places: places,
        description: gathering.description || '',
        privacy_mode: gathering.privacy_mode || 'invite',
      });
    }
  }, [gathering?.id]);

  useEffect(() => {
    setFab(null);
    return () => setFab(null);
  }, [setFab]);

  if (role !== 'owner') {
    return (
      <div className="tt-card p-10 text-center max-w-md mx-auto">
        <Lock className="w-10 h-10 text-terra mx-auto mb-4" />
        <p className="font-display text-2xl mb-2 text-ink-deep">Owner only</p>
        <p className="text-ink-deep/60 text-sm">Gathering settings are managed by the trip owner.</p>
      </div>
    );
  }
  if (!gathering || !form) {
    return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-terra" /></div>;
  }

  const inviteUrl = `${window.location.origin}/join/${gatheringId}`;
  const viewerInviteUrl = `${inviteUrl}?as=viewer`;

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* ignore */ }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await base44.functions.invoke('updateGathering', {
        gathering_id: gatheringId,
        fields: {
          name: form.name.trim(),
          cover_image: form.cover_image,
          destination_places: form.destination_places,
          description: form.description,
          privacy_mode: form.privacy_mode,
        },
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  async function resolveRequest(reqId, approve) {
    setBusyReq(reqId);
    try {
      await base44.functions.invoke(approve ? 'approveJoinRequest' : 'declineJoinRequest', {
        gathering_id: gatheringId, request_id: reqId,
      });
      await refresh();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Could not resolve request');
    } finally {
      setBusyReq(null);
    }
  }

  async function searchPhotos() {
    const q = photoQuery.trim() || gatheringDestinations(gathering)[0]?.name || gathering?.name || '';
    if (!q) return;
    setPhotoLoading(true);
    try {
      const res = await base44.functions.invoke('searchCoverPhotos', { query: q });
      const data = res.data || res;
      setPhotoResults(data.photos || []);
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Photo search failed');
    } finally {
      setPhotoLoading(false);
    }
  }

  const PrivacyIcon = PRIVACY_ICON[form.privacy_mode] || Lock;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="font-display text-3xl font-bold">Settings</h2>
        <p className="text-muted-foreground text-sm mt-1">Tune the details, who can join, and how people get in.</p>
      </div>

      {/* Join & sharing */}
      <section className="tt-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <PrivacyIcon className="w-5 h-5 text-terra-deep" />
          <h3 className="font-display text-xl font-bold text-ink-deep">Who can join</h3>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {PRIVACY_MODES.map((m) => {
            const Icon = PRIVACY_ICON[m.key];
            const active = form.privacy_mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setForm({ ...form, privacy_mode: m.key })}
                className={`text-left p-4 rounded-xl border-2 transition-colors ${active ? 'border-terra bg-terra/5' : 'border-ink-charcoal/15 hover:border-ink-charcoal/30'}`}
              >
                <Icon className={`w-5 h-5 mb-2 ${active ? 'text-terra-deep' : 'text-ink-deep/50'}`} />
                <p className="font-semibold text-ink-deep text-sm">{m.label}</p>
                <p className="text-xs text-ink-deep/55 mt-1 leading-relaxed">{m.blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 pt-5 border-t border-ink-charcoal/10 space-y-3">
          <div>
            <Label className="text-ink-deep flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Invite link</Label>
            <div className="flex gap-2 mt-1.5">
              <Input readOnly value={inviteUrl} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep text-sm min-w-0 truncate" />
              <Button type="button" size="sm" onClick={() => copy(inviteUrl, 'member')} className="shrink-0" aria-label="Copy invite link">
                {copied === 'member' ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-xs text-ink-deep/50 mt-1.5">Share this to invite people as members. {form.privacy_mode === 'open' ? 'They join instantly.' : form.privacy_mode === 'approval' ? 'They submit a request you approve.' : 'Use the direct add below.'}</p>
          </div>
          <div>
            <Label className="text-ink-deep flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Viewer invite link</Label>
            <div className="flex gap-2 mt-1.5">
              <Input readOnly value={viewerInviteUrl} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep text-sm min-w-0 truncate" />
              <Button type="button" variant="outline" size="sm" onClick={() => copy(viewerInviteUrl, 'viewer')} className="shrink-0" aria-label="Copy viewer invite link">
                {copied === 'viewer' ? <Check /> : <Copy />}
              </Button>
            </div>
            <p className="text-xs text-ink-deep/50 mt-1.5">Viewers get a read-only look at the journey and members — no expenses or agent.</p>
          </div>
        </div>
      </section>

      {/* Pending requests */}
      {form.privacy_mode === 'approval' && (
        <section className="tt-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-5 h-5 text-terra-deep" />
            <h3 className="font-display text-xl font-bold text-ink-deep">Join requests</h3>
            {joinRequests.length > 0 && <span className="ml-1 tt-stamp bg-terra text-cream border-terra">{joinRequests.length}</span>}
          </div>
          {joinRequests.length === 0 ? (
            <p className="text-sm text-ink-deep/50">No pending requests. When someone asks to join, they'll appear here for you to approve or decline.</p>
          ) : (
            <div className="space-y-2.5">
              {joinRequests.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-cream-pale border border-ink-charcoal/10">
                  <div className="w-9 h-9 rounded-full bg-terra/15 text-terra-deep font-bold flex items-center justify-center text-sm">
                    {(r.full_name || '?')[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-deep text-sm truncate">{r.full_name}</p>
                    <p className="text-xs text-ink-deep/50 truncate">{r.email || ''}</p>
                  </div>
                  <span className="tt-stamp bg-secondary text-card-foreground/60 border-ink-charcoal/15 capitalize hidden sm:inline-flex">{r.requested_role}</span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="default" size="sm" onClick={() => resolveRequest(r.id, true)} disabled={busyReq === r.id}>
                      {busyReq === r.id ? <Loader2 className="animate-spin" /> : <UserCheck />} Approve
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => resolveRequest(r.id, false)} disabled={busyReq === r.id}>
                      <UserX /> Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Details form */}
      <form onSubmit={handleSave} className="tt-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Save className="w-5 h-5 text-terra-deep" />
          <h3 className="font-display text-xl font-bold text-ink-deep">Trip details</h3>
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">Destinations</Label>
          <DestinationPicker
            places={form.destination_places}
            onChange={(places) => setForm({ ...form, destination_places: places })}
            placeholder="Search a destination on Google Maps"
          />
          <p className="text-xs text-ink-deep/50">Pick real places so we can link them to Google Maps. Trip dates are derived from your itinerary segments.</p>
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">Description</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">Cover image</Label>
          <div className="flex gap-2 flex-wrap">
            {SAMPLE_COVERS.map((url) => (
              <button type="button" key={url} onClick={() => setForm({ ...form, cover_image: url })}
                className={`w-24 h-16 rounded-lg overflow-hidden border-2 ${form.cover_image === url ? 'border-terra' : 'border-transparent'}`}>
                <Image src={url} alt="cover" className="w-full h-full object-cover" fittingType="fill" />
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input value={photoQuery} onChange={(e) => setPhotoQuery(e.target.value)} placeholder={`Search Pexels (e.g. ${gatheringDestinations(gathering)[0]?.name || 'Amalfi'})`} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPhotos(); } }} />
            <Button type="button" variant="outline" size="sm" onClick={searchPhotos} className="shrink-0" aria-label="Search photos">
              {photoLoading ? <Loader2 className="animate-spin" /> : <Search />}
            </Button>
          </div>
          {photoResults.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {photoResults.map((p) => (
                <button type="button" key={p.id} onClick={() => setForm({ ...form, cover_image: p.url })}
                  className={`h-16 rounded-lg overflow-hidden border-2 ${form.cover_image === p.url ? 'border-terra' : 'border-transparent'}`}>
                  <img src={p.thumb} alt={p.alt} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <Input value={form.cover_image} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} placeholder="Or paste an image URL" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep mt-2" />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            Save changes
          </Button>
          {saved && <span className="inline-flex items-center gap-1 text-sm text-terra-deep font-semibold"><Check className="w-4 h-4" /> Saved</span>}
        </div>
      </form>
    </div>
  );
}