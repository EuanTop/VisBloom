import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { WorkbenchError, type CompilerPlugin } from '@art/contracts';
export function createEsbuildCompiler(options:{runtimeEntry:string;runtimes?:Record<string,string>;browserDataModule?:()=>string}):CompilerPlugin {
  const cache=new Map<string,Awaited<ReturnType<CompilerPlugin['compile']>>>();
  return {
    manifest:{id:'compiler.esbuild',kind:'compiler',version:'0.1.0',apiVersion:'1',capabilities:['typescript','glsl','artwork.bundle'],vendorVersion:'0.28.2'},
    async compile(project){
      const runtimeEntry=project.renderer?options.runtimes?.[project.renderer]??(project.renderer==='renderer.three'?options.runtimeEntry:undefined):options.runtimeEntry;
      if(!runtimeEntry)throw new WorkbenchError('renderer_unavailable',`Renderer ${project.renderer} is not installed`,422);
      const key=runtimeEntry+':'+project.codeHash;
      const cached=cache.get(key);if(cached)return cached;
      const files=new Map(project.files.map(f=>[f.path,f.content]));
      try{
        // Workspaces use npm. Resolve from the explicit module directories even
        // when an unrelated parent directory contains a Yarn PnP manifest.
        const result=await build({absWorkingDir:path.parse(path.resolve(runtimeEntry)).root,stdin:{contents:`import {boot} from ${JSON.stringify(runtimeEntry)};import {createArtwork} from 'artwork:src/artwork.ts';try{boot(createArtwork)}catch(error){parent.postMessage({channel:'art-runtime-v1',type:'error',message:String(error)},'*')}`,resolveDir:path.dirname(runtimeEntry),sourcefile:'art-entry.ts'},bundle:true,write:false,platform:'browser',format:'iife',target:'es2022',minify:true,logLevel:'silent',plugins:[{
          name:'project-files',setup(builder){
            builder.onResolve({filter:/^artwork:/},args=>({path:args.path.slice(8),namespace:'artwork'}));
            builder.onLoad({filter:/^@art\/artwork-data$/,namespace:'artwork-data'},()=>({
              contents: options.browserDataModule!(), loader:'js', resolveDir:path.dirname(runtimeEntry),
            }));
            builder.onResolve({filter:/.*/,namespace:'artwork'},async args=>{
              if(args.path==='three'||args.path.startsWith('three/'))return builder.resolve(args.path,{resolveDir:path.dirname(runtimeEntry),kind:'import-statement'});
              if(args.path==='@art/artwork-data'&&options.browserDataModule)return {path:args.path,namespace:'artwork-data'};
              if(!args.path.startsWith('.'))throw new Error(`Artwork import not available: ${args.path}`);
              let filename=path.posix.normalize(path.posix.join(path.posix.dirname(args.importer),args.path));
              if(!files.has(filename))filename+='.ts';
              if(!filename.startsWith('src/')||!files.has(filename))throw new Error(`Unknown project module: ${args.path}`);
              return {path:filename,namespace:'artwork'};
            });
            builder.onLoad({filter:/.*/,namespace:'artwork'},args=>{const contents=files.get(args.path);if(contents===undefined)throw new Error(`Missing ${args.path}`);return{contents,loader:/\.(glsl|vert|frag)$/.test(args.path)?'text':'ts',resolveDir:path.dirname(runtimeEntry)};});
          }
        }]});
        const script=result.outputFiles[0].text;
        const artifact={hash:createHash('sha256').update(script).digest('hex'),script,createdAt:new Date().toISOString()};
        if(cache.size>20)cache.delete(cache.keys().next().value!);cache.set(key,artifact);return artifact;
      }catch(error){throw new WorkbenchError('compile_failed',String(error),422);}
    }
  };
}
