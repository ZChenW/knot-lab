import { t } from '../i18n';
import { diagramGeometry } from './diagram';
import type { Analysis } from './knot';
import type { SeifertSurface } from './seifert';
import { surfacePainting, SURFACE_CLEARANCE, SURFACE_OPACITY, surfaceTone } from './surface-picture';

export interface ExportFonts {
  math: string;
  mathItalic: string;
  mathSemibold: string;
  ui: string;
}

export function oklchToHex(l: number, c: number, h: number): string {
  const angle = (h * Math.PI) / 180;
  const a = c * Math.cos(angle),
    b = c * Math.sin(angle);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channel = (v: number) => {
    const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(255 * Math.max(0, Math.min(1, srgb)))
      .toString(16)
      .padStart(2, '0');
  };
  return (
    '#' +
    [
      4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
      -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
      -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
    ]
      .map(channel)
      .join('')
  );
}
// The bundled STIX subset has regular digits but no Unicode subscript glyphs.
const sub = (n: number, unit: number) =>
  `<tspan font-size="${9.45 * unit}" font-style="normal" dy="${3.4 * unit}">${n}</tspan>`;

// 14.G
export interface ExportOptions {
  signs?: 'all' | 'between' | [number, number];
  // 14.I: mark sizes in diagram units, independent of the exported viewport.
  unit?: number;
  surface?: SeifertSurface;
  alone?: number | null;
}

// 22.V: scope masks and gradients per export, including multiple inline pictures.
let surfaceExportId = 0;

