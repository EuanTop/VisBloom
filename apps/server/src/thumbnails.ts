import { createHash, randomUUID } from 'node:crypto';
import type { CaptureRequest, Project, ProjectSummary, RenderAck, RepositoryPlugin, ThumbnailRecord } from '@art/contracts';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function thumbnailFingerprint(project: Project): string {
  return hash(JSON.stringify({ id: project.id, renderer: project.renderer, codeHash: project.codeHash, state: project.state, result: project.result?.id, dataset: project.dataset?.hash, bindings: project.bindings }));
}
export interface ThumbnailSession { isOpen(): boolean; send(message: unknown): void }
type Attempt = { project: Project; ack: RenderAck; session: ThumbnailSession; fingerprint: string; attempts: number; timer?: ReturnType<typeof setTimeout>; pending?: { request: CaptureRequest; createdAt: string } };

/** Captures are derived assets, deliberately separate from export jobs and artwork commits. */
export function createThumbnailCoordinator({ repository, broadcast, isBusy = () => false }: {
  repository: RepositoryPlugin; broadcast(message: unknown): void; isBusy?(projectId: string): boolean;
}) {
  const store = repository.thumbnails;
  if (!store) throw new Error('Thumbnail storage capability required');
  const states = new Map<string, Attempt>();
  let disposed = false;
  const announce = (projectId: string) => broadcast({ type: 'thumbnail.updated', projectId });
  const active = (s: Attempt) => !disposed && states.get(s.project.id) === s && s.session.isOpen();
  function schedule(s: Attempt, delay = 900) {
    clearTimeout(s.timer);
    if (!active(s) || s.attempts >= 2 || s.pending) return;
    s.timer = setTimeout(() => { void start(s).catch(() => { if (!s.pending) s.attempts++; fail(s); }); }, delay);
  }
  function fail(s: Attempt) {
    clearTimeout(s.timer); s.pending = undefined;
    if (!active(s)) return;
    if (s.attempts < 2) schedule(s, 3000);
    else announce(s.project.id);
  }
  async function start(s: Attempt) {
    if (!active(s)) return;
    if (isBusy(s.project.id) || [...states.values()].some(other => other.pending)) { schedule(s, 1000); return; }
    const current = await repository.get(s.project.id);
    if (!active(s) || current.revision !== s.project.revision || current.codeHash !== s.project.codeHash) return;
    const existing = await store!.info(current.id);
    if (!active(s) || existing?.fingerprint === s.fingerprint) return;
    if ([...states.values()].some(other => other.pending) || isBusy(current.id)) { schedule(s, 1000); return; }
    const request: CaptureRequest = { id: `thumbnail-${randomUUID()}`, revision: current.revision, buildHash: s.ack.buildHash, width: 480, height: 360, time: current.state.time };
    s.attempts++;
    s.pending = { request, createdAt: new Date().toISOString() };
    s.timer = setTimeout(() => fail(s), 15000);
    s.session.send({ type: 'thumbnail.capture', projectId: current.id, request });
  }
  return {
    async observe(project: Project, ack: RenderAck, session: ThumbnailSession) {
      if (disposed || ack.revision !== project.revision) return;
      const fingerprint = thumbnailFingerprint(project), previous = states.get(project.id);
      if (previous && previous.project.revision === project.revision && previous.ack.buildHash === ack.buildHash && previous.session === session) return;
      if (previous) clearTimeout(previous.timer);
      const state: Attempt = { project, ack, session, fingerprint, attempts: 0 };
      states.set(project.id, state);
      if ((await store!.info(project.id))?.fingerprint !== fingerprint) schedule(state);
    },
    async receive(session: ThumbnailSession, message: { type: string; id?: string; projectId?: string; revision?: number; buildHash?: string; png?: string }) {
      const state = message.projectId ? states.get(message.projectId) : undefined;
      const pending = state?.pending;
      if (!state || !pending || !active(state) || state.session !== session || pending.request.id !== message.id) return;
      if (message.type === 'render.thumbnail.error') { fail(state); return; }
      if (message.revision !== pending.request.revision || message.buildHash !== pending.request.buildHash) { fail(state); return; }
      try {
        if (typeof message.png !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(message.png) || message.png.length > 2_700_000) throw new Error('Invalid thumbnail');
        const bytes = Buffer.from(message.png.slice('data:image/png;base64,'.length), 'base64');
        if (bytes.length < 33 || bytes.length > 2_000_000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) !== pending.request.width || bytes.readUInt32BE(20) !== pending.request.height) throw new Error('Invalid thumbnail PNG dimensions');
        const current = await repository.get(state.project.id);
        if (!active(state) || state.pending !== pending) return;
        clearTimeout(state.timer); state.pending = undefined;
        if (current.revision !== pending.request.revision || thumbnailFingerprint(current) !== state.fingerprint) return;
        const record: ThumbnailRecord = { projectId: current.id, revision: current.revision, codeHash: current.codeHash, buildHash: pending.request.buildHash, fingerprint: state.fingerprint, contentHash: hash(bytes), width: pending.request.width, height: pending.request.height, time: pending.request.time, createdAt: pending.createdAt };
        if (await store!.save(record, bytes)) announce(current.id);
      } catch { fail(state); }
    },
    async summaries(): Promise<ProjectSummary[]> {
      return Promise.all((await repository.list()).map(async summary => {
        const [project, record] = await Promise.all([repository.get(summary.id), store!.info(summary.id)]);
        const state = states.get(summary.id);
        const failed = state && state.project.revision === project.revision && state.attempts >= 2 && !state.pending;
        return { ...summary, thumbnail: record ? { status: record.fingerprint === thumbnailFingerprint(project) ? 'ready' as const : 'stale' as const, url: `/api/projects/${encodeURIComponent(summary.id)}/thumbnail?hash=${record.contentHash}`, revision: record.revision } : { status: failed ? 'failed' as const : 'waiting' as const } };
      }));
    },
    forget(projectId:string) {const state=states.get(projectId);if(state)clearTimeout(state.timer);states.delete(projectId);},
    disconnect(session: ThumbnailSession) { for (const [id, state] of states) if (state.session === session) { clearTimeout(state.timer); states.delete(id); } },
    dispose() { disposed = true; for (const state of states.values()) clearTimeout(state.timer); states.clear(); },
  };
}
