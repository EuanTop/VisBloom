import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { CaptureRequest, Project, RenderAck, RepositoryPlugin, ThumbnailRecord } from '@art/contracts';
import { createLocalRepository } from '../packages/plugin-storage-local/src/index';
import { createThumbnailCoordinator, thumbnailFingerprint, type ThumbnailSession } from '../apps/server/src/thumbnails';

const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const roots: string[] = [], repositories: RepositoryPlugin[] = [], coordinators: ReturnType<typeof createThumbnailCoordinator>[] = [];
function png(width = 480, height = 360) {
  const chunk = (name: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(name), data]); let crc = 0xffffffff;
    for (const byte of payload) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, payload, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'art-thumbnails-')); roots.push(directory);
  const repository = createLocalRepository({ directory }); repositories.push(repository);
  const content = 'export const value=1;';
  const project: Project = { id: 'project_a', name: 'Real preview', revision: 0, updatedAt: new Date().toISOString(), codeHash: digest(content), files: [{ path: 'src/artwork.ts', content, hash: digest(content) }], schema: [], preset: 'flow', notes: '', state: { parameters: { size: 1 }, seed: 1, time: 0, paused: true, mapping: { field: 'value', transform: 'linear', target: 'height' } } };
  await repository.create(project); await repository.syncFiles(project);
  const ack: RenderAck = { revision: project.revision, buildHash: 'build_a', frameTime: 0, objects: [] };
  const messages: { type: string; projectId: string; request: CaptureRequest }[] = [], notifications: unknown[] = [];
  let open = true, busy = false;
  const session: ThumbnailSession = { isOpen: () => open, send: message => messages.push(message as typeof messages[number]) };
  const coordinator = createThumbnailCoordinator({ repository, broadcast: message => notifications.push(message), isBusy: () => busy }); coordinators.push(coordinator);
  const respond = (request: CaptureRequest) => ({ type: 'render.thumbnail', projectId: project.id, id: request.id, revision: request.revision, buildHash: request.buildHash, png: `data:image/png;base64,${png().toString('base64')}` });
  return { directory, repository, project, ack, session, coordinator, messages, notifications, respond, close: () => { open = false; coordinator.disconnect(session); }, busy: (value: boolean) => { busy = value; } };
}
async function commit(repository: RepositoryPlugin, project: Project) {
  const next = structuredClone(project); next.revision++; next.state.parameters.size = 2;
  await repository.commit(project.id, project.revision, next, { projectId: next.id, revision: next.revision, at: new Date().toISOString(), actor: 'workbench', type: 'state.changed', detail: {} }); return next;
}
afterEach(async () => {
  for (const coordinator of coordinators.splice(0)) coordinator.dispose();
  vi.useRealTimers();
  for (const repository of repositories.splice(0)) await repository.dispose?.();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it('persists real PNG bytes across restart without revision, events, source, or jobs changing', async () => {
  const f = await fixture(); vi.useFakeTimers();
  await f.coordinator.observe(f.project, f.ack, f.session);
  await vi.advanceTimersByTimeAsync(900);
  expect(f.messages).toHaveLength(1); expect(f.messages[0].type).toBe('thumbnail.capture');
  await f.coordinator.receive(f.session, f.respond(f.messages[0].request));
  const saved = await f.repository.thumbnails!.get(f.project.id);
  expect(saved?.bytes).toEqual(new Uint8Array(png()));
  expect(saved?.record).toMatchObject({ projectId: f.project.id, revision: 0, codeHash: f.project.codeHash, buildHash: f.ack.buildHash, width: 480, height: 360 });
  expect(await f.repository.get(f.project.id)).toEqual(f.project);
  expect(await f.repository.events(f.project.id)).toEqual([]); expect(await f.repository.listJobs()).toEqual([]);
  expect(await readFile(join(f.repository.getProjectDirectory(f.project.id), 'src/artwork.ts'), 'utf8')).toBe(f.project.files[0].content);
  f.coordinator.dispose(); await f.repository.dispose?.();
  const fresh = createLocalRepository({ directory: f.directory }); repositories.push(fresh);
  expect(await fresh.thumbnails!.get(f.project.id)).toEqual(saved);
  const another = createThumbnailCoordinator({ repository: fresh, broadcast: () => {} }); coordinators.push(another);
  expect((await another.summaries())[0].thumbnail?.status).toBe('ready');
  await another.observe(f.project, f.ack, f.session); await vi.advanceTimersByTimeAsync(30000);
  expect(f.messages).toHaveLength(1);
});

it('binds responses to project, connection, revision and build; rejects stale PNGs atomically', async () => {
  const f = await fixture(); vi.useFakeTimers();
  await f.coordinator.observe(f.project, f.ack, f.session); await vi.advanceTimersByTimeAsync(900);
  const response = f.respond(f.messages[0].request);
  await f.coordinator.receive({ isOpen: () => true, send: () => {} }, response);
  await f.coordinator.receive(f.session, { ...response, projectId: 'wrong_project' });
  expect(await f.repository.thumbnails!.info(f.project.id)).toBeUndefined();
  const newer = await commit(f.repository, f.project);
  await f.coordinator.receive(f.session, response);
  expect(await f.repository.thumbnails!.info(f.project.id)).toBeUndefined();
  await f.coordinator.observe(newer, { ...f.ack, revision: newer.revision }, f.session); await vi.advanceTimersByTimeAsync(900);
  await f.coordinator.receive(f.session, f.respond(f.messages[1].request));
  const saved = (await f.repository.thumbnails!.info(f.project.id))!;
  expect(saved.revision).toBe(1);
  const stale: ThumbnailRecord = { ...saved, revision: 0, createdAt: new Date(Date.now() + 1000).toISOString() };
  expect(await f.repository.thumbnails!.save(stale, png())).toBe(false);
  expect(await f.repository.thumbnails!.save({ ...saved, codeHash: 'wrong' }, png())).toBe(false);
  expect(await f.repository.thumbnails!.save({ ...saved, createdAt: new Date(Date.parse(saved.createdAt) - 1000).toISOString() }, png())).toBe(false);
  expect(await f.repository.thumbnails!.info(f.project.id)).toEqual(saved);
});

it('bounds malformed capture retries, yields to exports, and recovers after a fresh connection', async () => {
  const f = await fixture(); vi.useFakeTimers(); f.busy(true);
  await f.coordinator.observe(f.project, f.ack, f.session); await vi.advanceTimersByTimeAsync(6000);
  expect(f.messages).toEqual([]);
  f.busy(false); await vi.advanceTimersByTimeAsync(1000);
  await f.coordinator.receive(f.session, { ...f.respond(f.messages[0].request), buildHash: 'wrong-build' });
  await vi.advanceTimersByTimeAsync(3000);
  await f.coordinator.receive(f.session, { ...f.respond(f.messages[1].request), png: `data:image/png;base64,${png(1, 1).toString('base64')}` });
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.messages).toHaveLength(2); expect((await f.coordinator.summaries())[0].thumbnail?.status).toBe('failed');
  f.close();
  const session = { isOpen: () => true, send: f.session.send };
  await f.coordinator.observe(f.project, f.ack, session); await vi.advanceTimersByTimeAsync(900);
  await f.coordinator.receive(session, f.respond(f.messages[2].request));
  expect((await f.coordinator.summaries())[0].thumbnail?.status).toBe('ready');
});

it('deduplicates ACKs, labels unopened projects honestly and marks modified visuals stale', async () => {
  const f = await fixture(); vi.useFakeTimers();
  expect((await f.coordinator.summaries())[0].thumbnail).toEqual({ status: 'waiting' });
  await f.coordinator.observe(f.project, f.ack, f.session); await f.coordinator.observe(f.project, f.ack, f.session);
  await vi.advanceTimersByTimeAsync(900); await f.coordinator.receive(f.session, f.respond(f.messages[0].request));
  await f.coordinator.observe(f.project, f.ack, f.session); await vi.advanceTimersByTimeAsync(30000);
  expect(f.messages).toHaveLength(1);
  const notes = { ...f.project, notes: 'Creator notes' };
  expect(thumbnailFingerprint(notes)).toBe(thumbnailFingerprint(f.project));
  await commit(f.repository, f.project);
  expect((await f.coordinator.summaries())[0].thumbnail?.status).toBe('stale');
});
