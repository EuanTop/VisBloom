import { useRef, useState } from 'react';
import type { DataFit, DataResult, Project, Value } from '@art/contracts';
import { api, json } from './api';
import Icon from './WorkbenchIcon';
import ArtworkEvidence from './ArtworkEvidence';

type Result = Pick<DataResult, 'columns' | 'rows' | 'rowCount' | 'truncated'>;

interface Analysis extends Result {
  projectId: string;
  revision: number;
  datasetId: string;
  sql: string;
  dataFit?: DataFit;
}

const defaultSQL = 'SELECT * FROM data';
const typeLabels = { any: '任意值', string: '文本', number: '数值', boolean: '布尔值' };

export default function DataPanel({ project, busy, run, onApplied, onImport, selectedKey }: {
  project: Project;
  busy: boolean;
  run(label: string, action: () => Promise<void>): Promise<void>;
  onApplied(project: Project): Promise<void>;
  onImport(): void;
  selectedKey?: Record<string,Value>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [shown, show] = useState<'current' | 'preview'>('current');
  const current = useRef(project);
  current.current = project;
  const applied = project.result;
  const appliedSQL = applied?.sql ?? defaultSQL;
  const sql = draft ?? appliedSQL;
  const preview = analysis?.datasetId === project.dataset?.id ? analysis : null;
  const fit = preview?.dataFit;
  const blocked = Boolean(fit?.missing.length || fit?.incompatible.length);
  const stale = preview && (preview.revision !== project.revision || preview.sql !== sql);
  const canApply = Boolean(preview && !stale && !blocked);
  const showPreview = shown === 'preview' && preview !== null;
  const visibleResult = showPreview ? preview : applied;
  const details = [
    fit?.missing.length ? '缺少画布需要的字段：' + fit.missing.join('、') + '。' : '',
    fit?.incompatible.length ? fit.incompatible.map(({ field, expected }) => field + ' 应为' + typeLabels[expected]).join('、') + '。' : '',
    fit?.unchecked.length ? '没有可用于核对类型的值：' + fit.unchecked.join('、') + '。' : '',
    fit?.advisoryMissing.length ? '作品映射里还有这些字段未返回：' + fit.advisoryMissing.join('、') + '。' : '',
    preview?.truncated ? '试算结果已截断。' : '',
  ].filter(Boolean);
  const status = stale ? '查询或作品版本已更新，请重新试算。' : blocked
    ? '这份结果可用于分析。当前作品所需字段缺失或类型不符。'
    : fit?.unchecked.length || fit?.advisoryMissing.length || preview?.truncated
      ? '有数据细节需要核对。'
      : fit?.required.length ? '已核对作品声明的字段和可检查的类型。' : '作品未声明必需字段。';

  const analyze = () => run('AVA 正在试算', async () => {
    const target = current.current;
    const result = await api<Analysis>('/api/projects/' + target.id + '/explore', json('POST', { sql, maxRows: 10000 }));
    if (current.current.id !== target.id || current.current.dataset?.id !== result.datasetId) return;
    setAnalysis(result);
    show('preview');
  });
  const apply = () => run('正在更新画布数据', async () => {
    if (!preview || !canApply) return;
    const next = await api<Project>('/api/projects/' + project.id + '/query',
      json('POST', { sql: preview.sql, maxRows: 10000, expectedRevision: preview.revision }));
    setAnalysis(null);
    setDraft(null);
    show('current');
    await onApplied(next);
  });

  const semanticPanel = project.preset==='stork-migration' || project.preset==='breathing-quilt' || project.preset==='knit-stretch' || project.preset==='alpine-rain';
  const resultTable = visibleResult ? <div className="table-scroll">
      {visibleResult.truncated && !showPreview && <p className="data-provenance">当前画布使用的查询结果已截断。</p>}
      {visibleResult.rows.length > 200 && <p className="data-provenance">表格展示前 200 行，共 {visibleResult.rows.length} 行。</p>}
      <table><thead><tr><th className="row-index">#</th>{visibleResult.columns.map(field => <th key={field}>{field}</th>)}</tr></thead>
        <tbody>{visibleResult.rows.slice(0, 200).map((row, index) => <tr key={index}><td className="row-index">{index + 1}</td>{visibleResult.columns.map(field => <td key={field}>
          {row[field] === null || row[field] === undefined ? <span className="null-value">空</span> : typeof row[field] === 'object' ? JSON.stringify(row[field]) : String(row[field])}
        </td>)}</tr>)}</tbody>
      </table>
    </div> : <div className="panel-empty">导入数据后即可查看当前画布数据。</div>;
  return <>
    <ArtworkEvidence project={project} selectedKey={selectedKey}/>
    <div className="data-summary">
      <div><strong>{project.dataset?.name ?? '尚未导入数据'}</strong><span>{project.dataset ? '数据来源' : 'CSV / JSON · 最大 8 MB'}</span></div>
      <button className="quiet-button" onClick={onImport} disabled={busy}><Icon name="upload" size={17}/>导入数据</button>
    </div>
    <div className="data-results-switch" role="group" aria-label="要查看的数据">
      <button type="button" aria-pressed={!showPreview} onClick={() => show('current')}>
        <strong>当前画布</strong><span>{applied ? applied.rowCount.toLocaleString('zh-CN') + ' 行 · 版本 ' + project.revision : '暂无数据'}</span>
      </button>
      <button type="button" aria-pressed={showPreview} onClick={() => show('preview')} disabled={!preview}>
        <strong>本次试算</strong><span>{preview ? preview.rowCount.toLocaleString('zh-CN') + ' 行 · ' + (blocked ? '分析证据' : '未应用') : '暂无结果'}</span>
      </button>
    </div>
    {applied && <details className="applied-query">
      <summary>当前生效的查询<Icon name="down" size={13}/></summary>
      <pre>{appliedSQL}</pre>
      {Boolean(project.bindings?.length) && <dl>{project.bindings?.map(({ field, channel }) => <div key={field + ':' + channel}><dt>{field}</dt><dd>{channel}</dd></div>)}</dl>}
    </details>}
    <form className="query-toolbar" onSubmit={event => { event.preventDefault(); if (!busy && project.dataset && sql.trim()) void analyze(); }}>
      <label htmlFor="sql-query">试算 SQL</label>
      <input id="sql-query" aria-label="数据查询 SQL" value={sql} onChange={event => setDraft(event.target.value === appliedSQL ? null : event.target.value)} spellCheck={false}/>
      <button className="small-button" disabled={busy || !project.dataset || !sql.trim()} type="submit">AVA 试算</button>
      <button className="small-button" disabled={busy || !canApply} aria-describedby={preview ? 'data-fit-status' : undefined}
        type="button" onClick={() => void apply()}>应用到画布</button>
    </form>
    {preview && <div className="data-fit-status">
      <p id="data-fit-status" role="status">{status}</p>
      {details.length > 0 && <details><summary>查看数据检查</summary><ul>{details.map(detail => <li key={detail}>{detail}</li>)}</ul></details>}
    </div>}
    {semanticPanel && !showPreview && visibleResult
      ? <details className="applied-query"><summary>查看原始结果<Icon name="down" size={13}/></summary>{resultTable}</details>
      : resultTable}

  </>;
}
