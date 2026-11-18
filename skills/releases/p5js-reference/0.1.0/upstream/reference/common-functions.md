# p5.js 1.x — common functions by category

A broader index than the SKILL.md cheat-sheet. Signatures here are from the official 1.x reference, but **when accuracy matters, confirm against** `https://p5js.org/reference/p5/<name>`. This file is intentionally not exhaustive — p5.js has hundreds of functions; look up anything not listed.

## Contents
- Structure & environment
- Shapes (2D)
- Vertices & custom shapes
- Color
- Transformations
- Typography
- Image & pixels
- Math
- Random & noise
- Vectors (p5.Vector)
- Input & events
- DOM (p5.dom)

## Structure & environment
- `createCanvas(w, h, [renderer])` → `p5.Renderer`
- `createGraphics(w, h, [renderer])` → `p5.Graphics` — offscreen buffer (a second canvas not added to the page); draw into it with the same API, then `image(pg, …)` or `saveCanvas(pg, …)`.
- `resizeCanvas(w, h, [noRedraw])`
- `noCanvas()`
- `background(...)`
- `clear()`
- `loop()` / `noLoop()` / `isLooping()`
- `redraw([n])`
- `frameRate([fps])`
- `frameCount` (variable)
- `deltaTime` (variable)
- `windowWidth` / `windowHeight` / `width` / `height` (variables)
- `windowResized()` (event)
- `pixelDensity([val])`

## Shapes (2D)
- `circle(x, y, d)`
- `ellipse(x, y, w, [h])`
- `arc(x, y, w, h, start, stop, [mode], [detail])` — mode: `CHORD|PIE|OPEN`
- `rect(x, y, w, [h], [tl], [tr], [br], [bl])`
- `square(x, y, s, [tl], [tr], [br], [bl])`
- `line(x1, y1, x2, y2)`
- `point(x, y)`
- `triangle(x1,y1, x2,y2, x3,y3)`
- `quad(x1,y1, x2,y2, x3,y3, x4,y4)`
- `ellipseMode(mode)` / `rectMode(mode)` — mode: `CENTER|RADIUS|CORNER|CORNERS`
- `strokeCap(cap)` — `ROUND|SQUARE|PROJECT`
- `strokeJoin(join)` — `MITER|BEVEL|ROUND`
- `smooth()` / `noSmooth()`

## Vertices & custom shapes
- `beginShape([kind])`
- `vertex(x, y, [z], [u], [v])`
- `curveVertex(x, y)`
- `bezierVertex(x2,y2, x3,y3, x4,y4)`
- `quadraticVertex(cx,cy, x3,y3)`
- `endShape([mode])` — mode: `CLOSE`
- `beginContour()` / `endContour()`
- `bezier(x1,y1, x2,y2, x3,y3, x4,y4)`
- `curve(...)`

## Color
- `fill(...)` / `stroke(...)`
- `noFill()` / `noStroke()`
- `color(...)` → `p5.Color`
- `colorMode(mode, [max])` — `RGB|HSB|HSL`
- `red(c)` / `green(c)` / `blue(c)` / `alpha(c)`
- `hue(c)` / `saturation(c)` / `brightness(c)` / `lightness(c)`
- `lerpColor(c1, c2, amt)`
- `strokeWeight(w)`

## Transformations
- `push()` / `pop()`
- `translate(x, y, [z])`
- `rotate(angle, [axis])`
- `rotateX/Y/Z(angle)` (WEBGL)
- `scale(s)` / `scale(x, y, [z])`
- `shearX(angle)` / `shearY(angle)`
- `angleMode(mode)` — `RADIANS|DEGREES`
- `resetMatrix()` / `applyMatrix(...)`

## Typography
- `text(str, x, y, [maxWidth], [maxHeight])`
- `textSize(size)`
- `textAlign(horiz, [vert])` — horiz: `LEFT|CENTER|RIGHT`; vert: `TOP|BOTTOM|CENTER|BASELINE`
- `textFont(font, [size])`
- `loadFont(path, [success], [fail])` → `p5.Font` (in `preload()`)
- `textWidth(str)`
- `textLeading(leading)`
- `textStyle(style)` — `NORMAL|ITALIC|BOLD|BOLDITALIC`

