import { pretzel, twist } from './families';

export type Point = [number, number];
export type Poly = bigint[];
export interface Component {
  id?: number;
  pts: Point[];
  rev?: boolean;
}
export interface Passage {
  c: number;
  t: number;
  dx: number;
  dy: number;
}
export interface RawCrossing {
  key: string;
  x: number;
  y: number;
  a: Passage;
  b: Passage;
}
export type Over = 'a' | 'b';
export type OverMap = Map<string, Over>;
export interface Crossing {
  key: string;
  x: number;
  y: number;
  over: Passage;
  under: Passage;
  sign: number;
  sin: number;
  inArc: number;
  outArc: number;
  overArc: number;
  num: number;
}
export type Arc = { id: number; comp: number; pts: Point[] } & (
  { closed: true; from?: never; to?: never } | { closed: false; from: Crossing; to: Crossing }
);
export interface LinkingPair {
  i: number;
  j: number;
  rh: number;
  lh: number;
  lk: number;
}
export interface Analysis {
  nComps: number;
  nArcs: number;
  crossings: Crossing[];
  rows: (Crossing | null)[];
  arcs: Arc[];
  offset: number[];
  A: bigint[][];
  AT: Poly[][];
  det: bigint;
  alexRaw: Poly | null;
  alex: Poly | null;
  pairs: LinkingPair[];
  totalLk: number;
  writhe: number;
  alternating: boolean;
}
export interface PInfo {
  p: number;
  rank: number;
  basis: number[][];
  colorable: boolean;
  count: bigint;
}
export interface Factorization {
  factors: { p: bigint; e: number }[];
  rest: bigint;
}
export interface Sample {
  pts: Point[];
  z: number[];
}
type CurveFunction = (s: number) => [number, number, number?];
interface PresetDefinition {
  name: string;
  curves: () => Sample[];
  over: 'z' | 'alt' | 'cyclic';
}

// Knot diagram mathematics. Conventions follow the Math 481 lecture notes:
// strands x_i run from undercrossing to undercrossing, the coloring relation at
// a crossing is 2x_over - x_in - x_out = 0, and the Alexander matrix row is
// (1-t, -1, t) for a right-handed crossing and (1-t, t, -1) for a left-handed one.

// ---------- polynomials in t: arrays of BigInt, lowest degree first ----------
function pTrim(p: Poly): Poly {
  let n = p.length;
  while (n > 0 && p[n - 1] === 0n) n--;
  return n === p.length ? p : p.slice(0, n);
}
export function pAdd(a: Poly, b: Poly): Poly {
  const n = Math.max(a.length, b.length),
    r = new Array<bigint>(n);
  for (let i = 0; i < n; i++) r[i] = (a[i] || 0n) + (b[i] || 0n);
  return pTrim(r);
}
export function pSub(a: Poly, b: Poly): Poly {
  const n = Math.max(a.length, b.length),
    r = new Array<bigint>(n);
  for (let i = 0; i < n; i++) r[i] = (a[i] || 0n) - (b[i] || 0n);
  return pTrim(r);
}
export function pMul(a: Poly, b: Poly): Poly {
  if (!a.length || !b.length) return [];
  const r = new Array<bigint>(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0n) continue;
    for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
  }
  return pTrim(r);
}
function pDivExact(a: Poly, b: Poly): Poly {
  if (!a.length) return [];
  const r = a.slice(),
    nb = b.length,
    lead = b[nb - 1];
  const q = new Array<bigint>(Math.max(0, r.length - nb + 1)).fill(0n);
  for (let d = r.length - nb; d >= 0; d--) {
    const c = r[d + nb - 1] / lead;
    q[d] = c;
    if (c !== 0n) for (let i = 0; i < nb; i++) r[d + i] -= c * b[i];
  }
  return pTrim(q);
}
export function pEval(p: Poly, x: bigint): bigint {
  let r = 0n;
  for (let i = p.length - 1; i >= 0; i--) r = r * x + p[i];
  return r;
}
// Strip the power of t and fix the sign so the lowest coefficient is positive.
export function pNormalize(p: Poly): Poly {
  p = pTrim(p);
  if (!p.length) return [];
  let k = 0;
  while (p[k] === 0n) k++;
  let r = p.slice(k);
  if (r[0] < 0n) r = r.map((c) => -c);
  return r;
}
export function pToString(p: Poly): string {
  p = pTrim(p);
  if (!p.length) return '0';
  let s = '';
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (c === 0n) continue;
    const neg = c < 0n,
      a = neg ? -c : c;
    s += s ? (neg ? ' - ' : ' + ') : neg ? '-' : '';
    if (i === 0) s += a;
    else s += (a === 1n ? '' : a) + 't' + (i > 1 ? '^' + i : '');
  }
  return s;
}

// Screen and LaTeX share the legacy order: prefer 1 - t to -t + 1.
export function polynomialOrder(p: Poly): number[] {
  const order = p
    .map((_, i) => i)
    .filter((i) => p[i] !== 0n)
    .reverse();
  if (order.length && p[order[0]] < 0n && p[order[order.length - 1]] > 0n) order.reverse();
  return order;
}

// ---------- determinants (fraction-free Bareiss elimination) ----------
export function detInt(M: bigint[][]): bigint {
  const n = M.length;
  if (n === 0) return 1n;
  const a = M.map((r) => r.slice());
  let sign = 1n,
    prev = 1n;
  for (let k = 0; k < n - 1; k++) {
    if (a[k][k] === 0n) {
      let s = -1;
      for (let i = k + 1; i < n; i++)
        if (a[i][k] !== 0n) {
          s = i;
          break;
        }
      if (s < 0) return 0n;
      const tmp = a[k];
      a[k] = a[s];
      a[s] = tmp;
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++)
      for (let j = k + 1; j < n; j++) a[i][j] = (a[i][j] * a[k][k] - a[i][k] * a[k][j]) / prev;
    prev = a[k][k];
  }
  return sign * a[n - 1][n - 1];
}
export function detPoly(M: Poly[][]): Poly {
  const n = M.length;
  if (n === 0) return [1n];
  const a = M.map((r) => r.map(pTrim));
  let neg = false,
    prev = [1n];
  for (let k = 0; k < n - 1; k++) {
    if (!a[k][k].length) {
      let s = -1;
      for (let i = k + 1; i < n; i++)
        if (a[i][k].length) {
          s = i;
          break;
        }
      if (s < 0) return [];
      const tmp = a[k];
      a[k] = a[s];
      a[s] = tmp;
      neg = !neg;
    }
    for (let i = k + 1; i < n; i++)
      for (let j = k + 1; j < n; j++)
        a[i][j] = pDivExact(pSub(pMul(a[i][j], a[k][k]), pMul(a[i][k], a[k][j])), prev);
    prev = a[k][k];
  }
  const d = a[n - 1][n - 1];
  return neg ? d.map((c) => -c) : d;
}
export function minor<T>(M: T[][]): T[][] {
  // drop the last row and the last column
  return M.slice(0, -1).map((r) => r.slice(0, -1));
}

