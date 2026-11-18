const SETTLE_WINDOW_MS = 6000;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);

/** Repair fragment navigation while lazy sections and fonts change the page layout. */
export function watchPortalAnchor(win: Window, doc: Document): () => void {
  let stopSettling = () => {};

  function start(initial: boolean) {
    stopSettling();
    let id: string;
    try { id = decodeURIComponent(win.location.hash.slice(1)); }
    catch { return; }
    if (!id) return;

    let active = true, frame: number | undefined;
    let target: HTMLElement | null = null;
    let previous: { target: HTMLElement; top: number; padding: string; margin: string } | undefined;
    // Hash changes already invoke native navigation. Only repair later layout shifts.
    let needsInitialScroll = initial || !doc.getElementById(id);
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);

    function settle() {
      frame = undefined;
      if (!active) return;
      const next = doc.getElementById(id);
      if (!next) { previous = undefined; needsInitialScroll = true; return; }
      if (next !== target) {
        if (target) resize.unobserve(target);
        target = next;
        resize.observe(target);
      }
      const position = {
        target: next,
        top: next.getBoundingClientRect().top + win.scrollY,
        padding: win.getComputedStyle(doc.documentElement).scrollPaddingTop,
        margin: win.getComputedStyle(next).scrollMarginTop,
      };
      if (needsInitialScroll || (previous && (previous.target !== next || Math.abs(previous.top - position.top) > 0.5 || previous.padding !== position.padding || previous.margin !== position.margin))) {
        // Native alignment honors scroll-padding and scroll-margin, including mobile offsets.
        // Corrections are instantaneous so reduced-motion users never receive an animation.
        next.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
      previous = position;
      needsInitialScroll = false;
    }
    function schedule() {
      if (active && frame === undefined) frame = win.requestAnimationFrame(settle);
    }
    function onWheel(event: WheelEvent) {
      if (event.deltaX || event.deltaY) stop();
    }
    function onKey(event: KeyboardEvent) {
      const element = event.target as HTMLElement | null;
      if (event.defaultPrevented || element?.isContentEditable || element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (SCROLL_KEYS.has(event.key)) stop();
    }
    function stop() {
      if (!active) return;
      active = false;
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      win.clearTimeout(deadline);
      resize.disconnect();
      mutations.disconnect();
      win.removeEventListener('resize', schedule);
      win.removeEventListener('wheel', onWheel, true);
      win.removeEventListener('touchstart', stop, true);
      win.removeEventListener('pointerdown', stop, true);
      win.removeEventListener('keydown', onKey);
      doc.removeEventListener('load', schedule, true);
    }
    const deadline = win.setTimeout(stop, SETTLE_WINDOW_MS);
    stopSettling = stop;
    resize.observe(doc.documentElement);
    if (doc.body) resize.observe(doc.body);
    mutations.observe(doc.documentElement, { childList: true, subtree: true });
    win.addEventListener('resize', schedule);
    win.addEventListener('wheel', onWheel, { capture: true, passive: true });
    win.addEventListener('touchstart', stop, { capture: true, passive: true });
    win.addEventListener('pointerdown', stop, { capture: true, passive: true });
    win.addEventListener('keydown', onKey);
    doc.addEventListener('load', schedule, true);
    // The promise cannot be unsubscribed, but the active guard prevents post-cleanup work.
    void doc.fonts?.ready.then(schedule);
    schedule();
  }

  const onHashChange = () => start(false);
  win.addEventListener('hashchange', onHashChange);
  start(true);
  return () => {
    stopSettling();
    win.removeEventListener('hashchange', onHashChange);
  };
}
