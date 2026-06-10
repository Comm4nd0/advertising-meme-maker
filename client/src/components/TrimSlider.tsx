import { useCallback, useRef } from 'react';

interface Props {
  durationSec: number;
  trimStart: number;
  trimEnd: number;
  onChangeStart: (val: number) => void;
  onChangeEnd: (val: number) => void;
  /** Called when the user finishes dragging — seek the video */
  onSeek?: (time: number) => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function TrimSlider({
  durationSec,
  trimStart,
  trimEnd,
  onChangeStart,
  onChangeEnd,
  onSeek,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const step = Math.max(0.1, durationSec / 1000);

  const leftPct = (trimStart / durationSec) * 100;
  const rightPct = (trimEnd / durationSec) * 100;

  const onStartInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      if (v < trimEnd - 0.5) {
        onChangeStart(v);
        onSeek?.(v);
      }
    },
    [trimEnd, onChangeStart, onSeek]
  );

  const onEndInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      if (v > trimStart + 0.5) {
        onChangeEnd(v);
        onSeek?.(v);
      }
    },
    [trimStart, onChangeEnd, onSeek]
  );

  const clipDuration = trimEnd - trimStart;

  return (
    <div className="trim-slider">
      <div className="trim-labels">
        <span className="trim-time">{fmt(trimStart)}</span>
        <span className="trim-duration">{fmt(clipDuration)} selected</span>
        <span className="trim-time">{fmt(trimEnd)}</span>
      </div>
      <div className="trim-track" ref={trackRef}>
        {/* Dimmed regions outside selection */}
        <div className="trim-dim trim-dim-left" style={{ width: `${leftPct}%` }} />
        <div className="trim-dim trim-dim-right" style={{ width: `${100 - rightPct}%` }} />
        {/* Active region highlight */}
        <div
          className="trim-active"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />
        {/* Two range inputs stacked */}
        <input
          type="range"
          className="trim-input trim-input-start"
          min={0}
          max={durationSec}
          step={step}
          value={trimStart}
          onChange={onStartInput}
        />
        <input
          type="range"
          className="trim-input trim-input-end"
          min={0}
          max={durationSec}
          step={step}
          value={trimEnd}
          onChange={onEndInput}
        />
      </div>
    </div>
  );
}
