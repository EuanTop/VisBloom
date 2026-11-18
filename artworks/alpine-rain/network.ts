export type Point = [number, number];
export type Reach = {
  id: number;
  downstream: number;
  area: number;
  length: number;
  remaining: number;
  trace: boolean;
  points: Point[];
};
export const rivers = [
  { id: 'rhine', name: '莱茵河', latin: 'Rhein', sea: '北海', source: '前莱茵河上游', color: '#8be2ff', pale: '#dff9ff', dark: '#1e6ba0', label: [-10, -12] },
  { id: 'rhone', name: '罗讷河', latin: 'Rhône', sea: '狮子湾', source: '罗讷冰川一带', color: '#ffb26c', pale: '#ffe1ac', dark: '#9f4c34', label: [0, 19] },
  { id: 'po', name: '波河', latin: 'Po', sea: '亚得里亚海', source: '提契诺河上游', color: '#bdf1aa', pale: '#e9ffcb', dark: '#3f8566', label: [4, 19] },
  { id: 'danube', name: '多瑙河', latin: 'Donau', sea: '黑海', source: '因河上游', color: '#c5b1ff', pale: '#f0ddff', dark: '#694baf', label: [-19, 17] },
] as const;
export type RiverId = typeof rivers[number]['id'];
export type Basin = {
  river: typeof rivers[number];
  reaches: Reach[];
  route: Reach[];
  outlet: Reach | undefined;
  source: Reach | undefined;
  area: number;
  distance: number;
  maxDistance: number;
};
export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const figures = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
export const pathDistance = (reach: Reach) => reach.remaining + reach.length;

function readReach(row: Record<string, unknown>): Reach | undefined {
  try {
    const points = JSON.parse(String(row.geometry)) as Point[];
    const values = [row.reach_id, row.next_down, row.upstream_km2, row.length_km, row.distance_to_outlet_km].map(Number);
    if (!Array.isArray(points) || points.length < 2 ||
        !points.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) ||
        values.some(value => !Number.isFinite(value) || value < 0)) return;
    const [id, downstream, area, length, remaining] = values;
    return { id, downstream, area, length, remaining, trace: Number(row.alpine_trace) === 1, points };
  } catch {
    return;
  }
}

export function buildBasins(rows: Record<string, unknown>[]): Basin[] {
  return rivers.map(river => {
    const reaches = rows.flatMap(row => {
      const reach = row.river === river.id && readReach(row);
      return reach ? [reach] : [];
    });
    const trace = reaches.filter(reach => reach.trace);
    const byId = new Map(trace.map(reach => [reach.id, reach]));
    const downstream = new Set(trace.map(reach => reach.downstream));
    const start = trace.find(reach => !downstream.has(reach.id));
    const outlet = reaches.find(reach => reach.downstream === 0);
    const route: Reach[] = [];
    const visited = new Set<number>();
    for (let node = start; node && !visited.has(node.id); node = byId.get(node.downstream)) {
      visited.add(node.id);
      route.push(node);
    }
    const complete = !!outlet && route.at(-1)?.id === outlet.id;
    return {
      river, reaches, outlet,
      route: complete ? route : [],
      source: complete ? start : undefined,
      distance: complete && start ? pathDistance(start) : 0,
      area: outlet?.area ?? 0,
      maxDistance: reaches.reduce((max, reach) => Math.max(max, pathDistance(reach)), 1),
    };
  });
}

export type Bounds = [number, number, number, number];
export function boundsOf(reaches: Reach[]): Bounds {
  if (!reaches.length) return [0, 0, 1, 1];
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { points } of reaches) for (const [x, y] of points) {
    bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
  }
  return bounds;
}

export function projection([left, bottom, right, top]: Bounds, width: number, height: number, pad: number) {
  const cos = Math.cos((bottom + top) / 2 * Math.PI / 180);
  const scale = Math.min((width - 2 * pad) / Math.max(0.01, (right - left) * cos),
    (height - 2 * pad) / Math.max(0.01, top - bottom));
  return ([x, y]: Point): Point => [width / 2 + (x - (left + right) / 2) * cos * scale,
    height / 2 - (y - (top + bottom) / 2) * scale];
}

export function yarnWidth(area: number) {
  return 0.62 + 0.56 * Math.log10(1 + area / 100);
}
