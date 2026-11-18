import { readFile, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBundle, localPath, relative, sha256, verifyLock, type SkillLock, SkillError } from '../../../packages/skill-library/src/index.ts';

export interface InputAsset { path: string; as: string }
export interface EvaluationTask { id: string; family: string; prompt: string; inputs: InputAsset[]; followups?: { prompt: string; inputs?: InputAsset[] }[] }
export interface EvaluationSuite { schemaVersion: 1; id: string; commonProtocol: string; iterationTasks?: string[]; tasks: EvaluationTask[] }
export interface RunConfig { model: string; settings: Record<string, unknown>; budget: { maxSeconds: number; maxTokens: number }; replicate: number; orderSeed: number }
export type Condition = 'none' | 'current' | 'candidate';
const invalid = (message: string): never => { throw new SkillError('invalid_evaluation', message); };
function obj(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Expected an object');
  return value as Record<string, any>;
}
function exact(value: Record<string, any>, keys: string[]) {
  if (Object.keys(value).some(k => !keys.includes(k))) invalid('Unknown evaluation field');
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) return invalid('Missing text'); return value; }
function identifier(value: unknown) { const s = text(value); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) invalid('Invalid task/suite/family ID'); return s; }
function assets(value: unknown): InputAsset[] {
  if (!Array.isArray(value)) return invalid('inputs must be an array');
  const output = value.map(v => {
    const a = obj(v); exact(a, ['path', 'as']); const alias = relative(text(a.as));
    if (['assignment.md', 'skill-bundle', 'service-data'].includes(alias.split('/')[0])) invalid('Reserved input alias');
    return { path: relative(text(a.path)), as: alias };
  });
  const names = output.map(a => a.as);
  if (new Set(names).size !== names.length || names.some(a => names.some(b => a !== b && b.startsWith(a + '/')))) invalid('Input aliases collide');
  return output;
}
async function read(root: string, name: string) { return readFile(await localPath(root, name)); }
export async function loadSuite(root: string): Promise<EvaluationSuite> {
  const v = obj(JSON.parse((await read(root, 'evaluations/skill-effects/suite.json')).toString('utf8')));
  exact(v, ['schemaVersion', 'id', 'commonProtocol', 'iterationTasks', 'tasks']);
  if (v.schemaVersion !== 1 || !Array.isArray(v.tasks) || !v.tasks.length) return invalid('Unsupported suite or no tasks');
  const tasks = v.tasks.map((value: unknown): EvaluationTask => {
    const t = obj(value); exact(t, ['id', 'family', 'prompt', 'inputs', 'followups']);
    const task: EvaluationTask = { id: identifier(t.id), family: identifier(t.family), prompt: relative(text(t.prompt)), inputs: assets(t.inputs) };
    if (t.followups !== undefined) {
      if (!Array.isArray(t.followups)) invalid('followups must be an array');
      task.followups = t.followups.map((value: unknown) => {
        const f = obj(value); exact(f, ['prompt', 'inputs']);
        return { prompt: relative(text(f.prompt)), ...(f.inputs === undefined ? {} : { inputs: assets(f.inputs) }) };
      });
    }
    return task;
  });
  if (new Set(tasks.map((t: EvaluationTask) => t.id)).size !== tasks.length) invalid('Duplicate task');
  const suite: EvaluationSuite = { schemaVersion: 1, id: identifier(v.id), commonProtocol: relative(text(v.commonProtocol)), tasks };
  if (v.iterationTasks !== undefined) {
    if (!Array.isArray(v.iterationTasks) || !v.iterationTasks.length) invalid('iterationTasks must be a nonempty array');
    const ids = v.iterationTasks.map(identifier);
    if (new Set(ids).size !== ids.length || ids.some((id: string) => !tasks.some(t => t.id === id))) invalid('Invalid iteration task selection');
    suite.iterationTasks = ids;
  }
  for (const t of suite.tasks) {
    for (const name of [suite.commonProtocol, t.prompt, ...t.inputs.map(a => a.path), ...(t.followups ?? []).flatMap(f => [f.prompt, ...(f.inputs ?? []).map(a => a.path)])]) await read(root, name);
  }
  return suite;
}
export function parseConfig(value: unknown): RunConfig {
  const c = obj(value); exact(c, ['model', 'settings', 'budget', 'replicate', 'orderSeed']);
  const b = obj(c.budget); exact(b, ['maxSeconds', 'maxTokens']);
  for (const v of [b.maxSeconds, b.maxTokens, c.replicate]) if (!Number.isSafeInteger(v) || v < 1) invalid('Budget and replicate must be positive integers');
  if (!Number.isSafeInteger(c.orderSeed) || c.orderSeed < 0 || c.orderSeed > 0xffffffff) invalid('orderSeed must be uint32');
  return { model: text(c.model), settings: structuredClone(obj(c.settings)), budget: { maxSeconds: b.maxSeconds, maxTokens: b.maxTokens }, replicate: c.replicate, orderSeed: c.orderSeed };
}
// Seed affects presentation order only. It does not claim control over model sampling.
function shuffle<T>(values: T[], seed: number): T[] {
  const output = [...values]; let a = seed | 0;
  for (let i = output.length - 1; i > 0; i--) {
    a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    const j = Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
export async function prepareEvaluation(root: string, options: { taskId: string; conditions: Condition[]; config: RunConfig; output: string; candidate?: unknown }) {
  const config = parseConfig(options.config), suite = await loadSuite(root), task = suite.tasks.find(t => t.id === options.taskId);
  if (!task) return invalid('Unknown task');
  if (!options.conditions.length || new Set(options.conditions).size !== options.conditions.length || options.conditions.some(c => !['none', 'current', 'candidate'].includes(c))) invalid('Select one or more distinct conditions');
  const current = await verifyLock(root, JSON.parse((await read(root, 'skills/baselines/current.lock.json')).toString('utf8')));
  let candidate: SkillLock | undefined;
  if (options.conditions.includes('candidate')) {
    if (!options.candidate) invalid('Candidate condition requires an explicit verified lock');
    candidate = await verifyLock(root, options.candidate);
    if (candidate.digest === current.digest) invalid('Candidate is identical to the frozen current Skill');
  } else if (options.candidate !== undefined) invalid('Candidate lock provided without candidate condition');
  const protocol = await read(root, suite.commonProtocol), prompt = await read(root, task.prompt);
  const inputBytes = await Promise.all(task.inputs.map(async a => ({ ...a, bytes: await read(root, a.path) })));
  const common = [{ path: 'protocol.md', sha256: sha256(protocol) }, { path: 'prompt.md', sha256: sha256(prompt) }, ...inputBytes.map(a => ({ path: a.as, sha256: sha256(a.bytes) }))];
  const output = path.resolve(options.output), parent = await realpath(path.dirname(output)), actual = path.join(parent, path.basename(output));
  const sourceRoot = await realpath(root);
  for (const name of ['skills', 'cases', 'evaluations']) if (actual === path.join(sourceRoot, name) || actual.startsWith(path.join(sourceRoot, name) + path.sep)) invalid('Run output cannot overlap source materials');
  await mkdir(output);
  try {
    const runs = [];
    for (const condition of shuffle(options.conditions, config.orderSeed)) {
      const id = randomUUID(), directory = path.join(output, 'runs', id);
      await mkdir(directory, { recursive: true });
      for (const a of inputBytes) { const filename = path.join(directory, a.as); await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, a.bytes, { flag: 'wx' }); }
      const lock = condition === 'current' ? current : condition === 'candidate' ? candidate! : null;
      let entries: { ref: string; entry: string }[] = [];
      if (lock) entries = (await createBundle(root, lock, path.join(directory, 'skill-bundle'))).skills;
      const assigned = protocol.toString('utf8') + '\n\n' + prompt.toString('utf8') + '\n\n本次可读取的Skill入口：\n' + (entries.length ? entries.map(e => `- skill-bundle/${e.entry}`).join('\n') : '无。') + '\n';
      await writeFile(path.join(directory, 'assignment.md'), assigned, { flag: 'wx' });
      runs.push({ id, condition, directory: `runs/${id}`, state: 'prepared', projectId: null, serviceURL: null, config, commonInputs: common, assignmentHash: sha256(assigned), skillLock: lock });
    }
    // Follow-up briefs stay outside initial worker packets. Operator intervention is not simulated here.
    const followups = [];
    for (const [index, f] of (task.followups ?? []).entries()) {
      const directory = path.join(output, 'operator', `step-${index + 1}`); await mkdir(directory, { recursive: true });
      const bytes = await read(root, f.prompt); await writeFile(path.join(directory, 'followup.md'), bytes, { flag: 'wx' });
      const inputs = [];
      for (const a of f.inputs ?? []) { const bytes = await read(root, a.path), name = path.join(directory, a.as); await mkdir(path.dirname(name), { recursive: true }); await writeFile(name, bytes, { flag: 'wx' }); inputs.push({ path: a.as, sha256: sha256(bytes) }); }
      followups.push({ directory: `operator/step-${index + 1}`, promptHash: sha256(bytes), inputs });
    }
    const manifest = { schemaVersion: 1, suite: suite.id, task: task.id, family: task.family, mode: runs.length === 1 ? 'single' : 'comparison', state: 'prepared', executed: false, createdAt: new Date().toISOString(), config, runs, followups, limitations: ['Preparation copies inputs; it does not launch an Agent or enforce its model/budget.', 'Filesystem and global Skill isolation must be established in the actual host.', 'No generated works, scores, actual token/cost measurements or claimed improvements.'] };
    await writeFile(path.join(output, 'run-plan.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return { directory: output, state: 'prepared', executed: false, task: task.id, runs: runs.map(r => ({ id: r.id, directory: r.directory })), conditions: options.conditions };
  } catch (error) { await rm(output, { recursive: true, force: true }); throw error; }
}
