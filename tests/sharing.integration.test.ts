import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRemotePublisher } from '../packages/plugin-publish-local/src/index.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
let child:ChildProcess, directory:string,origin:string,port:number;
const token='test-only-sharing-upload-20261109';
async function start(){
  child=spawn(process.execPath,['--import','tsx','apps/share-server/src/index.ts'],{cwd:root,env:{...process.env,SHARE_PORT:String(port),SHARE_HOST:'127.0.0.1',ART_SHARE_PUBLIC_ORIGIN:origin,ART_SHARE_PUBLISH_TOKEN:token,ART_SHARE_DIR:path.join(directory,'host')},stdio:'ignore'});
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
  throw new Error('share host did not start');
}
async function stop(){if(!child||child.exitCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM');});}
beforeAll(async()=>{directory=await mkdtemp(path.join(tmpdir(),'art-share-integration-'));const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));port=(socket.address() as {port:number}).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));origin=`http://127.0.0.1:${port}`;await start();},15_000);
afterAll(async()=>{await stop();if(directory)await rm(directory,{recursive:true,force:true});});
it('keeps viewing independent of editing and gives each publication its own revocation capability',async()=>{
  const options={directory:path.join(directory,'creator'),origin,token},publisher=createRemotePublisher(options);
  const html=new TextEncoder().encode('<!doctype html><title>snapshot</title><canvas></canvas>');
  const first=await publisher.publish({projectId:'creator-a',revision:9,title:'one',html});
  const second=await publisher.publish({projectId:'creator-b',revision:3,title:'two',html});
  expect(first.scope).toBe('local');expect(first).not.toHaveProperty('revokeToken');
  expect((await fetch(first.url)).status).toBe(200);
  const saved=JSON.parse(await readFile(path.join(options.directory,second.id+'.json'),'utf8'));
  expect(saved.revokeToken).toMatch(/^[a-f0-9]{64}$/);
  expect(await publisher.list('creator-b')).toEqual([second]);
  const headers={authorization:`Bearer ${token}`,'x-art-revoke-token':saved.revokeToken};
  expect((await fetch(`${origin}/api/publications/${first.id}`,{method:'DELETE',headers})).status).toBe(403);
  expect((await fetch(first.url)).status).toBe(200);
  expect((await fetch(origin+'/api/projects',{headers:{authorization:`Bearer ${token}`}})).status).toBe(404);
  expect((await fetch(origin+'/api/publications',{method:'POST'})).status).toBe(401);
  expect((await fetch(origin+'/api/publications',{method:'POST',headers:{authorization:`Bearer ${token}`,origin:'https://other.example'}})).status).toBe(403);
  await stop();await start();
  expect((await fetch(first.embedUrl)).status).toBe(200);
  await createRemotePublisher(options).revoke('creator-a',first.id);
  expect((await fetch(first.url)).status).toBe(404);
  expect((await fetch(second.url)).status).toBe(200);
},15_000);
