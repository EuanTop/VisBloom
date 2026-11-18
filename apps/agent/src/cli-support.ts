import { constants } from 'node:fs';
import { copyFile, readFile, writeFile, rename, link, unlink, lstat, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Input = Record<string, unknown>;
export class CLIError extends Error { constructor(public code: string, message: string, public exitCode: number, public status?: number) { super(message); } }
const common = ['help', 'json', 'input', 'out', 'force'];
const project = [...common, 'project'];
const flags: Record<string, string[]> = {
  pages: ['help', 'json', 'input', 'out', 'project', 'revision', 'cover'],
  projects: common, trash: common, delete: [...project,'revision'], recover: [...project,'revision'], cases: common, create: [...common, 'name', 'preset', 'renderer'], context: [...project, 'full', 'after', 'limit'], file: [...project, 'path'], files: [...project, 'revision'], notes: [...project, 'file', 'revision'], patch: [...project, 'revision'], query: [...project, 'sql', 'sql-file', 'max-rows', 'apply', 'revision'], result: [...project, 'offset', 'limit'], import: [...project, 'file', 'name', 'revision'], checkpoint: [...project, 'label'], checkpoints: project, restore: [...project, 'checkpoint', 'revision'], capture: [...project, 'revision', 'width', 'height', 'time'], preview: [...project, 'revision'], export: [...project, 'revision', 'type', 'width', 'height', 'time'], job: [...common, 'id'], download: [...common, 'id'],
};
const booleans = new Set(['help', 'json', 'force', 'full', 'apply']);
export interface Arguments { command?: string; help: boolean; options: Record<string, string | boolean>; positional?: string }
export function parseArguments(argv: string[]): Arguments {
  if (!argv.length || (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0]))) return { help: true, options: {} };
  let [command, ...rest] = argv;
  if (command === 'help') { command = rest.shift() ?? ''; rest.push('--help'); }
  if (!Object.hasOwn(flags, command)) throw new CLIError('usage', `未知命令：${command}。使用 npm run --silent visloom -- --help 查看命令。`, 2);
  const result: Arguments = { command, help: false, options: {} };
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index] === '-h' ? '--help' : rest[index];
    if (!token.startsWith('--')) {
      if (result.positional !== undefined || !token.trim().startsWith('{')) throw new CLIError('usage', `不支持的位置参数：${token}。`, 2);
      result.positional = token; continue;
    }
    const name = token.slice(2);
    if (!flags[command].includes(name)) throw new CLIError('usage', `${command} 不支持 --${name}。`, 2);
    if (result.options[name] !== undefined) throw new CLIError('usage', `--${name} 重复。`, 2);
    if (booleans.has(name)) result.options[name] = true;
    else {
      const value = rest[++index];
      if (value === undefined || !value.trim() || value.startsWith('--') || value === '-h') throw new CLIError('usage', `--${name} 缺少值。`, 2);
      result.options[name] = value;
    }
  }
  if (result.positional !== undefined && result.options.input !== undefined) throw new CLIError('usage', '位置 JSON 与 --input 只能选择一种。', 2);
  result.help = Boolean(result.options.help); return result;
}
export async function readInput(args: Arguments): Promise<{ input: Input; directory: string }> {
  const filename = args.options.input as string | undefined;
  let stdin: string | undefined;
  if (filename === '-') { const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); stdin = Buffer.concat(chunks).toString('utf8'); }
  const source = filename ? filename === '-' ? stdin : await readFile(path.resolve(filename), 'utf8') : args.positional;
  if (source === undefined) return { input: {}, directory: process.cwd() };
  let input: unknown;
  try { input = JSON.parse(source); } catch { throw new CLIError('invalid_json', '输入不是有效 JSON。', 2); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CLIError('invalid_json', '输入必须是 JSON 对象。', 2);
  return { input: input as Input, directory: filename && filename !== '-' ? path.dirname(path.resolve(filename)) : process.cwd() };
}
export async function checkOutput(filename: string, force: boolean) {
  const target = path.resolve(filename);
  if (!(await stat(path.dirname(target))).isDirectory()) throw new CLIError('output_directory', '输出目录不可用。', 1);
  try { await lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (!force) throw new CLIError('output_exists', `${target} 已存在；确认覆盖时添加 --force。`, 1);
  if ((await lstat(target)).isDirectory()) throw new CLIError('output_directory', '输出路径不能是目录。', 1);
}
export async function writeOutput(filename: string, bytes: string | Uint8Array, force: boolean) {
  const target = path.resolve(filename), temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    if (force) await rename(temporary, target);
    else {
      try {
        try { await link(temporary, target); }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOTSUP' && code !== 'EOPNOTSUPP' && code !== 'ENOSYS') throw error;
          // Some removable filesystems do not support hard links. Retain the
          // no-overwrite guarantee through an exclusive copy of the staged file.
          await copyFile(temporary, target, constants.COPYFILE_EXCL);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new CLIError('output_exists', `${target} 已存在；确认覆盖时添加 --force。`, 1);
        throw error;
      }
    }
    return { path: target, bytes: typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.byteLength };
  } finally { await unlink(temporary).catch(() => {}); }
}
const prefix = 'npm run --silent visloom --';
export const globalHelp = `Visloom CLI — 通过本机服务读取、修改和交付作品

用法：${prefix} <command> [flags]
      ${prefix} <command> --help

发现：projects / cases / create / references
读取：context / file / notes / result / checkpoints / job / trash
修改：patch / files / import / query --apply / checkpoint / restore / delete / recover
查询：query（默认只读，不改变作品）
看稿：preview / capture
交付：pages / export / download；share create / list / revoke（详见 share --help）
Skill管理（离线）：skills list / show / read / active / check / lock / diff / bundle / verify；详见 skills --help
效果评测准备（离线）：eval list / check / prepare；详见 eval --help

默认输出 JSON；--json 显式选择相同格式。--input payload.json 或 --input - 从 stdin 读取 JSON 对象；旧位置 JSON 仍可用。
项目命令可用 --project ID；省略时读取最近项目，绝不推测 revision/hash。
需要版本保护的写入必须提供 --revision N 或输入 expectedRevision；导出输入使用 revision。
--out PATH 默认拒绝覆盖，支持硬链接的磁盘上原子写入，其他磁盘使用独占复制。--force 明确覆盖。stdout 仅输出结果或已写文件元数据。
服务地址由 ART_WORKBENCH_URL 指定（默认 http://127.0.0.1:4318）。帮助无需服务。
退出码：0 成功；1 操作失败；2 用法/JSON 错误；3 版本或哈希冲突。错误为 stderr JSON {error:{code,message,status?}}。

开始：
  ${prefix} projects
  ${prefix} context --project ID
  ${prefix} query --project ID --sql 'SELECT * FROM data' --max-rows 5
  ${prefix} file --project ID --path src/artwork.ts --out artwork.ts`;
