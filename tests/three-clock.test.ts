import { afterEach, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { boot } from '../packages/plugin-renderer-three/src/runtime';
import type { PlaybackInfo, Project, RenderSnapshot } from '@art/contracts';

vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    domElement = { addEventListener() {} };
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    render() {}
  },
}));
vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    addEventListener() {}
    update() {}
  },
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
  { name: 'new static artwork', playbackMode: 'explicit', timeline: undefined, plays: false, seed: false },
  { name: 'clock-driven artwork', playbackMode: 'explicit', timeline: { enabled: true, label: 'Motion', duration: 5 }, plays: true, seed: false },
  { name: 'static artwork with seed variations', playbackMode: 'explicit', timeline: { enabled: false, label: 'Variation', duration: 0, usesSeed: true }, plays: false, seed: true },
  { name: 'legacy artwork', playbackMode: undefined, timeline: undefined, plays: true, seed: true },
] as const)('$name exposes and advances only its intended clock', async ({ playbackMode, timeline, plays, seed }) => {
  let frame!: FrameRequestCallback;
  let apply!: (event: { source: unknown; data: unknown }) => Promise<void>;
  const postMessage = vi.fn();
  const parent = { postMessage };
  vi.stubGlobal('window', { innerWidth: 800, innerHeight: 600, addEventListener(name: string, callback: typeof apply) { if (name === 'message') apply = callback; } });
  vi.stubGlobal('parent', parent);
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 600);
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('document', { body: { style: {}, append() {} } });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; });
  vi.spyOn(performance, 'now').mockReturnValue(0);

  const project: Project = { id: 'three-clock', name: 'Three.js clock', preset: 'blank', playbackMode, revision: 1, updatedAt: '', codeHash: 'source', files: [], schema: [], notes: '', state: { parameters: {}, mapping: { field: 'value', transform: 'linear', target: 'weight' }, seed: 42, time: 0, paused: false } };
  const snapshot: RenderSnapshot = { project, revision: project.revision, buildHash: 'build', time: 0 };
  const update = vi.fn();
  boot(() => ({ scene: new Scene(), timeline, update }));
  await apply({ source: parent, data: { channel: 'art-host-v1', type: 'apply', snapshot } });
  const ack = postMessage.mock.calls.find(([message]) => message.type === 'applied')?.[0].ack;
  expect(ack).toBeDefined();
  const reported: PlaybackInfo | undefined = ack.timeline;
  expect(Boolean(reported?.enabled)).toBe(plays);
  expect(Boolean(reported?.usesSeed)).toBe(seed);
  frame(100);
  expect(update.mock.lastCall?.[0].time).toBe(plays ? 0.1 : 0);
});
