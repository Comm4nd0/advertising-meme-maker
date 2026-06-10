import Anthropic from '@anthropic-ai/sdk';

export interface Tagline {
  headline: string;
  subhead: string;
}

const SYSTEM_PROMPT = `You write short, snappy taglines for Luma Tech Solutions — a CCTV and security technology company. Each tagline appears as an outro slide on a meme video used in advertising.

You return a JSON object with exactly two fields:
- headline: 3–7 words, punchy, often a question or rhetorical hook
- subhead: 4–10 words, names Luma Tech (or "Luma Tech Solutions") and a value prop

Tone: confident, lightly cheeky, never preachy or salesy. The headline should connect the energy of the meme to something a Luma Tech customer would care about — security, surveillance, catching the moment, peace of mind.

Examples:

Input: {"title":"Driver swerves into the wrong lane and t-bones a parked car","category":"cctv"}
Output: {"headline":"Would your CCTV catch this?","subhead":"Crystal-clear footage from Luma Tech Solutions."}

Input: {"title":"Cat absolutely demolishes the Christmas tree","category":"generic-funny"}
Output: {"headline":"Never miss a good moment.","subhead":"Always-on security by Luma Tech."}

Input: {"title":"Karen loses it at a Walmart self-checkout","category":"public-freakout"}
Output: {"headline":"Caught the moment? You should be.","subhead":"Reliable surveillance by Luma Tech Solutions."}

Input: {"title":"Man slips on ice trying to take out the bins","category":"fail"}
Output: {"headline":"What did your camera see today?","subhead":"24/7 monitoring from Luma Tech."}

Input: {"title":"Dog greets owner after deployment, cries with joy","category":"wholesome"}
Output: {"headline":"The moments worth keeping.","subhead":"Capture every one with Luma Tech."}

Return ONLY the JSON object. No prose, no markdown fence, no commentary.`;

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

export async function generateTagline(title: string, category: string): Promise<Tagline> {
  const c = getClient();
  if (!c) {
    throw new Error(
      'ANTHROPIC_API_KEY not set on the server. Add it to server/.env to enable AI taglines.',
    );
  }

  const resp = await c.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: [
      // Cached so repeated tagline calls share the system prompt cost.
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `Input: ${JSON.stringify({ title, category })}\nOutput:`,
      },
    ],
  });

  const textBlock = resp.content.find((b) => b.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  // Tolerate markdown fences if the model adds them anyway.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed: { headline?: unknown; subhead?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Tagline model returned non-JSON: ${cleaned.slice(0, 200)}`);
  }

  const headline = typeof parsed.headline === 'string' ? parsed.headline.trim() : '';
  const subhead = typeof parsed.subhead === 'string' ? parsed.subhead.trim() : '';
  if (!headline || !subhead) {
    throw new Error('Tagline model returned malformed JSON');
  }
  return { headline, subhead };
}
