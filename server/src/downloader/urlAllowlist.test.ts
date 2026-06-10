import { describe, it, expect } from 'vitest';
import { isAllowedSourceUrl } from './urlAllowlist';

describe('isAllowedSourceUrl', () => {
  it('allows known social platforms including subdomains', () => {
    expect(isAllowedSourceUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isAllowedSourceUrl('https://youtu.be/abc')).toBe(true);
    expect(isAllowedSourceUrl('https://www.reddit.com/r/funny/comments/x/y/')).toBe(true);
    expect(isAllowedSourceUrl('https://v.redd.it/abc123')).toBe(true);
    expect(isAllowedSourceUrl('https://www.tiktok.com/@user/video/1')).toBe(true);
    expect(isAllowedSourceUrl('https://www.instagram.com/reel/abc/')).toBe(true);
    expect(isAllowedSourceUrl('https://x.com/user/status/1')).toBe(true);
  });

  it('rejects unknown domains and lookalikes', () => {
    expect(isAllowedSourceUrl('https://evil.example.com/video')).toBe(false);
    expect(isAllowedSourceUrl('https://notyoutube.com/watch')).toBe(false);
    expect(isAllowedSourceUrl('https://youtube.com.evil.net/watch')).toBe(false);
  });

  it('rejects internal addresses and non-http schemes (SSRF guard)', () => {
    expect(isAllowedSourceUrl('http://192.168.1.1/admin')).toBe(false);
    expect(isAllowedSourceUrl('http://localhost:8081/api/health')).toBe(false);
    expect(isAllowedSourceUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedSourceUrl('ftp://youtube.com/x')).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(isAllowedSourceUrl('')).toBe(false);
    expect(isAllowedSourceUrl('not a url')).toBe(false);
  });
});
