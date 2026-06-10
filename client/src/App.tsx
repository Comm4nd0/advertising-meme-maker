import { useCallback, useEffect, useRef, useState } from 'react';
import { InputDropzone } from './components/InputDropzone';
import { BrandSettings } from './components/BrandSettings';
import { SlideEditor } from './components/SlideEditor';
import { SlidePreview, type SlidePreviewHandle } from './components/SlidePreview';
import { TrimSlider } from './components/TrimSlider';
import { ExportPanel } from './components/ExportPanel';
import { MusicPicker } from './components/MusicPicker';
import { OutputHistory } from './components/OutputHistory';
import { HookEditor } from './components/HookEditor';
import { VoiceoverPicker } from './components/VoiceoverPicker';
import { EffectsEditor, type EffectSettings } from './components/EffectsEditor';
import { DiscoverPanel } from './components/DiscoverPanel';
import { DEFAULT_VOICE } from './lib/ttsVoices';
import { pickTemplateSet, templateSetToSlides, type Category } from './lib/slideTemplates';
import { ALL_ASPECTS } from './lib/aspectRatio';
import type { MemeCandidate, MemeCategory, Tagline } from './lib/api';
import type {
  AspectRatio,
  BrandKit,
  HookSettings,
  ProbeResult,
  Slide,
  SocialCopy,
} from './types';

type MobileTab = 'source' | 'preview' | 'slides' | 'export';

// Restore a JSON-serialized value from localStorage, falling back on missing
// or corrupt data so a stale or old-format entry can never crash startup.
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isValidSlide(s: unknown): s is Slide {
  if (typeof s !== 'object' || s === null) return false;
  const slide = s as Record<string, unknown>;
  return (
    typeof slide.id === 'string' &&
    typeof slide.headline === 'string' &&
    typeof slide.subhead === 'string' &&
    typeof slide.durationSec === 'number'
  );
}

