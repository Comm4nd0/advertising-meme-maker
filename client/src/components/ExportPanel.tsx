import { useEffect, useRef, useState } from 'react';
import { canvasToBlob, renderSlide } from '../lib/renderSlide';
import { renderWatermark, renderHookOverlay } from '../lib/renderWatermark';
import { ALL_ASPECTS, ASPECT_LABELS, targetDims } from '../lib/aspectRatio';
import { startExport, streamProgress } from '../lib/api';
import { qrCanvasFor } from '../lib/qr';
import { withUtm } from '../lib/utm';
import type {
  AspectRatio,
  BrandKit,
  HookSettings,
  ProbeResult,
  Slide,
  SocialCopy,
} from '../types';

interface Props {
  probe: ProbeResult | null;
  slides: Slide[];
  brand: BrandKit | null;
  logoImg: HTMLImageElement | null;
  music: string | null;
  musicVolume: number;
  onExportDone?: () => void;
  trimStart: number;
  trimEnd: number;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (a: AspectRatio) => void;
  hook: HookSettings;
  voiceEnabled: boolean;
  voiceName: string;
  effect: { type: '' | 'buffering'; durationSec: number; count: number };
  social: SocialCopy | null;
}

// Formats covered by "Export all formats" — one render per major placement.
const BATCH_ASPECTS: AspectRatio[] = ['9:16', '1:1', '4:5'];

function variantLabel(aspect: AspectRatio): string {
  return aspect === 'source' ? 'src' : aspect.replace(':', 'x');
}

