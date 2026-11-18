import { lstat, readdir, readFile, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const axes = ['material', 'encoding', 'algorithm', 'style', 'composition', 'time', 'interaction', 'technology', 'delivery', 'method'] as const;
export type Axis = typeof axes[number];
export const entryGroups = ['core', ...axes] as const;
export type EntryGroup = typeof entryGroups[number];
export interface ProjectEntry {
  id: string;
  version: string;
  group: EntryGroup;
  directory: string;
}
export interface SkillRecord {
  id: string;
  version: string;
  directory: string;
  description: string;
  status: 'draft' | 'experimental' | 'maintained' | 'deprecated';
  facets: Partial<Record<Axis, string[]>>;
  requires: string[];
  conflicts: string[];
  provenance: {
    kind: 'project' | 'adapted' | 'upstream'; sources: string[]; note: string;
    authors?: { name: string; url: string }[];
    license?: { spdx: string; file: string };
    revision?: string;
  };
}
export interface Catalog { schemaVersion: 1; skills: SkillRecord[] }
export interface Resource { path: string; bytes: number; sha256: string }
export interface LockedSkill { record: SkillRecord; resources: Resource[]; digest: string }
export interface SkillLock { schemaVersion: 1; roots: string[]; skills: LockedSkill[]; digest: string }
export class SkillError extends Error { constructor(public code: string, message: string) { super(message); } }
function fail(code: string, message: string): never { throw new SkillError(code, message); }
export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_manifest', `${label} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, names: string[], label: string) {
  const extra = Object.keys(value).filter(k => !names.includes(k));
  if (extra.length) fail('invalid_manifest', `${label}: unknown fields ${extra.join(', ')}`);
}
function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail('invalid_manifest', `${label} must be a nonempty string`);
  return value as string;
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) fail('invalid_manifest', `${label} must be an array`);
  const items = (value as unknown[]).map(v => string(v, label));
  if (new Set(items).size !== items.length) fail('invalid_manifest', `${label} contains duplicates`);
  return items;
}
export function relative(value: string): string {
  if (path.isAbsolute(value) || /[\\\x00]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) fail('unsafe_path', `Invalid relative path: ${value}`);
  return value;
}
// Check every component: realpath alone would permit an in-root symlink to change later.
export async function localPath(root: string, name: string): Promise<string> {
  relative(name);
  let current = await realpath(root);
  for (const component of name.split('/')) {
    current = path.join(current, component);
    if ((await lstat(current)).isSymbolicLink()) fail('unsafe_path', `Symlink is not a bundled resource: ${name}`);
  }
  return current;
}
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?$/;
export const ref = (record: Pick<SkillRecord, 'id' | 'version'>) => `${record.id}@${record.version}`;
function checkRef(value: string) {
  const [id, version, extra] = value.split('@');
  if (!idPattern.test(id) || !version || !versionPattern.test(version) || extra !== undefined) fail('invalid_selection', `Use an exact id@version: ${value}`);
}
function record(value: unknown): SkillRecord {
  const r = object(value, 'skill');
  keys(r, ['id', 'version', 'directory', 'description', 'status', 'facets', 'requires', 'conflicts', 'provenance'], 'skill');
  const id = string(r.id, 'id'), version = string(r.version, 'version');
  checkRef(`${id}@${version}`);
  const directory = relative(string(r.directory, 'directory'));
  if (!directory.startsWith('skills/')) fail('unsafe_path', 'Skill directory must be inside skills/');
  const description = string(r.description, 'description');
  if (!['draft', 'experimental', 'maintained', 'deprecated'].includes(String(r.status))) fail('invalid_manifest', 'Invalid lifecycle status');
  const facets = object(r.facets, 'facets'); keys(facets, [...axes], 'facets');
  for (const [axis, values] of Object.entries(facets)) strings(values, `facets.${axis}`);
  const requires = strings(r.requires, 'requires'), conflicts = strings(r.conflicts, 'conflicts');
  requires.forEach(checkRef); conflicts.forEach(checkRef);
  const p = object(r.provenance, 'provenance'); keys(p, ['kind', 'sources', 'note', 'authors', 'license', 'revision'], 'provenance');
  if (!['project', 'adapted', 'upstream'].includes(String(p.kind))) fail('invalid_manifest', 'Invalid provenance kind');
  const sources = strings(p.sources, 'sources');
  for (const source of sources) {
    let url: URL; try { url = new URL(source); } catch { fail('invalid_manifest', 'Source must be an HTTPS URL'); }
    if (url!.protocol !== 'https:' || url!.username || url!.password) fail('invalid_manifest', 'Source must be an HTTPS URL without credentials');
  }
  const extra: Pick<SkillRecord['provenance'], 'authors'|'license'|'revision'> = {};
  if (p.authors !== undefined) {
    if (!Array.isArray(p.authors) || !p.authors.length) fail('invalid_manifest', 'authors needs a nonempty array');
    extra.authors = p.authors.map(value => {
      const author = object(value, 'author'); keys(author, ['name','url'], 'author');
      const name = string(author.name, 'author.name'), url = string(author.url, 'author.url');
      let parsed: URL; try { parsed = new URL(url); } catch { fail('invalid_manifest', 'Author URL must use HTTPS'); }
      if (parsed!.protocol !== 'https:' || parsed!.username || parsed!.password) fail('invalid_manifest', 'Author URL must use HTTPS without credentials');
      return {name, url};
    });
  }
  if (p.license !== undefined) {
    const license = object(p.license, 'license'); keys(license, ['spdx','file'], 'license');
    extra.license = {spdx:string(license.spdx,'license.spdx'),file:relative(string(license.file,'license.file'))};
  }
  if (p.revision !== undefined) {
    if (!/^[a-f0-9]{40}$/.test(String(p.revision))) fail('invalid_manifest', 'Upstream revision needs a full commit hash');
    extra.revision = String(p.revision);
  }
  return { id, version, directory, description, status: r.status as SkillRecord['status'], facets: facets as SkillRecord['facets'], requires, conflicts, provenance: { kind: p.kind as SkillRecord['provenance']['kind'], sources, note: string(p.note, 'provenance.note'), ...extra } };
}
export async function loadCatalog(root: string): Promise<Catalog> {
  const value = object(JSON.parse(await readFile(await localPath(root, 'skills/catalog.json'), 'utf8')), 'catalog');
  keys(value, ['schemaVersion', 'skills'], 'catalog');
  if (value.schemaVersion !== 1 || !Array.isArray(value.skills)) fail('invalid_manifest', 'Unsupported catalog version or missing skills');
  const skills = value.skills.map(record);
  if (new Set(skills.map(ref)).size !== skills.length) fail('invalid_manifest', 'Duplicate skill release');
  if (new Set(skills.map(s => s.directory)).size !== skills.length) fail('invalid_manifest', 'Releases must have distinct directories');
  return { schemaVersion: 1, skills };
}
/** Mutable authoring locations are separate from immutable release metadata. */
export async function loadProjectEntries(root: string, catalog?: Catalog): Promise<ProjectEntry[]> {
  const value = object(JSON.parse(await readFile(await localPath(root, 'skills/entries.json'), 'utf8')), 'project entries');
  keys(value, ['schemaVersion', 'entries'], 'project entries');
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) fail('invalid_manifest', 'Unsupported project entries format');
  const releases = new Map((catalog ?? await loadCatalog(root)).skills.map(s => [ref(s), s]));
  const entries = value.entries.map((item): ProjectEntry => {
    const e = object(item, 'project entry'); keys(e, ['id', 'version', 'group'], 'project entry');
    const id = string(e.id, 'entry.id'), version = string(e.version, 'entry.version');
    checkRef(`${id}@${version}`);
    const group = string(e.group, 'entry.group') as EntryGroup;
    if (!(entryGroups as readonly string[]).includes(group)) fail('invalid_manifest', `Unknown entry group: ${group}`);
    const release = releases.get(`${id}@${version}`);
    if (!release) fail('missing_dependency', `Project entry release not found: ${id}@${version}`);
    if (group !== 'core' && !release.facets[group]?.length) fail('invalid_manifest', `Entry group needs a matching facet: ${id} / ${group}`);
    return { id, version, group, directory: `skills/${group}/${id}` };
  });
  if (new Set(entries.map(e => e.id)).size !== entries.length) fail('invalid_manifest', 'Duplicate project entry');
  return entries;
}
export function resolve(catalog: Catalog, roots: string[]): SkillRecord[] {
  if (!roots.length || new Set(roots).size !== roots.length) fail('invalid_selection', 'Select distinct exact releases');
  const entries = new Map(catalog.skills.map(s => [ref(s), s]));
  const active = new Set<string>(), done = new Set<string>(), versions = new Map<string, string>(), output: SkillRecord[] = [];
  function visit(key: string) {
    checkRef(key);
    if (active.has(key)) fail('dependency_cycle', `Dependency cycle at ${key}`);
    if (done.has(key)) return;
    const s = entries.get(key); if (!s) fail('missing_dependency', `Release not found: ${key}`);
    if (versions.has(s.id) && versions.get(s.id) !== s.version) fail('version_conflict', `Multiple versions selected for ${s.id}`);
    versions.set(s.id, s.version); active.add(key);
    s.requires.forEach(visit); active.delete(key); done.add(key); output.push(s);
  }
  roots.forEach(visit);
  for (const s of output) for (const conflict of s.conflicts) if (done.has(conflict)) fail('skill_conflict', `${ref(s)} conflicts with ${conflict}`);
  return output;
}
export async function resources(root: string, directory: string): Promise<Resource[]> {
  const base = await localPath(root, directory), output: Resource[] = []; let total = 0;
  async function walk(dir: string, prefix = '') {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const name = prefix + item.name, filename = path.join(dir, item.name), info = await lstat(filename);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) fail('unsafe_path', `Non-regular resource: ${name}`);
      if (info.isDirectory()) await walk(filename, name + '/');
      else {
        const bytes = await readFile(filename); total += bytes.length;
        if (output.length >= 1024 || total > 32 * 1024 * 1024) fail('package_limit', 'Skill exceeds 1024 files / 32 MiB; split or review its assets');
        output.push({ path: relative(name), bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  await walk(base);
  if (!output.some(f => f.path === 'SKILL.md' && f.bytes > 0)) fail('missing_entry', `${directory} needs a nonempty SKILL.md`);
  return output.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
export async function createLock(root: string, catalog: Catalog, selection: string[]): Promise<SkillLock> {
  const skills: LockedSkill[] = [];
  for (const s of resolve(catalog, selection)) {
    const files = await resources(root, s.directory);
    if(s.provenance.license && !files.some(f=>f.path===s.provenance.license!.file&&f.bytes)) fail('missing_license', `License file is missing: ${ref(s)}`);
    skills.push({ record: structuredClone(s), resources: files, digest: sha256(canonical({ record: s, resources: files })) });
  }
  const content = { schemaVersion: 1 as const, roots: [...selection], skills };
  return { ...content, digest: sha256(canonical(content)) };
}
export function parseLock(value: unknown): SkillLock {
  const lock = object(value, 'lock'); keys(lock, ['schemaVersion', 'roots', 'skills', 'digest'], 'lock');
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.skills)) fail('invalid_lock', 'Unsupported lock format');
  const roots = strings(lock.roots, 'roots');
  const skills = lock.skills.map((value: unknown): LockedSkill => {
    const item = object(value, 'locked skill'); keys(item, ['record', 'resources', 'digest'], 'locked skill');
    const s = record(item.record);
    if (!Array.isArray(item.resources)) fail('invalid_lock', 'Missing locked resources');
    const files = (item.resources as unknown[]).map(value => {
      const f = object(value, 'resource'); keys(f, ['path', 'bytes', 'sha256'], 'resource');
      if (!Number.isSafeInteger(f.bytes) || Number(f.bytes) < 0 || !/^[a-f0-9]{64}$/.test(String(f.sha256))) fail('invalid_lock', 'Invalid resource hash or size');
      return { path: relative(string(f.path, 'resource.path')), bytes: Number(f.bytes), sha256: String(f.sha256) };
    });
    if (new Set(files.map(f => f.path)).size !== files.length || !files.some(f => f.path === 'SKILL.md' && f.bytes)) fail('invalid_lock', 'Duplicate resources or missing entry');
    const digest = sha256(canonical({ record: s, resources: files }));
    if (item.digest !== digest) fail('invalid_lock', `Package digest mismatch: ${ref(s)}`);
    return { record: s, resources: files, digest };
  });
  const sorted = resolve({ schemaVersion: 1, skills: skills.map(s => s.record) }, roots);
  if (new Set(skills.map(s => ref(s.record))).size !== skills.length || canonical(sorted.map(ref)) !== canonical(skills.map(s => ref(s.record)))) fail('invalid_lock', 'Lock contains unselected, duplicate or unordered releases');
  const content = { schemaVersion: 1 as const, roots, skills };
  if (lock.digest !== sha256(canonical(content))) fail('invalid_lock', 'Lock digest mismatch');
  return { ...content, digest: String(lock.digest) };
}
export async function verifyLock(root: string, value: unknown): Promise<SkillLock> {
  const lock = parseLock(value), current = await createLock(root, await loadCatalog(root), lock.roots);
  if (canonical(lock) !== canonical(current)) fail('skill_drift', 'Skill content or metadata changed; publish a new release and lock it explicitly');
  return lock;
}
/** Verify the mutable project entry against its selected immutable releases. */
export async function verifyProjectEntries(root: string, value: unknown): Promise<SkillLock> {
  const lock = await verifyLock(root, value);
  const entries = new Map((await loadProjectEntries(root)).map(e => [e.id, e]));
  for (const s of lock.skills) {
    const entry = entries.get(s.record.id);
    if (!entry || entry.version !== s.record.version) fail('skill_drift', `Project entry is not mapped to the selected release: ${ref(s.record)}`);
    const current = await resources(root, entry.directory);
    if (canonical(current) !== canonical(s.resources)) fail('skill_drift', `Project entry differs from its selected release: ${ref(s.record)}`);
  }
  return lock;
}
export function compareLocks(before: unknown, after: unknown) {
  const a = parseLock(before), b = parseLock(after);
  const left = new Map(a.skills.map(s => [s.record.id, s])), right = new Map(b.skills.map(s => [s.record.id, s]));
  const changes = [];
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const x = left.get(id), y = right.get(id);
    if (x?.digest === y?.digest) continue;
    const old = new Map(x?.resources.map(f => [f.path, f]) ?? []), next = new Map(y?.resources.map(f => [f.path, f]) ?? []);
    const files = [];
    for (const name of [...new Set([...old.keys(), ...next.keys()])].sort()) {
      const from = old.get(name), to = next.get(name);
      if (from?.sha256 === to?.sha256 && from?.bytes === to?.bytes) continue;
      files.push({ path: name, change: !from ? 'added' : !to ? 'removed' : 'modified', from: from?.sha256 ?? null, to: to?.sha256 ?? null });
    }
    changes.push({ id, from: x ? ref(x.record) : null, to: y ? ref(y.record) : null, metadataChanged: canonical(x?.record ?? null) !== canonical(y?.record ?? null), files });
  }
  return { from: a.digest, to: b.digest, changed: a.digest !== b.digest, changes };
}
// Portable host discovery expects SKILL.md's parent to match its name. Version stays in the lock.
const bundlePath = (s: SkillRecord) => `skills/${s.id}`;
export async function createBundle(root: string, value: unknown, destination: string) {
  const lock = await verifyLock(root, value), target = path.resolve(destination), skillRoot = path.join(await realpath(root), 'skills');
  const parent = await realpath(path.dirname(target));
  const actual = path.join(parent, path.basename(target));
  if (actual === skillRoot || actual.startsWith(skillRoot + path.sep)) fail('unsafe_path', 'Bundle output cannot be inside the source library');
  await mkdir(target); // Exclusive ownership: existing directories are never overwritten.
  try {
    for (const s of lock.skills) for (const f of s.resources) {
      const bytes = await readFile(await localPath(root, `${s.record.directory}/${f.path}`));
      if (sha256(bytes) !== f.sha256) fail('skill_drift', `Resource changed during bundling: ${f.path}`);
      const filename = path.join(target, bundlePath(s.record), f.path);
      await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, bytes, { flag: 'wx' });
    }
    await writeFile(path.join(target, 'skills.lock.json'), JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
    return { directory: target, digest: lock.digest, skills: lock.skills.map(s => ({ ref: ref(s.record), entry: `${bundlePath(s.record)}/SKILL.md` })) };
  } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
}
export async function verifyBundle(directory: string): Promise<SkillLock> {
  const lock = parseLock(JSON.parse(await readFile(await localPath(directory, 'skills.lock.json'), 'utf8')));
  for (const s of lock.skills) {
    const files = await resources(directory, bundlePath(s.record));
    if (canonical(files) !== canonical(s.resources)) fail('skill_drift', `Bundled content changed: ${ref(s.record)}`);
  }
  const files = await resourcesInBundle(directory);
  const expected = ['skills.lock.json', ...lock.skills.flatMap(s => s.resources.map(f => `${bundlePath(s.record)}/${f.path}`))].sort();
  if (canonical(files) !== canonical(expected)) fail('skill_drift', 'Bundle contains unexpected resources');
  return lock;
}
async function resourcesInBundle(directory: string): Promise<string[]> {
  const names: string[] = [];
  async function walk(dir: string, prefix: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const filename = path.join(dir, entry.name), info = await lstat(filename), name = prefix + entry.name;
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) fail('unsafe_path', `Invalid bundle resource: ${name}`);
      if (info.isDirectory()) await walk(filename, name + '/'); else names.push(name);
    }
  }
  await walk(await realpath(directory), ''); return names.sort();
}
