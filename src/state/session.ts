import { parse, serialize, type FileDiagram } from '../core/file';
import { PRESETS, type PresetKey } from '../core/knot';
import { validFamily, type Family } from '../core/families';
import { loadBandSurface } from '../core/bands';
import { BAND_EXAMPLES, type BandExample } from '../core/band-examples';
import type { BandDocument, TriangleDocument, Versus } from './store';
import { analyse, type Net } from '../core/triangulation';
import { TRIANGLE_EXAMPLES, type TriangleExample } from '../core/triangle-examples';

export interface SessionDiagram extends FileDiagram {
  preset: PresetKey | '';
  family: Family | null;
  triangleBoard?: TriangleDocument | null;
  trianglePin?: Versus | null;
  bandBoard?: BandDocument | null;
  bandPin?: Versus | null;
}
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const SESSION_KEY = 'knot-lab.session';
export function sessionStorage(): SessionStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
export function restoreSession(storage: SessionStorage | null): SessionDiagram | null {
  try {
    const text = storage?.getItem(SESSION_KEY);
    if (!text) return null;
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || !data || Array.isArray(data)) return null;
    const saved = data as Record<string, unknown>;
    if (saved.v !== 1 || typeof saved.file !== 'string' || typeof saved.preset !== 'string') return null;
    if (saved.preset !== '' && !Object.hasOwn(PRESETS, saved.preset)) return null;
    let family: Family | null = null;
    if (saved.family !== null) {
      if (typeof saved.family !== 'object' || !saved.family || Array.isArray(saved.family)) return null;
      const f = saved.family as Record<string, unknown>;
      if (
        (f.kind !== 'torus' && f.kind !== 'twist' && f.kind !== 'pretzel' && f.kind !== 'sum') ||
        !Array.isArray(f.params) ||
        !f.params.every((n: unknown) => typeof n === 'number')
      )
        return null;
      family = { kind: f.kind, params: f.params as number[] };
      if (!validFamily(family) || saved.preset !== '') return null;
    }
    const diagram = parse(saved.file);
    if (!diagram.comps.length && (family || saved.preset)) return null;
    const bandBoard = saved.bandBoard == null ? null : parseBandDocument(saved.bandBoard);
    const triangleBoard = saved.triangleBoard == null ? null : parseTriangleDocument(saved.triangleBoard);
    let trianglePin: Versus | null = null;
    if (saved.trianglePin != null) {
      const pin = saved.trianglePin as Record<string, unknown>;
      if (typeof pin.file !== 'string' || typeof pin.title !== 'string') return null;
      const board = parseTriangleDocument(pin.board),
        pinned = parse(pin.file);
      trianglePin = {
        title: pin.title,
        diagram: {
          ...pinned,
          triangleBoard: board,
          preset: '',
          family: null,
          composition: null,
          minor: pinned.minor ?? { row: 0, column: 0 },
        },
      };
    }
    let bandPin: Versus | null = null;
    if (saved.bandPin != null) {
      const pin = saved.bandPin as Record<string, unknown>;
      if (typeof pin.file !== 'string' || typeof pin.title !== 'string') return null;
      const board = parseBandDocument(pin.board);
      const pinned = parse(pin.file);
      bandPin = {
        title: pin.title,
        diagram: {
          ...pinned,
          bandBoard: board,
          preset: '',
          family: null,
          composition: null,
          minor: pinned.minor ?? { row: 0, column: 0 },
        },
      };
    }
    return {
      ...diagram,
      preset: saved.preset as PresetKey | '',
      family,
      bandBoard,
      bandPin,
      triangleBoard,
      trianglePin,
    };
  } catch {
    return null;
  }
}
export function serializeSession(diagram: SessionDiagram): string {
  // 20.Y: reopening keeps the saved diagram fields, not the last move or its carried labeling.
  const pin = diagram.versus as Versus | null | undefined;
  const bandPin = pin?.diagram.bandBoard
    ? {
        board: pin.diagram.bandBoard,
        title: pin.title,
        file: serialize({ ...pin.diagram, p: diagram.p, versus: null }),
      }
    : null;
  const trianglePin = pin?.diagram.triangleBoard
    ? {
        board: pin.diagram.triangleBoard,
        title: pin.title,
        file: serialize({ ...pin.diagram, p: diagram.p, versus: null }),
      }
    : null;
  return JSON.stringify({
    v: 1,
    file: serialize({ ...diagram, versus: bandPin || trianglePin ? null : diagram.versus }),
    preset: diagram.preset,
    family: diagram.family,
    ...(diagram.bandBoard ? { bandBoard: diagram.bandBoard } : {}),
    ...(bandPin ? { bandPin } : {}),
    ...(diagram.triangleBoard ? { triangleBoard: diagram.triangleBoard } : {}),
    ...(trianglePin ? { trianglePin } : {}),
  });
}
/** A pending write is flushed on pagehide, never on an unrelated hide event. */
export function createSessionWriter(storage: SessionStorage | null, initial: SessionDiagram) {
  let previous = initial,
    pending: SessionDiagram | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const flush = () => {
    cancel();
    if (!pending) return;
    const diagram = pending;
    pending = null;
    try {
      storage?.setItem(SESSION_KEY, serializeSession(diagram));
    } catch {
      /* Storage is optional. */
    }
  };
  return {
    update(diagram: SessionDiagram) {
      if (
        previous.comps === diagram.comps &&
        previous.over === diagram.over &&
        previous.p === diagram.p &&
        previous.preset === diagram.preset &&
        previous.family === diagram.family &&
        previous.minor?.row === diagram.minor?.row &&
        previous.minor?.column === diagram.minor?.column &&
        previous.versus === diagram.versus &&
        previous.surfaceOn === diagram.surfaceOn &&
        previous.bandBoard === diagram.bandBoard &&
        previous.triangleBoard === diagram.triangleBoard
      )
        return;
      previous = diagram;
      pending = diagram;
      cancel();
      timer = setTimeout(flush, 300);
    },
    flush,
    dispose() {
      cancel();
      pending = null;
    },
  };
}

