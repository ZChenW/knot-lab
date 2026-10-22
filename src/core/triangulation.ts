import type { Point } from './knot';

export type Edge = [number, number];
export type Triangle = [number, number, number];
export interface Gluing {
  a: Edge;
  b: Edge;
  reversed: boolean;
}
export interface Net {
  points: Point[];
  triangles: Triangle[];
  gluings: Gluing[];
}
export interface NetProblem {
  condition: 1 | 2 | 3;
  kind: 'point inside a side' | 'triangles overlap' | `edge on ${number} triangles` | 'boundary not simple';
  point?: number;
  edge?: Edge;
  triangles: number[];
}
export interface OrientationProof {
  edge: Edge;
  triangles: number[];
  edges: Edge[];
}
export type SurfaceType = 'disk' | 'annulus' | 'Möbius band' | 'sphere' | 'torus' | string;
export interface TrianglePiece {
  triangles: number[];
  V: number;
  E: number;
  F: number;
  chi: number;
  boundary: Edge[][];
  B: number;
  orientable: boolean;
  type: SurfaceType | null;
  genus: number | null;
  orders: { triangle: number; order: Triangle }[];
  proof: OrientationProof | null;
}
export interface Triangulation {
  V: number;
  E: number;
  F: number;
  chi: number;
  pieces: number;
  problems: NetProblem[];
  parts: TrianglePiece[];
  boundary: Edge[][] | null;
  B: number | null;
  orientable: boolean | null;
  type: SurfaceType | null;
}
export const edgeKey = ([a, b]: Edge) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const triangleEdges = (t: Triangle): Edge[] => [
  [t[0], t[1]],
  [t[1], t[2]],
  [t[2], t[0]],
];
class Union {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    return this.parent[i] === i ? i : (this.parent[i] = this.find(this.parent[i]));
  }
  join(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}
