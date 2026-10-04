import React from 'react';
import { useConnectivity } from '@/lib/useConnectivity';
import { useOfflineSaveStatus } from '@/lib/useOfflineSaveStatus';
import { useI18n } from '@/lib/i18n';
import { waitForSWReady } from '@/lib/registerSW';
import { CloudOff, AlertTriangle } from 'lucide-react';

// Discreet connectivity + save-status indicator for the TopBar.
// - Amber "Offline" pill when offline (links to /offline.html saved items).
// - Amber "Saving unavailable" pill when offline-save failed (IDB error).
// Both can show simultaneously. Nearly invisible when online and saves work.
// The offline link waits for the SW controller to be ready before navigating,
// so it never falls through to the ordinary SPA index.
export default function ConnectivityIndicator() {
  const { offline } = useConnectivity();
  const { status: saveStatus } = useOfflineSaveStatus();
  const { t } = useI18n();
  if (!offline && saveStatus.status !== 'error') return null;

  async function handleOfflineClick(e) {
    e.preventDefault();
    await waitForSWReady();
    window.location.href = '/offline.html';
  }

  return (
    <div className="flex items-center gap-1.5">
      {saveStatus.status === 'error' && (
        <span
          title={t('connectivity.savingUnavailableTitle')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[0.6875rem] font-semibold border border-amber-500/20"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">{t('connectivity.savingUnavailable')}</span>
          <span className="xs:hidden">{t('connectivity.savingUnavailableShort')}</span>
        </span>
      )}
      {offline && (
        <a
          href="/offline.html"
          onClick={handleOfflineClick}
          aria-label={t('connectivity.offlineAria')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-terra/15 text-terra-deep text-[0.6875rem] font-semibold border border-terra/20 hover:bg-terra/25 transition-colors"
        >
          <CloudOff className="w-3.5 h-3.5" />
          <span>{t('connectivity.offline')}</span>
        </a>
      )}
    </div>
  );
}