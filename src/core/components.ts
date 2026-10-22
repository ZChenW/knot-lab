import { rawCrossings, type Analysis, type Component, type OverMap } from './knot';

export interface ComponentDiagram {
  comps: Component[];
  over: OverMap;
}

// Keep the source ID even when IDs were implicit: crossing keys use that ID,
// whereas passage component indices are recomputed for the one-component diagram.
export function componentDiagram(diagram: ComponentDiagram, index: number): ComponentDiagram {
  if (!Number.isInteger(index) || !diagram.comps[index]) throw new RangeError('Invalid component index');
  const component = diagram.comps[index];
  const comps = [
    { ...component, id: component.id ?? index, pts: component.pts.map((p) => [...p] as [number, number]) },
  ];
  const over: OverMap = new Map(rawCrossings(comps).map((r) => [r.key, diagram.over.get(r.key) ?? 'a']));
  return { comps, over };
}

// RH/LH is an oriented sign, independent of which named component is over.
export function linkingCounts(D: Analysis) {
  return D.pairs.map((pair) => {
    const over = [pair.i, pair.j].map((comp) => ({ comp, rh: 0, lh: 0 }));
    for (const x of D.crossings) {
      if (
        x.over.c === x.under.c ||
        ![pair.i, pair.j].includes(x.over.c) ||
        ![pair.i, pair.j].includes(x.under.c)
      )
        continue;
      const count = over.find((entry) => entry.comp === x.over.c)!;
      if (x.sign > 0) count.rh++;
      else count.lh++;
    }
    return { ...pair, over };
  });
}

export function tripleProduct(D: Analysis): { value: number; factors: [number, number, number] } | null {
  if (D.nComps !== 3) return null;
  const pair = (i: number, j: number) => D.pairs.find((q) => q.i === i && q.j === j)!.lk;
  const factors: [number, number, number] = [pair(0, 1), pair(1, 2), pair(0, 2)];
  // Avoid a displayed negative zero when a zero factor follows a negative one.
  return { factors, value: factors.reduce((product, value) => product * value, 1) || 0 };
}

// Full-link strands split at mixed underpasses. Several can correspond to one
// strand of the isolated component; crossing identities remain their source keys.
export function componentCorrespondence(full: Analysis, alone: Analysis, index: number, points: number) {
  const cycle = (t: number) => ((t % points) + points) % points;
  const arcs = full.arcs.map((arc) => {
    if (arc.comp !== index) return null;
    if (alone.arcs[0].closed) return 0;
    const at = arc.closed ? 0 : cycle(arc.from.under.t + cycle(arc.to.under.t - arc.from.under.t) / 2);
    return alone.arcs.find(
      (a) => !a.closed && cycle(at - a.from.under.t) < (cycle(a.to.under.t - a.from.under.t) || points),
    )!.id;
  });
  const crossings = alone.crossings.map((x) => full.crossings.find((q) => q.key === x.key)!.num);
  return { arcs, crossings };
}
