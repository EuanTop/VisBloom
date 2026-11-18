import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { createPublicationStore, publicationOrigin, MAX_PUBLICATION_BYTES } from '../packages/plugin-publish-local/src/index.ts';
import { mountPublicViews } from '../apps/share-server/src/routes.ts';
import { runtimeHtml } from '../packages/plugin-export-web/src/index.ts';
import { WorkbenchError, type Project } from '../packages/contracts/src/index.ts';

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(directory=>rm(directory,{recursive:true,force:true})));});
async function fixture(){const directory=await mkdtemp(path.join(tmpdir(),'art-publication-'));dirs.push(directory);const store=createPublicationStore({directory,origin:'https://works.example'});const app=new Hono();app.onError((e,c)=>c.json({error:e instanceof WorkbenchError?e.code:'failed'},e instanceof WorkbenchError?e.status as any:500));mountPublicViews(app,store);return{directory,store,app};}
it('persists a frozen viewing artifact, serves inline sandboxed embed pages and revokes all viewing paths',async()=>{
  const {directory,store,app}=await fixture();
  const original=new TextEncoder().encode('<!doctype html><canvas></canvas><script>window.work=1</script>');
  const link=await store.plugin.publish({projectId:'private-project',revision:4,title:'A <script>title</script>',html:original});
  expect(link.scope).toBe('public');expect(link.url).toBe('https://works.example/s/'+link.id);
  expect((await createPublicationStore({directory,origin:'https://works.example'}).plugin.list('private-project'))[0]).toEqual(link);
  expect(await store.plugin.list('someone-else')).toEqual([]);
  for(const route of [`/s/${link.id}`,`/embed/${link.id}`]){
    const response=await app.request(route);expect(response.status).toBe(200);
    const html=await response.text();expect(html).toContain('sandbox="allow-scripts"');expect(html).not.toContain('<script>title</script>');
    expect(response.headers.get('content-disposition')).toBeNull();expect(response.headers.get('content-security-policy')).toContain('frame-ancestors *');expect(response.headers.get('content-security-policy')).toContain('frame-src https://works.example');
  }
  const artifact=await app.request(`/s/${link.id}/artwork`);
  expect(new Uint8Array(await artifact.arrayBuffer())).toEqual(original);
  expect(artifact.headers.get('content-security-policy')).toContain("connect-src 'none'");expect(artifact.headers.get('content-security-policy')).toContain("sandbox allow-scripts");expect(artifact.headers.get('content-security-policy')).not.toContain("frame-ancestors");
  await expect(store.plugin.revoke('wrong-project',link.id)).rejects.toMatchObject({status:404});
  await store.plugin.revoke('private-project',link.id);
  for(const route of [`/s/${link.id}`,`/embed/${link.id}`,`/s/${link.id}/artwork`])expect((await app.request(route)).status).toBe(404);
  await expect(readFile(path.join(directory,link.id+'.html'))).rejects.toMatchObject({code:'ENOENT'});
});
it('rejects unsafe origins and path traversal, and distinguishes local links from public links',async()=>{
  expect(publicationOrigin('http://127.0.0.1:4320').scope).toBe('local');
  for(const origin of ['http://public.example','https://a:b@example.com','https://example.com/path','https://example.com/?key=secret'])expect(()=>publicationOrigin(origin)).toThrow();
  const {store}=await fixture();for(const id of ['../secret','a'.repeat(31),'../../.env'])await expect(store.html(id)).rejects.toMatchObject({status:404});
});
it('embeds only viewing state and selected data, excluding source, notes and dataset metadata',()=>{
  const project:Project={id:'sample',name:'A </title><script>bad</script>',revision:2,updatedAt:'',state:{parameters:{size:3},mapping:{field:'x',target:'weight',transform:'linear'},seed:1,time:0,paused:true},schema:[],files:[{path:'src/secret.ts',content:'PRIVATE_SOURCE_SENTINEL',hash:'h'}],codeHash:'h',notes:'PRIVATE_NOTE_SENTINEL',preset:'blank',dataset:{id:'private',name:'PRIVATE_DATASET_SENTINEL',format:'csv',hash:'h',bytes:1,createdAt:''},result:{id:'result',datasetId:'private',sql:'PRIVATE_SQL_SENTINEL',columns:['x'],rows:[{x:17}],rowCount:1,truncated:false,createdAt:''}};
  const html=runtimeHtml({hash:'h',createdAt:'',script:'window.art=1'},project);
  expect(html).toContain('"x":17');expect(html).toContain('"size":3');
  for(const sentinel of ['PRIVATE_SOURCE_SENTINEL','PRIVATE_NOTE_SENTINEL','PRIVATE_DATASET_SENTINEL','PRIVATE_SQL_SENTINEL'])expect(html).not.toContain(sentinel);
  expect(html).not.toContain('</title><script>bad');
});

it('bounds full-resolution original artwork assets and rejects oversized publications before writing',async()=>{
 const {store}=await fixture();
 expect(MAX_PUBLICATION_BYTES).toBe(48_000_000);
 await expect(store.plugin.publish({projectId:'large',revision:1,title:'Original assets',html:new Uint8Array(MAX_PUBLICATION_BYTES+1)})).rejects.toMatchObject({status:413});
 expect(await store.plugin.list('large')).toEqual([]);
});
