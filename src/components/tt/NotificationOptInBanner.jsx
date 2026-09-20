import React, { useState, useEffect } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Contextual opt-in prompt: only after the user is authenticated and inside a
// gathering, never on first page load. Dismissed per-gathering via localStorage.
export default function NotificationOptInBanner({ onesignal, gatheringId }) {
  const { configured, supported, permission, ready, requestPermission } = onesignal;
  const [dismissed, setDismissed] = useState(false);
  const key = `tt-notify-dismiss-${gatheringId}`;

  useEffect(() => {
    try { setDismissed(localStorage.getItem(key) === '1'); } catch { /* ignore */ }
  }, [key]);

  if (!configured || !supported || permission === 'granted' || dismissed || !ready) return null;

  async function allow() {
    const ok = await requestPermission();
    if (ok) setDismissed(true);
  }
  function dismiss() {
    try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="tt-card p-4 flex items-center gap-3 flex-wrap bg-terra/5 border-terra/20">
        <div className="w-10 h-10 rounded-full bg-terra/15 flex items-center justify-center shrink-0">
          <BellRing className="w-5 h-5 text-terra-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-deep text-sm">Stay in the loop</p>
          <p className="text-xs text-ink-deep/60">Push notifications for journey changes, expenses, and member activity.</p>
        </div>
        <Button type="button" onClick={allow} className="bg-terra hover:bg-terra-deep text-cream rounded-full h-9">Turn on</Button>
        <button onClick={dismiss} className="text-xs text-ink-deep/50 hover:text-ink-deep px-2 min-h-[44px]">Not now</button>
      </div>
    </div>
  );
}