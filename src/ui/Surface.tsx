import type { SeifertSurface } from '../core/seifert';
import { surfacePainting, SURFACE_CLEARANCE } from '../core/surface-picture';
import type { Hot } from '../state/store';
import type { Point } from '../core/knot';
import { useId } from 'react';
import type { Box } from '../core/diagram';
const points = (polygon: Point[]) => polygon.map((p) => p.join(',')).join(' ');

export function Surface({
  surface,
  mark,
  m,
  gaps = [],
  view,
  strands = [],
}: {
  surface: SeifertSurface;
  mark?: Hot['surface'];
  m: number;
  gaps?: Point[][];
  view?: Box;
  strands?: Point[][];
}) {
  const mask = useId();
  const paintMask = `${mask}-paint`;
  const painting = surfacePainting(surface);
  const gradientId = (crossing: number) => `${mask}-band-${crossing}`;
  const fill = (polygon: Point[], opacity: string, side: string) => (
    <polygon points={points(polygon)} fill="var(--ink)" fillOpacity={opacity} data-side={side} />
  );
  return (
    <g className="seifert-picture" aria-hidden="true" pointerEvents="none" data-surface-mark={mark}>
      <defs>
        {painting.bands.map((band) => (
          <linearGradient
            key={band.crossing}
            id={gradientId(band.crossing)}
            gradientUnits="userSpaceOnUse"
            colorInterpolation="sRGB"
            x1={band.axis[0][0]}
            y1={band.axis[0][1]}
            x2={band.axis[1][0]}
            y2={band.axis[1][1]}
          >
            {band.halves.map((half, i) => (
              <stop key={i} offset={i} stopColor={`var(--surface-${half.side}-tone)`} data-side={half.side} />
            ))}
          </linearGradient>
        ))}
        {view && strands.length > 0 && (
          <mask
            id={paintMask}
            maskUnits="userSpaceOnUse"
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            data-surface-clearance="true"
          >
            <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="white" />
            {strands.map((strand, i) => (
              <polyline
                key={i}
                points={points(strand)}
                fill="none"
                stroke="black"
                strokeWidth={SURFACE_CLEARANCE * m}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </mask>
        )}
      </defs>
      <g mask={view && strands.length > 0 ? `url(#${paintMask})` : undefined}>
        {painting.disks.map((circle) => (
          <g key={circle.id} data-surface-disk={circle.id} data-depth={circle.depth}>
            {fill(circle.points, 'var(--surface-disk-opacity)', circle.side)}
          </g>
        ))}
        {painting.bands.map((band) => (
          <g key={band.crossing} data-surface-band={band.crossing} data-twist={band.sign}>
            {band.halves.map((half, i) => (
              <g key={i} data-surface-half={i}>
                <polygon
                  points={points(half.points)}
                  fill={`url(#${gradientId(band.crossing)})`}
                  stroke="none"
                  data-side={half.side}
                />
              </g>
            ))}
          </g>
        ))}
      </g>
      {/* Marks follow every fill, so nested disks cannot cover an outer outline. */}
      {mark && gaps.length > 0 && view && (
        <defs>
          <mask id={mask} maskUnits="userSpaceOnUse" x={view.x} y={view.y} width={view.w} height={view.h}>
            <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="white" />
            {gaps.map((gap, i) => (
              <polyline
                key={i}
                points={points(gap)}
                fill="none"
                stroke="black"
                strokeWidth={3.5 * m}
                strokeLinecap="round"
              />
            ))}
          </mask>
        </defs>
      )}
      <g mask={mark && gaps.length > 0 && view ? `url(#${mask})` : undefined}>
        {mark === 'disks' &&
          surface.circles.map((circle) => (
            <polygon
              key={circle.id}
              points={points(circle.points)}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.5 * m}
              strokeLinejoin="round"
              data-surface-outline="disk"
            />
          ))}
        {mark === 'bands' &&
          surface.strips.flatMap((band) =>
            band.halves.map((half, i) => (
              <polygon
                key={`${band.crossing}:${i}`}
                points={points(half.points)}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={1.5 * m}
                strokeLinejoin="round"
                data-surface-outline="band"
              />
            )),
          )}
      </g>
    </g>
  );
}
