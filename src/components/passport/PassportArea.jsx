import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookMarked, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/tt/Skeleton';
import { Button } from '@/components/ui/button';
import PassportCover from '@/components/passport/PassportCover';
import PassportStamp from '@/components/passport/PassportStamp';
import CountryPickerSheet from '@/components/passport/CountryPickerSheet';
import StampStyleGallery from '@/components/passport/StampStyleGallery';
import { countryName } from '@/lib/passport';
import { invalidatePassportAwards } from '@/lib/passportAwardsSummary';
import { loadCommunitySignals, peekCommunitySignals, peersForCountry } from '@/lib/communitySignals';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';

// Passport: the countries this user has been to (derived from their gatherings)
// plus the ones they added by hand, visited or still on the bucket list. The
// server does the deriving; this page only renders the list and edits it.
//
// `section` renders it as a section of the merged Passport & Awards area: the
// cover and the internal tabs belong to the area's Overview, so they are skipped
// and only the requested list is shown.
const TABS = [
  { key: 'visited', labelKey: 'passport.tabVisited' },
  { key: 'bucket', labelKey: 'passport.tabBucket' },
];

const EMPTY = { visited: [], bucket: [], stats: { countries: 0, bucket: 0, trips: 0 } };

export default function PassportArea({ section = null }) {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(section || 'visited');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState(section || 'visited');
  const [busy, setBusy] = useState('');
  // People you travelled with who have already been to a wishlist country.
  const [peers, setPeers] = useState(() => peekCommunitySignals()?.peers || []);

  useEffect(() => {
    let cancelled = false;
    loadCommunitySignals()
      .then((signals) => { if (!cancelled) setPeers(signals.peers || []); })
      .catch(() => { /* faces are optional */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (section) { setTab(section); setMode(section); }
  }, [section]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await base44.functions.invoke('getPassport', {});
      setData(res.data || EMPTY);
      setError('');
    } catch {
      setError(t('passport.loadFailed'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const mutate = async (action, code, status) => {
    setBusy(code);
    try {
      await base44.functions.invoke('updatePassport', { action, code, status });
      // The shared summary feeds Home's banner and the area's Overview.
      invalidatePassportAwards();
      await load(true);
      setError('');
    } catch {
      setError(t('passport.saveFailed'));
    } finally {
      setBusy('');
    }
  };

  // What the picker needs to know: which countries are already in the passport
  // and whether that came from a trip (locked) or from the user.
  const entries = useMemo(() => {
    const map = {};
    (data?.visited || []).forEach((row) => { map[row.code] = { status: 'visited', source: row.source }; });
    (data?.bucket || []).forEach((row) => { map[row.code] = { status: 'bucket', source: 'manual' }; });
    return map;
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-3">
        {!section ? <Skeleton className="h-40 w-full rounded-[1.25rem]" tone="cream" /> : null}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-xl" tone="cream" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="tt-card p-6 text-center space-y-3">
        <p className="text-sm text-ink-deep/60">{error || t('passport.loadFailed')}</p>
        <Button variant="secondary" size="sm" onClick={() => load()}>{t('passport.retry')}</Button>
      </div>
    );
  }

  const rows = tab === 'visited' ? data.visited : data.bucket;
  const openPicker = (nextMode) => { setMode(nextMode); setPickerOpen(true); };

  return (
    <div className="space-y-4">
      {!section ? <PassportCover name={user?.full_name || user?.email || ''} stats={data.stats} /> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button className="min-w-0" onClick={() => openPicker('visited')}>
          <Plus /> <span className="truncate">{t('passport.addVisited')}</span>
        </Button>
        <Button variant="secondary" className="min-w-0" onClick={() => openPicker('bucket')}>
          <BookMarked /> <span className="truncate">{t('passport.addBucket')}</span>
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {!section ? (
        <div className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10">
          {TABS.map(({ key, labelKey }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                tab === key ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'
              }`}
            >
              {t(labelKey)} ({key === 'visited' ? data.visited.length : data.bucket.length})
            </button>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="tt-card p-6 text-center">
          <p className="font-display text-base font-bold text-ink-deep">
            {t(tab === 'visited' ? 'passport.emptyVisitedTitle' : 'passport.emptyBucketTitle')}
          </p>
          <p className="text-xs text-ink-deep/55 mt-1.5 leading-relaxed">
            {t(tab === 'visited' ? 'passport.emptyVisitedBody' : 'passport.emptyBucketBody')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-1">
          {rows.map((row) => (
            <PassportStamp
              key={row.code}
              code={row.code}
              name={countryName(row.code, fmt.locale)}
              visited={tab === 'visited'}
              date={row.first_visit ? fmt.formatDate(row.first_visit, { month: 'short', year: 'numeric' }) : ''}
              trips={row.trip_count || 0}
              companions={tab === 'visited' ? (row.companions || []) : peersForCountry(peers, row.code)}
            />
          ))}
        </div>
      )}

      <p className="text-[0.6875rem] text-ink-deep/45 leading-snug">{t('passport.hint')}</p>

      <StampStyleGallery />

      <CountryPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode={mode}
        onModeChange={setMode}
        entries={entries}
        busy={busy}
        onAdd={(code, status) => mutate('set', code, status)}
        onRemove={(code) => mutate('remove', code)}
      />
    </div>
  );
}