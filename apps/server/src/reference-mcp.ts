import { createHash, timingSafeEqual } from 'node:crypto';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { Hono } from 'hono';
import { z } from 'zod';
import { rankReferences, type ReferenceEntry } from '../../../packages/skill-library/src/reference-ranking.ts';

export const referenceMcpPath = '/mcp/references';
const caseId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const evidenceId = z.uuid();
const accessFilter = { agent_access: { _eq: true } };
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const referenceFields = 'id,title,author,kind,url,observation,terms,license';
const evidenceFields = 'id,label,summary,medium,seconds,origin,preview,asset';
const maxPreviewBytes = 3 * 1024 * 1024;
const filler = /\b(?:a|an|and|are|as|be|by|can|could|does|for|from|has|how|in|into|is|it|of|on|or|should|that|the|their|this|through|to|using|want|what|when|where|which|with|would)\b/gi;

interface CaseEvidence {
  id: string;
  label: string;
  summary: string;
  medium: 'image' | 'audio' | 'video' | 'source' | 'note';
  seconds: number | null;
  origin: string;
  preview: boolean;
  asset: string | null;
}

class ReferenceUnavailable extends Error {
  constructor() {
    super('No reference evidence is available for that ID.');
  }
}

function makeLibrary(origin: URL, token: string) {
  async function request(path: string, query = new URLSearchParams(), range?: string) {
    const url = new URL(path, origin);
    url.search = query.toString();
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    if (range) headers.set('Range', range);
    const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Directus reference request failed');
    }
    return response;
  }

  async function query<T>(collection: 'visloom_reference_cases' | 'visloom_reference_evidence',
    fields: string, filters: Record<string, unknown>, limit: number, offset = 0) {
    const data = await request(`/items/${collection}`, new URLSearchParams({
      fields, filter: JSON.stringify({ ...filters, ...accessFilter }), sort: 'id',
      limit: String(limit), offset: String(offset),
    }));
    return (await data.json() as { data: T[] }).data;
  }

  async function requireCase(id: string) {
    const [entry] = await query<ReferenceEntry>('visloom_reference_cases', referenceFields, { id: { _eq: id } }, 1);
    if (!entry) throw new ReferenceUnavailable();
    return entry;
  }

  async function collect<T>(collection: 'visloom_reference_cases' | 'visloom_reference_evidence', fields: string) {
    const records: T[] = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const page = await query<T>(collection, fields, {}, pageSize, offset);
      records.push(...page);
      if (page.length < pageSize) return records;
    }
  }

  async function preview(evidence: CaseEvidence) {
    const { asset, medium } = evidence;
    if (!evidence.preview || !asset || !evidenceId.safeParse(asset).success || !['image', 'audio'].includes(medium)) return;
    const response = await request(`/assets/${asset}`, undefined, `bytes=0-${maxPreviewBytes - 1}`);
    const type = response.headers.get('content-type')?.split(';')[0] ?? '';
    const size = Number(response.headers.get('content-length'));
    const expectedType = medium === 'image' ? ['image/png', 'image/jpeg', 'image/webp'].includes(type) : ['audio/wav', 'audio/x-wav'].includes(type);
    if (!expectedType || !size || size > maxPreviewBytes ||
        (response.status === 206 && !response.headers.get('content-range')?.endsWith(`/${size}`))) {
      await response.body?.cancel();
      return;
    }
    const data = Buffer.from(await response.arrayBuffer()).toString('base64');
    return medium === 'image' ? { type: 'image' as const, data, mimeType: type } :
      { type: 'audio' as const, data, mimeType: 'audio/wav' };
  }

  return { query, requireCase, preview, collect };
}

function describe({ terms: _terms, ...reference }: ReferenceEntry) {
  return reference;
}

function describeEvidence({ asset: _asset, ...evidence }: CaseEvidence) {
  return { ...evidence, preview: Boolean(evidence.preview) };
}

type TextResult = { type: 'text'; text: string };
type PreviewResult = { type: 'image' | 'audio'; data: string; mimeType: string };
async function toolResult(run: () => Promise<{ result: unknown; preview?: PreviewResult }>) {
  try {
    const { result, preview } = await run();
    const content: (TextResult | PreviewResult)[] = [{ type: 'text', text: JSON.stringify(result) }];
    if (preview) content.push(preview);
    return { content };
  } catch (error) {
    return { isError: true, content: [{ type: 'text' as const, text: error instanceof ReferenceUnavailable ?
      error.message : 'The private reference library is currently unavailable.' }] };
  }
}

