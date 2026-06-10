import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'fs';

export interface TtsVoice {
  id: string;
  label: string;
}

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

export async function synthesize(
  text: string,
  voice: string,
  outDir: string,
): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });

  // msedge-tts intermittently returns "No audio data received" — usually a
  // websocket race on the first call. Retry with exponential backoff and
  // validate the file is non-empty before considering it a success.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioFilePath } = await tts.toFile(outDir, text);
      const size = fs.statSync(audioFilePath).size;
      if (size === 0) {
        // Clean up the empty file so a retry doesn't pick up a stale path.
        try { fs.unlinkSync(audioFilePath); } catch { /* ignore */ }
        throw new Error('Edge TTS returned empty audio file');
      }
      if (attempt > 0) {
        console.log(`[tts] succeeded on attempt ${attempt + 1}`);
      }
      return audioFilePath;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[tts] attempt ${attempt + 1}/3 failed: ${msg}`);
      // Backoff: 350ms, 700ms before subsequent attempts.
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    } finally {
      tts.close();
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
