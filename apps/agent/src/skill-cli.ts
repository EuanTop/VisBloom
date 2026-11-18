import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { axes, entryGroups, createLock, createBundle, verifyLock, verifyBundle, verifyProjectEntries, loadCatalog, loadProjectEntries, localPath, ref, resolve, sha256, compareLocks } from '../../../packages/skill-library/src/index.ts';
import { CLIError, writeOutput } from './cli-support.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export const skillHelp = `Visloom Skills — 本地目录、版本与组合（无需工作台服务）

npm run --silent visloom -- skills list [--axis style] [--tag ink]
npm run --silent visloom -- skills entries [--group style] [--axis technology] [--tag canvas2d]
npm run --silent visloom -- skills find [--query "threejs glsl"] [--axis style] [--tag ink] [--limit 8] [--offset 0]
npm run --silent visloom -- skills show --id data-art@0.1.0
npm run --silent visloom -- skills read --id data-art@0.1.0 [--file SKILL.md] [--start-line 1 --lines 80] [--out skill.md]
npm run --silent visloom -- skills check
npm run --silent visloom -- skills active [--select wax-crayon@0.1.0]
npm run --silent visloom -- skills lock --select data-art@0.1.0 [--out skills.lock.json]
npm run --silent visloom -- skills verify --lock skills.lock.json
npm run --silent visloom -- skills bundle --lock skills.lock.json --out NEW_DIRECTORY
npm run --silent visloom -- skills verify --bundle DIRECTORY
npm run --silent visloom -- skills diff --from old.lock.json --to new.lock.json

