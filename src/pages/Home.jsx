import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Image } from '@/components/ui/image';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Plus, MapPin, CalendarDays, Compass, ArrowRight } from 'lucide-react';
import { formatDateRange } from '@/lib/gatheringHelpers';

const SAMPLE_COVERS = [
  'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=80',
  'https://images.unsplash.com/photo-1502602898657-3e9fa60e1900?w=1200&q=80',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80',
];

export default function Home() {
  const [memberships, setMemberships] = useState([]);
  const [gatherings, setGatherings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '', destinations: '', cover_image: SAMPLE_COVERS[0] });

  async function load() {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      const [allGatherings, myMembers] = await Promise.all([
        base44.entities.Gathering.list('-created_date', 100),
        base44.entities.Member.filter({ user_id: me.id }),
      ]);
      const gids = new Set(myMembers.map((m) => m.gathering_id));
      setGatherings(allGatherings.filter((g) => gids.has(g.id)));
      setMemberships(myMembers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await base44.functions.invoke('createGathering', {
        name: form.name.trim(),
        description: form.description,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        destinations: form.destinations.split(',').map((s) => s.trim()).filter(Boolean),
        cover_image: form.cover_image,
      });
      setOpen(false);
      setForm({ name: '', description: '', start_date: '', end_date: '', destinations: '', cover_image: SAMPLE_COVERS[0] });
      await load();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not create gathering');
    } finally {
      setCreating(false);
    }
  }

  const roleOf = (gid) => memberships.find((m) => m.gathering_id === gid)?.role;

  return (
    <div className="min-h-screen bg-ink text-cream">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="font-display text-2xl font-bold tracking-tight">TOGETTHERE</span>
          <Button onClick={() => setOpen(true)} className="bg-terra hover:bg-terra-deep text-cream rounded-full h-10 px-4">
            <Plus className="w-4 h-4 mr-1.5" /> New Gathering
          </Button>
        </div>
      </header>

      {/* Hero intro */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-10">
        <p className="tt-label text-terra-coral mb-3">Group travel & gatherings</p>
        <h1 className="font-display text-4xl sm:text-6xl font-bold leading-[1.05] tt-text-balance max-w-3xl">
          Plan the journey together.<br /><span className="italic text-terra-coral">Get there, together.</span>
        </h1>
        <p className="text-cream/70 mt-5 max-w-xl text-[0.9375rem] leading-relaxed">
          A living itinerary for your crew — flights and stays on a shared timeline, expenses split fairly, and an AI concierge that tailors each day to where the group actually is.
        </p>
      </section>

      {/* Gatherings grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-2xl font-bold">Your gatherings</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-terra" /></div>
        ) : gatherings.length === 0 ? (
          <div className="tt-card p-10 text-center">
            <Compass className="w-10 h-10 text-terra mx-auto mb-4" />
            <p className="font-display text-2xl mb-2 text-ink-deep">No gatherings yet</p>
            <p className="text-ink-deep/60 mb-6 text-sm">Start your first trip or event and invite your crew.</p>
            <Button onClick={() => setOpen(true)} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
              <Plus className="w-4 h-4 mr-1.5" /> Create a gathering
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {gatherings.map((g) => {
              const role = roleOf(g.id);
              return (
                <Link key={g.id} to={`/gathering/${g.id}/journey`} className="group tt-card overflow-hidden hover:-translate-y-1 transition-transform duration-300">
                  <div className="aspect-[16/10] w-full overflow-hidden bg-cream-pale">
                    {g.cover_image ? (
                      <Image src={g.cover_image} alt={g.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" fittingType="fill" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-cream-pale to-cream-warm flex items-center justify-center">
                        <span className="font-display italic text-ink/30 text-3xl">{g.name?.[0]}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-display text-xl font-bold text-ink-deep leading-tight line-clamp-1">{g.name}</h3>
                      {role && <span className={`tt-stamp ${role === 'owner' ? 'bg-terra text-cream border-terra' : 'bg-cream-pale text-ink-deep border-ink-charcoal/20'} capitalize`}>{role}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-deep/60 mt-2">
                      {g.start_date && <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatDateRange(g.start_date, g.end_date)}</span>}
                      {g.destinations?.length > 0 && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{g.destinations.slice(0, 2).join(', ')}</span>}
                    </div>
                    <div className="mt-4 inline-flex items-center gap-1 text-terra-deep text-sm font-semibold group-hover:gap-2 transition-all">
                      Open <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="tt-card rounded-[1.5rem] p-0 max-w-lg">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="font-display text-2xl font-bold text-ink-deep">New gathering</DialogTitle>
            <DialogDescription className="text-ink-deep/60">A trip or event to coordinate with your crew.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="px-6 pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="g-name" className="text-ink-deep">Name</Label>
              <Input id="g-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Amalfi Coast Reunion '25" required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="g-start" className="text-ink-deep">Start</Label>
                <Input id="g-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-end" className="text-ink-deep">End</Label>
                <Input id="g-end" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-dest" className="text-ink-deep">Destinations <span className="text-ink-deep/40 font-normal">(comma separated)</span></Label>
              <Input id="g-dest" value={form.destinations} onChange={(e) => setForm({ ...form, destinations: e.target.value })} placeholder="Amalfi, Positano, Ravello" className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <div className="space-y-2">
              <Label className="text-ink-deep">Cover image</Label>
              <div className="flex gap-2">
                {SAMPLE_COVERS.map((url) => (
                  <button type="button" key={url} onClick={() => setForm({ ...form, cover_image: url })}
                    className={`w-20 h-14 rounded-lg overflow-hidden border-2 ${form.cover_image === url ? 'border-terra' : 'border-transparent'}`}>
                    <Image src={url} alt="cover" className="w-full h-full object-cover" fittingType="fill" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-desc" className="text-ink-deep">Description <span className="text-ink-deep/40 font-normal">(optional)</span></Label>
              <Textarea id="g-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-ink-deep/60 hover:text-ink-deep">Cancel</Button>
              <Button type="submit" disabled={creating} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create gathering
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}