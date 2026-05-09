import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { paths } from '../storage/paths';
import { probe } from '../ffmpeg/probe';
import { runConcat, type SlideClip } from '../ffmpeg/concat';
import { musicPath } from '../storage/music';

export const exportRouter = Router();

interface JobState {
  status: 'running' | 'done' | 'error';
  progress: number;
  outputUrl?: string;
  error?: string;
}

const jobs = new Map<string, JobState>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 50 },
});

function findInputFile(jobDir: string): string | null {
  if (!fs.existsSync(jobDir)) return null;
  const entries = fs.readdirSync(jobDir).filter((f) => f.startsWith('input.'));
  return entries.length > 0 ? path.join(jobDir, entries[0]) : null;
}

exportRouter.post('/', upload.array('slides'), async (req, res) => {
  try {
    const jobId = req.body.jobId as string | undefined;
    const slideDurations: number[] = req.body.slideDurations
      ? JSON.parse(req.body.slideDurations)
      : [];
    const imageDurationSec = parseFloat(req.body.imageDurationSec || '4');
    const musicFile = (req.body.music as string) || '';
    const musicVol = parseFloat(req.body.musicVolume || '80');

    if (!jobId) {
      res.status(400).json({ error: 'Missing jobId' });
      return;
    }

    const inputDir = path.join(paths.uploads, jobId);
    const inputPath = findInputFile(inputDir);
    if (!inputPath) {
      res.status(404).json({ error: 'Input file not found for jobId' });
      return;
    }

    const slideFiles = (req.files as Express.Multer.File[]) || [];
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

    const probeResult = await probe(inputPath);
    const sourceDur = probeResult.isImage ? imageDurationSec : probeResult.durationSec;

    // Resolve music path
    let resolvedMusic: string | undefined;
    if (musicFile) {
      const mp = musicPath(musicFile);
      if (mp) resolvedMusic = mp;
    }

    const exportId = crypto.randomUUID();
    const outputName = `${Date.now()}-${jobId.slice(0, 8)}.mp4`;
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
      })
      .catch((err: Error) => {
        const j = jobs.get(exportId);
        if (j) {
          j.status = 'error';
          j.error = err.message || String(err);
        }
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
