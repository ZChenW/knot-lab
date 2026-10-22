import { useT } from '../i18n/useT';
import type { AlexanderUnit, ComparisonValue, MoveComparison } from '../core/compare';
import { Ki, Polynomial, fmtInt, signed } from './format';
import { Tip } from './Tip';

export function Unit({ unit }: { unit: AlexanderUnit }) {
  return (
    <>
      {unit.sign < 0 ? '−' : ''}
      {unit.exponent === 0 ? (
        '1'
      ) : (
        <>
          <i>t</i>
          {unit.exponent !== 1 && <sup>{String(unit.exponent).replace(/^-/, '−')}</sup>}
        </>
      )}
    </>
  );
}
function Value({ value, signedValue = false }: { value: ComparisonValue; signedValue?: boolean }) {
  return value === null ? (
    '—'
  ) : Array.isArray(value) ? (
    <Polynomial p={value} />
  ) : typeof value === 'number' && signedValue ? (
    signed(value)
  ) : (
    fmtInt(value)
  );
}
export function MoveBlock({ comparison, p }: { comparison: MoveComparison; p: number }) {
  const t = useT(),
    { kind, sign, before, after, rows } = comparison,
    r1 = kind.startsWith('R1');
  const name = `${kind.slice(0, 2)}${kind === 'R1+' ? ` (${sign === 1 ? '+1' : '−1'})` : ''}`;
  return (
    <section className="move-block" data-kind="move">
      <div className="matrix-heading">
        <h2>
          <Tip text={t(r1 ? 'moves.r1Tip' : 'moves.r23Tip')}>
            <span className="term" tabIndex={0}>
              {name}
            </span>
          </Tip>
        </h2>
        <span className="m matrix-result">
          {r1 ? (
            <>
              writhe {signed(before.writhe)} → {signed(after.writhe)}
            </>
          ) : (
            <>
              crossings {before.crossings.length} → {after.crossings.length}
            </>
          )}
        </span>
      </div>
      {comparison.distant && <p className="move-hint">{t('moves.distant')}</p>}
      <div className="move-working">
        <table className="move-table">
          <thead>
            <tr>
              <th aria-label={t('moves.quantity')} />
              <th>before</th>
              <th>after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`move-${row.status}`} data-move-row={row.key}>
                <th scope="row">
                  {row.diagram ? (
                    <Tip text={t('surface.diagramTip')}>
                      <span className="term" tabIndex={0}>
                        <i>g</i>(<i>S</i>)
                      </span>
                    </Tip>
                  ) : row.key === 'rank' ? (
                    <>
                      rank<sub>{p}</sub>
                    </>
                  ) : row.key === 'alex' ? (
                    <>
                      Δ(<i>t</i>)
                    </>
                  ) : row.key === 'alexRaw' ? (
                    <>
                      det <i>A</i>″
                    </>
                  ) : row.key.startsWith('lk:') ? (
                    <>
                      lk(
                      <Ki i={Number(row.key.split(':')[1])} />, <Ki i={Number(row.key.split(':')[2])} />)
                    </>
                  ) : (
                    row.label
                  )}
                </th>
                <td>
                  <Value
                    value={row.before}
                    signedValue={row.key === 'writhe' || row.key.startsWith('lk') || row.key === 'totalLk'}
                  />
                </td>
                <td>
                  <span className="move-relation">
                    {row.unit && row.status === 'unit' ? (
                      <>
                        × (<Unit unit={row.unit} />) →
                      </>
                    ) : row.status === 'same' ? (
                      '='
                    ) : (
                      '→'
                    )}
                  </span>
                  <Value
                    value={row.after}
                    signedValue={row.key === 'writhe' || row.key.startsWith('lk') || row.key === 'totalLk'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
