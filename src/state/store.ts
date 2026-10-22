import { t } from '../i18n';
import * as K from '../core/knot';
import { FRAME } from '../core/diagram';
import type { FileDiagram } from '../core/file';
import {
  FAMILY_DEFAULTS,
  familyAlexander,
  familySamples,
  type Family,
  type FamilyKind,
} from '../core/families';
import { componentDiagram, linkingCounts, tripleProduct } from '../core/components';
import { connectedSum, splitUnion, type Composition, type CompositionOp } from '../core/operations';
import { restoreSession, sessionStorage, type SessionStorage } from './session';
import {
  carryLabeling,
  labelingCoordinates,
  performMove,
  type MoveKind,
  type MoveRequest,
} from '../core/moves';
import { defaultMinor, validMinor, type MinorChoice } from '../core/minors';
import type { WorkingKind } from '../core/working';
import { bandSurface, type BandSurface } from '../core/bands';
import {
  bandExample,
  bandPair,
  BAND_PAIRS,
  type BandExample,
  type BandSelection,
  type BandPair,
} from '../core/band-examples';
import { bandBoundaryDiagram } from '../core/band-boundary';
import { analyse, type Net } from '../core/triangulation';
import { triangleExample, type TriangleExample } from '../core/triangle-examples';

export interface TriangleDocument {
  net: Net;
  example: TriangleExample | '';
  delta: [number, number, number] | null;
}

export interface BandDocument {
  surface: BandSurface;
  example: BandExample | '';
}

export interface DiagramState {
  triangleBoard?: TriangleDocument | null;
  bandBoard?: BandDocument | null;
  comps: K.Component[];
  over: K.OverMap;
  preset: K.PresetKey | '';
  family: Family | null;
  lastMove?: { kind: MoveKind; sign?: number; before: DiagramState } | null;
  composition: Composition | null;
  minor: MinorChoice;
}
type Snapshot = DiagramState & {
  p?: number;
  coeffs?: number[] | null;
  shift?: number;
  versus?: Versus | null;
};
export interface State extends DiagramState {
  // 19.C: a temporary readout selection, outside diagram snapshots and storage.
  alone: number | null;
  aloneReadout: Pick<State, 'p' | 'tryP' | 'coeffs' | 'shift'> | null;
  epoch: number;
  history: Snapshot[];
  future: Snapshot[];
  movesOn: boolean;
  surfaceOn: boolean;
  lastMove: NonNullable<DiagramState['lastMove']> | null;
  nextId: number;
  p: number;
  tryP: string;
  coeffs: number[] | null;
  shift: number;
  status: string;
  image: string | null;
  opacity: number;
  mode: 'trace' | 'compare';
  familyParams: Record<FamilyKind, number[]>;
  workingMatrix: WorkingKind;
  minorEditing: boolean;
  // 19.A: the pinned diagram K; the board edits J, the current diagram.
  versus: Versus | null;
}
// 19.A
export interface Versus {
  diagram: DiagramState;
  title: string;
}
export type Action =
  | { type: 'band-example'; key: BandSelection | '' }
  | { type: 'band-boundary' }
  | { type: 'triangle-example'; key: TriangleExample | '' }
  | {
      type: 'triangle-edit';
      net: Net;
      subdivision?: boolean;
      before?: State;
      preview?: boolean;
      coalesce?: boolean;
    }
  | { type: 'triangle-cancel'; before: State }
  | { type: 'band-edit'; surface: BandSurface; before?: State; preview?: boolean; coalesce?: boolean }
  | { type: 'band-cancel'; before: State }
  // 18.P
  | { type: 'move'; move: MoveRequest }
  | { type: 'moves'; on: boolean }
  | { type: 'surface'; on: boolean }
  | { type: 'alone'; index: number | null }
  | { type: 'minor'; choice: MinorChoice }
  | { type: 'working-matrix'; kind: WorkingKind }
  // 14.F
  | { type: 'tidy' }
  | { type: 'stroke'; pts: K.Point[] }
  // 13.D
  | { type: 'points'; pts: K.Point[] }
  | { type: 'reshape'; before: State; comps: K.Component[]; over: K.OverMap; phase: 'preview' | 'commit' }
  | { type: 'reshape-cancel'; before: State }
  | { type: 'renumber'; arc: number }
  | { type: 'toggle'; key: string }
  | { type: 'preset'; key: K.PresetKey }
  | { type: 'family'; family: Family; coalesce?: boolean }
  | { type: 'combine'; op: CompositionOp; operand: { preset: K.PresetKey } | { family: Family } }
  | { type: 'reverse' | 'delete'; id: number }
  | { type: 'undo' | 'redo' | 'clear' | 'alternate' | 'mirror' | 'relabel' | 'dismiss-status' }
  | { type: 'p'; value: number }
  | { type: 'label-step'; delta: 1 | -1 }
  | { type: 'try-p'; value: string }
  | { type: 'image'; value: string | null }
  | { type: 'opacity'; value: number }
  | { type: 'mode'; value: 'trace' | 'compare' }
  | { type: 'load'; diagram: FileDiagram }
  | { type: 'status'; value: string }
  // 19.A
  | { type: 'versus-pin'; title: string }
  | { type: 'versus-swap'; title: string }
  | { type: 'versus-end' };
