import { t } from '../i18n';
import {
  polyAt,
  polyLength,
  rawCrossings,
  type Component,
  type Factorization,
  type OverMap,
  type Passage,
  type Point,
  type Poly,
  type PresetKey,
  type RawCrossing,
  type Sample,
} from './knot';

export interface OperationDiagram {
  comps: Component[];
  over: OverMap;
  bands?: ConnectionBand[];
}
export interface ConnectionBand {
  sides: [Point[], Point[]];
}
export type CompositionOp = 'sum' | 'split';
export interface CompositionFactor {
  alex: Poly | null;
  det: bigint;
  preset: PresetKey | '';
  composition?: Composition;
}
export interface Composition {
  op: CompositionOp;
  left: CompositionFactor;
  right: CompositionFactor;
}
export interface CompositionOperand {
  preset: PresetKey | '';
  placeholder: 'K' | 'J';
  separator?: CompositionOp;
}
export function compositionOperands(c: Composition): CompositionOperand[] {
  const left: CompositionOperand[] = c.left.composition
    ? compositionOperands(c.left.composition)
    : [{ preset: c.left.preset, placeholder: 'K' }];
  const right: CompositionOperand[] = c.right.composition
    ? compositionOperands(c.right.composition)
    : [{ preset: c.right.preset, placeholder: 'J' }];
  return [...left, ...right.map((operand, i) => (i === 0 ? { ...operand, separator: c.op } : operand))];
}
interface FactorPower<T> {
  value: T;
  power: number;
}
export function compositionFactors(c: Composition): {
  alex: FactorPower<Poly | null>[];
  det: FactorPower<bigint>[];
} {
  const leaves = (factor: CompositionFactor): CompositionFactor[] =>
    factor.composition?.op === 'sum'
      ? [...leaves(factor.composition.left), ...leaves(factor.composition.right)]
      : [factor];
  const factors = c.op === 'sum' ? [...leaves(c.left), ...leaves(c.right)] : [];
  const group = <T>(values: T[], equal: (a: T, b: T) => boolean): FactorPower<T>[] => {
    const result: FactorPower<T>[] = [];
    for (const value of values) {
      const previous = result.find((entry) => equal(entry.value, value));
      if (previous) previous.power++;
      else result.push({ value, power: 1 });
    }
    return result;
  };
  return {
    alex: group(
      factors.map((f) => f.alex),
      (a, b) => a !== null && b !== null && a.length === b.length && a.every((v, i) => v === b[i]),
    ),
    det: group(
      factors.map((f) => f.det),
      (a, b) => a === b,
    ),
  };
}

// Compare the actual displayed bases/exponents in order, not just their
// product: operand factors such as 9 · 5 add information beside 3² · 5.
export function compositionDetFactors(c: Composition, factorization: Factorization): FactorPower<bigint>[] {
  const det = compositionFactors(c).det;
  const composite = factorization.factors.length > 1 || (factorization.factors[0]?.e ?? 0) > 1;
  if (!composite) return det;
  const beside = [
    ...factorization.factors.map(({ p, e }) => ({ value: p, power: e })),
    ...(factorization.rest > 1n ? [{ value: factorization.rest, power: 1 }] : []),
  ];
  return det.length === beside.length &&
    det.every((factor, i) => factor.value === beside[i].value && factor.power === beside[i].power)
    ? []
    : det;
}

// Every surviving edge remembers its exact source interval. A band edge has no
// source: a crossing on it is therefore an error, even if the total count agrees.
interface Source {
  operand: number;
  comp: number;
  segment: number;
  from: number;
  to: number;
}
interface Path {
  pts: Point[];
  edges: (Source | null)[];
  rev: boolean;
}
interface Cut {
  start: number;
  end: number;
  path: Path;
}
interface Token {
  crossing: number;
  over: boolean;
  sign: number;
}
interface Original {
  raw: RawCrossing;
  operand: number;
  sign: number;
  aOver: boolean;
}
const mod = (n: number, length: number) => ((n % length) + length) % length;
const failure = () => new Error(t('composition.geometry'));

