import { afterEach, expect, it, vi } from 'vitest';
import { boot } from '../packages/plugin-renderer-canvas/src/runtime';
import type { Project, RenderSnapshot } from '@art/contracts';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('reports actual playback time, keeps static views still, stops once and preserves seeks/capture state',()=>{
  let now=0,nextId=0;const frames=new Map<number,FrameRequestCallback>(),handlers=new Map<string,Function>();
  const messages:any[]=[],draws:any[]=[];
  const parent={postMessage:(message:any)=>messages.push(message)};
  const ctx={save(){},restore(){},setTransform(){},clearRect(){},fillRect(){},fillStyle:''};
  const canvas={style:{cssText:''},width:0,height:0,getContext:()=>ctx,addEventListener(){},removeEventListener(){},remove(){},toDataURL:()=> 'data:image/png;base64,capture'};
  const browser:any={parent,innerWidth:800,innerHeight:600,devicePixelRatio:2,addEventListener:(name:string,fn:Function)=>handlers.set(name,fn),removeEventListener:(name:string)=>handlers.delete(name)};
  vi.stubGlobal('window',browser);
  vi.stubGlobal('document',{createElement:()=>canvas,documentElement:{style:{cssText:''}},body:{style:{cssText:''},append(){}}});
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++nextId,fn);return nextId;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
  vi.spyOn(performance,'now').mockImplementation(()=>now);
  const send=(type:string,data:object)=>handlers.get('message')!({source:parent,data:{channel:'art-host-v1',type,...data}});
  const tick=()=>{now+=100;const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(now));};
  const project:Project={id:'clock-case',name:'Clock contract',preset:'test',revision:1,updatedAt:'',codeHash:'source',files:[],schema:[],notes:'',state:{parameters:{motion:false},mapping:{field:'value',transform:'linear',target:'weight'},seed:42,time:0,paused:false}};
  const snapshot=(p:Project):RenderSnapshot=>({project:p,revision:p.revision,buildHash:'build',time:p.state.time});
  const disposals: number[] = [], resized: number[] = [];
  let mounted = 0;
  boot(() => {
    const id = ++mounted;
    return {
      draw: c => draws.push({ id, time:c.time, width:c.width, height:c.height, pixels:canvas.width }),
      timeline: c => ({ enabled:Boolean(c.parameters.motion),label:'Test motion',duration:1,usesSeed:false }),
      resize: c => resized.push(c.width),
      dispose: () => { disposals.push(id); },
    };
  });
  send('apply',{snapshot:snapshot(project)});const initial=draws.length;
  for(let i=0;i<5;i++)tick();
  expect(draws).toHaveLength(initial); // Static, despite an old paused=false flag.
  expect(messages.find(m=>m.type==='applied').ack.timeline.enabled).toBe(false);

  const playing={...project,revision:2,state:{...project.state,parameters:{motion:true}}};
  send('apply',{snapshot:snapshot(playing)});
  for(let i=0;i<20;i++)tick();
  const clocks=messages.filter(m=>m.type==='clock'&&m.clock.revision===2);
  expect(clocks.some(m=>m.clock.time>0&&m.clock.time<1)).toBe(true);
  expect(clocks.filter(m=>m.clock.ended)).toHaveLength(1);
  expect(draws.at(-1).time).toBe(1);
  const stopped=draws.length;tick();expect(draws).toHaveLength(stopped);

  const sought={...playing,revision:3,state:{...playing.state,time:0.4,paused:true}};
  send('apply',{snapshot:snapshot(sought)});expect(draws.at(-1).time).toBe(0.4);
  send('capture',{request:{id:'capture',revision:3,buildHash:'build',width:320,height:240,time:0.7}});
  expect(draws.some(d=>d.time===0.7&&d.width===320&&d.height===240&&d.pixels===320)).toBe(true);
  expect(draws.at(-1)).toEqual({id:1,time:0.4,width:800,height:600,pixels:1600});
  expect(disposals).toEqual([2]);
  browser.innerWidth=720;
  handlers.get('resize')!();
  expect(resized).toEqual([720]);
  expect(draws.at(-1)).toMatchObject({id:1,time:0.4,width:720});
  expect(messages.find(m=>m.type==='capture').revision).toBe(3);
  send('dispose',{});
});
