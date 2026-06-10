import type {
  BrandKit,
  BrandResponse,
  ExportStart,
  ProbeResult,
  ProgressUpdate,
  WatermarkPosition,
} from '../types';

export async function uploadInput(file: File): Promise<ProbeResult> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  return res.json();
}

export interface UrlDownloadUpdate {
  status: 'preparing' | 'downloading' | 'probing' | 'done' | 'error';
  message?: string;
  error?: string;
  // Present when status === 'done' (same shape as ProbeResult)
  jobId?: string;
  filename?: string;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
  durationSec?: number;
  rotation?: number;
  isImage?: boolean;
}

/**
 * Download a video from a social media URL (Instagram, TikTok, YouTube, etc.)
 * Two-step: POST starts the download → EventSource (GET) streams progress.
 */
export function uploadFromUrl(
  url: string,
  onProgress?: (update: UrlDownloadUpdate) => void,
): Promise<ProbeResult> {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: kick off the download, get a downloadId
      const startRes = await fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!startRes.ok) {
        const t = await startRes.text();
        throw new Error(`URL download failed: ${t}`);
      }
      const { downloadId } = (await startRes.json()) as { downloadId: string };

      // Step 2: stream progress via EventSource (GET)
      const es = new EventSource(`/api/upload/url/${downloadId}/progress`);

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as UrlDownloadUpdate;
          onProgress?.(data);

          if (data.status === 'done') {
            es.close();
            resolve({
              jobId: data.jobId!,
              filename: data.filename!,
              width: data.width!,
              height: data.height!,
              fps: data.fps!,
              hasAudio: data.hasAudio!,
              durationSec: data.durationSec!,
              rotation: data.rotation!,
              isImage: data.isImage!,
            });
          } else if (data.status === 'error') {
            es.close();
            reject(new Error(data.error || 'Download failed'));
          }
        } catch {
          // ignore malformed
        }
      };

      es.onerror = () => {
        es.close();
        reject(new Error('Lost connection to download progress'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function getBrand(): Promise<BrandResponse> {
  const res = await fetch('/api/brand');
  if (!res.ok) throw new Error(`Brand fetch failed: ${await res.text()}`);
  return res.json();
}

export async function putBrand(
  colors: BrandKit,
  logoFile?: File | null
): Promise<BrandResponse> {
  const fd = new FormData();
  fd.append('colors', JSON.stringify(colors));
  if (logoFile) fd.append('logo', logoFile);
  const res = await fetch('/api/brand', { method: 'PUT', body: fd });
  if (!res.ok) throw new Error(`Brand save failed: ${await res.text()}`);
  return res.json();
}

export async function setActiveLogo(filename: string): Promise<BrandResponse> {
  const res = await fetch('/api/brand/logo/active', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) throw new Error(`Set active logo failed: ${await res.text()}`);
  return res.json();
}

export async function deleteLogoFromLibrary(filename: string): Promise<BrandResponse> {
  const res = await fetch(`/api/brand/logo/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete logo failed: ${await res.text()}`);
  return res.json();
}

export async function uploadMusic(file: File): Promise<{ filename: string; music: string[] }> {
  const fd = new FormData();
  fd.append('music', file);
  const res = await fetch('/api/brand/music', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Music upload failed: ${await res.text()}`);
  return res.json();
}

export type MemeCategory =
  | 'cctv'
  | 'public-freakout'
  | 'fail'
  | 'generic-funny'
  | 'wholesome';

// NOTE: keep in sync with MemeCandidate in server/src/discover/reddit.ts —
// the client and server are separate packages, so the shape is duplicated.
export interface MemeCandidate {
  source: string;
  category: MemeCategory;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  upvotes: number;
  postedAt: string;
  durationSec: number | null;
  // 1–10 AI score for brand fit; absent when scoring is unavailable.
  brandFit?: number;
}

export interface DiscoverResponse {
  candidates: MemeCandidate[];
  taglineConfigured: boolean;
  categories: Record<MemeCategory, string>;
}

export async function discoverMemes(category?: MemeCategory): Promise<DiscoverResponse> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`/api/discover${qs}`);
  if (!res.ok) throw new Error(`Discover failed: ${await res.text()}`);
  return res.json();
}

export interface Tagline {
  hooks: string[];
  headline: string;
  subhead: string;
  caption: string;
  firstComment: string;
}

export async function generateTagline(
  title: string,
  category: MemeCategory,
): Promise<Tagline> {
  const res = await fetch('/api/discover/tagline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, category }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteMusicFromLibrary(filename: string): Promise<{ music: string[] }> {
  const res = await fetch(`/api/brand/music/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete music failed: ${await res.text()}`);
  return res.json();
}

export interface StartExportArgs {
  jobId: string;
  slideBlobs: Blob[];
  slideDurations: number[];
  imageDurationSec: number;
  music?: string;
  musicVolume?: number;
  trimStart?: number;
  trimEnd?: number;
  targetWidth: number;
  targetHeight: number;
  watermarkBlob?: Blob;
  watermarkPosition?: WatermarkPosition;
  hookBlob?: Blob;
  hookDurationSec?: number;
  voiceEnabled?: boolean;
  voiceName?: string;
  slideTexts?: string[];
  effectType?: 'buffering' | '';
  effectDurationSec?: number;
  effectCount?: number;
  // Format tag appended to the output filename (e.g. "9x16") for batch exports.
  variant?: string;
}

export async function startExport(args: StartExportArgs): Promise<ExportStart> {
  const fd = new FormData();
  fd.append('jobId', args.jobId);
  fd.append('slideDurations', JSON.stringify(args.slideDurations));
  fd.append('imageDurationSec', String(args.imageDurationSec));
  fd.append('targetWidth', String(args.targetWidth));
  fd.append('targetHeight', String(args.targetHeight));
  if (args.variant) fd.append('variant', args.variant);
  if (args.music) fd.append('music', args.music);
  if (args.musicVolume !== undefined) fd.append('musicVolume', String(args.musicVolume));
  if (args.trimStart !== undefined) fd.append('trimStart', String(args.trimStart));
  if (args.trimEnd !== undefined) fd.append('trimEnd', String(args.trimEnd));
  if (args.watermarkBlob && args.watermarkPosition) {
    fd.append('watermark', args.watermarkBlob, 'watermark.png');
    fd.append('watermarkPosition', args.watermarkPosition);
  }
  if (args.hookBlob && args.hookDurationSec && args.hookDurationSec > 0) {
    fd.append('hook', args.hookBlob, 'hook.png');
    fd.append('hookDurationSec', String(args.hookDurationSec));
  }
  if (args.voiceEnabled && args.voiceName && args.slideTexts) {
    fd.append('voiceEnabled', '1');
    fd.append('voiceName', args.voiceName);
    fd.append('slideTexts', JSON.stringify(args.slideTexts));
  }
  if (args.effectType && args.effectDurationSec && args.effectDurationSec > 0) {
    fd.append('effectType', args.effectType);
    fd.append('effectDurationSec', String(args.effectDurationSec));
    if (args.effectCount && args.effectCount > 0) {
      fd.append('effectCount', String(args.effectCount));
    }
  }
  for (let i = 0; i < args.slideBlobs.length; i++) {
    fd.append('slides', args.slideBlobs[i], `slide-${i}.png`);
  }
  const res = await fetch('/api/export', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Export start failed: ${await res.text()}`);
  return res.json();
}

export function streamProgress(
  exportId: string,
  onUpdate: (u: ProgressUpdate) => void
): () => void {
  const es = new EventSource(`/api/export/${exportId}/progress`);
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as ProgressUpdate;
      onUpdate(data);
      if (data.status !== 'running') es.close();
    } catch {
      // ignore malformed
    }
  };
  es.onerror = () => es.close();
  return () => es.close();
}
