/**
 * Given a headline, generate a relevant subhead for Luma Tech Solutions.
 * Matches keywords in the headline to pick a contextually appropriate tagline.
 */

interface Rule {
  keywords: RegExp;
  subheads: string[];
}

const RULES: Rule[] = [
  // CCTV / cameras / surveillance
  {
    keywords: /\b(cctv|camera|cameras|surveillance|record|recording|footage|captured|caught|watched)\b/i,
    subheads: [
      'Professional CCTV from Luma Tech Solutions',
      'Luma Tech Solutions — CCTV you can rely on',
      'HD CCTV installed by Luma Tech Solutions',
      'Contact Luma Tech Solutions for a free quote',
      'Luma Tech Solutions — your local CCTV experts',
    ],
  },
  // Security / protection
  {
    keywords: /\b(secur|protect|safe|safety|guard|alarm|intruder|break.?in|burglar|theft|crime|stolen)\b/i,
    subheads: [
      'Security solutions from Luma Tech Solutions',
      'Luma Tech Solutions — protecting what matters',
      'Professional security systems installed',
      'Keep your property safe with Luma Tech Solutions',
      'Luma Tech Solutions — peace of mind guaranteed',
    ],
  },
  // Seeing / watching / missing moments
  {
    keywords: /\b(see|seen|watch|watching|miss|moment|eyes|view|look|spot|notice)\b/i,
    subheads: [
      'Never miss a thing with Luma Tech Solutions',
      'Crystal clear coverage from Luma Tech Solutions',
      '24/7 monitoring — Luma Tech Solutions',
      'See everything with Luma Tech Solutions',
      'Luma Tech Solutions — always watching out for you',
    ],
  },
  // Smart home
  {
    keywords: /\b(smart|automat|home.?tech|lighting|thermostat|alexa|google.?home|voice|app|phone|control)\b/i,
    subheads: [
      'Smart home solutions from Luma Tech Solutions',
      'Luma Tech Solutions — making your home smarter',
      'Automate your life with Luma Tech Solutions',
      'Control everything from your phone',
      'Luma Tech Solutions — smart living made easy',
    ],
  },
  // Access / doors / entry
  {
    keywords: /\b(access|door|entry|enter|lock|key|keyless|intercom|gate|fob|badge)\b/i,
    subheads: [
      'Access control from Luma Tech Solutions',
      'Keyless entry systems by Luma Tech Solutions',
      'Luma Tech Solutions — secure access made simple',
      'Smart locks and intercoms installed',
      'Control who comes and goes with Luma Tech Solutions',
    ],
  },
  // Networking / Wi-Fi
  {
    keywords: /\b(wifi|wi.?fi|network|internet|buffer|connect|signal|broadband|router|cable|cabling|dead.?zone)\b/i,
    subheads: [
      'Networking solutions from Luma Tech Solutions',
      'Luma Tech Solutions — fast, reliable connectivity',
      'Professional Wi-Fi and network installations',
      'Whole-property coverage by Luma Tech Solutions',
      'Luma Tech Solutions — no more dead zones',
    ],
  },
  // Business / commercial
  {
    keywords: /\b(business|office|commercial|warehouse|retail|shop|store|premises|workplace|company)\b/i,
    subheads: [
      'Business solutions from Luma Tech Solutions',
      'Trusted by businesses — Luma Tech Solutions',
      'Commercial security and tech installations',
      'Luma Tech Solutions — tailored for your business',
      'Book a free site survey with Luma Tech Solutions',
    ],
  },
  // Upgrade / change / improve
  {
    keywords: /\b(upgrade|improve|better|change|time to|need|ready|deserve|enough|fed up|tired)\b/i,
    subheads: [
      'Upgrade with Luma Tech Solutions',
      'Luma Tech Solutions — tech done right',
      'Time to call Luma Tech Solutions',
      'Get in touch with Luma Tech Solutions today',
      'Free consultation from Luma Tech Solutions',
    ],
  },
  // Contact / quote / call
  {
    keywords: /\b(contact|call|quote|free|today|get in touch|reach|book|enquir|consult)\b/i,
    subheads: [
      'lumatechsolutions.co.uk',
      'Luma Tech Solutions — call us today',
      'Free no-obligation quote',
      'Get in touch with Luma Tech Solutions',
      'Book your free consultation today',
    ],
  },
  // Funny / viral / meme hooks
  {
    keywords: /\b(imagine|believe|crazy|wild|insane|unreal|epic|fail|oops|why you need|this is why|make this up)\b/i,
    subheads: [
      'Luma Tech Solutions — we capture it all',
      "Don't miss the action — Luma Tech Solutions",
      'This is why you need Luma Tech Solutions',
      'Luma Tech Solutions — expect the unexpected',
      'Caught on camera by Luma Tech Solutions',
    ],
  },
];

// Fallback subheads when nothing matches
const FALLBACK: string[] = [
  'Luma Tech Solutions',
  'Luma Tech Solutions — your local tech partner',
  'CCTV · Smart Home · Networking',
  'Contact Luma Tech Solutions today',
  'Luma Tech Solutions — technology that works for you',
];

let lastPick = new Map<string, number>();

function pickRandom(arr: string[], cacheKey: string): string {
  if (arr.length <= 1) return arr[0] || '';
  const last = lastPick.get(cacheKey);
  let idx: number;
  do {
    idx = Math.floor(Math.random() * arr.length);
  } while (idx === last && arr.length > 1);
  lastPick.set(cacheKey, idx);
  return arr[idx];
}

export function generateSubhead(headline: string): string {
  const trimmed = headline.trim();
  if (!trimmed) return 'Luma Tech Solutions';

  // Find all matching rules and pick the best (first match = most specific)
  for (const rule of RULES) {
    if (rule.keywords.test(trimmed)) {
      return pickRandom(rule.subheads, rule.keywords.source);
    }
  }

  return pickRandom(FALLBACK, '__fallback__');
}