function paths(diagram: OperationDiagram, operand: number, oriented = false): Path[] {
  const raw = rawCrossings(diagram.comps);
  return diagram.comps.map((c, comp) => {
    const n = c.pts.length;
    if (n < 3 || c.pts.some((p) => !p.every(Number.isFinite))) throw failure();
    const pts = c.pts.map((p): Point => [...p]);
    // Some sampled presets meet exactly at vertices. A rigid translation can
    // change their floating-point half-open segment ownership (or count twice).
    // Move only those vertices by a subpixel tangent epsilon into the SAME
    // source segments. The assertion below still checks the original passages.
    for (const r of raw)
      for (const p of [r.a, r.b]) {
        if (p.c !== comp) continue;
        const fraction = p.t % 1;
        if (fraction > 1e-8 && fraction < 1 - 1e-8) continue;
        const incoming = fraction > 0.5,
          vertex = mod(Math.round(p.t), n);
        const before = c.pts[mod(vertex - 1, n)],
          after = c.pts[(vertex + 1) % n];
        const dx = after[0] - before[0],
          dy = after[1] - before[1],
          length = Math.hypot(dx, dy) || 1;
        const epsilon = (incoming ? 1 : -1) * 1e-7;
        pts[vertex] = [
          c.pts[vertex][0] + (epsilon * dx) / length,
          c.pts[vertex][1] + (epsilon * dy) / length,
        ];
      }
    const reverse = oriented && c.rev;
    return {
      pts: pts.map((_, i) => pts[reverse ? mod(-i, n) : i]),
      edges: c.pts.map((_, i) => ({
        operand,
        comp,
        segment: reverse ? mod(-i - 1, n) : i,
        from: reverse ? 1 : 0,
        to: reverse ? 0 : 1,
      })),
      rev: oriented ? false : !!c.rev,
    };
  });
}
function bounds(paths: Path[]) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const path of paths)
    for (const [x, y] of path.pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  if (!(x1 > x0 && y1 > y0)) throw failure();
  return { x0, x1, y0, y1, height: y1 - y0 };
}
function transform(paths: Path[], scale: number, dx: number, dy: number): Path[] {
  return paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [scale * x + dx, scale * y + dy]) }));
}
function beside(left: Path[], right: Path[]): Path[] {
  const a = bounds(left),
    b = bounds(right),
    scale = a.height / b.height;
  return transform(
    right,
    scale,
    a.x1 + Math.max(64, a.height * 0.16) - scale * b.x0,
    (a.y0 + a.y1) / 2 - (scale * (b.y0 + b.y1)) / 2,
  );
}
function reversePath(path: Path): Path {
  const n = path.pts.length;
  return {
    pts: path.pts.map((_, i) => path.pts[mod(-i, n)]),
    edges: path.edges.map((_, i) => {
      const edge = path.edges[mod(-i - 1, n)];
      return edge && { ...edge, from: edge.to, to: edge.from };
    }),
    rev: false,
  };
}
function pointAt(path: Path, at: number): Point {
  const i = Math.floor(at),
    f = at - i,
    n = path.pts.length;
  const a = path.pts[mod(i, n)],
    b = path.pts[mod(i + 1, n)];
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
}
function slice(path: Path, start: number, end: number): Path {
  const pts = [pointAt(path, start)],
    edges: (Source | null)[] = [];
  let at = start;
  while (at < end - 1e-10) {
    const i = Math.floor(at),
      next = Math.min(i + 1, end),
      edge = path.edges[mod(i, path.pts.length)];
    edges.push(
      edge && {
        ...edge,
        from: edge.from + (edge.to - edge.from) * (at - i),
        to: edge.from + (edge.to - edge.from) * (next - i),
      },
    );
    pts.push(pointAt(path, next));
    at = next;
  }
  return { pts, edges, rev: false };
}

