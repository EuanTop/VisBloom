import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkbenchError } from '@art/contracts';
import { waitForRenderer } from '../apps/server/src/render-readiness';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

function fixture() {
  const renderer = { ack: { revision: 1, buildHash: 'old' }, socket: { readyState: 1, send: vi.fn() }, at: 42 };
  let current: typeof renderer | undefined = renderer;
  let revision = 2;
  let active = true;
  const getRevision = vi.fn(async () => revision);
  return {
    renderer, getRevision,
    options: { getRenderer: () => current, getRevision, revision: 2, buildHash: 'new', isActive: () => active },
    setRenderer(value: typeof current) { current = value; },
    setRevision(value: number) { revision = value; },
    cancel() { active = false; },
  };
}

it('returns the concrete connected renderer once its stale acknowledgement catches up', async () => {
  const f = fixture();
  const ready = waitForRenderer(f.options);
  await vi.advanceTimersByTimeAsync(49);
  expect(f.getRevision).toHaveBeenCalledTimes(1);
  const updated = { ...f.renderer, ack: { revision: 2, buildHash: 'new' } };
  f.setRenderer(updated);
  await vi.advanceTimersByTimeAsync(1);
  const result = await ready;
  expect(result).toBe(updated);
  expect(result.at).toBe(42);
  expect(result.socket.send).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['missing', 'disconnected'] as const)('fails immediately for a %s renderer', async state => {
  const f = fixture();
  if (state === 'missing') f.setRenderer(undefined);
  else f.renderer.socket.readyState = 3;
  await expect(waitForRenderer(f.options)).rejects.toMatchObject({ code: 'renderer_unavailable', status: 503 });
  expect(f.getRevision).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('fails on the next poll when a connected renderer disconnects', async () => {
  const f = fixture();
  const failure = expect(waitForRenderer(f.options)).rejects.toMatchObject({ code: 'renderer_unavailable' });
  await vi.advanceTimersByTimeAsync(50);
  f.renderer.socket.readyState = 3;
  await vi.advanceTimersByTimeAsync(50);
  await failure;
  expect(Date.now()).toBe(100);
  expect(vi.getTimerCount()).toBe(0);
});

it('times out at the default fixed deadline despite changing stale acknowledgements', async () => {
  const f = fixture();
  const failure = expect(waitForRenderer(f.options)).rejects.toBeInstanceOf(WorkbenchError);
  await vi.advanceTimersByTimeAsync(2000);
  f.renderer.ack = { revision: 1, buildHash: 'another-build' };
  await vi.advanceTimersByTimeAsync(999);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  await vi.advanceTimersByTimeAsync(1);
  await failure;
  expect(Date.now()).toBe(3000);
  expect(vi.getTimerCount()).toBe(0);
});

it('never accepts a matching revision with the wrong build', async () => {
  const f = fixture();
  f.renderer.ack = { revision: 2, buildHash: 'wrong' };
  const failure = expect(waitForRenderer({ ...f.options, timeoutMs: 125 })).rejects.toMatchObject({ code: 'renderer_unavailable' });
  await vi.advanceTimersByTimeAsync(125);
  await failure;
  expect(Date.now()).toBe(125);
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects a changed project revision even if the renderer matches the requested snapshot', async () => {
  const f = fixture();
  const failure = expect(waitForRenderer(f.options)).rejects.toMatchObject({ code: 'revision_conflict', status: 409 });
  await vi.advanceTimersByTimeAsync(49);
  f.setRevision(3);
  f.renderer.ack = { revision: 2, buildHash: 'new' };
  await vi.advanceTimersByTimeAsync(1);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects cancellation before returning a newly matching renderer', async () => {
  const f = fixture();
  const failure = expect(waitForRenderer(f.options)).rejects.toMatchObject({ code: 'job_canceled', status: 409 });
  await vi.advanceTimersByTimeAsync(49);
  f.cancel();
  f.renderer.ack = { revision: 2, buildHash: 'new' };
  await vi.advanceTimersByTimeAsync(1);
  await failure;
  expect(f.getRevision).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['canceled', 'disconnected', 'missing'] as const)('rechecks a %s renderer/job after an asynchronous project read', async state => {
  const f = fixture();
  let finish!: (revision: number) => void;
  const read = new Promise<number>(resolve => { finish = resolve; });
  f.renderer.ack = { revision: 2, buildHash: 'new' };
  const failure = expect(waitForRenderer({ ...f.options, getRevision: () => read })).rejects.toMatchObject({ code: state === 'canceled' ? 'job_canceled' : 'renderer_unavailable' });
  if (state === 'canceled') f.cancel();
  else if (state === 'disconnected') f.renderer.socket.readyState = 3;
  else f.setRenderer(undefined);
  finish(2);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the wait bounded if the project revision read stalls', async () => {
  const f = fixture();
  const failure = expect(waitForRenderer({ ...f.options, getRevision: () => new Promise<number>(() => {}) })).rejects.toMatchObject({ code: 'renderer_unavailable' });
  await vi.advanceTimersByTimeAsync(3000);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});
