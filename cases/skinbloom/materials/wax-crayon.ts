/** Canvas2D wax/pastel pigment. Bounds, palette and gradient belong to the caller's mark. */
export type WaxPaintOptions={
 bounds:{x:number;y:number;width:number;height:number};
 colors:string[];
 gradient:[number,number,number,number];
 seed?:number;
 grainSize?:number;
 direction?:[number,number];
};
export function createWaxMaterial(maxPixels=8_000_000, minimumScale=3){
 if(!Number.isSafeInteger(maxPixels)||maxPixels<100_000||maxPixels>16_000_000)throw new Error('Invalid pigment atlas budget');
 const tileScale=(resolution:number)=>Math.max(minimumScale,Math.min(6,Math.ceil(resolution)));
 const pigmentAtlas=new Map<string,HTMLCanvasElement>(),shapes=new WeakMap<Path2D,number>();let pigmentPixels=0,nextShape=0;
function pigment(outline:Path2D,options:WaxPaintOptions,resolution:number){
 const {colors,bounds,gradient,seed:variant=0,grainSize=1}=options;
 const direction=options.direction??[0,1],length=Math.hypot(...direction),dx=direction[0]/length,dy=direction[1]/length;
 const axisX=gradient[2]-gradient[0],axisY=gradient[3]-gradient[1],axisLength=axisX*axisX+axisY*axisY;
 let shape=shapes.get(outline);if(shape===undefined){shape=nextShape++;shapes.set(outline,shape);}
 const scale=tileScale(resolution),key=JSON.stringify([shape,options,scale]),found=pigmentAtlas.get(key);if(found)return found;
 const tile=document.createElement('canvas');tile.width=Math.ceil(bounds.width*scale);tile.height=Math.ceil(bounds.height*scale);
 const ctx=tile.getContext('2d')!,w=tile.width,h=tile.height;ctx.scale(scale,scale);ctx.translate(-bounds.x,-bounds.y);ctx.fillStyle='#fff';ctx.fill(outline);
 const image=ctx.getImageData(0,0,w,h),pixels=image.data,distance=new Float32Array(w*h);distance.fill(1e6);
 const inside=(i:number)=>pixels[i*4+3]>=128;
 // Distance to the original outline permits a dry, broken edge without softening the pigment detail.
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,a=inside(i);if(a!==inside(i-1)||a!==inside(i+1)||a!==inside(i-w)||a!==inside(i+w))distance[i]=0;}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-w]+1,distance[i-w-1]+1.4142,distance[i-w+1]+1.4142);}
 for(let y=h-2;y>0;y--)for(let x=w-2;x>0;x--){const i=y*w+x;distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+w]+1,distance[i+w+1]+1.4142,distance[i+w-1]+1.4142);}
 const hash=(x:number,y:number,salt:number)=>{let n=Math.imul(x+variant*71+salt,374761393)^Math.imul(y+37,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
 const noise=(x:number,y:number,salt:number)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),a=hash(ix,iy,salt),b=hash(ix+1,iy,salt),c=hash(ix,iy+1,salt),d=hash(ix+1,iy+1,salt);return(a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;};
 const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
 const palette=colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))),rowColors=new Float32Array(h*3);
 for(let y=0;y<h;y++){const t=Math.max(0,Math.min(1,((bounds.x-gradient[0])*axisX+(y/scale+bounds.y-gradient[1])*axisY)/axisLength))*(palette.length-1),index=Math.min(palette.length-2,Math.floor(t)),f=t-index;for(let c=0;c<3;c++)rowColors[y*3+c]=palette[index][c]*(1-f)+palette[index+1][c]*f;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const at=y*w+x,i=at*4,isInside=inside(at),d=(isInside?1:-1)*(distance[at]+.5)/scale;
  if(d< -1.9*grainSize){pixels[i+3]=0;continue;}
  const localX=x/scale+bounds.x,localY=y/scale+bounds.y,px=(localX*dy-localY*dx)/grainSize,py=(localX*dx+localY*dy)/grainSize;
  // Paper relief is spatially continuous, with fine tooth, clustered pores and narrow fibers.
  const tooth=noise(px*2.7,py*2.7,137),pore=noise(px*1.25+py*.2,py*1.6,251),fiber=noise(px*7+Math.sin(py*.021)*.6,py*.28,331);
  // Uneven pressure runs along the rubbing direction. Repeated passes leave visible rich seams.
  const drag=px+py*.115+Math.sin(py*.028)*.7;
  const pass=noise(drag*.65,py*.042,419),overlap=noise(drag*2.1,py*.09,523),pressure=.30+pass*.45+overlap*.3;
  const relief=.22+tooth*.44+pore*.22+fiber*.12;
  let coverage=.64+.36*smooth(relief-.14,relief+.1,pressure);
  const skipped=smooth(.19,.37,pore*.65+tooth*.35);coverage*=.32+.68*skipped;
  const edgeRoughness=(noise(px*.9,py*1.4,619)-.5)*2.1+(tooth-.5)*.55;
  const edge=smooth(-.19,.2,d/grainSize+edgeRoughness);
  pixels[i+3]=Math.round(255*coverage*edge);
  const ridge=smooth(.6,.9,overlap),shade=.68+pass*.35+ridge*.16;
  // Small wax highlights follow pressure seams rather than uncorrelated white speckles.
  const wax=ridge*smooth(.62,.9,tooth)*.045;
  for(let c=0;c<3;c++){let base=rowColors[y*3+c];if(axisX!==0){const t=Math.max(0,Math.min(1,((localX-gradient[0])*axisX+(localY-gradient[1])*axisY)/axisLength))*(palette.length-1),n=Math.min(palette.length-2,Math.floor(t)),v=t-n;base=palette[n][c]*(1-v)+palette[n+1][c]*v;}pixels[i+c]=Math.min(255,base*shade+(255-base)*wax);}
 }
 ctx.putImageData(image,0,0);
 // Atlas resolution follows the actual draw transform, including high-resolution export.
 while(pigmentPixels+w*h>maxPixels&&pigmentAtlas.size){const oldest=pigmentAtlas.keys().next().value!,old=pigmentAtlas.get(oldest)!;pigmentPixels-=old.width*old.height;pigmentAtlas.delete(oldest);}
 pigmentAtlas.set(key,tile);pigmentPixels+=w*h;return tile;
}

 return{paint(ctx:CanvasRenderingContext2D,outline:Path2D,options:WaxPaintOptions){
  const b=options.bounds,g=options.gradient,d=options.direction??[0,1];
  if(!b||![b.x,b.y,b.width,b.height,...g,...d,options.grainSize??1,options.seed??0].every(Number.isFinite)||b.width<=0||b.height<=0||b.width>4096||b.height>4096||(options.grainSize??1)<=0||Math.hypot(...d)===0||Math.hypot(g[2]-g[0],g[3]-g[1])===0||options.colors.length<2||options.colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('Invalid wax material geometry or palette');
  const t=ctx.getTransform(),resolution=Math.hypot(t.a,t.b)*1.8,scale=tileScale(resolution);
  if(Math.ceil(b.width*scale)*Math.ceil(b.height*scale)>maxPixels)throw new Error('Pigment surface exceeds atlas budget; split into marks or reduce local bounds');
  ctx.drawImage(pigment(outline,options,resolution),b.x,b.y,b.width,b.height);
 },dispose(){pigmentAtlas.clear();pigmentPixels=0;},get cachedPixels(){return pigmentPixels;}};
}
