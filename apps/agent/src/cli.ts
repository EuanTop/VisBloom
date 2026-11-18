import { CAPTURE_MAX_HEIGHT, CAPTURE_MAX_WIDTH, validCaptureSize } from '@art/contracts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CLIError, commandHelp, globalHelp, parseArguments, readInput, writeOutput, checkOutput, type Input } from './cli-support.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function compact(p: any) { return { id: p.id, revision: p.revision, codeHash: p.codeHash, files: p.files?.map((f: any) => ({ path: f.path, hash: f.hash })), datasetId: p.dataset?.id, resultId: p.result?.id, rowCount: p.result?.rowCount, truncated: p.result?.truncated, bindings: p.bindings }; }
function integer(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new CLIError('usage', `${name} 必须是 ${min}–${max} 的整数。`, 2);
  return value;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new CLIError('usage', `缺少有效的 ${name}。`, 2);
  return value;
}
function object(value: unknown, name: string): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CLIError('usage', `${name} 必须是 JSON 对象。`, 2);
  return value as Input;
}
function keys(value: Input, allowed: string[], name: string) {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) throw new CLIError('usage', `${name} 不接受字段：${extra.join(', ')}。`, 2);
}
async function main() {
  if (process.argv[2] === 'share') { await (await import('./publication-cli.ts')).runPublications(process.argv.slice(3)); return; }
  if (process.argv[2] === 'skills') { await (await import('./skill-cli.ts')).runSkills(process.argv.slice(3)); return; }
  if (process.argv[2] === 'references') { await (await import('./reference-cli.ts')).runReferences(process.argv.slice(3)); return; }
  if (process.argv[2] === 'eval') { await (await import('./evaluation-cli.ts')).runEvaluation(process.argv.slice(3)); return; }
  const parsed = parseArguments(process.argv.slice(2));
  if (!parsed.command) { console.log(globalHelp); return; }
  if (parsed.help) { console.log(commandHelp(parsed.command)); return; }
  const { command, options } = parsed;
  const { input, directory } = await readInput(parsed);
  const fields: Record<string, string[]> = {
    pages: ['revision', 'cover'],
    projects: [], trash: [], delete: ['expectedRevision'], recover: ['expectedRevision'], cases: [], create: ['name', 'preset', 'renderer'], context: ['after', 'limit', 'full'], file: ['path'], files: ['expectedRevision', 'files', 'bindings'], notes: ['expectedRevision', 'notes'], patch: ['expectedRevision', 'patch'], query: ['sql', 'maxRows', 'apply', 'expectedRevision'], result: ['offset', 'limit'], import: ['expectedRevision', 'name', 'format', 'content'], checkpoint: ['label'], checkpoints: [], restore: ['expectedRevision', 'checkpointId'], capture: ['revision', 'width', 'height', 'time'], preview: ['revision'], export: ['revision', 'type', 'width', 'height', 'time'], job: ['id'], download: ['id'],
  };
  const needsProject = !['projects', 'trash', 'cases', 'create', 'job', 'download'].includes(command);
  keys(input, [...(needsProject ? ['projectId'] : []), ...fields[command]], '输入');
  const merge = (name: string, flag: string, convert: (value: unknown) => unknown = value => value) => {
    if (options[flag] === undefined) return;
    const value = convert(options[flag]);
    if (input[name] !== undefined && JSON.stringify(input[name]) !== JSON.stringify(value)) throw new CLIError('usage', `--${flag} 与输入中的 ${name} 冲突。`, 2);
    input[name] = value;
  };
  merge('projectId', 'project');
  merge(['capture', 'preview', 'export', 'pages'].includes(command) ? 'revision' : 'expectedRevision', 'revision', value => integer(value, '--revision'));
  for (const name of ['name', 'preset', 'renderer', 'path', 'label', 'sql', 'type', 'id', 'cover']) merge(name, name);
  merge('checkpointId', 'checkpoint');
  for (const name of ['after', 'offset', 'limit', 'width', 'height']) merge(name, name, value => integer(value, `--${name}`));
  merge('maxRows', 'max-rows', value => integer(value, '--max-rows', 1, 10000));
  merge('time', 'time', value => {
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new CLIError('usage', '--time 必须是有限非负秒数。', 2);
    return Number(value);
  });
  merge('apply', 'apply'); merge('full', 'full');
  const requireRevision = () => integer(input.expectedRevision, '--revision / expectedRevision');
  const out = options.out as string | undefined;
  if (options.force && !out) throw new CLIError('usage', '--force 仅能与 --out 一起使用。', 2);
  if (out === '-') throw new CLIError('usage', '--out 需要真实文件路径；省略时 JSON 输出到 stdout。', 2);
  if (options['sql-file']) {
    if (input.sql !== undefined) throw new CLIError('usage', '--sql-file 不能与 sql / --sql 同时使用。', 2);
    input.sql = await readFile(path.resolve(options['sql-file'] as string), 'utf8');
  }
  // Validate locally before importing the client or resolving any project.
  let body: Input | undefined;
  if (['delete','recover'].includes(command)) {text(input.projectId,'--project (required)');body={expectedRevision:requireRevision()};}
  if (command === 'create') {
    if(input.renderer!==undefined&&(input.preset!=='blank'||!['renderer.canvas2d','renderer.three','renderer.document'].includes(String(input.renderer))))throw new CLIError('usage','renderer 仅能为 blank 项目选择已安装的渲染器。',2);
    body = { name: text(input.name, '--name'), preset: text(input.preset, '--preset'), ...(input.renderer===undefined?{}:{renderer:input.renderer}) };
  }
  if (command === 'context') {
    if (input.full !== undefined && typeof input.full !== 'boolean') throw new CLIError('usage', 'full 必须是布尔值。', 2);
    if (input.full && input.limit !== undefined) throw new CLIError('usage', '--full 不接受 --limit。', 2);
    if (input.after !== undefined) integer(input.after, '--after');
    if (input.limit !== undefined) integer(input.limit, '--limit', 1, 100);
  }
  if (command === 'file') text(input.path, '--path');
  if (command === 'files') {
    requireRevision();
    if (!Array.isArray(input.files) || !input.files.length) throw new CLIError('usage', 'files 需要非空 files 数组。', 2);
    const files = [];
    for (const item of input.files) {
      const file = object(item, 'files[]'); keys(file, ['path', 'content', 'contentFile', 'expectedHash'], 'files[]');
      text(file.path, 'files[].path');
      if ((file.content === undefined) === (file.contentFile === undefined)) throw new CLIError('usage', '每个文件必须且只能提供 content 或 contentFile。', 2);
      if (file.content !== undefined && typeof file.content !== 'string') throw new CLIError('usage', 'content 必须是字符串。', 2);
      if (file.expectedHash !== undefined) text(file.expectedHash, 'expectedHash');
      files.push({ path: file.path, content: file.contentFile === undefined ? file.content : await readFile(path.resolve(directory, text(file.contentFile, 'contentFile')), 'utf8'), ...(file.expectedHash === undefined ? {} : { expectedHash: file.expectedHash }) });
    }
    if (input.bindings !== undefined) {
      if (!Array.isArray(input.bindings)) throw new CLIError('usage', 'bindings 必须是数组；清空说明请传 []。', 2);
      for (const item of input.bindings) {
        const binding = object(item, 'bindings[]'); keys(binding, ['field', 'channel', 'requires'], 'bindings[]');
        text(binding.field, 'bindings[].field'); text(binding.channel, 'bindings[].channel');
      }
    }
    body = { expectedRevision: requireRevision(), files, ...(input.bindings === undefined ? {} : { bindings: input.bindings }) };
  }
  if (command === 'patch') body = { expectedRevision: requireRevision(), patch: object(input.patch, 'patch') };
  if (command === 'notes') {
    if (options.file) {
      if (input.notes !== undefined) throw new CLIError('usage', '--file 不能与 notes 同时使用。', 2);
      input.notes = await readFile(path.resolve(options.file as string), 'utf8');
    }
    if (input.notes !== undefined) {
      if (typeof input.notes !== 'string') throw new CLIError('usage', 'notes 必须是字符串。', 2);
      if (out) throw new CLIError('usage', '写入手记不接受 --out；读取手记时 --out 保存原始文本。', 2);
      body = { expectedRevision: requireRevision(), notes: input.notes };
    } else if (input.expectedRevision !== undefined) throw new CLIError('usage', '读取手记不接受 --revision；写入请提供 --file 或 notes。', 2);
  }
  if (command === 'query') {
    text(input.sql, '--sql / --sql-file / sql');
    if (input.apply !== undefined && typeof input.apply !== 'boolean') throw new CLIError('usage', 'apply 必须是布尔值。', 2);
    if (!input.apply && input.expectedRevision !== undefined) throw new CLIError('usage', '只读查询不接受 --revision；替换作品数据需同时提供 --apply。', 2);
    body = { sql: input.sql, maxRows: input.maxRows === undefined ? input.apply ? 10000 : 20 : integer(input.maxRows, 'maxRows', 1, 10000), ...(input.apply ? { expectedRevision: requireRevision() } : {}) };
  }
  if (command === 'result') { if (input.offset !== undefined) integer(input.offset, '--offset'); if (input.limit !== undefined) integer(input.limit, '--limit', 1, 10000); }
  if (command === 'import') {
    if (options.file) {
      if (input.content !== undefined || input.format !== undefined) throw new CLIError('usage', '--file 与 content / format 不能同时使用。', 2);
      const filename = options.file as string, extension = path.extname(filename).toLowerCase();
      if (!['.csv', '.json'].includes(extension)) throw new CLIError('usage', '导入文件扩展名必须为 .csv 或 .json。', 2);
      input.content = await readFile(path.resolve(filename), 'utf8'); input.format = extension.slice(1); input.name ??= path.basename(filename);
    }
    if (typeof input.content !== 'string' || !['csv', 'json'].includes(String(input.format))) throw new CLIError('usage', '导入需要 --file，或 content、format(csv/json)、name。', 2);
    body = { name: text(input.name, 'name'), format: input.format, content: input.content, ...(input.expectedRevision === undefined ? {} : { expectedRevision: requireRevision() }) };
  }
  if (command === 'checkpoint') body = { label: text(input.label, '--label') };
  if (command === 'restore') { text(input.checkpointId, '--checkpoint'); body = { expectedRevision: requireRevision() }; }
  if (command === 'capture' || command === 'preview' || command === 'export') {
    if (command === 'capture' && !out) throw new CLIError('usage', 'capture 必须提供 --out image.png。', 2);
    const type = command === 'capture' ? 'png' : input.type ?? 'web';
    if (!['png', 'web'].includes(String(type))) throw new CLIError('usage', '--type 仅支持 web 或 png。', 2);
    if (type === 'web' && ['width', 'height', 'time'].some(key => input[key] !== undefined)) throw new CLIError('usage', 'Web 导出不接受 width / height / time。', 2);
    body = { type, revision: integer(input.revision, '--revision / revision') };
    for (const name of ['width', 'height']) if (input[name] !== undefined) body[name] = integer(input[name], name, 64, name==='height'?CAPTURE_MAX_HEIGHT:CAPTURE_MAX_WIDTH);
    if (type==='png' && !validCaptureSize(Number(body.width??1600),Number(body.height??1200))) throw new CLIError('usage', '图片总像素不能超过 2400 万。', 2);
    if (input.time !== undefined) { if (typeof input.time !== 'number' || !Number.isFinite(input.time) || input.time < 0 || input.time > 3600) throw new CLIError('usage', 'time 必须为 0–3600 秒。', 2); body.time = input.time; }
  }
  let pagesCover: Buffer | undefined;
  if (command === 'pages') {
    if (!out) throw new CLIError('usage', 'pages 必须提供 --out NEW_DIRECTORY。', 2);
    body = { type: 'web', revision: integer(input.revision, '--revision / revision') };
    const { checkPagesDirectory, readCover } = await import('./pages-package.ts');
    await checkPagesDirectory(out);
    if (input.cover !== undefined) pagesCover = await readCover(path.resolve(options.cover ? process.cwd() : directory, text(input.cover, '--cover')));
  }
  if (['job', 'download'].includes(command)) { text(input.id, '--id'); if (command === 'download' && !out) throw new CLIError('usage', 'download 必须提供 --out。', 2); }
  if (input.projectId !== undefined) text(input.projectId, '--project / projectId');
  if (out && command !== 'pages') await checkOutput(out, Boolean(options.force));

  const { request, projectId, base, authHeaders } = await import('./client.ts');
  const segment = (value: unknown) => encodeURIComponent(String(value));
  const id = needsProject ? await projectId(input.projectId as string | undefined) : undefined;
  const projectURL = `/api/projects/${segment(id)}`;
  const params = (names: string[]) => { const query = new URLSearchParams(); for (const name of names) if (input[name] !== undefined) query.set(name, String(input[name])); return query.size ? `?${query}` : ''; };
  const wait = async (initial: any) => {
    const deadline = Date.now() + 20_000; let job = initial;
    while (['queued', 'running'].includes(job.status)) {
      if (Date.now() >= deadline) throw new CLIError('job_timeout', `等待导出超时；可用 job --id ${job.id} 查看状态。`, 1);
      await sleep(Math.min(200, Math.max(1, deadline-Date.now())));
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new CLIError('job_timeout', `等待导出超时；可用 job --id ${job.id} 查看状态。`, 1);
      try{job=await request(`/api/jobs/${segment(job.id)}`,'GET',undefined,remaining);}
      catch(error){if(Date.now()>=deadline)throw new CLIError('job_timeout',`等待导出超时；可用 job --id ${job.id} 查看状态。`,1);throw error;}
    }
    if (job.status !== 'completed') throw new CLIError(job.status === 'canceled' ? 'job_canceled' : 'job_failed', job.error ?? `任务状态：${job.status}`, 1);
    return job;
  };
  const downloadBytes = async (job: any) => {
    if (job.status !== 'completed') throw new CLIError('job_incomplete', `任务尚未完成：${job.status}`, 1);
    const response = await fetch(`${base}/api/jobs/${segment(job.id)}/download`, { signal: AbortSignal.timeout(20_000),headers:authHeaders() });
    if (!response.ok) { const value = await response.json(); throw new CLIError(value.error ?? 'download_failed', value.message ?? `下载失败：${response.status}`, response.status === 409 ? 3 : 1, response.status); }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if(!bytes.length||(job.type==='capture'&&!Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))))throw new CLIError('invalid_download','下载内容不是有效作品文件。',1);
    return bytes;
  };
  const download = async (job: any) => {
    const bytes = await downloadBytes(job);
    return { id: job.id, projectId: job.projectId, revision: job.revision, status: job.status, ...(job.previewPath===`/api/jobs/${segment(job.id)}/preview`?{previewUrl:base+job.previewPath}:{}), ...await writeOutput(out!, bytes, Boolean(options.force)) };
  };
  let result: any, raw: string | undefined;
  switch (command) {
    case 'trash': result = await request('/api/trash'); break;
    case 'delete': result = await request(projectURL,'DELETE',body); break;
    case 'recover': result = compact(await request(`${projectURL}/restore`,'POST',body)); break;
    case 'projects': result = await request('/api/projects'); break;
    case 'cases': result = await request('/api/cases'); break;
    case 'create': result = compact(await request('/api/projects', 'POST', body)); break;
    case 'context': result = await request(`${projectURL}/${input.full ? 'context' : 'overview'}${params(input.full ? ['after'] : ['after', 'limit'])}`); break;
    case 'file': result = await request(`${projectURL}/files${params(['path'])}`); raw = result.file.content; break;
    case 'files': result = compact(await request(`${projectURL}/files`, 'PUT', body)); break;
    case 'notes': result = body ? compact(await request(`${projectURL}/notes`, 'PUT', body)) : await request(`${projectURL}/notes`); if (!body) raw = result.notes; break;
    case 'patch': result = compact(await request(`${projectURL}/state`, 'PATCH', body)); break;
    case 'query': { const value = await request(`${projectURL}/${input.apply ? 'query' : 'explore'}`, 'POST', body); result = input.apply ? compact(value) : value; break; }
    case 'result': result = await request(`${projectURL}/result${params(['offset', 'limit'])}`); break;
    case 'import': result = compact(await request(`${projectURL}/data`, 'POST', body)); break;
    case 'checkpoint': { const cp = await request(`${projectURL}/checkpoints`, 'POST', body); result = { id: cp.id, projectId: cp.projectId, label: cp.label, revision: cp.revision, createdAt: cp.createdAt }; break; }
    case 'checkpoints': { const value = await request(`${projectURL}/checkpoints`); result = value.map((cp: any) => ({ id: cp.id, projectId: cp.projectId, label: cp.label, revision: cp.revision, createdAt: cp.createdAt })); break; }
    case 'restore': result = compact(await request(`${projectURL}/checkpoints/${segment(input.checkpointId)}/restore`, 'POST', body)); break;
    case 'preview': {
      const job = await wait(await request(`${projectURL}/exports`, 'POST', body));
      if (job.previewPath !== `/api/jobs/${segment(job.id)}/preview`) throw new CLIError('preview_unavailable', '当前服务未提供预览地址。', 1);
      result = { id: job.id, projectId: job.projectId, revision: job.revision, status: job.status, previewUrl: base+job.previewPath, workbenchUrl: `${base}/?project=${segment(id)}` };
      break;
    }
    case 'pages': {
      const job = await wait(await request(`${projectURL}/exports`, 'POST', body));
      const { stagePages } = await import('./pages-package.ts');
      const files = await stagePages(out!, await downloadBytes(job), pagesCover);
      console.log(JSON.stringify({ projectId: job.projectId, revision: job.revision, ...files }));
      return;
    }
    case 'capture': case 'export': {
      const job = await request(`${projectURL}/exports`, 'POST', body);
      if (out) {
        try {
          result = await download(await wait(job));
        } catch (error) {
          if (body?.type === 'png' && error instanceof CLIError && error.message.startsWith('renderer_unavailable:')) {
            throw new CLIError(error.code, `Open ${base}/?project=${segment(id)} and wait for revision ${body.revision}, then retry capture. For a frozen browser preview without the workbench, run preview --project ${id} --revision ${body.revision}.`, error.exitCode);
          }
          throw error;
        }
        console.log(JSON.stringify(result));
        return;
      }
      result = job;
      break;
    }
    case 'job': result = await request(`/api/jobs/${segment(input.id)}`); break;
    case 'download': result = await download(await request(`/api/jobs/${segment(input.id)}`)); console.log(JSON.stringify(result)); return;
  }
  if (out) {
    const output = await writeOutput(out, raw ?? JSON.stringify(result, null, 2) + '\n', Boolean(options.force));
    console.log(JSON.stringify({ ...output, ...(id ? { projectId: id } : {}), ...(result.revision !== undefined ? { revision: result.revision } : {}), ...(result.file?.hash ? { hash: result.file.hash } : {}) }));
  } else console.log(JSON.stringify(result, null, 2));
}
try { await main(); }
catch (cause) {
  const error = cause as { code?: string; message?: string; status?: number; exitCode?: number };
  const legacy = error.message?.match(/^(\d{3}) ([\w-]+): (.*)$/s);
  const status = error.status ?? (legacy ? Number(legacy[1]) : undefined);
  console.error(JSON.stringify({ error: { code: typeof error.code==='string'?error.code:legacy?.[2]??'operation_failed', message: legacy?.[3] ?? error.message ?? String(cause), ...(status === undefined ? {} : { status }) } }));
  process.exitCode = error.exitCode ?? (status === 409 ? 3 : 1);
}
