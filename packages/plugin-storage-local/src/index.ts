import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { WorkbenchError, type Checkpoint, type Project, type ProjectEvent, type RepositoryPlugin, type Job, type ThumbnailRecord } from '@art/contracts';

type ProjectRow = { snapshot: string };
type BaselineRow = { path: string; hash: string };
const digest = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
function validId(id: string): string { if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new WorkbenchError('invalid_id', '项目标识不合法。'); return id; }
function relativeKey(key: string): string {
  if (!key || isAbsolute(key) || key.includes('\\') || key.includes('\0') || key.split('/').some(part => !part || part === '.' || part === '..' || ['.git', 'node_modules'].includes(part))) throw new WorkbenchError('invalid_path', '文件路径必须位于项目目录内。');
  return key;
}
function confined(root: string, key: string): string {
  const target = resolve(root, relativeKey(key));
  if (relative(root, target).startsWith(`..${sep}`)) throw new WorkbenchError('invalid_path', '文件路径超出项目目录。');
  let current = root;
  if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new WorkbenchError('invalid_path', '不允许符号链接目录。');
  for (const part of relative(root, target).split(sep)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new WorkbenchError('invalid_path', '不允许通过符号链接读写项目文件。');
  }
  return target;
}

export function createLocalRepository({ directory }: { directory: string }): RepositoryPlugin {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink()) throw new WorkbenchError('invalid_path', '存储根目录不能是符号链接。');
  const database = new Database(join(root, 'projects.sqlite'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (cursor INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL, snapshot TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS event_project_cursor ON events(project_id, cursor);
    CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), created_at TEXT NOT NULL, snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS file_baselines (project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(project_id, path));
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS project_thumbnails (project_id TEXT PRIMARY KEY REFERENCES projects(id), snapshot TEXT NOT NULL, bytes BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS project_deletions (project_id TEXT PRIMARY KEY REFERENCES projects(id), deleted_at TEXT NOT NULL);
  `);
  let disposed = false;
  const ready = () => { if (disposed) throw new WorkbenchError('repository_disposed', '项目存储已关闭。', 503); };
  const projectDirectory = (id: string) => confined(root, `projects/${validId(id)}`);
  function load(id: string, allowDeleted = false): Project {
    ready(); validId(id);
    const row = database.prepare('SELECT p.snapshot, d.deleted_at FROM projects p LEFT JOIN project_deletions d ON d.project_id = p.id WHERE p.id = ?').get(id) as (ProjectRow & { deleted_at: string | null }) | undefined;
    if (!row) throw new WorkbenchError('project_not_found', '找不到这个项目。', 404);
    if (row.deleted_at && !allowDeleted) throw new WorkbenchError('project_deleted', '项目已移入回收站，请先恢复。', 404);
    return JSON.parse(row.snapshot) as Project;
  }
  function requireRevision(project: Project, expectedRevision: number): void {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new WorkbenchError('invalid_revision', '项目版本不合法。');
    if (project.revision !== expectedRevision) throw new WorkbenchError('revision_conflict', `项目已更新至版本 ${project.revision}，请重新读取后继续。`, 409);
  }
  function verifySource(project: Project): void {
    const keys = new Set<string>();
    for (const file of project.files) {
      relativeKey(file.path);
      if (keys.has(file.path)) throw new WorkbenchError('duplicate_file', '项目源码路径重复。');
      keys.add(file.path);
      if (digest(file.content) !== file.hash) throw new WorkbenchError('invalid_file_hash', `源码哈希不匹配：${file.path}`);
    }
  }
  function preflight(project: Project, actor = 'filesystem'): void {
    verifySource(project);
    const directory = projectDirectory(project.id);
    const baselines = database.prepare('SELECT path, hash FROM file_baselines WHERE project_id = ?').all(project.id) as BaselineRow[];
    const baseline = new Map(baselines.map(row => [row.path, row.hash]));
    const desired = new Map(project.files.map(file => [file.path, file.hash]));
    for (const path of new Set([...baseline.keys(), ...desired.keys()])) {
      const filename = confined(directory, path);
      const diskHash = existsSync(filename) ? digest(readFileSync(filename)) : undefined;
      const old = baseline.get(path);
      const next = desired.get(path);
      if (diskHash === next && actor === 'filesystem') continue; // Only observed external edits may be adopted.
      if (old === undefined ? diskHash !== undefined : diskHash !== old) {
        throw new WorkbenchError('file_conflict', `外部编辑器已修改 ${path}，请重新读取后保存。`, 409);
      }
    }
  }
  function materialize(project: Project): () => void {
    const directory = projectDirectory(project.id);
    const baselines = database.prepare('SELECT path, hash FROM file_baselines WHERE project_id = ?').all(project.id) as BaselineRow[];
    const desired = new Map(project.files.map(file => [file.path, file]));
    const backup = new Map<string, Buffer | undefined>();
    const written = new Map<string, string | undefined>();
    const rollback = () => {
      for (const [path, content] of [...backup.entries()].reverse()) {
        const filename = confined(directory, path);
        const currentHash = existsSync(filename) ? digest(readFileSync(filename)) : undefined;
        // Do not clobber a third-party write that raced with the failed commit.
        if (currentHash !== written.get(path)) continue;
        if (content === undefined) { if (existsSync(filename)) unlinkSync(filename); }
        else { writeFileSync(filename, content, { mode: 0o600 }); }
      }
    };
    try {
      for (const path of new Set([...baselines.map(row => row.path), ...desired.keys()])) {
        const filename = confined(directory, path);
        const old = existsSync(filename) ? readFileSync(filename) : undefined;
        const next = desired.get(path);
        if (old && next && digest(old) === next.hash) continue;
        if (old === undefined && next === undefined) continue;
        backup.set(path, old);
        if (next) {
          mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
          const temporary = `${filename}.${randomUUID()}.tmp`;
          try { writeFileSync(temporary, next.content, { mode: 0o600 }); renameSync(temporary, filename); }
          catch (error) { if (existsSync(temporary)) unlinkSync(temporary); throw error; }
          written.set(path, next.hash);
        } else { unlinkSync(filename); written.set(path, undefined); }
      }
      database.prepare('DELETE FROM file_baselines WHERE project_id = ?').run(project.id);
      const put = database.prepare('INSERT INTO file_baselines VALUES (?, ?, ?)');
      for (const file of project.files) put.run(project.id, file.path, file.hash);
      return rollback;
    } catch (error) { rollback(); throw error; }
  }
  const repository: RepositoryPlugin = {
    lifecycle: {
      async trash(id, expectedRevision) {
        ready();
        return database.transaction(() => {
          const project = load(id);
          requireRevision(project, expectedRevision);
          const deletedAt = new Date().toISOString();
          database.prepare('INSERT INTO project_deletions (project_id, deleted_at) VALUES (?, ?)').run(id, deletedAt);
          return { id: project.id, revision: project.revision, deletedAt };
        }).immediate();
      },
      async restore(id, expectedRevision) {
        ready();
        return database.transaction(() => {
          const project = load(id, true);
          requireRevision(project, expectedRevision);
          const removed = database.prepare('DELETE FROM project_deletions WHERE project_id = ?').run(id);
          if (removed.changes !== 1) throw new WorkbenchError('project_not_deleted', '项目不在回收站中。', 409);
          // Restore visibility only. Existing source files and baselines are untouched;
          // subsequent editing still detects changes made by an external editor.
          return project;
        }).immediate();
      },
      async listDeleted() {
        ready();
        return (database.prepare('SELECT p.snapshot, d.deleted_at FROM project_deletions d JOIN projects p ON p.id = d.project_id ORDER BY d.deleted_at DESC, p.id').all() as (ProjectRow & { deleted_at: string })[]).map(row => {
          const project = JSON.parse(row.snapshot) as Project;
          return { id: project.id, name: project.name, revision: project.revision, updatedAt: project.updatedAt, deletedAt: row.deleted_at };
        });
      },
    },
    thumbnails: {
      async info(id) {
        load(id);
        const row = database.prepare('SELECT snapshot FROM project_thumbnails WHERE project_id = ?').get(id) as ProjectRow | undefined;
        return row ? JSON.parse(row.snapshot) as ThumbnailRecord : undefined;
      },
      async get(id) {
        load(id);
        const row = database.prepare('SELECT snapshot, bytes FROM project_thumbnails WHERE project_id = ?').get(id) as { snapshot: string; bytes: Buffer } | undefined;
        return row ? { record: JSON.parse(row.snapshot) as ThumbnailRecord, bytes: new Uint8Array(row.bytes) } : undefined;
      },
      async save(record, bytes) {
        ready();
        if (bytes.length > 2_000_000 || digest(bytes) !== record.contentHash || !Number.isSafeInteger(record.revision) || !Number.isFinite(Date.parse(record.createdAt))) throw new WorkbenchError('invalid_thumbnail', '预览图片校验失败。');
        return database.transaction(() => {
          const current = load(record.projectId);
          if (current.revision !== record.revision || current.codeHash !== record.codeHash) return false;
          const row = database.prepare('SELECT snapshot FROM project_thumbnails WHERE project_id = ?').get(record.projectId) as ProjectRow | undefined;
          const previous = row ? JSON.parse(row.snapshot) as ThumbnailRecord : undefined;
          if (previous && (previous.revision > record.revision || (previous.revision === record.revision && previous.createdAt > record.createdAt))) return false;
          database.prepare('INSERT INTO project_thumbnails VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET snapshot=excluded.snapshot, bytes=excluded.bytes').run(record.projectId, JSON.stringify(record), Buffer.from(bytes));
          return true;
        })();
      },
    },
    manifest: { id: 'storage.local', kind: 'storage', version: '0.1.0', apiVersion: '1', capabilities: ['project.persist', 'project.events', 'project.checkpoints', 'project.trash', 'blob.persist', 'source.files', 'thumbnail.persist'] },
    async create(project) {
      ready(); validId(project.id); verifySource(project);
      if (!Number.isSafeInteger(project.revision) || project.revision < 0) throw new WorkbenchError('invalid_revision', '项目版本不合法。');
      try { database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?)').run(project.id, project.revision, project.updatedAt, JSON.stringify(project)); }
      catch (error) { if ((error as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) throw new WorkbenchError('project_exists', '项目已经存在。', 409); throw error; }
    },
    async list() {
      ready();
      return (database.prepare('SELECT p.snapshot FROM projects p LEFT JOIN project_deletions d ON d.project_id = p.id WHERE d.project_id IS NULL ORDER BY p.updated_at DESC, p.id').all() as ProjectRow[]).map(row => {
        const project = JSON.parse(row.snapshot) as Project;
        return { id: project.id, name: project.name, revision: project.revision, updatedAt: project.updatedAt };
      });
    },
    async get(id) { return load(id); },
    async commit(id, expectedRevision, next, event) {
      ready(); validId(id);
      if (next.id !== id || next.revision !== expectedRevision + 1 || event.projectId !== id || event.revision !== next.revision) throw new WorkbenchError('invalid_revision', '项目变更与事件版本不一致。');
      let undoFiles: (() => void) | undefined;
      try {
        return database.transaction(() => {
          const current = load(id);
          if (current.revision !== expectedRevision) throw new WorkbenchError('revision_conflict', `项目已更新至版本 ${current.revision}，请重新读取后继续。`, 409);
          preflight(next, event.actor);
          undoFiles = materialize(next);
          const update = database.prepare('UPDATE projects SET revision = ?, updated_at = ?, snapshot = ? WHERE id = ? AND revision = ?').run(next.revision, next.updatedAt, JSON.stringify(next), id, expectedRevision);
          if (update.changes !== 1) throw new WorkbenchError('revision_conflict', '项目版本已经改变。', 409);
          database.prepare('INSERT INTO events(project_id, revision, snapshot) VALUES (?, ?, ?)').run(id, event.revision, JSON.stringify(event));
          return structuredClone(next);
        })();
      } catch (error) { undoFiles?.(); throw error; }
    },
    async events(id, after = 0) {
      load(id);
      if (!Number.isSafeInteger(after) || after < 0) throw new WorkbenchError('invalid_cursor', '历史游标不合法。');
      return (database.prepare('SELECT cursor, snapshot FROM events WHERE project_id = ? AND cursor > ? ORDER BY cursor').all(id, after) as { cursor: number; snapshot: string }[]).map(row => ({ ...JSON.parse(row.snapshot) as ProjectEvent, cursor: row.cursor }));
    },
    async checkpoint(id, label) {
      const project = load(id);
      if (!label.trim() || label.length > 200) throw new WorkbenchError('invalid_label', '检查点名称必须为 1–200 个字符。');
      const checkpoint: Checkpoint = { id: randomUUID(), projectId: id, label: label.trim(), revision: project.revision, createdAt: new Date().toISOString(), project };
      database.prepare('INSERT INTO checkpoints VALUES (?, ?, ?, ?)').run(checkpoint.id, id, checkpoint.createdAt, JSON.stringify(checkpoint));
      return checkpoint;
    },
    async checkpoints(id) {
      load(id);
      return (database.prepare('SELECT snapshot FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC').all(id) as ProjectRow[]).map(row => JSON.parse(row.snapshot) as Checkpoint);
    },
    async getCheckpoint(id, checkpointId) {
      load(id);
      const row = database.prepare('SELECT snapshot FROM checkpoints WHERE id = ? AND project_id = ?').get(checkpointId, id) as ProjectRow | undefined;
      if (!row) throw new WorkbenchError('checkpoint_not_found', '找不到这个检查点。', 404);
      return JSON.parse(row.snapshot) as Checkpoint;
    },
    async putBlob(key, content) {
      ready();
      const filename = confined(join(root, 'blobs'), key);
      if (existsSync(filename)) {
        if (digest(readFileSync(filename)) === digest(content)) return;
        throw new WorkbenchError('blob_conflict', '已有资产内容不可覆盖，请使用新的资产标识。', 409);
      }
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
      const temporary = `${filename}.${randomUUID()}.tmp`;
      await writeFile(temporary, content, { mode: 0o600 });
      try { await link(temporary, filename); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (digest(await readFile(filename)) !== digest(content)) throw new WorkbenchError('blob_conflict', '已有资产内容不可覆盖，请使用新的资产标识。', 409);
      } finally { await unlink(temporary).catch(() => undefined); }
    },
    async getBlob(key) {
      ready();
      try { return await readFile(confined(join(root, 'blobs'), key)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new WorkbenchError('blob_not_found', '找不到项目文件。', 404); throw error; }
    },
    getProjectDirectory(id) { load(id); return projectDirectory(id); },
    async syncFiles(project) {
      ready();
      const current = load(project.id);
      if (current.revision !== project.revision || JSON.stringify(current.files) !== JSON.stringify(project.files)) throw new WorkbenchError('revision_conflict', '不能用过期快照写入项目源码。', 409);
      preflight(project);
      database.transaction(() => materialize(project))();
    },
    async saveJob(job) { ready(); validId(job.id); database.prepare('INSERT INTO jobs VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot').run(job.id,JSON.stringify(job)); },
    async listJobs() { ready(); return (database.prepare('SELECT snapshot FROM jobs').all() as ProjectRow[]).map(row=>JSON.parse(row.snapshot) as Job); },
    dispose() { if (!disposed) { disposed = true; database.close(); } },
  };
  return repository;
}
