import { describe, it, expect } from 'vitest';
import { targetDims, ALL_ASPECTS, ASPECT_LABELS } from './aspectRatio';

describe('targetDims', () => {
  it('returns source dims unchanged when already even', () => {
    expect(targetDims('source', 1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('rounds odd source dims down to even (h.264 requires even dims)', () => {
    expect(targetDims('source', 1921, 1081)).toEqual({ width: 1920, height: 1080 });
  });

  it('returns the fixed preset dims for each aspect', () => {
    expect(targetDims('9:16', 9999, 1)).toEqual({ width: 1080, height: 1920 });
    expect(targetDims('1:1', 9999, 1)).toEqual({ width: 1080, height: 1080 });
    expect(targetDims('4:5', 9999, 1)).toEqual({ width: 1080, height: 1350 });
    expect(targetDims('16:9', 1, 9999)).toEqual({ width: 1920, height: 1080 });
  });

  it('preset dims are independent of source size', () => {
    expect(targetDims('9:16', 100, 100)).toEqual(targetDims('9:16', 4000, 3000));
  });
});

describe('aspect metadata', () => {
  it('exposes all five aspect options', () => {
    expect(ALL_ASPECTS).toEqual(['source', '9:16', '1:1', '4:5', '16:9']);
  });

  it('has a non-empty label for every aspect', () => {
    for (const a of ALL_ASPECTS) {
      expect(ASPECT_LABELS[a]).toBeTruthy();
    }
  });
});