// ---------- arithmetic mod p ----------
export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}
function powMod(a: number, e: number, p: number): number {
  let r = 1;
  a %= p;
  while (e > 0) {
    if (e & 1) r = mulMod(r, a, p);
    a = mulMod(a, a, p);
    e = Math.floor(e / 2);
  }
  return r;
}
// Keep residues exact when their product exceeds Number's integer precision.
export function mulMod(a: number, b: number, p: number): number {
  const product = a * b;
  return Number.isSafeInteger(product) ? product % p : Number((BigInt(a) * BigInt(b)) % BigInt(p));
}
const addMod = (a: number, b: number, p: number) => (a >= p - b ? a - (p - b) : a + b);
export function reduceMod(M: bigint[][], p: number): number[][] {
  const P = BigInt(p);
  return M.map((r) => r.map((v) => Number(((v % P) + P) % P)));
}
// Basis of {x : Mx = 0} over Z_p, for a matrix with `cols` columns.
export function nullspaceMod(M: number[][], cols: number, p: number): number[][] {
  const R = M.map((r) => r.slice()),
    rows = R.length,
    pivCol: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let s = -1;
    for (let i = r; i < rows; i++)
      if (R[i][c] !== 0) {
        s = i;
        break;
      }
    if (s < 0) continue;
    const tmp = R[r];
    R[r] = R[s];
    R[s] = tmp;
    const inv = powMod(R[r][c], p - 2, p);
    for (let j = c; j < cols; j++) R[r][j] = mulMod(R[r][j], inv, p);
    for (let i = 0; i < rows; i++) {
      if (i === r || R[i][c] === 0) continue;
      const f = R[i][c];
      for (let j = c; j < cols; j++) {
        const value = R[i][j] - mulMod(f, R[r][j], p);
        R[i][j] = value < 0 ? value + p : value;
      }
    }
    pivCol.push(c);
    r++;
  }
  const isPiv = new Array<number>(cols).fill(-1);
  pivCol.forEach((c, i) => {
    isPiv[c] = i;
  });
  const basis: number[][] = [];
  for (let f = 0; f < cols; f++) {
    if (isPiv[f] >= 0) continue;
    const v = new Array<number>(cols).fill(0);
    v[f] = 1;
    pivCol.forEach((c, i) => {
      v[c] = (p - R[i][f]) % p;
    });
    basis.push(v);
  }
  return basis;
}
export function factorize(n: bigint): Factorization {
  const out: Factorization['factors'] = [];
  if (n < 2n) return { factors: out, rest: 1n };
  let d = 2n,
    steps = 0;
  while (d * d <= n && steps < 2000000) {
    if (n % d === 0n) {
      let e = 0;
      while (n % d === 0n) {
        n /= d;
        e++;
      }
      out.push({ p: d, e });
    }
    d += d === 2n ? 1n : 2n;
    steps++;
  }
  if (n > 1n && d * d > n) {
    out.push({ p: n, e: 1 });
    n = 1n;
  }
  return { factors: out, rest: n };
}

// ---------- geometry ----------
// Every transverse double point of the closed polylines. Each crossing records
// its two passages (a, b) as component index and position along the path.
export function rawCrossings(comps: Component[]): RawCrossing[] {
  const segs = comps.map((c) => {
    const n = c.pts.length,
      arr = new Array<[number, number, number, number, number, number, number, number]>(n);
    for (let i = 0; i < n; i++) {
      const p = c.pts[i],
        q = c.pts[(i + 1) % n];
      arr[i] = [
        p[0],
        p[1],
        q[0],
        q[1],
        Math.min(p[0], q[0]),
        Math.max(p[0], q[0]),
        Math.min(p[1], q[1]),
        Math.max(p[1], q[1]),
      ];
    }
    return arr;
  });
  const out: RawCrossing[] = [];
  // A uniform grid only prunes candidate pairs; each pair still runs the same
  // test, in the same (a, b, i, j) order, so the result is unchanged.
  const CELL = 24;
  const grids = segs.map((B) => {
    const grid = new Map<number, number[]>();
    for (let j = 0; j < B.length; j++) {
      const s = B[j];
      for (let gx = Math.floor(s[4] / CELL); gx <= Math.floor(s[5] / CELL); gx++)
        for (let gy = Math.floor(s[6] / CELL); gy <= Math.floor(s[7] / CELL); gy++) {
          const key = gx * 100003 + gy,
            list = grid.get(key);
          if (list) list.push(j);
          else grid.set(key, [j]);
        }
    }
    return grid;
  });
  const seen = new Int32Array(Math.max(1, ...segs.map((B) => B.length))).fill(-1);
  let stamp = 0;
  for (let a = 0; a < comps.length; a++) {
    for (let b = a; b < comps.length; b++) {
      const A = segs[a],
        B = segs[b],
        grid = grids[b];
      const ida = comps[a].id === undefined ? a : comps[a].id;
      const idb = comps[b].id === undefined ? b : comps[b].id;
      for (let i = 0; i < A.length; i++) {
        const s1 = A[i],
          candidates: number[] = [];
        stamp++;
        for (let gx = Math.floor(s1[4] / CELL); gx <= Math.floor(s1[5] / CELL); gx++)
          for (let gy = Math.floor(s1[6] / CELL); gy <= Math.floor(s1[7] / CELL); gy++) {
            const list = grid.get(gx * 100003 + gy);
            if (list)
              for (const j of list)
                if (seen[j] !== stamp) {
                  seen[j] = stamp;
                  candidates.push(j);
                }
          }
        candidates.sort((x, y) => x - y);
        for (const j of candidates) {
          if (a === b && j < i + 2) continue;
          if (a === b && i === 0 && j === B.length - 1) continue;
          const s2 = B[j];
          if (s1[5] < s2[4] || s2[5] < s1[4] || s1[7] < s2[6] || s2[7] < s1[6]) continue;
          const d1x = s1[2] - s1[0],
            d1y = s1[3] - s1[1];
          const d2x = s2[2] - s2[0],
            d2y = s2[3] - s2[1];
          const den = d1x * d2y - d1y * d2x;
          if (Math.abs(den) <= Number.EPSILON * (Math.abs(d1x * d2y) + Math.abs(d1y * d2x))) continue;
          const ex = s2[0] - s1[0],
            ey = s2[1] - s1[1];
          const s = (ex * d2y - ey * d2x) / den,
            u = (ex * d1y - ey * d1x) / den;
          if (s < 0 || s >= 1 || u < 0 || u >= 1) continue;
          out.push({
            key: ida + ':' + i + ':' + idb + ':' + j,
            x: s1[0] + s * d1x,
            y: s1[1] + s * d1y,
            a: { c: a, t: i + s, dx: d1x, dy: d1y },
            b: { c: b, t: j + u, dx: d2x, dy: d2y },
          });
        }
      }
    }
  }
  return out;
}

