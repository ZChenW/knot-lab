import { isPrime, pInfo, pNormalize, type Analysis, type Poly } from './knot';
import type { MoveKind } from './moves';
import { seifertNumbers } from './seifert';
import { sameValue } from './table-shared';

// 24.T: intrinsic surface data, independent of a disk/band or triangle model.
export interface SurfaceNumbers {
  chi: number;
  boundary: number;
  orientable: boolean;
  pieces: number;
}
export function compareSurfaces(a: SurfaceNumbers, b: SurfaceNumbers) {
  if (a.pieces !== 1 || b.pieces !== 1) return null;
  const rows = [
    { key: 'chi', label: 'χ', a: String(a.chi).replace('-', '−'), b: String(b.chi).replace('-', '−') },
    { key: 'boundary', label: 'B', a: String(a.boundary), b: String(b.boundary) },
    {
      key: 'orientable',
      label: 'orientable',
      a: a.orientable ? 'yes' : 'no',
      b: b.orientable ? 'yes' : 'no',
    },
  ].map((row) => ({ ...row, same: row.a === row.b }));
  return { rows, same: rows.every((row) => row.same) };
}

export interface AlexanderUnit {
  sign: 1 | -1;
  exponent: number;
}
export type ComparisonValue = number | bigint | Poly | null;
export interface ComparisonRow {
  key: string;
  label: string;
  before: ComparisonValue;
  after: ComparisonValue;
  status: 'same' | 'changed' | 'unit';
  unit?: AlexanderUnit;
  diagram?: boolean;
}
export interface MoveComparison {
  kind: MoveKind;
  sign?: number;
  before: Analysis;
  after: Analysis;
  rows: ComparisonRow[];
  /** Hover preview of an R3 on the long-reach fallback (20.A). */
  distant?: boolean;
}
const equal = (a: ComparisonValue, b: ComparisonValue) => sameValue(a, b);

// after = before * sign * t^exponent. Negative exponents are Laurent units,
// not a new polynomial convention. Zero has no distinguished unit; choose 1.
export function alexanderUnit(before: Poly | null, after: Poly | null): AlexanderUnit | null {
  if (before === null || after === null) return null;
  if (!before.length || !after.length)
    return !before.length && !after.length ? { sign: 1, exponent: 0 } : null;
  if (!equal(pNormalize(before), pNormalize(after))) return null;
  const a = before.findIndex((v) => v !== 0n),
    b = after.findIndex((v) => v !== 0n);
  return { sign: before[a] * after[b] < 0n ? -1 : 1, exponent: b - a };
}
export function compareAnalyses(before: Analysis, after: Analysis, p: number): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const row = (key: string, label: string, a: ComparisonValue, b: ComparisonValue) =>
    rows.push({ key, label, before: a, after: b, status: equal(a, b) ? 'same' : 'changed' });
  row('crossings', 'crossings', before.crossings.length, after.crossings.length);
  row('strands', 'strands', before.nArcs, after.nArcs);
  row('writhe', 'writhe', before.writhe, after.writhe);
  row('surfaceGenus', 'g(S)', seifertNumbers(before).genus, seifertNumbers(after).genus);
  rows.at(-1)!.diagram = true;
  row('det', 'det', before.det, after.det);
  row('alexRaw', 'det A″', before.alexRaw, after.alexRaw);
  const raw = rows.at(-1)!,
    unit = alexanderUnit(before.alexRaw, after.alexRaw);
  if (unit) {
    raw.unit = unit;
    if (raw.status !== 'same') raw.status = 'unit';
  }
  row('alex', 'Δ(t)', before.alex, after.alex);
  const info = (D: Analysis) =>
    !isPrime(p) ? { rank: null, count: null } : D.nArcs ? pInfo(D, p) : { rank: 0, count: 0n };
  const a = info(before),
    b = info(after);
  row('rank', `rank${p}`, a.rank, b.rank);
  row('labelings', 'labelings', a.count, b.count);
  const pairs = new Set([...before.pairs, ...after.pairs].map((q) => `${q.i}:${q.j}`));
  for (const key of pairs) {
    const [i, j] = key.split(':').map(Number);
    row(
      `lk:${key}`,
      `lk(K${i + 1}, K${j + 1})`,
      before.pairs.find((q) => q.i === i && q.j === j)?.lk ?? null,
      after.pairs.find((q) => q.i === i && q.j === j)?.lk ?? null,
    );
  }
  if (before.nComps > 2 || after.nComps > 2) row('totalLk', 'lk(L)', before.totalLk, after.totalLk);
  return rows;
}
