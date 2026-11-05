import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Lists the recoverable (soft-deleted) rows of one entity for a gathering, so
// the Journey and Expenses pages can offer a small "Recently deleted" entry
// point with a live count. Errors degrade to an empty list: this is a recovery
// affordance, never a reason to break the page.
export default function useRecentlyDeleted(entityName, gatheringId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!gatheringId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const list = await base44.entities[entityName].filter({ gathering_id: gatheringId, is_deleted: true });
      setItems((list || []).slice().sort((a, b) => new Date(b.deleted_at || 0) - new Date(a.deleted_at || 0)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entityName, gatheringId]);

  useEffect(() => { reload(); }, [reload]);

  return { items, loading, reload };
}