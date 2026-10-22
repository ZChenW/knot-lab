import { polyAt, polyLength, type Analysis, type Component, type Crossing, type Point } from './knot';

export const FRAME = { width: 800, height: 600 };
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface View extends Box {
  u: number;
}
export const initialView: View = { x: 0, y: 0, w: 800, h: 600, u: 1 };
export function contentBox(comps: Component[], withFrame: boolean): Box {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const c of comps)
    for (const [x, y] of c.pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  if (withFrame || x0 === Infinity) {
    x0 = Math.min(0, x0);
    y0 = Math.min(0, y0);
    x1 = Math.max(FRAME.width, x1);
    y1 = Math.max(FRAME.height, y1);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function fitBox(box: Box, width: number, height: number, toolbarHeight: number): View {
  const top = toolbarHeight + 14;
  const s = Math.min(
    Math.max(1, width - 96) / Math.max(1, box.w),
    Math.max(1, height - top - 96) / Math.max(1, box.h),
    2.5,
  );
  return {
    u: 1 / s,
    w: width / s,
    h: height / s,
    x: box.x + box.w / 2 - width / s / 2,
    y: box.y + box.h / 2 - (height + top) / s / 2,
  };
}
// Empty boards and pictures retain the original frame fit, without padding or a scale cap.
// Include outlying curves when fitting a picture so tracing still shows every component.
export function fitView(
  width: number,
  height: number,
  toolbarHeight: number,
  box = contentBox([], true),
): View {
  const top = toolbarHeight + 14,
    usable = Math.max(60, height - top);
  const s = Math.min(width / Math.max(1, box.w), usable / Math.max(1, box.h));
  return {
    u: 1 / s,
    w: width / s,
    h: height / s,
    x: box.x + (box.w - width / s) / 2,
    y: box.y + (box.h - usable / s) / 2 - top / s,
  };
}
export function zoomAt(view: View, point: Point, factor: number): View {
  const s = Math.max(0.2, Math.min(12, factor / view.u));
  const u = 1 / s,
    ratio = u / view.u;
  return {
    u,
    w: view.w * ratio,
    h: view.h * ratio,
    x: point[0] + (view.x - point[0]) * ratio,
    y: point[1] + (view.y - point[1]) * ratio,
  };
}
// Drag distances are screen pixels; the board follows the pointer.
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x - dx * view.u, y: view.y - dy * view.u };
}
export function resizeView(view: View, width: number, height: number): View {
  const w = width * view.u,
    h = height * view.u;
  return { ...view, x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h };
}
export function containsBox(view: View, box: Box, toolbarHeight: number): boolean {
  const epsilon = 1e-8;
  return (
    box.x >= view.x - epsilon &&
    box.y >= view.y + (toolbarHeight + 14) * view.u - epsilon &&
    box.x + box.w <= view.x + view.w + epsilon &&
    box.y + box.h <= view.y + view.h + epsilon
  );
}
// Whether any part of the box shows below the toolbar.
export function intersectsBox(view: View, box: Box, toolbarHeight: number): boolean {
  return (
    box.x + box.w >= view.x &&
    box.y + box.h >= view.y + (toolbarHeight + 14) * view.u &&
    box.x <= view.x + view.w &&
    box.y <= view.y + view.h
  );
}
export const markScale = (s: number) => Math.max(1, Math.min(1.6, Math.sqrt(s)));
export const crossingHitRadius = (distance: number, m: number) =>
  Math.max(6 * m, Math.min(13 * m, distance / 2 - m));