function parseBandDocument(value: unknown): BandDocument {
  if (typeof value !== 'object' || !value) throw new Error('Invalid band document');
  const v = value as Record<string, unknown>;
  if (
    typeof v.example !== 'string' ||
    (v.example !== '' && !BAND_EXAMPLES.includes(v.example as BandExample))
  )
    throw new Error('Invalid band example');
  if (typeof v.surface !== 'object' || !v.surface) throw new Error('Invalid band surface');
  const s = v.surface as Record<string, unknown>;
  if (!Array.isArray(s.disks) || !Array.isArray(s.bands) || s.disks.length > 100 || s.bands.length > 500)
    throw new Error('Invalid band lists');
  // The kernel validates IDs, finite geometry, referenced disks, signed twists and
  // distinct feet; malformed shapes throw and restoreSession falls back silently.
  const surface = loadBandSurface(s);
  return { surface, example: v.example as BandExample | '' };
}

// Stored nets may deliberately fail the surface conditions; malformed references
// or unbounded arrays are rejected before the geometry and topology are checked.
function parseTriangleDocument(value: unknown): TriangleDocument {
  if (!value || typeof value !== 'object') throw new Error('Invalid triangle document');
  const v = value as Record<string, unknown>;
  if (
    typeof v.example !== 'string' ||
    (v.example !== '' && !TRIANGLE_EXAMPLES.includes(v.example as TriangleExample))
  )
    throw new Error('Invalid triangle example');
  if (!v.net || typeof v.net !== 'object') throw new Error('Invalid triangle net');
  const n = v.net as Record<string, unknown>;
  if (
    !Array.isArray(n.points) ||
    !Array.isArray(n.triangles) ||
    !Array.isArray(n.gluings) ||
    n.points.length > 5000 ||
    n.triangles.length > 10000 ||
    n.gluings.length > 5000
  )
    throw new Error('Invalid triangle lists');
  const net = n as unknown as Net;
  analyse(net);
  const delta =
    Array.isArray(v.delta) && v.delta.length === 3 && v.delta.every(Number.isInteger)
      ? (v.delta as [number, number, number])
      : null;
  return { net, example: v.example as TriangleExample | '', delta };
}
