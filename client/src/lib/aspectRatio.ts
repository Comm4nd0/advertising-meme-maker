import type { AspectRatio } from '../types';

const PRESET_DIMS: Record<Exclude<AspectRatio, 'source'>, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};

export const ASPECT_LABELS: Record<AspectRatio, string> = {
  source: 'Match source',
  '9:16': '9:16 — TikTok / Reels / Shorts',
  '1:1': '1:1 — Instagram feed',
  '4:5': '4:5 — Instagram portrait',
  '16:9': '16:9 — YouTube / X',
};

export const ALL_ASPECTS: AspectRatio[] = ['source', '9:16', '1:1', '4:5', '16:9'];

export function targetDims(
  preset: AspectRatio,
  sourceW: number,
  sourceH: number,
): { width: number; height: number } {
  if (preset === 'source') {
    return { width: evenDim(sourceW), height: evenDim(sourceH) };
  }
  return PRESET_DIMS[preset];
}

function evenDim(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}