// Over/under choice that alternates along every component. `prev` (optional)
// fixes the global parity of each connected piece to agree with earlier choices.
export function alternatingStates(comps: Component[], raw: RawCrossing[], prev?: OverMap | null): OverMap {
  const per: { t: number; n: number }[][] = comps.map(() => []);
  raw.forEach((x, k) => {
    per[x.a.c].push({ t: x.a.t, n: 2 * k });
    per[x.b.c].push({ t: x.b.t, n: 2 * k + 1 });
  });
  const adj: number[][] = Array.from({ length: 2 * raw.length }, () => []);
  raw.forEach((_x, k) => {
    adj[2 * k].push(2 * k + 1);
    adj[2 * k + 1].push(2 * k);
  });
  per.forEach((list) => {
    list.sort((p, q) => p.t - q.t);
    const m = list.length;
    for (let i = 0; i < m; i++) {
      const u = list[i].n,
        v = list[(i + 1) % m].n;
      if (u !== v) {
        adj[u].push(v);
        adj[v].push(u);
      }
    }
  });
  const col = new Array<number>(2 * raw.length).fill(-1);
  for (let s = 0; s < col.length; s++) {
    if (col[s] !== -1) continue;
    const piece = [s];
    col[s] = 1;
    for (let h = 0; h < piece.length; h++) {
      const u = piece[h];
      for (const v of adj[u])
        if (col[v] === -1) {
          col[v] = 1 - col[u];
          piece.push(v);
        }
    }
    if (prev) {
      let agree = 0,
        differ = 0;
      for (const u of piece) {
        if (u % 2) continue;
        const key = raw[u >> 1].key;
        if (!prev.has(key)) continue;
        if ((prev.get(key) === 'a') === (col[u] === 1)) agree++;
        else differ++;
      }
      if (differ > agree) for (const u of piece) col[u] = 1 - col[u];
    }
  }
  const res: OverMap = new Map();
  raw.forEach((x, k) => res.set(x.key, col[2 * k] === 1 ? 'a' : 'b'));
  return res;
}

export function polyLength(pts: Point[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
// Point and unit tangent at a fraction of an open polyline's length.
export function polyAt(pts: Point[], frac: number): { x: number; y: number; dx: number; dy: number } {
  const L = polyLength(pts);
  let target = L * frac;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0],
      dy = pts[i][1] - pts[i - 1][1];
    const d = Math.hypot(dx, dy);
    if (d === 0) continue;
    if (target <= d || i === pts.length - 1) {
      const f = Math.min(1, target / d);
      return { x: pts[i - 1][0] + f * dx, y: pts[i - 1][1] + f * dy, dx: dx / d, dy: dy / d };
    }
    target -= d;
  }
  return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
}

// ---------- the diagram and its invariants ----------
// comps: [{pts, rev}], raw: rawCrossings(comps), overMap: key -> 'a' | 'b'.
export function analyze(comps: Component[], raw: RawCrossing[], overMap: OverMap): Analysis {
  const nC = comps.length;
  const N = comps.map((c) => c.pts.length);
  const orient = (p: Passage): Passage => {
    const c = p.c;
    if (!comps[c].rev) return { c, t: p.t, dx: p.dx, dy: p.dy };
    let t = N[c] - p.t;
    if (t >= N[c]) t -= N[c];
    return { c, t, dx: -p.dx, dy: -p.dy };
  };
  const X: Crossing[] = raw.map((r) => {
    const aOver = (overMap.get(r.key) || 'a') === 'a';
    const over = orient(aOver ? r.a : r.b),
      under = orient(aOver ? r.b : r.a);
    // Screen coordinates have y pointing down, so a right-handed crossing has
    // (over x under) < 0.
    const cr = over.dx * under.dy - over.dy * under.dx;
    const sin = Math.abs(cr) / (Math.hypot(over.dx, over.dy) * Math.hypot(under.dx, under.dy) || 1);
    return {
      key: r.key,
      x: r.x,
      y: r.y,
      over,
      under,
      sign: cr < 0 ? 1 : -1,
      sin,
      inArc: -1,
      outArc: -1,
      overArc: -1,
      num: 0,
    };
  });

  const unders: Crossing[][] = comps.map(() => []);
  X.forEach((x) => unders[x.under.c].push(x));
  unders.forEach((l) => l.sort((p, q) => p.under.t - q.under.t));
  const offset: number[] = [];
  let nArcs = 0;
  for (let c = 0; c < nC; c++) {
    offset.push(nArcs);
    nArcs += Math.max(1, unders[c].length);
  }
  const arcAt = (c: number, t: number) => {
    const l = unders[c],
      m = l.length;
    if (!m) return offset[c];
    let k = 0;
    while (k < m && l[k].under.t < t) k++;
    return offset[c] + (k % m);
  };

  // Row r belongs to the crossing where strand x_r ends. A component that never
  // passes under contributes one strand and a zero row, which is what an R1
  // kink on that component would give.
  const rows: (Crossing | null)[] = new Array<Crossing | null>(nArcs).fill(null);
  for (let c = 0; c < nC; c++) {
    const m = unders[c].length;
    unders[c].forEach((x, k) => {
      x.inArc = offset[c] + k;
      x.outArc = offset[c] + ((k + 1) % m);
      x.overArc = arcAt(x.over.c, x.over.t);
      rows[x.inArc] = x;
    });
  }
  let num = 0;
  rows.forEach((x) => {
    if (x) x.num = ++num;
  });

  const opt = (c: number, k: number): Point => {
    const n = N[c];
    k = ((k % n) + n) % n;
    return comps[c].rev ? comps[c].pts[(n - k) % n] : comps[c].pts[k];
  };
  const pointAt = (c: number, t: number): Point => {
    const i = Math.floor(t),
      f = t - i,
      p = opt(c, i),
      q = opt(c, i + 1);
    return [p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])];
  };
  const pathBetween = (c: number, t0: number, t1: number): Point[] => {
    const pts = [pointAt(c, t0)];
    let span = t1 - t0;
    if (span <= 0) span += N[c];
    for (let k = Math.floor(t0) + 1; k < t0 + span; k++) pts.push(opt(c, k));
    pts.push(pointAt(c, t1));
    return pts;
  };
  const arcs: Arc[] = [];
  for (let c = 0; c < nC; c++) {
    const l = unders[c],
      m = l.length;
    if (!m) {
      const pts: Point[] = [];
      for (let k = 0; k < N[c]; k++) pts.push(opt(c, k));
      arcs.push({ id: offset[c], comp: c, closed: true, pts });
      continue;
    }
    for (let k = 0; k < m; k++) {
      const t0 = l[(k - 1 + m) % m].under.t,
        t1 = l[k].under.t;
      arcs.push({
        id: offset[c] + k,
        comp: c,
        closed: false,
        pts: pathBetween(c, t0, t1),
        from: l[(k - 1 + m) % m],
        to: l[k],
      });
    }
  }

  const A = Array.from({ length: nArcs }, () => new Array<bigint>(nArcs).fill(0n));
  const AT: Poly[][] = Array.from({ length: nArcs }, () => Array.from({ length: nArcs }, () => []));
  rows.forEach((x, r) => {
    if (!x) return;
    A[r][x.overArc] += 2n;
    A[r][x.inArc] -= 1n;
    A[r][x.outArc] -= 1n;
    AT[r][x.overArc] = pAdd(AT[r][x.overArc], [1n, -1n]);
    const pin = x.sign > 0 ? [-1n] : [0n, 1n],
      pout = x.sign > 0 ? [0n, 1n] : [-1n];
    AT[r][x.inArc] = pAdd(AT[r][x.inArc], pin);
    AT[r][x.outArc] = pAdd(AT[r][x.outArc], pout);
  });

  const d = detInt(minor(A));
  const det = d < 0n ? -d : d;
  // the polynomial determinant gets slow on very large diagrams
  const alexRaw = nArcs <= 30 ? detPoly(minor(AT)) : null;
  const alex = alexRaw ? pNormalize(alexRaw) : null;

  // linking numbers: half the signed count of crossings between two components
  const pairs: LinkingPair[] = [];
  for (let i = 0; i < nC; i++) for (let j = i + 1; j < nC; j++) pairs.push({ i, j, rh: 0, lh: 0, lk: 0 });
  const pairAt = (i: number, j: number) =>
    pairs.find((q) => q.i === Math.min(i, j) && q.j === Math.max(i, j))!;
  let writhe = 0;
  X.forEach((x) => {
    writhe += x.sign;
    if (x.over.c !== x.under.c) {
      const q = pairAt(x.over.c, x.under.c);
      if (x.sign > 0) q.rh++;
      else q.lh++;
    }
  });
  pairs.forEach((q) => {
    q.lk = (q.rh - q.lh) / 2;
  });
  const totalLk = pairs.reduce((s, q) => s + q.lk, 0);

  // does over/under alternate along every component?
  // The empty over/under word of a crossing-free component alternates vacuously.
  let alternating = true;
  for (let c = 0; c < nC && alternating; c++) {
    const pass: { t: number; o: number }[] = [];
    X.forEach((x) => {
      if (x.over.c === c) pass.push({ t: x.over.t, o: 1 });
      if (x.under.c === c) pass.push({ t: x.under.t, o: 0 });
    });
    pass.sort((p, q) => p.t - q.t);
    for (let i = 0; i < pass.length; i++)
      if (pass.length > 1 && pass[i].o === pass[(i + 1) % pass.length].o) {
        alternating = false;
        break;
      }
  }

  return {
    nComps: nC,
    nArcs,
    crossings: X,
    rows,
    arcs,
    offset,
    A,
    AT,
    det,
    alexRaw,
    alex,
    pairs,
    totalLk,
    writhe,
    alternating,
  };
}

