export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

/** Service credentials belong to this tab, never to an artwork or public URL. */
export interface ServiceConnection { url: string; token?: string; disabled?: boolean }
const storageKey = 'art-workbench.service.v1';
let connection: ServiceConnection | undefined;
let initialized = false;
const listeners = new Set<() => void>();

function loopback(hostname: string) { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname); }

export function normalizeServiceURL(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的服务地址，例如 http://127.0.0.1:4318'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('服务地址只能包含 http(s) 协议、主机和端口');
  }
  if (url.protocol === 'http:' && !loopback(url.hostname)) throw new Error('远程服务请使用 HTTPS 地址');
  return url.origin;
}

function readConnection() {
  if (!initialized) {
    initialized = true;
    try {
      const saved = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && 'disabled' in parsed && parsed.disabled === true) connection = { url: '', disabled: true };
        else if (parsed && typeof parsed === 'object' && 'url' in parsed && typeof parsed.url === 'string') {
          const token = 'token' in parsed && typeof parsed.token === 'string' ? parsed.token : undefined;
          connection = { url: normalizeServiceURL(parsed.url), token };
        }
      }
    } catch { /* A blocked or expired tab store must not prevent an in-memory connection. */ }
  }
  return connection;
}

function effectiveConnection(): ServiceConnection {
  const configured = readConnection();
  if (configured) return configured;
  if (typeof location !== 'undefined' && loopback(location.hostname) && ['http:', 'https:'].includes(location.protocol)) return { url: location.origin };
  return { url: '', disabled: true };
}

/** Read only connection status; callers never need the bearer token. */
export function getConnection() {
  const value = effectiveConnection();
  return { url: value.url, hasToken: Boolean(value.token), configured: Boolean(readConnection()), disabled: Boolean(value.disabled) };
}

function saveConnection(value?: ServiceConnection) {
  initialized = true;
  connection = value;
  try {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  } catch { /* Keep working in memory when sessionStorage is unavailable. */ }
  for (const listener of listeners) listener();
}

export function setConnection(value: ServiceConnection) {
  const url = normalizeServiceURL(value.url);
  const token = value.token?.trim() || undefined;
  if (token && (token.length > 4096 || /[\r\n\0]/.test(token))) throw new Error('服务口令格式不正确');
  saveConnection({ url, token });
}
export function resetConnection() { saveConnection(); }
export function disconnectConnection() { saveConnection({ url: '', disabled: true }); }
export function subscribeConnection(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

function connectionURL(path: string, value: ServiceConnection) {
  // Only API paths may carry authorization. Reject absolute URLs, traversal and backslashes.
  if (!path.startsWith('/api/') || /[\\#\r\n]/.test(path)) throw new Error('无效的服务请求路径');
  const relative = new URL(path, 'https://art-path.invalid');
  if (!relative.pathname.startsWith('/api/') || relative.origin !== 'https://art-path.invalid') throw new Error('无效的服务请求路径');
  if (value.disabled || !value.url) throw new ApiError('连接你的创作服务后，即可打开工作台', 0, 'connection_required');
  const base = normalizeServiceURL(value.url);
  const url = new URL(relative.pathname + relative.search, base);
  if (url.origin !== base) throw new Error('无效的服务请求路径');
  return url.toString();
}
export function serviceURL(path: string) { return connectionURL(path, effectiveConnection()); }
export function eventsURL() {
  const value = effectiveConnection();
  // Reuse endpoint validation and the disconnected guard without authorizing another path.
  const url = new URL(connectionURL('/api/bootstrap', value));
  url.pathname = '/events'; url.search = ''; url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
export function eventsProtocols() {
  const token = effectiveConnection().token;
  if (!token) return ['art-events'];
  const bytes = new TextEncoder().encode(token);
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return ['art-events', `bearer.${encoded}`];
}

async function fetchFrom(value: ServiceConnection, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  // Never accept another caller's bearer token or redirect credentials to a different endpoint.
  headers.delete('Authorization');
  if (value.token) headers.set('Authorization', `Bearer ${value.token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(connectionURL(path, value), { ...options, headers, credentials: 'omit', redirect: 'error' });
}
export function serviceFetch(path: string, options: RequestInit = {}) { return fetchFrom(effectiveConnection(), path, options); }

async function responseJSON<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const value = body?.error;
    throw new ApiError(typeof value === 'string' ? value : value?.message ?? body?.message ?? `请求失败 (${response.status})`, response.status, value?.code ?? body?.code);
  }
  return body as T;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> { return responseJSON<T>(await serviceFetch(path, options)); }

/** Probe a candidate without changing or persisting the current connection. */
export async function testConnection(value: ServiceConnection): Promise<void> {
  const url = normalizeServiceURL(value.url);
  const body = await responseJSON<unknown>(await fetchFrom({ url, token: value.token?.trim() || undefined }, '/api/bootstrap', { signal: AbortSignal.timeout(12_000) }));
  if (!body || typeof body !== 'object' || !('projects' in body) || !Array.isArray(body.projects) || !('project' in body)) throw new Error('该地址不是兼容的创作服务');
}

export function json(method: string, body: unknown): RequestInit { return { method, body: JSON.stringify(body) }; }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
