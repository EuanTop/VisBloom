import { WorkbenchError } from '@art/contracts';

interface ConnectedRenderer {
  ack: { revision: number; buildHash: string };
  socket: { readyState: number };
}

export interface RendererReadinessOptions<T extends ConnectedRenderer> {
  getRenderer(): T | undefined;
  getRevision(): Promise<number>;
  revision: number;
  buildHash: string;
  isActive(): boolean;
  timeoutMs?: number;
  pollMs?: number;
}

/** Wait only for an already connected renderer to acknowledge this capture's snapshot. */
export async function waitForRenderer<T extends ConnectedRenderer>({
  getRenderer, getRevision, revision, buildHash, isActive, timeoutMs = 3000, pollMs = 50,
}: RendererReadinessOptions<T>): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new WorkbenchError('invalid_renderer_wait', 'Renderer wait durations must be finite and nonnegative, with a positive poll interval');
  }
  const unavailable = () => new WorkbenchError('renderer_unavailable', 'Open the current artwork and wait for rendering', 503);
  const deadline = Date.now() + timeoutMs;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const timeLimit = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(unavailable()), timeoutMs);
  });
  const connected = (): T => {
    if (!isActive()) throw new WorkbenchError('job_canceled', 'Capture job is no longer active', 409);
    const renderer = getRenderer();
    if (!renderer || renderer.socket.readyState !== 1) throw unavailable();
    return renderer;
  };

  try {
    while (true) {
      connected();
      const currentRevision = await Promise.race([getRevision(), timeLimit]);
      const renderer = connected();
      if (currentRevision !== revision) throw new WorkbenchError('revision_conflict', 'Project changed before capture', 409);
      if (Date.now() > deadline) throw unavailable();
      if (renderer.ack.revision === revision && renderer.ack.buildHash === buildHash) return renderer;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw unavailable();
      await Promise.race([
        new Promise<void>(resolve => { poll = setTimeout(resolve, Math.min(pollMs, remaining)); }),
        timeLimit,
      ]);
      clearTimeout(poll);
      poll = undefined;
    }
  } finally {
    clearTimeout(timeout);
    clearTimeout(poll);
  }
}
