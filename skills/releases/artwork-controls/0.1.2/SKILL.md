---
name: artwork-controls
description: Design, implement and verify artwork controls when a viewer needs to explore the work or a creator wants to edit specific visual decisions. Covers selection, filters, color, animation playback, timeline and seed in Visloom.
---

# Artwork controls

Start from the decision someone needs to make. A finished static work can have no controls. An interactive work may just need selection on a mark, a comparison, a change of viewpoint or a filter. Put the action near the part of the picture it affects. Give creators editing controls for choices they expect to revisit, such as palette, spacing or material, when those choices are useful to adjust. Keep committed design choices and compatible saved values when continuing a work.

## When the work involves time

Distinguish recorded time, the order of discrete observations and the artwork’s animation clock. A time column does not require playback. Use a selection, side-by-side views or a chapter when those let the audience see the relevant states more directly. Use play and pause when watching change unfold matters. Add seeking when the audience or creator needs to revisit moments. Make observed and interpolated states distinguishable. Surface a random seed only when regenerating a variation is useful and reproducible.

## Implement and check

Use [playback choices](references/playback-choices.md) for pieces that run on their own or only need a play button. Use [Visloom control contracts](references/visloom.md) for the inspector, viewer interaction and optional renderer playback. Exercise an actual control at two meaningfully different values. Check the expected visual or data change, preserve unrelated state, and reopen to verify a saved creator setting. Check the standalone work for any public interaction. When a work is meant to be static, check that the opening preview needs no playback and shows no stray transport or seed.
