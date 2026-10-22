// 18.P: helpers shared by the move comparison (compare.ts) and K vs J (versus.ts).
import type { Poly } from './knot';

/** Coefficient-wise equality of two polynomials (no normalisation). */
export const samePoly = (a: Poly, b: Poly) => a.length === b.length && a.every((v, i) => v === b[i]);
/** Equality of table values: polynomials coefficient-wise, everything else by ===. */
export const sameValue = <T>(a: T, b: T): boolean =>
  Array.isArray(a) && Array.isArray(b) ? samePoly(a as Poly, b as Poly) : a === b;
