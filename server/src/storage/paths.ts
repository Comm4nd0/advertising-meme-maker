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
