import { useState } from 'react';
import { uid } from '../lib/uid';
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
    headline: 'Your headline here',
    subhead: 'Luma Tech Solutions',
    durationSec: 4,
  };
}

export function SlideEditor({ slides, selectedId, onChange, onSelect, hasSource }: Props) {
  const [category, setCategory] = useState<Category>('cctv');
  const [lastSetIndex, setLastSetIndex] = useState<number | undefined>(undefined);

  function update(id: string, patch: Partial<Slide>) {
    onChange(slides.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function add() {
    const s = newSlide();
    onChange([...slides, s]);
    onSelect(s.id);
  }
  function remove(id: string) {
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
                    onChange={(e) => update(s.id, { headline: e.target.value })}
                  />
                </label>
                <label>
                  <span>Subhead</span>
                  <input
                    type="text"
                    value={s.subhead}
                    onChange={(e) => update(s.id, { subhead: e.target.value })}
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
