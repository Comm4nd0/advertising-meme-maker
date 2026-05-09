import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { paths } from '../storage/paths';
import { probe } from '../ffmpeg/probe';

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
