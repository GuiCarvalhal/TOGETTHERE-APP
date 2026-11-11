import React, { useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FormSheet from '@/components/tt/FormSheet';
import { useI18n } from '@/lib/i18n';
import { Upload, FileText, Loader2, CheckCircle2, Landmark, Mail } from 'lucide-react';

const MAX_FILE_BYTES = 1024 * 1024;

// Imports a bank/card statement export into a statement-import account.
// The file is read in the browser and sent as text, so nothing is stored; the
// backend parses it and lands every row as a transaction to review (dedupe is
// server-side, so re-importing the same statement adds nothing).
export default function FinancialImportSheet({ open, onOpenChange, connections, onImported, onConnect, onEmailImports }) {
  const { t } = useI18n();
  const fileRef = useRef(null);
  const accounts = useMemo(
    () => (connections || []).filter((c) => c.provider === 'import' && c.status !== 'disconnected'),
    [connections],
  );

  const [connectionId, setConnectionId] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const account = connectionId || accounts[0]?.id || '';

  async function pickFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t('finance.importFileTooLarge'));
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
    } catch {
      setError(t('finance.importFileTooLarge'));
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!account || !text.trim()) {
      setError(t('finance.importEmpty'));
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await base44.functions.invoke('importFinancialStatement', {
        connection_id: account,
        content: text,
      });
      const summary = res.data || res;
      setResult(summary);
      setText('');
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
      if (summary.imported > 0) await onImported?.();
    } catch (err) {
      const reason = err.response?.data?.reason;
      setError(reason === 'no_rows' || reason === 'no_header' || reason === 'unsupported_columns'
        || reason === 'empty' || reason === 'ofx_unreadable' || reason === 'text_unreadable'
        ? t('finance.importNoRows')
        : (err.response?.data?.error || err.message || t('finance.importFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={t('finance.importTitle')}>
      {!accounts.length ? (
        <div className="space-y-4">
          <div className="tt-card-flat p-4 text-center">
            <Landmark className="w-6 h-6 text-ink-deep/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-ink-deep mb-1">{t('finance.importNoAccount')}</p>
            <p className="text-xs text-ink-deep/55 leading-relaxed">{t('finance.importNoAccountBody')}</p>
          </div>
          <Button type="button" className="w-full" onClick={() => { onOpenChange(false); onConnect?.(); }}>
            <Landmark /> {t('finance.importConnectAccount')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-ink-deep/60 leading-relaxed">{t('finance.importIntro')}</p>

          <div className="space-y-2">
            <Label className="text-ink-deep">{t('finance.importAccount')}</Label>
            <Select value={account} onValueChange={setConnectionId}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep">
                <SelectValue placeholder={t('finance.importSelectAccount')} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.institution_name}{c.account_mask ? ` ···· ${c.account_mask}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.ofx,.qfx,text/csv,text/plain,application/x-ofx"
              onChange={pickFile}
              className="hidden"
            />
            <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload /> {t('finance.importPickFile')}
            </Button>
            <p className="text-[11px] text-ink-deep/55 leading-relaxed">
              {fileName ? <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {fileName}</span> : t('finance.importFileHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-ink-deep">{t('finance.importPasteLabel')}</Label>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); }}
              placeholder={t('finance.importPastePlaceholder')}
              rows={5}
              className="w-full min-w-0 rounded-xl bg-cream-pale border border-ink-charcoal/20 text-ink-deep text-xs p-3 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {error && <p className="text-xs text-terra-deep">{error}</p>}

          {result && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-600/25 p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold text-emerald-800">
                  {result.imported
                    ? t('finance.importDone', { imported: result.imported, duplicates: result.duplicates })
                    : t('finance.importNone')}
                </p>
                {(result.warnings || []).includes('assumed_debit') && (
                  <p className="text-[11px] text-emerald-900/70 leading-relaxed">{t('finance.importAssumedDebit')}</p>
                )}
                {result.upgraded > 0 && (
                  <p className="text-[11px] text-emerald-900/70">{t('finance.importUpgraded', { count: result.upgraded })}</p>
                )}
                {result.format === 'ofx' && (
                  <p className="text-[11px] text-emerald-900/70">{t('finance.importFormatOfx')}</p>
                )}
                {result.format === 'text' && (
                  <p className="text-[11px] text-emerald-900/70">{t('finance.importFormatText')}</p>
                )}
                {result.skipped > 0 && (
                  <p className="text-[11px] text-emerald-900/70">{t('finance.importSkipped', { count: result.skipped })}</p>
                )}
              </div>
            </div>
          )}

          <Button type="submit" disabled={busy || !text.trim()} className="w-full">
            {busy ? <Loader2 className="animate-spin" /> : <FileText />}
            {busy ? t('finance.importing') : t('finance.importAction')}
          </Button>

          {onEmailImports && (
            <div className="pt-1 border-t border-ink-charcoal/15 space-y-2">
              <p className="text-[11px] text-ink-deep/60 leading-relaxed pt-3">{t('finance.emailImportsBody')}</p>
              <Button type="button" size="sm" variant="ghost" onClick={onEmailImports}>
                <Mail /> {t('finance.emailImportsAction')}
              </Button>
            </div>
          )}
        </form>
      )}
    </FormSheet>
  );
}