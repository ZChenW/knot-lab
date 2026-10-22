// Livingston 4.2, pp. 64–70. Geometry does not affect these counts.
import type { Point } from './knot';
import type { SeifertSurface } from './seifert';

export interface BandDisk {
  id: number;
  center: Point;
  radius: number;
}
export interface BandFoot {
  disk: number;
  angle: number;
}
export interface Band {
  id: number;
  feet: [BandFoot, BandFoot];
  halfTwists: number;
  /** Optional outside route, between the two radial attachment leads. */
  route?: Point[];
}
export interface BandSurface {
  disks: BandDisk[];
  bands: Band[];
  /** Which passage (0 or 1) is over at a projected strip crossing. */
  stripOver?: Record<string, 0 | 1>;
}
export interface FootRef {
  band: number;
  foot: 0 | 1;
}
export type BoundaryStep =
  | { kind: 'arc'; disk: number; from: FootRef | null; to: FootRef | null }
  | { kind: 'edge'; band: number; side: 0 | 1 };
export interface BandBoundary {
  disk: number;
  steps: BoundaryStep[];
}
export interface BandPiece {
  disks: number[];
  bands: number[];
  boundary: number;
  chi: number;
  orientable: boolean;
  genus: number | null;
  witness: number[];
}
export interface BandNumbers {
  disks: number;
  bands: number;
  boundary: number;
  chi: number;
  pieces: number;
  orientable: boolean;
  genus: number | null;
  parts: BandPiece[];
  boundaries: BandBoundary[];
}
export const turn = 2 * Math.PI;
export const normalizeAngle = (angle: number) => ((angle % turn) + turn) % turn;

/** Do not let a later band that reuses an id inherit a deleted strip's choices. */
export function deleteBand(surface: BandSurface, id: number): BandSurface {
  return {
    ...surface,
    bands: surface.bands.filter((b) => b.id !== id),
    ...(surface.stripOver
      ? {
          stripOver: Object.fromEntries(
            Object.entries(surface.stripOver).filter(
              ([key]) => !key.split(':').slice(0, 2).map(Number).includes(id),
            ),
          ),
        }
      : {}),
  };
}