const details: Record<string, string> = {
  trash: 'trash\n列出回收站项目元数据。',
  delete: 'delete --project ID --revision N\n将明确项目移入回收站；保留数据、源码和历史，不改变作品版本。需要显式项目ID。',
  recover: 'recover --project ID --revision N\n从回收站恢复明确项目，保留原作品版本与状态。',
  projects: 'projects\n列出项目 id/name/revision 与真实预览状态。',
  cases: 'cases\n列出可用于 create 的案例 preset。',
  create: 'create --name "新作品" --preset blank\nblank创建无案例数据、无参数的创作起点；可用 --renderer renderer.document / renderer.canvas2d / renderer.three 选择运行环境；也可使用 cases 返回的案例preset。返回简短 id/revision/codeHash。',
  context: 'context [--project ID] [--after CURSOR] [--limit 20] [--out context.json]\n默认紧凑 overview：状态、字段、文件 hash/大小、最多5行样本及最近20条事件，不返回完整源码/检查点快照。\n--after 显式读取增量；省略时读取最新事件。--full 显式读取完整 context（可含全部源码/数据/检查点），不能和 --limit 使用。',
  file: 'file --project ID --path src/artwork.ts [--out artwork.ts]\n默认 JSON 含 path/hash/content；--out 写原始源码。先记录 hash，再编辑本地文件并用 files manifest 保存。',
  files: 'files --project ID --input edits.json [--revision N]\nmanifest 示例：{"expectedRevision":3,"files":[{"path":"src/artwork.ts","contentFile":"artwork.ts","expectedHash":"从 file/context 读取的真实 hash"}]}\ncontentFile 相对 manifest 所在目录解析；stdin/位置 JSON 相对当前目录。也可用 content 字符串。新文件可省略 expectedHash；已有文件请提供实际 hash。不自动补版本/hash，不回显源码。\n源码变更应同时提供准确 bindings:[{field:"实际数据字段",channel:"作品实际视觉编码说明"}]，与文件在同一 revision 原子保存；不自动推导编码。显式 [] 清空说明。非 controls 源码真正变更而未传 bindings 时，旧说明会被清空；相同源码或仅 controls 改动不会自动清空。可提交相同源码和显式 bindings，仅更新说明且保留参数。',
  notes: 'notes --project ID [--out notes.md]\nnotes --project ID --file notes.md --revision N\n读取输出 JSON；--out 写原始手记。写入也支持 --input 文件，内容为 {expectedRevision,notes}。',
  patch: 'patch --project ID --revision N --input patch.json\npatch.json 示例：{"patch":{"parameters":{"speed":0.7}}}\n也可：patch \'{"projectId":"ID","expectedRevision":3,"patch":{"paused":true}}\'\n仅提交明确改动，不自动重试覆盖冲突。',
  query: 'query --project ID --sql \'SELECT * FROM data\' [--max-rows 20] [--out rows.json]\nquery --project ID --sql-file query.sql --max-rows 100\n默认 explore 为只读，不改变作品数据/版本，默认最多20行。替换画面数据必须显式：\nquery --project ID --sql-file query.sql --apply --revision N --max-rows 10000\napply 默认最多10000行；maxRows 范围1–10000。务必检查 rowCount/truncated，truncated=true 表示结果被截断，不代表完整数据。\n应用返回 id/revision/resultId/rowCount/truncated；用 result 分页读取。旧输入支持 {sql,maxRows,apply:true,expectedRevision}。',
  result: 'result --project ID [--offset 0] [--limit 20] [--out rows.json]\n读取已应用查询结果；limit 1–10000，返回 hasMore/totalRows，不改变作品。',
  import: 'import --project ID --file data.csv [--name "数据名称"] [--revision N]\n扩展名 .csv/.json 决定格式。也支持 --input 文件，内容为 {name,format,content,expectedRevision?}。返回元数据。',
  checkpoint: 'checkpoint --project ID --label "调整之前"\n返回 id/label/revision 等检查点元数据。',
  checkpoints: 'checkpoints --project ID\n仅列检查点元数据，不输出其完整项目快照。',
  restore: 'restore --project ID --checkpoint CHECKPOINT_ID --revision N\n恢复为新版本；当前 revision 必须准确，不自动覆盖并发修改。',
  capture: 'capture --project ID --revision N --out artwork.png [--width 1600] [--height 1200] [--time 0]\n必须有已连接且应用当前版本的真实画布。最多等待20秒，确认完成再下载；失败不写假图、不输出 base64。--force 明确覆盖已有文件。',
  preview: 'preview --project ID --revision N\n等待固定版本的本机 HTML 预览完成，返回可交互的 previewUrl 和实时编辑用 workbenchUrl。无需先连接画布，不公开发布。要对比两版，分别保留各自的 previewUrl。',
  pages: 'pages --project ID --revision N --out NEW_DIRECTORY [--cover chosen.jpg]\n生成 GitHub Pages 文件 index.html、cover.jpg 和 .nojekyll。默认从该版本的页面截图；可用 --cover 指定 JPEG。',
  export: 'export --project ID --revision N [--type web|png] [--out artwork.html]\n默认 web。带 --out 最多等待20秒并下载完成产物；不带返回任务信息，用 job/download 接续。完成的HTML导出/下载返回当前服务的previewUrl，可在浏览器直接预览；访问沿用服务授权，非公开分享。PNG 可用 --width/--height(64–4096)/--time(0–3600)，需要真实画布。',
  job: 'job --id JOB_ID\n读取真实任务状态：queued/running/completed/failed/canceled。',
  download: 'download --id JOB_ID --out artwork.html [--force]\n仅下载 completed 任务，不把失败/等待状态保存为作品。',
};
export function commandHelp(command: string) { return `${prefix} ${details[command]}\n\n通用：--json / --input FILE|- / --out PATH${flags[command].includes('force') ? ' / --force' : ''}。仅项目命令支持 --project ID；具体可用参数以上述语法为准。`; }
