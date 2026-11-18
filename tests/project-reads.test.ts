import { describe, expect, it, vi } from 'vitest';
import { WorkbenchError, type Checkpoint, type Project, type ProjectEvent, type RepositoryPlugin } from '@art/contracts';
import { readOverview, readProjectFile, readProjectNotes, readProjectResult, summarizeRenderer } from '../apps/server/src/project-reads';

it('keeps renderer status and viewport without repeating large object catalogs',()=>{
  const ack={revision:8,buildHash:'compiled-artwork',frameTime:0,objects:Array.from({length:3000},(_,id)=>({id:String(id),label:'A product name '.repeat(20)})),diagnostics:{width:726,height:636,pixelWidth:1452,pixelHeight:1272}};
  const overview=summarizeRenderer(ack);
  expect(overview).toMatchObject({revision:8,objectCount:3000,diagnostics:ack.diagnostics});
  expect(overview).not.toHaveProperty('objects');expect(JSON.stringify(overview).length).toBeLessThan(500);
  expect(ack.objects).toHaveLength(3000);expect(summarizeRenderer(undefined)).toBeNull();
});

function fixture(large = false) {
  const forbidden = vi.fn(async (): Promise<never> => { throw new Error('Read projection attempted mutation or asset access'); });
  const source = 'SOURCE_BODY_MUST_NOT_LEAK'.repeat(large ? 20_000 : 2);
  const notes = 'AUTHOR_PRIVATE_LONG_NOTES '.repeat(large ? 1000 : 5);
  const rows = Array.from({ length: large ? 10_000 : 37 }, (_, value) => ({ value, label: `ROW_${value}_` + 'data'.repeat(large ? 100 : 1) }));
  const project: Project = {
    id: 'project-a', name: 'Authored work', revision: 80, updatedAt: '2026-11-09T00:00:00Z', preset: 'skinbloom', renderer: 'renderer.canvas2d',
    state: { parameters: { speed: 1, ink: '#111111' }, mapping: { field: 'value', transform: 'linear', target: 'weight' }, seed: 3, time: 0, paused: true },
    schema: [{ id: 'speed', label: 'Speed', type: 'number', default: 1, min: 0, max: 10 }], codeHash: 'current-code-hash',
    files: [{ path: 'src/artwork.ts', content: source, hash: 'current-source-hash' }, { path: 'src/颜色.ts', content: '你好🌸', hash: 'unicode-hash' }], notes,
    dataset: { id: 'dataset-a', name: 'source.csv', format: 'csv', hash: 'dataset-hash', bytes: 12345, createdAt: 'then', schema: { fields: ['value'] }, profile: { privateHeavyProfile: source } },
    result: { id: 'result-a', datasetId: 'dataset-a', sql: 'SELECT * FROM data', columns: ['value', 'label'], rows, rowCount: 20_000, truncated: true, createdAt: 'then' },
  };
  const event = (cursor: number, type: string, detail: unknown, actor = 'workbench'): ProjectEvent => ({ cursor, projectId: project.id, revision: cursor, type, actor, detail, at: '2026-11-09T00:00:00Z' });
  const before = structuredClone(project.state), after = structuredClone(before);
  after.parameters.ink = '#a1b2c3';
  after.camera = { position: [1, 2, 3], target: [0, 0, 0] };
  const events = [
    event(2, 'state.changed', { before, after }, 'workbench'),
    event(7, 'state.changed', { before: after, after: { ...after, parameters: { ...after.parameters, speed: 2 } } }, 'agent'),
    event(13, 'files.changed', { paths: ['src/artwork.ts'], beforeHash: 'historical-before-hash' }, 'filesystem'),
    event(20, 'notes.changed', { notes }),
    event(30, 'data.queried', { sql: 'SELECT * FROM data', rows, profile: { secret: source }, snapshot: project }),
    ...Array.from({ length: 60 }, (_, index) => event(50 + index * 3, 'state.changed', { before: { ...before, time: index }, after: { ...before, time: index + 1 } }, index % 2 ? 'agent' : 'workbench')),
  ];
  const checkpoints: Checkpoint[] = Array.from({ length: large ? 40 : 1 }, (_, index) => ({ id: `checkpoint-${index}`, projectId: project.id, label: `Author checkpoint ${index}`, revision: 1 + index, createdAt: 'then', project }));
  const repository: RepositoryPlugin = {
    manifest: { id: 'fixture.read-only', kind: 'storage', version: '1', apiVersion: '1', capabilities: [] },
    get: vi.fn(async id => { if (id !== project.id) throw new WorkbenchError('project_not_found', 'Unknown project', 404); return project; }),
    events: vi.fn(async (_id, after = 0) => events.filter(event => event.cursor > after)),
    checkpoints: vi.fn(async () => checkpoints),
    create: forbidden, list: forbidden, commit: forbidden, checkpoint: forbidden, getCheckpoint: forbidden,
    putBlob: forbidden, getBlob: forbidden, syncFiles: forbidden, saveJob: forbidden, listJobs: forbidden,
    getProjectDirectory: () => { throw new Error('Filesystem access is not a read projection'); },
  };
  return { repository, project, events, checkpoints, forbidden };
}

