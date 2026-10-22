// 14.G: only the first two blocks must fit. Later blocks scroll below them.
// Reserve wrapped captions as well as the table rows when no measurement exists.
export function matrixStackHeight(strands: number, hasReduction: boolean): number {
  const heading = 29,
    header = 26,
    row = 27,
    captionGap = 12;
  const coloring = heading + header + strands * row + captionGap + 64;
  const alexander = heading + header + strands * row + captionGap + 106;
  const reduction = heading + header + Math.max(0, strands - 1) * (row + 22) + captionGap + 106;
  return coloring + (hasReduction ? reduction : alexander) + 22;
}

export interface MatrixBlockHeights {
  coloring: number;
  reduction?: number;
  alexander: number;
  check?: number;
}

export function shouldStackMatrices(
  freeHeight: number,
  strands: number,
  hasReduction: boolean,
  measured?: MatrixBlockHeights,
): boolean {
  const required = measured
    ? measured.coloring + (hasReduction ? (measured.reduction ?? Infinity) : measured.alexander) + 22
    : matrixStackHeight(strands, hasReduction);
  return Number.isFinite(freeHeight) && strands > 0 && freeHeight >= required;
}