export function ExportPanel({
  probe,
  slides,
  brand,
  logoImg,
  music,
  musicVolume,
  onExportDone,
  trimStart,
  trimEnd,
  aspectRatio,
  onAspectRatioChange,
  hook,
  voiceEnabled,
  voiceName,
  effect,
  social,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [outputUrls, setOutputUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imageDur, setImageDur] = useState(4);
  const [exportAll, setExportAll] = useState(false);
  const [copied, setCopied] = useState<'caption' | 'comment' | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);

  // Close any live progress stream if the panel unmounts mid-encode.
  useEffect(() => () => stopStreamRef.current?.(), []);

  const canExport = !!(probe && brand && slides.length > 0 && !busy);

  // Run one full render+encode for a single aspect ratio; resolves with the
  // output URL once the server finishes.
  async function runOneExport(
    aspect: AspectRatio,
    formatIndex: number,
    formatCount: number,
  ): Promise<string> {
    if (!probe || !brand) throw new Error('No source or brand loaded');
    const dims = targetDims(aspect, probe.width, probe.height);

    // One QR per format: UTM content tag records which placement was scanned.
    let qr: HTMLCanvasElement | null = null;
    const wantQr = brand.ctaUrl.trim() && slides.some((s) => s.showCta);
    if (wantQr) {
      const qrUrl = withUtm(brand.ctaUrl, {
        source: 'social',
        medium: 'video',
        campaign: probe.jobId.slice(0, 8),
        content: variantLabel(aspect),
      });
      qr = await qrCanvasFor(qrUrl).catch(() => null);
    }

    // Render outro slides at target dims so they match the final canvas
    const slideBlobs: Blob[] = [];
    for (const slide of slides) {
      const c = document.createElement('canvas');
      renderSlide({
        canvas: c,
        slide,
        brand,
        logoImg,
        width: dims.width,
        height: dims.height,
        qrCanvas: qr,
      });
      slideBlobs.push(await canvasToBlob(c));
    }

    // Render watermark PNG (small overlay) if enabled
    let watermarkBlob: Blob | undefined;
    const handleSet = brand.handle.trim().length > 0;
    const hasLogo = !!logoImg && logoImg.complete && logoImg.naturalWidth > 0;
    if (brand.watermarkEnabled && (handleSet || hasLogo)) {
      const c = document.createElement('canvas');
      const size = renderWatermark({
        canvas: c,
        brand,
        logoImg,
        targetWidth: dims.width,
        targetHeight: dims.height,
      });
      if (size.width > 0 && size.height > 0) {
        watermarkBlob = await canvasToBlob(c);
      }
    }

    // Render hook overlay PNG (full-canvas, transparent) if text set
    let hookBlob: Blob | undefined;
    const hookText = hook.text.trim();
    if (hookText) {
      const c = document.createElement('canvas');
      renderHookOverlay({
        canvas: c,
        text: hookText,
        targetWidth: dims.width,
        targetHeight: dims.height,
      });
      hookBlob = await canvasToBlob(c);
    }

    // Build per-slide voiceover text — headline only. Empty strings tell
    // the server "no voice for this slide".
    const slideTexts = slides.map((s) => s.headline.trim());

    const start = await startExport({
      jobId: probe.jobId,
      slideBlobs,
      slideDurations: slides.map((s) => s.durationSec),
      imageDurationSec: imageDur,
      music: music || undefined,
      musicVolume,
      trimStart,
      trimEnd,
      targetWidth: dims.width,
      targetHeight: dims.height,
      watermarkBlob,
      watermarkPosition: brand.watermarkPosition,
      hookBlob,
      hookDurationSec: hookText ? hook.durationSec : 0,
      voiceEnabled,
      voiceName,
      slideTexts,
      effectType: effect.type || undefined,
      effectDurationSec: effect.type ? effect.durationSec : undefined,
      effectCount: effect.type ? effect.count : undefined,
      variant: formatCount > 1 ? variantLabel(aspect) : undefined,
    });

    return new Promise<string>((resolve, reject) => {
      stopStreamRef.current?.();
      stopStreamRef.current = streamProgress(start.exportId, (u) => {
        // Weight this format's progress into the overall batch percentage.
        setProgress(((formatIndex + u.progress / 100) / formatCount) * 100);
        if (u.status === 'done') {
          resolve(u.outputUrl || start.outputUrl);
        } else if (u.status === 'error') {
          reject(new Error(u.error || 'Unknown error'));
        } else if (u.status === 'unknown') {
          reject(new Error('Lost track of export job'));
        }
      });
    });
  }

  async function onExport() {
    if (!probe || !brand || slides.length === 0) return;
    setBusy(true);
    setProgress(0);
    setOutputUrls([]);
    setError(null);

    try {
      // Ensure the brand font is loaded before rasterizing slides, so the first
      // export matches later ones — canvas text silently falls back to a system
      // font on a cold font cache, which would otherwise differ from the UI.
      if (document.fonts) {
        await Promise.all([
          document.fonts.load('400 16px Inter'),
          document.fonts.load('700 16px Inter'),
          document.fonts.load('800 16px Inter'),
        ]);
        await document.fonts.ready;
      }

      const formats = exportAll ? BATCH_ASPECTS : [aspectRatio];
      const urls: string[] = [];
      for (let i = 0; i < formats.length; i++) {
        setProgressLabel(
          formats.length > 1 ? `${ASPECT_LABELS[formats[i]].split(' — ')[0]} (${i + 1}/${formats.length})` : '',
        );
        const url = await runOneExport(formats[i], i, formats.length);
        urls.push(url);
        setOutputUrls([...urls]);
      }
      onExportDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgressLabel('');
    }
  }

  async function copyText(text: string, which: 'caption' | 'comment') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
    } catch {
      /* clipboard unavailable (non-secure context) — ignore */
    }
  }

  return (
    <div className="export-panel">
      <label className="row">
        <span>Aspect ratio</span>
        <select
          value={aspectRatio}
          onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
          disabled={exportAll}
        >
          {ALL_ASPECTS.map((a) => (
            <option key={a} value={a}>
              {ASPECT_LABELS[a]}
            </option>
          ))}
        </select>
      </label>

      <label className="row inline">
        <input
          type="checkbox"
          checked={exportAll}
          onChange={(e) => setExportAll(e.target.checked)}
        />
        <span>Export all formats (9:16 + 1:1 + 4:5)</span>
      </label>

      {probe?.isImage && (
        <label className="row">
          <span>Image hold (s)</span>
          <input
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={imageDur}
            onChange={(e) => setImageDur(parseFloat(e.target.value) || 4)}
          />
        </label>
      )}

      <button className="export-button" disabled={!canExport} onClick={onExport}>
        {busy
          ? `Encoding${progressLabel ? ` ${progressLabel}` : '…'} ${Math.round(progress)}%`
          : exportAll
            ? 'Export 3 videos'
            : 'Export video'}
      </button>

      {busy && <progress value={progress} max={100} />}

      {outputUrls.map((url) => (
        <p className="download-line" key={url}>
          <a href={url} download>
            Download {url.split('/').pop()}
          </a>
          <video src={url} controls playsInline className="output-preview" />
        </p>
      ))}

      {outputUrls.length > 0 && social && (social.caption || social.firstComment) && (
        <div className="social-copy">
          {social.caption && (
            <div className="social-copy-block">
              <div className="social-copy-head">
                <span>Suggested caption</span>
                <button onClick={() => copyText(social.caption, 'caption')}>
                  {copied === 'caption' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <p className="muted">{social.caption}</p>
            </div>
          )}
          {social.firstComment && (
            <div className="social-copy-block">
              <div className="social-copy-head">
                <span>Suggested first comment</span>
                <button onClick={() => copyText(social.firstComment, 'comment')}>
                  {copied === 'comment' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <p className="muted">{social.firstComment}</p>
            </div>
          )}
        </div>
      )}

      {error && <pre className="error">{error}</pre>}
    </div>
  );
}