// p-colorability data for an analyzed diagram and a prime p.
export function pInfo(D: Analysis, p: number): PInfo {
  const n = D.nArcs;
  const M = reduceMod(minor(D.A), p);
  const basis = nullspaceMod(M, Math.max(0, n - 1), p);
  const rank = basis.length;
  const count = BigInt(p) * (BigInt(p) ** BigInt(rank) - 1n);
  return { p, rank, basis, colorable: rank > 0, count };
}

export function labelingAt(info: PInfo, k: bigint): { coeffs: number[]; shift: number } {
  if (k < 0n || k >= info.count) throw new RangeError('Labeling index out of range');
  const p = BigInt(info.p);
  let digits = k / p + 1n;
  const coeffs = info.basis.map(() => {
    const digit = Number(digits % p);
    digits /= p;
    return digit;
  });
  return { coeffs, shift: Number(k % p) };
}

export function labelingIndex(info: PInfo, coeffs: number[] | null, shift: number): bigint {
  const digits = coeffs ?? info.basis.map((_, i) => (i === 0 ? 1 : 0));
  if (
    digits.length !== info.rank ||
    !Number.isInteger(shift) ||
    shift < 0 ||
    shift >= info.p ||
    digits.some((v) => !Number.isInteger(v) || v < 0 || v >= info.p)
  ) {
    throw new RangeError('Invalid labeling coefficients or shift');
  }
  const p = BigInt(info.p);
  let value = 0n;
  for (let i = digits.length - 1; i >= 0; i--) value = value * p + BigInt(digits[i]);
  if (value === 0n) throw new RangeError('Constant labelings have no index');
  return (value - 1n) * p + BigInt(shift);
}
// Labels for all strands from coefficients on the null-space basis plus a
// constant shift; the last strand gets the shift alone.
export function labeling(D: Analysis, info: PInfo, coeffs?: number[] | null, shift?: number): number[] {
  const n = D.nArcs,
    p = info.p,
    x = new Array<number>(n).fill(0);
  info.basis.forEach((v, b) => {
    const c = coeffs ? coeffs[b] : b === 0 ? 1 : 0;
    for (let i = 0; i < n - 1; i++) x[i] = addMod(x[i], mulMod(c, v[i], p), p);
  });
  return x.map((v) => addMod(v, shift || 0, p));
}
export function checkLabeling(D: Analysis, labels: number[], p: number): boolean {
  return D.crossings.every(
    (x) => (((2 * labels[x.overArc] - labels[x.inArc] - labels[x.outArc]) % p) + p) % p === 0,
  );
}

