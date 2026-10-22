import type { Point, Poly, Sample } from './knot';
import { pMul, pNormalize, preset } from './knot';
import { connectedSumCopies, operationSamples, type OperationDiagram } from './operations';

export type FamilyKind = 'torus' | 'twist' | 'pretzel' | 'sum';
export interface Family {
  kind: FamilyKind;
  params: number[];
}
export const FAMILY_DEFAULTS: Record<FamilyKind, number[]> = {
  torus: [3, 5],
  twist: [5],
  pretzel: [-2, 3, 7],
  sum: [0, 3],
};
const integer = (n: number) => Number.isSafeInteger(n);
export function validFamily(family: Family): boolean {
  const a = family.params;
  if (!a.every(integer)) return false;
  switch (family.kind) {
    case 'torus': {
      const [p, q] = a;
      return (
        a.length === 2 &&
        p >= 1 &&
        Math.abs(q) >= 1 &&
        Math.min(p * (Math.abs(q) - 1), Math.abs(q) * (p - 1)) <= 60
      );
    }
    case 'twist':
      return a.length === 1 && a[0] >= 0 && a[0] <= 30;
    case 'sum':
      return a.length === 2 && (a[0] === 0 || a[0] === 1) && a[1] >= 1 && a[1] <= 6;
    case 'pretzel':
      return (
        a.length >= 2 &&
        a.length <= 6 &&
        a.every((n) => Math.abs(n) <= 15) &&
        a.reduce((sum, n) => sum + Math.abs(n), 0) <= 60
      );
  }
}
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
export function torus(p: number, q: number): Sample[] {
  if (!validFamily({ kind: 'torus', params: [p, q] })) throw new RangeError('Invalid torus parameters');
  // The boundary torus knots are unknots; draw a circle rather than a wavy projection.
  if (p === 1 || Math.abs(q) === 1) return unknotSamples();
  const a = Math.max(p, Math.abs(q)),
    b = Math.min(p, Math.abs(q)),
    d = gcd(a, b);
  const count = Math.max(480, 48 * a);
  return Array.from({ length: d }, (_, k) => {
    const pts: Point[] = [],
      z: number[] = [];
    for (let i = 0; i < count; i++) {
      // A small common phase keeps crossings away from sample vertices.
      const s = (2 * Math.PI * (i + 0.137)) / count;
      const meridian = (a / d) * s + (2 * Math.PI * k) / d;
      // Rotate the reduced curves too: meridian offsets alone can trace the same
      // component twice (for example T(4,6)). Their torus phases must be distinct.
      const longitude = (b / d) * s + (2 * Math.PI * k * (b / d - 1)) / a;
      const r = 2.2 + Math.cos(meridian);
      pts.push([r * Math.cos(longitude), r * Math.sin(longitude)]);
      z.push(-Math.sign(q) * Math.sin(meridian));
    }
    return { pts, z };
  });
}

