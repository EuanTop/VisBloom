import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { WorkbenchError, type DataPlugin } from '@art/contracts';

const runFile = promisify(execFile);
const require = createRequire(import.meta.url);
const PINNED_AVA_VERSION = '4.0.0';
const MAX_BYTES = 8 * 1024 * 1024;
type Source = { id: string; name: string; format: 'csv' | 'json'; hash: string };
type QueryResult = { schema?: { name: string }[]; data?: Record<string, unknown>[]; rowCount?: number; truncated?: boolean };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function datasetKey(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new WorkbenchError('invalid_dataset_id', '数据标识不合法。');
  return id;
}

/** AVA remains the required data core; this adapter only isolates its upstream API. */
export function createAvaPlugin({ directory }: { directory: string }): DataPlugin {
  const root = resolve(directory);
  const sessions = new Map<string, string>();
  const queues = new Map<string, Promise<unknown>>();
  let disposed = false;

  async function command(args: string[]): Promise<unknown> {
    if (disposed) throw new WorkbenchError('plugin_disposed', 'AVA 数据模块已关闭。', 503);
    let cli: string;
    try {
      const packagePath = require.resolve('@antv/ava/package.json');
      const metadata = JSON.parse(await readFile(packagePath, 'utf8')) as { version: string; bin: { ava: string } };
      if (metadata.version !== PINNED_AVA_VERSION) throw new Error(`Expected AVA ${PINNED_AVA_VERSION}, installed ${metadata.version}`);
      cli = join(dirname(packagePath), metadata.bin.ava);
    } catch (error) {
      throw new WorkbenchError('ava_unavailable', `AVA 安装或版本检查失败：${String(error)}`, 503);
    }
    // Deterministic source/schema/profile/query calls never need model credentials.
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
    for (const key of Object.keys(env)) {
      if (/^(OPENAI_|AI_GATEWAY_|AVA_FEISHU_)/.test(key)) delete env[key];
    }
    try {
      const result = await runFile(process.execPath, [cli, ...args], {
        cwd: root, env, timeout: 60_000, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8', windowsHide: true,
      });
      return JSON.parse(result.stdout.trim());
    } catch (error) {
      const failure = error as Error & { stderr?: string; killed?: boolean };
      const reason = failure.stderr?.trim() || failure.message;
      throw new WorkbenchError(failure.killed ? 'ava_timeout' : 'ava_execution_failed', reason, failure.killed ? 504 : 400);
    }
  }

  async function serial<T>(id: string, task: () => Promise<T>): Promise<T> {
    datasetKey(id);
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    queues.set(id, next);
    try { return await next; } finally { if (queues.get(id) === next) queues.delete(id); }
  }

  async function source(id: string): Promise<Source> {
    try {
      const value = JSON.parse(await readFile(join(root, `${datasetKey(id)}.source.json`), 'utf8')) as Source;
      if (value.id !== id || !['csv', 'json'].includes(value.format)) throw new Error('Invalid source manifest');
      const bytes = await readFile(join(root, `${id}.${value.format}`));
      if (hash(bytes) !== value.hash) throw new WorkbenchError('dataset_changed', '数据文件与导入时的哈希不一致，请重新导入。', 409);
      return value;
    } catch (error) {
      if (error instanceof WorkbenchError) throw error;
      throw new WorkbenchError('dataset_not_found', '找不到导入的数据，请重新导入。', 404);
    }
  }

  async function connect(id: string): Promise<string> {
    const metadata = await source(id);
    const response = await command(['source', join(root, `${id}.${metadata.format}`), '--engine', 'duckdb']) as { datasetId?: string };
    if (typeof response.datasetId !== 'string') throw new WorkbenchError('ava_invalid_response', 'AVA 未返回有效的数据会话。', 502);
    sessions.set(id, response.datasetId);
    return response.datasetId;
  }

  async function sessionCommand(id: string, args: (session: string) => string[]): Promise<unknown> {
    // Verify source integrity even while an AVA session is cached.
    await source(id);
    let session = sessions.get(id) ?? await connect(id);
    try { return await command(args(session)); }
    catch (error) {
      // Retry only an explicitly expired/unavailable session, never arbitrary SQL errors.
      if (!(error instanceof Error) || !/Dataset .*unavailable\. Load it again with ava source/i.test(error.message)) throw error;
      sessions.delete(id);
      session = await connect(id);
      return command(args(session));
    }
  }

  async function releaseSession(id: string): Promise<void> {
    const session = sessions.get(id);
    sessions.delete(id);
    if (session) {
      try { await command(['dispose', session]); }
      catch (error) { if (!(error instanceof Error) || !/unavailable|connection closed/i.test(error.message)) throw error; }
    }
  }

  return {
    manifest: { id: 'data.ava', kind: 'data', version: '0.1.0', apiVersion: '1', vendorVersion: PINNED_AVA_VERSION, capabilities: ['data.import', 'data.schema', 'data.profile', 'data.query'] },
    async importData(input) {
      return serial(input.id, async () => {
        if (!['csv', 'json'].includes(input.format)) throw new WorkbenchError('invalid_format', '仅支持 CSV 与 JSON。');
        if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_BYTES) throw new WorkbenchError('invalid_data_size', '数据文件必须为 1 字节至 8 MiB。');
        if (input.format === 'json') {
          let json: unknown;
          try { json = JSON.parse(new TextDecoder().decode(input.bytes)); } catch { throw new WorkbenchError('invalid_json', 'JSON 解析失败。'); }
          if (!Array.isArray(json) || json.length === 0 || json.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) {
            throw new WorkbenchError('invalid_json', 'JSON 必须是非空对象数组。');
          }
        }
        await mkdir(root, { recursive: true, mode: 0o700 });
        const digest = hash(input.bytes);
        const metadataPath = join(root, `${input.id}.source.json`);
        try {
          const old = JSON.parse(await readFile(metadataPath, 'utf8')) as Source;
          if (old.hash !== digest || old.format !== input.format) throw new WorkbenchError('dataset_id_conflict', '数据标识已被另一份内容使用，请使用新的标识。', 409);
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        await writeFile(join(root, `${input.id}.${input.format}`), input.bytes, { mode: 0o600 });
        await writeFile(metadataPath, JSON.stringify({ id: input.id, name: input.name, format: input.format, hash: digest } satisfies Source), { mode: 0o600 });
        await releaseSession(input.id);
        try {
          const schema = await sessionCommand(input.id, session => ['schema', session]);
          // AVA's all-column top-values plan can exceed its 512 MB budget even
          // for a small, wide ingredient table. Request a bounded inspection;
          // exact distinct/frequency analysis remains available through AVA SQL.
          const profile = await sessionCommand(input.id, session => ['profile', session, '--metrics', 'row_count,null_count,min,max,mean']);
          return { schema, profile };
        } catch (error) { await releaseSession(input.id).catch(() => undefined); throw error; }
      });
    },
    async query(input) {
      return serial(input.datasetId, async () => {
        if (!Number.isSafeInteger(input.maxRows) || input.maxRows < 1 || input.maxRows > 10_000) throw new WorkbenchError('invalid_max_rows', '返回行数必须为 1–10000。');
        if (typeof input.sql !== 'string' || !input.sql.trim() || Buffer.byteLength(input.sql) > 512 * 1024) throw new WorkbenchError('invalid_query', 'SQL 必须非空且不超过 512 KiB。');
        if (input.sql.startsWith('@') || input.sql === '-') throw new WorkbenchError('invalid_query', '查询必须为 SQL 文本，不能使用 CLI 文件或 stdin 引用。');
        // AVA/DuckDB owns parsing and the read-only SELECT guard. Do not weaken it with a home-grown SQL regex.
        const result = await sessionCommand(input.datasetId, session => ['query', session, '--dsl', input.sql, '--max-rows', String(input.maxRows), '--max-result-bytes', String(8 * 1024 * 1024)]) as QueryResult;
        if (!Array.isArray(result.data)) throw new WorkbenchError('ava_invalid_response', 'AVA 查询结果格式不兼容。', 502);
        return { columns: result.schema?.map(column => column.name) ?? Object.keys(result.data[0] ?? {}), rows: result.data, rowCount: result.rowCount ?? result.data.length, truncated: result.truncated === true };
      });
    },
    async release(id) { await serial(id, () => releaseSession(id)); },
    async dispose() {
      await Promise.allSettled([...queues.values()]);
      const outcomes = await Promise.allSettled([...sessions.keys()].map(releaseSession));
      disposed = true;
      const failure = outcomes.find(outcome => outcome.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    },
  };
}
