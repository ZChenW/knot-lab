import { Fragment, type Dispatch } from 'react';
import { seifertLines, type SeifertNumbers } from '../core/seifert';
import { seifertLatex } from '../core/latex';
import type { Action, Hot } from '../state/store';
import { useT } from '../i18n/useT';
import { writeClipboard } from '../platform/clipboard';
import { Tip } from './Tip';

// Course variables are italic, with upright numbers and parentheses as elsewhere.
export function SurfaceFormula({ value }: { value: string }) {
  return (
    <>
      {value
        .split(/([scBkSgKL])/)
        .map((part, i) => (/^[scBkSgKL]$/.test(part) ? <i key={i}>{part}</i> : part))}
    </>
  );
}
export function Seifert({
  surface,
  dispatch,
  setHot,
}: {
  surface: SeifertNumbers;
  dispatch: Dispatch<Action>;
  setHot: (hot: Hot) => void;
}) {
  const t = useT();
  return (
    <section className="matrix-section seifert-block" data-kind="seifert" aria-label="Seifert">
      <div className="matrix-heading">
        <h2>
          <Tip text={t('surface.blockTip')}>
            <span className="term" tabIndex={0}>
              Seifert
            </span>
          </Tip>
        </h2>
        <Tip text={t('matrix.copyTip')}>
          <button
            className="ghost latex-copy"
            onClick={async () => {
              try {
                await writeClipboard(seifertLatex(surface));
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
        <span className="m matrix-result">
          <i>g</i>(<i>S</i>) = {surface.genus}
        </span>
      </div>
      <dl className="read seifert-read">
        {seifertLines(surface).map((line) => {
          const mark: Hot['surface'] =
            line.key === 'disks' || line.key === 'bands' || line.key === 'boundary' ? line.key : undefined;
          const term = (text: React.ReactNode) => (
            <Tip text={t(`surface.${line.key}Tip`)}>
              <span
                className="term"
                tabIndex={0}
                onFocus={() => setHot(mark ? { surface: mark } : {})}
                onBlur={() => setHot({})}
              >
                {text}
              </span>
            </Tip>
          );
          return (
            <Fragment key={line.key}>
              {line.label && <dt data-surface-hover={mark}>{term(line.label)}</dt>}
              <dd
                className={line.label ? undefined : 'wide'}
                data-seifert-value={line.key}
                data-surface-hover={mark}
              >
                {line.label ? (
                  <SurfaceFormula value={line.value} />
                ) : (
                  term(<SurfaceFormula value={line.value} />)
                )}
              </dd>
            </Fragment>
          );
        })}
      </dl>
    </section>
  );
}
