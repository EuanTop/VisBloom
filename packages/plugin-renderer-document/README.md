# Document renderer

`renderer.document` hosts an artwork's own HTML, CSS, SVG and canvas inside the
same isolated preview used by the other renderers. The page scrolls normally.
There are no built-in chapters, explanatory panels or genre-specific controls.

```ts
export function createArtwork(context) {
  // Append the artwork's DOM to context.root.
  return {
    update(nextContext) { /* update the existing document */ },
    // ready: a promise for artwork-owned asynchronous initialization,
    // objects: [{ id, label }],
    // capture(request): an optional custom PNG exporter,
    dispose() { /* remove listeners, timers and graphics resources */ },
  };
}
```

Context provides `root`, `width`, `height`, `parameters`, `data`, `mapping`, `seed`,
`time`, `selectedId`, `mode`, `onParameters(partial)` and `onSelected(id)`.
`mode` is `screen` while viewing and `poster` while exporting. The artwork owns
its layout in both modes; its `update` may return a promise. If `update` is absent,
the runtime disposes and recreates the artwork when its state changes.

Embedded controls propose parameter edits to the host; the host commits them
through the normal revision flow. Standalone HTML applies those edits locally.

PNG export waits for artwork readiness, images, fonts and layout. It first asks
the artwork to enter poster mode, captures its full scrollable content into the
requested size envelope at the content aspect ratio (no letterboxing), then restores screen mode and
the previous scroll position in a `finally` block. A changed revision or overlapping
request fails explicitly. The output is bounded to 4096 pixels wide, 16384 pixels
high and 24 million total pixels.

The built-in exporter copies computed styles and SVG definitions, freezes CSS
animation at the current appearance, snapshots embedded canvas pixels and loaded
images, and rasterizes a self-contained SVG foreign object. Use system fonts or
embedded font data and inline SVG/data-URI assets. External CSS resources, external
fonts and embedded videos/frames require an artwork-provided `capture` method;
they fail explicitly rather than silently disappearing. WebGL canvases must allow
readback when exporting, or provide their own capture path. Browser-specific CSS
effects can differ in foreign-object rendering, so inspect the actual exported
PNG when introducing a new material or graphics technique.
