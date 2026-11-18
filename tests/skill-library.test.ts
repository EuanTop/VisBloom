import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, access, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBundle, createLock, loadCatalog, loadProjectEntries, localPath, parseLock, ref, resolve, resources, verifyBundle, verifyLock, verifyProjectEntries, compareLocks, type Catalog, type SkillRecord } from '../packages/skill-library/src/index.ts';

let root: string;
function skill(id: string, version = '1.0.0', overrides: Partial<SkillRecord> = {}): SkillRecord {
  return { id, version, directory: `skills/${id}/${version}`, description: `Local ${id} test fixture`, status: 'experimental', facets: { technology: ['canvas2d'] }, requires: [], conflicts: [], provenance: { kind: 'project', sources: [], note: 'Isolated test fixture' }, ...overrides };
}
async function fixture(skills: SkillRecord[]) {
  await mkdir(path.join(root, 'skills'), { recursive: true });
  for (const s of skills) {
    await mkdir(path.join(root, s.directory, 'references'), { recursive: true });
    await writeFile(path.join(root, s.directory, 'SKILL.md'), `---\nname: ${s.id}\ndescription: Local test fixture\n---\nRead only when needed.\n`);
    await writeFile(path.join(root, s.directory, 'references/note.md'), 'Do not replace existing creator choices.\n');
  }
  await saveCatalog({ schemaVersion: 1, skills });
  return loadCatalog(root);
}
async function saveCatalog(catalog: Catalog) { await writeFile(path.join(root, 'skills/catalog.json'), JSON.stringify(catalog)); }
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'art-skill-library-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('local skill releases and exact composition', () => {
  it('classifies working entries without changing frozen records or losing cross-axis knowledge', async () => {
    const s = skill('pigment', '1.0.0', { directory: 'skills/releases/pigment/1.0.0', facets: { style: ['crayon'], algorithm: ['deposition'], technology: ['canvas2d'] } });
    const catalog = await fixture([s]), lock = await createLock(root, catalog, ['pigment@1.0.0']);
    await mkdir(path.join(root, 'skills/style'));
    await cp(path.join(root, s.directory), path.join(root, 'skills/style/pigment'), { recursive: true });
    const entry = { id: 'pigment', version: '1.0.0', group: 'style' };
    const save = (entries: unknown[]) => writeFile(path.join(root, 'skills/entries.json'), JSON.stringify({ schemaVersion: 1, entries }));
    await save([entry]);
    expect(await loadProjectEntries(root)).toEqual([{ ...entry, directory: 'skills/style/pigment' }]);
    await expect(verifyProjectEntries(root, lock)).resolves.toEqual(lock);
    expect(lock.skills[0].record.facets.technology).toEqual(['canvas2d']);
    for (const entries of [[entry, entry], [{ ...entry, group: '../outside' }], [{ ...entry, group: 'time' }], [{ ...entry, version: '2.0.0' }]]) {
      await save(entries);
      await expect(loadProjectEntries(root)).rejects.toBeDefined();
      await expect(verifyLock(root, lock)).resolves.toEqual(lock);
    }
  });
  it('detects a changed active project copy even when the selected immutable release still verifies', async () => {
    const s = skill('main', '1.0.0', { directory: 'skills/releases/main/1.0.0' });
    const catalog = await fixture([s]), lock = await createLock(root, catalog, ['main@1.0.0']);
    await mkdir(path.join(root, 'skills/core'));
    await cp(path.join(root, s.directory), path.join(root, 'skills/core/main'), { recursive: true });
    await writeFile(path.join(root, 'skills/entries.json'), JSON.stringify({ schemaVersion: 1, entries: [{ id: 'main', version: '1.0.0', group: 'core' }] }));
    await expect(verifyProjectEntries(root, lock)).resolves.toEqual(lock);
    await writeFile(path.join(root, 'skills/core/main/references/note.md'), 'Unreleased active strategy');
    await expect(verifyLock(root, lock)).resolves.toEqual(lock);
    await expect(verifyProjectEntries(root, lock)).rejects.toMatchObject({ code: 'skill_drift' });
  });
  it('compares frozen releases by content without needing either live source version', async () => {
    const catalog = await fixture([skill('main'), skill('main', '2.0.0')]);
    await writeFile(path.join(root, 'skills/main/2.0.0/references/note.md'), 'A changed method');
    await writeFile(path.join(root, 'skills/main/2.0.0/new.md'), 'New reference');
    const a = await createLock(root, catalog, ['main@1.0.0']), b = await createLock(root, catalog, ['main@2.0.0']);
    await rm(path.join(root, 'skills'), { recursive: true });
    const diff = compareLocks(a, b);
    expect(diff.changed).toBe(true); expect(diff.changes[0]).toMatchObject({ id: 'main', from: 'main@1.0.0', to: 'main@2.0.0', metadataChanged: true });
    expect(diff.changes[0].files.map(f => [f.path, f.change])).toEqual([['new.md', 'added'], ['references/note.md', 'modified']]);
    expect(compareLocks(a, a).changes).toEqual([]);
  });
  it('locks the same bytes deterministically and includes dependency resources before their consumer', async () => {
    const catalog = await fixture([skill('main', '1.0.0', { requires: ['ink@1.0.0'] }), skill('ink')]);
    const a = await createLock(root, catalog, ['main@1.0.0']);
    const b = await createLock(root, await loadCatalog(root), ['main@1.0.0']);
    expect(a).toEqual(b);
    expect(a.skills.map(s => ref(s.record))).toEqual(['ink@1.0.0', 'main@1.0.0']);
    expect(a.skills[0].resources.map(f => f.path)).toEqual(['references/note.md', 'SKILL.md']);
    expect(a.skills[0].resources.every(f => f.bytes > 0 && /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
    await expect(verifyLock(root, a)).resolves.toEqual(a);
  });

  it('rejects missing dependencies, cycles, incompatible versions and declared conflicts', async () => {
    const missing = { schemaVersion: 1 as const, skills: [skill('main', '1.0.0', { requires: ['missing@1.0.0'] })] };
    expect(() => resolve(missing, ['main@1.0.0'])).toThrowError(expect.objectContaining({ code: 'missing_dependency' }));
    const cyclic = { schemaVersion: 1 as const, skills: [skill('main', '1.0.0', { requires: ['ink@1.0.0'] }), skill('ink', '1.0.0', { requires: ['main@1.0.0'] })] };
    expect(() => resolve(cyclic, ['main@1.0.0'])).toThrowError(expect.objectContaining({ code: 'dependency_cycle' }));
    const versions = { schemaVersion: 1 as const, skills: [skill('ink'), skill('ink', '2.0.0'), skill('main', '1.0.0', { requires: ['ink@1.0.0'] })] };
    expect(() => resolve(versions, ['main@1.0.0', 'ink@2.0.0'])).toThrowError(expect.objectContaining({ code: 'version_conflict' }));
    const conflicts = { schemaVersion: 1 as const, skills: [skill('main'), skill('ink', '1.0.0', { conflicts: ['main@1.0.0'] })] };
    expect(() => resolve(conflicts, ['main@1.0.0', 'ink@1.0.0'])).toThrowError(expect.objectContaining({ code: 'skill_conflict' }));
    for (const selection of [[], ['main'], ['main@latest'], ['main@1.0.0', 'main@1.0.0']]) {
      expect(() => resolve(conflicts, selection)).toThrowError(expect.objectContaining({ code: 'invalid_selection' }));
    }
  });

  it('detects source, metadata and added/deleted resource changes without silently relocking', async () => {
    const s = skill('main'), catalog = await fixture([s]);
    const lock = await createLock(root, catalog, ['main@1.0.0']);
    const note = path.join(root, s.directory, 'references/note.md'), original = await readFile(note);
    await writeFile(note, 'A later strategy revision.');
    await expect(verifyLock(root, lock)).rejects.toMatchObject({ code: 'skill_drift' });
    await writeFile(note, original);
    const changedCatalog = structuredClone(catalog);
    changedCatalog.skills[0].description = 'Changed release metadata'; await saveCatalog(changedCatalog);
    await expect(verifyLock(root, lock)).rejects.toMatchObject({ code: 'skill_drift' });
    await saveCatalog(catalog);
    const added = path.join(root, s.directory, 'references/new.md'); await writeFile(added, 'New optional guidance');
    await expect(verifyLock(root, lock)).rejects.toMatchObject({ code: 'skill_drift' });
    await rm(added); await rm(note);
    await expect(verifyLock(root, lock)).rejects.toMatchObject({ code: 'skill_drift' });
    await writeFile(note, original); await expect(verifyLock(root, lock)).resolves.toEqual(lock);
  });

  it('detaches a frozen lock from subsequent in-memory catalog edits', async () => {
    const catalog = await fixture([skill('main')]);
    const lock = await createLock(root, catalog, ['main@1.0.0']);
    catalog.skills[0].description = 'Future release description';
    catalog.skills[0].facets.technology!.push('future-renderer');
    expect(lock.skills[0].record.description).toBe('Local main test fixture');
    expect(lock.skills[0].record.facets.technology).toEqual(['canvas2d']);
    await expect(verifyLock(root, lock)).resolves.toEqual(lock);
  });

  it('validates catalog boundaries rather than accepting unknown axes or duplicate release identities', async () => {
    const catalog = await fixture([skill('main')]);
    for (const mutate of [
      (c: any) => { c.skills.push({ ...c.skills[0] }); },
      (c: any) => { c.skills[0].facets = { invented: ['x'] }; },
      (c: any) => { c.skills[0].directory = '../outside'; },
      (c: any) => { c.skills[0].directory = 'cases/main'; },
      (c: any) => { c.skills[0].provenance.sources = ['https://user:password@example.com/reference']; },
    ]) {
      const changed = structuredClone(catalog); mutate(changed); await saveCatalog(changed);
      await expect(loadCatalog(root)).rejects.toBeDefined();
    }
    await saveCatalog(catalog);
    await rm(path.join(root, catalog.skills[0].directory, 'SKILL.md'));
    await expect(createLock(root, catalog, ['main@1.0.0'])).rejects.toMatchObject({ code: 'missing_entry' });
  });

  it('rejects traversal and symlinks, including links pointing back inside the allowed root', async () => {
    const catalog = await fixture([skill('main')]), s = catalog.skills[0];
    for (const name of ['../outside', '/etc/hosts', 'skills/../catalog.json', 'skills\\catalog.json', 'skills//catalog.json']) {
      await expect(localPath(root, name)).rejects.toMatchObject({ code: 'unsafe_path' });
    }
    await symlink(path.join(root, s.directory, 'references/note.md'), path.join(root, s.directory, 'alias.md'));
    await expect(resources(root, s.directory)).rejects.toMatchObject({ code: 'unsafe_path' });
    await rm(path.join(root, s.directory, 'alias.md'));
    await symlink(path.join(root, s.directory), path.join(root, 'skills/alias'));
    await expect(localPath(root, 'skills/alias/SKILL.md')).rejects.toMatchObject({ code: 'unsafe_path' });
  });
});

