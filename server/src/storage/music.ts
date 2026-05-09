import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { paths } from './paths';

const AUDIO_EXTS = /\.(mp3|wav|ogg|aac|m4a|flac|wma|opus)$/i;

/** Save an uploaded music file. Returns the filename. */
export function saveMusic(buffer: Buffer, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.mp3';
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_\- ]/g, '_')
    .substring(0, 60);

  const candidateName = baseName + ext;
  const candidatePath = path.join(paths.music, candidateName);

  if (fs.existsSync(candidatePath)) {
    const existing = fs.readFileSync(candidatePath);
    if (existing.equals(buffer)) return candidateName;

    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 6);
    const uniqueName = `${baseName}-${hash}${ext}`;
    fs.writeFileSync(path.join(paths.music, uniqueName), buffer);
    return uniqueName;
  }

  fs.writeFileSync(candidatePath, buffer);
  return candidateName;
}

/** List all music filenames in the library */
export function listMusic(): string[] {
  try {
    return fs.readdirSync(paths.music)
      .filter((f) => AUDIO_EXTS.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** Get the full path for a music file, or null if it doesn't exist */
export function musicPath(filename: string): string | null {
  const full = path.join(paths.music, filename);
  return fs.existsSync(full) ? full : null;
}

/** Delete a music file from the library */
export function deleteMusic(filename: string): void {
  const full = path.join(paths.music, filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}
