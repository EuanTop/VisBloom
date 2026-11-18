export interface ScenePlaybackState { playing: boolean; visible: boolean; reducedMotion: boolean; explicitMotion: boolean }

export function createScenePlayback(options: {
  state: ScenePlaybackState;
  onFrame: (elapsed: number) => void;
  onChange?: (active: boolean) => void;
  onError?: (error: unknown) => void;
  fps?: number;
}) {
  let state = { ...options.state }, frame: number | null = null, elapsed = 0, last = 0, disposed = false, active = false;
  const allowed = () => !disposed && state.playing && state.visible && (!state.reducedMotion || state.explicitMotion);
  const publish = (next: boolean) => { if (next !== active) { active = next; options.onChange?.(next); } };
  const tick = (now: number) => {
    frame = null;
    if (!allowed()) { publish(false); return; }
    const delta = now - last;
    if (delta >= 1000 / (options.fps ?? 24)) {
      elapsed += Math.min(delta, 250) / 1000; last = now;
      try { options.onFrame(elapsed); }
      catch (error) { disposed = true; publish(false); options.onError?.(error); return; }
    }
    frame = requestAnimationFrame(tick);
  };
  const reconcile = () => {
    if (allowed()) {
      if (frame === null) { last = performance.now(); frame = requestAnimationFrame(tick); }
      publish(true);
    } else {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; publish(false);
    }
  };
  return {
    setState(patch: Partial<ScenePlaybackState>) { state = { ...state, ...patch }; reconcile(); },
    getElapsed: () => elapsed,
    dispose() { disposed = true; reconcile(); },
  };
}
