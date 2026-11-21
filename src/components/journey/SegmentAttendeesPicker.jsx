import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import MemberAvatar from '@/components/tt/MemberAvatar';
import useGatheringFamilies from '@/hooks/useGatheringFamilies';
import { useI18n } from '@/lib/i18n';
import { Check, Loader2, Plus } from 'lucide-react';

// Who's in: the current user plus their family members in this gathering, each
// drawn as an avatar TOGGLE instead of a single "join / leave" button. A checked
// badge means the person is on the segment; a plus badge means they are out and
// one tap puts them in. joinJourneySegment enforces the rule server-side: a
// person can only be added or removed by themselves or by someone from their own
// family, so a crafted request can never edit a stranger's attendance.
export default function SegmentAttendeesPicker({ item, members = [], currentMember, onChanged, compact }) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState(null);
  const me = currentMember;
  const userIds = useMemo(() => members.map((m) => m.user_id).filter(Boolean), [members]);
  const { families } = useGatheringFamilies(userIds);

  // Me first, then my family members who are also part of this gathering.
  // Viewers are read-only observers, so they are never offered as attendees.
  const people = useMemo(() => {
    if (!me?.user_id) return [];
    const byUid = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id, m]));
    const mine = families.find((f) => f.owner_user_id === me.user_id || f.memberUserIds.includes(me.user_id));
    const uids = new Set([me.user_id]);
    if (mine) [mine.owner_user_id, ...mine.memberUserIds].forEach((uid) => uid && uids.add(uid));
    return [...uids]
      .map((uid) => byUid.get(uid) || (uid === me.user_id ? me : null))
      .filter((m) => m && m.role !== 'viewer')
      .sort((a, b) => (a.user_id === me.user_id ? -1 : b.user_id === me.user_id ? 1 : 0));
  }, [me, members, families]);

  if (!me?.user_id || me.role === 'viewer') return null;

  const attendees = item.attendee_user_ids || [];

  async function toggle(person) {
    const uid = person.user_id;
    if (item.owner_id === uid) return;
    const isIn = attendees.includes(uid);
    setBusyId(uid);
    try {
      await base44.functions.invoke('joinJourneySegment', {
        item_id: item.id,
        action: isIn ? 'leave' : 'join',
        user_id: uid,
      });
      onChanged?.();
    } catch (e) {
      alert(e.response?.data?.error || e.data?.error || e.message || t('journeyDetail.attendeeUpdateFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className={`tt-label text-ink-deep/40 ${compact ? 'mb-1.5' : 'mb-2'}`}>{t('journeyDetail.whoIsIn')}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        {people.map((person) => {
          const isHost = item.owner_id === person.user_id;
          const isIn = isHost || attendees.includes(person.user_id);
          const busy = busyId === person.user_id;
          const name = person.display_name || person.full_name || t('memberRow.unnamedMember');
          const label = isHost ? t('journeyDetail.hosting') : isIn
            ? t('journeyDetail.removePerson', { name })
            : t('journeyDetail.addPerson', { name });
          return (
            <button
              key={person.user_id}
              type="button"
              onClick={() => toggle(person)}
              disabled={busy || isHost}
              aria-pressed={isIn}
              aria-label={label}
              title={name}
              className={`group relative rounded-full ${isHost ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <MemberAvatar
                member={person}
                size={compact ? 'sm' : 'md'}
                ring={isIn && !isHost}
                className={`transition-opacity ${isIn ? '' : 'opacity-45 group-hover:opacity-90'}`}
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border ${isIn ? 'bg-[#4a8b6f] border-card text-white' : 'bg-card border-ink-charcoal/25 text-ink-deep/55'}`}
              >
                {busy
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : isIn ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}