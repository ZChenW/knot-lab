// 19.B: choices are zero-based matrix indices, not displayed crossing numbers.
import { detInt, detPoly, pNormalize, pSub, type Analysis, type Poly } from './knot';

export interface MinorChoice {
  row: number;
  column: number;
}
export interface PolynomialUnit {
  sign: 1 | -1;
  power: number;
}
export type PolynomialRelation =
  { kind: 'unit'; unit: PolynomialUnit } | { kind: 'zero' | 'different' | 'not-computed' };

export function defaultMinor(size: number): MinorChoice {
  return { row: size - 1, column: size - 1 };
}
export function isDefaultMinor(choice: MinorChoice, size: number): boolean {
  return choice.row === size - 1 && choice.column === size - 1;
}
export function validMinor(choice: MinorChoice, size: number): boolean {
  return [choice.row, choice.column].every(
    (i) => Number.isSafeInteger(i) && (size === 0 ? i === -1 : i >= 0 && i < size),
  );
}
export function deleteMinor<T>(matrix: T[][], choice: MinorChoice): T[][] {
  if (!validMinor(choice, matrix.length) || matrix.some((r) => r.length !== matrix.length))
    throw new RangeError('Invalid minor choice or nonsquare matrix');
  return matrix.filter((_, i) => i !== choice.row).map((r) => r.filter((_, j) => j !== choice.column));
}

// Report an actual equality: chosen = sign * t^power * reference. Negative
// powers are allowed in the relation, while the matrices stay in Z[t].
export function polynomialRelation(chosen: Poly | null, reference: Poly | null): PolynomialRelation {
  if (chosen === null || reference === null) return { kind: 'not-computed' };
  const a = pSub(chosen, []),
    b = pSub(reference, []);
  if (!a.length || !b.length) return { kind: !a.length && !b.length ? 'zero' : 'different' };
  const ka = a.findIndex((v) => v !== 0n),
    kb = b.findIndex((v) => v !== 0n);
  const sign = a[ka] === b[kb] ? 1 : a[ka] === -b[kb] ? -1 : null;
  if (
    sign === null ||
    a.length - ka !== b.length - kb ||
    a.slice(ka).some((v, i) => v !== BigInt(sign) * b[kb + i])
  )
    return { kind: 'different' };
  return { kind: 'unit', unit: { sign, power: ka - kb } };
}

export function chosenMinor(D: Analysis, choice = defaultMinor(D.nArcs)) {
  const A = deleteMinor(D.A, choice),
    AT = deleteMinor(D.AT, choice);
  const detSigned = detInt(A),
    reference = detInt(deleteMinor(D.A, defaultMinor(D.nArcs)));
  const alexRaw = D.nArcs <= 30 ? detPoly(AT) : null;
  const alex = alexRaw === null ? null : pNormalize(alexRaw);
  return {
    choice,
    A,
    AT,
    detSigned,
    alexRaw,
    alex,
    integerNormalizedDiffers: detSigned !== D.det,
    alexNormalizedDiffers: alexRaw !== null && alex !== null && pSub(alexRaw, alex).length > 0,
    integerRelation:
      detSigned === reference
        ? reference === 0n
          ? 'zero'
          : 'same'
        : detSigned === -reference
          ? 'negative'
          : 'different',
    alexanderRelation: polynomialRelation(alexRaw, D.alexRaw),
  };
}
export type ChosenMinor = ReturnType<typeof chosenMinor>;
