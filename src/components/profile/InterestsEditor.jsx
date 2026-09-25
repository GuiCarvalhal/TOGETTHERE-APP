import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

// Free-form tag editor for interests & preferences. Enter or comma adds a tag;
// backspace on an empty input removes the last one. Used on the own-profile form.
export default function InterestsEditor({ value = [], onChange }) {
  const [input, setInput] = useState('');
  const tags = Array.isArray(value) ? value : [];

  function add() {
    const t = input.trim();
    if (!t || tags.includes(t)) { setInput(''); return; }
    onChange([...tags, t]);
    setInput('');
  }
  function remove(t) {
    onChange(tags.filter((x) => x !== t));
  }
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && !input && tags.length) { remove(tags[tags.length - 1]); }
  }

  return (
    <div className="rounded-xl p-2.5 border border-ink-charcoal/15 bg-cream-pale">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-ink-deep/5 text-xs text-ink-deep/80 border border-ink-charcoal/10">
            {t}
            <button type="button" onClick={() => remove(t)} className="w-4 h-4 rounded-full hover:bg-ink-deep/10 flex items-center justify-center"><X className="w-3 h-3" /></button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-ink-deep/40 py-1">e.g. hiking, seafood, museums, vegetarian…</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Add a preference"
          className="flex-1 min-w-0 bg-transparent text-sm text-ink-deep placeholder:text-ink-deep/35 outline-none"
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-terra/10 text-terra-deep text-xs font-semibold hover:bg-terra/20"><Plus className="w-3 h-3" /> Add</button>
      </div>
    </div>
  );
}