interface Piece extends Sample {
  from: number;
  to: number;
}
export function pretzel(a: number[]): Sample[] {
  if (a.length < 2 || !a.every(integer)) throw new RangeError('Invalid pretzel parameters');
  const pieces: Piece[] = [],
    width = 0.85,
    spacing = 4;
  const maxTwists = Math.max(...a.map(Math.abs)),
    diagramWidth = spacing * (a.length - 1) + 2 * width,
    // The outer arcs add two units above and below the columns.
    pitch = Math.min(Math.PI * width, (1.6 * diagramWidth - 4) / Math.max(1, maxTwists)),
    // Give zero columns a real height so the unlink has distinct closed curves.
    top = (pitch * Math.max(1, maxTwists)) / 2;
  // Four endpoints per column: top-left, top-right, bottom-left, bottom-right.
  const endpoint = (i: number, side: number, bottom = false) => 4 * i + (bottom ? 2 : 0) + side;
  const point = (i: number, side: number, bottom = false): Point => [
    spacing * i + (side ? width : -width),
    bottom ? -top : top,
  ];
  a.forEach((value, i) => {
    const n = Math.abs(value),
      steps = Math.max(1, 24 * n + 1),
      twistTop = (pitch * n) / 2;
    for (const side of [0, 1]) {
      const pts: Point[] = [],
        z: number[] = [],
        sign = side ? 1 : -1;
      if (!n) {
        pts.push(point(i, side), point(i, side, true));
        z.push(0, 0);
      } else {
        // Shorter twists have straight leads; cosine gives a vertical tangent at each join.
        if (n < maxTwists) {
          pts.push(point(i, side));
          z.push(0);
        }
        for (let j = 0; j <= steps; j++) {
          const tau = j / steps,
            angle = Math.PI * n * tau;
          pts.push([spacing * i + sign * width * Math.cos(angle), twistTop * (1 - 2 * tau)]);
          z.push(j === 0 || j === steps ? 0 : sign * Math.sign(value) * Math.sin(angle));
        }
        if (n < maxTwists) {
          pts.push(point(i, n % 2 ? 1 - side : side, true));
          z.push(0);
        }
      }
      pieces.push({ from: endpoint(i, side), to: endpoint(i, n % 2 ? 1 - side : side, true), pts, z });
    }
  });
  const arc = (from: number, to: number, p: Point, q: Point, height: number) => {
    const pts: Point[] = [];
    for (let j = 0; j <= 40; j++) {
      const t = j / 40,
        u = 1 - t;
      // Both handles are vertical: the join has the column's tangent.
      pts.push([u * u * (1 + 2 * t) * p[0] + t * t * (3 - 2 * t) * q[0], p[1] + 3 * u * t * height]);
    }
    pieces.push({ from, to, pts, z: pts.map(() => 0) });
  };
  for (let i = 0; i < a.length - 1; i++) {
    arc(endpoint(i, 1), endpoint(i + 1, 0), point(i, 1), point(i + 1, 0), 0.8);
    arc(endpoint(i, 1, true), endpoint(i + 1, 0, true), point(i, 1, true), point(i + 1, 0, true), -0.8);
  }
  for (const bottom of [false, true]) {
    const p = point(0, 0, bottom),
      q = point(a.length - 1, 1, bottom),
      direction = bottom ? -1 : 1;
    // An outer rounded rectangle stays outside every column and inner arch.
    const pts: Point[] = [p, [p[0], p[1] + direction * 1.5]];
    const radius = 0.5;
    for (let j = 1; j <= 12; j++) {
      const t = ((Math.PI / 2) * j) / 12;
      pts.push([p[0] + radius * (1 - Math.cos(t)), p[1] + direction * (1.5 + radius * Math.sin(t))]);
    }
    pts.push([q[0] - radius, q[1] + direction * 2]);
    for (let j = 1; j <= 12; j++) {
      const t = ((Math.PI / 2) * j) / 12;
      pts.push([q[0] - radius + radius * Math.sin(t), q[1] + direction * (1.5 + radius * Math.cos(t))]);
    }
    pts.push(q);
    pieces.push({
      from: endpoint(0, 0, bottom),
      to: endpoint(a.length - 1, 1, bottom),
      pts,
      z: pts.map(() => 0),
    });
  }
  const incident = new Map<number, number[]>();
  pieces.forEach((piece, i) => {
    for (const end of [piece.from, piece.to]) incident.set(end, [...(incident.get(end) ?? []), i]);
  });
  const used = new Set<number>(),
    curves: Sample[] = [];
  pieces.forEach((first, i) => {
    if (used.has(i)) return;
    const curve: Sample = { pts: [], z: [] };
    let at = first.from,
      next = i;
    do {
      const piece = pieces[next],
        forward = at === piece.from;
      used.add(next);
      const pts = forward ? piece.pts : [...piece.pts].reverse();
      const z = forward ? piece.z : [...piece.z].reverse();
      // Each join is represented once, including the final closing vertex.
      curve.pts.push(...pts.slice(0, -1));
      curve.z.push(...z.slice(0, -1));
      at = forward ? piece.to : piece.from;
      next = incident.get(at)!.find((index) => !used.has(index)) ?? -1;
    } while (next !== -1);
    curves.push(curve);
  });
  return curves;
}
export function twist(n: number): Sample[] {
  if (!validFamily({ kind: 'twist', params: [n] })) throw new RangeError('Invalid twist parameter');
  if (n === 0) return unknotSamples();
  return pretzel([n, 1, 1]);
}

