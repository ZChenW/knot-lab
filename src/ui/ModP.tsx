import { useT } from '../i18n/useT';
import { Fragment, type Dispatch } from 'react';
import { labelingIndex, type Analysis, type PInfo } from '../core/knot';
import { labelColor } from '../core/diagram';
import { type Action, type Hot, type ReadoutData, type State } from '../state/store';
import { Xi } from './format';
import { Tip } from './Tip';
interface Props {
  state: State;
  D: Analysis;
  data: ReadoutData;
  info: PInfo | null;
  labels: number[] | null;
  dispatch: Dispatch<Action>;
  setHot: (h: Hot) => void;
  hot?: Hot;
}
export function ModP({ state, D, data, info, labels, dispatch, setHot, hot = {} }: Props) {
  const t = useT();
  const p = state.p;
  const noOddPrime = data.answer.startsWith('Not ');
  const choices = (
    <>
      {data.chips
        .filter((q) => q.p !== 2)
        .map((q) => (
          <button
            key={q.p}
            className={`chip${q.divides ? ' div' : ''}`}
            aria-pressed={!!info?.colorable && q.p === data.selectedP}
            title={t('readout.divides', { p: q.p })}
            onClick={() => dispatch({ type: 'p', value: q.p })}
          >
            {q.p}
          </button>
        ))}
      {data.largePrimes.map((q) => (
        <Fragment key={String(q)}>
          {' '}
          <span>{String(q)}</span>
        </Fragment>
      ))}
      {data.chips.some((q) => q.p === 2) && D.det !== 0n && (
        <button
          className="chip div"
          aria-pressed={!!info?.colorable && p === 2}
          title={t('readout.divides', { p: 2 })}
          onClick={() => dispatch({ type: 'p', value: 2 })}
        >
          2
        </button>
      )}
      {!noOddPrime && (
        <Tip text={t('readout.tryTip')}>
          <input
            className="p-field"
            id="p"
            type="number"
            min={2}
            step={1}
            inputMode="numeric"
            aria-label={t('readout.tryLabel')}
            placeholder="p"
            value={state.tryP}
            onChange={(e) => dispatch({ type: 'try-p', value: e.target.value })}
          />
        </Tip>
      )}
    </>
  );
  return (
    <section>
      <dl className="read mod-p">
        <dt>
          <i>p</i>-colorable
        </dt>
        <dd className="p-options">
          {D.det === 0n && (
            <span className="p-line">
              every <i>p</i>
            </span>
          )}
          {noOddPrime && (
            <>
              <span>no odd prime</span>
              <span className="aside p-reason">
                det = {String(D.det)}
                {data.composite && (
                  <>
                    {' = '}
                    {data.factors.factors.map((q, i) => (
                      <Fragment key={String(q.p)}>
                        {i > 0 && ' · '}
                        {String(q.p)}
                        {q.e > 1 && <sup>{q.e}</sup>}
                      </Fragment>
                    ))}
                  </>
                )}
              </span>
            </>
          )}
          {D.det === 0n ? (
            <span className="p-line">
              <button
                className="chip div"
                aria-pressed={!!info?.colorable && p === 2}
                title={t('readout.divides', { p: 2 })}
                onClick={() => dispatch({ type: 'p', value: 2 })}
              >
                2
              </button>
              {choices}
            </span>
          ) : noOddPrime && data.chips.length ? (
            <span className="p-even">{choices}</span>
          ) : (
            choices
          )}
        </dd>
        {(state.tryP !== '' || info?.colorable) && (
          <>
            {state.tryP !== '' && !info ? (
              <>
                <dt />
                <dd className="p-detail quiet">{t('readout.prime')}</dd>
              </>
            ) : state.tryP !== '' && info && !info.colorable ? (
              <>
                <dt>mod {p}</dt>
                <dd className="p-detail">
                  not colorable
                  <span className="aside">
                    det = {String(D.det)} ≢ 0 (mod {p})
                  </span>
                </dd>
              </>
            ) : info?.colorable ? (
              <>
                <dt>
                  <Tip text={t('readout.rankTip', { p })}>
                    <span className="term" tabIndex={0}>
                      rank<sub>{p}</sub>
                    </span>
                  </Tip>
                </dt>
                <dd className="p-detail">{info.rank}</dd>
                <dt>
                  <Tip text={t('readout.labelingsTip', { p })}>
                    <span className="term" tabIndex={0}>
                      labelings
                    </span>
                  </Tip>
                </dt>
                <dd className="p-detail p-labelings">
                  <span className="labeling-count">{String(info.count)}</span>
                  <span className="labeling-formula">
                    <span className="aside">
                      = {p}({p}
                      <sup>{info.rank}</sup> − 1)
                    </span>
                  </span>
                  {info.count > 9999n ? (
                    <button className="ghost" onClick={() => dispatch({ type: 'relabel' })}>
                      {t('readout.another')}
                    </button>
                  ) : (
                    <span className="label-stepper">
                      <Tip text={t('readout.previousLabeling')}>
                        <button
                          className="ghost"
                          aria-label={t('readout.previousLabeling')}
                          onClick={() => dispatch({ type: 'label-step', delta: -1 })}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                            <path d="m9 3-4 4 4 4" />
                          </svg>
                        </button>
                      </Tip>
                      <span className="label-position">
                        {String(labelingIndex(info, state.coeffs, state.shift) + 1n)} / {String(info.count)}
                      </span>
                      <Tip text={t('readout.nextLabeling')}>
                        <button
                          className="ghost"
                          aria-label={t('readout.nextLabeling')}
                          onClick={() => dispatch({ type: 'label-step', delta: 1 })}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                            <path d="m5 3 4 4-4 4" />
                          </svg>
                        </button>
                      </Tip>
                    </span>
                  )}
                </dd>
                <dd className="wide">
                  <div className="labs" onMouseLeave={() => setHot({})}>
                    {labels?.map((v, i) => (
                      <span
                        key={i}
                        className={`lab${hot.arc === i ? ' hot-column' : ''}`}
                        data-arc={i}
                        onMouseEnter={() => setHot({ arc: i })}
                      >
                        <span className="sw" style={{ background: labelColor(v, p) }} />
                        <span>
                          <Xi i={i} /> = {v}
                        </span>
                      </span>
                    ))}
                  </div>
                </dd>
              </>
            ) : null}
          </>
        )}
      </dl>
    </section>
  );
}
