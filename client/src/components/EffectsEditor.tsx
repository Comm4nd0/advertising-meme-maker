export type EffectType = '' | 'buffering';

export interface EffectSettings {
  type: EffectType;
  /** Seconds per buffering burst. */
  durationSec: number;
  /** Number of evenly-distributed bursts (1 = freeze at start only). */
  count: number;
}

interface Props {
  effect: EffectSettings;
  onChange: (effect: EffectSettings) => void;
  hasSource: boolean;
}

const PRESETS: Array<{ id: EffectType; label: string; hint: string }> = [
  { id: '', label: 'None', hint: 'No effect on the source video' },
  {
    id: 'buffering',
    label: 'Buffering',
    hint: 'Spinning loader + "Buffering…" — sells "no more buffering"',
  },
];

export function EffectsEditor({ effect, onChange, hasSource }: Props) {
  const preset = PRESETS.find((p) => p.id === effect.type) || PRESETS[0];

  return (
    <div className="effects-editor">
      <h3>Source effect</h3>
      <p className="muted" style={{ marginBottom: 8, fontSize: '0.85em' }}>
        Plays at the start of the source clip, before the outro slides.
      </p>

      <label className="row">
        <span>Preset</span>
        <select
          value={effect.type}
          onChange={(e) =>
            onChange({ ...effect, type: e.target.value as EffectType })
          }
          disabled={!hasSource}
        >
          {PRESETS.map((p) => (
            <option key={p.id || 'none'} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {effect.type && (
        <>
          <p className="muted" style={{ fontSize: '0.8em', margin: '0 0 6px' }}>
            {preset.hint}
          </p>
          <label className="row">
            <span>Duration (s)</span>
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.5}
              value={effect.durationSec}
              onChange={(e) =>
                onChange({
                  ...effect,
                  durationSec: parseFloat(e.target.value) || 2,
                })
              }
            />
          </label>
          <label className="row">
            <span>Number of bursts</span>
            <input
              type="number"
              min={1}
              max={5}
              step={1}
              value={effect.count}
              onChange={(e) =>
                onChange({
                  ...effect,
                  count: Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1)),
                })
              }
            />
          </label>
          <p className="muted" style={{ fontSize: '0.75em', margin: '0' }}>
            {effect.count === 1
              ? 'One burst at the very start of the source.'
              : `${effect.count} bursts evenly across the source.`}
          </p>
        </>
      )}
    </div>
  );
}
