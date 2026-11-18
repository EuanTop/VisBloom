import { afterEach, expect, it, vi } from 'vitest';
import type { CaptureRequest, Project, RenderSnapshot } from '@art/contracts';
import { boot, type DocumentArtwork, type DocumentArtworkContext } from '../packages/plugin-renderer-document/src/runtime';
import { normalizeLocalStyleUrls, PosterCaptureSession, validateCaptureRequest } from '../packages/plugin-renderer-document/src/capture';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const png = 'data:image/png;base64,iVBORw0KGgo=';
const request: CaptureRequest = { id: 'poster', revision: 1, buildHash: 'build', width: 1000, height: 5000, time: 0.7 };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(factory: (context: DocumentArtworkContext) => DocumentArtwork) {
  const handlers = new Map<string, Function>(), messages: any[] = [];
  const parent = { postMessage: (message: unknown) => messages.push(message) };
  const root: any = { style: { cssText: '', width: '', height: '', minHeight: '', overflow: '' }, setAttribute() {}, replaceChildren() {}, remove() {}, querySelectorAll: () => [] };
  const scrollTo = vi.fn();
  const browser: any = { parent, innerWidth: 900, innerHeight: 650, scrollX: 0, scrollY: 420, scrollTo,
    addEventListener: (name: string, fn: Function) => handlers.set(name, fn), removeEventListener: (name: string) => handlers.delete(name) };
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', { createElement: () => root, fonts: { ready: Promise.resolve() }, documentElement: { style: { cssText: '' } }, body: { style: { cssText: '' }, append() {} } });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { queueMicrotask(() => fn(0)); return 1; });
  const project: Project = { id: 'document-case', name: 'Document', preset: 'test', revision: 1, updatedAt: '', codeHash: 'source', files: [], schema: [], notes: '', state: { parameters: { amount: 3 }, mapping: { field: 'value', transform: 'linear', target: 'weight' }, seed: 42, time: 0.4, paused: true } };
  const snapshot = (p = project): RenderSnapshot => ({ project: p, revision: p.revision, buildHash: 'build', time: p.state.time });
  const send = (type: string, data: object = {}) => handlers.get('message')!({ source: parent, data: { channel: 'art-host-v1', type, ...data } });
  boot(factory);
  return { messages, send, snapshot, project, root, scrollTo };
}

it('restores the screen after poster entry or capture fails, rejects concurrent capture and permits retry', async () => {
  const session = new PosterCaptureSession(), events: string[] = [], pending = deferred<string>();
  const first = session.run(() => { events.push('poster'); }, () => pending.promise, () => { events.push('screen'); });
  await expect(session.run(() => { events.push('invalid second entry'); }, () => png, () => {})).rejects.toThrow('仍在生成');
  pending.reject(new Error('readback failed'));
  await expect(first).rejects.toThrow('readback failed');
  expect(events).toEqual(['poster', 'screen']);
  await expect(session.run(() => { throw new Error('poster layout failed'); }, () => png, () => { events.push('restored entry failure'); })).rejects.toThrow('poster layout failed');
  expect(events.at(-1)).toBe('restored entry failure');
  await expect(session.run(() => {}, () => png, () => {})).resolves.toBe(png);
});

it('accepts bounded long posters and rejects unsafe allocations', () => {
  expect(() => validateCaptureRequest({ ...request, width: 1000, height: 16384 })).not.toThrow();
  for (const [width, height] of [[4097, 1], [1, 16385], [4096, 6000], [100, NaN], [0, 100], [100.5, 100]]) {
    expect(() => validateCaptureRequest({ ...request, width, height })).toThrow();
  }
});

it('keeps inline gradients and normalizes same-document SVG references without allowing external assets', () => {
  expect(normalizeLocalStyleUrls('url("about:srcdoc#crater")', ['about:srcdoc'])).toBe('url("#crater")');
  expect(normalizeLocalStyleUrls("url('https://example.org/work#mask')", ['https://example.org/work'])).toBe('url("#mask")');
  expect(normalizeLocalStyleUrls('url("data:image/svg+xml,a#b")', [])).toBe('url("data:image/svg+xml,a#b")');
  expect(normalizeLocalStyleUrls('url(#local)', [])).toBe('url(#local)');
  expect(() => normalizeLocalStyleUrls('url("https://example.org/remote.png")', ['about:srcdoc'])).toThrow('外部');
});

