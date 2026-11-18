# Ink and drawn marks

Read only when the creator requests ink, dry strokes, drawn contours or paper-based mark making. “Ink” can describe quite different languages; use the supplied reference and viewing scale to choose a mechanism, not a mandatory black-and-red palette or landscape subject.

## Change how the mark is formed

Find the existing mark geometry and coordinate system first. For a material-only change, keep entity identities, ordering, data scales, geometry envelope and semantic colors intact. Add treatment in a local drawing/shading function rather than rewriting the whole visualization.

Possible mechanisms, chosen as needed:

- **Pressure and taper:** vary width along the path; the endpoint can lift, gather ink or break. Keep variation small enough to preserve any data-bearing width or outline.
- **Wet edge and wash:** use translucent layers with different edge softness and pigment density. Accumulated alpha saturates quickly; inspect overlapping marks before increasing layers. Blur should not erase category boundaries.
- **Dry stroke:** sparse gaps and directional strands should follow the stroke tangent and local width. Apply them to the mark, not as uniform full-frame noise.
- **Layering:** use a few purposeful passes for contour, wash and dry detail. Repeating every mark with arbitrary offsets often produces a glow or double image rather than ink.
- **Paper:** a low-contrast substrate can support a mark, but cannot substitute for mark formation. Preserve contrast and semantic colors on the creator’s current background; a material request does not authorize resetting it.

For a repeated dataset, sample marks by stable entity ID plus stroke purpose and seed. Do not use a single advancing random stream whose output shifts for every later entity when one is inserted. Time animation must have coherent mark variation, not fresh flicker per frame. Cache scale-independent treatment only when its dependencies are known; changed data or seed must invalidate it.

## Inspect at the actual scale

Check a close mark and the densest intended overview. A detail may look tactile while reducing to mud in a grid. Reduce passes, edge displacement or ink accumulation before abandoning the encoding. Confirm category distinctions, multi-valued marks, small special markers and selection remain visible. Compare with the previous picture at the same entity, parameters and time. Avoid unrelated symbols or ornamental lettering unless the creator asked for them.

## Provenance and boundaries

Ideas reviewed in the project research:

- [cloveric inkpaint.py](https://github.com/cloveric/claude-drawing-skill/blob/main/lib/inkpaint.py): pigment density, wash and dry stroke mechanisms. Its Python rendering system is not imported here.
- [MengTo ink-kit.mjs](https://github.com/MengTo/Skills/blob/main/agent-skills/illustration/illustration-ink-sketch/scripts/ink-kit.mjs): independent per-mark randomness and concrete mark treatment. Its cartoon subjects, fixed canvas and self-score thresholds are not adopted.

This is an original adaptation of concepts, with no bundled upstream code or artwork. It is an experimental reference, not a verified complete simulation of physical ink or a general definition of East Asian painting. Check upstream licenses before copying implementation or assets.
