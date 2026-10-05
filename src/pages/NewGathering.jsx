import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Image } from '@/components/ui/image';
import DetailActionBar from '@/components/tt/DetailActionBar';
import AppHeader from '@/components/tt/AppHeader';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Check, Search, MessageCircle, Music, X } from 'lucide-react';

const SAMPLE_COVERS = [
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=80',
  'https://images.unsplash.com/photo-1502602898657-3e9fa60e1900?w=1200&q=80',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80',
];

function isValidUrl(s) {
  if (!s) return true; // optional
  try { new URL(s); return true; } catch { return false; }
}

export default function NewGathering() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '',
    cover_image: SAMPLE_COVERS[0],
    whatsapp_url: '',
    music_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [photos, setPhotos] = useState([]);
  const debounceRef = useRef(null);

  // Cover search: debounced on the gathering name, reusing the existing
  // searchCoverPhotos backend (Pexels). Falls back to the name itself when
  // the search returns nothing. Only fires when the name is non-empty.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = form.name.trim();
    if (!q) { setPhotos([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await base44.functions.invoke('searchCoverPhotos', { query: q });
        const data = res.data || res;
        setPhotos((data.photos || []).slice(0, 6));
      } catch { /* ignore — sample covers remain */ }
      finally { setSearching(false); }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.name]);

  async function handleSave(e) {
    e?.preventDefault();
    if (!form.name.trim()) {
      toast({ title: t('newGathering.nameRequired'), variant: 'destructive' });
      return;
    }
    if (!isValidUrl(form.whatsapp_url) || !isValidUrl(form.music_url)) {
      toast({ title: t('newGathering.invalidLink'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('createGathering', {
        name: form.name.trim(),
        cover_image: form.cover_image,
        whatsapp_url: form.whatsapp_url.trim(),
        music_url: form.music_url.trim(),
      });
      const data = res.data || res;
      const gid = data.gathering?.id;
      toast({ title: t('newGathering.created') });
      navigate(gid ? `/gathering/${gid}/journey` : '/', { replace: true });
    } catch (err) {
      toast({ title: err.response?.data?.error || err.message || t('newGathering.couldNotCreate'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    navigate(-1);
  }

  const coverOptions = photos.length ? photos.map((p) => p.url) : SAMPLE_COVERS;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 pb-24">
        <DetailActionBar
          onBack={handleCancel}
          actions={
            <>
              <Button type="button" variant="secondary" size="sm" onClick={handleCancel} disabled={saving} className="shrink-0">
                <X /> {t('common.cancel')}
              </Button>
              <Button type="submit" form="new-gathering-form" size="sm" disabled={saving} className="shrink-0">
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                {t('newGathering.create')}
              </Button>
            </>
          }
        />

        <div className="mt-5">
          <form id="new-gathering-form" onSubmit={handleSave} className="space-y-5">
            {/* Name */}
            <div className="tt-card p-5 space-y-2">
              <Label htmlFor="g-name" className="text-ink-deep">{t('newGathering.name')}</Label>
              <Input
                id="g-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('newGathering.namePlaceholder')}
                required
                autoFocus
                className="bg-cream-pale border-ink-charcoal/20 text-ink-deep font-display text-lg"
              />
            </div>

            {/* Cover image */}
            <div className="tt-card p-5 space-y-3">
              <Label className="text-ink-deep flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                {t('newGathering.coverImage')}
              </Label>
              <p className="text-xs text-ink-deep/50">{t('newGathering.coverHint')}</p>
              <div className="grid grid-cols-3 gap-2">
                {coverOptions.map((url) => (
                  <button
                    type="button"
                    key={url}
                    onClick={() => setForm({ ...form, cover_image: url })}
                    className={`relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition ${form.cover_image === url ? 'border-terra ring-2 ring-terra/30' : 'border-transparent'}`}
                  >
                    <Image src={url} alt="cover" className="w-full h-full object-cover" fittingType="fill" />
                    {form.cover_image === url && (
                      <div className="absolute inset-0 bg-terra/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white drop-shadow" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {searching && <p className="text-xs text-ink-deep/40 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t('newGathering.searching')}</p>}
            </div>

            {/* Optional links */}
            <div className="tt-card p-5 space-y-4">
              <p className="tt-label text-ink-deep/40">{t('newGathering.optionalLinks')}</p>
              <div className="space-y-2">
                <Label className="text-ink-deep flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> {t('newGathering.whatsapp')} <span className="text-ink-deep/40 font-normal">({t('common.optional')})</span></Label>
                <Input
                  value={form.whatsapp_url}
                  onChange={(e) => setForm({ ...form, whatsapp_url: e.target.value })}
                  placeholder="https://chat.whatsapp.com/..."
                  type="url"
                  className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-ink-deep flex items-center gap-1.5"><Music className="w-3.5 h-3.5" /> {t('newGathering.music')} <span className="text-ink-deep/40 font-normal">({t('common.optional')})</span></Label>
                <Input
                  value={form.music_url}
                  onChange={(e) => setForm({ ...form, music_url: e.target.value })}
                  placeholder="https://open.spotify.com/playlist/..."
                  type="url"
                  className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
                />
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}