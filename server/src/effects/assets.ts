import path from 'path';

export const BUFFERING_MP4 = path.resolve(__dirname, 'assets/buffering.mp4');

export type EffectType = 'buffering';

export interface SourceEffect {
  type: EffectType;
  /** Seconds per buffering burst. */
  durationSec: number;
  /** Number of buffering bursts evenly distributed across the source. */
  count: number;
}
