import type { CaptureRequest, PluginManifest, Project, RenderAck, RendererInstance, RendererPlugin, RenderSnapshot, Value, FrameClock } from '@art/contracts';

export const rendererManifest: PluginManifest = {
  id: 'renderer.canvas2d', kind: 'renderer', version: '0.1.0', apiVersion: '1',
  capabilities: ['canvas2d', 'parameters', 'pick', 'time', 'capture.png'],
};
export interface CanvasInstance extends RendererInstance {
  preview(parameters: Record<string, Value>): void;
  select(id: string | null): void;
}
export interface CanvasRendererOptions {
  load(project: Project): Promise<{ hash: string; html: string; codeHash: string }>;
  onError?(message: string): void;
  onSelected?(id: string | null): void;
  /** Direct controls in a DOM artwork propose edits to the host's authoritative state. */
  onParameters?(parameters: Record<string, Value>, revision: number): void;
  onClock?(clock:FrameClock):void;
  title?: string;
  label?: string;
}

/** Browser adapter for the Canvas2D runtime; it does not import a GPU renderer. */
export function createCanvasRenderer(options: CanvasRendererOptions): RendererPlugin {
  return {
    manifest: rendererManifest,
    mount(host, onAck) {
      let active: HTMLIFrameElement | undefined;
      let candidate: HTMLIFrameElement | undefined;
      let activeCode = '';
      let activeHash = '';
      let loadingCode = '';
      let latest: RenderSnapshot | undefined;
      let pending: { snapshot: RenderSnapshot; hash: string } | undefined;
      let disposed = false;
      let generation = 0;
      let bootTimer: ReturnType<typeof setTimeout> | undefined;
      const waiters = new Map<string, { request: CaptureRequest; resolve(png: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();

      function post(frame: HTMLIFrameElement, type: string, data: object = {}) {
        frame.contentWindow?.postMessage({ channel: 'art-host-v1', type, ...data }, '*');
      }
      function send(frame: HTMLIFrameElement, snapshot: RenderSnapshot, draft = false) { post(frame, 'apply', { snapshot, draft }); }
      function rejectCaptures(message: string) {
        for (const waiter of waiters.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(message)); }
        waiters.clear();
      }
      function receive(event: MessageEvent) {
        if (disposed || event.data?.channel !== 'art-runtime-v1') return;
        const fromActive = Boolean(active && event.source === active.contentWindow);
        const fromCandidate = Boolean(candidate && event.source === candidate.contentWindow);
        if (!fromActive && !fromCandidate) return;
        const message = event.data;
        if (message.type === 'parameters' && fromActive && latest && message.revision === latest.revision && message.buildHash === activeHash && activeCode === latest.project.codeHash) {
          const entries = message.parameters && typeof message.parameters === 'object' && !Array.isArray(message.parameters) ? Object.entries(message.parameters) : [];
          if (entries.length && entries.every(([key, value]) => !['__proto__', 'constructor', 'prototype'].includes(key) && (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))))) options.onParameters?.(Object.fromEntries(entries) as Record<string, Value>, message.revision);
        }
        if(message.type==='clock'&&fromActive&&latest&&message.clock?.revision===latest.revision&&message.clock?.buildHash===activeHash&&Number.isFinite(message.clock?.time))options.onClock?.(message.clock);
        if (message.type === 'ready' && fromCandidate && pending && latest && candidate && pending.snapshot.project.codeHash === latest.project.codeHash) {
          send(candidate, { ...latest, buildHash: pending.hash });
        }
        if (message.type === 'applied') {
          const ack = message.ack as RenderAck | undefined;
          if (!ack || !Number.isSafeInteger(ack.revision) || !Number.isFinite(ack.frameTime) || !Array.isArray(ack.objects)) return;
          if (fromCandidate && pending && candidate && latest && ack.buildHash === pending.hash && ack.revision === latest.revision && pending.snapshot.project.codeHash === latest.project.codeHash) {
            clearTimeout(bootTimer);
            rejectCaptures('作品代码已更新，请按新版本重新截图');
            if (active) { post(active, 'dispose'); active.remove(); }
            active = candidate; candidate = undefined;
            active.style.visibility = 'visible';
            activeCode = pending.snapshot.project.codeHash; activeHash = pending.hash;
            pending = undefined; loadingCode = '';
            onAck(ack);
            return;
          }
          if (fromActive && latest && ack.buildHash === activeHash && ack.revision === latest.revision && activeCode === latest.project.codeHash) onAck(ack);
        }
        if (message.type === 'capture' && fromActive) {
          const waiter = waiters.get(message.id);
          if (!waiter) return;
          clearTimeout(waiter.timer); waiters.delete(message.id);
          if (message.revision !== waiter.request.revision || message.buildHash !== waiter.request.buildHash || typeof message.png !== 'string' || !message.png.startsWith('data:image/png;base64,')) waiter.reject(new Error('截图回执与请求版本不一致'));
          else waiter.resolve(message.png);
        }
        if (message.type === 'selected' && fromActive && (message.id === null || typeof message.id === 'string') && (message.revision === undefined || (latest && message.revision === latest.revision && message.buildHash === activeHash && activeCode === latest.project.codeHash))) options.onSelected?.(message.id);
        if (message.type === 'error') {
          // Export failures belong to the waiting job; the live artwork remains usable.
          if (typeof message.requestId !== 'string') options.onError?.(typeof message.message === 'string' ? message.message : 'Canvas2D 作品运行失败');
          const waiter = waiters.get(message.requestId);
          if (waiter) { clearTimeout(waiter.timer); waiters.delete(message.requestId); waiter.reject(new Error(String(message.message))); }
          if (typeof message.requestId !== 'string' && fromCandidate && candidate) { clearTimeout(bootTimer); post(candidate, 'dispose'); candidate.remove(); candidate = undefined; pending = undefined; loadingCode = ''; }
        }
      }
      window.addEventListener('message', receive);
      host.style.position = 'relative';

      const instance: CanvasInstance = {
        apply(snapshot) {
          if (disposed) return;
          if (latest?.project.id === snapshot.project.id && snapshot.revision < latest.revision) return;
          latest = structuredClone(snapshot);
          if (active && activeCode === snapshot.project.codeHash) { send(active, { ...snapshot, buildHash: activeHash }); return; }
          if (loadingCode === snapshot.project.codeHash) return;
          loadingCode = snapshot.project.codeHash;
          const serial = ++generation;
          void options.load(snapshot.project).then(build => {
            if (disposed || serial !== generation || !latest) return;
            if (build.codeHash !== latest.project.codeHash || build.codeHash !== snapshot.project.codeHash) throw new Error('作品代码已变化，请等待最新构建');
            if (candidate) { post(candidate, 'dispose'); candidate.remove(); }
            candidate = document.createElement('iframe'); candidate.title = options.title ?? '二维作品画布';
            candidate.setAttribute('sandbox', 'allow-scripts'); candidate.setAttribute('allow', 'fullscreen');
            candidate.style.cssText = 'display:block;width:100%;height:100%;border:0;position:absolute;inset:0;visibility:hidden';
            pending = { snapshot, hash: build.hash };
            candidate.srcdoc = build.html; host.append(candidate);
            clearTimeout(bootTimer);
            bootTimer = setTimeout(() => {
              if (disposed || serial !== generation || !candidate) return;
              post(candidate, 'dispose'); candidate.remove(); candidate = undefined; pending = undefined; loadingCode = '';
              options.onError?.(`${options.label ?? 'Canvas2D'} 作品初始化超时，保留上一份可用画面`);
            }, 12000);
          }).catch(error => {
            if (disposed || serial !== generation) return;
            loadingCode = ''; options.onError?.(error instanceof Error ? error.message : String(error));
          });
        },
        preview(parameters) {
          if (active && latest && activeCode === latest.project.codeHash) send(active, { ...latest, buildHash: activeHash, project: { ...latest.project, state: { ...latest.project.state, parameters: { ...latest.project.state.parameters, ...parameters } } } }, true);
        },
        select(id) { if (active) post(active, 'select', { id }); },
        async capture(request) {
          if (disposed || !active || !latest || activeCode !== latest.project.codeHash || request.buildHash !== activeHash || request.revision !== latest.revision) throw new Error('Canvas2D 画布未连接或版本不匹配');
          if (waiters.has(request.id)) throw new Error('同一截图任务仍在执行');
          return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => { waiters.delete(request.id); reject(new Error(`${options.label ?? 'Canvas2D'} 截图超时`)); }, 30000);
            waiters.set(request.id, { request, resolve, reject, timer });
            post(active!, 'capture', { request });
          });
        },
        dispose() {
          if (disposed) return;
          disposed = true; generation++;
          clearTimeout(bootTimer);
          window.removeEventListener('message', receive);
          if (active) { post(active, 'dispose'); active.remove(); }
          if (candidate) { post(candidate, 'dispose'); candidate.remove(); }
          rejectCaptures('Canvas2D 画布已关闭');
          active = undefined; candidate = undefined; pending = undefined;
        },
      };
      return instance;
    },
  };
}
