import { useEffect, useRef } from 'react';
import { renderSlide } from '../lib/renderSlide';
import type { BrandKit, ProbeResult, Slide } from '../types';

interface Props {
  mode: 'source' | 'slide';
  sourceUrl: string | null;
  isImage: boolean;
  slide: Slide | null;
  brand: BrandKit | null;
  logoImg: HTMLImageElement | null;
  probe: ProbeResult | null;
}

export function SlidePreview({
  mode,
  sourceUrl,
  isImage,
  slide,
  brand,
  logoImg,
  probe,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (mode !== 'slide') return;
    if (!canvasRef.current || !brand || !slide || !probe) return;
    renderSlide({
      canvas: canvasRef.current,
      slide,
      brand,
      logoImg,
      width: probe.width,
      height: probe.height,
    });
  }, [mode, slide, brand, logoImg, probe]);

  if (!probe) {
    return (
      <div className="preview empty">
        <p>Upload a video or image to start.</p>
      </div>
    );
  }

  const aspectRatio = `${probe.width} / ${probe.height}`;

  return (
    <div className="preview" style={{ aspectRatio }}>
      {mode === 'source' && sourceUrl && !isImage && (
        <video src={sourceUrl} controls playsInline />
      )}
      {mode === 'source' && sourceUrl && isImage && (
        <img src={sourceUrl} alt="source" />
      )}
      {mode === 'slide' && <canvas ref={canvasRef} />}
    </div>
  );
}