// ---------- turning a freehand stroke into a closed curve ----------
function segHit(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2[0] - p1[0],
    d1y = p2[1] - p1[1],
    d2x = p4[0] - p3[0],
    d2y = p4[1] - p3[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const ex = p3[0] - p1[0],
    ey = p3[1] - p1[1];
  const s = (ex * d2y - ey * d2x) / den,
    u = (ex * d1y - ey * d1x) / den;
  if (s < 0 || s > 1 || u < 0 || u > 1) return null;
  return [p1[0] + s * d1x, p1[1] + s * d1y];
}
// If the end of the stroke runs past its start, cut both tails at the point
// where they cross so the loop closes cleanly.
export function trimOvershoot(pts: Point[]): Point[] {
  const n = pts.length,
    L = polyLength(pts),
    win = Math.min(90, 0.15 * L);
  const head: number[] = [],
    tail: number[] = [];
  let acc = 0;
  for (let i = 0; i < n - 1 && acc <= win; i++) {
    head.push(i);
    acc += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  acc = 0;
  for (let j = n - 2; j >= 0 && acc <= win; j--) {
    tail.push(j);
    acc += Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]);
  }
  let best: { cost: number; i: number; j: number; h: Point } | null = null;
  for (const i of head)
    for (const j of tail) {
      if (j <= i + 1) continue;
      const h = segHit(pts[i], pts[i + 1], pts[j], pts[j + 1]);
      if (h && (!best || i + (n - j) < best.cost)) best = { cost: i + (n - j), i, j, h };
    }
  if (!best) return pts;
  return [best.h].concat(pts.slice(best.i + 1, best.j + 1));
}
export function resampleClosed(pts: Point[], step: number): Point[] {
  const n = pts.length,
    cum = [0];
  for (let i = 0; i < n; i++) {
    const q = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  }
  const total = cum[n],
    m = Math.max(8, Math.round(total / step)),
    out: Point[] = [];
  let seg = 0;
  for (let k = 0; k < m; k++) {
    const d = (total * k) / m;
    while (seg < n - 1 && cum[seg + 1] < d) seg++;
    const len = cum[seg + 1] - cum[seg],
      f = len > 0 ? (d - cum[seg]) / len : 0;
    const p = pts[seg],
      q = pts[(seg + 1) % n];
    out.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])]);
  }
  return out;
}
export function smoothClosed(pts: Point[], iterations: number): Point[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const n = cur.length,
      nxt = new Array<Point>(n);
    for (let i = 0; i < n; i++) {
      const a = cur[(i - 1 + n) % n],
        b = cur[i],
        c = cur[(i + 1) % n];
      nxt[i] = [0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0], 0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1]];
    }
    cur = nxt;
  }
  return cur;
}
export function processStroke(pts: Point[]): Point[] | null {
  if (pts.length < 6 || polyLength(pts) < 70) return null;
  return smoothClosed(resampleClosed(trimOvershoot(pts), 5), 3);
}

// ---------- example diagrams ----------
function sample(fn: CurveFunction, n: number): Sample {
  const pts: Point[] = [],
    z: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = fn((2 * Math.PI * i) / n);
    pts.push([v[0], v[1]]);
    z.push(v[2] || 0);
  }
  return { pts, z };
}
// A curve winding b times around a torus while oscillating a times: T(a, b).
const torus =
  (a: number, b: number, zs: number): CurveFunction =>
  (s) => [
    (2.2 + Math.cos(a * s)) * Math.cos(b * s),
    (2.2 + Math.cos(a * s)) * Math.sin(b * s),
    zs * Math.sin(a * s),
  ];
const circle =
  (cx: number, cy: number, r: number, zf?: (s: number) => number): CurveFunction =>
  (s) => [cx + r * Math.cos(s), cy + r * Math.sin(s), zf ? zf(s) : 0];
export const PRESETS = {
  unknot: { name: 'Unknot 0₁', curves: () => [sample(circle(0, 0, 1), 160)], over: 'z' },
  trefoilR: { name: '3₁ 右手 trefoil', curves: () => [sample(torus(3, 2, -1), 480)], over: 'z' },
  trefoilL: { name: '3₁ 左手 trefoil', curves: () => [sample(torus(3, 2, 1), 480)], over: 'z' },
  fig8: {
    name: '4₁ figure-8',
    curves: () => [
      sample(
        (s) => [
          (1.7 + Math.cos(2 * s)) * Math.cos(3 * s),
          (1.7 + Math.cos(2 * s)) * Math.sin(3 * s),
          Math.sin(4 * s),
        ],
        600,
      ),
    ],
    over: 'z',
  },
  k51: { name: '5₁ = T(2,5)', curves: () => [sample(torus(5, 2, -1), 600)], over: 'z' },
  k52: {
    name: '5₂（7 个交叉的图）',
    curves: () => twist(3),
    over: 'z',
  },
  k61: {
    name: '6₁（7 个交叉的图）',
    curves: () => twist(4),
    over: 'z',
  },
  k71: { name: '7₁ = T(2,7)', curves: () => [sample(torus(7, 2, -1), 700)], over: 'z' },
  k819: { name: '8₁₉ = T(3,4)', curves: () => [sample(torus(4, 3, -1), 900)], over: 'z' },
  granny: { name: 'Granny knot', curves: () => pretzel([3, 0, 3]), over: 'z' },
  square: { name: 'Square knot', curves: () => pretzel([3, 0, -3]), over: 'z' },
  unlink: {
    name: '2-component unlink',
    curves: () => [sample(circle(-1.2, 0, 1), 160), sample(circle(1.2, 0, 1), 160)],
    over: 'z',
  },
  hopf: {
    name: 'Hopf link',
    curves: () => [
      sample(
        circle(-0.6, 0, 1, (s) => Math.sin(s)),
        200,
      ),
      sample(
        circle(0.6, 0, 1, (s) => -Math.sin(s)),
        200,
      ),
    ],
    over: 'z',
  },
  whitehead: {
    name: 'Whitehead link',
    curves: () => [
      sample((s) => [1.7 * Math.cos(s), 0.95 * Math.sin(2 * s), 0], 400),
      sample(circle(0, 0, 1.02), 240),
    ],
    over: 'alt',
  },
  borromean: {
    name: 'Borromean rings',
    curves: () =>
      [90, 210, 330].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return sample(circle(0.62 * Math.cos(a), 0.62 * Math.sin(a), 1), 240);
      }),
    over: 'cyclic',
  },
} satisfies Record<string, PresetDefinition>;
export type PresetKey = keyof typeof PRESETS;
function zAt(z: number[], t: number): number {
  const n = z.length,
    i = Math.floor(t) % n,
    f = t - Math.floor(t);
  return z[i] + f * (z[(i + 1) % n] - z[i]);
}
// Build a preset inside a W x H box. Returns comps with ids and the over map.
export function preset(
  key: PresetKey,
  W: number,
  H: number,
  idBase?: number,
): { comps: Component[]; over: OverMap } {
  const def = PRESETS[key];
  return placeSamples(def.curves(), W, H, idBase, def.over);
}

// Place sampled curves using the same frame and height convention as presets.
export function placeSamples(
  curves: Sample[],
  W: number,
  H: number,
  idBase = 0,
  choice: PresetDefinition['over'] = 'z',
): { comps: Component[]; over: OverMap } {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  curves.forEach((c) =>
    c.pts.forEach((p) => {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }),
  );
  const m = 70,
    sc = Math.min((W - 2 * m) / (x1 - x0), (H - 2 * m) / (y1 - y0));
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const comps: Component[] = curves.map((c, i) => ({
    id: (idBase || 0) + i,
    rev: false,
    // flip y so the picture keeps its mathematical orientation on screen
    pts: c.pts.map((p) => [W / 2 + sc * (p[0] - cx), H / 2 - sc * (p[1] - cy)]),
  }));
  const raw = rawCrossings(comps);
  let over: OverMap;
  if (choice === 'alt') over = alternatingStates(comps, raw, null);
  else {
    over = new Map();
    raw.forEach((r) => {
      let aOver;
      if (choice === 'cyclic') aOver = (r.b.c - r.a.c + 3) % 3 === 1;
      else aOver = zAt(curves[r.a.c].z, r.a.t) >= zAt(curves[r.b.c].z, r.b.t);
      over.set(r.key, aOver ? 'a' : 'b');
    });
  }
  return { comps, over };
}

