import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job, Project, RepositoryPlugin, ThumbnailRecord } from '@art/contracts';
import { createLocalRepository } from '../packages/plugin-storage-local/src/index';

const repositories: RepositoryPlugin[] = [], directories: string[] = [];
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function project(id: string): Project {
  const content = 'export function createArtwork() { return { draw() {} }; }';
  return {
    id, name: id, revision: 7, updatedAt: '2026-11-09T00:00:00.000Z', preset: 'skinbloom', renderer: 'renderer.canvas2d',
    state: { parameters: { speed: 1, ink: '#123456' }, mapping: { field: 'value', transform: 'linear', target: 'height' }, seed: 4, time: 12, paused: true },
    schema: [], files: [{ path: 'src/artwork.ts', content, hash: hash(content) }], codeHash: hash(content), notes: 'Author notes retained',
    dataset: { id: 'dataset_a', name: 'source.csv', format: 'csv', bytes: 8, hash: hash('value\n4\n'), createdAt: 'then', schema: { fields: ['value'] }, profile: { count: 1 } },
    result: { id: 'result_a', datasetId: 'dataset_a', sql: 'SELECT * FROM data', columns: ['value'], rows: [{ value: 4 }], rowCount: 1, truncated: false, createdAt: 'then' },
  };
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'art-lifecycle-')); directories.push(directory);
  const repository = createLocalRepository({ directory }); repositories.push(repository);
  const initial = project('trash_target'), other = project('keep_project');
  await repository.create(initial); await repository.syncFiles(initial);
  await repository.create(other); await repository.syncFiles(other);
  const current = structuredClone(initial); current.revision++; current.state.parameters.speed = 2;
  await repository.commit(initial.id, initial.revision, current, { projectId: current.id, revision: current.revision, type: 'state.changed', actor: 'workbench', detail: { before: initial.state, after: current.state }, at: current.updatedAt });
  const checkpoint = await repository.checkpoint(current.id, 'Author design baseline');
  await repository.putBlob('datasets/dataset_a.csv', Buffer.from('value\n4\n'));
  const job: Job = { id: 'job_a', projectId: current.id, revision: current.revision, type: 'export', status: 'completed', createdAt: 'then', filename: 'retained.html' };
  await repository.saveJob(job);
  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const thumbnail: ThumbnailRecord = { projectId: current.id, revision: current.revision, codeHash: current.codeHash, buildHash: 'build_hash', fingerprint: 'frame_hash', contentHash: hash(bytes), width: 800, height: 600, time: 12, createdAt: '2026-11-09T00:00:01.000Z' };
  expect(await repository.thumbnails!.save(thumbnail, bytes)).toBe(true);
  const filename = join(repository.getProjectDirectory(current.id), 'src/artwork.ts');
  return { directory, repository, current, other, checkpoint, job, bytes, thumbnail, filename };
}
afterEach(async () => {
  await Promise.allSettled(repositories.splice(0).map(repository => repository.dispose?.()));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('recoverable local project lifecycle', () => {
  it('hides trashed projects and rejects their normal reads and writes while preserving other projects', async () => {
    const { repository, current, other, checkpoint, thumbnail, bytes, filename } = await fixture();
    expect(repository.manifest.capabilities).toContain('project.trash');
    const deleted = await repository.lifecycle!.trash(current.id, current.revision);
    expect(deleted).toMatchObject({ id: current.id, revision: current.revision });
    expect(Number.isFinite(Date.parse(deleted.deletedAt))).toBe(true);
    expect((await repository.list()).map(project => project.id)).toEqual([other.id]);
    expect(await repository.get(other.id)).toEqual(other);
    expect(await repository.lifecycle!.listDeleted()).toEqual([{ id: current.id, name: current.name, revision: current.revision, updatedAt: current.updatedAt, deletedAt: deleted.deletedAt }]);
    const next = { ...current, revision: current.revision + 1 };
    for (const operation of [
      () => repository.get(current.id),
      () => repository.commit(current.id, current.revision, next, { projectId: current.id, revision: next.revision, type: 'state.changed', actor: 'agent', detail: {}, at: current.updatedAt }),
      () => repository.events(current.id), () => repository.checkpoints(current.id),
      () => repository.getCheckpoint(current.id, checkpoint.id), () => repository.checkpoint(current.id, 'must not be created'),
      () => repository.syncFiles(current), () => repository.thumbnails!.get(current.id),
      () => repository.thumbnails!.info(current.id), () => repository.thumbnails!.save(thumbnail, bytes),
      () => repository.lifecycle!.trash(current.id, current.revision),
    ]) await expect(operation()).rejects.toMatchObject({ code: 'project_deleted', status: 404 });
    expect(() => repository.getProjectDirectory(current.id)).toThrow(expect.objectContaining({ code: 'project_deleted', status: 404 }));
    expect(await readFile(filename, 'utf8')).toBe(current.files[0].content);
  });

  it('atomically checks revisions and refuses stale lifecycle operations without changing history', async () => {
    const { repository, current } = await fixture();
    const events = await repository.events(current.id);
    await expect(repository.lifecycle!.trash(current.id, current.revision - 1)).rejects.toMatchObject({ code: 'revision_conflict', status: 409 });
    expect(await repository.lifecycle!.listDeleted()).toEqual([]);
    expect(await repository.get(current.id)).toEqual(current);
    expect(await repository.events(current.id)).toEqual(events);
    await repository.lifecycle!.trash(current.id, current.revision);
    await expect(repository.lifecycle!.restore(current.id, current.revision - 1)).rejects.toMatchObject({ code: 'revision_conflict', status: 409 });
    expect((await repository.lifecycle!.listDeleted()).map(project => project.id)).toEqual([current.id]);
    expect(await repository.lifecycle!.restore(current.id, current.revision)).toEqual(current);
    expect(await repository.events(current.id)).toEqual(events);
    await expect(repository.lifecycle!.restore(current.id, current.revision)).rejects.toMatchObject({ code: 'project_not_deleted', status: 409 });
    for (const revision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(repository.lifecycle!.trash(current.id, revision)).rejects.toMatchObject({ code: 'invalid_revision' });
    }
    await expect(repository.lifecycle!.trash('missing', 0)).rejects.toMatchObject({ code: 'project_not_found', status: 404 });
    await expect(repository.lifecycle!.restore('missing', 0)).rejects.toMatchObject({ code: 'project_not_found', status: 404 });
  });

  it('persists deletion across restart and restores exact revisions, artifacts and complete author history', async () => {
    const { directory, repository, current, other, checkpoint, job, thumbnail, bytes, filename } = await fixture();
    const events = await repository.events(current.id), checkpoints = await repository.checkpoints(current.id);
    const deletion = await repository.lifecycle!.trash(current.id, current.revision);
    await repository.dispose?.();
    const fresh = createLocalRepository({ directory }); repositories.push(fresh);
    expect(await fresh.lifecycle!.listDeleted()).toEqual([{ id: current.id, name: current.name, revision: current.revision, updatedAt: current.updatedAt, deletedAt: deletion.deletedAt }]);
    expect((await fresh.list()).map(project => project.id)).toEqual([other.id]);
    await expect(fresh.get(current.id)).rejects.toMatchObject({ code: 'project_deleted', status: 404 });
    const restored = await fresh.lifecycle!.restore(current.id, current.revision);
    expect(restored).toEqual(current);
    expect(restored.revision).toBe(8); // Lifecycle actions never impersonate an artwork edit.
    expect(await fresh.lifecycle!.listDeleted()).toEqual([]);
    expect((await fresh.list()).map(project => project.id).sort()).toEqual([current.id, other.id].sort());
    expect(await fresh.get(current.id)).toEqual(current);
    expect(await fresh.get(other.id)).toEqual(other);
    expect(await fresh.events(current.id)).toEqual(events);
    expect(await fresh.checkpoints(current.id)).toEqual(checkpoints);
    expect(await fresh.getCheckpoint(current.id, checkpoint.id)).toEqual(checkpoint);
    expect(await fresh.thumbnails!.get(current.id)).toEqual({ record: thumbnail, bytes });
    expect(await fresh.listJobs()).toEqual([job]);
    expect(new TextDecoder().decode(await fresh.getBlob('datasets/dataset_a.csv'))).toBe('value\n4\n');
    expect(await readFile(filename, 'utf8')).toBe(current.files[0].content);
  });

  it('never overwrites source edits made while the project was in the trash', async () => {
    const { repository, current, filename } = await fixture();
    const events = await repository.events(current.id);
    await repository.lifecycle!.trash(current.id, current.revision);
    const external = '// Human edit while hidden\n' + current.files[0].content;
    await writeFile(filename, external);
    expect(await repository.lifecycle!.restore(current.id, current.revision)).toEqual(current);
    expect(await readFile(filename, 'utf8')).toBe(external);
    expect(await repository.events(current.id)).toEqual(events);
    const next = { ...current, revision: current.revision + 1 };
    await expect(repository.commit(current.id, current.revision, next, { projectId: current.id, revision: next.revision, type: 'state.changed', actor: 'agent', detail: {}, at: current.updatedAt })).rejects.toMatchObject({ code: 'file_conflict', status: 409 });
    expect(await readFile(filename, 'utf8')).toBe(external);
    expect((await repository.get(current.id)).revision).toBe(current.revision);
    expect(await repository.events(current.id)).toEqual(events);
  });
});
