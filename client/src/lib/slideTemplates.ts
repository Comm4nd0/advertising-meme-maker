import { uid } from './uid';
import type { Slide } from '../types';

export interface SlideTemplate {
  headline: string;
  subhead: string;
  durationSec: number;
}

export interface TemplateSet {
  slides: SlideTemplate[];
}

export type Category =
  | 'cctv'
  | 'smart-home'
  | 'business'
  | 'access-control'
  | 'networking'
  | 'general';

export const CATEGORY_LABELS: Record<Category, string> = {
  cctv: 'CCTV & Security',
  'smart-home': 'Smart Home',
  business: 'Business Security',
  'access-control': 'Access Control',
  networking: 'Networking & Wi-Fi',
  general: 'General',
};

const TEMPLATES: Record<Category, TemplateSet[]> = {
  cctv: [
    {
      slides: [
        { headline: 'Never miss a moment', subhead: 'Professional CCTV from Luma Tech Solutions', durationSec: 4 },
        { headline: 'See everything. Worry about nothing.', subhead: 'Call us today for a free quote', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: "You can't make this up", subhead: 'But you CAN capture it all on camera', durationSec: 3 },
        { headline: 'Crystal clear CCTV', subhead: 'Luma Tech Solutions — protecting what matters', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Caught on camera!', subhead: '24/7 recording so you never miss a thing', durationSec: 3 },
        { headline: 'Professional CCTV installation', subhead: 'Luma Tech Solutions', durationSec: 3 },
        { headline: 'Get your free quote today', subhead: 'lumatechsolutions.co.uk', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'This is why you need cameras', subhead: 'High definition. Day and night.', durationSec: 4 },
        { headline: 'Luma Tech Solutions', subhead: 'CCTV you can rely on — contact us today', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Would YOUR cameras catch this?', subhead: "If not, it's time for an upgrade", durationSec: 4 },
        { headline: 'HD CCTV from Luma Tech Solutions', subhead: 'Free survey & no-obligation quote', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Imagine missing this...', subhead: "With Luma Tech, you won't", durationSec: 3 },
        { headline: '4K CCTV systems installed', subhead: 'Homes & businesses across the UK', durationSec: 3 },
        { headline: 'Luma Tech Solutions', subhead: 'Your local security experts', durationSec: 4 },
      ],
    },
  ],

  'smart-home': [
    {
      slides: [
        { headline: 'Your home, smarter', subhead: 'Smart home solutions from Luma Tech', durationSec: 4 },
        { headline: 'Control everything from your phone', subhead: 'Lighting, heating, cameras & more', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Welcome to the future', subhead: 'Smart home tech that actually works', durationSec: 3 },
        { headline: 'Luma Tech Solutions', subhead: 'Making your home work for you', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Life made easier', subhead: 'Automate your home with Luma Tech', durationSec: 4 },
        { headline: 'Smart lighting. Smart security. Smart living.', subhead: 'Get in touch for a free consultation', durationSec: 4 },
      ],
    },
  ],

  business: [
    {
      slides: [
        { headline: 'Protect what matters most', subhead: 'Business security from Luma Tech Solutions', durationSec: 4 },
        { headline: '24/7 eyes on your business', subhead: 'CCTV, alarms & access control', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: "Don't leave it to chance", subhead: 'Secure your premises with professional CCTV', durationSec: 4 },
        { headline: 'Luma Tech Solutions', subhead: 'Trusted by businesses across the UK', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Your business deserves better security', subhead: 'Tailored systems for every sector', durationSec: 3 },
        { headline: 'Retail, office, warehouse & more', subhead: 'Luma Tech Solutions has you covered', durationSec: 3 },
        { headline: 'Book your free site survey', subhead: 'lumatechsolutions.co.uk', durationSec: 4 },
      ],
    },
  ],

  'access-control': [
    {
      slides: [
        { headline: 'Who just walked in?', subhead: 'Know exactly who enters your building', durationSec: 4 },
        { headline: 'Access control from Luma Tech', subhead: 'Keyless entry, intercoms & smart locks', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Keys are so last century', subhead: 'Upgrade to smart access control', durationSec: 3 },
        { headline: 'Luma Tech Solutions', subhead: 'Secure access for homes & businesses', durationSec: 4 },
      ],
    },
  ],

  networking: [
    {
      slides: [
        { headline: 'Buffering? Not on our watch.', subhead: 'Professional Wi-Fi & networking solutions', durationSec: 4 },
        { headline: 'Luma Tech Solutions', subhead: 'Fast, reliable connectivity — everywhere', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Dead zones? We kill those.', subhead: 'Whole-home & whole-office Wi-Fi coverage', durationSec: 4 },
        { headline: 'Network installations by Luma Tech', subhead: 'Structured cabling, Wi-Fi & more', durationSec: 4 },
      ],
    },
  ],

  general: [
    {
      slides: [
        { headline: 'Technology that works for you', subhead: 'Luma Tech Solutions', durationSec: 4 },
        { headline: 'CCTV · Smart Home · Networking', subhead: 'Get in touch for a free consultation', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Need a tech upgrade?', subhead: "We've got you covered", durationSec: 3 },
        { headline: 'Luma Tech Solutions', subhead: 'Your local technology partner', durationSec: 4 },
      ],
    },
    {
      slides: [
        { headline: 'Tech done right', subhead: 'From installation to support', durationSec: 3 },
        { headline: 'Luma Tech Solutions', subhead: 'Security · Smart Home · Networks', durationSec: 3 },
        { headline: 'Contact us today', subhead: 'lumatechsolutions.co.uk', durationSec: 4 },
      ],
    },
  ],
};

/** Returns all template sets for a category */
export function getTemplateSets(cat: Category): TemplateSet[] {
  return TEMPLATES[cat];
}

/** Returns a random template set for a category, optionally excluding one index */
export function pickTemplateSet(cat: Category, excludeIndex?: number): { index: number; set: TemplateSet } {
  const sets = TEMPLATES[cat];
  if (sets.length === 0) return { index: 0, set: { slides: [] } };

  if (sets.length === 1) return { index: 0, set: sets[0] };

  let idx: number;
  do {
    idx = Math.floor(Math.random() * sets.length);
  } while (idx === excludeIndex && sets.length > 1);

  return { index: idx, set: sets[idx] };
}

/** Convert a TemplateSet into Slide[] with unique IDs. The final slide carries
 * the brand call-to-action so every suggested outro ends with a next step. */
export function templateSetToSlides(set: TemplateSet): Slide[] {
  return set.slides.map((t, i) => ({
    id: uid(),
    headline: t.headline,
    subhead: t.subhead,
    durationSec: t.durationSec,
    showCta: i === set.slides.length - 1,
  }));
}

/** All categories in display order */
export const ALL_CATEGORIES: Category[] = [
  'cctv',
  'smart-home',
  'business',
  'access-control',
  'networking',
  'general',
];
