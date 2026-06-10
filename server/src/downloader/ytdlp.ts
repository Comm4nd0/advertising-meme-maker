import { execFile } from 'child_process';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpegStatic from 'ffmpeg-static';
import { log } from '../util/log';

const BIN_DIR = path.resolve(__dirname, '../../../bin');
const isWin = os.platform() === 'win32';
const BIN_NAME = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);

/** Re-download yt-dlp if binary is older than 3 days */
const MAX_BINARY_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** Optional cookies.txt file — drop it here to use manual cookie auth */
const COOKIES_FILE = path.resolve(__dirname, '../../../brand/cookies.txt');

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

/** Release asset name per platform — also the key in the checksum manifest. */
const ASSET_NAMES: Record<string, string> = {
  win32: 'yt-dlp.exe',
  darwin: 'yt-dlp_macos',
  linux: 'yt-dlp',
};

/**
 * Build an ordered list of cookie sources to try for authenticated downloads.
 *
 * On Windows, Chrome locks the cookie database of active profiles, and Edge
 * has DPAPI issues — so we try multiple strategies:
 *   1. cookies.txt file (manual export — always works)
 *   2. Unlocked Chrome profiles (may have cookies if user has multiple profiles)
 *   3. Firefox (reliable, but user might not have logged in there)
 *   4. Chrome without a profile (yt-dlp picks the active one — fails if Chrome is running)
 *
 * Each entry is a yt-dlp `--cookies-from-browser` value, or 'cookies-file'.
 */
function getCookieStrategies(): string[] {
  const strategies: string[] = [];

  // 1. Manual cookies.txt always wins
  if (fs.existsSync(COOKIES_FILE)) {
    strategies.push('cookies-file');
  }

  if (isWin) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const appData = process.env.APPDATA || '';

    // 2. Try each unlocked Chrome profile (the user might be logged in on one)
    const chromeDir = path.join(localAppData, 'Google', 'Chrome', 'User Data');
    if (localAppData && fs.existsSync(chromeDir)) {
      try {
        const entries = fs.readdirSync(chromeDir);
        // Check "Default" first, then "Profile N" entries
        const profileNames = entries.filter(
          (name) => name === 'Default' || /^Profile \d+$/i.test(name),
        );
        for (const profile of profileNames) {
          const cookiesPath = path.join(chromeDir, profile, 'Network', 'Cookies');
          if (!fs.existsSync(cookiesPath)) continue;
          // Test if the file is unlocked
          try {
            const fd = fs.openSync(cookiesPath, 'r');
            fs.closeSync(fd);
            strategies.push(`chrome:${profile}`);
            log.debug(`Chrome profile "${profile}" is unlocked`);
          } catch {
            log.debug(`Chrome profile "${profile}" is LOCKED (active)`);
          }
        }
      } catch { /* ignore */ }

      // Also try plain "chrome" last — works if Chrome is fully closed
      strategies.push('chrome');
    }

    // 3. Firefox
    const firefoxPath = path.join(appData, 'Mozilla', 'Firefox', 'Profiles');
    if (appData && fs.existsSync(firefoxPath)) {
      strategies.push('firefox');
    }
  } else if (os.platform() === 'darwin') {
    const home = os.homedir();
    if (fs.existsSync(path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'))) {
      strategies.push('chrome');
    }
    if (fs.existsSync(path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles'))) {
      strategies.push('firefox');
    }
  } else {
    const home = os.homedir();
    if (fs.existsSync(path.join(home, '.config', 'google-chrome'))) strategies.push('chrome');
    if (fs.existsSync(path.join(home, '.config', 'chromium'))) strategies.push('chromium');
    if (fs.existsSync(path.join(home, '.mozilla', 'firefox'))) strategies.push('firefox');
  }

  return strategies;
}

/** Check if a URL looks like it needs authentication (social media feed posts). */
function urlNeedsAuth(url: string): boolean {
  const u = url.toLowerCase();
  return /instagram\.com|tiktok\.com/.test(u);
}

/**
 * Check if a yt-dlp error looks like an Instagram/TikTok auth or API issue
 * that might be fixed by updating yt-dlp or refreshing cookies.
 */
function isRetryableAuthError(errMsg: string, url: string): boolean {
  if (!/instagram|tiktok/i.test(url)) return false;
  const lower = errMsg.toLowerCase();
  return (
    lower.includes('login') ||
    lower.includes('login_required') ||
    lower.includes('private') ||
    lower.includes('empty media') ||
    lower.includes('crf token') ||
    lower.includes('csrf') ||
    lower.includes('not a video') ||
    lower.includes('requires authentication') ||
    lower.includes('cookie') ||
    lower.includes('permission') ||
    lower.includes('dpapi') ||
    lower.includes('401') ||
    lower.includes('403')
  );
}

/**
 * Turn raw yt-dlp stderr into a friendlier message for common failures.
 */
function friendlyError(raw: string, _browser: string | null, url: string): string {
  const lower = raw.toLowerCase();

  // Instagram / TikTok auth issues
  if (
    lower.includes('login') ||
    lower.includes('login_required') ||
    lower.includes('private') ||
    lower.includes('empty media') ||
    lower.includes('crf token') ||
    lower.includes('csrf') ||
    lower.includes('not a video') ||
    lower.includes('requires authentication') ||
    lower.includes('permission') ||
    lower.includes('dpapi') ||
    lower.includes('could not copy')
  ) {
    const platform = /instagram/i.test(url) ? 'Instagram' : /tiktok/i.test(url) ? 'TikTok' : 'this platform';

    return (
      `${platform} requires login, but Chrome locks its cookies while running.\n\n` +
      `Quickest fix: close ALL Chrome windows, then paste the link again.\n` +
      `(Chrome restores all your tabs when you reopen it.)\n\n` +
      `One-time alternative: install the "Get cookies.txt LOCALLY" extension in Chrome, ` +
      `visit ${platform} while logged in, export cookies, and save the file as:\n` +
      `brand\\cookies.txt (in the project folder)\n` +
      `This works permanently — no need to close Chrome.\n\n` +
      `Or: save the video from the ${platform} app and upload it directly.`
    );
  }

  // Unsupported URL
  if (lower.includes('unsupported url') || lower.includes('no suitable') || lower.includes('is not a valid url')) {
    return `This URL is not supported. Supported platforms: YouTube, Instagram, TikTok, Twitter/X, Facebook, Reddit, and many more.\n\nMake sure you're pasting the full URL to a specific post or video.`;
  }

  // Video unavailable
  if (lower.includes('video unavailable') || lower.includes('this video is not available') || lower.includes('been removed')) {
    return `The video is unavailable — it may have been removed or is geo-restricted.`;
  }

  // Generic — return trimmed raw output (last 8 lines)
  const lines = raw.trim().split('\n');
  return lines.slice(-8).join('\n');
}

/** Find yt-dlp in system PATH. */
function findInPath(): string | null {
  const cmd = isWin ? 'where' : 'which';
  try {
    const { execFileSync } = require('child_process');
    const result = execFileSync(cmd, ['yt-dlp'], { encoding: 'utf8', timeout: 5000 });
    const firstLine = result.trim().split('\n')[0];
    if (firstLine && fs.existsSync(firstLine.trim())) return firstLine.trim();
  } catch {
    // not in PATH
  }
  return null;
}

/** Follow redirects and download a file. */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'advertising-meme-maker/1.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    };
    get(url);
  });
}

