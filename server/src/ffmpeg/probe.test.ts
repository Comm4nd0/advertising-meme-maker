import { describe, it, expect } from 'vitest';
import { resolveRotation, orientedDims } from './probe';

describe('resolveRotation', () => {
  it('normalizes a numeric side_data rotation into [0, 360)', () => {
    expect(resolveRotation(90, undefined)).toBe(90);
    expect(resolveRotation(0, undefined)).toBe(0);
    expect(resolveRotation(-90, undefined)).toBe(270);
    expect(resolveRotation(450, undefined)).toBe(90);
  });

  it('prefers the numeric side_data rotation over the tag', () => {
    expect(resolveRotation(90, '180')).toBe(90);
  });

  it('falls back to the tags.rotate string when side_data is absent', () => {
    expect(resolveRotation(undefined, '90')).toBe(90);
  });

  it('treats an unparseable tag as no rotation', () => {
    expect(resolveRotation(undefined, 'abc')).toBe(0);
  });

  it('returns 0 when neither source is present', () => {
    expect(resolveRotation(undefined, undefined)).toBe(0);
  });

  it('ignores a non-numeric side_data value', () => {
    expect(resolveRotation('90', undefined)).toBe(0);
  });
});

describe('orientedDims', () => {
  it('leaves dims unchanged for upright video', () => {
    expect(orientedDims(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(orientedDims(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
  });

  it('swaps width and height for portrait rotations', () => {
    expect(orientedDims(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(orientedDims(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
  });
});
