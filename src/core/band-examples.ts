import { type BandSurface } from './bands';
import type { Point } from './knot';
export const BAND_BASE_EXAMPLES = [
  'disk',
  'annulus',
  'mobius',
  'interleaved',
  'sideBySide',
  'threeBands',
  'genus2',
] as const;
// 24.H
export const BAND_EXAMPLES = [
  ...BAND_BASE_EXAMPLES,
  'figure44Left',
  'figure44Right',
  'figure41',
  'figure41Untwisted',
] as const;
export const BAND_PAIRS = ['figure44Pair', 'exercise12Pair'] as const;
export type BandPair = (typeof BAND_PAIRS)[number];
export type BandExample = (typeof BAND_EXAMPLES)[number];
export type BandSelection = BandExample | BandPair;
export function bandPair(key: BandPair): { pinned: BandExample; current: BandExample } {
  return key === 'figure44Pair'
    ? { pinned: 'figure44Left', current: 'figure44Right' }
    : { pinned: 'figure41', current: 'figure41Untwisted' };
}
export function bandExample(key: BandExample): BandSurface {
  if (key === 'figure44Right') return bandExample('annulus');
  if (key === 'figure41' || key === 'figure41Untwisted') {
    const surface = bandExample('interleaved');
    // Figure 4.1: two interleaved, fully twisted bands on one disk.
    surface.bands.forEach((b) => {
      b.halfTwists = key === 'figure41' ? 2 : 0;
    });
    return surface;
  }
  if (key === 'figure44Left') {
    // A trefoil tied into the single ribbon, with its blackboard framing.
    // Cut a short crossing-free arc at the bottom for the disk attachments.
    const curve: Point[] = Array.from({ length: 72 }, (_, i) => {
      const t = (2 * Math.PI * i) / 72,
        r = 125 * (2 + Math.cos(3 * t));
      return [400 + r * Math.cos(2 * t), 240 + r * Math.sin(2 * t)];
    });
    const bottom = curve.reduce((best, p, i) => (p[1] > curve[best][1] ? i : best), 0);
    const route = Array.from({ length: 65 }, (_, i) => curve[(bottom + 4 + i) % 72]);
    if (route[0][0] > route.at(-1)![0]) route.reverse();
    return {
      disks: [{ id: 0, center: [curve[bottom][0], curve[bottom][1] + 150], radius: 75 }],
      bands: [
        {
          id: 0,
          feet: [
            { disk: 0, angle: -Math.PI / 2 - 0.5 },
            { disk: 0, angle: -Math.PI / 2 + 0.5 },
          ],
          halfTwists: 0,
          route,
        },
      ],
      stripOver: { '0:0:0': 0, '0:0:1': 1, '0:0:2': 0 },
    };
  }
  const disk = { id: 0, center: [400, 340] as [number, number], radius: key === 'genus2' ? 240 : 105 };
  const angles =
    key === 'genus2'
      ? [0, 2, 1, 3, 4, 6, 5, 7, 8, 9, 10, 11]
      : key === 'sideBySide'
        ? [0, 1, 2, 3]
        : [0, 2, 1, 3];
  const count = key === 'disk' ? 0 : key === 'annulus' || key === 'mobius' ? 1 : key === 'genus2' ? 6 : 2;
  if (key === 'threeBands')
    return {
      disks: [
        { ...disk, center: [400, 210], radius: 78 },
        { id: 1, center: [400, 465], radius: 78 },
      ],
      // Odd, odd, odd pretzel: the clockwise feet on the opposing disks have
      // reversed left-to-right order, yielding one boundary and genus one.
      bands: [0, 1, 2].map((i) => ({
        id: i,
        feet: [
          { disk: 0, angle: Math.PI / 2 + (i - 1) * 0.7 },
          { disk: 1, angle: -Math.PI / 2 - (i - 1) * 0.7 },
        ],
        halfTwists: 1,
      })),
    };
  return {
    disks: [disk],
    bands: Array.from({ length: count }, (_, i) => ({
      id: i,
      feet: [0, 1].map((f) => ({
        disk: 0,
        // 22.C: standard arches, in cyclic order along the upper semicircle.
        angle:
          count === 1
            ? -Math.PI / 2 + (f === 0 ? -0.65 : 0.65)
            : -Math.PI + 0.15 + ((Math.PI - 0.3) * angles[2 * i + f]) / (2 * count - 1),
      })) as [{ disk: number; angle: number }, { disk: number; angle: number }],
      halfTwists: key === 'mobius' ? 1 : 0,
    })),
  };
}
