import { describe, it, expect } from 'vitest';
import { withUtm } from './utm';

describe('withUtm', () => {
  it('appends utm params to a plain URL', () => {
    const out = withUtm('https://lumatech.example/quote', {
      source: 'social',
      medium: 'video',
      campaign: 'abc123',
      content: '9x16',
    });
    const url = new URL(out);
    expect(url.searchParams.get('utm_source')).toBe('social');
    expect(url.searchParams.get('utm_medium')).toBe('video');
    expect(url.searchParams.get('utm_campaign')).toBe('abc123');
    expect(url.searchParams.get('utm_content')).toBe('9x16');
  });

  it('keeps existing query params and never overwrites existing utm params', () => {
    const out = withUtm('https://lumatech.example/?ref=1&utm_source=manual', {
      source: 'social',
      campaign: 'abc',
    });
    const url = new URL(out);
    expect(url.searchParams.get('ref')).toBe('1');
    expect(url.searchParams.get('utm_source')).toBe('manual');
    expect(url.searchParams.get('utm_campaign')).toBe('abc');
  });

  it('defaults a scheme-less URL to https', () => {
    const out = withUtm('lumatech.example/quote', { source: 'social' });
    expect(out.startsWith('https://lumatech.example/quote')).toBe(true);
    expect(out).toContain('utm_source=social');
  });

  it('skips params that are not provided', () => {
    const out = withUtm('https://lumatech.example', { source: 'social' });
    expect(out).toContain('utm_source=social');
    expect(out).not.toContain('utm_medium');
  });

  it('returns empty and unparseable input unchanged', () => {
    expect(withUtm('', { source: 's' })).toBe('');
    expect(withUtm('   ', { source: 's' })).toBe('');
    expect(withUtm('not a url at all', { source: 's' })).toBe('not a url at all');
  });
});