// Find a cap on the outer face, facing the gap. Its supporting line lies
// beyond every crossing and every other component; removing it cuts no passage.
// Rotations preserve the orientation of the plane and all crossing signs.
function exposed(
  input: Path[],
  comp: number,
  side: 1 | -1,
  rotate = true,
  minimum = 26,
  fitHeight?: number,
): { paths: Path[]; cut: Cut } {
  if (!Number.isInteger(comp) || !input[comp]) throw new RangeError(t('composition.component'));
  const box = bounds(input),
    cx = (box.x0 + box.x1) / 2,
    cy = (box.y0 + box.y1) / 2;
  for (let trial = 0; trial < (rotate ? 48 : 1); trial++) {
    const angle = trial === 0 ? 0 : ((trial % 2 ? 1 : -1) * Math.ceil(trial / 2) * Math.PI) / 24;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const rotated = input.map((p) => ({
      ...p,
      pts: p.pts.map(([x, y]): Point => [
        cx + cos * (x - cx) - sin * (y - cy),
        cy + sin * (x - cx) + cos * (y - cy),
      ]),
    }));
    const target = rotated[comp],
      n = target.pts.length;
    let tip = 0;
    target.pts.forEach((p, i) => {
      if (side * p[0] > side * target.pts[tip][0]) tip = i;
    });
    const extreme = side * target.pts[tip][0];
    const raw = rawCrossings(rotated.map((p) => ({ pts: p.pts })));
    const obstruction = Math.max(
      ...raw.map((r) => side * r.x),
      ...rotated.filter((_, i) => i !== comp).flatMap((p) => p.pts.map((q) => side * q[0])),
      extreme - bounds(rotated).height,
    );
    const room = extreme - obstruction;
    if (room < box.height * 1e-5) continue;
    const line = extreme - Math.min(bounds(rotated).height * 0.24, room * 0.9);
    let a = tip,
      b = tip;
    while (a > tip - n && side * target.pts[mod(a, n)][0] > line) a--;
    while (b < tip + n && side * target.pts[mod(b, n)][0] > line) b++;
    if (b - a >= n) continue;
    const hit = (i: number) => {
      const p = side * target.pts[mod(i, n)][0],
        q = side * target.pts[mod(i + 1, n)][0];
      return i + (line - p) / (q - p);
    };
    const start = hit(a),
      end = hit(b - 1);
    const path = slice(target, end, start + n);
    const separation = Math.abs(path.pts[0][1] - path.pts.at(-1)![1]);
    // A right operand is scaled after choosing its cap. Its final endpoints
    // must still allow the band's existing fourteen-unit minimum separation.
    if (separation < minimum || (fitHeight && (separation * fitHeight) / bounds(rotated).height < 14))
      continue;
    return { paths: rotated, cut: { start, end, path } };
  }
  // A component enclosed by another component has no crossing-free path to the
  // outer face. Refuse it instead of inventing extra band crossings.
  throw failure();
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: Point, b: Point): Point => {
  const length = distance(a, b);
  if (!length) throw failure();
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
};
const turn = (a: Point, b: Point, c: Point) => {
  const u = unit(a, b),
    v = unit(b, c);
  return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
};
function blend(before: Point, start: Point, end: Point, after: Point, handle: number): Point[] {
  const u = unit(before, start),
    v = unit(end, after);
  handle = Math.min(
    handle,
    (Math.abs(end[0] - start[0]) * 0.45) / Math.max(Math.abs(u[0]), Math.abs(v[0]), 1e-6),
  );
  const a: Point = [start[0] + handle * u[0], start[1] + handle * u[1]];
  const b: Point = [end[0] - handle * v[0], end[1] - handle * v[1]];
  const dense: Point[] = [start];
  const divisions = Math.max(64, Math.ceil(4 * (distance(start, a) + distance(a, b) + distance(b, end))));
  for (let i = 1; i < divisions; i++) {
    const t = i / divisions,
      s = 1 - t;
    dense.push([
      s ** 3 * start[0] + 3 * s * s * t * a[0] + 3 * s * t * t * b[0] + t ** 3 * end[0],
      s ** 3 * start[1] + 3 * s * s * t * a[1] + 3 * s * t * t * b[1] + t ** 3 * end[1],
    ]);
  }
  dense.push(end);
  const length = polyLength(dense);
  // Five-unit arc-length samples; refine only the intervals that turn too much.
  const count = Math.max(2, Math.ceil(length / 5));
  let fractions = Array.from({ length: count + 1 }, (_, i) => i / count);
  for (let trial = 0; trial < 16; trial++) {
    const pts = fractions.map((f): Point => {
      if (f === 0) return start;
      if (f === 1) return end;
      const p = polyAt(dense, f);
      return [p.x, p.y];
    });
    const joined = [before, ...pts, after];
    const refine = new Set<number>();
    for (let i = 0; i < pts.length; i++)
      if (turn(joined[i], joined[i + 1], joined[i + 2]) > (25 * Math.PI) / 180) {
        if (i > 0) refine.add((fractions[i - 1] + fractions[i]) / 2);
        if (i + 1 < pts.length) refine.add((fractions[i] + fractions[i + 1]) / 2);
      }
    if (!refine.size) return pts;
    fractions = [...fractions, ...refine].sort((a, b) => a - b);
  }
  throw failure();
}
export function bandSeparation(band: ConnectionBand): number {
  const pointSegment = (p: Point, a: Point, b: Point) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return distance(p, [a[0] + t * dx, a[1] + t * dy]);
  };
  let nearest = Infinity;
  for (const [a, b] of [band.sides, [...band.sides].reverse()] as [Point[], Point[]][])
    for (const point of a)
      for (let i = 1; i < b.length; i++) nearest = Math.min(nearest, pointSegment(point, b[i - 1], b[i]));
  return nearest;
}
function smoothBand(k: Path, j: Path): ConnectionBand {
  const handle = Math.max(distance(j.pts[0], k.pts.at(-1)!), distance(k.pts[0], j.pts.at(-1)!)) * 0.4;
  for (const minimum of [26, 14])
    for (const factor of [1, 0.7, 0.4, 0.2, 0.1]) {
      const sides: [Point[], Point[]] = [
        blend(k.pts.at(-2)!, k.pts.at(-1)!, j.pts[0], j.pts[1], handle * factor),
        blend(j.pts.at(-2)!, j.pts.at(-1)!, k.pts[0], k.pts[1], handle * factor),
      ];
      const band = { sides };
      if (bandSeparation(band) >= minimum) return band;
    }
  throw failure();
}

