import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronDown, Users, Lock, Loader2 } from 'lucide-react';
import MemberAvatar from '@/components/tt/MemberAvatar';

// Types that support per-member variation (group-visible details).
const SUPPORTS_GROUP = ['flight', 'car', 'train', 'hotel', 'activity', 'cruise'];

function Disclosure({ icon: Icon, title, subtitle, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tt-card p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 w-full text-left">
        {Icon && <Icon className="w-4 h-4 text-terra-deep shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-ink-deep">{title}</p>
          <p className="text-[0.6875rem] text-ink-deep/50">{subtitle}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-ink-deep/40 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

// Two progressive-disclosure sections: group-visible per-member details
// (stored on JourneyItem.member_info, keyed by user id) and a private
// personal note (stored in the owner-only JourneyNote entity).
export default function SegmentInfoSections({ item, currentMember, members }) {
  const [myInfo, setMyInfo] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [note, setNote] = useState('');
  const [noteId, setNoteId] = useState(null);
  const [savingNote, setSavingNote] = useState(false);

  const memberById = Object.fromEntries((members || []).map((m) => [m.user_id, m]));
  const infoMap = item.member_info || {};
  const showGroup = SUPPORTS_GROUP.includes(item.type);

  useEffect(() => {
    setMyInfo(infoMap[currentMember?.user_id] || '');
  }, [item.id, currentMember?.user_id]);

  const loadNote = useCallback(async () => {
    try {
      const list = await base44.entities.JourneyNote.filter({ journey_item_id: item.id });
      if (list && list[0]) {
        setNote(list[0].content || '');
        setNoteId(list[0].id);
      } else {
        setNote('');
        setNoteId(null);
      }
    } catch { /* ignore */ }
  }, [item.id]);
  useEffect(() => { loadNote(); }, [loadNote]);

  async function saveInfo() {
    if (myInfo === (infoMap[currentMember?.user_id] || '')) return;
    setSavingInfo(true);
    try {
      await base44.functions.invoke('saveMySegmentInfo', { item_id: item.id, text: myInfo });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSavingInfo(false);
    }
  }

  async function saveNote() {
    if (!note.trim() && !noteId) return;
    setSavingNote(true);
    try {
      if (noteId) {
        await base44.entities.JourneyNote.update(noteId, { content: note });
      } else {
        const created = await base44.entities.JourneyNote.create({ journey_item_id: item.id, content: note });
        if (created) setNoteId(created.id);
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSavingNote(false);
    }
  }

  const others = Object.entries(infoMap).filter(([uid, text]) => uid !== currentMember?.user_id && text);

  return (
    <div className="space-y-4">
      {showGroup && (
        <Disclosure icon={Users} title="Group information" subtitle="Details that can vary by member">
          <label className="text-xs text-ink-deep/55">Your details (visible to the group)</label>
          <textarea
            value={myInfo}
            onChange={(e) => setMyInfo(e.target.value)}
            onBlur={saveInfo}
            placeholder="e.g. Seat 12A, confirmation AA123, pickup at Terminal 2"
            rows={2}
            className="mt-1 w-full rounded-xl bg-cream-pale border border-ink-charcoal/20 text-ink-deep text-sm p-3 resize-none"
          />
          <div className="flex items-center justify-end gap-1.5 mt-1">
            {savingInfo && <Loader2 className="w-3 h-3 animate-spin text-ink-deep/40" />}
            <span className="text-[0.625rem] text-ink-deep/40">Saved automatically</span>
          </div>
          {others.length > 0 && (
            <div className="mt-3 pt-3 border-t border-ink-charcoal/10 space-y-2">
              {others.map(([uid, text]) => (
                <div key={uid} className="flex items-start gap-2">
                  <MemberAvatar member={memberById[uid]} size="xs" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-deep">{memberById[uid]?.full_name || 'Member'}</p>
                    <p className="text-xs text-ink-deep/65 break-words">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Disclosure>
      )}

      <Disclosure icon={Lock} title="Personal notes" subtitle="Only visible to you">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          placeholder="Your private notes for this segment"
          rows={3}
          className="w-full rounded-xl bg-cream-pale border border-ink-charcoal/20 text-ink-deep text-sm p-3 resize-none"
        />
        <div className="flex items-center justify-end gap-1.5 mt-1">
          {savingNote && <Loader2 className="w-3 h-3 animate-spin text-ink-deep/40" />}
          <span className="text-[0.625rem] text-ink-deep/40">Saved automatically</span>
        </div>
      </Disclosure>
    </div>
  );
}