import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadSuite, parseConfig, prepareEvaluation, type Condition } from './evaluation-kit.ts';
import { CLIError } from './cli-support.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const help = `VisBloom Skill evaluation — 固定材料与条件，准备独立测试包（不执行Agent）

npm run --silent visbloom -- eval list [--all]
npm run --silent visbloom -- eval check
npm run --silent visbloom -- eval prepare --task TASK_ID --config run-config.json --out NEW_DIRECTORY
  --candidate candidate.lock.json [--arms candidate]

默认只比较current,candidate，需要真实且不同于基线的candidate锁文件。
current指current.lock.json中的冻结参考，不自动跟随项目active入口；candidate使用显式传入的锁。
list默认显示本轮两题；--all查看备用题。每次prepare只准备指定一题，不自动运行整套。
小幅修订复测可显式--arms candidate，只准备一个候选，不重复生成已保留的旧版作品；记录为single，不冒称新一轮成对比较。
config: {model:"实际模型ID",settings:{},budget:{maxSeconds:1800,maxTokens:30000},replicate:1,orderSeed:42}
config记录计划，不证明实际模型身份或预算执行。迭代先各做一次，有必要再复测。
固定共同输入hash和Skill资源，打乱条件顺序；后续brief留在operator目录，不进入初始题包。
准备包不创建作品、不连接现有项目、不加载全局Skill、不生成分数；执行前仍需设置宿主隔离与独立服务。
输出目录必须不存在；详细评审方案见 docs/SKILL_EVALUATION.md。`;
export async function runEvaluation(argv: string[]) {
  if (!argv.length || argv.includes('--help') || argv[0] === 'help') { console.log(help); return; }
  const [command, ...rest] = argv;
  if (!['list', 'check', 'prepare'].includes(command)) throw new CLIError('usage', '未知评测命令。', 2);
  const showAll = command === 'list' && rest.length === 1 && rest[0] === '--all';
  if (showAll) rest.length = 0;
  const options: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i].slice(2), value = rest[i + 1];
    if (command !== 'prepare' || !rest[i].startsWith('--') || !['task', 'config', 'out', 'arms', 'candidate'].includes(key) || options[key] !== undefined || !value?.trim() || value.startsWith('--')) throw new CLIError('usage', '无效评测参数。', 2);
    options[key] = value;
  }
  const suite = await loadSuite(root);
  if (command !== 'prepare') {
    const tasks = command === 'list' && !showAll && suite.iterationTasks ? suite.tasks.filter(t => suite.iterationTasks!.includes(t.id)) : suite.tasks;
    console.log(JSON.stringify({ valid: true, suite: suite.id, iterationTasks: suite.iterationTasks ?? [], tasks: tasks.map(t => ({ id: t.id, family: t.family, inputs: t.inputs.length, stages: 1 + (t.followups?.length ?? 0) })) }, null, 2)); return;
  }
  if (!options.task || !options.config || !options.out) throw new CLIError('usage', 'prepare需要--task、--config、--out。', 2);
  const result = await prepareEvaluation(root, { taskId: options.task, conditions: (options.arms ?? 'current,candidate').split(',') as Condition[], config: parseConfig(JSON.parse(await readFile(options.config, 'utf8'))), output: options.out, ...(options.candidate ? { candidate: JSON.parse(await readFile(options.candidate, 'utf8')) } : {}) });
  console.log(JSON.stringify(result, null, 2));
}
