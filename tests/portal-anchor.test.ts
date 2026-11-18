import { afterEach, expect, it, vi } from 'vitest';
import { watchPortalAnchor } from '../apps/workbench/src/portal/usePortalAnchor';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function harness(hash = '#works') {
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0, scrollY = 0, padding = '100px';
  let finishFonts!: () => void;
  const fonts = { ready: new Promise<void>(resolve => { finishFonts = resolve; }) };
  const events = new EventTarget(), documentEvents = new EventTarget();
  const targets = new Map<string, HTMLElement>();
  const observers: { callback: () => void; disconnect: ReturnType<typeof vi.fn>; observed: Set<Element> }[] = [];
  class Observer {
    callback: () => void;
    disconnect = vi.fn(() => this.observed.clear());
    observed = new Set<Element>();
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe(element: Element) { this.observed.add(element); }
    unobserve(element: Element) { this.observed.delete(element); }
  }
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('MutationObserver', Observer);
  const root = {} as HTMLElement, body = {} as HTMLElement;
  const win = {
    location: { hash },
    get scrollY() { return scrollY; },
    getComputedStyle: (element: HTMLElement) => ({ scrollPaddingTop: padding, scrollMarginTop: (element as HTMLElement & { margin?: string }).margin ?? '100px' }),
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout, clearTimeout,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as Window;
  const doc = {
    documentElement: root, body, fonts,
    getElementById: (id: string) => targets.get(id) ?? null,
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  } as unknown as Document;
  const dispose = watchPortalAnchor(win, doc);
  return {
    win, dispose, observers, finishFonts,
    add(id: string, top = 2000) {
      const model = { top, margin: '100px' };
      const element = {
        get margin() { return model.margin; },
        getBoundingClientRect: () => ({ top: model.top - scrollY }),
        scrollIntoView: vi.fn((options: ScrollIntoViewOptions) => {
          expect(options).toEqual({ block: 'start', behavior: 'instant' });
          // Model native CSS alignment rather than hard-coding the portal header size.
          scrollY = model.top - Number.parseFloat(padding) - Number.parseFloat(model.margin);
        }),
      } as unknown as HTMLElement;
      targets.set(id, element);
      return { model, element, scroll: vi.mocked(element.scrollIntoView) };
    },
    frame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); },
    notify() { observers.forEach(observer => { if (!observer.disconnect.mock.calls.length) observer.callback(); }); },
    event(type: string, values: Record<string, unknown> = {}) {
      const event = new Event(type);
      Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
      events.dispatchEvent(event);
    },
    hash(hash: string) { win.location.hash = hash; events.dispatchEvent(new Event('hashchange')); },
    padding(value: string) { padding = value; },
    scrollY: () => scrollY,
    pending: () => frames.size,
  };
}

it('reaches a lazy fragment, corrects later layout shifts and becomes idle between changes', async () => {
  const page = harness();
  page.frame();
  expect(page.pending()).toBe(0);
  const works = page.add('works');
  page.notify(); page.notify();
  expect(page.pending()).toBe(1);
  page.frame();
  expect(works.scroll).toHaveBeenCalledTimes(1);
  expect(page.scrollY()).toBe(1800);
  works.model.top = 2800;
  page.notify(); page.frame();
  expect(page.scrollY()).toBe(2600);
  page.notify(); page.frame();
  expect(works.scroll).toHaveBeenCalledTimes(2);
  expect(page.pending()).toBe(0);
  works.model.top = 3000;
  page.finishFonts(); await Promise.resolve(); page.frame();
  expect(page.scrollY()).toBe(2800);
  page.dispose();
});

it('uses native CSS alignment again when responsive scroll offsets change', () => {
  const page = harness('#practice'), practice = page.add('practice', 3600);
  page.frame();
  page.padding('84px'); practice.model.margin = '84px';
  page.event('resize'); page.frame();
  expect(page.scrollY()).toBe(3432);
  expect(practice.scroll).toHaveBeenCalledTimes(2);
  page.dispose();
});

it.each([
  ['wheel', { deltaY: 40 }],
  ['touchstart', {}],
  ['pointerdown', {}],
  ['keydown', { key: 'PageDown' }],
  ['keydown', { key: ' ' }],
])('stops pending correction on manual %s input and ignores late font completion', async (type, values) => {
  const page = harness(), works = page.add('works');
  page.event(type, values);
  page.frame(); page.notify();
  page.finishFonts(); await Promise.resolve(); page.frame();
  expect(works.scroll).not.toHaveBeenCalled();
  expect(page.pending()).toBe(0);
  expect(page.observers.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  page.dispose();
});

it('does not treat typing or an empty wheel event as manual scroll navigation', () => {
  const page = harness(), works = page.add('works');
  page.event('wheel', { deltaX: 0, deltaY: 0 });
  page.event('keydown', { key: 'a' });
  page.event('keydown', { key: 'Home', target: { closest: () => ({}) } });
  page.frame();
  expect(works.scroll).toHaveBeenCalledTimes(1);
  page.dispose();
});

it('preserves native hash navigation and only repairs subsequent layout changes', () => {
  const page = harness(), works = page.add('works'), practice = page.add('practice', 3600);
  page.frame();
  page.event('wheel', { deltaY: 80 });
  page.hash('#practice'); page.frame();
  expect(practice.scroll).not.toHaveBeenCalled();
  practice.model.top += 500;
  page.notify(); page.frame();
  expect(practice.scroll).toHaveBeenCalledTimes(1);
  expect(works.scroll).toHaveBeenCalledTimes(1);
  page.dispose();
});

it('handles a new hash whose target has not mounted and decodes its fragment', () => {
  const page = harness('');
  page.hash('#new%20section'); page.frame();
  const target = page.add('new section', 4000);
  page.notify(); page.frame();
  expect(target.scroll).toHaveBeenCalledTimes(1);
  page.dispose();
});

it('bounds waiting for a missing target and disconnects all work at the deadline', () => {
  const page = harness();
  page.frame();
  vi.advanceTimersByTime(6000);
  const works = page.add('works');
  page.notify(); page.frame();
  expect(works.scroll).not.toHaveBeenCalled();
  expect(page.observers.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true);
  expect(page.pending()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  page.dispose();
});

it('disposes frames, observers, timers and future hash navigation without browser globals at import', () => {
  const page = harness(), works = page.add('works');
  expect(page.pending()).toBe(1);
  page.dispose(); page.dispose();
  page.hash('#practice'); page.event('resize'); page.frame();
  expect(works.scroll).not.toHaveBeenCalled();
  expect(page.pending()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(page.observers).toHaveLength(2);
});

it('ignores malformed fragment encoding', () => {
  const page = harness('#%E0%A4%A');
  expect(page.pending()).toBe(0);
  expect(page.observers).toHaveLength(0);
  page.dispose();
});