interface Side {
  triangle: number;
  local: number;
  edge: Edge;
}
function topology(net: Net) {
  if (
    !net.points.every((p) => p.length === 2 && p.every(Number.isFinite)) ||
    !net.triangles.every(
      (t) =>
        t.length === 3 && new Set(t).size === 3 && t.every((v) => Number.isInteger(v) && !!net.points[v]),
    )
  )
    throw new Error('Invalid triangle net');
  const edges = new Map<string, Side[]>();
  net.triangles.forEach((t, triangle) =>
    triangleEdges(t).forEach((edge, local) => {
      const key = edgeKey(edge);
      edges.set(key, [...(edges.get(key) ?? []), { triangle, local, edge }]);
    }),
  );
  const keys = [...edges.keys()],
    vertices = new Union(net.points.length),
    cells = new Union(keys.length);
  const paired = new Set<string>();
  for (const g of net.gluings) {
    const a = edgeKey(g.a),
      b = edgeKey(g.b);
    if (
      typeof g.reversed !== 'boolean' ||
      a === b ||
      paired.has(a) ||
      paired.has(b) ||
      edges.get(a)?.length !== 1 ||
      edges.get(b)?.length !== 1
    )
      throw new Error('Gluing requires two unpaired boundary edges');
    paired.add(a);
    paired.add(b);
    vertices.join(g.a[0], g.b[g.reversed ? 1 : 0]);
    vertices.join(g.a[1], g.b[g.reversed ? 0 : 1]);
    cells.join(keys.indexOf(a), keys.indexOf(b));
  }
  const groups = new Map<number, Side[]>();
  keys.forEach((k, i) => groups.set(cells.find(i), [...(groups.get(cells.find(i)) ?? []), ...edges.get(k)!]));
  // Pair actual edge ends, rather than only their quotient vertex names: a
  // quotient may have loops or parallel edges (especially after arbitrary gluing).
  const match = (a: Side, b: Side, vertex: number) => {
    if (edgeKey(a.edge) === edgeKey(b.edge)) return vertex;
    const g = net.gluings.find((g) => [edgeKey(g.a), edgeKey(g.b)].includes(edgeKey(a.edge)))!;
    const from = edgeKey(g.a) === edgeKey(a.edge) ? g.a : g.b;
    const to = from === g.a ? g.b : g.a;
    return to[g.reversed ? 1 - from.indexOf(vertex) : from.indexOf(vertex)];
  };
  return { edges, vertices, groups, match };
}
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const eps = 1e-7;
function inside(p: Point, t: Point[]) {
  const s = t.map((a, i) => cross(a, t[(i + 1) % 3], p));
  return s.every((x) => x > eps) || s.every((x) => x < -eps);
}
function inspect(net: Net, T: ReturnType<typeof topology>): NetProblem[] {
  const result: NetProblem[] = [],
    used = [...new Set(net.triangles.flat())];
  for (const sides of T.edges.values()) {
    const edge = sides[0].edge,
      [a, b] = edge.map((v) => net.points[v]);
    for (const point of used) {
      if (edge.includes(point)) continue;
      const p = net.points[point];
      if (
        Math.abs(cross(a, b, p)) < eps &&
        (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]) < -eps
      )
        result.push({
          condition: 1,
          kind: 'point inside a side',
          point,
          edge,
          triangles: sides.map((s) => s.triangle),
        });
    }
  }
  net.triangles.forEach((a, i) => {
    if (Math.abs(cross(...(a.map((v) => net.points[v]) as [Point, Point, Point]))) < eps)
      result.push({ condition: 1, kind: 'triangles overlap', triangles: [i] });
    net.triangles.slice(i + 1).forEach((b, j) => {
      const A = a.map((v) => net.points[v]),
        B = b.map((v) => net.points[v]);
      const centroid = (p: Point[]): Point => [
        p.reduce((s, p) => s + p[0], 0) / 3,
        p.reduce((s, p) => s + p[1], 0) / 3,
      ];
      const crossing = triangleEdges(a).some(([a, b]) =>
        triangleEdges(net.triangles[i + j + 1]).some(
          ([c, d]) =>
            cross(net.points[a], net.points[b], net.points[c]) *
              cross(net.points[a], net.points[b], net.points[d]) <
              -eps &&
            cross(net.points[c], net.points[d], net.points[a]) *
              cross(net.points[c], net.points[d], net.points[b]) <
              -eps,
        ),
      );
      const falseVertex = a.some((v) =>
        b.some(
          (w) =>
            v !== w &&
            Math.hypot(net.points[v][0] - net.points[w][0], net.points[v][1] - net.points[w][1]) < eps,
        ),
      );
      if (
        crossing ||
        falseVertex ||
        A.some((p) => inside(p, B)) ||
        B.some((p) => inside(p, A)) ||
        inside(centroid(A), B) ||
        inside(centroid(B), A)
      )
        result.push({ condition: 1, kind: 'triangles overlap', triangles: [i, i + j + 1] });
    });
  });
  const links = new Union(net.triangles.length * 3),
    boundaryDegree = new Map<number, number>();
  for (const sides of T.groups.values()) {
    if (sides.length > 2)
      result.push({
        condition: 2,
        kind: `edge on ${sides.length} triangles`,
        edge: sides[0].edge,
        triangles: sides.map((s) => s.triangle),
      });
    if (sides.length === 1)
      for (const v of sides[0].edge) {
        const q = T.vertices.find(v);
        boundaryDegree.set(q, (boundaryDegree.get(q) ?? 0) + 1);
      }
    if (sides.length === 2)
      for (const v of sides[0].edge) {
        const [a, b] = sides;
        links.join(
          3 * a.triangle + net.triangles[a.triangle].indexOf(v),
          3 * b.triangle + net.triangles[b.triangle].indexOf(T.match(a, b, v)),
        );
      }
  }
  const fans = new Map<number, { roots: Set<number>; triangles: number[]; point: number }>();
  net.triangles.forEach((t, i) =>
    t.forEach((v, k) => {
      const q = T.vertices.find(v),
        f = fans.get(q) ?? { roots: new Set<number>(), triangles: [], point: v };
      f.roots.add(links.find(3 * i + k));
      f.triangles.push(i);
      fans.set(q, f);
    }),
  );
  for (const [v, f] of fans)
    if (f.roots.size !== 1 || (boundaryDegree.has(v) && boundaryDegree.get(v)! !== 2))
      result.push({
        condition: 3,
        kind: 'boundary not simple',
        point: f.point,
        triangles: [...new Set(f.triangles)],
      });
  return result;
}
export function problems(net: Net): NetProblem[] {
  return inspect(net, topology(net));
}
export function analyse(net: Net): Triangulation {
  const T = topology(net),
    issues = inspect(net, T),
    used = [...new Set(net.triangles.flat())];
  const V = new Set(used.map((v) => T.vertices.find(v))).size,
    E = T.groups.size,
    F = net.triangles.length;
  const components = new Union(F),
    atVertex = new Map<number, number>();
  net.triangles.forEach((t, i) =>
    t.forEach((v) => {
      const q = T.vertices.find(v);
      if (atVertex.has(q)) components.join(i, atVertex.get(q)!);
      else atVertex.set(q, i);
    }),
  );
  const pieces = new Set(net.triangles.map((_, i) => components.find(i))).size;
  const base = { V, E, F, chi: V - E + F, pieces, problems: issues };
  if (issues.length) return { ...base, parts: [], boundary: null, B: null, orientable: null, type: null };
  const parts: TrianglePiece[] = [];
  for (const root of new Set(net.triangles.map((_, i) => components.find(i)))) {
    const triangles = net.triangles.flatMap((_, i) => (components.find(i) === root ? [i] : []));
    const groups = [...T.groups.values()].filter((g) => triangles.includes(g[0].triangle));
    const remaining = new Set(groups.filter((g) => g.length === 1).map((g) => g[0]));
    const boundary: Edge[][] = [];
    while (remaining.size) {
      const first = remaining.values().next().value!;
      let edge = first,
        vertex = T.vertices.find(first.edge[0]);
      const start = vertex,
        cycle: Edge[] = [];
      do {
        cycle.push(edge.edge);
        remaining.delete(edge);
        const [a, b] = edge.edge.map((v) => T.vertices.find(v));
        vertex = vertex === a ? b : a;
        if (vertex === start) break;
        edge = [...remaining].find((s) => s.edge.some((v) => T.vertices.find(v) === vertex))!;
      } while (edge);
      boundary.push(cycle);
    }
    // Propagate through the drawn patches before crossing glued seams, so an
    // orientation conflict appears where the identification closes the cycle.
    const shared = groups
      .filter((g) => g.length === 2)
      .sort(
        (a, b) =>
          Number(edgeKey(a[0].edge) !== edgeKey(a[1].edge)) -
          Number(edgeKey(b[0].edge) !== edgeKey(b[1].edge)),
      );
    const connected = new Union(F),
      tree = shared.filter(([a, b]) => {
        if (connected.find(a.triangle) === connected.find(b.triangle)) return false;
        connected.join(a.triangle, b.triangle);
        return true;
      });
    const signs = new Map<number, number>([[triangles[0], 1]]),
      parent = new Map<number, { triangle: number; edge: Edge }>();
    const queue = [triangles[0]];
    for (let i = 0; i < queue.length; i++)
      for (const g of tree) {
        const a = g.find((s) => s.triangle === queue[i]);
        if (!a) continue;
        const b = g[0] === a ? g[1] : g[0];
        const same = T.match(a, b, a.edge[0]) === b.edge[0],
          sign = signs.get(a.triangle)! * (same ? -1 : 1);
        if (!signs.has(b.triangle)) {
          signs.set(b.triangle, sign);
          parent.set(b.triangle, { triangle: a.triangle, edge: a.edge });
          queue.push(b.triangle);
        }
      }
    let proof: OrientationProof | null = null;
    for (const [a, b] of [...shared].reverse()) {
      const same = T.match(a, b, a.edge[0]) === b.edge[0];
      if (signs.get(b.triangle) !== signs.get(a.triangle)! * (same ? -1 : 1)) {
        const path = (t: number) => {
          const nodes = [t],
            edges: Edge[] = [];
          while (parent.has(t)) {
            const p = parent.get(t)!;
            edges.push(p.edge);
            t = p.triangle;
            nodes.push(t);
          }
          return { nodes, edges };
        };
        const p = path(a.triangle),
          q = path(b.triangle),
          common = p.nodes.findIndex((n) => q.nodes.includes(n)),
          k = q.nodes.indexOf(p.nodes[common]);
        proof = {
          edge: a.edge,
          triangles: [...p.nodes.slice(0, common + 1), ...q.nodes.slice(0, k).reverse()],
          edges: [...p.edges.slice(0, common), ...q.edges.slice(0, k).reverse(), a.edge],
        };
        break;
      }
    }
    const v = new Set(triangles.flatMap((i) => net.triangles[i].map((v) => T.vertices.find(v)))).size,
      chi = v - groups.length + triangles.length;
    const B = boundary.length,
      orientable = !proof,
      genus = orientable ? (2 - chi - B) / 2 : null;
    if (genus !== null && (!Number.isInteger(genus) || genus < 0)) throw new Error('Invalid triangle genus');
    const type = orientable
      ? B === 1 && chi === 1
        ? 'disk'
        : B === 2 && chi === 0
          ? 'annulus'
          : B === 0 && chi === 2
            ? 'sphere'
            : B === 0 && chi === 0
              ? 'torus'
              : `g = ${genus}`
      : B === 1 && chi === 0
        ? 'Möbius band'
        : null;
    parts.push({
      triangles,
      V: v,
      E: groups.length,
      F: triangles.length,
      chi,
      boundary,
      B,
      orientable,
      genus,
      type,
      proof,
      orders: triangles.map((triangle) => ({
        triangle,
        order:
          signs.get(triangle) === 1
            ? [...net.triangles[triangle]]
            : [net.triangles[triangle][0], net.triangles[triangle][2], net.triangles[triangle][1]],
      })),
    });
  }
  return {
    ...base,
    parts,
    boundary: parts.flatMap((p) => p.boundary),
    B: parts.reduce((s, p) => s + p.B, 0),
    orientable: parts.every((p) => p.orientable),
    type: parts.length === 1 ? parts[0].type : null,
  };
}
export function netEdges(net: Net): Edge[] {
  return [...topology(net).edges.values()].map((s) => s[0].edge);
}
export function boundaryEdges(net: Net): Edge[] {
  return [...topology(net).edges.values()].filter((s) => s.length === 1).map((s) => s[0].edge);
}
export function freeEdges(net: Net): Edge[] {
  const paired = new Set(net.gluings.flatMap((g) => [edgeKey(g.a), edgeKey(g.b)]));
  return boundaryEdges(net).filter((e) => !paired.has(edgeKey(e)));
}
function clone(net: Net): Net {
  return {
    points: net.points.map((p) => [...p]),
    triangles: net.triangles.map((t) => [...t]),
    gluings: net.gluings.map((g) => ({ ...g, a: [...g.a], b: [...g.b] })),
  };
}
function dividedGluings(net: Net, mid: Map<string, number>): Gluing[] {
  return net.gluings.flatMap((g) => {
    const a = mid.get(edgeKey(g.a)),
      b = mid.get(edgeKey(g.b));
    if (a === undefined || b === undefined) return [g];
    return [
      { a: [g.a[0], a], b: g.reversed ? [b, g.b[1]] : [g.b[0], b], reversed: g.reversed },
      { a: [a, g.a[1]], b: g.reversed ? [g.b[0], b] : [b, g.b[1]], reversed: g.reversed },
    ] as Gluing[];
  });
}
export function splitEdge(net: Net, edge: Edge): Net {
  if (!netEdges(net).some((e) => edgeKey(e) === edgeKey(edge))) return net;
  const out = clone(net),
    keys = new Set([edgeKey(edge)]),
    mid = new Map<string, number>();
  for (const g of net.gluings)
    if ([edgeKey(g.a), edgeKey(g.b)].includes(edgeKey(edge))) {
      keys.add(edgeKey(g.a));
      keys.add(edgeKey(g.b));
    }
  for (const e of netEdges(net))
    if (keys.has(edgeKey(e))) {
      mid.set(edgeKey(e), out.points.length);
      out.points.push([
        (net.points[e[0]][0] + net.points[e[1]][0]) / 2,
        (net.points[e[0]][1] + net.points[e[1]][1]) / 2,
      ]);
    }
  for (const [key, m] of mid)
    out.triangles = out.triangles.flatMap((t) => {
      const i = triangleEdges(t).findIndex((e) => key === edgeKey(e));
      if (i < 0) return [t];
      const a = t[i],
        b = t[(i + 1) % 3],
        c = t[(i + 2) % 3];
      return [
        [a, m, c],
        [m, b, c],
      ] as Triangle[];
    });
  out.gluings = dividedGluings(out, mid);
  return out;
}
export function splitTriangle(net: Net, triangle: number): Net {
  const t = net.triangles[triangle];
  if (!t) return net;
  const out = clone(net),
    m = out.points.length;
  out.points.push([
    t.reduce((s, v) => s + net.points[v][0], 0) / 3,
    t.reduce((s, v) => s + net.points[v][1], 0) / 3,
  ]);
  out.triangles.splice(triangle, 1, ...triangleEdges(t).map(([a, b]): Triangle => [a, b, m]));
  return out;
}
export function barycentric(net: Net): Net {
  if (!net.triangles.length) return net;
  const out = clone(net),
    mid = new Map<string, number>();
  for (const e of netEdges(net)) {
    mid.set(edgeKey(e), out.points.length);
    out.points.push([
      (net.points[e[0]][0] + net.points[e[1]][0]) / 2,
      (net.points[e[0]][1] + net.points[e[1]][1]) / 2,
    ]);
  }
  out.triangles = net.triangles.flatMap((t) => {
    const c = out.points.length;
    out.points.push([
      t.reduce((s, v) => s + net.points[v][0], 0) / 3,
      t.reduce((s, v) => s + net.points[v][1], 0) / 3,
    ]);
    return triangleEdges(t).flatMap(([a, b]): Triangle[] => [
      [a, mid.get(edgeKey([a, b]))!, c],
      [mid.get(edgeKey([a, b]))!, b, c],
    ]);
  });
  out.gluings = dividedGluings(out, mid);
  return out;
}
export function glue(net: Net, a: Edge, b: Edge, reversed: boolean): Net {
  const free = new Set(freeEdges(net).map(edgeKey));
  if (edgeKey(a) === edgeKey(b) || !free.has(edgeKey(a)) || !free.has(edgeKey(b))) return net;
  const out = clone(net);
  out.gluings.push({ a: [...a], b: [...b], reversed });
  return out;
}
export function unglue(net: Net, gluing: number): Net {
  if (!net.gluings[gluing]) return net;
  const out = clone(net);
  out.gluings.splice(gluing, 1);
  return out;
}
export function addTriangle(net: Net, edge: Edge): Net {
  if (!freeEdges(net).some((e) => edgeKey(e) === edgeKey(edge))) return net;
  const out = clone(net),
    t = net.triangles.find((t) => edge.every((v) => t.includes(v)))!,
    c = net.points[t.find((v) => !edge.includes(v))!];
  const [a, b] = edge.map((v) => net.points[v]),
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = dx * dx + dy * dy;
  if (len < eps) return net;
  const side = cross(a, b, c) > 0 ? -1 : 1,
    h = Math.sqrt(len) * 0.65,
    m = out.points.length;
  out.points.push([
    (a[0] + b[0]) / 2 - ((side * dy) / Math.sqrt(len)) * h,
    (a[1] + b[1]) / 2 + ((side * dx) / Math.sqrt(len)) * h,
  ]);
  out.triangles.push([edge[1], edge[0], m]);
  return out;
}
