# Presentation and playback

Animation can be the medium of a piece without requiring a timeline. In a Canvas artwork, the `timeline()` return value can use `transport: 'hidden'` for a self-running piece, `'playback'` for play, pause and restart, or `'seek'` for the full scrubber. Omission preserves existing workbench behavior. These settings describe the workbench bar. For an audience-facing control, add a deliberate action to the artwork itself. Choose a replay or pause action when timing, accessibility, or repeat viewing needs one.

When an effect has a precise change, capture the state before and after at the same size. Use the saved opening state to verify what a new viewer actually sees. The presence of a clock or a recorded animation in code is separate from what the viewer can perceive.
