import { useId, useMemo } from 'react';
import { bandSurface, type BandSurface } from '../core/bands';
import { bandGeometry, bandPath, ribbonSlice, type BandGeometry } from '../core/band-geometry';
import { labelColor } from '../core/diagram';
import type { Hot } from '../state/store';
export function BandPicture({
  surface,
  hot = {},
  u = 1,
  monochrome = false,
  geometry: supplied,
}: {
  surface: BandSurface;
  hot?: Hot;
  u?: number;
  monochrome?: boolean;
  geometry?: BandGeometry;
}) {
  const gapMask = useId();
  const numbers = useMemo(() => bandSurface(surface), [surface]);
  const geometry = useMemo(() => supplied ?? bandGeometry(surface), [surface, supplied]);
  const color = (i: number) => (monochrome ? 'var(--ink)' : labelColor(i, Math.max(1, numbers.boundary)));
  const opacity = (i: number) => (hot.bandBoundary !== undefined && hot.bandBoundary !== i ? 0.25 : 1);
  const edgeBoundary = (band: number, side: number) =>
    numbers.boundaries.findIndex((b) =>
      b.steps.some((s) => s.kind === 'edge' && s.band === band && s.side === side),
    );
  return (
    <g className="band-picture" pointerEvents="none">
      <defs>
        <mask
          id={gapMask}
          maskUnits="userSpaceOnUse"
          {...{ x: geometry.box.x, y: geometry.box.y, width: geometry.box.w, height: geometry.box.h }}
        >
          <rect
            x={geometry.box.x}
            y={geometry.box.y}
            width={geometry.box.w}
            height={geometry.box.h}
            fill="white"
          />
          {surface.disks.map((d) => (
            <circle key={d.id} cx={d.center[0]} cy={d.center[1]} r={d.radius} fill="black" />
          ))}
        </mask>
      </defs>
      {surface.disks.map((d) => (
        <circle
          key={d.id}
          data-band-disk={d.id}
          cx={d.center[0]}
          cy={d.center[1]}
          r={d.radius}
          fill="var(--ink)"
          fillOpacity={0.06}
        />
      ))}
      {geometry.drawings.map((b) => (
        <path key={b.id} data-band-strip={b.id} d={b.strip} fill="var(--ink)" fillOpacity={0.06} />
      ))}
      {numbers.boundaries.flatMap((b, i) =>
        b.steps.map((step, j) => (
          <path
            key={`${i}:${j}`}
            data-boundary={i}
            d={geometry.boundaryPath(step)}
            fill="none"
            stroke={color(i)}
            strokeWidth={(hot.bandBoundary === i ? 3.5 : 2.5) * u}
            opacity={opacity(i)}
          />
        )),
      )}
      {/* A local overpass, rather than a whole-band paint order, handles both
          user-selected crossings and two passages of the same ribbon. */}
      {geometry.crossings.map((c) => {
        const passage = c.over === 0 ? c.a : c.b;
        const b = geometry.drawings.find((b) => b.id === passage.band)!;
        const other = geometry.drawings.find((b) => b.id === (c.over === 0 ? c.b.band : c.a.band))!;
        const reach = (other.width / 2 + 6 * u) / Math.max(c.sin, 0.05) + 6 * u;
        const center = bandPath(ribbonSlice(b, b.center, passage.at, reach));
        return (
          <g key={c.key} data-strip-over={c.key} data-over-passage={c.over}>
            <path
              d={center}
              fill="none"
              stroke="var(--stage)"
              strokeWidth={b.width + 6 * u}
              mask={`url(#${gapMask})`}
            />
            <path d={center} fill="none" stroke="var(--ink)" strokeOpacity={0.06} strokeWidth={b.width} />
            {b.edges.map((edge, side) => {
              const i = edgeBoundary(b.id, side);
              return (
                <path
                  key={side}
                  data-boundary={i}
                  d={bandPath(ribbonSlice(b, edge, passage.at, reach))}
                  fill="none"
                  stroke={color(i)}
                  opacity={opacity(i)}
                  strokeWidth={(hot.bandBoundary === i ? 3.5 : 2.5) * u}
                />
              );
            })}
          </g>
        );
      })}
      {geometry.drawings.flatMap((b) =>
        b.twists.map((twist, i) => {
          const component = edgeBoundary(b.id, twist.overSide);
          const path = bandPath(
            ribbonSlice(b, b.edges[twist.overSide], twist.at, Math.max(8 * u, b.width / 3)),
          );
          return (
            <g
              key={`${b.id}:${i}`}
              data-half-twist={b.id}
              data-twist-index={i}
              data-over-side={twist.overSide}
            >
              <path d={path} fill="none" stroke="var(--stage)" strokeWidth={8 * u} />
              <path
                data-boundary={component}
                d={path}
                fill="none"
                stroke={color(component)}
                opacity={opacity(component)}
                strokeWidth={(hot.bandBoundary === component ? 3.5 : 2.5) * u}
              />
            </g>
          );
        }),
      )}
      {geometry.drawings
        .filter((b) => hot.bandIds?.includes(b.id))
        .map((b) => (
          <path
            key={b.id}
            data-band-mark={b.id}
            d={bandPath(b.center)}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.5 * u}
          />
        ))}
    </g>
  );
}