export function bandSurface(surface: BandSurface): BandNumbers {
  if (!Array.isArray(surface.disks) || !Array.isArray(surface.bands)) throw new Error('Invalid band lists');
  const diskIds = new Set(surface.disks.map((d) => d.id));
  if (
    diskIds.size !== surface.disks.length ||
    new Set(surface.bands.map((b) => b.id)).size !== surface.bands.length
  )
    throw new Error('Duplicate disk or band');
  if (
    surface.disks.some(
      (d) =>
        !Number.isFinite(d.id) ||
        !Array.isArray(d.center) ||
        d.center.length !== 2 ||
        !d.center.every(Number.isFinite) ||
        !Number.isFinite(d.radius) ||
        d.radius <= 0,
    )
  )
    throw new Error('Invalid disk');
  const feet = new Map(
    surface.disks.map((d) => [d.id, [] as { ref: FootRef; angle: number; port: number }[]]),
  );
  surface.bands.forEach((band, b) => {
    if (
      !Number.isFinite(band.id) ||
      !Number.isSafeInteger(band.halfTwists) ||
      !Array.isArray(band.feet) ||
      band.feet.length !== 2 ||
      (band.route !== undefined &&
        (!Array.isArray(band.route) ||
          band.route.length < 2 ||
          band.route.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))))
    )
      throw new Error('Invalid band');
    band.feet.forEach((foot, f) => {
      if (!diskIds.has(foot.disk) || !Number.isFinite(foot.angle)) throw new Error('Invalid foot');
      feet.get(foot.disk)!.push({
        ref: { band: band.id, foot: f as 0 | 1 },
        angle: normalizeAngle(foot.angle),
        port: 4 * b + 2 * f,
      });
    });
  });
  // In increasing disk-angle order, L precedes the foot and R follows it:
  //        ... R(prev) --- L [ foot ] R --- L(next) ...
  //                  foot 0             foot 1
  // untwisted:          L ---------------- R
  //                     R ---------------- L
  // twisted:            L ---------------- L
  //                     R ---------------- R
  // Disk arcs pair R(i) with L(i+1). The anchors force these band pairs:
  // one untwisted loop has two cycles (annulus); a twisted loop has one (Möbius).
  const adjacency = new Map<number, { to: number; step: BoundaryStep }[]>();
  const connect = (a: number, b: number, step: BoundaryStep) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), { to: b, step }]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), { to: a, step }]);
  };
  const boundaries: BandBoundary[] = [];
  for (const [disk, list] of feet) {
    list.sort((a, b) => a.angle - b.angle);
    if (!list.length) {
      boundaries.push({ disk, steps: [{ kind: 'arc', disk, from: null, to: null }] });
      continue;
    }
    list.forEach((a, i) => {
      const b = list[(i + 1) % list.length];
      if (
        list.length > 1 &&
        (normalizeAngle(b.angle - a.angle) < 1e-9 || turn - normalizeAngle(b.angle - a.angle) < 1e-9)
      )
        throw new Error('Coincident feet');
      connect(a.port + 1, b.port, { kind: 'arc', disk, from: a.ref, to: b.ref });
    });
  }
  surface.bands.forEach((band, b) => {
    for (const side of [0, 1] as const)
      connect(4 * b + side, 4 * b + 2 + (band.halfTwists % 2 !== 0 ? side : 1 - side), {
        kind: 'edge',
        band: band.id,
        side,
      });
  });
  const visited = new Set<number>();
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    let at = start;
    let previous: BoundaryStep | undefined;
    const steps: BoundaryStep[] = [];
    do {
      if (visited.has(at)) throw new Error('Invalid boundary cycle');
      visited.add(at);
      const edge = adjacency.get(at)!.find((e) => e.step !== previous)!;
      steps.push(edge.step);
      previous = edge.step;
      at = edge.to;
    } while (at !== start);
    const first = steps.find((s) => s.kind === 'arc')!;
    if (first.kind !== 'arc') throw new Error('Boundary without a disk');
    boundaries.push({ disk: first.disk, steps });
  }
  const parts: BandPiece[] = [];
  const sides = new Map<number, number>();
  const parents = new Map<number, { disk: number; band: number }>();
  for (const disk of surface.disks) {
    if (sides.has(disk.id)) continue;
    sides.set(disk.id, 0);
    const disks = [disk.id];
    let witness: number[] = [];
    for (let i = 0; i < disks.length; i++) {
      const here = disks[i];
      for (const band of surface.bands) {
        const [a, b] = band.feet;
        const other = a.disk === here ? b.disk : b.disk === here ? a.disk : undefined;
        if (other === undefined) continue;
        const side = sides.get(here)! ^ Number(band.halfTwists % 2 !== 0);
        if (!sides.has(other)) {
          sides.set(other, side);
          parents.set(other, { disk: here, band: band.id });
          disks.push(other);
        } else if (sides.get(other) !== side && !witness.length) {
          // The two tree paths to their common ancestor plus this edge form
          // a cycle with odd twist parity, obstructing every side assignment.
          const path = (v: number) => {
            const nodes = [v],
              edges: number[] = [];
            while (parents.has(v)) {
              const p = parents.get(v)!;
              edges.push(p.band);
              v = p.disk;
              nodes.push(v);
            }
            return { nodes, edges };
          };
          const p = path(here),
            q = path(other);
          const common = p.nodes.findIndex((v) => q.nodes.includes(v));
          witness = [
            ...p.edges.slice(0, common),
            ...q.edges.slice(0, q.nodes.indexOf(p.nodes[common])).reverse(),
            band.id,
          ];
        }
      }
    }
    const bands = surface.bands.filter((b) => disks.includes(b.feet[0].disk)).map((b) => b.id);
    const boundary = boundaries.filter((b) => disks.includes(b.disk)).length;
    const chi = disks.length - bands.length,
      orientable = !witness.length;
    const genus = orientable ? (2 - chi - boundary) / 2 : null;
    if (genus !== null && (!Number.isInteger(genus) || genus < 0)) throw new Error('Invalid band genus');
    parts.push({ disks, bands, boundary, chi, orientable, genus, witness });
  }
  const orientable = parts.every((p) => p.orientable);
  return {
    disks: surface.disks.length,
    bands: surface.bands.length,
    boundary: boundaries.length,
    chi: surface.disks.length - surface.bands.length,
    pieces: parts.length,
    orientable,
    genus: orientable ? parts.reduce((g, p) => g + p.genus!, 0) : null,
    parts,
    boundaries,
  };
}
export function sameSurface(a: BandSurface, b: BandSurface) {
  const A = bandSurface(a),
    B = bandSurface(b);
  if (A.pieces !== 1 || B.pieces !== 1) throw new Error('Comparison requires connected surfaces');
  const comparisons = {
    chi: A.chi === B.chi,
    boundary: A.boundary === B.boundary,
    orientable: A.orientable === B.orientable,
  };
  return { ...comparisons, same: Object.values(comparisons).every(Boolean) };
}