function signature(
  operand: number,
  a: { comp: number; segment: number },
  b: { comp: number; segment: number },
) {
  const first = a.comp < b.comp || (a.comp === b.comp && a.segment < b.segment);
  const [p, q] = first ? [a, b] : [b, a];
  return `${operand}:${p.comp}:${p.segment}:${q.comp}:${q.segment}`;
}
function originals(diagrams: OperationDiagram[]): Original[] {
  return diagrams.flatMap((d, operand) =>
    rawCrossings(d.comps).map((r) => {
      const aOver = (d.over.get(r.key) ?? 'a') === 'a';
      const determinant = r.a.dx * r.b.dy - r.a.dy * r.b.dx;
      const oriented = determinant * (d.comps[r.a.c].rev ? -1 : 1) * (d.comps[r.b.c].rev ? -1 : 1);
      return { raw: r, operand, aOver, sign: (aOver ? oriented : -oriented) < 0 ? 1 : -1 };
    }),
  );
}
function code(
  original: Original[],
  operand: number,
  comp: number,
  n: number,
  rev: boolean,
  start = 0,
): Token[] {
  const passages: (Token & { at: number })[] = [];
  original.forEach((x, crossing) => {
    if (x.operand !== operand) return;
    for (const [p, over] of [
      [x.raw.a, x.aOver],
      [x.raw.b, !x.aOver],
    ] as const) {
      if (p.c === comp)
        passages.push({ crossing, over, sign: x.sign, at: mod((rev ? -p.t : p.t) - start, n) });
    }
  });
  return passages.sort((a, b) => a.at - b.at).map(({ crossing, over, sign }) => ({ crossing, over, sign }));
}
function cyclicEqual(a: Token[], b: Token[]) {
  return (
    a.length === b.length &&
    (!a.length ||
      b.some((_, start) =>
        a.every((p, i) => {
          const q = b[(start + i) % b.length];
          return p.crossing === q.crossing && p.over === q.over && p.sign === q.sign;
        }),
      ))
  );
}

