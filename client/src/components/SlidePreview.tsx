import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { renderSlide } from '../lib/renderSlide';
import { qrCanvasFor } from '../lib/qr';
import type { BrandKit, ProbeResult, Slide } from '../types';

interface Props {
  mode: 'source' | 'slide';
  sourceUrl: string | null;
  isImage: boolean;
  slide: Slide | null;
  brand: BrandKit | null;
  logoImg: HTMLImageElement | null;
  probe: ProbeResult | null;
  trimStart: number;
  trimEnd: number;
  effect: { type: '' | 'buffering'; durationSec: number; count: number };
}

export interface SlidePreviewHandle {
  seekVideo: (time: number) => void;
}

export const SlidePreview = forwardRef<SlidePreviewHandle, Props>(function SlidePreview(
  { mode, sourceUrl, isImage, slide, brand, logoImg, probe, trimStart, trimEnd, effect },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  // Buffering-hold state: when the user presses play with the buffering
  // effect enabled and we're at the start of the trim window, we DON'T call
  // video.play() right away. We show the overlay, start a real-world timer,
  // and call play() only after the buffering duration elapses.
  const [showBufferingOverlay, setShowBufferingOverlay] = useState(false);
  const bufferingTimeoutRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    seekVideo(time: number) {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
  }));

  useEffect(() => {
    if (mode !== 'slide') return;
    if (!canvasRef.current || !brand || !slide || !probe) return;
    let cancelled = false;
    (async () => {
      // The QR rasterizes asynchronously; preview uses the raw CTA URL
      // (export appends per-format UTM tags).
      let qr: HTMLCanvasElement | null = null;
      if (slide.showCta && brand.ctaUrl.trim()) {
        qr = await qrCanvasFor(brand.ctaUrl.trim()).catch(() => null);
      }
      if (cancelled || !canvasRef.current) return;
      renderSlide({
        canvas: canvasRef.current,
        slide,
        brand,
        logoImg,
        width: probe.width,
        height: probe.height,
        qrCanvas: qr,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, slide, brand, logoImg, probe]);

  // Keep trim values in refs so the timeupdate listener always sees the latest
  // values without re-binding on every drag.
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  trimStartRef.current = trimStart;
  trimEndRef.current = trimEnd;

  // Keep effect values in refs so handlers don't need to re-bind on each change.
  const effectTypeRef = useRef(effect.type);
  const effectDurRef = useRef(effect.durationSec);
  const effectCountRef = useRef(effect.count);
  effectTypeRef.current = effect.type;
  effectDurRef.current = effect.durationSec;
  effectCountRef.current = effect.count;

  // Multi-burst state: which burst is NEXT to fire (0..count). When >= count,
  // no more bursts for this playback session. Reset on loop / seek to start.
  const nextBurstIdxRef = useRef(0);
  // Re-entrancy guard inside the timeupdate trigger.
  const inBurstRef = useRef(false);

  const clearBufferingTimeout = useCallback(() => {
    if (bufferingTimeoutRef.current !== null) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }
  }, []);

  // Pause + show overlay + schedule resume after one effect duration.
  const triggerBurst = useCallback(
    (video: HTMLVideoElement) => {
      if (inBurstRef.current) return;
      inBurstRef.current = true;
      try { video.pause(); } catch { /* ignore */ }
      setShowBufferingOverlay(true);
      setPlaying(true);
      bufferingTimeoutRef.current = window.setTimeout(() => {
        bufferingTimeoutRef.current = null;
        inBurstRef.current = false;
        nextBurstIdxRef.current += 1;
        setShowBufferingOverlay(false);
        const v = videoRef.current;
        if (v) v.play().catch(() => setPlaying(false));
      }, effectDurRef.current * 1000);
    },
    [],
  );

  // Sync playing state with video events + clamp playback to the trim window
  // + fire subsequent buffering bursts at each chunk boundary.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => {
      setPlaying(true);
      const ts = trimStartRef.current;
      const te = trimEndRef.current;
      if (te > ts && (video.currentTime < ts - 0.05 || video.currentTime >= te - 0.05)) {
        video.currentTime = ts;
      }
    };
    const onPause = () => {
      // Only flip the UI playing state for real pauses, not bursts (the
      // overlay manages its own state).
      if (!inBurstRef.current) setPlaying(false);
    };
    const onEnded = () => setPlaying(false);
    const onTimeUpdate = () => {
      const ts = trimStartRef.current;
      const te = trimEndRef.current;
      const trim = te - ts;
      // Loop at trim end → reset burst counter so they replay.
      if (trim > 0 && video.currentTime >= te) {
        video.currentTime = ts;
        nextBurstIdxRef.current = 0;
        return;
      }
      // Fire next burst when the natural playhead reaches its threshold.
      if (
        !inBurstRef.current &&
        effectTypeRef.current === 'buffering' &&
        effectDurRef.current > 0 &&
        effectCountRef.current > 1 &&
        trim > 0 &&
        nextBurstIdxRef.current > 0 &&
        nextBurstIdxRef.current < effectCountRef.current
      ) {
        const chunkDur = trim / effectCountRef.current;
        const threshold = ts + nextBurstIdxRef.current * chunkDur;
        if (video.currentTime >= threshold) {
          triggerBurst(video);
        }
      }
    };
    // Seeks (e.g. user drags the timeline) skip any pending burst and just
    // recompute which burst comes next from the new position.
    const onSeeking = () => {
      if (inBurstRef.current) {
        clearBufferingTimeout();
        inBurstRef.current = false;
        setShowBufferingOverlay(false);
      }
    };
    const onSeeked = () => {
      const ts = trimStartRef.current;
      const te = trimEndRef.current;
      const trim = te - ts;
      if (trim <= 0 || effectCountRef.current <= 0) {
        nextBurstIdxRef.current = 0;
        return;
      }
      const chunkDur = trim / effectCountRef.current;
      // Smallest idx whose threshold > currentTime → that one is next.
      // Special-case currentTime ≈ trimStart so a snap-to-start still
      // triggers burst 0 on the following play.
      const offset = Math.max(0, video.currentTime - ts);
      if (offset < 0.05) {
        nextBurstIdxRef.current = 0;
      } else {
        nextBurstIdxRef.current = Math.min(
          effectCountRef.current,
          Math.ceil(offset / chunkDur),
        );
      }
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [sourceUrl, mode, triggerBurst, clearBufferingTimeout]);

  // Cancel any pending hold + hide overlay when the user disables the effect.
  useEffect(() => {
    if (effect.type === '' || effect.durationSec <= 0) {
      clearBufferingTimeout();
      setShowBufferingOverlay(false);
      inBurstRef.current = false;
      nextBurstIdxRef.current = 0;
    }
  }, [effect.type, effect.durationSec, clearBufferingTimeout]);

  // When the user changes the source video, reset the burst counter.
  useEffect(() => {
    clearBufferingTimeout();
    setShowBufferingOverlay(false);
    inBurstRef.current = false;
    nextBurstIdxRef.current = 0;
  }, [sourceUrl, clearBufferingTimeout]);

  // Clean up on unmount.
  useEffect(() => () => clearBufferingTimeout(), [clearBufferingTimeout]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // If we're already in a buffering hold, tapping again cancels it.
    if (showBufferingOverlay) {
      clearBufferingTimeout();
      inBurstRef.current = false;
      setShowBufferingOverlay(false);
      setPlaying(false);
      return;
    }

    if (video.paused || video.ended) {
      const ts = trimStartRef.current;
      const atStart = video.currentTime - ts <= 0.15;
      const wantBurst =
        effectTypeRef.current === 'buffering' &&
        effectDurRef.current > 0 &&
        effectCountRef.current >= 1 &&
        nextBurstIdxRef.current === 0 &&
        atStart;

      if (wantBurst) {
        // Snap to trim start to keep the frozen frame consistent with export.
        video.currentTime = ts;
        triggerBurst(video);
      } else {
        video.play();
      }
    } else {
      video.pause();
    }
  }, [showBufferingOverlay, clearBufferingTimeout, triggerBurst]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  if (!probe) {
    return (
      <div className="preview empty">
        <p>Upload a video or image to start.</p>
      </div>
    );
  }

  const aspectRatio = `${probe.width} / ${probe.height}`;
  const showVideoControls = mode === 'source' && sourceUrl && !isImage;

  // Only show the buffering overlay in source mode for a real video. The hold
  // state is managed in togglePlay (set on play, cleared on timeout or cancel).
  const renderBufferingOverlay =
    showBufferingOverlay && mode === 'source' && !isImage && sourceUrl !== null;

  return (
    <>
      <div className="preview" style={{ aspectRatio }}>
        {mode === 'source' && sourceUrl && !isImage && (
          <>
            <video ref={videoRef} src={sourceUrl} playsInline />
            {/* Large tap-to-play overlay */}
            <button
              className="play-overlay"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {!playing && <span className="play-overlay-icon">▶</span>}
            </button>
          </>
        )}
        {mode === 'source' && sourceUrl && isImage && (
          <img src={sourceUrl} alt="source" />
        )}
        {mode === 'slide' && <canvas ref={canvasRef} />}
        {renderBufferingOverlay && (
          <div className="buffering-overlay" aria-hidden="true">
            <video
              className="buffering-video"
              src="/effects/buffering.mp4"
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
        )}
      </div>

      {showVideoControls && (
        <div className="video-controls">
          <button className="vc-btn" onClick={togglePlay}>
            {playing ? '⏸' : '▶'}
            <span>{playing ? 'Pause' : 'Play'}</span>
          </button>
          <button className="vc-btn" onClick={toggleMute}>
            {muted ? '🔇' : '🔊'}
            <span>{muted ? 'Unmute' : 'Mute'}</span>
          </button>
        </div>
      )}
    </>
  );
});
