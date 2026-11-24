# Motion Design Principles

Frame-rate agnostic motion theory for UI, video, and print.

## Disney's 12 Principles — Adapted for Digital

| # | Principle | Animation Origin | Digital Adaptation |
|---|-----------|-----------------|-------------------|
| 1 | **Squash & Stretch** | Volume preservation in deformation | `scale()` on click/hover; button press = scaleY(0.95) |
| 2 | **Anticipation** | Preparation before action | Hover state before click; pull-back before slide |
| 3 | **Staging** | Direct attention to action | Focus management; dim surrounding; spotlight effect |
| 4 | **Straight Ahead vs Pose-to-Pose** | Drawing method | CSS keyframes (pose) vs JS requestAnimationFrame (straight) |
| 5 | **Follow Through & Overlapping** | Parts settle at different times | Stagger delays; inertial scroll; text follows image |
| 6 | **Slow In & Slow Out** | Acceleration/deceleration | Easing functions (ease-in-out, cubic-bezier) |
| 7 | **Arc** | Natural curved motion paths | `offset-path`; Bézier motion; circular reveals |
| 8 | **Secondary Action** | Supporting motion | Ripple effects; icon rotation during loading |
| 9 | **Timing** | Speed conveys weight/mood | Duration system (see below) |
| 10 | **Exaggeration** | Push reality for clarity | Scale jumps; oversized hover states; dramatic parallax |
| 11 | **Solid Drawing** | 3D form awareness | `perspective()`; `transform-style: preserve-3d`; depth |
| 12 | **Appeal** | Design charm | Micro-delights; unexpected transitions; personality |

## Easing → Emotion

| Easing | CSS Value | Feeling | Use Case |
|--------|-----------|---------|----------|
| **Linear** | `linear` | Mechanical, robotic | Progress bars, loading indicators |
| **Ease-out** | `cubic-bezier(0.16, 1, 0.3, 1)` | Confident, decisive | Entrances, appearing elements |
| **Ease-in** | `cubic-bezier(0.55, 0.055, 0.675, 0.19)` | Hesitant, building | Exits, disappearing elements |
| **Ease-in-out** | `cubic-bezier(0.65, 0, 0.35, 1)` | Natural, balanced | Moving between states |
| **Ease-out-quart** | `cubic-bezier(0.25, 1, 0.5, 1)` | Smooth, premium | Page transitions |
| **Ease-out-expo** | `cubic-bezier(0.16, 1, 0.3, 1)` | Snappy, responsive | Menu open, drawer slide |
| **Spring** | Via JS (no CSS native) | Playful, organic | Toggle, card flip, bounce |
| **Overshoot** | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Energetic, fun | Notification pop, badge count |

### The Overshoot Formula
```javascript
// Spring physics in Remotion / JS
spring({ frame, fps, config: {
  damping: 10,      // Higher = less oscillation
  stiffness: 100,   // Higher = faster snap
  mass: 1,          // Higher = heavier feel
  overshootClamping: false  // Allow overshoot for playfulness
}});
```

```css
/* CSS spring approximation */
@keyframes spring-in {
  0% { transform: scale(0); }
  60% { transform: scale(1.08); }  /* overshoot */
  80% { transform: scale(0.97); }  /* settle back */
  100% { transform: scale(1); }
}
```

## Duration System

| Category | Duration | Frames @30fps | Examples |
|----------|----------|--------------|----------|
| **Instant** | 0–100ms | 0–3 | Button feedback, toggle, checkbox |
| **Micro** | 100–200ms | 3–6 | Hover states, tooltip, focus ring |
| **Small** | 200–300ms | 6–9 | Dropdown, tab switch, fade |
| **Medium** | 300–500ms | 9–15 | Modal, drawer, page element entrance |
| **Large** | 500–800ms | 15–24 | Page transition, hero reveal |
| **Dramatic** | 800–1200ms | 24–36 | Full-page animation, intro sequence |
| **Cinematic** | 1200ms+ | 36+ | Video transitions, brand reveals |

