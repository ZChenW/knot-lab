// 19.B: an inspectable determinant certificate, with no rational entries.
import { pAdd, pMul, pSub, type Poly } from './knot';
import { deleteMinor } from './minors';

export type WorkingKind = 'coloring' | 'alexander';
export interface WorkingDisplay {
  visible: boolean;
  expanded: boolean;
}

export type WorkingOperation<T> =
  | { kind: 'start' }
  | { kind: 'swap'; axis: 'row' | 'column'; a: number; b: number }
  | { kind: 'add'; axis: 'row' | 'column'; target: number; source: number; coefficient: T }
  | { kind: 'scale'; row: number; coefficient: T }
  | { kind: 'expand'; column: number; row: number; pivot: T }
  | { kind: 'evaluate'; value: T }
  | { kind: 'cofactors'; column: number; terms: { row: number; coefficient: T; working: Working<T> }[] };
export interface WorkingStep<T> {
  operation: WorkingOperation<T>;
  matrix: T[][];
  multiplier: T;
  product: T;
  // Powers belong to determinant factors, never to entries of the matrix.
  multiplierPower: number;
  productPower: number;
}
export interface Working<T> {
  steps: WorkingStep<T>[];
  determinant: T;
}
interface Ring<T> {
  zero: T;
  one: T;
  negative: T;
  add(a: T, b: T): T;
  mul(a: T, b: T): T;
  isZero(a: T): boolean;
  quotient(a: T, b: T): T;
  pivot(matrix: T[][]): [number, number] | null;
  euclidean: boolean;
  clearingScale?(value: T, pivot: T): { coefficient: T; power: number } | null;
  shift(value: T, power: number): T;
}

function derive<T>(input: T[][], ring: Ring<T>): Working<T> {
  if (input.some((r) => r.length !== input.length)) throw new RangeError('Working requires a square matrix');
  let matrix = input.map((r) => [...r]),
    product = ring.one,
    productPower = 0;
  const steps: WorkingStep<T>[] = [];
  const record = (operation: WorkingOperation<T>, multiplier = ring.one, multiplierPower = 0) => {
    product = ring.mul(product, multiplier);
    productPower += multiplierPower;
    steps.push({
      operation,
      matrix: matrix.map((r) => [...r]),
      multiplier,
      product,
      multiplierPower,
      productPower,
    });
  };
  const swap = (axis: 'row' | 'column', a: number, b: number) => {
    if (a === b) return;
    if (axis === 'row') [matrix[a], matrix[b]] = [matrix[b], matrix[a]];
    else for (const r of matrix) [r[a], r[b]] = [r[b], r[a]];
    record({ kind: 'swap', axis, a, b }, ring.negative);
  };
  const add = (target: number, source: number, coefficient: T) => {
    if (ring.isZero(coefficient)) return;
    matrix[target] = matrix[target].map((v, j) => ring.add(v, ring.mul(coefficient, matrix[source][j])));
    record({ kind: 'add', axis: 'row', target, source, coefficient });
  };
  record({ kind: 'start' });
  while (matrix.length > 1) {
    const pivot = ring.pivot(matrix);
    if (pivot) {
      swap('row', 0, pivot[0]);
      swap('column', 0, pivot[1]);
      for (let i = 1; i < matrix.length; i++) {
        while (!ring.isZero(matrix[i][0])) {
          const scale = ring.clearingScale?.(matrix[i][0], matrix[0][0]);
          if (scale) {
            matrix[i] = matrix[i].map((v) => ring.mul(scale.coefficient, v));
            record({ kind: 'scale', row: i, coefficient: scale.coefficient }, ring.one, -scale.power);
          }
          const q = ring.quotient(matrix[i][0], matrix[0][0]);
          add(i, 0, ring.mul(ring.negative, q));
          if (ring.isZero(matrix[i][0])) break;
          // Euclid uses integer multiples and swaps, never a fractional row.
          if (ring.euclidean) swap('row', 0, i);
          else break;
        }
      }
    }
    // Expand the sparsest column. A single term shrinks the matrix and
    // contributes its signed pivot; several terms are independent subproofs.
    const counts = matrix[0].map((_, j) => matrix.filter((r) => !ring.isZero(r[j])).length);
    const column = counts.indexOf(Math.min(...counts));
    const rows = matrix.map((r, i) => (ring.isZero(r[column]) ? -1 : i)).filter((i) => i >= 0);
    if (rows.length === 1) {
      const row = rows[0],
        value = matrix[row][column];
      const coefficient = (row + column) % 2 ? ring.mul(ring.negative, value) : value;
      matrix = deleteMinor(matrix, { row, column });
      record({ kind: 'expand', column, row, pivot: coefficient }, coefficient);
    } else {
      const terms = rows.map((row) => ({
        row,
        coefficient: (row + column) % 2 ? ring.mul(ring.negative, matrix[row][column]) : matrix[row][column],
        working: derive(deleteMinor(matrix, { row, column }), ring),
      }));
      const total = terms.reduce(
        (sum, term) => ring.add(sum, ring.mul(term.coefficient, term.working.determinant)),
        ring.zero,
      );
      // A cofactor sum is not a pivot product. Keep its branches explicitly,
      // then replace it by the 1x1 matrix of that sum (determinant unchanged).
      matrix = [[total]];
      record({ kind: 'cofactors', column, terms });
    }
  }
  // A scalar determinant is already evaluated; only an initially empty minor
  // needs the empty-matrix convention. Keep the certificate's invariant intact.
  const value = matrix.length ? matrix[0][0] : ring.one;
  if (matrix.length) record({ kind: 'evaluate', value });
  return { steps, determinant: ring.shift(ring.mul(product, value), productPower) };
}

