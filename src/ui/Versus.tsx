// 19.A: the Versus block — the pinned diagram K against the current diagram J.
import { useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { useT } from '../i18n/useT';
import { analyzeDiagram } from '../core/knot';
import { primesFor, thumbnail, verdict, versus, versusLatex, versusSign } from '../core/versus';
import type { Action, State } from '../state/store';
import { compositionTitle, examples, familyTitle } from './KnotPicker';
import { Tip } from './Tip';
import { Polynomial, fmtInt, sub } from './format';
import type { VersusRow } from '../core/versus';
import { t } from '../i18n';
import { writeClipboard } from '../platform/clipboard';

/** The picker's title of a diagram, as plain text. */
export function diagramTitle(
  s: Pick<State, 'comps' | 'preset' | 'family' | 'composition' | 'bandBoard' | 'triangleBoard'>,
): string {
  if (s.triangleBoard) return t(s.triangleBoard.example ? `tri.${s.triangleBoard.example}` : 'tri.custom');
  if (s.bandBoard) return t(s.bandBoard.example ? `bands.${s.bandBoard.example}` : 'bands.custom');
  if (s.composition) return compositionTitle(s.composition);
  if (s.family) return familyTitle(s.family, s.comps.length);
  const e = examples.find((e) => e.key === s.preset);
  if (!e) return 'Your drawing';
  const sup = (v: string) => v.replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  return `${e.name} ${e.base}${sub(Number(e.index))}${e.power ? sup(e.power) : ''}${e.sum ? ` # 3₁${e.sum === 'square' ? 'ᵐ' : ''}` : ''}`;
}

const sign = versusSign;
// A knot has no linking numbers; elsewhere a missing value was not computed (the 30-strand limit).
const value = (r: VersusRow, side: 'k' | 'j'): ReactNode => {
  const poly = side === 'k' ? r.kPoly : r.jPoly,
    text = r[side];
  if (text === null) return missing(r.key);
  if (poly) return <Polynomial p={poly} />;
  return /^[−-]?\d+$/.test(text) ? fmtInt(BigInt(text.replace('−', '-'))) : text;
};
const missing = (key: string) =>
  key === 'lk' || key === 'triple' ? '—' : <span className="aside">not computed</span>;

export function useVersus(state: State) {
  return useMemo(() => {
    if (
      !state.versus ||
      state.bandBoard ||
      state.triangleBoard ||
      state.versus.diagram.triangleBoard ||
      state.versus.diagram.bandBoard
    )
      return null;
    const K = analyzeDiagram(state.versus.diagram),
      J = analyzeDiagram(state);
    const rows = versus(K, J, primesFor(K, J, state.p));
    return { K, rows, outcome: verdict(rows), thumb: thumbnail(K, state.versus.diagram.comps) };
    // state.p only matters through the primes; the diagrams through their arrays.
  }, [state.versus, state.comps, state.over, state.p, state.bandBoard, state.triangleBoard]);
}

export function Versus({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const t = useT();
  const data = useVersus(state);
  // A Δ(t) row whose polynomials do not fit their columns is set on two lines.
  const table = useRef<HTMLTableElement>(null);
  const [stacked, setStacked] = useState(false);
  const alexRow = data?.rows.find((r) => r.key === 'alex');
  useLayoutEffect(() => {
    const element = table.current;
    if (!element) return;
    const measure = () => {
      const column = element.querySelector<HTMLElement>('thead th:nth-child(2)');
      const widths = [
        ...(element.parentElement ?? element).querySelectorAll<HTMLElement>('.versus-measure > span'),
      ].map((e) => e.getBoundingClientRect().width);
      if (!column) return;
      const room = column.getBoundingClientRect().width;
      setStacked(widths.some((w) => w > room + 0.5));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [alexRow?.k, alexRow?.j, !!data]);
  if (!state.versus || !data) return null;
  const { rows, outcome, thumb } = data;
  const verdictText = (
    <span
      className={`m matrix-result versus-verdict${outcome.row ? '' : ' none'}`}
      tabIndex={outcome.row ? undefined : 0}
    >
      {outcome.text}
    </span>
  );
  return (
    <section className="versus" aria-label="K vs J">
      <div className="matrix-heading versus-heading">
        <h2>K vs J</h2>
        <Tip text={t('matrix.copyTip')}>
          <button
            className="ghost latex-copy"
            onClick={async () => {
              try {
                await writeClipboard(versusLatex(rows));
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
        {outcome.row ? verdictText : <Tip text={t('versus.notDistinguishedTip')}>{verdictText}</Tip>}
      </div>
      <div className="versus-pinned">
        <svg className="versus-thumb" width={132} height={99} viewBox={thumb.viewBox} aria-hidden="true">
          {thumb.paths.map((d, i) => (
            <path key={i} d={d} strokeWidth={thumb.stroke} />
          ))}
        </svg>
        <span className="versus-title">{state.versus.title}</span>
        <span className="versus-actions">
          <button
            className="ghost"
            onClick={() => dispatch({ type: 'versus-swap', title: diagramTitle(state) })}
          >
            {t('versus.swap')}
          </button>
          <button className="ghost" onClick={() => dispatch({ type: 'versus-end' })}>
            {t('versus.end')}
          </button>
        </span>
      </div>
      <table className="versus-table" ref={table}>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">K</th>
            <th scope="col" />
            <th scope="col">J</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pick = r.key.startsWith('rank:') && r.p !== undefined;
            const label = (
              <span>
                {r.key === 'surfaceGenus' ? (
                  <>
                    <i>g</i>(<i>S</i>)
                  </>
                ) : (
                  r.label
                )}
              </span>
            );
            return (
              <tr
                key={r.key}
                data-key={r.key}
                data-verdict={r.verdict ?? 'none'}
                data-stacked={r.key === 'alex' && stacked ? 'true' : undefined}
                className={pick ? 'versus-pick' : undefined}
                {...(pick
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-pressed': state.p === r.p,
                      onClick: () => dispatch({ type: 'p', value: r.p! }),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          dispatch({ type: 'p', value: r.p! });
                        }
                      },
                    }
                  : {})}
              >
                <th scope="row">
                  {r.verdict === 'not-invariant' || r.key === 'lk' ? (
                    <Tip
                      text={t(
                        r.key === 'surfaceGenus'
                          ? 'surface.diagramTip'
                          : r.key === 'lk'
                            ? 'versus.linkingTip'
                            : 'versus.diagramTip',
                      )}
                    >
                      <span className="term" tabIndex={0}>
                        {label}
                      </span>
                    </Tip>
                  ) : (
                    label
                  )}
                </th>
                {r.key === 'alex' && stacked ? (
                  <td colSpan={3} className="versus-stack-cell">
                    <span className="versus-stack">
                      <span className="versus-sign">{sign(r)}</span>
                      <span className="versus-k">{value(r, 'k')}</span>
                      <span className="versus-j">{value(r, 'j')}</span>
                    </span>
                  </td>
                ) : (
                  <>
                    <td>{value(r, 'k')}</td>
                    <td className="versus-sign">{sign(r)}</td>
                    <td>{value(r, 'j')}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {alexRow && (
        <span className="versus-table versus-measure" aria-hidden="true">
          <span>{value(alexRow, 'k')}</span>
          <span>{value(alexRow, 'j')}</span>
        </span>
      )}
    </section>
  );
}
