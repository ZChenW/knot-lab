import type { Triangulation } from './triangulation';
export interface TriangleLine {
  key: string;
  label?: string;
  value: string;
  part?: number;
  problem?: number;
  problems?: number[];
}
const minus = (n: number) => String(n).replace('-', '−');
export function triangleLines(
  s: Triangulation,
  delta: [number, number, number] | null = null,
): TriangleLine[] {
  const lines: TriangleLine[] = [
    { key: 'vertices', label: 'vertices', value: `V = ${s.V}` },
    { key: 'edges', label: 'edges', value: `E = ${s.E}` },
    { key: 'faces', label: 'faces', value: `F = ${s.F}` },
    { key: 'chi', value: `χ = V − E + F = ${minus(s.chi)}` },
  ];
  if (delta)
    lines.push({
      key: 'delta',
      value: `ΔV − ΔE + ΔF = ${minus(delta[0])} − ${minus(delta[1])} + ${minus(delta[2])} = ${minus(delta[0] - delta[1] + delta[2])}`,
    });
  if (s.problems.length) {
    const kinds = new Map<string, number[]>();
    s.problems.forEach((p, i) => kinds.set(p.kind, [...(kinds.get(p.kind) ?? []), i]));
    const rank = (i: number) =>
      s.problems[i].condition * 2 - Number(s.problems[i].kind === 'triangles overlap');
    return [
      ...lines,
      { key: 'invalid', value: 'not a surface' },
      ...[...kinds.values()]
        .sort((a, b) => rank(a[0]) - rank(b[0]))
        .map((indices) => ({
          key: `problem:${indices[0]}`,
          value: `${s.problems[indices[0]].kind}${indices.length > 1 ? ` × ${indices.length}` : ''}`,
          problem: indices[0],
          problems: indices,
        })),
    ];
  }
  if (s.pieces > 1) lines.push({ key: 'pieces', label: 'pieces', value: `k = ${s.pieces}` });
  s.parts.forEach((p, i) => {
    const suffix = s.pieces > 1 ? ` (S${i + 1})` : '';
    lines.push(
      { key: `boundary:${i}`, label: `boundary${suffix}`, value: `B = ${p.B}`, part: i },
      {
        key: `orientation:${i}`,
        value: `${s.pieces > 1 ? `S${i + 1} · ` : ''}${p.orientable ? 'orientable' : 'non-orientable'}`,
        part: i,
      },
    );
    if (p.type) lines.push({ key: `type:${i}`, label: `surface${suffix}`, value: p.type, part: i });
  });
  return lines;
}
export function triangulationLatex(s: Triangulation, delta: [number, number, number] | null = null) {
  const value = (line: TriangleLine) => {
    if (line.key.startsWith('orientation:')) {
      const match = /^(S\d+ · )?(.*)$/.exec(line.value)!;
      return `${line.part !== undefined && s.pieces > 1 ? `S_{${line.part + 1}}\\quad ` : ''}\\text{${match[2]}}`;
    }
    if (line.problem !== undefined)
      return `\\text{${s.problems[line.problem].kind}}${line.problems!.length > 1 ? ` \\times ${line.problems!.length}` : ''}`;
    if (line.key === 'invalid' || (line.key.startsWith('type:') && !line.value.startsWith('g =')))
      return `\\text{${line.value}}`;
    return line.value.replaceAll('χ', '\\chi').replaceAll('Δ', '\\Delta ').replaceAll('−', '-');
  };
  return `\\begin{aligned}\n${triangleLines(s, delta)
    .map((l) => `${l.label ? `\\text{${l.label}}` : ''} & ${value(l)}`)
    .join(' \\\\\n')}\n\\end{aligned}`;
}