export interface Hot {
  arc?: number;
  arcs?: number[];
  cross?: number;
  comp?: number;
  // 13.D
  signs?: 'all' | 'between' | [number, number];
  surface?: 'disks' | 'bands' | 'boundary';
  triangleBoundary?: number;
  triangleIds?: number[];
  trianglePoint?: number;
  trianglePoints?: number[];
  triangleEdges?: import('../core/triangulation').Edge[];
  bandBoundary?: number;
  bandIds?: number[];
}
export function createInitialState(storage: SessionStorage | null = sessionStorage()): State {
  const restored = restoreSession(storage);
  const d = restored ?? K.preset('fig8', FRAME.width, FRAME.height, 1);
  return {
    ...d,
    preset: restored?.preset ?? 'fig8',
    family: restored?.family ?? null,
    composition: null,
    triangleBoard: restored?.triangleBoard ?? null,
    bandBoard: restored?.bandBoard ?? null,
    alone: null,
    aloneReadout: null,
    minor: restored?.minor ?? defaultMinor(K.analyzeDiagram(d).nArcs),
    epoch: 0,
    history: [],
    future: [],
    movesOn: false,
    surfaceOn: restored?.surfaceOn ?? false,
    lastMove: null,
    nextId: 1 + d.comps.length,
    p: restored?.p ?? 5,
    tryP: '',
    coeffs: null,
    shift: 0,
    status: '',
    image: null,
    opacity: 0.4,
    mode: 'trace',
    versus:
      restored?.trianglePin ??
      restored?.bandPin ??
      (restored?.versus
        ? {
            diagram: {
              ...restored.versus.diagram,
              preset: '',
              family: null,
              composition: null,
              minor: pinnedMinor(restored.versus.diagram),
            },
            title: restored.versus.title,
          }
        : null),
    workingMatrix: 'coloring',
    minorEditing: false,
    familyParams: {
      ...FAMILY_DEFAULTS,
      ...(restored?.family ? { [restored.family.kind]: restored.family.params } : {}),
    },
  };
}
function automaticP(det: bigint, p: number): number {
  if (K.isPrime(p) && det % BigInt(p) === 0n) return p;
  if (det === 0n) return 3;
  const oddPrime = K.factorize(det).factors.find((q) => q.p !== 2n);
  return oddPrime ? Number(oddPrime.p) : p;
}
// A step that leaves none of the curves in place swaps the whole diagram, so the board
// refits as it does for a newly loaded one.
function replaced(a: K.Component[], b: K.Component[]) {
  return !a.some((c) => b.some((d) => d.id === c.id));
}
function followDiagram(s: State): State {
  return {
    ...s,
    alone: null,
    aloneReadout: null,
    minorEditing: false,
    p: automaticP(selectAnalysis(s).det, s.p),
    tryP: '',
    coeffs: null,
    shift: 0,
    familyParams: s.family ? { ...s.familyParams, [s.family.kind]: [...s.family.params] } : s.familyParams,
  };
}
function snapshot(s: State): Snapshot {
  return {
    versus: s.versus,
    triangleBoard: s.triangleBoard ?? null,
    bandBoard: s.bandBoard ?? null,
    comps: s.comps,
    over: s.over,
    preset: s.preset,
    family: s.family,
    composition: s.composition,
    minor: s.minor,
    p: s.p,
    lastMove: s.lastMove,
    coeffs: s.coeffs,
    shift: s.shift,
  };
}
// Pictures can finish loading during a drag; they are outside diagram undo.
function keepTrace(before: State, current: State): State {
  if (
    before.alone === null &&
    before.image === current.image &&
    before.opacity === current.opacity &&
    before.mode === current.mode &&
    before.surfaceOn === current.surfaceOn
  )
    return before;
  return {
    ...before,
    alone: null,
    aloneReadout: null,
    image: current.image,
    opacity: current.opacity,
    mode: current.mode,
    surfaceOn: current.surfaceOn,
  };
}
function change(
  s: State,
  d: Omit<DiagramState, 'family' | 'composition' | 'minor'> & {
    family?: Family | null;
    composition?: Composition | null;
  },
  nextId = s.nextId,
  p = s.p,
): State {
  const alive = new Set(K.rawCrossings(d.comps).map((r) => r.key));
  const over = new Map([...d.over].filter(([key]) => alive.has(key)));
  return followDiagram({
    ...s,
    family: null,
    triangleBoard: null,
    bandBoard: null,
    lastMove: null,
    composition: null,
    ...d,
    over,
    minor: defaultMinor(K.analyzeDiagram({ comps: d.comps, over }).nArcs),
    nextId,
    p,
    status: '',
    history: [...s.history, snapshot(s)].slice(-80),
    future: [],
  });
}
export function reducer(s: State, a: Action): State {
  // 19.B: consecutive row/column clicks choose one minor, so one Undo
  // restores the previous choice (B3). Other actions finish that choice.
  return reduceAction(a.type !== 'minor' && s.minorEditing ? { ...s, minorEditing: false } : s, a);
}
function reduceAction(s: State, a: Action): State {
  // Diagram tools have no meaning on the band board, including script callers.
  if (
    (s.bandBoard || s.triangleBoard) &&
    [
      'surface',
      'moves',
      'move',
      'alone',
      'minor',
      'working-matrix',
      'tidy',
      'stroke',
      'points',
      'reshape',
      'reshape-cancel',
      'renumber',
      'toggle',
      'alternate',
      'mirror',
      'reverse',
      'delete',
      'image',
      'opacity',
      'mode',
      'p',
      'try-p',
      'relabel',
      'label-step',
      'combine',
    ].includes(a.type)
  )
    return s;
  // Readout controls operate on the selected component without changing the
  // whole link's saved p, labeling, redo stack or automatic prime choice.
  if (s.alone !== null && a.type === 'minor') return s;
  if (s.alone !== null && ['p', 'try-p', 'relabel', 'label-step'].includes(a.type)) {
    const next = reducer({ ...selectReadoutState(s), alone: null, aloneReadout: null }, a);
    return { ...s, aloneReadout: { p: next.p, tryP: next.tryP, coeffs: next.coeffs, shift: next.shift } };
  }
  switch (a.type) {
    case 'band-example': {
      if (BAND_PAIRS.includes(a.key as BandPair)) {
        const pair = bandPair(a.key as BandPair);
        const next = bandChange(s, { surface: bandExample(pair.current), example: pair.current });
        return {
          ...next,
          versus: {
            title: t(`bands.${pair.pinned}`),
            // Pinned from next, not s: an open triangle board must not ride along with
            // the pinned band surface, or S would take its numbers from the triangles.
            diagram: {
              ...currentDiagram(next),
              bandBoard: { surface: bandExample(pair.pinned), example: pair.pinned },
            },
          },
        };
      }
      return bandChange(s, {
        surface: bandExample((a.key || 'disk') as BandExample),
        example: a.key as BandExample | '',
      });
    }
    case 'band-boundary': {
      if (!s.bandBoard?.surface.disks.length) return s;
      const d = rebase(bandBoundaryDiagram(s.bandBoard.surface), s.nextId);
      return { ...change(s, { ...d, preset: '' }, s.nextId + d.comps.length), epoch: s.epoch + 1 };
    }
    case 'triangle-example':
      return triangleChange(s, { net: triangleExample(a.key || 'triangle'), example: a.key, delta: null });
    case 'triangle-edit': {
      if (!s.triangleBoard || a.net === (a.before ?? s).triangleBoard?.net) return s;
      const after = analyse(a.net),
        before = analyse((a.before ?? s).triangleBoard!.net);
      const board: TriangleDocument = {
        net: a.net,
        example: '',
        delta: a.subdivision ? [after.V - before.V, after.E - before.E, after.F - before.F] : null,
      };
      if (a.preview) return { ...s, triangleBoard: board };
      const next = triangleChange(a.before ?? s, board);
      if (a.coalesce && s.history.length) next.history = s.history;
      return next;
    }
    case 'triangle-cancel':
      return { ...s, ...snapshot(a.before), history: a.before.history, future: a.before.future };
    case 'band-edit': {
      if (!s.bandBoard) return s;
      bandSurface(a.surface);
      const board: BandDocument = { surface: a.surface, example: '' };
      if (a.preview) return { ...s, bandBoard: board };
      const next = bandChange(a.before ?? s, board);
      // Holding an arrow slides continuously but remains one keyboard gesture.
      if (a.coalesce && s.history.length) next.history = s.history;
      return next;
    }
    case 'band-cancel':
      return { ...s, ...snapshot(a.before), history: a.before.history, future: a.before.future };
    // 18.P: the mode is interface state; only a successful checked move is history.
    // With moves on, a component shown alone is put back and the minor returns to the default.
    case 'surface':
      return s.surfaceOn === a.on ? s : { ...s, surfaceOn: a.on };
    case 'moves':
      return {
        ...s,
        movesOn: a.on,
        status: '',
        ...(a.on
          ? {
              alone: null,
              aloneReadout: null,
              minor: defaultMinor(selectAnalysis(s).nArcs),
              minorEditing: false,
            }
          : {}),
      };
    case 'move': {
      const result = performMove(s, a.move);
      if (!result.ok) return { ...s, status: t(result.reason === 'room' ? 'moves.room' : 'moves.geometry') };
      const before = selectAnalysis(s),
        labels = selectLabels(s, before).labels;
      const next = change(s, { ...result.diagram, preset: '' });
      const after = selectAnalysis(next),
        carried = labels ? carryLabeling(before, after, labels, s.p) : null;
      const coordinates = carried ? labelingCoordinates(after, carried, next.p) : null;
      return {
        ...next,
        ...(coordinates ?? {}),
        lastMove: {
          kind: result.kind,
          sign: result.sign,
          before: {
            comps: s.comps,
            over: s.over,
            preset: s.preset,
            family: s.family,
            composition: s.composition,
            minor: s.minor,
          },
        },
      };
    }
    case 'working-matrix':
      return s.workingMatrix === a.kind ? s : { ...s, workingMatrix: a.kind };
    case 'minor': {
      if (
        !validMinor(a.choice, selectAnalysis(s).nArcs) ||
        (a.choice.row === s.minor.row && a.choice.column === s.minor.column)
      )
        return s;
      return {
        ...s,
        minor: { ...a.choice },
        history: s.minorEditing ? s.history : [...s.history, snapshot(s)].slice(-80),
        minorEditing: true,
        future: [],
        status: '',
      };
    }
    case 'alone': {
      const index = a.index === s.alone ? null : a.index;
      if (index === null) return { ...s, alone: null, aloneReadout: null };
      if (s.comps.length < 2 || !Number.isInteger(index) || !s.comps[index]) return s;
      const D = K.analyzeDiagram(componentDiagram(s, index));
      return {
        ...s,
        alone: index,
        aloneReadout: { p: automaticP(D.det, s.p), tryP: '', coeffs: null, shift: 0 },
      };
    }
    // 18.Q: operand factors are captured BEFORE the band is joined.
    case 'combine': {
      if (!s.comps.length) return s;
      try {
        const right =
          'preset' in a.operand
            ? K.preset(a.operand.preset, FRAME.width, FRAME.height, 1)
            : K.placeSamples(familySamples(a.operand.family), FRAME.width, FRAME.height, 1);
        const leftD = selectAnalysis(s),
          rightD = K.analyzeDiagram(right);
        const joined = a.op === 'sum' ? connectedSum(s, right) : splitUnion(s, right);
        const comps = joined.comps.map((c, i) => ({ ...c, id: s.nextId + i }));
        const ids = new Map(joined.comps.map((c, i) => [c.id, comps[i].id]));
        const over: K.OverMap = new Map(
          [...joined.over].map(([key, value]) => {
            const [ida, i, idb, j] = key.split(':').map(Number);
            return [`${ids.get(ida)}:${i}:${ids.get(idb)}:${j}`, value];
          }),
        );
        const composition: Composition = {
          op: a.op,
          left: {
            alex: leftD.alex?.slice() ?? null,
            det: leftD.det,
            preset: s.preset,
            ...(s.composition ? { composition: s.composition } : {}),
          },
          right: {
            alex: rightD.alex?.slice() ?? null,
            det: rightD.det,
            preset: 'preset' in a.operand ? a.operand.preset : '',
          },
        };
        return {
          ...change(s, { comps, over, preset: '', composition }, s.nextId + comps.length),
          epoch: s.epoch + 1,
          familyParams:
            'family' in a.operand
              ? { ...s.familyParams, [a.operand.family.kind]: [...a.operand.family.params] }
              : s.familyParams,
          status: a.op === 'sum' && s.comps.length > 1 ? t('composition.firstComponent') : '',
        };
      } catch (error) {
        return { ...s, status: error instanceof Error ? error.message : String(error) };
      }
    }
    // 14.F
    case 'tidy': {
      const next = K.tidyDiagram(s, { fill: !s.image });
      // tidyDiagram hands back the same arrays when the curves are already smooth
      if (next.comps === s.comps) return s;
      return {
        ...change(s, { comps: next.comps, over: next.over, preset: '' }),
        epoch: s.epoch + Number(!s.image),
      };
    }
    case 'load': {
      // Rebase imported IDs beyond the current allocator, including undo snapshots.
      const comps = a.diagram.comps.map((c, i) => ({ ...c, id: s.nextId + i }));
      const ids = new Map(a.diagram.comps.map((c, i) => [c.id, comps[i].id]));
      const over: K.OverMap = new Map(
        [...a.diagram.over].map(([key, value]) => {
          const [ida, i, idb, j] = key.split(':').map(Number);
          return [`${ids.get(ida)}:${i}:${ids.get(idb)}:${j}`, value];
        }),
      );
      const next = change(s, { comps, over, preset: '' }, s.nextId + comps.length, a.diagram.p);
      // 19.A: opening a file replaces both diagrams.
      next.versus = a.diagram.versus
        ? {
            diagram: {
              ...a.diagram.versus.diagram,
              preset: '',
              family: null,
              composition: null,
              minor: pinnedMinor(a.diagram.versus.diagram),
            },
            title: a.diagram.versus.title,
          }
        : null;
      if (a.diagram.minor && validMinor(a.diagram.minor, selectAnalysis(next).nArcs))
        next.minor = { ...a.diagram.minor };
      next.history[next.history.length - 1] = { ...next.history.at(-1)!, p: s.p };
      return { ...next, surfaceOn: a.diagram.surfaceOn ?? false, epoch: s.epoch + 1 };
    }
    case 'status':
      return { ...s, status: a.value };
    // 19.A: all three are undo steps; the pinned diagram survives every edit of J.
    case 'versus-pin': {
      if (
        s.versus ||
        (s.triangleBoard
          ? !s.triangleBoard.net.triangles.length
          : s.bandBoard
            ? !s.bandBoard.surface.disks.length
            : !s.comps.length)
      )
        return s;
      const versus: Versus = {
        diagram: {
          triangleBoard: s.triangleBoard ?? null,
          bandBoard: s.bandBoard ?? null,
          comps: s.comps,
          over: s.over,
          preset: s.preset,
          family: s.family,
          composition: s.composition,
          minor: pinnedMinor(s),
        },
        title: a.title,
      };
      return changeComparison(s, versus);
    }
    case 'versus-swap': {
      if (!s.versus) return s;
      const pinned = s.versus.diagram;
      if (
        (pinned.triangleBoard || s.triangleBoard) &&
        (pinned.bandBoard || pinned.triangleBoard) &&
        (s.bandBoard || s.triangleBoard)
      ) {
        const next = pinned.triangleBoard
          ? triangleChange(s, pinned.triangleBoard)
          : bandChange(s, pinned.bandBoard!);
        return { ...next, versus: { diagram: currentDiagram(s), title: a.title } };
      }
      if (!!pinned.bandBoard !== !!s.bandBoard || !!pinned.triangleBoard !== !!s.triangleBoard) return s;
      if (pinned.bandBoard && s.bandBoard) {
        return { ...bandChange(s, pinned.bandBoard), versus: { diagram: currentDiagram(s), title: a.title } };
      }
      const { comps, over } = rebase(pinned, s.nextId);
      const versus: Versus = { diagram: currentDiagram(s), title: a.title };
      return {
        ...change(
          s,
          { comps, over, preset: pinned.preset, family: pinned.family, composition: pinned.composition },
          s.nextId + comps.length,
        ),
        versus,
        epoch: s.epoch + 1,
      };
    }
    case 'versus-end':
      return s.versus ? changeComparison(s, null) : s;
    case 'undo': {
      const prev = s.history.at(-1);
      const restore =
        prev?.comps === s.comps && prev.over === s.over && prev.p === s.p
          ? (state: State) => state
          : followDiagram;
      return prev
        ? {
            ...restore({
              ...s,
              ...prev,
              history: s.history.slice(0, -1),
              future: [...s.future, snapshot(s)].slice(-80),
              status: '',
              epoch: s.epoch + Number(replaced(s.comps, prev.comps)),
            }),
            lastMove: prev.lastMove ?? null,
            coeffs: prev.coeffs ?? null,
            shift: prev.shift ?? 0,
          }
        : s;
    }
    case 'redo': {
      const next = s.future.at(-1);
      const restore =
        next?.comps === s.comps && next.over === s.over && next.p === s.p
          ? (state: State) => state
          : followDiagram;
      return next
        ? {
            ...restore({
              ...s,
              ...next,
              future: s.future.slice(0, -1),
              history: [...s.history, snapshot(s)].slice(-80),
              status: '',
              epoch: s.epoch + Number(replaced(s.comps, next.comps)),
            }),
            lastMove: next.lastMove ?? null,
            coeffs: next.coeffs ?? null,
            shift: next.shift ?? 0,
          }
        : s;
    }
    case 'family': {
      const d = K.placeSamples(familySamples(a.family), FRAME.width, FRAME.height, s.nextId);
      const next = change(
        s,
        { ...d, preset: '', family: { kind: a.family.kind, params: [...a.family.params] } },
        s.nextId + d.comps.length,
      );
      // 14.H: later keystrokes in one focused parameter retain the first snapshot.
      if (a.coalesce && s.family?.kind === a.family.kind && s.history.length) next.history = s.history;
      return { ...next, epoch: s.epoch + 1 };
    }
    case 'points':
    case 'stroke': {
      if (s.movesOn) return s;
      const pts =
        a.type === 'points' ? (a.pts.length >= 3 ? K.splineClosed(a.pts, 5) : null) : K.processStroke(a.pts);
      if (!pts || pts.length < 3) return { ...s, status: t('stroke.short') };
      const comps = [...s.comps, { id: s.nextId, rev: false, pts }];
      const raw = K.rawCrossings(comps);
      if (raw.length > 120) return { ...s, status: t('stroke.crossings', { n: raw.length }) };
      const alt = K.alternatingStates(comps, raw, s.over),
        over = new Map(s.over);
      raw.forEach((r) => {
        if (!over.has(r.key)) over.set(r.key, alt.get(r.key)!);
      });
      return change(s, { comps, over, preset: '' }, s.nextId + 1);
    }
    // 13.D: previews have no history entry; commit and cancel use the drag's snapshot.
    case 'reshape-cancel':
      return keepTrace(a.before, s);
    case 'reshape': {
      if (s.movesOn) return s;
      if (a.phase === 'preview')
        return followDiagram({
          ...s,
          comps: a.comps,
          over: a.over,
          preset: '',
          family: null,
          composition: null,
          lastMove: null,
          minor: defaultMinor(K.analyzeDiagram({ comps: a.comps, over: a.over }).nArcs),
          status: '',
        });
      const comps = a.comps.map((c) => {
        const old = a.before.comps.find((v) => v.id === c.id);
        return old?.pts === c.pts ? c : { ...c, pts: K.resampleClosed(K.splineClosed(c.pts, 5), 5) };
      });
      const raw = K.rawCrossings(comps);
      if (raw.length > 120)
        return { ...keepTrace(a.before, s), status: t('stroke.crossings', { n: raw.length }) };
      const over = K.carryOver({ comps: a.comps, over: a.over }, comps);
      return change(keepTrace(a.before, s), { comps, over, preset: '' });
    }
    case 'renumber': {
      if (s.movesOn) return s;
      const arc = selectAnalysis(s).arcs[a.arc];
      if (!arc) return s;
      const next = K.renumberDiagram(s, arc);
      return next === s ? s : change(s, { ...next, preset: '' });
    }
    case 'toggle': {
      if (s.movesOn) return s;
      if (!s.over.has(a.key)) return s;
      const over = new Map(s.over);
      over.set(a.key, over.get(a.key) === 'a' ? 'b' : 'a');
      return change(s, { comps: s.comps, over, preset: '' });
    }
    case 'preset': {
      const d = K.preset(a.key, FRAME.width, FRAME.height, s.nextId);
      return { ...change(s, { ...d, preset: a.key }, s.nextId + d.comps.length), epoch: s.epoch + 1 };
    }
    case 'clear':
      if (s.triangleBoard)
        return s.triangleBoard.net.triangles.length
          ? triangleChange(s, { net: { points: [], triangles: [], gluings: [] }, example: '', delta: null })
          : s;
      if (s.bandBoard)
        return s.bandBoard.surface.disks.length
          ? bandChange(s, { surface: { disks: [], bands: [] }, example: '' })
          : s;
      return {
        ...(s.comps.length ? change(s, { comps: [], over: new Map(), preset: '' }) : s),
        epoch: s.epoch + 1,
      };
    case 'alternate':
      return s.over.size
        ? change(s, {
            comps: s.comps,
            over: K.alternatingStates(s.comps, K.rawCrossings(s.comps)),
            preset: '',
          })
        : s;
    case 'mirror':
      return s.over.size
        ? change(s, {
            comps: s.comps,
            over: new Map([...s.over].map(([key, v]) => [key, v === 'a' ? 'b' : 'a'])),
            preset: '',
          })
        : s;
    case 'reverse':
      return change(s, {
        comps: s.comps.map((c) => (c.id === a.id ? { ...c, rev: !c.rev } : c)),
        over: s.over,
        preset: '',
      });
    case 'delete':
      return change(s, { comps: s.comps.filter((c) => c.id !== a.id), over: s.over, preset: '' });
    case 'p':
      return { ...s, p: a.value, tryP: '', coeffs: null, shift: 0, future: [] };
    case 'try-p': {
      const q = Number(a.value);
      const p = a.value === '' ? automaticP(selectAnalysis(s).det, s.p) : K.isPrime(q) ? q : s.p;
      return { ...s, p, tryP: a.value, coeffs: null, shift: 0, future: [] };
    }
    case 'relabel': {
      const { D, info, labels } = selectDiagram(s);
      if (!info?.colorable || !labels) return s;
      let coeffs: number[] = [],
        shift = 0;
      for (let tries = 0; tries < 40; tries++) {
        do {
          coeffs = info.basis.map(() => Math.floor(Math.random() * s.p));
        } while (coeffs.every((v) => v === 0));
        shift = Math.floor(Math.random() * s.p);
        if (K.labeling(D, info, coeffs, shift).join() !== labels.join()) break;
      }
      return { ...s, coeffs, shift };
    }
    case 'label-step': {
      const { info, labels } = selectDiagram(s);
      if (!info?.colorable || !labels) return s;
      const k = K.labelingIndex(info, s.coeffs, s.shift);
      const next = (k + BigInt(a.delta) + info.count) % info.count;
      return { ...s, ...K.labelingAt(info, next) };
    }
    case 'dismiss-status':
      return { ...s, status: '' };
    case 'image':
      return { ...s, image: a.value, mode: 'trace' };
    case 'opacity':
      return { ...s, opacity: a.value };
    case 'mode':
      return a.value === 'compare' && (!s.image || !s.comps.length) ? s : { ...s, mode: a.value };
  }
}
// 19.A
// Pin/end change only the comparison, so keep J's current readout and move ledger.
function bandChange(s: State, board: BandDocument): State {
  return {
    ...s,
    triangleBoard: null,
    bandBoard: board,
    alone: null,
    aloneReadout: null,
    movesOn: false,
    lastMove: null,
    history: [...s.history, snapshot(s)].slice(-80),
    future: [],
    epoch: s.epoch + Number(!s.bandBoard || board.example !== ''),
    status: '',
  };
}
function triangleChange(s: State, board: TriangleDocument): State {
  return {
    ...s,
    triangleBoard: board,
    bandBoard: null,
    alone: null,
    aloneReadout: null,
    movesOn: false,
    lastMove: null,
    history: [...s.history, snapshot(s)].slice(-80),
    future: [],
    epoch: s.epoch + Number(!s.triangleBoard || board.example !== ''),
    status: '',
  };
}
function changeComparison(s: State, versus: Versus | null): State {
  return {
    ...(s.triangleBoard
      ? triangleChange(s, s.triangleBoard)
      : s.bandBoard
        ? bandChange(s, s.bandBoard)
        : change(s, currentDiagram(s))),
    minor: s.minor,
    p: s.p,
    tryP: s.tryP,
    coeffs: s.coeffs,
    shift: s.shift,
    alone: s.alone,
    aloneReadout: s.aloneReadout,
    lastMove: s.lastMove,
    versus,
  };
}
// The pinned diagram does not carry a chosen minor: it always has the default one.
function pinnedMinor(d: { comps: K.Component[]; over: K.OverMap }) {
  return defaultMinor(K.analyzeDiagram(d).nArcs);
}
function currentDiagram(s: State): DiagramState {
  return {
    triangleBoard: s.triangleBoard ?? null,
    bandBoard: s.bandBoard ?? null,
    comps: s.comps,
    over: s.over,
    preset: s.preset,
    family: s.family,
    composition: s.composition,
    minor: pinnedMinor(s),
  };
}
function rebase(d: { comps: K.Component[]; over: K.OverMap }, nextId: number) {
  const comps = d.comps.map((c, i) => ({ ...c, id: nextId + i }));
  const ids = new Map(d.comps.map((c, i) => [c.id, comps[i].id]));
  const over: K.OverMap = new Map(
    [...d.over].map(([key, value]) => {
      const [ida, i, idb, j] = key.split(':').map(Number);
      return [`${ids.get(ida)}:${i}:${ids.get(idb)}:${j}`, value];
    }),
  );
  return { comps, over };
}
export function selectAnalysis(s: DiagramState) {
  return K.analyzeDiagram(s);
}
export function selectLabels(s: State, D: K.Analysis) {
  const validP = K.isPrime(s.p) && (s.tryP === '' || K.isPrime(Number(s.tryP)));
  const info = s.comps.length && validP ? K.pInfo(D, s.p) : null;
  return { info, labels: info?.colorable ? K.labeling(D, info, s.coeffs, s.shift) : null };
}
export function selectDiagram(s: State) {
  const D = selectAnalysis(s);
  return { D, ...selectLabels(s, D) };
}
export function selectReadoutState(s: State): State {
  if (s.alone === null) return s;
  const alone = componentDiagram(s, s.alone);
  return {
    ...s,
    ...alone,
    ...s.aloneReadout,
    preset: '',
    family: null,
    composition: null,
    // The chosen minor belongs to the whole link; a component alone has its own
    // matrix and reads with the default one.
    minor: defaultMinor(K.analyzeDiagram(alone).nArcs),
  };
}
export function selectReadout(D: K.Analysis, p: number, family: Family | null = null) {
  const factors = K.factorize(D.det);
  const composite = factors.factors.length > 1 || (factors.factors[0]?.e ?? 0) > 1;
  const oddPrimes = factors.factors.filter((q) => q.p !== 2n).map((q) => q.p);
  const primes =
    D.det === 0n
      ? [2, 3, 5, 7]
      : [...oddPrimes.filter((q) => q < 100n).map(Number), ...(D.det % 2n === 0n ? [2] : [])];
  const chips = primes.map((q) => ({ p: q, divides: D.det % BigInt(q) === 0n }));
  const answer =
    D.det === 0n
      ? 'p-colorable for every p'
      : oddPrimes.length
        ? 'p-colorable for p ='
        : 'Not p-colorable for any odd prime p';
  const selectedP = chips.some((q) => q.p === p) ? p : null;
  const largePrimes = oddPrimes.filter((q) => q >= 100n);
  const alexFormula = D.alex === null && D.nArcs > 30 && family ? familyAlexander(family) : null;
  const alexValue = D.alex ?? alexFormula?.polynomial ?? null;
  const terms = alexValue?.filter((c) => c !== 0n).length ?? 0;
  // Matrix captions remain about the calculated polynomial, not the formula.
  const v = D.alex ? K.pEval(D.alex, -1n) : null;
  return {
    factors,
    composite,
    chips,
    answer,
    selectedP,
    largePrimes,
    terms,
    alexValue,
    alexFormula,
    pairs: linkingCounts(D),
    triple: tripleProduct(D),
    alexAtMinusOne: v === null ? null : v < 0n ? -v : v,
  };
}
export type ReadoutData = ReturnType<typeof selectReadout>;
export function checkRows(D: K.Analysis, labels: number[]) {
  return D.rows
    .filter((x): x is K.Crossing => x !== null)
    .map((x) => {
      const a = labels[x.overArc],
        b = labels[x.inArc],
        c = labels[x.outArc];
      return { x, a, b, c, sum: 2 * a - b - c };
    });
}

export function canRelabel(info: K.PInfo) {
  return info.count > BigInt(info.p) * BigInt(info.p - 1) || info.rank > 1 || info.p > 2;
}
