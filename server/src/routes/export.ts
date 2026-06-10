import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { paths, isSafeName } from '../storage/paths';
import { probe } from '../ffmpeg/probe';
import {
  runConcat,
  type SlideClip,
  type WatermarkOverlay,
  type HookOverlay,
} from '../ffmpeg/concat';
import { musicPath } from '../storage/music';
import type { WatermarkPosition } from '../storage/brand';
import { synthesize as synthesizeTts } from '../tts/edge';
import { debugLog } from '../util/debug';

export const exportRouter = Router();

interface JobState {
  status: 'running' | 'done' | 'error';
  progress: number;
  outputUrl?: string;
  error?: string;
}

const jobs = new Map<string, JobState>();

// Drop a finished job after this long so the SSE client has time to read the
// terminal status, but the map doesn't grow without bound across exports.
const JOB_TTL_MS = 60_000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 50 },
});

function findInputFile(jobDir: string): string | null {
  if (!fs.existsSync(jobDir)) return null;
  const entries = fs.readdirSync(jobDir).filter((f) => f.startsWith('input.'));
  return entries.length > 0 ? path.join(jobDir, entries[0]) : null;
}

// Parse a numeric body field, falling back to `def` on NaN/Infinity and
// clamping into [min, max]. Multipart fields arrive as strings, so a malformed
// value would otherwise become NaN and poison the ffmpeg filter strings.
function num(value: unknown, def: number, min: number, max: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Optional numeric field: undefined/empty stays undefined; non-finite is dropped.
function numOpt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Optional positive integer (e.g. target dimensions); 0/negative → undefined.
function posIntOpt(value: unknown): number | undefined {
  const n = numOpt(value);
  return n !== undefined && n > 0 ? Math.round(n) : undefined;
}

const exportUpload = upload.fields([
  { name: 'slides', maxCount: 50 },
  { name: 'watermark', maxCount: 1 },
  { name: 'hook', maxCount: 1 },
]);

exportRouter.post('/', exportUpload, async (req, res) => {
  try {
    const jobId = req.body.jobId as string | undefined;
    const slideDurations: number[] = req.body.slideDurations
      ? JSON.parse(req.body.slideDurations)
      : [];
    const imageDurationSec = num(req.body.imageDurationSec, 4, 0.5, 60);
    const musicFile = (req.body.music as string) || '';
    const musicVol = num(req.body.musicVolume, 80, 0, 100);
    const trimStartSec = numOpt(req.body.trimStart);
    const trimEndSec = numOpt(req.body.trimEnd);
    const targetW = posIntOpt(req.body.targetWidth);
    const targetH = posIntOpt(req.body.targetHeight);
    const watermarkPosition = (req.body.watermarkPosition as WatermarkPosition) || undefined;
    const hookDurationSec = numOpt(req.body.hookDurationSec);
    const voiceEnabled = req.body.voiceEnabled === '1';
    const voiceName = (req.body.voiceName as string) || '';
    const slideTexts: string[] = req.body.slideTexts
      ? JSON.parse(req.body.slideTexts)
      : [];
    // Optional format tag appended to the output filename (e.g. "9x16") so
    // multi-format batch exports are distinguishable in the output folder.
    const variantRaw = (req.body.variant as string) || '';
    const variant = variantRaw.toLowerCase().replace(/[^a-z0-9x-]/g, '').slice(0, 12);
    const effectType = (req.body.effectType as string) || '';
    const effectDurationSec = num(req.body.effectDurationSec, 0, 0, 60);
    const effectCount = Math.round(num(req.body.effectCount, 1, 1, 10));

    if (!isSafeName(jobId)) {
      res.status(400).json({ error: 'Missing or invalid jobId' });
      return;
    }

    const inputDir = path.join(paths.uploads, jobId);
    const inputPath = findInputFile(inputDir);
    if (!inputPath) {
      res.status(404).json({ error: 'Input file not found for jobId' });
      return;
    }

    const files = (req.files as Record<string, Express.Multer.File[]>) || {};
    const slideFiles = files.slides || [];
    const watermarkFile = files.watermark?.[0];
    const hookFile = files.hook?.[0];

    if (slideFiles.length === 0) {
      res.status(400).json({ error: 'No slides provided' });
      return;
    }

    const slideDir = path.join(inputDir, 'slides');
    fs.mkdirSync(slideDir, { recursive: true });
    const slides: SlideClip[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const slidePath = path.join(slideDir, `slide-${i}.png`);
      fs.writeFileSync(slidePath, slideFiles[i].buffer);
      slides.push({
        path: slidePath,
        durationSec: slideDurations[i] && slideDurations[i] > 0 ? slideDurations[i] : 4,
      });
    }

    // Synthesize TTS audio for each slide whose text is non-empty.
    // msedge-tts writes to a fixed filename inside the output directory,
    // so each slide MUST use its own subdirectory — otherwise call N+1
    // overwrites call N's audio and only the last slide ends up narrated.
    // Failure on a single slide is non-fatal — we just skip its voiceover.
    if (voiceEnabled && voiceName && slideTexts.length > 0) {
      for (let i = 0; i < slides.length; i++) {
        const text = (slideTexts[i] || '').trim();
        if (!text) continue;
        try {
          const slideTtsDir = path.join(inputDir, 'tts', `slide-${i}`);
          const audioPath = await synthesizeTts(text, voiceName, slideTtsDir);
          slides[i].audioPath = audioPath;
        } catch (err) {
          console.warn(`[tts] slide ${i} synthesis failed:`, err);
        }
      }
    }

    let watermarkOverlay: WatermarkOverlay | undefined;
    if (watermarkFile && watermarkPosition) {
      const wmPath = path.join(inputDir, 'watermark.png');
      fs.writeFileSync(wmPath, watermarkFile.buffer);
      watermarkOverlay = { path: wmPath, position: watermarkPosition };
    }

    let hookOverlay: HookOverlay | undefined;
    if (hookFile && hookDurationSec && hookDurationSec > 0) {
      const hookPath = path.join(inputDir, 'hook.png');
      fs.writeFileSync(hookPath, hookFile.buffer);
      hookOverlay = { path: hookPath, durationSec: hookDurationSec };
    }

    const probeResult = await probe(inputPath);
    // Apply trim: if trim values are set and valid, use them
    let sourceDur = probeResult.isImage ? imageDurationSec : probeResult.durationSec;
    let effectiveTrimStart: number | undefined;
    debugLog('[EXPORT DEBUG] trimStartSec:', trimStartSec, 'trimEndSec:', trimEndSec, 'probe.durationSec:', probeResult.durationSec);
    if (!probeResult.isImage && trimStartSec !== undefined && trimEndSec !== undefined) {
      const ts = Math.max(0, trimStartSec);
      const te = Math.min(probeResult.durationSec, trimEndSec);
      if (te > ts + 0.1) {
        effectiveTrimStart = ts;
        sourceDur = te - ts;
      }
    }
    debugLog('[EXPORT DEBUG] sourceDur (inputDurationSec):', sourceDur, 'effectiveTrimStart:', effectiveTrimStart);

    // Resolve music path
    let resolvedMusic: string | undefined;
    if (musicFile) {
      const mp = musicPath(musicFile);
      if (mp) resolvedMusic = mp;
    }

    const exportId = crypto.randomUUID();
    const outputName = `${Date.now()}-${jobId.slice(0, 8)}${variant ? `-${variant}` : ''}.mp4`;
    const outputPath = path.join(paths.output, outputName);
    const outputUrl = `/output/${outputName}`;

    jobs.set(exportId, { status: 'running', progress: 0 });

    runConcat({
      inputPath,
      inputProbe: probeResult,
      inputDurationSec: sourceDur,
      slides,
      outputPath,
      musicPath: resolvedMusic,
      musicVolume: musicVol,
      trimStartSec: effectiveTrimStart,
      effect:
        effectType === 'buffering' && effectDurationSec > 0
          ? { type: 'buffering', durationSec: effectDurationSec, count: effectCount }
          : undefined,
      targetWidth: targetW,
      targetHeight: targetH,
      watermark: watermarkOverlay,
      hook: hookOverlay,
      onProgress: (percent) => {
        const j = jobs.get(exportId);
        if (j) j.progress = percent;
      },
    })
      .then(() => {
        const j = jobs.get(exportId);
        if (j) {
          j.status = 'done';
          j.progress = 100;
          j.outputUrl = outputUrl;
        }
        setTimeout(() => jobs.delete(exportId), JOB_TTL_MS);
      })
      .catch((err: Error) => {
        const j = jobs.get(exportId);
        if (j) {
          j.status = 'error';
          j.error = err.message || String(err);
        }
        setTimeout(() => jobs.delete(exportId), JOB_TTL_MS);
      });

    res.json({ exportId, outputUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

exportRouter.get('/:exportId/progress', (req: Request, res: Response) => {
  const exportId = req.params.exportId;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const tick = () => {
    if (closed) return;
    const j = jobs.get(exportId);
    if (!j) {
      res.write(`data: ${JSON.stringify({ status: 'unknown', progress: 0 })}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify(j)}\n\n`);
    if (j.status !== 'running') {
      res.end();
      return;
    }
    setTimeout(tick, 500);
  };

  tick();
});
