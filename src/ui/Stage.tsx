import { useT } from '../i18n/useT';
import {
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent,
} from 'react';
import { analyzeDiagram, reshapedDiagram, splineClosed, type Analysis, type Point } from '../core/knot';
import {
  additionMoves,
  availableMoves,
  applyMove,
  type MoveDiagram,
  type MoveRequest,
  type MoveResult,
} from '../core/moves';
import {
  clampPoint,
  contentBox,
  componentPosition,
  diagramGeometry,
  nearestStrand,
  movePreviewGeometry,
  surfaceOutlineGaps,
  labelColor,
  containsBox,
  fitBox,
  fitDiffers,
  fitView,
  initialView,
  intersectsBox,
  markScale,
  panBy,
  resizeView,
  shouldSample,
  viewBox,
  zoomAt,
  type View,
} from '../core/diagram';
import type { Action, Hot, State } from '../state/store';
import { Diagram } from './Diagram';
import { Toolbar } from './Toolbar';
import type { FileActions } from './FileMenu';
import { Ki } from './format';
import { Tip } from './Tip';
import { MoveMarks, MoveMenu } from './Moves';
import { seifertSurface } from '../core/seifert';
import { componentDiagram } from '../core/components';
import { Surface } from './Surface';
let maskSerial = 0;
export interface MovePreview {
  before: MoveDiagram;
  result: Extract<MoveResult, { ok: true }>;
}
export interface StageProps {
  state: State;
  D: Analysis;
  labels: number[] | null;
  hot: Hot;
  dispatch: Dispatch<Action>;
  setHot: (hot: Hot) => void;
  loadImage: (file: File | null) => boolean;
  onView?: (view: View) => void;
  fileActions?: FileActions;
  onMovePreview?: (preview: MovePreview | null) => void;
}
// 13.D: one active pointer gesture, with a pending draw becoming either a click or freehand.
type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; pointer: number; start: Point; view: View }
  | { kind: 'cross'; pointer: number; start: Point; key: string }
  | { kind: 'label'; pointer: number; start: Point; arc: number }
  | { kind: 'move-menu'; pointer: number; start: Point; point: Point; comp: number; at: number }
  | { kind: 'draw'; pointer: number; start: Point; mode: 'pending' | 'freehand' | 'point'; pts: Point[] }
  | {
      kind: 'reshape';
      pointer: number;
      start: Point;
      anchor: Point;
      before: State;
      id: number;
      t: number;
      radius: number;
      delta: Point;
      diagram: { comps: State['comps']; over: State['over'] };
      frame: number | null;
    };

