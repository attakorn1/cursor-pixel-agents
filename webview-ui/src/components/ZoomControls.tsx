import { useEffect, useRef, useState } from 'react';

import {
  ZOOM_LEVEL_FADE_DELAY_MS,
  ZOOM_LEVEL_FADE_DURATION_SEC,
  ZOOM_LEVEL_HIDE_DELAY_MS,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../constants.js';

interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

const btnBase: React.CSSProperties = {
  width: 24,
  height: 24,
  padding: 0,
  background: 'rgba(30, 30, 46, 0.5)',
  color: 'rgba(255, 255, 255, 0.5)',
  border: '1px solid rgba(74, 74, 106, 0.35)',
  borderRadius: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(4px)',
};

export function ZoomControls({ zoom, onZoomChange }: ZoomControlsProps) {
  const [hovered, setHovered] = useState<'minus' | 'plus' | null>(null);
  const [showLevel, setShowLevel] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevZoomRef = useRef(zoom);

  const minDisabled = zoom <= ZOOM_MIN;
  const maxDisabled = zoom >= ZOOM_MAX;

  // Show zoom level briefly when zoom changes
  useEffect(() => {
    if (zoom === prevZoomRef.current) return;
    prevZoomRef.current = zoom;

    // Clear existing timers
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    setShowLevel(true);
    setFadeOut(false);

    // Start fade after delay
    fadeTimerRef.current = setTimeout(() => {
      setFadeOut(true);
    }, ZOOM_LEVEL_FADE_DELAY_MS);

    // Hide completely after delay
    timerRef.current = setTimeout(() => {
      setShowLevel(false);
      setFadeOut(false);
    }, ZOOM_LEVEL_HIDE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [zoom]);

  return (
    <>
      {showLevel && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 'var(--pixel-controls-z)',
            background: 'rgba(30, 30, 46, 0.6)',
            border: '1px solid rgba(74, 74, 106, 0.35)',
            borderRadius: 0,
            padding: '2px 8px',
            backdropFilter: 'blur(4px)',
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.6)',
            userSelect: 'none',
            opacity: fadeOut ? 0 : 1,
            transition: `opacity ${ZOOM_LEVEL_FADE_DURATION_SEC}s ease-out`,
            pointerEvents: 'none',
          }}
        >
          {zoom % 1 === 0 ? `${zoom}x` : `${zoom.toFixed(1)}x`}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          zIndex: 'var(--pixel-controls-z)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <button
          onClick={() => onZoomChange(zoom + 1)}
          disabled={maxDisabled}
          onMouseEnter={() => setHovered('plus')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...btnBase,
            background:
              hovered === 'plus' && !maxDisabled ? 'rgba(255, 255, 255, 0.12)' : btnBase.background,
            cursor: maxDisabled ? 'default' : 'pointer',
            opacity: maxDisabled ? 'var(--pixel-btn-disabled-opacity)' : 1,
          }}
          title="Zoom in (Ctrl+Scroll)"
        >
          <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
            <line x1="9" y1="3" x2="9" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={() => onZoomChange(zoom - 1)}
          disabled={minDisabled}
          onMouseEnter={() => setHovered('minus')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...btnBase,
            background:
              hovered === 'minus' && !minDisabled
                ? 'rgba(255, 255, 255, 0.12)'
                : btnBase.background,
            cursor: minDisabled ? 'default' : 'pointer',
            opacity: minDisabled ? 'var(--pixel-btn-disabled-opacity)' : 1,
          }}
          title="Zoom out (Ctrl+Scroll)"
        >
          <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
            <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </>
  );
}
