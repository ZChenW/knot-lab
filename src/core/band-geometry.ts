import {
  normalizeAngle,
  turn,
  type BandSurface,
  type BandFoot,
  type FootRef,
  type BoundaryStep,
  type BandDisk,
  type Band,
} from './bands';
import { rawCrossings, type Point } from './knot';
import type { Box } from './diagram';
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const bandPath = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
const onCircle = (center: Point, r: number, a: number): Point => [
  center[0] + r * Math.cos(a),
  center[1] + r * Math.sin(a),
];
/** Keep the drawing's disks disjoint, with room for the outward band leads. */
export function diskPosition(s: BandSurface, disk: BandDisk, desired: Point, from?: Point): Point {
  const others = s.disks.filter((d) => d.id !== disk.id);
  if (from) {
    const dx = desired[0] - from[0],
      dy = desired[1] - from[1],
      length2 = dx * dx + dy * dy;
    if (!length2) return from;
    let fraction = 1;
    for (const other of others) {
      const radius = disk.radius + other.radius + 80;
      const x = from[0] - other.center[0],
        y = from[1] - other.center[1];
      const projection = x * dx + y * dy;
      const discriminant = projection * projection - length2 * (x * x + y * y - radius * radius);
      if (projection >= 0 || discriminant < 0) continue;
      const entry = (-projection - Math.sqrt(discriminant)) / length2;
      if (entry >= 0 && entry < fraction) fraction = Math.max(0, entry - 1e-6);
    }
    return [from[0] + fraction * dx, from[1] + fraction * dy];
  }
  // Search for the nearest free region instead of repeatedly pushing a new
  // disk between obstacles, which can oscillate.
  const free = (p: Point) => others.every((d) => distance(p, d.center) >= disk.radius + d.radius + 80);
  if (free(desired)) return desired;
  for (let radius = 8; ; radius += 8) {
    const steps = Math.max(16, Math.ceil((turn * radius) / 8));
    for (let i = 0; i < steps; i++) {
      const p = onCircle(desired, radius, (turn * i) / steps);
      if (free(p)) return p;
    }
  }
}
export function availableFoot(
  s: BandSurface,
  foot: BandFoot,
  except?: FootRef,
  minimumGap = 0.025,
): BandFoot {
  const used = s.bands.flatMap((b) =>
    b.feet.flatMap((f, i) =>
      f.disk === foot.disk && !(except?.band === b.id && except.foot === i) ? [normalizeAngle(f.angle)] : [],
    ),
  );
  let angle = normalizeAngle(foot.angle);
  // Creation reserves a visible gap; live sliding uses only a coincidence
  // tolerance. Resolve that tolerance on the pointer's side of the neighbour,
  // retaining the old side at exact coincidence, until the pointer passes it.
  for (let i = 0; i <= used.length; i++) {
    const near = used.find(
      (a) => Math.min(normalizeAngle(a - angle), normalizeAngle(angle - a)) < minimumGap,
    );
    if (near === undefined) break;
    const old = except ? s.bands.find((b) => b.id === except.band)?.feet[except.foot].angle : undefined;
    const difference = normalizeAngle(angle - near + Math.PI) - Math.PI;
    const oldSide = old === undefined ? 1 : Math.sign(normalizeAngle(old - near + Math.PI) - Math.PI) || 1;
    const side = minimumGap < 0.025 ? Math.sign(difference) || oldSide : 1;
    angle = normalizeAngle(near + side * minimumGap * 1.04);
  }
  return { ...foot, angle };
}
// 22.C: analytic tangents make the strip offsets independent of sampling density.
export const BAND_WIDTH = 18;
export const ARCH_CLEARANCE = 60;
export const ARCH_GAP = 12;
export const FILLET_WIDTHS = 1.5;
const SAMPLE_STEP = 4;
const SAMPLE_TURN = Math.PI / 60;
type Curve = { length: number; at: (s: number) => { point: Point; tangent: Point } };
const unit = (a: Point, b: Point): Point => {
  const length = distance(a, b);
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
};
const line = (a: Point, b: Point): Curve => {
  const tangent = unit(a, b);
  return {
    length: distance(a, b),
    at: (s) => ({ point: [a[0] + s * tangent[0], a[1] + s * tangent[1]], tangent }),
  };
};
const arc = (c: Point, radius: number, angle: number, sweep: number): Curve => ({
  length: Math.abs(sweep) * radius,
  at: (s) => {
    const a = angle + (Math.sign(sweep) * s) / radius;
    return {
      point: onCircle(c, radius, a),
      tangent: [-Math.sign(sweep) * Math.sin(a), Math.sign(sweep) * Math.cos(a)],
    };
  },
});
export interface ArchSpan {
  band: number;
  disk: number;
  start: number;
  sweep: number;
  level: number;
}
const inSpan = (span: ArchSpan, angle: number) => {
  const along = normalizeAngle(Math.sign(span.sweep) * (angle - span.start));
  return along > 1e-9 && along < Math.abs(span.sweep) - 1e-9;
};
export const spansCross = (a: ArchSpan, b: ArchSpan) =>
  a.disk === b.disk && inSpan(a, b.start) !== inSpan(a, b.start + b.sweep);
