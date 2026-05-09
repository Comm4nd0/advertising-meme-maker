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
    } catch (err) {
      console.error('delete failed', err);
    }
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
      {files.map((f) => (
        <div key={f.filename} className="history-item">
          <div className="history-info">
            <a href={f.url} download className="history-link" title={f.filename}>
              {f.filename.replace(/\.(mp4|webm|mov)$/i, '')}
            </a>
            <span className="history-meta">
              {f.sizeMB} MB · {formatDate(f.createdAt)}
            </span>
          </div>
          <div className="history-actions">
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
      ))}
    </div>
  );
}
