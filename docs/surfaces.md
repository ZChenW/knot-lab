# Surfaces

Knot Lab has three ways to work with surfaces: the Seifert surface of the diagram on
the board, a board for disks joined by bands, and a board for triangulations. The
numbers follow the usual definitions: the Euler characteristic χ, the number of
boundary components B, orientability and, for an orientable connected surface, the
genus g = (2 − χ − B)/2.

## The Seifert surface

Turn on **Surface** in the toolbar. Knot Lab smooths every crossing along the
orientation, fills each Seifert circle with a disk (nested disks are stacked, the inner
one on top) and joins the disks with one half-twisted band per crossing. The surface is
painted under the diagram and follows every change you make.

The **Seifert** block in the results:

| Line | Meaning |
| --- | --- |
| disks s | The Seifert circles |
| bands c | One band per crossing |
| boundary B | The components of the knot or link |
| pieces k | Connected parts of the surface, shown when there is more than one |
| χ(S) = s − c | The Euler characteristic |
| g(S) | The genus, one term per piece |
| g(K) ≤ … | The bound this gives for the genus of the knot (g(L) for a link) |

Point at the disks, bands or boundary line to mark them on the board. The surface
depends on the diagram, so g(S) need not be the least genus: Moves and Compare show it
as a number of the diagram, never as a verdict. With Alone it is the surface of that
component. The setting is saved in the file, and exports include the surface when it is
on.

## Disks with bands

In the examples menu, **Surfaces → Disk with bands** opens a band board with one disk; the
entries under it open ready-made surfaces such as the annulus, the Möbius band and a
genus-2 surface in standard form. Choose a knot example to return to the knot board; Undo can restore your previous
diagram.

- **Double-click** empty space to add a disk. Drag a disk by its inside to move it;
  Delete removes a disk that has no bands.
- **Drag from a disk's edge** to an edge of the same or another disk to add a band.
- **Click a band** to select it. + and − change its signed half twists (positive is
  right-handed), Enter adds one, Delete removes the band.
- **Drag a foot** along its disk's edge to slide the band; the arrow keys do the same,
  with Shift for larger steps.
- Where two strips cross in the picture, **click the crossing** to choose which strip is
  on top. This changes the boundary as a knot, not the surface.

Every boundary component is drawn in its own colour. The **Disks with bands** block
shows disks d, bands n, boundary B (point at a colour chip to mark that component),
χ = d − n, orientable or non-orientable, and g for each orientable piece. For a
non-orientable piece, pointing at the line marks a cycle of bands with an odd number of
half twists.

**Boundary**, beside the block's name, draws the boundary as a knot diagram on the knot
board, with all its readings. Undo returns to the band board.

## Triangulations

**Surfaces → Triangulation** opens the triangle board, with examples from a single
triangle to the sphere, the torus and the Möbius band, and three sets of triangles that
are not surfaces.

- Drag a point to move it.
- Click an edge or a triangle to subdivide it; **Barycentric** in the block splits every
  triangle into six.
- Shift-click a boundary edge to add a triangle on it.
- Drag from one boundary edge to another to glue them. Click a seam's arrows to reverse
  the gluing; Delete unglues it.
- From the keyboard: Enter subdivides the focused edge or triangle (Shift+Enter on an
  edge adds a triangle), G on one edge and then another glues them, and the arrow keys
  move a point.

The **Triangulation** block shows V, E, F and χ = V − E + F, where a shared side or a
glued pair of sides counts as one edge. Then B, orientability and the type of the
surface: disk, annulus, Möbius band, sphere, torus, or its genus. After a subdivision one
more line shows the change, for example ΔV − ΔE + ΔF = 1 − 3 + 2 = 0. An orientable
surface shows the orientation of each triangle; a non-orientable one marks the edge
where the orientations clash. If the triangles do not form a surface, the block names
each problem (an edge on three triangles, a point inside a side, overlapping triangles,
a boundary that is not simple) and pointing at it marks the place.

## Comparing surfaces

**Compare** works on surfaces too: pin one surface as S, then build or pick another as
T. The S vs T table compares χ, B and orientability and says `same surface` or
`different surfaces` (for two connected surfaces). For band surfaces it also compares
the boundaries as knots or links. A triangulation can be compared with a band surface;
a knot cannot be compared with a surface.

The band and triangle boards are kept in the session, but cannot be saved to a file or
exported yet. On these boards the diagram tools are turned off; Undo, Redo, Clear, Help
and the language switch work as usual.
