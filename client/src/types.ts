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

export interface BrandKit {
  primary: string;
  secondary: string;
  gradientAngle: number;
  headlineColor: string;
  subheadColor: string;
  useGradient: boolean;
}

export interface Slide {
  id: string;
  headline: string;
  subhead: string;
  durationSec: number;
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