export function App() {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [slides, setSlides] = useState<Slide[]>(() => {
    const restored = loadJSON<unknown[]>('amm.slides', []);
    return Array.isArray(restored) ? restored.filter(isValidSlide) : [];
  });
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(
    () => localStorage.getItem('amm.selectedMusic') || null
  );
  const [musicVolume, setMusicVolume] = useState(80);
  const [historyKey, setHistoryKey] = useState(0);
  const [trimStart, setTrimStart] = useState<number>(() => {
    const n = loadJSON<number>('amm.trimStart', 0);
    return Number.isFinite(n) ? n : 0;
  });
  const [trimEnd, setTrimEnd] = useState<number>(() => {
    const n = loadJSON<number>('amm.trimEnd', 0);
    return Number.isFinite(n) ? n : 0;
  });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    const r = loadJSON<AspectRatio>('amm.aspectRatio', 'source');
    return ALL_ASPECTS.includes(r) ? r : 'source';
  });
  const [hook, setHook] = useState<HookSettings>(() => {
    const r = loadJSON<Partial<HookSettings>>('amm.hook', { text: '', durationSec: 2 });
    return {
      text: typeof r?.text === 'string' ? r.text : '',
      durationSec: typeof r?.durationSec === 'number' ? r.durationSec : 2,
    };
  });
  // AI-suggested hook options + post copy from the last Discover pick. Ephemeral
  // by design — they belong to the currently loaded meme.
  const [hookVariants, setHookVariants] = useState<string[]>([]);
  const [social, setSocial] = useState<SocialCopy | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(
    () => localStorage.getItem('amm.voiceEnabled') === '1'
  );
  const [voiceName, setVoiceName] = useState<string>(
    () => localStorage.getItem('amm.voiceName') || DEFAULT_VOICE
  );
  const [effect, setEffect] = useState<EffectSettings>(() => {
    try {
      const raw = localStorage.getItem('amm.effect');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          type: parsed.type === 'buffering' ? 'buffering' : '',
          durationSec: typeof parsed.durationSec === 'number' ? parsed.durationSec : 2,
          count: typeof parsed.count === 'number' ? parsed.count : 1,
        };
      }
    } catch {
      /* ignore */
    }
    return { type: '', durationSec: 2, count: 1 };
  });
  const [mobileTab, setMobileTab] = useState<MobileTab>('source');
  const previewRef = useRef<SlidePreviewHandle>(null);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (selectedMusic) {
      localStorage.setItem('amm.selectedMusic', selectedMusic);
    } else {
      localStorage.removeItem('amm.selectedMusic');
    }
  }, [selectedMusic]);

  useEffect(() => {
    localStorage.setItem('amm.voiceEnabled', voiceEnabled ? '1' : '0');
  }, [voiceEnabled]);

  useEffect(() => {
    localStorage.setItem('amm.voiceName', voiceName);
  }, [voiceName]);

  useEffect(() => {
    localStorage.setItem('amm.effect', JSON.stringify(effect));
  }, [effect]);

  useEffect(() => {
    localStorage.setItem('amm.slides', JSON.stringify(slides));
  }, [slides]);

  useEffect(() => {
    localStorage.setItem('amm.hook', JSON.stringify(hook));
  }, [hook]);

  useEffect(() => {
    localStorage.setItem('amm.trimStart', JSON.stringify(trimStart));
  }, [trimStart]);

  useEffect(() => {
    localStorage.setItem('amm.trimEnd', JSON.stringify(trimEnd));
  }, [trimEnd]);

  useEffect(() => {
    localStorage.setItem('amm.aspectRatio', JSON.stringify(aspectRatio));
  }, [aspectRatio]);

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

  function onUploaded(p: ProbeResult, file: File | null) {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setProbe(p);
    // If file is null (URL download), serve from the server upload path
    if (file) {
      setSourceUrl(URL.createObjectURL(file));
    } else {
      setSourceUrl(`/api/upload/${p.jobId}/file`);
    }
    setTrimStart(0);
    setTrimEnd(p.durationSec);
    setHookVariants([]);
    setSocial(null);

    // Auto-suggest slides on first upload (only if none exist yet)
    if (slides.length === 0) {
      const { set } = pickTemplateSet('cctv');
      const suggested = templateSetToSlides(set);
      setSlides(suggested);
      if (suggested.length > 0) setSelectedSlideId(suggested[0].id);
    } else {
      setSelectedSlideId(null);
    }

    // On mobile, jump to preview after uploading
    setMobileTab('preview');
  }

  // Map server-side meme category → client slide-template category.
  // All Luma-relevant memes lean into the CCTV angle since this is a
  // security company; only purely generic/wholesome content gets the
  // generic-template treatment.
  function memeCategoryToTemplate(cat: MemeCategory): Category {
    switch (cat) {
      case 'cctv':
      case 'public-freakout':
      case 'fail':
        return 'cctv';
      case 'generic-funny':
      case 'wholesome':
      default:
        return 'general';
    }
  }

  function onDiscoverLoad(
    p: ProbeResult,
    candidate: MemeCandidate,
    tagline: Tagline | null,
  ) {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setProbe(p);
    setSourceUrl(`/api/upload/${p.jobId}/file`);
    setTrimStart(0);
    setTrimEnd(p.durationSec);

    // Pick a slide template matched to the meme's category, then overwrite
    // the first slide with the AI-generated tagline if we got one.
    const { set } = pickTemplateSet(memeCategoryToTemplate(candidate.category));
    const suggested = templateSetToSlides(set);
    if (tagline && suggested.length > 0) {
      suggested[0] = { ...suggested[0], headline: tagline.headline, subhead: tagline.subhead };
    }
    setSlides(suggested);
    if (suggested.length > 0) setSelectedSlideId(suggested[0].id);

    // Surface the AI hook variants (first one pre-applied) and post copy.
    const hooks = tagline?.hooks ?? [];
    setHookVariants(hooks);
    if (hooks.length > 0) {
      setHook((h) => ({ ...h, text: hooks[0] }));
    }
    setSocial(
      tagline && (tagline.caption || tagline.firstComment)
        ? { caption: tagline.caption, firstComment: tagline.firstComment }
        : null,
    );

    setMobileTab('preview');
  }

  const onExportDone = useCallback(() => {
    setHistoryKey((k) => k + 1);
  }, []);

  const onTrimSeek = useCallback((time: number) => {
    previewRef.current?.seekVideo(time);
  }, []);

  const previewMode: 'source' | 'slide' = selectedSlideId ? 'slide' : 'source';
  const selectedSlide = slides.find((s) => s.id === selectedSlideId) || null;
  const showTrim = probe && !probe.isImage && previewMode === 'source' && probe.durationSec > 0;

  return (
    <div className="app" data-mobile-tab={mobileTab}>
      <aside className="panel left">
        <DiscoverPanel onLoad={onDiscoverLoad} />
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
        <HookEditor hook={hook} onChange={setHook} hasSource={!!probe} variants={hookVariants} />
        <hr />
        <EffectsEditor effect={effect} onChange={setEffect} hasSource={!!probe} />
        <hr />
        <h2>2. Brand</h2>
        <BrandSettings onChange={onBrandChange} />
      </aside>

      <main className="panel center">
        <SlidePreview
          ref={previewRef}
          mode={previewMode}
          sourceUrl={sourceUrl}
          isImage={probe?.isImage ?? false}
          slide={selectedSlide}
          brand={brand}
          logoImg={logoImg}
          probe={probe}
          trimStart={trimStart}
          trimEnd={trimEnd}
          effect={effect}
        />
        {showTrim && (
          <TrimSlider
            durationSec={probe.durationSec}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onChangeStart={setTrimStart}
            onChangeEnd={setTrimEnd}
            onSeek={onTrimSeek}
          />
        )}
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
        <div className="mobile-slides-section">
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
          <VoiceoverPicker
            enabled={voiceEnabled}
            voice={voiceName}
            onEnabledChange={setVoiceEnabled}
            onVoiceChange={setVoiceName}
          />
        </div>
        <hr className="section-divider" />
        <div className="mobile-export-section">
          <h2>4. Export</h2>
          <ExportPanel
            probe={probe}
            slides={slides}
            brand={brand}
            logoImg={logoImg}
            music={selectedMusic}
            musicVolume={musicVolume}
            onExportDone={onExportDone}
            trimStart={trimStart}
            trimEnd={trimEnd}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            hook={hook}
            voiceEnabled={voiceEnabled}
            voiceName={voiceName}
            effect={effect}
            social={social}
          />
          <hr />
          <h2>Previous exports</h2>
          <OutputHistory refreshKey={historyKey} />
        </div>
      </aside>

      {/* Bottom tab bar — visible only on mobile */}
      <nav className="mobile-tabs">
        <button
          className={`tab ${mobileTab === 'source' ? 'active' : ''}`}
          onClick={() => setMobileTab('source')}
        >
          <span className="tab-icon">📹</span>
          <span className="tab-label">Source</span>
        </button>
        <button
          className={`tab ${mobileTab === 'preview' ? 'active' : ''}`}
          onClick={() => setMobileTab('preview')}
        >
          <span className="tab-icon">👁️</span>
          <span className="tab-label">Preview</span>
        </button>
        <button
          className={`tab ${mobileTab === 'slides' ? 'active' : ''}`}
          onClick={() => setMobileTab('slides')}
        >
          <span className="tab-icon">🎬</span>
          <span className="tab-label">Slides</span>
        </button>
        <button
          className={`tab ${mobileTab === 'export' ? 'active' : ''}`}
          onClick={() => setMobileTab('export')}
        >
          <span className="tab-icon">📤</span>
          <span className="tab-label">Export</span>
        </button>
      </nav>
    </div>
  );
}
