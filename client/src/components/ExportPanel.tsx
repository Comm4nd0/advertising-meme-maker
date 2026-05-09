import { useState } from 'react';
import { canvasToBlob, renderSlide } from '../lib/renderSlide';
import { startExport, streamProgress } from '../lib/api';
import type { BrandKit, ProbeResult, Slide } from '../types';

interface Props {
  probe: ProbeResult | null;
  slides: Slide[];
  brand: BrandKit | null;
  logoImg: HTMLImageElement | null;
  music: string | null;
  musicVolume: number;
  onExportDone?: () => void;
}

export function ExportPanel({ probe, slides, brand, logoImg, music, musicVolume, onExportDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageDur, setImageDur] = useState(4);

  const canExport = !!(probe && brand && slides.length > 0 && !busy);

  async function onExport() {
    if (!probe || !brand || slides.length === 0) return;
    setBusy(true);
    setProgress(0);
    setOutputUrl(null);
    setError(null);

    try {
      const blobs: Blob[] = [];
      for (const slide of slides) {
        const c = document.createElement('canvas');
        renderSlide({
          canvas: c,
          slide,
          brand,
          logoImg,
          width: probe.width,
          height: probe.height,
        });
        blobs.push(await canvasToBlob(c));
      }

      const start = await startExport({
        jobId: probe.jobId,
        slideBlobs: blobs,
        slideDurations: slides.map((s) => s.durationSec),
        imageDurationSec: imageDur,
        music: music || undefined,
        musicVolume,
      });

      streamProgress(start.exportId, (u) => {
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
