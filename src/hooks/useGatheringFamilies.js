import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Families of the gathering's participants, in the shape the split-unit /
// family-unit model expects ({ id, name, owner_user_id, memberUserIds }).
// Shared by the expense form and the expenses data layer so a household is
// resolved the same way when saving a split and when reporting balances.
export default function useGatheringFamilies(userIds = []) {
  const key = userIds.filter(Boolean).join('|');
  const [families, setFamilies] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const uids = key.split('|').filter(Boolean);
    if (!uids.length) { setFamilies([]); setLoaded(true); return; }
    let active = true;
    base44.functions.invoke('getFamiliesForUsers', { user_ids: uids })
      .then((res) => {
        if (!active) return;
        const data = res.data || res;
        setFamilies((data.families || []).map((f) => ({
          id: f.id,
          name: f.name,
          owner_user_id: f.owner_user_id,
          memberUserIds: [...(f.member_user_ids || [])],
        })));
      })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [key]);

  return { families, loaded };
}