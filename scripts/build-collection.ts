import { mkdir, readFile, writeFile, mkdtemp, rm, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { artworkDataModule } from '../packages/plugin-data-ava/src/artwork-module.ts';
import { createAvaPlugin } from '../packages/plugin-data-ava/src/index.ts';
import type { Project } from '../packages/contracts/src/index.ts';
import { digest } from '../packages/core/src/index.ts';
import { createEsbuildCompiler } from '../packages/plugin-compiler-esbuild/src/index.ts';
import { createWebExporter } from '../packages/plugin-export-web/src/index.ts';
import { caseCatalog, loadCase } from '../apps/server/src/cases.ts';
import { externalCoverScript, externalWorkCard, externalWorkRedirect, type ExternalWork } from './collection-external.ts';

// Bundle the same authored modules used by editable projects. This build step
// reads committed case data through the same required AVA adapter.
const root=fileURLToPath(new URL('../',import.meta.url));
const publicPortal=process.argv.includes('--public-portal');
const out=path.join(root,publicPortal?'dist/portal':'dist/workbench');await mkdir(path.join(out,'artworks'),{recursive:true});
const publicAssets = path.join(root, 'apps/workbench/public');
const compiler=createEsbuildCompiler({browserDataModule:artworkDataModule,runtimeEntry:path.join(root,'packages/plugin-renderer-three/src/runtime.ts'),runtimes:{'renderer.canvas2d':path.join(root,'packages/plugin-renderer-canvas/src/runtime.ts'),'renderer.document':path.join(root,'packages/plugin-renderer-document/src/runtime.ts')}});
const exporter=createWebExporter();
// Observational source images are separate assets; exported artworks carry the measured fields.
for(const file of await readdir(path.join(root,'cases/physarum/series/frames'))){if(!/^frame-\d{4}\.png$/.test(file))continue;
 const directories = publicPortal ? [path.join(out, 'collection/physarum')] : [path.join(root, 'apps/workbench/public/collection/physarum'), path.join(out, 'collection/physarum')];
 for(const directory of directories){await mkdir(directory,{recursive:true});await copyFile(path.join(root,'cases/physarum/series/frames',file),path.join(directory,file));}
}
const cards=[];
const communityWorks: ExternalWork[] = [];
const collectionCases=caseCatalog
  .filter(item=>'collectionOrder' in item)
  .filter(item=>!publicPortal||item.id==='physarum'||'publicSql' in item);
const dataDirectory=await mkdtemp(path.join(tmpdir(),'art-collection-build-'));
const data=createAvaPlugin({directory:dataDirectory});
try{for(const definition of collectionCases.sort((a,b)=>a.collectionOrder-b.collectionOrder)){
  const work=await loadCase(root,definition.id);
  await data.importData({id:definition.id,name:definition.dataset,format:'csv',bytes:new TextEncoder().encode(work.content)});
  const sql=publicPortal&&'publicSql' in definition?definition.publicSql:definition.sql;
  const result=await data.query({datasetId:definition.id,sql,maxRows:10000});
  if(result.truncated)throw new Error('Collection data is truncated');
  const rows=result.rows;
  if('portalDataset' in definition){
    const bytes=JSON.stringify(rows);const publicPath=path.join(root,'apps/workbench/public',definition.portalDataset),outputPath=path.join(out,definition.portalDataset);
    if(!publicPortal){await mkdir(path.dirname(publicPath),{recursive:true});await writeFile(publicPath,bytes);}
    await mkdir(path.dirname(outputPath),{recursive:true});await writeFile(outputPath,bytes);
  }
  const columns=Object.keys(rows[0]??{});
  if(publicPortal&&definition.id==='physarum'){
    const directory=path.join(out,'collection/physarum');
    const csvCell=(value:unknown)=>typeof value==='string'?'"'+value.replaceAll('"','""')+'"':String(value??'');
    const csv=[columns.join(','),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(','))].join('\n');
    await writeFile(path.join(directory,'ava-observations.csv'),csv+'\n');
    await writeFile(path.join(directory,'growth.csv'),work.content);
  }else{
    const project:Project={id:'collection-'+definition.id,name:definition.name,preset:definition.id,renderer:definition.renderer,revision:1,updatedAt:new Date(0).toISOString(),
      files:work.files,codeHash:await digest(work.files.map(f=>f.path+':'+f.hash).join('\n')),notes:'',schema:work.schema,
      state:{parameters:Object.fromEntries(work.schema.map(p=>[p.id,p.default])),mapping:{field:columns[0]??'',transform:'linear',target:'weight'},seed:42,time:0,paused:!publicPortal},
      result:{id:'collection-data',datasetId:'',sql:'',columns,rows,rowCount:rows.length,truncated:false,createdAt:new Date(0).toISOString()}};
    const artifact=await exporter.export(project,await compiler.compile(project));
    await writeFile(path.join(out,'artworks',definition.id+'.html'),artifact.bytes);
  }
  const cover = publicPortal && 'publicThumbnail' in definition ? definition.publicThumbnail : definition.thumbnail;
  const caption = publicPortal && 'publicCaption' in definition ? definition.publicCaption : definition.caption;
  const href = '/artworks/' + definition.id + '.html';
  const coverBytes = await readFile(path.join(publicAssets, cover));
  const coverRevision = (await digest(coverBytes)).slice(0, 12);
  await mkdir(path.dirname(path.join(out, cover)), { recursive: true });
  await writeFile(path.join(out, cover), coverBytes);
  const image = `<img class="work-cover" src="/${cover}?v=${coverRevision}" alt="${definition.thumbnailAlt}">`;
  if (publicPortal) {
    communityWorks.push({
      title: definition.name,
      author: 'EuanTop',
      url: href,
      description: caption,
    });
  }
  cards.push(publicPortal ? `<article>
    <a href="${href}">${image}<h2>${definition.name} <span aria-hidden="true">↗</span></h2><p>${caption}</p></a>
    <a class="work-author" href="https://github.com/EuanTop"><img src="/collection/euantop-avatar.jpg" alt="" width="24" height="24"> @EuanTop</a>
  </article>` : `<a class="work" href="${href}">${image}<div><h2>${definition.name}</h2><span>进入作品 ↗</span></div></a>`);
}
}finally{await data.dispose?.();await rm(dataDirectory,{recursive:true,force:true});}
const externalWorks: ExternalWork[] = JSON.parse(await readFile(path.join(root, 'cases/collection-external.json'), 'utf8'));
const builtCaseIds = new Set<string>(collectionCases.map(item => item.id));
for (const work of externalWorks) {
  if (work.localCase && builtCaseIds.has(work.localCase)) continue;
  cards.push(externalWorkCard(work, publicPortal));
  if (publicPortal) {
    const { title, author, url, description } = work;
    const href = new URL(url).href;
    communityWorks.push({ title, author, url: href, description });
    if (work.localCase) {
      await writeFile(path.join(out, 'artworks', encodeURIComponent(work.localCase) + '.html'), externalWorkRedirect(href, title));
      builtCaseIds.add(work.localCase);
    }
  }
}
if(builtCaseIds.has('skinbloom-products')){
  await writeFile(path.join(out,'artworks','skinbloom.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><title>SkinBloom Products</title><meta http-equiv="refresh" content="0; url=./skinbloom-products.html"><a href="./skinbloom-products.html">Open SkinBloom Products</a></html>');
}
const coverScript = externalWorks.length ? externalCoverScript : '';
if (publicPortal) {
  const template = await readFile(path.join(root, 'apps/workbench/public-site/collection.html'), 'utf8');
  await writeFile(path.join(out, 'collection.html'), template.replace('<!-- COLLECTION_WORKS -->', () => cards.join('\n')).replace('</body>', () => coverScript + '</body>'));
  await writeFile(path.join(out, 'collection.json'), JSON.stringify(communityWorks, null, 2) + '\n');
  process.exit(0);
}
await rm(path.join(out, 'artworks/stellar-drift.html'), { force: true });
await writeFile(path.join(out,'collection.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>作品集 · Visloom</title><link rel="icon" type="image/svg+xml" href="/visloom.svg"><style>@font-face{font-family:Unbounded;src:url('/portal/fonts/display-latin.woff2') format('woff2');font-weight:200 900;font-display:swap}@font-face{font-family:display;src:url('/portal/fonts/display-cn-v2-full.woff2')}*{box-sizing:border-box}body{background:#080808;color:#f1eee8;margin:0;font:14px/1.6 system-ui}a{color:inherit;text-decoration:none}header{display:flex;justify-content:space-between;padding:24px 5vw;border-bottom:1px solid #ffffff18}.site-brand{display:inline-flex;align-items:center;gap:8px;font:500 14px/1.2 Unbounded,system-ui,sans-serif;letter-spacing:-.055em}nav{display:flex;gap:24px}main{max-width:1360px;margin:auto;padding:50px 5vw}h1{font:400 clamp(32px,5vw,60px) display,serif;margin:0 0 35px}.works{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px}.work{display:block;min-width:0}.work img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#111}.work img[hidden]{display:none}.work>div{display:flex;gap:12px;justify-content:space-between;align-items:baseline;margin-top:14px}h2{font-size:16px;font-weight:500;margin:0}span{font-size:12px;color:#b8b0a2}.pending{margin-top:42px;color:#a9a195}.pending a{color:#d4c19f}a:focus-visible{outline:2px solid #d4c19f;outline-offset:6px}@media(max-width:700px){.works{grid-template-columns:1fr}header,main{padding-inline:24px}nav{gap:16px}}</style><body><header><a class="site-brand" href="/portal.html" translate="no"><img src="/visloom.svg" width="32" height="32" alt="">Visloom</a><nav><a href="/portal.html">首页</a><a href="/">工作台 ↗</a></nav></header><main><h1>作品集</h1><div class="works">${cards.join('')}</div></main>${coverScript}</body></html>`);
console.log(`Collection: ${cards.length} independent interactive works`);
