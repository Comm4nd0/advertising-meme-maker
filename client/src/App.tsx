import { useCallback, useEffect, useState } from 'react';
import { InputDropzone } from './components/InputDropzone';
import { BrandSettings } from './components/BrandSettings';
import { SlideEditor } from './components/SlideEditor';
import { SlidePreview } from './components/SlidePreview';
import { ExportPanel } from './components/ExportPanel';
import { MusicPicker } from './components/MusicPicker';
import { OutputHistory } from './components/OutputHistory';
import { pickTemplateSet, templateSetToSlides } from './lib/slideTemplates';
import type { BrandKit, ProbeResult, Slide } from './types';

export function App() {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(80);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  function onBrandChange(b: BrandKit, logoUrl: string | null) {
    setBrand(b);
    if (logoUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setLogoImg(img);
      img.onerror = () => setLogoImg(null);
      img.src = logoUrl + '?v=' + Math.floor(Date.now() / 1000);
    } else {
      setLogoImg(null);
    }
  }

  function onUploaded(p: ProbeResult, file: File) {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setProbe(p);
    setSourceUrl(URL.createObjectURL(file));

    // Auto-suggest slides on first upload (only if none exist yet)
    if (slides.length === 0) {
      const { set } = pickTemplateSet('cctv');
      const suggested = templateSetToSlides(set);
      setSlides(suggested);
      if (suggested.length > 0) setSelectedSlideId(suggested[0].id);
    } else {
      setSelectedSlideId(null);
    }
  }

  const onExportDone = useCallback(() => {
    setHistoryKey((k) => k + 1);
  }, []);

  const previewMode: 'source' | 'slide' = selectedSlideId ? 'slide' : 'source';
  const selectedSlide = slides.find((s) => s.id === selectedSlideId) || null;

  return (
    <div className="app">
      <aside className="panel left">
        <h2>1. Source meme</h2>
        <InputDropzone onUploaded={onUploaded} />
        {probe && (
          <p className="muted">
            {probe.isImage ? 'Image' : 'Video'} · {probe.width}×{probe.height}
            {!probe.isImage && (
              <>
                {' '}· {probe.durationSec.toFixed(1)}s ·{' '}
                {probe.hasAudio ? 'with audio' : 'silent'}
              </>
            )}
          </p>
        )}
        <hr />
        <h2>2. Brand</h2>
        <BrandSettings onChange={onBrandChange} />
      </aside>

      <main className="panel center">
        <SlidePreview
          mode={previewMode}
          sourceUrl={sourceUrl}
          isImage={probe?.isImage ?? false}
          slide={selectedSlide}
          brand={brand}
          logoImg={logoImg}
          probe={probe}
        />
        {probe && (
          <div className="preview-controls">
            <button
              className={previewMode === 'source' ? 'pill active' : 'pill'}
              onClick={() => setSelectedSlideId(null)}
            >
              Source
            </button>
            {slides.map((s, i) => (
              <button
                key={s.id}
                className={selectedSlideId === s.id ? 'pill active' : 'pill'}
                onClick={() => setSelectedSlideId(s.id)}
              >
                Slide {i + 1}
              </button>
            ))}
          </div>
        )}
      </main>

      <aside className="panel right">
        <h2>3. Outro</h2>
        <SlideEditor
          slides={slides}
          selectedId={selectedSlideId}
          onChange={setSlides}
          onSelect={setSelectedSlideId}
          hasSource={!!probe}
        />
        <hr />
        <MusicPicker
          selectedMusic={selectedMusic}
          musicVolume={musicVolume}
          onMusicChange={setSelectedMusic}
          onVolumeChange={setMusicVolume}
        />
        <hr />
        <h2>4. Export</h2>
        <ExportPanel
          probe={probe}
          slides={slides}
          brand={brand}
          logoImg={logoImg}
          music={selectedMusic}
          musicVolume={musicVolume}
          onExportDone={onExportDone}
        />
        <hr />
        <h2>Previous exports</h2>
        <OutputHistory refreshKey={historyKey} />
      </aside>
    </div>
  );
}