export const viewBox = (v: View) => `${v.x} ${v.y} ${v.w} ${v.h}`;
// 14.F: compare scale and centre in screen pixels, including automatic views after edits.
export function fitDiffers(view: View, fitted: View): boolean {
  return (
    Math.abs(view.u / fitted.u - 1) > 0.15 + 1e-9 ||
    Math.hypot(view.x + view.w / 2 - fitted.x - fitted.w / 2, view.y + view.h / 2 - fitted.y - fitted.h / 2) >
      0.15 * Math.min(view.w, view.h) + 1e-9
  );
}
export function clampPoint(p: Point, v: View): Point {
  const pad = 6 * v.u;
  return [
    Math.max(v.x + pad, Math.min(v.x + v.w - pad, p[0])),
    Math.max(v.y + pad, Math.min(v.y + v.h - pad, p[1])),
  ];
}
export function shouldSample(a: Point, b: Point, u: number) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) >= 2.5 * u;
}
export function pathD(pts: Point[], closed: boolean) {
  return (
    pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + (closed ? 'Z' : '')
  );
}
function cutStart(pts: Point[], g: number): Point[] {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d > g) {
      const f = (g - acc) / d;
      return [
        [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])],
        ...pts.slice(i),
      ];
    }
    acc += d;
  }
  return pts.slice(-1);
}
// Shorten both ends so the strand visibly stops before passing under. A
// shallow crossing needs a longer cut to clear the strand on top.
export const gapFor = (x: Crossing, u: number) => u * Math.max(8, Math.min(32, 6.4 / Math.max(x.sin, 0.05)));
function trimEnds(pts: Point[], g0: number, g1: number, u: number) {
  const room = polyLength(pts) - 8 * u;
  if (room <= 0) return pts;
  const k = Math.min(1, room / (g0 + g1));
  return cutStart(cutStart(pts, g0 * k).reverse(), g1 * k).reverse();
}
// Full-ink surface outlines must not reconnect a strand across its underpass.
// Reuse the drawing's exact gap rule, including shortened gaps on small arcs.
export function surfaceOutlineGaps(D: Analysis, m: number): Point[][] {
  return D.arcs.flatMap((arc) => {
    if (arc.closed) return [];
    const length = polyLength(arc.pts),
      room = length - 8 * m;
    const g0 = gapFor(arc.from, m),
      g1 = gapFor(arc.to, m);
    const k = room <= 0 ? 0 : Math.min(1, room / (g0 + g1));
    return [
      cutStart([...arc.pts].reverse(), Math.max(0, length - g0 * k - 2 * m)).reverse(),
      cutStart(arc.pts, Math.max(0, length - g1 * k - 2 * m)),
    ];
  });
}
// A position along a strand that keeps a mark clear of the crossings.
function clearSpot(pts: Point[], fracs: number[], D: Analysis, u: number) {
  let best: { d: number; m: ReturnType<typeof polyAt> } | null = null;
  for (const f of fracs) {
    const m = polyAt(pts, f);
    let d = Infinity;
    D.crossings.forEach((x) => {
      d = Math.min(d, Math.hypot(x.x - m.x, x.y - m.y));
    });
    if (d > 40 * u) return m;
    if (!best || d > best.d) best = { d, m };
  }
  return best!.m;
}
// 14.F: retain a clear position; otherwise prefer the earliest candidate within 1m of the best.
function clearerLabel(present: Point, candidates: Point[], D: Analysis, u: number, clear: number) {
  const clearance = (p: Point) => {
    let distance = Infinity;
    for (const arc of D.arcs)
      for (const q of arc.pts) distance = Math.min(distance, Math.hypot(p[0] - q[0], p[1] - q[1]));
    return distance;
  };
  const distance = clearance(present);
  if (distance >= clear * u) return present;
  const scored = [
    { point: present, distance },
    ...candidates.map((point) => ({ point, distance: clearance(point) })),
  ];
  const best = Math.max(...scored.map((c) => c.distance));
  return scored.find((c) => c.distance >= best - u)!.point;
}
export function diagramGeometry(D: Analysis, u: number) {
  const drawn = D.arcs.map((arc) => {
    const pts = arc.closed ? arc.pts : trimEnds(arc.pts, gapFor(arc.from, u), gapFor(arc.to, u), u);
    const len = polyLength(pts);
    const fracs = [0.28, 0.2, 0.36, 0.14, 0.44];
    const m = clearSpot(pts, fracs, D, u);
    const offset = (m: ReturnType<typeof polyAt>, side: number): Point => [
      m.x - side * 14 * u * m.dy,
      m.y + side * 14 * u * m.dx,
    ];
    return {
      id: arc.id,
      comp: arc.comp,
      pts,
      len,
      path: pathD(pts, arc.closed),
      label: clearerLabel(
        offset(m, 1),
        fracs.flatMap((f) => {
          const candidate = polyAt(pts, f);
          return [offset(candidate, 1), offset(candidate, -1)];
        }),
        D,
        u,
        12,
      ),
    };
  });
  const arrows = Array.from({ length: D.nComps }, (_, comp) => {
    const strands = drawn.filter((a) => a.comp === comp);
    const longest = strands.reduce((best, a) => (a.len > best.len ? a : best));
    const fracs = [0.72, 0.64, 0.8, 0.58, 0.86];
    const spot = (a: (typeof drawn)[number], avoidCrossings: boolean) => {
      const clear = fracs.filter((f) => {
        const m = polyAt(a.pts, f);
        return (
          Math.hypot(m.x - a.label[0], m.y - a.label[1]) >= 16 * u &&
          (!avoidCrossings || D.crossings.every((x) => Math.hypot(x.x - m.x, x.y - m.y) >= 26 * u))
        );
      });
      return clear.length ? clearSpot(a.pts, clear, D, u) : null;
    };
    const candidates = strands.flatMap((a) => {
      const m = a.len >= 90 * u ? spot(a, true) : null;
      return m ? [{ a, m }] : [];
    });
    // Keep orientation visible even on components too short or crowded for a clear arrow.
    if (!candidates.length)
      candidates.push({ a: longest, m: spot(longest, false) ?? clearSpot(longest.pts, fracs, D, u) });
    return candidates.map(({ a, m }) => ({
      comp,
      arc: a.id,
      // Trimming retains the arc's from-to point order, including reversed components.
      transform: `translate(${m.x} ${m.y}) rotate(${(Math.atan2(m.dy, m.dx) * 180) / Math.PI}) scale(${u})`,
      label: a === longest ? ([m.x + 15 * u * m.dy, m.y - 15 * u * m.dx] as Point) : null,
    }));
  });
  const crossings = D.crossings.map((x, i) => {
    const lo = Math.hypot(x.over.dx, x.over.dy) || 1,
      lu = Math.hypot(x.under.dx, x.under.dy) || 1;
    // Put the number in the wider of the wedges between the two strands.
    const wide = x.over.dx * x.under.dx + x.over.dy * x.under.dy > 0 ? -1 : 1;
    let bx = x.over.dx / lo + (wide * x.under.dx) / lu,
      by = x.over.dy / lo + (wide * x.under.dy) / lu;
    const lb = Math.hypot(bx, by) || 1;
    bx /= lb;
    by /= lb;
    const nx = x.over.dx / lo - (wide * x.under.dx) / lu,
      ny = x.over.dy / lo - (wide * x.under.dy) / lu,
      ln = Math.hypot(nx, ny) || 1;
    const offset = (dx: number, dy: number): Point => [x.x + 17 * u * dx, x.y + 17 * u * dy];
    let distance = Infinity;
    D.crossings.forEach((other, j) => {
      if (i !== j) distance = Math.min(distance, Math.hypot(x.x - other.x, x.y - other.y));
    });
    return {
      ...x,
      label: clearerLabel(
        offset(bx, by),
        [offset(-bx, -by), offset(nx / ln, ny / ln), offset(-nx / ln, -ny / ln)],
        D,
        u,
        7,
      ),
      radius: crossingHitRadius(distance, u),
    };
  });
  const arcs = drawn.map(({ id, comp, path, label, pts }) => ({ id, comp, path, label, pts }));
  return { arcs, arrows: arrows.flat(), crossings };
}
export function labelColor(v: number, p: number) {
  return `oklch(var(${p >= 11 && v % 2 === 1 ? '--lab-l2' : '--lab-l'}) var(--lab-c) ${Math.round(25 + (360 * v) / p) % 360})`;
}

