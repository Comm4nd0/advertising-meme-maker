import { useEffect, useRef, useState } from 'react';
import { canvasToBlob, renderSlide } from '../lib/renderSlide';
import { renderWatermark, renderHookOverlay } from '../lib/renderWatermark';
import { ALL_ASPECTS, ASPECT_LABELS, targetDims } from '../lib/aspectRatio';
import { startExport, streamProgress } from '../lib/api';
import type {
  AspectRatio,
  BrandKit,
  HookSettings,
  ProbeResult,
  Slide,
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
}: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageDur, setImageDur] = useState(4);
  const stopStreamRef = useRef<(() => void) | null>(null);

  // Close any live progress stream if the panel unmounts mid-encode.
  useEffect(() => () => stopStreamRef.current?.(), []);

  const canExport = !!(probe && brand && slides.length > 0 && !busy);

  async function onExport() {
    if (!probe || !brand || slides.length === 0) return;
    setBusy(true);
    setProgress(0);
    setOutputUrl(null);
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

      const dims = targetDims(aspectRatio, probe.width, probe.height);

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
        });
        slideBlobs.push(await canvasToBlob(c));
      }

      // Render watermark PNG (small overlay) if enabled
      let watermarkBlob: Blob | undefined;
      const handleSet = brand.handle.trim().length > 0;
      const hasLogo =
        !!logoImg && logoImg.complete && logoImg.naturalWidth > 0;
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
      });

      stopStreamRef.current?.();
      stopStreamRef.current = streamProgress(start.exportId, (u) => {
        setProgress(u.progress);
        if (u.status === 'done') {
          setOutputUrl(u.outputUrl || start.outputUrl);
          setBusy(false);
          onExportDone?.();
        } else if (u.status === 'error') {
          setError(u.error || 'Unknown error');
          setBusy(false);
        } else if (u.status === 'unknown') {
          setError('Lost track of export job');
          setBusy(false);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="export-panel">
      <label className="row">
        <span>Aspect ratio</span>
        <select
          value={aspectRatio}
          onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
        >
          {ALL_ASPECTS.map((a) => (
            <option key={a} value={a}>
              {ASPECT_LABELS[a]}
            </option>
          ))}
        </select>
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
        {busy ? `Encoding… ${Math.round(progress)}%` : 'Export video'}
      </button>

      {busy && <progress value={progress} max={100} />}

      {outputUrl && (
        <p className="download-line">
          <a href={outputUrl} download>Download mp4</a>
          <video src={outputUrl} controls playsInline className="output-preview" />
        </p>
      )}

      {error && <pre className="error">{error}</pre>}
    </div>
  );
}
