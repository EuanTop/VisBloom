import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { MiddlewareHandler } from 'hono';

export interface ServiceAccessOptions {
  port: number;
  bindHost?: string;
  allowedOrigins?: readonly string[];
  apiToken?: string;
  publicOrigin?: string;
}
export interface AccessDecision { ok: boolean; status: 200 | 401 | 403; code: string }
const loopbacks = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const requestHeaders = new Set(['authorization', 'content-type', 'x-art-actor']);

function configuredOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Service origins must be exact http(s) origins'); }
  if (value.includes('*') || !['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Service origins must be exact http(s) origins without paths or wildcards');
  return url.origin;
}
function safeTokenEqual(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function bearer(header: string | undefined) { return header?.startsWith('Bearer ') ? header.slice(7) : undefined; }
function one(value: string | string[] | undefined) { return typeof value === 'string' ? value : undefined; }
function deny(code: string, status: 401 | 403 = 403): AccessDecision { return { ok: false, status, code }; }

/** All authorities are explicit. Forwarded Host/Origin headers are deliberately ignored. */
export function createServiceAccess(options: ServiceAccessOptions) {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Invalid service port');
  const bindHost = options.bindHost ?? '127.0.0.1';
  const token = options.apiToken;
  if (token !== undefined && (!token.trim() || token !== token.trim() || token.length > 4096 || /[\r\n\0]/.test(token))) throw new Error('Invalid service API token');
  const allowed = new Set((options.allowedOrigins ?? []).map(configuredOrigin));
  const publicOrigin = options.publicOrigin ? configuredOrigin(options.publicOrigin) : undefined;
  if ((!loopbacks.has(bindHost) || publicOrigin || allowed.size > 0) && !token) throw new Error('An API token is required for remote access or allowed origins');
  if (!loopbacks.has(bindHost) && !publicOrigin) throw new Error('ART_PUBLIC_ORIGIN is required for a non-loopback binding');
  const localAuthorities = new Set(['localhost', '127.0.0.1', '[::1]'].map(host => new URL(`http://${host}:${options.port}`).host));
  const publicAuthority = publicOrigin ? new URL(publicOrigin).host : undefined;

  function authorityOrigin(authority: string, scheme = 'http:'): string | undefined {
    // URL parsing alone accepts credentials, paths and normalized trailing dots: reject them first.
    if (!authority || /[\s/@\\?#]/.test(authority)) return undefined;
    let parsed: URL;
    try { parsed = new URL(`${scheme}//${authority}`); } catch { return undefined; }
    if (parsed.host !== authority.toLowerCase()) return undefined;
    if (publicAuthority && parsed.host === publicAuthority) return publicOrigin;
    if (localAuthorities.has(parsed.host)) return parsed.origin;
    return undefined;
  }

  function originDecision(authority: string, origin: string | undefined, scheme: string, fetchSite?: string) {
    const ownOrigin = authorityOrigin(authority, scheme);
    if (!ownOrigin) return { decision: deny('host_forbidden'), cors: undefined, crossOrigin: false };
    if (!origin) return { decision: fetchSite === 'cross-site' ? deny('origin_required') : undefined, cors: undefined, crossOrigin: false };
    let validOrigin: string;
    try { validOrigin = configuredOrigin(origin); } catch { return { decision: deny('origin_forbidden'), cors: undefined, crossOrigin: true }; }
    if (validOrigin === ownOrigin) return { decision: undefined, cors: validOrigin, crossOrigin: false };
    if (allowed.has(validOrigin) && token) return { decision: undefined, cors: validOrigin, crossOrigin: true };
    return { decision: deny('origin_forbidden'), cors: undefined, crossOrigin: true };
  }

  const middleware: MiddlewareHandler = async (c, next) => {
    let url: URL;
    try { url = new URL(c.req.url); } catch { return c.json({ error: { code: 'host_forbidden', message: 'Service access denied' } }, 403); }
    const authority = c.req.header('host') ?? url.host;
    // Reject mismatched absolute request URLs as well as DNS rebinding authorities.
    if (authority.toLowerCase() !== url.host.toLowerCase()) return c.json({ error: { code: 'host_forbidden', message: 'Service access denied' } }, 403);
    const origin = c.req.header('origin');
    const result = originDecision(authority, origin, url.protocol, c.req.header('sec-fetch-site'));
    c.header('Vary', 'Origin');
    if (result.decision) return c.json({ error: { code: result.decision.code, message: 'Service access denied' } }, result.decision.status);
    if (result.cors) {
      c.header('Access-Control-Allow-Origin', result.cors);
      c.header('Access-Control-Expose-Headers', 'Content-Disposition');
    }
    const preflightMethod = c.req.header('access-control-request-method');
    if (c.req.method === 'OPTIONS' && origin && preflightMethod) {
      const headers = (c.req.header('access-control-request-headers') ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
      if (!methods.has(preflightMethod) || headers.some(value => !requestHeaders.has(value))) return c.json({ error: { code: 'preflight_forbidden', message: 'Service access denied' } }, 403);
      c.header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      c.header('Access-Control-Allow-Methods', [...methods].join(', '));
      c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Art-Actor');
      c.header('Access-Control-Max-Age', '300');
      if (c.req.header('access-control-request-private-network') === 'true') c.header('Access-Control-Allow-Private-Network', 'true');
      return c.body(null, 204);
    }
    // A configured token protects same-origin and non-browser requests too.
    if (token && !safeTokenEqual(bearer(c.req.header('authorization')), token)) return c.json({ error: { code: 'unauthorized', message: 'Service authentication required' } }, 401);
    await next();
  };

  function authorizeWebSocket(request: Pick<IncomingMessage, 'headers' | 'url'>): AccessDecision {
    // Tokens in query strings are never accepted; they leak into history, proxies and logs.
    if (request.url !== '/events') return deny('websocket_path_forbidden');
    const authority = one(request.headers.host) ?? '';
    const origin = one(request.headers.origin);
    const result = originDecision(authority, origin, 'http:', one(request.headers['sec-fetch-site']));
    if (result.decision) return result.decision;
    let actual = bearer(one(request.headers.authorization));
    const protocols = (one(request.headers['sec-websocket-protocol']) ?? '').split(',').map(value => value.trim()).filter(Boolean);
    const credentials = protocols.filter(value => value.startsWith('bearer.'));
    if (credentials.length > 1) return deny('unauthorized', 401);
    if (credentials.length === 1) {
      const encoded = credentials[0].slice(7);
      if (encoded.length > 6000 || !protocols.includes('art-events') || !/^[A-Za-z0-9_-]+$/.test(encoded)) return deny('unauthorized', 401);
      const decoded = Buffer.from(encoded, 'base64url');
      if (decoded.toString('base64url') !== encoded) return deny('unauthorized', 401);
      const protocolToken = decoded.toString('utf8');
      if (actual && actual !== protocolToken) return deny('unauthorized', 401);
      actual = protocolToken;
    }
    if (token && !safeTokenEqual(actual, token)) return deny('unauthorized', 401);
    return { ok: true, status: 200, code: 'allowed' };
  }

  // ws must select only the public protocol; never reflect bearer.* into a response.
  function websocketProtocols(protocols: Set<string>): string | false { return protocols.has('art-events') ? 'art-events' : false; }
  return { middleware, authorizeWebSocket, websocketProtocols };
}

export function serviceAccessFromEnv(port: number, env: NodeJS.ProcessEnv = process.env, bindHost = env.ART_HOST ?? '127.0.0.1') {
  const allowedOrigins = (env.ART_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  return createServiceAccess({ port, bindHost, allowedOrigins, apiToken: env.ART_API_TOKEN, publicOrigin: env.ART_PUBLIC_ORIGIN });
}
