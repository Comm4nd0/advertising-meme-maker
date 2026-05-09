import type { Slide, BrandKit } from '../types';

export interface RenderArgs {
  canvas: HTMLCanvasElement;
  slide: Slide;
  brand: BrandKit;
  logoImg: HTMLImageElement | null;
  width: number;
  height: number;
}

const FONT_STACK =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function renderSlide(args: RenderArgs): void {
  const { canvas, slide, brand, logoImg, width, height } = args;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (brand.useGradient) {
    const angle = (brand.gradientAngle * Math.PI) / 180;
    const cx = width / 2;
    const cy = height / 2;
    const len = Math.hypot(width, height) / 2;
    const x0 = cx - Math.cos(angle) * len;
    const y0 = cy - Math.sin(angle) * len;
    const x1 = cx + Math.cos(angle) * len;
    const y1 = cy + Math.sin(angle) * len;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, brand.primary);
    grad.addColorStop(1, brand.secondary);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = brand.primary;
  }
  ctx.fillRect(0, 0, width, height);

  const padding = Math.round(Math.min(width, height) * 0.08);
  const maxTextWidth = width - padding * 2;

  let logoBottom = padding;
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    const logoH = Math.round(height * 0.15);
    const ratio = logoImg.naturalWidth / logoImg.naturalHeight;
    const logoW = Math.min(maxTextWidth, Math.round(logoH * ratio));
    const lx = Math.round((width - logoW) / 2);
    const ly = padding;
    ctx.drawImage(logoImg, lx, ly, logoW, logoH);
    logoBottom = ly + logoH;
  }

  const headlineSize = Math.round(height * 0.075);
  const subheadSize = Math.round(height * 0.035);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.font = `700 ${headlineSize}px ${FONT_STACK}`;
  const headlineLines = wrap(ctx, slide.headline || '', maxTextWidth);

  ctx.font = `400 ${subheadSize}px ${FONT_STACK}`;
  const subheadLines = wrap(ctx, slide.subhead || '', maxTextWidth);

  const headlineLineH = Math.round(headlineSize * 1.15);
  const subheadLineH = Math.round(subheadSize * 1.3);
  const gap = Math.round(headlineSize * 0.5);

  const headlineBlockH = headlineLines.length * headlineLineH;
  const subheadBlockH = subheadLines.length * subheadLineH;
  const totalH = headlineBlockH + (subheadBlockH > 0 ? gap + subheadBlockH : 0);

  const regionTop = logoBottom + padding;
  const regionBottom = height - padding;
  let y = regionTop + Math.max(0, (regionBottom - regionTop - totalH) / 2);

  ctx.font = `700 ${headlineSize}px ${FONT_STACK}`;
  ctx.fillStyle = brand.headlineColor;
  for (const line of headlineLines) {
    ctx.fillText(line, width / 2, y);
    y += headlineLineH;
  }

  if (subheadLines.length > 0) {
    y += gap;
    ctx.font = `400 ${subheadSize}px ${FONT_STACK}`;
    ctx.fillStyle = brand.subheadColor;
    for (const line of subheadLines) {
      ctx.fillText(line, width / 2, y);
      y += subheadLineH;
    }
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}
