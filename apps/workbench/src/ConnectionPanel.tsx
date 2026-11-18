import { useState } from 'react';
import { disconnectConnection, errorMessage, getConnection, resetConnection, setConnection, testConnection } from './api';

interface ConnectionPanelProps { onConnected?: () => void; onDisconnected?: () => void; initiallyOpen?: boolean }

export function ConnectionPanel({ onConnected, onDisconnected, initiallyOpen = false }: ConnectionPanelProps) {
  const current = getConnection();
  const [url, setURL] = useState(current.url || 'http://127.0.0.1:4318');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState(current);
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setFailed(false); setMessage('正在检查服务…');
    try {
      // Enter a service token again when changing settings; never recover it into a text field.
      const candidate = { url, token };
      await testConnection(candidate);
      setConnection(candidate); setToken(''); setStatus(getConnection()); setMessage('已连接你的创作服务'); onConnected?.();
    } catch (error) {
      setFailed(true);
      const detail = errorMessage(error);
      setMessage(error instanceof TypeError ? '无法连接，请检查服务地址、允许的网页来源及浏览器的本地网络权限。' : detail);
    } finally { setBusy(false); }
  }
  function disconnect() { disconnectConnection(); setToken(''); setStatus(getConnection()); setMessage('已断开连接'); setFailed(false); onDisconnected?.(); }
  function reset() { resetConnection(); const next = getConnection(); setToken(''); setStatus(next); setURL(next.url || 'http://127.0.0.1:4318'); setMessage(next.disabled ? '已清除连接信息' : '已恢复本机默认服务'); setFailed(false); onDisconnected?.(); }
  return <details className="service-connection" open={initiallyOpen || undefined} style={{ maxWidth: 520 }}>
    <summary>创作服务{status.disabled ? ' · 未连接' : ' · ' + status.url}</summary>
    <form onSubmit={event => void connect(event)} style={{ display: 'grid', gap: 10, padding: '14px 0' }}>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.72 }}>连接你自己运行的工作台服务；继续使用你已有的 Agent。</p>
      <label style={{ display: 'grid', gap: 5 }}>服务地址<input type="url" required value={url} onChange={event => setURL(event.target.value)} placeholder="http://127.0.0.1:4318" autoComplete="off" spellCheck={false} disabled={busy} /></label>
      <label style={{ display: 'grid', gap: 5 }}>服务口令（如已设置）<input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder={status.hasToken ? '更改连接时请重新输入口令' : '由你的服务提供'} autoComplete="off" maxLength={4096} disabled={busy} /></label>
      <small style={{ opacity: 0.65 }}>这里不需要 AI 模型密钥。连接信息只在当前标签页会话中保留。</small>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button type="submit" className="small-button" disabled={busy}>{busy ? '正在连接…' : '测试并连接'}</button><button type="button" className="text-button" onClick={disconnect} disabled={busy || status.disabled}>断开</button><button type="button" className="text-button" onClick={reset} disabled={busy}>重置</button></div>
      {message && <p role={failed ? 'alert' : 'status'} style={{ margin: 0, fontSize: 13 }}>{message}</p>}
    </form>
  </details>;
}
