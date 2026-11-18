---
name: creative-generative-art
description: |
  p5.js generative art sketch creation (6 algorithms, 54 styles). Triggers: 生成式, generative, p5.js, flow field, 生成艺术, creative coding, algorithmic art, 粒子, particle.
  Do NOT use for: data visualization → creative-infographic, video encoding → creative-motion.
  Part of maestro-creative toolkit. CLI: creative generative {command}.
---

# Generative Art — Design Intelligence

> Design foundation: [Impeccable](~/.claude/skills/frontend-design/SKILL.md) aesthetic system.
> Style system: 54 art styles via [style-system.md](../_creative-shared/style-system.md).

## Design Philosophy

Generative art is the intersection of algorithm and aesthetics. Unlike static design (poster, handbook) where YOU place every element, generative art defines RULES and lets the system create. These 4 principles separate art from noise:

1. **Algorithm IS the art** — Choosing flow-field vs voronoi vs fractal is the primary creative decision, equivalent to a painter choosing watercolor vs oil. The algorithm determines the visual language. Don't pick an algorithm randomly — study the 6 options below and match to your intended aesthetic.

2. **Controlled randomness** — Uncontrolled `random()` produces chaos, not art. Always use `randomSeed()` for reproducibility. Parameterize EVERYTHING: particle count, noise scale, color variance, step size. The artist's job is to constrain the parameter space to the region where beauty lives.

3. **Style drives algorithm** — Each art style has a natural algorithmic partner:
   - Ink Wash (水墨) → flow-field with wash gradients, fade-out alpha
   - Bauhaus → voronoi with primary colors, hard geometric cells
   - Art Nouveau → organic flow-field with whiplash curves, vine-like tendrils
   - Ukiyo-e → wave algorithm with layered color blocks
   - Brutalism → cellular-automata with monochrome grid, harsh edges
   - Op Art → wave with precise mathematical oscillation

   Read the style-to-algorithm mapping below before designing.

4. **Print vs interactive** — Canvas size must be explicit for print (px dimensions mapped to mm at target DPI). Interactive sketches need framerate management (`frameRate(30)` minimum, `60` for smooth motion). These are fundamentally different modes — decide which before writing a single line.

## Format Rules

### Canvas Dimensions
| Target | Width | Height | DPI | Pixel Size |
|--------|-------|--------|-----|------------|
| Screen (HD) | 1920 | 1080 | 72 | 1920×1080 |
| Screen (4K) | 3840 | 2160 | 72 | 3840×2160 |
| A4 print | 210mm | 297mm | 300 | 2480×3508 |
| A3 print | 297mm | 420mm | 300 | 3508×4961 |
| Square (social) | 1080 | 1080 | 72 | 1080×1080 |
| Poster (large) | 594mm | 841mm | 150 | 3508×4967 |

### Export Sizes
- **PNG**: default output for stills. Use `save('output.png')` or `saveCanvas()`
- **SVG**: use `createCanvas(w, h, SVG)` via p5.js-svg — vector output for print
- **GIF**: use `saveGif('output', duration)` — p5.js built-in (v1.6+)

### Framerate Targets
| Mode | Target FPS | Notes |
|------|-----------|-------|
| Interactive (smooth) | 60 | Default, use for mouse-reactive sketches |
| Interactive (ambient) | 30 | Background animations, reduce CPU |
| Export (frame capture) | — | Use `noLoop()` + manual `redraw()` |
| GIF recording | 15–30 | Higher = larger file |

## 6 Algorithms — Selection Guide

| Algorithm | Visual Character | Best For | Complexity |
|-----------|-----------------|----------|------------|
| flow-field | Organic flowing lines, wind-like | Backgrounds, abstract art, ink-wash style | Medium |
| particle-system | Dynamic scattered dots, connections | Space, energy, network visuals | Low–Medium |
| voronoi | Cellular organic shapes, territory | Nature, networks, mosaic patterns | Medium |
| cellular-automata | Grid-based emergent patterns | Textures, organic growth, game-of-life | Low |
| fractal | Self-similar recursive structures | Mathematical beauty, tree/branch forms | High |
| wave | Rhythmic oscillation, interference | Audio viz, water, rhythm, moiré patterns | Low |

