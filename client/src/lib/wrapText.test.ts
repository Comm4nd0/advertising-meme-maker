import { describe, it, expect } from 'vitest';
import { wrapText } from './wrapText';

// A deterministic measure where each character is exactly 1 unit wide, so
// `maxWidth` reads as "characters per line".
const measure = (s: string) => s.length;

describe('wrapText', () => {
  it('returns no lines for empty or whitespace-only text', () => {
    expect(wrapText(measure, '', 10)).toEqual([]);
    expect(wrapText(measure, '   ', 10)).toEqual([]);
  });

  it('greedily packs words up to maxWidth', () => {
    expect(wrapText(measure, 'aaaa bbbb cccc', 10)).toEqual(['aaaa bbbb', 'cccc']);
  });

  it('keeps a short line on one line', () => {
    expect(wrapText(measure, 'hello world', 100)).toEqual(['hello world']);
  });

  it('hard-breaks a single word wider than maxWidth', () => {
    const lines = wrapText(measure, 'abcdefghij', 5);
    expect(lines).toEqual(['abcde', 'fghij']);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(5);
    expect(lines.join('')).toBe('abcdefghij');
  });

  it('packs following words onto the trailing chunk of a broken word', () => {
    expect(wrapText(measure, 'abcdefghij k', 5)).toEqual(['abcde', 'fghij', 'k']);
  });

  it('never loops forever when maxWidth is smaller than one character', () => {
    // Each char is width 1 but maxWidth is 0 — every char still lands on its
    // own line rather than hanging.
    expect(wrapText(measure, 'abc', 0)).toEqual(['a', 'b', 'c']);
  });
});