select 为逗号分隔的精确 id@version，依赖自动解析，不自动挑选创作方向。
属性：${axes.join(', ')}。list/show只读元数据；read按需读取一个实际资源，返回其hash。
entries列出当前可用入口、主要归属和交叉属性；list包含所有冻结历史版本。目录归属不限制跨属性检索。
find只搜索当前入口，按需分页返回精简摘要、作者、许可与来源。优先匹配全部词；没有完整命中时，返回匹配最多检索词的条目并标明部分匹配。
read的行范围是明确标记的片段，hash仍指完整资源；未传范围时保留完整读取行为。
check检查目录、依赖与资源，不证明Skill方法或作品质量，也不完整验证Agent Skills YAML规范。
lock固定元数据与全部资源hash；verify发现修改、增删与依赖漂移。旧bundle可独立verify。
bundle仅复制已核对的本地文件，不联网、安装、执行或自动注册宿主Skill。
active核对项目默认入口及其锁定版本；--select可显式核对可选Skill入口，不表示当前Agent宿主已经加载。
--out 默认拒绝覆盖；普通文件可显式 --force，bundle输出目录始终必须不存在。`;
const allowed: Record<string, string[]> = {
  list: ['axis', 'tag', 'out', 'force'], entries: ['group', 'axis', 'tag', 'out', 'force'], find: ['group', 'axis', 'tag', 'query', 'limit', 'offset', 'out', 'force'], show: ['id', 'out', 'force'], read: ['id', 'file', 'start-line', 'lines', 'out', 'force'],
  active: ['select', 'out', 'force'], check: ['out', 'force'], lock: ['select', 'out', 'force'], verify: ['lock', 'bundle', 'out', 'force'], bundle: ['lock', 'out'], diff: ['from', 'to', 'out', 'force'],
};
export async function runSkills(argv: string[]) {
  if (!argv.length || argv[0] === '--help' || argv[0] === 'help') { console.log(skillHelp); return; }
  const [command, ...rest] = argv;
  if (!Object.hasOwn(allowed, command)) throw new CLIError('usage', '未知Skill命令；使用 art skills --help。', 2);
  if (rest.length === 1 && ['--help', '-h'].includes(rest[0])) { console.log(skillHelp); return; }
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].slice(2);
    if (!rest[i].startsWith('--') || !allowed[command].includes(key) || options[key] !== undefined) throw new CLIError('usage', `无效或重复参数：${rest[i]}`, 2);
    if (key === 'force') options[key] = true;
    else {
      const value = rest[++i];
      if (!value?.trim() || value.startsWith('--')) throw new CLIError('usage', `--${key}缺少值。`, 2);
      options[key] = value;
    }
  }
  const need = (key: string) => {
    if (typeof options[key] !== 'string') throw new CLIError('usage', `需要 --${key}。`, 2);
    return options[key] as string;
  };
  const numberOption = (key: string, fallback: number, minimum: number, maximum: number) => {
    if(options[key]===undefined)return fallback;
    const text=String(options[key]),value=Number(text);
    if(!/^\d+$/.test(text)||!Number.isSafeInteger(value)||value<minimum||value>maximum)throw new CLIError('usage', `--${key}需要${minimum}–${maximum}之间的整数。`, 2);
    return value;
  };
  if (options.force && !options.out) throw new CLIError('usage', '--force需要--out。', 2);
  if (options.out === '-') throw new CLIError('usage', '--out需要真实路径。', 2);
  let result: unknown, raw: string | undefined;
  if (command === 'active') {
    const selected=options.select?await createLock(root,await loadCatalog(root),String(options.select).split(',')):JSON.parse(await readFile(await localPath(root,'skills/default.lock.json'),'utf8'));
    const lock = await verifyProjectEntries(root,selected);
    const entries = new Map((await loadProjectEntries(root)).map(e => [e.id, e]));
    result = { valid: true, scope: 'project-entry', digest: lock.digest, skills: lock.skills.map(s => ({ ref: ref(s.record), group: entries.get(s.record.id)!.group, entry: `${entries.get(s.record.id)!.directory}/SKILL.md` })) };
  } else if (command === 'diff') {
    result = compareLocks(JSON.parse(await readFile(need('from'), 'utf8')), JSON.parse(await readFile(need('to'), 'utf8')));
  } else if (command === 'verify' && options.bundle) {
    if (options.lock) throw new CLIError('usage', '--lock与--bundle只能选一个。', 2);
    const lock = await verifyBundle(need('bundle')); result = { valid: true, digest: lock.digest, skills: lock.skills.map(s => ref(s.record)) };
  } else {
    const catalog = await loadCatalog(root);
    switch (command) {
      case 'find': case 'entries': case 'list': {
        if (options.axis && !(axes as readonly string[]).includes(String(options.axis))) throw new CLIError('usage', '未知属性轴。', 2);
        if (options.group && !(entryGroups as readonly string[]).includes(String(options.group))) throw new CLIError('usage', '未知入口分类。', 2);
        const entries = command !== 'list' ? await loadProjectEntries(root, catalog) : null;
        const candidates = entries ? entries.map(e => ({ ...catalog.skills.find(s => ref(s) === ref(e))!, group: e.group, entry: `${e.directory}/SKILL.md` })) : catalog.skills;
        const words = [...new Set(String(options.query ?? '').toLowerCase().split(/\s+/).filter(Boolean))];
        const filtered = candidates.filter(s => {
          const tags = options.axis ? s.facets[options.axis as typeof axes[number]] : Object.values(s.facets).flat();
          return (!options.group || ('group' in s && s.group === options.group)) && (!options.axis || Boolean(tags?.length)) && (!options.tag || Boolean(tags?.includes(String(options.tag))));
        });
        if(command==='find'){
          const limit=numberOption('limit',8,1,50),offset=numberOption('offset',0,0,Number.MAX_SAFE_INTEGER);
          const scored = filtered.map(skill => {
            const haystack = [skill.id, skill.description, ...Object.keys(skill.facets), ...Object.values(skill.facets).flat(), ...(skill.provenance.authors?.map(author => author.name) ?? [])].join(' ').toLowerCase();
            return { skill, matchedTerms: words.filter(word => haystack.includes(word)) };
          });
          const best = scored.reduce((count, match) => Math.max(count, match.matchedTerms.length), 0);
          const matches = words.length && !best ? [] : scored.filter(match => match.matchedTerms.length === best);
          const partial = best > 0 && best < words.length;
          result={total:matches.length,offset,limit,hasMore:offset+limit<matches.length,items:matches.slice(offset,offset+limit).map(({skill:s,matchedTerms})=>({ref:ref(s),entry:'entry' in s?s.entry:undefined,group:'group' in s?s.group:undefined,description:s.description,facets:s.facets,authors:s.provenance.authors??[],license:s.provenance.license?.spdx??null,sources:s.provenance.sources,...(partial?{matchedTerms}:{})})),...(partial?{match:'partial'}:{})};
        }else result=filtered;
        break;
      }
      case 'show': case 'read': {
        const s = resolve(catalog, [need('id')]).find(s => ref(s) === options.id)!;
        const lock = await createLock(root, catalog, [ref(s)]);
        if (command === 'show') result = lock.skills.find(item => ref(item.record) === ref(s));
        else {
          const name = options.file ? String(options.file) : 'SKILL.md';
          const resource = lock.skills.find(item => ref(item.record) === ref(s))!.resources.find(f => f.path === name);
          if (!resource) throw new CLIError('resource_missing', '该资源不属于所选Skill。', 1);
          const bytes = await readFile(await localPath(root, `${s.directory}/${name}`));
          if (sha256(bytes) !== resource.sha256) throw new CLIError('skill_drift', '读取期间资源发生变化。', 1);
          raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          let range: {startLine:number;endLine:number;totalLines:number}|undefined;
          if(options['start-line']!==undefined||options.lines!==undefined){
            const rows=raw.split('\n');if(raw.endsWith('\n'))rows.pop();
            const start=numberOption('start-line',1,1,Number.MAX_SAFE_INTEGER),count=numberOption('lines',120,1,500);
            if(start>rows.length)throw new CLIError('usage','起始行超出资源行数。',2);
            const end=Math.min(rows.length,start-1+count);raw=rows.slice(start-1,end).join('\n');
            range={startLine:start,endLine:end,totalLines:rows.length};
          }
          result = { skill: ref(s), digest: lock.digest, resource, ...(range?{range}:{}), content: raw };
        } break;
      }
      case 'check': {
        const checked = [];
        for (const s of catalog.skills) {
          const lock = await createLock(root, catalog, [ref(s)]);
          checked.push({ skill: ref(s), digest: lock.skills.find(item => ref(item.record) === ref(s))!.digest });
        }
        const entries = await loadProjectEntries(root, catalog);
        for (const entry of entries) await verifyProjectEntries(root, await createLock(root, catalog, [ref(entry)]));
        result = { valid: true, scope: 'catalog-dependencies-resources-project-entries', checked, entries }; break;
      }
      case 'lock': result = await createLock(root, catalog, need('select').split(',')); break;
      case 'bundle': {
        const lock = JSON.parse(await readFile(need('lock'), 'utf8'));
        console.log(JSON.stringify(await createBundle(root, lock, need('out')), null, 2)); return;
      }
      case 'verify': {
        const lock = await verifyLock(root, JSON.parse(await readFile(need('lock'), 'utf8')));
        result = { valid: true, digest: lock.digest, skills: lock.skills.map(s => ref(s.record)) }; break;
      }
    }
  }
  if (options.out) console.log(JSON.stringify(await writeOutput(String(options.out), raw ?? JSON.stringify(result, null, 2) + '\n', Boolean(options.force))));
  else console.log(JSON.stringify(result, null, 2));
}
