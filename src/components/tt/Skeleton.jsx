import React from 'react';

// On-brand skeleton with a terracotta-tinted shimmer sweep.
// tone="ink"  → dark ink block (for skeletons on the ink canvas / headers)
// tone="cream" → warm cream block (for skeletons inside cream cards)
export function Skeleton({ className = '', tone = 'ink' }) {
  return <div className={`tt-skeleton ${tone === 'cream' ? 'tt-skeleton-cream' : ''} ${className}`} />;
}

export default Skeleton;