### Duration Rules
1. **Smaller elements = shorter duration** (a dot doesn't need 500ms to appear)
2. **Larger travel distance = longer duration** (slide across viewport > slide 50px)
3. **Exit < Enter** (elements should leave faster than they arrive — users don't want to wait)
4. **Mobile = shorter** (smaller screens = less distance = less time needed)

## Choreography Patterns

### Stagger
Elements enter one by one with consistent delay.
```css
.stagger > * {
  opacity: 0;
  animation: fadeSlideUp 400ms ease-out forwards;
}
.stagger > :nth-child(1) { animation-delay: 0ms; }
.stagger > :nth-child(2) { animation-delay: 50ms; }
.stagger > :nth-child(3) { animation-delay: 100ms; }
/* Optimal stagger: 30–80ms. Below 30 = imperceptible. Above 100 = feels slow. */
```

### Cascade
Like stagger but from a directional origin (top-left corner, center-out).
```css
/* Grid cascade from top-left */
.cascade > * {
  --row: 0; --col: 0;
  animation-delay: calc((var(--row) + var(--col)) * 40ms);
}
```

### Fan-Out
Elements spread from a single point.
```css
/* Fan from center */
.fan > * {
  --angle: 0deg;
  transform-origin: center bottom;
  animation: fanOut 500ms ease-out forwards;
}
@keyframes fanOut {
  from { transform: rotate(0) scale(0); opacity: 0; }
  to { transform: rotate(var(--angle)) scale(1); opacity: 1; }
}
```

### Typewriter
Sequential character reveal (frame-based for video, CSS for web).
```javascript
// Remotion typewriter
const Typewriter = ({ text, cps = 20 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const charCount = Math.min(text.length, Math.floor(frame / (fps / cps)));
  return <span>{text.slice(0, charCount)}</span>;
};
```

## Entrance / Exit Patterns

| Pattern | Entrance | Exit | Semantic |
|---------|----------|------|----------|
| **Fade** | opacity 0→1 | opacity 1→0 | Neutral, safe default |
| **Slide Up** | translateY(20px)→0 | translateY(0)→-20px | Content appearing, optimistic |
| **Slide Down** | translateY(-20px)→0 | translateY(0)→20px | Dropdown, gravity |
| **Scale** | scale(0.9)→1 | scale(1)→0.9 | Opening/closing, modals |
| **Clip Reveal** | clip-path inset→0 | clip-path 0→inset | Theatrical, editorial |
| **Blur** | blur(8px)→0 | blur(0)→8px | Dream-like, focus shift |
| **Wipe** | clip-path polygon sweep | reverse | Cinematic, slides |

### Clip-Path Reveal (editorial favorite)
```css
@keyframes clipReveal {
  from { clip-path: inset(0 100% 0 0); } /* hidden from right */
  to { clip-path: inset(0 0 0 0); }       /* fully visible */
}
/* Circular reveal from center */
@keyframes circleReveal {
  from { clip-path: circle(0% at 50% 50%); }
  to { clip-path: circle(75% at 50% 50%); }
}
```

## Motion Semantics

What different motion directions communicate:

| Direction | Meaning |
|-----------|---------|
| **Left → Right** | Progress, forward, next |
| **Right → Left** | Back, previous, undo |
| **Bottom → Top** | New content, optimistic, growth |
| **Top → Bottom** | Gravity, dropdown, weight |
| **Scale Up** | Open, expand, zoom in, detail |
| **Scale Down** | Close, collapse, zoom out, overview |
| **Rotate CW** | Progress, processing, time |
| **Rotate CCW** | Undo, reverse, rewind |
| **Blur In** | Focus, clarity, arrival |
| **Blur Out** | Defocus, departure, dream |

## Reduced Motion

Not just `prefers-reduced-motion: reduce` — design alternative experiences:

```css
@media (prefers-reduced-motion: reduce) {
  /* Don't just remove all animation — substitute */
  .entrance {
    animation: none;
    /* Replace slide with instant fade */
    opacity: 1; /* just show it */
  }

  /* Reduce, don't eliminate */
  .parallax { transform: none; } /* static, no scroll effect */
  .hover-scale { transform: none; } /* no scale on hover */

  /* Keep essential motion (loading states, progress) */
  .spinner { animation: spin 2s linear infinite; } /* still needed */
}
```

## Motion in Print (Implied)

Print can't move, but can imply motion:

- **Diagonal composition**: tilted elements suggest movement direction
- **Motion blur** (CSS filter or Photoshop): `filter: blur(2px)` on horizontal axis
- **Speed lines**: thin parallel lines trailing an element
- **Sequential frames**: comic-strip style progression
- **Blurred background, sharp foreground**: implies velocity (panning camera)
- **Progressive cropping**: series of images with increasing zoom = approaching motion

## Frame Rate Guide

| FPS | Name | Feeling | Use |
|-----|------|---------|-----|
| **12** | Limited animation | Choppy, hand-drawn | Lo-fi aesthetic, stop motion |
| **24** | Cinematic | Film-like, dreamy | Brand videos, cinematic content |
| **30** | Broadcast | Standard, reliable | Web video, screen recording |
| **60** | Smooth | Buttery, premium | UI animations, gaming |
| **120** | High refresh | Imperceptibly smooth | ProMotion displays, VR |

### Remotion Frame Rate Decision
```tsx
<Composition fps={30} /> // Default for brand videos
<Composition fps={24} /> // Cinematic feel
<Composition fps={60} /> // Smooth UI recordings
```
