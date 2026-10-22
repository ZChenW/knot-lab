import { bandSurface, type BandSurface, type BoundaryStep } from './bands';
import { bandGeometry, type BandGeometry, type StripPassage } from './band-geometry';
import { rawCrossings, type Component, type OverMap, type Point } from './knot';

interface EdgeSample extends StripPassage {
  height: number;
  side: 0 | 1;
}
interface Segment {
  start: EdgeSample;
  end: EdgeSample;
}
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Follow exactly the coloured disk arcs and ribbon edges used by BandPicture.
 * Metadata follows each segment even when a boundary walks an edge backwards.
 * It distinguishes local half twists from the four crossings at a strip crossing,
 * including two distant passages of the very same strip.
 */
export function bandBoundaryDiagram(surface: BandSurface, geometry: BandGeometry = bandGeometry(surface)) {
  const sources: (Segment | null)[][] = [];
  const comps: Component[] = bandSurface(surface).boundaries.map((boundary, id) => {
    const paths = boundary.steps.map((step: BoundaryStep) => {
      const points = geometry.boundaryPoints(step).slice();
      const drawing = step.kind === 'edge' ? geometry.drawings.find((d) => d.id === step.band)! : null;
      const samples: (EdgeSample | null)[] = points.map((_, i) =>
        drawing && step.kind === 'edge'
          ? {
              band: step.band,
              side: step.side,
              at: drawing.stations[i],
              height: drawing.heights[step.side][i],
            }
          : null,
      );
      return { points, samples };
    });
    const reverse = (i: number) => {
      paths[i].points.reverse();
      paths[i].samples.reverse();
    };
    if (
      paths.length > 1 &&
      ![paths[1].points[0], paths[1].points.at(-1)!].some((p) => distance(paths[0].points.at(-1)!, p) < 1e-6)
    )
      reverse(0);
    const pts: Point[] = [],
      segments: (Segment | null)[] = [];
    paths.forEach((path, i) => {
      if (i && distance(pts.at(-1)!, path.points[0]) > 1e-6) reverse(i);
      if (i && distance(pts.at(-1)!, path.points[0]) > 1e-6) throw new Error('Band boundary does not join');
      if (!i) pts.push(path.points[0]);
      for (let j = 1; j < path.points.length; j++) {
        const a = path.samples[j - 1],
          b = path.samples[j];
        segments.push(a && b ? { start: a, end: b } : null);
        pts.push(path.points[j]);
      }
    });
    if (distance(pts[0], pts.at(-1)!) > 1e-6) throw new Error('Band boundary is not closed');
    pts.pop(); // Components close implicitly, with the final segment back to pts[0].
    sources.push(segments);
    return { id: id + 1, pts, rev: false };
  });
  const over: OverMap = new Map();
  for (const crossing of rawCrossings(comps)) {
    const sample = (p: typeof crossing.a): EdgeSample | null => {
      const i = Math.floor(p.t),
        segment = sources[p.c][i];
      if (!segment) return null;
      const f = p.t - i;
      return {
        ...segment.start,
        at: segment.start.at * (1 - f) + segment.end.at * f,
        height: segment.start.height * (1 - f) + segment.end.height * f,
      };
    };
    const a = sample(crossing.a),
      b = sample(crossing.b);
    if (!a || !b) throw new Error('A strip crosses a disk boundary');
    const score = (p: StripPassage, q: StripPassage) =>
      p.band === q.band ? Math.abs(p.at - q.at) : Infinity;
    const candidates = geometry.crossings
      .map((c) => {
        const forward = score(a, c.a) + score(b, c.b),
          backward = score(a, c.b) + score(b, c.a);
        return { c, score: Math.min(forward, backward), aIsFirst: forward <= backward };
      })
      .sort((x, y) => x.score - y.score);
    const nearest = candidates[0];
    // At a half twist, both edges have the same station along their ribbon.
    const local = a.band === b.band ? 2 * Math.abs(a.at - b.at) : Infinity;
    if (!nearest || !Number.isFinite(nearest.score) || local < nearest.score) {
      if (a.band !== b.band || a.side === b.side) throw new Error('Unmatched strip crossing');
      over.set(crossing.key, a.height > b.height ? 'a' : 'b');
    } else {
      const aOver = nearest.aIsFirst ? nearest.c.over === 0 : nearest.c.over === 1;
      over.set(crossing.key, aOver ? 'a' : 'b');
    }
  }
  return { comps, over };
}
