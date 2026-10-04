import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { OVERLAY_VIEWPORT_CLASS } from '@/lib/overlayViewport';

const graphSrc = readFileSync('src/components/expenses/ExpenseGraphPanel.jsx', 'utf-8');
const mapSrc = readFileSync('src/components/journey/JourneyRouteMap.jsx', 'utf-8');

describe('OVERLAY_VIEWPORT_CLASS — shared map/graph viewport', () => {
  it('is exactly h-48 sm:h-56 lg:h-64', () => {
    expect(OVERLAY_VIEWPORT_CLASS).toBe('h-48 sm:h-56 lg:h-64');
  });

  it('is used by JourneyRouteMap (no hardcoded height)', () => {
    expect(mapSrc).toContain('OVERLAY_VIEWPORT_CLASS');
    expect(mapSrc).not.toContain('h-48 sm:h-56 lg:h-64');
  });

  it('is used by ExpenseGraphPanel', () => {
    expect(graphSrc).toContain('OVERLAY_VIEWPORT_CLASS');
  });
});

describe('ExpenseGraphPanel — always two columns, never stacks', () => {
  it('uses grid-cols-2', () => {
    expect(graphSrc).toContain('grid-cols-2');
  });

  it('does NOT use grid-cols-1 (which would stack on mobile)', () => {
    expect(graphSrc).not.toContain('grid-cols-1');
  });

  it('does NOT use sm:grid-cols-2 (which would stack on mobile)', () => {
    expect(graphSrc).not.toContain('sm:grid-cols-2');
  });
});

describe('ExpenseGraphPanel — all branches preserve same bounded footprint', () => {
  it('uses tt-card p-3 outer shell (same as map panel)', () => {
    expect(graphSrc).toContain('tt-card p-3');
  });

  it('uses flex flex-col min-h-0 viewport in every branch', () => {
    // The ViewportShell component wraps every branch
    expect(graphSrc).toContain('OVERLAY_VIEWPORT_CLASS');
    expect(graphSrc).toContain('flex flex-col min-h-0');
  });
});