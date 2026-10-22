import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useT } from '../i18n/useT';
import {
  clampSideWidth,
  defaultSideWidth,
  readSideWidth,
  sideWidthLimit,
  storeSideWidth,
} from './side-width';

export function useSideWidth() {
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  const [requested, setRequested] = useState<number | null>(() => {
    try {
      return readSideWidth(window.localStorage);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const resize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const width = clampSideWidth(requested ?? defaultSideWidth(windowWidth), windowWidth);
  const setWidth = (value: number | null) => {
    const next = value === null ? null : clampSideWidth(value, window.innerWidth);
    setRequested(next);
    try {
      storeSideWidth(window.localStorage, next);
    } catch {
      /* Storage access itself can throw. */
    }
  };
  return {
    width,
    setWidth,
    windowWidth,
    style: (requested === null ? {} : { '--side-width': `${width}px` }) as CSSProperties,
  };
}

export function SideDivider({
  width,
  windowWidth,
  setWidth,
}: {
  width: number;
  windowWidth: number;
  setWidth: (width: number | null) => void;
}) {
  const t = useT();
  const drag = useRef<{ x: number; width: number; pointer: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  if (windowWidth < 820) return null;
  return (
    <div
      className={`side-divider${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      aria-label={t('readout.resize')}
      title={t('readout.resizeTip')}
      aria-valuemin={300}
      aria-valuemax={sideWidthLimit(windowWidth)}
      aria-valuenow={Math.round(width)}
      onDoubleClick={() => setWidth(null)}
      onKeyDown={(e) => {
        if (e.key === 'Home') {
          e.preventDefault();
          setWidth(null);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setWidth(width + (e.key === 'ArrowLeft' ? 16 : -16));
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || drag.current) return;
        e.preventDefault();
        e.currentTarget.focus();
        drag.current = { x: e.clientX, width, pointer: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (drag.current?.pointer === e.pointerId) setWidth(drag.current.width + drag.current.x - e.clientX);
      }}
      onPointerUp={(e) => {
        if (drag.current?.pointer !== e.pointerId) return;
        drag.current = null;
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
    />
  );
}