/** Flatten the oriented Seifert disks, keeping the cyclic order of their feet. */
export function seifertBands(S: SeifertSurface): BandSurface {
  const sides = new Map<number, number>();
  for (const circle of S.circles) {
    if (sides.has(circle.id)) continue;
    sides.set(circle.id, 0);
    const queue = [circle.id];
    for (let i = 0; i < queue.length; i++)
      for (const strip of S.strips) {
        const [a, b] = strip.circles,
          other = a === queue[i] ? b : b === queue[i] ? a : undefined;
        if (other === undefined) continue;
        const side = 1 - sides.get(queue[i])!;
        if (!sides.has(other)) {
          sides.set(other, side);
          queue.push(other);
        } else if (sides.get(other) !== side) throw new Error('Seifert graph is not bipartite');
      }
  }
  // Oriented disk boundaries initially give equal-side (untwisted) attachments.
  // Turning over one class of the bipartite Seifert graph reverses its cyclic
  // order, making EVERY crossing a twisted band in the face-up disk convention.
  // Nesting and the crossing's handedness then play no role in the surface type.
  const foot = (crossing: number, circle: number): BandFoot => {
    const c = S.circles[circle];
    const corners = S.corners
      .filter((k) => k.circle === circle)
      .sort((a, b) => c.points.indexOf(a.points[0]) - c.points.indexOf(b.points[0]));
    const index = corners.findIndex((k) => k.crossing === crossing);
    return {
      disk: circle,
      angle: normalizeAngle(((sides.get(circle) ? -1 : 1) * turn * index) / corners.length),
    };
  };
  return {
    disks: S.circles.map((c) => ({ id: c.id, center: [0, 0], radius: 1 })),
    bands: S.strips.map((b) => ({
      id: b.crossing,
      feet: [foot(b.crossing, b.circles[0]), foot(b.crossing, b.circles[1])],
      halfTwists: 1,
    })),
  };
}

/** Migrate old session/example data at the boundary; the live model is signed. */
export function loadBandSurface(value: unknown): BandSurface {
  if (!value || typeof value !== 'object') throw new Error('Invalid band surface');
  const s = value as Record<string, unknown>;
  if (!Array.isArray(s.disks) || !Array.isArray(s.bands) || s.disks.length > 100 || s.bands.length > 500)
    throw new Error('Invalid band lists');
  const surface: BandSurface = {
    disks: s.disks as BandDisk[],
    bands: s.bands.map((value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('Invalid band');
      const b = value as Record<string, unknown>;
      const n = Object.hasOwn(b, 'halfTwists')
        ? b.halfTwists
        : typeof b.twisted === 'boolean'
          ? Number(b.twisted)
          : undefined;
      return {
        id: b.id as number,
        feet: b.feet as [BandFoot, BandFoot],
        halfTwists: n as number,
        ...(b.route === undefined ? {} : { route: b.route as Point[] }),
      };
    }),
  };
  if (s.stripOver !== undefined) {
    if (!s.stripOver || typeof s.stripOver !== 'object' || Array.isArray(s.stripOver))
      throw new Error('Invalid strip crossings');
    if (!Object.values(s.stripOver).every((v) => v === 0 || v === 1))
      throw new Error('Invalid strip crossing choice');
    surface.stripOver = { ...(s.stripOver as Record<string, 0 | 1>) };
  }
  bandSurface(surface);
  return surface;
}
