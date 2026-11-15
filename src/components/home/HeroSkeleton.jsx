import React from 'react';
import Skeleton from '@/components/tt/Skeleton';

// Instant placeholder for the NEXT module while Home's first payload is in
// flight. Same surface and rhythm as the real card, so the page never flashes
// the marketing headline and then swaps it for a trip.
export default function HeroSkeleton() {
  return (
    <div className="tt-card-hairline p-3.5 sm:p-4">
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <Skeleton className="h-3 w-16" tone="cream" />
        <Skeleton className="h-3 w-12" tone="cream" />
        <Skeleton className="h-3 w-20" tone="cream" />
      </div>
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" tone="cream" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" tone="cream" />
          <Skeleton className="h-3 w-1/2" tone="cream" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-ink-charcoal/10 space-y-2">
        <Skeleton className="h-3 w-11/12" tone="cream" />
        <Skeleton className="h-3 w-2/3" tone="cream" />
      </div>
    </div>
  );
}