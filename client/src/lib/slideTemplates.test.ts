import { describe, it, expect } from 'vitest';
import {
  getTemplateSets,
  pickTemplateSet,
  templateSetToSlides,
  ALL_CATEGORIES,
} from './slideTemplates';

describe('templateSetToSlides', () => {
  it('copies template fields and assigns a unique id per slide', () => {
    const set = {
      slides: [
        { headline: 'A', subhead: 'a', durationSec: 3 },
        { headline: 'B', subhead: 'b', durationSec: 4 },
      ],
    };
    const slides = templateSetToSlides(set);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({ headline: 'A', subhead: 'a', durationSec: 3 });
    expect(slides[1]).toMatchObject({ headline: 'B', subhead: 'b', durationSec: 4 });
    expect(slides[0].id).toBeTruthy();
    expect(slides[0].id).not.toBe(slides[1].id);
  });

  it('returns an empty array for an empty set', () => {
    expect(templateSetToSlides({ slides: [] })).toEqual([]);
  });
});

describe('pickTemplateSet', () => {
  it('returns an in-range index and a set with slides', () => {
    const { index, set } = pickTemplateSet('cctv');
    const all = getTemplateSets('cctv');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(all.length);
    expect(set.slides.length).toBeGreaterThan(0);
  });

  it('never returns the excluded index when alternatives exist', () => {
    // 'cctv' has multiple sets, so excludeIndex=0 must always be avoided.
    for (let i = 0; i < 50; i++) {
      expect(pickTemplateSet('cctv', 0).index).not.toBe(0);
    }
  });
});

describe('template catalogue', () => {
  it('lists six categories', () => {
    expect(ALL_CATEGORIES).toHaveLength(6);
  });

  it('every category has at least one set and well-formed slides', () => {
    for (const cat of ALL_CATEGORIES) {
      const sets = getTemplateSets(cat);
      expect(sets.length).toBeGreaterThan(0);
      for (const set of sets) {
        expect(set.slides.length).toBeGreaterThan(0);
        for (const slide of set.slides) {
          expect(slide.headline).toBeTruthy();
          expect(slide.durationSec).toBeGreaterThan(0);
        }
      }
    }
  });
});
