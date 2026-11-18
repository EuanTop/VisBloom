import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Project, ProjectEvent, RepositoryPlugin } from '@art/contracts';
import { createLocalRepository } from '../packages/plugin-storage-local/src/index';

const roots: string[] = [];
const repositories: RepositoryPlugin[] = [];
const hash = (content: string) => createHash('sha256').update(content).digest('hex');
function project(): Project {
  const content = 'export const value = 1;';
  return { id: 'project_a', name: 'Synthetic work', revision: 0, updatedAt: new Date().toISOString(), state: { parameters: { speed: 1 }, mapping: { field: 'value', transform: 'linear', target: 'height' }, seed: 1, time: 0, paused: true }, schema: [], files: [{ path: 'src/artwork.ts', content, hash: hash(content) }], codeHash: hash(content), notes: '', preset: 'flow' };
}
function event(p: Project, actor = 'agent'): Omit<ProjectEvent, 'cursor'> { return { projectId: p.id, revision: p.revision, type: 'source.changed', actor, detail: {}, at: p.updatedAt }; }
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'art-storage-')); roots.push(directory);
  const repo = createLocalRepository({ directory }); repositories.push(repo);
  const p = project(); await repo.create(p); await repo.syncFiles(p);
  return { directory, repo, p };
}
afterEach(async () => {
  await Promise.allSettled(repositories.splice(0).map(repo => repo.dispose?.()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('local project repository', () => {
  it('commits state/event atomically and rejects stale writers without phantom history', async () => {
    const { repo, p } = await fixture();
    const next = structuredClone(p); next.revision++; next.state.parameters.speed = 2;
    await repo.commit(p.id, 0, next, event(next));
    await expect(repo.commit(p.id, 0, next, event(next))).rejects.toMatchObject({ code: 'revision_conflict', status: 409 });
    expect((await repo.get(p.id)).state.parameters.speed).toBe(2);
    const events = await repo.events(p.id);
    expect(events).toHaveLength(1);
    expect(events[0].revision).toBe(1);
    expect(await repo.events(p.id, events[0].cursor)).toEqual([]);
  });

  it('persists checkpoints and raw artifacts through restart', async () => {
    const { directory, repo, p } = await fixture();
    const cp = await repo.checkpoint(p.id, 'Before movement');
    await repo.putBlob('dataset-a/source.csv', Buffer.from('value\n4\n'));
    await repo.dispose?.();
    const fresh = createLocalRepository({ directory }); repositories.push(fresh);
    expect(await fresh.get(p.id)).toEqual(p);
    expect((await fresh.getCheckpoint(p.id, cp.id)).project.files[0].content).toBe(p.files[0].content);
    expect(new TextDecoder().decode(await fresh.getBlob('dataset-a/source.csv'))).toBe('value\n4\n');
    expect(await readFile(join(fresh.getProjectDirectory(p.id), 'src/artwork.ts'), 'utf8')).toBe(p.files[0].content);
  });

  it('materializes committed source before success and protects external edits', async () => {
    const { repo, p } = await fixture();
    const next = structuredClone(p); next.revision++;
    next.files[0].content = 'export const value = 2;'; next.files[0].hash = hash(next.files[0].content); next.codeHash = next.files[0].hash;
    await repo.commit(p.id, 0, next, event(next));
    const filename = join(repo.getProjectDirectory(p.id), 'src/artwork.ts');
    expect(await readFile(filename, 'utf8')).toBe(next.files[0].content);
    await writeFile(filename, 'export const value = 3;');
    const attempt = structuredClone(next); attempt.revision++;
    await expect(repo.commit(p.id, 1, attempt, event(attempt))).rejects.toMatchObject({ code: 'file_conflict', status: 409 });
    expect((await repo.get(p.id)).revision).toBe(1);
    expect(await repo.events(p.id)).toHaveLength(1);
    attempt.files[0].content = await readFile(filename, 'utf8'); attempt.files[0].hash = hash(attempt.files[0].content); attempt.codeHash = attempt.files[0].hash;
    await repo.commit(p.id, 1, attempt, event(attempt, 'filesystem'));
    expect((await repo.get(p.id)).files[0].content).toBe('export const value = 3;');
  });

  it('refuses traversal and symlink artifact escapes', async () => {
    const { directory, repo } = await fixture();
    await expect(repo.putBlob('../escape', new Uint8Array())).rejects.toMatchObject({ code: 'invalid_path' });
    await repo.putBlob('safe/file', new Uint8Array([1]));
    await expect(repo.putBlob('safe/file', new Uint8Array([2]))).rejects.toMatchObject({ code: 'blob_conflict', status: 409 });
    await symlink(directory, join(directory, 'blobs', 'escape'));
    await expect(repo.putBlob('escape/not-allowed', new Uint8Array())).rejects.toMatchObject({ code: 'invalid_path' });
  });

  it('compensates disk writes when the event transaction fails', async () => {
    const { repo, p } = await fixture();
    const next = structuredClone(p); next.revision++;
    next.files[0].content = 'export const value = 99;'; next.files[0].hash = hash(next.files[0].content); next.codeHash = next.files[0].hash;
    const broken: Record<string, unknown> = {}; broken.self = broken;
    const change = event(next); change.detail = broken;
    await expect(repo.commit(p.id, 0, next, change)).rejects.toThrow();
    expect((await repo.get(p.id)).revision).toBe(0);
    expect(await repo.events(p.id)).toEqual([]);
    expect(await readFile(join(repo.getProjectDirectory(p.id), 'src/artwork.ts'), 'utf8')).toBe(p.files[0].content);
  });
});
