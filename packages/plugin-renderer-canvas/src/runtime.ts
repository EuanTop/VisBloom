import type { CaptureRequest, Mapping, Project, RenderSnapshot, Value, PlaybackInfo } from '@art/contracts';

export interface CanvasArtworkContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  parameters: Record<string, Value>;
  data: Record<string, unknown>[];
  mapping: Mapping;
  seed: number;
  time: number;
  selectedId: string | null;
}
export interface CanvasArtwork {
  draw(context: CanvasArtworkContext): void;
  /** Update the logical viewport without remounting playback or other resources. */
  resize?(context: CanvasArtworkContext): void;
  timeline?(context: CanvasArtworkContext): PlaybackInfo;
  objects?: { id: string; label: string }[];
  hitTest?(x: number, y: number): string | undefined;
  dispose?(): void;
}
export type CanvasArtworkFactory = (context: CanvasArtworkContext) => CanvasArtwork;

/** Runs a normal Canvas2D artwork in the isolated preview or a standalone export. */
export function boot(createArtwork: CanvasArtworkFactory) {
  const standalone = Boolean((window as any).__ART_BOOT__) || window.parent === window;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('浏览器无法创建 Canvas2D 画布');
  const context2d = ctx;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation';
  document.documentElement.style.cssText = 'width:100%;height:100%;overflow:hidden';
  document.body.style.cssText = 'margin:0;width:100%;height:100%;overflow:hidden;background:#fbfaf6';
  document.body.append(canvas);

  let width = Math.max(1, Math.round(window.innerWidth));
  let height = Math.max(1, Math.round(window.innerHeight));
  let pixelRatio = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);
  let project: Project | undefined;
  let authoritative: RenderSnapshot | undefined;
  let artwork: CanvasArtwork | undefined;
  let artworkKey = '';
  let buildHash = '';
  let codeHash = '';
  let time = 0;
  let selectedId: string | null = null;
  let capturing = false;
  let failed = false;
  let disposed = false;
  let frameId = 0;
  let lastFrame = performance.now();
  let lastClockSent=-Infinity, ended=false;
  let standaloneError: HTMLPreElement | undefined;

  function send(type: string, data: Record<string, unknown> = {}) {
    if (!standalone) window.parent.postMessage({ channel: 'art-runtime-v1', type, ...data }, '*');
    else if (type === 'applied') document.documentElement.dataset.visbloomRender = 'ready';
    else if (type === 'error') document.documentElement.dataset.visbloomRender = 'error';
  }
  function report(error: unknown, requestId?: string) {
    const message = error instanceof Error ? error.message : String(error);
    send('error', { message, ...(requestId ? { requestId } : {}) });
    if (standalone) {
      standaloneError ??= document.createElement('pre');
      standaloneError.setAttribute('role', 'alert');
      standaloneError.style.cssText = 'position:fixed;inset:16px 16px auto;margin:0;padding:12px;background:#fff5ee;color:#83482f;border:1px solid #dec4af;border-radius:6px;white-space:pre-wrap;font:12px/1.6 monospace';
      standaloneError.textContent = message;
      if (!standaloneError.isConnected) document.body.append(standaloneError);
    }
  }
  function sizeCanvas(w: number, h: number, ratio: number): boolean {
    const changed = width !== w || height !== h || pixelRatio !== ratio || canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio);
    width = w; height = h; pixelRatio = ratio;
    if (changed) { canvas.width = Math.max(1, Math.round(w * ratio)); canvas.height = Math.max(1, Math.round(h * ratio)); }
    context2d.setTransform(ratio, 0, 0, ratio, 0, 0);
    return changed;
  }
  function resizeViewport(): boolean {
    return sizeCanvas(Math.max(1, Math.round(window.innerWidth)), Math.max(1, Math.round(window.innerHeight)), Math.min(Math.max(1, window.devicePixelRatio || 1), 2));
  }
  function viewportNeedsResize(): boolean {
    const w = Math.max(1, Math.round(window.innerWidth));
    const h = Math.max(1, Math.round(window.innerHeight));
    const ratio = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);
    return w !== width || h !== height || ratio !== pixelRatio || canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio);
  }
  function context(): CanvasArtworkContext {
    if (!project) throw new Error('作品尚未收到项目状态');
    return { canvas, ctx: context2d, width, height, parameters: project.state.parameters, data: project.result?.rows ?? [], mapping: project.state.mapping, seed: project.state.seed, time, selectedId };
  }
  function timeline():PlaybackInfo {
    return artwork?.timeline?.(context())??{enabled:false,label:'动画',duration:30,reason:'当前作品没有时间动画',usesSeed:false};
  }
  function clock(finished=false){
    lastClockSent=performance.now();
    if(project)send('clock',{clock:{revision:project.revision,buildHash,time,ended:finished}});
  }
  function create() {
    context2d.save();
    let next: CanvasArtwork;
    try { next = createArtwork(context()); }
    finally { context2d.restore(); }
    if (!next || typeof next.draw !== 'function') throw new Error('Canvas2D 的 createArtwork 必须返回 { draw(context) }');
    return next;
  }
  function rebuild() {
    const previous = artwork;
    artwork = create();
    previous?.dispose?.();
    if (selectedId && artwork.objects && !artwork.objects.some(object => object.id === selectedId)) selectedId = null;
  }
  function resizeArtwork() {
    if (artwork?.resize) artwork.resize(context());
    else rebuild();
  }
  function draw(at: number) {
    if (!project || !artwork) return;
    const resized = !capturing && resizeViewport();
    time = at;
    // An initially hidden iframe can be only one pixel wide. Recreate any cached
    // artwork layout when its real logical viewport arrives, including while paused.
    if (resized) resizeArtwork();
    context2d.save();
    try {
      context2d.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context2d.clearRect(0, 0, width, height);
      context2d.fillStyle = '#fbfaf6';
      context2d.fillRect(0, 0, width, height);
      artwork.draw(context());
    } finally { context2d.restore(); }
  }
  function validateSnapshot(snapshot: RenderSnapshot, draft: boolean) {
    if (!snapshot?.project?.state || typeof snapshot.project.codeHash !== 'string' || !snapshot.project.codeHash || typeof snapshot.buildHash !== 'string' || !snapshot.buildHash || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || snapshot.revision !== snapshot.project.revision || !Number.isFinite(snapshot.time) || snapshot.time < 0) throw new Error('无效的作品状态或版本');
    if (codeHash && snapshot.project.codeHash !== codeHash) throw new Error('作品代码版本与运行画布不一致');
    if (buildHash && snapshot.buildHash !== buildHash) throw new Error('作品构建版本与运行画布不一致');
    if (authoritative && (snapshot.project.id !== authoritative.project.id || snapshot.revision < authoritative.revision || (draft && snapshot.revision !== authoritative.revision))) throw new Error('画布收到过期的项目状态，请重新读取当前版本');
  }
  function apply(snapshot: RenderSnapshot, draft = false) {
    validateSnapshot(snapshot, draft);
    const viewportChanged = resizeViewport();
    project = snapshot.project; buildHash = snapshot.buildHash; codeHash = project.codeHash; time = snapshot.time;
    ended=false;
    const nextKey = JSON.stringify([project.result?.id, project.state.seed, project.state.mapping]);
    if (!artwork || artworkKey !== nextKey) { rebuild(); artworkKey = nextKey; }
    else if (viewportChanged) resizeArtwork();
    draw(time);
    if (!draft) authoritative = structuredClone(snapshot);
    failed = false;
    lastFrame = performance.now();
    standaloneError?.remove();
    if (!draft) {send('applied', { ack: { revision: project.revision, buildHash, frameTime: time, objects: artwork?.objects?.map(({ id, label }) => ({ id, label })) ?? [], timeline:timeline(), diagnostics: { width, height, pixelWidth: canvas.width, pixelHeight: canvas.height, renderer: 'canvas2d' } } });clock();}
  }
  function capture(request: CaptureRequest): string {
    if (!authoritative || failed || request.revision !== authoritative.revision || request.buildHash !== authoritative.buildHash) throw new Error('截图要求的作品版本已不在当前画布中');
    if (![request.width, request.height].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 4096) || !Number.isFinite(request.time) || request.time < 0 || request.time > 3600) throw new Error('截图尺寸或时间无效');
    const previous = { project, artwork, time, width, height, pixelRatio };
    let temporary: CanvasArtwork | undefined;
    capturing = true;
    try {
      project = structuredClone(authoritative.project);
      time = request.time;
      sizeCanvas(request.width, request.height, 1);
      artwork = temporary = create();
      draw(request.time);
      // The PNG is the actual 2D canvas, including all text and legends drawn by
      // the artwork. There is no DOM screenshot or separate approximate renderer.
      return canvas.toDataURL('image/png');
    } finally {
      try { temporary?.dispose?.(); }
      finally {
        project = previous.project; artwork = previous.artwork; time = previous.time;
        try {
          sizeCanvas(previous.width, previous.height, previous.pixelRatio);
          if (project) draw(previous.time);
        } finally {
          capturing = false;
          lastFrame = performance.now();
        }
      }
    }
  }
  function select(id: unknown, notify = false) {
    if (!artwork || !project) return;
    if (id !== null && typeof id !== 'string') throw new Error('无效的画面对象');
    if (typeof id === 'string' && artwork.objects && !artwork.objects.some(object => object.id === id)) throw new Error(`画面中没有对象：${id}`);
    selectedId = id as string | null;
    draw(time);
    if (notify) send('selected', { id: selectedId });
  }
  function receive(event: MessageEvent) {
    if (event.source !== window.parent || event.data?.channel !== 'art-host-v1' || disposed) return;
    const message = event.data;
    try {
      if (message.type === 'apply') apply(message.snapshot, Boolean(message.draft));
      if (message.type === 'capture') { const png = capture(message.request); send('capture', { id: message.request.id, png, revision: message.request.revision, buildHash: message.request.buildHash }); }
      if (message.type === 'select') select(message.id ?? null);
      if (message.type === 'dispose') dispose();
    } catch (error) { if (message.type !== 'capture') failed = true; report(error, message.request?.id); }
  }
  function click(event: MouseEvent) {
    if (!artwork?.hitTest || failed) return;
    try {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const id = artwork.hitTest((event.clientX - rect.left) * width / rect.width, (event.clientY - rect.top) * height / rect.height);
      select(id ?? null, true);
    } catch (error) { report(error); }
  }
  function resized() {
    if (!project || !artwork || disposed || capturing) return;
    try { draw(time); }
    catch (error) { failed = true; report(error); }
  }
  function frame(now: number) {
    if (disposed) return;
    const delta = Math.max(0, Math.min((now - lastFrame) / 1000, 0.1)); lastFrame = now;
    // A paused artwork only needs a cheap viewport check. This also catches a
    // hidden one-pixel iframe becoming visible when no resize event is delivered.
    if (project && artwork && !capturing && !failed && ((!project.state.paused && !ended && timeline().enabled) || viewportNeedsResize())) {
      try {
        const info=timeline(),playing=!project.state.paused&&!ended&&info.enabled;
        draw(playing?Math.min(info.duration,time+delta):time);
        if(playing&&time>=info.duration){ended=true;clock(true);}
        else if(playing&&now-lastClockSent>=200)clock();
      }
      catch (error) { failed = true; report(error); }
    }
    frameId = requestAnimationFrame(frame);
  }
  function globalError(event: ErrorEvent) { failed = true; report(event.message); }
  function rejection(event: PromiseRejectionEvent) { failed = true; report(event.reason); }
  function dispose() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frameId);
    window.removeEventListener('message', receive); window.removeEventListener('resize', resized);
    window.removeEventListener('error', globalError); window.removeEventListener('unhandledrejection', rejection);
    window.removeEventListener('pagehide', dispose); canvas.removeEventListener('click', click);
    artwork?.dispose?.(); canvas.remove(); standaloneError?.remove();
  }

  resizeViewport();
  window.addEventListener('message', receive); window.addEventListener('resize', resized);
  window.addEventListener('error', globalError); window.addEventListener('unhandledrejection', rejection);
  window.addEventListener('pagehide', dispose); canvas.addEventListener('click', click);
  frameId = requestAnimationFrame(frame);
  const initial = (window as Window & { __ART_BOOT__?: RenderSnapshot }).__ART_BOOT__;
  if (standalone && initial) {
    document.title = initial.project.name;
    try { apply(initial); } catch (error) { failed = true; report(error); }
  } else send('ready');
}
