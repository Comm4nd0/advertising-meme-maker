import type { HookSettings } from '../types';

interface Props {
  hook: HookSettings;
  onChange: (hook: HookSettings) => void;
  hasSource: boolean;
  // AI-suggested hook options from Discover — shown as one-tap choices.
  variants: string[];
}

export function HookEditor({ hook, onChange, hasSource, variants }: Props) {
  return (
    <div className="hook-editor">
      <label>
        <span>Hook (first {hook.durationSec}s)</span>
        <input
          type="text"
          placeholder='e.g. "Wait for it…"  (leave blank to skip)'
          value={hook.text}
          onChange={(e) => onChange({ ...hook, text: e.target.value })}
          disabled={!hasSource}
        />
      </label>
      {variants.length > 0 && (
        <div className="hook-variants">
          {variants.map((v) => (
            <button
              key={v}
              className={hook.text === v ? 'pill active' : 'pill'}
              onClick={() => onChange({ ...hook, text: v })}
              disabled={!hasSource}
              title="AI-suggested hook — tap to use"
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {hook.text.trim() && (
        <label>
          <span>Hook duration: {hook.durationSec}s</span>
          <input
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={hook.durationSec}
            onChange={(e) =>
              onChange({ ...hook, durationSec: parseFloat(e.target.value) })
            }
            disabled={!hasSource}
          />
        </label>
      )}
    </div>
  );
}
