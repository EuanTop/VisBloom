import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { WorkbenchError, type Publication, type PublisherPlugin } from '../../contracts/src/index.ts';

// Full-resolution creator assets (font + two original posters) remain bounded.
export const MAX_PUBLICATION_BYTES=48_000_000;
const validId=(id:string)=>/^[a-f0-9]{32}$/.test(id);
export function publicationOrigin(value:string){
  const url=new URL(value);
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Publication URL must be an HTTPS origin or a loopback HTTP origin');
  return {origin:url.origin,scope:local?'local' as const:'public' as const};
}
export function createPublicationStore(options:{directory:string;origin:string}) {
  const {origin,scope}=publicationOrigin(options.origin);
  const filename=(id:string,extension:string)=>{
    if(!validId(id))throw new WorkbenchError('publication_missing','作品链接不存在或已撤回',404);
    return path.join(options.directory,id+extension);
  };
  async function read(id:string):Promise<Publication>{
    try{return JSON.parse(await readFile(filename(id,'.json'),'utf8'));}
    catch(error){if(error instanceof WorkbenchError)throw error;throw new WorkbenchError('publication_missing','作品链接不存在或已撤回',404);}
  }
  async function html(id:string){await read(id);return readFile(filename(id,'.html'));}
  const plugin:PublisherPlugin={
    manifest:{id:'publish.local',kind:'publisher',version:'0.1.0',apiVersion:'1',capabilities:['publication.link','publication.embed','publication.revoke']},
    async publish(input){
      if(!Number.isSafeInteger(input.revision)||input.revision<0||!input.title.trim()||!input.html.byteLength||input.html.byteLength>MAX_PUBLICATION_BYTES)throw new WorkbenchError('invalid_publication','作品为空或超过48MB',413);
      await mkdir(options.directory,{recursive:true});
      const id=randomBytes(16).toString('hex');
      const record:Publication={id,projectId:input.projectId,revision:input.revision,title:input.title.slice(0,200),createdAt:new Date().toISOString(),url:`${origin}/s/${id}`,embedUrl:`${origin}/embed/${id}`,scope,contentHash:createHash('sha256').update(input.html).digest('hex')};
      // Metadata appears only after a complete artifact exists. A crash cannot
      // expose a partially written HTML snapshot as a successful publication.
      await writeFile(filename(id,'.html'),input.html,{flag:'wx'});
      await writeFile(filename(id,'.json.tmp'),JSON.stringify(record),{flag:'wx'});
      await rename(filename(id,'.json.tmp'),filename(id,'.json'));
      return record;
    },
    async list(projectId){
      await mkdir(options.directory,{recursive:true});
      const records=await Promise.all((await readdir(options.directory)).filter(n=>/^[a-f0-9]{32}\.json$/.test(n)).map(n=>read(n.slice(0,-5))));
      return records.filter(p=>p.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    },
    async revoke(projectId,id){const record=await read(id);if(record.projectId!==projectId)throw new WorkbenchError('publication_missing','作品链接不存在',404);await unlink(filename(id,'.json'));await unlink(filename(id,'.html')).catch(()=>{});},
  };
  return {plugin,read,html};
}
export type PublicationStore=ReturnType<typeof createPublicationStore>;

/** Server-side adapter: the publishing key is never sent to the browser. */
export function createRemotePublisher(options:{directory:string;origin:string;token:string}):PublisherPlugin{
  const {origin}=publicationOrigin(options.origin);
  const recordPath=(id:string)=>{if(!validId(id))throw new WorkbenchError('publication_missing','Unknown publication',404);return path.join(options.directory,id+'.json');};
  async function call(route:string,method:string,body?:unknown,revokeToken?:string){
    const response=await fetch(origin+route,{method,headers:{authorization:`Bearer ${options.token}`,'content-type':'application/json',...(revokeToken?{'x-art-revoke-token':revokeToken}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30_000),redirect:'error'});
    if(!response.ok)throw new WorkbenchError('publication_unavailable',`分享服务返回 ${response.status}`,502);
    return method==='DELETE'?undefined:response.json();
  }
  return {manifest:{id:'publish.remote',kind:'publisher',version:'0.1.0',apiVersion:'1',capabilities:['publication.link','publication.embed','publication.revoke']},
    async publish(input){
      if(!options.token)throw new WorkbenchError('publication_unavailable','分享服务尚未配置',503);
      const response=await call('/api/publications','POST',{...input,html:Buffer.from(input.html).toString('base64')}) as Publication&{revokeToken:string};
      const {revokeToken,...value}=response;
      if(!/^[a-f0-9]{64}$/.test(revokeToken??''))throw new WorkbenchError('publication_invalid','分享服务未返回撤回权限',502);
      if(!value||!validId(value.id)||value.revision!==input.revision||value.projectId!==input.projectId||value.url!==`${origin}/s/${value.id}`||value.embedUrl!==`${origin}/embed/${value.id}`||value.contentHash!==createHash('sha256').update(input.html).digest('hex'))throw new WorkbenchError('publication_invalid','分享服务未确认正确的作品版本',502);
      await mkdir(options.directory,{recursive:true});await writeFile(recordPath(value.id),JSON.stringify({publication:value,revokeToken}),{flag:'wx',mode:0o600});return value;
    },
    async list(projectId){await mkdir(options.directory,{recursive:true});const records=await Promise.all((await readdir(options.directory)).filter(n=>/^[a-f0-9]{32}\.json$/.test(n)).map(n=>readFile(path.join(options.directory,n),'utf8').then(t=>{const saved=JSON.parse(t);return (saved.publication??saved) as Publication;})));return records.filter(p=>p.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));},
    async revoke(projectId,id){const saved=JSON.parse(await readFile(recordPath(id),'utf8')),record=saved.publication as Publication;if(record.projectId!==projectId)throw new WorkbenchError('publication_missing','Unknown publication',404);await call('/api/publications/'+id,'DELETE',undefined,saved.revokeToken);await unlink(recordPath(id));},
  };
}
