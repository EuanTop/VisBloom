import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { dataColumnKinds } from '@art/contracts';
import { request, projectId, base, authHeaders } from './client.ts';
serveStdio(()=>{
  const server=new McpServer({name:'visbloom',version:'0.1.0'});
  const id=z.string().optional().describe('Project ID; omitted selects the latest project');
  const text=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]});
  function tool(name:string,description:string,inputSchema:any,action:(input:any)=>Promise<unknown>,readOnly=false,openWorld=false,destructive=false){
    server.registerTool(name,{description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:destructive,openWorldHint:openWorld}},async(input:any)=>{try{return text(await action(input));}catch(e){return{isError:true,content:[{type:'text' as const,text:String(e)}]};}});
  }
  tool('project_context','Read before edits. Use view=summary for bounded recent/incremental changes, file hashes and data samples; full preserves the original complete context response.',z.object({projectId:id,after:z.number().int().min(0).optional(),limit:z.number().int().min(1).max(100).optional(),view:z.enum(['summary','full']).optional()}),async i=>{
    const project=await projectId(i.projectId);
    if(i.view!=='summary')return request(`/api/projects/${project}/context?after=${i.after??0}`);
    const query=new URLSearchParams();if(i.after!==undefined)query.set('after',String(i.after));if(i.limit!==undefined)query.set('limit',String(i.limit));
    return request(`/api/projects/${project}/overview?${query}`);
  },true);
  tool('project_read_file','Read one artwork source or controls.json with revision and exact hash; avoids loading all data and checkpoint snapshots.',z.object({projectId:id,path:z.string()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/files?path=${encodeURIComponent(i.path)}`),true);
  tool('case_list','List authored case IDs, descriptions and data provenance entry points.',z.object({}),()=>request('/api/cases'),true);
  tool('project_create','Create an authored case from case_list, or a blank project with an optional installed renderer.',z.object({name:z.string(),preset:z.string(),renderer:z.enum(['renderer.document','renderer.canvas2d','renderer.three']).optional()}),i=>request('/api/projects','POST',i));
  tool('artwork_patch','Atomically update artwork parameters, mapping, seed or playback. Supply the revision from project_context; 409 means re-read, never silently overwrite.',z.object({projectId:id,expectedRevision:z.number().int(),patch:z.object({parameters:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).optional(),mapping:z.object({field:z.string(),transform:z.enum(['linear','log','reverse']),target:z.enum(['weight','height','density'])}).optional(),seed:z.number().int().optional(),time:z.number().optional(),paused:z.boolean().optional(),camera:z.object({position:z.tuple([z.number(),z.number(),z.number()]),target:z.tuple([z.number(),z.number(),z.number()])}).optional()})}),async i=>request(`/api/projects/${await projectId(i.projectId)}/state`,'PATCH',i));
  tool('project_write_files','Save source/controls with revision and file hashes. Include accurate bindings with source changes. Declare optional `requires` with the actual column names and value types needed by the artwork.',z.object({projectId:id,expectedRevision:z.number().int(),files:z.array(z.object({path:z.string(),content:z.string(),expectedHash:z.string().optional()})),bindings:z.array(z.object({field:z.string(),channel:z.string(),requires:z.record(z.string(),z.enum(dataColumnKinds)).optional()})).optional()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/files`,'PUT',i));
  tool('dataset_import','Load CSV or JSON through the required AVA data core. Source is preserved; no additional model key for structured execution.',z.object({projectId:id,name:z.string(),format:z.enum(['csv','json']),content:z.string()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/data`,'POST',i));
  tool('dataset_inspect','Analyze data through AVA without changing the project. Returns `dataFit` for the current artwork, including missing required columns and type mismatches. A result can be useful evidence even if it cannot replace canvas data.',z.object({projectId:id,sql:z.string(),maxRows:z.number().int().min(1).max(10000).default(200)}),async i=>request(`/api/projects/${await projectId(i.projectId)}/explore`,'POST',i),true);
  tool('dataset_query','Apply a read-only SQL result to the artwork, creating a project revision and replacing rendered data. Use dataset_inspect for temporary analysis.',z.object({projectId:id,sql:z.string(),maxRows:z.number().int().min(1).max(10000).default(200),expectedRevision:z.number().int().optional()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/query`,'POST',i));
  tool('project_notes','Save creator-confirmed meaning and decisions. Do not store guessed intentions as facts.',z.object({projectId:id,expectedRevision:z.number().int(),notes:z.string()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/notes`,'PUT',i));
  tool('checkpoint_create','Freeze source, data references, mapping and parameters as a named creative checkpoint.',z.object({projectId:id,label:z.string()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/checkpoints`,'POST',i));
  tool('checkpoint_restore','Restore a checkpoint as a new revision; retains later history. Requires current revision.',z.object({projectId:id,checkpointId:z.string(),expectedRevision:z.number().int()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/checkpoints/${i.checkpointId}/restore`,'POST',i));
  tool('artwork_export','Export independent Web artwork or request an actual PNG at a fixed revision/time. PNG requires a connected current renderer. Returns job ID; inspect job_status.',z.object({projectId:id,type:z.enum(['web','png']),revision:z.number().int(),width:z.number().int().optional(),height:z.number().int().optional(),time:z.number().optional()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/exports`,'POST',i));
  tool('artwork_share','Create a frozen viewing link only after the creator explicitly requests sharing. Publishes selected data and interaction, never editing authority. Local/public scope is returned.',z.object({projectId:z.string(),revision:z.number().int()}),async i=>request(`/api/projects/${await projectId(i.projectId)}/publications`,'POST',{revision:i.revision}),false,true);
  tool('artwork_shares','List this project’s viewing links.',z.object({projectId:id}),async i=>request(`/api/projects/${await projectId(i.projectId)}/publications`),true);
  tool('artwork_unshare','Revoke an explicitly selected viewing link. Requires the creator’s request.',z.object({projectId:z.string(),id:z.string().regex(/^[a-f0-9]{32}$/)}),async i=>{await request(`/api/projects/${i.projectId}/publications/${i.id}`,'DELETE');return {revoked:true,id:i.id};},false,true,true);
  tool('job_status','Read the true export/capture completion state; only completed means a file is ready.',z.object({id:z.string()}),i=>request(`/api/jobs/${i.id}`),true);
  server.registerTool('artwork_read_capture', {
    description: 'Read the image pixels of a completed VisBloom PNG capture. Use the job ID returned by capture. This reads an existing capture and includes its exact project and revision.',
    inputSchema: z.object({ id: z.uuid() }),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ id }) => {
    try {
      const job = await request(`/api/jobs/${id}`);
      if (job.status !== 'completed' || job.type !== 'capture') throw new Error('The job is not a completed PNG capture');
      const response = await fetch(`${base}/api/jobs/${id}/download`, { headers: authHeaders(), signal: AbortSignal.timeout(20_000), redirect: 'error' });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png') throw new Error('The completed PNG is unavailable');
      return { content: [
        { type: 'text' as const, text: JSON.stringify({ id, projectId: job.projectId, revision: job.revision }) },
        { type: 'image' as const, data: Buffer.from(await response.arrayBuffer()).toString('base64'), mimeType: 'image/png' },
      ] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: String(error) }] };
    }
  });
  server.registerTool('artwork_capture',{description:'Capture and return a real artwork PNG at the current project revision. Open workbench renderer must be connected. Does not capture editor controls.',inputSchema:z.object({projectId:id,revision:z.number().int(),time:z.number().min(0).max(3600).default(0),width:z.number().int().min(64).max(4096).default(1200),height:z.number().int().min(64).max(16384).default(900)})},async i=>{
    try{
      let job=await request(`/api/projects/${await projectId(i.projectId)}/exports`,'POST',{...i,type:'png'});
      const end=Date.now()+18000;while(['queued','running'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,150));job=await request(`/api/jobs/${job.id}`);}
      if(job.status!=='completed')throw new Error(job.error??`Capture ${job.status}; inspect job ${job.id}`);
      const response=await fetch(`${base}/api/jobs/${job.id}/download`,{headers:authHeaders()});if(!response.ok)throw new Error('Capture download failed');
      return{content:[{type:'text' as const,text:JSON.stringify(job)},{type:'image' as const,data:Buffer.from(await response.arrayBuffer()).toString('base64'),mimeType:'image/png'}]};
    }catch(e){return{isError:true,content:[{type:'text' as const,text:String(e)}]};}
  });
  return server;
});
