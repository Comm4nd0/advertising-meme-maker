import type { Slide, BrandKit } from '../types';
import { wrapText } from './wrapText';
import { roundRect } from './canvasUtil';

export interface RenderArgs {
  canvas: HTMLCanvasElement;
  slide: Slide;
  brand: BrandKit;
  logoImg: HTMLImageElement | null;
  width: number;
  height: number;
  // Pre-rendered QR code (see lib/qr.ts) — drawn when the slide shows a CTA
  // and the brand has a CTA URL.
  qrCanvas?: HTMLCanvasElement | null;
}

const FONT_STACK =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function renderSlide(args: RenderArgs): void {
  const { canvas, slide, brand, logoImg, width, height, qrCanvas } = args;
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

  const measure = (s: string) => ctx.measureText(s).width;

  // CTA block (button pill, offer code, QR) stacks bottom-up from the lower
  // edge; the headline/subhead region is centered in whatever space remains.
  const ctaBottomReserve = slide.showCta
    ? renderCtaBlock(ctx, brand, qrCanvas ?? null, width, height, padding)
    : 0;

  ctx.font = `700 ${headlineSize}px ${FONT_STACK}`;
  const headlineLines = wrapText(measure, slide.headline || '', maxTextWidth);

  ctx.font = `400 ${subheadSize}px ${FONT_STACK}`;
  const subheadLines = wrapText(measure, slide.subhead || '', maxTextWidth);

  const headlineLineH = Math.round(headlineSize * 1.15);
  const subheadLineH = Math.round(subheadSize * 1.3);
  const gap = Math.round(headlineSize * 0.5);

  const headlineBlockH = headlineLines.length * headlineLineH;
  const subheadBlockH = subheadLines.length * subheadLineH;
  const totalH = headlineBlockH + (subheadBlockH > 0 ? gap + subheadBlockH : 0);

  const regionTop = logoBottom + padding;
  const regionBottom = height - padding - ctaBottomReserve;
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

/**
 * Draw the CTA stack (button pill above offer code above QR) anchored to the
 * bottom edge. Returns the vertical space consumed, measured up from
 * `height - padding`, so the caller can shrink the text region.
 */
function renderCtaBlock(
  ctx: CanvasRenderingContext2D,
  brand: BrandKit,
  qrCanvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  padding: number,
): number {
  const ctaText = brand.ctaText.trim();
  const offerCode = brand.offerCode.trim();
  const hasQr = !!qrCanvas && brand.ctaUrl.trim().length > 0;
  if (!ctaText && !offerCode && !hasQr) return 0;

  const gap = Math.round(height * 0.022);
  let bottom = height - padding;

  if (hasQr) {
    const qrSize = Math.round(height * 0.16);
    const qx = Math.round((width - qrSize) / 2);
    const qy = bottom - qrSize;
    // White card behind the QR so it scans on any brand color.
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, qx - 2, qy - 2, qrSize + 4, qrSize + 4, Math.round(qrSize * 0.06));
    ctx.fill();
    ctx.drawImage(qrCanvas!, qx, qy, qrSize, qrSize);
    bottom = qy - gap;
  }

  if (offerCode) {
    const codeSize = Math.round(height * 0.03);
    ctx.font = `700 ${codeSize}px ${FONT_STACK}`;
    const textW = Math.ceil(ctx.measureText(offerCode).width);
    const boxH = Math.round(codeSize * 2);
    const boxW = Math.min(width - padding * 2, textW + codeSize * 2);
    const bx = Math.round((width - boxW) / 2);
    const by = bottom - boxH;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = Math.max(2, Math.round(codeSize * 0.1));
    ctx.setLineDash([codeSize * 0.5, codeSize * 0.35]);
    roundRect(ctx, bx, by, boxW, boxH, Math.round(boxH * 0.25));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(offerCode, width / 2, by + boxH / 2);
    bottom = by - gap;
  }

  if (ctaText) {
    const ctaSize = Math.round(height * 0.034);
    ctx.font = `700 ${ctaSize}px ${FONT_STACK}`;
    const textW = Math.ceil(ctx.measureText(ctaText).width);
    const pillH = Math.round(ctaSize * 2.4);
    const pillW = Math.min(width - padding * 2, textW + Math.round(ctaSize * 2.4));
    const px = Math.round((width - pillW) / 2);
    const py = bottom - pillH;
    // White button with primary-color text reads as clickable on any gradient.
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = brand.primary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ctaText, width / 2, py + pillH / 2);
    bottom = py - gap;
  }

  // Restore baseline used by the headline/subhead pass.
  ctx.textBaseline = 'top';
  return height - padding - bottom;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}
