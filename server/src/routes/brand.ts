import { Router } from 'express';
import multer from 'multer';
import {
  readColors,
  writeColors,
  saveLogo,
  listLogos,
  setActiveLogo,
  deleteLogo,
  activeLogoUrl,
  type BrandColors,
} from '../storage/brand';
import { saveMusic, listMusic, deleteMusic } from '../storage/music';
import { isSafeName } from '../storage/paths';
import { sniffImage, sniffAudio } from '../storage/fileSig';

export const brandRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// GET /api/brand — colors + active logo + logo library + music library
brandRouter.get('/', (_req, res) => {
  res.json({
    colors: readColors(),
    logoUrl: activeLogoUrl(),
    logos: listLogos(),
    music: listMusic(),
  });
});

// PUT /api/brand — update colors and/or upload a new logo (auto-selects it)
brandRouter.put('/', upload.single('logo'), (req, res) => {
  try {
    if (req.body.colors) {
      const colors = JSON.parse(req.body.colors) as BrandColors;
      writeColors(colors);
    }
    if (req.file) {
      if (!sniffImage(req.file.buffer)) {
        res.status(400).json({ error: 'Logo upload is not a recognized image file' });
        return;
      }
      const filename = saveLogo(req.file.buffer, req.file.originalname);
      setActiveLogo(filename);
    }
    res.json({
      colors: readColors(),
      logoUrl: activeLogoUrl(),
      logos: listLogos(),
      music: listMusic(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// PUT /api/brand/logo/active — set active logo by filename
brandRouter.put('/logo/active', (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename || typeof filename !== 'string') {
      res.status(400).json({ error: 'filename required' });
      return;
    }
    setActiveLogo(filename);
    res.json({
      colors: readColors(),
      logoUrl: activeLogoUrl(),
      logos: listLogos(),
      music: listMusic(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/brand/logo/:filename — remove a logo from the library
brandRouter.delete('/logo/:filename', (req, res) => {
  try {
    if (!isSafeName(req.params.filename)) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    deleteLogo(req.params.filename);
    res.json({
      colors: readColors(),
      logoUrl: activeLogoUrl(),
      logos: listLogos(),
      music: listMusic(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// --- Music ---

// POST /api/brand/music — upload a music file
brandRouter.post('/music', upload.single('music'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    if (!sniffAudio(req.file.buffer)) {
      res.status(400).json({ error: 'Music upload is not a recognized audio file' });
      return;
    }
    const filename = saveMusic(req.file.buffer, req.file.originalname);
    res.json({ filename, music: listMusic() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/brand/music/:filename — remove a music file
brandRouter.delete('/music/:filename', (req, res) => {
  try {
    if (!isSafeName(req.params.filename)) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    deleteMusic(req.params.filename);
    res.json({ music: listMusic() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
