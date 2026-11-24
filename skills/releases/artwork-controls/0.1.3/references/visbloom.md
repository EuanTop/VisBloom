# VisBloom control contracts

## Creator controls and viewer interaction

Declare creator-editable numbers, booleans, options and six-digit hex colors in `controls.json`. Read live values from `context.parameters` in the drawing or update path. Preserve compatible IDs and saved values on a revision. If a palette edit changes a data scale, update the legend with the same color mapping. A project can use an empty control list.

Implement viewer interactions within the artwork so they work in its standalone export. Use the renderer’s selection and parameter callbacks where the workbench needs to reflect or save that state. Avoid two viewer controls for the same action.

## Workbench playback and seed

New projects show the workbench transport only when the artwork opts in. Canvas2D declares `timeline(context)` and Three.js returns a `timeline` object. Use `{enabled: true, label, duration, usesSeed: false}` for a clock-driven animation. Use `{enabled: false, label, duration: 0, usesSeed: true}` when only reproducible variation needs an editable seed. A disabled Canvas2D timeline can supply `enableParameters` when a real artwork setting activates a preview. For an existing Three.js project created before explicit playback, omitting the declaration preserves its legacy transport. Set `enabled: false` and `usesSeed: false` explicitly when removing those controls from a legacy work.

The document renderer has no workbench transport. Use the work’s own playback or direct selection when it serves the audience. Keep the published artwork’s controls inside the artwork, including when it uses Canvas2D or Three.js.
