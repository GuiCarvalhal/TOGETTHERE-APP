import React from 'react';

// Local reproduction of Lucide's list-chevrons-down-up and list-chevrons-up-down
// icons — not available in the installed lucide-react 0.475.0. Exact SVG paths
// from lucide-static v1.18.0 (ISC), same viewBox/stroke conventions as
// lucide-react so they render identically inside Button's [&_svg]:size-4.
function SvgBase({ className = 'w-4 h-4', children }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Short (collapse): list lines + chevrons pointing down then up.
export function ListChevronsDownUp({ className }) {
  return (
    <SvgBase className={className}>
      <path d="M3 5h8" />
      <path d="M3 12h8" />
      <path d="M3 19h8" />
      <path d="m15 5 3 3 3-3" />
      <path d="m15 19 3-3 3 3" />
    </SvgBase>
  );
}

// Long (expand): list lines + chevrons pointing up then down.
export function ListChevronsUpDown({ className }) {
  return (
    <SvgBase className={className}>
      <path d="M3 5h8" />
      <path d="M3 12h8" />
      <path d="M3 19h8" />
      <path d="m15 8 3-3 3 3" />
      <path d="m15 16 3 3 3-3" />
    </SvgBase>
  );
}