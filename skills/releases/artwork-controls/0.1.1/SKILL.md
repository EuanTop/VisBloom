---
name: artwork-controls
description: Design, implement and verify artwork controls when a viewer needs to explore the work or a creator wants to edit specific visual decisions. Covers selection, filters, color, animation playback, timeline and seed in Visloom.
---

# Artwork controls

Start from the decision someone needs to make. A finished static work can have no controls. An interactive work may just need selection on a mark, a comparison, a change of viewpoint or a filter. Put the action near the part of the picture it affects. Give creators editing controls for choices they expect to revisit, such as palette, spacing or material, when those choices are useful to adjust. Keep committed design choices and compatible saved values when continuing a work.

## Design the action and the response together

Name what the person is trying to do and the change they can see or hear. An artwork might let them move light across a surface, select one object to compare it, or leave a mark for the next viewer. Prototype the first action and its result as a pair. Direct manipulation, an on-object affordance, or a quiet control in the composition can all fit. Keep the action discoverable on touch and usable by keyboard when supported by the medium. Test it without coaching.

Separate the viewer’s choices in the work from the creator’s editable properties. Declare editable properties that let the creator reach meaningfully different outcomes. For example, if color is editable, connect the chosen colors to the actual named layers or roles in the renderer, choose useful defaults, and check the extremes. A stable, author-selected color may be part of a finished composition. An artwork with no useful adjustable properties can omit the inspector controls.

## When the work involves time

Distinguish recorded time, the order of discrete observations and the artwork’s animation clock. A time column does not require playback. Use a selection, side-by-side views or a chapter when those let the audience see the relevant states more directly. Use play and pause when watching change unfold matters. Add seeking when the audience or creator needs to revisit moments. Make observed and interpolated states distinguishable. Surface a random seed only when regenerating a variation is useful and reproducible.

## Implement and check

Use [Visloom control contracts](references/visloom.md) for the inspector, viewer interaction and optional renderer playback. Exercise an actual control at two meaningfully different values. Check the expected visual or data change, preserve unrelated state, and reopen to verify a saved creator setting. Check the standalone work for any public interaction. When a work is meant to be static, check that the opening preview needs no playback and shows no stray transport or seed.
