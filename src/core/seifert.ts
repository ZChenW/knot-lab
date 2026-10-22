// Livingston pp. 64–65, 70–72: oriented smoothing, disks, then twisted bands.
import { crossingsOf, type Analysis, type Component, type OverMap, type Passage, type Point } from './knot';

export type SurfaceSide = 'front' | 'back';
export interface SurfacePiece {
  circles: number[];
  components: number[];
  disks: number;
  bands: number;
  boundary: number;
  chi: number;
  genus: number;
}
export interface SeifertNumbers {
  disks: number;
  bands: number;
  boundary: number;
  chi: number;
  pieces: number;
  genus: number;
  parts: SurfacePiece[];
}
export interface SeifertCircle {
  id: number;
  points: Point[];
  depth: number;
  side: SurfaceSide;
}
export interface SeifertCorner {
  crossing: number;
  circle: number;
  radius: number;
  controls: [Point, Point];
  points: Point[];
}
export interface SeifertBand {
  crossing: number;
  sign: number;
  circles: [number, number];
  centre: Point;
  halves: [{ points: Point[]; side: SurfaceSide }, { points: Point[]; side: SurfaceSide }];
}
export interface SeifertSurface extends SeifertNumbers {
  circles: SeifertCircle[];
  corners: SeifertCorner[];
  strips: SeifertBand[];
}
type Diagram = { comps: Component[]; over: OverMap };
type Oriented = Pick<Analysis, 'nComps'> & { crossings: { over: Passage; under: Passage }[] };
const mod = (v: number, n: number) => ((v % n) + n) % n;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Outgoing edges are named by their starting passage; 2x and 2x+1 are the
// over/under passages. Trace to the next passage, then change strands there.
function topology(D: Oriented) {
  const ports = D.crossings.flatMap((x) => [x.over, x.under]);
  const per = Array.from({ length: D.nComps }, () => [] as number[]);
  ports.forEach((p, i) => per[p.c].push(i));
  const next = new Array<number>(ports.length);
  const previous = new Array<number>(ports.length);
  for (const list of per) {
    list.sort((a, b) => ports[a].t - ports[b].t);
    list.forEach((p, i) => {
      next[p] = list[(i + 1) % list.length];
      previous[next[p]] = p;
    });
  }
  const cycles: number[][] = [];
  const owners = new Array<number>(ports.length).fill(-1);
  for (let start = 0; start < ports.length; start++) {
    if (owners[start] !== -1) continue;
    const edges: number[] = [];
    let edge = start;
    do {
      if (owners[edge] !== -1) throw new Error('Seifert smoothing is not a permutation');
      owners[edge] = cycles.length;
      edges.push(edge);
      edge = next[edge] ^ 1;
    } while (edge !== start);
    cycles.push(edges);
  }
  const isolated = per.flatMap((list, c) => (list.length ? [] : [c]));
  const circleComponents = cycles.map((edges) => [...new Set(edges.map((e) => ports[e].c))]);
  for (const c of isolated) circleComponents.push([c]);
  const bands: [number, number][] = D.crossings.map((_, x) => [owners[2 * x], owners[2 * x + 1]]);
  if (bands.some(([a, b]) => a === b)) throw new Error('A Seifert band joins a disk to itself');
  const visited = new Set<number>();
  const parts: SurfacePiece[] = [];
  for (let start = 0; start < circleComponents.length; start++) {
    if (visited.has(start)) continue;
    const circles = [start];
    visited.add(start);
    for (let h = 0; h < circles.length; h++)
      for (const [a, b] of bands) {
        const other = a === circles[h] ? b : b === circles[h] ? a : -1;
        if (other >= 0 && !visited.has(other)) {
          visited.add(other);
          circles.push(other);
        }
      }
    const components = [...new Set(circles.flatMap((id) => circleComponents[id]))].sort((a, b) => a - b);
    const disks = circles.length;
    const count = bands.filter(([a]) => circles.includes(a)).length;
    const boundary = components.length;
    const chi = disks - count;
    const genus = (2 - chi - boundary) / 2;
    if (!Number.isInteger(genus) || genus < 0) throw new Error('Invalid Seifert genus');
    parts.push({ circles, components, disks, bands: count, boundary, chi, genus });
  }
  parts.sort((a, b) => a.components[0] - b.components[0]);
  const disks = circleComponents.length;
  const numbers: SeifertNumbers = {
    disks,
    bands: bands.length,
    boundary: D.nComps,
    chi: disks - bands.length,
    pieces: parts.length,
    genus: parts.reduce((s, p) => s + p.genus, 0),
    parts,
  };
  return { ports, per, next, previous, cycles, owners, isolated, numbers };
}
/** Counts from an existing analysis, without building geometry or determinants. */
export function seifertNumbers(D: Oriented): SeifertNumbers {
  return topology(D).numbers;
}

