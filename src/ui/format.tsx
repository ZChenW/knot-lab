import { Fragment } from 'react';
import { polynomialOrder, type Poly } from '../core/knot';

export const fmtInt = (n: bigint | number) => String(n).replace(/^-/, '−');
export const signed = (n: number) => (n > 0 ? `+${n}` : fmtInt(n));
export const sub = (n: number) => String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);
export function Xi({ i }: { i: number }) {
  return (
    <>
      <i>x</i>
      <sub>{i + 1}</sub>
    </>
  );
}
export function Ki({ i }: { i: number }) {
  return (
    <>
      <i>K</i>
      <sub>{i + 1}</sub>
    </>
  );
}
export function Polynomial({ p, tight = false }: { p: Poly; tight?: boolean }) {
  if (!p.length) return <>0</>;
  const order = polynomialOrder(p);
  if (!order.length) return <>0</>;
  return (
    <>
      {order.map((i, k) => {
        const c = p[i],
          neg = c < 0n,
          a = neg ? -c : c;
        const sign = k ? (tight ? (neg ? '−' : '+') : neg ? ' − ' : ' + ') : neg ? '−' : '';
        return (
          <Fragment key={i}>
            {sign}
            {i === 0 || a !== 1n ? String(a) : ''}
            {i > 0 && (
              <>
                <i>t</i>
                {i > 1 && <sup>{i}</sup>}
              </>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
