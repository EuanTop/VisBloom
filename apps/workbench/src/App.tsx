import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import BrandMark from './BrandMark';
import type { ArtworkObject, ArtworkState, Checkpoint, Job, Parameter, Project, ProjectEvent, ProjectSummary, Value, PlaybackInfo } from '@art/contracts';
import Preview, { type PreviewStatus } from './Preview';
import PlaybackBar from './PlaybackBar';
import Icon from './WorkbenchIcon';
import { WorkbenchDialog, WorkbenchPopover } from './WorkbenchOverlay';
import DataPanel from './DataPanel';
import { ApiError, api, errorMessage, json, getConnection, eventsURL, eventsProtocols, serviceFetch } from './api';
import { ConnectionPanel } from './ConnectionPanel';
import ShareDialog from './ShareDialog';
import ServiceImage from './ServiceImage';
import { exportSizePresets, parseExportSize } from './export-size';
import type { CodeDraft } from './code-merge';

const CodeEditor = lazy(() => import('./CodeEditor'));
const CodeMergeDialog = lazy(() => import('./CodeMergeDialog'));

type Context = { project: Project; events: ProjectEvent[]; checkpoints: Checkpoint[]; renderer: { revision?: number; frameTime?: number; objects?: ArtworkObject[] } | null };
type Panel = 'code' | 'data' | 'history' | 'objects' | null;
type AuthoredCase = {id:string;name:string;description:string;caption:string};
const formatTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const eventLabel = (type: string) => {
  if (/restor/i.test(type)) return '恢复创作版本';
  if (/checkpoint/i.test(type)) return '保存创作版本';
  if (/source|file|code/i.test(type)) return '修改作品代码';
  if (/query|result/i.test(type)) return '更新数据结果';
  if (/data|import/i.test(type)) return '导入数据';
  if (/note/i.test(type)) return '记录创作手记';
  if (/state|param|mapping/i.test(type)) return '调整画面';
  if (/creat/i.test(type)) return '开始新的创作';
  return '项目更新';
};
const actorLabel = (actor: string) => /mcp|agent|cli/i.test(actor) ? 'Agent' : /external|filesystem|disk|watch/i.test(actor) ? '外部编辑器' : /ui|workbench|user/i.test(actor) ? '工作台' : '项目';

