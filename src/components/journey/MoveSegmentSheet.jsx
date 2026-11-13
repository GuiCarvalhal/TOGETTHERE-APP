import React, { useEffect, useMemo, useState } from 'react';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui/use-toast';
import { AlertTriangle, ArrowRightLeft, Loader2 } from 'lucide-react';

// Moves a journey segment into another gathering. Only gatherings the user takes
// part in are offered; the destination roster is fetched on selection so the
// user sees, before confirming, which participants will be dropped — the backend
// rebuilds the ACL, owner and attendees for the destination in the same write.
export default function MoveSegmentSheet({ open, onOpenChange, item, currentGatheringId, currentMember, onMoved }) {
  const { t } = useI18n();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [targetMembers, setTargetMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetId('');
    setTargetMembers([]);
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [gatheringRows, myMemberships] = await Promise.all([
          base44.entities.Gathering.filter({}),
          base44.entities.Member.filter({ user_id: currentMember?.user_id }),
        ]);
        if (!active) return;
        const list = Array.isArray(gatheringRows) ? gatheringRows : (gatheringRows?.items || []);
        const roleByGid = Object.fromEntries((myMemberships || []).map((m) => [m.gathering_id, m.role]));
        setTargets(list.filter((g) => g.is_deleted !== true && g.id !== currentGatheringId && roleByGid[g.id] && roleByGid[g.id] !== 'viewer'));
      } catch {
        if (active) setTargets([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, currentGatheringId, currentMember?.user_id]);

  useEffect(() => {
    if (!targetId) { setTargetMembers([]); return; }
    let active = true;
    setLoadingMembers(true);
    (async () => {
      try {
        const rows = await base44.entities.Member.filter({ gathering_id: targetId });
        if (active) setTargetMembers(Array.isArray(rows) ? rows : (rows?.items || []));
      } catch {
        if (active) setTargetMembers([]);
      } finally {
        if (active) setLoadingMembers(false);
      }
    })();
    return () => { active = false; };
  }, [targetId]);

  // Participants on this segment that do not take part in the destination will
  // be removed when the segment moves (viewers never count as participants).
  const dropped = useMemo(() => {
    if (!targetId) return 0;
    const participantIds = new Set(targetMembers.filter((m) => m.role !== 'viewer').map((m) => m.user_id));
    return (item?.attendee_user_ids || []).filter((uid) => !participantIds.has(uid)).length;
  }, [item, targetId, targetMembers]);

  async function confirm() {
    if (!targetId || busy) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('moveJourneyItem', {
        item_id: item.id,
        target_gathering_id: targetId,
      });
      const data = res.data || res;
      if (data?.error) throw { message: data.error };
      toast({
        title: t('journeyDetail.moved'),
        description: data?.removed_participants
          ? t('journeyDetail.moveDrop', { count: data.removed_participants })
          : t('journeyDetail.moveKeep'),
      });
      onOpenChange(false);
      onMoved?.(targetId);
    } catch (e) {
      toast({
        title: t('journeyDetail.moveFailed'),
        description: e?.response?.data?.error || e?.message || t('common.error'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={t('journeyDetail.moveTitle')}>
      <div className="space-y-4 pb-2">
        <p className="text-sm text-ink-deep/60">{t('journeyDetail.moveDesc')}</p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-deep/50 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : targets.length === 0 ? (
          <p className="text-sm text-ink-deep/55">{t('journeyDetail.moveNoTargets')}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-ink-deep">{t('journeyDetail.moveTargetLabel')}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep">
                  <SelectValue placeholder={t('journeyDetail.moveTargetPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {targetId && (
              <div className="rounded-xl bg-cream-pale border border-ink-charcoal/15 p-3 text-xs text-ink-deep/70 flex items-start gap-2">
                {loadingMembers ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-terra-deep mt-0.5 shrink-0" />
                )}
                <span>
                  {t('journeyDetail.moveTargetMembers', { count: targetMembers.length })}
                  {dropped > 0 ? ` · ${t('journeyDetail.moveDrop', { count: dropped })}` : ` · ${t('journeyDetail.moveKeep')}`}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={confirm} disabled={!targetId || busy} className="flex-1">
                {busy ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
                {t('journeyDetail.moveAction')}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}
      </div>
    </FormSheet>
  );
}