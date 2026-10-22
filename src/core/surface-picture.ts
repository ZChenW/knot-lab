import type { SeifertSurface } from './seifert';

// All paint mixes the existing ink and stage tokens. Export uses light/paper.
// Band tones are absolute mixes, so nested disks cannot brighten a dark ribbon.
export const SURFACE_OPACITY = {
  disk: 0.075,
  band: { front: 0.144375, back: 0.2256 },
} as const;
export const SURFACE_CLEARANCE = 3.5;

/** The sRGB ink/stage mix used by CSS color-mix, baked for standalone SVG. */
export function surfaceTone(ink: string, stage: string, alpha: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          alpha * parseInt(ink.slice(i, i + 2), 16) + (1 - alpha) * parseInt(stage.slice(i, i + 2), 16),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Shared paint decisions for the board, SVG/PNG, and the diagram in the sheet. */
export function surfacePainting(surface: SeifertSurface) {
  return {
    disks: [...surface.circles].sort((a, b) => a.depth - b.depth || a.id - b.id),
    bands: surface.strips.map((band) => ({
      ...band,
      // Both halves use one user-space gradient, from corner midpoint to midpoint.
      axis: surface.corners
        .filter((corner) => corner.crossing === band.crossing)
        .map((corner) => corner.points[(corner.points.length - 1) / 2]),
    })),
  };
}
