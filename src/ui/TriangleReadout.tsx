import { Fragment, useMemo, type Dispatch } from 'react';
import { analyse, barycentric } from '../core/triangulation';
import { triangleLines, triangulationLatex } from '../core/triangle-readout';
import { labelColor } from '../core/diagram';
import { FAMILY_DEFAULTS } from '../core/families';
import type { Action, Hot, State } from '../state/store';
import { useT } from '../i18n/useT';
import { KnotPicker } from './KnotPicker';
import { SurfaceComparison } from './SurfaceComparison';
import { Tip } from './Tip';
import { writeClipboard } from '../platform/clipboard';
export function TriangleReadout({
  state,
  dispatch,
  setHot,
}: {
  state: State;
  dispatch: Dispatch<Action>;
  setHot: (h: Hot) => void;
}) {
  const t = useT(),
    board = state.triangleBoard!,
    numbers = useMemo(() => analyse(board.net), [board.net]);
  const copy = async () => {
    try {
      await writeClipboard(triangulationLatex(numbers, board.delta));
      dispatch({ type: 'status', value: t('status.latexCopied') });
    } catch (error) {
      dispatch({
        type: 'status',
        value: t('status.copyFailure', { reason: error instanceof Error ? error.message : String(error) }),
      });
    }
  };
  const lines = triangleLines(numbers, board.delta);
  return (
    <aside className="side triangle-side" aria-label={t('readout.label')} onMouseLeave={() => setHot({})}>
      <SurfaceComparison state={state} dispatch={dispatch} />
      <header className="head">
        <KnotPicker
          value={state.preset}
          triangleBoard={board}
          components={0}
          onTriangle={(key) => {
            setHot({});
            dispatch({ type: 'triangle-example', key });
          }}
          onBand={(key) => {
            setHot({});
            dispatch({ type: 'band-example', key });
          }}
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
          χ = {String(numbers.chi).replace('-', '−')} ·{' '}
          {numbers.problems.length ? 'not a surface' : numbers.orientable ? 'orientable' : 'non-orientable'}
        </p>
      </header>
      <section className="matrix-section triangle-block" data-kind="triangulation" aria-label={t('tri.menu')}>
        <div className="matrix-heading">
          <h2>
            <Tip text={t('tri.blockTip')}>
              <span className="term" tabIndex={0}>
                Triangulation
              </span>
            </Tip>
          </h2>
          <Tip text={t('matrix.copyTip')}>
            <button className="ghost latex-copy" onClick={copy}>
              LaTeX
            </button>
          </Tip>
          <span className="m matrix-result">χ = {String(numbers.chi).replace('-', '−')}</span>
        </div>
        <dl className="read seifert-read triangle-read">
          {lines.map((line) => {
            const part = line.part === undefined ? undefined : numbers.parts[line.part],
              problems = line.problems?.map((i) => numbers.problems[i]),
              points = [...new Set(problems?.flatMap((p) => (p.point === undefined ? [] : [p.point])))];
            const mark: Hot = problems
              ? {
                  triangleIds: [...new Set(problems.flatMap((p) => p.triangles))],
                  trianglePoint: points[0],
                  trianglePoints: points,
                  triangleEdges: problems.flatMap((p) => (p.edge ? [p.edge] : [])),
                }
              : line.key.startsWith('orientation:') && part?.proof
                ? { triangleIds: part.proof.triangles, triangleEdges: part.proof.edges }
                : {};
            const tip = problems
              ? t('tri.problemTip', { n: problems[0].condition })
              : t(
                  line.key.startsWith('orientation:')
                    ? 'tri.orientationTip'
                    : line.key.startsWith('type:')
                      ? 'tri.typeTip'
                      : line.key.startsWith('boundary:')
                        ? 'bands.boundaryTip'
                        : line.key === 'pieces'
                          ? 'bands.piecesTip'
                          : line.key === 'invalid'
                            ? 'tri.blockTip'
                            : (`tri.${line.key}Tip` as 'tri.chiTip'),
                );
            const events = {
              onMouseEnter: () => setHot(mark),
              onMouseLeave: () => setHot({}),
              onFocus: () => setHot(mark),
              onBlur: () => setHot({}),
            };
            const key = (
              <Tip text={tip}>
                <span className="term" tabIndex={0} {...events}>
                  {line.label ?? line.value}
                </span>
              </Tip>
            );
            return (
              <Fragment key={line.key}>
                {line.label && <dt>{key}</dt>}
                <dd
                  className={line.label ? undefined : 'wide'}
                  data-triangle-value={line.key}
                  onMouseEnter={events.onMouseEnter}
                  onMouseLeave={events.onMouseLeave}
                >
                  {line.label ? line.value : key}
                  {line.key.startsWith('boundary:') && part && (
                    <span className="band-chips">
                      {part.boundary.map((_, i) => {
                        const index = numbers.parts.slice(0, line.part).reduce((s, p) => s + p.B, 0) + i;
                        return (
                          <Tip key={i} text={t('bands.boundaryChip', { n: index + 1 })}>
                            <button
                              className="band-chip"
                              data-triangle-chip={index}
                              aria-label={t('bands.boundaryChip', { n: index + 1 })}
                              style={{ color: labelColor(index, Math.max(1, numbers.B!)) }}
                              onMouseEnter={() => setHot({ triangleBoundary: index })}
                              onMouseLeave={() => setHot({})}
                              onFocus={() => setHot({ triangleBoundary: index })}
                              onBlur={() => setHot({})}
                            >
                              <span />
                            </button>
                          </Tip>
                        );
                      })}
                    </span>
                  )}
                </dd>
              </Fragment>
            );
          })}
        </dl>
        <Tip text={t('tri.subdivideTip')}>
          <button
            className="ghost triangle-barycentric"
            aria-disabled={!board.net.triangles.length}
            onClick={() => {
              if (board.net.triangles.length) {
                setHot({});
                dispatch({ type: 'triangle-edit', net: barycentric(board.net), subdivision: true });
              }
            }}
          >
            {t('tri.subdivide')}
          </button>
        </Tip>
      </section>
    </aside>
  );
}
