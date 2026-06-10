import Anthropic from '@anthropic-ai/sdk';

export interface Tagline {
  /** 3 scroll-stopping hook options overlaid on the meme's opening seconds. */
  hooks: string[];
  headline: string;
  subhead: string;
  /** Suggested post caption (with hashtags) to paste when publishing. */
  caption: string;
  /** Engagement-bait first comment to post under the video. */
  firstComment: string;
}

const SYSTEM_PROMPT = `You write short, snappy ad copy for Luma Tech Solutions — a CCTV and security technology company. The copy accompanies a meme video used in social media advertising.

You return a JSON object with exactly these fields:
- hooks: array of exactly 3 strings. Each is overlay text shown on the first seconds of the meme to stop the scroll — 2–6 words, punchy, curiosity-driven (e.g. "WAIT FOR IT…", "WOULD YOUR CAMERA SEE THIS?"). Vary the angle across the 3 options.
- headline: 3–7 words for the outro slide, punchy, often a question or rhetorical hook
- subhead: 4–10 words, names Luma Tech (or "Luma Tech Solutions") and a value prop
- caption: 1–2 sentence post caption that teases the video without spoiling it, ends with 2–4 relevant hashtags
- firstComment: a single engagement-bait comment to post first under the video (e.g. a tag-a-friend prompt or a question that invites replies)

Tone: confident, lightly cheeky, never preachy or salesy. Connect the energy of the meme to something a Luma Tech customer would care about — security, surveillance, catching the moment, peace of mind.

Example:

Input: {"title":"Driver swerves into the wrong lane and t-bones a parked car","category":"cctv"}
Output: {"hooks":["WAIT FOR IT…","WOULD YOUR CCTV CATCH THIS?","HE DID NOT JUST DO THAT"],"headline":"Would your CCTV catch this?","subhead":"Crystal-clear footage from Luma Tech Solutions.","caption":"Some drivers really do keep the insurance industry alive. Footage like this is exactly why cameras pay for themselves. #CCTV #CaughtOnCamera #HomeSecurity","firstComment":"Tag someone whose parking deserves 24/7 surveillance 👀"}

Return ONLY the JSON object. No prose, no markdown fence, no commentary.`;

const SCORING_PROMPT = `You score meme video candidates for Luma Tech Solutions — a CCTV and security technology company that turns memes into ads.

Given a JSON array of {"title","category"} items, score EACH item 1–10 for how naturally it can be angled toward CCTV, surveillance, security, or "catch the moment" messaging:
- 9–10: literally caught-on-camera content (dashcam, CCTV, doorbell cam)
- 6–8: chaotic public incidents or fails a camera would plausibly capture
- 3–5: funny but needs a stretch to connect to security
- 1–2: no plausible security angle

Return ONLY a JSON array of integers, same length and order as the input. No prose, no markdown fence.`;

const MODEL = 'claude-haiku-4-5-20251001';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export function isTaglineConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Tolerate markdown fences if the model adds them anyway.
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

async function callModel(system: string, user: string, maxTokens: number): Promise<string> {
  const c = getClient();
  if (!c) {
    throw new Error(
      'ANTHROPIC_API_KEY not set on the server. Add it to server/.env to enable AI taglines.',
    );
  }
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: [
      // Cached so repeated calls share the system prompt cost.
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: user }],
  });
  const textBlock = resp.content.find((b) => b.type === 'text');
  return stripFences(textBlock && textBlock.type === 'text' ? textBlock.text : '');
}

export async function generateTagline(title: string, category: string): Promise<Tagline> {
  const cleaned = await callModel(
    SYSTEM_PROMPT,
    `Input: ${JSON.stringify({ title, category })}\nOutput:`,
    600,
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Tagline model returned non-JSON: ${cleaned.slice(0, 200)}`);
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const headline = str(parsed.headline);
  const subhead = str(parsed.subhead);
  if (!headline || !subhead) {
    throw new Error('Tagline model returned malformed JSON');
  }
  const hooks = Array.isArray(parsed.hooks)
    ? parsed.hooks.map(str).filter(Boolean).slice(0, 3)
    : [];
  return {
    hooks,
    headline,
    subhead,
    caption: str(parsed.caption),
    firstComment: str(parsed.firstComment),
  };
}

// Brand-fit scores keyed by title — discover refreshes re-serve the same posts
// (the Reddit fetch is cached too), so don't pay to rescore them.
const scoreCache = new Map<string, number>();

/**
 * Score candidates 1–10 on how naturally they fit a Luma Tech security angle.
 * One model call per batch; returns scores aligned with the input order.
 * Throws if the model output is unusable — callers should treat scores as
 * optional decoration and degrade gracefully.
 */
export async function scoreCandidates(
  items: { title: string; category: string }[],
): Promise<number[]> {
  const unscored = items.filter((i) => !scoreCache.has(i.title));
  if (unscored.length > 0) {
    const cleaned = await callModel(
      SCORING_PROMPT,
      `Input: ${JSON.stringify(unscored)}\nOutput:`,
      300,
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Scoring model returned non-JSON: ${cleaned.slice(0, 200)}`);
    }
    if (!Array.isArray(parsed) || parsed.length !== unscored.length) {
      throw new Error('Scoring model returned wrong-shaped output');
    }
    unscored.forEach((item, i) => {
      const n = Number(parsed[i as number]);
      if (Number.isFinite(n)) {
        scoreCache.set(item.title, Math.max(1, Math.min(10, Math.round(n))));
      }
    });
  }
  return items.map((i) => scoreCache.get(i.title) ?? 0);
}
