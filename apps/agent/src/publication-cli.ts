import { CLIError } from './cli-support.ts';
export async function runPublications(args:string[]){
  if(!args.length||args.includes('--help')){console.log('npm run --silent visbloom -- share create --project ID --revision N\nnpm run --silent visbloom -- share list --project ID\nnpm run --silent visbloom -- share revoke --project ID --id LINK_ID\n创建选定版本的观看链接及嵌入链接。仅在创作者明确要求分享后执行；不会上传笔记、历史或编辑权限。本机默认生成本机链接，公开链接需配置分享服务。');return;}
  const [command,...rest]=args;
  if(!['create','list','revoke'].includes(command))throw new CLIError('usage','share 支持 create / list / revoke',2);
  const flags:Record<string,string>={};
  for(let i=0;i<rest.length;i+=2){const name=rest[i].slice(2),value=rest[i+1];if(!rest[i].startsWith('--')||!(command==='create'?['project','revision']:command==='revoke'?['project','id']:['project']).includes(name)||!value||value.startsWith('--')||flags[name])throw new CLIError('usage','无效分享参数',2);flags[name]=value;}
  if(command==='create'&&(!flags.project||!/^\d+$/.test(flags.revision??'')||!Number.isSafeInteger(Number(flags.revision))))throw new CLIError('usage','创建分享需显式提供 --project 和当前 --revision',2);
  if(command==='revoke'&&(!flags.project||!/^[a-f0-9]{32}$/.test(flags.id??'')))throw new CLIError('usage','撤回需显式提供 --project 和 --id',2);
  const {request,projectId}=await import('./client.ts');
  const id=encodeURIComponent(await projectId(flags.project)),route=`/api/projects/${id}/publications`;
  const result=command==='create'?await request(route,'POST',{revision:Number(flags.revision)}):command==='list'?await request(route):await request(route+'/'+encodeURIComponent(flags.id),'DELETE');
  console.log(JSON.stringify(result??{revoked:true,id:flags.id},null,2));
}