function area(points: Point[]): number {
  return points.slice(1).reduce((a, p, i) => a + points[i][0] * p[1] - p[0] * points[i][1], 0) / 2;
}
function contains(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 1; i < polygon.length; i++) {
    const a = polygon[i - 1],
      b = polygon[i];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]))
      inside = !inside;
  }
  return inside;
}
function lengths(points: Point[]) {
  const cum = [0];
  for (let i = 0; i < points.length; i++)
    cum.push(cum[i] + distance(points[i], points[(i + 1) % points.length]));
  return cum;
}
function at(points: Point[], cum: number[], s: number): Point {
  s = mod(s, cum.at(-1)!);
  let lo = 0,
    hi = points.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (cum[m + 1] < s) lo = m + 1;
    else hi = m;
  }
  const a = points[lo],
    b = points[(lo + 1) % points.length];
  const f = (s - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
}
function stretch(points: Point[], cum: number[], from: number, to: number): Point[] {
  const total = cum.at(-1)!;
  const result = [at(points, cum, from)];
  for (let turn = Math.floor(from / total); turn <= Math.floor(to / total); turn++)
    for (let i = 0; i < points.length; i++) {
      const s = turn * total + cum[i];
      if (s > from + 1e-8 && s < to - 1e-8) result.push(points[i]);
    }
  result.push(at(points, cum, to));
  return result;
}
const opposite = (side: SurfaceSide): SurfaceSide => (side === 'front' ? 'back' : 'front');
// At a vertex use the retained strand's segment: before the incoming end,
// after the outgoing end. This keeps the cubic tangent to the actual polyline.
function tangent(points: Point[], cum: number[], s: number, before: boolean): Point {
  s = mod(s, cum.at(-1)!);
  let i = cum.findIndex((end, j) => j > 0 && (before ? end >= s : end > s)) - 1;
  if (before && s === 0) i = points.length - 1;
  const a = points[i],
    b = points[(i + 1) % points.length];
  const length = distance(a, b) || 1;
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
}
function roundedCorner(a: Point, b: Point, incoming: Point, outgoing: Point, radius: number) {
  // 22.V: 55% handles read as an arc (a quarter circle uses about 55.23%).
  const handle = 0.55 * radius;
  const h1: Point = [a[0] + handle * incoming[0], a[1] + handle * incoming[1]];
  const h2: Point = [b[0] - handle * outgoing[0], b[1] - handle * outgoing[1]];
  const points = Array.from({ length: 33 }, (_, i): Point => {
    const t = i / 32,
      s = 1 - t;
    return [
      s ** 3 * a[0] + 3 * s * s * t * h1[0] + 3 * s * t * t * h2[0] + t ** 3 * b[0],
      s ** 3 * a[1] + 3 * s * s * t * h1[1] + 3 * s * t * t * h2[1] + t ** 3 * b[1],
    ];
  });
  return { points, controls: [h1, h2] as [Point, Point] };
}
function cornerClearance(points: Point[], centre: Point): number {
  let clearance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(1, ((centre[0] - a[0]) * dx + (centre[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    clearance = Math.min(clearance, distance(centre, [a[0] + t * dx, a[1] + t * dy]));
  }
  return clearance;
}
const memo = new WeakMap<Component[], WeakMap<OverMap, SeifertSurface>>();
export function seifertSurface(diagram: Diagram): SeifertSurface {
  let choices = memo.get(diagram.comps);
  if (!choices) {
    choices = new WeakMap();
    memo.set(diagram.comps, choices);
  }
  const cached = choices.get(diagram.over);
  if (cached) return cached;
  const oriented = diagram.comps.map((c) => c.pts.map((_, i) => c.pts[c.rev ? mod(-i, c.pts.length) : i]));
  const cumulative = oriented.map(lengths);
  const orient = (p: Passage): Passage =>
    diagram.comps[p.c].rev ? { c: p.c, t: mod(-p.t, oriented[p.c].length), dx: -p.dx, dy: -p.dy } : p;
  const crossings = crossingsOf(diagram.comps).map((x) => {
    const over = orient(diagram.over.get(x.key) === 'b' ? x.b : x.a);
    const under = orient(diagram.over.get(x.key) === 'b' ? x.a : x.b);
    return { ...x, over, under, sign: over.dx * under.dy - over.dy * under.dx < 0 ? 1 : -1 };
  });
  const graph = topology({ nComps: diagram.comps.length, crossings });
  const positions = graph.ports.map((p) => {
    const i = Math.floor(p.t),
      cum = cumulative[p.c];
    return cum[i] + (p.t - i) * (cum[i + 1] - cum[i]);
  });
  const spans = graph.ports.map(
    (p, i) =>
      mod(positions[graph.next[i]] - positions[i], cumulative[p.c].at(-1)!) || cumulative[p.c].at(-1)!,
  );
  const fillet = (incoming: number, radius: number) => {
    const p = graph.ports[incoming],
      q = graph.ports[incoming ^ 1];
    const from = positions[incoming] - radius,
      to = positions[incoming ^ 1] + radius;
    return roundedCorner(
      at(oriented[p.c], cumulative[p.c], from),
      at(oriented[q.c], cumulative[q.c], to),
      tangent(oriented[p.c], cumulative[p.c], from, true),
      tangent(oriented[q.c], cumulative[q.c], to, false),
      radius,
    );
  };
  // Twenty-four diagram units makes the half twist visible at ordinary scales.
  // The 40% cap leaves at least 20% of each edge between neighbouring corners.
  // Also keep each corner in a crossing neighbourhood free of unrelated strands.
  const radii = crossings.map((x, index) => {
    let radius = Math.min(
      24,
      ...[2 * index, 2 * index + 1].flatMap((p) => [0.4 * spans[p], 0.4 * spans[graph.previous[p]]]),
    );
    const centre: Point = [x.x, x.y];
    oriented.forEach((points, c) => {
      const cum = cumulative[c],
        total = cum.at(-1)!;
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length];
        const nearby = [2 * index, 2 * index + 1].some(
          (p) =>
            graph.ports[p].c === c &&
            [cum[i], cum[i + 1]].some(
              (s) => Math.min(mod(s - positions[p], total), mod(positions[p] - s, total)) <= 72,
            ),
        );
        if (nearby) return;
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((centre[0] - a[0]) * dx + (centre[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
        );
        radius = Math.min(radius, 0.4 * distance(centre, [a[0] + t * dx, a[1] + t * dy]));
      });
    });
    // A curved passage can bend back within the larger neighbourhood. Check
    // the actual two fillets, not just endpoint distances, before taking it.
    for (let attempt = 0; attempt < 8; attempt++) {
      const clear = [2 * index, 2 * index + 1].every((incoming) => {
        const { points } = fillet(incoming, radius);
        return crossings.every((other) => cornerClearance(points, [other.x, other.y]) > 1.05);
      });
      if (clear) break;
      radius *= 0.75;
    }
    return radius;
  });
  const edges = graph.ports.map((p, i) =>
    stretch(
      oriented[p.c],
      cumulative[p.c],
      positions[i] + radii[i >> 1],
      positions[i] + spans[i] - radii[graph.next[i] >> 1],
    ),
  );
  const corners: SeifertCorner[] = graph.ports.map((_, incoming) => {
    const circle = graph.owners[incoming ^ 1];
    const radius = radii[incoming >> 1];
    const corner = fillet(incoming, radius);
    // Reuse the edge endpoints exactly, including roundoff at a wrapped passage.
    corner.points[0] = edges[graph.previous[incoming]].at(-1)!;
    corner.points[corner.points.length - 1] = edges[incoming ^ 1][0];
    return { crossing: incoming >> 1, circle, radius, ...corner };
  });
  const circles: SeifertCircle[] = graph.cycles.map((cycle, id) => {
    const points = cycle.flatMap((edge) => [
      ...edges[edge].slice(0, -1),
      ...corners[graph.next[edge]].points.slice(0, -1),
    ]);
    points.push(points[0]);
    return { id, points, depth: 0, side: area(points) < 0 ? 'front' : 'back' };
  });
  graph.isolated.forEach((c) => {
    const points = [...oriented[c], oriented[c][0]];
    circles.push({ id: circles.length, points, depth: 0, side: area(points) < 0 ? 'front' : 'back' });
  });
  circles.forEach((circle) => {
    circle.depth = circles.filter(
      (other) => other !== circle && contains(circle.points[0], other.points),
    ).length;
  });
  const strips: SeifertBand[] = crossings.map((x, index) => {
    const centre: Point = [x.x, x.y];
    const halves = [corners[2 * index], corners[2 * index + 1]].map((corner, half) => {
      const circle = circles[corner.circle];
      const incoming = 2 * index + half,
        outgoing = incoming ^ 1;
      const p = graph.ports[incoming],
        q = graph.ports[outgoing];
      const before = stretch(
        oriented[p.c],
        cumulative[p.c],
        positions[incoming] - corner.radius,
        positions[incoming],
      );
      const after = stretch(
        oriented[q.c],
        cumulative[q.c],
        positions[outgoing],
        positions[outgoing] + corner.radius,
      );
      // 22.V: the disk and band share the SAME corner samples. The other two
      // boundaries follow every original strand vertex, rather than a chord.
      return {
        points: [
          ...corner.points,
          ...after.slice(1, -1).reverse(),
          centre,
          ...before.slice(1, -1).reverse(),
          corner.points[0],
        ],
        side: contains(centre, circle.points) ? opposite(circle.side) : circle.side,
      };
    }) as SeifertBand['halves'];
    if (halves[0].side === halves[1].side) throw new Error('Seifert band has inconsistent sides');
    return {
      crossing: index,
      sign: x.sign,
      circles: [corners[2 * index].circle, corners[2 * index + 1].circle],
      centre,
      halves,
    };
  });
  const result = { ...graph.numbers, circles, corners, strips };
  choices.set(diagram.over, result);
  return result;
}

export interface SeifertLine {
  key: 'disks' | 'bands' | 'boundary' | 'pieces' | 'chi' | 'genus' | 'bound';
  label?: string;
  value: string;
}
/** The same course notation and row order for the readout and sheet. */
export function seifertLines(S: SeifertNumbers): SeifertLine[] {
  return [
    { key: 'disks', label: 'disks', value: `s = ${S.disks}` },
    { key: 'bands', label: 'bands', value: `c = ${S.bands}` },
    { key: 'boundary', label: 'boundary', value: `B = ${S.boundary}` },
    ...(S.pieces > 1 ? [{ key: 'pieces' as const, label: 'pieces', value: `k = ${S.pieces}` }] : []),
    { key: 'chi', value: `χ(S) = s − c = ${String(S.chi).replace('-', '−')}` },
    {
      key: 'genus',
      value:
        S.pieces > 1
          ? `g(S) = ${S.parts.map((part) => part.genus).join(' + ')} = ${S.genus}`
          : `g(S) = (2 − χ − B)/2 = ${S.genus}`,
    },
    ...(S.pieces === 1
      ? [
          {
            key: 'bound' as const,
            value: `g(${S.boundary === 1 ? 'K' : 'L'}) ${S.boundary === 1 && S.genus === 0 ? '=' : '≤'} ${S.genus}`,
          },
        ]
      : []),
  ];
}
