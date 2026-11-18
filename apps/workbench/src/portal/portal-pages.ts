export const PORTAL_PAGES = [
  { id: 'intro', label: '数据可视化创作工具' },
  { id: 'connection', label: '粒子展开' },
  { id: 'platform', label: '两条创作链路' },
  { id: 'data', label: '数据基座' },
  { id: 'delivery', label: '导出与分享' },
  { id: 'start', label: '开始创作' },
] as const;

export type PageRect = { top: number; height: number };
export type PageLayout = Record<'intro' | 'platform' | 'data' | 'delivery' | 'start', PageRect>;

/** A tall chapter has both a start and an end stop: its middle remains readable. */
export function pageStops(layout: PageLayout, viewport: number, limit: number, reduced = false) {
  const bound = (value: number) => Math.max(0, Math.min(Math.max(0, limit), value));
  const pages = [layout.intro.top, layout.intro.top + Math.max(0, layout.intro.height - viewport),
    layout.platform.top, layout.data.top, layout.delivery.top, layout.start.top].map(bound).filter((_,index)=>!reduced || index!==1);
  const ends = Object.values(layout).filter(rect => rect.height > viewport + 32)
    .map(rect => bound(rect.top + rect.height - viewport));
  const snaps = [...new Set([...pages, ...ends, bound(limit)].map(Math.ceil))].sort((a, b) => a - b);
  return { pages, snaps };
}

export function pageAt(scroll: number, stops: number[], viewport: number) {
  for (let index = stops.length - 1; index >= 0; index--) {
    if (stops[index] <= scroll + viewport * .35) return index;
  }
  return 0;
}

/** Small wheel ticks must accumulate instead of being pulled back to the old page. */
export function snapFollowsInput(actual: number, projected: number, delta: number, stops: number[]) {
  if (!delta || !stops.length) return false;
  const nearest = stops.reduce((best, value) => Math.abs(value - projected) < Math.abs(best - projected) ? value : best, stops[0]);
  return Math.sign(delta) * (nearest - actual) > 2;
}
