import { Fragment } from 'react';
import type { Analysis } from '../core/knot';
import type { Hot, ReadoutData } from '../state/store';
import { Ki, Polynomial, signed, sub } from './format';
import { useT } from '../i18n/useT';
import { compositionDetFactors, compositionFactors, type Composition } from '../core/operations';
import { Tip } from './Tip';
export function Invariants({
  D,
  data,
  setHot,
  pinnedSigns,
  pinSigns,
  composition,
}: {
  D: Analysis;
  data: ReadoutData;
  setHot?: (h: Hot) => void;
  pinnedSigns?: Hot['signs'];
  pinSigns?: (signs: NonNullable<Hot['signs']>) => void;
  composition?: Composition | null;
}) {
  const t = useT();
  const factors = composition ? compositionFactors(composition) : null;
  const detFactors = composition ? compositionDetFactors(composition, data.factors) : [];
  // 14.G
  const signKey = (signs: NonNullable<Hot['signs']>) => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': String(pinnedSigns) === String(signs),
    title: t('readout.pinSigns'),
    onClick: () => pinSigns?.(signs),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) pinSigns?.(signs);
      }
    },
    onFocus: () => setHot?.({ signs }),
    onBlur: () => setHot?.({}),
  });
  return (
    <dl className="read">
      <dt>
        Δ(<i>t</i>)
      </dt>
      <dd className={`poly${data.terms > 4 ? ' long' : ''}`}>
        {composition?.op === 'split' ? (
          <Tip text={t('composition.splitTip')}>
            <span className="term split-zero" tabIndex={0}>
              0
            </span>
          </Tip>
        ) : data.alexValue !== null ? (
          <>
            <Polynomial p={data.alexValue} />
            {data.alexFormula && (
              <Tip text={data.alexFormula.formula}>
                <span className="term formula-mark" tabIndex={0}>
                  {t('readout.formula')}
                </span>
              </Tip>
            )}
          </>
        ) : (
          <span className="aside alex-unavailable">not computed</span>
        )}
      </dd>
      {composition?.op === 'sum' && factors && (
        <>
          <dt />
          <dd className="composition-line" data-composition="alexander">
            {factors.alex.every(({ value }) => value !== null) ? 'Δ = ' : 'Δ factors: '}
            {factors.alex.map(({ value, power }, i) => (
              <Fragment key={i}>
                ({value === null ? 'not computed' : <Polynomial p={value} />})
                {power > 1 && <sup>{power}</sup>}
              </Fragment>
            ))}
          </dd>
        </>
      )}
      <dt>det</dt>
      <dd>
        {String(D.det)}
        {data.composite && (
          <span className="aside">
            ={' '}
            {data.factors.factors.map((q, i) => (
              <Fragment key={String(q.p)}>
                {i > 0 && ' · '}
                {String(q.p)}
                {q.e > 1 && <sup>{q.e}</sup>}
              </Fragment>
            ))}
            {data.factors.rest > 1n && ` · ${data.factors.rest}`}
          </span>
        )}
      </dd>
      {detFactors.length > 0 && (
        <>
          <dt />
          <dd className="composition-line" data-composition="det">
            det ={' '}
            {detFactors.map(({ value, power }, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                {String(value)}
                {power > 1 && <sup>{power}</sup>}
              </Fragment>
            ))}
          </dd>
        </>
      )}
      <dt className="sign-key" data-signs="all" {...signKey('all')}>
        writhe
      </dt>
      <dd data-signs="all" onClick={() => pinSigns?.('all')}>
        {signed(D.writhe)}
      </dd>
      {data.pairs.map((q) => (
        <Fragment key={`${q.i}:${q.j}`}>
          <Tip
            text={q.over
              .map((c) => t('readout.overCounts', { component: sub(c.comp + 1), rh: c.rh, lh: c.lh }))
              .join(' · ')}
          >
            <dt className="sign-key" data-signs={`${q.i},${q.j}`} {...signKey([q.i, q.j])}>
              lk(
              <Ki i={q.i} />, <Ki i={q.j} />)
            </dt>
          </Tip>
          <dd data-signs={`${q.i},${q.j}`} onClick={() => pinSigns?.([q.i, q.j])}>
            {signed(q.lk)}
            <span className="aside">
              ½({q.rh} − {q.lh})
            </span>
          </dd>
        </Fragment>
      ))}
      {D.pairs.length > 1 && (
        <>
          <dt className="sign-key" data-signs="between" {...signKey('between')}>
            lk(<i>L</i>)
          </dt>
          <dd data-signs="between" onClick={() => pinSigns?.('between')}>
            {signed(D.totalLk)}
          </dd>
        </>
      )}
      {data.triple && (
        <>
          <dt>
            <Tip text={t('readout.tripleTip')}>
              <span className="term" tabIndex={0}>
                <i>I</i>
              </span>
            </Tip>
          </dt>
          <dd className="triple-product">
            {signed(data.triple.value)}
            <span className="aside">
              = {data.triple.factors.map((v) => (v < 0 ? `(${signed(v)})` : String(v))).join(' · ')}
            </span>
            <span className="aside triple-definition">
              = lk<sub>12</sub> · lk<sub>23</sub> · lk<sub>31</sub>
            </span>
          </dd>
        </>
      )}
    </dl>
  );
}
