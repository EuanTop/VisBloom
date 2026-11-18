import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { sourceFile } from '@art/core';
import type { DataBinding, Parameter } from '@art/contracts';

// Authored works are content modules, independent of the workbench and AVA adapter.
const cases = [
  {id:'physarum',name:'生长之间 · Physarum',description:'组织生长、分叉与重组',renderer:'renderer.three',dataset:'data/growth.csv',sql:await readFile(new URL('../../../cases/physarum/growth.sql',import.meta.url),'utf8'),thumbnail:'collection/physarum.png',thumbnailAlt:'金色与蓝色粒子交织成黏菌网络',portalDataset:'collection/physarum.json',collectionOrder:4,caption:'由局部感知长出组织。'},
  {
    id: 'skinbloom-ingredients',
    directory: 'skinbloom',
    name: 'SkinBloom Ingredients',
    description: '配方花瓣 · 成分顺序、功效和防腐剂标记',
    renderer: 'renderer.document',
    controls: 'ingredients-controls.json',
    manifest: 'ingredients-files.json',
    dataset: 'data/ingredients.csv',
    sql: 'SELECT * FROM data ORDER BY cohort DESC, cohort_rank, ingredient_order',
    // Published REFY and Hourglass formulations, with the previously shared columns.
    publicSql: `SELECT product_id, product_name, brand, cohort, cohort_rank, ingredient_order,
      ingredient_name, ingredient_rating, benefits, is_preservative, matched
      FROM data WHERE product_id IN ('product:6ee53b8dfd480cdb5697', 'product:b93b4c7ad0788b435586')
      ORDER BY cohort DESC, cohort_rank, ingredient_order`,
    thumbnail: 'collection/skinbloom-ingredients.jpg',
    publicThumbnail: 'collection/skinbloom-ingredients-samples.jpg',
    thumbnailAlt: 'Top 50 与 Bottom 50 的配方花瓣并排对比',
    publicCaption: '对照两款公开的配方花瓣样本。',
    collectionOrder: 1,
    caption: '从花瓣读一份配方。',
  },
  {
    id: 'skinbloom-products',
    directory: 'skinbloom',
    name: 'SkinBloom Products',
    description: 'Born with Skin Swift 版复刻 · 七类产品与原始科普目录',
    renderer: 'renderer.document',
    controls: 'document-controls.json',
    bindings: 'products-bindings.json',
    notes: 'PRODUCTS.md',
    dataset: 'data/catalogue.csv',
    sql: 'SELECT * FROM data ORDER BY id',
    // The original public export shared only these 14 entries and columns.
    publicSql: `SELECT id, Brand, Name, Price, Rank, Ingredients, Combination, Dry, Normal,
      Oily, Sensitive, in_cleanser, in_moist, in_suncreen, in_acne, in_brighten, in_repair, in_anti_aging
      FROM data WHERE id IN (1, 2, 3, 4, 5, 9, 12, 14, 15, 16, 32, 134, 1303, 1304)
      ORDER BY id`,
    thumbnail: 'collection/skinbloom-products.jpg',
    thumbnailAlt: '原版人像及 Cleanser 和 Moisturizer 产品卡片',
    collectionOrder: 2,
    caption: '打开七类包装，读原版的护肤科普。',
  },
  { id:'stellar-drift', name:'恒星的漫游 · Stellar Drift', description:'HYG 星表 · 32 万年的轨迹 · 拖动、选星与进入星海', renderer:'renderer.three', dataset:'data/stars.csv', sql:'SELECT * FROM data ORDER BY mag ASC, id ASC',caption:'在漫长的时间里，星空也在迁徙。' },
  {id:'martover',name:'Martover · 农业目标地选择',description:'火星全景、撞击坑图谱与分层解读',renderer:'renderer.document',controls:'document-controls.json',dataset:'data/scene.csv',sql:'SELECT * FROM data ORDER BY source_order',thumbnail:'collection/martover-globe.jpg',thumbnailAlt:'从轨道俯瞰火星球体、经纬网与陨石坑标记',collectionOrder:3,portalDataset:'collection/martover.json',caption:'火星农业计划，始于一座陨石坑。'},
  {id:'stork-migration',name:'白鹳迁徙 · 同一个起点，两个冬天',description:'沿两条针织带对照 215 天的白鹳迁徙、生态区和天气',renderer:'renderer.document',dataset:'data/journey.csv',sql:'SELECT * FROM data ORDER BY day, bird_index',caption:'两只鸟从同一片森林飞向两个冬天。',thumbnail:'collection/stork-migration.png',thumbnailAlt:'白鹳在两条带地景的针织迁徙曲线上飞行',collectionOrder:5},
  {id:'breathing-quilt',name:'一床会呼吸的被子',description:'同步的呼吸与光电脉搏波驱动针织被面和收边',renderer:'renderer.document',dataset:'data/wave.csv',sql:'SELECT * FROM data ORDER BY second',caption:'一床被子跟随真实的呼吸和脉搏。',thumbnail:'collection/breathing-quilt.png',thumbnailAlt:'紫色针织被面与下方同步波形',collectionOrder:6},
  {id:'mineral-knit',name:'矿物织谱',description:'20 件矿物针织标本，按四类排成实测反射光谱阵列',renderer:'renderer.document',dataset:'data/spectra.csv',sql:'SELECT * FROM data ORDER BY rank, wavelength_nm',caption:'把矿物如何反射光，织成一组可以查读的标本。'},
  {id:'knit-stretch',name:'同一根线，为什么伸得不一样？',description:'从真实针法图复原 24 块织片，对照放松与拉伸的实测尺寸',renderer:'renderer.document',dataset:'data/swatches.csv',sql:'SELECT * FROM data ORDER BY order_id',caption:'同一种纱线，换个针法，就拉成另一种形状。'},
  {id:'alpine-rain',name:'同一场雨，流向不同的海',description:'沿真实的阿尔卑斯山河网，追踪四条去往不同海域的示范水路',renderer:'renderer.document',dataset:'data/reaches.csv',sql:'SELECT * FROM data ORDER BY river, reach_id',caption:'从一片山脉，流进不同的海。',thumbnail:'collection/alpine-rain.jpg',thumbnailAlt:'阿尔卑斯山脊和四种颜色的入海河网',collectionOrder:7},
] as const;

