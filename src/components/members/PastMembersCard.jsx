import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import MemberAvatar from '@/components/tt/MemberAvatar';
import Skeleton from '@/components/tt/Skeleton';
import { Check, History } from 'lucide-react';

// "People from previous gatherings" — accounts the host has already traveled
// with, addable in one tap without an invite link. Sits below the member
// directory; the invite-link sheet above is untouched. Selection is local until
// "Add selected" runs, and the list drops whoever the backend just added.
export default function PastMembersCard({ gatheringId, onAdded }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await base44.functions.invoke('getPastMemberCandidates', { gathering_id: gatheringId });
        const data = res.data || res;
        if (active) setCandidates(data.candidates || []);
      } catch {
        if (active) setCandidates([]);
      }
    })();
    return () => { active = false; };
  }, [gatheringId]);

  function toggle(uid) {
    setSelected((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  async function handleAdd() {
    if (!selected.length || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('addPastMembers', { gathering_id: gatheringId, user_ids: selected });
      const data = res.data || res;
      const added = data.added || [];
      const failed = data.failed || [];
      if (added.length) {
        toast({ title: t('members.pastAdded', { count: added.length }) });
        setCandidates((prev) => (prev || []).filter((c) => !added.some((a) => a.user_id === c.user_id)));
        setSelected([]);
        if (onAdded) onAdded();
      }
      if (failed.length) {
        toast({
          title: t('members.pastCouldNotAdd'),
          description: failed.map((f) => f.name || f.user_id).join(', '),
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: e.response?.data?.error || e.message || t('members.pastCouldNotAdd'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <History className="w-3.5 h-3.5 text-terra-deep" />
        <h3 className="tt-label text-ink-deep/55">{t('members.pastTitle')}</h3>
        {candidates && candidates.length > 0 && (
          <span className="text-xs text-ink-deep/40">· {candidates.length}</span>
        )}
      </div>

      {candidates === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-ink-charcoal/15 bg-card p-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" tone="cream" />
              </div>
            </div>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-2xl border border-ink-charcoal/15 bg-card p-5 text-center">
          <p className="text-sm font-semibold text-ink-deep">{t('members.pastEmpty')}</p>
          <p className="text-xs text-ink-deep/55 mt-1 leading-relaxed">{t('members.pastEmptyBody')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-ink-deep/55">{t('members.pastDesc')}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {candidates.map((c) => {
              const picked = selected.includes(c.user_id);
              return (
                <button
                  key={c.user_id}
                  type="button"
                  onClick={() => toggle(c.user_id)}
                  aria-pressed={picked}
                  title={c.full_name || c.first_name}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${picked ? 'border-terra bg-terra/10' : 'border-ink-charcoal/15 bg-card hover:bg-cream-pale'}`}
                >
                  <MemberAvatar member={{ full_name: c.full_name || c.first_name, photo: c.photo }} size="sm" ring={picked} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-deep truncate">{c.first_name || c.full_name}</span>
                    <span className="hidden sm:block text-xs text-ink-deep/50 truncate">{c.full_name}</span>
                  </span>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${picked ? 'bg-terra border-terra text-cream' : 'border-ink-charcoal/30 text-transparent'}`}>
                    <Check className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="button" onClick={handleAdd} disabled={!selected.length || busy} className="shrink-0">
              <Check /> {t('members.pastAddSelected')}
            </Button>
            {selected.length > 0 && (
              <span className="text-xs text-ink-deep/55">{t('members.pastSelectedCount', { count: selected.length })}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}