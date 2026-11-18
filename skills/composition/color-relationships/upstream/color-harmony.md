# Color Harmony & Psychology

Beyond palettes — the science of why certain colors work together and what they communicate.

## Harmony Systems

### Classical Harmonies (on 360° wheel)

| Harmony | Angles | Effect | Use When |
|---------|--------|--------|----------|
| **Complementary** | 180° apart | Maximum contrast, vibrant | CTAs, accent pops |
| **Analogous** | ±30° neighbors | Harmonious, calm | Backgrounds, gradients |
| **Triadic** | 120° intervals | Balanced variety | Playful, energetic brands |
| **Split-complementary** | 150°+210° | Contrast with nuance | Safer than complementary |
| **Tetradic (rectangular)** | 2 complementary pairs | Rich, complex | Full palettes |
| **Square** | 90° intervals | Even tension | Vibrant, equal-weight |

### OKLCH Color Space

The correct space for perceptual uniformity. HSL is broken — same L value looks wildly different across hues.

```css
/* OKLCH: Lightness (0-1), Chroma (0-0.4), Hue (0-360) */
:root {
  --primary: oklch(0.65 0.22 250);     /* saturated blue */
  --primary-light: oklch(0.85 0.12 250); /* same hue, lighter */
  --primary-dark: oklch(0.35 0.18 250);  /* same hue, darker */

  /* Tinted gray (never pure gray) */
  --gray-warm: oklch(0.75 0.02 80);   /* warm gray, hint of gold */
  --gray-cool: oklch(0.75 0.02 250);  /* cool gray, hint of blue */
}

/* Complementary pair in OKLCH */
--accent: oklch(0.70 0.25 30);   /* warm orange */
--complement: oklch(0.70 0.25 210); /* cool blue — same L and C */
```

**Key insight**: Equal Chroma in OKLCH = equal perceived saturation. Equal Lightness = equal perceived brightness. HSL guarantees neither.

## Itten's 7 Color Contrasts

Johannes Itten (Bauhaus, 1961) — the most complete framework:

| Contrast | What Varies | Design Effect |
|----------|------------|---------------|
| **Hue** | Different hues at full saturation | Loud, primitive, Pop Art |
| **Value** (light-dark) | Lightness only | Depth, volume, hierarchy |
| **Saturation** (quality) | Chroma intensity | Focus vs. background |
| **Temperature** (warm-cool) | Warm ↔ cool hues | Spatial depth (warm advances, cool recedes) |
| **Complementary** | Opposite hues | Vibration, energy |
| **Simultaneous** | Induced complement by eye | Afterimage, optical effects |
| **Extension** (quantity) | Area ratio | Balance (large muted + small saturated) |

### Extension Ratios (Itten's balance)
- Yellow : Violet = 1 : 3 (yellow is so luminous it needs 1/4 the area)
- Orange : Blue = 1 : 2
- Red : Green = 1 : 1
- Practical: accent colors need less area than they feel. A tiny gold accent balances a large navy field.

## Albers' Color Relativity

From "Interaction of Color" (1963):

1. **Context changes color**: Same gray looks warm on cool background, cool on warm background
2. **Subtraction**: Two different colors can look identical against different backgrounds
3. **Transparency illusion**: Middle color between two others reads as transparent overlay
4. **Fluting**: Adjacent stripes of slightly different values create illusion of curvature

**Practical rule**: Never judge a color in isolation. Always test against its actual neighbors.

## Color Temperature & Space

- **Warm colors** (red, orange, yellow): advance, feel closer, more energetic
- **Cool colors** (blue, green, violet): recede, feel farther, more calming
- **Spatial design**: Cool backgrounds + warm foreground elements = perceived depth
- **Exception**: Very dark warm colors (maroon, brown) recede; very light cools (cyan) can advance

```css
/* Depth through temperature */
.hero {
  background: oklch(0.25 0.08 250); /* deep cool blue — recedes */
  color: oklch(0.90 0.15 80);       /* warm cream — advances */
}
```

## Color Psychology

### Universal Associations (cross-cultural)

| Color | Positive | Negative | Industry Default |
|-------|----------|----------|-----------------|
| **Red** | Energy, passion, urgency | Danger, aggression | Food, retail, alerts |
| **Blue** | Trust, calm, professional | Cold, corporate | Finance, tech, health |
| **Green** | Growth, nature, safety | Envy, nausea | Environment, health, wealth |
| **Yellow** | Optimism, warmth, attention | Anxiety, caution | Children, food, warnings |
| **Purple** | Luxury, creativity, mystery | Excess, mourning | Beauty, luxury, spirituality |
| **Orange** | Energy, fun, affordable | Cheap, overwhelming | Retail, entertainment |
| **Black** | Power, elegance, authority | Death, evil | Luxury, fashion, tech |
| **White** | Purity, simplicity, space | Sterile, empty | Minimal, health, tech |

