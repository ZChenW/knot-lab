// 14.I: a standalone, vertically flowing homework sheet. All mathematical
// results and Check rows are supplied by the same selectors as the readout.
import { t } from '../i18n';
import { seifertLines, type SeifertSurface } from './seifert';
import type { ReadoutData, checkRows } from '../state/store';
import { exportSVG, oklchToHex, type ExportFonts, type ExportOptions } from './export';
import type { Analysis, PInfo, Poly } from './knot';
import { polyLatex } from './latex';
import { reduceModP } from './reduction';
import type { ComparisonValue, MoveComparison } from './compare';
import { compositionDetFactors, compositionFactors, type Composition } from './operations';
import { versusSign, type VersusOutcome, type VersusRow, type thumbnail } from './versus';
import { chosenMinor, defaultMinor, isDefaultMinor, type MinorChoice } from './minors';
import {
  integerWorking,
  polynomialWorking,
  workingEntries,
  workingFactors,
  workingFold,
  workingRangeProduct,
  type Working,
  type WorkingKind,
} from './working';

export interface SheetInput {
  D: Analysis;
  diagram?: { D: Analysis; labels: number[] | null; p: number };
  data: ReadoutData;
  info: PInfo | null;
  labels: number[] | null;
  checks: ReturnType<typeof checkRows>;
  p: number;
  tryP: string;
  title: string;
  symbol?: { base: string; index: string; power?: string; sum?: 'granny' | 'square' };
  notation?: string;
  meta: string;
  showReduction: boolean;
  signs?: ExportOptions['signs'];
  surface?: SeifertSurface;
  alone?: number | null;
  move?: MoveComparison;
  composition?: Composition | null;
  titleMath?: boolean;
  // 19.A
  versus?: {
    title: string;
    rows: VersusRow[];
    outcome: VersusOutcome;
    thumb: ReturnType<typeof thumbnail>;
  } | null;
  minorChoice?: MinorChoice;
  working?: { kind: WorkingKind; expanded: boolean };
}

type Run = {
  text: string;
  script?: 'sub' | 'super';
  italic?: boolean;
  weight?: number;
  fill?: string;
  family?: string;
};
type Runs = Run[];
const WIDTH = 794,
  MARGIN = 56,
  TEXT_WIDTH = WIDTH - 2 * MARGIN;
const ink = oklchToHex(0.22, 0.012, 255),
  muted = oklchToHex(0.49, 0.012, 255),
  faint = oklchToHex(0.73, 0.008, 255),
  line = oklchToHex(0.895, 0.004, 255);
const math = "'STIX Two Text', 'Times New Roman', serif",
  ui = "'Instrument Sans', 'PingFang SC', 'Noto Sans CJK SC', system-ui, sans-serif";
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (text: string): Runs => [{ text }];
const integer = (n: number | bigint) => String(n).replace(/^-/, '−');
const signed = (n: number) => (n > 0 ? `+${n}` : integer(n));
const variable = (name: string, n: number | string): Runs => [
  { text: name, italic: true },
  { text: String(n), script: 'sub' },
];

// Use the existing screen/LaTeX term ordering and coefficient convention.
// Only the presentation changes: real superscripts and a typographic minus.
function polynomial(p: Poly, tight = false): Runs {
  const text = polyLatex(p).replace(/-/g, '−');
  const runs: Runs = [];
  for (const token of text.matchAll(/t|\^\{(\d+)\}|[^t^]+/g)) {
    if (token[1]) runs.push({ text: token[1], script: 'super' });
    else if (token[0] === 't') runs.push({ text: 't', italic: true });
    else runs.push({ text: tight ? token[0].replace(/ /g, '') : token[0] });
  }
  return runs;
}

// Conservative advance estimates for the bundled faces. They only reserve room in the
// layout (recorded as data-width): the text itself is set at its natural width, since
// forcing it to an estimate either stretches the glyphs or letter-spaces every word.
// Scripts stay within the line box.
function advance(runs: Runs, size: number): number {
  return runs.reduce(
    (total, run) =>
      total +
      [...run.text].reduce((width, c) => {
        const em = /\s/.test(c)
          ? 0.3
          : /[ilI.,:;'()]/.test(c)
            ? 0.32
            : /[mwMW≡Δ]/.test(c)
              ? 0.9
              : /[\u2e80-\uffef]/.test(c)
                ? 1.05
                : /[A-Z+−=½#]/.test(c)
                  ? 0.75
                  : 0.58;
        return width + em * size * (run.script ? 0.7 : 1);
      }, 0),
    0,
  );
}

function svgText(
  runs: Runs,
  x: number,
  y: number,
  size: number,
  width: number,
  options: {
    fill?: string;
    family?: string;
    anchor?: 'start' | 'middle' | 'end';
    weight?: number;
    attrs?: string;
  } = {},
): string {
  const length = Math.min(width, advance(runs, size));
  const body = runs
    .map(
      (run) =>
        `<tspan${run.script ? ` baseline-shift="${run.script}" font-size="${size * 0.7}"` : ''}${run.italic ? ' font-style="italic"' : ''}${run.italic || run.weight ? ` font-weight="${run.italic ? 400 : run.weight}"` : ''}${run.fill ? ` fill="${run.fill}"` : ''}${run.family ? ` font-family="${run.family}"` : ''}>${escape(run.text)}</tspan>`,
    )
    .join('');
  return `<text xml:space="preserve" x="${x}" y="${y}" font-family="${options.family ?? math}" font-size="${size}" fill="${options.fill ?? ink}" font-weight="${options.weight ?? 400}" text-anchor="${options.anchor ?? 'start'}"${length ? ` data-width="${length}"` : ''}${options.attrs ? ` ${options.attrs}` : ''}>${body}</text>`;
}

function wrap(runs: Runs, size: number, width: number): Runs[] {
  const lines: Runs[] = [];
  let line: Runs = [];
  let word: Runs = [];
  const append = () => {
    if (!word.length) return;
    if (line.length && advance([...line, ...word], size) > width) {
      lines.push(line);
      line = [];
    }
    line.push(...word);
    word = [];
  };
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/).filter(Boolean)) {
      const next = { ...run, text: part };
      if (/^\s+$/.test(part)) {
        append();
        if (line.length) line.push(next);
      } else {
        word.push(next);
      }
    }
  }
  append();
  if (line.length) lines.push(line);
  return lines;
}

