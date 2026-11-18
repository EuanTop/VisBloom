---
name: p5js-reference
description: Verify p5.js 1.x function syntax against the official reference instead of relying on memory. Use when writing, editing, debugging, or reviewing p5.js sketches (createCanvas, setup/draw, shapes, color, transforms, etc.) to avoid drift between training data and the actual API.
---

# p5.js Reference (1.x)

This skill targets **p5.js 1.x** (the version served at `p5js.org/reference/` and shipped by the web editor and default CDN). Ignore p5.js 2.x here — its API differs (no `preload()`, promise-based loading). If a project is on 2.x, this skill does not apply; say so rather than guessing.

## Core rule: don't trust memory for signatures

Library APIs drift from training data. Before writing a p5.js call you are not 100% certain of — especially parameter order, optional args, and constant names — **verify it** using the lookup procedure below. Treat the cheat-sheet in this file as the only signatures safe to use without checking; verify anything else.

## Confirm the project is 1.x

Quick checks, in order:
- `package.json` → a `p5` dependency starting `^1.` / `1.` (or no version pin → assume 1.x).
- An HTML `<script>` CDN tag like `.../p5.js/1.11.0/p5.min.js`.
- Code uses `preload()` or callback-style `loadImage(path, success, fail)` → 1.x.
- Code uses top-level `await` / promise-based `loadImage(...).then(...)` and no `preload()` → that's 2.x; stop and flag it.

## Lookup procedure

To confirm any function's signature, parameters, return value, or example:

1. **Live reference (authoritative):** WebFetch `https://p5js.org/reference/p5/<name>` — e.g. `https://p5js.org/reference/p5/ellipse`. This serves 1.x. Ask for the exact signature line and parameter list.
2. **Constants and classes:** `https://p5js.org/reference/p5.Vector` (class), `https://p5js.org/reference/p5.Color`, etc.
3. **Offline fallback:** if a local clone of `processing/p5.js` is available, grep the source comments: `grep -rn "@method <name>" src/`. Note: the `main` branch is 2.x; check out a `1.x` tag/branch for 1.x-accurate source.

When unsure between several spellings (e.g. `noFill` vs `noStroke`), look it up rather than guessing.

## Verified core cheat-sheet (1.x)

These are confirmed against the live reference and safe to use directly.

**Setup & canvas**
- `createCanvas(w, h, [renderer])` — renderer is `P2D` (default) or `WEBGL`. Returns a `p5.Renderer`.
- `createGraphics(w, h, [renderer])` — returns a `p5.Graphics` offscreen buffer; draw into it with the same API, then `image(pg, …)` or `saveCanvas(pg, …)`. Common for high-res export (render at a larger size / higher `pixelDensity`).
- `setup()` — runs once at start; create the canvas here. `preload()` runs before it for async asset loading (1.x).
- `draw()` — loops continuously after `setup()`.
- `background(...)` — `background(gray,[a])`, `background(v1,v2,v3,[a])`, `background(colorString)`, `background(p5.Color)`, `background(p5.Image)`.

**2D shapes**
- `circle(x, y, d)` — d is diameter.
- `ellipse(x, y, w, [h])`
- `rect(x, y, w, [h], [tl], [tr], [br], [bl])` — optional per-corner radii.
- `line(x1, y1, x2, y2)`
- `point(x, y)`
- `triangle(x1,y1, x2,y2, x3,y3)`
- `quad(x1,y1, x2,y2, x3,y3, x4,y4)`

**Color & style**
- `fill(...)` — `fill(gray,[a])`, `fill(v1,v2,v3,[a])`, `fill(colorString)`, `fill(p5.Color)`.
- `stroke(...)` — same overloads as `fill`.
- `noFill()`, `noStroke()` — no arguments.
- `strokeWeight(weight)`
- `color(...)` → `p5.Color` — `color(gray,[a])`, `color(v1,v2,v3,[a])`, `color(string)`, `color(values[])`.
- `colorMode(mode, [max])` — mode is `RGB` (default) or `HSB`.

**Transforms** (wrap in `push()` / `pop()` to scope them)
- `push()` / `pop()` — no arguments; save/restore style + transform state.
- `translate(x, y, [z])` or `translate(p5.Vector)`
- `rotate(angle)` — radians by default; use `radians(deg)` or call `angleMode(DEGREES)`.
- `scale(s)` or `scale(x, y, [z])`

**Text**
- `text(str, x, y, [maxWidth], [maxHeight])`
- `textSize(size)`
- `textAlign(horizAlign, [vertAlign])` — horiz: `LEFT|CENTER|RIGHT`; vert: `TOP|BOTTOM|CENTER|BASELINE`.

**Math & utility**
- `map(value, start1, stop1, start2, stop2, [withinBounds])` → Number
- `random([min], [max])` or `random(choicesArray)` — max is exclusive.
- `radians(degrees)` / `degrees(radians)`
- `dist(x1, y1, x2, y2)`
- `constrain(n, low, high)`
- `lerp(start, stop, amt)`
- `createVector([x], [y], [z])` → `p5.Vector`

**Input (system variables / events)**
- `mouseX`, `mouseY`, `pmouseX`, `pmouseY`, `width`, `height`, `frameCount` — variables, not calls.
- `frameRate(fps)` to set; `frameRate()` (no arg) to read.
- Event functions: `mousePressed()`, `mouseReleased()`, `mouseDragged()`, `keyPressed()`, `keyReleased()`.

**Images**
- `loadImage(path, [successCallback], [failureCallback])` → `p5.Image` (call in `preload()`).
- `image(img, x, y, [w], [h])`
- `saveCanvas([selectedCanvas], [filename], [extension])` — pass a `p5.Graphics`/`p5.Element`/`HTMLCanvasElement` as `selectedCanvas` to save a specific buffer; `extension` is `'png'` (default), `'jpg'`, or `'webp'`. Don't call in `draw()`.

**Accessibility**
- `describe(text, [display])` — `display` is `LABEL` or `FALLBACK`. Add one per sketch.

For functions not listed here, see `reference/common-functions.md` for more categories, or use the lookup procedure.

## Minimal sketch template (1.x)

```js
function setup() {
  createCanvas(400, 400);
  describe('A description of the sketch for screen readers.');
}

function draw() {
  background(220);
  circle(mouseX, mouseY, 50);
}
```

## 1.x gotchas worth flagging

- Default angle unit is **radians**. `rotate(90)` is ~1.5 full turns, not 90°. Use `radians(90)` or `angleMode(DEGREES)`.
- `circle(x, y, d)` takes a **diameter**, not a radius.
- `random(a, b)` upper bound is **exclusive**; `random(arr)` picks an element.
- Asset loading should happen in `preload()` so files are ready before `setup()`/`draw()`.
- Constants (`CENTER`, `WEBGL`, `DEGREES`, …) are globals in global mode — don't quote them as strings.
- In **instance mode** every call is namespaced (`p.circle(...)`, `p.mouseX`); the bare names above assume global mode.
