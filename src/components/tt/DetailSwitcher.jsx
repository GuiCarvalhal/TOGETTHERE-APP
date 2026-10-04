import React from 'react';
import { LayoutGrid, FileText } from 'lucide-react';
import SegmentedControl from '@/components/tt/SegmentedControl';

// Summary/Details toggle for the Members page — replaces the Mine/Group scope
// switcher. Delegates to the shared SegmentedControl so the pill capsule,
// button dimensions and selected/unselected treatment are identical to
// ScopeSwitcher and the Agent length switcher. Always rendered for every role
// (viewers too) — the toggle controls detail level, not access.
export default function DetailSwitcher({ mode, setMode }) {
  return (
    <SegmentedControl
      ariaLabel="Detail level"
      value={mode}
      onChange={setMode}
      options={[
        { key: 'summary', label: 'Summary', icon: <LayoutGrid /> },
        { key: 'details', label: 'Details', icon: <FileText /> },
      ]}
    />
  );
}