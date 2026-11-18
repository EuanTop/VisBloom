import {ARTWORK_FILE_MAX_CHARACTERS} from '@art/contracts';
import type { PluginManifest, RendererPlugin, RendererInstance, RenderSnapshot, RenderAck, CaptureRequest, Project, Value, FrameClock, RuntimeState } from '@art/contracts';
export const rendererManifest: PluginManifest = {id:'renderer.three',kind:'renderer',version:'0.1.0',apiVersion:'1',capabilities:['scene','parameters','camera','pick','time','capture.png'],vendorVersion:'0.187.0'};
export interface ThreeInstance extends RendererInstance { preview(parameters:Record<string,Value>):void; select(id:string|null):void }
export function createThreeRenderer(options:{load:(project:Project)=>Promise<{hash:string;html:string;codeHash:string}>;onError?:(message:string)=>void;onSelected?:(id:string)=>void;onCamera?:(camera:unknown)=>void;onClock?:(clock:FrameClock)=>void;onParameters?:(parameters:Record<string,Value>,revision:number)=>void;onRuntimeState?:(runtime:RuntimeState,parameters:Record<string,Value>,revision:number)=>Promise<void>}):RendererPlugin {
  return {manifest:rendererManifest,mount(host,onAck){
    let active:HTMLIFrameElement|undefined,candidate:HTMLIFrameElement|undefined,activeCode='',activeHash='',latest:RenderSnapshot|undefined,disposed=false,loadingCode='',generation=0;
    let closeFileDialog:(()=>void)|undefined;
    const waiters=new Map<string,{resolve:(png:string)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
    const post=(frame:HTMLIFrameElement,type:string,data:object={})=>frame.contentWindow?.postMessage({channel:'art-host-v1',type,...data},'*');
    const send=(frame:HTMLIFrameElement,snapshot:RenderSnapshot,draft=false)=>post(frame,'apply',{snapshot,draft});
    let pending:{snapshot:RenderSnapshot;hash:string}|undefined;
    function message(event:MessageEvent){
      if(event.data?.channel!=='art-runtime-v1')return;
      const fromActive=event.source===active?.contentWindow,fromCandidate=event.source===candidate?.contentWindow;
      if(!fromActive&&!fromCandidate)return;const m=event.data;
      if(m.type==='clock'&&fromActive&&latest&&m.clock?.revision===latest.revision&&m.clock?.buildHash===activeHash&&Number.isFinite(m.clock?.time))options.onClock?.(m.clock);
      if(m.type==='ready'&&fromCandidate&&pending&&latest){send(candidate!,{...latest,buildHash:pending.hash});}
      if(m.type==='applied'){
        if(fromCandidate&&pending&&candidate){active?.remove();active=candidate;candidate=undefined;active.style.visibility='visible';active.style.position='absolute';activeCode=pending.snapshot.project.codeHash;activeHash=pending.hash;pending=undefined;loadingCode='';requestAnimationFrame(()=>{if(active&&latest)send(active,{...latest,buildHash:activeHash});});return;}
        if(m.ack?.buildHash===activeHash)onAck(m.ack as RenderAck);
      }
      if(m.type==='capture'){const waiter=waiters.get(m.id);if(waiter){clearTimeout(waiter.timer);waiters.delete(m.id);waiter.resolve(m.png);}}
      if(m.type==='parameters'&&fromActive&&latest&&Number.isInteger(m.revision)&&m.parameters&&typeof m.parameters==='object'&&!Array.isArray(m.parameters))options.onParameters?.(m.parameters,m.revision);
      if(m.type==='runtime-state'&&fromActive&&latest&&Number.isInteger(m.revision)){const frame=active!;const finish=(error?:string)=>post(frame,'runtime-state-saved',{id:m.id,error});if(options.onRuntimeState)void options.onRuntimeState(m.runtime,m.parameters??{},m.revision).then(()=>finish(),e=>finish(String(e)));else finish('当前宿主不支持保存形态');}
      if(m.type==='open-file'&&fromActive&&typeof m.id==='string'){
        closeFileDialog?.();const frame=active!,dialog=document.createElement('dialog');
        dialog.style.cssText='background:#141714;color:#ddd9c8;border:1px solid #4a4e40;border-radius:10px;padding:24px;max-width:440px;font:14px system-ui';
        const title=document.createElement('h2');title.textContent='载入形态';title.style.cssText='font:inherit;margin:0 0 20px';
        const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','选择形态文件');input.style.cssText='display:block;max-width:100%;margin-bottom:20px';
        const cancel=document.createElement('button');cancel.textContent='取消';cancel.type='button';cancel.style.cssText='border:1px solid #626550;background:none;color:inherit;border-radius:4px;padding:6px 14px;cursor:pointer';
        let done=false;const finish=(content?:string,error?:string)=>{if(done)return;done=true;dialog.close();dialog.remove();closeFileDialog=undefined;post(frame,'file-opened',{id:m.id,content,error});};
        closeFileDialog=()=>finish();cancel.onclick=()=>finish();dialog.oncancel=()=>finish();
        input.onchange=()=>{const file=input.files?.[0];if(!file)return;if(file.size>ARTWORK_FILE_MAX_CHARACTERS){finish(undefined,'形态文件过大');return;}input.disabled=true;void file.text().then(text=>finish(text),error=>finish(undefined,String(error)));};
        dialog.append(title,input,cancel);host.append(dialog);dialog.showModal();
      }
      if(m.type==='download-file'&&fromActive&&typeof m.name==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(m.name)&&typeof m.content==='string'&&m.content.length<=ARTWORK_FILE_MAX_CHARACTERS){const url=URL.createObjectURL(new Blob([m.content],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=m.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
      if(m.type==='selected')options.onSelected?.(m.id);
      if(m.type==='camera'&&fromActive)options.onCamera?.(m.camera);
      if(m.type==='error'){
        const w=waiters.get(m.requestId);if(w){clearTimeout(w.timer);waiters.delete(m.requestId);w.reject(new Error(m.message));return;}
        options.onError?.(m.message);
        if(fromCandidate){candidate?.remove();candidate=undefined;pending=undefined;loadingCode='';}
      }
    }
    window.addEventListener('message',message);host.style.position='relative';
    const instance:ThreeInstance={
      apply(snapshot){
        latest=structuredClone(snapshot);
        if(active&&activeCode===snapshot.project.codeHash){send(active,{...snapshot,buildHash:activeHash});return;}
        if(loadingCode===snapshot.project.codeHash)return;loadingCode=snapshot.project.codeHash;const serial=++generation;
        void options.load(snapshot.project).then(build=>{
          if(disposed||serial!==generation)return;
          if(build.codeHash!==snapshot.project.codeHash)throw new Error('作品代码已更新，正在等待最新版本');
          candidate?.remove();candidate=document.createElement('iframe');candidate.title='作品画布';candidate.setAttribute('sandbox','allow-scripts');candidate.setAttribute('allow','fullscreen');
          candidate.style.cssText='width:100%;height:100%;border:0;position:absolute;inset:0;visibility:hidden';
          pending={snapshot,hash:build.hash};candidate.srcdoc=build.html;host.append(candidate);
        }).catch(error=>{loadingCode='';options.onError?.(String(error));});
      },
      preview(parameters){if(active&&latest)send(active,{...latest,buildHash:activeHash,project:{...latest.project,state:{...latest.project.state,parameters:{...latest.project.state.parameters,...parameters}}}},true);},
      select(id){if(active)post(active,'select',{id});},
      async capture(request:CaptureRequest){
        if(!active||!latest||request.buildHash!==activeHash||request.revision!==latest.revision)throw new Error('Renderer version mismatch');
        // Clear any uncommitted local preview before capturing the authoritative snapshot.
        send(active,{...latest,buildHash:activeHash,time:latest.project.state.paused?latest.time:request.time});
        return new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(request.id);reject(new Error('Capture timed out'));},12000);waiters.set(request.id,{resolve,reject,timer});post(active!,'capture',{request});});
      },
      dispose(){disposed=true;closeFileDialog?.();generation++;window.removeEventListener('message',message);active?.remove();candidate?.remove();for(const w of waiters.values()){clearTimeout(w.timer);w.reject(new Error('Renderer closed'));}waiters.clear();}
    };
    return instance;
  }};
}
