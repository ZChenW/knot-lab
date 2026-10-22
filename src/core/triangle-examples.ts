import { barycentric, glue, splitTriangle, type Net, type Triangle } from './triangulation';

export const TRIANGLE_EXAMPLES = [
  'triangle',
  'square',
  'centre',
  'barycentric',
  'strip',
  'annulus',
  'mobius',
  'sphere',
  'torus',
  'threeOnEdge',
  'vertexTouch',
  'pointOnSide',
] as const;
export type TriangleExample = (typeof TRIANGLE_EXAMPLES)[number];
export function triangleExample(key: TriangleExample): Net {
  const triangle: Net = {
    points: [
      [240, 440],
      [560, 440],
      [400, 160],
    ],
    triangles: [[0, 1, 2]],
    gluings: [],
  };
  if (key === 'triangle') return triangle;
  if (key === 'centre') return splitTriangle(triangle, 0);
  if (key === 'barycentric') return barycentric(triangle);
  if (key === 'square')
    return {
      points: [
        [240, 180],
        [560, 180],
        [560, 500],
        [240, 500],
      ],
      triangles: [
        [0, 1, 2],
        [0, 2, 3],
      ],
      gluings: [],
    };
  if (key === 'sphere')
    return {
      // A central face and its three reflected neighbours: the outer vertices
      // are three copies of the fourth tetrahedron vertex.
      points: [
        [400, 290],
        [300, 463.2050807569],
        [500, 463.2050807569],
        [200, 290],
        [400, 636.4101615138],
        [600, 290],
      ],
      triangles: [
        [0, 1, 2],
        [1, 0, 3],
        [2, 1, 4],
        [0, 2, 5],
      ],
      gluings: [
        { a: [0, 3], b: [0, 5], reversed: false },
        { a: [1, 3], b: [1, 4], reversed: false },
        { a: [2, 4], b: [2, 5], reversed: false },
      ],
    };
  if (key === 'torus') {
    const net: Net = { points: [], triangles: [], gluings: [] };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) net.points.push([220 + 120 * x, 180 + 120 * y]);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        const a = y * 4 + x;
        net.triangles.push([a, a + 1, a + 5], [a, a + 5, a + 4]);
      }
    for (let i = 0; i < 3; i++)
      net.gluings.push(
        { a: [i, i + 1], b: [12 + i, 13 + i], reversed: false },
        { a: [4 * i, 4 * i + 4], b: [4 * i + 3, 4 * i + 7], reversed: false },
      );
    return net;
  }
  if (key === 'threeOnEdge')
    return {
      points: [
        [250, 400],
        [550, 400],
        [400, 180],
        [400, 520],
        [360, 250],
      ],
      triangles: [
        [0, 1, 2],
        [1, 0, 3],
        [0, 1, 4],
      ],
      gluings: [],
    };
  if (key === 'vertexTouch')
    return {
      points: [
        [400, 340],
        [200, 180],
        [200, 480],
        [600, 180],
        [600, 480],
      ],
      triangles: [
        [0, 1, 2],
        [0, 3, 4],
      ],
      gluings: [],
    };
  if (key === 'pointOnSide')
    return {
      points: [
        [230, 320],
        [570, 320],
        [400, 120],
        [400, 320],
        [300, 500],
        [500, 500],
      ],
      triangles: [
        [0, 1, 2],
        [3, 4, 5],
      ],
      gluings: [],
    };
  const strip: Net = { points: [], triangles: [], gluings: [] };
  for (const y of [240, 420]) for (const x of [100, 300, 500, 700]) strip.points.push([x, y]);
  for (let i = 0; i < 3; i++)
    strip.triangles.push([i, i + 4, i + 5] as Triangle, [i, i + 5, i + 1] as Triangle);
  return key === 'strip' ? strip : glue(strip, [0, 4], [3, 7], key === 'mobius');
}
