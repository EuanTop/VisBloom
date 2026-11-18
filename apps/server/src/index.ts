import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { PluginRegistry, ProjectService, sourceFile, digest } from '@art/core';
import { validCaptureSize, WorkbenchError, type Job, type Project, type RenderAck } from '@art/contracts';
import { createLocalRepository } from '@art/plugin-storage-local';
import { artworkDataModule } from '../../../packages/plugin-data-ava/src/artwork-module.ts';
import { createAvaPlugin } from '@art/plugin-data-ava';
import { createEsbuildCompiler } from '@art/plugin-compiler-esbuild';
import { createWebExporter, runtimeHtml } from '@art/plugin-export-web';
import { rendererManifest } from '../../../packages/plugin-renderer-three/src/index.ts';
import { rendererManifest as canvasManifest } from '../../../packages/plugin-renderer-canvas/src/index.ts';
import { rendererManifest as documentManifest } from '../../../packages/plugin-renderer-document/src/index.ts';
import { controls, artworkSource, sampleCSV } from './examples.ts';
import { caseCatalog, findCase, loadCase } from './cases.ts';
import { createThumbnailCoordinator, type ThumbnailSession } from './thumbnails.ts';
import { readOverview, readProjectFile, readProjectNotes, readProjectResult, summarizeRenderer } from './project-reads.ts';
import { waitForRenderer } from './render-readiness.ts';
import { serviceAccessFromEnv } from './access.ts';
import { mountReferenceMcp, referenceMcpPath } from './reference-mcp.ts';
import { createPublicationStore, createRemotePublisher } from '../../../packages/plugin-publish-local/src/index.ts';
import { mountPublicViews, artworkResponse } from '../../share-server/src/routes.ts';
import { loadProjectEntries } from '../../../packages/skill-library/src/index.ts';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const skillEntries=await loadProjectEntries(root);
const mainSkill=skillEntries.find(entry=>entry.id==='data-art');
if(!mainSkill)throw new Error('The project data-art Skill entry is missing');
const mainSkillEntry=`${mainSkill.directory}/SKILL.md`;
const digitalArtSkill=skillEntries.find(entry=>entry.id==='digital-art');
const directory=path.resolve(process.env.ART_WORKBENCH_DIR??path.join(root,'.art-workbench'));
const port=Number(process.env.PORT??4318),base=`http://127.0.0.1:${port}`;
await mkdir(directory,{recursive:true});
const registry=new PluginRegistry();
const repository=registry.register(createLocalRepository({directory}));
const data=registry.register(createAvaPlugin({directory:path.join(directory,'ava')}));
const compiler=registry.register(createEsbuildCompiler({browserDataModule:artworkDataModule,runtimeEntry:path.join(root,'packages/plugin-renderer-three/src/runtime.ts'),runtimes:{'renderer.three':path.join(root,'packages/plugin-renderer-three/src/runtime.ts'),'renderer.canvas2d':path.join(root,'packages/plugin-renderer-canvas/src/runtime.ts'),'renderer.document':path.join(root,'packages/plugin-renderer-document/src/runtime.ts')}}));
const exporter=registry.register(createWebExporter());registry.register({manifest:rendererManifest});
registry.register({manifest:canvasManifest});registry.register({manifest:documentManifest});
if(data.manifest.id!=='data.ava')throw new Error('AVA is the required data core');
const service=new ProjectService({repository,data,compiler,exporter,registry});
let initialError:string|undefined;
const developerFixtures=process.env.ART_ENABLE_FIXTURES==='1'||['flow','ribbons'].includes(process.env.ART_BOOTSTRAP_PRESET??'');
async function newProject(name:string,preset:string,renderer?:string){
  if(renderer!==undefined&&(preset!=='blank'||!['renderer.canvas2d','renderer.three','renderer.document'].includes(renderer)))throw new WorkbenchError('invalid_renderer','Choose an installed renderer for a blank project');
  if(preset==='blank'){
    const selected=renderer??'renderer.canvas2d';
    const entry=selected==='renderer.document'?"export function createArtwork({root}) { root.replaceChildren(); return {}; }\n":selected==='renderer.three'?"import * as THREE from 'three'; export function createArtwork() { return { scene:new THREE.Scene(), camera:new THREE.PerspectiveCamera(45,1,.1,1000) }; }\n":"export function createArtwork() { return { draw({ctx,canvas}) { ctx.clearRect(0,0,canvas.width,canvas.height); } }; }\n";
    return service.create({name:name||'新作品',preset,renderer:selected,schema:[],bindings:[],files:[await sourceFile('src/artwork.ts',entry),await sourceFile('controls.json','[]\n')]});
  }
  if(findCase(preset)){
    const c=await loadCase(root,preset);
    let p=await service.create({name:name||c.definition.name,preset:c.definition.id,renderer:c.definition.renderer,bindings:c.bindings,schema:c.schema,files:c.files});
    p=await service.importData(p.id,{name:`${c.definition.id}.csv`,format:'csv',content:c.content},'system');
    p=await service.query(p.id,c.definition.sql,10000,'system');
    if(p.result?.truncated)throw new Error('Formal case result is truncated; refusing incomplete artwork');
    p=await service.notes(p.id,p.revision,c.notes,'system');
    p=await service.patch(p.id,p.revision,{paused:true},'system');
    await repository.checkpoint(p.id,'原始案例 · 数据与设计基线');
    return p;
  }
  if(!developerFixtures||(preset!=='flow'&&preset!=='ribbons'))throw new WorkbenchError('invalid_preset','Choose an available artwork case');
  let p=await service.create({name,preset,schema:controls,files:[await sourceFile('src/artwork.ts',artworkSource(preset)),await sourceFile('controls.json',JSON.stringify(controls,null,2))]});
  try{p=await service.importData(p.id,{name:'合成潮汐样本.csv',format:'csv',content:sampleCSV},'system');}catch(error){initialError=String(error);console.error('AVA sample import:',initialError);}
  return p;
}
if(!(await repository.list()).length){
  const defaultCase=findCase('skinbloom-ingredients')??caseCatalog[0];
  const preset=process.env.ART_BOOTSTRAP_PRESET??defaultCase?.id??'blank';
  const name=findCase(preset)?.name??(preset==='flow'?'潮汐书写 · Tide Atlas':'新作品');
  await newProject(name,preset);
}
const app=new Hono();
mountReferenceMcp(app,process.env);
const bindHost=process.env.ART_HOST??'127.0.0.1';
const access=serviceAccessFromEnv(port,process.env,bindHost);
const localPublications=createPublicationStore({directory:path.join(directory,'publications'),origin:base});
const publisher=registry.register(process.env.ART_SHARE_URL?createRemotePublisher({directory:path.join(directory,'published-links'),origin:process.env.ART_SHARE_URL,token:process.env.ART_SHARE_PUBLISH_TOKEN??''}):localPublications.plugin);
mountPublicViews(app,localPublications);
const wss=new WebSocketServer({noServer:true,maxPayload:20_000_000,handleProtocols:access.websocketProtocols});
const applied=new Map<string,{ack:RenderAck;socket:WebSocket;at:number}>();
const jobs=new Map<string,Job>();
const jobFiles=new Map<string,{bytes:Uint8Array;mimeType:string}>();
const captureTimers=new Map<string,ReturnType<typeof setTimeout>>();
function publicJob(job:Job):Job{return {...job,...(job.type==='export'&&job.status==='completed'?{previewPath:`/api/jobs/${job.id}/preview`}:{})};}
function jobState(job:Job,status:Job['status'],error?:string){job.status=status;if(error)job.error=error;void repository.saveJob(job).catch(e=>console.error('Job persistence:',e));}
for(const job of await repository.listJobs()){
  jobs.set(job.id,job);
  if(['queued','running'].includes(job.status))jobState(job,'failed','任务被服务重启中断，请重新执行');
  if(job.status==='completed')try{const ext=job.type==='capture'?'png':'html';jobFiles.set(job.id,{bytes:await readFile(path.join(directory,`export-${job.id}.${ext}`)),mimeType:ext==='png'?'image/png':'text/html'});}catch{jobState(job,'failed','导出文件已丢失，请重新导出');}
}
function broadcast(message:unknown){const text=JSON.stringify(message);for(const c of wss.clients)if(c.readyState===WebSocket.OPEN)c.send(text);}
function changed(p:Project){broadcast({type:'project.changed',projectId:p.id,revision:p.revision});return p;}
const thumbnails=createThumbnailCoordinator({repository,broadcast,isBusy:id=>[...jobs.values()].some(j=>j.projectId===id&&j.type==='capture'&&['queued','running'].includes(j.status))});
app.use('/api/*',access.middleware);
app.use('/api/*',async(c,next)=>{if(Number(c.req.header('content-length')??0)>20_000_000)return c.json({error:'payload_limit',message:'Request too large'},413);await next();});
app.onError((error,c)=>{console.error(error);return c.json({error:error instanceof WorkbenchError?error.code:'operation_failed',message:error.message},error instanceof WorkbenchError?error.status as any:400);});
app.get('/api/bootstrap',async c=>{const projects=await thumbnails.summaries();return c.json({plugins:registry.list(),projects,project:projects.length?await repository.get(projects[0].id):null,agent:{directory:root,skill:mainSkillEntry,digitalArtSkill:digitalArtSkill?`${digitalArtSkill.directory}/SKILL.md`:undefined},cases:caseCatalog.map(({id,name,description,caption})=>({id,name,description,caption})),warning:initialError});});
app.get('/api/projects',async c=>c.json(await thumbnails.summaries()));
app.get('/api/trash',async c=>{if(!repository.lifecycle)throw new WorkbenchError('capability_unavailable','Project recovery is unavailable',503);return c.json(await repository.lifecycle.listDeleted());});
app.delete('/api/projects/:id',async c=>{
  if(!repository.lifecycle)throw new WorkbenchError('capability_unavailable','Project recovery is unavailable',503);
  const id=c.req.param('id'),body=await c.req.json(),removed=await repository.lifecycle.trash(id,body.expectedRevision);
  applied.delete(id);thumbnails.forget(id);broadcast({type:'project.deleted',projectId:id});void observe().catch(error=>console.error('Project watcher:',error));
  return c.json(removed);
});
app.post('/api/projects/:id/restore',async c=>{
  if(!repository.lifecycle)throw new WorkbenchError('capability_unavailable','Project recovery is unavailable',503);
  const body=await c.req.json();return c.json(changed(await repository.lifecycle.restore(c.req.param('id'),body.expectedRevision)));
});
app.get('/api/projects/:id/thumbnail',async c=>{
  const image=await repository.thumbnails!.get(c.req.param('id'));
  if(!image||c.req.query('hash')!==image.record.contentHash)throw new WorkbenchError('thumbnail_missing','预览图片尚未生成或已更新。',404);
  return new Response(image.bytes as BodyInit,{headers:{'content-type':'image/png','cache-control':'private, max-age=31536000, immutable','etag':`"${image.record.contentHash}"`,'x-content-type-options':'nosniff'}});
});
app.get('/api/cases',c=>c.json(caseCatalog.map(({id,name,description,caption})=>({id,name,description,caption}))));
app.post('/api/projects',async c=>{const b=await c.req.json();return c.json(changed(await newProject(String(b.name??''),b.preset,b.renderer)));});
app.get('/api/projects/:id/context',async c=>{const id=c.req.param('id');const context=await service.context(id,Number(c.req.query('after')??0));const a=applied.get(id);return c.json({...context,renderer:a&&a.socket.readyState===WebSocket.OPEN?a.ack:null});});
app.get('/api/projects/:id/overview',async c=>{
  const id=c.req.param('id'),after=c.req.query('after'),limit=c.req.query('limit');
  const context=await readOverview(repository,id,{after:after===undefined?undefined:Number(after),limit:limit===undefined?undefined:Number(limit)}),a=applied.get(id);
  return c.json({...context,renderer:summarizeRenderer(a&&a.socket.readyState===WebSocket.OPEN?a.ack:undefined)});
});
app.get('/api/projects/:id/files',async c=>c.json(await readProjectFile(repository,c.req.param('id'),c.req.query('path')??'')));
app.get('/api/projects/:id/notes',async c=>c.json(await readProjectNotes(repository,c.req.param('id'))));
app.get('/api/projects/:id/result',async c=>{
  const offset=c.req.query('offset'),limit=c.req.query('limit');
  return c.json(await readProjectResult(repository,c.req.param('id'),{offset:offset===undefined?undefined:Number(offset),limit:limit===undefined?undefined:Number(limit)}));
});
app.patch('/api/projects/:id/state',async c=>{const b=await c.req.json();return c.json(changed(await service.patch(c.req.param('id'),b.expectedRevision,b.patch,c.req.header('x-art-actor')??'workbench')));});
app.put('/api/projects/:id/files',async c=>{const b=await c.req.json();return c.json(changed(await service.writeFiles(c.req.param('id'),b.expectedRevision,b.files,c.req.header('x-art-actor')??'workbench',b.bindings)));});
app.put('/api/projects/:id/notes',async c=>{const b=await c.req.json();return c.json(changed(await service.notes(c.req.param('id'),b.expectedRevision,b.notes,c.req.header('x-art-actor')??'workbench')));});
app.post('/api/projects/:id/data',async c=>c.json(changed(await service.importData(c.req.param('id'),await c.req.json(),c.req.header('x-art-actor')??'workbench'))));
app.post('/api/projects/:id/query',async c=>{const b=await c.req.json();return c.json(changed(await service.query(c.req.param('id'),b.sql,b.maxRows,c.req.header('x-art-actor')??'workbench',b.expectedRevision)));});
app.post('/api/projects/:id/explore',async c=>{const b=await c.req.json();return c.json(await service.inspectQuery(c.req.param('id'),b.sql,b.maxRows));});
app.post('/api/projects/:id/checkpoints',async c=>{const b=await c.req.json();const cp=await repository.checkpoint(c.req.param('id'),String(b.label??'创作检查点').slice(0,120));broadcast({type:'project.changed',projectId:cp.projectId});return c.json(cp);});
app.get('/api/projects/:id/checkpoints',async c=>c.json((await repository.checkpoints(c.req.param('id'))).map(({id,projectId,label,revision,createdAt})=>({id,projectId,label,revision,createdAt}))));
app.post('/api/projects/:id/checkpoints/:checkpoint/restore',async c=>{const b=await c.req.json();return c.json(changed(await service.restore(c.req.param('id'),c.req.param('checkpoint'),b.expectedRevision,c.req.header('x-art-actor')??'workbench')));});
app.get('/api/projects/:id/runtime',async c=>{const p=await repository.get(c.req.param('id'));const build=await compiler.compile(p);return c.json({hash:build.hash,codeHash:p.codeHash,html:runtimeHtml(build)});});
app.post('/api/projects/:id/exports',async c=>{
  const p=await repository.get(c.req.param('id'));const b=await c.req.json();if(b.revision!==p.revision)throw new WorkbenchError('revision_conflict','Project changed before export',409);
  if(!['web','png'].includes(b.type))throw new WorkbenchError('invalid_export','Unknown export format');
  if([...jobs.values()].filter(j=>['queued','running'].includes(j.status)).length>=4)throw new WorkbenchError('queue_full','请等待当前导出任务完成',429);
  const job:Job={id:crypto.randomUUID(),projectId:p.id,type:b.type==='png'?'capture':'export',status:'queued',revision:p.revision,createdAt:new Date().toISOString()};jobs.set(job.id,job);await repository.saveJob(job);
  const frozen=structuredClone(p);
  void(async()=>{try{
    jobState(job,'running');const build=await compiler.compile(frozen);
    if(b.type==='web'){const result=await exporter.export(frozen,build);jobFiles.set(job.id,{bytes:result.bytes,mimeType:result.mimeType});job.filename=result.filename;await writeFile(path.join(directory,'export-'+job.id+'.html'),result.bytes);jobState(job,'completed');}
    else {
      const width=b.width??1600,height=b.height??1200,time=b.time??frozen.state.time;
      if(!validCaptureSize(width,height)||!Number.isFinite(time)||time<0||time>3600)throw new Error('Invalid capture size or time');
      const renderer=await waitForRenderer({getRenderer:()=>applied.get(p.id),getRevision:async()=>(await repository.get(p.id)).revision,revision:p.revision,buildHash:build.hash,isActive:()=>job.status==='running'});
      renderer.socket.send(JSON.stringify({type:'capture',projectId:p.id,request:{id:job.id,revision:frozen.revision,buildHash:build.hash,width,height,time}}));
      captureTimers.set(job.id,setTimeout(()=>{if(job.status==='running')jobState(job,'failed','Renderer capture timed out');captureTimers.delete(job.id);},30000));
    }
  }catch(error){if(job.status==='running'||job.status==='queued')jobState(job,'failed',error instanceof WorkbenchError?`${error.code}: ${error.message}`:String(error));}})();
  return c.json(job);
});
// A publication is a frozen viewing artifact, never a link to the editable API.
app.post('/api/projects/:id/publications',async c=>{
  const p=await repository.get(c.req.param('id')),body=await c.req.json();
  if(body.revision!==p.revision)throw new WorkbenchError('revision_conflict','作品已更新，请重新读取后分享',409);
  const frozen=structuredClone(p),build=await compiler.compile(frozen),artifact=await exporter.export(frozen,build);
  return c.json(await publisher.publish({projectId:p.id,revision:p.revision,title:p.name,html:artifact.bytes}),201);
});
app.get('/api/projects/:id/publications',async c=>{await repository.get(c.req.param('id'));return c.json(await publisher.list(c.req.param('id')));});
app.delete('/api/projects/:id/publications/:publication',async c=>{await repository.get(c.req.param('id'));await publisher.revoke(c.req.param('id'),c.req.param('publication'));return c.body(null,204);});
app.get('/api/jobs/:id',c=>{const job=jobs.get(c.req.param('id'));if(!job)throw new WorkbenchError('job_missing','Unknown job',404);return c.json(publicJob(job));});
// Preview retains normal API access controls; it is not a new public publication.
app.get('/api/jobs/:id/preview',c=>{const job=jobs.get(c.req.param('id')),file=jobFiles.get(c.req.param('id'));if(!job)throw new WorkbenchError('job_missing','Unknown job',404);if(job.status!=='completed'||job.type!=='export'||!file)throw new WorkbenchError('job_incomplete','HTML export is not completed',409);return artworkResponse(file.bytes,"'self'");});
app.post('/api/jobs/:id/cancel',c=>{const j=jobs.get(c.req.param('id'));if(!j)throw new WorkbenchError('job_missing','Unknown job',404);if(['queued','running'].includes(j.status)){jobState(j,'canceled');clearTimeout(captureTimers.get(j.id));captureTimers.delete(j.id);}return c.json(j);});
app.get('/api/jobs/:id/download',c=>{const j=jobs.get(c.req.param('id'));const f=jobFiles.get(c.req.param('id'));if(j?.status!=='completed'||!f)throw new WorkbenchError('job_incomplete','Export is not completed',409);return new Response(f.bytes as BodyInit,{headers:{'content-type':f.mimeType,'content-disposition':`attachment; filename="${j.filename}"`}});});

