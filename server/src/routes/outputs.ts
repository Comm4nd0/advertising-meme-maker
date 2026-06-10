import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { paths, isSafeName } from '../storage/paths';

export const outputsRouter = Router();

export interface OutputFile {
  filename: string;
  url: string;
  sizeMB: number;
  createdAt: string; // ISO string
}

// GET /api/outputs — list all exported videos, newest first
outputsRouter.get('/', (_req, res) => {
  try {
    if (!fs.existsSync(paths.output)) {
      res.json([]);
      return;
    }

    const files = fs.readdirSync(paths.output)
      .filter((f) => /\.(mp4|webm|mov)$/i.test(f))
      .map((filename) => {
        const full = path.join(paths.output, filename);
        const stat = fs.statSync(full);
        return {
          filename,
          url: `/output/${filename}`,
          sizeMB: Math.round((stat.size / (1024 * 1024)) * 10) / 10,
          createdAt: stat.birthtime.toISOString(),
        } as OutputFile;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(files);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/outputs/:filename — delete an exported video
outputsRouter.delete('/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    if (!isSafeName(filename)) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    const full = path.join(paths.output, filename);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
    }
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
