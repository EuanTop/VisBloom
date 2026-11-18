import { afterEach,describe,it,expect } from 'vitest';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginRegistry,ProjectService,sourceFile } from '@art/core';
import { createLocalRepository } from '../packages/plugin-storage-local/src/index';
import { createAvaPlugin } from '../packages/plugin-data-ava/src/index';
import { createEsbuildCompiler } from '../packages/plugin-compiler-esbuild/src/index';
import { createWebExporter } from '../packages/plugin-export-web/src/index';
import { controls,artworkSource } from '../apps/server/src/examples';
const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
async function fixture(){
 const directory=await mkdtemp(path.join(tmpdir(),'art-core-'));const registry=new PluginRegistry();
 const repository=registry.register(createLocalRepository({directory}));const data=registry.register(createAvaPlugin({directory:path.join(directory,'ava')}));
 const compiler=registry.register(createEsbuildCompiler({runtimeEntry:fileURLToPath(new URL('../packages/plugin-renderer-three/src/runtime.ts',import.meta.url))}));const exporter=registry.register(createWebExporter());
 const service=new ProjectService({repository,data,compiler,exporter,registry});
 cleanups.push(async()=>{await registry.dispose();await rm(directory,{recursive:true,force:true});});
 const project=await service.create({name:'原创合成测试',preset:'flow',schema:controls,files:[await sourceFile('src/artwork.ts',artworkSource('flow')),await sourceFile('controls.json',JSON.stringify(controls))]});
 return{service,repository,compiler,exporter,project};
}
describe('project workflow',()=>{
 it('commits source encoding descriptions atomically and clears stale descriptions while keeping human parameters',async()=>{
  const{service,repository,project}=await fixture();
  const source=project.files.find(f=>f.path==='src/artwork.ts')!;
  const bindings=[{field:'intensity',channel:'Visual weight used by artwork'}];
  const described=await service.writeFiles(project.id,project.revision,[{path:source.path,content:source.content,expectedHash:source.hash}],'agent',bindings);
  expect(described.bindings).toEqual(bindings);expect(described.codeHash).toBe(project.codeHash);
  const human=await service.patch(project.id,described.revision,{parameters:{speed:0.7}},'workbench');
  const events=await repository.events(project.id);
  await expect(service.writeFiles(project.id,human.revision,[{path:source.path,content:source.content+'\n// candidate',expectedHash:source.hash}],'agent',[{field:'intensity',channel:12} as any])).rejects.toMatchObject({code:'invalid_bindings'});
  expect(await repository.get(project.id)).toEqual(human);expect(await repository.events(project.id)).toEqual(events);
  const controls=human.files.find(f=>f.path==='controls.json')!;
  const controlsOnly=await service.writeFiles(project.id,human.revision,[{path:controls.path,content:controls.content+'\n',expectedHash:controls.hash}]);
  expect(controlsOnly.bindings).toEqual(bindings);
  const newGeometry=await service.writeFiles(project.id,controlsOnly.revision,[{path:source.path,content:source.content+'\n// new geometry',expectedHash:source.hash}]);
  expect(newGeometry.bindings).toEqual([]);expect(newGeometry.state.parameters.speed).toBe(0.7);
 });
 it('validates a whole change before commit and preserves human values through source edits',async()=>{
  const{service,repository,project}=await fixture();
  await expect(service.patch(project.id,project.revision,{parameters:{speed:0.7,density:900}})).rejects.toMatchObject({code:'invalid_parameter'});
  expect((await repository.get(project.id)).state.parameters.speed).toBe(0.3);expect(await repository.events(project.id)).toEqual([]);
  const p=await service.patch(project.id,project.revision,{parameters:{speed:0.7}},'agent');
  await expect(service.patch(p.id,project.revision,{paused:true})).rejects.toMatchObject({code:'revision_conflict'});
  const file=p.files.find(f=>f.path==='src/artwork.ts')!;
  const next=await service.writeFiles(p.id,p.revision,[{path:file.path,content:file.content+'\n// authored adjustment',expectedHash:file.hash}]);
  expect(next.state.parameters.speed).toBe(0.7);expect((await repository.events(p.id))[0].actor).toBe('agent');
  await expect(service.writeFiles(p.id,next.revision,[{path:file.path,content:'overwrite',expectedHash:file.hash}])).rejects.toMatchObject({code:'file_conflict'});
 });
 it('retains query assets, restores fixed data and builds an independent Web artwork',async()=>{
  const {service,repository,project,compiler,exporter}=await fixture();
  const imported=await service.importData(project.id,{name:'合成.csv',format:'csv',content:'intensity,group\n2,a\n5,a\n8,b\n'});
  const cp=await repository.checkpoint(project.id,'原始数据作品');
  const beforeInspect=await repository.get(project.id),beforeEvents=await repository.events(project.id);
  const inspected=await service.inspectQuery(project.id,'SELECT SUM(intensity) AS total FROM data');
  expect(inspected.rows[0].total).toBe(15);expect(inspected.revision).toBe(imported.revision);
  expect(await repository.get(project.id)).toEqual(beforeInspect);expect(await repository.events(project.id)).toEqual(beforeEvents);
  await expect(service.query(project.id,'SELECT * FROM data',200,'agent',imported.revision-1)).rejects.toMatchObject({code:'revision_conflict'});
  expect(await repository.get(project.id)).toEqual(beforeInspect);
  const queried=await service.query(project.id,'SELECT SUM(intensity) AS total FROM data');
  expect(queried.result?.rows[0].total).toBe(15);expect(queried.state.mapping.field).toBe('total');
  expect(JSON.parse(new TextDecoder().decode(await repository.getBlob(`results/${imported.result!.id}.json`))).rows).toHaveLength(3);
  const restored=await service.restore(project.id,cp.id,queried.revision);expect(restored.result?.rows).toHaveLength(3);expect(restored.revision).toBe(queried.revision+1);
  const build=await compiler.compile(restored);const exported=await exporter.export(restored,build);
  const html=new TextDecoder().decode(exported.bytes);expect(html).toContain('__ART_BOOT__');const frozen=JSON.parse(html.match(/window\.__ART_BOOT__=(.*?);<\/script>/s)![1]);expect(frozen.project.result.rows).toEqual(restored.result!.rows);expect(frozen.project.playbackMode).toBe('explicit');expect(frozen.project.dataset).toBeUndefined();expect(frozen.project.files).toEqual([]);expect(html).not.toContain('127.0.0.1');expect(html).not.toContain('/api/');
  const source=restored.files.find(f=>f.path==='src/artwork.ts')!;
  const bad=await service.writeFiles(project.id,restored.revision,[{path:source.path,content:'export function createArtwork( {',expectedHash:source.hash}]);
  await expect(compiler.compile(bad)).rejects.toMatchObject({code:'compile_failed'});expect((await compiler.compile(restored)).hash).toBe(build.hash);
 });
 it('keeps incompatible results available for analysis and prevents an incompatible commit', async () => {
  const {service,repository,project}=await fixture();
  const imported=await service.importData(project.id,{name:'测试.csv',format:'csv',content:'intensity,group\n2,a\n5,b\n'});
  const source=imported.files.find(file=>file.path==='src/artwork.ts')!;
  const withBinding=await service.writeFiles(project.id,imported.revision,[{...source,expectedHash:source.hash}],'agent',[
    {field:'intensity',channel:'形态',requires:{intensity:'number'}},
  ]);
  const summary='SELECT COUNT(*) AS count FROM data';
  const preview=await service.inspectQuery(project.id,summary);
  expect(preview.dataFit).toMatchObject({required:['intensity'],missing:['intensity'],incompatible:[]});
  const events=await repository.events(project.id);
  await expect(service.query(project.id,summary)).rejects.toMatchObject({code:'incompatible_artwork_data'});
  const textColumn='SELECT CAST(intensity AS VARCHAR) AS intensity FROM data';
  expect((await service.inspectQuery(project.id,textColumn)).dataFit.incompatible).toEqual([{field:'intensity',expected:'number'}]);
  await expect(service.query(project.id,textColumn)).rejects.toMatchObject({code:'incompatible_artwork_data'});
  expect(await repository.get(project.id)).toEqual(withBinding);
  expect(await repository.events(project.id)).toEqual(events);
  const accepted=await service.query(project.id,'SELECT * FROM data WHERE intensity > 2',200,'agent',withBinding.revision);
  expect(accepted.result?.rowCount).toBe(1);
  expect(accepted.revision).toBe(withBinding.revision+1);
 }, 15000);
 it('persists opaque simulation state across reload, checkpoint and Web export; clears it when source, seed or data changes',async()=>{
  const{service,repository,project,compiler,exporter}=await fixture();
  const runtime={kind:'physarum.gzip',version:1,data:'opaque-test-snapshot'};
  const saved=await service.patch(project.id,project.revision,{runtime,parameters:{speed:.7}});
  expect((await repository.get(project.id)).state.runtime).toEqual(runtime);
  const detail=(await repository.events(project.id)).at(-1)!.detail as any;expect(detail.after.runtime).toMatchObject({kind:runtime.kind,characters:runtime.data.length});expect(detail.after.runtime.data).toBeUndefined();expect(detail.after.runtime.hash).toMatch(/^[a-f0-9]{64}$/);
  const checkpoint=await repository.checkpoint(project.id,'Frozen simulation');
  const visual=await service.patch(project.id,saved.revision,{parameters:{speed:.8}});
  expect(visual.state.runtime).toEqual(runtime);
  const seeded=await service.patch(project.id,visual.revision,{seed:100});expect(seeded.state.runtime).toBeUndefined();
  const restored=await service.restore(project.id,checkpoint.id,seeded.revision);expect(restored.state.runtime).toEqual(runtime);
  const exported=await exporter.export(restored,await compiler.compile(restored));
  const boot=JSON.parse(new TextDecoder().decode(exported.bytes).match(/window\.__ART_BOOT__=(.*?);<\/script>/s)![1]);
  expect(boot.project.state.runtime).toEqual(runtime);expect(boot.project.files).toEqual([]);
  const source=restored.files.find(f=>f.path==='src/artwork.ts')!;
  const edited=await service.writeFiles(project.id,restored.revision,[{path:source.path,content:source.content+'\n// revised simulation',expectedHash:source.hash}]);expect(edited.state.runtime).toBeUndefined();
  const savedAgain=await service.patch(project.id,edited.revision,{runtime});
  const imported=await service.importData(project.id,{name:'fresh.csv',format:'csv',content:'intensity\n4\n',expectedRevision:savedAgain.revision});expect(imported.state.runtime).toBeUndefined();
  const querySaved=await service.patch(project.id,imported.revision,{runtime});
  expect((await service.query(project.id,'SELECT * FROM data',20,'agent',querySaved.revision)).state.runtime).toBeUndefined();
 });
 it('rejects malformed and oversized simulation state before committing',async()=>{
  const{service,repository,project}=await fixture();
  for(const runtime of [null,{kind:'../escape',version:1,data:'x'},{kind:'physarum.gzip',version:0,data:'x'},{kind:'physarum.gzip',version:1,data:42},{kind:'physarum.gzip',version:1,data:'x'.repeat(16_000_001)}]){
   await expect(service.patch(project.id,project.revision,{runtime} as any)).rejects.toMatchObject({code:'invalid_runtime_state'});
   expect((await repository.get(project.id)).revision).toBe(project.revision);
  }
 });
 it('rejects incompatible/duplicate plugins and project escape imports',async()=>{
  const registry=new PluginRegistry();expect(()=>registry.register({manifest:{id:'bad',kind:'data',version:'1',apiVersion:'99',capabilities:[]}})).toThrow(/unsupported/);
  const{service,compiler,project}=await fixture();const f=project.files.find(f=>f.path==='src/artwork.ts')!;
  const p=await service.writeFiles(project.id,project.revision,[{path:f.path,content:"import fs from 'node:fs'; export function createArtwork(){return fs}",expectedHash:f.hash}]);
  await expect(compiler.compile(p)).rejects.toMatchObject({code:'compile_failed'});
 });
});