function referenceServer(library: ReturnType<typeof makeLibrary>) {
  const server = new McpServer({ name: 'visloom-references', version: '0.1.0' });
  server.registerTool('references_search', {
    description: 'Find authorized creative precedents using a focused design question and optional medium or mechanism keywords. Send only the relevant question.',
    annotations: readOnly,
    inputSchema: z.object({ query: z.string().trim().min(2).max(240), limit: z.number().int().min(1).max(8).default(4) }),
  }, ({ query, limit }) => toolResult(async () => {
    const [cases, evidence] = await Promise.all([
      library.collect<ReferenceEntry>('visloom_reference_cases', referenceFields),
      library.collect<{case_id: string}>('visloom_reference_evidence', 'case_id'),
    ]);
    const counts = new Map<string, number>();
    for (const {case_id} of evidence) counts.set(case_id, (counts.get(case_id) ?? 0) + 1);
    const focusedQuery = query.replace(/['’]s\b/gi, '').replace(filler, ' ');
    const hits = rankReferences(cases, focusedQuery)
      .sort((a, b) => b.score - a.score || Number(counts.has(b.record.id)) - Number(counts.has(a.record.id)));
    return { result: { total: hits.length, items: hits.slice(0, limit).map(({ record }) =>
      ({ ...describe(record), evidenceCount: counts.get(record.id) ?? 0 })) } };
  }));

  server.registerTool('references_get', {
    description: 'Read one authorized creative reference, its source and evidence index using the case ID returned by search.',
    annotations: readOnly,
    inputSchema: z.object({ id: caseId }),
  }, ({ id }) => toolResult(async () => {
    const entry = await library.requireCase(id);
    const evidence = await library.query<CaseEvidence>('visloom_reference_evidence', evidenceFields, { case_id: { _eq: id } }, 30);
    return { result: { ...describe(entry), evidence: evidence.map(describeEvidence) } };
  }));

  server.registerTool('references_evidence', {
    description: 'Read specific evidence by case ID and evidence ID. Returns a sourced observation and timestamp where available. Request a small image or audio preview with includePreview.',
    annotations: readOnly,
    inputSchema: z.object({ id: caseId, evidenceId, includePreview: z.boolean().default(false) }),
  }, ({ id, evidenceId: searchId, includePreview }) => toolResult(async () => {
    await library.requireCase(id);
    const [evidence] = await library.query<CaseEvidence>('visloom_reference_evidence', evidenceFields, {
      id: { _eq: searchId }, case_id: { _eq: id },
    }, 1);
    if (!evidence) throw new ReferenceUnavailable();
    const preview = includePreview ? await library.preview(evidence).catch(() => undefined) : undefined;
    return { result: { caseId: id, ...describeEvidence(evidence), previewIncluded: Boolean(preview) }, preview };
  }));
  return server;
}

export function mountReferenceMcp(app: Hono, env: NodeJS.ProcessEnv) {
  const { VISLOOM_DIRECTUS_URL: url, VISLOOM_DIRECTUS_READ_TOKEN: token, VISLOOM_REFERENCES_AGENT_TOKEN: agentToken } = env;
  if (!url && !token && !agentToken) return;
  if (!url || !token || !agentToken || agentToken.length < 32 || token === agentToken) {
    throw new Error('Private references require a Directus origin, a Directus reader token and a separate Agent token.');
  }
  const origin = new URL(url);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Directus URL must be an HTTP(S) origin.');
  }
  const hash = (value: string) => createHash('sha256').update(value).digest();
  const expected = hash(agentToken);
  const library = makeLibrary(origin, token);
  const handler = createMcpHandler(() => referenceServer(library));
  app.all(referenceMcpPath, async c => {
    const credential = /^Bearer ([^\s,]+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    if (!credential || !timingSafeEqual(hash(credential), expected)) {
      return c.json({ error: 'reference_authentication_required' }, 401, {
        'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store',
      });
    }
    const response = await handler.fetch(c.req.raw);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  });
}
