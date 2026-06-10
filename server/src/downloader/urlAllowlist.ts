/**
 * Domains the URL importer will hand to yt-dlp. Anything else is rejected
 * before spawning — yt-dlp will happily fetch arbitrary URLs, which would
 * otherwise expose the server to SSRF (e.g. http://192.168.x.x/admin).
 */
const ALLOWED_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'instagram.com',
  'reddit.com',
  'redd.it',
  'twitter.com',
  'x.com',
  'facebook.com',
  'fb.watch',
  'vimeo.com',
  'streamable.com',
  'imgur.com',
  'dailymotion.com',
];

export function isAllowedSourceUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
}

export function allowedDomainsSummary(): string {
  return ALLOWED_DOMAINS.join(', ');
}
