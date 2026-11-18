import type { Hono } from 'hono';
import type { PublicationStore } from '../../../packages/plugin-publish-local/src/index.ts';
const escape=(s:string)=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]!));
/** Frozen viewing bytes; scripts run in an opaque origin without network or form access. */
export function artworkResponse(bytes:Uint8Array,frameAncestors?:"'self'"){
 return new Response(bytes as BodyInit,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':`sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data:; font-src data:; connect-src 'none'; ${frameAncestors?`frame-ancestors ${frameAncestors}; `:''}base-uri 'none'; form-action 'none'`,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}
export function mountPublicViews(app:Hono,store:PublicationStore){
  const view=async(id:string,embed:boolean)=>{
    const p=await store.read(id),source=new URL(`/s/${p.id}/artwork`,p.url).href;
    const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(p.title)}</title><style>html,body{margin:0;background:#080808;color:#eee;height:100%;font:14px system-ui}body{display:flex;flex-direction:column}header{padding:12px 20px;display:flex;justify-content:space-between;gap:20px}h1{margin:0;font:inherit;font-weight:500}a{color:#bbb;text-decoration:none}iframe{flex:1;width:100%;min-height:0;border:0}small{color:#999}</style><body>${embed?'':`<header><h1>${escape(p.title)}</h1><small>版本 ${p.revision}</small></header>`}<iframe title="${escape(p.title)}" src="${source}" sandbox="allow-scripts" allow="fullscreen" referrerpolicy="no-referrer"></iframe></body></html>`;
    return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':`default-src 'none'; style-src 'unsafe-inline'; frame-src ${new URL(p.url).origin}; frame-ancestors *; base-uri 'none'; form-action 'none'`,'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
  };
  app.get('/s/:id',c=>view(c.req.param('id'),false));
  app.get('/embed/:id',c=>view(c.req.param('id'),true));
  app.get('/s/:id/artwork',async c=>artworkResponse(await store.html(c.req.param('id'))));
}
