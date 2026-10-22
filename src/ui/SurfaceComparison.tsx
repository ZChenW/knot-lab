import { useMemo, type Dispatch } from 'react';
import { bandSurface } from '../core/bands';
import { bandGeometry } from '../core/band-geometry';
import { compareBandBoundaries, boundaryRowsLatex } from '../core/band-compare';
import { analyse } from '../core/triangulation';
import { compareSurfaces, type SurfaceNumbers } from '../core/compare';
import type { Action, DiagramState, State } from '../state/store';
import { TrianglePicture } from './TrianglePicture';
import { BandPicture } from './BandPicture';
import { BandBoundaryComparison } from './BandBoundaryComparison';
import { SurfaceComparisonTable } from './SurfaceComparisonTable';
import { diagramTitle } from './Versus';
import { useT } from '../i18n/useT';
import { Tip } from './Tip';
import { writeClipboard } from '../platform/clipboard';
// One surface per side: the triangle board wins, as in surfaceNumbers and the
// thumbnail, so a side's boundary rows never come from a different board.
const bandOf = (d: DiagramState) => (d.triangleBoard ? null : (d.bandBoard ?? null));
export function surfaceNumbers(d: DiagramState): SurfaceNumbers | null {
  if (d.triangleBoard) {
    const s = analyse(d.triangleBoard.net);
    return s.B === null || s.orientable === null
      ? null
      : { chi: s.chi, boundary: s.B, orientable: s.orientable, pieces: s.pieces };
  }
  return d.bandBoard ? bandSurface(d.bandBoard.surface) : null;
}
function SurfaceThumbnail({ diagram, side }: { diagram: DiagramState; side: 'S' | 'T' }) {
  const t = useT(),
    triangle = diagram.triangleBoard,
    band = diagram.bandBoard;
  const geometry = useMemo(() => (band ? bandGeometry(band.surface) : null), [band]);
  const points = triangle?.net.points ?? [],
    xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const box = points.length
    ? {
        x: Math.min(...xs) - 20,
        y: Math.min(...ys) - 20,
        w: Math.max(...xs) - Math.min(...xs) + 40,
        h: Math.max(...ys) - Math.min(...ys) + 40,
      }
    : (geometry?.box ?? { x: 0, y: 0, w: 800, h: 600 });
  const name = triangle
      ? t(triangle.example ? `tri.${triangle.example}` : 'tri.custom')
      : t(band?.example ? `bands.${band.example}` : 'bands.custom'),
    unit = Math.max(box.w / 132, box.h / 99);
  return (
    <figure data-comparison-surface={side}>
      <svg
        width={132}
        height={99}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        role="img"
        aria-label={`${side}: ${name}`}
      >
        {triangle ? (
          <TrianglePicture net={triangle.net} u={unit} monochrome />
        ) : (
          band && <BandPicture surface={band.surface} geometry={geometry!} u={unit} monochrome />
        )}
      </svg>
      <figcaption>{name}</figcaption>
    </figure>
  );
}

export function surfaceComparisonLatex(
  comparison: ReturnType<typeof compareSurfaces>,
  boundaries: ReturnType<typeof compareBandBoundaries> | null,
): string {
  const math = (value: string) => `$${value.replaceAll('−', '-')}$`;
  const rows = comparison?.rows.map((r) => {
    const label = r.key === 'chi' ? '$\\chi$' : r.key === 'boundary' ? '$B$' : r.label;
    return `${label} & ${r.key === 'orientable' ? r.a : math(r.a)} & ${math(r.same ? '=' : '\\ne')} & ${r.key === 'orientable' ? r.b : math(r.b)}`;
  });
  const surface = `\\begin{tabular}{lccc}\n & $S$ & & $T$ \\\\\n${rows?.join(' \\\\\n') ?? ''}\n\\end{tabular}`;
  return boundaries
    ? `${surface}\n\n\\begin{tabular}{lccc}\n & $\\partial S$ & & $\\partial T$ \\\\\n${boundaryRowsLatex(boundaries.rows)}\n\\end{tabular}`
    : surface;
}

export function SurfaceComparison({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const t = useT(),
    pin = state.versus,
    beforeBand = pin ? bandOf(pin.diagram) : null,
    afterBand = bandOf(state);
  const a = useMemo(() => (pin ? surfaceNumbers(pin.diagram) : null), [pin]),
    b = useMemo(() => (pin ? surfaceNumbers(state) : null), [pin, state.bandBoard, state.triangleBoard]);
  const boundaries = useMemo(
    () =>
      beforeBand?.surface.disks.length && afterBand?.surface.disks.length
        ? compareBandBoundaries(beforeBand.surface, afterBand.surface)
        : null,
    [beforeBand, afterBand],
  );
  if (!pin || !(beforeBand || pin.diagram.triangleBoard) || !(afterBand || state.triangleBoard)) return null;
  const comparison = a && b ? compareSurfaces(a, b) : null,
    mixed = pin.diagram.triangleBoard || state.triangleBoard;
  const verdictTip = comparison
    ? t(comparison.same ? 'comparison.sameSurface' : 'comparison.differentSurfaces')
    : t('comparison.surfaceUnknown');
  return (
    <section
      className={`versus band-versus surface-comparison${mixed ? ' triangle-versus' : ''}`}
      aria-label="S vs T"
    >
      <div className="surface-comparison-heading">
        <h2>S vs T</h2>
        <span className="versus-actions comparison-actions">
          <Tip text={t('matrix.copyTip')}>
            <button
              className="ghost comparison-action"
              data-comparison-copy
              onClick={async () => {
                try {
                  await writeClipboard(surfaceComparisonLatex(comparison, boundaries));
                  dispatch({ type: 'status', value: t('status.latexCopied') });
                } catch (error) {
                  dispatch({
                    type: 'status',
                    value: t('status.copyFailure', {
                      reason: error instanceof Error ? error.message : String(error),
                    }),
                  });
                }
              }}
            >
              LaTeX
            </button>
          </Tip>
          <button
            className="ghost comparison-action"
            onClick={() => dispatch({ type: 'versus-swap', title: diagramTitle(state) })}
          >
            {t('versus.swap')}
          </button>
          <button className="ghost comparison-action" onClick={() => dispatch({ type: 'versus-end' })}>
            {t('versus.end')}
          </button>
        </span>
        <Tip text={verdictTip}>
          <span
            className="comparison-result"
            tabIndex={0}
            aria-label={verdictTip}
            data-surface-verdict
            data-band-verdict={beforeBand && afterBand ? '' : undefined}
          >
            <i>S</i> {comparison ? (comparison.same ? '≅' : '≇') : '?'} <i>T</i>
          </span>
        </Tip>
      </div>
      <div className="comparison-pictures">
        <SurfaceThumbnail diagram={pin.diagram} side="S" />
        <SurfaceThumbnail diagram={state} side="T" />
      </div>
      {comparison && (
        <SurfaceComparisonTable>
          {comparison.rows.map((r) => (
            <tr key={r.key} data-key={r.key} data-verdict={r.same ? 'same' : 'differs'}>
              <th scope="row" className={r.key === 'orientable' ? undefined : 'm'}>
                {r.label}
              </th>
              <td>{r.a}</td>
              <td className="comparison-sign">{r.same ? '=' : '≠'}</td>
              <td>{r.b}</td>
            </tr>
          ))}
        </SurfaceComparisonTable>
      )}
      {boundaries && <BandBoundaryComparison comparison={boundaries} />}
    </section>
  );
}
