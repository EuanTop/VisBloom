import { chmod, copyFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicAssets = path.join(root, 'apps/workbench/public');
const portal = path.join(root, 'dist/portal');

const assets = [
  'visbloom.svg',
  'portal/ava-logo.svg',
  'portal/fonts/display-latin.woff2',
  'portal/fonts/display-cn-v2-full.woff2',
  'portal/fonts/SmileySans-OFL.txt',
  'portal/fonts/Unbounded-OFL.txt',
  'portal/skinbloom-petals.jpg',
  'portal/platform-skinbloom-canvas.jpg',
  'portal/platform-skinbloom-code.jpg',
];
for (const name of await readdir(path.join(publicAssets, 'portal'))) {
  if (name.endsWith('-LICENSE.txt')) assets.push(`portal/${name}`);
}
for (const asset of assets) {
  const target = path.join(portal, asset);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(publicAssets, asset), target);
  await chmod(target, 0o644);
}
await cp(path.join(root, 'apps/workbench/public-site'), portal, { recursive: true });
await copyFile(path.join(portal, 'portal.html'), path.join(portal, 'index.html'));

const credits = (await readFile(path.join(publicAssets, 'portal/credits.html'), 'utf8'))
  .replace(/<section id="(?:martover|stellar)"[^>]*>[\s\S]*?<\/section>/g, '')
  .replace(/<section id="skinbloom"[^>]*>[\s\S]*?<\/section>/, '<section id="skinbloom"><h2>SkinBloom</h2><p>由 EuanTop 创作。<a href="/artworks/skinbloom-ingredients.html">SkinBloom Ingredients</a> 收录两款公开配方，花瓣由成分顺序、功效标签与防腐剂标记组织。<a href="/artworks/skinbloom-products.html">SkinBloom Products</a> 复刻原 Swift 软件的七章科普，公开版收录 14 条产品目录样本。</p></section>');
await writeFile(path.join(portal, 'portal/credits.html'), credits);
