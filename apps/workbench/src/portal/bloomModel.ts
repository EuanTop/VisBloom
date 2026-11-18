export type BloomRow = Record<string, string>;
export const bloomBenefits = [
  { value: '全部', label: '全部成分', color: '#c4bdd0' },
  { value: 'Hydration', label: '保湿', color: '#3B4EE2' },
  { value: 'Soothing', label: '舒缓', color: '#91cc75' },
  { value: 'Anti-Aging', label: '抗衰', color: '#fac858' },
];
export function readBloomRows(value: unknown): BloomRow[] {
  if (!Array.isArray(value) || !value.length) throw new Error('花瓣数据未能读取');
  const rows = value as BloomRow[];
  const id = rows[0].product_id;
  if (!id || rows.some((row, index) => row.product_id !== id || Number(row.ingredient_order) !== index + 1 || !row.ingredient_name || typeof row.benefits !== 'string')) throw new Error('花瓣数据顺序不完整');
  return rows;
}
export function matchingIngredients(rows: BloomRow[], benefit: string) {
  return benefit === '全部' ? rows : rows.filter(row => row.benefits.split(';').map(value => value.trim()).includes(benefit));
}
export function bloomParameters(rows: BloomRow[], benefit: string, rotation: number, bloom: number, crayon = 1) {
  return { view: '单产品', cohort: rows[0]?.cohort.toUpperCase() ?? 'TOP', productRank: Number(rows[0]?.cohort_rank ?? 3),
    benefit, rotation, bloom, crayon, preservatives: true, ingredientPage: 1, background: '#080808', ink: '#e8e9dc', animate: false };
}
export function bloomBrief(benefit: string, rotation: number, bloom: number, crayon = 1) {
  const name = bloomBenefits.find(item => item.value === benefit)?.label ?? benefit;
  return `请先读取数据艺术工作台里当前 SkinBloom 项目的最新状态与源码。保留原花瓣轮廓、成分顺序、原功效色和防腐剂标记。我的当前选择是${name}，旋转 ${rotation}°，花朵尺度 ${bloom.toFixed(2)}，蜡笔质感 ${crayon.toFixed(2)}。请先核对这些选择，再和我讨论下一步表达；不要擅自替换花瓣形式或覆盖我刚做的修改。`;
}