### Decision Flowchart
```
Want organic, flowing motion?     → flow-field
Want dots, connections, scatter?  → particle-system
Want cell shapes, territory maps? → voronoi
Want grid patterns, emergence?    → cellular-automata
Want recursion, self-similarity?  → fractal
Want rhythmic, oscillating forms? → wave
```

## Style-to-Algorithm Mapping

| Style | Primary Algorithm | Secondary | Key Parameters |
|-------|-------------------|-----------|---------------|
| Ink Wash (水墨) | flow-field | particle-system | noiseScale: 0.003, alpha: 5–15, stroke fade |
| Bauhaus | voronoi | cellular-automata | Primary palette, hard edges, geometric fills |
| Art Nouveau | flow-field | — | Curve tension: high, whiplash motifs, vine density |
| Art Deco | particle-system | wave | Radiating lines, gold palette, symmetry: radial |
| Ukiyo-e | wave | flow-field | Layer count: 5–7, flat color blocks, wave amplitude |
| Minimalism | particle-system | flow-field | Particle count: low (50–200), monochrome, sparse |
| Op Art | wave | cellular-automata | Frequency: high, contrast: max, precision patterns |
| Brutalism | cellular-automata | voronoi | Grid: visible, monochrome, high contrast |
| Impressionism | particle-system | flow-field | High particle count, pastel palette, short strokes |
| Cyberpunk | particle-system | wave | Neon palette, dark bg, glow effect, grid overlay |
| Wabi-Sabi (侘寂) | flow-field | — | Muted earth tones, imperfection, asymmetry |
| De Stijl | voronoi | cellular-automata | Red/blue/yellow + black, orthogonal only |

For the complete 54-style mapping, see `reference/algorithm-guide.md`.

## Design-First Workflow

### Phase 1: INSPIRE
```bash
# Get creative brief: style DNA + algorithm recommendation
bun scripts/inspire.ts --style <slug>

# Or via unified CLI
bun cli/creative.ts inspire --style <slug> --format generative
```
**Read before coding:**
- `_creative-shared/anti-slop.md` — Universal quality gates (ALWAYS)
- `styles/{era}/{slug}.md` — Style's Design DNA, palette, anti-slop rules
- Style-to-algorithm mapping above — which algorithm fits your style?

### Phase 2: DESIGN
Make these 5 decisions before writing any code:
1. **Algorithm** — Which of the 6? (Use the mapping table + style guide)
2. **Parameter space** — What ranges for noise, count, size, speed? Start wide, narrow to beauty.
3. **Color strategy** — Inject style palette as p5 color variables. Dominant (60%) + secondary (30%) + accent (10%).
4. **Canvas + output** — Print (fixed px, high DPI) or interactive (viewport, framerate)?
5. **Randomness control** — Pick a `randomSeed()`. Test 5–10 seeds. Keep the best.

### Phase 3: BUILD
```bash
# Scaffold project with algorithm + style
bun scripts/scaffold.ts ./art --algorithm flow-field --style ink-wash

# Or via unified CLI
bun cli/creative.ts generative new ./art --algorithm flow-field --style ink-wash
```
After scaffolding:
- Tune parameters in the sketch file (the scaffold sets sensible defaults)
- Run in browser to iterate visually
- Use `randomSeed()` to lock good outputs

### Phase 4: QA
```bash
bun scripts/qa.ts ./art
# Checks: canvas size, framerate, color palette compliance, export readiness
```
Manual checklist:
- [ ] Algorithm matches style intent (not random selection)
- [ ] `randomSeed()` set for reproducible output
- [ ] Colors come from style palette — no hardcoded hex
- [ ] Canvas dimensions match target (print vs screen)
- [ ] Interactive: `frameRate()` set, no performance jank
- [ ] Print: explicit pixel dimensions at target DPI
- [ ] No `loadFont()` with remote URL in `preload()` (use CSS `@import`)

