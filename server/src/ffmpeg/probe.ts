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

export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === 'video');
      const a = data.streams.find((s) => s.codec_type === 'audio');
      if (!v) return reject(new Error('No video or image stream found'));

      const rawW = v.width || 0;
      const rawH = v.height || 0;

      let rotation = 0;
      const sideList = (v as { side_data_list?: Array<Record<string, unknown>> }).side_data_list;
      const sideRot = sideList?.find((sd) => 'rotation' in sd)?.rotation;
      if (typeof sideRot === 'number') {
        rotation = ((sideRot % 360) + 360) % 360;
      } else {
        const tagRot = (v.tags as { rotate?: string } | undefined)?.rotate;
        if (tagRot) rotation = parseInt(tagRot, 10) || 0;
      }
      const swap = rotation === 90 || rotation === 270;
      const width = swap ? rawH : rawW;
      const height = swap ? rawW : rawH;

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
