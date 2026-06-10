/**
 * Seed list of subreddits to pull meme candidates from.
 *
 * Each entry is tagged with a Luma Tech Solutions tagline angle so the
 * generated outro slide picks an on-brand template. Edit this list to add
 * or remove sources.
 */

export type MemeCategory = 'cctv' | 'public-freakout' | 'fail' | 'generic-funny' | 'wholesome';

export interface RedditSource {
  subreddit: string;
  category: MemeCategory;
}

export const REDDIT_SOURCES: RedditSource[] = [
  // "Would your CCTV catch this?" angle — dashcam / caught-on-camera
  { subreddit: 'IdiotsInCars', category: 'cctv' },
  { subreddit: 'Roadcam', category: 'cctv' },
  { subreddit: 'CCTVexposure', category: 'cctv' },

  // "Could you handle this incident?" angle
  { subreddit: 'PublicFreakout', category: 'public-freakout' },
  { subreddit: 'instant_regret', category: 'public-freakout' },

  // "Never miss the chaos" / fail-style angle
  { subreddit: 'Whatcouldgowrong', category: 'fail' },
  { subreddit: 'Unexpected', category: 'fail' },

  // Generic feel-good / funny
  { subreddit: 'funny', category: 'generic-funny' },
  { subreddit: 'MadeMeSmile', category: 'wholesome' },
];

export const CATEGORY_LABELS: Record<MemeCategory, string> = {
  'cctv': 'CCTV / caught on camera',
  'public-freakout': 'Public incident',
  'fail': 'Unexpected fail',
  'generic-funny': 'Funny',
  'wholesome': 'Wholesome',
};
