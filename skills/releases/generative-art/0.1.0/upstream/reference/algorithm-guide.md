# Algorithm Guide — Deep Reference

Progressive-load reference for generative art. Read when selecting algorithms, tuning parameters, or implementing style-specific patterns.

## Flow Field

The most versatile algorithm. Creates organic, wind-like motion by following a vector field derived from Perlin noise.

### Core p5.js Pattern
```javascript
let particles = [];
const NOISE_SCALE = 0.003;
const NUM_PARTICLES = 1000;

function setup() {
  createCanvas(1920, 1080);
  noiseSeed(42);
  randomSeed(42);
  background(getStyleColor('--color-bg'));

  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      x: random(width),
      y: random(height),
      prevX: 0,
      prevY: 0,
    });
  }
}

function draw() {
  for (let p of particles) {
    p.prevX = p.x;
    p.prevY = p.y;

    let angle = noise(p.x * NOISE_SCALE, p.y * NOISE_SCALE) * TWO_PI * 2;
    p.x += cos(angle) * 1.5;
    p.y += sin(angle) * 1.5;

    stroke(getStyleColor('--color-ink'));
    strokeWeight(0.5);
    line(p.prevX, p.prevY, p.x, p.y);

    // Wrap around edges
    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
      p.x = random(width);
      p.y = random(height);
      p.prevX = p.x;
      p.prevY = p.y;
    }
  }
}
```

### Parameter Tuning
| Parameter | Range | Effect |
|-----------|-------|--------|
| `NOISE_SCALE` | 0.001–0.01 | Lower = smoother, larger curves. Higher = turbulent, tight curls. |
| `NUM_PARTICLES` | 100–5000 | Density of lines. Print needs more (2000+). Screen 500–1000. |
| `stroke alpha` | 3–30 | Lower = ethereal wash. Higher = defined strokes. Ink Wash: 5–15. |
| `step size` | 0.5–3.0 | Distance per frame. Smaller = smoother curves, slower fill. |
| `angle multiplier` | 1–4 | Higher = more rotation in the field. 2 is standard. |
| `z-offset` (3D noise) | 0.001–0.005 | Animate the field over time. Creates morphing flow. |

### Style Variants
- **Ink Wash**: `alpha(5)`, `strokeWeight(0.3)`, no background clear, accumulated wash
- **Art Nouveau**: High curve tension, vary `strokeWeight(0.5–3)` by noise, vine-like tendrils
- **Wabi-Sabi**: Irregular particle count, intentional gaps, muted earth palette
- **Cyberpunk**: Neon stroke colors, dark bg, add glow via `drawingContext.shadowBlur`

---

## Particle System

Points in space with velocity, acceleration, and optional connections.

### Core p5.js Pattern
```javascript
class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D().mult(random(0.5, 2));
    this.acc = createVector(0, 0);
    this.size = random(2, 6);
    this.life = 255;
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(3);
    this.pos.add(this.vel);
    this.acc.mult(0);
    this.life -= 0.5;
  }

  draw() {
    noStroke();
    fill(getStyleColor('--color-accent', this.life));
    circle(this.pos.x, this.pos.y, this.size);
  }

  isDead() { return this.life <= 0; }

  applyForce(force) { this.acc.add(force); }
}
```

### Parameter Tuning
| Parameter | Range | Effect |
|-----------|-------|--------|
| `particle count` | 50–2000 | Sparse (minimalism) to dense (impressionism) |
| `velocity limit` | 1–5 | Calm vs energetic |
| `connection distance` | 50–200 | Draw lines between nearby particles |
| `life decay` | 0.1–2 | Slow fade vs quick turnover |
| `attraction/repulsion` | -0.5–0.5 | Clustering vs dispersal behavior |

---

## Voronoi

Cellular tessellation — divides space into regions closest to each seed point.

### Core p5.js Pattern
```javascript
// Uses d3-delaunay (bundle with project)
import { Delaunay } from 'd3-delaunay';

let points;

function setup() {
  createCanvas(1920, 1080);
  randomSeed(42);
  points = Array.from({ length: 200 }, () => [random(width), random(height)]);
}

function draw() {
  background(getStyleColor('--color-bg'));
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  for (let i = 0; i < points.length; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell) continue;

    fill(getStyleColor(`--color-cell-${i % 5}`));
    stroke(getStyleColor('--color-border'));
    strokeWeight(1);
    beginShape();
    for (const [x, y] of cell) vertex(x, y);
    endShape(CLOSE);
  }
  noLoop(); // Static output
}
```

### Parameter Tuning
| Parameter | Range | Effect |
|-----------|-------|--------|
| `point count` | 20–500 | Fewer = large dramatic cells. More = fine mosaic. |
| `point distribution` | uniform / clustered / grid-jittered | Organic vs structured feel |
| `relaxation iterations` | 0–10 | Lloyd's algorithm: 0 = organic, 10 = uniform hexagonal |
| `cell fill` | solid / gradient / image-sampled | Visual complexity per cell |

---

## Cellular Automata

