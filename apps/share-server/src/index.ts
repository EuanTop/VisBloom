import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { createPublicationStore, MAX_PUBLICATION_BYTES } from '../../../packages/plugin-publish-local/src/index.ts';
import { WorkbenchError } from '../../../packages/contracts/src/index.ts';
import { mountPublicViews } from './routes.ts';

const port=Number(process.env.SHARE_PORT??4320);
const origin=process.env.ART_SHARE_PUBLIC_ORIGIN??`http://127.0.0.1:${port}`;
const token=process.env.ART_SHARE_PUBLISH_TOKEN;
if(!token||token.length<24)throw new Error('Set ART_SHARE_PUBLISH_TOKEN to at least 24 characters');
const shareDirectory=path.resolve(process.env.ART_SHARE_DIR??'.art-shares');
const store=createPublicationStore({directory:shareDirectory,origin});
const caps=path.join(shareDirectory,'revocation');await mkdir(caps,{recursive:true});
const app=new Hono();
app.onError((e,c)=>c.json({error:e instanceof WorkbenchError?e.code:'operation_failed',message:e instanceof WorkbenchError?e.message:'分享服务暂不可用'},e instanceof WorkbenchError?e.status as any:500));
mountPublicViews(app,store);
app.use('/api/*',async(c,next)=>{
  const actual=Buffer.from(c.req.header('authorization')??''),expected=Buffer.from(`Bearer ${token}`);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return c.json({error:'unauthorized'},401);
  if(c.req.header('origin'))return c.json({error:'server_publish_only'},403);
  await next();
});
app.post('/api/publications',async c=>{
  const declared=Number(c.req.header('content-length')??0);
  if(declared>MAX_PUBLICATION_BYTES*1.4)throw new WorkbenchError('payload_limit','作品过大',413);
  const reader=c.req.raw.body?.getReader();if(!reader)throw new WorkbenchError('invalid_publication','作品为空');
  let length=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>MAX_PUBLICATION_BYTES*1.4){await reader.cancel();throw new WorkbenchError('payload_limit','作品过大',413);}chunks.push(part.value);}
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new WorkbenchError('invalid_publication','无效作品');}
  if(typeof value.projectId!=='string'||typeof value.title!=='string'||typeof value.html!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.html))throw new WorkbenchError('invalid_publication','无效作品');
  const record=await store.plugin.publish({...value,html:Buffer.from(value.html,'base64')});
  const revokeToken=randomBytes(32).toString('hex');
  await writeFile(path.join(caps,record.id),createHash('sha256').update(revokeToken).digest('hex'),{flag:'wx',mode:0o600});
  return c.json({...record,revokeToken},201);
});
app.delete('/api/publications/:id',async c=>{
  const p=await store.read(c.req.param('id')),actual=c.req.header('x-art-revoke-token')??'';
  let expected:string;try{expected=await readFile(path.join(caps,p.id),'utf8');}catch{throw new WorkbenchError('unauthorized','缺少此链接的撤回权限',403);}
  const hash=createHash('sha256').update(actual).digest('hex');
  if(!actual||!timingSafeEqual(Buffer.from(hash),Buffer.from(expected)))throw new WorkbenchError('unauthorized','缺少此链接的撤回权限',403);
  await store.plugin.revoke(p.projectId,p.id);await unlink(path.join(caps,p.id));return c.body(null,204);
});
app.get('/health',c=>c.json({ready:true}));
createServer(getRequestListener(app.fetch)).listen(port,process.env.SHARE_HOST??'127.0.0.1',()=>console.log(`Visloom sharing ${origin}`));