// 13.D
export function closedLengths(pts: Point[]): number[] {
  const cum = [0];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  }
  return cum;
}
const cycle = (f: number) => ((f % 1) + 1) % 1;
function passageFraction(cum: number[], t: number): number {
  const n = cum.length - 1;
  if (!n) return 0;
  t = ((t % n) + n) % n;
  const i = Math.floor(t),
    total = cum[cum.length - 1];
  return total ? cycle((cum[i] + (t - i) * (cum[i + 1] - cum[i])) / total) : 0;
}
const cyclicDistance = (a: number, b: number) => Math.min(cycle(a - b), cycle(b - a));
const crossingCache = new WeakMap<Component[], { raw: RawCrossing[]; lengths: number[][] }>();
function passages(comps: Component[]) {
  let cached = crossingCache.get(comps);
  if (!cached) {
    cached = { raw: rawCrossings(comps), lengths: comps.map((c) => closedLengths(c.pts)) };
    crossingCache.set(comps, cached);
  }
  return cached;
}
// The cached crossings of an immutable component list (the same list analyzeDiagram uses).
export function crossingsOf(comps: Component[]): RawCrossing[] {
  return passages(comps).raw;
}
const analysisCache = new WeakMap<Component[], WeakMap<OverMap, Analysis>>();
// Reducer previews and the readout share the analysis of an immutable diagram.
// Reuse the crossings carryOver already found, without changing analyze's mathematics.
export function analyzeDiagram(diagram: { comps: Component[]; over: OverMap }): Analysis {
  let choices = analysisCache.get(diagram.comps);
  if (!choices) {
    choices = new WeakMap();
    analysisCache.set(diagram.comps, choices);
  }
  let D = choices.get(diagram.over);
  if (!D) {
    D = analyze(diagram.comps, passages(diagram.comps).raw, diagram.over);
    choices.set(diagram.over, D);
  }
  return D;
}
export function carryOver(
  before: { comps: Component[]; over: OverMap },
  after: Component[],
  options: { shift?: Map<number, number>; prefer?: (raw: RawCrossing) => Over } = {},
): OverMap {
  const old = passages(before.comps),
    next = passages(after);
  const id = (comps: Component[], p: Passage) => comps[p.c].id ?? p.c;
  const oldFraction = (p: Passage) => passageFraction(old.lengths[p.c], p.t);
  const nextFraction = (p: Passage) =>
    cycle(passageFraction(next.lengths[p.c], p.t) + (options.shift?.get(id(after, p)) ?? 0));
  const candidates: { i: number; j: number; swap: boolean; distance: number }[] = [];
  next.raw.forEach((r, i) =>
    old.raw.forEach((s, j) => {
      const direct = id(after, r.a) === id(before.comps, s.a) && id(after, r.b) === id(before.comps, s.b);
      const swapped = id(after, r.a) === id(before.comps, s.b) && id(after, r.b) === id(before.comps, s.a);
      if (!direct && !swapped) return;
      const a = nextFraction(r.a),
        b = nextFraction(r.b),
        c = oldFraction(s.a),
        d = oldFraction(s.b);
      const same = direct ? cyclicDistance(a, c) + cyclicDistance(b, d) : Infinity;
      const other = swapped ? cyclicDistance(a, d) + cyclicDistance(b, c) : Infinity;
      candidates.push({ i, j, swap: other < same, distance: Math.min(same, other) });
    }),
  );
  // Globally nearest pairs win. An old crossing and a new crossing can each be used once.
  candidates.sort((a, b) => a.distance - b.distance || a.i - b.i || a.j - b.j);
  const used = new Set<number>(),
    over: OverMap = new Map();
  for (const { i, j, swap } of candidates) {
    const r = next.raw[i];
    if (used.has(j) || over.has(r.key)) continue;
    const value = before.over.get(old.raw[j].key) ?? 'a';
    over.set(r.key, swap ? (value === 'a' ? 'b' : 'a') : value);
    used.add(j);
  }
  const alt = options.prefer ? null : alternatingStates(after, next.raw, over);
  for (const r of next.raw)
    if (!over.has(r.key)) over.set(r.key, options.prefer ? options.prefer(r) : alt!.get(r.key)!);
  return over;
}

// The grabbed passage is inserted when necessary so it follows the pointer exactly.
export function reshapePoints(pts: Point[], t: number, delta: Point, radius: number): Point[] {
  const cum = closedLengths(pts),
    total = cum[cum.length - 1];
  const i = Math.floor(t),
    f = t - i,
    start = cum[i] + f * (cum[i + 1] - cum[i]);
  const R = Math.min(radius, total / 2);
  const move = (p: Point, at: number): Point => {
    const distance = Math.min(Math.abs(at - start), total - Math.abs(at - start));
    const w = R > 0 && distance < R ? (1 + Math.cos((Math.PI * distance) / R)) / 2 : 0;
    return [p[0] + delta[0] * w, p[1] + delta[1] * w];
  };
  const out = pts.map((p, k) => move(p, cum[k]));
  if (f > 1e-9 && f < 1 - 1e-9) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length];
    out.splice(i + 1, 0, [p[0] + f * (q[0] - p[0]) + delta[0], p[1] + f * (q[1] - p[1]) + delta[1]]);
  }
  return out;
}

// A closed centripetal Catmull–Rom curve. Each span is sampled by arc length,
// keeping its endpoints exactly, rather than smoothing away the user's clicked points.
export function splineClosed(points: Point[], step = 5): Point[] {
  if (!(step > 0) || !Number.isFinite(step)) throw new Error('Spline step must be positive');
  const pts = points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-9,
  );
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1]) < 1e-9) pts.pop();
  if (pts.length < 3) return pts.map((p) => [...p]);
  const out: Point[] = [],
    n = pts.length;
  const blend = (a: Point, b: Point, ta: number, tb: number, t: number): Point => {
    const f = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  for (let i = 0; i < n; i++) {
    const p = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    const time = [0];
    for (let j = 1; j < 4; j++)
      time.push(time[j - 1] + Math.sqrt(Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1])));
    const dense: Point[] = [p[1]];
    const divisions = Math.max(
      8,
      Math.ceil(
        (Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]) +
          Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) +
          Math.hypot(p[3][0] - p[2][0], p[3][1] - p[2][1])) /
          Math.min(1, step / 4),
      ),
    );
    for (let j = 1; j < divisions; j++) {
      const t = time[1] + ((time[2] - time[1]) * j) / divisions;
      const a = blend(p[0], p[1], time[0], time[1], t),
        b = blend(p[1], p[2], time[1], time[2], t),
        c = blend(p[2], p[3], time[2], time[3], t);
      dense.push(
        blend(blend(a, b, time[0], time[2], t), blend(b, c, time[1], time[3], t), time[1], time[2], t),
      );
    }
    dense.push(p[2]);
    const count = Math.max(1, Math.round(polyLength(dense) / step));
    for (let k = 0; k < count; k++) {
      const q = polyAt(dense, k / count);
      out.push([q.x, q.y]);
    }
  }
  return out;
}

