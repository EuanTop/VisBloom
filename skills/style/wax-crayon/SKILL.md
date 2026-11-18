---
name: wax-crayon
description: Create or refine wax-crayon and dry oil-pastel surfaces with paper tooth, directional pigment buildup, layered color and broken edges. Use for material treatments on existing marks or texture studies; preserve the chosen geometry and data encoding.
---

# Wax and paper, at viewing scale

Separate the mark’s geometry, pigment deposition and paper relief. A finely drawn wax surface has clear pigment islands, uneven rubbing pressure, rich overlaps and small uncovered valleys. A dry edge breaks into grains instead of remaining a perfect vector contour. A soft-looking boundary need not make the whole mark out of focus.

Start from the creator’s current work and the supplied reference. Keep committed layout, palette relationships, data scales, selections and human edits. A material request does not authorize replacing petals, charts or data, adding unrelated imagery, or choosing a new background. Surface variation is artistic, not an observed data measurement.

## Make the material perceptible

- Let a spatially continuous paper relief interrupt pigment. Combine fine tooth, clustered pores and sparse fibers; uncorrelated bright/black dots across the whole image read as noise.
- Align pressure and pigment seams with the drawing direction. Unequal repeated passes create darker or richer bands and small wax highlights. Keep recognizable hue relationships; reserve opaque light flecks for the reference’s actual medium.
- At the edge, vary coverage and leave small dry gaps or loose grains. Avoid a uniformly crisp silhouette with noise pasted inside. For a crisp, detailed crayon brief, avoid whole-image or whole-mark Gaussian blur: it erases the material the viewer should see. Local smudging remains an option when the reference calls for it.
- Keep material randomness anchored to stable mark identity/local coordinates. Rotation, capture and redraw must not reshuffle the surface. Texture scale follows viewing scale and export resolution; use a pixel budget for caches and release owned resources.
- Apply the treatment to pigment. Labels, legends, hit targets and important data marks need deliberate separate treatment; do not smear them incidentally with a global filter.

Work in the actual scene’s palette and background, not an isolated white swatch alone. Inspect the whole piece at normal size and a native-resolution detail from the real output. Revise when the surface looks like static/noise, glossy uniform gradients, a soft-focus image, clipped rectangular halos, or a vector outline with decorative particles. These are diagnostic possibilities, not a universal ban on other artistic choices.

A successful local revision should visibly change the material while keeping the committed encoding readable. Use the same state for before/after, and check a relevant resize/export and creator control. A passing build or a larger image does not establish material quality. Include this viewing/revision loop in implementation; do not turn it into a separate mandatory review role.

## Implementation and references

For Canvas2D, read [the material implementation](references/canvas2d.md) when useful. [assets/wax-crayon.ts](assets/wax-crayon.ts) is an optional self-contained pigment implementation with bounds, palette, gradient, seed, grain size and stroke direction; it is not a fixed visual recipe. Adapt it to the reference instead of copying SkinBloom geometry or parameters.

Read [calibration and limits](references/calibration.md) when distinguishing fine grain from noise or blur. It includes the creator-approved SkinBloom detail and the two rejected directions. That approval is specific to this treatment and is not evidence of a universal style or improved Skill performance.

For Art Workbench, load the project’s data-art operations when needed, write helpers as real project source files, declare useful controls and preserve their values, capture the connected revision and inspect the returned image. Pure style discussion or a standalone Canvas task does not require this platform or AVA. Never assume a supported engine simply because it is mentioned here.