/** Fetch a small text file (the checksum manifest), following redirects. */
function downloadText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const get = (u: string) => {
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'advertising-meme-maker/1.0' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      }).on('error', reject);
    };
    get(url);
  });
}

/**
 * Verify a downloaded binary against the release's SHA2-256SUMS manifest.
 * The binary is executed with the server's privileges, so a corrupted or
 * tampered download must never reach disk under the executable name.
 */
async function verifyChecksum(filePath: string, assetName: string): Promise<void> {
  const manifest = await downloadText(`${RELEASE_BASE}/SHA2-256SUMS`);
  let expected: string | null = null;
  for (const line of manifest.split(/\r?\n/)) {
    const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(\S+)$/i);
    if (m && m[2] === assetName) {
      expected = m[1].toLowerCase();
      break;
    }
  }
  if (!expected) {
    throw new Error(`Checksum manifest has no entry for ${assetName}`);
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `yt-dlp checksum mismatch (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…). ` +
      `A release may have just been published — try again in a minute.`,
    );
  }
}

/** Download the latest yt-dlp binary from GitHub and verify its checksum. */
async function downloadBinary(): Promise<string> {
  const platform = os.platform();
  const assetName = ASSET_NAMES[platform];
  if (!assetName) {
    throw new Error(
      `yt-dlp auto-download is not supported on ${platform}. ` +
      `Install yt-dlp manually: https://github.com/yt-dlp/yt-dlp#installation`
    );
  }

  log.info(`Downloading latest yt-dlp for ${platform}...`);
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // Download to a staging path; only promote to the executable name after the
  // checksum verifies.
  const stagingPath = BIN_PATH + '.download';
  try {
    await downloadFile(`${RELEASE_BASE}/${assetName}`, stagingPath);
    await verifyChecksum(stagingPath, assetName);
  } catch (err) {
    if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
    throw err;
  }

  if (fs.existsSync(BIN_PATH)) {
    fs.unlinkSync(BIN_PATH);
  }
  fs.renameSync(stagingPath, BIN_PATH);

  if (!isWin) {
    fs.chmodSync(BIN_PATH, 0o755);
  }

  log.info(`yt-dlp downloaded and verified at ${BIN_PATH}`);
  return BIN_PATH;
}

