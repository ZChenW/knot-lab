import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
} from 'react';
import {
  addTriangle,
  analyse,
  edgeKey,
  freeEdges,
  glue,
  netEdges,
  splitEdge,
  splitTriangle,
  unglue,
  type Edge,
  type Net,
} from '../core/triangulation';
import { containsBox, fitBox, initialView, viewBox } from '../core/diagram';
import type { Point } from '../core/knot';
import type { Action, Hot, State } from '../state/store';
import type { FileActions } from './FileMenu';
import { Toolbar } from './Toolbar';
import { TrianglePicture } from './TrianglePicture';
import { useT } from '../i18n/useT';
type Gesture = {
  pointer: number;
  before: State;
  screen: Point;
  kind: 'point' | 'edge' | 'face';
  index: number;
  edge?: Edge;
  start: Point;
};
export function TriangleStage({
  state,
  dispatch,
  hot,
  fileActions,
}: {
  state: State;
  dispatch: Dispatch<Action>;
  hot: Hot;
  fileActions: FileActions;
}) {
  const t = useT(),
    root = useRef<HTMLElement>(null),
    svg = useRef<SVGSVGElement>(null),
    tools = useRef<HTMLDivElement>(null);
  const net = state.triangleBoard!.net,
    numbers = useMemo(() => analyse(net), [net]),
    edges = useMemo(() => netEdges(net), [net]);
  const [view, setView] = useState(initialView),
    [selectedEdge, setSelectedEdge] = useState<Edge | null>(null),
    [draft, setDraft] = useState<Point[] | null>(null);
  const gesture = useRef<Gesture | null>(null),
    preview = useRef<Net | null>(null),
    measured = useRef('');
  useLayoutEffect(() => {
    const measure = () => {
      const r = root.current?.getBoundingClientRect();
      if (!r?.width || !r.height) return;
      const h = tools.current?.offsetHeight ?? 0,
        key = [r.width, r.height, h, state.epoch].join(':');
      const xs = net.points.map((p) => p[0]),
        ys = net.points.map((p) => p[1]);
      const box = xs.length
        ? {
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
            h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
          }
        : { x: 0, y: 0, w: 800, h: 600 };
      if (measured.current === key && (gesture.current || containsBox(view, box, h))) return;
      measured.current = key;
      setView(fitBox(box, r.width, r.height, h));
    };
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    if (tools.current) observer.observe(tools.current);
    measure();
    return () => observer.disconnect();
  }, [net, state.epoch, state.triangleBoard]);
  const point = (e: { clientX: number; clientY: number }): Point => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  const commit = (next: Net, subdivision = false, coalesce = false) => {
    if (next !== net) dispatch({ type: 'triangle-edit', net: next, subdivision, coalesce });
  };
  const reverse = (i: number) =>
    commit({ ...net, gluings: net.gluings.map((g, j) => (i === j ? { ...g, reversed: !g.reversed } : g)) });
  const clear = () => {
    const g = gesture.current;
    gesture.current = null;
    preview.current = null;
    setDraft(null);
    if (g && svg.current?.hasPointerCapture(g.pointer)) svg.current.releasePointerCapture(g.pointer);
  };
  const cancel = () => {
    const g = gesture.current;
    clear();
    if (g && g.kind === 'point') dispatch({ type: 'triangle-cancel', before: g.before });
  };
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gesture.current) {
          e.preventDefault();
          cancel();
        }
        setSelectedEdge(null);
      }
    };
    const blur = () => {
      if (gesture.current) cancel();
    };
    document.addEventListener('keydown', key);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', blur);
    };
  });
  useLayoutEffect(() => {
    const g = gesture.current;
    if (g && net !== g.before.triangleBoard!.net && net !== preview.current) clear();
    setSelectedEdge((current) =>
      current && freeEdges(net).some((e) => edgeKey(e) === edgeKey(current)) ? current : null,
    );
  }, [net]);
  const nearest = (p: Point): Edge | undefined =>
    freeEdges(net)
      .map((edge) => {
        const a = net.points[edge[0]],
          b = net.points[edge[1]],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          f = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        return { edge, d: Math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy) };
      })
      .filter((e) => e.d < 14 * view.u)
      .sort((a, b) => a.d - b.d)[0]?.edge;
  const glueTo = (a: Edge, b: Edge) => {
    const d = (i: number, j: number) =>
      Math.hypot(net.points[i][0] - net.points[j][0], net.points[i][1] - net.points[j][1]);
    return glue(net, a, b, d(a[0], b[1]) + d(a[1], b[0]) < d(a[0], b[0]) + d(a[1], b[1]));
  };
  const keyboardGlue = (edge: Edge) => {
    if (!freeEdges(net).some((e) => edgeKey(e) === edgeKey(edge))) return;
    if (selectedEdge) {
      commit(glueTo(selectedEdge, edge));
      setSelectedEdge(null);
    } else setSelectedEdge(edge);
  };
  const begin = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || gesture.current) return;
    const target = e.target instanceof Element ? e.target : null;
    const p = target?.closest('[data-point-hit]'),
      a = target?.closest('[data-edge-hit]'),
      f = target?.closest('[data-face-hit]');
    if (!p && !a && !f) return;
    e.preventDefault();
    const hit = (p ?? a ?? f) as SVGElement;
    hit.focus();
    const index = Number(
      p?.getAttribute('data-point-hit') ??
        a?.getAttribute('data-edge-hit') ??
        f?.getAttribute('data-face-hit'),
    );
    gesture.current = {
      pointer: e.pointerId,
      before: state,
      screen: [e.clientX, e.clientY],
      start: point(e),
      kind: p ? 'point' : a ? 'edge' : 'face',
      index,
      edge: a ? edges[index] : undefined,
    };
    svg.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) {
      finish(e);
      return;
    }
    const p = point(e);
    if (Math.hypot(e.clientX - g.screen[0], e.clientY - g.screen[1]) < 4) return;
    if (g.kind === 'edge') {
      setDraft([g.start, p]);
      return;
    }
    if (g.kind !== 'point') return;
    const before = g.before.triangleBoard!.net,
      old = before.points[g.index];
    const next = {
      ...before,
      points: before.points.map((v, i): Point =>
        i === g.index ? [old[0] + p[0] - g.start[0], old[1] + p[1] - g.start[1]] : v,
      ),
    };
    preview.current = next;
    dispatch({ type: 'triangle-edit', net: next, preview: true });
  };
  const finish = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const next = preview.current,
      moved = Math.hypot(e.clientX - g.screen[0], e.clientY - g.screen[1]) >= 4;
    clear();
    if (g.kind === 'point') {
      if (next) dispatch({ type: 'triangle-edit', net: next, before: g.before });
      return;
    }
    if (g.kind === 'face') {
      if (!moved) commit(splitTriangle(net, g.index), true);
      return;
    }
    if (moved) {
      const end = nearest(point(e));
      if (end) commit(glueTo(g.edge!, end));
    } else if (e.shiftKey) commit(addTriangle(net, g.edge!));
    else commit(splitEdge(net, g.edge!), true);
  };
  return (
    <section className="stage triangle-stage" ref={root} aria-label={t('tri.board')}>
      <svg
        ref={svg}
        className="diagram-svg triangle-svg"
        viewBox={viewBox(view)}
        style={{ '--u': view.u } as CSSProperties}
        role="group"
        aria-label={t('tri.board')}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          if (gesture.current) cancel();
        }}
      >
        <title>{t('tri.boardTip')}</title>
        <TrianglePicture net={net} numbers={numbers} u={view.u} hot={hot} seams={false} />
        {net.triangles.map((face, i) => (
          <polygon
            key={i}
            data-face-hit={i}
            points={face.map((v) => net.points[v].join(',')).join(' ')}
            className="triangle-face-hit"
            tabIndex={0}
            role="button"
            aria-label={t('tri.face', { n: i + 1 })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!e.repeat) commit(splitTriangle(net, i), true);
              }
            }}
          />
        ))}
        {edges.map((edge, i) => (
          <line
            key={edgeKey(edge)}
            data-edge-hit={i}
            x1={net.points[edge[0]][0]}
            y1={net.points[edge[0]][1]}
            x2={net.points[edge[1]][0]}
            y2={net.points[edge[1]][1]}
            className="triangle-edge-hit"
            strokeWidth={12 * view.u}
            tabIndex={0}
            role="button"
            aria-label={t('tri.edge', { a: edge[0] + 1, b: edge[1] + 1 })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!e.repeat)
                  e.shiftKey ? commit(addTriangle(net, edge)) : commit(splitEdge(net, edge), true);
              }
              if (e.key.toLowerCase() === 'g') {
                e.preventDefault();
                if (!e.repeat) keyboardGlue(edge);
              }
            }}
          />
        ))}
        {net.points.map((p, i) => (
          <circle
            key={i}
            data-point-hit={i}
            cx={p[0]}
            cy={p[1]}
            r={8 * view.u}
            className="triangle-point-hit"
            role="button"
            tabIndex={0}
            aria-label={t('tri.point', { n: i + 1 })}
            onKeyDown={(e) => {
              const delta: Record<string, Point> = {
                ArrowLeft: [-5, 0],
                ArrowRight: [5, 0],
                ArrowUp: [0, -5],
                ArrowDown: [0, 5],
              };
              const d = delta[e.key];
              if (!d) return;
              e.preventDefault();
              commit(
                {
                  ...net,
                  points: net.points.map((p, j): Point =>
                    i === j ? [p[0] + d[0] * view.u, p[1] + d[1] * view.u] : p,
                  ),
                },
                false,
                e.repeat,
              );
            }}
          />
        ))}
        {/* Put seam controls above the hit targets without repainting the net. */}
        <g className="triangle-seam-controls">
          <TrianglePicture
            net={net}
            numbers={numbers}
            controlsOnly
            u={view.u}
            onReverse={reverse}
            onUnglue={(i) => commit(unglue(net, i))}
          />
        </g>
        {selectedEdge && (
          <path
            className="triangle-mark"
            d={`M${net.points[selectedEdge[0]].join(',')}L${net.points[selectedEdge[1]].join(',')}`}
            strokeWidth={4 * view.u}
            pointerEvents="none"
          />
        )}
        {draft && (
          <path
            className="live"
            d={`M${draft[0].join(',')}L${draft[1].join(',')}`}
            strokeWidth={2 * view.u}
            pointerEvents="none"
          />
        )}
      </svg>
      <Toolbar
        state={state}
        dispatch={dispatch}
        loadImage={() => false}
        toolsRef={tools}
        fileActions={fileActions}
      />
      <p className="status" role="status" aria-live="polite">
        {state.status || (selectedEdge ? t('tri.glueStart') : '')}
      </p>
    </section>
  );
}
