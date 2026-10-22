import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
} from 'react';
import { bandGeometry, bandPath, availableFoot, diskPosition } from '../core/band-geometry';
import { deleteBand, normalizeAngle, type BandFoot, type BandSurface, type FootRef } from '../core/bands';
import { containsBox, fitBox, initialView, viewBox } from '../core/diagram';
import type { Point } from '../core/knot';
import type { Action, Hot, State } from '../state/store';
import type { FileActions } from './FileMenu';
import { Toolbar } from './Toolbar';
import { BandPicture } from './BandPicture';
import { useT } from '../i18n/useT';
import { Tip } from './Tip';
type Gesture = { pointer: number; before: State; start: Point; screen: Point } & (
  { kind: 'disk'; id: number } | { kind: 'foot'; ref: FootRef } | { kind: 'band'; foot: BandFoot }
);
export function BandStage({
  state,
  hot,
  dispatch,
  fileActions,
}: {
  state: State;
  hot: Hot;
  dispatch: Dispatch<Action>;
  fileActions: FileActions;
}) {
  const t = useT(),
    root = useRef<HTMLElement>(null),
    svg = useRef<SVGSVGElement>(null),
    tools = useRef<HTMLDivElement>(null);
  const surface = state.bandBoard!.surface;
  const geometry = useMemo(() => bandGeometry(surface), [surface]);
  const [view, setView] = useState(initialView),
    [draft, setDraft] = useState<Point[] | null>(null),
    [draggingFoot, setDraggingFoot] = useState<FootRef | null>(null),
    [selected, setSelected] = useState<{ band?: number; disk?: number } | null>(null);
  const gesture = useRef<Gesture | null>(null),
    preview = useRef<BandSurface | null>(null);
  useLayoutEffect(() => setSelected(null), [state.epoch]);
  const measured = useRef<{ width: number; height: number; toolbar: number; epoch: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const r = root.current?.getBoundingClientRect();
      if (!r?.width || !r.height) return;
      const toolbar = tools.current?.offsetHeight ?? 0,
        prev = measured.current;
      if (
        !prev ||
        prev.width !== r.width ||
        prev.height !== r.height ||
        prev.toolbar !== toolbar ||
        prev.epoch !== state.epoch ||
        (!gesture.current && !containsBox(view, geometry.box, toolbar))
      )
        setView(fitBox(geometry.box, r.width, r.height, toolbar));
      measured.current = { width: r.width, height: r.height, toolbar, epoch: state.epoch };
    };
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    if (tools.current) observer.observe(tools.current);
    measure();
    return () => observer.disconnect();
  }, [geometry, state.epoch, state.bandBoard]);
  const point = (e: { clientX: number; clientY: number }): Point => {
    const matrix = svg.current!.getScreenCTM()!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return [p.x, p.y];
  };
  const nearestEdge = (p: Point): BandFoot | null => {
    const disk = surface.disks
      .filter((d) => Math.abs(Math.hypot(p[0] - d.center[0], p[1] - d.center[1]) - d.radius) <= 12 * view.u)
      .sort(
        (a, b) =>
          Math.abs(Math.hypot(p[0] - a.center[0], p[1] - a.center[1]) - a.radius) -
          Math.abs(Math.hypot(p[0] - b.center[0], p[1] - b.center[1]) - b.radius),
      )[0];
    return disk
      ? { disk: disk.id, angle: normalizeAngle(Math.atan2(p[1] - disk.center[1], p[0] - disk.center[0])) }
      : null;
  };
  const clearGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    preview.current = null;
    setDraft(null);
    setDraggingFoot(null);
    if (g && svg.current?.hasPointerCapture(g.pointer)) svg.current.releasePointerCapture(g.pointer);
  };
  const cancel = () => {
    const g = gesture.current;
    clearGesture();
    if (g && g.kind !== 'band') dispatch({ type: 'band-cancel', before: g.before });
  };
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gesture.current) {
        e.preventDefault();
        cancel();
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
    if (g && surface !== g.before.bandBoard?.surface && surface !== preview.current) clearGesture();
  }, [surface]);
  const commit = (next: BandSurface, coalesce = false) =>
    dispatch({ type: 'band-edit', surface: next, coalesce });
  const twist = (id: number, delta = 1) =>
    commit({
      ...surface,
      bands: surface.bands.map((b) => (b.id === id ? { ...b, halfTwists: b.halfTwists + delta } : b)),
    });
  const removeBand = (id: number) => {
    commit(deleteBand(surface, id));
    setSelected(null);
  };
  const begin = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || gesture.current) return;
    const target = e.target instanceof Element ? e.target : null;
    const foot = target?.closest('[data-foot-band]');
    if (target?.closest('[data-band-hit], [data-strip-crossing], [data-band-stepper]')) return;
    const p = point(e),
      base = { pointer: e.pointerId, before: state, start: p, screen: [e.clientX, e.clientY] as Point };
    if (foot) {
      (foot as SVGElement).focus();
      const ref = {
        band: Number(foot.getAttribute('data-foot-band')),
        foot: Number(foot.getAttribute('data-foot-index')) as 0 | 1,
      };
      gesture.current = { ...base, kind: 'foot', ref };
      setDraggingFoot(ref);
      setSelected({ band: ref.band });
    } else {
      const edge = nearestEdge(p);
      if (edge) {
        gesture.current = { ...base, kind: 'band', foot: availableFoot(surface, edge) };
        setDraft([geometry.footPoint(edge), p]);
      } else {
        const disk = surface.disks
          .slice()
          .reverse()
          .find((d) => Math.hypot(p[0] - d.center[0], p[1] - d.center[1]) < d.radius);
        if (!disk) {
          setSelected(null);
          return;
        }
        gesture.current = { ...base, kind: 'disk', id: disk.id };
        svg.current?.querySelector<SVGCircleElement>(`[data-disk-hit="${disk.id}"]`)?.focus();
        setSelected({ disk: disk.id });
      }
    }
    e.preventDefault();
    svg.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) {
      finish(e);
      return;
    }
    const p = point(e),
      s = g.before.bandBoard!.surface;
    if (g.kind === 'band') {
      setDraft([geometry.footPoint(g.foot), p]);
      return;
    }
    if (Math.hypot(e.clientX - g.screen[0], e.clientY - g.screen[1]) < 3) return;
    let next: BandSurface;
    if (g.kind === 'disk') {
      const disk = s.disks.find((d) => d.id === g.id)!;
      const center = diskPosition(
        s,
        disk,
        [disk.center[0] + p[0] - g.start[0], disk.center[1] + p[1] - g.start[1]],
        disk.center,
      );
      next = {
        ...s,
        disks: s.disks.map((d) => (d.id === g.id ? { ...d, center } : d)),
        // A tied ribbon on this disk travels with it; its embedded knot must
        // not be dragged through the disk by leaving the route behind.
        bands: s.bands.map((b) =>
          b.route && b.feet.every((f) => f.disk === g.id)
            ? {
                ...b,
                route: b.route.map(
                  (q) => [q[0] + (center[0] - disk.center[0]), q[1] + (center[1] - disk.center[1])] as Point,
                ),
              }
            : b,
        ),
      };
    } else {
      const b = s.bands.find((b) => b.id === g.ref.band)!,
        f = b.feet[g.ref.foot],
        d = s.disks.find((d) => d.id === f.disk)!;
      const nextFoot = availableFoot(
        s,
        { disk: f.disk, angle: Math.atan2(p[1] - d.center[1], p[0] - d.center[0]) },
        g.ref,
        1e-6,
      );
      next = {
        ...s,
        bands: s.bands.map((b) =>
          b.id === g.ref.band
            ? { ...b, feet: b.feet.map((f, i) => (i === g.ref.foot ? nextFoot : f)) as typeof b.feet }
            : b,
        ),
      };
    }
    preview.current = next;
    dispatch({ type: 'band-edit', surface: next, preview: true });
  };
  const finish = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const next = preview.current;
    clearGesture();
    if (g.kind === 'band') {
      if (Math.hypot(e.clientX - g.screen[0], e.clientY - g.screen[1]) < 4) return;
      const end = nearestEdge(point(e));
      if (!end) return;
      const s = g.before.bandBoard!.surface,
        id = Math.max(-1, ...s.bands.map((b) => b.id)) + 1;
      const start = availableFoot(s, g.foot);
      const temp = {
        ...s,
        bands: [...s.bands, { id, feet: [start, start] as [BandFoot, BandFoot], halfTwists: 0 }],
      };
      const last = availableFoot(temp, end, { band: id, foot: 1 });
      commit({ ...s, bands: [...s.bands, { id, feet: [start, last], halfTwists: 0 }] });
      setSelected({ band: id });
    } else if (next) dispatch({ type: 'band-edit', surface: next, before: g.before });
  };
  const bandKey = (e: React.KeyboardEvent, id: number) => {
    if (['Enter', ' ', '+', '=', '-', '−'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat || e.key === '+' || e.key === '-') twist(id, e.key === '-' || e.key === '−' ? -1 : 1);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      removeBand(id);
    }
  };
  const selectedBand = surface.bands.find((b) => b.id === selected?.band);
  const selectedDrawing = geometry.drawings.find((b) => b.id === selectedBand?.id);
  return (
    <section ref={root} className="stage band-stage" aria-label={t('bands.board')}>
      <svg
        ref={svg}
        className="diagram-svg band-svg"
        style={{ '--u': view.u } as CSSProperties}
        viewBox={viewBox(view)}
        role="group"
        aria-label={t('bands.board')}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          if (gesture.current) cancel();
        }}
        onDoubleClick={(e) => {
          if (e.target !== svg.current) return;
          e.preventDefault();
          const p = point(e);
          const disk = { id: Math.max(-1, ...surface.disks.map((d) => d.id)) + 1, center: p, radius: 80 };
          commit({
            ...surface,
            disks: [...surface.disks, { ...disk, center: diskPosition(surface, disk, p) }],
          });
        }}
        onKeyDown={(e) => {
          if (selected?.band !== undefined && ['+', '=', '-', '−'].includes(e.key)) {
            bandKey(e, selected.band);
            return;
          }
          if ((e.key === 'Delete' || e.key === 'Backspace') && selected?.band !== undefined) {
            e.preventDefault();
            removeBand(selected.band);
            return;
          }
          if (
            (e.key === 'Delete' || e.key === 'Backspace') &&
            selected?.disk !== undefined &&
            !surface.bands.some((b) => b.feet.some((f) => f.disk === selected.disk))
          ) {
            e.preventDefault();
            commit({ ...surface, disks: surface.disks.filter((d) => d.id !== selected.disk) });
            setSelected(null);
          }
        }}
      >
        <title>{t('bands.halfTwistsBoardTip')}</title>
        <BandPicture surface={surface} geometry={geometry} hot={hot} u={view.u} />
        {surface.disks.map((d) => (
          <circle
            key={d.id}
            data-disk-hit={d.id}
            className="band-disk-hit"
            cx={d.center[0]}
            cy={d.center[1]}
            r={d.radius}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={t('bands.diskTip', { n: d.id + 1 })}
            onFocus={() => setSelected({ disk: d.id })}
            onKeyDown={(e) => {
              if (
                (e.key === 'Delete' || e.key === 'Backspace') &&
                !surface.bands.some((b) => b.feet.some((f) => f.disk === d.id))
              ) {
                e.preventDefault();
                e.stopPropagation();
                commit({ ...surface, disks: surface.disks.filter((v) => v.id !== d.id) });
              }
            }}
          >
            <title>{t('bands.diskTip', { n: d.id + 1 })}</title>
          </circle>
        ))}
        {geometry.drawings.map((b) => (
          <g
            key={b.id}
            data-band-hit={b.id}
            className="band-hit"
            role="button"
            tabIndex={0}
            aria-label={t('bands.selectBandTip', { n: b.id + 1 })}
            aria-pressed={selectedBand?.id === b.id}
            onClick={(e) => {
              e.currentTarget.focus();
              setSelected({ band: b.id });
            }}
            onFocus={() => setSelected({ band: b.id })}
            onKeyDown={(e) => bandKey(e, b.id)}
          >
            <title>{t('bands.selectBandTip', { n: b.id + 1 })}</title>
            <path
              d={bandPath(b.center)}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(b.width, 24 * view.u)}
            />
            <circle
              data-band-middle-target={b.id}
              cx={b.middle[0]}
              cy={b.middle[1]}
              r={12 * view.u}
              fill="transparent"
            />
            <circle
              className="band-focus-ring"
              cx={b.middle[0]}
              cy={b.middle[1]}
              r={4.5 * view.u}
              fill="none"
              pointerEvents="none"
              strokeWidth={1.5 * view.u}
            />
          </g>
        ))}
        {geometry.crossings.map((c, i) => (
          <circle
            key={c.key}
            data-strip-crossing={c.key}
            data-over-passage={c.over}
            className="band-strip-crossing"
            cx={c.point[0]}
            cy={c.point[1]}
            r={12 * view.u}
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={t('bands.stripCrossingTip', { n: i + 1 })}
            onClick={(e) => {
              e.stopPropagation();
              commit({ ...surface, stripOver: { ...surface.stripOver, [c.key]: c.over === 0 ? 1 : 0 } });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (!e.repeat)
                  commit({ ...surface, stripOver: { ...surface.stripOver, [c.key]: c.over === 0 ? 1 : 0 } });
              }
            }}
          >
            <title>{t('bands.stripCrossingTip', { n: i + 1 })}</title>
          </circle>
        ))}
        {surface.bands.flatMap((b) =>
          b.feet.map((f, i) => {
            const p = geometry.footPoint(f);
            return (
              <g
                key={`${b.id}:${i}`}
                data-foot-band={b.id}
                data-foot-index={i}
                className="band-foot"
                data-dragging={draggingFoot?.band === b.id && draggingFoot.foot === i ? 'true' : undefined}
                role="button"
                tabIndex={0}
                aria-label={t('bands.halfTwistsFootTip', { n: b.id + 1, foot: i + 1 })}
                onFocus={() => setSelected({ band: b.id })}
                onKeyDown={(e) => {
                  if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(e.key)) {
                    e.preventDefault();
                    const delta =
                      (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1) * (e.shiftKey ? 0.2 : 0.05);
                    const foot = availableFoot(
                      surface,
                      { ...f, angle: f.angle + delta },
                      { band: b.id, foot: i as 0 | 1 },
                    );
                    commit(
                      {
                        ...surface,
                        bands: surface.bands.map((v) =>
                          v.id === b.id
                            ? { ...v, feet: v.feet.map((q, j) => (j === i ? foot : q)) as typeof v.feet }
                            : v,
                        ),
                      },
                      e.repeat,
                    );
                  } else bandKey(e, b.id);
                }}
              >
                <title>{t('bands.halfTwistsFootTip', { n: b.id + 1, foot: i + 1 })}</title>
                <circle cx={p[0]} cy={p[1]} r={12 * view.u} fill="transparent" />
                <circle
                  className="band-foot-dot"
                  cx={p[0]}
                  cy={p[1]}
                  r={4.5 * view.u}
                  fill="none"
                  pointerEvents="none"
                  strokeWidth={1.5 * view.u}
                />
              </g>
            );
          }),
        )}
        {selectedBand && selectedDrawing && (
          <foreignObject
            data-band-stepper={selectedBand.id}
            x={Math.max(
              view.x + 8 * view.u,
              Math.min(selectedDrawing.middle[0] + 18 * view.u, view.x + view.w - 156 * view.u),
            )}
            y={Math.max(
              view.y + ((tools.current?.offsetHeight ?? 0) + 12) * view.u,
              Math.min(selectedDrawing.middle[1] - 38 * view.u, view.y + view.h - 48 * view.u),
            )}
            width={148 * view.u}
            height={36 * view.u}
          >
            <div className="band-twist-stepper" style={{ transform: `scale(${view.u})` }}>
              <Tip text={t('bands.removeHalfTwist')}>
                <button
                  className="ghost"
                  data-twist-minus
                  aria-label={t('bands.removeHalfTwist')}
                  onClick={() => twist(selectedBand.id, -1)}
                >
                  −
                </button>
              </Tip>
              <span className="m">½ × </span>
              <span
                className="p-field"
                role="spinbutton"
                tabIndex={0}
                aria-label={t('bands.halfTwists')}
                aria-valuenow={selectedBand.halfTwists}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    e.stopPropagation();
                    twist(selectedBand.id, e.key === 'ArrowUp' ? 1 : -1);
                  } else bandKey(e, selectedBand.id);
                }}
              >
                {String(selectedBand.halfTwists).replace('-', '−')}
              </span>
              <Tip text={t('bands.addHalfTwist')}>
                <button
                  className="ghost"
                  data-twist-plus
                  aria-label={t('bands.addHalfTwist')}
                  onClick={() => twist(selectedBand.id)}
                >
                  +
                </button>
              </Tip>
            </div>
          </foreignObject>
        )}
        {draft && (
          <path
            d={bandPath(draft)}
            className="live"
            strokeWidth={2 * view.u}
            strokeDasharray={`${5 * view.u} ${5 * view.u}`}
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
        {state.status}
      </p>
    </section>
  );
}
