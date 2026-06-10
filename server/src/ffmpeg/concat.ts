import ffmpeg from 'fluent-ffmpeg';
import type { ProbeResult } from './probe';
import { TARGET_FPS, TARGET_SAMPLE_RATE, evenDim } from './normalize';
import type { WatermarkPosition } from '../storage/brand';
import { BUFFERING_MP4, type SourceEffect } from '../effects/assets';
import { debugLog } from '../util/debug';

export interface SlideClip {
  path: string;
  durationSec: number;
  /** Optional path to a TTS audio file to play over this slide. */
  audioPath?: string;
}

export interface WatermarkOverlay {
  path: string;
  position: WatermarkPosition;
}

export interface HookOverlay {
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
  trimStartSec?: number;    // seek to this point in the source
  /** Final canvas dims. Defaults to source dims if unspecified. */
  targetWidth?: number;
  targetHeight?: number;
  watermark?: WatermarkOverlay;
  hook?: HookOverlay;
  effect?: SourceEffect;
  onProgress?: (percent: number) => void;
}

/** Tolerance for treating two aspect ratios as equal. */
const ASPECT_EPSILON = 0.01;

export function runConcat(job: ConcatJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const srcW = job.inputProbe.width;
    const srcH = job.inputProbe.height;
    const W = evenDim(job.targetWidth ?? srcW);
    const H = evenDim(job.targetHeight ?? srcH);

    if (W <= 0 || H <= 0) {
      return reject(new Error(`Invalid target dimensions: ${W}x${H}`));
    }
    if (job.slides.length === 0) {
      return reject(new Error('At least one outro slide is required'));
    }

    const cmd = ffmpeg();

    // ── Assign input indices ──
    // Input 0: source video/image
    if (job.inputProbe.isImage) {
      cmd.input(job.inputPath).inputOptions(['-loop 1', `-t ${job.inputDurationSec}`]);
    } else {
      const inputOpts: string[] = [];
      if (job.trimStartSec !== undefined && job.trimStartSec > 0) {
        inputOpts.push(`-ss ${job.trimStartSec.toFixed(3)}`);
      }
      inputOpts.push(`-t ${job.inputDurationSec.toFixed(3)}`);
      cmd.input(job.inputPath).inputOptions(inputOpts);
    }

    let nextIdx = 1;

    // Inputs 1..N: slide PNGs
    const slideStartIdx = nextIdx;
    for (const slide of job.slides) {
      cmd.input(slide.path).inputOptions(['-loop 1', `-t ${slide.durationSec}`]);
      nextIdx++;
    }

    // Optional hook PNG input — looped image, only shown for hookDurationSec
    let hookInputIdx = -1;
    if (job.hook) {
      hookInputIdx = nextIdx;
      cmd.input(job.hook.path).inputOptions(['-loop 1', `-t ${job.hook.durationSec.toFixed(3)}`]);
      nextIdx++;
    }

    // Precompute effect window so watermark+music durations can account for
    // the extra freeze time we add to the source segment.
    const effectDur = job.effect?.durationSec ?? 0;
    const effectCount = Math.max(1, Math.min(10, job.effect?.count ?? 1));
    const effectActive = job.effect?.type === 'buffering' && effectDur > 0;
    const totalFreezeDur = effectActive ? effectDur * effectCount : 0;
    const segmentDurForOverlays = job.inputDurationSec + totalFreezeDur;
    // When effect is active, each "cycle" in the post-concat source timeline
    // is one freeze followed by one source chunk. Cycle length:
    const cycle = effectActive
      ? effectDur + job.inputDurationSec / effectCount
      : 0;

    // Optional watermark PNG input — looped, applied to source.
    // MUST have a -t limit; an infinite -loop 1 stream causes the overlay
    // filter to never reach EOF, hanging the entire encode.
    let watermarkInputIdx = -1;
    if (job.watermark) {
      watermarkInputIdx = nextIdx;
      const wmDur = segmentDurForOverlays + 5; // generous ceiling
      cmd.input(job.watermark.path).inputOptions(['-loop 1', `-t ${wmDur.toFixed(3)}`]);
      nextIdx++;
    }

    // Optional buffering overlay video input. Looped to cover the whole
    // source segment (incl. all freezes) — overlay enable gates when it
    // actually appears on top.
    let effectOverlayInputIdx = -1;
    if (effectActive) {
      effectOverlayInputIdx = nextIdx;
      cmd
        .input(BUFFERING_MP4)
        .inputOptions(['-stream_loop', '-1', '-t', segmentDurForOverlays.toFixed(3)]);
      nextIdx++;
    }

    // Optional music input
    const totalSlideDur = job.slides.reduce((sum, s) => sum + s.durationSec, 0);
    const hasMusic = !!job.musicPath && job.slides.length > 0;
    let musicInputIdx = -1;
    if (hasMusic) {
      musicInputIdx = nextIdx;
      cmd.input(job.musicPath!).inputOptions(['-stream_loop', '-1', '-t', totalSlideDur.toFixed(3)]);
      nextIdx++;
    }

    // Optional per-slide voice (TTS) inputs. -1 means no voice for that slide.
    const voiceInputIdx: number[] = [];
    for (const slide of job.slides) {
      if (slide.audioPath) {
        voiceInputIdx.push(nextIdx);
        cmd.input(slide.audioPath);
        nextIdx++;
      } else {
        voiceInputIdx.push(-1);
      }
    }

    const sourceHasAudio = !job.inputProbe.isImage && job.inputProbe.hasAudio;
    const sourceDur = job.inputDurationSec;
    const vol = Math.max(0, Math.min(100, job.musicVolume ?? 80)) / 100;

    // Aspect-ratio comparison decides whether we need blurred-bar letterbox.
    const sourceAspect = srcW / srcH;
    const targetAspect = W / H;
    const sourceMatches = Math.abs(sourceAspect - targetAspect) < ASPECT_EPSILON;

    const parts: string[] = [];

    // ── Pre-format watermark input ──
    // Watermark is only applied to the source segment now.
    if (job.watermark && watermarkInputIdx >= 0) {
      parts.push(`[${watermarkInputIdx}:v]format=rgba[wm_src]`);
    }

    // ── Build concat segments ──
    let segIdx = 0;

    // --- Segment 0: source video ---
    // Frame-accurate duration via trim+setpts, then reformat into target canvas.
    const srcLetterboxOut = reformatToCanvas('0:v', W, H, sourceMatches, parts, {
      trimDuration: sourceDur,
      labelPrefix: 'src',
    });

    let srcCurrentLabel = srcLetterboxOut;

    // ── Multi-burst buffering effect ──
    // Split the source into `effectCount` chunks, freeze the first frame of
    // each chunk for effectDur seconds via tpad+start_mode=clone, then
    // concat back. Result: freeze, chunk, freeze, chunk, … (count copies).
    if (effectActive) {
      const chunkDur = job.inputDurationSec / effectCount;
      const splitLabels = Array.from({ length: effectCount }, (_, i) => `bsrc_${i}`);
      parts.push(
        `[${srcCurrentLabel}]split=${effectCount}${splitLabels.map((l) => `[${l}]`).join('')}`
      );
      const frozenLabels: string[] = [];
      for (let i = 0; i < effectCount; i++) {
        const startT = (i * chunkDur).toFixed(3);
        const endT = ((i + 1) * chunkDur).toFixed(3);
        const out = `bsrcf_${i}`;
        parts.push(
          `[${splitLabels[i]}]trim=start=${startT}:end=${endT},setpts=PTS-STARTPTS,` +
            `tpad=start_duration=${effectDur.toFixed(3)}:start_mode=clone[${out}]`
        );
        frozenLabels.push(out);
      }
      const concatIn = frozenLabels.map((l) => `[${l}]`).join('');
      const concatOut = 'v0_bursts';
      parts.push(`${concatIn}concat=n=${effectCount}:v=1:a=0[${concatOut}]`);
      srcCurrentLabel = concatOut;

      // Scale and key out the black background of the overlay video.
      // colorkey similarity=0.3 + blend=0.1 cleanly removes pure black while
      // preserving anti-aliased edges.
      const overlaySize = Math.max(96, Math.round(Math.min(W, H) * 0.32));
      parts.push(
        `[${effectOverlayInputIdx}:v]scale=${overlaySize}:${overlaySize}:flags=lanczos,` +
          `format=rgba,colorkey=color=black:similarity=0.30:blend=0.10[buf_fx]`
      );

      // Dim during freeze windows only. `mod(t,cycle) < effectDur` is true
      // during every burst's freeze phase.
      const enable = `lt(mod(t\\,${cycle.toFixed(6)})\\,${effectDur.toFixed(3)})`;
      const dimmed = 'v0_dim';
      parts.push(
        `[${srcCurrentLabel}]colorchannelmixer=rr=0.5:gg=0.5:bb=0.5:enable='${enable}'[${dimmed}]`
      );
      srcCurrentLabel = dimmed;

      // Overlay the buffering animation during the same windows.
      const overlaid = 'v0_buf';
      parts.push(
        `[${srcCurrentLabel}][buf_fx]overlay=(W-w)/2:(H-h)/2:` +
          `enable='${enable}':shortest=0:format=auto[${overlaid}]`
      );
      srcCurrentLabel = overlaid;
    }

    if (job.hook && hookInputIdx >= 0) {
      const next = 'v0_hooked';
      parts.push(
        `[${hookInputIdx}:v]scale=${W}:${H}:flags=lanczos,format=rgba[hook_in]`
      );
      // When buffering is active, shift the hook overlay window to play
      // during the first source chunk (right after the first freeze ends).
      const hookStart = effectActive ? effectDur : 0;
      const hookEnd = hookStart + job.hook.durationSec;
      const hookEnable = effectActive
        ? `between(t,${hookStart.toFixed(3)},${hookEnd.toFixed(3)})`
        : `lt(t,${job.hook.durationSec.toFixed(3)})`;
      parts.push(
        `[${srcCurrentLabel}][hook_in]overlay=0:0:enable='${hookEnable}':format=auto:shortest=1,format=yuv420p[${next}]`
      );
      srcCurrentLabel = next;
    }
    if (job.watermark && watermarkInputIdx >= 0) {
      const next = 'v0';
      const pos = overlayPos(job.watermark.position);
      parts.push(
        `[${srcCurrentLabel}][wm_src]overlay=${pos.x}:${pos.y}:format=auto:shortest=1,format=yuv420p[${next}]`
      );
      srcCurrentLabel = next;
    }
    if (srcCurrentLabel !== 'v0') {
      // Rename whatever we ended with to the canonical v0 label.
      parts.push(`[${srcCurrentLabel}]null[v0]`);
    }

    // When buffering is active, the source segment is `effectDur * count`
    // seconds longer than `sourceDur` — split audio into `count` chunks at
    // the same boundaries as the video and prepend silence to each chunk.
    const effectDelayMs = effectActive ? Math.round(effectDur * 1000) : 0;
    const segmentDur = sourceDur + totalFreezeDur;
    if (sourceHasAudio) {
      if (!effectActive) {
        parts.push(
          `[0:a]atrim=duration=${sourceDur.toFixed(3)},asetpts=PTS-STARTPTS,` +
            `aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo[a0]`
        );
      } else {
        // First, normalize the source audio to our target format / duration.
        parts.push(
          `[0:a]atrim=duration=${sourceDur.toFixed(3)},asetpts=PTS-STARTPTS,` +
            `aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo[a_norm]`
        );
        // Split into `count` chunks at the same boundaries as the video.
        const chunkDur = sourceDur / effectCount;
        const aSplitLabels = Array.from({ length: effectCount }, (_, i) => `as_${i}`);
        parts.push(
          `[a_norm]asplit=${effectCount}${aSplitLabels.map((l) => `[${l}]`).join('')}`
        );
        const delayedLabels: string[] = [];
        for (let i = 0; i < effectCount; i++) {
          const startT = (i * chunkDur).toFixed(3);
          const endT = ((i + 1) * chunkDur).toFixed(3);
          const out = `ad_${i}`;
          // Trim chunk, then prepend effectDur seconds of silence.
          parts.push(
            `[${aSplitLabels[i]}]atrim=start=${startT}:end=${endT},asetpts=PTS-STARTPTS,` +
              `adelay=${effectDelayMs}|${effectDelayMs}:all=1[${out}]`
          );
          delayedLabels.push(out);
        }
        const aConcatIn = delayedLabels.map((l) => `[${l}]`).join('');
        parts.push(`${aConcatIn}concat=n=${effectCount}:v=0:a=1[a0]`);
      }
    } else {
      parts.push(
        `anullsrc=r=${TARGET_SAMPLE_RATE}:cl=stereo:d=${segmentDur.toFixed(3)}[a0]`
      );
    }
    segIdx = 1;

    // --- Segments 1..N: slide PNGs (already rendered at target dims) ---
    for (let i = 0; i < job.slides.length; i++) {
      const ffIdx = slideStartIdx + i;
      parts.push(
        `[${ffIdx}:v]scale=${W}:${H},setsar=1,fps=${TARGET_FPS},format=yuv420p[v${segIdx}]`
      );
      segIdx++;
    }

    // Slide audio streams (labels a1 .. a{slides.length}).
    // Each slide can have: a slice of music, a TTS voiceover, both (mixed),
    // or neither (silence).
    if (job.slides.length > 0) {
      const slideCount = job.slides.length;

      // Step 1: per-slide music slice → [music_0] [music_1] ...
      // (Empty array if no music.)
      const musicLabels: string[] = [];
      if (hasMusic) {
        if (slideCount === 1) {
          const fadeSt = Math.max(0, job.slides[0].durationSec - 1.5);
          parts.push(
            `[${musicInputIdx}:a]aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo,` +
              `volume=${vol.toFixed(2)},` +
              `afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeSt.toFixed(3)}:d=1.5[music_0]`
          );
          musicLabels.push('music_0');
        } else {
          const splitTargets = job.slides.map((_, i) => `[ms${i}]`).join('');
          parts.push(
            `[${musicInputIdx}:a]aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo,` +
              `volume=${vol.toFixed(2)},` +
              `afade=t=in:st=0:d=0.5,` +
              `afade=t=out:st=${Math.max(0, totalSlideDur - 1.5).toFixed(3)}:d=1.5,` +
              `asplit=${slideCount}${splitTargets}`
          );
          let offset = 0;
          for (let i = 0; i < slideCount; i++) {
            const dur = job.slides[i].durationSec;
            parts.push(
              `[ms${i}]atrim=start=${offset.toFixed(3)}:end=${(offset + dur).toFixed(3)},asetpts=PTS-STARTPTS[music_${i}]`
            );
            musicLabels.push(`music_${i}`);
            offset += dur;
          }
        }
      }

      // Step 2: per-slide voice → [voice_i] — padded with silence to slide
      // duration. Ducked slightly (atempo unchanged, just trim/pad).
      const voiceLabels: (string | null)[] = [];
      for (let i = 0; i < slideCount; i++) {
        const vIdx = voiceInputIdx[i];
        const dur = job.slides[i].durationSec.toFixed(3);
        if (vIdx >= 0) {
          parts.push(
            `[${vIdx}:a]aresample=${TARGET_SAMPLE_RATE},aformat=channel_layouts=stereo,` +
              `apad,atrim=duration=${dur},asetpts=PTS-STARTPTS[voice_${i}]`
          );
          voiceLabels.push(`voice_${i}`);
        } else {
          voiceLabels.push(null);
        }
      }

      // Step 3: combine voice + music → final [a${i+1}]
      // Music is ducked (lowered to 35%) when mixed with voice so the
      // narration sits on top clearly.
      for (let i = 0; i < slideCount; i++) {
        const voice = voiceLabels[i];
        const music = hasMusic ? musicLabels[i] : null;
        const out = `a${i + 1}`;
        const dur = job.slides[i].durationSec.toFixed(3);
        if (voice && music) {
          parts.push(`[${music}]volume=0.35[${music}_d]`);
          parts.push(
            `[${voice}][${music}_d]amix=inputs=2:duration=longest:normalize=0,` +
              `aformat=channel_layouts=stereo[${out}]`
          );
        } else if (voice) {
          parts.push(`[${voice}]anull[${out}]`);
        } else if (music) {
          parts.push(`[${music}]anull[${out}]`);
        } else {
          parts.push(
            `anullsrc=r=${TARGET_SAMPLE_RATE}:cl=stereo:d=${dur}[${out}]`
          );
        }
      }
    }

    // --- Concat all segments ---
    const concatN = segIdx;
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

    debugLog('[CONCAT DEBUG] target:', `${W}x${H}`, 'sourceMatches:', sourceMatches, 'hook:', !!job.hook, 'watermark:', !!job.watermark);
    debugLog('[CONCAT DEBUG] filter_complex:', parts.join(';\n'));
    cmd.on('start', (cmdLine: string) => {
      debugLog('[CONCAT DEBUG] ffmpeg command:', cmdLine);
    });

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

/**
 * Append filter steps to reformat a video stream into the WxH canvas.
 * Returns the label of the final video stream.
 *
 * When the source's aspect matches the target: simple scale + pad to ensure
 * exact dims (covers the case where dims match but ratios drift by <1%).
 * Otherwise: blurred-bar letterbox — split the stream, blur+cover-crop one
 * copy as a background, scale-fit the other on top.
 */
function reformatToCanvas(
  inLabel: string,
  W: number,
  H: number,
  aspectMatches: boolean,
  parts: string[],
  opts: { trimDuration?: number; labelPrefix: string },
): string {
  const { trimDuration, labelPrefix } = opts;
  const trimChain = trimDuration !== undefined
    ? `trim=duration=${trimDuration.toFixed(3)},setpts=PTS-STARTPTS,`
    : '';
  const outLabel = `${labelPrefix}_base`;

  if (aspectMatches) {
    parts.push(
      `[${inLabel}]${trimChain}scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS},format=yuv420p[${outLabel}]`
    );
  } else {
    const bg = `${labelPrefix}_bg`;
    const fg = `${labelPrefix}_fg`;
    const bgBlurred = `${labelPrefix}_bgb`;
    parts.push(
      `[${inLabel}]${trimChain}fps=${TARGET_FPS},split=2[${bg}][${fg}]`
    );
    parts.push(
      `[${bg}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `boxblur=lr=40:cr=20,setsar=1[${bgBlurred}]`
    );
    parts.push(
      `[${fg}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[${labelPrefix}_fgs]`
    );
    parts.push(
      `[${bgBlurred}][${labelPrefix}_fgs]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[${outLabel}]`
    );
  }
  return outLabel;
}

function overlayPos(position: WatermarkPosition): { x: string; y: string } {
  // Padding is expressed as a fraction of main dimensions so it scales with canvas size.
  const padX = 'main_w*0.03';
  const padY = 'main_h*0.03';
  switch (position) {
    case 'top-left':
      return { x: padX, y: padY };
    case 'top-right':
      return { x: `main_w-overlay_w-${padX}`, y: padY };
    case 'bottom-left':
      return { x: padX, y: `main_h-overlay_h-${padY}` };
    case 'bottom-right':
    default:
      return { x: `main_w-overlay_w-${padX}`, y: `main_h-overlay_h-${padY}` };
  }
}