/**
 * Ensure yt-dlp is available and reasonably up-to-date.
 * Auto-downloads if missing, re-downloads if older than MAX_BINARY_AGE_MS.
 */
export async function ensureYtDlp(): Promise<string> {
  // Check our local binary
  if (fs.existsSync(BIN_PATH)) {
    const stat = fs.statSync(BIN_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < MAX_BINARY_AGE_MS) {
      log.debug(`yt-dlp binary is ${Math.round(ageMs / 3600000)}h old — OK`);
      return BIN_PATH;
    }
    log.info(`yt-dlp binary is ${Math.round(ageMs / 86400000)}d old — updating`);
    return downloadBinary();
  }

  // Check system PATH
  const systemBin = findInPath();
  if (systemBin) {
    log.info(`Using system yt-dlp at ${systemBin}`);
    return systemBin;
  }

  // Download fresh
  return downloadBinary();
}

/**
 * Force re-download latest yt-dlp. Used when a download fails with
 * an error that might be fixed by a newer extractor version.
 */
export async function updateYtDlp(): Promise<string> {
  log.info(`Force-updating yt-dlp to latest version...`);
  return downloadBinary();
}

export interface DownloadResult {
  filePath: string;
  filename: string;
}

export { getCookieStrategies };

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  uploader?: string;
  duration?: number;
}

/**
 * Use yt-dlp --flat-playlist to list videos from a listing URL
 * (e.g. YouTube trending, Instagram hashtag page) without downloading them.
 */
export async function listPlaylist(
  url: string,
  ytdlpPath: string,
  limit = 25,
  cookieStrategy: string | null = null,
): Promise<PlaylistEntry[]> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];
    if (cookieStrategy === 'cookies-file') {
      args.push('--cookies', COOKIES_FILE);
    } else if (cookieStrategy) {
      args.push('--cookies-from-browser', cookieStrategy);
    }
    args.push(
      '--flat-playlist',
      '--dump-json',
      '--playlist-end', String(limit),
      '--no-warnings',
      '--ignore-errors',
      url,
    );

    execFile(
      ytdlpPath,
      args,
      { maxBuffer: 20 * 1024 * 1024, timeout: 60_000 },
      (err, stdout, stderr) => {
        // yt-dlp may exit non-zero if some entries fail but still return valid lines
        const lines = (stdout || '').split('\n').filter((l) => l.trim());
        const entries: PlaylistEntry[] = [];
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const entryUrl = obj.url || obj.webpage_url || obj.original_url || '';
            entries.push({
              id: String(obj.id || entries.length),
              title: obj.title || obj.description || obj.id || 'Untitled',
              url: entryUrl,
              thumbnail:
                obj.thumbnail ||
                (Array.isArray(obj.thumbnails) && obj.thumbnails.length > 0
                  ? obj.thumbnails[obj.thumbnails.length - 1].url
                  : undefined),
              uploader: obj.uploader || obj.channel || obj.uploader_id,
              duration: typeof obj.duration === 'number' ? obj.duration : undefined,
            });
          } catch {
            /* skip malformed */
          }
        }

        if (entries.length === 0 && err) {
          return reject(new Error((stderr || err.message).slice(-500)));
        }
        resolve(entries);
      },
    );
  });
}

/**
 * Build the yt-dlp argument list for a given cookie strategy.
 */
function buildArgs(
  url: string,
  outputTemplate: string,
  cookieStrategy: string | null,
): string[] {
  const args: string[] = [];

  if (cookieStrategy === 'cookies-file') {
    args.push('--cookies', COOKIES_FILE);
  } else if (cookieStrategy) {
    args.push('--cookies-from-browser', cookieStrategy);
  }

  // Tell yt-dlp where our bundled ffmpeg is so it can merge video+audio streams
  if (ffmpegStatic) {
    args.push('--ffmpeg-location', path.dirname(ffmpegStatic as unknown as string));
  }

  args.push(
    '--no-playlist',
    '--no-overwrites',
    '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--output', outputTemplate,
    '--no-part',
    '--newline',
    url,
  );

  return args;
}

/**
 * Run yt-dlp once and return the downloaded file path.
 */
