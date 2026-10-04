import React from 'react';
import { useConnectivity } from '@/lib/useConnectivity';
import { useOfflineSaveStatus } from '@/lib/useOfflineSaveStatus';
import { CloudOff, AlertTriangle } from 'lucide-react';

// Discreet connectivity + save-status indicator for the TopBar.
// - Amber "Offline" pill when offline (links to /offline.html saved items).
// - Amber "Saving unavailable" pill when offline-save failed (IDB error).
// Both can show simultaneously. Nearly invisible when online and saves work.
export default function ConnectivityIndicator() {
  const { offline } = useConnectivity();
  const { status: saveStatus } = useOfflineSaveStatus();
  if (!offline && saveStatus.status !== 'error') return null;
  return (
    <div className="flex items-center gap-1.5">
      {saveStatus.status === 'error' && (
        <span
          title="Offline saving unavailable — cached data may be incomplete"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[0.6875rem] font-semibold border border-amber-500/20"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Saving unavailable</span>
          <span className="xs:hidden">Save</span>
        </span>
      )}
      {offline && (
        <a
          href="/offline.html"
          aria-label="Offline — view saved items (read-only)"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-terra/15 text-terra-deep text-[0.6875rem] font-semibold border border-terra/20 hover:bg-terra/25 transition-colors"
        >
          <CloudOff className="w-3.5 h-3.5" />
          <span>Offline</span>
        </a>
      )}
    </div>
  );
}