import React, { useEffect, useState } from 'react';
import { useGathering } from '@/lib/gatheringContext';
import { base44 } from '@/api/base44Client';
import { gatheringDestinations } from '@/lib/gatheringDates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image } from '@/components/ui/image';
import { Loader2, Save, Search, Trash2, AlertTriangle, Check } from 'lucide-react';
import DestinationPicker from '@/components/tt/DestinationPicker';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useI18n } from '@/lib/i18n';

const SAMPLE_COVERS = [
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=80',
  'https://images.unsplash.com/photo-1502602898657-3e9fa60e1900?w=1200&q=80',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80',
];

export default function GatheringSettings() {
  const { t } = useI18n();
  const { gatheringId, gathering, role, refresh, setFab } = useGathering();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoResults, setPhotoResults] = useState([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        <AlertTriangle className="w-10 h-10 text-terra mx-auto mb-4" />
        <p className="font-display text-2xl mb-2 text-ink-deep">{t('settings.ownerOnly')}</p>
        <p className="text-ink-deep/60 text-sm">{t('settings.ownerOnlyBody')}</p>
      </div>
    );
  }
  if (!gathering || !form) {
    return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-terra" /></div>;
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
        },
      });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      alert(err.response?.data?.error || err.message || t('settings.couldNotSave'));
    } finally {
      setSaving(false);
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
      alert(err.response?.data?.error || err.message || t('settings.photoSearchFailed'));
    } finally {
      setPhotoLoading(false);
    }
  }

  async function handleDeleteGathering() {
    setDeleting(true);
    try {
      await base44.functions.invoke('deleteGathering', { gathering_id: gatheringId });
      navigate('/');
    } catch (err) {
      setDeleting(false);
      alert(err.response?.data?.error || err.message || t('settings.couldNotDelete'));
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="font-display text-3xl font-bold">{t('settings.settings')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('settings.settingsDesc')}</p>
      </div>

      {/* Details form */}
      <form onSubmit={handleSave} className="tt-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Save className="w-5 h-5 text-terra-deep" />
          <h3 className="font-display text-xl font-bold text-ink-deep">{t('settings.tripDetails')}</h3>
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">{t('settings.name')}</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">{t('settings.destinations')}</Label>
          <DestinationPicker
            places={form.destination_places}
            onChange={(places) => setForm({ ...form, destination_places: places })}
            placeholder={t('settings.destPlaceholder')}
          />
          <p className="text-xs text-ink-deep/50">{t('settings.destHint')}</p>
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">{t('settings.description')}</Label>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">{t('settings.coverImage')}</Label>
          <div className="flex gap-2 flex-wrap">
            {SAMPLE_COVERS.map((url) => (
              <button type="button" key={url} onClick={() => setForm({ ...form, cover_image: url })}
                className={`w-24 h-16 rounded-lg overflow-hidden border-2 ${form.cover_image === url ? 'border-terra' : 'border-transparent'}`}>
                <Image src={url} alt="cover" className="w-full h-full object-cover" fittingType="fill" />
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input value={photoQuery} onChange={(e) => setPhotoQuery(e.target.value)} placeholder={t('settings.searchPexels', { example: gatheringDestinations(gathering)[0]?.name || 'Amalfi' })} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPhotos(); } }} />
            <Button type="button" variant="outline" size="sm" onClick={searchPhotos} className="shrink-0" aria-label={t('settings.searchPhotos')}>
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
          <Input value={form.cover_image} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} placeholder={t('settings.pasteUrl')} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep mt-2" />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {t('settings.saveChanges')}
          </Button>
          {saved && <span className="inline-flex items-center gap-1 text-sm text-terra-deep font-semibold"><Check className="w-4 h-4" /> {t('settings.saved')}</span>}
        </div>
      </form>

      {/* Danger zone — owner only (the whole page is owner-gated). Cascading
          delete of the gathering and all its records, behind an explicit
          confirmation dialog that names the gathering being deleted. */}
      <section className="tt-card p-6 border-destructive/30">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h3 className="font-display text-xl font-bold text-ink-deep">{t('settings.dangerZone')}</h3>
        </div>
        <p className="text-sm text-ink-deep/60 mb-4">{t('settings.dangerDesc')}</p>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="rounded-full">
          <Trash2 /> {t('settings.deleteGathering')}
        </Button>
      </section>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteConfirm', { name: gathering.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.deleteConfirmDesc', { name: gathering.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGathering}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t('settings.deleteGathering')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}