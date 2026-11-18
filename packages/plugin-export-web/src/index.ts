import type { ExportPlugin, Project, BuildArtifact } from '@art/contracts';
export function runtimeHtml(build:BuildArtifact, project?:Project){
  const title=(project?.name??'Artwork').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]!));
  // Viewing needs compiled code, the selected result and state; private notes,
  // editable source files and dataset metadata belong to the project service.
  const publicProject=project?{id:project.id,name:project.name,revision:project.revision,updatedAt:project.updatedAt,state:project.state,schema:project.schema,preset:project.preset,renderer:project.renderer,playbackMode:project.playbackMode,codeHash:project.codeHash,files:[],notes:'',result:project.result?{id:project.result.id,datasetId:'',sql:'',columns:project.result.columns,rows:project.result.rows,rowCount:project.result.rowCount,truncated:project.result.truncated,createdAt:project.result.createdAt}:undefined}:undefined;
  const documentStyle=project?.renderer==='renderer.document'?'html,body{height:auto;min-height:100%;overflow-x:hidden;overflow-y:auto;background:#f5f0e6}':'';
  const initial=project?`window.__ART_BOOT__=${JSON.stringify({project:publicProject,buildHash:build.hash,revision:project.revision,time:project.state.time}).replace(/</g,'\\u003c')};`:'';
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101516}canvas{display:block}${documentStyle}</style><body><script>${initial}</script><script>${build.script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}
export function createWebExporter():ExportPlugin{return{manifest:{id:'export.web',kind:'exporter',version:'0.1.0',apiVersion:'1',capabilities:['web.standalone']},async export(project,build){return{filename:`${project.id}-r${project.revision}.html`,mimeType:'text/html',bytes:new TextEncoder().encode(runtimeHtml(build,project))};}};}
