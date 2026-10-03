import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { DialogFooter } from '@/components/ui/dialog';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  computeUnitAmounts, expandUnitAmountsToMembers, reconstructEditSelection,
  buildSplitUnits, legacyViewerAllocationIds, EXPENSE_CATEGORIES, COMMON_CURRENCIES, formatCurrency,
} from '@/lib/gatheringHelpers';
import CurrencySelect from '@/components/expenses/CurrencySelect';
import SplitMethodTabs from '@/components/expenses/SplitMethodTabs';
import FamilySplitTable from '@/components/expenses/FamilySplitTable';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { Loader2, Upload, X, Plus, Check, Trash2, AlertTriangle } from 'lucide-react';

// Per-user split preferences (last split method + selected split units +
// currency) so the next expense form is preselected similarly. Scoped to the
// current user's id — never shared across users on the same browser. Written
// only after a successful save.
const PREFS_KEY = (uid) => `tt-exp-prefs-u:${uid}`;
function readPrefs(uid) {
  if (!uid) return null;
  try { return JSON.parse(localStorage.getItem(PREFS_KEY(uid)) || 'null'); } catch { return null; }
}
function writePrefs(uid, p) {
  if (!uid) return;
  try { localStorage.setItem(PREFS_KEY(uid), JSON.stringify(p)); } catch {}
}