describe('bounded read-only project projections', () => {
  it('returns compact latest history and explicit omitted counts without bodies or checkpoint snapshots', async () => {
    const { repository, project, events, checkpoints, forbidden } = fixture(true);
    const overview = await readOverview(repository, project.id);
    expect(overview.project.files).toEqual(project.files.map(file => ({ path: file.path, hash: file.hash, bytes: new TextEncoder().encode(file.content).length })));
    expect(overview.project.dataset).not.toHaveProperty('profile');
    expect(overview.project.result?.sample).toEqual(project.result!.rows.slice(0, 5));
    expect(overview.project.result).not.toHaveProperty('rows');
    expect(overview.project.notes).toEqual({ characters: project.notes.length, preview: project.notes.slice(0, 400) });
    expect(overview.checkpoints).toHaveLength(checkpoints.length);
    expect(overview.checkpoints.every(checkpoint => !('project' in checkpoint))).toBe(true);
    expect(overview.events.map(event => event.cursor)).toEqual(events.slice(-20).map(event => event.cursor));
    expect(overview.eventCursor).toBe(events.at(-1)!.cursor);
    expect(overview.hasMoreEvents).toBe(false);
    expect(overview.earlierEventsOmitted).toBe(events.length - 20);
    const text = JSON.stringify(overview);
    expect(text.length).toBeLessThan(25_000);
    expect(text).not.toContain('SOURCE_BODY_MUST_NOT_LEAK');
    expect(text).not.toContain('ROW_9999_');
    expect(text).not.toContain('privateHeavyProfile');
    expect(forbidden).not.toHaveBeenCalled();
    overview.project.state.parameters.speed = 8;
    overview.project.result!.sample[0].value = -99;
    expect(project.state.parameters.speed).toBe(1);
    expect(project.result!.rows[0].value).toBe(0);
  });

  it('paginates explicit cursors through gaps while preserving actual human and agent edits', async () => {
    const { repository, project, events, forbidden } = fixture();
    const first = await readOverview(repository, project.id, { after: 0, limit: 2 });
    expect(first.events.map(event => [event.cursor, event.actor])).toEqual([[2, 'workbench'], [7, 'agent']]);
    expect(first.events[0].detail).toEqual({ before: { parameters: { ink: '#111111' }, camera: null }, after: { parameters: { ink: '#a1b2c3' }, camera: { position: [1, 2, 3], target: [0, 0, 0] } } });
    expect(first.events[1].detail).toEqual({ before: { parameters: { speed: 1 } }, after: { parameters: { speed: 2 } } });
    expect(first.eventCursor).toBe(7);
    expect(first.hasMoreEvents).toBe(true);
    expect(first.earlierEventsOmitted).toBe(0);
    const second = await readOverview(repository, project.id, { after: first.eventCursor, limit: 2 });
    expect(second.events.map(event => event.cursor)).toEqual([13, 20]);
    expect(second.events[0].detail).toEqual({ paths: ['src/artwork.ts'], beforeHash: 'historical-before-hash' });
    expect(second.events[1].detail).toEqual({ characters: project.notes.length });
    expect(JSON.stringify(second.events)).not.toContain(project.notes);
    const data = await readOverview(repository, project.id, { after: 20, limit: 1 });
    expect(data.events[0].detail).toEqual({ sql: 'SELECT * FROM data', rows: { rowCount: project.result!.rows.length }, snapshot: { id: project.id, revision: project.revision, codeHash: project.codeHash } });
    const end = await readOverview(repository, project.id, { after: events.at(-1)!.cursor + 100, limit: 100 });
    expect(end.events).toEqual([]);
    expect(end.eventCursor).toBe(events.at(-1)!.cursor + 100);
    expect(end.hasMoreEvents).toBe(false);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('reads exact virtual files and full notes without filesystem lookup or project changes', async () => {
    const { repository, project, forbidden } = fixture();
    const original = JSON.stringify(project);
    expect(await readProjectFile(repository, project.id, 'src/artwork.ts')).toEqual({ projectId: project.id, revision: project.revision, file: project.files[0] });
    expect(await readProjectFile(repository, project.id, 'src/颜色.ts')).toEqual({ projectId: project.id, revision: project.revision, file: project.files[1] });
    expect(await readProjectNotes(repository, project.id)).toEqual({ projectId: project.id, revision: project.revision, notes: project.notes });
    for (const path of ['', '/etc/passwd', '../secret', 'src/../artwork.ts', 'src//artwork.ts', './src/artwork.ts', 'src\\artwork.ts', 'src/\0file', 'C:/secret']) {
      await expect(readProjectFile(repository, project.id, path)).rejects.toMatchObject({ code: 'invalid_path' });
    }
    await expect(readProjectFile(repository, project.id, 'src/not-in-project.ts')).rejects.toMatchObject({ code: 'file_missing', status: 404 });
    expect(JSON.stringify(project)).toBe(original);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('pages stored result rows while retaining the distinct AVA count and truncation signal', async () => {
    const { repository, project, forbidden } = fixture();
    const original = JSON.stringify(project);
    const first = await readProjectResult(repository, project.id);
    expect(first).toMatchObject({ projectId: project.id, revision: project.revision, resultId: 'result-a', datasetId: 'dataset-a', sql: 'SELECT * FROM data', columns: ['value', 'label'], totalRows: 37, rowCount: 20_000, truncated: true, offset: 0, hasMore: true });
    expect(first.rows).toEqual(project.result!.rows.slice(0, 20));
    const tail = await readProjectResult(repository, project.id, { offset: 35, limit: 10_000 });
    expect(tail.rows.map(row => row.value)).toEqual([35, 36]);
    expect(tail.hasMore).toBe(false);
    expect(tail.truncated).toBe(true);
    const beyond = await readProjectResult(repository, project.id, { offset: Number.MAX_SAFE_INTEGER, limit: 1 });
    expect(beyond.rows).toEqual([]);
    expect(beyond.hasMore).toBe(false);
    first.rows[0].value = -1;
    expect(JSON.stringify(project)).toBe(original);
    expect(forbidden).not.toHaveBeenCalled();
    delete project.result;
    await expect(readProjectResult(repository, project.id)).rejects.toMatchObject({ code: 'result_missing', status: 404 });
  });

  it('validates pagination and lets the repository reject unknown projects for every reader', async () => {
    const { repository, project } = fixture();
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, '1']) {
      await expect(readOverview(repository, project.id, { after: value as number })).rejects.toMatchObject({ code: 'invalid_pagination' });
      await expect(readProjectResult(repository, project.id, { offset: value as number })).rejects.toMatchObject({ code: 'invalid_pagination' });
    }
    for (const value of [0, -1, 1.5, 101, NaN, Infinity, null]) {
      await expect(readOverview(repository, project.id, { limit: value as number })).rejects.toMatchObject({ code: 'invalid_pagination' });
    }
    for (const value of [0, -1, 1.5, 10_001, NaN, Infinity, null]) {
      await expect(readProjectResult(repository, project.id, { limit: value as number })).rejects.toMatchObject({ code: 'invalid_pagination' });
    }
    for (const read of [() => readOverview(repository, 'missing'), () => readProjectFile(repository, 'missing', 'src/artwork.ts'), () => readProjectNotes(repository, 'missing'), () => readProjectResult(repository, 'missing')]) {
      await expect(read()).rejects.toMatchObject({ code: 'project_not_found', status: 404 });
    }
    project.result = undefined;
    const empty = fixture();
    empty.repository.events = async () => [];
    const overview = await readOverview(empty.repository, empty.project.id);
    expect(overview.events).toEqual([]);
    expect(overview.eventCursor).toBe(0);
    expect(overview.earlierEventsOmitted).toBe(0);
  });
});
