import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ArtworkObject, Project, Value, PlaybackInfo, FrameClock } from '@art/contracts';
import { createThreeRenderer, type ThreeInstance } from '../../../packages/plugin-renderer-three/src/index';
import { createCanvasRenderer } from '../../../packages/plugin-renderer-canvas/src/index';
import { createDocumentRenderer } from '../../../packages/plugin-renderer-document/src/index';
import { api, json, eventsURL, eventsProtocols } from './api';
export interface PreviewStatus {message?:string;error?:string;objects?:ArtworkObject[];selectedId?:string|null;timeline?:PlaybackInfo;frameTime?:number}
export default function Preview({project,onStatus,selectedObject,draftParameters,onProject}:{project:Project;onProject?:(project:Project)=>void;onStatus?:(status:PreviewStatus)=>void;selectedObject?:string|null;draftParameters?:Record<string,Value>}){
  const accept=useRef(onProject);accept.current=onProject;
  const host=useRef<HTMLDivElement>(null),instance=useRef<ThreeInstance|null>(null),current=useRef(project),status=useRef(onStatus);
  const viewport=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null);
  current.current=project;status.current=onStatus;
  const drafts=useRef(draftParameters);drafts.current=draftParameters;
  const selection=useRef(selectedObject);selection.current=selectedObject;
  useLayoutEffect(()=>{
    const available=viewport.current!,artFrame=frame.current!;
    const column=available.closest<HTMLElement>('.canvas-column');
    const toolbar=column?.querySelector<HTMLElement>('.workbench-toolbar');
    if(!column)return;
    let scheduled=0;
    const fit=()=>{
      scheduled=0;
      const width=available.clientWidth,height=available.clientHeight;
      if(!width||!height)return;
      // Keep the renderer's logical viewport equal to the complete canvas area.
      // Tool drawers consume viewing space, never the artwork's layout space.
      const reservedWidth=Number.parseFloat(getComputedStyle(available).getPropertyValue('--preview-reserved-width'))||0;
      const baseWidth=Math.max(1,column.clientWidth-reservedWidth);
      const baseHeight=Math.max(1,column.clientHeight-(toolbar?.getBoundingClientRect().height??0));
      const scale=Math.min(width/baseWidth,height/baseHeight,1);
      artFrame.style.width=`${baseWidth}px`;artFrame.style.height=`${baseHeight}px`;
      artFrame.style.left=`${(width-baseWidth*scale)/2}px`;
      artFrame.style.top=`${(height-baseHeight*scale)/2}px`;
      artFrame.style.transform=`scale(${scale})`;
      artFrame.style.setProperty('--preview-scale', String(scale));
      available.dataset.previewWidth=String(baseWidth);
      available.dataset.previewHeight=String(baseHeight);
      available.dataset.previewScale=String(scale);
    };
    const observer=new ResizeObserver(()=>{if(!scheduled)scheduled=requestAnimationFrame(fit);});
    observer.observe(column);observer.observe(available);if(toolbar)observer.observe(toolbar);
    fit();
    return()=>{observer.disconnect();cancelAnimationFrame(scheduled);};
  },[]);
  useEffect(()=>{
    let ws:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,closed=false,endedRevision=-1;
    const send=(data:unknown)=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));};
    const patch=async(value:unknown,revision:number)=>{
      const next=await api<Project>(`/api/projects/${current.current.id}/state`,json('PATCH',{expectedRevision:revision,patch:value}));
      if(!closed){if(next.revision>=current.current.revision)current.current=next;accept.current?.(next);}return next;
    };
    let queuedParameters:Record<string,Value>={},parameterWrite=false;
    let queuedRuntime:{runtime:NonNullable<Project['state']['runtime']>;resolve:()=>void;reject:(e:unknown)=>void}|undefined;
    async function commitArtworkParameters(revision:number){
      parameterWrite=true;
      try{
        while(!closed&&(Object.keys(queuedParameters).length||queuedRuntime)){
          const parameters=queuedParameters;queuedParameters={};const runtime=queuedRuntime;queuedRuntime=undefined;
          // Continue only our successful write chain. Concurrent edits cause a
          // revision conflict; they are never silently rebased or overwritten.
          let next:Project;try{next=await patch({parameters,...(runtime?{runtime:runtime.runtime}:{})},revision);runtime?.resolve();}catch(error){runtime?.reject(error);throw error;}revision=next.revision;
        }
      }catch(error){
        queuedParameters={};queuedRuntime?.reject(error);queuedRuntime=undefined;if(closed)return;status.current?.({error:String(error)});
        void api<{project:Project}>(`/api/projects/${current.current.id}/context`).then(value=>{current.current=value.project;accept.current?.(value.project);}).catch(()=>{});
      }finally{parameterWrite=false;}
    }
    const createRenderer=project.renderer==='renderer.document'?createDocumentRenderer:project.renderer==='renderer.canvas2d'?createCanvasRenderer:createThreeRenderer;
    const plugin=createRenderer({
      load:p=>api(`/api/projects/${p.id}/runtime`),
      onParameters:(parameters:Record<string,Value>,revision:number)=>{
        if(closed)return;queuedParameters={...queuedParameters,...parameters};
        if(!parameterWrite)void commitArtworkParameters(revision);
      },
      onRuntimeState:(runtime,parameters,revision)=>new Promise<void>((resolve,reject)=>{if(closed){reject(new Error('页面已关闭'));return;}if(queuedRuntime){reject(new Error('请等待形态保存完成'));return;}queuedRuntime={runtime,resolve,reject};queuedParameters={...queuedParameters,...parameters};if(!parameterWrite)void commitArtworkParameters(revision);}),
      onError:error=>status.current?.({error,message:'保留上一份可用画面'}),
      onSelected:(id:string|null)=>status.current?.({message:id?'已选择画面对象':'已取消选择',selectedId:id}),
      onClock:(clock:FrameClock)=>{
        if(clock.revision!==current.current.revision)return;
        status.current?.({frameTime:clock.time});
        if(clock.ended&&endedRevision!==clock.revision){endedRevision=clock.revision;void patch({time:clock.time,paused:true},clock.revision).catch(error=>status.current?.({error:String(error)}));}
      },
      onCamera:camera=>{void patch({camera},current.current.revision).catch(error=>status.current?.({error:String(error)}));},
    });
    const mounted=plugin.mount(host.current!,ack=>{send({type:'render.applied',projectId:current.current.id,ack});status.current?.({objects:ack.objects,timeline:ack.timeline,frameTime:ack.frameTime,message:'画面已更新',error:''});}) as ThreeInstance;
    instance.current=mounted;
    const apply=()=>mounted.apply({project:current.current,buildHash:'',revision:current.current.revision,time:current.current.state.time});
    function connect(){
      if(closed)return;
      ws=new WebSocket(eventsURL(),eventsProtocols());
      ws.onopen=apply;
      ws.onclose=()=>{if(!closed)retry=setTimeout(connect,1000);};
      ws.onmessage=async event=>{
        const m=JSON.parse(event.data);
        if(m.projectId!==current.current.id)return;
        if(m.type==='thumbnail.capture'){
          try{
            if(drafts.current&&Object.keys(drafts.current).length)throw new Error('正在调整画面，稍后生成预览');
            mounted.select(null);
            const png=await mounted.capture(m.request);
            send({type:'render.thumbnail',projectId:m.projectId,id:m.request.id,png,revision:m.request.revision,buildHash:m.request.buildHash});
          }catch(error){send({type:'render.thumbnail.error',projectId:m.projectId,id:m.request.id,message:String(error)});}
          finally{mounted.select(selection.current??null);if(drafts.current&&Object.keys(drafts.current).length)mounted.preview(drafts.current);}
          return;
        }
        if(m.type==='capture'){try{const png=await mounted.capture(m.request);send({type:'render.capture',id:m.request.id,png,revision:m.request.revision,buildHash:m.request.buildHash});}catch(error){send({type:'render.error',jobId:m.request.id,message:String(error)});}}
      };
    }
    connect();apply();
    return()=>{closed=true;queuedRuntime?.reject(new Error('页面已关闭'));queuedRuntime=undefined;clearTimeout(retry);mounted.dispose();ws?.close();instance.current=null;};
  },[project.id,project.renderer]);
  useEffect(()=>{instance.current?.apply({project,buildHash:'',revision:project.revision,time:project.state.time});},[project]);
  useEffect(()=>{if(draftParameters)instance.current?.preview(draftParameters);},[draftParameters]);
  useEffect(()=>{instance.current?.select(selectedObject??null);},[selectedObject]);
  return <div ref={viewport} className="artwork-viewport" role="region" aria-label="作品预览" data-testid="artwork-preview"><div ref={frame} className="artwork-frame"><div ref={host} className="renderer-host"/></div></div>;
}
