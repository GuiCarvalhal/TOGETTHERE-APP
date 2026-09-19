import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { computeSplitAmounts, EXPENSE_CATEGORIES, formatCurrency } from '@/lib/gatheringHelpers';
import { Loader2, Upload, Paperclip } from 'lucide-react';

export default function ExpenseForm({ gatheringId, members, currentMember, expense, splits, onClose, onSaved }) {
  const participants = members.filter((m) => m.role === 'owner' || m.role === 'member');
  const [form, setForm] = useState({
    title: expense?.title || '',
    amount: expense?.amount || '',
    currency: expense?.currency || 'USD',
    category: expense?.category || 'other',
    split_method: expense?.split_method || 'equal',
    payer_member_id: expense?.payer_member_id || currentMember?.id || participants[0]?.id || '',
    date: expense?.date || new Date().toISOString().slice(0, 10),
    receipt: expense?.receipt || '',
    selected: expense ? splits.map((s) => s.member_id) : participants.map((m) => m.id),
    inputs: expense ? Object.fromEntries(splits.map((s) => [s.member_id, s.amount])) : {},
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const total = Number(form.amount) || 0;
  const splitAmounts = computeSplitAmounts(form.split_method, total, form.selected, form.inputs);
  const sumSplits = Object.values(splitAmounts).reduce((a, b) => a + b, 0);
  const balanced = Math.abs(sumSplits - total) < 0.02;

  function toggleMember(id) {
    setForm((f) => ({
      ...f,
      selected: f.selected.includes(id) ? f.selected.filter((x) => x !== id) : [...f.selected, id],
    }));
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
        settled: expense?.settled || false,
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
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message || 'Could not save expense');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="tt-card rounded-[1.5rem] p-0 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="font-display text-2xl font-bold text-ink-deep">{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="px-6 pb-6 space-y-4">
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
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="bg-cream-pale border-ink-charcoal/20 text-ink-deep" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-ink-deep">Paid by</Label>
              <Select value={form.payer_member_id} onValueChange={(v) => setForm({ ...form, payer_member_id: v })}>
                <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {participants.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || 'Member'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-ink-deep">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Split method</Label>
            <Select value={form.split_method} onValueChange={(v) => setForm({ ...form, split_method: v })}>
              <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equal">Equal</SelectItem>
                <SelectItem value="by_share">By shares</SelectItem>
                <SelectItem value="custom">Custom amounts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Split between</Label>
            <div className="space-y-2 max-h-44 overflow-y-auto rounded-lg bg-cream-pale p-3 border border-ink-charcoal/15">
              {participants.map((m) => {
                const checked = form.selected.includes(m.id);
                return (
                  <div key={m.id} className="flex items-center gap-3 py-1">
                    <Checkbox checked={checked} onCheckedChange={() => toggleMember(m.id)} />
                    <span className="flex-1 text-sm text-ink-deep">{m.full_name || 'Member'}</span>
                    {form.split_method === 'by_share' && checked && (
                      <Input type="number" step="1" min="0" value={form.inputs[m.id] || ''} onChange={(e) => setForm((f) => ({ ...f, inputs: { ...f.inputs, [m.id]: e.target.value } }))} placeholder="1" className="w-20 h-8 bg-cream border-ink-charcoal/20 text-ink-deep" />
                    )}
                    {form.split_method === 'custom' && checked && (
                      <Input type="number" step="0.01" min="0" value={form.inputs[m.id] || ''} onChange={(e) => setForm((f) => ({ ...f, inputs: { ...f.inputs, [m.id]: e.target.value } }))} placeholder="0.00" className="w-24 h-8 bg-cream border-ink-charcoal/20 text-ink-deep" />
                    )}
                    {form.split_method === 'equal' && checked && (
                      <span className="text-sm text-ink-deep/60 w-20 text-right">{formatCurrency(splitAmounts[m.id] || 0, form.currency)}</span>
                    )}
                    {(form.split_method === 'by_share' || form.split_method === 'custom') && checked && (
                      <span className="text-xs text-ink-deep/50 w-20 text-right">{formatCurrency(splitAmounts[m.id] || 0, form.currency)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className={`text-xs ${balanced ? 'text-ink-deep/50' : 'text-terra-deep'}`}>
              {balanced ? `Splits sum to ${formatCurrency(total, form.currency)}` : `Splits sum to ${formatCurrency(sumSplits, form.currency)} — adjust to match ${formatCurrency(total, form.currency)}`}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-ink-deep">Receipt</Label>
            <div className="flex items-center gap-2">
              {form.receipt && (
                <a href={form.receipt} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-pale border border-ink-charcoal/15 text-xs text-ink-deep">
                  <Paperclip className="w-3.5 h-3.5" /> View receipt
                </a>
              )}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-ink-charcoal/30 text-xs text-ink-deep/70 cursor-pointer hover:bg-cream-pale">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {form.receipt ? 'Replace' : 'Upload'}
                <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])} />
              </label>
            </div>
          </div>
          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-ink-deep/60 hover:text-ink-deep">Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-terra hover:bg-terra-deep text-cream rounded-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {expense ? 'Save changes' : 'Add expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}