Grid-based rules create emergent patterns (Game of Life, Wolfram rules, etc.).

### Core p5.js Pattern
```javascript
let grid, next;
const CELL_SIZE = 4;
let cols, rows;

function setup() {
  createCanvas(1920, 1080);
  cols = floor(width / CELL_SIZE);
  rows = floor(height / CELL_SIZE);
  randomSeed(42);

  grid = Array.from({ length: cols }, () =>
    Array.from({ length: rows }, () => random() > 0.5 ? 1 : 0)
  );
  next = grid.map(col => [...col]);
}

function draw() {
  background(getStyleColor('--color-bg'));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (grid[i][j] === 1) {
        fill(getStyleColor('--color-cell'));
        noStroke();
        rect(i * CELL_SIZE, j * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }
  // Conway's Game of Life rules
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let neighbors = countNeighbors(i, j);
      if (grid[i][j] === 1) {
        next[i][j] = (neighbors === 2 || neighbors === 3) ? 1 : 0;
      } else {
        next[i][j] = (neighbors === 3) ? 1 : 0;
      }
    }
  }
  [grid, next] = [next, grid];
}
```

### Parameter Tuning
| Parameter | Range | Effect |
|-----------|-------|--------|
| `CELL_SIZE` | 2–20px | Resolution: tiny = texture, large = visible cells |
| `initial density` | 0.2–0.8 | Starting randomness threshold |
| `rule set` | Conway / Wolfram / custom | Determines emergent behavior |
| `generation speed` | 1–10 per frame | Slow evolution vs rapid pattern |

---

## Fractal

Self-similar recursive structures — trees, snowflakes, Mandelbrot, L-systems.

### Core p5.js Pattern (Recursive Tree)
```javascript
function setup() {
  createCanvas(1920, 1080);
  randomSeed(42);
  background(getStyleColor('--color-bg'));
  translate(width / 2, height);
  stroke(getStyleColor('--color-branch'));
  branch(200, 0);
  noLoop();
}

function branch(len, depth) {
  if (len < 4 || depth > 12) return;

  strokeWeight(map(len, 4, 200, 0.5, 4));
  line(0, 0, 0, -len);
  translate(0, -len);

  let angle = PI / 6 + random(-0.1, 0.1); // Controlled randomness
  let shrink = 0.67 + random(-0.05, 0.05);

  push();
  rotate(angle);
  branch(len * shrink, depth + 1);
  pop();

  push();
  rotate(-angle);
  branch(len * shrink, depth + 1);
  pop();
}
```

### Parameter Tuning
| Parameter | Range | Effect |
|-----------|-------|--------|
| `branch angle` | PI/8–PI/3 | Narrow (pine) to wide (oak) |
| `shrink factor` | 0.5–0.8 | How quickly branches reduce |
| `max depth` | 6–14 | Detail level (performance cost is exponential!) |
| `angle variance` | 0–0.2 | Organic (high) vs geometric (0) |
| `min length` | 2–10 | When to stop recursion |

---

## Wave

Oscillating sinusoidal patterns — interference, moiré, water effects.

### Core p5.js Pattern
```javascript
let t = 0;

function setup() {
  createCanvas(1920, 1080);
}

function draw() {
  background(getStyleColor('--color-bg'));
  noFill();

  for (let y = 100; y < height - 100; y += 15) {
    stroke(getStyleColor('--color-wave'));
    strokeWeight(1.5);
    beginShape();
    for (let x = 0; x < width; x += 5) {
      let wave1 = sin(x * 0.01 + t) * 30;
      let wave2 = sin(x * 0.02 - t * 0.5) * 15;
      let wave3 = sin(y * 0.005 + t * 0.3) * 20;
      vertex(x, y + wave1 + wave2 + wave3);
    }
    endShape();
  }
  t += 0.02;
}
```

### Parameter Tuning
| Parameter | Range | Effect |
|-----------|-------|--------|
| `frequency` (x multiplier) | 0.005–0.05 | Wavelength: low = broad waves, high = tight ripples |
| `amplitude` | 10–100 | Wave height |
| `wave count` (superposition) | 1–5 | Complexity of interference pattern |
| `line spacing` | 5–30 | Density of wave rows |
| `time increment` | 0.005–0.05 | Animation speed |

---

## CSS Color Injection Pattern

All algorithms should read colors from the style system, never hardcode.

```javascript
/**
 * Read CSS custom property from the HTML wrapper.
 * The scaffold sets these from the style's palette.
 */
function getStyleColor(varName, alpha = 255) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName).trim();
  if (!raw) return color(128, alpha); // fallback gray
  const c = color(raw);
  c.setAlpha(alpha);
  return c;
}
```

### Standard CSS Variables (set by scaffold)
```css
:root {
  --color-bg: #f5f0e8;
  --color-ink: #1a1a2e;
  --color-accent: #e63946;
  --color-secondary: #457b9d;
  --color-muted: #a8a8a8;
  --color-cell-0 through --color-cell-4: /* voronoi fills */
}
```

These are overridden by the style system. The sketch code stays the same — only CSS changes per style.
