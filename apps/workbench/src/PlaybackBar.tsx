import { useEffect, useRef, useState } from 'react';
import type { ArtworkState, PlaybackInfo, Project } from '@art/contracts';
import Icon from './WorkbenchIcon';

export default function PlaybackBar({project,timeline,time,busy,onPatch}:{project:Project;timeline?:PlaybackInfo;time:number;busy:boolean;onPatch:(patch:Partial<ArtworkState>)=>unknown}){
  const [draft,setDraft]=useState<number|null>(null),pending=useRef<number|null>(null);
  useEffect(()=>{pending.current=null;setDraft(null);},[project.id]);
  const duration=timeline?.duration??30,at=draft??time;
  const seek=()=>{const value=pending.current;if(value===null)return;pending.current=null;setDraft(null);onPatch({time:value,paused:true});};
  if(!timeline)return null;
  if(timeline.transport==='hidden')return null;
  const seed=timeline.usesSeed?<div className="seed-control"><label htmlFor="preview-seed">种子</label><input id="preview-seed" className="seed-input" type="number" defaultValue={project.state.seed} key={`${project.id}-${project.state.seed}`} min="0" max="4294967295" disabled={busy} onBlur={event=>{const seed=Number(event.target.value);if(Number.isSafeInteger(seed)&&seed>=0&&seed<=4294967295&&seed!==project.state.seed)onPatch({seed});else if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295)event.target.value=String(project.state.seed);}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/></div>:null;
  if(!timeline.enabled)return timeline.enableParameters||seed?<div className="playback-bar static-preview">{timeline.enableParameters&&<button className="quiet-button" disabled={busy} onClick={()=>onPatch({parameters:timeline.enableParameters,time:0,paused:false})}><Icon name="play" size={15}/>预览{timeline.label}</button>}{seed}</div>:null;
  return <div className="playback-bar">
    <button className="play-button" title={project.state.paused?'播放动画':'暂停动画'} aria-label={project.state.paused?'播放动画':'暂停动画'} disabled={busy} onClick={()=>onPatch({paused:!project.state.paused,time:project.state.paused&&time>=duration?0:time})}><Icon name={project.state.paused?'play':'pause'} size={16}/></button>
    <span className="playback-label" title={timeline.label}>{timeline.label}</span>
    {timeline.transport!=='playback'&&<><output className="playback-time" aria-label="动画预览时间">{at.toFixed(1)}<small>s</small></output>
    <input aria-label="动画进度" type="range" min="0" max={duration} step="0.1" value={Math.min(duration,at)} disabled={busy} onChange={event=>{const value=Number(event.target.value);pending.current=value;setDraft(value);}} onPointerUp={seek} onKeyUp={seek} onBlur={seek}/>
    <span className="time-end">{duration} s</span></>}
    <button className="icon-button" title="重播动画" aria-label="重播动画" disabled={busy} onClick={()=>onPatch({time:0,paused:false})}><Icon name="replay" size={16}/></button>
    {seed}
  </div>;
}
