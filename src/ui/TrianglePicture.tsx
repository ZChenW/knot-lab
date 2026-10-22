import { Fragment } from 'react';
import { analyse, edgeKey, type Edge, type Net, type Triangulation } from '../core/triangulation';
import { labelColor } from '../core/diagram';
import type { Hot } from '../state/store';
import { useT } from '../i18n/useT';
export function TrianglePicture({
  net,
  numbers = analyse(net),
  u = 1,
  hot = {},
  onReverse,
  onUnglue,
  monochrome = false,
  controlsOnly = false,
  seams = true,
}: {
  net: Net;
  numbers?: Triangulation;
  u?: number;
  hot?: Hot;
  onReverse?: (i: number) => void;
  onUnglue?: (i: number) => void;
  monochrome?: boolean;
  controlsOnly?: boolean;
  seams?: boolean;
}) {
  const t = useT(),
    line = (e: Edge) => `M${net.points[e[0]].join(',')}L${net.points[e[1]].join(',')}`;
  const copies = (edges: Edge[]) => {
    const keys = new Set(edges.map(edgeKey));
    for (const g of net.gluings)
      if (keys.has(edgeKey(g.a)) || keys.has(edgeKey(g.b))) {
        keys.add(edgeKey(g.a));
        keys.add(edgeKey(g.b));
      }
    return [...keys];
  };
  const marked = copies(hot.triangleEdges ?? []),
    failed = copies(numbers.parts.flatMap((p) => (p.proof ? [p.proof.edge] : []))),
    points = new Set([
      ...(hot.trianglePoints ?? []),
      ...(hot.trianglePoint === undefined ? [] : [hot.trianglePoint]),
    ]);
  return (
    <g className="triangle-picture">
      {!controlsOnly &&
        net.triangles.map((face, i) => (
          <polygon
            key={i}
            data-triangle={i}
            points={face.map((v) => net.points[v].join(',')).join(' ')}
            className={`triangle-fill${hot.triangleIds?.includes(i) ? ' marked' : ''}`}
            strokeWidth={u}
          />
        ))}
      {!controlsOnly &&
        numbers.boundary?.map((cycle, i) => (
          <g
            key={i}
            data-triangle-boundary={i}
            style={{
              color: monochrome ? 'var(--ink)' : labelColor(i, Math.max(1, numbers.B!)),
              opacity: hot.triangleBoundary === undefined || hot.triangleBoundary === i ? 1 : 0.2,
            }}
          >
            {cycle.map((e) => (
              <path
                key={edgeKey(e)}
                d={line(e)}
                fill="none"
                stroke="currentColor"
                strokeWidth={(hot.triangleBoundary === i ? 4 : 2.5) * u}
              />
            ))}
          </g>
        ))}
      {!controlsOnly &&
        numbers.parts
          .flatMap((p) => p.orders)
          .map(({ triangle, order }) => {
            const pts = order.map((v) => net.points[v]),
              cx = pts.reduce((s, p) => s + p[0], 0) / 3,
              cy = pts.reduce((s, p) => s + p[1], 0) / 3;
            const sign =
              (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) -
                (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]) >
              0
                ? 1
                : -1;
            const min = Math.min(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy))),
              r = Math.min(9 * u, min * 0.25);
            return (
              <g
                key={triangle}
                data-triangle-order={triangle}
                className="triangle-order"
                transform={`translate(${cx} ${cy}) scale(1 ${sign})`}
              >
                <path
                  d={`M${r},0 A${r},${r} 0 1 1 0,${-r} M${-3 * u},${-r - 3 * u} L0,${-r} L${-3 * u},${-r + 3 * u}`}
                  fill="none"
                  strokeWidth={u}
                />
              </g>
            );
          })}
      {!controlsOnly &&
        failed.map((key) => (
          <path
            key={key}
            data-triangle-failure={key}
            d={line(key.split(':').map(Number) as Edge)}
            className="triangle-failure"
            strokeWidth={4 * u}
            strokeDasharray={`${4 * u} ${3 * u}`}
          />
        ))}
      {!controlsOnly &&
        marked.map((key) => (
          <path
            key={key}
            data-triangle-edge-mark={key}
            d={line(key.split(':').map(Number) as Edge)}
            className="triangle-mark"
            strokeWidth={4 * u}
          />
        ))}
      {!controlsOnly &&
        [...points]
          .filter((point) => net.points[point])
          .map((point) => (
            <circle
              key={point}
              data-triangle-point-mark={point}
              cx={net.points[point][0]}
              cy={net.points[point][1]}
              r={10 * u}
              className="triangle-mark"
              strokeWidth={2 * u}
            />
          ))}
      {seams &&
        net.gluings.map((g, i) => (
          <Fragment key={i}>
            {[g.a, g.reversed ? ([...g.b].reverse() as Edge) : g.b].map((e, k) => {
              const a = net.points[e[0]],
                b = net.points[e[1]],
                angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
                len = Math.hypot(b[0] - a[0], b[1] - a[1]);
              const gap = Math.min(12 * u, (len * 0.65) / (i + 2));
              return (
                <g
                  key={k}
                  data-triangle-gluing={i}
                  data-copy={k}
                  className="triangle-gluing"
                  role={onReverse ? 'button' : undefined}
                  tabIndex={onReverse ? 0 : undefined}
                  aria-label={t('tri.gluing', { n: i + 1 })}
                  onPointerDown={onReverse ? (e) => e.stopPropagation() : undefined}
                  onClick={
                    onReverse
                      ? (e) => {
                          e.stopPropagation();
                          onReverse(i);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onReverse
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (!e.repeat) onReverse(i);
                          }
                          if (e.key === 'Delete' || e.key === 'Backspace') {
                            e.preventDefault();
                            onUnglue?.(i);
                          }
                        }
                      : undefined
                  }
                >
                  <title>{t('tri.gluing', { n: i + 1 })}</title>
                  <g transform={`translate(${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2}) rotate(${angle})`}>
                    <rect
                      x={-Math.max(22 * u, (i + 2) * gap) / 2}
                      y={-11 * u}
                      width={Math.max(22 * u, (i + 2) * gap)}
                      height={22 * u}
                      fill="transparent"
                      stroke="none"
                    />
                    {Array.from({ length: i + 1 }, (_, j) => (
                      <path
                        key={j}
                        data-triangle-gluing-mark
                        d={`M${(j - i / 2) * gap - gap / 3},${-6 * u} l${gap / 2},${6 * u} l${-gap / 2},${6 * u}`}
                        fill="none"
                        strokeWidth={1.75 * u}
                      />
                    ))}
                  </g>
                </g>
              );
            })}
          </Fragment>
        ))}
      {!controlsOnly &&
        net.points.map((p, i) => (
          <circle key={i} data-triangle-dot={i} cx={p[0]} cy={p[1]} r={2.5 * u} className="triangle-dot" />
        ))}
    </g>
  );
}