const caseDirectory = new URL('../../../cases/', import.meta.url);
const sourceDirectory = (definition: (typeof cases)[number]) =>
  'directory' in definition ? definition.directory : definition.id;
export const caseCatalog = cases.filter(definition =>
  existsSync(new URL(`${sourceDirectory(definition)}/${definition.dataset}`, caseDirectory))
);

// Older CLI and automation callers used this preset for the flower case.
export function findCase(id: string) {
  return caseCatalog.find(item => item.id === (id === 'skinbloom' ? 'skinbloom-ingredients' : id));
}

export async function loadCase(root:string,id:string){
  const definition=findCase(id);
  if(!definition)throw new Error(`Unknown authored case ${id}`);
  const directory=path.join(root,'cases',sourceDirectory(definition));
  const bindings=JSON.parse(await readFile(path.join(directory,'bindings' in definition ? definition.bindings : 'bindings.json'),'utf8')) as DataBinding[];
  const [source,controlText,content,notes]=await Promise.all([
    readFile(path.join(directory,'artwork.ts'),'utf8'),readFile(path.join(directory,'controls' in definition?definition.controls:'controls.json'),'utf8'),
    readFile(path.join(directory,definition.dataset),'utf8'),readFile(path.join(directory,'notes' in definition ? definition.notes : 'README.md'),'utf8'),
  ]);
  const files=new Map([['src/artwork.ts',source],['controls.json',controlText]]);
  let manifest:{source:string;target:string}[]=[];
  try{manifest=JSON.parse(await readFile(path.join(directory,'manifest' in definition ? definition.manifest : 'files.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  for(const entry of manifest){
    const from=path.resolve(root,entry.source);
    if(!from.startsWith(path.resolve(root)+path.sep)||!/^src\/[a-zA-Z0-9_./-]+\.(ts|js|glsl|vert|frag)$/.test(entry.target)||entry.target.split('/').includes('..'))throw new Error('Invalid artwork source manifest');
    files.set(entry.target,await readFile(from,'utf8'));
  }
  return {definition,bindings,schema:JSON.parse(controlText) as Parameter[],files:await Promise.all([...files].map(([name,text])=>sourceFile(name,text))),content,notes};
}
