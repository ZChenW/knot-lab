# The .knot file and scripting

## The .knot format

A `.knot` file is JSON. This one is a triangle without crossings:

```json
{
  "format": "knot-lab",
  "version": 1,
  "p": 5,
  "components": [{ "points": [[0, 0], [100, 0], [0, 100]], "reversed": false }],
  "crossings": []
}
```

| Member | Meaning |
| --- | --- |
| `format` | Always `"knot-lab"` |
| `version` | `1`. Files from a newer version are refused |
| `p` | The saved labeling parameter (normally a prime); loading may choose a different prime to suit the diagram |
| `components` | One closed polyline per component: at least three `points` relative to the 800 × 600 working frame (points may lie outside it), rounded to two decimals; the last point joins the first. `reversed` reverses the component's orientation |
| `crossings` | `[a, i, b, j, over]` for each crossing: segment `i` of component `a` crosses segment `j` of component `b`, where all indices start at 0, segment `i` runs from point `i` to point `(i + 1) mod pointCount`, and `a ≤ b`. `over` is `"a"` or `"b"`, the one on top |

A crossing with no entry alternates, and an entry that matches no crossing is ignored,
so a hand-written file may leave `crossings` empty. Optional members, written only
when they differ from the default:

| Member | Meaning |
| --- | --- |
| `surface` | `true` when the Seifert surface is shown |
| `minor` | `{ "row": r, "column": c }`, the deleted row and column, counted from 0 |
| `versus` | `{ "title": …, "diagram": … }`, the pinned diagram K of a comparison, itself in this format |

The traced picture, the undo history, the labeling shown and the view are not saved,
and neither are the band and triangle boards. Knot Lab refuses to save a diagram whose
crossings would change when its points are rounded to two decimals; pull the nearby
strands apart and save again.

Automatic recovery uses `localStorage` under `knot-lab.session`; it also keeps the
band and triangle boards. It does not replace saving a `.knot` file. The current
desktop file path, traced picture, undo history, view and displayed labeling are not
restored when you reopen the app.

## Scripting: window.knotLab

Every build, the desktop app and the [web version](install.md#the-web-version), exposes
`window.knotLab` for scripting. It is easiest to reach from the browser console
of the web version.

| Member | Returns |
| --- | --- |
| `serialize()` | The current diagram as `.knot` text |
| `load(text)` | Loads `.knot` text as one undo step; throws an error worded in the current language if the text is not a valid file |
| `exportSVG()` | The diagram as a standalone SVG with its fonts embedded |
| `exportPNG()` | A promise of a PNG data URL, at twice the size, on white |
| `exportSheetSVG()`, `exportSheetPNG()` | The same for the whole page |
| `latex(kind)` | The LaTeX of one block: `'coloring'`, `'reduction'`, `'alexander'`, `'check'`, `'working'`, `'seifert'`, `'bands'` or `'triangulation'`; `null` when the data for that block is unavailable |
| `language`, `setLanguage(lang)` | The interface language, `'en'` or `'zh'` |
| `moves()`, `applyMove(index)` | The R1⁻, R2⁻ and R3 moves the board offers, and doing one |
| `gaussCode()` | For each component, its passages in order: `{ crossing, over, sign }` |
| `seifert()` | The Seifert surface's numbers: disks, bands, boundary, χ, pieces, genus |
| `bands()`, `bandDocument()`, `selectBandExample(key)` | The band board's numbers and surface, and opening one of its examples |
| `triangulation()`, `triangleDocument()`, `selectTriangleExample(key)` | The same for the triangle board |

Loading switches the title to "Your drawing" and keeps the traced picture. A
comparison is replaced by the file's own `versus`, or ended if the file has none. The
interface updates after the call returns: wait two animation frames before you read
the screen. The exact types are `KnotLabHook` in [`src/ui/App.tsx`](../src/ui/App.tsx).
