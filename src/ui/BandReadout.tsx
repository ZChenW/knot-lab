import { SurfaceComparison } from './SurfaceComparison';
import { Fragment, useMemo, type Dispatch, type ReactNode } from 'react';
import { bandSurface } from '../core/bands';
import { bandLines, bandsLatex } from '../core/band-readout';
import { labelColor } from '../core/diagram';
import type { Action, Hot, State } from '../state/store';
import { useT } from '../i18n/useT';
import { writeClipboard } from '../platform/clipboard';
import { KnotPicker } from './KnotPicker';
import { Tip } from './Tip';
import { FAMILY_DEFAULTS } from '../core/families';
const formula = (value: string) =>
  value.split(/([dnBkgS])/).map((part, i) => (/^[dnBkgS]$/.test(part) ? <i key={i}>{part}</i> : part));
export function BandReadout({
  state,
  dispatch,
  setHot,
}: {
  state: State;
  dispatch: Dispatch<Action>;
  setHot: (hot: Hot) => void;
}) {
  const t = useT(),
    board = state.bandBoard!;
  const numbers = useMemo(() => bandSurface(board.surface), [board.surface]);
  const copy = async (value: string) => {
    try {
      await writeClipboard(value);
      dispatch({ type: 'status', value: t('status.latexCopied') });
    } catch (error) {
      dispatch({
        type: 'status',
        value: t('status.copyFailure', { reason: error instanceof Error ? error.message : String(error) }),
      });
    }
  };
  const term = (text: ReactNode, tip: string, mark: Hot = {}) => (
    <Tip text={tip}>
      <span
        className="term"
        tabIndex={0}
        onMouseEnter={() => setHot(mark)}
        onMouseLeave={() => setHot({})}
        onFocus={() => setHot(mark)}
        onBlur={() => setHot({})}
      >
        {text}
      </span>
    </Tip>
  );
  return (
    <aside className="side band-side" aria-label={t('readout.label')} onMouseLeave={() => setHot({})}>
      <SurfaceComparison state={state} dispatch={dispatch} />
      <header className="head">
        <KnotPicker
          value={state.preset}
          onTriangle={(key) => {
            setHot({});
            dispatch({ type: 'triangle-example', key });
          }}
          bandBoard={board}
          onBand={(key) => {
            setHot({});
            dispatch({ type: 'band-example', key });
          }}
          components={0}
          onChange={(key) => {
            setHot({});
            dispatch({ type: 'preset', key });
          }}
          onFamily={(kind) => {
            setHot({});
            dispatch({ type: 'family', family: { kind, params: FAMILY_DEFAULTS[kind] } });
          }}
        />
        <p className="meta">
          {numbers.bands} {numbers.bands === 1 ? 'band' : 'bands'} ·{' '}
          {numbers.orientable ? 'orientable' : 'non-orientable'}
        </p>
      </header>
      <section className="matrix-section bands-block" data-kind="bands" aria-label="Disks with bands">
        <div className="matrix-heading">
          <h2>{term('Disks with bands', t('bands.blockTip'))}</h2>
          <Tip text={t('matrix.copyTip')}>
            <button className="ghost latex-copy" onClick={() => copy(bandsLatex(numbers))}>
              LaTeX
            </button>
          </Tip>
          <Tip text={t('bands.drawBoundaryTip')}>
            <button
              className="ghost band-boundary-action"
              data-band-boundary
              aria-disabled={!numbers.disks}
              onClick={() => {
                if (numbers.disks) {
                  setHot({});
                  dispatch({ type: 'band-boundary' });
                }
              }}
            >
              {t('bands.drawBoundary')}
            </button>
          </Tip>
          <span className="m matrix-result">
            {numbers.genus !== null ? (
              <>
                <i>g</i> = {numbers.genus}
              </>
            ) : (
              <>
                <i>B</i> = {numbers.boundary}
              </>
            )}
          </span>
        </div>
        <dl className="read seifert-read band-read">
          {bandLines(numbers).map((line) => {
            const mark: Hot =
              line.key === 'bands'
                ? { bandIds: board.surface.bands.map((b) => b.id) }
                : 'witness' in line && line.witness?.length
                  ? { bandIds: line.witness }
                  : {};
            const tip = line.key.startsWith('orientation:')
              ? 'bands.orientationTip'
              : line.key.startsWith('genus:')
                ? 'bands.genusTip'
                : (`bands.${line.key}Tip` as 'bands.disksTip');
            return (
              <Fragment key={line.key}>
                {'label' in line && (
                  <dt
                    data-band-hover={line.key === 'bands' ? 'bands' : undefined}
                    onMouseEnter={() => setHot(mark)}
                    onMouseLeave={() => setHot({})}
                  >
                    {term(line.label, t(tip), mark)}
                  </dt>
                )}
                <dd
                  className={'label' in line ? undefined : 'wide'}
                  data-band-value={line.key}
                  onMouseEnter={() => setHot(mark)}
                  onMouseLeave={() => setHot({})}
                >
                  {'label' in line
                    ? formula(line.value)
                    : term(
                        line.key.startsWith('orientation:') ? line.value : formula(line.value),
                        t(tip),
                        mark,
                      )}
                  {line.key === 'boundary' && (
                    <span className="band-chips">
                      {numbers.boundaries.map((_, i) => (
                        <Tip key={i} text={t('bands.boundaryChip', { n: i + 1 })}>
                          <button
                            className="band-chip"
                            data-boundary-chip={i}
                            aria-label={t('bands.boundaryChip', { n: i + 1 })}
                            style={{ color: labelColor(i, Math.max(1, numbers.boundary)) }}
                            onMouseEnter={() => setHot({ bandBoundary: i })}
                            onMouseLeave={() => setHot({})}
                            onFocus={() => setHot({ bandBoundary: i })}
                            onBlur={() => setHot({})}
                          >
                            <span />
                          </button>
                        </Tip>
                      ))}
                    </span>
                  )}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      </section>
    </aside>
  );
}
