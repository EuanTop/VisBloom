# Workbench operations

## Connect and read

From the supplied repository root, use `npm run --silent art -- --help`, then `context --project ID`; set `ART_WORKBENCH_URL` for the supplied service. Use an explicit project ID throughout. Context is compact: files and complete results are fetched separately. Read file hashes before editing; retain eventCursor, use `context --after CURSOR` for changes, and follow hasMoreEvents. Use --out for large outputs, not --full by default.

For a new work use the designated project or `create --preset blank`; case presets contain finished source. Do not switch renderer or install another engine implicitly. CLI is the default entry; MCP is another adapter to the same state.

## Data through AVA

Inspect the actual schema and source notes. `query` is temporary AVA analysis; it does not replace the picture’s result or revision. `query --apply --revision N` deliberately applies new picture data. Check rowCount/truncated and page through result when necessary. Preserve source and SQL. Structured execution needs no extra model key; multimodal extraction and AVA model calls are distinct capabilities, not assumed available.

## Write without erasing the creator’s work

Read controls.json and the relevant source. Use patch for a declared parameter and files for geometry/behavior; save with current revision and actual expectedHash. Supply local source through a manifest/contentFile rather than shell-embedding it. Include accurate bindings:[{field,channel}] with changed source; descriptions explain implemented mappings and do not execute them. Changed non-control source without explicit bindings clears old descriptions. Use [] when no binding description is appropriate.

Preserve compatible control IDs, values, limits, camera and source edits outside the request. The Agent authors controls; the UI generates controls from those declarations, not by guessing intent. Re-read on revision/hash conflict and reconcile. After a human intervention, inspect file changes as well as parameter values before writing. Save checkpoints for directions worth retaining; restore produces a new revision.

## Renderer contract

The compiled entry is a named `export function createArtwork(context)`. Relative source helpers are supported; arbitrary Node imports and arbitrary package installs are not.

Canvas2D returns `{draw(context), ...}`. Draw context includes ctx, canvas, logical width/height, data, parameters, mapping, seed, time, selectedId. Use logical width/height rather than the physical canvas backing-store dimensions; the runtime manages pixel ratio and capture resizing. Optional hitTest(x,y), objects and dispose support inspection and cleanup. Optional timeline(context) declares enabled, label, duration, usesSeed and optional enableParameters. Static works need no pretend motion controls.

Three.js receives THREE, data, parameters, mapping, weights, seed, time, width/height, renderer and camera. It returns scene, optional camera/objects/update/dispose. Parameter-sensitive geometry must respond to updates; do not assume every parameter change reruns the factory. weights is only a helper for the selected numeric mapping; do not mistake it for semantically aligned weights for every original row with missing values. Dispose owned resources. The current Three runtime has a fixed animation contract; check actual project behavior instead of inventing per-artwork timeline support.

## View and deliver

Open the workbench at the supplied service with `?project=ID`. Use the built-in browser for this project. `capture --project ID --revision N --out artwork.png` requires a connected canvas applying that revision. Inspect the returned image, not only the response. Use the same width/height/time/state for comparisons; capture specific moments for dynamic work. Distinguish a disconnected renderer from a compile, data or artwork failure. Never pass an old image as a new revision.

`export --project ID --revision N --out artwork.html` produces a frozen standalone Web work. Only a completed job with downloaded bytes is delivered. PNG is the artwork, not the studio. Report missing capability/evidence accurately. Keep actual tool results when testing; actor categories do not authenticate model identity, and operator-simulated UI actions must be labelled as such.
