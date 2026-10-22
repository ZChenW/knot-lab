// 19.A: two analysed diagrams set against each other, invariant by invariant.
// Pure: no DOM, no React. The labels are the course's English terms; the readout
// uses them in both languages (12.1).
import { factorize, isPrime, pInfo, type Analysis, type Component, type Poly } from './knot';
import { tripleProduct } from './components';
import { contentBox, diagramGeometry } from './diagram';
import { seifertNumbers } from './seifert';
import { samePoly } from './table-shared';

export type VersusVerdict = 'differs' | 'same' | 'not-invariant';
export interface VersusRow {
  key: string;
  label: string;
  /** Display values; null where the invariant could not be computed. */
  k: string | null;
  j: string | null;
  /** null when one side could not be computed: the row says so and gives no verdict. */
  verdict: VersusVerdict | null;
  /** The prime of a rankₚ or labelings row. */
  p?: number;
  /** Δ(t) as polynomials, for typesetting. */
  kPoly?: Poly | null;
  jPoly?: Poly | null;
}

const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};
const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const subscript = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)]);
const minus = (s: string) => s.replace(/-/g, '−');

/** Δ(t) as text, highest power first: t² − t + 1. */
export function polyText(p: Poly): string {
  let n = p.length;
  while (n > 0 && p[n - 1] === 0n) n--;
  let s = '';
  for (let i = n - 1; i >= 0; i--) {
    const c = p[i];
    if (c === 0n) continue;
    const neg = c < 0n,
      a = neg ? -c : c;
    s += s ? (neg ? ' − ' : ' + ') : neg ? '−' : '';
    if (i === 0) s += String(a);
    else
      s +=
        (a === 1n ? '' : String(a)) +
        't' +
        (i > 1
          ? String(i)
              .split('')
              .map((d) => SUP[d])
              .join('')
          : '');
  }
  return s || '0';
}

function cell<T>(
  key: string,
  label: string,
  k: T | null,
  j: T | null,
  show: (v: T) => string,
  same: (a: T, b: T) => boolean,
  extra: Partial<VersusRow> = {},
): VersusRow {
  return {
    key,
    label,
    k: k === null ? null : show(k),
    j: j === null ? null : show(j),
    verdict: k === null || j === null ? null : same(k, j) ? 'same' : 'differs',
    ...extra,
  };
}
const eq = <T>(a: T, b: T) => a === b;
const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Reference diagram quantities still compare numerically, without becoming invariants. */
export function versusSign(row: VersusRow): '' | '=' | '≠' {
  return row.verdict === null ? '' : row.k === row.j ? '=' : '≠';
}

/** |lk| of every pair, sorted: renumbering or reversing components changes nothing. */
export function linkingList(D: Analysis): number[] {
  return D.pairs.map((q) => Math.abs(q.lk)).sort((a, b) => a - b);
}

export function versus(K: Analysis, J: Analysis, primes: number[]): VersusRow[] {
  const rows: VersusRow[] = [
    cell('components', 'components', K.nComps, J.nComps, String, eq),
    cell('det', 'det', K.det < 0n ? -K.det : K.det, J.det < 0n ? -J.det : J.det, String, eq),
    cell('alex', 'Δ(t)', K.alex, J.alex, polyText, samePoly, { kPoly: K.alex, jPoly: J.alex }),
  ];
  for (const p of primes) {
    if (!isPrime(p)) continue;
    const a = pInfo(K, p),
      b = pInfo(J, p);
    rows.push(cell(`rank:${p}`, `rank${subscript(p)}`, a.rank, b.rank, String, eq, { p }));
    rows.push(cell(`labelings:${p}`, `labelings mod ${p}`, a.count, b.count, String, eq, { p }));
  }
  if (K.nComps > 1 || J.nComps > 1)
    rows.push(
      cell(
        'lk',
        '|lk|',
        K.nComps > 1 ? linkingList(K) : null,
        J.nComps > 1 ? linkingList(J) : null,
        (v) => v.join(', '),
        sameList,
      ),
    );
  if (K.nComps === 3 || J.nComps === 3) {
    const triple = (D: Analysis) => {
      const t = tripleProduct(D);
      return t ? Math.abs(t.value) : null;
    };
    rows.push(cell('triple', '|I|', triple(K), triple(J), String, eq));
  }
  // Numbers of the two diagrams, never invariants: shown, never used for the verdict.
  rows.push(
    {
      key: 'surfaceGenus',
      label: 'g(S)',
      k: String(seifertNumbers(K).genus),
      j: String(seifertNumbers(J).genus),
      verdict: 'not-invariant',
    },
    {
      key: 'crossings',
      label: 'crossings',
      k: String(K.crossings.length),
      j: String(J.crossings.length),
      verdict: 'not-invariant',
    },
    {
      key: 'writhe',
      label: 'writhe',
      k: minus(String(K.writhe)),
      j: minus(String(J.writhe)),
      verdict: 'not-invariant',
    },
  );
  return rows;
}

