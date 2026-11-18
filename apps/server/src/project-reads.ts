import { WorkbenchError, type ProjectEvent, type RepositoryPlugin, type RenderAck } from '@art/contracts';

/** Large object catalogs belong to explicit full context, not the default overview. */
export function summarizeRenderer(ack:RenderAck|undefined) {
  if(!ack)return null;
  const d=ack.diagnostics;
  return {revision:ack.revision,buildHash:ack.buildHash,frameTime:ack.frameTime,objectCount:ack.objects.length,timeline:ack.timeline,diagnostics:d&&{width:d.width,height:d.height,pixelWidth:d.pixelWidth,pixelHeight:d.pixelHeight}};
}

function pagination(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const candidate = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(candidate) || (candidate as number) < minimum || (candidate as number) > maximum) {
    throw new WorkbenchError('invalid_pagination', `Expected an integer from ${minimum} to ${maximum}`);
  }
  return candidate as number;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Keep changed state values, rather than merely saying that a parameter changed. */
function difference(before: unknown, after: unknown): { before: unknown; after: unknown } | undefined {
  if (Object.is(before, after)) return undefined;
  if (record(before) && record(after)) {
    const previous: Record<string, unknown> = {}, next: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const changed = difference(before[key], after[key]);
      if (changed) { previous[key] = changed.before; next[key] = changed.after; }
    }
    return Object.keys(previous).length ? { before: previous, after: next } : undefined;
  }
  if (Array.isArray(before) && Array.isArray(after) && JSON.stringify(before) === JSON.stringify(after)) return undefined;
  return { before: before === undefined ? null : before, after: after === undefined ? null : after };
}

const stateKeys = ['parameters', 'mapping', 'seed', 'time', 'paused', 'camera'];
function statePart(value: Record<string, unknown>) {
  return Object.fromEntries(stateKeys.filter(key => key in value).map(key => [key, value[key]]));
}

/** Older events may contain notes, source text or snapshots. Never echo those bodies. */
function compactValue(value: unknown, key = ''): unknown {
  if (key === 'profile') return undefined;
  if (key === 'notes' && typeof value === 'string') return { characters: value.length };
  if ((key === 'content' || key === 'source') && typeof value === 'string') return { bytes: new TextEncoder().encode(value).length };
  if (key === 'rows' && Array.isArray(value)) return { rowCount: value.length };
  if ((key === 'project' || key === 'snapshot') && record(value)) {
    return Object.fromEntries(['id', 'revision', 'codeHash'].filter(field => field in value).map(field => [field, value[field]]));
  }
  if (Array.isArray(value)) return value.map(item => compactValue(item));
  if (record(value)) return Object.fromEntries(Object.entries(value).flatMap(([field, item]) => {
    const compact = compactValue(item, field);
    return compact === undefined ? [] : [[field, compact]];
  }));
  return value;
}

function compactEvent(event: ProjectEvent): ProjectEvent {
  let detail: unknown;
  if (event.type === 'state.changed' && record(event.detail) && record(event.detail.before) && record(event.detail.after)) {
    detail = difference(statePart(event.detail.before), statePart(event.detail.after)) ?? { before: {}, after: {} };
  } else if (event.type === 'notes.changed') {
    const data = record(event.detail) ? event.detail : {};
    detail = {
      ...(typeof event.detail === 'string' ? { characters: event.detail.length } : {}),
      ...(typeof data.notes === 'string' ? { characters: data.notes.length } : {}),
      ...(typeof data.before === 'string' ? { before: { characters: data.before.length } } : {}),
      ...(typeof data.after === 'string' ? { after: { characters: data.after.length } } : {}),
    };
  } else {
    detail = compactValue(event.detail);
  }
  return { cursor: event.cursor, projectId: event.projectId, revision: event.revision, type: event.type, actor: event.actor, at: event.at, detail };
}

export async function readOverview(repository: RepositoryPlugin, id: string, options: { after?: number; limit?: number } = {}) {
  const limit = pagination(options.limit, 20, 1, 100);
  const after = options.after === undefined ? undefined : pagination(options.after, 0, 0, Number.MAX_SAFE_INTEGER);
  const project = await repository.get(id);
  const [history, checkpoints] = await Promise.all([repository.events(id, after ?? 0), repository.checkpoints(id)]);
  const ordered = [...history].sort((a, b) => a.cursor - b.cursor);
  const events = after === undefined ? ordered.slice(-limit) : ordered.slice(0, limit);
  const { dataset, result } = project;
  return structuredClone({
    project: {
      id: project.id, name: project.name, revision: project.revision, updatedAt: project.updatedAt,
      preset: project.preset, renderer: project.renderer, state: project.state.runtime?{...project.state,runtime:{kind:project.state.runtime.kind,version:project.state.runtime.version,characters:project.state.runtime.data.length}}:project.state, schema: project.schema, bindings:project.bindings, codeHash: project.codeHash,
      files: project.files.map(file => ({ path: file.path, hash: file.hash, bytes: new TextEncoder().encode(file.content).length })),
      dataset: dataset && { id: dataset.id, name: dataset.name, format: dataset.format, hash: dataset.hash, bytes: dataset.bytes, schema: dataset.schema },
      result: result && { id: result.id, datasetId: result.datasetId, sql: result.sql, columns: result.columns, rowCount: result.rowCount, truncated: result.truncated, createdAt: result.createdAt, sample: result.rows.slice(0, 5) },
      notes: { characters: project.notes.length, preview: project.notes.slice(0, 400) },
    },
    events: events.map(compactEvent),
    checkpoints: checkpoints.map(checkpoint => ({ id: checkpoint.id, projectId: checkpoint.projectId, label: checkpoint.label, revision: checkpoint.revision, createdAt: checkpoint.createdAt })),
    eventCursor: events.at(-1)?.cursor ?? after ?? 0,
    hasMoreEvents: after !== undefined && ordered.length > events.length,
    earlierEventsOmitted: after === undefined ? Math.max(0, ordered.length - events.length) : 0,
  });
}

export async function readProjectFile(repository: RepositoryPlugin, id: string, path: string) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || path.includes(':') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new WorkbenchError('invalid_path', 'Provide an exact relative project file path');
  }
  const project = await repository.get(id);
  const file = project.files.find(file => file.path === path);
  if (!file) throw new WorkbenchError('file_missing', 'Project source file not found', 404);
  return { projectId: project.id, revision: project.revision, file: { path: file.path, hash: file.hash, content: file.content } };
}

export async function readProjectNotes(repository: RepositoryPlugin, id: string) {
  const project = await repository.get(id);
  return { projectId: project.id, revision: project.revision, notes: project.notes };
}

export async function readProjectResult(repository: RepositoryPlugin, id: string, options: { offset?: number; limit?: number } = {}) {
  const offset = pagination(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = pagination(options.limit, 20, 1, 10_000);
  const project = await repository.get(id);
  const result = project.result;
  if (!result) throw new WorkbenchError('result_missing', 'Project has no stored query result', 404);
  const rows = result.rows.slice(offset, offset + limit);
  return structuredClone({
    projectId: project.id, revision: project.revision, resultId: result.id, datasetId: result.datasetId,
    sql: result.sql, columns: result.columns, rows, rowCount: result.rowCount, truncated: result.truncated,
    totalRows: result.rows.length, offset, hasMore: offset + rows.length < result.rows.length,
  });
}
