import { useEffect, useRef, useState } from 'react';
import { getBrand, uploadMusic, deleteMusicFromLibrary } from '../lib/api';

interface Props {
  selectedMusic: string | null;
  musicVolume: number;
  onMusicChange: (filename: string | null) => void;
  onVolumeChange: (volume: number) => void;
}

export function MusicPicker({ selectedMusic, musicVolume, onMusicChange, onVolumeChange }: Props) {
  const [musicList, setMusicList] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    getBrand()
      .then(({ music }) => setMusicList(music || []))
      .catch(() => {});
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    setUploading(true);
    try {
      const result = await uploadMusic(f);
      setMusicList(result.music);
      onMusicChange(result.filename);
    } catch (err) {
      console.error('music upload failed', err);
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(filename: string, e: React.MouseEvent) {
    e.stopPropagation();
    stopPreview();
    try {
      const result = await deleteMusicFromLibrary(filename);
      setMusicList(result.music);
      if (selectedMusic === filename) onMusicChange(null);
    } catch (err) {
      console.error('music delete failed', err);
    }
  }

  function togglePreview(filename: string) {
    if (playing === filename) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(`/brand/music/${filename}`);
    audio.volume = musicVolume / 100;
    audio.play();
    audio.onended = () => setPlaying(null);
    audioRef.current = audio;
    setPlaying(filename);
  }

  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(null);
  }

  // Update preview volume live
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = musicVolume / 100;
    }
  }, [musicVolume]);

  // Cleanup on unmount
  useEffect(() => () => stopPreview(), []);

  return (
    <div className="music-picker">
      <h3>Slide music</h3>

      <label className="row">
        <span>Upload track</span>
        <input type="file" accept="audio/*" onChange={onUpload} disabled={uploading} />
      </label>

      {musicList.length > 0 && (
        <div className="music-list">
          <div
            className={`music-item ${selectedMusic === null ? 'active' : ''}`}
            onClick={() => { onMusicChange(null); stopPreview(); }}
          >
            <span className="music-icon">🔇</span>
            <span className="music-name">No music</span>
          </div>
          {musicList.map((filename) => {
            const isActive = selectedMusic === filename;
            const isPlaying = playing === filename;
            return (
              <div
                key={filename}
                className={`music-item ${isActive ? 'active' : ''}`}
                onClick={() => onMusicChange(filename)}
              >
                <button
                  className="music-preview-btn"
                  onClick={(e) => { e.stopPropagation(); togglePreview(filename); }}
                  title={isPlaying ? 'Stop preview' : 'Preview'}
                >
                  {isPlaying ? '⏹' : '▶'}
                </button>
                <span className="music-name" title={filename}>
                  {filename.replace(/\.[^.]+$/, '')}
                </span>
                {isActive && <span className="music-active-badge">✓</span>}
                <button
                  className="music-delete"
                  onClick={(e) => onDelete(filename, e)}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selectedMusic && (
        <label>
          <span>Volume: {musicVolume}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={musicVolume}
            onChange={(e) => onVolumeChange(parseInt(e.target.value, 10))}
          />
        </label>
      )}
    </div>
  );
}
