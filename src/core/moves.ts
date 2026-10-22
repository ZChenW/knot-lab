import {
  analyzeDiagram,
  carryOver,
  checkLabeling,
  closedLengths,
  isPrime,
  mulMod,
  pInfo,
  type Analysis,
  type Component,
  type Crossing,
  type OverMap,
  type Passage,
  type Point,
  type RawCrossing,
  crossingsOf,
  polyLength,
} from './knot';

export interface MoveDiagram {
  comps: Component[];
  over: OverMap;
}
export interface GaussPassage {
  crossing: number;
  over: boolean;
  sign: number;
}
export type GaussCode = GaussPassage[][];
type NamedPassage = { crossing: string; over: boolean; sign: number; t: number };
const mod = (x: number, n: number) => ((x % n) + n) % n;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const point = (x: Crossing | RawCrossing): Point => [x.x, x.y];

function sequences(D: Analysis): NamedPassage[][] {
  const lists: NamedPassage[][] = Array.from({ length: D.nComps }, () => []);
  for (const x of D.crossings)
    for (const [p, over] of [
      [x.over, true],
      [x.under, false],
    ] as const)
      lists[p.c].push({ crossing: x.key, over, sign: x.sign, t: p.t });
  return lists.map((list) => list.sort((a, b) => a.t - b.t));
}

// Crossing names and polyline start vertices are immaterial. Keep component order,
// orientation, passage order, over/under and signs. Symmetric roots are resolved by
// the later components, so links also have a stable code after a local splice.
const gaussMemo = new WeakMap<Analysis, GaussCode>();
export function gaussCode(D: Analysis): GaussCode {
  let code = gaussMemo.get(D);
  if (!code) gaussMemo.set(D, (code = computeGaussCode(D)));
  return code;
}
function computeGaussCode(D: Analysis): GaussCode {
  const lists = sequences(D);
  const compare = (a: GaussCode, b: GaussCode) => {
    const flat = (code: GaussCode) =>
      code.flatMap((list) => [list.length, ...list.flatMap((p) => [p.crossing, +p.over, p.sign])]);
    const x = flat(a),
      y = flat(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const visit = (c: number, names: Map<string, number>): GaussCode => {
    if (c === lists.length) return [];
    const list = lists[c];
    if (!list.length) return [[], ...visit(c + 1, names)];
    let roots: { code: GaussPassage[]; names: Map<string, number> }[] = [];
    for (let start = 0; start < list.length; start++) {
      const next = new Map(names);
      const code = list.map((_, k) => {
        const p = list[(start + k) % list.length];
        if (!next.has(p.crossing)) next.set(p.crossing, next.size + 1);
        return { crossing: next.get(p.crossing)!, over: p.over, sign: p.sign };
      });
      const order = roots.length ? compare([code], [roots[0].code]) : -1;
      if (order < 0) roots = [{ code, names: next }];
      else if (order === 0) roots.push({ code, names: next });
    }
    let best: GaussCode | null = null;
    for (const root of roots) {
      const code = [root.code, ...visit(c + 1, root.names)];
      if (!best || compare(code, best) < 0) best = code;
    }
    return best!;
  };
  return visit(0, new Map());
}

function sameCycle(a: NamedPassage[], b: NamedPassage[]): boolean {
  return (
    a.length === b.length &&
    (!a.length ||
      a.some((_, start) =>
        b.every((p, k) => {
          const q = a[(start + k) % a.length];
          return p.crossing === q.crossing && p.over === q.over && p.sign === q.sign;
        }),
      ))
  );
}

export type MoveKind = 'R1−' | 'R2−' | 'R3' | 'R1+' | 'R2+';
// comp is a component index; parameters are i+f in the stored polyline, not
// arc-length fractions. A wrapped piece has to > points.length.
export interface MovePiece {
  comp: number;
  from: number;
  to: number;
}
export interface AvailableMove {
  kind: 'R1−' | 'R2−' | 'R3';
  crossings: string[];
  point: Point;
  pieces: MovePiece[];
}
export type MoveResult =
  | {
      ok: true;
      diagram: MoveDiagram;
      kind: MoveKind;
      sign?: number;
      /** R3 through the long-reach fallback: the strand slides across a distant crossing. */
      distant?: boolean;
      /** Old positions of strands pushed aside to make room (20.A), for the preview. */
      ghost?: Point[][];
      /** The diagram after the push and before the move itself (20.A). */
      pushed?: MoveDiagram;
    }
  | { ok: false; reason: 'room' | 'geometry' };
// side=+1 is the normal (-dy,dx) of the stored point order. over refers to the
// later passage in the component's oriented traversal (including rev).
export interface R1Options {
  comp: number;
  at: number;
  side: 1 | -1;
  over: boolean;
}
export interface R2Target {
  comp: number;
  at: number;
}
export interface R2Options {
  comp: number;
  at: number;
  target: R2Target;
  over: boolean;
}
export type MoveRequest =
  AvailableMove | { kind: 'R1+'; options: R1Options } | { kind: 'R2+'; options: R2Options };
export function performMove(diagram: MoveDiagram, move: MoveRequest): MoveResult {
  return move.kind === 'R1+'
    ? addR1(diagram, move.options)
    : move.kind === 'R2+'
      ? addR2(diagram, move.options)
      : applyMove(diagram, move);
}

function atPoint(c: Component, t: number): Point {
  t = mod(t, c.pts.length);
  const i = Math.floor(t),
    f = t - i,
    a = c.pts[i],
    b = c.pts[(i + 1) % c.pts.length];
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
}
function tangent(c: Component, t: number): Point {
  const a = atPoint(c, t - 0.01),
    b = atPoint(c, t + 0.01),
    L = distance(a, b) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
}
const lengthMemo = new WeakMap<Point[], number[]>();
function lengths(pts: Point[]): number[] {
  let cum = lengthMemo.get(pts);
  if (!cum) lengthMemo.set(pts, (cum = closedLengths(pts)));
  return cum;
}
// A tangent that varies continuously along the polyline: the vertex tangents
// (chord of the two neighbours) blended linearly across each segment.
function smoothTangent(c: Component, t: number): Point {
  const n = c.pts.length;
  t = mod(t, n);
  const i = Math.floor(t),
    f = t - i;
  const at = (k: number) => unit(sub(c.pts[mod(k + 1, n)], c.pts[mod(k - 1, n)]));
  return unit(add(scale(at(i), 1 - f), at(i + 1), f));
}
function lengthAt(c: Component, t: number): number {
  const cum = lengths(c.pts),
    n = c.pts.length,
    cycles = Math.floor(t / n);
  const u = mod(t, n),
    i = Math.floor(u);
  return cycles * cum[n] + cum[i] + (u - i) * (cum[i + 1] - cum[i]);
}
function stepAt(c: Component, t: number, delta: number): number {
  const cum = lengths(c.pts),
    n = c.pts.length,
    L = cum[n];
  const d = lengthAt(c, t) + delta,
    turns = Math.floor(d / L),
    target = mod(d, L);
  // The last i < n - 1 with cum[i + 1] >= target is found by bisection.
  let lo = 0,
    hi = n - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m + 1] < target) lo = m + 1;
    else hi = m;
  }
  const i = lo;
  return turns * n + i + (target - cum[i]) / (cum[i + 1] - cum[i] || 1);
}
function path(c: Component, from: number, to: number): Point[] {
  const pts = [atPoint(c, from)];
  for (let i = Math.floor(from) + 1; i < to - 1e-9; i++) pts.push(c.pts[mod(i, c.pts.length)]);
  pts.push(atPoint(c, to));
  return pts;
}
function projection(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const f = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  const q: Point = [a[0] + f * dx, a[1] + f * dy];
  return { point: q, distance: distance(p, q), f };
}
const sequenceMemo = new WeakMap<Analysis, { comps: Component[]; lists: NamedPassage[][] }>();
// Callers edit the lists they get, so each call returns a fresh copy.
function geometrySequences(diagram: MoveDiagram, D: Analysis): NamedPassage[][] {
  let memo = sequenceMemo.get(D);
  if (!memo || memo.comps !== diagram.comps) {
    memo = { comps: diagram.comps, lists: computeGeometrySequences(diagram, D) };
    sequenceMemo.set(D, memo);
  }
  return memo.lists.map((list) => list.map((p) => ({ ...p })));
}
function computeGeometrySequences(diagram: MoveDiagram, D: Analysis): NamedPassage[][] {
  return sequences(D).map((list, c) =>
    list
      .map((p) => ({
        ...p,
        t: diagram.comps[c].rev ? mod(diagram.comps[c].pts.length - p.t, diagram.comps[c].pts.length) : p.t,
      }))
      .sort((a, b) => a.t - b.t),
  );
}
function roomAt(diagram: MoveDiagram, comp: number, at: number): number {
  const c = diagram.comps[comp],
    p = atPoint(c, at),
    cum = lengths(c.pts),
    L = cum.at(-1)!;
  const origin = mod(lengthAt(c, at), L);
  let room = L / 2;
  for (const r of crossingsOf(diagram.comps)) {
    room = Math.min(room, distance(p, point(r)));
    for (const pass of [r.a, r.b])
      if (pass.c === comp) {
        const s = mod(lengthAt(c, pass.t), L);
        room = Math.min(room, mod(s - origin, L), mod(origin - s, L));
      }
  }
  diagram.comps.forEach((other, k) => {
    for (let i = 0; i < other.pts.length; i++) {
      if (k === comp) {
        const d = mod((cum[i] + cum[i + 1]) / 2 - origin, L);
        // The local host strand is not an obstacle to its own loop or finger.
        if (Math.min(d, L - d) < 70) continue;
      }
      room = Math.min(room, projection(p, other.pts[i], other.pts[(i + 1) % other.pts.length]).distance);
    }
  });
  return room;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const add = (a: Point, b: Point, s = 1): Point => [a[0] + s * b[0], a[1] + s * b[1]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Point, s: number): Point => [a[0] * s, a[1] * s];
const unit = (a: Point): Point => {
  const L = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / L, a[1] / L];
};
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross2 = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];