### Chinese Color Meanings (中国文化)

| Color | Traditional Meaning | Modern Usage |
|-------|-------------------|-------------|
| **Red 红** | Fortune, joy, celebration | Weddings, New Year, positive signals |
| **Gold 金** | Wealth, imperial, noble | Luxury brands, premium tiers |
| **Yellow 黄** | Imperial (forbidden to commoners) | Caution in modern; historical prestige |
| **White 白** | Mourning, death, purity | Modern: clean/minimal (cultural shift) |
| **Black 黑** | Water element, mystery, depth | Modern: sophisticated (Western influence) |
| **Green 绿** | Spring, growth, jade | Positive; "绿帽子" = infidelity (avoid green hats) |
| **Blue 蓝** | Sky, immortality | Tech, trustworthy |

### Synesthetic Color-Sound Mapping

#### Scriabin's Color Organ (1911)
| Note | Color | Character |
|------|-------|-----------|
| C | Red | Will, power |
| D | Yellow | Joy, brilliance |
| E | Pearly blue-white | Dreams |
| F | Deep red | Passion |
| G | Orange-pink | Creative play |
| A | Green | Material, earth |
| B | Pearl/silver | Moonlight |

#### Kandinsky's System ("Concerning the Spiritual in Art", 1912)
- Yellow = trumpet, spreading outward, aggressive
- Blue = organ/cello, pulling inward, spiritual
- Green = violin middle notes, boring calm
- Red = drums, powerful, contained
- White = silence before music begins
- Black = silence after music ends (dead silence)

### Design Application of Sound-Color
```css
/* "Loud" palette (high chroma, warm = brass section) */
.palette--fortissimo {
  --bg: oklch(0.95 0.08 80);     /* warm cream */
  --accent: oklch(0.65 0.28 30);  /* saturated vermillion */
  --secondary: oklch(0.75 0.22 80); /* bright gold */
}

/* "Quiet" palette (low chroma, cool = strings) */
.palette--pianissimo {
  --bg: oklch(0.97 0.01 250);    /* near-white, cool */
  --accent: oklch(0.55 0.08 250); /* muted blue */
  --secondary: oklch(0.70 0.04 180); /* whisper green */
}
```

## Proportion Rules

### 60-30-10 (Classic)
- 60% dominant (background, large surfaces)
- 30% secondary (supporting elements, cards, sidebars)
- 10% accent (CTAs, highlights, key interactions)

### Variations
- **70-25-5** (dramatic): more background dominance, less accent = luxury, editorial
- **80-10-10** (minimal): near-monochrome with sharp accent = Swiss, Muji
- **50-30-15-5** (complex): 4-color system for rich palettes = magazines, dashboards

### Color Budget
- **1 accent color** is almost always enough. 2 max. 3 = danger zone.
- Every additional accent color halves the impact of the first one.

## Accessibility

### Beyond WCAG Ratios
- **Deuteranopia** (red-green, 8% of men): Never encode meaning with only red vs green
- **Protanopia** (red-blind, 1%): Red appears dark/invisible — don't use red-on-dark
- **Tritanopia** (blue-yellow, rare): Blue and green become indistinguishable

### Safe Patterns
- Use **shape + color** for status (checkmark + green, X + red)
- Use **pattern + color** for charts (stripes, dots, not just hue)
- Test with browser's `forced-colors: active` media query
- Minimum contrast: 4.5:1 for text, 3:1 for large text and UI elements

```css
/* Color-blind safe status indicators */
.status--success { color: oklch(0.55 0.20 145); } /* green */
.status--success::before { content: "✓ "; }       /* shape backup */
.status--error { color: oklch(0.55 0.25 25); }    /* red */
.status--error::before { content: "✗ "; }          /* shape backup */
```

## Anti-Patterns

- Pure gray (#808080) for anything — always tint toward your palette
- Neon accent on dark = AI slop. Use one saturated color, not everything neon
- Purple-to-blue gradient = the most overused AI-generated palette of 2024-2025
- Gradient text on headings = decorative, not communicative
- Rainbow = no hierarchy. Every color at once = nothing stands out
