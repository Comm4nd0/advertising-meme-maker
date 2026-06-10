import type { BrandKit } from '../types';
import { wrapText } from './wrapText';

export interface WatermarkRenderArgs {
  canvas: HTMLCanvasElement;
  brand: BrandKit;
  logoImg: HTMLImageElement | null;
  targetWidth: number;
  targetHeight: number;
}

const FONT_STACK =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function renderWatermark(args: WatermarkRenderArgs): {
  width: number;
  height: number;
} {
  const { canvas, brand, logoImg, targetWidth, targetHeight } = args;

  const handle = brand.handle.trim();
  const hasLogo =
    !!logoImg && logoImg.complete && logoImg.naturalWidth > 0;
  if (!handle && !hasLogo) {
    canvas.width = 1;
    canvas.height = 1;
    return { width: 0, height: 0 };
  }

  const wmHeight = Math.round(targetHeight * 0.07);
  const padX = Math.round(wmHeight * 0.45);
  const padY = Math.round(wmHeight * 0.22);
  const gap = Math.round(wmHeight * 0.32);
  const fontSize = Math.round(wmHeight * 0.42);

  // Measure handle text first (needed to compute total width)
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d')!;
  measureCtx.font = `700 ${fontSize}px ${FONT_STACK}`;
  const handleW = handle ? Math.ceil(measureCtx.measureText(handle).width) : 0;

  let logoW = 0;
  const logoH = wmHeight - padY * 2;
  if (hasLogo) {
    const ratio = logoImg!.naturalWidth / logoImg!.naturalHeight;
    logoW = Math.round(logoH * ratio);
  }

  const innerW = logoW + (logoW > 0 && handleW > 0 ? gap : 0) + handleW;
  const wmWidth = innerW + padX * 2;

  canvas.width = wmWidth;
  canvas.height = wmHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: wmWidth, height: wmHeight };

  // Pill background: semi-transparent dark for readability on any video
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, 0, 0, wmWidth, wmHeight, wmHeight / 2);
  ctx.fill();

  let x = padX;
  if (hasLogo) {
    ctx.drawImage(logoImg!, x, padY, logoW, logoH);
    x += logoW + gap;
  }

  if (handle) {
    ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(handle, x, wmHeight / 2);
  }

  return { width: wmWidth, height: wmHeight };
}

export interface HookRenderArgs {
  canvas: HTMLCanvasElement;
  text: string;
  targetWidth: number;
  targetHeight: number;
}

/**
 * Render hook caption to a full-canvas transparent PNG so the server can
 * overlay it at (0,0) with a simple time-gated overlay filter.
 */
export function renderHookOverlay(args: HookRenderArgs): void {
  const { canvas, text, targetWidth, targetHeight } = args;
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, targetWidth, targetHeight);

  const trimmed = text.trim();
  if (!trimmed) return;

  const padding = Math.round(Math.min(targetWidth, targetHeight) * 0.07);
  const maxTextWidth = targetWidth - padding * 2;
  const fontSize = Math.round(targetHeight * 0.07);
  const lineH = Math.round(fontSize * 1.15);
  const strokeW = Math.max(3, Math.round(fontSize * 0.06));

  ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const lines = wrapText(
    (s) => ctx.measureText(s).width,
    trimmed.toUpperCase(),
    maxTextWidth,
  );
  const topY = Math.round(targetHeight * 0.12);

  // Black outline behind, then white fill
  ctx.lineWidth = strokeW;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#FFFFFF';

  let y = topY;
  for (const line of lines) {
    ctx.strokeText(line, targetWidth / 2, y);
    ctx.fillText(line, targetWidth / 2, y);
    y += lineH;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
