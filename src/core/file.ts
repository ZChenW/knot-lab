import { t } from '../i18n';
import {
  analyzeDiagram,
  alternatingStates,
  carryOver,
  rawCrossings,
  type Component,
  type OverMap,
  type Point,
} from './knot';
import { validMinor, type MinorChoice } from './minors';

export interface FileDiagram {
  comps: Component[];
  over: OverMap;
  p: number;
  surfaceOn?: boolean;
  // 19.A: the pinned diagram K of a comparison; optional, the version is unchanged.
  versus?: { diagram: { comps: Component[]; over: OverMap }; title: string } | null;
  minor?: MinorChoice;
}
type StoredCrossing = [number, number, number, number, 'a' | 'b'];
const incomplete = () => new Error(t('files.incomplete'));
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const index = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const point = (value: unknown): value is Point =>
  Array.isArray(value) && value.length === 2 && value.every(finite);

function separateRoundedVertices(comps: Component[], entries: StoredCrossing[]) {
  const vertices = new Map<string, { c: number; v: number }[]>();
  comps.forEach((c, ci) =>
    c.pts.forEach(([x, y], v) => {
      const key = `${x}:${y}`;
      const group = vertices.get(key) ?? [];
      group.push({ c: ci, v });
      vertices.set(key, group);
    }),
  );
  for (const group of vertices.values()) {
    if (group.length !== 2) continue;
    const [a, b] = group;
    const n = comps[a.c].pts.length,
      m = comps[b.c].pts.length;
    const ai = (a.v + n - 1) % n,
      bj = (b.v + m - 1) % m;
    if (a.c === b.c && (a.v === bj || b.v === ai)) continue;
    const tangent = (c: number, v: number): Point => {
      const pts = comps[c].pts,
        len = pts.length;
      const prev = pts[(v + len - 1) % len],
        next = pts[(v + 1) % len];
      const dx = next[0] - prev[0],
        dy = next[1] - prev[1],
        size = Math.hypot(dx, dy) || 1;
      return [dx / size, dy / size];
    };
    const ta = tangent(a.c, a.v),
      tb = tangent(b.c, b.v);
    if (Math.abs(ta[0] * tb[1] - ta[1] * tb[0]) < 1e-8) continue;
    const saved = entries.find(
      ([c, i, d, j]) => c === a.c && d === b.c && (i === ai || i === a.v) && (j === bj || j === b.v),
    );
    // Two-decimal rounding can collapse a transverse crossing onto two vertices.
    // Lift each vertex by a subpixel epsilon along its tangent, keeping the crossing
    // inside its saved segments (or the outgoing segments when no entry exists).
    // This preserves the legacy half-open segment convention without altering core math.
    for (const [vertex, t, incoming] of [
      [a, ta, saved?.[1] === ai],
      [b, tb, saved?.[3] === bj],
    ] as const) {
      const p = comps[vertex.c].pts[vertex.v],
        step = incoming ? 1e-7 : -1e-7;
      comps[vertex.c].pts[vertex.v] = [p[0] + step * t[0], p[1] + step * t[1]];
    }
  }
}

