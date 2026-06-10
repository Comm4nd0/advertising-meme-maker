import path from 'path';
import fs from 'fs';

const projectRoot = path.resolve(__dirname, '../../..');

export const paths = {
  root: projectRoot,
  uploads: path.join(projectRoot, 'uploads'),
  output: path.join(projectRoot, 'output'),
  brand: path.join(projectRoot, 'brand'),
  logos: path.join(projectRoot, 'brand', 'logos'),
  music: path.join(projectRoot, 'brand', 'music'),
  clientDist: path.join(projectRoot, 'client', 'dist'),
};

export function ensureDirs(): void {
  for (const p of [paths.uploads, paths.output, paths.brand, paths.logos, paths.music]) {
    fs.mkdirSync(p, { recursive: true });
  }
}

// Reject a user-supplied path segment (filename or job id) that could escape
// its storage root via traversal. Any route that joins such a segment onto a
// storage path MUST gate on this first.
export function isSafeName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..') &&
    !name.includes('\0')
  );
}
