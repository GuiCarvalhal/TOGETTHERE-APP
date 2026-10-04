import React from 'react';
import { User, Users } from 'lucide-react';
import { useOptionalGathering } from '@/lib/gatheringContext';
import { useI18n } from '@/lib/i18n';
import SegmentedControl from '@/components/tt/SegmentedControl';

// Shared Mine/Group scope switcher used by every toolbar page (Journey,
// Expenses, Members, Agent). Delegates to the shared SegmentedControl so the
// pill capsule, button dimensions and selected/unselected treatment are
// identical to DetailSwitcher and the Agent length switcher.
//
// Viewers get Group view only — no participation scope selector — since the
// Close/Casual friendship model has been retired and viewers don't own/attend
// items themselves. Returning null keeps the toolbar layout (the right-side
// actions stay flush right) without rendering a dangling toggle.
export default function ScopeSwitcher({ scope, setScope }) {
  const gctx = useOptionalGathering() || {};
  const { t } = useI18n();
  const isViewer = gctx.role === 'viewer';
  if (isViewer) return null;

  return (
    <SegmentedControl
      ariaLabel={t('toolbar.scopeLabel')}
      value={scope}
      onChange={setScope}
      options={[
        { key: 'mine', label: t('toolbar.mine'), icon: <User /> },
        { key: 'group', label: t('toolbar.group'), icon: <Users /> },
      ]}
    />
  );
}