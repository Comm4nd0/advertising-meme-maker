import type {
  BrandKit,
  BrandResponse,
  ExportStart,
  ProbeResult,
  ProgressUpdate,
} from '../types';

export async function uploadInput(file: File): Promise<ProbeResult> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  return res.json();
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
}

export async function startExport(args: StartExportArgs): Promise<ExportStart> {
  const fd = new FormData();
  fd.append('jobId', args.jobId);
  fd.append('slideDurations', JSON.stringify(args.slideDurations));
  fd.append('imageDurationSec', String(args.imageDurationSec));
  if (args.music) fd.append('music', args.music);
  if (args.musicVolume !== undefined) fd.append('musicVolume', String(args.musicVolume));
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
