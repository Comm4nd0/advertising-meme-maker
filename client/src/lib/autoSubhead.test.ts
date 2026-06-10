import { describe, it, expect } from 'vitest';
import { generateSubhead } from './autoSubhead';

describe('generateSubhead', () => {
  it('falls back to the brand name for empty input', () => {
    expect(generateSubhead('')).toBe('Luma Tech Solutions');
    expect(generateSubhead('   ')).toBe('Luma Tech Solutions');
  });

  it('returns a CCTV-flavoured subhead for camera headlines', () => {
    // Every subhead under the CCTV rule mentions the brand, so this holds
    // regardless of which one the randomizer picks.
    const result = generateSubhead('Caught on CCTV camera footage');
    expect(result).toContain('Luma Tech');
  });

  it('always returns a non-empty string, even for unmatched input', () => {
    const result = generateSubhead('zxqw vmpl');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
