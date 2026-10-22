# Using Knot Lab

The drawing board is on the left and the results are on the right. Every reading
follows the diagram as you draw, so you can change a crossing and watch what moves.
**Help** in the toolbar has a short version of this page.

## Drawing a diagram

- **Drag** to draw a closed curve freehand; it closes when you let go.
- **Click point by point** to draw a smooth closed curve, starting anywhere, even on an existing
  line. Close it by clicking the first point, pressing Enter or double-clicking.
  Backspace takes back the last point; Esc cancels the curve.
- Each curve is one component, oriented the way you drew it. An arrow on every strand
  that is long enough shows the direction.
- New crossings alternate over and under. **Click a crossing** to switch which strand
  is on top.
- **Point at a curve** and a dot appears: drag it to reshape the curve. Existing
  crossings keep their over and under; a crossing you drag into existence has the
  dragged strand on top, as in a Reidemeister II move.

The toolbar works on the whole diagram:

| Button | What it does |
| --- | --- |
| Alternate | Resets every crossing so each curve goes over, under, over… |
| Mirror | Swaps over and under at every crossing; orientations stay |
| Tidy | Smooths the curves and fits the diagram to the board; crossings stay as they are |
| Clear | Deletes every curve |

Below the board, **Reverse** reverses a component. In a link every component has its
own row with Reverse, Delete and Alone (see [links](#links-component-by-component)).
Click a strand's label to start the numbering from that strand.

## Examples and families

Click the title above the results to pick an example: knots from the unknot to
T(3,4), the granny and square knots, and the unlink, Hopf link, Whitehead link and
Borromean rings.

The Families section has diagrams with parameters: **Torus T(p, q)**, **Twist knot**,
**Pretzel P(a, b, …)** (two to six columns; + and − add and remove one) and
**Connected sum Kₙ** (n trefoils or n figure-eights in a row). Edit the parameters
under the title; everything you type into one field is one undo step.

## Tracing a picture

To copy a diagram from a book or a photo, put the picture under the board and draw
over it. Paste it with Ctrl+V, drop it on the board, or use **Trace**:

- **Choose a picture…** opens a file.
- **Phone photo…** shows a QR code. Scan it with your phone, take the photo, and it
  appears under the board. With **Same Wi-Fi** the phone and the computer must be on
  the same network; **Mobile data** sends the photo through an encrypted Cloudflare
  tunnel and needs `cloudflared`. The code expires after ten minutes.

While tracing, the slider sets the picture's opacity and Tidy only smooths (it does not
move the diagram off the picture). **Done** shows the picture and your drawing side by
side; **Back** returns to tracing; **Remove** takes the picture away. The picture is
not recognised automatically and is never saved.

## Moving around

Scroll to zoom. Hold Space or the middle mouse button and drag to pan. **Fit** (bottom
right, or Ctrl+0) returns to the view that shows the whole diagram; the board fits
itself when you pick an example or open a file. Drag the line between the board and
the results to resize them; double-click it to reset.

## Reading the results

The top block has Δ(t), det, writhe and, for a link, the linking numbers. Below it:

- **p-colorable** lists the primes that divide det; type another prime in the `p` field
  to try it. `rank` is the number of free variables in the reduced system; `labelings` counts
  the nonconstant labelings. Use ‹ › to step through them, colouring the strands on
  the board; very large sets use **Another** instead.
- **Coloring matrix**, **Reduction**, **Alexander matrix**, **Check** and **Working**
  show the working. Each block opens with its result on the right (det(K), the rank, the
  relation to check, Δ(t)) and the matrix below it. When the first two blocks do not
  fit in the window's height, the blocks become tabs.
- **Reduction** row-reduces A″ mod p and writes every pivot variable in terms of the
  free ones: this is where the rank comes from.
- **Working** computes a determinant step by step, as by hand, with the multiplier of
  each step.
- In the Coloring and Alexander blocks, click a row number or a column label to choose
  which row and column are deleted. Any change to the diagram resets the choice.
- Point at a block's name for the convention it uses; **LaTeX** beside the name copies
  the block. The conventions are also in [Conventions](conventions.md).

Pointing connects the two sides: a row, a column or an x in a matrix lights up its
crossing and strand on the board, and pointing at the board lights up the matrix.
Point at the writhe or an lk row to see the sign of every crossing; click the row to
keep the signs shown (they are exported too), and click again to hide them.

## Reidemeister moves

Turn on **Moves** in the toolbar.

- Click a strand for a menu: **R1** adds a loop (+1 or −1), **R2** pushes the strand
  over or under the next one.
- Marks on the board offer the moves the diagram has: a loop to undo (R1⁻), a bigon to
  undo (R2⁻), a triangle to slide (R3). Click a mark to do it.

Point at a menu row or a mark first to preview the move; the **Move** block then lists
every reading before and after, so you can see what changed. When the strands are too
close, Knot Lab pushes nearby strands aside a little; a move that still cannot be done
is marked `room`. Esc leaves Moves.

## Combining knots

The **Combine** section of the examples menu joins the current diagram with an example
or a family: **Connected sum K # …** or **Split union K ⊔ …**, as one undo step.
Afterwards the results show both factors under Δ(t) and det. When the current diagram
is a link, the connected sum uses its first component K₁.

## Links, component by component

**Alone** on a component's row reads that component only: the other components fade
and the diagram stays as it is. Esc or a second click returns to the whole link. A
three-component link also gets the row `I = lk₁₂ · lk₂₃ · lk₃₁`. The tooltip of an lk
row counts, for each component, the RH and LH crossings where it is on top.

## Comparing two knots

**Compare** pins the current diagram as K. Draw or pick another knot J, and a table at
the top of the results puts their invariants side by side and names the first one that
differs. If none differs, it says the invariants do not distinguish them, which does
not make them the same knot. Crossings, writhe and g(S) are numbers of the diagram, not
of the knot, and never decide. **Swap** exchanges K and J; **End** stops comparing.

## Surfaces

**Surface** in the toolbar builds the Seifert surface of the diagram, and the
**Surfaces** section of the examples menu opens boards for building surfaces from disks
and bands or from triangles. See [Surfaces](surfaces.md).

## Files and export

The app reopens on the diagram you left. The picture, the undo history, the view and the displayed labeling are
not kept.

| File menu | Shortcut | What it does |
| --- | --- | --- |
| Open… | Ctrl+O | Opens a `.knot` file, as one undo step |
| Save | Ctrl+S | Writes back to the current file, or asks for a name |
| Save As… | Ctrl+Shift+S | Saves under a new name |
| Export SVG… / PNG… | | The diagram alone: SVG with its fonts embedded, PNG at twice the size on white |
| Export page as SVG… / PNG… | | One portrait sheet with the diagram, the invariants, mod p, the matrices and the check |

A • before the file name in the window title means unsaved changes. Exports include the
crossing signs you keep shown and the Seifert surface when it is on. The band and
triangle boards are kept only in the session; they cannot be saved or exported yet.
In the web version, Save downloads a file and there is no Save As; in a Claude
artifact it uses the host's download confirmation and saves as `.knot.json`. The
[file format](file-format.md) is plain JSON.

## Language

Knot Lab starts in Chinese if your system's first language is Chinese, and in English
otherwise. **中** / **EN** at the right end of the toolbar switches, and the choice is
remembered. Mathematical terms, the readings and the example names stay in English in
both languages.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y | Undo / redo |
| Ctrl+O, Ctrl+S, Ctrl+Shift+S | Open, save, save as |
| Ctrl+V | Paste a picture to trace |
| Ctrl+0 | Fit the diagram to the board |
| Space + drag, middle button + drag | Pan |
| Enter / Backspace / Esc | While drawing point by point: close, take back a point, cancel |
| Enter or Space | On a focused crossing: switch over and under |
| Esc | Leave Moves, leave Alone, cancel a gesture |
| ← / → | On the focused divider: resize the results; Home resets |

The band and triangle boards have their own keys; see [Surfaces](surfaces.md).
