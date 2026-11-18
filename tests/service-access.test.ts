import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createServiceAccess, serviceAccessFromEnv } from '../apps/server/src/access';
import { api, disconnectConnection, eventsProtocols, eventsURL, getConnection, resetConnection, serviceFetch, serviceURL, setConnection, testConnection } from '../apps/workbench/src/api';

const local = 'http://127.0.0.1:4318';
const frontend = 'https://art.example';
const secret = 'test-only-service-token';
function fixture(options: Partial<Parameters<typeof createServiceAccess>[0]> = {}) {
  const access = createServiceAccess({ port: 4318, ...options });
  const writes = vi.fn();
  const app = new Hono();
  app.use('/api/*', access.middleware);
  app.get('/api/bootstrap', c => c.json({ project: null, projects: [] }));
  app.post('/api/project', c => { writes(); return c.json({ saved: true }); });
  return { app, writes, access };
}

describe('workbench service authority, origin and authentication', () => {
  it('keeps the default loopback service usable from its own origin and CLI only', async () => {
    const { app, writes } = fixture();
    expect((await app.request(local + '/api/bootstrap')).status).toBe(200);
    expect((await app.request(local + '/api/project', { method: 'POST', headers: { origin: local } })).status).toBe(200);
    expect(writes).toHaveBeenCalledTimes(1);
    for (const origin of ['https://evil.example', 'http://localhost:4318', 'null', local + '/', local + '.evil']) {
      const response = await app.request(local + '/api/project', { method: 'POST', headers: { origin } });
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
    expect(writes).toHaveBeenCalledTimes(1);
    expect((await app.request(local + '/api/bootstrap', { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
  });

  it('rejects DNS rebinding, unconfigured hosts and mismatched absolute request authorities', async () => {
    const { app } = fixture();
    for (const url of ['http://rebind.example:4318', 'http://127.0.0.2:4318', 'http://127.0.0.1:9999', 'http://localhost.:4318']) {
      expect((await app.request(url + '/api/bootstrap')).status).toBe(403);
    }
    expect((await app.request(local + '/api/bootstrap', { headers: { host: 'evil.example' } })).status).toBe(403);
    expect((await app.request('http://localhost:4318/api/bootstrap', { headers: { origin: 'http://localhost:4318' } })).status).toBe(200);
    expect((await app.request('http://[::1]:4318/api/bootstrap', { headers: { origin: 'http://[::1]:4318' } })).status).toBe(200);
  });

  it('requires both an exact allowed origin and token for cross-origin API reads and writes', async () => {
    const { app, writes } = fixture({ allowedOrigins: [frontend], apiToken: secret });
    for (const authorization of [undefined, 'Bearer wrong', 'Basic ' + secret]) {
      const response = await app.request(local + '/api/project', { method: 'POST', headers: { origin: frontend, ...(authorization ? { authorization } : {}) } });
      expect(response.status).toBe(401);
      expect(response.headers.get('access-control-allow-origin')).toBe(frontend);
      expect(await response.text()).not.toContain(secret);
    }
    const response = await app.request(local + '/api/project', { method: 'POST', headers: { origin: frontend, authorization: 'Bearer ' + secret } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(frontend);
    expect(response.headers.get('vary')).toContain('Origin');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(writes).toHaveBeenCalledTimes(1);
    expect((await app.request(local + '/api/bootstrap', { headers: { origin: 'https://sub.art.example', authorization: 'Bearer ' + secret } })).status).toBe(403);
    expect((await app.request(local + '/api/bootstrap', { headers: { origin: frontend + '/', authorization: 'Bearer ' + secret } })).status).toBe(403);
    expect((await app.request(local + '/api/bootstrap', { headers: { origin: local } })).status).toBe(401);
    expect((await app.request(local + '/api/bootstrap', { headers: { authorization: 'Bearer ' + secret } })).status).toBe(200);
  });

  it('permits credential-free preflight only for accepted origins and known methods/headers', async () => {
    const { app, writes } = fixture({ allowedOrigins: [frontend], apiToken: secret });
    const headers = { origin: frontend, 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'Authorization, Content-Type, X-Art-Actor', 'access-control-request-private-network': 'true' };
    const response = await app.request(local + '/api/project', { method: 'OPTIONS', headers });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(frontend);
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(response.headers.get('access-control-allow-private-network')).toBe('true');
    expect(writes).not.toHaveBeenCalled();
    for (const change of [{ origin: 'https://evil.example' }, { 'access-control-request-method': 'TRACE' }, { 'access-control-request-headers': 'X-Unsafe' }]) {
      expect((await app.request(local + '/api/project', { method: 'OPTIONS', headers: { ...headers, ...change } })).status).toBe(403);
    }
    expect((await app.request(local + '/api/project', { method: 'POST', headers: { origin: frontend } })).status).toBe(401);
  });

  it('requires explicit authority and token before a service can bind beyond loopback', async () => {
    expect(() => createServiceAccess({ port: 4318, bindHost: '0.0.0.0' })).toThrow();
    expect(() => createServiceAccess({ port: 4318, bindHost: '0.0.0.0', apiToken: secret })).toThrow('ART_PUBLIC_ORIGIN');
    expect(() => createServiceAccess({ port: 4318, allowedOrigins: [frontend] })).toThrow('token');
    for (const origin of ['*', 'null', 'https://art.example/', 'https://art.example/path', 'https://user:password@art.example', 'https://*.example']) {
      expect(() => createServiceAccess({ port: 4318, apiToken: secret, allowedOrigins: [origin] })).toThrow();
    }
    const { app } = fixture({ bindHost: '0.0.0.0', publicOrigin: 'https://service.example', apiToken: secret });
    expect((await app.request('http://service.example/api/bootstrap', { headers: { origin: 'https://service.example', authorization: 'Bearer ' + secret } })).status).toBe(200);
    expect((await app.request('http://service.example/api/bootstrap', { headers: { origin: 'https://service.example' } })).status).toBe(401);
    expect((await app.request('http://different.example/api/bootstrap', { headers: { authorization: 'Bearer ' + secret } })).status).toBe(403);
    expect(() => serviceAccessFromEnv(4318, { ART_HOST: '0.0.0.0', ART_ALLOWED_ORIGINS: frontend })).toThrow();
  });

  it('authenticates event upgrades by origin and non-reflected subprotocol without query tokens', () => {
    const { access } = fixture({ allowedOrigins: [frontend], apiToken: secret });
    const encoded = Buffer.from(secret).toString('base64url');
    const request = { url: '/events', headers: { host: '127.0.0.1:4318', origin: frontend, 'sec-websocket-protocol': `art-events, bearer.${encoded}` } };
    expect(access.authorizeWebSocket(request).ok).toBe(true);
    expect(access.websocketProtocols(new Set(['art-events', `bearer.${encoded}`]))).toBe('art-events');
    expect(access.websocketProtocols(new Set([`bearer.${encoded}`]))).toBe(false);
    expect(access.authorizeWebSocket({ ...request, url: '/events?token=' + secret }).ok).toBe(false);
    for (const change of [{ origin: 'https://evil.example' }, { host: 'evil.example:4318' }, { 'sec-websocket-protocol': 'art-events' }, { 'sec-websocket-protocol': 'art-events, bearer.wrong' }, { 'sec-websocket-protocol': `art-events, bearer.${encoded}, bearer.${encoded}` }]) {
      expect(access.authorizeWebSocket({ ...request, headers: { ...request.headers, ...change } }).ok).toBe(false);
    }
    expect(access.authorizeWebSocket({ url: '/events', headers: { host: 'localhost:4318', authorization: 'Bearer ' + secret } }).ok).toBe(true);
    expect(JSON.stringify(access.authorizeWebSocket({ ...request, headers: { ...request.headers, 'sec-websocket-protocol': 'art-events' } }))).not.toContain(secret);
    expect(fixture().access.authorizeWebSocket({ url: '/events', headers: { host: 'localhost:4318', origin: 'http://localhost:4318' } }).ok).toBe(true);
  });
});

afterEach(() => { resetConnection(); vi.unstubAllGlobals(); });
describe('portable browser connection', () => {
  it('requires an explicit service on a hosted frontend and defaults only local frontends to same-origin', () => {
    vi.stubGlobal('location', new URL(frontend));
    expect(getConnection().disabled).toBe(true);
    expect(() => serviceURL('/api/bootstrap')).toThrow('连接');
    vi.stubGlobal('location', new URL(local));
    expect(serviceURL('/api/bootstrap')).toBe(local + '/api/bootstrap');
    disconnectConnection();
    expect(() => eventsURL()).toThrow('连接');
  });

  it('sends bearer only to the configured API, rejects caller URL escapes and prevents redirects', async () => {
    vi.stubGlobal('location', new URL(frontend));
    const fetch = vi.fn(async () => Response.json({ project: null, projects: [] }));
    vi.stubGlobal('fetch', fetch);
    setConnection({ url: local, token: secret });
    await api('/api/bootstrap', { headers: new Headers({ 'X-Art-Actor': 'human' }) });
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(local + '/api/bootstrap');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer ' + secret);
    expect(new Headers(options.headers).get('x-art-actor')).toBe('human');
    expect(options.redirect).toBe('error');
    expect(options.credentials).toBe('omit');
    for (const path of ['https://evil.example/api/steal', '//evil.example/api/steal', '/api/../../steal', '/api/..%2f../steal#fragment', '/events', '/api/\\evil']) {
      await expect(serviceFetch(path)).rejects.toThrow();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(eventsURL()).toBe('ws://127.0.0.1:4318/events');
    expect(eventsURL()).not.toContain(secret);
    expect(eventsProtocols()).toEqual(['art-events', 'bearer.' + Buffer.from(secret).toString('base64url')]);
    expect(JSON.stringify(getConnection())).not.toContain(secret);
    expect(() => setConnection({ url: 'http://remote.example', token: secret })).toThrow('HTTPS');
  });

  it('tests candidates without changing the current connection and checks bootstrap compatibility', async () => {
    setConnection({ url: local, token: secret });
    const fetch = vi.fn(async () => Response.json({ unexpected: true }));
    vi.stubGlobal('fetch', fetch);
    await expect(testConnection({ url: 'https://service.example', token: 'candidate' })).rejects.toThrow('兼容');
    expect(getConnection().url).toBe(local);
    fetch.mockImplementation(async () => Response.json({ project: null, projects: [] }));
    await testConnection({ url: 'https://service.example', token: 'candidate' });
    expect(getConnection().url).toBe(local);
    const [url, options] = fetch.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('https://service.example/api/bootstrap');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer candidate');
  });
});