export function integerWorking(matrix: bigint[][]): Working<bigint> {
  const abs = (v: bigint) => (v < 0n ? -v : v);
  return derive(matrix, {
    zero: 0n,
    one: 1n,
    negative: -1n,
    add: (a, b) => a + b,
    mul: (a, b) => a * b,
    isZero: (v) => v === 0n,
    quotient: (a, b) => a / b,
    euclidean: true,
    shift: (v, power) => {
      if (power !== 0) throw new Error('Integer determinant has a polynomial factor');
      return v;
    },
    pivot: (M) => {
      let best: [number, number] | null = null;
      M.forEach((r, i) =>
        r.forEach((v, j) => {
          if (v !== 0n && (!best || abs(v) < abs(M[best[0]][best[1]]))) best = [i, j];
        }),
      );
      return best;
    },
  });
}

function unitDegree(p: Poly): number | null {
  const terms = p.map((v, i) => (v === 0n ? -1 : i)).filter((i) => i >= 0);
  return terms.length === 1 && (p[terms[0]] === 1n || p[terms[0]] === -1n) ? terms[0] : null;
}
export function polynomialWorking(matrix: Poly[][]): Working<Poly> {
  return derive(
    matrix.map((r) => r.map((v) => pSub(v, []))),
    {
      zero: [],
      one: [1n],
      negative: [-1n],
      add: pAdd,
      mul: pMul,
      isZero: (v) => v.length === 0,
      euclidean: false,
      // If an entry is not divisible by the monomial unit, first multiply its
      // row by t^k. All matrix entries stay in Z[t], and the determinant factor
      // is t^-k. Subsequent division is exact and only ever by a unit.
      clearingScale: (a, b) => {
        const degree = unitDegree(b)!;
        return a.slice(0, degree).some((v) => v !== 0n)
          ? { coefficient: [...new Array<bigint>(degree).fill(0n), 1n], power: degree }
          : null;
      },
      quotient: (a, b) => a.slice(unitDegree(b)!).map((v) => v * b.at(-1)!),
      shift: shiftPolynomial,
      pivot: (M) => {
        let best: [number, number] | null = null,
          degree = Infinity;
        M.forEach((r, i) =>
          r.forEach((v, j) => {
            const d = unitDegree(v);
            if (d !== null && d < degree) {
              best = [i, j];
              degree = d;
            }
          }),
        );
        return best;
      },
    },
  );
}

export function shiftPolynomial(value: Poly, power: number): Poly {
  if (!value.length) return [];
  if (power >= 0) return [...new Array<bigint>(power).fill(0n), ...value];
  if (value.slice(0, -power).some((v) => v !== 0n)) throw new Error('Determinant factor did not cancel');
  return value.slice(-power);
}

// The UI applies the same folding rule to the whole tree, including cofactor
// subproofs. LaTeX always traverses every step.
export function workingStepCount<T>(working: Working<T>): number {
  return working.steps.reduce(
    (n, step) =>
      n +
      1 +
      (step.operation.kind === 'cofactors'
        ? step.operation.terms.reduce((sum, term) => sum + workingStepCount(term.working), 0)
        : 0),
    0,
  );
}

export function workingEntries<T>(work: Working<T>) {
  const entries: {
    step: WorkingStep<T>;
    depth: number;
    index: number;
    branch?: { row: number; coefficient: T };
  }[] = [];
  const visit = (current: Working<T>, depth: number, branch?: { row: number; coefficient: T }) => {
    for (const step of current.steps) {
      entries.push({ step, depth, branch, index: entries.length });
      if (step.operation.kind === 'cofactors')
        for (const term of step.operation.terms) visit(term.working, depth + 1, term);
    }
  };
  visit(work, 0);
  return entries;
}

// Both screen and page fold the complete cofactor tree at the same positions.
export function workingFold<T>(work: Working<T>, expanded: boolean) {
  const entries = workingEntries(work);
  const hidden = entries.length > 8 && !expanded ? entries.length - 5 : 0;
  return {
    entries: hidden ? [...entries.slice(0, 3), ...entries.slice(-2)] : entries,
    hidden,
    count: entries.length,
  };
}

export function workingFactors<T>(work: Working<T>): { value: T; power: number }[] {
  const factors = work.steps
    .filter((s) => ['swap', 'expand', 'scale'].includes(s.operation.kind))
    .map((s) => ({ value: s.multiplier, power: s.multiplierPower }));
  const last = work.steps.at(-1)!;
  factors.push({ value: last.matrix.length ? last.matrix[0][0] : last.multiplier, power: 0 });
  return factors;
}

// 20.Y: multiply a half-open range of steps, including any inverse powers
// introduced by polynomial row scaling. The empty range has product 1.
export function workingRangeProduct(
  steps: readonly WorkingStep<bigint | Poly>[],
  start = 0,
  end = steps.length,
): { value: Poly; power: number } {
  let value: Poly = [1n],
    power = 0;
  for (const step of steps.slice(start, end)) {
    value = pMul(value, typeof step.multiplier === 'bigint' ? [step.multiplier] : step.multiplier);
    power += step.multiplierPower;
  }
  if (!value.length) return { value: [], power: 0 };
  const degree = value.findIndex((v) => v !== 0n);
  value = value.slice(degree);
  power += degree;
  return power >= 0 ? { value: shiftPolynomial(value, power), power: 0 } : { value, power };
}
