import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { DialogFooter } from '@/components/ui/dialog';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeSplitAmounts, EXPENSE_CATEGORIES, COMMON_CURRENCIES, formatCurrency } from '@/lib/gatheringHelpers';
import CurrencySelect from '@/components/expenses/CurrencySelect';
import SplitMethodTabs from '@/components/expenses/SplitMethodTabs';
import FamilySplitTable from '@/components/expenses/FamilySplitTable';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { Loader2, Upload } from 'lucide-react';

const PREFS_KEY = (gid) => `tt-exp-prefs-${gid}`;
function readPrefs(gid) { try { return JSON.parse(localStorage.getItem(PREFS_KEY(gid)) || 'null'); } catch { return null; } }
function writePrefs(gid, p) { try { localStorage.setItem(PREFS_KEY(gid), JSON.stringify(p)); } catch {} }

export default function ExpenseForm({ gatheringId, members, currentMember, expense, splits, onClose, onSaved }) {
  const participants = members.filter((m) => m.role === 'owner' || m.role === 'member');
  // Restore the last split method + distribution for this gathering when adding
  // a new expense (not when editing an existing one). Stored prefs never feed
  // into the balance/save math — they only pre-fill the form.
  const prefs = expense ? null : readPrefs(gatheringId);
  const [form, setForm] = useState({
    title: expense?.title || '',
    amount: expense?.amount || '',
    currency: expense?.currency || prefs?.currency || 'USD',
    category: expense?.category || 'other',
    split_method: expense?.split_method || prefs?.split_method || 'equal',
    payer_member_id: expense?.payer_member_id || currentMember?.id || participants[0]?.id || '',
    date: expense?.date || new Date().toISOString().slice(0, 10),
    receipt: expense?.receipt || '',
    settled: expense?.settled || false,
    selected: expense ? splits.map((s) => s.member_id) : (prefs?.selected || participants.map((m) => m.id)),
    inputs: expense ? Object.fromEntries(splits.map((s) => [s.member_id, s.amount])) : (prefs?.inputs || {}),
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const total = Number(form.amount) || 0;
  const splitAmounts = computeSplitAmounts(form.split_method, total, form.selected, form.inputs);
  const sumSplits = Object.values(splitAmounts).reduce((a, b) => a + b, 0);
  const balanced = Math.abs(sumSplits - total) < 0.02;

  function toggleMember(id, force) {
    setForm((f) => {
      const has = f.selected.includes(id);
      const next = force === undefined ? !has : force;
      return {
        ...f,
        selected: next ? (has ? f.selected : [...f.selected, id]) : f.selected.filter((x) => x !== id),
      };
    });
  }
  function setInput(id, val) {
    setForm((f) => ({ ...f, inputs: { ...f.inputs, [id]: val } }));
  }

  async function uploadReceipt(file) {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setForm((f) => ({ ...f, receipt: file_url }));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.amount || !form.payer_member_id) return;
    if (!balanced && form.split_method === 'custom') {
      alert('Custom split amounts must add up to the total.');
      return;
    }
    setSaving(true);
    try {
      const expensePayload = {
        payer_member_id: form.payer_member_id,
        title: form.title.trim(),
        amount: Number(form.amount),
        currency: form.currency,
        split_method: form.split_method,
        category: form.category,
        receipt: form.receipt,
        date: form.date,
        settled: form.settled,
      };
      const splitInputs = form.selected.map((mid) => ({
        member_id: mid,
        amount: Math.round((splitAmounts[mid] || 0) * 100) / 100,
        share: form.split_method === 'by_share' ? Number(form.inputs[mid]) || 0 : 1,
      }));
      if (expense) {
        await base44.functions.invoke('updateExpense', { gathering_id: gatheringId, expense_id: expense.id, expense: expensePayload, splits: splitInputs });
      } else {
        await base44.functions.invoke('createExpense', { gathering_id: gatheringId, expense: expensePayload, splits: splitInputs });
      }
      // Remember the last split method + distribution + currency for next time.
      writePrefs(gatheringId, {
        split_method: form.split_method,
        selected: form.selected,
        inputs: form.inputs,
        currency: form.currency,
      });
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message || 'Could not save expense');
    } finally {
      setSaving(false);
    }
  }

  const currencyOptions = [...new Set([(form.currency || 'USD').toUpperCase(), ...COMMON_CURRENCIES])];

  return (
    <FormSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={expense ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label className="text-ink-deep">Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Dinner at Da Adolfo" required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-ink-deep">Amount</Label>
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="120.00" required className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Currency</Label>
            <CurrencySelect value={(form.currency || 'USD').toUpperCase()} onChange={(v) => setForm({ ...form, currency: v })} options={currencyOptions} triggerClass="w-full h-10" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-ink-deep">Paid by</Label>
            <Select value={form.payer_member_id} onValueChange={(v) => setForm({ ...form, payer_member_id: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {participants.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name || 'Member'}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">Split method</Label>
          <SplitMethodTabs value={form.split_method} onChange={(v) => setForm({ ...form, split_method: v })} />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">Split between</Label>
          <FamilySplitTable
            participants={participants}
            selected={form.selected}
            inputs={form.inputs}
            splitMethod={form.split_method}
            splitAmounts={splitAmounts}
            currency={form.currency}
            onToggleMember={toggleMember}
            onSetInput={setInput}
          />
          <p className={`text-xs ${balanced ? 'text-ink-deep/50' : 'text-terra-deep'}`}>
            {balanced ? `Splits sum to ${formatCurrency(total, form.currency)}` : `Splits sum to ${formatCurrency(sumSplits, form.currency)} — adjust to match ${formatCurrency(total, form.currency)}`}
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-ink-deep">Receipt</Label>
          <div className="flex flex-wrap items-center gap-2">
            {form.receipt && <AttachmentChip url={form.receipt} onRemove={() => setForm((f) => ({ ...f, receipt: '' }))} />}
            <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg border border-dashed border-ink-charcoal/30 text-xs text-ink-deep/70 cursor-pointer hover:bg-cream-pale">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {form.receipt ? 'Replace' : 'Upload'}
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])} />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-cream-pale p-3 border border-ink-charcoal/15">
          <div>
            <Label className="text-ink-deep">Mark as settled</Label>
            <p className="text-xs text-ink-deep/50">Toggle when this cost has been paid back.</p>
          </div>
          <Switch checked={form.settled} onCheckedChange={(v) => setForm({ ...form, settled: v })} />
        </div>
        <DialogFooter className="pt-2 gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="text-ink-deep/60 hover:text-ink-deep">Cancel</Button>
          <Button type="submit" disabled={saving} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {expense ? 'Save changes' : 'Add expense'}
          </Button>
        </DialogFooter>
      </form>
    </FormSheet>
  );
}