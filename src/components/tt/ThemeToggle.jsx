import React, { useState } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const OPTIONS = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'system', label: 'System', Icon: Monitor },
];

export default function ThemeToggle({ className = '', onCanvas = true }) {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const active = OPTIONS.find((o) => o.key === mode) || OPTIONS[0];
  const ActiveIcon = active.Icon;
  const tone = onCanvas
    ? 'text-foreground hover:bg-foreground/10'
    : 'text-card-foreground hover:bg-card-foreground/10';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Theme"
          className={`inline-flex items-center gap-1.5 h-11 px-3 rounded-full transition-colors ${tone} ${className}`}
        >
          <ActiveIcon className="w-4 h-4" />
          <span className="hidden sm:inline text-sm font-medium">{active.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => { setMode(o.key); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm hover:bg-accent/10 ${mode === o.key ? 'font-semibold' : ''}`}
          >
            <o.Icon className="w-4 h-4" />
            {o.label}
            {mode === o.key && <Check className="w-4 h-4 ml-auto" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}