function runYtDlp(
  ytdlpPath: string,
  args: string[],
  outputDir: string,
  onProgress?: (line: string) => void,
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    log.debug(`Running: ${ytdlpPath} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

    const proc = execFile(ytdlpPath, args, {
      timeout: 5 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, _stdout, stderr) => {
      if (err) {
        const raw = stderr || err.message;
        log.warn(`yt-dlp failed:\n${raw}`);
        return reject(new Error(raw));
      }

      // Find the downloaded file
      if (!fs.existsSync(outputDir)) {
        return reject(new Error('Download directory missing after yt-dlp'));
      }
      const files = fs.readdirSync(outputDir).filter(f => f.startsWith('input.'));
      if (files.length === 0) {
        const raw = stderr || 'No output file produced';
        log.warn(`yt-dlp produced no output:\n${raw}`);
        return reject(new Error(raw));
      }

      const filename = files[0];
      resolve({
        filePath: path.join(outputDir, filename),
        filename,
      });
    });

    // Stream progress lines
    if (proc.stderr && onProgress) {
      proc.stderr.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) onProgress(line);
      });
    }
    if (proc.stdout && onProgress) {
      proc.stdout.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) onProgress(line);
      });
    }
  });
}

/**
 * Clean up partial downloads from a previous attempt.
 */
function cleanPartials(outputDir: string) {
  try {
    const partials = fs.readdirSync(outputDir).filter(f => f.startsWith('input.'));
    for (const f of partials) fs.unlinkSync(path.join(outputDir, f));
  } catch { /* ignore */ }
}

/**
 * Download a video from a URL using yt-dlp.
 *
 * For sites that need authentication (Instagram, TikTok), tries multiple
 * cookie strategies in order:
 *   1. brand/cookies.txt (manual export — always works)
 *   2. Unlocked Chrome profiles (profiles not currently in use)
 *   3. Firefox
 *   4. Chrome (active profile — works only if Chrome is closed)
 *
 * If all strategies fail, updates yt-dlp and tries the best strategy again.
 */
export async function downloadVideo(
  url: string,
  outputDir: string,
  ytdlpPath: string,
  onProgress?: (line: string) => void,
): Promise<DownloadResult> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputTemplate = path.join(outputDir, 'input.%(ext)s');

  const needsAuth = urlNeedsAuth(url);

  // For non-auth URLs, just run directly
  if (!needsAuth) {
    const args = buildArgs(url, outputTemplate, null);
    return runYtDlp(ytdlpPath, args, outputDir, onProgress);
  }

  // Try each cookie strategy in order
  const strategies = getCookieStrategies();
  log.debug(`Cookie strategies to try: ${strategies.length > 0 ? strategies.join(', ') : 'none'}`);

  let lastError = '';

  for (const strategy of strategies) {
    cleanPartials(outputDir);
    const label = strategy === 'cookies-file' ? 'cookies.txt' : strategy;
    onProgress?.(`Trying ${label} for authentication...`);
    log.debug(`Attempting download with cookie strategy: ${strategy}`);

    const args = buildArgs(url, outputTemplate, strategy);

    try {
      const result = await runYtDlp(ytdlpPath, args, outputDir, onProgress);
      log.info(`Download succeeded with cookie strategy: ${strategy}`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Cookie strategy "${strategy}" failed: ${msg.split('\n')[0]}`);
      lastError = msg;

      // If it's a lock/DPAPI error, skip to next strategy immediately
      const lower = msg.toLowerCase();
      if (lower.includes('permission') || lower.includes('dpapi') || lower.includes('could not copy')) {
        continue;
      }

      // If we got cookies but the download still failed (empty media, login_required),
      // this strategy has the right browser but no valid session — keep trying others
      if (isRetryableAuthError(msg, url)) {
        continue;
      }

      // Non-auth error (network, unsupported URL, etc.) — don't try other strategies
      throw new Error(friendlyError(msg, strategy, url));
    }
  }

  // All strategies failed — try updating yt-dlp with the best available strategy
  const bestStrategy = strategies.find(s => s === 'cookies-file') ||
    strategies.find(s => s.startsWith('chrome:')) ||
    strategies.find(s => s === 'chrome') ||
    strategies[0] || null;

  if (bestStrategy) {
    cleanPartials(outputDir);
    onProgress?.('All cookie sources failed — updating yt-dlp and retrying...');
    log.info(`Updating yt-dlp and retrying with strategy: ${bestStrategy}`);

    try {
      const freshPath = await updateYtDlp();
      const args = buildArgs(url, outputTemplate, bestStrategy);
      return await runYtDlp(freshPath, args, outputDir, onProgress);
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      throw new Error(friendlyError(retryMsg, bestStrategy, url));
    }
  }

  // No strategies at all
  throw new Error(friendlyError(lastError || 'No cookie source available', null, url));
}
