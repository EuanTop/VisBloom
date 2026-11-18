import { useEffect, useState } from 'react';
import type { Project, Publication } from '@art/contracts';
import { api, errorMessage, json } from './api';
import { WorkbenchDialog } from './WorkbenchOverlay';

export default function ShareDialog({project,hasDraft,onClose}:{project:Project;hasDraft:boolean;onClose:()=>void}){
  const [links,setLinks]=useState<Publication[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const refresh=()=>api<Publication[]>(`/api/projects/${project.id}/publications`).then(setLinks);
  useEffect(()=>{void refresh().catch(e=>setMessage(errorMessage(e)));},[project.id]);
  async function create(){setBusy(true);setMessage('');try{const link=await api<Publication>(`/api/projects/${project.id}/publications`,json('POST',{revision:project.revision}));setLinks(previous=>[link,...previous]);}catch(e){setMessage(errorMessage(e));}finally{setBusy(false);}}
  async function copy(value:string){try{await navigator.clipboard.writeText(value);setMessage('已复制');}catch{setMessage('复制未完成，可选择下方内容手动复制。');}}
  async function revoke(link:Publication){setBusy(true);try{await api(`/api/projects/${project.id}/publications/${link.id}`,{method:'DELETE'});await refresh();setMessage('链接已撤回');}catch(e){setMessage(errorMessage(e));}finally{setBusy(false);}}
  return <WorkbenchDialog labelledBy="share-title" onClose={onClose} className="share-dialog"><div className="modal-heading"><h2 id="share-title">分享作品</h2><button className="icon-button" aria-label="关闭分享" onClick={onClose}>×</button></div>
    <p className="share-intro">分享当前版本的画面、交互与所用数据。后续编辑保留在工作台。</p>
    {hasDraft&&<p className="dialog-feedback">请先保存草稿，再创建链接。</p>}
    <button className="primary-button" disabled={busy||hasDraft} onClick={()=>void create()}>{busy?'正在处理…':`创建版本 ${project.revision} 的链接`}</button>
    <div className="share-list">{links.map(link=><section key={link.id}><div className="share-row"><a href={link.url} target="_blank" rel="noreferrer">版本 {link.revision} ↗</a><span>{link.scope==='public'?'公开链接':'本机链接'}</span><button className="text-button" disabled={busy} onClick={()=>void revoke(link)}>撤回</button></div>
      <div className="share-field"><input aria-label={`版本 ${link.revision}分享链接`} readOnly value={link.url} onFocus={e=>e.target.select()}/><button className="small-button" onClick={()=>void copy(link.url)}>复制链接</button></div>
      <details><summary>嵌入其他页面</summary><textarea readOnly aria-label={`版本 ${link.revision}嵌入代码`} value={`<iframe src="${link.embedUrl}" title="Visloom artwork" width="100%" height="640" style="border:0" sandbox="allow-scripts" allow="fullscreen" loading="lazy"></iframe>`} onFocus={e=>e.target.select()}/><button className="text-button" onClick={()=>void copy(`<iframe src="${link.embedUrl}" title="Visloom artwork" width="100%" height="640" style="border:0" sandbox="allow-scripts" allow="fullscreen" loading="lazy"></iframe>`)}>复制嵌入代码</button></details>
      {link.scope==='local'&&<p className="share-local-note">此链接仅在本机可用。配置公开分享服务后，可生成互联网链接。</p>}
    </section>)}</div>{message&&<p className="dialog-feedback" role="status">{message}</p>}
  </WorkbenchDialog>;
}