// This is an assertion about the diagram, not its invariants. Each crossing
// must be on the same two source segments, with the same top passage and sign;
// every component's oriented Gauss word must be exactly the prescribed splice.
function finish(paths: Path[], original: Original[], expected: Token[][]): OperationDiagram {
  if (paths.length !== expected.length) throw failure();
  const comps = paths.map((p, i) => ({ id: i + 1, pts: p.pts, rev: p.rev }));
  const raw = rawCrossings(comps),
    over: OverMap = new Map();
  if (raw.length !== original.length) throw failure();
  const lookup = new Map(
    original.map((x, i) => [
      signature(
        x.operand,
        { comp: x.raw.a.c, segment: Math.floor(x.raw.a.t) },
        { comp: x.raw.b.c, segment: Math.floor(x.raw.b.t) },
      ),
      i,
    ]),
  );
  const used = new Set<number>(),
    actual: (Token & { at: number })[][] = comps.map(() => []);
  for (const r of raw) {
    const a = paths[r.a.c].edges[Math.floor(r.a.t)],
      b = paths[r.b.c].edges[Math.floor(r.b.t)];
    if (!a || !b || a.operand !== b.operand) throw failure();
    const index = lookup.get(signature(a.operand, a, b));
    if (index === undefined || used.has(index)) throw failure();
    const old = original[index],
      aIsA = a.comp === old.raw.a.c && a.segment === Math.floor(old.raw.a.t);
    const matches = (source: Source, passage: Passage, oldPassage: Passage) =>
      Math.abs(source.segment + source.from + (source.to - source.from) * (passage.t % 1) - oldPassage.t) <
      1e-6;
    if (!matches(a, r.a, aIsA ? old.raw.a : old.raw.b) || !matches(b, r.b, aIsA ? old.raw.b : old.raw.a))
      throw failure();
    const aOver = aIsA ? old.aOver : !old.aOver;
    const determinant =
      (r.a.dx * r.b.dy - r.a.dy * r.b.dx) * (comps[r.a.c].rev ? -1 : 1) * (comps[r.b.c].rev ? -1 : 1);
    const sign = (aOver ? determinant : -determinant) < 0 ? 1 : -1;
    if (sign !== old.sign) throw failure();
    over.set(r.key, aOver ? 'a' : 'b');
    used.add(index);
    for (const [p, top] of [
      [r.a, aOver],
      [r.b, !aOver],
    ] as const)
      actual[p.c].push({
        crossing: index,
        over: top,
        sign,
        at: mod(comps[p.c].rev ? -p.t : p.t, comps[p.c].pts.length),
      });
  }
  if (
    used.size !== original.length ||
    actual.some(
      (list, i) =>
        !cyclicEqual(
          list.sort((a, b) => a.at - b.at),
          expected[i],
        ),
    )
  )
    throw failure();
  return { comps, over };
}

export function splitUnion(K: OperationDiagram, J: OperationDiagram): OperationDiagram {
  if (!K.comps.length || !J.comps.length) throw new RangeError(t('composition.empty'));
  const left = paths(K, 0),
    right = beside(left, paths(J, 1)),
    old = originals([K, J]);
  const expected = [K, J].flatMap((d, operand) =>
    d.comps.map((c, comp) => code(old, operand, comp, c.pts.length, !!c.rev)),
  );
  return finish([...left, ...right], old, expected);
}

export function connectedSum(
  K: OperationDiagram,
  J: OperationDiagram,
  { kComp = 0, jComp = 0 }: { kComp?: number; jComp?: number } = {},
): OperationDiagram {
  return join(K, J, { kComp, jComp });
}
function join(
  K: OperationDiagram,
  J: OperationDiagram,
  {
    kComp = 0,
    jComp = 0,
    row = false,
    gap = 64,
  }: { kComp?: number; jComp?: number; row?: boolean; gap?: number },
): OperationDiagram {
  if (!K.comps.length || !J.comps.length) throw new RangeError(t('composition.empty'));
  const left = exposed(paths(K, 0, true), kComp, 1, !row, row ? 14 : 26);
  const fitHeight = row ? undefined : bounds(left.paths).height;
  let right = exposed(paths(J, 1, true), jComp, -1, !row, row ? 14 : 26, fitHeight);
  const direction = (cut: Cut) => cut.path.pts.at(-1)![1] - cut.path.pts[0][1];
  const reverseJ = direction(left.cut) * direction(right.cut) > 0;
  if (reverseJ) {
    // Reversing only the selected component of a link flips its mixed signs.
    // Reverse the whole right operand together so EVERY original sign survives.
    right = exposed(paths(J, 1, true).map(reversePath), jComp, -1, !row, row ? 14 : 26, fitHeight);
  }
  const placed = beside(left.paths, right.paths),
    scale = row ? 1 : bounds(left.paths).height / bounds(right.paths).height;
  const dx = row
    ? bounds(left.paths).x1 + gap - bounds(right.paths).x0
    : placed[jComp].pts[0][0] - scale * right.paths[jComp].pts[0][0];
  const centre = (cut: Cut) => (cut.path.pts[0][1] + cut.path.pts.at(-1)![1]) / 2;
  const dy = row ? 0 : centre(left.cut) - scale * centre(right.cut);
  const moved = transform(right.paths, scale, dx, dy);
  const jPath = transform([right.cut.path], scale, dx, dy)[0],
    kPath = left.cut.path;
  const band = smoothBand(kPath, jPath);
  const joined: Path = {
    pts: [...kPath.pts, ...band.sides[0].slice(1, -1), ...jPath.pts, ...band.sides[1].slice(1, -1)],
    edges: [
      ...kPath.edges,
      ...band.sides[0].slice(1).map(() => null),
      ...jPath.edges,
      ...band.sides[1].slice(1).map(() => null),
    ],
    rev: false,
  };
  const result = [
    ...left.paths.map((p, i) => (i === kComp ? joined : p)),
    ...moved.filter((_, i) => i !== jComp),
  ];
  const old = originals([K, J]);
  const kCode = code(old, 0, kComp, K.comps[kComp].pts.length, !!K.comps[kComp].rev, left.cut.end);
  const jCode = code(
    old,
    1,
    jComp,
    J.comps[jComp].pts.length,
    !!J.comps[jComp].rev !== reverseJ,
    right.cut.end,
  );
  const expected = [
    ...K.comps.map((c, i) => (i === kComp ? [...kCode, ...jCode] : code(old, 0, i, c.pts.length, !!c.rev))),
    ...J.comps.flatMap((c, i) => (i === jComp ? [] : [code(old, 1, i, c.pts.length, !!c.rev !== reverseJ)])),
  ];
  return { ...finish(result, old, expected), bands: [...(row ? (K.bands ?? []) : []), band] };
}