describe('frozen skill bundles', () => {
  it('carries credited authors and a required license through exact locks and portable bundles', async () => {
    const s=skill('adapted');
    s.provenance={kind:'adapted',sources:['https://example.org/author/source'],note:'Fixture adaptation, not an art quality claim',authors:[{name:'Original Author',url:'https://example.org/author'}],license:{spdx:'MIT',file:'LICENSE'},revision:'a'.repeat(40)};
    const catalog=await fixture([s]);
    await expect(createLock(root,catalog,['adapted@1.0.0'])).rejects.toMatchObject({code:'missing_license'});
    await writeFile(path.join(root,s.directory,'LICENSE'),'Original Author copyright and MIT permission notice\n');
    const lock=await createLock(root,catalog,['adapted@1.0.0']),output=path.join(root,'licensed-bundle');
    await createBundle(root,lock,output);
    const checked=await verifyBundle(output);expect(checked.skills[0].record.provenance).toEqual(s.provenance);
    expect(await readFile(path.join(output,'skills/adapted/LICENSE'),'utf8')).toContain('Original Author copyright');
    const changed=structuredClone(catalog);changed.skills[0].provenance.authors![0].name='Wrong Author';await saveCatalog(changed);
    await expect(verifyLock(root,lock)).rejects.toMatchObject({code:'skill_drift'});
    await expect(verifyBundle(output)).resolves.toEqual(lock);
  });
  it('keeps an older bundle verifiable after source content and the catalog move forward, without executing scripts', async () => {
    const s = skill('main'), catalog = await fixture([s]);
    const marker = path.join(root, 'script-executed');
    await mkdir(path.join(root, s.directory, 'scripts'));
    await writeFile(path.join(root, s.directory, 'scripts/action.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed');`);
    const lock = await createLock(root, catalog, ['main@1.0.0']);
    const destination = path.join(root, 'frozen');
    await createBundle(root, lock, destination);
    await expect(verifyBundle(destination)).resolves.toEqual(lock);
    const original = await readFile(path.join(destination, 'skills/main/SKILL.md'), 'utf8');
    await writeFile(path.join(root, s.directory, 'SKILL.md'), 'New working version');
    await saveCatalog({ schemaVersion: 1, skills: [] });
    await expect(verifyLock(root, lock)).rejects.toMatchObject({ code: 'missing_dependency' });
    await expect(verifyBundle(destination)).resolves.toEqual(lock);
    expect(await readFile(path.join(destination, 'skills/main/SKILL.md'), 'utf8')).toBe(original);
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to overwrite output, write into the source library, or treat extra bundled instructions as locked', async () => {
    const catalog = await fixture([skill('main')]), lock = await createLock(root, catalog, ['main@1.0.0']);
    const destination = path.join(root, 'bundle'); await createBundle(root, lock, destination);
    await expect(createBundle(root, lock, destination)).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(verifyBundle(destination)).resolves.toEqual(lock);
    await expect(createBundle(root, lock, path.join(root, 'skills/bundle'))).rejects.toMatchObject({ code: 'unsafe_path' });
    await writeFile(path.join(destination, 'surprise.md'), 'Additional unreviewed instructions');
    await expect(verifyBundle(destination)).rejects.toMatchObject({ code: 'skill_drift' });
    await rm(path.join(destination, 'surprise.md'));
    await writeFile(path.join(destination, 'skills/main/references/note.md'), 'Changed guidance');
    await expect(verifyBundle(destination)).rejects.toMatchObject({ code: 'skill_drift' });
  });

  it('does not accept a modified lock manifest merely because resource bytes still exist', async () => {
    const catalog = await fixture([skill('main')]), lock = await createLock(root, catalog, ['main@1.0.0']);
    const tampered = structuredClone(lock); tampered.skills[0].record.description = 'Different creator instructions';
    expect(() => parseLock(tampered)).toThrowError(expect.objectContaining({ code: 'invalid_lock' }));
    const missing = structuredClone(lock); missing.skills[0].resources = [];
    expect(() => parseLock(missing)).toThrowError(expect.objectContaining({ code: 'invalid_lock' }));
  });
});