/**
 * The odd primes below 100 dividing either determinant, 2 if either is even, and the
 * current p; ascending, at most eight (the current p is always kept).
 */
export function primesFor(K: Analysis, J: Analysis, current: number): number[] {
  const found = new Set<number>();
  for (const det of [K.det, J.det]) {
    if (det % 2n === 0n) found.add(2);
    if (det === 0n) {
      for (let q = 3; q < 100; q += 2) if (isPrime(q)) found.add(q);
    } else
      for (const f of factorize(det < 0n ? -det : det).factors)
        if (f.p !== 2n && f.p < 100n) found.add(Number(f.p));
  }
  const keep = isPrime(current) ? current : null;
  if (keep !== null) found.delete(keep);
  const rest = [...found].sort((a, b) => a - b).slice(0, keep === null ? 8 : 7);
  return [...rest, ...(keep === null ? [] : [keep])].sort((a, b) => a - b);
}

export interface VersusOutcome {
  row: VersusRow | null;
  /** `det: 3 ≠ 5`, or `not distinguished`; never a claim that the two are equal. */
  text: string;
}
export function verdict(rows: VersusRow[]): VersusOutcome {
  const row = rows.find((r) => r.verdict === 'differs') ?? null;
  return row ? { row, text: `${row.label}: ${row.k} ≠ ${row.j}` } : { row: null, text: 'not distinguished' };
}

/**
 * The pinned diagram drawn small: the board's strand geometry (gaps at the
 * undercrossings), no labels, no arrows, fitted into width × height pixels.
 */
export function thumbnail(D: Analysis, comps: Component[], width = 132, height = 99, padding = 6) {
  const box = contentBox(comps, false);
  const s = Math.min((width - 2 * padding) / Math.max(1, box.w), (height - 2 * padding) / Math.max(1, box.h));
  const u = 1 / s;
  // Half the board's gap: at this size the full on-screen gap would swallow short strands.
  const paths = diagramGeometry(D, u / 2).arcs.map((a) => a.path);
  const w = width * u,
    h = height * u;
  return {
    viewBox: [box.x + box.w / 2 - w / 2, box.y + box.h / 2 - h / 2, w, h].map((v) => +v.toFixed(2)).join(' '),
    paths,
    /** Stroke width in diagram units for 1.5 screen pixels. */
    stroke: 1.5 * u,
  };
}

const latexText = (s: string) =>
  s
    .replace(/−/g, '-')
    .replace(/Δ/g, '\\Delta')
    .replace(/[₀-₉]+/g, (d) => `_{${[...d].map((c) => c.charCodeAt(0) - 0x2080).join('')}}`)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (d) => `^{${[...d].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('')}}`);
/** The table as a LaTeX tabular: what, K, = or ≠, J. */
export function versusLatex(rows: VersusRow[]): string {
  const cellText = (v: string | null) => (v === null ? '\\text{not computed}' : latexText(v));
  const body = rows.map((r) => {
    const label =
      r.key === 'surfaceGenus'
        ? '$g(S)$'
        : r.key === 'alex'
          ? '$\\Delta(t)$'
          : r.key === 'det'
            ? '$\\det$'
            : r.p !== undefined && r.key.startsWith('rank')
              ? `$\\operatorname{rank}_{${r.p}}$`
              : r.key === 'lk'
                ? '$|\\operatorname{lk}|$'
                : r.key === 'triple'
                  ? '$|I|$'
                  : r.label;
    const sign = versusSign(r) === '≠' ? '$\\neq$' : versusSign(r) === '=' ? '$=$' : '';
    const note = r.verdict === 'not-invariant' ? ' (diagram)' : '';
    return `${label}${note} & $${cellText(r.k)}$ & ${sign} & $${cellText(r.j)}$ \\\\`;
  });
  return ['\\begin{tabular}{lrcl}', ' & $K$ & & $J$ \\\\', '\\hline', ...body, '\\end{tabular}'].join('\n');
}
