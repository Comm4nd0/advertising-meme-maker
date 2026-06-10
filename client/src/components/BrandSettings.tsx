import { useEffect, useRef, useState } from 'react';
import type { BrandKit, WatermarkPosition } from '../types';
import { getBrand, putBrand, setActiveLogo, deleteLogoFromLibrary } from '../lib/api';

interface Props {
  onChange: (brand: BrandKit, logoUrl: string | null) => void;
}

export function BrandSettings({ onChange }: Props) {
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logos, setLogos] = useState<string[]>([]);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const initialized = useRef(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    getBrand()
      .then(({ colors, logoUrl, logos }) => {
        setBrand(colors);
        setLogoUrl(logoUrl);
        setLogos(logos || []);
        onChange(colors, logoUrl);
        initialized.current = true;
      })
      .catch((err) => console.error('brand load failed', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized.current || !brand) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const result = await putBrand(brand, pendingLogo);
        setLogoUrl(result.logoUrl);
        setLogos(result.logos || []);
        setPendingLogo(null);
        onChange(result.colors, result.logoUrl);
      } catch (err) {
        console.error('brand save failed', err);
      }
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, pendingLogo]);

  if (!brand) return <div className="muted">Loading brand…</div>;

  function update<K extends keyof BrandKit>(key: K, value: BrandKit[K]) {
    setBrand((b) => (b ? { ...b, [key]: value } : b));
  }

  function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPendingLogo(f);
    e.target.value = '';
  }

  async function onSelectLogo(filename: string) {
    try {
      const result = await setActiveLogo(filename);
      setLogoUrl(result.logoUrl);
      setLogos(result.logos || []);
      onChange(result.colors, result.logoUrl);
    } catch (err) {
      console.error('set active logo failed', err);
    }
  }

  async function onDeleteLogo(filename: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const result = await deleteLogoFromLibrary(filename);
      setLogoUrl(result.logoUrl);
      setLogos(result.logos || []);
      onChange(result.colors, result.logoUrl);
    } catch (err) {
      console.error('delete logo failed', err);
    }
  }

  // Extract active filename from logoUrl
  const activeFilename = logoUrl ? logoUrl.split('/').pop()?.split('?')[0] : null;

  return (
    <div className="brand-settings">
      <h3>Brand</h3>

      <label className="row">
        <span>Upload logo</span>
        <input type="file" accept="image/*" onChange={onLogoPick} />
      </label>

      {logos.length > 0 && (
        <div className="logo-library">
          <span className="logo-library-label">Your logos — click to select</span>
          <div className="logo-grid">
            {logos.map((filename) => {
              const isActive = filename === activeFilename;
              const url = `/brand/logos/${filename}`;
              return (
                <div
                  key={filename}
                  className={`logo-thumb ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectLogo(filename)}
                  title={filename}
                >
                  <img src={url} alt={filename} />
                  {isActive && <span className="logo-active-badge">✓</span>}
                  <button
                    className="logo-delete"
                    onClick={(e) => onDeleteLogo(filename, e)}
                    title="Remove from library"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {logoUrl && (
        <div className="logo-preview">
          <img src={logoUrl + '?v=' + Math.floor(Date.now() / 1000)} alt="active logo" />
        </div>
      )}

      <div className="color-row">
        <label>
          <span>Primary</span>
          <input
            type="color"
            value={brand.primary}
            onChange={(e) => update('primary', e.target.value)}
          />
        </label>
        <label>
          <span>Secondary</span>
          <input
            type="color"
            value={brand.secondary}
            onChange={(e) => update('secondary', e.target.value)}
          />
        </label>
      </div>

      <label className="row inline">
        <input
          type="checkbox"
          checked={brand.useGradient}
          onChange={(e) => update('useGradient', e.target.checked)}
        />
        <span>Use gradient</span>
      </label>

      {brand.useGradient && (
        <label>
          <span>Gradient angle: {brand.gradientAngle}°</span>
          <input
            type="range"
            min={0}
            max={360}
            value={brand.gradientAngle}
            onChange={(e) => update('gradientAngle', parseInt(e.target.value, 10))}
          />
        </label>
      )}

      <div className="color-row">
        <label>
          <span>Headline</span>
          <input
            type="color"
            value={brand.headlineColor}
            onChange={(e) => update('headlineColor', e.target.value)}
          />
        </label>
        <label>
          <span>Subhead</span>
          <input
            type="color"
            value={brand.subheadColor}
            onChange={(e) => update('subheadColor', e.target.value)}
          />
        </label>
      </div>

      <hr />
      <h3>Call to action</h3>
      <p className="muted" style={{ fontSize: '0.8em', margin: '2px 0 6px' }}>
        Shown on outro slides with "Show call to action" ticked. The URL becomes a
        scannable QR code with tracking tags so you can see which memes convert.
      </p>
      <label>
        <span>Button text</span>
        <input
          type="text"
          placeholder="Get a free quote"
          value={brand.ctaText}
          onChange={(e) => update('ctaText', e.target.value)}
        />
      </label>
      <label>
        <span>Link / QR URL</span>
        <input
          type="text"
          placeholder="https://lumatechsolutions.co.uk/quote"
          value={brand.ctaUrl}
          onChange={(e) => update('ctaUrl', e.target.value)}
        />
      </label>
      <label>
        <span>Offer code</span>
        <input
          type="text"
          placeholder="MEME10"
          value={brand.offerCode}
          onChange={(e) => update('offerCode', e.target.value)}
        />
      </label>

      <hr />
      <h3>Watermark</h3>
      <label>
        <span>Social handle</span>
        <input
          type="text"
          placeholder="@lumatechsolutions"
          value={brand.handle}
          onChange={(e) => update('handle', e.target.value)}
        />
      </label>
      <label className="row inline">
        <input
          type="checkbox"
          checked={brand.watermarkEnabled}
          onChange={(e) => update('watermarkEnabled', e.target.checked)}
        />
        <span>Show watermark on video</span>
      </label>
      {brand.watermarkEnabled && (
        <label>
          <span>Position</span>
          <select
            value={brand.watermarkPosition}
            onChange={(e) =>
              update('watermarkPosition', e.target.value as WatermarkPosition)
            }
          >
            <option value="top-left">Top-left</option>
            <option value="top-right">Top-right</option>
            <option value="bottom-left">Bottom-left</option>
            <option value="bottom-right">Bottom-right</option>
          </select>
        </label>
      )}
    </div>
  );
}