export function sheetSVG(input: SheetInput, fonts?: ExportFonts): string {
  const { D, data, labels, info, p } = input;
  const choice = input.minorChoice ?? defaultMinor(D.nArcs);
  const selected = chosenMinor(D, choice);
  const defaultChoice = isDefaultMinor(choice, D.nArcs);
  const parts: string[] = [];
  let y = MARGIN;
  const flow = (
    runs: Runs,
    x = MARGIN,
    size = 15.5,
    width = TEXT_WIDTH,
    color = ink,
    family = math,
    lineHeight = size * 1.5,
  ) => {
    for (const line of wrap(runs, size, width)) {
      parts.push(svgText(line, x, y + size, size, width, { fill: color, family }));
      y += lineHeight;
    }
  };
  const row = (key: Runs, value: Runs, size = 17) => {
    parts.push(svgText(key, MARGIN, y + size, 15, 122, { fill: muted }));
    flow(value, MARGIN + 144, size, TEXT_WIDTH - 144);
    y += 9;
  };
  const note = (text: string) => flow(plain(text), MARGIN, 12.5, TEXT_WIDTH, muted, ui);
  const factors = (): Runs =>
    data.factors.factors.flatMap((q, i) => [
      ...(i ? plain(' · ') : []),
      ...plain(String(q.p)),
      ...(q.e > 1 ? [{ text: String(q.e), script: 'super' as const }] : []),
    ]);

  // 19.A: the Versus block opens the sheet as it opens the readout.
  if (input.versus) {
    const v = input.versus;
    parts.push(svgText(plain('K vs J'), MARGIN, y + 17, 13, 120, { family: ui, weight: 500 }));
    const verdictLines = wrap(plain(v.outcome.text), 17, TEXT_WIDTH - 140);
    for (const line of verdictLines) {
      parts.push(
        svgText(line, MARGIN + TEXT_WIDTH, y + 17, 17, TEXT_WIDTH - 140, {
          anchor: 'end',
          fill: v.outcome.row ? ink : muted,
          attrs: 'data-versus="verdict"',
        }),
      );
      y += 25;
    }
    y += 10;
    parts.push(
      `<svg data-versus="thumbnail" x="${MARGIN}" y="${y}" width="132" height="99" viewBox="${v.thumb.viewBox}">${v.thumb.paths
        .map(
          (d) =>
            `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${v.thumb.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join('')}</svg>`,
    );
    for (const [i, line] of wrap(plain(v.title), 13, TEXT_WIDTH - 150).entries())
      parts.push(
        svgText(line, MARGIN + 150, y + 54 + i * 19, 13, TEXT_WIDTH - 150, { family: ui, fill: muted }),
      );
    y += 99 + 14;
    const columns = [MARGIN, MARGIN + 270, MARGIN + 300, MARGIN + 330];
    parts.push(
      svgText([{ text: 'K', italic: true }], columns[1], y + 14, 14, 30, { anchor: 'end', fill: muted }),
    );
    parts.push(svgText([{ text: 'J', italic: true }], columns[3], y + 14, 14, 30, { fill: muted }));
    y += 24;
    for (const r of v.rows) {
      const fill = r.verdict === 'differs' ? ink : r.verdict === 'not-invariant' ? faint : muted;
      const none = r.key === 'lk' || r.key === 'triple' ? '—' : 'not computed';
      const k = r.k ?? none,
        j = r.j ?? none;
      // Long polynomials get the text width, as in the screen's stacked row.
      if (r.key === 'alex' && (advance(plain(k), 15) > 150 || advance(plain(j), 15) > TEXT_WIDTH - 330)) {
        parts.push(
          svgText(plain(r.label), columns[0], y + 15, 15, 120, { fill, attrs: `data-versus-row="${r.key}"` }),
        );
        const sign = versusSign(r);
        if (sign)
          parts.push(svgText(plain(sign), columns[2] + 6, y + 15, 15, 20, { fill, anchor: 'middle' }));
        y += 23;
        for (const [side, value, poly] of [
          ['k', k, r.kPoly],
          ['j', j, r.jPoly],
        ] as const) {
          const lines = wrap(poly ? polynomial(poly) : plain(value), 15, TEXT_WIDTH - 150);
          parts.push(
            svgText([{ text: side.toUpperCase(), italic: true }], MARGIN + 126, y + 15, 15, 20, {
              fill,
              anchor: 'end',
            }),
          );
          for (const [i, runs] of lines.entries())
            parts.push(
              svgText(runs, MARGIN + 150, y + 15 + i * 21, 15, TEXT_WIDTH - 150, {
                fill,
                attrs: `data-versus-value="${side}"`,
              }),
            );
          y += Math.max(1, lines.length) * 21 + 2;
        }
        continue;
      }
      const jLines = wrap(plain(j), 15, TEXT_WIDTH - (columns[3] - MARGIN));
      parts.push(
        svgText(plain(r.label), columns[0], y + 15, 15, 200, { fill, attrs: `data-versus-row="${r.key}"` }),
      );
      parts.push(svgText(plain(k), columns[1], y + 15, 15, 260, { fill, anchor: 'end' }));
      const sign = versusSign(r);
      if (sign) parts.push(svgText(plain(sign), columns[2] + 6, y + 15, 15, 20, { fill, anchor: 'middle' }));
      for (const [i, line] of jLines.entries())
        parts.push(
          svgText(line, columns[3], y + 15 + i * 21, 15, TEXT_WIDTH - (columns[3] - MARGIN), { fill }),
        );
      y += 21 * Math.max(1, jLines.length) + 2;
    }
    y += 18;
    parts.push(`<rect x="${MARGIN}" y="${y}" width="${TEXT_WIDTH}" height="0.75" fill="${line}"/>`);
    y += 26;
  }
  // Name, symbol and notation use separate lines if their widths cannot fit.
  const titleFamily = input.titleMath ? math : ui,
    titleWeight = input.titleMath ? 400 : 600;
  const titleLines = wrap(plain(input.title), 21, TEXT_WIDTH);
  for (const line of titleLines.slice(0, -1)) {
    parts.push(svgText(line, MARGIN, y + 21, 21, TEXT_WIDTH, { family: titleFamily, weight: titleWeight }));
    y += 34;
  }
  const lastTitleLine = titleLines.at(-1) ?? [];
  const titleWidth = Math.min(TEXT_WIDTH, advance(lastTitleLine, 21));
  parts.push(
    svgText(lastTitleLine, MARGIN, y + 21, 21, TEXT_WIDTH, { family: titleFamily, weight: titleWeight }),
  );
  if (input.symbol) {
    const s = input.symbol;
    const runs: Runs = [...plain(s.base), { text: s.index, script: 'sub' }];
    if (s.sum)
      runs.push(
        ...plain(' # 3'),
        { text: '1', script: 'sub' },
        ...(s.sum === 'square' ? [{ text: 'm', script: 'super' as const }] : []),
      );
    const scriptSize = 21 * 0.62;
    const baseWidth = advance(plain(s.base), 21);
    const symbolWidth = s.power
      ? baseWidth + Math.max(advance(plain(s.index), scriptSize), advance(plain(s.power), scriptSize))
      : advance(runs, 21);
    const fits = titleWidth + 14 + symbolWidth <= TEXT_WIDTH;
    const x = fits ? MARGIN + titleWidth + 14 : MARGIN;
    if (!fits) y += 42;
    // Give stacked link indices explicit, disjoint line boxes. Browser-specific
    // baseline-shift metrics must not make the two small digits touch.
    if (s.power) {
      parts.push(svgText(plain(s.base), x, y + 21, 21, baseWidth, { fill: muted }));
      parts.push(
        svgText(plain(s.index), x + baseWidth, y + 32, scriptSize, symbolWidth - baseWidth, { fill: muted }),
      );
      parts.push(
        svgText(plain(s.power), x + baseWidth, y + scriptSize, scriptSize, symbolWidth - baseWidth, {
          fill: muted,
        }),
      );
    } else parts.push(svgText(runs, x, y + 21, 21, symbolWidth, { fill: muted }));
  }
  y += 42;
  if (input.notation) flow(plain(input.notation), MARGIN, 17);
  flow(plain(input.meta), MARGIN, 13, TEXT_WIDTH, muted, ui);
  y += 16;

  // Embed the exact existing diagram export, including its font-face rules.
  // Move those rules to the outer SVG so the rasterizer loads all four faces.
  const drawing = input.diagram ?? { D, labels, p };
  const baseDiagram = exportSVG(drawing.D, drawing.labels, drawing.p, fonts, {
    signs: input.signs,
    surface: input.surface,
    alone: input.alone,
  });
  const faces = /<style>[^<]*<\/style>/.exec(baseDiagram)?.[0] ?? '';
  const dimensions = (svg: string) =>
    [/ width="([^"]+)"/, / height="([^"]+)"/].map((re) => Number(re.exec(svg)![1]));
  const [baseWidth, baseHeight] = dimensions(baseDiagram);
  // Compensated marks also keep a 30-unit margin on the sheet itself. Solve
  // the fit with that fixed padding rather than letting it shrink with the ink.
  const fit = Math.min(TEXT_WIDTH / baseWidth, 520 / baseHeight);
  const scale = fit < 1 ? Math.min((TEXT_WIDTH - 60) / (baseWidth - 60), 460 / (baseHeight - 60)) : fit;
  const unit = Math.max(1, 1 / scale);
  const diagram =
    unit === 1
      ? baseDiagram
      : exportSVG(drawing.D, drawing.labels, drawing.p, fonts, {
          signs: input.signs,
          unit,
          surface: input.surface,
          alone: input.alone,
        });
  const [dw, dh] = dimensions(diagram);
  const width = dw * scale,
    height = dh * scale;
  parts.push(
    diagram
      .replace(faces, '')
      .replace(/^<svg /, `<svg data-diagram="true" x="${MARGIN + (TEXT_WIDTH - width) / 2}" y="${y}" `)
      .replace(/ width="[^"]+" height="[^"]+"/, ` width="${width}" height="${height}"`),
  );
  y += height + 22;
  const finish = () => {
    const sheetHeight = Math.ceil(y + MARGIN);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${sheetHeight}" viewBox="0 0 ${WIDTH} ${sheetHeight}">${faces}<rect width="${WIDTH}" height="${sheetHeight}" fill="#ffffff"/>${parts.join('')}</svg>`;
  };
  if (!D.nComps) return finish();

  // 18.P: the same move ledger that precedes the screen's invariants.
  if (input.move) {
    const move = input.move,
      r1 = move.kind.startsWith('R1');
    const name = move.kind.slice(0, 2) + (move.kind === 'R1+' ? ` (${move.sign === 1 ? '+1' : '−1'})` : '');
    const result = r1
      ? `writhe ${signed(move.before.writhe)} → ${signed(move.after.writhe)}`
      : `crossings ${move.before.crossings.length} → ${move.after.crossings.length}`;
    y += 18;
    parts.push(
      `<line x1="${MARGIN}" y1="${y}" x2="${WIDTH - MARGIN}" y2="${y}" stroke="${line}" stroke-width="0.75"/>`,
      svgText(plain(name), MARGIN, y + 18, 13, 160, {
        family: ui,
        weight: 500,
        attrs: 'data-heading="move"',
      }),
      svgText(plain(result), WIDTH - MARGIN, y + 18, 17, TEXT_WIDTH - 180, {
        anchor: 'end',
        attrs: 'data-result="move"',
      }),
    );
    y += 40;
    parts.push(
      svgText(plain('before'), MARGIN + 144, y, 12.5, 200, { fill: muted, family: ui }),
      svgText(plain('after'), MARGIN + 386, y, 12.5, 250, { fill: muted, family: ui }),
    );
    y += 12;
    const value = (v: ComparisonValue, sign = false): Runs =>
      v === null
        ? plain('—')
        : Array.isArray(v)
          ? polynomial(v)
          : plain(typeof v === 'number' && sign ? signed(v) : String(v));
    for (const row of move.rows) {
      const color = row.status === 'changed' ? ink : muted,
        sign = row.key === 'writhe' || row.key.startsWith('lk') || row.key === 'totalLk';
      const key =
        row.key === 'surfaceGenus'
          ? [{ text: 'g', italic: true }, ...plain('('), { text: 'S', italic: true }, ...plain(')')]
          : row.key === 'rank'
            ? [...plain('rank'), { text: String(p), script: 'sub' as const }]
            : row.key === 'alex'
              ? [...plain('Δ('), { text: 't', italic: true }, ...plain(')')]
              : row.key === 'alexRaw'
                ? [...plain('det '), { text: 'A', italic: true }, ...plain('″')]
                : row.key.startsWith('lk:')
                  ? [
                      ...plain('lk('),
                      ...variable('K', Number(row.key.split(':')[1]) + 1),
                      ...plain(', '),
                      ...variable('K', Number(row.key.split(':')[2]) + 1),
                      ...plain(')'),
                    ]
                  : plain(row.label);
      const relation: Runs =
        row.unit && row.status === 'unit'
          ? [
              ...plain(`× (${row.unit.sign < 0 ? '−' : ''}`),
              ...(row.unit.exponent === 0
                ? plain('1')
                : [
                    { text: 't', italic: true },
                    ...(row.unit.exponent === 1
                      ? []
                      : [{ text: integer(row.unit.exponent), script: 'super' as const }]),
                  ]),
              ...plain(') → '),
            ]
          : plain(row.status === 'same' ? '= ' : '→ ');
      const beforeLines = wrap(value(row.before, sign), 15.5, 216),
        afterLines = wrap([...relation, ...value(row.after, sign)], 15.5, TEXT_WIDTH - 386);
      parts.push(svgText(key, MARGIN, y + 15.5, 14, 136, { fill: color }));
      for (const [lines, x, width] of [
        [beforeLines, MARGIN + 144, 216],
        [afterLines, MARGIN + 386, TEXT_WIDTH - 386],
      ] as const)
        lines.forEach((runs, i) =>
          parts.push(svgText(runs, x, y + 15.5 + i * 22, 15.5, width, { fill: color })),
        );
      y += Math.max(beforeLines.length, afterLines.length) * 22 + 4;
    }
    y += 22;
  }

  if (data.alexFormula) parts.push('<g data-alex-formula="true">');
  row(
    [{ text: 'Δ(' }, { text: 't', italic: true }, { text: ')' }],
    input.composition?.op === 'split'
      ? plain('0')
      : data.alexValue
        ? [
            ...polynomial(data.alexValue),
            ...(data.alexFormula ? [{ text: `  ${t('readout.formula')}`, fill: muted }] : []),
          ]
        : plain('—'),
    data.terms > 4 ? 19 : 24,
  );
  if (data.alexFormula) parts.push('</g>');
  const composition = input.composition?.op === 'sum' ? compositionFactors(input.composition) : null;
  if (composition) {
    parts.push('<g data-composition="alexander">');
    flow(
      [
        ...plain(composition.alex.every(({ value }) => value !== null) ? 'Δ = ' : 'Δ factors: '),
        ...composition.alex.flatMap(({ value, power }) => [
          ...plain('('),
          ...(value === null ? plain('not computed') : polynomial(value)),
          ...plain(')'),
          ...(power > 1 ? [{ text: String(power), script: 'super' as const }] : []),
        ]),
      ],
      MARGIN + 144,
      15.5,
      TEXT_WIDTH - 144,
      muted,
    );
    parts.push('</g>');
    y += 9;
  }
  // det with its factorisation, and lk with its count, read as one line as on screen
  const quiet = (runs: Runs): Runs => runs.map((run) => ({ ...run, fill: muted }));
  row(plain('det'), [
    ...plain(String(D.det)),
    ...(data.composite
      ? quiet([
          ...plain('  = '),
          ...factors(),
          ...(data.factors.rest > 1n ? plain(` · ${data.factors.rest}`) : []),
        ])
      : []),
  ]);
  const detFactors = input.composition ? compositionDetFactors(input.composition, data.factors) : [];
  if (detFactors.length) {
    parts.push('<g data-composition="det">');
    flow(
      [
        ...plain('det = '),
        ...detFactors.flatMap(({ value, power }, i) => [
          ...(i ? plain(' · ') : []),
          ...plain(String(value)),
          ...(power > 1 ? [{ text: String(power), script: 'super' as const }] : []),
        ]),
      ],
      MARGIN + 144,
      15.5,
      TEXT_WIDTH - 144,
      muted,
    );
    parts.push('</g>');
    y += 9;
  }
  row(plain('writhe'), plain(signed(D.writhe)));
  for (const q of D.pairs) {
    row(
      [...plain('lk('), ...variable('K', q.i + 1), ...plain(', '), ...variable('K', q.j + 1), ...plain(')')],
      [...plain(signed(q.lk)), ...quiet(plain(`   ½(${q.rh} − ${q.lh})`))],
    );
  }
  if (D.pairs.length > 1)
    row([{ text: 'lk(' }, { text: 'L', italic: true }, { text: ')' }], plain(signed(D.totalLk)));
  if (data.triple) {
    parts.push('<g data-triple-product="true">');
    row(
      [{ text: 'I', italic: true }],
      [
        ...plain(integer(data.triple.value)),
        ...quiet(
          plain(`  = ${data.triple.factors.map((v) => (v < 0 ? `(${integer(v)})` : String(v))).join(' · ')}`),
        ),
      ],
    );
    flow(
      [
        ...variable('lk', '12'),
        ...plain(' · '),
        ...variable('lk', '23'),
        ...plain(' · '),
        ...variable('lk', '31'),
      ],
      MARGIN + 144,
      14,
      TEXT_WIDTH - 144,
      muted,
    );
    parts.push('</g>');
  }

  if (input.surface) {
    const surface = input.surface;
    y += 36;
    parts.push('<g data-kind="seifert">');
    parts.push(
      `<line x1="${MARGIN}" y1="${y - 1}" x2="${WIDTH - MARGIN}" y2="${y - 1}" stroke="${line}" stroke-width="0.75"/>`,
    );
    parts.push(
      svgText(plain('Seifert'), MARGIN, y + 17, 13, 120, {
        family: ui,
        weight: 500,
        attrs: 'data-heading="seifert"',
      }),
    );
    parts.push(
      svgText(
        [
          { text: 'g', italic: true },
          ...plain('('),
          { text: 'S', italic: true },
          ...plain(`) = ${surface.genus}`),
        ],
        WIDTH - MARGIN,
        y + 17,
        17,
        TEXT_WIDTH - 140,
        { anchor: 'end', attrs: 'data-result="seifert"' },
      ),
    );
    y += 33;
    const formula = (value: string): Runs =>
      value
        .split(/([scBkSgKL])/)
        .filter(Boolean)
        .map((text) => ({ text, italic: /^[scBkSgKL]$/.test(text) }));
    for (const item of seifertLines(surface)) {
      parts.push(`<g data-seifert-value="${item.key}">`);
      if (item.label) row(plain(item.label), formula(item.value));
      else flow(formula(item.value), MARGIN, 17);
      parts.push('</g>');
    }
    parts.push('</g>');
  }
  y += 22;
  const noOddPrime = data.answer.startsWith('Not ');
  const primes =
    D.det === 0n
      ? data.chips.map((q) => q.p)
      : [
          ...data.chips.filter((q) => q.p !== 2).map((q) => q.p),
          ...data.largePrimes,
          ...data.chips.filter((q) => q.p === 2).map((q) => q.p),
        ];
  const primeChoices: Runs = primes.flatMap((prime, i) => [
    ...(i ? plain('   ') : []),
    { text: String(prime), weight: info?.colorable && BigInt(prime) === BigInt(p) ? 600 : 400 },
  ]);
  row(
    [{ text: 'p', italic: true }, { text: '-colorable' }],
    D.det === 0n
      ? [...plain('every '), { text: 'p', italic: true }]
      : noOddPrime
        ? plain('no odd prime')
        : primeChoices,
  );
  if (D.det === 0n) flow(primeChoices, MARGIN + 144, 17, TEXT_WIDTH - 144);
  if (noOddPrime) {
    flow(
      [...plain(`det = ${D.det}`), ...(data.composite ? [...plain(' = '), ...factors()] : [])],
      MARGIN + 144,
      14.62,
      TEXT_WIDTH - 144,
      muted,
    );
    if (data.chips.length) flow(primeChoices, MARGIN + 144, 17, TEXT_WIDTH - 144);
  }
  if (labels && info?.colorable) {
    row([{ text: 'rank' }, { text: String(p), script: 'sub' }], plain(String(info.rank)));
    row(plain('labelings'), [
      ...plain(String(info.count)),
      ...[
        ...plain(` = ${p}(${p}`),
        { text: String(info.rank), script: 'super' as const },
        ...plain(' − 1)'),
      ].map((run) => ({ ...run, fill: muted })),
    ]);
    // Wrap the labeling on a fixed grid: generous cells prevent either dots
    // or multi-digit values colliding, regardless of font advance estimates.
    const cell = Math.max(
      126,
      ...labels.map((v, i) => advance([...variable('x', i + 1), ...plain(` = ${v}`)], 17) + 32),
    );
    const columns = Math.max(1, Math.floor(TEXT_WIDTH / cell));
    labels.forEach((v, i) => {
      const x = MARGIN + (i % columns) * (TEXT_WIDTH / columns),
        top = y + Math.floor(i / columns) * 30;
      const color = oklchToHex(
        p >= 11 && v % 2 === 1 ? 0.47 : 0.6,
        0.17,
        Math.round(25 + (360 * v) / p) % 360,
      );
      parts.push(`<circle cx="${x + 4}" cy="${top + 12}" r="3.5" fill="${color}"/>`);
      parts.push(
        svgText(
          [...variable('x', i + 1), ...plain(` = ${v}`)],
          x + 16,
          top + 17,
          17,
          TEXT_WIDTH / columns - 28,
          { attrs: `data-label="${i}"` },
        ),
      );
    });
    y += Math.ceil(labels.length / columns) * 30;
  } else if (input.tryP !== '') {
    if (!info) note(t('readout.prime'));
    else row(plain(`mod ${p}`), plain('not colorable'));
    if (info) flow(plain(`det = ${D.det} ≢ 0 (mod ${p})`), MARGIN + 144, 14.62, TEXT_WIDTH - 144, muted);
  }

  // Keep every block's result on the same right edge. Width estimates decide
  // whether it shares the name's baseline; they never set the text's advance.
  const heading = (name: string, kind: string, result: Runs) => {
    y += 36;
    let baseline = y + 17;
    parts.push(
      `<line x1="${MARGIN}" y1="${baseline - 18}" x2="${WIDTH - MARGIN}" y2="${baseline - 18}" stroke="${line}" stroke-width="0.75"/>`,
      svgText(plain(name), MARGIN, baseline, 13, TEXT_WIDTH, {
        family: ui,
        weight: 500,
        attrs: `data-heading="${kind}"`,
      }),
    );
    if (advance(plain(name), 13) + 36 + advance(result, 17) > TEXT_WIDTH) baseline += 22;
    const lines = wrap(result, 17, TEXT_WIDTH);
    lines.forEach((runs, i) => {
      if (i) baseline += 22;
      parts.push(
        svgText(runs, WIDTH - MARGIN, baseline, 17, TEXT_WIDTH, {
          anchor: 'end',
          attrs: `data-result="${kind}"`,
        }),
      );
    });
    y = baseline + 16;
  };
  const measureMatrix = (cells: Runs[][], reduced: boolean, working = false, offset = 0) => {
    const n = cells.length,
      size = 15.5,
      pitch = 28;
    const cellWidth = Math.max(46, ...cells.flat().map((runs) => advance(runs, size) + 24));
    const labelWidth = reduced ? 16 : 50;
    const fullWidth = labelWidth + n * cellWidth + 16,
      fullHeight = (working ? 0 : 28) + n * pitch;
    const s = Math.min(1, (TEXT_WIDTH - offset) / fullWidth);
    return { n, size, pitch, cellWidth, labelWidth, s, width: (fullWidth - 16) * s, height: fullHeight * s };
  };
  const matrix = (name: string, cells: Runs[][], reduced = false, pivots: number[] = [], offset = 0) => {
    const working = name === 'working';
    const { n, size, pitch, cellWidth, labelWidth, s, height } = measureMatrix(
      cells,
      reduced,
      working,
      offset,
    );
    const top = working ? 0 : 28;
    parts.push(`<g data-matrix="${name}" transform="translate(${MARGIN + offset} ${y}) scale(${s})">`);
    for (let j = 0; !working && j < n; j++)
      parts.push(
        svgText(variable('x', j + 1), labelWidth + (j + 0.5) * cellWidth, 16, 13, cellWidth - 16, {
          anchor: 'middle',
          fill: !reduced && j === choice.column ? faint : muted,
          attrs: `data-column="${j}"`,
        }),
      );
    for (let r = 0; r < n; r++) {
      const cross = D.rows[r];
      if (!reduced)
        parts.push(
          svgText(
            plain(cross ? `${cross.num}${name === 'alexander' ? (cross.sign > 0 ? ' +' : ' −') : ''}` : 'R1'),
            labelWidth - 12,
            28 + r * pitch + 19,
            11.5,
            labelWidth - 16,
            { family: ui, anchor: 'end', fill: muted, attrs: `data-row="${r}"` },
          ),
        );
      cells[r].forEach((runs, j) => {
        const zero = runs.map((run) => run.text).join('') === '0';
        const deleted = !reduced && (j === choice.column || r === choice.row);
        const x = labelWidth + (j + 0.5) * cellWidth;
        if (zero) {
          parts.push(
            `<circle class="zero" data-entry="${r},${j}"${deleted ? ' data-deleted="true"' : ''} aria-label="0" cx="${x}" cy="${top + (r + 0.5) * pitch}" r="1.1" fill="${deleted ? faint : muted}"/>`,
          );
          return;
        }
        parts.push(
          svgText(runs, x, top + r * pitch + 19, size, cellWidth - 18, {
            anchor: 'middle',
            fill: deleted ? faint : ink,
            weight: pivots[r] === j ? 600 : 400,
            attrs: `data-entry="${r},${j}"${deleted ? ' data-deleted="true"' : ''}`,
          }),
        );
      });
    }
    const left = labelWidth,
      right = labelWidth + n * cellWidth,
      bottom = top + n * pitch;
    parts.push(
      `<path d="M${left + 7},${top} Q${left},${top} ${left},${top + 7} V${bottom - 7} Q${left},${bottom} ${left + 7},${bottom} M${right - 7},${top} Q${right},${top} ${right},${top + 7} V${bottom - 7} Q${right},${bottom} ${right - 7},${bottom}" fill="none" stroke="${ink}" stroke-width="1.25"/></g>`,
    );
    y += height;
  };
  heading('Coloring matrix', 'coloring', [
    ...plain('det '),
    { text: 'A', italic: true },
    ...plain(`″ = ${integer(selected.detSigned)}`),
    ...(selected.integerNormalizedDiffers
      ? [
          ...plain(' '),
          ...quiet(plain('→')),
          ...plain(' det('),
          { text: D.nComps > 1 ? 'L' : 'K', italic: true },
          ...plain(`) = ${D.det}`),
        ]
      : []),
  ]);
  matrix(
    'coloring',
    D.A.map((r) => r.map((v) => plain(integer(v)))),
  );
  if (!defaultChoice) {
    y += 28 - 14.5;
    parts.push('<g data-minor-relation="coloring">');
    flow(
      [
        ...plain('det '),
        { text: 'A', italic: true },
        ...plain('″ = det '),
        { text: 'A', italic: true },
        ...plain('″'),
        { text: 'default', script: 'sub' },
        ...plain(
          selected.integerRelation === 'negative'
            ? ' × (−1)'
            : selected.integerRelation === 'same'
              ? ' × 1'
              : selected.integerRelation === 'zero'
                ? ' = 0'
                : '',
        ),
      ],
      MARGIN,
      14.5,
      TEXT_WIDTH,
      muted,
      math,
      22,
    );
    parts.push('</g>');
  }

  if (input.showReduction) {
    const reduction = reduceModP(D, p);
    heading('Reduction', 'reduction', [
      ...plain('rank'),
      { text: String(p), script: 'sub' },
      ...plain(` = ${reduction.free.length}`),
    ]);
    const cells = reduction.rref.map((r) => r.map((v) => plain(String(v))));
    const lines: Runs[] = [
      reduction.free.length
        ? [
            ...plain('free: '),
            ...reduction.free.flatMap((column, i) => [
              ...(i ? plain(', ') : []),
              ...variable('x', column + 1),
            ]),
          ]
        : plain('no free variable'),
    ];
    if (reduction.free.length)
      for (const { column, terms } of reduction.expressions)
        lines.push([
          ...variable('x', column + 1),
          ...plain(' ≡ '),
          ...(terms.length
            ? terms.flatMap((term, i) => [
                ...(i ? plain(' + ') : []),
                ...(term.coefficient !== 1 ? plain(String(term.coefficient)) : []),
                ...variable('x', term.column + 1),
              ])
            : plain('0')),
        ]);
    const { width, height } = measureMatrix(cells, true);
    const beside = width + 36 + Math.max(...lines.map((runs) => advance(runs, 15.5))) <= TEXT_WIDTH;
    const top = y;
    matrix('reduction', cells, true, reduction.pivots);
    const x = beside ? MARGIN + width + 36 : MARGIN;
    const available = beside ? TEXT_WIDTH - width - 36 : TEXT_WIDTH;
    const wrapped = lines.flatMap((runs, i) =>
      wrap(runs, 15.5, available).map((runs) => ({ runs, free: i === 0 })),
    );
    // Centre the complete line boxes, including the scripts, beside the matrix.
    // A taller set of relations also grows the block before the next divider.
    const linesHeight = wrapped.length * 22;
    const linesTop = beside ? top + Math.max(0, (height - linesHeight) / 2) : y + 28 - 15.5;
    wrapped.forEach(({ runs, free }, i) =>
      parts.push(
        svgText(runs, x, linesTop + 15.5 + i * 22, 15.5, available, {
          fill: free ? muted : ink,
          attrs: `data-relation="${free ? 'free' : 'pivot'}"`,
        }),
      ),
    );
    y = Math.max(y, linesTop + linesHeight);
  }

  if (labels) {
    heading('Check', 'check', [
      ...plain('2'),
      { text: 'x', italic: true },
      ...plain(' − '),
      { text: 'y', italic: true },
      ...plain(' − '),
      { text: 'z', italic: true },
      ...plain(' ≡ 0 '),
      ...quiet(plain(`(mod ${p})`)),
    ]);
    const checks = input.checks.map(({ x, a, b, c, sum }) => ({
      x,
      equation: [
        ...plain('2'),
        ...variable('x', x.overArc + 1),
        ...plain(' − '),
        ...variable('x', x.inArc + 1),
        ...plain(' − '),
        ...variable('x', x.outArc + 1),
      ],
      result: plain(`2·${a} − ${b} − ${c} = ${integer(sum)} ≡ 0`),
    }));
    const equationWidth = Math.max(0, ...checks.map((check) => advance(check.equation, 15.5)));
    const resultWidth = Math.max(0, ...checks.map((check) => advance(check.result, 15.5)));
    const columnsFit = 50 + equationWidth + 22 + resultWidth <= TEXT_WIDTH;
    // Fix both column starts for the whole table. If long values cannot fit,
    // put every numeric result on its own line instead of narrowing the gap.
    for (const { x, equation, result } of checks) {
      parts.push(`<g data-check="${x.num}">`);
      parts.push(svgText(plain(String(x.num)), MARGIN, y + 15.5, 11.5, 32, { family: ui, fill: muted }));
      if (columnsFit) {
        parts.push(svgText(equation, MARGIN + 50, y + 15.5, 15.5, equationWidth));
        parts.push(
          svgText(result, MARGIN + 50 + equationWidth + 22, y + 15.5, 15.5, resultWidth, { fill: muted }),
        );
        y += 23.25;
      } else {
        flow(equation, MARGIN + 50, 15.5, TEXT_WIDTH - 50);
        flow(result, MARGIN + 50, 15.5, TEXT_WIDTH - 50, muted);
      }
      parts.push('</g>');
      y += 9;
    }
  }

  heading(
    'Alexander matrix',
    'alexander',
    input.composition?.op === 'split'
      ? [...plain('Δ('), { text: 't', italic: true }, ...plain(') = '), ...plain('0')]
      : selected.alex !== null && selected.alexRaw !== null
        ? [
            ...plain('det = '),
            ...polynomial(selected.alexRaw),
            ...(selected.alexNormalizedDiffers
              ? [
                  ...plain(' '),
                  ...quiet(plain('→')),
                  ...plain(' Δ('),
                  { text: 't', italic: true },
                  ...plain(') = '),
                  ...polynomial(selected.alex),
                ]
              : []),
          ]
        : plain('—'),
  );
  if (selected.alex !== null && selected.alexRaw !== null) {
    matrix(
      'alexander',
      D.AT.map((r) => r.map((v) => polynomial(v, true))),
    );
    y += 28 - 14.5;
    const relation = selected.alexanderRelation;
    const relationRuns: Runs = defaultChoice
      ? []
      : relation.kind === 'unit'
        ? [
            ...plain('det '),
            { text: 'A', italic: true },
            ...plain('″ = det '),
            { text: 'A', italic: true },
            ...plain('″'),
            { text: 'default', script: 'sub' },
            ...plain(' × ('),
            ...(relation.unit.sign < 0 ? plain('−') : []),
            ...(relation.unit.power === 0
              ? plain('1')
              : [
                  { text: 't', italic: true },
                  ...(relation.unit.power !== 1
                    ? [{ text: integer(relation.unit.power), script: 'super' as const }]
                    : []),
                ]),
            ...plain(')'),
          ]
        : relation.kind === 'zero'
          ? plain('det A″ = det A″default = 0')
          : plain(t('minor.different'));
    parts.push('<g data-minor-relation="alexander">');
    flow(
      [
        ...relationRuns,
        ...(relationRuns.length ? plain('    ') : []),
        ...plain(`|Δ(−1)| = ${data.alexAtMinusOne}`),
      ],
      MARGIN,
      14.5,
      TEXT_WIDTH,
      muted,
      math,
      22,
    );
    parts.push('</g>');
  } else note(t(input.composition?.op === 'split' ? 'composition.splitCutoff' : 'matrix.limit'));

  if (input.working) {
    const { kind, expanded } = input.working;
    const determinant =
      kind === 'coloring'
        ? plain(integer(selected.detSigned))
        : selected.alexRaw === null
          ? plain('—')
          : polynomial(selected.alexRaw);
    heading('Working', 'working', [
      ...plain('det '),
      { text: 'A', italic: true },
      ...plain('″ = '),
      ...determinant,
    ]);
    flow(plain(kind === 'coloring' ? 'Coloring' : 'Alexander'), MARGIN, 13, TEXT_WIDTH, muted, ui);
    const derivation = <T extends bigint | Poly>(work: Working<T>, format: (v: T) => Runs) => {
      const { entries, hidden, count } = workingFold(work, expanded);
      const hiddenProduct = hidden
        ? workingRangeProduct(
            workingEntries(work).map((entry) => entry.step),
            3,
            count - 2,
          )
        : null;
      entries.forEach(({ step, branch, depth, index }, i) => {
        if (hidden && i === 3) {
          parts.push('<g data-working-more="true">');
          const unitProduct =
            hiddenProduct!.power === 0 && hiddenProduct!.value.length === 1 && hiddenProduct!.value[0] === 1n;
          flow(
            [
              { text: t('working.more', { n: hidden }), family: ui },
              ...(!unitProduct
                ? [
                    ...plain('  × ('),
                    ...polynomial(hiddenProduct!.value),
                    ...(hiddenProduct!.power !== 0
                      ? [
                          { text: 't', italic: true },
                          { text: integer(hiddenProduct!.power), script: 'super' as const },
                        ]
                      : []),
                    ...plain(')'),
                  ]
                : []),
            ],
            MARGIN,
            13,
            TEXT_WIDTH,
            muted,
            math,
          );
          parts.push('</g>');
          y += 14;
        }
        const op = step.operation;
        const at = (axis: 'row' | 'column', n: number): Runs => [
          ...plain(axis === 'row' ? 'R' : 'C'),
          { text: String(n + 1), script: 'sub' },
        ];
        let operation: Runs;
        switch (op.kind) {
          case 'start':
            operation = branch
              ? [
                  ...plain(`${t('working.cofactor', { row: branch.row + 1 })}: (`),
                  ...format(branch.coefficient),
                  ...plain(') · det '),
                  { text: 'M', italic: true },
                ]
              : plain('A″');
            break;
          case 'swap':
            operation = [
              ...at(op.axis, op.a),
              ...plain(' ↔ '),
              ...at(op.axis, op.b),
              ...quiet(plain(' × (−1)')),
            ];
            break;
          case 'add':
            operation = [
              ...at(op.axis, op.target),
              ...plain(' ← '),
              ...at(op.axis, op.target),
              ...plain(' + ('),
              ...format(op.coefficient),
              ...plain(')·'),
              ...at(op.axis, op.source),
            ];
            break;
          case 'scale':
            operation = [
              ...at('row', op.row),
              ...plain(' ← ('),
              ...format(op.coefficient),
              ...plain(')·'),
              ...at('row', op.row),
              ...quiet([
                ...plain(' × '),
                { text: 't', italic: true },
                { text: integer(step.multiplierPower), script: 'super' },
              ]),
            ];
            break;
          case 'expand':
            operation = [
              ...plain(t('working.expand', { column: op.column + 1 })),
              ...quiet([...plain(' × ('), ...format(step.multiplier), ...plain(')')]),
            ];
            break;
          case 'cofactors':
            operation = [
              ...plain(`${t('working.expand', { column: op.column + 1 })}: `),
              ...(op.terms.length
                ? op.terms.flatMap((term, j) => [
                    ...(j ? plain(' + ') : []),
                    ...plain('('),
                    ...format(term.coefficient),
                    ...plain(')·('),
                    ...format(term.working.determinant),
                    ...plain(')'),
                  ])
                : plain('0')),
            ];
            break;
          case 'evaluate':
            operation = [...plain('det ('), ...format(op.value), ...plain(') = '), ...format(op.value)];
            break;
        }
        const offset = depth ? 14 : 0;
        parts.push(`<g data-working-step="${index}" data-depth="${depth}">`);
        flow(operation, MARGIN + offset, 15.5, TEXT_WIDTH - offset, ink, math, 23.25);
        if (op.kind !== 'evaluate') {
          y += 6;
          if (step.matrix.length)
            matrix(
              'working',
              step.matrix.map((r) => r.map(format)),
              true,
              [],
              offset,
            );
          else note(t('working.empty'));
        }
        parts.push('</g>');
        y += 14;
      });
      if (expanded && count > 8) flow(plain(t('working.less')), MARGIN, 13, TEXT_WIDTH, muted, ui);
      parts.push(`<g data-working-final="true"><title>${escape(t('working.product'))}</title>`);
      flow(
        [
          ...workingFactors(work).flatMap(({ value, power }, i) => [
            ...(i ? plain(' · ') : []),
            ...(power
              ? [
                  { text: 't', italic: true },
                  { text: integer(power), script: 'super' as const },
                ]
              : [...plain('('), ...format(value), ...plain(')')]),
          ]),
          ...plain(' = '),
          ...format(work.determinant),
        ],
        MARGIN,
        18,
        TEXT_WIDTH,
      );
      parts.push('</g>');
    };
    if (kind === 'coloring') derivation(integerWorking(selected.A), (v) => plain(integer(v)));
    else if (selected.alexRaw !== null) derivation(polynomialWorking(selected.AT), (v) => polynomial(v));
    else note(t('matrix.limit'));
  }
  return finish();
}