function resampleOpen(pts: Point[], step: number): Point[] {
  if (pts.length < 2) return pts.map((p): Point => [...p]);
  // One linear walk (polyAt per sample made this quadratic in the stretch length).
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distance(pts[i - 1], pts[i]));
  const L = cum[cum.length - 1],
    n = Math.max(2, Math.round(L / Math.max(step, 0.5)));
  const out: Point[] = [[...pts[0]]];
  let k = 0;
  for (let i = 1; i < n; i++) {
    const d = (L * i) / n;
    while (k < pts.length - 2 && cum[k + 1] < d) k++;
    const span = cum[k + 1] - cum[k],
      f = span > 0 ? (d - cum[k]) / span : 0;
    out.push([pts[k][0] + f * (pts[k + 1][0] - pts[k][0]), pts[k][1] + f * (pts[k + 1][1] - pts[k][1])]);
  }
  out.push([...pts[pts.length - 1]]);
  return out;
}
function maxTurnDegrees(pts: Point[]): number {
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1],
      b = pts[i],
      c = pts[i + 1];
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      vx = c[0] - b[0],
      vy = c[1] - b[1];
    if (ux * ux + uy * uy < 1e-12 || vx * vx + vy * vy < 1e-12) continue;
    max = Math.max(max, Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)));
  }
  return (max * 180) / Math.PI;
}
function gapSpan(c: Component, gap: MovePiece): number {
  return lengthAt(c, gap.to) - lengthAt(c, gap.from);
}
function alongGap(c: Component, gap: MovePiece, t: number): number {
  const n = c.pts.length;
  let u = mod(t, n);
  if (u < gap.from - 1e-9) u += n;
  return lengthAt(c, u) - lengthAt(c, gap.from);
}

type Owner = { edit: number; local: number } | { comp: number; from: number; to: number };
interface Edit extends MovePiece {
  points: Point[];
}
interface Splice {
  comps: Component[];
  owners: Owner[][];
  edits: Edit[];
}
type Source = { edit: number; local: number } | { comp: number; t: number };
// Preserve every segment outside the cut exactly, and its original parameter.
// No whole-component smoothing/resampling is allowed in a local move.
function splice(diagram: MoveDiagram, edits: Edit[]): Splice {
  const owners: Owner[][] = [];
  const comps = diagram.comps.map((c, comp) => {
    const edit = edits.findIndex((e) => e.comp === comp);
    if (edit < 0) {
      owners.push(c.pts.map((_, i) => ({ comp, from: i, to: i + 1 })));
      return { ...c, pts: c.pts.map((p): Point => [...p]) };
    }
    const e = edits[edit],
      n = c.pts.length;
    const pts = e.points.map((p): Point => [...p]);
    const tags: Owner[] = pts.slice(1).map((_, i) => ({ edit, local: i }));
    let previous = e.to;
    for (let k = Math.floor(e.to) + 1; k < e.from + n - 1e-8; k++) {
      tags.push({ comp, from: previous, to: k });
      pts.push([...c.pts[mod(k, n)]]);
      previous = k;
    }
    tags.push({ comp, from: previous, to: e.from + n });
    owners.push(tags);
    return { ...c, pts };
  });
  return { comps, owners, edits };
}
function source(s: Splice, p: Passage): Source {
  const i = Math.floor(p.t),
    f = p.t - i,
    owner = s.owners[p.c][i];
  return 'edit' in owner
    ? { edit: owner.edit, local: owner.local + f }
    : { comp: owner.comp, t: owner.from + f * (owner.to - owner.from) };
}
function readable(D: Analysis): boolean {
  return D.crossings.every(
    (x, i) =>
      x.sin >= 0.35 - 1e-9 &&
      D.crossings.every((y, j) => i === j || distance(point(x), point(y)) >= 22 - 1e-9),
  );
}
function noOverlaps(s: Pick<Splice, 'comps' | 'owners'>): boolean {
  const segs = s.comps.flatMap((c, comp) =>
    c.pts.map((a, i) => {
      const b = c.pts[(i + 1) % c.pts.length];
      return {
        comp,
        i,
        a,
        b,
        edited: 'edit' in s.owners[comp][i],
        x0: Math.min(a[0], b[0]),
        x1: Math.max(a[0], b[0]),
        y0: Math.min(a[1], b[1]),
        y1: Math.max(a[1], b[1]),
      };
    }),
  );
  // Only pairs with an edited segment matter; a grid finds their neighbours.
  const CELL = 24,
    grid = new Map<number, number[]>();
  const cells = (g: (typeof segs)[number], visit: (key: number) => void) => {
    for (let gx = Math.floor(g.x0 / CELL); gx <= Math.floor(g.x1 / CELL); gx++)
      for (let gy = Math.floor(g.y0 / CELL); gy <= Math.floor(g.y1 / CELL); gy++) visit(gx * 100003 + gy);
  };
  segs.forEach((g, k) =>
    cells(g, (key) => {
      const list = grid.get(key);
      if (list) list.push(k);
      else grid.set(key, [k]);
    }),
  );
  const pairs: [number, number][] = [];
  segs.forEach((g, i) => {
    if (!g.edited) return;
    const near = new Set<number>();
    cells(g, (key) => grid.get(key)?.forEach((j) => near.add(j)));
    for (const j of near) if (j !== i && (!segs[j].edited || j > i)) pairs.push([i, j]);
  });
  for (const [i, j] of pairs) {
    const a = segs[i],
      b = segs[j];
    if (
      (!a.edited && !b.edited) ||
      a.x1 + 1e-7 < b.x0 ||
      b.x1 + 1e-7 < a.x0 ||
      a.y1 + 1e-7 < b.y0 ||
      b.y1 + 1e-7 < a.y0
    )
      continue;
    const ax = a.b[0] - a.a[0],
      ay = a.b[1] - a.a[1],
      bx = b.b[0] - b.a[0],
      by = b.b[1] - b.a[1],
      L = Math.hypot(ax, ay);
    if (L < 1e-8 || Math.hypot(bx, by) < 1e-8 || Math.abs(ax * by - ay * bx) > 1e-8 * L * Math.hypot(bx, by))
      continue;
    if (Math.abs(ax * (b.a[1] - a.a[1]) - ay * (b.a[0] - a.a[0])) / L > 1e-7) continue;
    const u = ((b.a[0] - a.a[0]) * ax + (b.a[1] - a.a[1]) * ay) / L,
      v = ((b.b[0] - a.a[0]) * ax + (b.b[1] - a.a[1]) * ay) / L;
    const overlap = Math.min(L, Math.max(u, v)) - Math.max(0, Math.min(u, v));
    const adjacent =
      a.comp === b.comp &&
      (Math.abs(a.i - b.i) === 1 || Math.abs(a.i - b.i) === s.comps[a.comp].pts.length - 1);
    if (overlap > 1e-6 || (!adjacent && overlap >= -1e-7)) return false;
  }
  return true;
}
interface NewCrossing {
  name: string;
  aOver: boolean;
}
type Classify = (r: RawCrossing, s: Splice) => NewCrossing | null;
// This is the single exit gate for EVERY move. Match unchanged passages by their
// exact source parameters, explicitly set the local crossings, and compare the
// signed, named Gauss words with the required word operation, component by component.
// The modified stretch with 5 units of the untouched strand on either side,
// resampled at 5 units: its largest vertex turn, in degrees.
function editTurn(diagram: MoveDiagram, edit: Edit): number {
  const c = diagram.comps[edit.comp];
  const pts = resampleOpen(
    [atPoint(c, stepAt(c, edit.from, -5)), ...edit.points, atPoint(c, stepAt(c, edit.to, 5))],
    5,
  );
  return maxTurnDegrees(pts);
}
function gate(
  diagram: MoveDiagram,
  s: Splice,
  expected: NamedPassage[][],
  classify?: Classify,
  supports: MovePiece[] = [],
  turnCap = 25,
): MoveDiagram | null {
  if (!noOverlaps(s)) return null;
  // Every interior vertex of the modified stretch, resampled at 5 units and
  // including its two joins to the untouched strand, turns at most turnCap.
  for (const edit of s.edits) if (editTurn(diagram, edit) > turnCap + 1e-6) return null;
  // A Gauss word alone cannot see a disconnected closed curve swallowed by a
  // finger. Its swept region may contain only the pieces involved in this move.
  for (const edit of s.edits) {
    const boundary = [
      ...path(diagram.comps[edit.comp], edit.from, edit.to),
      ...edit.points.slice().reverse(),
    ];
    for (let comp = 0; comp < diagram.comps.length; comp++) {
      const c = diagram.comps[comp];
      for (let i = 0; i < c.pts.length; i++) {
        if (comp === edit.comp && containsParameter(c, edit, i)) continue;
        if (supports.some((p) => p.comp === comp && containsParameter(c, p, i))) continue;
        if (inside(c.pts[i], boundary)) return null;
      }
    }
  }
  const old = crossingsOf(diagram.comps),
    next = crossingsOf(s.comps),
    names = new Map<string, string>();
  const over = carryOver(diagram, s.comps);
  for (const r of next) {
    const a = source(s, r.a),
      b = source(s, r.b);
    const matches = (p: typeof a, q: Passage) =>
      'comp' in p &&
      p.comp === q.c &&
      Math.min(mod(p.t - q.t, diagram.comps[q.c].pts.length), mod(q.t - p.t, diagram.comps[q.c].pts.length)) <
        1e-6;
    const found = old.find(
      (x) => (matches(a, x.a) && matches(b, x.b)) || (matches(a, x.b) && matches(b, x.a)),
    );
    const local = classify?.(r, s);
    if (local) {
      names.set(r.key, local.name);
      over.set(r.key, local.aOver ? 'a' : 'b');
    } else if (found) {
      names.set(r.key, found.key);
      const direct = matches(a, found.a),
        top = diagram.over.get(found.key) ?? 'a';
      over.set(r.key, direct ? top : top === 'a' ? 'b' : 'a');
    } else {
      return null;
    }
  }
  const result = { comps: s.comps, over },
    D = analyzeDiagram(result);
  if (!readable(D)) return null;
  const actual = geometrySequences(result, D).map((list) =>
    list.map((p) => ({ ...p, crossing: names.get(p.crossing)! })),
  );
  if (actual.length !== expected.length || actual.some((list, i) => !sameCycle(list, expected[i])))
    return null;
  return result;
}

