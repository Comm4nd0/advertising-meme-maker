export interface TtsVoice {
  id: string;
  label: string;
}

// Mirrors server/src/tts/edge.ts — keep in sync.
export const TTS_VOICES: TtsVoice[] = [
  { id: 'en-US-AriaNeural', label: 'Aria — US Female (warm)' },
  { id: 'en-US-GuyNeural', label: 'Guy — US Male (casual)' },
  { id: 'en-US-JennyNeural', label: 'Jenny — US Female (professional)' },
  { id: 'en-US-DavisNeural', label: 'Davis — US Male (confident)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia — UK Female' },
  { id: 'en-GB-RyanNeural', label: 'Ryan — UK Male' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha — AU Female' },
];

export const DEFAULT_VOICE = 'en-US-AriaNeural';
