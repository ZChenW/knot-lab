import { factorize, isPrime, pEval, polynomialOrder, type Analysis, type Poly } from './knot';
import { seifertLines, type SeifertNumbers } from './seifert';
import { reduceModP } from './reduction';
import { compositionDetFactors, compositionFactors, type Composition } from './operations';
import { chosenMinor, type MinorChoice } from './minors';
import {
  integerWorking,
  polynomialWorking,
  type Working,
  type WorkingOperation,
  type WorkingKind,
} from './working';

export type LatexKind = 'coloring' | 'reduction' | 'alexander' | 'check' | 'working' | 'seifert';

export function polyLatex(p: Poly): string {
  const order = polynomialOrder(p);
  if (!order.length) return '0';
  return order
    .map((degree, i) => {
      const c = p[degree],
        a = c < 0n ? -c : c;
      const sign = i ? (c < 0n ? ' - ' : ' + ') : c < 0n ? '-' : '';
      return (
        sign +
        (degree === 0 || a !== 1n ? String(a) : '') +
        (degree ? (degree === 1 ? 't' : `t^{${degree}}`) : '')
      );
    })
    .join('');
}

function matrixLatex<T>(M: T[][], format: (value: T) => string): string {
  return (
    'A = \\begin{pmatrix}\n' +
    M.map((row) => row.map(format).join(' & ')).join(' \\\\\n') +
    '\n\\end{pmatrix}'
  );
}

export function compositionLatex(
  composition: Composition,
  kind: 'coloring' | 'alexander',
  det = composition.left.det * composition.right.det,
): string {
  if (composition.op !== 'sum') return '';
  const factors = compositionFactors(composition);
  const exponent = (power: number) => (power > 1 ? `^{${power}}` : '');
  if (kind === 'coloring') {
    const detFactors = compositionDetFactors(composition, factorize(det));
    return detFactors.length
      ? `\\det = ${detFactors.map(({ value, power }) => `${value}${exponent(power)}`).join(' \\cdot ')}`
      : '';
  }
  const label = factors.alex.every(({ value }) => value !== null)
    ? '\\Delta(t) = '
    : '\\text{Alexander factors: }';
  return `${label}${factors.alex.map(({ value, power }) => `\\left(${value === null ? '\\text{not computed}' : polyLatex(value)}\\right)${exponent(power)}`).join('')}`;
}

export function coloringLatex(D: Analysis, composition?: Composition | null): string {
  const factor = composition && compositionLatex(composition, 'coloring', D.det);
  return `${matrixLatex(D.A, String)}\n\\det(${D.nComps > 1 ? 'L' : 'K'}) = |\\det A''| = ${D.det}${factor ? `\n${factor}` : ''}`;
}

export function alexanderLatex(D: Analysis, composition?: Composition | null): string {
  const matrix = matrixLatex(D.AT, polyLatex);
  const working = composition ? compositionLatex(composition, 'alexander') : '';
  const factor = working ? `\n${working}` : '';
  if (D.alexRaw === null || D.alex === null)
    return matrix + (composition?.op === 'split' ? '\n\\Delta(t) = 0' : factor);
  const value = pEval(D.alex, -1n);
  return (
    `${matrix}\n\\det A'' = ${polyLatex(D.alexRaw)}\n` +
    `\\Delta(t) = ${polyLatex(D.alex)}, \\quad |\\Delta(-1)| = ${value < 0n ? -value : value}${factor}`
  );
}

export function checkLatex(D: Analysis, labels: number[], p: number): string {
  const lines = D.rows
    .filter((x) => x !== null)
    .map((x) => {
      const a = labels[x.overArc],
        b = labels[x.inArc],
        c = labels[x.outArc];
      return (
        `2x_{${x.overArc + 1}} - x_{${x.inArc + 1}} - x_{${x.outArc + 1}} &= ` +
        `2\\cdot ${a} - ${b} - ${c} = ${2 * a - b - c} \\equiv 0 \\pmod{${p}}`
      );
    });
  return '\\begin{aligned}\n' + lines.join(' \\\\\n') + '\n\\end{aligned}';
}

// 14.G
export function reductionLatex(D: Analysis, p: number): string {
  const reduction = reduceModP(D, p);
  const variable = (column: number) => `x_{${column + 1}}`;
  const lines = [
    reduction.free.length
      ? `\\text{free: } ${reduction.free.map(variable).join(', ')}`
      : '\\text{no free variable}',
    ...(reduction.free.length
      ? reduction.expressions.map(
          ({ column, terms }) =>
            `${variable(column)} \\equiv ${terms.length ? terms.map(({ column: f, coefficient }) => `${coefficient === 1 ? '' : coefficient}${variable(f)}`).join(' + ') : '0'} \\pmod{${p}}`,
        )
      : []),
    `\\operatorname{rank}_{${p}} = ${reduction.free.length}`,
    `x_{${D.nArcs}} = 0; \\quad \\text{every labeling is one of these plus a constant}`,
  ];
  return (
    matrixLatex(reduction.rref, String).replace(/^A = /, '\\operatorname{rref}_{' + p + "}(A'') = ") +
    '\n' +
    lines.join('\n')
  );
}

