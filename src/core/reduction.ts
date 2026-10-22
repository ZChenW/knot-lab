// 14.G
import { isPrime, minor, mulMod, reduceMod, type Analysis } from './knot';

export interface ReductionTerm {
  column: number;
  coefficient: number;
}
export interface Reduction {
  rref: number[][];
  pivots: number[];
  free: number[];
  expressions: { column: number; terms: ReductionTerm[] }[];
}

function inverse(value: number, p: number): number {
  let result = 1n,
    base = BigInt(value),
    exponent = BigInt(p - 2);
  const modulus = BigInt(p);
  while (exponent > 0n) {
    if (exponent % 2n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    exponent /= 2n;
  }
  return Number(result);
}

// Delete the same last row and column as pInfo, and use its left-to-right
// pivot convention. "rank" in the readout means nullity, not matrix rank.
export function reduceModP(D: Analysis, p: number): Reduction {
  if (!isPrime(p)) throw new RangeError('Reduction requires a prime');
  const rref = reduceMod(minor(D.A), p),
    columns = Math.max(0, D.nArcs - 1),
    pivots: number[] = [];
  let row = 0;
  for (let column = 0; column < columns && row < rref.length; column++) {
    const source = rref.findIndex((values, i) => i >= row && values[column] !== 0);
    if (source < 0) continue;
    [rref[row], rref[source]] = [rref[source], rref[row]];
    const inv = inverse(rref[row][column], p);
    for (let j = column; j < columns; j++) rref[row][j] = mulMod(rref[row][j], inv, p);
    for (let i = 0; i < rref.length; i++) {
      if (i === row) continue;
      const factor = rref[i][column];
      for (let j = column; j < columns; j++) {
        const value = rref[i][j] - mulMod(factor, rref[row][j], p);
        rref[i][j] = value < 0 ? value + p : value;
      }
    }
    pivots.push(column);
    row++;
  }
  const free = Array.from({ length: columns }, (_, i) => i).filter((i) => !pivots.includes(i));
  const expressions = pivots.map((column, i) => ({
    column,
    terms: free
      .map((f) => ({ column: f, coefficient: (p - rref[i][f]) % p }))
      .filter((term) => term.coefficient !== 0),
  }));
  return { rref, pivots, free, expressions };
}
