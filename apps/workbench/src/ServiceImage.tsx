import { useEffect, useState } from 'react';
import { serviceFetch } from './api';
export default function ServiceImage({src,alt,onError}:{src:string;alt:string;onError:()=>void}){
  const [url,setURL]=useState('');
  useEffect(()=>{const abort=new AbortController();let objectURL='';void serviceFetch(src,{signal:abort.signal}).then(async response=>{if(!response.ok)throw new Error('thumbnail');const blob=await response.blob();if(abort.signal.aborted)return;objectURL=URL.createObjectURL(blob);setURL(objectURL);}).catch(()=>{if(!abort.signal.aborted)onError();});return()=>{abort.abort();if(objectURL)URL.revokeObjectURL(objectURL);};},[src]);
  return url?<img src={url} alt={alt}/>:null;
}
