// Widths include each group's controls and its 2px internal gaps, at their natural
// inline sizes. The app group reserves another 16px before its controls.
export function toolbarFits(available: number, groups: readonly number[], gap = 14): boolean {
  const needed = groups.reduce((sum, width) => sum + width, 0) + Math.max(0, groups.length - 1) * gap + 16;
  return available >= needed;
}
