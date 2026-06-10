import { useRef, useState } from 'react';
import { uid } from '../lib/uid';
import { generateSubhead } from '../lib/autoSubhead';
import type { Slide } from '../types';
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  pickTemplateSet,
  templateSetToSlides,
  type Category,
} from '../lib/slideTemplates';

interface Props {
  slides: Slide[];
  selectedId: string | null;
  onChange: (slides: Slide[]) => void;
  onSelect: (id: string | null) => void;
  hasSource: boolean;
}

function newSlide(): Slide {
  return {
    id: uid(),
    headline: '',
    subhead: 'Luma Tech Solutions',
    durationSec: 4,
  };
}

export function SlideEditor({ slides, selectedId, onChange, onSelect, hasSource }: Props) {
  const [category, setCategory] = useState<Category>('cctv');
  const [lastSetIndex, setLastSetIndex] = useState<number | undefined>(undefined);
  // Track which slides have had their subhead manually edited
  const manualSubheadRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<Map<string, number>>(new Map());
  // Keep latest slides + onChange in refs so debounced callbacks never go stale
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function update(id: string, patch: Partial<Slide>) {
    onChange(slides.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function onHeadlineChange(id: string, headline: string) {
    if (manualSubheadRef.current.has(id)) {
      // Subhead was manually edited — only update headline
      update(id, { headline });
      return;
    }

    // Clear existing debounce for this slide
    const existing = debounceRef.current.get(id);
    if (existing) window.clearTimeout(existing);

    // Update headline immediately
    update(id, { headline });

    // Debounce the auto-subhead so it doesn't regenerate on every keystroke
    const timer = window.setTimeout(() => {
      const trimmed = headline.trim();
      if (trimmed.length >= 3) {
        const subhead = generateSubhead(trimmed);
        // Use refs to get the latest slides, avoiding stale closure
        onChangeRef.current(
          slidesRef.current.map((s) => (s.id === id ? { ...s, subhead } : s))
        );
      }
      debounceRef.current.delete(id);
    }, 600);
    debounceRef.current.set(id, timer);
  }

  function onSubheadChange(id: string, subhead: string) {
    manualSubheadRef.current.add(id);
    update(id, { subhead });
  }

  function regenerateSubhead(id: string) {
    const slide = slides.find((s) => s.id === id);
    if (!slide) return;
    manualSubheadRef.current.delete(id);
    const subhead = generateSubhead(slide.headline);
    update(id, { subhead });
  }

  function add() {
    const s = newSlide();
    onChange([...slides, s]);
    onSelect(s.id);
  }
  function remove(id: string) {
    manualSubheadRef.current.delete(id);
    const existing = debounceRef.current.get(id);
    if (existing) window.clearTimeout(existing);
    debounceRef.current.delete(id);
    const next = slides.filter((s) => s.id !== id);
    onChange(next);
    if (selectedId === id) onSelect(next[0]?.id || null);
  }
  function move(id: string, dir: -1 | 1) {
    const idx = slides.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= slides.length) return;
    const next = slides.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function suggest(cat?: Category) {
    const c = cat ?? category;
    const { index, set } = pickTemplateSet(c, lastSetIndex);
    setLastSetIndex(index);
    const newSlides = templateSetToSlides(set);
    // Template slides have pre-paired headlines+subheads, mark them as manual
    // so auto-fill doesn't overwrite the curated copy
    for (const s of newSlides) manualSubheadRef.current.add(s.id);
    onChange(newSlides);
    if (newSlides.length > 0) onSelect(newSlides[0].id);
  }

  function onCategoryChange(cat: Category) {
    setCategory(cat);
    setLastSetIndex(undefined);
    suggest(cat);
  }

  return (
    <div className="slide-editor">
      {/* Auto-suggest controls */}
      <div className="suggest-section">
        <h3>Auto-suggest</h3>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as Category)}
          >
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </label>
        <button className="suggest-button" onClick={() => suggest()} disabled={!hasSource}>
          🔀 Shuffle suggestions
        </button>
      </div>

      <div className="suggest-divider" />

      <div className="slide-editor-header">
        <h3>Outro slides</h3>
        <button onClick={add}>+ Add slide</button>
      </div>

      {slides.length === 0 && (
        <p className="muted">No slides yet. Drop a video above — slides will be suggested automatically.</p>
      )}

      {slides.map((s, i) => {
        const selected = selectedId === s.id;
        return (
          <div key={s.id} className={`slide-row ${selected ? 'selected' : ''}`}>
            <div className="slide-row-head">
              <button className="slide-title" onClick={() => onSelect(selected ? null : s.id)}>
                Slide {i + 1}
              </button>
              <span className="row-actions">
                <button onClick={() => move(s.id, -1)} disabled={i === 0}>Up</button>
                <button onClick={() => move(s.id, 1)} disabled={i === slides.length - 1}>Down</button>
                <button className="danger" onClick={() => remove(s.id)}>Remove</button>
              </span>
            </div>

            {selected && (
              <div className="slide-row-body">
                <label>
                  <span>Headline</span>
                  <input
                    type="text"
                    value={s.headline}
                    placeholder="Type a headline — subhead fills automatically"
                    onChange={(e) => onHeadlineChange(s.id, e.target.value)}
                  />
                </label>
                <label>
                  <span className="subhead-label">
                    Subhead
                    <button
                      className="regen-btn"
                      onClick={() => regenerateSubhead(s.id)}
                      title="Auto-generate subhead from headline"
                    >
                      ↻
                    </button>
                  </span>
                  <input
                    type="text"
                    value={s.subhead}
                    onChange={(e) => onSubheadChange(s.id, e.target.value)}
                  />
                </label>
                <label>
                  <span>Duration (s)</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={0.5}
                    value={s.durationSec}
                    onChange={(e) =>
                      update(s.id, { durationSec: parseFloat(e.target.value) || 4 })
                    }
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
