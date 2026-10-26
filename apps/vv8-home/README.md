# VV8 Home — interactive Three.js apartment

An interactive reconstruction of the supplied VV8 Residence dimensioned plan,
with the earlier furnished brochure retained as a separate visual reference.
The browser application is buildless and includes a pinned, local copy of
Three.js r180. No CDN, analytics, external fonts or model services are required.

## Explore

- Drag to orbit; pinch or scroll to zoom; use two fingers or the right mouse button to pan.
- **Floor plan** gives a top-down view. Select a room to inspect the current model bounds and calculated outline area.
- **Dimensions** distinguishes drawing figures from derived, assumed and user-specified measurements. For an L-shaped room, bounds are not a rectangular area calculation.
- **Measure** switches to plan view and measures two floor points, snapping nearby corners.
- **Inside** uses eye-height navigation. Drag to look and use WASD, arrow keys or the on-screen pad to move. Select any room to move directly there.
- **Display** controls furniture, labels, cutaway/full/hidden walls, daylight or warm evening light, and the editable user-specified ceiling height. **Clean view** hides room labels and dimension annotations.
- **Source plans** switches between the dimensioned architectural drawing and the original furnished brochure. **Fit / 100%** lets the annotations be inspected without treating image pixels as measurements.
- **Dimensions & source** shows drawing-to-model comparisons, signed differences, interpretation notes and area provenance. The selected-room card opens this evidence filtered to that room.
- **Studio views** opens three physically rendered stills generated from the furnished model: dollhouse, living room and primary bedroom. These saved images use the **3.00 m ceiling height supplied by the user**; they do not regenerate when the interactive height setting changes.
- **Export 3D** prepares a full-height furnished binary glTF (.glb), in metres; use the download button in the resulting dialog.
- **Furniture · $80k** opens the dated furniture budget with USD/AMD switching, room filters, listed retail prices, custom planning allowances, source links and a CSV download. The sidebar follows the selected room.

## Furniture edition · 26 October 2026

The apartment is furnished with an ivory/oat, smoked-oak, pale-stone and
dove-grey scheme. The later dimensioned-plan revision supersedes the initial
area-fitted geometry. Retail items use their published external envelopes, with
schematic geometry rather than vendor CAD. The sofa, compact dining set, beds
and joinery remain custom planning designs. Furniture positions are reviewed
against the current plan; a retail product is not resized and presented as the
same purchasable SKU.

The budget uses the CBA reference rate **1 USD = 360.88 AMD** on 26 October 2026.
Retail and comparison sources are embedded in `dist/budget.json`; the application
does not perform live price updates.

| Budget component | AMD | USD at reference rate |
|---|---:|---:|
| Furniture budget ceiling | 28,870,400 | 80,000.00 |
| Planned furniture, textiles and services | 17,324,980 | 48,007.59 |
| Separate contingency reserve | 2,887,040 | 8,000.00 |
| Unallocated balance | 8,658,380 | 23,992.41 |

The planned amount contains **3,364,980 AMD in 12 listed retail rows** and
**13,960,000 AMD in 24 planning allowance rows**. The allowances are deliberately
generous budgets for premium custom work; they are not verified supplier quotes.
The $80,000 is a ceiling rather than a spending target. No purchases were made.
Renovation, appliances, sanitaryware and building services are excluded. Confirm
all taxes, stock, dimensions, finish samples, carrying and installation terms
before ordering, and deduct services already included by a supplier.

`node export-budget.mjs` validates the schedule and regenerates the UTF-8 CSV.
`node export-model.mjs` regenerates the furnished GLB including the same dated
budget summary and item-price metadata. Copy the resulting GLB to the download
asset configured in `dist/app.js`, and keep its displayed byte size current.

## Source and dimensional accuracy

The **dimensioned drawing** is the primary source for annotated wall spans,
offsets and openings. Values are interpreted in millimetres and converted to
metres in the model. The **original brochure** supplies room identity, the
furnished arrangement and historical area figures. It is a perspective cutaway,
not a dimensioned orthographic drawing.

The interface uses four measurement bases:

| Basis | Meaning |
|---|---|
| Drawing | A number explicitly printed on the drawing, with identified endpoints. |
| Derived | A value calculated from dimension chains or interpreted room outlines. |
| Assumed | An unlabelled height or architectural detail interpreted for the model. |
| User specified | A value explicitly supplied by the user, including the 3.00 m ceiling height. |

`geometry.json` records `dimensionChecks` with the source value, current modeled
span, basis, endpoints and interpretation notes. The evidence panel shows actual
differences rather than manufacturing agreement. Broad chains, wall faces and
openings can use different endpoints; an unresolved interpretation stays visible.
Agreement with a drawing does not establish an as-built survey.