// 19.C: these formulas describe an untouched family, never an edited diagram.
function unknotSamples(): Sample[] {
  const pts: Point[] = Array.from({ length: 160 }, (_, i) => {
    const s = (2 * Math.PI * i) / 160;
    return [Math.cos(s), Math.sin(s)];
  });
  return [{ pts, z: pts.map(() => 0) }];
}
export function familyAlexander(family: Family): { polynomial: Poly; formula: string } | null {
  if (!validFamily(family)) return null;
  if (family.kind === 'twist') {
    const n = family.params[0],
      a = BigInt(Math.ceil(n / 2));
    return {
      polynomial: pNormalize([a, -BigInt(n % 2 ? n : n + 1), a]),
      formula: `Δ_Tₙ(t) = ${n % 2 ? '((n + 1)/2)t² − nt + (n + 1)/2 (n ≡ 1 mod 2)' : '(n/2)t² − (n + 1)t + n/2 (n ≡ 0 mod 2)'}; n = ${n}`,
    };
  }
  if (family.kind !== 'torus') return null;
  const [p, signedQ] = family.params,
    q = Math.abs(signedQ);
  if (gcd(p, q) !== 1) return null;
  const formula = `Δ_T(p,q)(t) = (t^|pq| − 1)(t − 1) / ((t^p − 1)(t^|q| − 1)); p = ${p}, q = ${signedQ}`;
  if (p === 1 || q === 1) return { polynomial: [1n], formula };
  const powerMinusOne = (n: number): Poly => [-1n, ...new Array<bigint>(n - 1).fill(0n), 1n];
  const numerator = pMul(powerMinusOne(p * q), [-1n, 1n]);
  const denominator = pMul(powerMinusOne(p), powerMinusOne(q));
  // The denominator's constant term is 1: exact coefficient recurrence in Z[t].
  const polynomial: Poly = [];
  for (let i = 0; i <= (p - 1) * (q - 1); i++) {
    let coefficient = numerator[i] ?? 0n;
    for (let j = 1; j <= Math.min(i, denominator.length - 1); j++)
      coefficient -= denominator[j] * polynomial[i - j];
    polynomial.push(coefficient);
  }
  return { polynomial: pNormalize(polynomial), formula };
}
export function familySamples(family: Family): Sample[] {
  if (!validFamily(family)) throw new RangeError('Invalid family parameters');
  switch (family.kind) {
    case 'torus':
      return torus(family.params[0], family.params[1]);
    case 'twist':
      return twist(family.params[0]);
    case 'pretzel':
      return pretzel(family.params);
    case 'sum':
      return sum(family.params[0] === 0 ? 'trefoil' : 'fig8', family.params[1]);
  }
}
export function familyFileName(family: Family): string {
  if (family.kind === 'sum')
    return `sum-${family.params[0] === 0 ? 'trefoil' : 'figure-eight'}-${family.params[1]}.knot`;
  return `${family.kind}-${family.params.map((n) => (n < 0 ? `m${-n}` : n)).join('-')}.knot`;
}

// K_n: n copies of the knot joined in a row (a connected sum).
export function sum(knot: 'trefoil' | 'fig8', n: number): Sample[] {
  return operationSamples(sumDiagram(knot, n));
}
export function sumDiagram(knot: 'trefoil' | 'fig8', n: number): OperationDiagram {
  if (!validFamily({ kind: 'sum', params: [knot === 'trefoil' ? 0 : 1, n] }))
    throw new RangeError('Invalid sum parameters');
  const copy = preset(knot === 'trefoil' ? 'trefoilR' : 'fig8', 800, 600, 1);
  return connectedSumCopies(copy, n, knot === 'trefoil' ? Math.PI / 2 : 0);
}
