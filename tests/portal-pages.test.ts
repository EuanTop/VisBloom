import { describe, expect, it } from 'vitest';
import { externalWorkCard } from '../scripts/collection-external.ts';
import { pageAt, pageStops, snapFollowsInput, type PageLayout } from '../apps/workbench/src/portal/portal-pages';

const layout: PageLayout = {
  intro: { top: 0, height: 1800 }, platform: { top: 1800, height: 1400 },
  data: { top: 3200, height: 900 }, delivery: { top: 4100, height: 900 }, start: { top: 5000, height: 1100 },
};
describe('portal chapter positions', () => {
  it('keeps the intro transition and the four platform chapters separate', () => {
    expect(pageStops(layout, 900, 5300).pages).toEqual([0,900,1800,3200,4100,5000]);
  });
  it('retains a landing at the bottom of tall content and at the footer', () => {
    expect(pageStops(layout,900,5300).snaps).toEqual([0,900,1800,2300,3200,4100,5000,5200,5300]);
  });
  it('clamps stops to the native scroll limit and does not make negative stops for short sections', () => {
    const measured=pageStops({...layout,intro:{top:0,height:400}},900,4800);
    expect(measured.pages).toEqual([0,0,1800,3200,4100,4800]);
    expect(measured.snaps.every(value=>value>=0&&value<=4800)).toBe(true);
    expect(new Set(measured.snaps).size).toBe(measured.snaps.length);
  });
  it('recomputes the bridge and reading stops when the viewport changes', () => {
    const measured=pageStops(layout,600,5600);
    expect(measured.pages[1]).toBe(1200);
    expect(measured.snaps).toContain(2600);
    expect(measured.snaps).toContain(5500);
  });
  it('changes the active chapter only once the next scene enters the reading region', () => {
    const stops=pageStops(layout,900,5300).pages;
    expect(pageAt(0,stops,900)).toBe(0);
    expect(pageAt(580,stops,900)).toBe(0);
    expect(pageAt(590,stops,900)).toBe(1);
    expect(pageAt(2250,stops,900)).toBe(2);
    expect(pageAt(5300,stops,900)).toBe(5);
    expect(pageAt(-20,[],900)).toBe(0);
  });
  it('omits the animated bridge when reduced motion uses a single intro screen', () => {
    const measured=pageStops({...layout,intro:{top:0,height:900}},900,5300,true);
    expect(measured.pages).toHaveLength(5);
    expect(measured.pages.slice(0,2)).toEqual([0,1800]);
    expect(pageAt(0,measured.pages,900)).toBe(0);
  });
  it('allows small wheel ticks to leave a page instead of snapping backwards', () => {
    expect(snapFollowsInput(0,120,120,[0,860])).toBe(false);
    expect(snapFollowsInput(120,240,120,[0,860])).toBe(false);
    expect(snapFollowsInput(480,600,120,[0,860])).toBe(true);
  });
  it('preserves reverse intent and does not snap on a touch-start or an empty layout', () => {
    expect(snapFollowsInput(860,740,-120,[0,860])).toBe(false);
    expect(snapFollowsInput(480,360,-120,[0,860])).toBe(true);
    expect(snapFollowsInput(480,480,0,[0,860])).toBe(false);
    expect(snapFollowsInput(480,600,120,[])).toBe(false);
  });
});

describe('external works in the collection', () => {
  const work = { title: 'A < B', author: 'A & B', url: 'https://creator.github.io' };
  it.each([
    ['/repo/', '/repo/cover.jpg'],
    ['/repo', '/repo/cover.jpg'],
    ['/repo/chapter/index.html?view=top#art', '/repo/chapter/cover.jpg'],
    ['/', '/cover.jpg'],
  ])('gets the cover from the same publish directory for %s', (entry, cover) => {
    for (const publicPortal of [true, false]) {
      const html = externalWorkCard({ ...work, url: work.url + entry }, publicPortal);
      expect(html).toContain(`href="${work.url + entry}"`);
      expect(html).toContain(`src="${work.url + cover}"`);
      expect(html).toContain('data-external-cover hidden');
      expect(html).toContain('A &lt; B');
      expect(html).toContain('A &amp; B');
    }
  });

  it('rejects non-HTTPS works and credentials', () => {
    for (const url of ['javascript:alert(1)', 'https://user:pass@creator.github.io/site/']) {
      expect(() => externalWorkCard({ ...work, url }, true)).toThrow('public HTTPS');
    }
  });
});
