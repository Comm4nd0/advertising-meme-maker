import ffmpeg from 'fluent-ffmpeg';

export interface ProbeResult {
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  durationSec: number;
  rotation: number;
  isImage: boolean;
}

const IMAGE_CODECS = new Set(['mjpeg', 'png', 'gif', 'webp', 'bmp', 'tiff']);

// Normalize the display rotation from ffprobe. Modern files expose it as a
// numeric `side_data_list` rotation (can be negative, e.g. -90); older ones use
// a `tags.rotate` string. Prefer the numeric form, normalized to [0, 360).
export function resolveRotation(sideRotation: unknown, tagRotate: string | undefined): number {
  if (typeof sideRotation === 'number') return ((sideRotation % 360) + 360) % 360;
  if (tagRotate) return parseInt(tagRotate, 10) || 0;
  return 0;
}

// Swap width/height for portrait-rotated video so the reported dims match what
// the player actually displays.
export function orientedDims(
  rawW: number,
  rawH: number,
  rotation: number,
): { width: number; height: number } {
  const swap = rotation === 90 || rotation === 270;
  return { width: swap ? rawH : rawW, height: swap ? rawW : rawH };
}

export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === 'video');
      const a = data.streams.find((s) => s.codec_type === 'audio');
      if (!v) return reject(new Error('No video or image stream found'));

      const rawW = v.width || 0;
      const rawH = v.height || 0;

      const sideList = (v as { side_data_list?: Array<Record<string, unknown>> }).side_data_list;
      const sideRot = sideList?.find((sd) => 'rotation' in sd)?.rotation;
      const tagRot = (v.tags as { rotate?: string } | undefined)?.rotate;
      const rotation = resolveRotation(sideRot, tagRot);
      const { width, height } = orientedDims(rawW, rawH, rotation);

      let fps = 30;
      if (v.r_frame_rate && v.r_frame_rate.includes('/')) {
        const [n, d] = v.r_frame_rate.split('/').map(Number);
        if (d) fps = n / d;
      }

      const codec = (v.codec_name || '').toLowerCase();
      const formatName = data.format.format_name || '';
      const isImage =
        IMAGE_CODECS.has(codec) ||
        formatName.includes('image2') ||
        formatName.includes('_pipe');

      const durationSec = parseFloat(String(data.format.duration || '0')) || 0;

      resolve({
        width,
        height,
        fps: Math.max(1, Math.round(fps)),
        hasAudio: !!a,
        durationSec: isImage ? 0 : durationSec,
        rotation,
        isImage,
      });
    });
  });
}