function ColorControl({definition,value,disabled,onDraft,onCommit}:{definition:Parameter;value:Value;disabled:boolean;onDraft(value:Value):void;onCommit():void}) {
  const [hex,setHex]=useState(String(value)),[invalid,setInvalid]=useState(false),editing=useRef(false);
  useEffect(()=>{if(!editing.current)setHex(String(value));},[value]);
  const normalized=(text:string)=>/^#?[a-f\d]{6}$/i.test(text)?`#${text.replace('#','').toLowerCase()}`:null;
  const commit=()=>{
    editing.current=false;const next=normalized(hex);
    if(!next){setInvalid(true);return;}
    setInvalid(false);setHex(next);if(next!==String(value).toLowerCase())onDraft(next);queueMicrotask(onCommit);
  };
  return <><div className="color-control">
    <input id={`parameter-${definition.id}`} type="color" value={String(value)} disabled={disabled} onChange={event=>{setHex(event.target.value);setInvalid(false);onDraft(event.target.value);}} onPointerUp={onCommit} onBlur={onCommit} onKeyUp={event=>{if(event.key==='Enter')onCommit();}}/>
    <input className="hex-input" aria-label={`${definition.label}色值`} aria-invalid={invalid} aria-describedby={invalid?`color-error-${definition.id}`:undefined} value={hex} maxLength={7} spellCheck={false} disabled={disabled} onFocus={()=>{editing.current=true;}} onChange={event=>{setHex(event.target.value);const next=normalized(event.target.value);if(next){setInvalid(false);onDraft(next);}}} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commit();}}}/>
  </div>{invalid&&<p id={`color-error-${definition.id}`} className="field-error">请输入六位十六进制颜色</p>}</>;
}
function ParameterControl({ definition, value, disabled, onDraft, onCommit }: { definition: Parameter; value: Value; disabled: boolean; onDraft: (value: Value) => void; onCommit: () => void }) {
  const id = `parameter-${definition.id}`;
  return <div className={`parameter parameter-${definition.type}`}>
    <div className="parameter-label"><label htmlFor={id}>{definition.label}</label>{definition.role==='data'&&<span className="tiny-badge">数据</span>}{definition.type==='number'&&<output htmlFor={id}>{Number(value).toLocaleString('zh-CN',{maximumFractionDigits:4})}</output>}</div>
    {definition.type==='number'&&<input id={id} type="range" min={definition.min??0} max={definition.max??100} step={definition.step??1} value={Number(value)} disabled={disabled} onChange={event=>onDraft(Number(event.target.value))} onPointerUp={onCommit} onPointerCancel={onCommit} onKeyUp={onCommit} onBlur={onCommit}/>}
    {definition.type==='color'&&<ColorControl definition={definition} value={value} disabled={disabled} onDraft={onDraft} onCommit={onCommit}/>}
    {definition.type==='select'&&<select id={id} value={String(value)} disabled={disabled} onChange={event=>{onDraft(event.target.value);queueMicrotask(onCommit);}}>{definition.options?.map(option=><option key={option}>{option}</option>)}</select>}
    {definition.type==='boolean'&&<button id={id} className={`switch ${value?'on':''}`} role="switch" aria-checked={Boolean(value)} disabled={disabled} onClick={()=>{onDraft(!value);queueMicrotask(onCommit);}}><span/></button>}
  </div>;
}

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [empty,setEmpty]=useState(false);
  const projectRef = useRef<Project | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(() => new Set());
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [projectOpen,setProjectOpen]=useState(false);
  const [inspectorOpen,setInspectorOpen]=useState(()=>window.matchMedia('(min-width:1080px)').matches);
  const [panel, setPanel] = useState<Panel>(null);
  const [drafts, setDrafts] = useState<Record<string, CodeDraft>>({});
  const draftsRef = useRef(drafts);
  const [reviewPath, setReviewPath] = useState<string | null>(null);
  const [filePath, setFilePath] = useState('src/artwork.ts');
  const [parameterDrafts, setParameterDrafts] = useState<Record<string, Value>>({});
  const parameterRef = useRef<Record<string, Value>>({});
  const parameterBaseRevision = useRef<number | null>(null);
  const [parameterSaveError,setParameterSaveError]=useState<'conflict'|'failed'|'pending'|null>(null);
  const [objects, setObjects] = useState<ArtworkObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [timeline,setTimeline]=useState<PlaybackInfo>();
  const [frameTime,setFrameTime]=useState(0);
  const frameTimeRef=useRef(0);
  const [renderMessage, setRenderMessage] = useState('准备画布');
  const [renderError, setRenderError] = useState('');
  const [notes, setNotes] = useState('');
  const notesDirty = useRef(false);
  const [newProject, setNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPreset, setNewPreset] = useState('skinbloom-ingredients');
  const [cases, setCases] = useState<AuthoredCase[]>([]);
  const [checkpointLabel, setCheckpointLabel] = useState('');
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentDirectory,setAgentDirectory]=useState('');
  const [agentSkill,setAgentSkill]=useState('skills/core/data-art/SKILL.md');
  const [digitalArtSkill,setDigitalArtSkill]=useState<string>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPreset,setExportPreset]=useState('landscape');
  const [exportWidth,setExportWidth]=useState('1920');
  const [exportHeight,setExportHeight]=useState('1080');
  const [focusMode, setFocusMode] = useState(false);
  const [shareOpen,setShareOpen]=useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const focusExit=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    if(!focusMode)return;
    const previous=document.activeElement as HTMLElement|null;
    const frame=requestAnimationFrame(()=>focusExit.current?.focus());
    return()=>{cancelAnimationFrame(frame);if(previous?.isConnected)previous.focus();};
  },[focusMode]);

  const acceptProject = useCallback((next: Project) => {
    if (projectRef.current?.id === next.id && next.revision <= projectRef.current.revision) return;
    if (projectRef.current?.id !== next.id) {
      setDrafts({}); draftsRef.current = {};
      setReviewPath(null);
      parameterRef.current = {}; parameterBaseRevision.current = null; setParameterDrafts({});
      setParameterSaveError(null);
      notesDirty.current = false; setSelectedObject(null); setObjects([]);
      setFilePath('src/artwork.ts'); setTimeline(undefined);setFrameTime(next.state.time);frameTimeRef.current=next.state.time;
      const url=new URL(location.href);url.searchParams.set('project',next.id);history.replaceState(null,'',url);
    }
    projectRef.current = next; setProject(next);setEmpty(false);
    document.title=`${next.name} · VisBloom`;
    if (!notesDirty.current) setNotes(next.notes);
  }, []);

  const refresh = useCallback(async (id?: string) => {
    const target = id ?? projectRef.current?.id;
    if (!target) return;
    const context = await api<Context>(`/api/projects/${encodeURIComponent(target)}/context`);
    if (id || target === projectRef.current?.id) {
      acceptProject(context.project); setEvents(context.events); setCheckpoints(context.checkpoints);
      if (context.renderer?.objects) setObjects(context.renderer.objects);
    }
  }, [acceptProject]);

  useEffect(() => {
    let alive = true;
    api<{ project: Project|null; projects: ProjectSummary[]; cases: AuthoredCase[]; agent?:{directory:string;skill?:string;digitalArtSkill?:string}; warning?: string }>('/api/bootstrap')
      .then(async result => {
        if (!alive) return;
        const requested = new URLSearchParams(location.search).get('project');
        setProjects(result.projects); setCases(result.cases ?? []);
        setAgentDirectory(result.agent?.directory??'');
        setAgentSkill(result.agent?.skill??'skills/core/data-art/SKILL.md');
        setDigitalArtSkill(result.agent?.digitalArtSkill);
        if (result.warning) setError(`项目恢复提示：${result.warning}。请检查数据或源码后重试；已保存的内容仍可查看。`);
        if(!result.project){setEmpty(true);return;}
        if (requested&&result.projects.some(item=>item.id===requested)) {
          try{await refresh(requested);}catch(reason){if(!(reason instanceof ApiError)||reason.status!==404)throw reason;acceptProject(result.project);await refresh(result.project.id);}
        } else { acceptProject(result.project); await refresh(result.project.id);if(requested)setNotice('原作品已移出当前项目，已打开可用作品。'); }
      })
      .catch(reason => { if (alive) setError(errorMessage(reason)); });
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!alive) return;
      if(getConnection().disabled)return;
      socket = new WebSocket(eventsURL(),eventsProtocols());
      socket.onopen = () => { void api<ProjectSummary[]>('/api/projects').then(result => { if (alive) setProjects(result); }).catch(() => {}); };
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          if(message.type==='project.deleted'){
            void api<ProjectSummary[]>('/api/projects').then(async list=>{if(!alive)return;setProjects(list);if(message.projectId===projectRef.current?.id){setProjectOpen(false);setPanel(null);if(list[0]){await refresh(list[0].id);setNotice('原作品已移出当前项目，已打开可用作品。');}else{projectRef.current=null;setProject(null);setEmpty(true);}}}).catch(reason=>{if(alive)setError(errorMessage(reason));});
            return;
          }
          if (message.type === 'thumbnail.updated' || message.type === 'project.changed') void api<ProjectSummary[]>('/api/projects').then(result => { if (alive) setProjects(result); }).catch(() => {});
          if (message.projectId !== projectRef.current?.id) return;
          if (message.type === 'project.changed') void refresh().catch(() => {});
          if (message.type === 'project.error') setError(`${message.message || '项目文件更新失败'}。请检查项目文件，或在代码面板修复后重新保存。`);
        } catch { /* Ignore messages belonging to other transports. */ }
      };
      socket.onclose = () => { if (alive) reconnect = setTimeout(connect, 2000); };
      socket.onerror = () => socket?.close();
    };
    connect();
    const poll = setInterval(() => { if (alive && !document.hidden && !busyRef.current) void refresh().catch(() => {}); }, 5000);
    return () => { alive = false; clearInterval(poll); clearTimeout(reconnect); socket?.close(); };
  }, [acceptProject, refresh]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFocusMode(false); setExportOpen(false); setAgentOpen(false); setNewProject(false); setProjectOpen(false); if(window.matchMedia('(max-width:1079px)').matches)setInspectorOpen(false); } };
    window.addEventListener('keydown', key);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (Object.keys(draftsRef.current).length || notesDirty.current || Object.keys(parameterRef.current).length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  const run = useCallback(async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError(''); setNotice('');
    try { await action(); }
    catch (reason) { setError(errorMessage(reason)); await refresh().catch(() => {}); }
    finally { busyRef.current = false; setBusy(''); }
  }, [refresh]);

  const patchState = useCallback((patch: Partial<ArtworkState>) => run('保存调整', async () => {
    const current = projectRef.current; if (!current) return;
    const next = await api<Project>(`/api/projects/${current.id}/state`, json('PATCH', { expectedRevision: current.revision, patch }));
    acceptProject(next); await refresh();
  }), [run, acceptProject, refresh]);

  const draftParameter = (id: string, value: Value) => {
    if (parameterBaseRevision.current === null) parameterBaseRevision.current = projectRef.current?.revision ?? null;
    parameterRef.current = { ...parameterRef.current, [id]: value }; setParameterDrafts(parameterRef.current);
  };
  const discardParameters = () => {
    parameterRef.current = {}; parameterBaseRevision.current = null; setParameterDrafts({}); setParameterSaveError(null); setError('');
  };
  const commitParameters = useCallback((reapply=false) => {
    const changes = { ...parameterRef.current }; if (!Object.keys(changes).length || busyRef.current || (parameterSaveError && !reapply)) return;
    void run('保存调整', async () => {
      let current = projectRef.current; if (!current) return;
      try {
        // Rebase only after an explicit retry. Keep the normal gesture's original
        // revision so a concurrent Agent edit cannot be silently overwritten.
        if(reapply)current=(await api<{project:Project}>(`/api/projects/${current.id}/context`)).project;
        const next = await api<Project>(`/api/projects/${current.id}/state`, json('PATCH', { expectedRevision: reapply ? current.revision : parameterBaseRevision.current ?? current.revision, patch: { parameters: changes } }));
        // A late input must not be erased by acknowledgement of an earlier save.
        const remaining=Object.fromEntries(Object.entries(parameterRef.current).filter(([id,value])=>!Object.hasOwn(changes,id)||changes[id]!==value));
        parameterRef.current=remaining;parameterBaseRevision.current=Object.keys(remaining).length?next.revision:null;setParameterDrafts(remaining);
        setParameterSaveError(Object.keys(remaining).length?'pending':null);acceptProject(next);
      } catch(reason) {
        setParameterSaveError(reason instanceof ApiError&&reason.status===409?'conflict':'failed');
        // Recovery is shown beside the retained controls. Do not duplicate it
        // in a global notification with an internal error code.
        await refresh().catch(()=>{});return;
      }
      await refresh();
    });
  }, [run, acceptProject, refresh, parameterSaveError]);

  const storeCodeDraft = (path: string, draft?: CodeDraft) => {
    const next = { ...draftsRef.current };
    if (draft) next[path] = draft;
    else delete next[path];
    draftsRef.current = next;
    setDrafts(next);
  };

  const openCodeReview = async (id: string, path: string, update = false) => {
    const { reviewCode } = await import('./code-merge');
    const current = projectRef.current;
    const source = current?.files.find(file => file.path === path);
    const draft = draftsRef.current[path];
    if (current?.id !== id || !source || !draft) return;
    if (!draft.review || update) storeCodeDraft(path, { ...draft, review: reviewCode(draft, source) });
    setReviewPath(path);
  };

  const saveCode = (path: string, useReview = false) => {
    const current = projectRef.current;
    const source = current?.files.find(file => file.path === path);
    const draft = draftsRef.current[path];
    if (!current || !source || !draft) return;
    if (!useReview && (draft.review || draft.baseHash !== source.hash)) {
      void run('打开合并', () => openCodeReview(current.id, path));
      return;
    }
    const review = useReview ? draft.review : undefined;
    if (useReview && (!review || source.hash !== review.saved.hash || review.content === source.content)) return;
    const content = review?.content ?? draft.content;
    const expectedHash = review?.saved.hash ?? draft.baseHash;

    void run('保存代码', async () => {
      let next: Project;
      try {
        next = await api<Project>(`/api/projects/${current.id}/files`, json('PUT', { expectedRevision: current.revision, files: [{ path, content, expectedHash }] }));
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 409) throw reason;
        await refresh();
        const latest = projectRef.current;
        if (latest?.id !== current.id) return;
        const updated = latest.files.find(file => file.path === path);
        if (updated?.hash === expectedHash) setError('项目刚刚更新，请重试保存。');
        else if (!review) await openCodeReview(current.id, path);
        return;
      }
      if (projectRef.current?.id !== current.id) return;
      acceptProject(next);
      if (draftsRef.current[path] === draft) storeCodeDraft(path);
      setReviewPath(null);
      await refresh();
      setNotice('代码已保存');
    });
  };

  const importData = (file: File) => void run('读取数据', async () => {
    const current = projectRef.current; if (!current) return;
    if (file.size > 8 * 1024 * 1024) throw new Error('首版支持 8 MB 以内的数据文件');
    const format = file.name.toLowerCase().endsWith('.json') ? 'json' : file.name.toLowerCase().endsWith('.csv') ? 'csv' : null;
    if (!format) throw new Error('请选择 CSV 或对象数组 JSON 文件');
    const next = await api<Project>(`/api/projects/${current.id}/data`, json('POST', { name: file.name, format, content: await file.text() }));
    acceptProject(next); setPanel('data'); await refresh(); setNotice('数据已导入，分析结果保存在项目中');
  });

  const exportProject = (type: 'web' | 'png') => void run(type === 'png' ? '生成作品图片' : '打包 Web 作品', async () => {
    const current = projectRef.current; if (!current) return;
    if (Object.keys(draftsRef.current).length) throw new Error('请先保存或放弃代码草稿，再导出作品');
    if (Object.keys(parameterRef.current).length) throw new Error('请先完成当前参数调整，再导出已保存的作品');
    const size=type==='png'?parseExportSize(exportWidth,exportHeight):{width:1920,height:1080};
    if(!size)throw new Error('宽 64–4096，高 64–16384，总像素不超过 2400 万');
    setExportOpen(false);
    let job = await api<Job>(`/api/projects/${current.id}/exports`, json('POST', { type, revision: current.revision, ...size, time: type === 'png' ? frameTimeRef.current : current.state.time }));
    const deadline = Date.now() + 60000;
    while (job.status === 'queued' || job.status === 'running') {
      if (Date.now() > deadline) throw new Error(`导出仍在执行，请稍后查询任务 ${job.id}`);
      await new Promise(resolve => setTimeout(resolve, 500)); job = await api<Job>(`/api/jobs/${job.id}`);
    }
    if (job.status !== 'completed') throw new Error(job.error ?? '导出未完成');
    const response=await serviceFetch(`/api/jobs/${job.id}/download`);if(!response.ok)throw new Error('下载失败');const url=URL.createObjectURL(await response.blob());const anchor=document.createElement('a');anchor.href=url;anchor.download=job.filename??'';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice(type === 'png' ? '作品图片已完成' : '独立 Web 作品已完成');
  });

  const onPreviewStatus = useCallback((status: PreviewStatus) => {
    if (status.message !== undefined) setRenderMessage(status.message);
    if (status.error !== undefined) setRenderError(status.error);
    if (status.objects) setObjects(status.objects);
    if (status.selectedId !== undefined) setSelectedObject(status.selectedId);
    if ('timeline' in status) setTimeline(status.timeline);
    if(status.frameTime!==undefined){setFrameTime(status.frameTime);frameTimeRef.current=status.frameTime;}
  }, []);

  const switchProject = (id: string) => {
    if (id === projectRef.current?.id) return;
    if (Object.keys(draftsRef.current).length || notesDirty.current || Object.keys(parameterRef.current).length) { setError('请先保存或放弃当前草稿，再切换项目'); return; }
    void run('打开项目', async () => { await refresh(id); setPanel(null); setProjectOpen(false); });
  };
  const createProject = () => void run('创建项目', async () => {
    if (Object.keys(draftsRef.current).length || notesDirty.current || Object.keys(parameterRef.current).length) throw new Error('请先保存当前草稿');
    const next = await api<Project>('/api/projects', json('POST', { name: newName.trim() || (cases.find(c => c.id === newPreset)?.name ?? '新作品'), preset: newPreset }));
    acceptProject(next); setProjects(previous => [{ id: next.id, name: next.name, revision: next.revision, updatedAt: next.updatedAt }, ...previous]);
    setNewProject(false); setProjectOpen(false); setNewName(''); await refresh(next.id);
  });

  const newProjectDialog=<WorkbenchDialog labelledBy="new-project-title" className="new-project-dialog" onClose={()=>setNewProject(false)}><form onSubmit={event=>{event.preventDefault();createProject();}}><div className="modal-heading"><h2 id="new-project-title">新建作品</h2><button className="icon-button" type="button" aria-label="关闭新建作品" onClick={()=>setNewProject(false)}><Icon name="close"/></button></div><label htmlFor="project-name">作品名称</label><input autoFocus id="project-name" value={newName} onChange={event=>setNewName(event.target.value)} placeholder="为作品命名"/><fieldset className="preset-options"><legend>选择起点</legend>{cases.map(item=><button type="button" key={item.id} aria-pressed={newPreset===item.id} onClick={()=>setNewPreset(item.id)}><span><strong>{item.name}</strong><small>{item.description}</small></span>{newPreset===item.id&&<Icon name="check" size={17}/>}</button>)}</fieldset>{error&&<p className="dialog-feedback is-error" role="alert">{error}</p>}<button type="submit" className="primary-button" disabled={Boolean(busy)}>创建作品<Icon name="arrow" size={16}/></button></form></WorkbenchDialog>;

  if(!project&&empty)return <main className="empty-workbench"><a className="brand" href="/" aria-label="VisBloom 工作台"><BrandMark className="brand-mark"/><span className="brand-wordmark" translate="no">VisBloom</span></a><div><h1>开始一件新作品</h1><button className="primary-button" onClick={()=>setNewProject(true)}><Icon name="plus" size={18}/>新建作品</button><a href="/">返回首页<Icon name="arrow" size={15}/></a></div>{newProject&&newProjectDialog}</main>;

  if (!project) return <main className="loading-screen"><BrandMark className="brand-mark"/>{error||getConnection().disabled?<><h1>连接你的创作服务</h1><ConnectionPanel initiallyOpen/><a className="text-button" href="/collection.html">先浏览作品集 ↗</a></>:<><p>打开你的创作空间</p><span className="loading-line"/></>}</main>;
  const sourcePaths = [...new Set([...project.files.map(file => file.path), ...Object.keys(drafts)])];
  const activePath = sourcePaths.includes(filePath) ? filePath : sourcePaths[0];
  const activeFile = project.files.find(file => file.path === activePath);
  const codeDraft = drafts[activePath];
  const codeConflict = Boolean(codeDraft && activeFile && codeDraft.baseHash !== activeFile.hash);
  const reviewDraft = reviewPath ? drafts[reviewPath] : undefined;
  const codeReview = reviewDraft?.review;
  const reviewSource = project.files.find(file => file.path === reviewPath);
  const fields = project.result?.columns ?? [];
  const numericFields = fields.filter(field => {
    const values = project.result?.rows.map(row => row[field]).filter(value => value !== null && value !== undefined) ?? [];
    return values.length > 0 && values.every(value => typeof value === 'number' && Number.isFinite(value));
  });
  const mappingHasNegatives = project.result?.rows.some(row => typeof row[project.state.mapping.field] === 'number' && Number(row[project.state.mapping.field]) < 0) ?? false;
  const selection = objects.find(object => object.id === selectedObject);
  const copyArtworkInfo = () => {
    const information = [
      `作品名称：${project.name}`,
      `项目 ID：${project.id}`,
      `作品版本：${project.revision}`,
      ...(selection ? [`选中对象：${selection.label}（${selection.id}）`] : []),
      ...(selection?.dataKey && project.result ? [`画布数据结果 ID：${project.result.id}`, `选中对象的数据键：${JSON.stringify(selection.dataKey)}`] : []),
      ...(hasDraft?['本页有未保存草稿，服务上下文只包含已保存内容；请先协调保存，再继续修改。']:[]),
      `工作台：${location.origin}`,
      ...(agentDirectory?[`工程目录：${agentDirectory}`]:[]),
      `创作引导：${(!project.dataset && !project.result && digitalArtSkill) || agentSkill}。请先读取，再通过项目 CLI 接续。`,
      `服务地址通过 ART_WORKBENCH_URL=${getConnection().url} 指定。`,
      `先读取最新状态：npm run --silent visbloom -- context --project ${project.id}`,
      '修改前核对最新 revision 与文件 hash，保留创作者已经做出的调整。',
    ].join('\n');
    if (!navigator.clipboard) { setError('当前浏览器无法复制作品信息，请检查剪贴板权限后重试'); return; }
    void navigator.clipboard.writeText(information)
      .then(() => setNotice('已复制作品信息，可粘贴给你的 Agent。'))
      .catch(() => setError('复制失败，请检查浏览器剪贴板权限后重试'));
  };
  const groups = [...new Set(project.schema.filter(p=>p.role!=='runtime').map(parameter => parameter.group || '视觉表达'))];
  const showInspector = inspectorOpen && panel !== 'data';
  const togglePanel = (next: Exclude<Panel, null>) => setPanel(previous => previous === next ? null : next);

  const hasDraft=Object.keys(drafts).length>0||notesDirty.current||Object.keys(parameterDrafts).length>0;
  const saveLabel=busy||(hasDraft?'尚未保存':renderError?'画面待修复':'已保存');
  return <main className={`atelier ${showInspector?'inspector-open':''} ${panel==='data'&&inspectorOpen?'data-wide':''} ${panel?'with-panel':''} ${focusMode?'focus-mode':''}`}>
    <header className="app-header">
      <a className="brand" href="/" aria-label="VisBloom 工作台"><BrandMark className="brand-mark"/><span className="brand-wordmark" translate="no">VisBloom</span></a>
      <div className="project-switcher">
        <h1 className="project-title"><button id="project-switcher" className="project-switch-button" aria-expanded={projectOpen} aria-haspopup="dialog" onClick={()=>{setExportOpen(false);setProjectOpen(!projectOpen);}} title={project.name}><span>{project.name}</span><Icon name="down" size={13}/></button></h1>
        {projectOpen&&<WorkbenchPopover triggerId="project-switcher" labelledBy="projects-label" className="projects-popover" onClose={()=>setProjectOpen(false)}>
          <div className="popover-heading"><h2 id="projects-label">作品</h2><button className="icon-button" aria-label="关闭项目切换" onClick={()=>setProjectOpen(false)}><Icon name="close" size={15}/></button></div>
          <div className="project-list">{projects.map(item=>{
            const thumbnail=item.thumbnail,url=thumbnail?.url,available=url&&!failedThumbnails.has(url);
            const previewLabel=available?(thumbnail?.status==='stale'?'预览待更新':item.id===project.id?'当前作品':'已保存'):thumbnail?.status==='failed'||url?'重新打开以生成预览':'打开后生成预览';
            return <button key={item.id} onClick={()=>{if(item.id===project.id)setProjectOpen(false);else switchProject(item.id);}} className={`project-item ${item.id===project.id?'selected':''}`} aria-current={item.id===project.id?'true':undefined} disabled={Boolean(busy)}><span className="project-thumbnail" title={previewLabel}>{available?<ServiceImage src={url} alt={`${item.name}的作品预览`} onError={()=>setFailedThumbnails(previous=>new Set(previous).add(url))}/>:<Icon name="document"/>}</span><span><strong>{item.id===project.id?project.name:item.name}</strong><small>{previewLabel}</small></span>{item.id===project.id&&<Icon name="check" size={15}/>}</button>;
          })}</div>
          <button className="add-project" onClick={()=>{setProjectOpen(false);setNewProject(true);}}><Icon name="plus" size={17}/>新建作品</button>
        </WorkbenchPopover>}
      </div>
      <span className={`save-state ${busy?'saving':''} ${hasDraft?'has-draft':''}`} role="status" title={saveLabel}>{busy?<Icon name="loading" size={14}/>:hasDraft?<span className="unsaved-dot"/>:<Icon name="check" size={14}/>}<span>{saveLabel}</span></span>
      <div className="header-actions"><a className="quiet-button" href="/collection.html" title="作品集">作品集</a><button className="quiet-button" onClick={()=>setShareOpen(true)} title="分享作品">分享</button>
        <button className="quiet-button" title="与 Agent 接续创作" aria-label="与 Agent 接续创作" onClick={()=>setAgentOpen(true)}><Icon name="chat"/><span>Agent 接续</span></button>
        <button className="quiet-button" title="保存版本" aria-label="保存版本" disabled={Boolean(busy)} onClick={()=>{setPanel('history');requestAnimationFrame(()=>document.getElementById('checkpoint-label')?.focus());}}><Icon name="history"/><span>保存版本</span></button>
        <div className="export-wrap"><button id="export-trigger" className="primary-button" aria-label="导出作品" aria-expanded={exportOpen} aria-haspopup="dialog" title="导出作品" onClick={()=>{setProjectOpen(false);setExportOpen(!exportOpen);}} disabled={Boolean(busy)}><Icon name="export" size={18}/><span>导出</span></button>{exportOpen&&<WorkbenchPopover triggerId="export-trigger" labelledBy="export-label" className="export-menu" onClose={()=>setExportOpen(false)}><h2 id="export-label" className="popover-label">导出 {project.name}</h2><div className="export-size-options"><label htmlFor="export-size-preset">{project.renderer==='renderer.document'?'图片尺寸上限（长页保持内容比例）':'图片尺寸'}</label><select id="export-size-preset" value={exportPreset} onChange={event=>{const id=event.target.value;setExportPreset(id);const preset=exportSizePresets.find(item=>item.id===id);if(preset){setExportWidth(String(preset.width));setExportHeight(String(preset.height));}}}>{exportSizePresets.map(preset=><option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">自定义</option></select>{exportPreset==='custom'&&<div className="export-custom-size"><label htmlFor="export-width">宽<input id="export-width" type="number" inputMode="numeric" min="64" max="4096" step="1" value={exportWidth} aria-invalid={!parseExportSize(exportWidth,'1080')} aria-describedby={!parseExportSize(exportWidth,exportHeight)?'export-size-error':undefined} onChange={event=>setExportWidth(event.target.value)}/></label><span aria-hidden="true">×</span><label htmlFor="export-height">高<input id="export-height" type="number" inputMode="numeric" min="64" max="16384" step="1" value={exportHeight} aria-invalid={!parseExportSize(exportWidth,exportHeight)} aria-describedby={!parseExportSize(exportWidth,exportHeight)?'export-size-error':undefined} onChange={event=>setExportHeight(event.target.value)}/></label></div>}{!parseExportSize(exportWidth,exportHeight)&&<p id="export-size-error" className="export-size-error" role="status">宽 64–4096，高 64–16384，总像素不超过 2400 万</p>}</div><button disabled={!parseExportSize(exportWidth,exportHeight)||Boolean(busy)} onClick={()=>exportProject('png')}><Icon name="document"/><span>作品图片<small>PNG{parseExportSize(exportWidth,exportHeight)?` · ${Number(exportWidth)} × ${Number(exportHeight)}`:''}</small></span></button><button onClick={()=>exportProject('web')}><Icon name="code"/><span>交互式作品<small>可独立运行的 Web 页面</small></span></button></WorkbenchPopover>}</div>
        <button className="icon-button" title="画面全屏" aria-label="画面全屏" onClick={()=>setFocusMode(true)}><Icon name="expand"/></button>
        <button className="icon-button inspector-toggle" title={showInspector?'收起调整栏':'打开调整栏'} aria-label={showInspector?'收起调整栏':'打开调整栏'} aria-expanded={showInspector} aria-controls="parameters-panel" onClick={()=>{if(panel==='data')setPanel(null);setInspectorOpen(!showInspector);}}><Icon name="settings"/></button>
      </div>
    </header>

    {!codeReview&&(error||notice)&&<div className={`notification ${error?'is-error':''}`} role={error?'alert':'status'}><span>{error||notice}</span><button className="icon-button" aria-label="关闭提示" onClick={()=>{setError('');setNotice('');}}><Icon name="close" size={15}/></button></div>}
    <input ref={fileInput} type="file" className="visually-hidden" accept=".csv,.json,text/csv,application/json" aria-label="导入数据文件" onChange={event=>{const file=event.target.files?.[0];if(file)importData(file);event.target.value='';}}/>

    <section className="canvas-column" aria-label={`${project.name}创作区`}>
      <div className="canvas-stage">
        <Preview project={project} onProject={acceptProject} draftParameters={parameterDrafts} onStatus={onPreviewStatus} selectedObject={selectedObject}/>
        {renderError&&<div className="render-error" role="alert"><div><Icon name="code" size={18}/><strong>代码需要调整</strong></div><p>{renderError}</p><button className="text-button" onClick={()=>setPanel('code')}>打开代码<Icon name="arrow" size={13}/></button></div>}
        {focusMode&&<button ref={focusExit} className="focus-exit icon-button" title="退出画面全屏（Esc）" aria-label="退出画面全屏" onClick={()=>setFocusMode(false)}><Icon name="collapse"/></button>}
      </div>
      <div className="workbench-toolbar">
        <nav className="workspace-tools" aria-label="创作工具">{([{id:'code',label:'代码',icon:'code'},{id:'data',label:'数据',icon:'data'},{id:'history',label:'记录',icon:'history'},{id:'objects',label:'对象',icon:'layers'}] as const).map(tool=><button key={tool.id} aria-pressed={panel===tool.id} aria-controls="workbench-detail" onClick={()=>togglePanel(tool.id)} title={tool.label}><Icon name={tool.icon} size={18}/><span>{tool.label}</span>{tool.id==='code'&&Object.keys(drafts).length>0&&<span className="unsaved-dot"/>}</button>)}</nav>
        <PlaybackBar project={project} timeline={timeline} time={frameTime} busy={Boolean(busy)} onPatch={patchState}/>
        {(renderError||/准备|正在|编译|加载|更新中|连接中/.test(renderMessage))&&<span className={`render-status ${renderError?'has-error':''}`} title={renderError||renderMessage} role="status">{renderError?'画面待修复':renderMessage}</span>}
        {panel&&<button className="icon-button panel-close" title="收起面板" aria-label="收起面板" onClick={()=>setPanel(null)}><Icon name="close" size={17}/></button>}
      </div>
      {panel&&<section id="workbench-detail" className={`detail-panel panel-${panel}`} aria-label={panel==='code'?'作品代码':panel==='data'?'数据与分析':panel==='history'?'创作记录':'画面对象'}>
        {panel==='code'&&activePath&&<>
          <div className="code-toolbar">
            <select aria-label="选择源码文件" value={activePath} disabled={Boolean(busy)} onChange={event=>setFilePath(event.target.value)}>
              {sourcePaths.map(path=><option key={path}>{path}</option>)}
            </select>
            <span className={codeConflict||!activeFile?'conflict-note':'editor-note'} role="status">
              {!activeFile?'文件已移除':codeConflict?'有新版本':codeDraft?'草稿尚未保存':'已同步'}
            </span>
            <span className="toolbar-spacer"/>
            {codeDraft&&<button className="text-button muted" disabled={Boolean(busy)} onClick={()=>storeCodeDraft(activePath)}>放弃草稿</button>}
            <button className="small-button" onClick={()=>saveCode(activePath)} disabled={!activeFile||!codeDraft||Boolean(busy)}>
              {codeDraft?.review?'继续合并':codeConflict?'对比并合并':'保存代码'}<kbd>⌘ S</kbd>
            </button>
          </div>
          <Suspense fallback={<div className="panel-empty">正在打开代码编辑器</div>}>
            <CodeEditor key={`${project.id}/${activePath}`} label={`源码 ${activePath}`}
              value={codeDraft?.content??activeFile?.content??''} readOnly={Boolean(busy)||Boolean(codeDraft?.review)||!activeFile}
              onSave={()=>saveCode(activePath)} onChange={content=>{
                const source = projectRef.current?.files.find(file => file.path === activePath);
                if (!source) return;
                const draft = draftsRef.current[activePath];
                storeCodeDraft(activePath, content === source.content ? undefined : {
                  content, baseHash: draft?.baseHash ?? activeFile?.hash ?? source.hash,
                  baseContent: draft?.baseContent ?? activeFile?.content ?? source.content,
                });
              }}/>
          </Suspense>
        </>}
        {panel==='data'&&<DataPanel key={project.id} project={project} selectedKey={selection?.dataKey} busy={Boolean(busy)} run={run} onImport={()=>fileInput.current?.click()} onApplied={async next=>{acceptProject(next);await refresh();}}/>}
        {panel==='objects'&&<div className="objects-panel"><div className="panel-intro"><h2>画面对象</h2><p>{selectedObject?'已选中对象，可让 Agent 针对它修改。':'选择作品提供的对象。'}</p></div><div className="object-list">{objects.length?objects.map(object=><button aria-pressed={selectedObject===object.id} key={object.id} onClick={()=>setSelectedObject(selectedObject===object.id?null:object.id)}><Icon name="layers" size={17}/><span>{object.label}</span>{selectedObject===object.id&&<Icon name="check" size={15}/>}</button>):<p className="empty-copy">当前画面尚未提供可选对象。</p>}</div></div>}
        {panel==='history'&&<div className="history-layout"><div className="checkpoints"><form onSubmit={event=>{event.preventDefault();void run('保存版本',async()=>{if(Object.keys(draftsRef.current).length||notesDirty.current||Object.keys(parameterRef.current).length)throw new Error('请先保存或放弃草稿，再保存版本');const current=projectRef.current!;await api<Checkpoint>(`/api/projects/${current.id}/checkpoints`,json('POST',{label:checkpointLabel.trim()||`${current.name} · 版本 ${current.revision}`}));setCheckpointLabel('');await refresh();setNotice('当前代码、数据和画面状态已保存为版本');});}}><label htmlFor="checkpoint-label">保存版本</label><div><input id="checkpoint-label" placeholder="为这次尝试命名" value={checkpointLabel} onChange={event=>setCheckpointLabel(event.target.value)}/><button className="small-button" disabled={Boolean(busy)}>保存</button></div></form>{checkpoints.length?checkpoints.map(checkpoint=><div className="checkpoint" key={checkpoint.id}><Icon name="history" size={17}/><span><strong>{checkpoint.label}</strong><small>版本 {checkpoint.revision} · {formatTime(checkpoint.createdAt)}</small></span><button className="text-button" disabled={Boolean(busy)} onClick={()=>void run('恢复版本',async()=>{if(Object.keys(draftsRef.current).length||notesDirty.current||Object.keys(parameterRef.current).length)throw new Error('请先保存或放弃当前草稿');const current=projectRef.current!;const next=await api<Project>(`/api/projects/${current.id}/checkpoints/${checkpoint.id}/restore`,json('POST',{expectedRevision:current.revision}));acceptProject(next);await refresh();setNotice('已恢复为新版本，原有历史仍然保留');})}>恢复</button></div>):<p className="empty-copy">暂无保存的版本</p>}
          <details className="notes-section"><summary><Icon name="document" size={17}/>创作手记{notesDirty.current&&<span className="unsaved-dot"/>}<Icon name="down" size={13}/></summary><textarea className="project-notes" aria-label="创作手记" placeholder="记录这次创作的想法" value={notes} onChange={event=>{notesDirty.current=event.target.value!==project.notes;setNotes(event.target.value);}}/><div className="note-actions"><button className="text-button" disabled={!notesDirty.current||Boolean(busy)} onClick={()=>void run('保存手记',async()=>{const current=projectRef.current!;const next=await api<Project>(`/api/projects/${current.id}/notes`,json('PUT',{expectedRevision:current.revision,notes}));notesDirty.current=false;acceptProject(next);})}>保存手记</button>{notesDirty.current&&<button className="text-button muted" onClick={()=>{notesDirty.current=false;setNotes(project.notes);}}>放弃</button>}</div></details>
        </div><div className="event-list"><h2>最近修改</h2>{events.length?[...events].reverse().slice(0,40).map(event=><div className="event-row" key={event.cursor}><span className="event-dot"/><span><strong>{eventLabel(event.type)}</strong><small>{actorLabel(event.actor)} · 版本 {event.revision}</small></span><time>{formatTime(event.at)}</time></div>):<p className="empty-copy">暂无修改记录</p>}</div></div>}
      </section>}
    </section>

    {showInspector&&<aside className="inspector" id="parameters-panel" aria-label="画面调整"><div className="section-heading"><h2>画面调整</h2><button className="icon-button" aria-label="收起调整栏" onClick={()=>setInspectorOpen(false)}><Icon name="close" size={16}/></button></div>{parameterSaveError&&<div className="parameter-recovery" role="status"><p>{parameterSaveError==='conflict'?'作品已有新修改，调整尚未保存':'调整尚未保存'}</p><div><button className="small-button" disabled={Boolean(busy)} onClick={()=>commitParameters(true)}>{parameterSaveError==='conflict'?'重新应用调整':'重试保存'}</button><button className="text-button muted" disabled={Boolean(busy)} onClick={discardParameters}>放弃调整</button></div></div>}<div className="inspector-scroll">{groups.map(group=><section className="parameter-group" key={group}><h3>{group}</h3>{project.schema.filter(parameter=>parameter.role!=='runtime'&&(parameter.group||'视觉表达')===group).map(definition=><ParameterControl key={`${project.id}/${definition.id}`} definition={definition} value={parameterDrafts[definition.id]??project.state.parameters[definition.id]??definition.default} disabled={Boolean(busy)} onDraft={value=>draftParameter(definition.id,value)} onCommit={()=>commitParameters()}/>)}</section>)}
      {project.bindings!==undefined?(project.bindings.length?<details className="mapping-section"><summary>数据与设计编码<Icon name="down" size={13}/></summary>{project.bindings.map(binding=><p key={`${binding.field}:${binding.channel}`}><code>{binding.field}</code><span>{binding.channel}</span></p>)}</details>:null):<details className="mapping-section"><summary>数据映射<Icon name="down" size={13}/></summary><label htmlFor="mapping-field">数据字段</label><select id="mapping-field" value={project.state.mapping.field} disabled={Boolean(busy)||!numericFields.length} onChange={event=>void patchState({mapping:{...project.state.mapping,field:event.target.value}})}>{!numericFields.includes(project.state.mapping.field)&&<option value={project.state.mapping.field} disabled>{project.state.mapping.field||'暂无数值字段'}</option>}{numericFields.map(field=><option key={field}>{field}</option>)}</select><label htmlFor="mapping-target">视觉属性</label><select id="mapping-target" value={project.state.mapping.target} disabled={Boolean(busy)||!numericFields.length} onChange={event=>void patchState({mapping:{...project.state.mapping,target:event.target.value}})}><option value="weight">视觉权重</option><option value="height">高度与起伏</option><option value="density">分布密度</option></select><label htmlFor="mapping-transform">变化方式</label><select id="mapping-transform" value={project.state.mapping.transform} disabled={Boolean(busy)} onChange={event=>void patchState({mapping:{...project.state.mapping,transform:event.target.value as ArtworkState['mapping']['transform']}})}><option value="linear">按原始比例</option><option value="log" disabled={mappingHasNegatives}>{mappingHasNegatives?'对数压缩（需处理负值）':'对数压缩'}</option><option value="reverse">反向映射</option></select>{!numericFields.length&&<p>当前结果暂无可用于形态映射的数值字段。</p>}</details>}
    </div></aside>}

    {reviewPath&&reviewDraft&&codeReview&&<Suspense fallback={null}>
      <CodeMergeDialog key={`${project.id}/${reviewPath}`} review={codeReview} stale={reviewSource?.hash!==codeReview.saved.hash}
        removed={!reviewSource} busy={Boolean(busy)} error={error}
        onEdit={content=>storeCodeDraft(reviewPath, {...reviewDraft,review:{...codeReview,content}})}
        onClose={()=>{if(!busyRef.current){setReviewPath(null);setError('');}}}
        onRefresh={()=>void run('读取新版本',async()=>{await refresh();await openCodeReview(project.id,reviewPath,true);})}
        onSave={()=>saveCode(reviewPath,true)}
        onFinish={()=>{if(projectRef.current?.files.find(file=>file.path===reviewPath)?.hash===codeReview.saved.hash){
          storeCodeDraft(reviewPath);setReviewPath(null);setError('');
        }}}
      />
    </Suspense>}
    {shareOpen&&<ShareDialog project={project} hasDraft={hasDraft} onClose={()=>setShareOpen(false)}/>}
    {agentOpen&&<WorkbenchDialog labelledBy="agent-title" className="agent-drawer" onClose={()=>setAgentOpen(false)}><div className="modal-heading"><h2 id="agent-title">与 Agent 接续创作</h2><button className="icon-button" aria-label="关闭接续入口" onClick={()=>setAgentOpen(false)}><Icon name="close"/></button></div>{!hasDraft?<ConnectionPanel/>:<p className="dialog-feedback">保存当前草稿后可更改服务连接。</p>}<p className="agent-intro">把「{project.name}」的当前信息交给你的 Agent，修改后在这里继续查看。</p>{selection && <div className="agent-selection"><strong>{selection.label}</strong>
      {selection.dataKey && project.result && <details><summary>对应的数据记录</summary><code>{JSON.stringify(selection.dataKey)}</code></details>}
    </div>}<button className="primary-button artwork-info-copy" onClick={copyArtworkInfo}><Icon name="document" size={18}/>复制给 Agent</button>{(notice.includes('复制')||error.includes('复制')||error.includes('剪贴板'))&&<p className={`dialog-feedback ${error?'is-error':''}`} role={error?'alert':'status'}>{error||notice}</p>}<nav className="agent-help-links" aria-label="接续帮助"><a href="/help/agent-setup.html" target="_blank" rel="noreferrer">使用说明<Icon name="arrow" size={16}/></a><button onClick={()=>{setAgentOpen(false);setPanel('history');}}>查看当前作品的创作记录<Icon name="history" size={16}/></button></nav></WorkbenchDialog>}
    {newProject&&newProjectDialog}
  </main>;
}
