import ffmpeg from 'fluent-ffmpeg';
import type { ProbeResult } from './probe';
import { TARGET_FPS, TARGET_SAMPLE_RATE, evenDim } from './normalize';

export interface SlideClip {
  path: string;
  durationSec: number;
}

export interface ConcatJob {
  inputPath: string;
  inputProbe: ProbeResult;
  inputDurationSec: number;
  slides: SlideClip[];
  outputPath: string;
  musicPath?: string;       // path to music file for slide audio
  musicVolume?: number;      // 0–100, default 80
  onProgress?: (percent: number) => void;
}

export function runConcat(job: ConcatJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const W = evenDim(job.inputProbe.width);
    const H = evenDim(job.inputProbe.height);

    if (W <= 0 || H <= 0) {
      return reject(new Error(`Invalid input dimensions: ${job.inputProbe.width}x${job.inputProbe.height}`));
    }
    if (job.slides.length === 0) {
      return reject(new Error('At least one outro slide is required'));
    }

    const cmd = ffmpeg();

    // Input 0: source video/image
    if (job.inputProbe.isImage) {
      cmd.input(job.inputPath).inputOptions(['-loop 1', `-t ${job.inputDurationSec}`]);
    } else {
      cmd.input(job.inputPath);
    }

    // Inputs 1..N: slide PNGs
    for (const slide of job.slides) {
      cmd.input(slide.path).inputOptions(['-loop 1', `-t ${slide.durationSec}`]);
    }

    // Optional music input (last input, index = 1 + slides.length)
    const totalSlideDur = job.slides.reduce((sum, s) => sum + s.durationSec, 0);
    const hasMusic = !!job.musicPath;
    let musicInputIdx = -1;
    if (hasMusic) {
      musicInputIdx = 1 + job.slides.length;
      cmd.input(job.musicPath!).inputOptions(['-stream_loop', '-1', '-t', totalSlideDur.toFixed(3)]);
    }

    const sourceHasAudio = !job.inputProbe.isImage && job.inputProbe.hasAudio;
    const sourceDur = job.inputProbe.isImage ? job.inputDurationSec : job.inputProbe.durationSec;
    const vol = Math.max(0, Math.min(100, job.musicVolume ?? 80)) / 100;

    const parts: string[] = [];

    // --- Video streams ---
    parts.push(
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS},format=yuv420p[v0]`
    );
    for (let i = 0; i < job.slides.length; i++) {
      const idx = i + 1;
      parts.push(
        `[${idx}:v]scale=${W}:${H},setsar=1,fps=${TARGET_FPS},format=yuv420p[v${idx}]`
      );
    }

    // --- Audio stream for source (input 0) ---
    if (sourceHasAudio) {
      parts.push(`[0:a]aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo[a0]`);
    } else {
      parts.push(
        `anullsrc=r=${TARGET_SAMPLE_RATE}:cl=stereo:d=${sourceDur.toFixed(3)}[a0]`
      );
    }

    // --- Audio streams for slides ---
    if (hasMusic) {
      // Resample & normalize music, then split into per-slide segments
      const slideCount = job.slides.length;

      if (slideCount === 1) {
        // Single slide — no split needed
        const fadeSt = Math.max(0, job.slides[0].durationSec - 1.5);
        parts.push(
          `[${musicInputIdx}:a]aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo,` +
            `volume=${vol.toFixed(2)},` +
            `afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeSt.toFixed(3)}:d=1.5[a1]`
        );
      } else {
        // Multiple slides — split music stream, trim each segment
        const splitLabels = job.slides.map((_, i) => `[ms${i}]`).join('');
        parts.push(
          `[${musicInputIdx}:a]aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo,` +
            `volume=${vol.toFixed(2)},` +
            `afade=t=in:st=0:d=0.5,` +
            `afade=t=out:st=${Math.max(0, totalSlideDur - 1.5).toFixed(3)}:d=1.5,` +
            `asplit=${slideCount}${splitLabels}`
        );

        let offset = 0;
        for (let i = 0; i < slideCount; i++) {
          const dur = job.slides[i].durationSec;
          const aLabel = `a${i + 1}`;
          parts.push(
            `[ms${i}]atrim=start=${offset.toFixed(3)}:end=${(offset + dur).toFixed(3)},asetpts=PTS-STARTPTS[${aLabel}]`
          );
          offset += dur;
        }
      }
    } else {
      // No music — silent audio for each slide
      for (let i = 0; i < job.slides.length; i++) {
        parts.push(
          `anullsrc=r=${TARGET_SAMPLE_RATE}:cl=stereo:d=${job.slides[i].durationSec.toFixed(3)}[a${i + 1}]`
        );
      }
    }

    // --- Concat ---
    const concatN = 1 + job.slides.length;
    const concatChain: string[] = [];
    for (let i = 0; i < concatN; i++) concatChain.push(`[v${i}][a${i}]`);
    parts.push(`${concatChain.join('')}concat=n=${concatN}:v=1:a=1[v][a]`);

    cmd.complexFilter(parts.join(';'));

    cmd.outputOptions([
      '-map', '[v]',
      '-map', '[a]',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', String(TARGET_SAMPLE_RATE),
      '-movflags', '+faststart',
    ]);

    cmd.output(job.outputPath);

    const stderrTail: string[] = [];
    cmd.on('stderr', (line: string) => {
      stderrTail.push(line);
      if (stderrTail.length > 100) stderrTail.shift();
    });
    cmd.on('progress', (p: { percent?: number }) => {
      if (job.onProgress && typeof p.percent === 'number') {
        job.onProgress(Math.max(0, Math.min(100, p.percent)));
      }
    });
    cmd.on('error', (err: Error) => {
      const tail = stderrTail.slice(-20).join('\n');
      reject(new Error(`${err.message}\n--- ffmpeg stderr ---\n${tail}`));
    });
    cmd.on('end', () => resolve());

    cmd.run();
  });
}
