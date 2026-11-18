# Composition Theory

Principles for arranging visual elements to create hierarchy, flow, and meaning.

## Proportional Systems

### Golden Ratio (φ = 1.618)
- Split any dimension: major = total / 1.618, minor = total − major
- A4 page (210mm): content column = 130mm, margin = 80mm
- Two-column: 61.8% main + 38.2% sidebar
- Nested: apply recursively for sub-regions

```css
/* Golden ratio grid */
.golden-layout {
  display: grid;
  grid-template-columns: 1fr 0.618fr; /* 61.8% + 38.2% */
}
.golden-layout--reverse {
  grid-template-columns: 0.618fr 1fr;
}
```

### Rule of Thirds
- Simpler than golden ratio — divide into 3×3 grid
- Place focal points at intersections, not center
- Prefer upper-right intersection for primary CTA (eye scans L→R, settles upper-right)
- Use for image cropping, hero placement, dashboard layouts

### Dynamic Symmetry (Jay Hambidge)
- Root rectangles: √2 (A-series paper), √3, √4 (double square), √5 (contains golden)
- Diagonal armature: draw diagonals + reciprocals → intersection points guide placement
- A4 is a √2 rectangle — its diagonal intersections naturally create harmonious zones

### Sacred Geometry
- **Vesica Piscis**: two overlapping circles → almond shape = natural frame for portraits, logos
- **Fibonacci Spiral**: 1, 1, 2, 3, 5, 8, 13, 21... — maps to visual flow paths
- **Pentagon/Pentagram**: internal angle 108°/72° — used in Art Deco, Islamic geometry

## Gestalt Principles

| Principle | Definition | Design Application |
|-----------|-----------|-------------------|
| **Proximity** | Near elements = grouped | Card grids, form field clusters |
| **Similarity** | Similar elements = related | Consistent card styles, icon families |
| **Closure** | Mind completes incomplete shapes | Logo design, implied containers |
| **Continuity** | Eye follows smooth paths | Navigation flows, scroll paths |
| **Figure-Ground** | Foreground/background separation | Dark/light sections, overlay modals |
| **Common Fate** | Same-direction elements = grouped | Parallax layers, staggered animations |
| **Prägnanz** | Mind prefers simplest interpretation | Clean hierarchy, reduce visual noise |

## Visual Weight

Factors that make elements "heavier" (attract attention):

1. **Size** — larger = heavier (exponential, not linear)
2. **Color saturation** — saturated > muted > gray
3. **Value contrast** — high contrast against surroundings = heavier
4. **Isolation** — element with space around it weighs more than clustered
5. **Texture** — textured > smooth
6. **Position** — bottom-right feels heaviest (Western reading gravity)
7. **Complexity** — detailed > simple (use sparingly — too much = noise)

### Balancing Weight
- Symmetrical balance: equal weight both sides (formal, corporate)
- Asymmetrical balance: different elements of equal visual weight (dynamic, editorial)
- Radial balance: elements radiate from center (mandala, ceremonial)
- Crystallographic balance: even distribution (pattern, wallpaper, generative art)

## Negative Space

### Western Concept
- Not "empty" — it's an active design element
- Tight spacing = relationship. Wide spacing = separation
- Irregular negative space = tension. Regular = calm
- Macro whitespace (between sections) > micro whitespace (between elements)

### Japanese Ma (間)
- Emptiness as meaning — silence between notes makes music
- Space is not absence but presence of potential
- Applied: generous page margins, breathing room in dense layouts, pause in animation sequences
- The interval between things reveals their relationship

```css
/* Ma-inspired generous spacing */
.section--ma {
  padding-block: clamp(4rem, 8vw, 8rem);
  margin-block: clamp(2rem, 4vw, 4rem);
}
```

## Page Construction Canons

### Van de Graaf Canon
- Classical proportion for books: text block = 1/9 page height from top, 1/9 from outside
- Inner margin : top margin : outer margin : bottom = 1 : 1.5 : 2 : 3
- Result: text block is same proportion as page

### Tschichold's Golden Canon
- Simplified: inner margin = 1 unit, top = 1.5, outer = 2, bottom = 3
- For A4: inner = 15mm, top = 22mm, outer = 30mm, bottom = 45mm
- Bottom margin largest → page doesn't feel top-heavy

### Modern Adaptation
```css
/* Tschichold-inspired page margins */
.page {
  padding: 22mm 30mm 45mm 15mm; /* top outer bottom inner */
}
/* Spread (facing pages) */
.page:nth-child(even) {
  padding: 22mm 15mm 45mm 30mm; /* flip inner/outer */
}
```

## Grid Types

| Grid Type | Structure | Best For |
|-----------|-----------|----------|
| **Manuscript** | Single text block | Long-form reading, novels |
| **Column** | 2–6 vertical columns | Newspapers, magazines, dashboards |
| **Modular** | Columns + rows | Complex layouts, image galleries |
| **Hierarchical** | Organic zones | Web pages, editorial |
| **Baseline** | Horizontal rhythm | Typography-heavy layouts |

### Column Math
- Gutter ratio: column width / gutter width = 5:1 to 3:1
- For 12-column grid on 210mm page (15mm margins each side): column = 11mm, gutter = 5.3mm
- Minimum readable column: 40–75 characters (Chinese: 20–35 characters)

## Compositional Tension

- **Diagonal**: tilted elements create energy, movement, instability
- **Tangent**: edges barely touching = awkward; overlap or separate
- **Cropping**: cutting into subjects implies continuity beyond frame
- **Scale contrast**: extreme size differences (3–5×) create drama
- **Entry point**: where the eye enters the composition — typically top-left (LTR) or top-right (RTL/CJK vertical)

## Anti-Patterns

- Center everything → monotonous, no hierarchy
- Equal spacing everywhere → no rhythm, no grouping
- Same-size elements → no focal point, visual democracy = visual boredom
- Symmetric grid with centered text → corporate template territory
- Ignoring the edges → elements "floating" without relationship to frame