// A segment index over the stored polylines, for cheap pre-checks of a candidate
// stretch before the full gate. Built once per immutable component list.
interface SegIndex {
  segs: { comp: number; i: number; a: Point; b: Point }[];
  grid: Map<number, number[]>;
}
const SEG_CELL = 24;
const segIndexMemo = new WeakMap<Component[], SegIndex>();
function segIndex(comps: Component[]): SegIndex {
  let index = segIndexMemo.get(comps);
  if (index) return index;
  const segs: SegIndex['segs'] = [],
    grid = new Map<number, number[]>();
  comps.forEach((c, comp) =>
    c.pts.forEach((a, i) => {
      const b = c.pts[(i + 1) % c.pts.length],
        k = segs.push({ comp, i, a, b }) - 1;
      forCells(a, b, 0, (key) => {
        const list = grid.get(key);
        if (list) list.push(k);
        else grid.set(key, [k]);
      });
    }),
  );
  segIndexMemo.set(comps, (index = { segs, grid }));
  return index;
}
function forCells(a: Point, b: Point, pad: number, visit: (key: number) => void) {
  const x0 = Math.floor((Math.min(a[0], b[0]) - pad) / SEG_CELL),
    x1 = Math.floor((Math.max(a[0], b[0]) + pad) / SEG_CELL),
    y0 = Math.floor((Math.min(a[1], b[1]) - pad) / SEG_CELL),
    y1 = Math.floor((Math.max(a[1], b[1]) + pad) / SEG_CELL);
  for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) visit(gx * 100003 + gy);
}
interface Hit {
  comp: number;
  t: number;
  local: number;
  point: Point;
  sin: number;
}
// Where an open candidate polyline crosses the diagram, ignoring the stored
// stretch it replaces (piece). Also returns the polyline's own self-crossings.
function hitsOf(diagram: MoveDiagram, pts: Point[], piece: MovePiece) {
  const { segs, grid } = segIndex(diagram.comps),
    c = diagram.comps[piece.comp],
    external: Hit[] = [];
  const skip = (seg: SegIndex['segs'][number]) =>
    seg.comp === piece.comp &&
    (containsParameter(c, piece, seg.i + 0.5) ||
      containsParameter(c, piece, seg.i + 1e-9) ||
      containsParameter(c, piece, seg.i + 1 - 1e-9));
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k],
      b = pts[k + 1],
      seen = new Set<number>();
    forCells(a, b, 0, (key) => grid.get(key)?.forEach((j) => seen.add(j)));
    for (const j of seen) {
      const seg = segs[j];
      if (skip(seg)) continue;
      const x = intersect(a, b, seg.a, seg.b);
      if (x) external.push({ comp: seg.comp, t: seg.i + x.u, local: k + x.s, point: x.point, sin: x.sin });
    }
  }
  const self: { i: number; j: number; point: Point; sin: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++)
    for (let j = i + 2; j < pts.length - 1; j++) {
      const x = intersect(pts[i], pts[i + 1], pts[j], pts[j + 1]);
      if (x) self.push({ i: i + x.s, j: j + x.u, point: x.point, sin: x.sin });
    }
  return { external, self };
}
function intersect(a: Point, b: Point, c: Point, d: Point) {
  const d1x = b[0] - a[0],
    d1y = b[1] - a[1],
    d2x = d[0] - c[0],
    d2y = d[1] - c[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) <= 1e-12) return null;
  const ex = c[0] - a[0],
    ey = c[1] - a[1];
  const s = (ex * d2y - ey * d2x) / den,
    u = (ex * d1y - ey * d1x) / den;
  if (s < 0 || s >= 1 || u < 0 || u >= 1) return null;
  return {
    s,
    u,
    point: [a[0] + s * d1x, a[1] + s * d1y] as Point,
    sin: Math.abs(den) / (Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y)),
  };
}

// R1: a kink drawn in the strand's own frame. With arc length X and offset Y,
// X(θ) = R(aθ − b sin θ), Y(θ) = R c (1 + cos θ), θ ∈ [−π, π]. Y and Y′ vanish at
// both ends, so the loop leaves and returns tangent to the strand; X runs
// backwards in the middle, which makes the single self-crossing. With these
// constants the tightest radius of curvature is R (on a straight strand), the
// self-crossing has sin ≈ 0.65, and the loop is about 2.4R tall.
const KINK = { a: 0.209, b: 1.324, c: 1.22 };
function kinkPoints(c: Component, at: number, R: number, side: 1 | -1): Point[] {
  const count = Math.max(48, Math.ceil((9 * R) / 2.5)),
    v0 = smoothTangent(c, at);
  const out: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / count,
      X = R * (KINK.a * th - KINK.b * Math.sin(th)),
      Y = R * KINK.c * (1 + Math.cos(th));
    // The offset uses the fixed normal at the base, so the strand's own bend
    // only translates the loop slightly instead of squeezing it.
    const q = atPoint(c, stepAt(c, at, X));
    out.push([q[0] - side * Y * v0[1], q[1] + side * Y * v0[0]]);
  }
  out[0] = atPoint(c, stepAt(c, at, -R * KINK.a * Math.PI));
  out[out.length - 1] = atPoint(c, stepAt(c, at, R * KINK.a * Math.PI));
  return out;
}
export const R1_LIMITS = { sin: 0.6, minRadius: 12, maxRadius: 34 };
function addR1Here(diagram: MoveDiagram, options: R1Options): MoveResult {
  const { comp, at, side, over } = options,
    c = diagram.comps[comp];
  if (!c || !Number.isFinite(at)) return { ok: false, reason: 'geometry' };
  // The clicked point itself must have room (on a crossing it has none).
  // Then the nearest positions 24 and 48 units either way are tried instead.
  // A click on a crossing itself (within 4 units) has no room at all.
  const clickRoom = roomAt(diagram, comp, at);
  if (clickRoom < 4) return { ok: false, reason: 'room' };
  const laterOver = c.rev ? !over : over;
  let expected0: NamedPassage[][] | null = null;
  // Bounded, nearest-first: the clicked point, then 24 and 48 units either way.
  // Only when every candidate fails at 25° may a smallest (R = 12) loop use 30°.
  for (const cap of [25, 30])
    for (const shift of [0, -24, 24, -48, 48]) {
      if (!shift && clickRoom < 9) continue;
      const atTry = shift ? stepAt(c, at, shift) : at;
      const room = roomAt(diagram, comp, atTry);
      const R0 = clamp(0.4 * room, R1_LIMITS.minRadius, R1_LIMITS.maxRadius);
      for (const R of [...new Set([R0, Math.max(R1_LIMITS.minRadius, R0 * 0.7)])]) {
        if (cap > 25 && R > R1_LIMITS.minRadius) continue;
        const half = R * KINK.a * Math.PI;
        const from = stepAt(c, atTry, -half),
          to = stepAt(c, atTry, half);
        const piece = { comp, from, to };
        const points = kinkPoints(c, atTry, R, side);
        // Cheap pre-checks: nothing else is touched, exactly one readable self-crossing.
        const { external, self } = hitsOf(diagram, points, piece);
        if (external.length || self.length !== 1 || self[0].sin < R1_LIMITS.sin - 1e-9) continue;
        const s = splice(diagram, [{ comp, from, to, points }]);
        const newRaw = crossingsOf(s.comps).filter(
          (x) => 'edit' in source(s, x.a) && 'edit' in source(s, x.b),
        );
        if (newRaw.length !== 1) continue;
        const crossing = newRaw[0],
          a = source(s, crossing.a),
          b = source(s, crossing.b);
        if (!('local' in a) || !('local' in b)) continue;
        const aOver = a.local > b.local === laterOver;
        const cr = crossing.a.dx * crossing.b.dy - crossing.a.dy * crossing.b.dx;
        const sign = (aOver ? cr : -cr) < 0 ? 1 : -1;
        expected0 ??= geometrySequences(diagram, analyzeDiagram(diagram));
        const expected = expected0.map((list) => list.map((q) => ({ ...q })));
        expected[comp] = [
          ...expected[comp],
          { crossing: 'new:R1', t: mod(atTry, c.pts.length), over: !laterOver, sign },
          { crossing: 'new:R1', t: mod(atTry, c.pts.length), over: laterOver, sign },
        ].sort((x, y) => x.t - y.t);
        const result = gate(
          diagram,
          s,
          expected,
          (x) => (x.key === crossing.key ? { name: 'new:R1', aOver } : null),
          [],
          cap,
        );
        if (!result) continue;
        const added = analyzeDiagram(result).crossings.find((x) => distance(point(x), point(crossing)) < 2);
        if (!added || added.sin < R1_LIMITS.sin - 1e-9) continue;
        return { ok: true, kind: 'R1+', diagram: result, sign };
      }
    }
  return { ok: false, reason: 'room' };
}

