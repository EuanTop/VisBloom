import { useState } from 'react';
import CodeEditor from './CodeEditor';
import Icon from './WorkbenchIcon';
import { WorkbenchDialog } from './WorkbenchOverlay';
import type { CodeReview } from './code-merge';

export default function CodeMergeDialog({ review, stale, removed, busy, error, onEdit, onClose, onRefresh, onSave, onFinish }: {
  review: CodeReview;
  stale: boolean;
  removed: boolean;
  busy: boolean;
  error: string;
  onEdit: (content: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onFinish: () => void;
}) {
  const [showDraft, setShowDraft] = useState(review.manual);
  const alreadySaved = review.comparison === review.saved.content && review.content === review.saved.content;

  return <WorkbenchDialog labelledBy="code-merge-title" className="code-merge-dialog" onClose={onClose}>
    <div className="modal-heading">
      <div><h2 id="code-merge-title">合并代码</h2><code>{review.saved.path}</code></div>
      <button className="icon-button" aria-label="关闭代码合并" disabled={busy} onClick={onClose}><Icon name="close"/></button>
    </div>
    <div className="code-merge-tools">
      <button className="small-button" aria-pressed={showDraft} onClick={() => setShowDraft(true)}>草稿差异</button>
      <button className="small-button" aria-pressed={!showDraft} onClick={() => setShowDraft(false)}>合并结果</button>
      <span>{showDraft ? '− 已保存 · + 草稿' : '− 已保存 · + 合并结果'}</span>
    </div>
    {showDraft && <CodeEditor label="草稿差异" original={review.saved.content} value={review.comparison} readOnly />}
    <div className="code-merge-result" hidden={showDraft}>
      <CodeEditor key={review.saved.hash} label="编辑合并结果" original={review.saved.content} value={review.content}
        readOnly={busy} onChange={onEdit}
        onSave={stale || busy || review.content === review.saved.content ? undefined : onSave}/>
    </div>
    <div className="code-merge-footer">
      <span role={error || stale ? 'alert' : 'status'}>
        {error || (removed ? '文件已移除，草稿仍可复制。' : stale ? '文件又有更新，合并结果已保留。' :
          alreadySaved ? '草稿已与当前版本一致。' : review.manual && showDraft ? '请对照草稿，编辑合并结果。'
            : review.manual ? '' : '已合并不同位置的改动。')}
      </span>
      {removed ? null : stale ? <button className="small-button" disabled={busy} onClick={onRefresh}>对比最新版本</button>
        : alreadySaved ? <button className="small-button" disabled={busy} onClick={onFinish}>完成</button>
          : <button className="primary-button" disabled={showDraft || busy || review.content === review.saved.content} onClick={onSave}>保存合并</button>}
    </div>
  </WorkbenchDialog>;
}