let vite:ViteDevServer|undefined;
const listener=getRequestListener(app.fetch);
const server=createServer((req,res)=>{
  if(req.url?.startsWith('/api/')||req.url?.startsWith('/s/')||req.url?.startsWith('/embed/')||req.url?.split('?')[0]===referenceMcpPath){listener(req,res);return;}
  const requestPath=req.url?.split('?')[0]??'';
  const collectionPage=requestPath==='/collection.html'||/^\/artworks\/[a-z0-9-]+\.html$/.test(requestPath);
  if(vite&&!collectionPage){vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});return;}
  void(async()=>{try{const filename=new URL(req.url??'/',base).pathname;const target=path.resolve(root,'dist/workbench','.'+(filename==='/'?'/index.html':filename));const dist=path.resolve(root,'dist/workbench');if(!target.startsWith(dist+path.sep))throw new Error('path');const contents=await readFile(target);res.setHeader('content-type',target.endsWith('.html')?'text/html':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.svg')?'image/svg+xml':target.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(contents);}catch{res.statusCode=404;res.end('Not found');}})();
});
server.on('upgrade',(req,socket,head)=>{
  if(!req.url?.startsWith('/events'))return;
  if(!access.authorizeWebSocket(req).ok){socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',socket=>{
  const thumbnailSession:ThumbnailSession={isOpen:()=>socket.readyState===WebSocket.OPEN,send:message=>socket.send(JSON.stringify(message))};
  socket.on('message',async raw=>{try{
    const m=JSON.parse(raw.toString());
    if(m.type==='render.applied'){
      const p=await repository.get(m.projectId);const build=await compiler.compile(p);
      if(m.ack?.revision===p.revision&&m.ack?.buildHash===build.hash){applied.set(p.id,{ack:m.ack,socket,at:Date.now()});await thumbnails.observe(p,m.ack,thumbnailSession);}
    }
    if(m.type==='render.thumbnail'||m.type==='render.thumbnail.error')await thumbnails.receive(thumbnailSession,m);
    if(m.type==='render.capture'){
      const job=jobs.get(m.id);const active=job&&applied.get(job.projectId);
      if(!job||job.status!=='running'||active?.socket!==socket||m.revision!==job.revision||m.buildHash!==active.ack.buildHash||typeof m.png!=='string'||!m.png.startsWith('data:image/png;base64,'))return;
      const bytes=Buffer.from(m.png.split(',')[1],'base64');if(bytes.length>16_000_000||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG');
      clearTimeout(captureTimers.get(job.id));captureTimers.delete(job.id);jobFiles.set(job.id,{bytes,mimeType:'image/png'});job.filename=`${job.projectId}-r${job.revision}.png`;await writeFile(path.join(directory,'export-'+job.id+'.png'),bytes);jobState(job,'completed');
    }
    if(m.type==='render.error'&&m.jobId){const j=jobs.get(m.jobId);if(j?.status==='running'){jobState(j,'failed',m.message);clearTimeout(captureTimers.get(j.id));}}
  }catch(error){if(!(error instanceof WorkbenchError&&error.code==='project_deleted'))console.error('Renderer bridge:',error);}});
  socket.on('close',()=>{thumbnails.disconnect(thumbnailSession);for(const[id,a]of applied)if(a.socket===socket)applied.delete(id);});
});
if(!process.argv.includes('--production'))vite=await createViteServer({configFile:path.join(root,'apps/workbench/vite.config.ts'),server:{middlewareMode:true,ws:{server}},appType:'spa'});
server.listen(port,bindHost,()=>console.log(`Visloom ${base}`));

// File observations use the same hash/revision path as the editor. Do not infer an author's intent.
const watchers=new Map<string,ReturnType<typeof watch>>(),debounces=new Map<string,ReturnType<typeof setTimeout>>();
async function observe(){const projects=await repository.list(),active=new Set(projects.map(p=>p.id));
for(const[id,watcher]of watchers)if(!active.has(id)){watcher.close();watchers.delete(id);clearTimeout(debounces.get(id));debounces.delete(id);}
for(const p of projects)if(!watchers.has(p.id)){
  const dir=repository.getProjectDirectory(p.id);
  watchers.set(p.id,watch(dir,{recursive:true},(_event,filename)=>{
    if(!filename||!(/^(src\/.*\.(ts|js|glsl|vert|frag)|controls\.json)$/.test(filename.toString())))return;
    clearTimeout(debounces.get(p.id));debounces.set(p.id,setTimeout(async()=>{
      try{const current=await repository.get(p.id);const changes=[];const candidates=new Set(current.files.map(f=>f.path));const src=path.join(dir,'src');for(const entry of await readdir(src,{recursive:true}))if(/\.(ts|js|glsl|vert|frag)$/.test(entry))candidates.add('src/'+entry);
      for(const filename of candidates){const content=await readFile(path.join(dir,filename),'utf8');const old=current.files.find(f=>f.path===filename);if(await digest(content)!==old?.hash)changes.push({path:filename,content,expectedHash:old?.hash});}
      if(changes.length)changed(await service.writeFiles(p.id,current.revision,changes,'filesystem'));
      }catch(error){broadcast({type:'project.error',projectId:p.id,message:String(error)});}
    },350));
  }));
}}
await observe();const observer=setInterval(()=>void observe().catch(error=>console.error('Project watcher:',error)),3000);
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{thumbnails.dispose();clearInterval(observer);for(const w of watchers.values())w.close();for(const t of captureTimers.values())clearTimeout(t);for(const c of wss.clients)c.close();void registry.dispose().finally(()=>{server.close();void vite?.close();process.exit(0);});});
