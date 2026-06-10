import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { paths, isSafeName } from '../storage/paths';
import { probe } from '../ffmpeg/probe';
import { ensureYtDlp, downloadVideo } from '../downloader/ytdlp';
import { isAllowedSourceUrl, allowedDomainsSummary } from '../downloader/urlAllowlist';

export const uploadRouter = Router();

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const r = req as { jobId?: string };
    if (!r.jobId) r.jobId = crypto.randomUUID();
    const dir = path.join(paths.uploads, r.jobId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.bin').toLowerCase();
    cb(null, `input${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

/* ── File upload ── */

uploadRouter.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const probeResult = await probe(req.file.path);
    res.json({
      jobId: (req as { jobId?: string }).jobId,
      filename: req.file.filename,
      ...probeResult,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/* ── Download from URL (Instagram, TikTok, YouTube, etc.) ── */

interface UrlDownloadState {
  status: 'preparing' | 'downloading' | 'probing' | 'done' | 'error';
  message?: string;
  error?: string;
  jobId?: string;
  filename?: string;
  [key: string]: unknown;
}

const urlJobs = new Map<string, UrlDownloadState>();

// Step 1: POST kicks off the download in the background, returns a downloadId
uploadRouter.post('/url', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url field' });
    return;
  }
  if (!isAllowedSourceUrl(url)) {
    res.status(400).json({
      error: `URL not supported. Paste a link from: ${allowedDomainsSummary()}`,
    });
    return;
  }

  const downloadId = crypto.randomUUID();
  urlJobs.set(downloadId, { status: 'preparing', message: 'Checking yt-dlp...' });

  // Return immediately so the client can open an EventSource
  res.json({ downloadId });

  // Run download in background
  (async () => {
    try {
      const ytdlpPath = await ensureYtDlp();

      const jobId = crypto.randomUUID();
      const jobDir = path.join(paths.uploads, jobId);

      const state = urlJobs.get(downloadId)!;
      state.status = 'downloading';
      state.message = 'Downloading video...';

      const result = await downloadVideo(url, jobDir, ytdlpPath, (line) => {
        const s = urlJobs.get(downloadId);
        if (!s) return;
        // Show download percentage lines and our own status messages
        // (our messages don't start with '[', yt-dlp info lines do)
        if (line.includes('%') || !line.startsWith('[')) {
          s.message = line.trim();
        }
      });

      const s2 = urlJobs.get(downloadId);
      if (s2) {
        s2.status = 'probing';
        s2.message = 'Analysing video...';
      }

      const probeResult = await probe(result.filePath);

      const s3 = urlJobs.get(downloadId);
      if (s3) {
        s3.status = 'done';
        s3.message = undefined;
        s3.jobId = jobId;
        s3.filename = result.filename;
        Object.assign(s3, probeResult);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const s = urlJobs.get(downloadId);
      if (s) {
        s.status = 'error';
        s.error = msg;
      }
    }
  })();
});

// Step 2: GET streams progress via SSE (same pattern as export progress)
uploadRouter.get('/url/:downloadId/progress', (req: Request, res: Response) => {
  const downloadId = req.params.downloadId;
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
    const j = urlJobs.get(downloadId);
    if (!j) {
      res.write(`data: ${JSON.stringify({ status: 'error', error: 'Unknown download' })}\n\n`);
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify(j)}\n\n`);
    if (j.status === 'done' || j.status === 'error') {
      setTimeout(() => urlJobs.delete(downloadId), 30_000);
      res.end();
      return;
    }
    setTimeout(tick, 500);
  };

  tick();
});

/* ── Serve uploaded file for preview (used when source came from URL) ── */
// NOTE: this parametric route must come AFTER the /url/* routes above
// so that /url/... requests don't match /:jobId/file

uploadRouter.get('/:jobId/file', (req, res) => {
  const jobId = req.params.jobId;
  if (!isSafeName(jobId)) {
    res.status(400).json({ error: 'Invalid jobId' });
    return;
  }
  const jobDir = path.join(paths.uploads, jobId);
  if (!fs.existsSync(jobDir)) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const entries = fs.readdirSync(jobDir).filter((f) => f.startsWith('input.'));
  if (entries.length === 0) {
    res.status(404).json({ error: 'Input file not found' });
    return;
  }
  res.sendFile(path.join(jobDir, entries[0]));
});
