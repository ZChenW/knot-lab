// 19.B
import { useMemo, type ReactNode } from 'react';
import {
  integerWorking,
  polynomialWorking,
  workingEntries,
  workingFactors,
  workingFold,
  workingRangeProduct,
  type Working,
  type WorkingStep,
  type WorkingKind,
} from '../core/working';
import type { ChosenMinor } from '../core/minors';
import { type Poly } from '../core/knot';
import { useT } from '../i18n/useT';
import { fmtInt, Polynomial } from './format';
import { Tip } from './Tip';

function WorkingMatrix<T>({ matrix, format }: { matrix: T[][]; format: (v: T) => ReactNode }) {
  const t = useT();
  return matrix.length ? (
    <div className="mxwrap">
      <table className="mx working-matrix">
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{format(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <span className="quiet working-empty">{t('working.empty')}</span>
  );
}
function Derivation<T extends bigint | Poly>({
  work,
  format,
  cellFormat,
  expanded,
  onExpandedChange,
}: {
  work: Working<T>;
  format: (v: T) => ReactNode;
  cellFormat: (v: T) => ReactNode;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const t = useT();
  const { entries, hidden, count } = workingFold(work, expanded);
  const hiddenProduct = hidden
    ? workingRangeProduct(
        workingEntries(work).map((entry) => entry.step),
        3,
        count - 2,
      )
    : null;
  const unitProduct =
    hiddenProduct?.power === 0 && hiddenProduct.value.length === 1 && hiddenProduct.value[0] === 1n;
  const operation = (step: WorkingStep<T>, branch?: { row: number; coefficient: T }) => {
    const op = step.operation;
    switch (op.kind) {
      case 'start':
        return branch ? (
          <>
            {t('working.cofactor', { row: branch.row + 1 })}: ({format(branch.coefficient)}) · det <i>M</i>
          </>
        ) : (
          <>A″</>
        );
      case 'swap':
        return (
          <>
            {op.axis === 'row' ? 'R' : 'C'}
            <sub>{op.a + 1}</sub> ↔ {op.axis === 'row' ? 'R' : 'C'}
            <sub>{op.b + 1}</sub>
          </>
        );
      case 'add':
        return (
          <>
            {op.axis === 'row' ? 'R' : 'C'}
            <sub>{op.target + 1}</sub> ← {op.axis === 'row' ? 'R' : 'C'}
            <sub>{op.target + 1}</sub> + ({format(op.coefficient)})·{op.axis === 'row' ? 'R' : 'C'}
            <sub>{op.source + 1}</sub>
          </>
        );
      case 'scale':
        return (
          <>
            R<sub>{op.row + 1}</sub> ← ({format(op.coefficient)})·R<sub>{op.row + 1}</sub>{' '}
            <span className="via">
              × <i>t</i>
              <sup>{fmtInt(step.multiplierPower)}</sup>
            </span>
          </>
        );
      case 'expand':
        return (
          <>
            {t('working.expand', { column: op.column + 1 })}{' '}
            <span className="via">× ({format(step.multiplier)})</span>
          </>
        );
      case 'evaluate':
        return (
          <>
            det ({format(op.value)}) = {format(op.value)}
          </>
        );
      case 'cofactors':
        return (
          <>
            {t('working.expand', { column: op.column + 1 })}:{' '}
            {op.terms.length
              ? op.terms.map((term, i) => (
                  <span key={term.row}>
                    {i > 0 ? ' + ' : ''}({format(term.coefficient)})·({format(term.working.determinant)})
                  </span>
                ))
              : '0'}
          </>
        );
    }
  };
  const render = (entry: (typeof entries)[number]) => (
    <div className="working-step" data-step={entry.index} data-depth={entry.depth} key={entry.index}>
      <p className="m working-operation">
        {operation(entry.step, entry.branch)}
        {entry.step.operation.kind === 'swap' && <span className="via"> × (−1)</span>}
      </p>
      {entry.step.operation.kind !== 'evaluate' && (
        <WorkingMatrix matrix={entry.step.matrix} format={cellFormat} />
      )}
    </div>
  );
  return (
    <div className="working-derivation">
      {(hidden ? entries.slice(0, 3) : entries).map(render)}
      {hidden > 0 && (
        <button className="ghost working-more" aria-expanded={false} onClick={() => onExpandedChange?.(true)}>
          {t('working.more', { n: hidden })}
          {hiddenProduct && !unitProduct && (
            <span className="working-hidden-product">
              {'  × ('}
              <Polynomial p={hiddenProduct.value} />
              {hiddenProduct.power !== 0 && (
                <>
                  <i>t</i>
                  <sup>{fmtInt(hiddenProduct.power)}</sup>
                </>
              )}
              {')'}
            </span>
          )}
        </button>
      )}
      {hidden > 0 && entries.slice(-2).map(render)}
      {expanded && count > 8 && (
        <button className="ghost working-more" aria-expanded={true} onClick={() => onExpandedChange?.(false)}>
          {t('working.less')}
        </button>
      )}
      <Tip text={t('working.product')}>
        <p className="m working-final working-product" tabIndex={0}>
          {workingFactors(work).map((factor, i) => (
            <span key={i}>
              {i > 0 ? ' · ' : ''}
              {factor.power ? (
                <>
                  <i>t</i>
                  <sup>{fmtInt(factor.power)}</sup>
                </>
              ) : (
                <>({format(factor.value)})</>
              )}
            </span>
          ))}
          {' = '}
          {format(work.determinant)}
        </p>
      </Tip>
    </div>
  );
}
export function MatrixWorking({
  minor,
  kind,
  onKind,
  expanded = false,
  onExpandedChange,
}: {
  minor: ChosenMinor;
  kind: WorkingKind;
  onKind: (kind: WorkingKind) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const t = useT();
  const work = useMemo(
    () =>
      kind === 'coloring'
        ? integerWorking(minor.A)
        : minor.alexRaw === null
          ? null
          : polynomialWorking(minor.AT),
    [minor, kind],
  );
  const integer = (v: bigint) => fmtInt(v);
  const polynomial = (v: Poly) => <Polynomial p={v} />;
  const zero = (
    <span className="matrix-zero" aria-label="0">
      ·
    </span>
  );
  return (
    <div className="working-body">
      <div className="working-switch" role="group" aria-label={t('working.matrix')}>
        {(['coloring', 'alexander'] as const).map((k) => (
          <button key={k} className="ghost" aria-pressed={kind === k} onClick={() => onKind(k)}>
            {k === 'coloring' ? 'Coloring' : 'Alexander'}
          </button>
        ))}
      </div>
      {!work ? (
        <p className="quiet">{t('matrix.limit')}</p>
      ) : kind === 'coloring' ? (
        <Derivation
          key={`coloring-${minor.choice.row}-${minor.choice.column}`}
          work={work as Working<bigint>}
          format={integer}
          cellFormat={(v) => (v === 0n ? zero : integer(v))}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
        />
      ) : (
        <Derivation
          key={`alexander-${minor.choice.row}-${minor.choice.column}`}
          work={work as Working<Poly>}
          format={polynomial}
          cellFormat={(v) => (v.length ? polynomial(v) : zero)}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
        />
      )}
    </div>
  );
}