export function Stage({
  state,
  D,
  labels,
  hot,
  dispatch,
  setHot,
  loadImage,
  onView,
  fileActions,
  onMovePreview,
}: StageProps) {
  const t = useT();
  const maskId = useRef(`move-preview-${++maskSerial}`).current;
  const [movePreview, setMovePreview] = useState<Extract<MoveResult, { ok: true }> | null>(null);
  const [moveMenu, setMoveMenu] = useState<{
    position: Point;
    comp: number;
    at: number;
    point: Point;
  } | null>(null);
  const offered = useMemo(
    () => (state.movesOn ? availableMoves(state, D) : []),
    [state.movesOn, state.comps, state.over, D],
  );
  const additions = useMemo(
    () => (moveMenu ? additionMoves(state, moveMenu.comp, moveMenu.at, moveMenu.point) : []),
    [moveMenu, state.comps, state.over],
  );
  const showMove = (result: MoveResult | null) => {
    const preview = result?.ok ? result : null;
    if (preview) setHot({});
    setMovePreview(preview);
    onMovePreview?.(preview ? { before: { comps: state.comps, over: state.over }, result: preview } : null);
  };
  const applyRequest = (move: MoveRequest) => {
    showMove(null);
    setMoveMenu(null);
    hideHandle();
    setHot({});
    dispatch({ type: 'move', move });
  };
  const root = useRef<HTMLElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const tools = useRef<HTMLDivElement>(null),
    live = useRef<SVGPolylineElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const gestureButton = useRef(1);
  const path = useRef<Point[]>([]),
    handle = useRef<SVGCircleElement>(null),
    ring = useRef<SVGCircleElement>(null);
  const lastClick = useRef<{ time: number; screen: Point } | null>(null);
  const ownDiagram = useRef({ comps: state.comps, over: state.over, epoch: state.epoch, p: state.p });
  const [points, setPoints] = useState<Point[]>([]),
    [reshaping, setReshaping] = useState(false);
  const spaceHeld = useRef(false),
    pointerOver = useRef(false),
    suppressClick = useRef(false);
  const currentView = useRef(initialView),
    manualView = useRef(false);
  const measured = useRef<{
    width: number;
    height: number;
    toolbar: number;
    comps: State['comps'];
    image: State['image'];
    epoch: number;
  } | null>(null);
  const [view, setView] = useState(initialView),
    [drop, setDrop] = useState(false),
    [manual, setManual] = useState(false),
    [fitAvailable, setFitAvailable] = useState(false),
    [space, setSpace] = useState(false),
    [panning, setPanning] = useState(false);
  const crossingTargets = useMemo(
    () => diagramGeometry(D, view.u * markScale(1 / view.u)).crossings,
    [D, view.u],
  );
  const applyView = useCallback(
    (next: View, isManual: boolean) => {
      currentView.current = next;
      manualView.current = isManual;
      setView(next);
      setManual(isManual);
      onView?.(next);
    },
    [onView],
  );
  const automaticView = useCallback(
    (width: number, height: number, toolbar: number) => {
      const box = contentBox(state.comps, !!state.image);
      return state.image || !state.comps.length
        ? fitView(width, height, toolbar, box)
        : fitBox(box, width, height, toolbar);
    },
    [state.comps, state.image],
  );
  const fit = useCallback(() => {
    const size = measured.current;
    if (size) applyView(automaticView(size.width, size.height, size.toolbar), false);
  }, [applyView, automaticView]);
  useLayoutEffect(() => {
    const measure = () => {
      const r = root.current?.getBoundingClientRect();
      if (r?.width && r.height) {
        const toolbar = tools.current?.offsetHeight ?? 0;
        const prev = measured.current;
        const resized =
          !prev || prev.width !== r.width || prev.height !== r.height || prev.toolbar !== toolbar;
        measured.current = {
          width: r.width,
          height: r.height,
          toolbar,
          comps: state.comps,
          image: state.image,
          epoch: state.epoch,
        };
        if (!prev || prev.epoch !== state.epoch || prev.image !== state.image) {
          applyView(automaticView(r.width, r.height, toolbar), false);
        } else {
          const next =
            resized && manualView.current
              ? resizeView(currentView.current, r.width, r.height)
              : currentView.current;
          // An automatic view always shows the whole diagram. A view the user chose is
          // left alone unless the change (an undo, say) leaves nothing of the diagram in it.
          const box = contentBox(state.comps, false);
          const outside =
            prev.comps !== state.comps &&
            gesture.current.kind !== 'reshape' &&
            state.comps.length &&
            (manualView.current ? !intersectsBox(next, box, toolbar) : !containsBox(next, box, toolbar));
          if (outside || (resized && !manualView.current)) {
            applyView(automaticView(r.width, r.height, toolbar), false);
          } else if (resized) applyView(next, manualView.current);
        }
      }
    };
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    if (tools.current) observer.observe(tools.current);
    measure();
    return () => observer.disconnect();
  }, [applyView, automaticView, state.comps, state.image, state.epoch]);
  // 14.F: hold Fit's visibility through live reshape previews, then evaluate the final diagram.
  useLayoutEffect(() => {
    const size = measured.current;
    if (!size || reshaping || gesture.current.kind === 'reshape') return;
    setFitAvailable(
      !!state.comps.length &&
        (manual || fitDiffers(view, automaticView(size.width, size.height, size.toolbar))),
    );
  }, [view, manual, reshaping, automaticView, state.comps]);
  useLayoutEffect(() => {
    const element = root.current;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (gesture.current.kind !== 'idle') return;
      const rect = svg.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      // Wheel events can arrive before React paints the preceding view change.
      // Map against the latest view rather than a potentially stale SVG matrix.
      const v = currentView.current;
      const point: Point = [
        v.x + ((e.clientX - rect.left) / rect.width) * v.w,
        v.y + ((e.clientY - rect.top) / rect.height) * v.h,
      ];
      applyView(zoomAt(v, point, Math.exp(-e.deltaY * 0.0015)), true);
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => element?.removeEventListener('wheel', wheel);
  }, [applyView]);
  // 13.D
  const toSvg = (e: { clientX: number; clientY: number }): Point => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return clampPoint([q.x, q.y], currentView.current);
  };
  const liveLine = (pts: Point[]) =>
    live.current?.setAttribute('points', pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
  const hideHandle = () => {
    handle.current?.setAttribute('visibility', 'hidden');
    if (svg.current) svg.current.style.cursor = '';
  };
  const previewPath = (p?: Point) => {
    const pts = path.current;
    const close =
      !!p && pts.length >= 3 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < 12 * currentView.current.u;
    ring.current?.setAttribute('visibility', close ? 'visible' : 'hidden');
    if (!pts.length) {
      liveLine([]);
      return;
    }
    const input = p && !close ? [...pts, p] : pts;
    const curve = splineClosed(input, 5);
    liveLine(curve.length >= 3 ? [...curve, curve[0]] : curve);
  };
  const setPath = (pts: Point[]) => {
    path.current = pts;
    setPoints(pts);
    hideHandle();
    if (hint.current) hint.current.hidden = !!state.comps.length || !!pts.length;
    previewPath();
  };
  const closePath = () => {
    if (path.current.length < 3) return;
    const pts = path.current;
    setPath([]);
    lastClick.current = null;
    dispatch({ type: 'points', pts });
  };
  // 14.F: strand clicks and empty-board clicks share the same point-path entry.
  const placePoint = (p: Point, e: PointerEvent<SVGSVGElement>) => {
    const first = path.current[0],
      prev = lastClick.current;
    const double =
      prev &&
      e.timeStamp - prev.time < 350 &&
      Math.hypot(e.clientX - prev.screen[0], e.clientY - prev.screen[1]) < 4;
    if ((first && Math.hypot(p[0] - first[0], p[1] - first[1]) < 12 * currentView.current.u) || double)
      closePath();
    else {
      setPath([...path.current, p]);
      lastClick.current = { time: e.timeStamp, screen: [e.clientX, e.clientY] };
    }
  };
  const release = () => {
    const g = gesture.current;
    gesture.current = { kind: 'idle' };
    setPanning(false);
    setReshaping(false);
    if (g.kind !== 'idle' && svg.current?.hasPointerCapture(g.pointer))
      svg.current.releasePointerCapture(g.pointer);
    if (hint.current) hint.current.hidden = !!state.comps.length || !!path.current.length;
  };
  const cancel = (restore = true) => {
    const g = gesture.current;
    if (g.kind === 'reshape') {
      if (g.frame !== null) cancelAnimationFrame(g.frame);
      if (restore) {
        ownDiagram.current = {
          comps: g.before.comps,
          over: g.before.over,
          epoch: g.before.epoch,
          p: g.before.p,
        };
        dispatch({ type: 'reshape-cancel', before: g.before });
      }
    }
    release();
    previewPath();
    hideHandle();
  };
  const reshapeFrame = (g: Extract<Gesture, { kind: 'reshape' }>) => {
    g.frame = null;
    g.diagram = reshapedDiagram(g.before, g.id, g.t, g.delta, g.radius);
    ownDiagram.current = { ...ownDiagram.current, ...g.diagram };
    dispatch({ type: 'reshape', before: g.before, ...g.diagram, phase: 'preview' });
  };
  const boardHover = (e: PointerEvent<SVGSVGElement>) => {
    const p = toSvg(e);
    if (state.movesOn && e.target instanceof Element && e.target.closest('[data-move-mark]')) {
      hideHandle();
      setHot({});
      return;
    }
    if (path.current.length) {
      hideHandle();
      previewPath(p);
      setHot({});
      return;
    }
    const target = e.target instanceof Element ? e.target.closest('[data-cross-key]') : null;
    if (target) {
      hideHandle();
      setHot({ cross: Number(target.getAttribute('data-cross')) });
      return;
    }
    const cross = crossingTargets.find((x) => Math.hypot(x.x - p[0], x.y - p[1]) <= x.radius);
    if (cross) {
      hideHandle();
      setHot({ cross: cross.num });
      return;
    }
    const near = nearestStrand(D, p, 6 * currentView.current.u);
    if (svg.current)
      svg.current.style.cursor = near && !spaceHeld.current ? (state.movesOn ? 'pointer' : 'grab') : '';
    handle.current?.setAttribute('visibility', near ? 'visible' : 'hidden');
    if (near) {
      handle.current?.setAttribute('cx', String(near.point[0]));
      handle.current?.setAttribute('cy', String(near.point[1]));
    }
    setHot(near ? { arc: near.arc } : {});
  };
  const begin = (e: PointerEvent<SVGSVGElement>) => {
    if (gesture.current.kind !== 'idle' || (e.button !== 0 && e.button !== 1)) return;
    const start: Point = [e.clientX, e.clientY];
    const p = toSvg(e),
      target = e.target instanceof Element ? e.target : null;
    hideHandle();
    suppressClick.current = true;
    gestureButton.current = e.button === 1 ? 4 : 1;
    e.preventDefault();
    if (e.button === 1 || spaceHeld.current) {
      gesture.current = { kind: 'pan', pointer: e.pointerId, start, view: currentView.current };
      setPanning(true);
      applyView(currentView.current, true);
    } else if (state.movesOn) {
      setMoveMenu(null);
      showMove(null);
      if (target?.closest('[data-cross-key]')) return;
      const near = nearestStrand(D, p, 6 * currentView.current.u);
      if (!near) return;
      gesture.current = {
        kind: 'move-menu',
        pointer: e.pointerId,
        start,
        point: p,
        comp: near.comp,
        at: componentPosition(state.comps[near.comp], near.point),
      };
    } else if (!path.current.length && target?.closest('[data-cross-key]')) {
      gesture.current = {
        kind: 'cross',
        pointer: e.pointerId,
        start,
        key: target.closest('[data-cross-key]')!.getAttribute('data-cross-key')!,
      };
    } else if (!path.current.length && target?.closest('[data-label-arc]')) {
      gesture.current = {
        kind: 'label',
        pointer: e.pointerId,
        start,
        arc: Number(target.closest('[data-label-arc]')!.getAttribute('data-label-arc')),
      };
    } else {
      const near = path.current.length ? null : nearestStrand(D, p, 6 * currentView.current.u);
      if (near) {
        const c = state.comps[near.comp];
        gesture.current = {
          kind: 'reshape',
          pointer: e.pointerId,
          start,
          anchor: near.point,
          before: state,
          id: c.id!,
          t: componentPosition(c, near.point),
          radius: 90 * currentView.current.u,
          delta: [0, 0],
          diagram: { comps: state.comps, over: state.over },
          frame: null,
        };
        setReshaping(true);
        setHot({});
        hideHandle();
      } else {
        gesture.current = {
          kind: 'draw',
          pointer: e.pointerId,
          start,
          mode: path.current.length ? 'point' : 'pending',
          pts: [p],
        };
        if (hint.current) hint.current.hidden = true;
        if (path.current.length) previewPath(p);
        else liveLine([p]);
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (g.kind === 'idle') {
      boardHover(e);
      return;
    }
    if (g.pointer !== e.pointerId) return;
    // A release can go missing (a middle button under some drivers, a release outside
    // the window): a move after the initiating button is released ends the gesture.
    if (e.pointerType === 'mouse' && !(e.buttons & gestureButton.current)) {
      finish(e);
      return;
    }
    if (g.kind === 'pan') {
      applyView(panBy(g.view, e.clientX - g.start[0], e.clientY - g.start[1]), true);
    } else if (g.kind === 'reshape') {
      if (Math.hypot(e.clientX - g.start[0], e.clientY - g.start[1]) < 4) return;
      const p = toSvg(e);
      g.delta = [p[0] - g.anchor[0], p[1] - g.anchor[1]];
      if (g.frame === null) g.frame = requestAnimationFrame(() => reshapeFrame(g));
    } else if (g.kind === 'draw') {
      const p = toSvg(e);
      if (g.mode === 'point') {
        previewPath(p);
        return;
      }
      if (Math.hypot(e.clientX - g.start[0], e.clientY - g.start[1]) >= 4) g.mode = 'freehand';
      if (shouldSample(p, g.pts[g.pts.length - 1], currentView.current.u)) {
        g.pts.push(p);
        liveLine(g.pts);
      }
    }
  };
  const finish = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (g.kind === 'idle' || g.pointer !== e.pointerId) return;
    if (e.pointerType === 'mouse' && e.buttons & gestureButton.current) return;
    const p = toSvg(e),
      distance = Math.hypot(e.clientX - g.start[0], e.clientY - g.start[1]);
    if (g.kind === 'reshape') {
      if (g.frame !== null) cancelAnimationFrame(g.frame);
      if (distance >= 4) {
        g.delta = [p[0] - g.anchor[0], p[1] - g.anchor[1]];
        g.diagram = reshapedDiagram(g.before, g.id, g.t, g.delta, g.radius);
        release();
        dispatch({ type: 'reshape', before: g.before, ...g.diagram, phase: 'commit' });
      } else {
        cancel();
        placePoint(p, e);
      }
      hideHandle();
      return;
    }
    release();
    if (g.kind === 'move-menu' && distance < 4) {
      const rect = root.current!.getBoundingClientRect();
      setMoveMenu({
        position: [e.clientX - rect.left, e.clientY - rect.top],
        comp: g.comp,
        at: g.at,
        point: g.point,
      });
      suppressClick.current = false;
    } else if (g.kind === 'cross' && distance < 4) dispatch({ type: 'toggle', key: g.key });
    else if (g.kind === 'label' && distance < 4) dispatch({ type: 'renumber', arc: g.arc });
    else if (g.kind === 'draw') {
      if (g.mode === 'freehand' || (g.mode === 'pending' && distance >= 4)) {
        if (shouldSample(p, g.pts[g.pts.length - 1], currentView.current.u)) g.pts.push(p);
        liveLine([]);
        dispatch({ type: 'stroke', pts: g.pts });
      } else placePoint(p, e);
    }
  };
  useLayoutEffect(() => {
    const own = ownDiagram.current;
    if (
      own.comps !== state.comps ||
      own.over !== state.over ||
      own.epoch !== state.epoch ||
      (gesture.current.kind !== 'reshape' && own.p !== state.p)
    ) {
      cancel(false);
      setPath([]);
      lastClick.current = null;
    }
    ownDiagram.current = { comps: state.comps, over: state.over, epoch: state.epoch, p: state.p };
  }, [state.comps, state.over, state.epoch, state.p]);
  useLayoutEffect(() => {
    showMove(null);
    setMoveMenu(null);
  }, [state.movesOn, state.comps, state.over, state.p]);
  useLayoutEffect(() => {
    if (!state.movesOn) return;
    const g = gesture.current;
    cancel(false);
    setPath([]);
    // Entering the mode during a live reshape restores its start without
    // losing the requested mode. Ordinary reshape frames keep their gesture.
    if (g.kind === 'reshape') dispatch({ type: 'reshape-cancel', before: { ...g.before, movesOn: true } });
  }, [state.movesOn]);
  useLayoutEffect(() => {
    const isTextField = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.alone !== null) {
        dispatch({ type: 'alone', index: null });
        setHot({});
      }
      if (isTextField(e.target)) return;
      if (
        e.target instanceof Element &&
        e.target.closest('.surface-toggle') &&
        (e.key === 'Enter' || e.key === ' ')
      )
        return;
      if (e.key === 'Escape' && state.movesOn) {
        e.preventDefault();
        e.stopPropagation();
        showMove(null);
        setMoveMenu(null);
        cancel(false);
        dispatch({ type: 'moves', on: false });
      } else if (e.key === 'Escape' && (gesture.current.kind !== 'idle' || path.current.length)) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
        setPath([]);
        lastClick.current = null;
      } else if (
        path.current.length &&
        (e.key === 'Enter' ||
          e.key === 'Backspace' ||
          ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Enter') {
          cancel();
          closePath();
        } else {
          cancel();
          setPath(path.current.slice(0, -1));
          lastClick.current = null;
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === '0') {
        e.preventDefault();
        fit();
      } else if (e.code === 'Space' || e.key === ' ') {
        // Move marks and menu rows use Space to apply their focused move.
        if (state.movesOn && e.target instanceof Element && e.target.closest('[data-move-mark], .move-menu'))
          return;
        spaceHeld.current = true;
        setSpace(true);
        if (pointerOver.current || gesture.current.kind === 'pan') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (e.target instanceof Element && e.target.closest('.surface-toggle')) return;
      spaceHeld.current = false;
      setSpace(false);
      if (!isTextField(e.target) && (pointerOver.current || gesture.current.kind === 'pan')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const blur = () => {
      spaceHeld.current = false;
      setSpace(false);
      cancel();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', blur);
    };
  });
  useLayoutEffect(
    () => () => {
      const g = gesture.current;
      if (g.kind === 'reshape' && g.frame !== null) cancelAnimationFrame(g.frame);
    },
    [],
  );
  const m = view.u * markScale(1 / view.u);
  const previewGeometry = useMemo(
    () => (movePreview ? movePreviewGeometry(D, analyzeDiagram(movePreview.diagram), m) : null),
    [D, movePreview, m],
  );
  const surface = useMemo(() => {
    if (!state.surfaceOn) return null;
    const diagram = movePreview?.diagram ?? state;
    return seifertSurface(state.alone === null ? diagram : componentDiagram(diagram, state.alone));
  }, [state.surfaceOn, state.comps, state.over, state.alone, movePreview]);
  const surfaceGaps = useMemo(
    () =>
      state.surfaceOn && hot.surface
        ? surfaceOutlineGaps(movePreview ? analyzeDiagram(movePreview.diagram) : D, m)
        : [],
    [state.surfaceOn, hot.surface, movePreview, state.comps, state.over, state.alone, D, m],
  );
  const surfaceStrands = useMemo(
    () =>
      state.surfaceOn
        ? (movePreview ? analyzeDiagram(movePreview.diagram) : D).arcs.map((arc) =>
            arc.closed ? [...arc.pts, arc.pts[0]] : arc.pts,
          )
        : [],
    [state.surfaceOn, movePreview, D],
  );
  const markLabels = useMemo(() => {
    const geo = diagramGeometry(D, m);
    return [...geo.arcs.map((a) => a.label), ...geo.crossings.map((x) => x.label)];
  }, [D, m]);
  return (
    <section
      ref={root}
      className={`stage${state.movesOn ? ' moves-mode' : ''}${state.image && state.mode === 'trace' ? ' paper' : ''}${drop ? ' drop' : ''}${manual ? ' manual' : ''}${fitAvailable ? ' fit-available' : ''}${space ? ' pan-ready' : ''}${panning ? ' panning' : ''}${reshaping ? ' reshaping' : ''}${points.length ? ' point-path' : ''}`}
      aria-label={t('board.label')}
      onPointerEnter={() => {
        pointerOver.current = true;
      }}
      onPointerLeave={() => {
        pointerOver.current = false;
        hideHandle();
        setHot({});
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrop(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrop(false);
        loadImage(e.dataTransfer.files[0] ?? null);
      }}
    >
      <svg
        ref={svg}
        className={`diagram-svg${surface && hot.surface === 'boundary' ? ' surface-boundary' : ''}${hot.arc !== undefined || hot.arcs !== undefined || hot.comp !== undefined || Array.isArray(hot.signs) ? ' dim' : ''}`}
        viewBox={viewBox(view)}
        role="group"
        aria-label={t('board.diagram')}
        style={{ '--u': m } as CSSProperties}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={(e) => {
          if (gesture.current.kind !== 'idle' && gesture.current.pointer === e.pointerId) cancel();
        }}
        onLostPointerCapture={(e) => {
          if (gesture.current.kind !== 'idle' && gesture.current.pointer === e.pointerId) cancel();
        }}
        onPointerLeave={() => {
          hideHandle();
          setHot({});
        }}
        onClickCapture={(e) => {
          if ((suppressClick.current && e.detail > 0) || spaceHeld.current) {
            e.preventDefault();
            e.stopPropagation();
          }
          suppressClick.current = false;
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          if (!state.movesOn) closePath();
        }}
      >
        {state.image && state.mode === 'trace' && (
          <image
            href={state.image}
            x={0}
            y={0}
            width={800}
            height={600}
            preserveAspectRatio="xMidYMid meet"
            opacity={state.opacity}
          />
        )}
        {surface && (
          <Surface
            surface={surface}
            mark={hot.surface}
            m={m}
            gaps={surfaceGaps}
            strands={surfaceStrands}
            view={view}
          />
        )}
        {previewGeometry && (
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={view.x} y={view.y} width={view.w} height={view.h}>
              <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="white" />
              {previewGeometry.before.map((p, i) => (
                <path key={i} d={p.path} fill="none" stroke="black" strokeWidth={4 * m} />
              ))}
            </mask>
          </defs>
        )}
        <g mask={previewGeometry ? `url(#${maskId})` : undefined}>
          <Diagram
            D={D}
            u={view.u}
            labels={labels}
            p={state.p}
            hot={hot}
            toggle={(key) => dispatch({ type: 'toggle', key })}
            renumber={state.movesOn ? undefined : (arc) => dispatch({ type: 'renumber', arc })}
            movesOn={state.movesOn}
            pointPath={!!points.length}
            alone={state.alone}
          />
        </g>
        {previewGeometry && (
          <g className="move-preview" pointerEvents="none">
            <g opacity={0.3}>
              {previewGeometry.before.map((p, i) => (
                <path
                  key={i}
                  d={p.path}
                  className="arc"
                  style={{ stroke: labels ? labelColor(labels[p.arc], state.p) : undefined }}
                />
              ))}
            </g>
            {previewGeometry.after.map((p, i) => (
              <path key={i} d={p.path} className="live" strokeDasharray={`${5 * m} ${5 * m}`} />
            ))}
          </g>
        )}
        <polyline ref={live} className="live" points="" strokeDasharray={`${5 * m} ${5 * m}`} />
        <g className="point-dots">
          {points.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={3 * m} />
          ))}
          <circle
            ref={ring}
            className="close-ring"
            cx={points[0]?.[0] ?? 0}
            cy={points[0]?.[1] ?? 0}
            r={7 * m}
            visibility="hidden"
          />
        </g>
        <circle
          ref={handle}
          className="reshape-handle"
          r={4.5 * m}
          strokeWidth={1.5 * m}
          visibility="hidden"
        />
        {state.movesOn && (
          <MoveMarks
            moves={offered}
            u={view.u}
            m={m}
            labels={markLabels}
            preview={(move) => showMove(move ? applyMove(state, move) : null)}
            apply={applyRequest}
          />
        )}
      </svg>
      {state.movesOn && moveMenu && (
        <MoveMenu
          position={moveMenu.position}
          items={additions}
          close={() => {
            setMoveMenu(null);
            showMove(null);
          }}
          preview={showMove}
          apply={applyRequest}
        />
      )}
      {!state.movesOn && (
        <div ref={hint} className="hint" hidden={!!state.comps.length || !!points.length}>
          <b>{t('board.hint')}</b>
          <span>{t('board.pointHintDetail')}</span>
        </div>
      )}
      <Toolbar
        state={state}
        dispatch={dispatch}
        loadImage={loadImage}
        toolsRef={tools}
        fileActions={fileActions}
      />
      {state.comps.length >= 1 && (
        <div className="parts" onMouseLeave={() => setHot({})}>
          {state.comps.map((c, i) => (
            <span
              key={c.id}
              className="part"
              onMouseEnter={() => setHot({ comp: i })}
              onMouseLeave={() => setHot({})}
              onFocus={() => setHot({ comp: i })}
              onBlur={() => setHot({})}
            >
              {state.comps.length > 1 && (
                <span>
                  <Ki i={i} />
                </span>
              )}
              <button
                className="ghost"
                title={t('board.reverseTitle')}
                onClick={() => dispatch({ type: 'reverse', id: c.id! })}
              >
                {t('board.reverse')}
              </button>

              {state.comps.length > 1 && (
                <button
                  className="ghost"
                  onClick={() => {
                    setHot({});
                    dispatch({ type: 'delete', id: c.id! });
                  }}
                >
                  {t('board.delete')}
                </button>
              )}
              {state.comps.length > 1 && (
                <button
                  className="ghost alone"
                  aria-pressed={state.alone === i}
                  onClick={() => {
                    setHot({});
                    dispatch({ type: 'alone', index: i });
                  }}
                >
                  {t('board.alone')}
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {(state.mode === 'compare' || fitAvailable) && (
        <div className="view-tools">
          {state.mode === 'compare' && <span className="pane-name">{t('board.tracing')}</span>}
          {fitAvailable && (
            <Tip text={t('board.fitTip')}>
              <button className="ghost fit" onClick={fit}>
                {t('board.fit')}
              </button>
            </Tip>
          )}
        </div>
      )}
      <p className="status" role="status" aria-live="polite">
        {points.length
          ? t('board.pointStatus')
          : state.status || (state.movesOn && !offered.length ? t('moves.hint') : '')}
      </p>
    </section>
  );
}
