import fs from 'fs';
import path from 'path';
import { paths } from './paths';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function cleanupOldUploads(): void {
  if (!fs.existsSync(paths.uploads)) return;
  const now = Date.now();
  for (const entry of fs.readdirSync(paths.uploads)) {
    const full = path.join(paths.uploads, entry);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > ONE_DAY_MS) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    } catch {
      // ignore — best-effort cleanup
    }
  }
}