Room areas shown in the viewer are calculated from the current polygons. They
are not forced to match the earlier brochure's areas. The original reference
figures are retained separately:

| Space | Original brochure room area |
|---|---:|
| Living room | 23.6 m² |
| Kitchen | 11.4 m² |
| Primary bedroom | 18.6 m² |
| Smaller bedroom | 9.9 m² |
| Entrance and hall | 7.2 m² |
| Bathroom | 4.3 m² |
| Kitchen balcony | 3.1 m² |
| Bedroom balcony | 3.5 m² |

These entries total **81.6 m²**, while the source headline states **81.4 m²**.
Both are retained as brochure references. Assigning 3.1 m² to the kitchen
balcony and 3.5 m² to the bedroom balcony in that illustration is inferred.
No compass direction is supplied or inferred.

The default ceiling height is **3.00 m, supplied by the user and editable**. Furniture
forms, materials, fixture details and any unlabelled architectural features are
design interpretations. The calculated model area describes the chosen room
outlines and is not an independently measured usable-area statement. Its basis
must be read alongside the geometry metadata and the original annotations.

When WebGL is unavailable, a Canvas2D geometry renderer preserves interactive
orbiting, plan and inside views. It uses simplified drawing geometry while
the downloadable model retains the complete detailed scene.

The studio stills use the same exported model and the stated saved ceiling
height. They are not substitute evidence for unlabelled dimensions.

## Reproducing the detailed model and studio views

`node export-model.mjs /absolute/path/VV8-home-area-calibrated.glb` builds the
full-height scene and validates its dimension metadata and embedded texture
images. The legacy download filename is retained for existing links. The
Node canvas adapter explicitly avoids confusing Canvas `data()` methods with
raw pixel arrays, and the exporter rejects any fully transparent texture.

`render-studio.py` imports that exact GLB into Blender Cycles. It adds only a
presentation light rig, studio ground, and interior ceilings at the recorded
user-specified height of 3.00 m. The overview cuts and caps architectural walls at 0.95 m;
furnishings retain their full dimensions. Lighting does not claim a geographic
orientation or a surveyed daylight condition.

```sh
python3 render-studio.py --model /absolute/path/VV8-home-area-calibrated.glb \
  --data dist/geometry.json --output dist/assets --samples 48 --width 1800
```

Run with Blender's official `bpy` 4.5 LTS module available. `VV8_BPY_PATH` can
point to an isolated module directory. `--shots living,primary` selects views.
`python3 audit_dimensions.py` validates the room polygons, dimensions, and
architecture clearances. Furniture clearance checks use the detailed meshes;
fixed structural piers are kept separate from optional furniture positions.

## Measurement UI integration

`initUI(rooms, onAction, data)` accepts the current geometry metadata as its third
argument. Each room uses its computed `area` and optional separate
`brochureArea`. `data.modelAreaSum` supplies the calculated total; otherwise it
is computed from the supplied rooms. `updateMeasurementEvidence(data)` refreshes
the checks, and `showMeasurementEvidence(roomId)` opens a room-filtered view.

Each dimension check accepts:

```js
{
  id, label, roomId,
  sourceMM, modelMetres,
  basis: 'drawing' | 'derived' | 'assumed' | 'provided',
  from, to, note
}
```

`sourceMM` or `modelMetres` may be absent where a comparison is unresolved.
Lighting emits `{action:'lighting', value:'daylight'|'evening'}`. The existing
`toggle` actions power Clean view, so it does not need a separate scene API.

## Files

- `dist/geometry.json`: drawing provenance, polygons, dimension checks, computed areas and assumptions.
- `fit_geometry.py`: legacy area-constrained solver used before the dimensioned drawing was supplied.
- `dist/architecture.js`: floors, walls, openings, doors, glazing and railings.
- `dist/furnishings.js`: detailed procedural furnishings.
- `dist/app.js`: Three.js rendering, views, labels, measurement and export.
- `dist/ui.js`, `dist/index.html`, `dist/styles.css`, `dist/plan.css`: responsive interface, source viewer and measurement evidence.
- `dist/assets/dimensioned-plan.jpeg`: supplied dimensioned drawing, preserved as received.
- `dist/assets/source-plan.jpg`: earlier brochure reference.
- `dist/assets/render-dollhouse.jpg`, `render-living.jpg`, `render-primary.jpg`: saved studio renders from the current model.
- `dist/vendor/LICENSE`: Three.js MIT license.

Serve `dist/` through any static HTTP server. ES modules require HTTP(S), not
opening index.html directly using file://.
