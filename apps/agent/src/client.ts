export const base = (process.env.ART_WORKBENCH_URL ?? 'http://127.0.0.1:4318').replace(/\/$/,'');
const url=new URL(base);
if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('ART_WORKBENCH_URL must be an HTTPS origin or loopback HTTP origin');
export const authHeaders=():Record<string,string>=>process.env.ART_API_TOKEN?{authorization:`Bearer ${process.env.ART_API_TOKEN}`}:{};
export class RequestError extends Error {
  constructor(public code:string,message:string,public status?:number){super(message);this.name='RequestError';}
  override toString(){return `${this.status?`${this.status} `:''}${this.code}: ${this.message}`;}
}
export async function request(path:string,method='GET',body?:unknown,timeoutMs=60000){
  let response:Response;
  try{response=await fetch(base+path,{method,headers:{'content-type':'application/json','x-art-actor':'agent',...authHeaders()},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});}
  catch(error){throw new RequestError('service_unavailable',`Cannot reach VisBloom at ${base}: ${error instanceof Error?error.message:String(error)}`);}
  let value:any;
  try{value=response.status===204?null:await response.json();}catch{throw new RequestError('invalid_response','Workbench returned a non-JSON response',response.status);}
  if(!response.ok)throw new RequestError((typeof value?.error==='object'?value.error.code:value?.error)??'operation_failed',value?.error?.message??value?.message??`HTTP ${response.status}`,response.status);return value;
}
export async function projectId(id?:string){if(id)return id;const projects=await request('/api/projects');if(!projects.length)throw new RequestError('project_missing','Create a project first');return projects[0].id as string;}
