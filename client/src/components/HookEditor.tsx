import type { HookSettings } from '../types';

interface Props {
  hook: HookSettings;
  onChange: (hook: HookSettings) => void;
  hasSource: boolean;
}

export function HookEditor({ hook, onChange, hasSource }: Props) {
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
