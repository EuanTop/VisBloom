import { useCallback, useEffect, useRef, useState } from 'react';
import Lenis, { type VirtualScrollData } from 'lenis';
import Snap from 'lenis/snap';
import { PORTAL_PAGES, pageAt, pageStops, snapFollowsInput, type PageLayout } from './portal-pages';
import 'lenis/dist/lenis.css';

/** One native-scroll owner for wheel damping, chapter stops and local navigation. */
export function usePortalPages() {
  const [current, setCurrent] = useState(0);
  const [reduced, setReduced] = useState(false);
  const navigate = useRef<(index: number) => void>(() => {});
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.portalPaging = 'true';
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const engine = new Lenis({
      autoRaf: true, lerp: .095, smoothWheel: true, syncTouch: false,
      anchors: false, stopInertiaOnNavigate: true, respectReducedMotion: true,
      virtualScroll: ({ event }) => {
        if (event.ctrlKey || event.shiftKey || document.querySelector('dialog[open]')) return false;
        return !event.composedPath().some(node => node instanceof HTMLElement &&
          node.matches('input,textarea,select,[contenteditable=true],[data-lenis-prevent]'));
      },
      prevent: node => Boolean(node.closest('dialog,[data-lenis-prevent]')),
    });
    const snap = new Snap(engine, {
      type: 'proximity', distanceThreshold: '28%', debounce: 260,
      lerp: .1,
      onSnapStart: () => { html.dataset.portalSnapping = 'true'; },
      onSnapComplete: () => { delete html.dataset.portalSnapping; },
    });
    let closed = false, frame = 0, snapHeld = false, resumeTimer = 0, positions: number[] = [], snapPositions: number[] = [], removers: (() => void)[] = [];
    const section = (id: string) => document.querySelector<HTMLElement>(`[data-portal-page="${id}"]`);
    const updateCurrent = () => { if (!closed) setCurrent(pageAt(window.scrollY, positions, innerHeight)); };
    const measure = () => {
      frame = 0;
      if (closed) return;
      const layout = {} as PageLayout;
      for (const id of ['intro', 'platform', 'data', 'delivery', 'start'] as const) {
        const element = section(id); if (!element) return;
        const rect = element.getBoundingClientRect(); layout[id] = { top: rect.top + window.scrollY, height: rect.height };
      }
      engine.resize();
      const measured = pageStops(layout, innerHeight, engine.limit, preference.matches);
      setReduced(preference.matches);
      positions = measured.pages;
      snapPositions = measured.snaps;
      removers.forEach(remove => remove());
      removers = measured.snaps.map(value => snap.add(value));
      updateCurrent();
    };
    const scheduleMeasure = () => { if (!closed && !frame) frame = requestAnimationFrame(measure); };
    const syncMode = () => {
      const modal = Boolean(document.querySelector('dialog[open]'));
      if (modal) engine.stop(); else engine.start();
      if (modal || preference.matches || snapHeld) snap.stop(); else snap.start();
    };
    // Let queued wheel callbacks drain before a link, key or history navigation.
    const holdSnap = (milliseconds: number) => {
      snapHeld = true; snap.stop(); delete html.dataset.portalSnapping; clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => { snapHeld = false; if (!closed) syncMode(); }, milliseconds);
    };
    navigate.current = index => {
      const value = positions[index];
      if (value === undefined) return;
      holdSnap(1100);
      engine.scrollTo(value, { lerp: 0, duration: .95, easing: t => 1 - Math.pow(1 - t, 4), immediate: preference.matches, force: true });
    };
    const onAnchor = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target || link.hasAttribute('download') || link.classList.contains('skip-link')) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash) return;
      let id: string; try { id = decodeURIComponent(url.hash.slice(1)); } catch { return; }
      const target = document.getElementById(id); if (!target) return;
      event.preventDefault();
      history.pushState(null, '', url.hash);
      const page = id === 'platform' ? (preference.matches?1:2) : id === 'start-heading' ? (preference.matches?4:5) : -1;
      if (page >= 0) navigate.current(page);
      else { holdSnap(1100); engine.scrollTo(target, { offset: -96, duration: .95, lerp: 0, immediate: preference.matches, force: true }); }
    };
    const cancelMotion = () => { holdSnap(360); engine.scrollTo(engine.actualScroll, { immediate: true, force: true }); };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement | null)?.closest('input,textarea,select,[contenteditable=true],dialog')) return;
      if (['Home','End','PageDown','PageUp','ArrowDown','ArrowUp',' '].includes(event.key)) cancelMotion();
    };
    const onInput = ({ deltaY }: VirtualScrollData) => {
      delete html.dataset.portalSnapping;
      if (snapHeld) { holdSnap(360); return; }
      if (preference.matches || document.querySelector('dialog[open]')) { snap.stop(); return; }
      if (snapFollowsInput(engine.actualScroll, engine.targetScroll + deltaY, deltaY, snapPositions)) snap.start();
      else snap.stop();
    };
    const observer = new ResizeObserver(scheduleMeasure);
    const onPreference = () => { scheduleMeasure(); syncMode(); };
    for (const id of ['intro', 'platform', 'data', 'delivery', 'start']) { const element = section(id); if (element) observer.observe(element); }
    const modals = new MutationObserver(syncMode);
    modals.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
    engine.on('scroll', updateCurrent);
    engine.on('virtual-scroll', onInput);
    window.addEventListener('scroll', updateCurrent, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    preference.addEventListener('change', onPreference);
    document.addEventListener('click', onAnchor);
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', cancelMotion);
    window.addEventListener('hashchange', cancelMotion);
    void document.fonts.ready.then(scheduleMeasure);
    measure(); syncMode();
    return () => {
      closed = true; cancelAnimationFrame(frame); clearTimeout(resumeTimer); navigate.current = () => {};
      observer.disconnect(); modals.disconnect(); preference.removeEventListener('change', onPreference);
      document.removeEventListener('click', onAnchor); window.removeEventListener('scroll', updateCurrent); window.removeEventListener('resize', scheduleMeasure);
      document.removeEventListener('keydown', onKey); window.removeEventListener('popstate', cancelMotion); window.removeEventListener('hashchange', cancelMotion);
      snap.stop(); snap.destroy(); engine.destroy();
      delete html.dataset.portalPaging; delete html.dataset.portalSnapping;
    };
  }, []);
  const goTo = useCallback((index: number) => navigate.current(index), []);
  return { current, goTo, chapters: reduced ? PORTAL_PAGES.filter(page=>page.id!=='connection') : PORTAL_PAGES };
}
