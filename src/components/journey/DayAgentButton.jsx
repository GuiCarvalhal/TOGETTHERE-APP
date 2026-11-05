import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

// Per-day concierge shortcut on a Journey date section. Opens the existing
// Agent page scoped to that day (?day=YYYY-MM-DD) instead of the whole trip —
// the page keeps its own layout, only the scope changes.
export default function DayAgentButton({ gatheringId, day }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  if (!day || day === 'unscheduled') return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="shrink-0"
      aria-label={`${t('journey.agentDayAria')} — ${day}`}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/gathering/${gatheringId}/agent?day=${day}`);
      }}
    >
      <Sparkles />
      <span>{t('journey.agentDay')}</span>
    </Button>
  );
}