// The whole row is planned before joining: copies share one rotation, axis,
// scale and pitch. Construct bands at their final frame scale so 14 units is
// a real lower bound even for K_6, rather than shrinking the bands afterwards.
export function connectedSumCopies(copy: OperationDiagram, n: number, angle = Math.PI / 2): OperationDiagram {
  if (copy.comps.length !== 1 || !Number.isInteger(n) || n < 1 || n > 6) throw failure();
  if (n === 1) return copy;
  const input = paths(copy, 0),
    box = bounds(input);
  const cx = (box.x0 + box.x1) / 2,
    cy = (box.y0 + box.y1) / 2;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const turned = input.map((p) => ({
    ...p,
    pts: p.pts.map(([x, y]): Point => [
      cx + cos * (x - cx) - sin * (y - cy),
      cy + sin * (x - cx) + cos * (y - cy),
    ]),
  }));
  const rotatedBox = bounds(turned);
  const gap = 28,
    scale = Math.min((660 - (n - 1) * gap) / (n * (rotatedBox.x1 - rotatedBox.x0)), 460 / rotatedBox.height);
  const first = transform(
    turned,
    scale,
    70 - scale * rotatedBox.x0,
    300 - (scale * (rotatedBox.y0 + rotatedBox.y1)) / 2,
  );
  const old = originals([copy]);
  const placed = finish(first, old, [code(old, 0, 0, copy.comps[0].pts.length, !!copy.comps[0].rev)]);
  let result = placed;
  for (let i = 1; i < n; i++) result = join(result, placed, { row: true, gap });
  return result;
}

// Family samples need heights, not an over map. Heights are constant across
// each crossing's source segment, and are verified again by placeSamples.
export function operationSamples(diagram: OperationDiagram): Sample[] {
  const samples = diagram.comps.map((c) => ({
    pts: c.pts.map((p): Point => [p[0], -p[1]]),
    z: c.pts.map(() => 0),
  }));
  const assigned = samples.map(() => new Map<number, number>());
  for (const r of rawCrossings(diagram.comps)) {
    const aOver = (diagram.over.get(r.key) ?? 'a') === 'a';
    for (const [p, height] of [
      [r.a, aOver ? 1 : -1],
      [r.b, aOver ? -1 : 1],
    ] as const) {
      for (const vertex of [Math.floor(p.t), (Math.floor(p.t) + 1) % samples[p.c].pts.length]) {
        const old = assigned[p.c].get(vertex);
        if (old !== undefined && old !== height) throw failure();
        assigned[p.c].set(vertex, height);
        samples[p.c].z[vertex] = height;
      }
    }
  }
  return samples;
}
