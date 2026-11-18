import { RUNTIME_STATE_MAX_CHARACTERS, API_VERSION, WorkbenchError, type Plugin, type PluginKind, type Project, type RepositoryPlugin, type DataPlugin, type CompilerPlugin, type ExportPlugin, type ArtworkState, type SourceFile, type Parameter, type ProjectEvent } from '@art/contracts';
import { checkDataFit, validDataBindings } from './data-fit';

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  register<T extends Plugin>(plugin: T): T {
    const {id, apiVersion} = plugin.manifest;
    if (apiVersion !== API_VERSION) throw new WorkbenchError('plugin_protocol', `${id}: unsupported plugin API ${apiVersion}`);
    if (this.plugins.has(id)) throw new WorkbenchError('plugin_duplicate', `${id} already registered`);
    this.plugins.set(id, plugin); return plugin;
  }
  list() { return [...this.plugins.values()].map(p => structuredClone(p.manifest)); }
  require(kind: PluginKind, capability?: string) {
    const plugin = [...this.plugins.values()].find(p => p.manifest.kind === kind && (!capability || p.manifest.capabilities.includes(capability)));
    if (!plugin) throw new WorkbenchError('capability_unavailable', `No ${kind} plugin supports ${capability ?? kind}`, 503);
    return plugin;
  }
  async dispose() { for (const plugin of [...this.plugins.values()].reverse()) await plugin.dispose?.(); }
}
export async function digest(input: string | Uint8Array) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function sourceFile(path: string, content: string): Promise<SourceFile> { return {path, content, hash: await digest(content)}; }
export function validateSchema(schema: unknown): Parameter[] {
  if (!Array.isArray(schema) || schema.length > 80) throw new WorkbenchError('invalid_schema', 'controls.json must be an array of up to 80 controls');
  const ids = new Set<string>();
  for (const p of schema) {
    if (!p || !/^[a-zA-Z][\w.-]{0,63}$/.test(p.id) || ids.has(p.id) || typeof p.label !== 'string' || !['number','color','select','boolean'].includes(p.type)) throw new WorkbenchError('invalid_schema', 'Controls need unique IDs, labels and valid types');
    ids.add(p.id);
    if (p.type === 'number' && (typeof p.default !== 'number' || !Number.isFinite(p.default) || (p.min !== undefined && !Number.isFinite(p.min)) || (p.max !== undefined && !Number.isFinite(p.max)) || (p.min !== undefined && p.max !== undefined && p.min > p.max))) throw new WorkbenchError('invalid_schema','Invalid numeric control');
    if (p.type === 'select' && (!Array.isArray(p.options) || !p.options.length || !p.options.every((v: unknown)=>typeof v==='string') || !p.options.includes(p.default))) throw new WorkbenchError('invalid_schema','Select requires options and a matching default');
    validateParameter(p, p.default);
  }
  return schema as Parameter[];
}
export function validateParameter(p: Parameter, value: unknown) {
  if (p.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || (p.min !== undefined && value < p.min) || (p.max !== undefined && value > p.max))) throw new WorkbenchError('invalid_parameter', `${p.label}: value outside allowed range`);
  if (p.type === 'boolean' && typeof value !== 'boolean') throw new WorkbenchError('invalid_parameter',`${p.label}: expected boolean`);
  if (p.type === 'color' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new WorkbenchError('invalid_parameter',`${p.label}: expected hex color`);
  if (p.type === 'select' && !p.options?.includes(value as string)) throw new WorkbenchError('invalid_parameter',`${p.label}: unknown option`);
}
export function validateState(state: ArtworkState, schema: Parameter[], columns?: string[]) {
  if(state.runtime!==undefined && (!state.runtime||!/^[a-z][a-z0-9.-]{0,63}$/.test(state.runtime.kind)||!Number.isSafeInteger(state.runtime.version)||state.runtime.version<1||typeof state.runtime.data!=='string'||state.runtime.data.length>RUNTIME_STATE_MAX_CHARACTERS))throw new WorkbenchError('invalid_runtime_state','Invalid or oversized artwork state');
  for(const [key,value] of Object.entries(state.parameters)) {
    const p=schema.find(p=>p.id===key); if(!p) throw new WorkbenchError('invalid_parameter',`Unknown parameter: ${key}`); validateParameter(p,value);
  }
  if(schema.some(p=>state.parameters[p.id]===undefined)) throw new WorkbenchError('invalid_parameter','Missing parameter');
  if(!Number.isSafeInteger(state.seed) || state.seed<0 || state.seed>4294967295 || !Number.isFinite(state.time) || state.time<0 || state.time>3600 || typeof state.paused!=='boolean') throw new WorkbenchError('invalid_state','Invalid seed, playback or time');
  if(!state.mapping || !['linear','log','reverse'].includes(state.mapping.transform) || !['weight','height','density'].includes(state.mapping.target) || typeof state.mapping.field !=='string') throw new WorkbenchError('invalid_mapping','Invalid mapping');
  if(columns?.length && !columns.includes(state.mapping.field)) throw new WorkbenchError('invalid_mapping',`Unknown data column: ${state.mapping.field}`);
  if(state.camera && ![state.camera.position,state.camera.target].every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000)))throw new WorkbenchError('invalid_camera','Invalid camera coordinates');
}

