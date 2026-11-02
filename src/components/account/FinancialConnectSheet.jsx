import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FormSheet from '@/components/tt/FormSheet';
import { COMMON_CURRENCIES } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import { Landmark, Loader2 } from 'lucide-react';

// Connect an institution/account. Only the last 4 digits are collected — the
// full number is never requested or stored, and no credential is written by this
// flow: `demo` is the stub provider that exercises the whole pipeline until a
// real provider (Plaid/Tink/Belvo) is configured.
export default function FinancialConnectSheet({ open, onOpenChange, onConnected }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ institution_name: '', account_mask: '', account_type: 'checking', currency: 'USD' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await base44.functions.invoke('connectFinancialAccount', {
        provider: 'demo',
        institution_name: form.institution_name.trim(),
        account_mask: form.account_mask.replace(/\D/g, '').slice(-4),
        account_type: form.account_type,
        currency: form.currency,
      });
      setForm({ institution_name: '', account_mask: '', account_type: 'checking', currency: 'USD' });
      onOpenChange(false);
      onConnected();
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('finance.connectFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={t('finance.connectTitle')}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-cream-pale border border-ink-charcoal/15 p-3 flex items-start gap-2">
          <Landmark className="w-4 h-4 text-ink-deep/60 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-deep">{t('finance.providerDemo')}</p>
            <p className="text-[11px] text-ink-deep/60 leading-relaxed mt-0.5">{t('finance.providerDemoHint')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-ink-deep">{t('finance.institution')}</Label>
          <Input
            value={form.institution_name}
            onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
            placeholder={t('finance.institutionPlaceholder')}
            required
            maxLength={80}
            className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-ink-deep">{t('finance.lastFour')}</Label>
            <Input
              value={form.account_mask}
              onChange={(e) => setForm({ ...form, account_mask: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              inputMode="numeric"
              placeholder="4242"
              required
              className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">{t('finance.accountType')}</Label>
            <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">{t('finance.typeChecking')}</SelectItem>
                <SelectItem value="savings">{t('finance.typeSavings')}</SelectItem>
                <SelectItem value="credit">{t('finance.typeCredit')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-ink-deep">{t('finance.currency')}</Label>
          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
            <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMON_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-xs text-terra-deep">{error}</p>}

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? <Loader2 className="animate-spin" /> : <Landmark />}
          {t('finance.connectAction')}
        </Button>
      </form>
    </FormSheet>
  );
}