export function blockLatex(
  D: Analysis,
  labels: number[] | null,
  p: number,
  kind: LatexKind,
  showReduction = labels !== null,
  composition?: Composition | null,
  choice?: MinorChoice,
  workingKind: WorkingKind = 'coloring',
  surface?: SeifertNumbers,
): string | null {
  switch (kind) {
    case 'seifert':
      return surface ? seifertLatex(surface) : null;
    case 'coloring':
      return choice ? selectedLatex(D, choice, 'coloring', composition) : coloringLatex(D, composition);
    case 'alexander':
      return choice ? selectedLatex(D, choice, 'alexander', composition) : alexanderLatex(D, composition);
    case 'check':
      return labels ? checkLatex(D, labels, p) : null;
    case 'reduction':
      return showReduction && D.nArcs > 0 && isPrime(p) ? reductionLatex(D, p) : null;
    case 'working': {
      const selected = chosenMinor(D, choice);
      return workingKind === 'coloring'
        ? workingLatex(integerWorking(selected.A), String)
        : selected.alexRaw === null
          ? null
          : workingLatex(polynomialWorking(selected.AT), polyLatex);
    }
  }
}

// 19.B
function selectedLatex(
  D: Analysis,
  choice: MinorChoice,
  kind: WorkingKind,
  composition?: Composition | null,
): string {
  const minor = chosenMinor(D, choice);
  const deletion = `\\text{delete row ${choice.row + 1}, column ${choice.column + 1}}`;
  const factors = composition ? compositionLatex(composition, kind, D.det) : '';
  const result =
    kind === 'coloring'
      ? `\\det A'' = ${minor.detSigned}, \\quad \\det(${D.nComps > 1 ? 'L' : 'K'}) = ${D.det}`
      : minor.alexRaw === null
        ? composition?.op === 'split'
          ? '\\Delta(t) = 0'
          : '\\text{not computed}'
        : `\\det A'' = ${polyLatex(minor.alexRaw)}, \\quad \\Delta(t) = ${polyLatex(minor.alex!)}`;
  const reduced = (
    kind === 'coloring' ? matrixLatex(minor.A, String) : matrixLatex(minor.AT, polyLatex)
  ).replace(/^A = /, "A'' = ");
  return `${kind === 'coloring' ? matrixLatex(D.A, String) : matrixLatex(D.AT, polyLatex)}\n${deletion}\n${reduced}\n${result}${factors ? `\n${factors}` : ''}`;
}

export function workingOperationLatex<T>(op: WorkingOperation<T>, format: (v: T) => string): string {
  const variable = (axis: 'row' | 'column', i: number) => `${axis === 'row' ? 'R' : 'C'}_{${i + 1}}`;
  switch (op.kind) {
    case 'start':
      return "A''";
    case 'swap':
      return `${variable(op.axis, op.a)} \\leftrightarrow ${variable(op.axis, op.b)}`;
    case 'add':
      return `${variable(op.axis, op.target)} \\leftarrow ${variable(op.axis, op.target)} + \\left(${format(op.coefficient)}\\right) ${variable(op.axis, op.source)}`;
    case 'scale':
      return `R_{${op.row + 1}} \\leftarrow \\left(${format(op.coefficient)}\\right) R_{${op.row + 1}}`;
    case 'expand':
    case 'cofactors':
      return `\\text{expand along column ${op.column + 1}}`;
    case 'evaluate':
      return `\\det\\left(${format(op.value)}\\right) = ${format(op.value)}`;
  }
}

export function workingLatex<T>(work: Working<T>, format: (v: T) => string): string {
  const lines: string[] = [];
  const visit = (current: Working<T>, name = "A''") => {
    for (const step of current.steps) {
      if (step.operation.kind === 'evaluate') {
        lines.push(`${workingOperationLatex(step.operation, format)} &`);
        continue;
      }
      if (step.operation.kind === 'cofactors') {
        lines.push(
          `${workingOperationLatex(step.operation, format)} &: \\sum_i (-1)^{i+j} a_{ij}\\det M_{ij}`,
        );
        for (const term of step.operation.terms) {
          lines.push(
            `\\text{cofactor row ${term.row + 1}} &: \\left(${format(term.coefficient)}\\right)\\det M`,
          );
          visit(term.working, `M_{${term.row + 1},${step.operation.column + 1}}`);
        }
      }
      const matrix = step.matrix.length
        ? matrixLatex(step.matrix, format).replace(/^A = /, '')
        : '\\begin{pmatrix}\\end{pmatrix}';
      const factor = (v: T, power: number) => `\\left(${format(v)}\\right)${power ? `t^{${power}}` : ''}`;
      lines.push(
        `${step.operation.kind === 'start' ? name : workingOperationLatex(step.operation, format)} &:\\quad ${matrix},\\quad \\times${factor(step.multiplier, step.multiplierPower)},\\quad \\det ${name} = ${factor(step.product, step.productPower)}\\det M`,
      );
    }
    lines.push(`\\det ${name} &= ${format(current.determinant)}`);
  };
  visit(work);
  return '\\begin{aligned}\n' + lines.join(' \\\\\n') + '\n\\end{aligned}';
}

export function seifertLatex(surface: SeifertNumbers): string {
  const tex = (value: string) => value.replace(/χ/g, '\\chi').replace(/−/g, '-').replace(/≤/g, '\\le');
  const lines = seifertLines(surface).map((line) =>
    line.label ? `\\text{${line.label}} &\\quad ${tex(line.value)}` : tex(line.value).replace(' = ', ' &= '),
  );
  return '\\begin{aligned}\n' + lines.join(' \\\\\n') + '\n\\end{aligned}';
}
