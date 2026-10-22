import { useMemo } from 'react';
import type { compareBandBoundaries } from '../core/band-compare';
import { contentBox, diagramGeometry } from '../core/diagram';
import { Polynomial, fmtInt } from './format';
import { Tip } from './Tip';
import { useT } from '../i18n/useT';
import type { Analysis } from '../core/knot';
import type { ComparisonValue } from '../core/compare';
import { SurfaceComparisonTable } from './SurfaceComparisonTable';

type BoundaryComparison = ReturnType<typeof compareBandBoundaries>;
function Value({ value }: { value: ComparisonValue }) {
  return value === null ? '—' : Array.isArray(value) ? <Polynomial p={value} /> : fmtInt(value);
}
function Thumbnail({
  D,
  diagram,
  name,
}: {
  D: Analysis;
  diagram: BoundaryComparison['beforeDiagram'];
  name: string;
}) {
  const box = contentBox(diagram.comps, false),
    unit = Math.max((box.w + 24) / 132, (box.h + 24) / 99);
  const paths = useMemo(() => diagramGeometry(D, unit).arcs, [D, unit]);
  return (
    <figure>
      <svg
        width={132}
        height={99}
        viewBox={`${box.x - 12 * unit} ${box.y - 12 * unit} ${box.w + 24 * unit} ${box.h + 24 * unit}`}
        role="img"
        aria-label={name}
      >
        {paths.map((a) => (
          <path key={a.id} d={a.path} fill="none" stroke="var(--ink)" strokeWidth={2.5 * unit} />
        ))}
      </svg>
    </figure>
  );
}
export function BandBoundaryComparison({ comparison }: { comparison: BoundaryComparison }) {
  const t = useT(),
    differs = comparison.rows.some((r) => r.status === 'changed'),
    verdictTip = t(differs ? 'comparison.boundariesDiffer' : 'comparison.boundariesUnknown');
  return (
    <div className="band-boundary-comparison" data-boundary-comparison>
      <div className="surface-comparison-heading">
        <h3>
          <Tip text={t('bands.boundaryComparisonTip')}>
            <span className="term" tabIndex={0}>
              boundary
            </span>
          </Tip>
        </h3>
        <Tip text={verdictTip}>
          <span className="comparison-result" tabIndex={0} aria-label={verdictTip} data-boundary-verdict>
            ∂<i>S</i> {differs ? '≠' : '?'} ∂<i>T</i>
          </span>
        </Tip>
      </div>
      <div className="band-boundary-thumbs comparison-pictures">
        <Thumbnail D={comparison.before} diagram={comparison.beforeDiagram} name="∂S" />
        <Thumbnail D={comparison.after} diagram={comparison.afterDiagram} name="∂T" />
      </div>
      <SurfaceComparisonTable boundary>
        {comparison.rows.map((row) => (
          <tr
            key={row.key}
            data-key={row.key}
            data-verdict={
              row.status === 'uncomputed' ? 'uncomputed' : row.status === 'same' ? 'same' : 'differs'
            }
          >
            <th scope="row">
              {row.key === 'boundaryAlex' ? (
                <>
                  Δ(<i>t</i>)
                </>
              ) : (
                row.label
              )}
            </th>
            <td>
              <Value value={row.before} />
            </td>
            <td className="comparison-sign">
              {row.status === 'uncomputed' ? '—' : row.status === 'same' ? '=' : '≠'}
            </td>
            <td>
              <Value value={row.after} />
            </td>
          </tr>
        ))}
      </SurfaceComparisonTable>
    </div>
  );
}