// 13.D: the same nearest passage drives both the reshape handle and strand hover.
export function nearestStrand(D: Analysis, point: Point, maxDistance: number) {
  let best: { arc: number; comp: number; point: Point; distance: number } | null = null;
  for (const arc of D.arcs) {
    const pts = arc.pts,
      count = pts.length - (arc.closed ? 0 : 1);
    for (let i = 0; i < count; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const f = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
      );
      const p: Point = [a[0] + f * dx, a[1] + f * dy],
        distance = Math.hypot(p[0] - point[0], p[1] - point[1]);
      if (distance <= maxDistance && (!best || distance < best.distance))
        best = { arc: arc.id, comp: arc.comp, point: p, distance };
    }
  }
  return best;
}
export function componentPosition(component: Component, point: Point) {
  const pts = component.pts;
  let best = Infinity,
    t = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const f = Math.max(
      0,
      Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    const d = Math.hypot(a[0] + f * dx - point[0], a[1] + f * dy - point[1]);
    if (d < best) {
      best = d;
      t = i + f;
    }
  }
  return t;
}

// 18.P: compare the drawn pieces, including the under-crossing gaps. Preview
// only those pieces that change; the rest of the diagram keeps its opacity.
export function movePreviewGeometry(before: Analysis, after: Analysis, m: number) {
  const a = diagramGeometry(before, m).arcs,
    b = diagramGeometry(after, m).arcs;
  const onSegment = (p: Point, x: Point, y: Point) => {
    const dx = y[0] - x[0],
      dy = y[1] - x[1],
      f = ((p[0] - x[0]) * dx + (p[1] - x[1]) * dy) / (dx * dx + dy * dy || 1);
    return f >= -1e-7 && f <= 1 + 1e-7 && Math.hypot(p[0] - x[0] - f * dx, p[1] - x[1] - f * dy) < 1e-6;
  };
  const changed = (first: typeof a, second: typeof a, D: Analysis, otherD: Analysis) =>
    first.flatMap((arc) => {
      const others = second.filter((a) => a.comp === arc.comp);
      const on = (p: Point) =>
        others.some((a) =>
          a.pts.some(
            (q, i) =>
              (i < a.pts.length - 1 && onSegment(p, q, a.pts[i + 1])) ||
              (otherD.arcs[a.id]?.closed && i === a.pts.length - 1 && onSegment(p, q, a.pts[0])),
          ),
        );
      const runs: Point[][] = [];
      let run: Point[] = [];
      const count = arc.pts.length - (D.arcs[arc.id].closed ? 0 : 1);
      for (let i = 0; i < count; i++) {
        const p = arc.pts[i],
          q = arc.pts[(i + 1) % arc.pts.length],
          mid: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        if ([p, q, mid].every(on)) {
          if (run.length) runs.push(run);
          run = [];
        } else {
          if (!run.length) run.push(p);
          run.push(q);
        }
      }
      if (run.length) runs.push(run);
      return runs.map((pts) => ({ arc: arc.id, path: pathD(pts, false) }));
    });
  return { before: changed(a, b, before, after), after: changed(b, a, after, before) };
}
