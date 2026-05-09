import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { paths } from './paths';

export interface BrandColors {
  primary: string;
  secondary: string;
  gradientAngle: number;
  headlineColor: string;
  subheadColor: string;
  useGradient: boolean;
  activeLogo?: string; // filename in brand/logos/
}

const defaultColors: BrandColors = {
  primary: '#0B1F3A',
  secondary: '#1E88E5',
  gradientAngle: 135,
  headlineColor: '#FFFFFF',
  subheadColor: '#E0E7F0',
  useGradient: true,
};

const colorsPath = (): string => path.join(paths.brand, 'colors.json');
const oldLogoPath = (): string => path.join(paths.brand, 'logo.png');

export function readColors(): BrandColors {
  try {
    const raw = fs.readFileSync(colorsPath(), 'utf8');
    return { ...defaultColors, ...JSON.parse(raw) };
  } catch {
    return defaultColors;
  }
}

export function writeColors(colors: BrandColors): void {
  fs.writeFileSync(colorsPath(), JSON.stringify(colors, null, 2));
}

// --- Logo library ---

/** Migrate old single logo.png into logos/ directory if it exists */
export function migrateOldLogo(): void {
  const old = oldLogoPath();
  if (fs.existsSync(old)) {
    const dest = path.join(paths.logos, 'logo.png');
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(old, dest);
    }
    fs.unlinkSync(old);

    // Set as active if none set
    const colors = readColors();
    if (!colors.activeLogo) {
      colors.activeLogo = 'logo.png';
      writeColors(colors);
    }
  }
}

/** Save an uploaded logo to the library. Returns the filename. */
export function saveLogo(buffer: Buffer, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.png';
  // Clean the original name for use as a base
  const baseName = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 40);

  // If a file with this exact name exists and is identical content, reuse it
  const candidateName = baseName + ext;
  const candidatePath = path.join(paths.logos, candidateName);
  if (fs.existsSync(candidatePath)) {
    const existing = fs.readFileSync(candidatePath);
    if (existing.equals(buffer)) {
      return candidateName; // Same file, reuse
    }
    // Different content, add a short hash suffix
    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 6);
    const uniqueName = `${baseName}-${hash}${ext}`;
    fs.writeFileSync(path.join(paths.logos, uniqueName), buffer);
    return uniqueName;
  }

  fs.writeFileSync(candidatePath, buffer);
  return candidateName;
}

/** List all logo filenames in the library */
export function listLogos(): string[] {
  try {
    return fs.readdirSync(paths.logos)
      .filter((f) => /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** Set the active logo by filename */
export function setActiveLogo(filename: string): void {
  const full = path.join(paths.logos, filename);
  if (!fs.existsSync(full)) {
    throw new Error(`Logo not found: ${filename}`);
  }
  const colors = readColors();
  colors.activeLogo = filename;
  writeColors(colors);
}

/** Get the active logo URL, or null */
export function activeLogoUrl(): string | null {
  const colors = readColors();
  if (colors.activeLogo) {
    const full = path.join(paths.logos, colors.activeLogo);
    if (fs.existsSync(full)) return `/brand/logos/${colors.activeLogo}`;
  }
  return null;
}

/** Delete a logo from the library. If it was active, clears active. */
export function deleteLogo(filename: string): void {
  const full = path.join(paths.logos, filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
  const colors = readColors();
  if (colors.activeLogo === filename) {
    colors.activeLogo = undefined;
    writeColors(colors);
  }
}

// Legacy compat
export function logoExists(): boolean {
  return activeLogoUrl() !== null;
}

export function writeLogo(buffer: Buffer): void {
  const name = saveLogo(buffer, 'logo.png');
  setActiveLogo(name);
}
