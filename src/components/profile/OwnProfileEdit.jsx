import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { base44 } from '@/api/base44Client';
import MemberAvatar from '@/components/tt/MemberAvatar';
import ChipPicker from '@/components/profile/ChipPicker';
import { INTERESTS, CUISINE } from '@/lib/profileOptions';
import FamilyManager from '@/components/profile/FamilyManager';
import HomePlaceField from '@/components/profile/HomePlaceField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMMON_CURRENCIES, currencyLabel } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Globe, Sparkles, Camera, UtensilsCrossed } from 'lucide-react';

// Editable universal profile. Global fields (home_city, home_currency, bio,
// interests, dietary_preferences, photo) persist on the User entity via
// updateMe; name + photo also sync to the current gathering's Member record so
// cards/avatars update there. Family management is global. The profile is
// universal — no gathering-scoped role/dates are shown here.
//
// The Save action lives in the page's sticky ProfileActionBar, so this
// component exposes an imperative save() through its ref and reports dirty /
// saving state via callbacks. The save logic itself is unchanged.
const OwnProfileEdit = forwardRef(function OwnProfileEdit({ data, gatheringId, userId, onSaved, onSaveDone, onDirtyChange, onSavingChange, openMore }, ref) {
  const { user, member, families } = data;
  const { toast } = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState({
    full_name: user?.display_name || member?.full_name || user?.full_name || '',
    photo: user?.photo || member?.photo || '',
    home_city: user?.home_city || '',
    home_place: user?.home_place || null,
    home_currency: user?.home_currency || 'USD',
    bio: user?.bio || '',
    interests: user?.interests || [],
    dietary_preferences: user?.dietary_preferences || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Dirty tracking — compare current form to the snapshot taken at mount so the
  // action bar's Save can stay a no-op until something actually changed.
  const initialRef = useRef(null);
  if (!initialRef.current) initialRef.current = JSON.stringify(form);
  const isDirty = JSON.stringify(form) !== initialRef.current;

  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => { onSavingChange?.(saving); }, [saving, onSavingChange]);

  async function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, photo: file_url }));
    } catch {
      toast({ title: t('profileEdit.uploadFailed'), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      // Global profile fields persist on the User entity via updateMe. The
      // display_name is the universal profile name (full_name is a read-only
      // built-in that can't be overridden, so display_name is the editable
      // name). photo is also global.
      await base44.auth.updateMe({
        display_name: form.full_name.trim(),
        home_city: form.home_city.trim(),
        home_place: form.home_place || null,
        home_currency: form.home_currency,
        bio: form.bio.trim(),
        interests: form.interests,
        dietary_preferences: form.dietary_preferences,
        photo: form.photo,
      });
      // Sync name + photo to the Member record ONLY when a gathering context
      // exists — so gathering cards/avatars update there too. Without a
      // gathering, the global update above is the whole save.
      if (gatheringId) {
        await base44.functions.invoke('updateMyProfile', {
          gathering_id: gatheringId,
          fields: { full_name: form.full_name.trim(), photo: form.photo },
        });
      }
      toast({ title: t('profileEdit.profileSaved') });
      onSaved();
      onSaveDone?.();
    } catch (e) {
      toast({ title: e.response?.data?.error || e.message || t('profileEdit.couldNotSave'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ save }));

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="tt-card p-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <MemberAvatar member={{ photo: form.photo, full_name: form.full_name }} size="xl" />
            <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-terra text-cream flex items-center justify-center cursor-pointer shadow-md hover:bg-terra-deep transition-colors">
              <Camera className="w-3.5 h-3.5" />
              <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            </label>
          </div>
          <div className="flex-1 min-w-0">
            <Label className="text-xs text-ink-deep/50">{t('profileEdit.displayName')}</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1 bg-cream-pale border-ink-charcoal/20 text-ink-deep font-display text-lg" />
          </div>
        </div>
      </div>

      {/* Universal profile fields */}
      <div className="tt-card p-5 space-y-4">
        <p className="tt-label text-ink-deep/40">{t('profileEdit.aboutMe')}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-deep/60 flex items-center gap-1"><MapPin className="w-3 h-3" /> {t('profileEdit.homeCity')}</Label>
            <HomePlaceField
              value={form.home_city}
              place={form.home_place}
              onChange={(text, p) => setForm({ ...form, home_city: text, home_place: p })}
              className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-deep/60 flex items-center gap-1"><Globe className="w-3 h-3" /> {t('profileEdit.homeCurrency')}</Label>
            <Select value={form.home_currency} onValueChange={(v) => setForm({ ...form, home_currency: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{currencyLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-ink-deep/60">{t('profileEdit.shortBio')}</Label>
          <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder={t('profileEdit.shortBioPlaceholder')} rows={3} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep resize-none" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-ink-deep/60 flex items-center gap-1"><Sparkles className="w-3 h-3" /> {t('profileEdit.interests')}</Label>
          <ChipPicker catalog={INTERESTS} value={form.interests} onChange={(v) => setForm({ ...form, interests: v })} max={8} dictPrefix="interests" emptyHint={t('profileEdit.interestsHint')} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-ink-deep/60 flex items-center gap-1"><UtensilsCrossed className="w-3 h-3" /> {t('profileEdit.cuisinePreferences')}</Label>
          <ChipPicker catalog={CUISINE} value={form.dietary_preferences} onChange={(v) => setForm({ ...form, dietary_preferences: v })} max={10} dictPrefix="cuisine" emptyHint={t('profileEdit.cuisineHint')} />
        </div>
      </div>

      {/* Family (global) */}
      <FamilyManager families={families || []} gatheringId={gatheringId} userId={userId} onChanged={onSaved} />

      {/* Save lives in the sticky ProfileActionBar. */}
      {openMore && (
        <Button variant="outline" onClick={openMore} className="rounded-full">{t('profileEdit.accountSettings')}</Button>
      )}
    </div>
  );
});

export default OwnProfileEdit;