## Image & pixels
- `loadImage(path, [success], [fail])` → `p5.Image` (in `preload()`)
- `image(img, x, y, [w], [h])`
- `imageMode(mode)` — `CORNER|CORNERS|CENTER`
- `tint(...)` / `noTint()`
- `createImage(w, h)` → `p5.Image`
- `loadPixels()` / `updatePixels()`
- `get([x], [y], [w], [h])` / `set(x, y, c)`
- `pixels` (array) — index of pixel `(x, y)` is `(y * width * pixelDensity + x) * 4`; `[r, g, b, a]`.
- `saveCanvas([selectedCanvas], [filename], [extension])` — `selectedCanvas` (optional) is a `p5.Graphics` / `p5.Element` / `HTMLCanvasElement` to save a specific buffer instead of the main canvas; `extension` is `'png'` (default), `'jpg'`, or `'webp'`.
- A resized `p5.Image` (via `img.resize(w, h)`) is always `pixelDensity` 1, regardless of the display.

## Math
- `map(value, start1, stop1, start2, stop2, [withinBounds])`
- `constrain(n, low, high)`
- `lerp(start, stop, amt)`
- `dist(x1, y1, x2, y2)` / `dist(x1,y1,z1, x2,y2,z2)`
- `mag(a, b)`
- `norm(value, start, stop)`
- `abs/ceil/floor/round/sq/sqrt/pow/exp/log(...)`
- `min(...)` / `max(...)`
- `radians(deg)` / `degrees(rad)`
- `sin/cos/tan(angle)` and `asin/acos/atan/atan2(...)`
- Constants: `PI`, `TWO_PI`, `HALF_PI`, `QUARTER_PI`, `TAU`

## Random & noise
- `random([min], [max])` / `random(choicesArray)`
- `randomSeed(seed)`
- `randomGaussian([mean], [sd])`
- `noise(x, [y], [z])`
- `noiseSeed(seed)`
- `noiseDetail(lod, [falloff])`

## Vectors (p5.Vector)
- `createVector([x], [y], [z])` → `p5.Vector`
- Instance: `.add` `.sub` `.mult` `.div` `.mag` `.normalize` `.limit` `.setMag` `.heading` `.rotate` `.dist` `.dot` `.cross` `.lerp` `.copy`
- Static: `p5.Vector.add(v1, v2)`, `p5.Vector.sub(...)`, `p5.Vector.dist(...)`, `p5.Vector.random2D()`, `p5.Vector.fromAngle(angle)`

## Input & events
- Variables: `mouseX` `mouseY` `pmouseX` `pmouseY` `winMouseX` `winMouseY` `mouseButton` `mouseIsPressed` `key` `keyCode` `keyIsPressed` `movedX` `movedY` `touches`
- Mouse events: `mousePressed()` `mouseReleased()` `mouseClicked()` `doubleClicked()` `mouseMoved()` `mouseDragged()` `mouseWheel(event)`
- Keyboard events: `keyPressed()` `keyReleased()` `keyTyped()` `keyIsDown(code)`
- Touch events: `touchStarted()` `touchMoved()` `touchEnded()`

## DOM (p5.dom)
- `createButton(label)` / `createSlider(min, max, [value], [step])`
- `createInput([value])` / `createCheckbox([label], [value])`
- `createSelect()` / `createDiv([html])` / `createP([html])`
- `createElement(tag, [content])`
- `select(selector)` / `selectAll(selector)`
- Element methods: `.position(x, y)` `.size(w, h)` `.html(...)` `.style(prop, val)` `.attribute(...)` `.mousePressed(fn)` `.changed(fn)` `.input(fn)` `.value()` `.parent(p)` `.child(...)` `.remove()`
