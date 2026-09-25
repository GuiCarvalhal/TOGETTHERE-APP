import React from 'react';
import { Check, Trash2 } from 'lucide-react';
import Skeleton from '@/components/tt/Skeleton';

// Presentational trip-task checklist for a gathering. State + mutations live in
// the parent (GatheringAgent) so the "Add to Task" buttons share one task list.
export default function TaskChecklist({ tasks, onToggle, onDelete, loading }) {
  if (loading) {
    return <div className="space-y-1.5">{[0, 1].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>;
  }
  if (!tasks || tasks.length === 0) {
    return <p className="text-xs text-ink-deep/45 px-1">No tasks yet. Add one from the suggestions below.</p>;
  }
  return (
    <div className="space-y-1.5">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 tt-ink-panel p-2.5">
          <button
            onClick={() => onToggle(t)}
            aria-label={t.done ? 'Mark incomplete' : 'Mark complete'}
            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${t.done ? 'bg-terra border-terra text-cream' : 'border-ink-charcoal/30 text-transparent hover:border-terra'}`}
          >
            <Check className="w-3 h-3" />
          </button>
          <span className={`text-sm flex-1 min-w-0 ${t.done ? 'line-through text-ink-deep/40' : 'text-ink-deep'}`}>{t.title}</span>
          <button onClick={() => onDelete(t)} aria-label="Delete task" className="p-1.5 text-ink-deep/40 hover:text-destructive shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}