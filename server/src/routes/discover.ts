import { Router } from 'express';
import { discoverCandidates } from '../discover/reddit';
import { CATEGORY_LABELS, type MemeCategory } from '../discover/sources';
import { generateTagline, isTaglineConfigured } from '../discover/tagline';

export const discoverRouter = Router();

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABELS));

discoverRouter.get('/', async (req, res) => {
  try {
    const cat = (req.query.category as string) || '';
    const filter = cat && VALID_CATEGORIES.has(cat) ? (cat as MemeCategory) : null;
    const candidates = await discoverCandidates(filter, 12);
    res.json({
      candidates,
      taglineConfigured: isTaglineConfigured(),
      categories: CATEGORY_LABELS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

discoverRouter.post('/tagline', async (req, res) => {
  try {
    const { title, category } = req.body as { title?: string; category?: string };
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'Missing title' });
      return;
    }
    if (!isTaglineConfigured()) {
      res.status(503).json({ error: 'ANTHROPIC_API_KEY not set on the server' });
      return;
    }
    const tagline = await generateTagline(title, category || 'generic-funny');
    res.json(tagline);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
