import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import * as THREE from 'three';
import {useReducedMotion,useScroll,useTransform,useMotionValueEvent} from 'motion/react';
import {createArtwork} from '../../../../artworks/physarum/artwork';
import {DEFAULTS,type PhysarumParameters} from '../../../../artworks/physarum/model';
import type {useStudy} from './useStudy';
import {ArrowUpRight,LoaderCircle,Pause,Play} from './PortalIcons';
import './physarum-hero.css';
import PlatformHeroCopy from './PlatformHeroCopy';
import {publicPortal} from './portal-links';

type Artwork=ReturnType<typeof createArtwork>;
type Controls={redraw:()=>void;regrow:()=>Promise<void>;capture:()=>ReturnType<Artwork['captureState']>};
export type HeroPlayback={playing:boolean;ready:boolean;toggle:()=>void};
const FRAME_INTERVAL=1000/30;
type HeroProps={
  study?:ReturnType<typeof useStudy>;
  platform?:boolean;
  onPlaybackChange?:(value:HeroPlayback)=>void;
  onIntroSettled?:()=>void;
  onObservations?:(rows:unknown[]|null)=>void;
  onObservationTime?:(progress:number)=>void;
};
export default function PhysarumHero({study,platform=false,onPlaybackChange,onIntroSettled,onObservations,onObservationTime}:HeroProps){
 const reduced=Boolean(useReducedMotion()),host=useRef<HTMLDivElement>(null),story=useRef<HTMLElement>(null),reducedRef=useRef(reduced);reducedRef.current=reduced;
 const [introHidden,setIntroHidden]=useState(false);
 const {scrollYProgress}=useScroll({target:story,offset:['start start','end end']});
 const copyOpacity=useTransform(scrollYProgress,[0,.18,.38],[1,1,0]);
 const copyY=useTransform(scrollYProgress,[0,.38],[0,-70]);
 useMotionValueEvent(scrollYProgress,'change',p=>setIntroHidden(p>.38));
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[playing,setPlaying]=useState(!reduced),[preparing,setPreparing]=useState(false);
 const actualPlaying=useRef(playing),controls=useRef<Controls|null>(null);actualPlaying.current=playing;
 useEffect(()=>{if(reduced){actualPlaying.current=false;setPlaying(false);}},[reduced]);
 useEffect(()=>{
  const element=host.current!,abort=new AbortController();let closed=false,visible=true,frame=0,last=0,nextRender=0,ambientLevel=0;
  const ambientPointer={x:0,y:0};
  let renderer:THREE.WebGLRenderer|undefined,art:Artwork|undefined,resize:ResizeObserver|undefined;
  let parameters:PhysarumParameters={...DEFAULTS,growing:actualPlaying.current};
  const context=()=>({renderer:renderer!,data:rows,parameters,seed:42,width:element.clientWidth,height:element.clientHeight,standalone:true,presentation:'portal' as const,pointerSurface:platform?story.current?.querySelector<HTMLElement>('.physarum-hero')??undefined:undefined,delta:0,onParameters:(values:Partial<PhysarumParameters>)=>{parameters={...parameters,...values};if(typeof values.growing==='boolean'){actualPlaying.current=values.growing;setPlaying(values.growing);start();}}});
  let rows:unknown[]=[];
  const stop=()=>{cancelAnimationFrame(frame);frame=0;last=0;nextRender=0;};
  const fail=(reason:unknown)=>{if(closed)return;stop();actualPlaying.current=false;setPlaying(false);setReady(false);setError(reason instanceof Error?reason.message:String(reason));};
  const tick=(now:number)=>{
   frame=0;if(closed||!visible||document.hidden||!renderer||!art){stop();return;}
   if(now+1<nextRender){frame=requestAnimationFrame(tick);return;}
   nextRender=nextRender>now-FRAME_INTERVAL?nextRender+FRAME_INTERVAL:now+FRAME_INTERVAL;
   try{parameters={...parameters,growing:actualPlaying.current};art.update({...context(),delta:last?Math.min(.05,(now-last)/1000):0});last=now;art.render(platform?{ambient:ambientLevel,pointer:ambientPointer}:undefined);}catch(error){fail(error);return;}
   if(actualPlaying.current)frame=requestAnimationFrame(tick);else stop();
  };
  const start=()=>{if(!closed&&art&&visible&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);};
  const onScroll=()=>{const section=story.current;if(!section)return;const rect=section.getBoundingClientRect(),top=section.querySelector('.physarum-hero')!.getBoundingClientRect().height;
   const p=Math.max(0,Math.min(1,-rect.top/Math.max(1,rect.height-top)));
   parameters={...parameters,reveal:reducedRef.current?0:p,observationTime:p};
   onObservationTime?.(p);
   if(platform){const fade=Math.max(0,Math.min(1,(top-rect.bottom)/(top*.65)));ambientLevel=fade;element.style.opacity=String(1-fade*.62);element.dataset.ambient=String(fade>0);}
   start();
  };
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();else stop();});observer.observe(element);
  const pointer=(event:PointerEvent)=>{if(!platform||reducedRef.current||ambientLevel===0)return;ambientPointer.x=event.clientX/innerWidth-.5;ambientPointer.y=.5-event.clientY/innerHeight;start();};
  const visibility=()=>{if(document.hidden)stop();else start();};document.addEventListener('visibilitychange',visibility);window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);if(platform)window.addEventListener('pointermove',pointer,{passive:true});
  fetch('/collection/physarum.json',{signal:abort.signal}).then(async response=>{if(!response.ok)throw new Error('作品数据暂时无法载入');return response.json();}).then(async data=>{
   if(closed)return;rows=data;onObservations?.(rows);onScroll();renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;element.prepend(renderer.domElement);
   const size=()=>{if(renderer&&element.clientWidth&&element.clientHeight){
    const pixels=element.clientWidth*element.clientHeight;
    const ratio=Math.min(devicePixelRatio||1,1.5,Math.sqrt(2_500_000/pixels));
    if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
    renderer.setSize(element.clientWidth,element.clientHeight,false);onScroll();
   }};resize=new ResizeObserver(size);resize.observe(element);size();
   art=createArtwork(context());const instance=art;await instance.ready;if(closed)return;
   controls.current={redraw:()=>{onScroll();start();},regrow:async()=>{if(!art)return;setReady(false);parameters={...parameters,regrow:parameters.regrow+1};art.update(context());await art.ready;if(!closed){setError('');setReady(true);start();}},capture:async()=>{if(!art)throw new Error('作品尚未就绪');actualPlaying.current=false;setPlaying(false);parameters={...parameters,growing:false};art.update(context());return art.captureState();}};
   instance.update(context());
   instance.render(platform?{ambient:ambientLevel,pointer:ambientPointer}:undefined);
   setReady(true);onIntroSettled?.();start();
  }).catch(error=>{if(error.name!=='AbortError'&&!closed){if(!rows.length)onObservations?.(null);fail(error);}});
  return()=>{closed=true;abort.abort();stop();observer.disconnect();resize?.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);window.removeEventListener('pointermove',pointer);controls.current=null;art?.dispose();renderer?.dispose();renderer?.domElement.remove();};
 },[platform,onIntroSettled,onObservations,onObservationTime]);
 useEffect(()=>{controls.current?.redraw();},[playing,reduced]);
 async function continueWork(){if(!controls.current||!study)return;setPreparing(true);try{const saved=await controls.current.capture();await study.open('physarum',0,0,0,saved.parameters,saved.runtime);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setPreparing(false);}}
 const togglePlaying=()=>{actualPlaying.current=!playing;setPlaying(!playing);};
 useEffect(()=>{onPlaybackChange?.({playing,ready,toggle:togglePlaying});},[playing,ready,onPlaybackChange]);
 return <>
 {platform&&createPortal(<div className="physarum-stage platform-global-art" ref={host}>{error&&<img className="physarum-cover-fallback" src="/collection/physarum.png" alt="" onLoad={onIntroSettled} onError={onIntroSettled}/>}</div>,document.body)}
 <section className="physarum-story" ref={story} data-platform={platform} aria-labelledby={platform?"platform-title":"physarum-title"}>
  <div className="physarum-hero" data-ready={ready}>
   {!platform&&<div className="physarum-stage" ref={host}>{error&&<img className="physarum-cover-fallback" src="/collection/physarum.png" alt=""/>}</div>}
   {platform&&<PlatformHeroCopy style={reduced?undefined:{opacity:copyOpacity,y:copyY}} inactive={!reduced&&introHidden}/>}
   {!ready&&!error&&<p className="physarum-loading" role="status">正在生长…</p>}
   {error&&<p className="physarum-portal-error" role="alert">{error}</p>}
   <div className="physarum-footer"><div className="physarum-actions">
    <button className="physarum-play" disabled={!ready||preparing} aria-label={playing?'暂停生长':'继续生长'} onClick={togglePlaying}>{playing?<Pause size={16}/>:<Play size={16}/>}</button>
    <button disabled={!ready||preparing} onClick={()=>void controls.current?.regrow().catch(error=>setError(String(error)))}>重新生长</button>
    {!publicPortal&&study&&<button className="physarum-continue" disabled={!ready||preparing||Boolean(study.busy)} onClick={()=>void continueWork()}>{preparing||study.busy?<LoaderCircle size={15} className="spin"/>:null}在工作台继续<ArrowUpRight size={16}/></button>}
   </div></div>
  </div>
 </section>
 </>;
}
