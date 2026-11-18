import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import * as THREE from 'three';
import {useReducedMotion,useScroll,useTransform,useMotionValueEvent} from 'motion/react';
import {createArtwork} from '../../../../artworks/physarum/artwork';
import {DEFAULTS,type PhysarumParameters} from '../../../../artworks/physarum/model';
import {readObservations,observationAt,type ObservationFrame} from '../../../../artworks/physarum/observations';
import type {useStudy} from './useStudy';
import {ArrowUpRight,LoaderCircle,Pause,Play} from './PortalIcons';
import './physarum-hero.css';
import PlatformHeroCopy from './PlatformHeroCopy';
import {publicPortal} from './portal-links';

type Artwork=ReturnType<typeof createArtwork>;
type Controls={redraw:()=>void;regrow:()=>Promise<void>;capture:()=>ReturnType<Artwork['captureState']>};
export type HeroPlayback={playing:boolean;ready:boolean;toggle:()=>void};
const stages=['组织','深入','分层','散开'];
export default function PhysarumHero({study,platform=false,onPlaybackChange}:{study:ReturnType<typeof useStudy>;platform?:boolean;onPlaybackChange?:(value:HeroPlayback)=>void}){
 const reduced=Boolean(useReducedMotion()),host=useRef<HTMLDivElement>(null),story=useRef<HTMLElement>(null),reducedRef=useRef(reduced);reducedRef.current=reduced;
 const [introHidden,setIntroHidden]=useState(false);
 const {scrollYProgress}=useScroll({target:story,offset:['start start','end end']});
 const copyOpacity=useTransform(scrollYProgress,[0,.18,.38],[1,1,0]);
 const copyY=useTransform(scrollYProgress,[0,.38],[0,-70]);
 useMotionValueEvent(scrollYProgress,'change',p=>setIntroHidden(p>.38));
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[playing,setPlaying]=useState(!reduced),[preparing,setPreparing]=useState(false),[progress,setProgress]=useState(0),[frames,setFrames]=useState<ObservationFrame[]>([]),[sourceOpen,setSourceOpen]=useState(false);
 const actualPlaying=useRef(playing),controls=useRef<Controls|null>(null);actualPlaying.current=playing;
 const observed=observationAt(frames,progress),sampleCount=frames.reduce((sum,f)=>sum+f.sampleCount,0),phase=Math.min(3,Math.floor(progress*4));
 useEffect(()=>{if(reduced){actualPlaying.current=false;setPlaying(false);}},[reduced]);
 useEffect(()=>{
  const element=host.current!,abort=new AbortController();let closed=false,visible=true,frame=0,last=0,reported=-1,ambientLevel=0;
  const ambientPointer={x:0,y:0};
  let renderer:THREE.WebGLRenderer|undefined,art:Artwork|undefined,resize:ResizeObserver|undefined;
  let parameters:PhysarumParameters={...DEFAULTS,growing:actualPlaying.current};
  const context=()=>({renderer:renderer!,data:rows,parameters,seed:42,width:element.clientWidth,height:element.clientHeight,standalone:true,presentation:'portal' as const,pointerSurface:platform?story.current?.querySelector<HTMLElement>('.physarum-hero')??undefined:undefined,delta:0,onParameters:(values:Partial<PhysarumParameters>)=>{parameters={...parameters,...values};if(typeof values.growing==='boolean'){actualPlaying.current=values.growing;setPlaying(values.growing);start();}}});
  let rows:unknown[]=[];
  const stop=()=>{cancelAnimationFrame(frame);frame=0;last=0;};
  const fail=(reason:unknown)=>{if(closed)return;stop();actualPlaying.current=false;setPlaying(false);setReady(false);setError(reason instanceof Error?reason.message:String(reason));};
  const tick=(now:number)=>{
   frame=0;if(closed||!visible||document.hidden||!renderer||!art)return;
   if(last&&now-last<1000/30){frame=requestAnimationFrame(tick);return;}
   try{parameters={...parameters,growing:actualPlaying.current};art.update({...context(),delta:last?Math.min(.05,(now-last)/1000):0});last=now;art.render(platform?{ambient:ambientLevel,pointer:ambientPointer}:undefined);}catch(error){fail(error);return;}
   if(actualPlaying.current)frame=requestAnimationFrame(tick);else last=0;
  };
  const start=()=>{if(!closed&&art&&visible&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);};
  const onScroll=()=>{const section=story.current;if(!section)return;const rect=section.getBoundingClientRect(),top=section.querySelector('.physarum-hero')!.getBoundingClientRect().height,header=document.querySelector('.site-header')?.getBoundingClientRect().height??76;
   const p=Math.max(0,Math.min(1,((platform?0:header)-rect.top)/Math.max(1,rect.height-top)));
   parameters={...parameters,reveal:reducedRef.current?0:p,observationTime:p};
   if(platform){const fade=Math.max(0,Math.min(1,(top-rect.bottom)/(top*.65)));ambientLevel=fade;element.style.opacity=String(1-fade*.62);element.dataset.ambient=String(fade>0);}
   if(Math.abs(p-reported)>.003||p===0||p===1){reported=p;setProgress(p);}start();
  };
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();else stop();});observer.observe(element);
  const pointer=(event:PointerEvent)=>{if(!platform||reducedRef.current||ambientLevel===0)return;ambientPointer.x=event.clientX/innerWidth-.5;ambientPointer.y=.5-event.clientY/innerHeight;start();};
  const visibility=()=>{if(document.hidden)stop();else start();};document.addEventListener('visibilitychange',visibility);window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);if(platform)window.addEventListener('pointermove',pointer,{passive:true});
  fetch('/collection/physarum.json',{signal:abort.signal}).then(async response=>{if(!response.ok)throw new Error('作品数据暂时无法载入');return response.json();}).then(async data=>{
   if(closed)return;rows=data;setFrames(readObservations(rows));onScroll();renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;element.prepend(renderer.domElement);
   const size=()=>{if(renderer&&element.clientWidth&&element.clientHeight){renderer.setSize(element.clientWidth,element.clientHeight,false);onScroll();start();}};resize=new ResizeObserver(size);resize.observe(element);size();
   art=createArtwork(context());const instance=art;await instance.ready;if(closed)return;
   controls.current={redraw:()=>{onScroll();start();},regrow:async()=>{if(!art)return;setReady(false);parameters={...parameters,regrow:parameters.regrow+1};art.update(context());await art.ready;if(!closed){setError('');setReady(true);start();}},capture:async()=>{if(!art)throw new Error('作品尚未就绪');actualPlaying.current=false;setPlaying(false);parameters={...parameters,growing:false};art.update(context());return art.captureState();}};
   setReady(true);start();
  }).catch(error=>{if(error.name!=='AbortError')fail(error);});
  return()=>{closed=true;abort.abort();stop();observer.disconnect();resize?.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onScroll);window.removeEventListener('pointermove',pointer);controls.current=null;art?.dispose();renderer?.dispose();renderer?.domElement.remove();};
 },[]);
 useEffect(()=>{controls.current?.redraw();},[playing,reduced]);
 async function continueWork(){if(!controls.current)return;setPreparing(true);try{const saved=await controls.current.capture();await study.open('physarum',0,0,0,saved.parameters,saved.runtime);}catch(error){setError(error instanceof Error?error.message:String(error));}finally{setPreparing(false);}}
 const togglePlaying=()=>{actualPlaying.current=!playing;setPlaying(!playing);};
 useEffect(()=>{onPlaybackChange?.({playing,ready,toggle:togglePlaying});},[playing,ready,onPlaybackChange]);
 return <>
 {platform&&createPortal(<div className="physarum-stage platform-global-art" ref={host}/>,document.body)}
 <section className="physarum-story" ref={story} data-platform={platform} aria-labelledby={platform?"platform-title":"physarum-title"}>
  <div className="physarum-hero" data-ready={ready} data-progress={progress.toFixed(3)}>
   {!platform&&<div className="physarum-stage" ref={host}/>}
   {platform?<PlatformHeroCopy style={reduced?undefined:{opacity:copyOpacity,y:copyY}} inactive={!reduced&&introHidden}/>:<div className="physarum-title"><p translate="no">01 / PHYSARUM</p><h1 id="physarum-title">生长之间</h1><span>数据里的生命感。</span></div>}
   {!platform&&<div className="physarum-chapter" aria-label="画面展开阶段"><span>0{phase+1}</span><strong>{stages[phase]}</strong><i style={{transform:`scaleY(${progress})`}}/></div>}
   {!ready&&!error&&<p className="physarum-loading" role="status">正在生长…</p>}
   {error&&<p className="physarum-portal-error" role="alert">{error}</p>}
   <div className="physarum-footer">{!platform&&<div className="physarum-observation">{frames.length>0&&<><span>观测 +{(observed.seconds/3600).toFixed(1)}h</span><span>{sampleCount.toLocaleString()} 条影像特征 / AVA</span></>}<span className="physarum-scroll-hint">↓ 滚动，探索画面</span></div>}<div className="physarum-actions">
    <button className="physarum-play" disabled={!ready||preparing} aria-label={playing?'暂停生长':'继续生长'} onClick={togglePlaying}>{playing?<Pause size={16}/>:<Play size={16}/>}</button>
    <button disabled={!ready||preparing} onClick={()=>void controls.current?.regrow().catch(error=>setError(String(error)))}>重新生长</button>
    {!platform&&<span className="physarum-gesture">移动引导 · 点击添加养分</span>}
    {!publicPortal&&<button className="physarum-continue" disabled={!ready||preparing||Boolean(study.busy)} onClick={()=>void continueWork()}>{preparing||study.busy?<LoaderCircle size={15} className="spin"/>:null}在工作台继续<ArrowUpRight size={16}/></button>}
   </div></div>
  </div>
 </section>
 {!platform&&frames.length>0&&<section className="physarum-material page-width" aria-labelledby="material-title">
  <div className="physarum-material-heading"><p className="material-index">材料 / 01</p><h2 id="material-title">从观测，到生长。</h2><p>同一培养皿，{frames.length} 个时刻。<br/>影像的亮度、纹理与变化，进入每一处生长。</p><button aria-expanded={sourceOpen} aria-controls="physarum-source-detail" onClick={()=>setSourceOpen(!sourceOpen)}>{sourceOpen?'收起原始观测':'看原始观测'} <span>{sourceOpen?'−':'+'}</span></button></div>
  <div className="physarum-material-flow"><div><strong>{sampleCount.toLocaleString()}</strong><span>实测图像网格记录</span></div><i>→</i><div><strong>AVA</strong><span>结构化 · 时空聚合</span></div><i>→</i><div><strong>{frames.length} × 24²</strong><span>局部感知 · 组织反馈</span></div></div>
  <div className="physarum-source-detail" id="physarum-source-detail" hidden={!sourceOpen}>{sourceOpen&&<><figure><img src={`/collection/physarum/frame-${String(observed.nearest?.frame??0).padStart(4,'0')}.png`} alt={`原始培养皿扫描，第 ${observed.nearest?.frame??0} 帧`}/><figcaption>原始扫描 / +{((observed.nearest?.seconds??0)/3600).toFixed(1)}h</figcaption></figure><div><p>64 × 64 取样，经 AVA 聚合为 24 × 24 空间场。亮度影响感知距离，纹理和相对首帧的变化影响趋向与组织反馈。</p><p>这是观测启发的艺术模拟。图像特征可能包含养分与光照，不代表已识别的黏菌面积或生物预测。</p><a href="/portal/credits.html#physarum">数据来源与处理说明 <ArrowUpRight size={13}/></a></div></>}</div>
 </section>}
 </>;
}
