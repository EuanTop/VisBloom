# Canvas2D material

Use the optional bundled TypeScript module directly or adapt its mechanism. It has no dependencies, no data model and no framework import. It creates canvases only when painting in a browser; it is not a server-side image renderer.

```ts
import {createWaxMaterial} from './wax-crayon';
const wax=createWaxMaterial();
// In draw(), after the mark's normal translate/rotate/scale:
ctx.save();
ctx.globalAlpha = selectedOpacity * materialStrength;
wax.paint(ctx, shape, {
  bounds: {x: -16, y: -13, width: 64, height: 292},
  colors: ['#090b08', '#fac858', '#3b4ee2'],
  gradient: [0, 0, 0, 263],
  seed: stableMarkSeed,
  grainSize: 1,
  direction: [0, 1],
});
ctx.restore();
// Release this instance when the artwork owner is disposed.
wax.dispose();
```

The numerical bounds/gradient above illustrate one narrow mark, not defaults for other shapes. Supply the mark’s local bounds including enough bleed for a broken edge. The gradient vector controls original color relationships; direction controls rubbing pressure, independently of the data layout. Grain size is in local mark units. Check its screen-space size after transforms. Fully smooth (`strength=0`) and fully material (`strength=1`) renders can be blended with the existing mark; do not leave a strong smooth fill that restores an unwanted hard edge.

The implementation samples a Path2D mask, builds a two-pass approximate distance field, perturbs coverage near the boundary, and samples correlated relief/pressure in local coordinates. Colors interpolate over the supplied gradient; pressure changes pigment density. It avoids a blur pass. The atlas keys include shape identity, options and actual drawing resolution, with a default8million-pixel budget. The same factory instance may serve multiple marks; do not create it for every draw. `cachedPixels` is a diagnostic, not a quality score. Invalid/oversized geometry is rejected rather than silently consuming unbounded memory.

In Art Workbench, copy the helper to a source path such as `src/materials/wax-crayon.ts` and save it through the files API with the caller’s relative import. Adding a file only to the developer checkout does not put it in an editable/exported project. Keep project bindings accurate. The platform's runtime handles logical canvas dimensions and pixel ratio; the module reads the current draw transform when sizing its atlas.

This module originated in the accepted SkinBloom revision. Other engines may implement the same material idea in a shader, instance layer or vector stroke system; do not require Canvas2D or add another full rendering framework solely for this technique. Synthetic grain is an artistic approximation of wax deposition, not a physically calibrated material simulation.
