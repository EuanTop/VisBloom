import { afterEach, expect, it, vi } from 'vitest';
import { createScenePlayback } from '../apps/workbench/src/portal/scenePlayback';
import { createSceneInteraction, wrapYaw } from '../apps/workbench/src/portal/sceneInteraction';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function frameHarness() {
  let now = 0, nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return {
    tick(milliseconds = 50) { now += milliseconds; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); },
    advance(milliseconds: number) { now += milliseconds; },
    pending: () => frames.size,
  };
}

it('autoplays visible artwork, pauses without advancing time and resumes without a jump', () => {
  const clock = frameHarness(), rendered: number[] = [], changes: boolean[] = [];
  const playback = createScenePlayback({
    state: { playing: true, visible: false, reducedMotion: false, explicitMotion: false },
    onFrame: elapsed => rendered.push(elapsed), onChange: active => changes.push(active),
  });
  playback.setState({ visible: true });
  for (let i = 0; i < 20; i++) clock.tick();
  expect(rendered.length).toBe(20);
  expect(rendered.at(-1)).toBeCloseTo(1);
  playback.setState({ playing: false });
  clock.advance(5000); clock.tick();
  expect(rendered).toHaveLength(20);
  expect(clock.pending()).toBe(0);
  playback.setState({ playing: true }); clock.tick();
  expect(rendered.at(-1)).toBeCloseTo(1.05);
  playback.setState({ visible: false }); clock.tick();
  expect(clock.pending()).toBe(0);
  playback.dispose(); playback.setState({ visible: true });
  expect(clock.pending()).toBe(0);
  expect(changes).toEqual([true, false, true, false]);
});

it('honors reduced motion by default while allowing an explicit play action, then stops on failure', () => {
  const clock = frameHarness(), rendered: number[] = [], errors: unknown[] = [];
  let fail = false;
  const playback = createScenePlayback({
    state: { playing: true, visible: true, reducedMotion: true, explicitMotion: false },
    onFrame: elapsed => { if (fail) throw new Error('draw failed'); rendered.push(elapsed); },
    onError: error => errors.push(error),
  });
  playback.setState({});
  clock.tick(); expect(rendered).toHaveLength(0);
  playback.setState({ explicitMotion: true });
  clock.tick(); clock.tick();
  expect(rendered).toHaveLength(2);
  playback.setState({ playing: false });
  clock.tick(); expect(rendered).toHaveLength(2);
  playback.setState({ playing: true });
  fail = true; clock.tick(); clock.tick();
  expect(errors).toHaveLength(1);
  expect(clock.pending()).toBe(0);
});

it('eases hover back to the saved drag view and keeps extreme pointer input inside camera limits', () => {
  const camera = createSceneInteraction();
  camera.drag(200, 50);
  const saved = camera.step(true);
  camera.hover(1, -1);
  expect(camera.step().settled).toBe(false);
  camera.leave();
  let view = camera.step();
  for (let i = 0; i < 60; i++) view = camera.step();
  expect(view).toEqual(saved);
  camera.drag(100000, -100000); camera.hover(100, -100);
  view = camera.step(true);
  expect(view.yaw).toBeGreaterThanOrEqual(-180);
  expect(view.yaw).toBeLessThan(180);
  expect(view.pitch).toBeGreaterThanOrEqual(-85);
  expect(view.pitch).toBeLessThanOrEqual(85);
  expect(wrapYaw(-900)).toBe(-180);
});