export function reshapedDiagram(
  before: { comps: Component[]; over: OverMap },
  id: number,
  t: number,
  delta: Point,
  radius: number,
) {
  const index = before.comps.findIndex((c) => c.id === id),
    component = before.comps[index];
  if (!component) return before;
  const basis = reshapePoints(component.pts, t, [0, 0], radius);
  const comps = before.comps.map((c, i) =>
    i === index ? { ...c, pts: reshapePoints(c.pts, t, delta, radius) } : c,
  );
  const movement = (p: Passage) => {
    if (p.c !== index) return 0;
    const i = Math.floor(p.t),
      f = p.t - i,
      a = basis[i],
      b = basis[(i + 1) % basis.length];
    const x = a[0] + f * (b[0] - a[0]),
      y = a[1] + f * (b[1] - a[1]);
    const c = comps[index].pts[i],
      d = comps[index].pts[(i + 1) % basis.length];
    return Math.hypot(c[0] + f * (d[0] - c[0]) - x, c[1] + f * (d[1] - c[1]) - y);
  };
  const over = carryOver(before, comps, { prefer: (r) => (movement(r.a) >= movement(r.b) ? 'a' : 'b') });
  return { comps, over };
}

export function renumberDiagram(before: { comps: Component[]; over: OverMap }, arc: Arc) {
  const c = before.comps[arc.comp],
    middle = polyAt(arc.closed ? [...arc.pts, arc.pts[0]] : arc.pts, 0.5);
  let best = Infinity,
    at = 0,
    point: Point = c.pts[0];
  for (let i = 0; i < c.pts.length; i++) {
    const p = c.pts[i],
      q = c.pts[(i + 1) % c.pts.length],
      dx = q[0] - p[0],
      dy = q[1] - p[1];
    const f = Math.max(
      0,
      Math.min(1, ((middle.x - p[0]) * dx + (middle.y - p[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    const candidate: Point = [p[0] + f * dx, p[1] + f * dy],
      distance = Math.hypot(candidate[0] - middle.x, candidate[1] - middle.y);
    if (distance < best) {
      best = distance;
      at = i + f;
      point = candidate;
    }
  }
  const i = Math.floor(at),
    f = at - i,
    lengths = closedLengths(c.pts);
  const start = passageFraction(lengths, at);
  // Inserting the middle of a segment leaves the polyline's geometry exactly intact.
  const pts =
    f < 1e-9
      ? [...c.pts.slice(i), ...c.pts.slice(0, i)]
      : [point, ...c.pts.slice(i + 1), ...c.pts.slice(0, i + 1)];
  if (pts.length === c.pts.length && pts.every((p, k) => p[0] === c.pts[k][0] && p[1] === c.pts[k][1]))
    return before;
  const comps = before.comps.map((v, k) => (k === arc.comp ? { ...v, pts } : v));
  return { comps, over: carryOver(before, comps, { shift: new Map([[c.id ?? arc.comp, start]]) }) };
}

// Filter by arc length, trying the strongest cutoff the diagram's crossings allow.
export function tidyDiagram(
  before: { comps: Component[]; over: OverMap },
  { fill = true }: { fill?: boolean } = {},
): {
  comps: Component[];
  over: OverMap;
  moved: number;
  scale: number;
} {
  const unchanged = () => ({ comps: before.comps, over: before.over, moved: 0, scale: 1 });
  if (!before.comps.length) return unchanged();
  const original = passages(before.comps);
  const turning = (pts: Point[]) =>
    pts.reduce((sum, b, i) => {
      const a = pts[(i + pts.length - 1) % pts.length],
        c = pts[(i + 1) % pts.length];
      const ux = b[0] - a[0],
        uy = b[1] - a[1],
        vx = c[0] - b[0],
        vy = c[1] - b[1];
      return sum + Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) ** 2;
    }, 0);
  const distance = (p: Point, pts: Point[]) => {
    let nearest = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const f = Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
      );
      nearest = Math.min(nearest, Math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy));
    }
    return nearest;
  };
  const nearestCrossing = (raw: RawCrossing[], k: number) => {
    let nearest = Infinity;
    raw.forEach((r, i) => {
      if (i !== k) nearest = Math.min(nearest, Math.hypot(r.x - raw[k].x, r.y - raw[k].y));
    });
    return nearest;
  };
  const sin = (r: RawCrossing) =>
    Math.abs(r.a.dx * r.b.dy - r.a.dy * r.b.dx) /
    (Math.hypot(r.a.dx, r.a.dy) * Math.hypot(r.b.dx, r.b.dy) || 1);
  const filters = before.comps.map((c, index) => {
    const lengths = original.lengths[index],
      total = lengths[lengths.length - 1];
    const stops: number[] = [];
    for (const r of original.raw)
      for (const p of [r.a, r.b]) if (p.c === index) stops.push(passageFraction(lengths, p.t) * total);
    stops.sort((a, b) => a - b);
    const gaps =
      stops.length < 2
        ? [total]
        : stops.map((s, i) => (i + 1 < stops.length ? stops[i + 1] : stops[0] + total) - s);
    gaps.sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2),
      median = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
    const pts = resampleClosed(c.pts, 5),
      n = pts.length;
    // Real x/y DFTs share their trigonometry. The mean has gain exactly one.
    const mean: Point = [0, 0];
    for (const p of pts) {
      mean[0] += p[0] / n;
      mean[1] += p[1] / n;
    }
    const modes: { x: Point; y: Point; wavelength: number; weight: number }[] = [];
    for (let k = 1; k <= Math.floor(n / 2); k++) {
      const angle = (2 * Math.PI * k) / n,
        cos = Math.cos(angle),
        sine = Math.sin(angle),
        x: Point = [0, 0],
        y: Point = [0, 0];
      let re = 1,
        im = 0;
      for (const p of pts) {
        x[0] += (p[0] - mean[0]) * re;
        x[1] += (p[0] - mean[0]) * im;
        y[0] += (p[1] - mean[1]) * re;
        y[1] += (p[1] - mean[1]) * im;
        [re, im] = [re * cos - im * sine, re * sine + im * cos];
      }
      modes.push({ x, y, wavelength: total / k, weight: k * 2 === n ? 1 / n : 2 / n });
    }
    const filter = (lambda: number) => {
      const out: Point[] = Array.from({ length: n }, () => [...mean]);
      modes.forEach(({ x, y, wavelength, weight }, j) => {
        const gain = weight / (1 + (lambda / wavelength) ** 6),
          angle = (2 * Math.PI * (j + 1)) / n,
          cos = Math.cos(angle),
          sine = Math.sin(angle);
        let re = 1,
          im = 0;
        for (const p of out) {
          p[0] += gain * (x[0] * re + x[1] * im);
          p[1] += gain * (y[0] * re + y[1] * im);
          [re, im] = [re * cos - im * sine, re * sine + im * cos];
        }
      });
      return resampleClosed(out, 5);
    };
    // A spline is used only for the roughness comparison: linearly resampling a
    // smooth polygon introduces artificial corners between its original vertices.
    return {
      median,
      filter,
      roughness: turning(c.pts),
      sampledRoughness: turning(resampleClosed(splineClosed(c.pts, 1), 5)),
    };
  });
  const counts = (comps: Component[]) => {
    const pairs = new Map<string, number>();
    for (const r of passages(comps).raw) {
      const key = `${r.a.c}:${r.b.c}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    return pairs;
  };
  const originalCounts = counts(before.comps);
  const accept = (comps: Component[]) => {
    const nextCounts = counts(comps);
    if (
      nextCounts.size !== originalCounts.size ||
      [...originalCounts].some(([pair, count]) => nextCounts.get(pair) !== count)
    )
      return null;
    let unmatched = false;
    const over = carryOver(before, comps, {
      prefer: () => {
        unmatched = true;
        return 'a';
      },
    });
    if (unmatched) return null;
    // Repeat carryOver's nearest passage matching to compare the corresponding angles.
    const next = passages(comps),
      candidates: { i: number; j: number; distance: number }[] = [];
    next.raw.forEach((r, i) =>
      original.raw.forEach((s, j) => {
        if (r.a.c !== s.a.c || r.b.c !== s.b.c) return;
        const a = passageFraction(next.lengths[r.a.c], r.a.t),
          b = passageFraction(next.lengths[r.b.c], r.b.t),
          c = passageFraction(original.lengths[s.a.c], s.a.t),
          d = passageFraction(original.lengths[s.b.c], s.b.t);
        candidates.push({
          i,
          j,
          distance: Math.min(
            cyclicDistance(a, c) + cyclicDistance(b, d),
            r.a.c === r.b.c ? cyclicDistance(a, d) + cyclicDistance(b, c) : Infinity,
          ),
        });
      }),
    );
    candidates.sort((a, b) => a.distance - b.distance || a.i - b.i || a.j - b.j);
    const usedOld = new Set<number>(),
      usedNext = new Set<number>();
    for (const { i, j } of candidates) {
      if (usedOld.has(j) || usedNext.has(i)) continue;
      // A crossing must stay a clear crossing: at least 0.35, or 70% of what it was when
      // it was already shallower than that. (Comparing with the angle before alone would
      // reject every smoothing of a shaky curve, whose crossing angles are noise.)
      if (sin(next.raw[i]) < Math.min(0.35, 0.7 * sin(original.raw[j]))) return null;
      // And crossings must not be squeezed together: each keeps at least 14 units to its
      // nearest neighbour, or 60% of the distance it had when that was already less.
      if (nearestCrossing(next.raw, i) < Math.min(14, 0.6 * nearestCrossing(original.raw, j))) return null;
      usedOld.add(j);
      usedNext.add(i);
    }
    return usedOld.size === original.raw.length && usedNext.size === next.raw.length ? { comps, over } : null;
  };
  const cutoff = (median: number, factor: number) => Math.max(30, Math.min(320, factor * median));
  const removesWobble = (comps: Component[]) =>
    !comps.every((c, i) => {
      const raw = turning(c.pts),
        roughness = raw * Math.max(1, c.pts.length / before.comps[i].pts.length);
      return (
        filters[i].roughness === 0 ||
        roughness > 0.9 * filters[i].roughness ||
        raw > 0.9 * filters[i].sampledRoughness
      );
    });
  // Judge removable wobble with the gentlest trial. A broad filter can round a
  // perfectly smooth lobe too; that alone must not turn an example into an edit.
  const rough = removesWobble(
    before.comps.map((c, i) => ({ ...c, pts: filters[i].filter(cutoff(filters[i].median, 0.3)) })),
  );
  let smoothed = before;
  // Strongest first; the last, gentle ones only take the jitter off a diagram whose
  // crossings leave no room for more.
  for (const factor of rough ? [1.6, 1.2, 0.9, 0.6, 0.3, 0.15, 0.075] : []) {
    const lambdas = filters.map((f) => cutoff(f.median, factor)),
      comps = before.comps.map((c, i) => ({ ...c, pts: filters[i].filter(lambdas[i]) }));
    if (comps.some((c, i) => c.pts.some((p) => distance(p, before.comps[i].pts) > 0.35 * lambdas[i])))
      continue;
    const next = accept(comps);
    if (!next) continue;
    // Require a reduction at the stored and common sample densities. A change in
    // point count or artificial resampling corners must not qualify as tidying.
    if (removesWobble(comps)) smoothed = next;
    break;
  }
  const points = smoothed.comps.flatMap((c) => c.pts),
    x0 = Math.min(...points.map((p) => p[0])),
    x1 = Math.max(...points.map((p) => p[0])),
    y0 = Math.min(...points.map((p) => p[1])),
    y1 = Math.max(...points.map((p) => p[1]));
  // Same uniform fit and 70-unit margin as placeSamples, without its y reflection.
  const targetScale = Math.min(660 / (x1 - x0), 460 / (y1 - y0)),
    scale = fill && Number.isFinite(targetScale) && Math.abs(1 / targetScale - 1) > 0.03 ? targetScale : 1;
  const comps =
    scale === 1
      ? smoothed.comps
      : smoothed.comps.map((c) => ({
          ...c,
          // Keep the final spacing near five units even when a small drawing grows.
          pts: (smoothed === before ? c.pts : resampleClosed(splineClosed(c.pts, 1 / scale), 5 / scale)).map(
            (p): Point => [400 + scale * (p[0] - (x0 + x1) / 2), 300 + scale * (p[1] - (y0 + y1) / 2)],
          ),
        }));
  if (comps === before.comps) return unchanged();
  const next = scale === 1 ? smoothed : accept(comps);
  if (!next) return unchanged();
  const over = next.over;
  let moved = 0;
  comps.forEach((c, i) =>
    c.pts.forEach((p, j) => {
      const oldPoints = before.comps[i].pts,
        old = polyAt([...oldPoints, oldPoints[0]], passageFraction(passages(comps).lengths[i], j));
      moved = Math.max(moved, Math.hypot(p[0] - old.x, p[1] - old.y));
    }),
  );
  return { comps, over, moved, scale };
}
