import { TTS_VOICES } from '../lib/ttsVoices';

interface Props {
  enabled: boolean;
  voice: string;
  onEnabledChange: (enabled: boolean) => void;
  onVoiceChange: (voice: string) => void;
}

export function VoiceoverPicker({ enabled, voice, onEnabledChange, onVoiceChange }: Props) {
  return (
    <div className="voiceover-picker">
      <h3>AI voiceover</h3>
      <p className="muted" style={{ marginBottom: 8 }}>
        Reads each outro slide's headline and subhead aloud.
      </p>

      <label className="row">
        <span>Enable voiceover</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
      </label>

      {enabled && (
        <label className="row">
          <span>Voice</span>
          <select value={voice} onChange={(e) => onVoiceChange(e.target.value)}>
            {TTS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
