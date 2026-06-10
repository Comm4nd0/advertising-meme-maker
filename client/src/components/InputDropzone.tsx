import { useRef, useState } from 'react';
import type { ProbeResult } from '../types';
import { uploadInput, uploadFromUrl, type UrlDownloadUpdate } from '../lib/api';

interface Props {
  onUploaded: (probe: ProbeResult, file: File | null) => void;
}

export function InputDropzone({ onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [dlStatus, setDlStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const probe = await uploadInput(file);
      onUploaded(probe, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUrl() {
    const url = urlValue.trim();
    if (!url) return;
    setBusy(true);
    setError(null);
    setDlStatus('Starting download...');
    try {
      const probe = await uploadFromUrl(url, (update: UrlDownloadUpdate) => {
        if (update.message) {
          setDlStatus(update.message);
        }
      });
      setDlStatus(null);
      setUrlValue('');
      // No local file when downloading from URL — pass null
      onUploaded(probe, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDlStatus(null);
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      {!urlMode ? (
        <>
          <div
            className={`dropzone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*,image/*"
              onChange={onPick}
              style={{ display: 'none' }}
            />
            {busy ? <p>Uploading…</p> : <p>Drop a video or image, or tap to choose</p>}
          </div>
          <button
            className="url-toggle-btn"
            onClick={() => setUrlMode(true)}
            disabled={busy}
          >
            Or paste a link (Instagram, TikTok, YouTube…)
          </button>
        </>
      ) : (
        <div className="url-input-section">
          <div className="url-input-row">
            <input
              type="text"
              placeholder="Paste Instagram / TikTok / YouTube URL…"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && handleUrl()}
              disabled={busy}
              autoFocus
            />
            <button onClick={() => handleUrl()} disabled={busy || !urlValue.trim()}>
              {busy ? '…' : 'Go'}
            </button>
          </div>
          {dlStatus && <p className="dl-status">{dlStatus}</p>}
          <button
            className="url-toggle-btn"
            onClick={() => { setUrlMode(false); setError(null); setDlStatus(null); }}
            disabled={busy}
          >
            Upload a file instead
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