interface Edge extends MovePiece {
  start: string;
  end: string;
}
interface Face {
  edges: { edge: Edge; forward: boolean }[];
  polygon: Point[];
  centre: Point;
}
function areaCentroid(pts: Point[]) {
  let a = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length],
      v = p[0] * q[1] - q[0] * p[1];
    a += v;
    x += (p[0] + q[0]) * v;
    y += (p[1] + q[1]) * v;
  }
  return { area: a / 2, centre: [x / (3 * a), y / (3 * a)] as Point };
}
const boxMemo = new WeakMap<Point[], [number, number, number, number]>();
function inside(p: Point, polygon: Point[]): boolean {
  let box = boxMemo.get(polygon);
  if (!box) {
    box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of polygon) {
      box[0] = Math.min(box[0], q[0]);
      box[1] = Math.min(box[1], q[1]);
      box[2] = Math.max(box[2], q[0]);
      box[3] = Math.max(box[3], q[1]);
    }
    boxMemo.set(polygon, box);
  }
  // Outside the bounding box (by more than the boundary tolerance) is outside.
  if (p[0] < box[0] - 1e-4 || p[0] > box[2] + 1e-4 || p[1] < box[1] - 1e-4 || p[1] > box[3] + 1e-4)
    return false;
  let hit = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    if (
      p[0] >= Math.min(a[0], b[0]) - 1e-5 &&
      p[0] <= Math.max(a[0], b[0]) + 1e-5 &&
      p[1] >= Math.min(a[1], b[1]) - 1e-5 &&
      p[1] <= Math.max(a[1], b[1]) + 1e-5 &&
      projection(p, a, b).distance < 1e-5
    )
      return false;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]))
      hit = !hit;
  }
  return hit;
}
function farthestFromBoundary(polygon: Point[], fallback: Point): Point {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of polygon) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  // Distances to a coarsened boundary (at most ~64 chords): a marker position,
  // so sub-unit accuracy is not needed; the inside test stays exact.
  const stride = Math.max(1, Math.ceil(polygon.length / 64)),
    coarse = polygon.filter((_, i) => i % stride === 0);
  const dist = (p: Point) => {
    let d = Infinity;
    for (let i = 0; i < coarse.length; i++)
      d = Math.min(d, projection(p, coarse[i], coarse[(i + 1) % coarse.length]).distance);
    return d;
  };
  let best = fallback,
    bestD = inside(fallback, polygon) ? dist(fallback) : 0;
  const search = (ax: number, ay: number, bx: number, by: number, n: number) => {
    for (let i = 1; i < n; i++)
      for (let j = 1; j < n; j++) {
        const p: Point = [ax + ((bx - ax) * i) / n, ay + ((by - ay) * j) / n];
        if (!inside(p, polygon)) continue;
        const d = dist(p);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
  };
  search(x0, y0, x1, y1, 14);
  const rx = (x1 - x0) / 14,
    ry = (y1 - y0) / 14;
  search(best[0] - rx, best[1] - ry, best[0] + rx, best[1] + ry, 6);
  return best;
}
// Walk the planar half-edges. Merely finding adjacent passages is insufficient:
// an R1 loop or bigon may surround a separate component, or bound the outer face.
function faces(diagram: MoveDiagram, D: Analysis): Face[] {
  const edges: Edge[] = [];
  geometrySequences(diagram, D).forEach((list, comp) => {
    for (let i = 0; i < list.length; i++) {
      const a = list[i],
        b = list[(i + 1) % list.length];
      edges.push({
        comp,
        from: a.t,
        to: b.t + (b.t <= a.t ? diagram.comps[comp].pts.length : 0),
        start: a.crossing,
        end: b.crossing,
      });
    }
  });
  const half = edges.flatMap((edge) => [true, false].map((forward) => ({ edge, forward })));
  const outgoing = new Map<string, number[]>();
  half.forEach((h, i) => {
    const key = h.forward ? h.edge.start : h.edge.end;
    outgoing.set(key, [...(outgoing.get(key) ?? []), i]);
  });
  const edgePath = (h: (typeof half)[number]) => {
    const pts = path(diagram.comps[h.edge.comp], h.edge.from, h.edge.to);
    return h.forward ? pts : pts.reverse();
  };
  const angle = (i: number) => {
    const pts = edgePath(half[i]);
    const q = pts.find((p) => distance(p, pts[0]) > 1e-7) ?? pts.at(-1)!;
    return Math.atan2(q[1] - pts[0][1], q[0] - pts[0][0]);
  };
  for (const list of outgoing.values()) list.sort((a, b) => angle(a) - angle(b));
  const used = new Set<number>(),
    found: Face[] = [];
  for (let i = 0; i < half.length; i++) {
    if (used.has(i)) continue;
    const boundary: typeof half = [],
      polygon: Point[] = [];
    let current = i;
    do {
      if (used.has(current)) break;
      used.add(current);
      const h = half[current];
      boundary.push(h);
      polygon.push(...edgePath(h).slice(0, -1));
      const vertex = h.forward ? h.edge.end : h.edge.start,
        list = outgoing.get(vertex)!;
      current = list[mod(list.indexOf(current ^ 1) - 1, list.length)];
    } while (current !== i);
    if (current !== i || boundary.length > 3) continue;
    const { area, centre } = areaCentroid(polygon);
    if (area <= 1e-5) continue;
    // Disconnected curves have no half-edge in this face's boundary.
    // A component off this boundary never meets it, so it lies wholly inside or
    // outside: one point decides. Boundary components cannot enter the face.
    const onBoundary = new Set(boundary.map((h) => h.edge.comp));
    if (diagram.comps.some((c, k) => !onBoundary.has(k) && c.pts.length && inside(c.pts[0], polygon)))
      continue;
    // The marker point (farthest from the boundary) is found later, only for offered moves.
    found.push({ edges: boundary, polygon, centre });
  }
  return found;
}
function containsParameter(c: Component, piece: MovePiece, t: number): boolean {
  return mod(t - piece.from, c.pts.length) <= piece.to - piece.from + 1e-7;
}
function extension(diagram: MoveDiagram, piece: MovePiece, D: Analysis, maximum: number) {
  const c = diagram.comps[piece.comp],
    n = c.pts.length,
    list = geometrySequences(diagram, D)[piece.comp];
  const available = (at: number, direction: number) => {
    let room = closedLengths(c.pts).at(-1)! / 4;
    for (const p of list) {
      const span = direction > 0 ? mod(p.t - at, n) : mod(at - p.t, n);
      if (span > 1e-6) {
        const other = at + direction * span;
        room = Math.min(room, Math.abs(lengthAt(c, other) - lengthAt(c, at)) * 0.45);
      }
    }
    return Math.min(maximum, room);
  };
  return {
    comp: piece.comp,
    from: stepAt(c, piece.from, -available(piece.from, -1)),
    to: stepAt(c, piece.to, available(piece.to, 1)),
  };
}
function remainingClosed(before: Analysis, after: Analysis) {
  for (let i = 0; i < before.crossings.length; i++)
    for (let j = i + 1; j < before.crossings.length; j++) {
      const a = after.crossings.find((x) => distance(point(x), point(before.crossings[i])) < 3);
      const b = after.crossings.find((x) => distance(point(x), point(before.crossings[j])) < 3);
      if (!a || !b) continue;
      const d0 = distance(point(before.crossings[i]), point(before.crossings[j]));
      if (d0 > 1e-6 && distance(point(a), point(b)) < d0 * 0.8 - 1e-9) return true;
    }
  return false;
}
// A replacement stretch: tangent-continuous Hermite, then Gauss-code-preserving
// Laplacian smoothing only if its 5-unit turns still exceed 25°. It must not
// cross anything (an inverse move only removes crossings).
function quietReplacement(diagram: MoveDiagram, cut: MovePiece, points: Point[]): Point[] | null {
  const turn = editTurn(diagram, { ...cut, points });
  if (turn > 35) return null;
  if (turn > 25) points = laplacian(points, 22);
  if (editTurn(diagram, { ...cut, points }) > 25) return null;
  const { external, self } = hitsOf(diagram, points, cut);
  return external.length || self.length ? null : points;
}
function undoR1(diagram: MoveDiagram, move: AvailableMove, D: Analysis): MoveResult {
  const piece = move.pieces[0],
    c = diagram.comps[piece.comp];
  const expected = geometrySequences(diagram, D).map((list) =>
    list.filter((p) => !move.crossings.includes(p.crossing)),
  );
  for (const reach of [28, 40, 16]) {
    const cut = extension(diagram, piece, D, reach);
    if (cut.to - cut.from >= c.pts.length - 1e-7) continue;
    const a = atPoint(c, cut.from),
      b = atPoint(c, cut.to),
      ta = smoothTangent(c, cut.from),
      tb = smoothTangent(c, cut.to);
    for (const k of [1, 0.6]) {
      const points = quietReplacement(diagram, cut, hermite([a, b], ta, tb, k));
      if (!points) continue;
      const result = gate(diagram, splice(diagram, [{ ...cut, points }]), expected);
      if (result && !remainingClosed(D, analyzeDiagram(result)))
        return { ok: true, kind: 'R1−', diagram: result };
    }
  }
  return { ok: false, reason: 'room' };
}
function pieceOver(diagram: MoveDiagram, D: Analysis, piece: MovePiece, key: string): boolean {
  const x = D.crossings.find((x) => x.key === key)!;
  const c = diagram.comps[piece.comp],
    t = c.rev ? mod(c.pts.length - x.over.t, c.pts.length) : x.over.t;
  return x.over.c === piece.comp && containsParameter(c, piece, t);
}
// Gauss-code-preserving smoothing of an open stretch: Laplacian steps on a
// 4-unit resampling, with the first and last three points pinned so the end
// tangents (and so the joins to the untouched strand) are kept.
function laplacian(points: Point[], until = 22): Point[] {
  let pts = resampleOpen(points, 4);
  const pin = 3;
  for (let iter = 0; iter < 80 && maxTurnDegrees(resampleOpen(pts, 5)) > until; iter++)
    pts = pts.map((p, i): Point => {
      if (i < pin || i >= pts.length - pin) return p;
      const a = pts[i - 1],
        b = pts[i + 1];
      return [0.25 * a[0] + 0.5 * p[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * p[1] + 0.25 * b[1]];
    });
  return pts;
}
function undoR2(diagram: MoveDiagram, move: AvailableMove, D: Analysis): MoveResult {
  // Either piece can be pulled away. Prefer shortening the finger, rather than
  // replacing its short neighbor by a long copy of the finger's boundary.
  const choices = [...move.pieces].sort(
    (a, b) =>
      polyLength(path(diagram.comps[b.comp], b.from, b.to)) -
      polyLength(path(diagram.comps[a.comp], a.from, a.to)),
  );
  const expected = geometrySequences(diagram, D).map((list) =>
    list.filter((p) => !move.crossings.includes(p.crossing)),
  );
  for (const top of choices) {
    const bottom = move.pieces.find((p) => p !== top)!,
      c = diagram.comps[top.comp];
    const support = extension(diagram, bottom, D, 32);
    for (const reach of [32, 48]) {
      const cut = extension(diagram, top, D, reach);
      if (cut.to - cut.from >= c.pts.length - 1e-7) continue;
      const a = atPoint(c, cut.from),
        b = atPoint(c, cut.to),
        ta = smoothTangent(c, cut.from),
        tb = smoothTangent(c, cut.to),
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const along = unit(sub(b, a)),
        normal = unit([-along[1], along[0]]);
      // Away from the bigon.
      const sign = dot(normal, sub(mid, move.point)) >= 0 ? 1 : -1;
      // Around the other piece: its path offset away from the bigon, so the
      // replacement passes outside it (the whole finger is pulled back).
      const around = (offset: number): Point[] => {
        let pts = path(diagram.comps[bottom.comp], bottom.from, bottom.to);
        if (distance(pts[0], a) > distance(pts.at(-1)!, a)) pts = pts.slice().reverse();
        const dense = resampleOpen(pts, 8);
        const shifted = dense.map((p, i): Point => {
          const prev = dense[Math.max(0, i - 1)],
            next = dense[Math.min(dense.length - 1, i + 1)];
          let n = unit([-(next[1] - prev[1]), next[0] - prev[0]]);
          if (dot(n, sub(p, move.point)) < 0) n = scale(n, -1);
          return add(p, n, offset);
        });
        return hermite([a, ...shifted, b], ta, tb);
      };
      const variants = [
        hermite([a, b], ta, tb),
        hermite([a, b], ta, tb, 1.6),
        hermite([a, b], ta, tb, 0.6),
        hermite([a, add(mid, normal, sign * 16), b], ta, tb),
        around(14),
        around(26),
      ];
      for (const raw of variants) {
        const points = quietReplacement(diagram, cut, raw);
        if (!points) continue;
        const result = gate(diagram, splice(diagram, [{ ...cut, points }]), expected, undefined, [support]);
        if (result && !remainingClosed(D, analyzeDiagram(result)))
          return { ok: true, kind: 'R2−', diagram: result };
      }
    }
  }
  return { ok: false, reason: 'room' };
}

// The first strand hit by the normal ray bounds the same face. Looking for the
// globally closest strand instead can select one hidden behind another strand.
export function r2Target(diagram: MoveDiagram, comp: number, at: number, side: 1 | -1): R2Target | null {
  const c = diagram.comps[comp];
  if (!c || !Number.isFinite(at)) return null;
  const p = atPoint(c, at),
    v = tangent(c, at);
  return rayHit(diagram, p, [-side * v[1], side * v[0]]);
}
// The first strand point hit by the ray from p along ray.
function rayHit(diagram: MoveDiagram, p: Point, ray: Point): R2Target | null {
  let best: { comp: number; at: number; distance: number } | null = null;
  diagram.comps.forEach((other, k) => {
    for (let i = 0; i < other.pts.length; i++) {
      const a = other.pts[i],
        b = other.pts[(i + 1) % other.pts.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const den = ray[0] * dy - ray[1] * dx;
      if (Math.abs(den) < 1e-9) continue;
      const ex = a[0] - p[0],
        ey = a[1] - p[1],
        d = (ex * dy - ey * dx) / den,
        f = (ex * ray[1] - ey * ray[0]) / den;
      if (d <= 1e-5 || f < 0 || f >= 1 || (best && d >= best.distance)) continue;
      best = { comp: k, at: i + f, distance: d };
    }
  });
  const target = best as { comp: number; at: number; distance: number } | null;
  return target ? { comp: target.comp, at: target.at } : null;
}
function gapAt(diagram: MoveDiagram, D: Analysis, comp: number, at: number): MovePiece {
  const n = diagram.comps[comp].pts.length,
    list = geometrySequences(diagram, D)[comp];
  if (!list.length) return { comp, from: at - n / 2, to: at + n / 2 };
  const next = list.findIndex((p) => p.t > mod(at, n));
  const end = next < 0 ? list[0].t + n : list[next].t;
  const start = next <= 0 ? list.at(-1)!.t : list[next - 1].t;
  return { comp, from: next === 0 ? start - n : start, to: end };
}
// R2: a finger in the source strand's frame at its root (X along the strand,
// Y toward the target): a 14-radius fillet leaves the strand tangentially and
// turns up the left side, a straight side, a semicircular cap of radius a at
// height H, the other side, and the mirrored fillet back onto the strand. The
// strand's own bend is added along X, as for R1. The finger is 2a wide where
// it crosses the target, 2a = clamp(0.5·H, 36, 90), and its tip is a + 8 beyond.
export const R2_LIMITS = { minWidth: 36, maxWidth: 90, beyond: 20, apart: 34, clear: 24, sin: 0.5 };
const FILLET = 14;
function fingerShape(a: number, H: number, rho: number): Point[] {
  const out: Point[] = [],
    step = 2;
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / step));
    for (let i = 0; i < n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  };
  arc(-a - rho, rho, rho, -Math.PI / 2, 0);
  line(-a, rho, -a, H - a);
  arc(0, H - a, a, Math.PI, 0);
  line(a, H - a, a, rho);
  arc(a + rho, rho, rho, Math.PI, Math.PI / 2 + Math.PI);
  out.push([a + rho, 0]);
  return out;
}
function finger(c: Component, pAt: number, normal: Point, a: number, H: number, rho: number): Point[] {
  return fingerShape(a, H, rho).map(([X, Y], i, all) => {
    const q = atPoint(c, stepAt(c, pAt, X));
    return i === 0 || i === all.length - 1 ? q : add(q, normal, Y);
  });
}
// A finger is offered only if its own bigon can be pulled back by R2−: the
// undo must exist, or the move would not be a reversible step.
function reversible(diagram: MoveDiagram, D: Analysis, keys: string[]): boolean {
  const face = faces(diagram, D).find(
    (f) =>
      f.edges.length === 2 &&
      keys.every((k) => f.edges.some(({ edge }) => edge.start === k || edge.end === k)),
  );
  if (!face) return false;
  const pieces = face.edges.map(({ edge }) => ({ comp: edge.comp, from: edge.from, to: edge.to }));
  return undoR2(diagram, { kind: 'R2−', crossings: keys, point: face.centre, pieces }, D).ok;
}
function addR2Here(diagram: MoveDiagram, options: R2Options): MoveResult {
  const { comp, at, target, over } = options,
    c = diagram.comps[comp],
    other = diagram.comps[target.comp];
  if (!c || !other || !Number.isFinite(at) || !Number.isFinite(target.at))
    return { ok: false, reason: 'geometry' };
  const p0 = atPoint(c, at),
    q0 = atPoint(other, target.at),
    v = tangent(c, at);
  const side = v[0] * (q0[1] - p0[1]) - v[1] * (q0[0] - p0[0]) > 0 ? 1 : -1;
  const nearest = r2Target(diagram, comp, at, side);
  if (!nearest || nearest.comp !== target.comp) return { ok: false, reason: 'room' };
  const D = analyzeDiagram(diagram),
    sourceGap = gapAt(diagram, D, comp, at),
    targetGap = gapAt(diagram, D, target.comp, target.at);
  if (!containsParameter(other, targetGap, nearest.at)) return { ok: false, reason: 'room' };
  const existing = D.crossings.map((x) => point(x));
  const pSpan = gapSpan(c, sourceGap);
  let expected0: NamedPassage[][] | null = null;
  // Bounded: the clicked root and 16 … 64 units either way along the source, each
  // aimed along its normal at the target strand. Cheap checks score them all;
  // at most the best four go through the full gate.
  type Candidate = { pAt: number; from: number; to: number; points: Point[]; score: number };
  const candidates: Candidate[] = [];
  for (const shift of [0, -16, 16, -32, 32, -48, 48, -64, 64]) {
    const pAt = shift ? stepAt(c, at, shift) : at;
    if (!containsParameter(c, sourceGap, pAt)) continue;
    const t0 = smoothTangent(c, pAt),
      normal: Point = [-side * t0[1], side * t0[0]];
    const normalHit = shift ? r2Target(diagram, comp, pAt, side) : nearest;
    if (!normalHit || normalHit.comp !== target.comp) continue;
    // Along the normal first; then tilted (half, then fully) toward the target
    // strand's own normal, at most 50° off, for an oblique target.
    const tt = smoothTangent(other, normalHit.at);
    let perp: Point = [-tt[1], tt[0]];
    if (dot(perp, normal) < 0) perp = scale(perp, -1);
    for (const tilt of [0, 0.5, 1]) {
      const dir = tilt ? unit(add(scale(normal, 1 - tilt), perp, tilt)) : normal;
      if (tilt && (dot(dir, normal) < Math.cos((50 * Math.PI) / 180) || dot(perp, normal) > 0.995)) continue;
      const hit = tilt ? rayHit(diagram, atPoint(c, pAt), dir) : normalHit;
      if (!hit || hit.comp !== target.comp || !containsParameter(other, targetGap, hit.at)) continue;
      const p = atPoint(c, pAt),
        q = atPoint(other, hit.at),
        L0 = distance(p, q);
      if (L0 < 18) continue;
      // H = L0 + a + 8 with a = clamp(H/4, 18, 45).
      let H = ((L0 + 8) * 4) / 3;
      // The width is measured where the finger crosses the target: an oblique
      // target widens it by 1/sin, a tilted finger narrows its sides by the
      // sine between the strand and the finger.
      const targetSin = Math.abs(cross2(dir, smoothTangent(other, hit.at))),
        rootSin = Math.abs(cross2(t0, dir));
      if (targetSin < R2_LIMITS.sin) continue;
      const width = clamp(H / 2, R2_LIMITS.minWidth, R2_LIMITS.maxWidth);
      const a = Math.max(R2_LIMITS.minWidth / 2, ((width / 2) * targetSin) / rootSin);
      // The round tip ends at least 20 (here 22) beyond the target, measured
      // perpendicular to the target strand.
      H = L0 + Math.max(a + 8, (R2_LIMITS.beyond + 2) / targetSin);
      const left = alongGap(c, sourceGap, pAt);
      // A 14-radius fillet first; 22 or 30 when the strand's bend toward the
      // finger would make it turn more than 25° per 5 units; 12 for a close target.
      let from = 0,
        to = 0,
        points: Point[] | null = null,
        external: ReturnType<typeof hitsOf>['external'] = [];
      // A curved target can wrap toward the tip: lengthen the finger by the
      // shortfall, at most twice, until the tip clears the target by 20.
      for (let attempt = 0; attempt < 3; attempt++) {
        points = null;
        for (const rho of [FILLET, 22, 30, 12].filter((r) => r <= L0 - 6)) {
          if (left < a + rho + 4 || pSpan - left < a + rho + 4) continue;
          from = stepAt(c, pAt, -(a + rho));
          to = stepAt(c, pAt, a + rho);
          const candidate = finger(c, pAt, dir, a, H, rho);
          if (editTurn(diagram, { comp, from, to, points: candidate }) <= 25) {
            points = candidate;
            break;
          }
        }
        if (!points) break;
        const hits = hitsOf(diagram, points, { comp, from, to });
        external = hits.external;
        if (hits.self.length || external.length !== 2) {
          points = null;
          break;
        }
        if (external.some((x) => x.comp !== target.comp || !containsParameter(other, targetGap, x.t))) {
          points = null;
          break;
        }
        // The tip (the finger's farthest point) is at least 20 from the target strand.
        const tip = points.reduce((best, q) => (distance(q, p) > distance(best, p) ? q : best), p);
        const targetPath = path(other, targetGap.from, targetGap.to);
        let tipGap = Infinity;
        for (let i = 0; i < targetPath.length - 1; i++)
          tipGap = Math.min(tipGap, projection(tip, targetPath[i], targetPath[i + 1]).distance);
        if (tipGap >= R2_LIMITS.beyond) break;
        H += R2_LIMITS.beyond - tipGap + 4;
        points = null;
      }
      if (!points) continue;
      const apart = distance(external[0].point, external[1].point);
      if (apart < R2_LIMITS.apart - 1e-9 || apart > R2_LIMITS.maxWidth + 1e-9) continue;
      if (external.some((x) => x.sin < R2_LIMITS.sin - 1e-9)) continue;
      if (external.some((x) => existing.some((e) => distance(x.point, e) < R2_LIMITS.clear - 1e-9))) continue;
      // Steep crossings first, then the root nearest the click, then a short finger.
      const minSin = Math.min(...external.map((x) => x.sin));
      candidates.push({
        pAt,
        from,
        to,
        points,
        score: 2 * Math.min(minSin, 0.9) - Math.abs(shift) / 64 - H / 400 - tilt / 4,
      });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  for (const { pAt, from, to, points } of candidates.slice(0, 4)) {
    const s = splice(diagram, [{ comp, from, to, points }]);
    const added = crossingsOf(s.comps).filter((x) => 'edit' in source(s, x.a) || 'edit' in source(s, x.b));
    if (added.length !== 2) continue;
    const sourceLocal = (x: RawCrossing) => {
      const a = source(s, x.a),
        b = source(s, x.b);
      return 'edit' in a ? a.local : 'edit' in b ? b.local : Infinity;
    };
    added.sort((a, b) => sourceLocal(a) - sourceLocal(b));
    const local = new Map<string, NewCrossing>();
    expected0 ??= geometrySequences(diagram, D);
    const expected = expected0.map((list) => list.map((x) => ({ ...x })));
    let firstSign = 0,
      ok = true;
    for (let i = 0; i < added.length; i++) {
      const x = added[i],
        a = source(s, x.a),
        b = source(s, x.b),
        aSource = 'edit' in a;
      const targetPass = aSource ? b : a;
      if (
        !('comp' in targetPass) ||
        targetPass.comp !== target.comp ||
        !containsParameter(other, targetGap, targetPass.t)
      ) {
        ok = false;
        break;
      }
      const aOver = aSource === over,
        cr = x.a.dx * x.b.dy - x.a.dy * x.b.dx;
      let sign = (aOver ? cr : -cr) < 0 ? 1 : -1;
      if (!!c.rev !== !!other.rev) sign = -sign;
      if (i === 0) firstSign = sign;
      else if (sign !== -firstSign) {
        ok = false;
        break;
      }
      const name = `new:R2:${i}`;
      local.set(x.key, { name, aOver });
      expected[comp].push({ crossing: name, t: mod(pAt, c.pts.length), over, sign });
      expected[target.comp].push({
        crossing: name,
        t: mod(targetPass.t, other.pts.length),
        over: !over,
        sign,
      });
    }
    if (!ok) continue;
    expected.forEach((list) => list.sort((x, y) => x.t - y.t));
    const result = gate(diagram, s, expected, (x) => local.get(x.key) ?? null, [targetGap]);
    if (!result) continue;
    const after = analyzeDiagram(result);
    const born = after.crossings.filter((x) => existing.every((e) => distance(point(x), e) > 5));
    if (
      born.length === 2 &&
      distance(point(born[0]), point(born[1])) >= R2_LIMITS.apart - 1e-9 &&
      born.every((x) => x.sin >= R2_LIMITS.sin - 1e-9) &&
      born.every((x) => existing.every((e) => distance(point(x), e) >= R2_LIMITS.clear - 1e-9)) &&
      reversible(
        result,
        after,
        born.map((x) => x.key),
      )
    )
      return { ok: true, kind: 'R2+', diagram: result };
  }
  return { ok: false, reason: 'room' };
}

// R3: the strand passing over (or under) both others is replaced, from up to 40
// arc units before P₁ to up to 40 after P₂, by a Hermite curve through the point
// on the far side of X along centroid→X, at clamp(0.35·size, 18, 48) from X.
// A cubic Hermite spline through nodes: the given unit end tangents scaled by the
// adjacent chord, Catmull–Rom tangents inside. Sampled about every 2 units.
function hermite(nodes: Point[], start: Point, end: Point, k = 1): Point[] {
  const m = nodes.length;
  const tangents = nodes.map((_, i): Point => {
    if (i === 0) return scale(start, k * distance(nodes[0], nodes[1]));
    if (i === m - 1) return scale(end, k * distance(nodes[m - 2], nodes[m - 1]));
    return scale(sub(nodes[i + 1], nodes[i - 1]), 0.5);
  });
  const out: Point[] = [];
  for (let i = 0; i < m - 1; i++) {
    const a = nodes[i],
      b = nodes[i + 1],
      v = tangents[i],
      w = tangents[i + 1];
    const count = Math.max(8, Math.ceil((1.5 * distance(a, b)) / 2));
    for (let j = 0; j < count; j++) {
      const u = j / count,
        h00 = 2 * u ** 3 - 3 * u ** 2 + 1,
        h10 = u ** 3 - 2 * u ** 2 + u,
        h01 = -2 * u ** 3 + 3 * u ** 2,
        h11 = u ** 3 - u ** 2;
      out.push([
        h00 * a[0] + h10 * v[0] + h01 * b[0] + h11 * w[0],
        h00 * a[1] + h10 * v[1] + h01 * b[1] + h11 * w[1],
      ]);
    }
  }
  out.push([...nodes[m - 1]]);
  return out;
}
export const R3_LIMITS = { reach: 40, apart: 22, sin: 0.35 };
function slideR3(diagram: MoveDiagram, move: AvailableMove, D: Analysis): MoveResult {
  const ends = (piece: MovePiece) =>
    move.crossings.filter((key) => {
      const x = D.crossings.find((x) => x.key === key)!;
      return (
        distance(atPoint(diagram.comps[piece.comp], piece.from), point(x)) < 1e-5 ||
        distance(atPoint(diagram.comps[piece.comp], piece.to), point(x)) < 1e-5
      );
    });
  // Either extreme piece may slide; try the top piece first (PLAN 18.P1).
  const choices: { piece: MovePiece; upper: boolean }[] = [];
  for (const piece of move.pieces) {
    const keys = ends(piece);
    if (keys.length !== 2) continue;
    if (keys.every((key) => pieceOver(diagram, D, piece, key))) choices.push({ piece, upper: true });
    else if (keys.every((key) => !pieceOver(diagram, D, piece, key))) choices.push({ piece, upper: false });
  }
  const length = (p: MovePiece) =>
    lengthAt(diagram.comps[p.comp], p.to) - lengthAt(diagram.comps[p.comp], p.from);
  choices.sort((a, b) => Number(b.upper) - Number(a.upper) || length(a.piece) - length(b.piece));
  for (const { piece, upper } of choices) {
    const result = slideR3Piece(diagram, move, D, piece, upper);
    if (result.ok) return result;
  }
  return { ok: false, reason: 'room' };
}
function slideR3Piece(
  diagram: MoveDiagram,
  move: AvailableMove,
  D: Analysis,
  top: MovePiece,
  upper: boolean,
): MoveResult {
  const moved = top,
    c = diagram.comps[moved.comp],
    start = atPoint(c, moved.from),
    end = atPoint(c, moved.to);
  const opposite = D.crossings.find(
    (x) =>
      move.crossings.includes(x.key) && distance(point(x), start) > 1e-5 && distance(point(x), end) > 1e-5,
  );
  if (!opposite) return { ok: false, reason: 'room' };
  const vertex = point(opposite),
    centroid: Point = [(start[0] + end[0] + vertex[0]) / 3, (start[1] + end[1] + vertex[1]) / 3];
  if (distance(centroid, vertex) < 1) return { ok: false, reason: 'room' };
  const direction = unit(sub(vertex, centroid));
  const size = Math.max(distance(start, end), distance(start, vertex), distance(end, vertex));
  const d0 = clamp(0.35 * size, 18, 48);
  const others = move.pieces.filter((p) => p !== moved),
    supports = others.map((p) => extension(diagram, p, D, Math.max(26, size)));
  const oppositeRaw = crossingsOf(diagram.comps).find((x) => x.key === opposite.key)!;
  const oppositeTop = diagram.over.get(opposite.key) === 'b' ? oppositeRaw.b : oppositeRaw.a;
  const expected = geometrySequences(diagram, D);
  // Each of the three crossing-free pieces reverses the order of its two
  // passages. All six over/under choices and all three signs stay attached.
  for (const piece of move.pieces) {
    const list = expected[piece.comp],
      n = diagram.comps[piece.comp].pts.length;
    const a = list.findIndex((p) => Math.min(mod(p.t - piece.from, n), mod(piece.from - p.t, n)) < 1e-6);
    const b = list.findIndex((p) => Math.min(mod(p.t - piece.to, n), mod(piece.to - p.t, n)) < 1e-6);
    if (a < 0 || b < 0) return { ok: false, reason: 'room' };
    const ta = list[a].t,
      tb = list[b].t;
    [list[a], list[b]] = [
      { ...list[b], t: ta },
      { ...list[a], t: tb },
    ];
  }
  const classify: Classify = (x, s) => {
    const a = source(s, x.a),
      b = source(s, x.b),
      edited = 'edit' in a ? a : 'edit' in b ? b : null;
    const pass = 'edit' in a ? b : a;
    if (!edited) {
      // Set the third crossing explicitly too.
      if (!('comp' in a) || distance(point(x), vertex) > 1e-5) return null;
      const n = diagram.comps[a.comp].pts.length;
      return {
        name: opposite.key,
        aOver:
          a.comp === oppositeTop.c &&
          Math.min(mod(a.t - oppositeTop.t, n), mod(oppositeTop.t - a.t, n)) < 1e-6,
      };
    }
    if (!('comp' in pass)) return null;
    const k = supports.findIndex(
      (p) => p.comp === pass.comp && containsParameter(diagram.comps[p.comp], p, pass.t),
    );
    if (k < 0) return null;
    const original = others[k];
    const key = move.crossings.find(
      (key) =>
        key !== opposite.key &&
        (distance(
          point(D.crossings.find((x) => x.key === key)!),
          atPoint(diagram.comps[original.comp], original.from),
        ) < 1e-5 ||
          distance(
            point(D.crossings.find((x) => x.key === key)!),
            atPoint(diagram.comps[original.comp], original.to),
          ) < 1e-5),
    );
    return key ? { name: key, aOver: 'edit' in a === upper } : null;
  };
  // For a large triangle the curve also passes outside the middle of the two
  // sides that meet at X, at the same distance, so it goes around X rather
  // than cutting across those strands.
  const hugNodes = (fromP: Point, far: Point, toP: Point, margin: number): Point[] => {
    const outside = (p: Point, q: Point): Point => {
      const mid: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
        along = unit(sub(q, p));
      let n: Point = [-along[1], along[0]];
      if (dot(n, sub(mid, centroid)) < 0) n = scale(n, -1);
      return add(mid, n, margin);
    };
    return [fromP, outside(start, vertex), far, outside(vertex, end), toP];
  };
  const before = gaussCode(D);
  // Bounded. The specified construction first: the full 40-unit reach, then 24,
  // through the point at d0 (then 1.2·d0) beyond X. Only if those fail, a longer
  // reach (80, then 140) whose curve also passes outside the two sides at X is
  // the listed fallback for large triangles. Cheap checks rank
  // the curves of one stage; at most two per stage go through the full gate.
  const stages: { reaches: number[]; hug: boolean[]; cap: number }[] = [
    { reaches: [R3_LIMITS.reach, 24], hug: [false], cap: 25 },
    { reaches: [80, 140], hug: [false, true], cap: 25 },
  ];
  for (const [stageIndex, { reaches, hug: hugs, cap }] of stages.entries()) {
    const ranked: { cut: MovePiece; points: Point[]; turn: number }[] = [];
    for (const reach of reaches) {
      // Nearest-first: a shorter reach that already gave two candidates is enough.
      if (ranked.length >= 2) break;
      const cut = extension(diagram, moved, D, reach);
      if (cut.to - cut.from >= c.pts.length - 1e-7) continue;
      const fromP = atPoint(c, cut.from),
        toP = atPoint(c, cut.to),
        t0 = smoothTangent(c, cut.from),
        t1 = smoothTangent(c, cut.to);
      for (const hug of hugs)
        for (const margin of new Set([d0, clamp(d0 * 1.2, 18, 48)]))
          for (const k of [1, 1.2]) {
            const far = add(vertex, direction, margin);
            const points = hermite(hug ? hugNodes(fromP, far, toP, margin) : [fromP, far, toP], t0, t1, k);
            const turn = editTurn(diagram, { ...cut, points });
            if (turn > cap + 6) continue;
            // It must cross each of the other two strands exactly once and touch nothing else.
            const { external, self } = hitsOf(diagram, points, cut);
            if (self.length || external.length !== 2) continue;
            const which = external.map((x) =>
              supports.findIndex(
                (p) => p.comp === x.comp && containsParameter(diagram.comps[p.comp], p, x.t),
              ),
            );
            if (which.includes(-1) || which[0] === which[1]) continue;
            ranked.push({ cut, points, turn });
          }
    }
    ranked.sort((x, y) => x.turn - y.turn);
    for (const { cut, turn, points: raw } of ranked.slice(0, 2)) {
      // Gauss-code-preserving local smoothing, only if the curve turns too much.
      const points = turn > cap ? laplacian(raw, cap - 3) : raw;
      if (points !== raw && hitsOf(diagram, points, cut).external.length !== 2) continue;
      const result = gate(diagram, splice(diagram, [{ ...cut, points }]), expected, classify, supports, cap);
      if (!result) continue;
      if (JSON.stringify(gaussCode(analyzeDiagram(result))) === JSON.stringify(before)) continue;
      return stageIndex
        ? { ok: true, kind: 'R3', diagram: result, distant: true }
        : { ok: true, kind: 'R3', diagram: result };
    }
  }
  return { ok: false, reason: 'room' };
}

const moveCache = new WeakMap<
  Analysis,
  { diagram: MoveDiagram; entries: AvailableMove[]; results: MoveResult[] }
>();
export function availableMoves(diagram: MoveDiagram, D = analyzeDiagram(diagram)): AvailableMove[] {
  const cached = moveCache.get(D);
  if (cached?.diagram.comps === diagram.comps && cached.diagram.over === diagram.over) return cached.entries;
  const entries: AvailableMove[] = [],
    results: MoveResult[] = [];
  for (const face of faces(diagram, D)) {
    const crossings = [...new Set(face.edges.flatMap(({ edge }) => [edge.start, edge.end]))];
    const pieces = face.edges.map(({ edge }) => ({ comp: edge.comp, from: edge.from, to: edge.to }));
    let kind: AvailableMove['kind'];
    if (face.edges.length === 1 && crossings.length === 1) kind = 'R1−';
    else if (
      face.edges.length === 2 &&
      crossings.length === 2 &&
      pieces.some((p) => crossings.every((key) => pieceOver(diagram, D, p, key)))
    )
      kind = 'R2−';
    else if (face.edges.length === 3 && crossings.length === 3) kind = 'R3';
    else continue;
    const entry = { kind, crossings, point: face.centre, pieces };
    const result =
      kind === 'R1−'
        ? undoR1(diagram, entry, D)
        : kind === 'R2−'
          ? undoR2(diagram, entry, D)
          : slideR3(diagram, entry, D);
    // A mark is a promise that its checked polyline exists. Cramped or obstructed
    // faces must not appear as clickable moves that fail on application.
    if (result.ok) {
      entries.push({ ...entry, point: farthestFromBoundary(face.polygon, face.centre) });
      results.push(result);
    }
  }
  moveCache.set(D, { diagram, entries, results });
  return entries;
}
export function applyMove(diagram: MoveDiagram, move: AvailableMove): MoveResult {
  const D = analyzeDiagram(diagram),
    entries = availableMoves(diagram, D);
  const i = entries.findIndex(
    (m) =>
      m.kind === move.kind &&
      m.crossings.join() === move.crossings.join() &&
      JSON.stringify(m.pieces) === JSON.stringify(move.pieces),
  );
  return i < 0 ? { ok: false, reason: 'geometry' } : moveCache.get(D)!.results[i];
}

type Segment = {
  comp: number;
  arc: number;
  a: Point;
  b: Point;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};
const segments = (D: Analysis): Segment[] =>
  D.arcs.flatMap((arc) =>
    arc.pts.slice(0, arc.closed ? undefined : -1).map((a, i) => {
      const b = arc.pts[(i + 1) % arc.pts.length];
      return {
        comp: arc.comp,
        arc: arc.id,
        a,
        b,
        x0: Math.min(a[0], b[0]) - 1e-6,
        x1: Math.max(a[0], b[0]) + 1e-6,
        y0: Math.min(a[1], b[1]) - 1e-6,
        y1: Math.max(a[1], b[1]) + 1e-6,
      };
    }),
  );
// Subtract the exact common parts of two polyline drawings. A bounding hull is
// too broad: it can cover an untouched circle, or the whole stationary top piece.
// The unshared old and new pieces form the actual boundary swept by the move.
function unshared(first: Segment[], second: Segment[]): { a: Point; b: Point }[] {
  const result: { a: Point; b: Point }[] = [];
  for (const s of first) {
    const dx = s.b[0] - s.a[0],
      dy = s.b[1] - s.a[1],
      L = Math.hypot(dx, dy);
    if (L < 1e-5) continue;
    const intervals: [number, number][] = [];
    for (const t of second) {
      if (t.comp !== s.comp || s.x1 < t.x0 || t.x1 < s.x0 || s.y1 < t.y0 || t.y1 < s.y0) continue;
      if (
        Math.abs(dx * (t.a[1] - s.a[1]) - dy * (t.a[0] - s.a[0])) / L > 1e-6 ||
        Math.abs(dx * (t.b[1] - s.a[1]) - dy * (t.b[0] - s.a[0])) / L > 1e-6
      )
        continue;
      const u = ((t.a[0] - s.a[0]) * dx + (t.a[1] - s.a[1]) * dy) / (L * L),
        v = ((t.b[0] - s.a[0]) * dx + (t.b[1] - s.a[1]) * dy) / (L * L);
      const from = Math.max(0, Math.min(u, v)),
        to = Math.min(1, Math.max(u, v));
      if (to > from) intervals.push([from, to]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const emit = (from: number, to: number) => {
      if ((to - from) * L > 1e-5)
        result.push({ a: [s.a[0] + from * dx, s.a[1] + from * dy], b: [s.a[0] + to * dx, s.a[1] + to * dy] });
    };
    let at = 0;
    for (const [from, to] of intervals) {
      emit(at, from);
      at = Math.max(at, to);
    }
    emit(at, 1);
  }
  return result;
}
const survivorCache = new WeakMap<Analysis, WeakMap<Analysis, [number, number][]>>();
function survivors(before: Analysis, after: Analysis): [number, number][] {
  let cache = survivorCache.get(before);
  if (!cache) {
    cache = new WeakMap();
    survivorCache.set(before, cache);
  }
  const cached = cache.get(after);
  if (cached) return cached;
  const old = segments(before),
    next = segments(after);
  const on = (p: Point, comp: number, list: Segment[]) =>
    list.find(
      (s) =>
        s.comp === comp &&
        p[0] >= s.x0 &&
        p[0] <= s.x1 &&
        p[1] >= s.y0 &&
        p[1] <= s.y1 &&
        projection(p, s.a, s.b).distance < 1e-6,
    );
  const boundary = [...unshared(old, next), ...unshared(next, old)],
    pairs: [number, number][] = [];
  const inRegion = (p: Point) => {
    let hit = false;
    for (const { a, b } of boundary) {
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]))
        hit = !hit;
    }
    return hit;
  };
  // A component with one strand before and after has one constant label, even
  // when making room moves its entire short curve and leaves no common segment.
  for (const arc of after.arcs)
    if (after.arcs.filter((a) => a.comp === arc.comp).length === 1) {
      const previous = before.arcs.filter((a) => a.comp === arc.comp);
      if (previous.length === 1) pairs.push([arc.id, previous[0].id]);
    }
  for (const s of next)
    for (const f of [0.2, 0.5, 0.8]) {
      if (distance(s.a, s.b) < 1e-5) continue;
      const p: Point = [s.a[0] + f * (s.b[0] - s.a[0]), s.a[1] + f * (s.b[1] - s.a[1])];
      if ([...before.crossings, ...after.crossings].some((x) => distance(p, point(x)) < 0.01)) continue;
      // The unchanged middle of a new R2 bigon is inside the move, even though
      // its geometry has not moved: its color is 2*over - incoming, not the old color.
      if (inRegion(p)) continue;
      const previous = on(p, s.comp, old);
      if (previous && !pairs.some(([a, b]) => a === s.arc && b === previous.arc))
        pairs.push([s.arc, previous.arc]);
    }
  cache.set(after, pairs);
  return pairs;
}
const residue = (x: number, p: number) => mod(x, p);
function inverse(a: number, p: number) {
  let x = a,
    r = 1,
    e = p - 2;
  while (e > 0) {
    if (e % 2) r = mulMod(r, x, p);
    x = mulMod(x, x, p);
    e = Math.floor(e / 2);
  }
  return r;
}
// Fix surviving colors outside the local geometry, then solve ALL crossing
// relations over Z_p. Return null on inconsistency or an undetermined new label;
// choosing arbitrary free colors would hide the unique extension.
export function carryLabeling(
  before: Analysis,
  after: Analysis,
  labels: number[],
  p: number,
): number[] | null {
  if (
    !isPrime(p) ||
    labels.length !== before.nArcs ||
    !checkLabeling(before, labels, p) ||
    before.nComps !== after.nComps
  )
    return null;
  const n = after.nArcs,
    rows = after.crossings.map((x) => {
      const row = new Array<number>(n + 1).fill(0);
      row[x.overArc] += 2;
      row[x.inArc] -= 1;
      row[x.outArc] -= 1;
      return row.map((v) => residue(v, p));
    });
  for (const [a, b] of survivors(before, after)) {
    const row = new Array<number>(n + 1).fill(0);
    row[a] = 1;
    row[n] = residue(labels[b], p);
    rows.push(row);
  }
  const pivots: number[] = [];
  for (let c = 0; c < n; c++) {
    const r = pivots.length,
      j = rows.findIndex((row, i) => i >= r && row[c] !== 0);
    if (j < 0) continue;
    [rows[r], rows[j]] = [rows[j], rows[r]];
    const inv = inverse(rows[r][c], p);
    rows[r] = rows[r].map((v) => mulMod(v, inv, p));
    for (let i = 0; i < rows.length; i++)
      if (i !== r) {
        const f = rows[i][c];
        rows[i] = rows[i].map((v, k) => residue(v - mulMod(f, rows[r][k], p), p));
      }
    pivots.push(c);
  }
  if (pivots.length !== n || rows.some((r) => r.slice(0, n).every((v) => v === 0) && r[n] !== 0)) return null;
  const result = new Array<number>(n).fill(0);
  pivots.forEach((c, i) => {
    result[c] = rows[i][n];
  });
  return checkLabeling(after, result, p) ? result : null;
}
export function labelingCoordinates(
  D: Analysis,
  labels: number[],
  p: number,
): { coeffs: number[]; shift: number } | null {
  if (!isPrime(p) || labels.length !== D.nArcs || !checkLabeling(D, labels, p)) return null;
  const info = pInfo(D, p),
    shift = labels.at(-1) ?? 0;
  const coeffs = info.basis.map((v, b) => {
    const column = v.findIndex((x, c) => x === 1 && info.basis.every((w, i) => i === b || w[c] === 0));
    return residue(labels[column] - shift, p);
  });
  return { coeffs, shift };
}
export interface AdditionMove {
  move: MoveRequest;
  result: MoveResult;
  sign?: number;
  over?: boolean;
}
export function additionMoves(
  diagram: MoveDiagram,
  comp: number,
  at: number,
  pointer: Point,
): AdditionMove[] {
  const c = diagram.comps[comp];
  if (!c) return [];
  const p = atPoint(c, at),
    v = tangent(c, at);
  const side: 1 | -1 = v[0] * (pointer[1] - p[1]) - v[1] * (pointer[0] - p[0]) < 0 ? -1 : 1;
  const loops = [false, true]
    .map((over): AdditionMove => {
      const move: MoveRequest = { kind: 'R1+', options: { comp, at, side, over } },
        result = performMove(diagram, move);
      return { move, result, sign: result.ok ? result.sign : side * (over ? -1 : 1) };
    })
    .sort((a, b) => (b.sign ?? 0) - (a.sign ?? 0));
  const target = r2Target(diagram, comp, at, side);
  return [
    ...loops,
    ...(target
      ? [true, false].map((over): AdditionMove => {
          const move: MoveRequest = { kind: 'R2+', options: { comp, at, target, over } };
          return { move, result: performMove(diagram, move), over };
        })
      : []),
  ];
}

// 20.A: make room before refusing. Nearby runs of other strands (and far parts
// of the host strand) are pushed away from the move point with the same cosine
// falloff along the strand as reshapePoints (influence ≤ 90, displacement ≤ 28).
// Vertices only move, none is inserted, so every parameter (the click, a target)
// stays valid. A push is used only if it keeps the same crossings on the same
// segments, the Gauss code, sin ≥ 0.35 and 22 apart; the move then runs as usual.
export const PUSH_LIMITS = { radius: 90, displacement: 28 };
export function pushAside(
  diagram: MoveDiagram,
  comp: number,
  at: number,
  centre: Point,
  clearance: number,
  host = 70,
) {
  const c = diagram.comps[comp],
    hostL = lengths(c.pts).at(-1)!,
    origin = mod(lengthAt(c, at), hostL);
  let moved = false;
  const comps = diagram.comps.map((other, k) => {
    const cum = lengths(other.pts),
      L = cum.at(-1)!;
    const free = (i: number) => {
      if (k !== comp) return true;
      const d = mod(cum[i] - origin, L);
      return Math.min(d, L - d) >= host + PUSH_LIMITS.radius;
    };
    // Local minima of the distance to the centre, closer than the clearance.
    const pts = other.pts,
      n = pts.length,
      dist = pts.map((q) => distance(q, centre));
    const pushes: { s: number; delta: Point }[] = [];
    for (let i = 0; i < n; i++) {
      if (!free(i) || dist[i] >= clearance) continue;
      if (dist[i] > dist[(i + n - 1) % n] || dist[i] > dist[(i + 1) % n]) continue;
      const away = dist[i] > 1e-6 ? unit(sub(pts[i], centre)) : ([0, -1] as Point);
      pushes.push({ s: cum[i], delta: scale(away, Math.min(PUSH_LIMITS.displacement, clearance - dist[i])) });
    }
    if (!pushes.length) return other;
    moved = true;
    const R = Math.min(PUSH_LIMITS.radius, L / 2);
    return {
      ...other,
      pts: pts.map((q, i): Point => {
        let x = q[0],
          y = q[1];
        for (const { s, delta } of pushes) {
          const d = Math.min(Math.abs(cum[i] - s), L - Math.abs(cum[i] - s));
          if (d >= R) continue;
          const w = (1 + Math.cos((Math.PI * d) / R)) / 2;
          x += delta[0] * w;
          y += delta[1] * w;
        }
        // Nearby minima may influence the same vertex; bound their total push.
        const displacement = Math.hypot(x - q[0], y - q[1]);
        if (displacement > PUSH_LIMITS.displacement) {
          const ratio = PUSH_LIMITS.displacement / displacement;
          x = q[0] + (x - q[0]) * ratio;
          y = q[1] + (y - q[1]) * ratio;
        }
        return [x, y];
      }),
    };
  });
  if (!moved) return null;
  if (
    !noOverlaps({
      comps,
      owners: comps.map((c, k) =>
        c.pts.map((_, i) =>
          c === diagram.comps[k] ? { comp: k, from: i, to: i + 1 } : { edit: k, local: i },
        ),
      ),
    })
  )
    return null;
  // Crossings may slide onto neighbouring segments: carry each one's over/under.
  if (crossingsOf(comps).length !== crossingsOf(diagram.comps).length) return null;
  const pushed: MoveDiagram = { ...diagram, comps, over: carryOver(diagram, comps) };
  const D = analyzeDiagram(pushed);
  if (!readable(D)) return null;
  if (JSON.stringify(gaussCode(D)) !== JSON.stringify(gaussCode(analyzeDiagram(diagram)))) return null;
  const ghost = diagram.comps.flatMap((o, k) => (comps[k] === o ? [] : [o.pts]));
  return { pushed, ghost };
}
function withRoom(
  diagram: MoveDiagram,
  attempt: (d: MoveDiagram) => MoveResult,
  comp: number,
  at: number,
  centres: [Point, number][],
): MoveResult {
  const first = attempt(diagram);
  if (first.ok || first.reason !== 'room') return first;
  for (const [centre, clearance] of centres) {
    const push = pushAside(diagram, comp, at, centre, clearance);
    if (!push) continue;
    const result = attempt(push.pushed);
    if (result.ok) return { ...result, ghost: push.ghost, pushed: push.pushed };
  }
  return first;
}
export function addR1(diagram: MoveDiagram, options: R1Options): MoveResult {
  const c = diagram.comps[options.comp];
  if (!c || !Number.isFinite(options.at)) return { ok: false, reason: 'geometry' };
  // On a crossing itself: nothing to push aside, the click has no room.
  if (roomAt(diagram, options.comp, options.at) < 4) return { ok: false, reason: 'room' };
  const p = atPoint(c, options.at),
    t = smoothTangent(c, options.at),
    n: Point = [-options.side * t[1], options.side * t[0]];
  // A loop of radius 20 sits about 1.2R off the strand and needs ~2.4R around it.
  const centres: [Point, number][] = [20, 14].map((R) => [add(p, n, KINK.c * R), KINK.c * R * 2 + 6]);
  return withRoom(diagram, (d) => addR1Here(d, options), options.comp, options.at, centres);
}
export function addR2(diagram: MoveDiagram, options: R2Options): MoveResult {
  const c = diagram.comps[options.comp],
    o = diagram.comps[options.target.comp];
  if (!c || !o || !Number.isFinite(options.at) || !Number.isFinite(options.target.at))
    return { ok: false, reason: 'geometry' };
  // Room around the far side of the target, where the round tip goes.
  const p = atPoint(c, options.at),
    q = atPoint(o, options.target.at),
    dir = distance(p, q) > 1e-6 ? unit(sub(q, p)) : ([0, 1] as Point);
  const centres: [Point, number][] = [[add(q, dir, 30), 48]];
  return withRoom(diagram, (d) => addR2Here(d, options), options.comp, options.at, centres);
}
