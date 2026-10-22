import type { BandSurface } from './bands';
import { bandBoundaryDiagram } from './band-boundary';
import { analyzeDiagram } from './knot';
import type { ComparisonRow, ComparisonValue } from './compare';
import { sameValue } from './table-shared';
import { polyLatex } from './latex';

export interface BandBoundaryRow extends Omit<ComparisonRow, 'status'> {
  status: 'same' | 'changed' | 'uncomputed';
}

/** Boundary invariants describe the embedding, never the surface verdict. */
export function compareBandBoundaries(a: BandSurface, b: BandSurface) {
  const beforeDiagram = bandBoundaryDiagram(a),
    afterDiagram = bandBoundaryDiagram(b);
  const before = analyzeDiagram(beforeDiagram),
    after = analyzeDiagram(afterDiagram);
  const rows: BandBoundaryRow[] = [];
  const row = (key: string, label: string, x: ComparisonValue, y: ComparisonValue) =>
    rows.push({
      key,
      label,
      before: x,
      after: y,
      status: x === null || y === null ? 'uncomputed' : sameValue(x, y) ? 'same' : 'changed',
    });
  row('boundaryComponents', 'components', before.nComps, after.nComps);
  row('boundaryDet', 'det', before.det, after.det);
  if (before.nComps === 1 && after.nComps === 1) row('boundaryAlex', 'Δ(t)', before.alex, after.alex);
  return { beforeDiagram, afterDiagram, before, after, rows };
}
export function boundaryRowsLatex(rows: BandBoundaryRow[]): string {
  const value = (v: ComparisonValue) =>
    v === null ? '\\text{—}' : Array.isArray(v) ? polyLatex(v) : String(v);
  return rows
    .map(
      (r) =>
        `${r.key === 'boundaryAlex' ? '$\\Delta(t)$' : r.label} & $${value(r.before)}$ & $${r.status === 'uncomputed' ? '\\text{—}' : r.status === 'same' ? '=' : '\\ne'}$ & $${value(r.after)}$`,
    )
    .join(' \\\\\n');
}
