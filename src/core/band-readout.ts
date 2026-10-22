import type { BandNumbers } from './bands';
export function bandLines(S: BandNumbers) {
  return [
    { key: 'disks', label: 'disks', value: `d = ${S.disks}` },
    { key: 'bands', label: 'bands', value: `n = ${S.bands}` },
    { key: 'boundary', label: 'boundary', value: `B = ${S.boundary}` },
    ...(S.pieces > 1 ? [{ key: 'pieces', label: 'pieces', value: `k = ${S.pieces}` }] : []),
    { key: 'chi', value: `χ = d − n = ${String(S.chi).replace('-', '−')}` },
    ...S.parts.flatMap((p, i) => [
      {
        key: `orientation:${i}`,
        value: `${S.pieces > 1 ? `S${String(i + 1).replace(/\d/g, (v) => '₀₁₂₃₄₅₆₇₈₉'[Number(v)])} · ` : ''}${p.orientable ? 'orientable' : 'non-orientable'}`,
        witness: p.witness,
      },
      ...(p.genus === null
        ? []
        : [
            {
              key: `genus:${i}`,
              value: `g${S.pieces > 1 ? `(S${String(i + 1).replace(/\d/g, (v) => '₀₁₂₃₄₅₆₇₈₉'[Number(v)])})` : ''} = (2 − χ${S.pieces > 1 ? String(i + 1).replace(/\d/g, (v) => '₀₁₂₃₄₅₆₇₈₉'[Number(v)]) : ''} − B${S.pieces > 1 ? String(i + 1).replace(/\d/g, (v) => '₀₁₂₃₄₅₆₇₈₉'[Number(v)]) : ''})/2 = ${p.genus}`,
            },
          ]),
    ]),
  ];
}
export function bandsLatex(S: BandNumbers) {
  const lines = [
    `\\text{disks} &\\quad d = ${S.disks}`,
    `\\text{bands} &\\quad n = ${S.bands}`,
    `\\text{boundary} &\\quad B = ${S.boundary}`,
  ];
  if (S.pieces > 1) lines.push(`\\text{pieces} &\\quad k = ${S.pieces}`);
  lines.push(`\\chi &= d - n = ${S.chi}`);
  S.parts.forEach((p, i) => {
    const sub = S.pieces > 1 ? `_{${i + 1}}` : '';
    lines.push(
      `${S.pieces > 1 ? `S${sub}\\quad ` : ''}&\\text{${p.orientable ? 'orientable' : 'non-orientable'}}`,
    );
    if (p.genus !== null) lines.push(`g${sub} &= (2 - \\chi${sub} - B${sub})/2 = ${p.genus}`);
  });
  return `\\begin{aligned}\n${lines.join(' \\\\\n')}\n\\end{aligned}`;
}
