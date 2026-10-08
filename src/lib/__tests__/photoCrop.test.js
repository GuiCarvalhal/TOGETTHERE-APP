import { describe, it, expect } from 'vitest';
import { minCoverScale, drawScale, drawnSize, validatePhotoFile } from '@/lib/photoCrop';

const CS = 400; // canvas size

describe('photoCrop — minCoverScale', () => {
  it('landscape image covers square at 0°', () => {
    const s = minCoverScale(800, 600, CS, 0);
    expect(s).toBeCloseTo(400 / 600, 5); // height is the limiting dimension
  });

  it('portrait image covers square at 0°', () => {
    const s = minCoverScale(600, 800, CS, 0);
    expect(s).toBeCloseTo(400 / 600, 5); // width is the limiting dimension
  });

  it('square image covers square exactly', () => {
    expect(minCoverScale(600, 600, CS, 0)).toBeCloseTo(400 / 600, 5);
  });

  it('90° rotation swaps dimensions — same cover scale for square canvas', () => {
    const s0 = minCoverScale(800, 600, CS, 0);
    const s90 = minCoverScale(800, 600, CS, 90);
    const s270 = minCoverScale(800, 600, CS, 270);
    expect(s90).toBeCloseTo(s0, 5);
    expect(s270).toBeCloseTo(s0, 5);
  });

  it('180° rotation keeps dimensions — same as 0°', () => {
    expect(minCoverScale(800, 600, CS, 180)).toBeCloseTo(minCoverScale(800, 600, CS, 0), 5);
  });

  it('handles zero dimensions gracefully', () => {
    expect(minCoverScale(0, 0, CS, 0)).toBe(1);
  });
});

describe('photoCrop — drawScale (no empty borders invariant)', () => {
  it('zoom 1 = minCoverScale exactly', () => {
    const imgW = 800, imgH = 600;
    expect(drawScale(imgW, imgH, CS, 0, 1)).toBeCloseTo(minCoverScale(imgW, imgH, CS, 0), 5);
  });

  it('zoom 2 = 2× minCoverScale', () => {
    const imgW = 800, imgH = 600;
    expect(drawScale(imgW, imgH, CS, 0, 2)).toBeCloseTo(2 * minCoverScale(imgW, imgH, CS, 0), 5);
  });

  it('zoom < 1 is clamped to 1 (never below cover)', () => {
    const s = drawScale(800, 600, CS, 0, 0.3);
    expect(s).toBeCloseTo(minCoverScale(800, 600, CS, 0), 5);
  });

  it('drawn image always covers the canvas at any rotation + zoom >= 1', () => {
    const dims = [
      [800, 600], [600, 800], [1200, 400], [400, 1200], [1000, 1000],
    ];
    const rotations = [0, 90, 180, 270];
    const zooms = [1, 1.5, 2.5, 3];
    for (const [w, h] of dims) {
      for (const r of rotations) {
        for (const z of zooms) {
          const { w: dw, h: dh } = drawnSize(w, h, CS, r, z);
          expect(dw).toBeGreaterThanOrEqual(CS - 0.001);
          expect(dh).toBeGreaterThanOrEqual(CS - 0.001);
        }
      }
    }
  });
});

describe('photoCrop — validatePhotoFile', () => {
  it('valid image file returns null', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validatePhotoFile({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
  });

  it('non-image type returns invalid_type', () => {
    expect(validatePhotoFile({ type: 'application/pdf', size: 1024 })).toBe('invalid_type');
    expect(validatePhotoFile({ type: '', size: 1024 })).toBe('invalid_type');
  });

  it('oversized file returns too_large', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 })).toBe('too_large');
  });

  it('missing file returns no_file', () => {
    expect(validatePhotoFile(null)).toBe('no_file');
    expect(validatePhotoFile(undefined)).toBe('no_file');
  });
});