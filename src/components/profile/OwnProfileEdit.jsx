import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import MemberAvatar from '@/components/tt/MemberAvatar';
import InterestsEditor from '@/components/profile/InterestsEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMMON_CURRENCIES } from '@/lib/gatheringHelpers';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Settings, MapPin, Globe, Sparkles, Camera } from 'lucide-react';

// Editable own-profile. Global fields (home_city, home_currency, bio, interests,
// photo) persist on the User entity via updateMe; name + photo also sync to the
// current gathering's Member record so cards/MemberAvatar update here.
export default function OwnProfileEdit({ data, gatheringId, onSaved, openMore }) {
  const { user, member } = data;
  const { toast } = useToast();
  const [form, setForm] = useState({
    full_name: member?.full_name || user?.full_name || '',
    photo: user?.photo || member?.photo || '',
    home_city: user?.home_city || '',
    home_currency: user?.home_currency || 'USD',
    bio: user?.bio || '',
    interests: user?.interests || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, photo: file_url }));
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await base44.auth.updateMe({
        home_city: form.home_city.trim(),
        home_currency: form.home_currency,
        bio: form.bio.trim(),
        interests: form.interests,
        photo: form.photo,
      });
      await base44.functions.invoke('updateMyProfile', {
        gathering_id: gatheringId,
        fields: { full_name: form.full_name.trim(), photo: form.photo },
      });
      toast({ title: 'Profile saved' });
      onSaved();
    } catch (e) {
      toast({ title: e.response?.data?.error || e.message || 'Could not save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="tt-card p-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <MemberAvatar member={{ photo: form.photo, full_name: form.full_name }} size="xl" />
            <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-terra text-cream flex items-center justify-center cursor-pointer shadow-md hover:bg-terra-deep transition-colors">
              <Camera className="w-3.5 h-3.5" />
              <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            </label>
          </div>
          <div className="flex-1 min-w-0">
            <Label className="text-xs text-ink-deep/50">Your name</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1 bg-cream-pale border-ink-charcoal/20 text-ink-deep font-display text-lg" />
            <p className="text-[0.625rem] text-ink-deep/45 mt-1">{member?.role ? `Your role in this trip: ${member.role}` : ''}</p>
          </div>
        </div>
      </div>

      <div className="tt-card p-5 space-y-4">
        <p className="tt-label text-ink-deep/40">About me</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-deep/60 flex items-center gap-1"><MapPin className="w-3 h-3" /> Home city</Label>
            <Input value={form.home_city} onChange={(e) => setForm({ ...form, home_city: e.target.value })} placeholder="Brooklyn, NY" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-ink-deep/60 flex items-center gap-1"><Globe className="w-3 h-3" /> Home currency</Label>
            <Select value={form.home_currency} onValueChange={(v) => setForm({ ...form, home_currency: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMMON_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-ink-deep/60">Short bio</Label>
          <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="A few lines about you — your travel style, what you love…" rows={3} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep resize-none" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-ink-deep/60 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Interests &amp; preferences</Label>
          <InterestsEditor value={form.interests} onChange={(v) => setForm({ ...form, interests: v })} />
          <p className="text-[0.625rem] text-ink-deep/45">Cuisine, activities, dietary needs, vibe — anything that helps the Agent tailor picks for you.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={save} disabled={saving || uploading} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save profile
        </Button>
        {openMore && (
          <Button variant="outline" onClick={openMore} className="rounded-full">
            <Settings className="w-4 h-4 mr-2" /> Account settings
          </Button>
        )}
      </div>
    </div>
  );
}