export function serialize(diagram: FileDiagram): string {
  if (!Number.isFinite(diagram.p)) throw new Error(t('files.saveFailure', { reason: t('files.validP') }));
  const size = diagram.minor ? analyzeDiagram(diagram).nArcs : 0;
  if (diagram.minor && !validMinor(diagram.minor, size)) throw incomplete();
  const chosen = diagram.minor && (diagram.minor.row !== size - 1 || diagram.minor.column !== size - 1);
  const entries: StoredCrossing[] = rawCrossings(diagram.comps).map((r) => {
    const [, i, , j] = r.key.split(':').map(Number);
    return [r.a.c, i, r.b.c, j, diagram.over.get(r.key) ?? 'a'];
  });
  const comps = diagram.comps.map((c) => ({
    ...c,
    pts: c.pts.map((p): Point => [Number(p[0].toFixed(2)), Number(p[1].toFixed(2))]),
  }));
  separateRoundedVertices(comps, entries);
  // Rounding can move a crossing across a vertex. Store its rounded segment keys
  // with the same physical passage on top, rather than losing it as a stale entry.
  const over = carryOver(diagram, comps);
  const rounded = rawCrossings(comps);
  // Two-decimal coordinates can create or erase crossings in a tight drawing.
  // Refuse that save rather than silently persist a different knot or link.
  if (rounded.length !== entries.length)
    throw new Error(t('files.saveFailure', { reason: t('files.roundingCrossings') }));
  const crossings: StoredCrossing[] = rounded.map((r) => {
    const [, i, , j] = r.key.split(':').map(Number);
    return [r.a.c, i, r.b.c, j, over.get(r.key)!];
  });
  const versus = diagram.versus
    ? {
        title: diagram.versus.title,
        diagram: JSON.parse(serialize({ ...diagram.versus.diagram, p: diagram.p })) as unknown,
      }
    : null;
  return JSON.stringify({
    format: 'knot-lab',
    version: 1,
    p: diagram.p,
    components: diagram.comps.map((c) => ({
      points: c.pts.map((p) => p.map((v) => Number(v.toFixed(2)))),
      reversed: !!c.rev,
    })),
    crossings,
    ...(versus ? { versus } : {}),
    // Omitting the default keeps version-1 files byte-stable on a round trip.
    ...(chosen ? { minor: diagram.minor } : {}),
    ...(diagram.surfaceOn ? { surface: true } : {}),
  });
}

export function parse(text: string): FileDiagram {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t('files.notKnot'));
  }
  if (!record(data) || data.format !== 'knot-lab') throw new Error(t('files.notKnot'));
  if (finite(data.version) && data.version > 1) throw new Error(t('files.newer'));
  if (
    data.version !== 1 ||
    !finite(data.p) ||
    !Array.isArray(data.components) ||
    !Array.isArray(data.crossings) ||
    (data.surface !== undefined && typeof data.surface !== 'boolean')
  ) {
    throw incomplete();
  }
  // IDs are local to the replacement diagram; none of the saved IDs are reused.
  const comps: Component[] = data.components.map((c: unknown, i: number) => {
    if (
      !record(c) ||
      typeof c.reversed !== 'boolean' ||
      !Array.isArray(c.points) ||
      c.points.length < 3 ||
      !c.points.every(point)
    ) {
      throw incomplete();
    }
    return { id: i + 1, pts: c.points.map((p: Point) => [...p]), rev: c.reversed };
  });
  const stored: OverMap = new Map();
  const entries: StoredCrossing[] = [];
  for (const entry of data.crossings) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 5 ||
      !entry.slice(0, 4).every(index) ||
      (entry[4] !== 'a' && entry[4] !== 'b')
    ) {
      throw incomplete();
    }
    const [a, i, b, j, over] = entry as StoredCrossing;
    entries.push([a, i, b, j, over]);
    // Well-formed entries for geometry that no longer exists are discarded below.
    stored.set(`${comps[a]?.id}:${i}:${comps[b]?.id}:${j}`, over);
  }
  separateRoundedVertices(comps, entries);
  const raw = rawCrossings(comps);
  const alt = alternatingStates(comps, raw);
  const over: OverMap = new Map(raw.map((r) => [r.key, stored.get(r.key) ?? alt.get(r.key)!]));
  let minor: MinorChoice | undefined;
  if (data.minor !== undefined) {
    const size = analyzeDiagram({ comps, over }).nArcs;
    if (
      !record(data.minor) ||
      !finite(data.minor.row) ||
      !finite(data.minor.column) ||
      !validMinor({ row: data.minor.row, column: data.minor.column }, size)
    )
      throw incomplete();
    minor = { row: data.minor.row, column: data.minor.column };
  }
  // 19.A
  let versus: FileDiagram['versus'];
  if (data.versus !== undefined) {
    const v = data.versus;
    if (!record(v) || typeof v.title !== 'string' || !record(v.diagram)) throw incomplete();
    const pinned = parse(JSON.stringify(v.diagram));
    if (!pinned.comps.length) throw incomplete();
    versus = { diagram: { comps: pinned.comps, over: pinned.over }, title: v.title };
  }
  return {
    comps,
    over,
    p: data.p,
    ...(data.surface === undefined ? {} : { surfaceOn: data.surface as boolean }),
    ...(minor ? { minor } : {}),
    ...(versus ? { versus } : {}),
  };
}