## Required Reading

| When | File | What to Extract |
|------|------|-----------------|
| Always | `_creative-shared/anti-slop.md` | All rules — never violate |
| Always | `reference/algorithm-guide.md` | Code patterns per algorithm, parameter tuning |
| Style specified | `styles/{era}/{slug}.md` | Design DNA → algorithm recommendation |
| Style specified | `knowledge/workflows/style-to-format-matrix.md` | **Generative** column for your style |
| Color | `knowledge/principles/color-theory.md` | Palette injection as p5 variables |
| Typography | `knowledge/principles/typography.md` | Text overlay on canvas (if needed) |
| CSS effects | `knowledge/techniques/css-effects.md` | HTML wrapper styling |
| Print export | `knowledge/principles/print-rules.md` | Canvas-to-PDF workflow |

## Gotchas

1. **`loadFont()` remote URL in `preload()` = black screen** — p5.js hangs forever if fetch fails. Load fonts via CSS `@import`, then `textFont('Family Name')` string. This is the #1 bug in generative art projects.

2. **`pixelDensity(2)` doubles memory** — Required for Retina clarity, but a 4K canvas at density 2 = 8K internal buffer. Cap with `pixelDensity(min(displayDensity(), 2))`. For print export, set density ONCE before `createCanvas()`.

3. **`noiseDetail()` performance cliff** — Default octaves=4 is fine. Octaves > 6 tanks framerate with zero visual benefit. Keep `noiseDetail(4, 0.5)` unless you have a specific reason.

4. **p5.js `random()` is NOT seedable across sessions** — Use `randomSeed(42)` in `setup()`. But `noise()` uses a SEPARATE seed — call `noiseSeed(42)` too. Missing either = different output each run.

5. **Canvas size for print must be PRE-CALCULATED** — `createCanvas(2480, 3508)` for A4@300DPI. Do NOT use mm units — p5.js only understands pixels. See the dimensions table above.

6. **Style colors must be injected, not hardcoded** — The scaffold generates CSS variables. Read them in p5 via `getComputedStyle()` or pass as URL params. Hardcoded hex = style system bypass = slop.

7. **Interactive sketches need `frameRate()` management** — Ambient backgrounds: `frameRate(30)`. Reactive art: `frameRate(60)`. Export mode: `noLoop()` + `redraw()`. Never leave framerate unbounded.

8. **SVG export requires p5.js-svg library** — `createCanvas(w, h, SVG)` is NOT built into p5.js core. Install `p5.js-svg` and import separately. SVG mode does NOT support `loadPixels()` or pixel manipulation.

## Composability

- Generative art → handbook cover: export PNG, use in creative-handbook
- Generative art → animated: pipe to `creative-motion gif` for GIF export
- Generative art → poster background: export + layer text via creative-poster
- Generative art → data overlay: combine with creative-infographic charts

## CLI Quick Reference

```bash
CLI=cli/creative.ts

# Scaffold generative art project
bun $CLI generative new ./art --algorithm flow-field --style ink-wash
bun $CLI generative new ./bg --algorithm voronoi --style bauhaus --title "Composition"
bun $CLI generative new ./wave --algorithm wave --style ukiyo-e

# Build and preview
bun $CLI build --serve

# Export
bun $CLI pdf --open  # Print canvas

# Knowledge commands (use before designing)
bun $CLI inspire --style ink-wash --format generative
bun $CLI palette --style ink-wash
bun $CLI anti-slop --style ink-wash
bun $CLI techniques --style ink-wash --format generative
```

| Option | Values | Default |
|--------|--------|---------|
| `--algorithm` | flow-field, particle-system, voronoi, cellular-automata, fractal, wave | flow-field |
| `--style` | Any of 54 art style slugs | — |
| `--title` | Sketch title | — |
| `--seed` | Random seed integer | — |
| `--size` | WxH pixels or preset (HD, 4K, A4, A3) | HD |
| `--interactive` | Enable mouse/keyboard interaction | true |
