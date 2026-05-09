import { useEffect, useState } from 'react';

interface OutputFile {
  filename: string;
  url: string;
  sizeMB: number;
  createdAt: string;
}

interface Props {
  /** Bumped each time a new export finishes, to trigger a refresh */
  refreshKey: number;
}

export function OutputHistory({ refreshKey }: Props) {
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/outputs')
      .then((r) => r.json())
      .then((data) => {
        setFiles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshKey]);

  async function onDelete(filename: string) {
    try {
      await fetch(`/api/outputs/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((f) => f.filename !== filename));
      if (previewUrl && previewUrl.includes(filename)) setPreviewUrl(null);
    } catch (err) {
      console.error('delete failed', err);
    }
  }

  function togglePreview(url: string) {
    setPreviewUrl((prev) => (prev === url ? null : url));
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) return <p className="muted">Loading history…</p>;
  if (files.length === 0) return <p className="muted">No previous exports yet.</p>;

  return (
    <div className="output-history">
      {files.map((f) => {
        const isOpen = previewUrl === f.url;
        return (
          <div key={f.filename} className="history-entry">
            <div className="history-item">
              <div className="history-info">
                <a href={f.url} download className="history-link" title={f.filename}>
                  {f.filename.replace(/\.(mp4|webm|mov)$/i, '')}
                </a>
                <span className="history-meta">
                  {f.sizeMB} MB · {formatDate(f.createdAt)}
                </span>
              </div>
              <div className="history-actions">
                <button
                  className={`history-preview-btn ${isOpen ? 'active' : ''}`}
                  onClick={() => togglePreview(f.url)}
                  title={isOpen ? 'Hide preview' : 'Preview'}
                >
                  ▶
                </button>
                <a href={f.url} download className="history-dl" title="Download">
                  ↓
                </a>
                <button
                  className="history-delete"
                  onClick={() => onDelete(f.filename)}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
            {isOpen && (
              <video
                src={f.url}
                controls
                playsInline
                autoPlay
                className="history-video"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