export default function ExpenseForm({ gatheringId, members, currentMember, expense, splits, baseCurrency, onClose, onSaved, onDelete }) {
  const participants = members.filter((m) => m.role === 'owner' || m.role === 'member');
  const isEdit = !!expense;
  const userId = currentMember?.user_id || '';
  const prefs = useMemo(() => (!isEdit && userId ? readPrefs(userId) : null), [isEdit, userId]);

  // Eligibility: the initial payer must be a current participant. A saved
  // payer who is now a Viewer is not eligible, so fall back to the current
  // member (or the first participant) instead of preselecting a viewer — the
  // legacy-viewer guard below blocks the save regardless.
  const eligibleInitialPayer = (mid) => participants.some((m) => m.id === mid);
  const [form, setForm] = useState({
    title: expense?.title || '',
    amount: expense?.amount || '',
    currency: expense?.currency || prefs?.currency || 'USD',
    category: expense?.category || 'other',
    split_method: expense?.split_method || prefs?.split_method || 'equal',
    payer_member_id: (isEdit && expense?.payer_member_id && eligibleInitialPayer(expense.payer_member_id))
      ? expense.payer_member_id
      : (currentMember?.id || participants[0]?.id || ''),
    date: expense?.date || new Date().toISOString().slice(0, 10),
    receipt: expense?.receipt || '',
    settled: expense?.settled || false,
  });

  // Legacy viewer guard: if an existing expense has a split (or payer) for a
  // member who is now a Viewer, block the save and show an actionable warning.
  // The viewer cannot be represented in the participant-only split picker, so
  // saving would silently drop their allocation and redistribute the total.
  // Instead the edit is refused — records stay unchanged until the owner
  // changes the member's role back to Member (or the user cancels).
  const legacy = useMemo(
    () => (isEdit ? legacyViewerAllocationIds(participants, splits, expense?.payer_member_id) : { hasLegacy: false, viewerSplitIds: [], viewerPayerId: null }),
    [isEdit, participants, splits, expense]
  );
  const legacyNames = useMemo(() => {
    if (!legacy.hasLegacy) return [];
    const ids = new Set([...legacy.viewerSplitIds, ...(legacy.viewerPayerId ? [legacy.viewerPayerId] : [])]);
    return (members || []).filter((m) => ids.has(m.id)).map((m) => m.full_name || 'A member');
  }, [legacy, members]);
  const [selected, setSelected] = useState(null); // unit keys; null = pending init
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [families, setFamilies] = useState([]);
  const [familiesLoaded, setFamiliesLoaded] = useState(false);

  const participantUids = participants.map((m) => m.user_id).filter(Boolean).join('|');
  useEffect(() => {
    const uids = participantUids.split('|').filter(Boolean);
    if (!uids.length) { setFamiliesLoaded(true); return; }
    let active = true;
    base44.functions.invoke('getFamiliesForUsers', { user_ids: uids })
      .then((res) => {
        if (!active) return;
        const data = res.data || res;
        setFamilies((data.families || []).map((f) => ({
          id: f.id, name: f.name, owner_user_id: f.owner_user_id, memberUserIds: [...(f.member_user_ids || [])],
        })));
      })
      .catch(() => {})
      .finally(() => { if (active) setFamiliesLoaded(true); });
    return () => { active = false; };
  }, [participantUids]);

  const groupedUnits = useMemo(() => buildSplitUnits(participants, families), [participants, families]);
  const editRecon = useMemo(
    () => (isEdit ? reconstructEditSelection(participants, families, splits, expense?.split_method) : null),
    [isEdit, participants, families, splits, expense]
  );
  const units = isEdit ? (editRecon?.units || groupedUnits) : groupedUnits;

  // Initialize the split selection once family info is available (so family unit
  // keys are known). Runs once — guarded by `selected === null`.
  useEffect(() => {
    if (selected !== null) return;
    if (!familiesLoaded) return;
    if (isEdit && editRecon) {
      setSelected(editRecon.selected);
      setInputs(editRecon.inputs);
    } else {
      const validKeys = new Set(groupedUnits.map((u) => u.key));
      let sel = (prefs?.selected || []).filter((k) => validKeys.has(k));
      if (!sel.length) sel = groupedUnits.map((u) => u.key);
      const inp = {};
      Object.entries(prefs?.inputs || {}).forEach(([k, v]) => { if (validKeys.has(k)) inp[k] = v; });
      setSelected(sel);
      setInputs(inp);
    }
  }, [familiesLoaded, selected, isEdit, editRecon, groupedUnits, prefs]);

  const total = Number(form.amount) || 0;
  const selectedKeys = selected || [];
  const unitAmounts = computeUnitAmounts(form.split_method, total, selectedKeys, inputs);
  const memberAmounts = expandUnitAmountsToMembers(units, unitAmounts);
  const sumSplits = Object.values(memberAmounts).reduce((a, b) => a + b, 0);
  const balanced = Math.abs(sumSplits - total) < 0.02;

  function toggleUnit(key, force) {
    setSelected((cur) => {
      const list = cur || [];
      const has = list.includes(key);
      const next = force === undefined ? !has : force;
      return next ? (has ? list : [...list, key]) : list.filter((x) => x !== key);
    });
  }
  function setUnitInput(key, val) {
    setInputs((cur) => ({ ...cur, [key]: val }));
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
    if (legacy.hasLegacy) return; // blocked — actionable warning shown below
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
        display_currency: baseCurrency || '',
      };
      // Expand selected units to per-member splits (one per member). Family
      // members each receive their equal portion of the family's single unit
      // share, so the existing per-person balance math is unchanged.
      const splitInputs = [];
      selectedKeys.forEach((key) => {
        const u = units.find((x) => x.key === key);
        if (!u) return;
        const share = form.split_method === 'by_share' ? (Number(inputs[key]) || 0) : 1;
        u.members.forEach((m) => {
          splitInputs.push({
            member_id: m.id,
            amount: Math.round((memberAmounts[m.id] || 0) * 100) / 100,
            share,
          });
        });
      });
      if (expense) {
        await base44.functions.invoke('updateExpense', { gathering_id: gatheringId, expense_id: expense.id, expense: expensePayload, splits: splitInputs });
      } else {
        await base44.functions.invoke('createExpense', { gathering_id: gatheringId, expense: expensePayload, splits: splitInputs });
      }
      // Remember the last split method + selected units + currency for the
      // current user, only after a successful save.
      if (!isEdit && userId) {
        writePrefs(userId, {
          split_method: form.split_method,
          selected: selectedKeys,
          inputs,
          currency: form.currency,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err.message || 'Could not save expense');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this expense? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      alert(err.message || 'Could not delete expense');
    } finally {
      setDeleting(false);
    }
  }

  const currencyOptions = [...new Set([(form.currency || 'USD').toUpperCase(), ...COMMON_CURRENCIES])];

  return (
    <FormSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={expense ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={handleSave} className="space-y-4">
        {legacy.hasLegacy && (
          <div className="rounded-xl border border-terra/40 bg-terra/10 p-3.5 space-y-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-terra-deep shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-deep">This expense can't be edited yet</p>
                <p className="text-xs text-ink-deep/70 mt-0.5 leading-relaxed">
                  It includes {legacyNames.join(', ')} as a payer or split member, who is now a Viewer and can't be part of expenses. Ask the owner to change their role back to Member first, or cancel to keep this expense unchanged.
                </p>
              </div>
            </div>
          </div>
        )}
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
          {selected === null ? (
            <div className="space-y-2">
              <div className="tt-skeleton h-10 w-full rounded-lg" />
              <div className="tt-skeleton h-10 w-full rounded-lg" />
            </div>
          ) : (
            <>
              <FamilySplitTable
                units={units}
                selected={selectedKeys}
                inputs={inputs}
                splitMethod={form.split_method}
                unitAmounts={unitAmounts}
                currency={form.currency}
                onToggleUnit={toggleUnit}
                onSetUnitInput={setUnitInput}
              />
              <p className={`text-xs ${balanced ? 'text-ink-deep/50' : 'text-terra-deep'}`}>
                {balanced ? `Splits sum to ${formatCurrency(total, form.currency)}` : `Splits sum to ${formatCurrency(sumSplits, form.currency)} — adjust to match ${formatCurrency(total, form.currency)}`}
              </p>
            </>
          )}
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
          {expense && onDelete && (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting} className="mr-auto">
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}><X /> Cancel</Button>
          <Button type="submit" disabled={saving || legacy.hasLegacy}>
            {saving ? <Loader2 className="animate-spin" /> : expense ? <Check /> : <Plus />}
            {expense ? 'Save changes' : 'Add expense'}
          </Button>
        </DialogFooter>
      </form>
    </FormSheet>
  );
}