const containsSpan = (a: ArchSpan, b: ArchSpan) =>
  a.disk === b.disk && inSpan(a, b.start) && inSpan(a, b.start + b.sweep);
/** Shorter circular intervals; an antipodal tie goes counter-clockwise on screen.
 * Levels depend only on the directed intervals' containment/interleaving graph,
 * then document order, never on their metric length or the angle-zero seam.
 * Thus a drag keeps all levels until an endpoint passes a foot or the shorter
 * direction switches at pi. No history/cache is needed, including after undo.
 */
export function archSpans(s: BandSurface): ArchSpan[] {
  const spans = s.bands
    .filter((b) => b.feet[0].disk === b.feet[1].disk && !b.route)
    .map((b) => {
      const forward = normalizeAngle(b.feet[1].angle - b.feet[0].angle);
      return {
        band: b.id,
        disk: b.feet[0].disk,
        start: b.feet[0].angle,
        sweep: forward < Math.PI - 1e-12 ? forward : forward - turn,
        level: 0,
      };
    });
  // Every strictly contained interval has fewer descendants. Document order
  // resolves crossing conflicts consistently, without sorting by changing length.
  const ordered = spans
    .slice()
    .sort(
      (a, b) =>
        spans.filter((v) => containsSpan(a, v)).length - spans.filter((v) => containsSpan(b, v)).length ||
        spans.indexOf(a) - spans.indexOf(b),
    );
  // Containment is a lower bound: crossing parents can contain the SAME child,
  // making exact height(child)+1 incompatible with distinct parent heights.
  const assigned: ArchSpan[] = [];
  for (const span of ordered) {
    span.level = Math.max(0, ...assigned.filter((v) => containsSpan(span, v)).map((v) => v.level + 1));
    while (assigned.some((v) => spansCross(span, v) && v.level === span.level)) span.level++;
    assigned.push(span);
  }
  return spans;
}
function archCurves(d: BandDisk, span: ArchSpan, width: number): Curve[] {
  const radius = d.radius + ARCH_CLEARANCE + span.level * (BAND_WIDTH + ARCH_GAP);
  const fillet = FILLET_WIDTHS * width;
  const lead = Math.sqrt(radius * radius - 2 * radius * fillet);
  const delta = Math.asin(fillet / (radius - fillet));
  const direction = Math.sign(span.sweep);
  const half = Math.asin(width / (2 * d.radius));
  // An attachment is a chord: its midpoint is just inside the circle, while
  // BOTH offsets lie exactly on the disk. Everything beyond that chord is outside.
  const first = onCircle(d.center, d.radius * Math.cos(half), span.start);
  const last = onCircle(d.center, d.radius * Math.cos(half), span.start + span.sweep);
  const turnAt = (angle: number, side: number): Point => {
    const p = onCircle(d.center, lead, angle);
    return [p[0] - side * fillet * Math.sin(angle), p[1] + side * fillet * Math.cos(angle)];
  };
  return [
    line(first, onCircle(d.center, lead, span.start)),
    arc(
      turnAt(span.start, direction),
      fillet,
      span.start - (direction * Math.PI) / 2,
      direction * (Math.PI / 2 + delta),
    ),
    arc(d.center, radius, span.start + direction * delta, span.sweep - 2 * direction * delta),
    arc(
      turnAt(span.start + span.sweep, -direction),
      fillet,
      span.start + span.sweep - direction * delta,
      direction * (Math.PI / 2 + delta),
    ),
    line(onCircle(d.center, lead, span.start + span.sweep), last),
  ];
}
/** Visibility graph for outside routes. Outward first/last links preserve
 * the radial tangent and exclude the hairpin which a shortest chord can produce.
 */