it('acknowledges only after artwork readiness, passes interaction callbacks and restores after failed capture', async () => {
  const ready = deferred<void>(), contexts: DocumentArtworkContext[] = [];
  let current!: DocumentArtworkContext;
  const app = harness(context => {
    contexts.push(current = context);
    return { ready: ready.promise, objects: [{ id: 'flower', label: 'Flower' }], update: c => { contexts.push(current = c); }, capture: async () => { throw new Error('poster export failed'); } };
  });
  app.send('apply', { snapshot: app.snapshot() });
  await vi.waitFor(() => expect(contexts).toHaveLength(1));
  expect(app.messages.some(m => m.type === 'applied')).toBe(false);
  ready.resolve();
  await vi.waitFor(() => expect(app.messages.some(m => m.type === 'applied')).toBe(true));
  current.onParameters({ amount: 4 });
  expect(app.messages.find(m => m.type === 'parameters')).toMatchObject({ parameters: { amount: 4 }, revision: 1, buildHash: 'build' });
  current.onSelected('flower');
  await vi.waitFor(() => expect(app.messages.some(m => m.type === 'selected')).toBe(true));
  app.send('capture', { request });
  await vi.waitFor(() => expect(app.messages.find(m => m.type === 'error' && m.requestId === 'poster')?.message).toBe('poster export failed'));
  expect(contexts.some(c => c.mode === 'poster' && c.width === 1000 && c.height === 5000 && c.time === 0.7)).toBe(true);
  expect(current).toMatchObject({ mode: 'screen', width: 900, height: 650, time: 0.4, selectedId: 'flower', parameters: { amount: 3 } });
  expect(app.scrollTo).toHaveBeenLastCalledWith(0, 420);
  expect(app.messages.some(m => m.type === 'capture')).toBe(false);
  app.send('dispose');
});

it('serializes edits around export and rejects a stale or concurrent image instead of returning old pixels', async () => {
  const image = deferred<string>(), contexts: DocumentArtworkContext[] = [];
  const app = harness(c => { contexts.push(c); return { update: c => { contexts.push(c); }, capture: () => image.promise }; });
  app.send('apply', { snapshot: app.snapshot() });
  await vi.waitFor(() => expect(app.messages.some(m => m.type === 'applied')).toBe(true));
  app.send('capture', { request });
  await vi.waitFor(() => expect(contexts.at(-1)?.mode).toBe('poster'));
  app.send('capture', { request: { ...request, id: 'overlap' } });
  expect(app.messages.find(m => m.type === 'error' && m.requestId === 'overlap')?.message).toContain('仍在生成');
  const newer = { ...app.project, revision: 2, state: { ...app.project.state, parameters: { amount: 9 } } };
  app.send('apply', { snapshot: app.snapshot(newer) });
  image.resolve(png);
  await vi.waitFor(() => expect(app.messages.find(m => m.type === 'error' && m.requestId === 'poster')?.message).toContain('已变化'));
  await vi.waitFor(() => expect(app.messages.some(m => m.type === 'applied' && m.ack.revision === 2)).toBe(true));
  expect(contexts.at(-1)).toMatchObject({ mode: 'screen', parameters: { amount: 9 } });
  expect(app.messages.some(m => m.type === 'capture')).toBe(false);
  app.send('capture', { request: { ...request, id: 'retry', revision: 2 } });
  await vi.waitFor(() => expect(app.messages.find(m => m.type === 'capture' && m.id === 'retry')?.png).toBe(png));
  app.send('dispose');
});

it('keeps the natural document aspect ratio without letterboxing a long poster', async()=>{
 const {documentRasterSize}=await import('../packages/plugin-renderer-document/src/capture');
 expect(documentRasterSize(1440,4200,1440,6400)).toEqual({width:1440,height:4200});
 expect(documentRasterSize(1440,8400,1440,6400)).toEqual({width:1097,height:6400});
 expect(()=>documentRasterSize(0,4200,1440,6400)).toThrow();
});