export function exportSVG(
  D: Analysis,
  labels: number[] | null,
  p: number,
  fonts?: ExportFonts,
  options: ExportOptions = {},
): string {
  const unit = options.unit ?? 1;
  const geo = diagramGeometry(D, unit);
  const ink = oklchToHex(0.22, 0.012, 255),
    muted = oklchToHex(0.49, 0.012, 255);
  const paper = oklchToHex(0.996, 0.001, 255);
  const color = (arc: number) =>
    labels
      ? oklchToHex(
          p >= 11 && labels[arc] % 2 === 1 ? 0.47 : 0.6,
          0.17,
          Math.round(25 + (360 * labels[arc]) / p) % 360,
        )
      : ink;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  D.arcs.forEach((a) =>
    a.pts.forEach(([x, y]) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }),
  );
  if (!D.arcs.length) x0 = y0 = x1 = y1 = 0;
  const margin = 30 * unit;
  const width = x1 - x0 + 2 * margin,
    height = y1 - y0 + 2 * margin;
  const faces = fonts
    ? `<style>${(
        [
          ['STIX Two Text', '400', 'normal', fonts.math],
          ['STIX Two Text', '400', 'italic', fonts.mathItalic],
          ['STIX Two Text', '600', 'normal', fonts.mathSemibold],
          ['Instrument Sans', '400 700', 'normal', fonts.ui],
        ] as const
      )
        .map(([family, weight, style, data]) => {
          const base64 = data.replace(/^data:[^,]*,/, '');
          if (!/^[A-Za-z0-9+/]+=*$/.test(base64))
            throw new Error(t('files.exportFailure', { reason: t('export.invalidFont') }));
          return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${base64}) format('woff2');}`;
        })
        .join('')}</style>`
    : '';
  const dim = (comp: number) => options.alone != null && comp !== options.alone;
  const dimCrossing = (x: Analysis['crossings'][number]) =>
    options.alone != null && (x.over.c !== options.alone || x.under.c !== options.alone);
  const text = (x: number, y: number, body: string, math = true, dimmed = false) =>
    `<text${dimmed ? ' opacity="0.25"' : ''} x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${muted}" stroke="${paper}" stroke-width="${4 * unit}" stroke-linejoin="round" paint-order="stroke" font-family="${math ? "'STIX Two Text', 'Times New Roman', serif" : "'Instrument Sans', system-ui, sans-serif"}" font-size="${(math ? 13.5 : 10.5) * unit}" font-style="${math ? 'italic' : 'normal'}" font-weight="${math ? 400 : 500}">${body}</text>`;
  let surface = '';
  if (options.surface) {
    const painting = surfacePainting(options.surface);
    const prefix = `seifert-${++surfaceExportId}`;
    const gradientId = (crossing: number) => `${prefix}-band-${crossing}`;
    const opacity = SURFACE_OPACITY;
    const vertices = (points: [number, number][]) => points.map((point) => point.join(',')).join(' ');
    const polygon = (points: [number, number][], alpha: number, side: string) => {
      const shape = vertices(points);
      return `<polygon points="${shape}" fill="${ink}" fill-opacity="${alpha}" data-side="${side}"/>`;
    };
    const masks = `<mask id="${prefix}-paint" maskUnits="userSpaceOnUse" x="${x0 - margin}" y="${y0 - margin}" width="${width}" height="${height}" data-surface-clearance="true"><rect x="${x0 - margin}" y="${y0 - margin}" width="${width}" height="${height}" fill="white"/>${D.arcs.map((arc) => `<polyline points="${vertices(arc.closed ? [...arc.pts, arc.pts[0]] : arc.pts)}" fill="none" stroke="black" stroke-width="${SURFACE_CLEARANCE * unit}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</mask>`;
    const gradients = painting.bands
      .map(
        (band) =>
          `<linearGradient id="${gradientId(band.crossing)}" gradientUnits="userSpaceOnUse" color-interpolation="sRGB" x1="${band.axis[0][0]}" y1="${band.axis[0][1]}" x2="${band.axis[1][0]}" y2="${band.axis[1][1]}">${band.halves.map((half, i) => `<stop offset="${i}" stop-color="${surfaceTone(ink, paper, opacity.band[half.side])}" data-side="${half.side}"/>`).join('')}</linearGradient>`,
      )
      .join('');
    const disks = painting.disks
      .map(
        (circle) =>
          `<g data-surface-disk="${circle.id}" data-depth="${circle.depth}">${polygon(circle.points, opacity.disk, circle.side)}</g>`,
      )
      .join('');
    const bands = painting.bands
      .map(
        (band) =>
          `<g data-surface-band="${band.crossing}" data-twist="${band.sign}">${band.halves.map((half, i) => `<g data-surface-half="${i}"><polygon points="${vertices(half.points)}" fill="url(#${gradientId(band.crossing)})" stroke="none" data-side="${half.side}"/></g>`).join('')}</g>`,
      )
      .join('');
    surface = `<g data-seifert-picture="true"><defs>${masks}${gradients}</defs><g mask="url(#${prefix}-paint)">${disks}${bands}</g></g>`;
  }
  const strands = geo.arcs
    .map(
      (a) =>
        `<path data-arc="${a.id}" d="${a.path}" fill="none" stroke="${color(a.id)}" stroke-width="${2.5 * unit}" stroke-linecap="round" stroke-linejoin="round"${dim(a.comp) ? ' opacity="0.25"' : ''}/>`,
    )
    .join('');
  const tags = geo.arcs
    .map((a) =>
      text(
        ...a.label,
        `x${sub(a.id + 1, unit)}${labels ? `<tspan dx="${3 * unit}" dy="${-3.4 * unit}" font-size="${13.5 * unit}" fill="${color(a.id)}" font-style="normal" font-weight="600">${labels[a.id]}</tspan>` : ''}`,
        true,
        dim(a.comp),
      ),
    )
    .join('');
  // Polylines keep arrowheads distinct from the one path per strand.
  // Bake the unit into the points so the transform does not scale the stroke twice.
  const arrows = geo.arrows
    .map(
      (a) =>
        `<polyline${dim(a.comp) ? ' opacity="0.25"' : ''} data-arrow-arc="${a.arc}" data-comp="${a.comp}" points="${-5 * unit},${-4.5 * unit} ${1.5 * unit},0 ${-5 * unit},${4.5 * unit}" transform="${a.transform.replace(/scale\([^)]+\)$/, 'scale(1)')}" fill="none" stroke="${color(a.arc)}" stroke-width="${1.8 * unit}" stroke-linecap="round" stroke-linejoin="round"/>${D.nComps > 1 && a.label ? text(...a.label, `K${sub(a.comp + 1, unit)}`, true, dim(a.comp)) : ''}`,
    )
    .join('');
  const numbers = geo.crossings.map((x) => text(...x.label, String(x.num), false, dimCrossing(x))).join('');
  const signs = geo.crossings
    .filter(
      (x) =>
        options.signs === 'all' ||
        (x.over.c !== x.under.c &&
          (options.signs === 'between' ||
            (Array.isArray(options.signs) &&
              options.signs.includes(x.over.c) &&
              options.signs.includes(x.under.c)))),
    )
    .map(
      (x) =>
        `<text data-cross="${x.num}" data-sign="${x.sign}" x="${2 * x.x - x.label[0]}" y="${2 * x.y - x.label[1]}" text-anchor="middle" dominant-baseline="central" fill="${ink}" stroke="${paper}" stroke-width="${4 * unit}" stroke-linejoin="round" paint-order="stroke" font-family="'STIX Two Text', 'Times New Roman', serif" font-size="${15 * unit}" font-weight="400">${x.sign > 0 ? '+' : '−'}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - margin} ${y0 - margin} ${width} ${height}" width="${width}" height="${height}">${faces}${surface}${strands}${tags}${arrows}${numbers}${signs}</svg>`;
}