function outsideRoute(s: BandSurface, start: Point, end: Point, a?: BandFoot, z?: BandFoot): Point[] {
  const nodes: Point[] = [start, end];
  for (const d of s.disks)
    for (let i = 0; i < 48; i++) nodes.push(onCircle(d.center, d.radius + 40, (turn * i) / 48));
  const outward = (p: Point, q: Point, f: BandFoot) =>
    (q[0] - p[0]) * Math.cos(f.angle) + (q[1] - p[1]) * Math.sin(f.angle) >= -1e-9;
  const clear = (i: number, j: number) => {
    const p = nodes[i],
      q = nodes[j];
    if (
      (i === 0 && a && !outward(p, q, a)) ||
      (j === 0 && a && !outward(q, p, a)) ||
      (i === 1 && z && !outward(p, q, z)) ||
      (j === 1 && z && !outward(q, p, z))
    )
      return false;
    return s.disks.every((d) => {
      const dx = q[0] - p[0],
        dy = q[1] - p[1];
      const t = Math.max(
        0,
        Math.min(1, ((d.center[0] - p[0]) * dx + (d.center[1] - p[1]) * dy) / (dx * dx + dy * dy || 1)),
      );
      return distance(d.center, [p[0] + dx * t, p[1] + dy * t]) >= d.radius + 12;
    });
  };
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    used = new Set<number>();
  costs[0] = 0;
  for (let i = 0; i < nodes.length; i++) {
    let u = -1;
    nodes.forEach((_, j) => {
      if (!used.has(j) && (u < 0 || costs[j] < costs[u])) u = j;
    });
    if (u === 1 || u < 0 || costs[u] === Infinity) break;
    used.add(u);
    nodes.forEach((q, j) => {
      if (!used.has(j) && clear(u, j)) {
        const cost = costs[u] + distance(nodes[u], q);
        if (cost < costs[j]) {
          costs[j] = cost;
          previous[j] = u;
        }
      }
    });
  }
  const route = [end];
  for (let at = 1; previous[at] >= 0;) {
    at = previous[at];
    route.unshift(nodes[at]);
  }
  if (route[0] !== start) throw new Error('No outside band route');
  return route;
}
function diskRoute(s: BandSurface, a: BandFoot, z: BandFoot): Point[] {
  const da = s.disks.find((d) => d.id === a.disk)!,
    dz = s.disks.find((d) => d.id === z.disk)!;
  return [
    onCircle(da.center, da.radius, a.angle),
    ...outsideRoute(
      s,
      onCircle(da.center, da.radius + 35, a.angle),
      onCircle(dz.center, dz.radius + 35, z.angle),
      a,
      z,
    ),
    onCircle(dz.center, dz.radius, z.angle),
  ];
}
function tiedRoute(s: BandSurface, band: Band): Point[] {
  const [a, z] = band.feet,
    da = s.disks.find((d) => d.id === a.disk)!,
    dz = s.disks.find((d) => d.id === z.disk)!;
  const route = band.route!;
  return [
    onCircle(da.center, da.radius, a.angle),
    ...outsideRoute(s, onCircle(da.center, da.radius + 35, a.angle), route[0], a),
    ...route.slice(1, -1),
    ...outsideRoute(s, route.at(-1)!, onCircle(dz.center, dz.radius + 35, z.angle), undefined, z),
    onCircle(dz.center, dz.radius, z.angle),
  ];
}
const corner = (p: Point, q: Point, r: Point) => {
  const incoming = unit(p, q),
    outgoing = unit(q, r);
  const angle = Math.atan2(
    incoming[0] * outgoing[1] - incoming[1] * outgoing[0],
    incoming[0] * outgoing[0] + incoming[1] * outgoing[1],
  );
  return { incoming, outgoing, angle, tangent: Math.tan(Math.abs(angle) / 2) };
};
function roundRoute(route: Point[], width: number): Curve[] {
  const curves: Curve[] = [];
  let prior = route[0];
  for (let i = 1; i < route.length - 1; i++) {
    const q = route[i],
      { incoming, outgoing, angle, tangent } = corner(route[i - 1], q, route[i + 1]);
    if (Math.abs(angle) < 1e-8) continue;
    const radius = FILLET_WIDTHS * width,
      reach = radius * tangent;
    const a: Point = [q[0] - reach * incoming[0], q[1] - reach * incoming[1]];
    const b: Point = [q[0] + reach * outgoing[0], q[1] + reach * outgoing[1]];
    const c: Point = [
      a[0] - Math.sign(angle) * radius * incoming[1],
      a[1] + Math.sign(angle) * radius * incoming[0],
    ];
    curves.push(line(prior, a), arc(c, radius, Math.atan2(a[1] - c[1], a[0] - c[0]), angle));
    prior = b;
  }
  curves.push(line(prior, route.at(-1)!));
  return curves;
}
export interface BandDrawing {
  id: number;
  center: Point[];
  edges: [Point[], Point[]];
  strip: string;
  middle: Point;
  width: number;
  span?: ArchSpan;
  stations: number[];
  heights: [number[], number[]];
  twists: { point: Point; overSide: 0 | 1; at: number }[];
}
export interface StripPassage {
  band: number;
  at: number;
}
export interface StripCrossing {
  key: string;
  point: Point;
  a: StripPassage;
  b: StripPassage;
  over: 0 | 1;
  sin: number;
}

