import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Inbox, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { journeyIcon } from '@/lib/journeyIcons';
import { useI18n } from '@/lib/i18n';
import InboxSyncBar from '@/components/tt/InboxSyncBar';

const MAX_PREVIEW = 3;

// Home entry point for the journey inbox: the durable home for imported
// reservation segments. It leads with what is waiting to be reviewed, keeps the
// mailbox sync controls in the same card (so "sync" and "see what arrived" read
// as one feature), and is always visible — the inbox is a core surface, not a
// link buried in a conditional card.
export default function JourneyInboxPanel({ items = [], count = 0, connections = [], onSynced }) {
  const { t, fmt } = useI18n();
  const preview = items.slice(0, MAX_PREVIEW);
  const hasMailbox = connections.some((c) => c.status !== 'disconnected');
  const remaining = Math.max(0, count - preview.length);

  return (
    <div className="tt-card p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-terra/15 border border-terra/25 flex items-center justify-center shrink-0">
            <Inbox className="w-4 h-4 text-terra-coral" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-ink-deep">{t('inbox.title')}</h3>
              {count > 0 && (
                <span className="px-2 rounded-full bg-primary text-primary-foreground text-[0.6875rem] font-bold leading-5">
                  {fmt.formatNumber(count)}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-deep/60 truncate">
              {count > 0 ? t('home.inboxPanelItems', { count }) : t('home.inboxPanelEmpty')}
            </p>
          </div>
        </div>
        <Button size="sm" variant={count > 0 ? 'default' : 'outline'} asChild className="shrink-0">
          <Link to="/inbox">
            {t('home.inboxPanelOpen')}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>

      {count > 0 ? (
        <ul className="space-y-1">
          {preview.map((item) => {
            const Icon = journeyIcon(item.type);
            const meta = [
              item.start_datetime ? fmt.formatDate(item.start_datetime) : '',
              item.source_sender,
            ].filter(Boolean).join(' · ');
            return (
              <li key={item.id}>
                <Link
                  to="/inbox"
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-cream-pale transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-foreground/5 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-ink-deep/70" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-deep truncate">
                      {item.title || t('common.untitled')}
                    </span>
                    {meta && <span className="block text-xs text-ink-deep/55 truncate">{meta}</span>}
                  </span>
                  {(item.missing || []).length > 0 && (
                    <span className="flex items-center gap-1 text-[0.6875rem] font-semibold text-terra-deep shrink-0">
                      <AlertCircle className="w-3 h-3" />
                      {t('home.inboxPanelNeedsDetails')}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {remaining > 0 && (
            <li>
              <Link
                to="/inbox"
                className="block px-2.5 pt-1 text-xs font-semibold text-terra-deep underline-offset-4 hover:underline"
              >
                {t('home.inboxPanelMore', { count: remaining })}
              </Link>
            </li>
          )}
        </ul>
      ) : (
        <p className="text-sm text-ink-deep/65">
          {t('home.inboxPanelEmptyBody')}{' '}
          {!hasMailbox && (
            <Link to="/account" className="font-semibold text-terra-deep underline-offset-4 hover:underline">
              {t('home.inboxPanelConnect')}
            </Link>
          )}
        </p>
      )}

      {hasMailbox && (
        <div className="tt-divider pt-3">
          <InboxSyncBar connections={connections} onSynced={onSynced} embedded />
        </div>
      )}
    </div>
  );
}