// Keep large simulation buffers in project/checkpoint storage, not duplicated in every audit event.
async function eventState(state:ArtworkState){
  return state.runtime?{...state,runtime:{kind:state.runtime.kind,version:state.runtime.version,characters:state.runtime.data.length,hash:await digest(state.runtime.data)}}:state;
}

interface Services { repository: RepositoryPlugin; data: DataPlugin; compiler: CompilerPlugin; exporter: ExportPlugin; registry: PluginRegistry }
export class ProjectService {
  constructor(public readonly ports: Services) {}
  private get repo() { return this.ports.repository; }
  async create(input: {name: string; preset: Project['preset']; renderer?: string; bindings?: Project['bindings']; files: SourceFile[]; schema: Parameter[]}) {
    const schema=validateSchema(input.schema);
    const project: Project={id:crypto.randomUUID(),name:input.name.trim().slice(0,120)||'未命名作品',preset:input.preset,revision:1,updatedAt:new Date().toISOString(),schema,files:input.files,codeHash:await this.codeHash(input.files),notes:'',playbackMode:'explicit',state:{parameters:Object.fromEntries(schema.map(p=>[p.id,p.default])),mapping:{field:'intensity',transform:'linear',target:'weight'},seed:42,time:0,paused:false}};
    if(input.renderer)project.renderer=input.renderer;
    if(input.bindings)project.bindings=structuredClone(input.bindings);
    await this.repo.create(project); await this.repo.syncFiles(project); return project;
  }
  private async codeHash(files: SourceFile[]) { return digest(files.map(f=>`${f.path}:${f.hash}`).sort().join('\n')); }
  async context(id:string,after=0) { return {project:await this.repo.get(id),events:await this.repo.events(id,after),checkpoints:await this.repo.checkpoints(id),plugins:this.ports.registry.list()}; }
  async commit(id:string, expected:number, next:Project, type:string, detail:unknown, actor='workbench') {
    next={...next,revision:expected+1,updatedAt:new Date().toISOString()};
    const event:Omit<ProjectEvent,'cursor'>={projectId:id,revision:next.revision,type,actor,detail,at:next.updatedAt};
    return this.repo.commit(id,expected,next,event);
  }
  async patch(id:string,expected:number,patch:Partial<ArtworkState>,actor='workbench') {
    const project=await this.repo.get(id);
    if(!patch||typeof patch!=='object'||Object.keys(patch).some(k=>!['parameters','mapping','seed','time','paused','camera','runtime'].includes(k))) throw new WorkbenchError('invalid_state','Unknown state property');
    const state={...project.state,...patch,...(patch.seed!==undefined&&patch.seed!==project.state.seed&&patch.runtime===undefined?{runtime:undefined}:{}),parameters:{...project.state.parameters,...patch.parameters},mapping:{...project.state.mapping,...patch.mapping}};
    validateState(state,project.schema,project.result?.columns);
    this.validateMapping(state,project.result?.rows??[]);
    return this.commit(id,expected,{...project,state},'state.changed',{before:await eventState(project.state),after:await eventState(state)},actor);
  }
  async writeFiles(id:string,expected:number,changes:{path:string;content:string;expectedHash?:string}[],actor='workbench',bindings?:Project['bindings']) {
    const project=await this.repo.get(id); const files=structuredClone(project.files);
    if(!Array.isArray(changes)||!changes.length||changes.length>30) throw new WorkbenchError('invalid_files','Provide 1–30 files');
    if(bindings!==undefined&&!validDataBindings(bindings))throw new WorkbenchError('invalid_bindings','Encoding descriptions need a field, a channel, and valid optional column requirements');
    let changedSource=false;
    for(const change of changes) {
      if(!/^(controls\.json|src\/[\w./-]+\.(ts|js|glsl|vert|frag))$/.test(change.path)||change.path.split('/').includes('..')) throw new WorkbenchError('invalid_path','Only project artwork sources and controls.json may be edited');
      if(typeof change.content!=='string')throw new WorkbenchError('invalid_file_content',`Artwork file must contain text: ${change.path}`);
      if(change.content.length>500_000)throw new WorkbenchError('source_too_large',`Artwork file exceeds 500,000 characters: ${change.path}`,413);
      const index=files.findIndex(f=>f.path===change.path); const old=files[index];
      if(change.path!=='controls.json'&&old?.content!==change.content)changedSource=true;
      if(old && change.expectedHash!==old.hash) throw new WorkbenchError('file_conflict',`Source changed: ${change.path}`,409);
      const file=await sourceFile(change.path,change.content); if(index>=0)files[index]=file;else files.push(file);
    }
    const schema=validateSchema(JSON.parse(files.find(f=>f.path==='controls.json')!.content));
    const parameters=Object.fromEntries(schema.map(p=>{let v=project.state.parameters[p.id];try{validateParameter(p,v);}catch{v=p.default;}return[p.id,v];}));
    const nextBindings=bindings!==undefined?{bindings:structuredClone(bindings)}:changedSource?{bindings:[]} : {};
    return this.commit(id,expected,{...project,...nextBindings,files,schema,state:{...project.state,parameters,...(changedSource?{runtime:undefined}:{})},codeHash:await this.codeHash(files)},'files.changed',{paths:changes.map(f=>f.path),beforeHash:project.codeHash,...(bindings!==undefined||changedSource?{bindings:bindings??[]}: {})},actor);
  }
  async notes(id:string,expected:number,notes:string,actor='workbench') { const p=await this.repo.get(id); if(typeof notes!=='string'||notes.length>30000)throw new WorkbenchError('invalid_notes','Notes too long');return this.commit(id,expected,{...p,notes},'notes.changed',{notes},actor); }
  async importData(id:string,input:{name:string;format:'csv'|'json';content:string;expectedRevision?:number},actor='workbench') {
    const p=await this.repo.get(id); if(!['csv','json'].includes(input.format)||!input.content||input.content.length>8_000_000)throw new WorkbenchError('invalid_data','Import a CSV/JSON file up to 8 MB');
    if(input.expectedRevision!==undefined&&(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision!==p.revision))throw new WorkbenchError('revision_conflict',`Project is at revision ${p.revision}; re-read before importing data`,409);
    const bytes=new TextEncoder().encode(input.content); const datasetId=crypto.randomUUID();
    await this.repo.putBlob(`datasets/${datasetId}.${input.format}`,bytes);
    const info=await this.ports.data.importData({id:datasetId,name:input.name,format:input.format,bytes});
    const dataset={id:datasetId,name:input.name.slice(0,120),format:input.format,bytes:bytes.length,hash:await digest(bytes),createdAt:new Date().toISOString(),...info};
    const result=await this.ports.data.query({datasetId,sql:'SELECT * FROM data',maxRows:200});
    const dataResult={...result,id:crypto.randomUUID(),datasetId,sql:'SELECT * FROM data',createdAt:new Date().toISOString()};
    await this.repo.putBlob(`results/${dataResult.id}.json`,new TextEncoder().encode(JSON.stringify(dataResult)));
    const numeric=result.columns.find(c=>result.rows.some(r=>typeof r[c]==='number'))??result.columns[0]??'intensity';
    const field=result.columns.includes(p.state.mapping.field)?p.state.mapping.field:numeric;
    const state={...p.state,runtime:undefined,mapping:{...p.state.mapping,field}};this.validateMapping(state,result.rows);
    return this.commit(id,p.revision,{...p,dataset,result:dataResult,state},'data.imported',{datasetId,name:dataset.name,resultId:dataResult.id},actor);
  }
  async ensureData(p:Project) {
    if(!p.dataset)throw new WorkbenchError('dataset_missing','Import data first');
    const bytes=await this.repo.getBlob(`datasets/${p.dataset.id}.${p.dataset.format}`);
    await this.ports.data.importData({id:p.dataset.id,name:p.dataset.name,format:p.dataset.format,bytes});
  }
  async inspectQuery(id:string,sql:string,maxRows=200) {
    const p=await this.repo.get(id);
    if(!Number.isInteger(maxRows)||maxRows<1||maxRows>10000)throw new WorkbenchError('invalid_limit','maxRows must be 1–10000');
    await this.ensureData(p);
    const result=await this.ports.data.query({datasetId:p.dataset!.id,sql,maxRows});
    return {projectId:p.id,revision:p.revision,datasetId:p.dataset!.id,sql,...result,dataFit:checkDataFit(p.bindings??[],result,p.result?.columns??[])};
  }
  async query(id:string,sql:string,maxRows=200,actor='workbench',expectedRevision?:number) {
    const p=await this.repo.get(id);if(!Number.isInteger(maxRows)||maxRows<1||maxRows>10000)throw new WorkbenchError('invalid_limit','maxRows must be 1–10000');
    if(expectedRevision!==undefined&&(!Number.isSafeInteger(expectedRevision)||expectedRevision!==p.revision))throw new WorkbenchError('revision_conflict',`Project is at revision ${p.revision}; re-read before applying query`,409);
    await this.ensureData(p);const result=await this.ports.data.query({datasetId:p.dataset!.id,sql,maxRows});
    const fit=checkDataFit(p.bindings??[],result,p.result?.columns??[]);
    if(fit.missing.length||fit.incompatible.length){
      const details=[fit.missing.length?`缺少字段 ${fit.missing.join('、')}`:'',...fit.incompatible.map(({field,expected})=>`${field} 需要 ${expected}`)].filter(Boolean);
      throw new WorkbenchError('incompatible_artwork_data',`查询可用于分析，无法用于当前画布：${details.join('；')}`);
    }
    const dataResult={...result,id:crypto.randomUUID(),datasetId:p.dataset!.id,sql,createdAt:new Date().toISOString()};
    const field=result.columns.includes(p.state.mapping.field)?p.state.mapping.field:result.columns.find(c=>result.rows.some(r=>typeof r[c]==='number'))??result.columns[0]??'intensity';
    const state={...p.state,runtime:undefined,mapping:{...p.state.mapping,field}};this.validateMapping(state,result.rows);
    await this.repo.putBlob(`results/${dataResult.id}.json`,new TextEncoder().encode(JSON.stringify(dataResult)));
    return this.commit(id,p.revision,{...p,result:dataResult,state},'data.queried',{sql,resultId:dataResult.id,previousResultId:p.result?.id,previousRows:p.result?.rowCount,rows:result.rowCount,truncated:result.truncated},actor);
  }
  private validateMapping(state:ArtworkState,rows:Record<string,unknown>[]) {
    const values=rows.map(r=>r[state.mapping.field]).filter(v=>v!==null&&v!==undefined);
    if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new WorkbenchError('invalid_mapping','形态映射需要数值字段');
    if(state.mapping.transform==='log'&&values.some(v=>(v as number)<0))throw new WorkbenchError('invalid_mapping','对数映射不接受负值，请先选择线性映射或处理数据');
  }
  async restore(id:string,checkpointId:string,expected:number,actor='workbench') {
    const cp=await this.repo.getCheckpoint(id,checkpointId);return this.commit(id,expected,{...cp.project,id},'checkpoint.restored',{checkpointId,label:cp.label},actor);
  }
}