/** The two passages of a self-crossing are distinct, just like two strips. */
function stripCrossings(
  drawings: { id: number; center: Point[]; stations: number[] }[],
  s: BandSurface,
): StripCrossing[] {
  const ordinal = new Map<string, number>();
  return rawCrossings(drawings.map((d) => ({ id: d.id, pts: d.center })))
    .filter((r) => [r.a, r.b].every((p) => p.t < drawings[p.c].center.length - 1))
    .map((r) => {
      const passage = (p: typeof r.a): StripPassage => {
        const d = drawings[p.c],
          i = Math.floor(p.t),
          f = p.t - i;
        return { band: d.id, at: d.stations[i] * (1 - f) + d.stations[i + 1] * f };
      };
      const a = passage(r.a),
        b = passage(r.b),
        pair = `${a.band}:${b.band}`;
      const n = ordinal.get(pair) ?? 0;
      ordinal.set(pair, n + 1);
      const key = `${pair}:${n}`;
      const sin =
        Math.abs(r.a.dx * r.b.dy - r.a.dy * r.b.dx) /
        (Math.hypot(r.a.dx, r.a.dy) * Math.hypot(r.b.dx, r.b.dy));
      return { key, point: [r.x, r.y], a, b, over: s.stripOver?.[key] ?? 1, sin };
    });
}
export function bandGeometry(s: BandSurface) {
  const disks = new Map(s.disks.map((d) => [d.id, d]));
  const spans = archSpans(s);
  const routes = new Map(
    s.bands
      .filter((b) => b.route || b.feet[0].disk !== b.feet[1].disk)
      .map((b) => {
        const route = b.route ? tiedRoute(s, b) : diskRoute(s, ...b.feet);
        return [b.id, route];
      }),
  );
  const widths = new Map<number, number>();
  for (const b of s.bands) {
    let width = BAND_WIDTH;
    for (const f of b.feet) {
      const d = disks.get(f.disk)!;
      const gaps = s.bands
        .flatMap((v) => v.feet)
        .filter((v) => v !== f && v.disk === f.disk)
        .map((v) => Math.min(normalizeAngle(v.angle - f.angle), normalizeAngle(f.angle - v.angle)));
      width = Math.min(width, d.radius * 0.4, ...gaps.map((a) => 0.4 * d.radius * a));
    }
    const span = spans.find((v) => v.band === b.id);
    if (span) {
      const radius = disks.get(span.disk)!.radius + ARCH_CLEARANCE + span.level * (BAND_WIDTH + ARCH_GAP);
      const sine = Math.sin(Math.abs(span.sweep) / 2);
      // Leave a positive concentric arc even for near-coincident feet on a huge disk.
      width = Math.min(width, (0.9 * radius * sine) / (FILLET_WIDTHS * (1 + sine)));
    }
    const route = routes.get(b.id);
    if (route)
      for (let i = 1; i < route.length - 1; i++) {
        const { tangent } = corner(route[i - 1], route[i], route[i + 1]);
        if (tangent > 1e-8)
          width = Math.min(
            width,
            Math.min(10, distance(route[i - 1], route[i]) / 3, distance(route[i], route[i + 1]) / 3) /
              (FILLET_WIDTHS * tangent),
          );
      }
    widths.set(b.id, width);
  }
  const halfAngle = (r: FootRef) => {
    const b = s.bands.find((b) => b.id === r.band)!;
    return Math.asin(widths.get(b.id)! / (2 * disks.get(b.feet[r.foot].disk)!.radius));
  };
  const footPoint = (f: BandFoot, offset = 0) =>
    onCircle(disks.get(f.disk)!.center, disks.get(f.disk)!.radius, f.angle + offset);
  // First build the centre paths, so twist intervals can avoid strip crossings.
  const paths = s.bands.map((b) => {
    const width = widths.get(b.id)!;
    const span = spans.find((v) => v.band === b.id);
    let curves: Curve[];
    if (span) curves = archCurves(disks.get(span.disk)!, span, width);
    else {
      const route = routes.get(b.id)!.slice();
      for (const f of [0, 1] as const) {
        const foot = b.feet[f],
          d = disks.get(foot.disk)!;
        route[f === 0 ? 0 : route.length - 1] = onCircle(
          d.center,
          d.radius * Math.cos(halfAngle({ band: b.id, foot: f })),
          foot.angle,
        );
      }
      curves = roundRoute(route, width);
    }
    const lengths = [0];
    for (const c of curves) lengths.push(lengths.at(-1)! + c.length);
    const total = lengths.at(-1)!;
    const stops = new Set([0, total]);
    curves.forEach((c, i) => {
      const a = c.at(0).tangent,
        z = c.at(c.length).tangent;
      const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * z[0] + a[1] * z[1])));
      const count = Math.max(1, Math.ceil(c.length / SAMPLE_STEP), Math.ceil(angle / SAMPLE_TURN));
      for (let j = 0; j <= count; j++) stops.add(lengths[i] + (c.length * j) / count);
    });
    const at = (length: number) => {
      const i = Math.min(curves.length - 1, lengths.findIndex((v, i) => i > 0 && v >= length - 1e-10) - 1);
      return curves[Math.max(0, i)].at(length - lengths[Math.max(0, i)]);
    };
    const samples = [...stops]
      .sort((a, b) => a - b)
      .filter((v, i, list) => i === 0 || v - list[i - 1] > 1e-9);
    return {
      b,
      width,
      span,
      total,
      at,
      samples,
      id: b.id,
      center: samples.map((v) => at(v).point),
      stations: samples.map((v) => v / total),
    };
  });
  const crossings = stripCrossings(paths, s);
  const drawings: BandDrawing[] = paths.map(({ b, width, span, total, at, samples: original }) => {
    const count = Math.abs(b.halfTwists);
    let twistStart = total / 4,
      twistEnd = (3 * total) / 4;
    const passages = crossings.flatMap((c) =>
      [c.a, c.b].filter((p) => p.band === b.id).map((p) => p.at * total),
    );
    if (passages.length) {
      const cuts = [0, ...passages.sort((a, b) => a - b), total];
      const intervals = cuts.slice(1).map((end, i) => [cuts[i] + 3 * width, end - 3 * width] as const);
      const longest = intervals.reduce((best, v) => (v[1] - v[0] > best[1] - best[0] ? v : best));
      if (longest[1] > longest[0]) [twistStart, twistEnd] = longest;
    }
    const twistLength = Math.min(twistEnd - twistStart, Math.max(8 * width, (count * Math.PI * width) / 2));
    const middle = (twistStart + twistEnd) / 2;
    twistStart = middle - twistLength / 2;
    twistEnd = middle + twistLength / 2;
    const stops = new Set([...original, total / 2, twistStart, twistEnd]);
    // A crossing is strictly inside a sample segment, never an ambiguous vertex.
    if (count)
      for (let i = 0; i <= count * 16 + 1; i++) stops.add(twistStart + (twistLength * i) / (count * 16 + 1));
    const zero = (v: number) =>
      count &&
      Math.abs(Math.cos((Math.PI * count * (v - twistStart)) / twistLength)) < 1e-9 &&
      v > twistStart &&
      v < twistEnd;
    const samples = [...stops]
      .sort((a, b) => a - b)
      .filter((v, i, list) => (i === 0 || v - list[i - 1] > 1e-9) && !zero(v));
    const center = samples.map((v) => at(v).point);
    const phase = (v: number) => Math.max(0, Math.min(1, (v - twistStart) / twistLength));
    const edges = [0, 1].map((side) =>
      samples.map((v): Point => {
        const { point: p, tangent: t } = at(v);
        const offset = (((side === 0 ? -1 : 1) * width) / 2) * Math.cos(Math.PI * count * phase(v));
        return [p[0] - t[1] * offset, p[1] + t[0] * offset];
      }),
    ) as [Point[], Point[]];
    for (const side of [0, 1] as const) {
      edges[side][0] = footPoint(b.feet[0], (side === 0 ? -1 : 1) * halfAngle({ band: b.id, foot: 0 }));
      edges[side][edges[side].length - 1] = footPoint(
        b.feet[1],
        (b.halfTwists % 2 !== 0 ? (side === 0 ? -1 : 1) : side === 0 ? 1 : -1) *
          halfAngle({ band: b.id, foot: 1 }),
      );
    }
    const twists = Array.from({ length: count }, (_, k) => {
      const length = twistStart + (twistLength * (k + 0.5)) / count;
      const i = Math.max(0, samples.findIndex((v) => v > length) - 1);
      const p = edges[0][i],
        q = edges[0][i + 1],
        r = edges[1][i],
        z = edges[1][i + 1];
      const dx = q[0] - p[0],
        dy = q[1] - p[1],
        ex = z[0] - r[0],
        ey = z[1] - r[1];
      const f = ((r[0] - p[0]) * ey - (r[1] - p[1]) * ex) / (dx * ey - dy * ex);
      return {
        point: [p[0] + f * dx, p[1] + f * dy] as Point,
        at: length / total,
        overSide: (Math.sign(b.halfTwists) * (k % 2 ? -1 : 1) > 0 ? 0 : 1) as 0 | 1,
      };
    });
    return {
      id: b.id,
      center,
      edges,
      width,
      span,
      stations: samples.map((v) => v / total),
      heights: [0, 1].map((side) =>
        samples.map(
          (v) => (side === 0 ? 1 : -1) * Math.sign(b.halfTwists) * Math.sin(Math.PI * count * phase(v)),
        ),
      ) as [number[], number[]],
      twists,
      middle: count === 1 ? twists[0].point : at(total / 2).point,
      strip: bandPath([...edges[0], ...edges[1].slice().reverse()]) + ' Z',
    };
  });
  const boundaryPoints = (step: BoundaryStep): Point[] => {
    if (step.kind === 'edge') return drawings.find((d) => d.id === step.band)!.edges[step.side];
    const d = disks.get(step.disk)!;
    let from = 0,
      span = turn;
    if (step.from && step.to) {
      const a = s.bands.find((b) => b.id === step.from!.band)!.feet[step.from.foot];
      const b = s.bands.find((b) => b.id === step.to!.band)!.feet[step.to.foot];
      from = a.angle + halfAngle(step.from);
      span = (normalizeAngle(b.angle - a.angle) || turn) - halfAngle(step.from) - halfAngle(step.to);
    }
    const samples = Math.max(2, Math.ceil((span * d.radius) / SAMPLE_STEP));
    return Array.from({ length: samples + 1 }, (_, i) =>
      onCircle(d.center, d.radius, from + (span * i) / samples),
    );
  };
  const boundaryPath = (step: BoundaryStep) => bandPath(boundaryPoints(step));
  const points = [
    ...s.disks.flatMap(
      (d) =>
        [
          [d.center[0] - d.radius, d.center[1] - d.radius],
          [d.center[0] + d.radius, d.center[1] + d.radius],
        ] as Point[],
    ),
    ...drawings.flatMap((d) => d.edges.flat()),
  ];
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const box: Box = points.length
    ? {
        x: Math.min(...xs) - 12,
        y: Math.min(...ys) - 12,
        w: Math.max(...xs) - Math.min(...xs) + 24,
        h: Math.max(...ys) - Math.min(...ys) + 24,
      }
    : { x: 0, y: 0, w: 800, h: 600 };
  return { drawings, crossings, footPoint, boundaryPoints, boundaryPath, box };
}
export type BandGeometry = ReturnType<typeof bandGeometry>;

/** Slice a ribbon passage by its centreline station, also for a self-crossing. */
export function ribbonSlice(d: BandDrawing, points: Point[], at: number, reach: number): Point[] {
  const length = d.center.slice(1).reduce((sum, p, i) => sum + distance(p, d.center[i]), 0);
  const lo = Math.max(0, at - reach / length),
    hi = Math.min(1, at + reach / length);
  const sample = (t: number): Point => {
    const i = Math.max(0, Math.min(points.length - 2, d.stations.findIndex((s) => s >= t) - 1));
    const f = (t - d.stations[i]) / (d.stations[i + 1] - d.stations[i]);
    return [points[i][0] * (1 - f) + points[i + 1][0] * f, points[i][1] * (1 - f) + points[i + 1][1] * f];
  };
  return [sample(lo), ...points.filter((_, i) => d.stations[i] > lo && d.stations[i] < hi), sample(hi)];
}
