export interface ProbeResult {
  jobId: string;
  filename: string;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  durationSec: number;
  rotation: number;
  isImage: boolean;
}

export type AspectRatio = 'source' | '9:16' | '1:1' | '4:5' | '16:9';

export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface BrandKit {
  primary: string;
  secondary: string;
  gradientAngle: number;
  headlineColor: string;
  subheadColor: string;
  useGradient: boolean;
  handle: string;
  watermarkEnabled: boolean;
  watermarkPosition: WatermarkPosition;
  // Call-to-action defaults rendered on slides that opt in via Slide.showCta.
  ctaText: string;
  ctaUrl: string;
  offerCode: string;
}

export interface Slide {
  id: string;
  headline: string;
  subhead: string;
  durationSec: number;
  // Render the brand CTA block (button text, offer code, QR) on this slide.
  showCta?: boolean;
}

export interface HookSettings {
  text: string;
  durationSec: number;
}

// AI-suggested post text to paste alongside the exported video.
export interface SocialCopy {
  caption: string;
  firstComment: string;
}

export interface BrandResponse {
  colors: BrandKit;
  logoUrl: string | null;
  logos: string[];
  music: string[];
}

export interface ExportStart {
  exportId: string;
  outputUrl: string;
}

export interface ProgressUpdate {
  status: 'running' | 'done' | 'error' | 'unknown';
  progress: number;
  outputUrl?: string;
  error?: string;
}
