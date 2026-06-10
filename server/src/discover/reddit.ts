import https from 'https';
import { REDDIT_SOURCES, type MemeCategory } from './sources';

export interface MemeCandidate {
  source: string;
  category: MemeCategory;
  title: string;
  url: string;          // permalink for yt-dlp
  thumbnailUrl: string | null;
  upvotes: number;
  postedAt: string;
  durationSec: number | null;
}

interface RedditChild {
  data: {
    id: string;
    title: string;
    permalink: string;
    url_overridden_by_dest?: string;
    url: string;
    over_18: boolean;
    is_video: boolean;
    is_self: boolean;
    thumbnail: string;
    preview?: {
      images?: Array<{ source?: { url?: string } }>;
    };
    secure_media?: {
      reddit_video?: { fallback_url?: string; duration?: number };
    };
    media?: {
      reddit_video?: { fallback_url?: string; duration?: number };
    };
    ups: number;
    created_utc: number;
    domain: string;
    post_hint?: string;
  };
}

const VIDEO_DOMAINS = /^(v\.redd\.it|youtube\.com|youtu\.be|streamable\.com|gfycat\.com|imgur\.com|i\.imgur\.com)$/i;

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            // Reddit 403s default Node UAs and anything that smells of a bot.
            // A current browser UA on old.reddit.com works reliably.
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
              '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json,text/plain,*/*',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetchJson(res.headers.location).then(resolve, reject);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Reddit HTTP ${res.statusCode} for ${url}`));
            res.resume();
            return;
          }
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          });
        },
      )
      .on('error', reject);
  });
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function looksLikeVideo(child: RedditChild['data']): boolean {
  if (child.is_video) return true;
  if (child.post_hint === 'hosted:video' || child.post_hint === 'rich:video') return true;
  if (child.domain && VIDEO_DOMAINS.test(child.domain)) return true;
  return false;
}

function thumbnailFor(child: RedditChild['data']): string | null {
  const previewUrl = child.preview?.images?.[0]?.source?.url;
  if (previewUrl) return decode(previewUrl);
  if (child.thumbnail && /^https?:/.test(child.thumbnail)) return child.thumbnail;
  return null;
}

interface CacheEntry {
  expiresAt: number;
  data: MemeCandidate[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchSubreddit(
  subreddit: string,
  category: MemeCategory,
  limit: number,
): Promise<MemeCandidate[]> {
  const key = `${subreddit}|${category}|${limit}`;
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.data;

  // old.reddit.com tends to be more permissive than www.reddit.com for
  // unauthenticated JSON access. The data shape is identical.
  const url = `https://old.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=week&limit=${limit}`;
  let body: unknown;
  try {
    body = await fetchJson(url);
  } catch (err) {
    console.warn(`[discover] failed to fetch r/${subreddit}:`, err instanceof Error ? err.message : err);
    return [];
  }

  const children = (body as { data?: { children?: RedditChild[] } })?.data?.children;
  if (!Array.isArray(children)) return [];

  const out: MemeCandidate[] = [];
  for (const c of children) {
    const d = c?.data;
    if (!d) continue;
    if (d.over_18) continue;
    if (d.is_self) continue;
    if (!looksLikeVideo(d)) continue;

    const duration =
      d.secure_media?.reddit_video?.duration ??
      d.media?.reddit_video?.duration ??
      null;

    // Drop extremely long clips — they're rarely meme-suitable
    if (duration !== null && duration > 180) continue;

    out.push({
      source: `reddit:r/${subreddit}`,
      category,
      title: d.title,
      url: `https://www.reddit.com${d.permalink}`,
      thumbnailUrl: thumbnailFor(d),
      upvotes: d.ups || 0,
      postedAt: new Date((d.created_utc || 0) * 1000).toISOString(),
      durationSec: duration,
    });
  }

  cache.set(key, { expiresAt: now + CACHE_TTL_MS, data: out });
  return out;
}

/**
 * Fetch meme candidates across all seeded subreddits. Filter by category if
 * specified. Results are interleaved (round-robin) so the user sees variety
 * at the top of the list, not 25 dashcam clips in a row.
 */
export async function discoverCandidates(
  filterCategory: MemeCategory | null = null,
  perSub = 15,
): Promise<MemeCandidate[]> {
  const sources = filterCategory
    ? REDDIT_SOURCES.filter((s) => s.category === filterCategory)
    : REDDIT_SOURCES;

  const lists = await Promise.all(
    sources.map((s) => fetchSubreddit(s.subreddit, s.category, perSub)),
  );

  // Round-robin interleave
  const out: MemeCandidate[] = [];
  let added = true;
  for (let i = 0; added; i++) {
    added = false;
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
        added = true;
      }
    }
  }
  return out;
}
