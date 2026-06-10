import path from 'path';
import fs from 'fs';
// Minimal .env loader — dotenv 17's default no-inject behavior gave us grief
// and we only need the simplest case here (KEY=value, no quoting tricks).
const _envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(_envPath)) {
  for (const line of fs.readFileSync(_envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
console.log('[srv] ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'loaded' : 'missing');

import express from 'express';
import cors from 'cors';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

import { uploadRouter } from './routes/upload';
import { brandRouter } from './routes/brand';
import { exportRouter } from './routes/export';
import { outputsRouter } from './routes/outputs';
import { discoverRouter } from './routes/discover';
import { paths, ensureDirs } from './storage/paths';
import { cleanupOldUploads } from './storage/cleanup';
import { migrateOldLogo } from './storage/brand';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
} else {
  console.warn('[srv] ffmpeg-static path not resolved; relying on system ffmpeg');
}
ffmpeg.setFfprobePath(ffprobeStatic.path);

ensureDirs();
migrateOldLogo();
cleanupOldUploads();
// url download support via yt-dlp (auto-downloads binary, supports cookie auth)

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/upload', uploadRouter);
app.use('/api/brand', brandRouter);
app.use('/api/export', exportRouter);
app.use('/api/outputs', outputsRouter);
app.use('/api/discover', discoverRouter);

app.use('/output', express.static(paths.output));
app.use('/brand', express.static(paths.brand));

if (fs.existsSync(paths.clientDist)) {
  app.use(express.static(paths.clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/output') || req.path.startsWith('/brand')) {
      return next();
    }
    res.sendFile(path.join(paths.clientDist, 'index.html'));
  });
}

const PORT = parseInt(process.env.PORT || '8081', 10);
const HOST = '0.0.0.0';

function lanUrls(port: number): string[] {
  const urls: string[] = [`http://localhost:${port}`];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const i of list) {
      if (i.family === 'IPv4' && !i.internal) {
        urls.push(`http://${i.address}:${port}`);
      }
    }
  }
  return urls;
}

app.listen(PORT, HOST, () => {
  console.log(`[srv] listening on ${HOST}:${PORT}`);
  if (fs.existsSync(paths.clientDist)) {
    console.log('[srv] serving built client. Open from any device on your Wi-Fi:');
    for (const url of lanUrls(PORT)) console.log(`        ${url}`);
  } else {
    console.log('[srv] dev mode — use Vite URLs printed above for the UI; this server handles /api');
  }
});
