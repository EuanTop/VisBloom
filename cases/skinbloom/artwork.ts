// SkinBloom — Euan's original petal outline, palette and rating scales.
// Input is an AVA query result: one row per ordered ingredient, with explicit missing rows.
const petalPath = 'M10.1362 174.163C10.1362 217.071 13.2592 270.121 14.5405 262.209C15.8219 254.297 17.1246 232.593 18.7144 204.258C19.9958 181.42 26.6518 156.097 27.7524 132.084C29.9544 84.0421 17.1098 31.3329 3.53084 6.35132C-10.0481 -18.6303 20.3658 34.0783 14.006 94.749C11.5386 118.286 10.1362 155.687 10.1362 174.163Z';
const benefits: Record<string,{color:string;label:string}> = {
  'Hydration':{color:'#3B4EE2',label:'保湿'},'Anti-Aging':{color:'#fac858',label:'抗衰'},'Soothing':{color:'#91cc75',label:'舒缓'},
  'Evens Skin Tone':{color:'#E3A1AB',label:'均匀肤色'},'Dark Spot Fading':{color:'#73c0de',label:'淡斑'},'Anti-Acne':{color:'#EF3405',label:'抗痘'},
  'Oil Control':{color:'#43EB8F',label:'控油'},'Smooths Bumpy Skin':{color:'#ea7ccc',label:'平滑肌肤'},'Blackhead Reducing':{color:'#FF8103',label:'减少黑头'},'Pore Minimizer':{color:'#b6a2de',label:'毛孔护理'},
};
const ratingScale: Record<string,number> = {BEST:2,GOOD:1.5,AVERAGE:1,WORST:0.6,'NOT RATED':1};
import {createWaxMaterial} from './materials/wax-crayon';
const isTrue=(v:any)=>v===true||String(v).toLowerCase()==='true';
const splitBenefits=(v:any)=>String(v??'').split(/;\s*|,\s*/).filter(Boolean);
export function createArtwork(initial:any) {
  const waxMaterial=createWaxMaterial();
  const outline=new Path2D(petalPath);
  const groups=new Map<string,any>();
  for(const row of initial.data){
    const id=String(row.product_id);
    if(!groups.has(id))groups.set(id,{...row,id,cohort:String(row.cohort).toUpperCase(),ingredients:[]});
    if(Number(row.ingredient_order)>0&&row.ingredient_name)groups.get(id).ingredients.push(row);
  }
  const products=[...groups.values()].sort((a,b)=>a.cohort.localeCompare(b.cohort)||Number(a.cohort_rank)-Number(b.cohort_rank));
  products.forEach(p=>p.ingredients.sort((a:any,b:any)=>Number(a.ingredient_order)-Number(b.ingredient_order)));
  let hits:{id:string;x:number;y:number;w:number;h:number}[]=[];
  let g:CanvasRenderingContext2D,ink:string,bg:string,p:any,c:any;
  const text=(s:any,x:number,y:number,size=12,color=ink,font='sans-serif',align:CanvasTextAlign='left')=>{g.font=`${size}px ${font}`;g.fillStyle=color;g.textAlign=align;g.fillText(String(s??''),x,y);};
  function rule(x:number,y:number,w:number){g.strokeStyle=ink+'29';g.lineWidth=0.7;g.beginPath();g.moveTo(x,y);g.lineTo(x+w,y);g.stroke();}
  function wrap(s:string,x:number,y:number,width:number,size:number,lines=2,color=ink){
    g.font=`${size}px sans-serif`;g.textAlign='left';g.fillStyle=color;
    const words=String(s).split(' ');let line='',n=0;
    for(let i=0;i<words.length;i++){
      const next=line?line+' '+words[i]:words[i];
      if(g.measureText(next).width>width&&line){g.fillText(line,x,y+n*size*1.35);n++;line=words[i];if(n===lines-1){line+=[...words.slice(i+1)].length?' '+words.slice(i+1).join(' '):'';while(g.measureText(line+'…').width>width&&line.length>1)line=line.slice(0,-1);g.fillText(line+'…',x,y+n*size*1.35);return;}}
      else line=next;
    }
    if(n<lines)g.fillText(line,x,y+n*size*1.35);
  }
  function flower(product:any,x:number,y:number,r:number,selected=false){
    const rows=product.ingredients;
    if(!rows.length){g.strokeStyle=ink+'44';g.setLineDash([2,4]);g.beginPath();g.arc(x,y,r*.65,0,Math.PI*2);g.stroke();g.setLineDash([]);text('成分缺失',x,y+3,Math.max(7,r*.16),ink+'99','sans-serif','center');return;}
    const duration=2+rows.length*.01;
    for(let i=0;i<rows.length;i++){
      const reveal=p.animate?Math.min(1,Math.max(0,(c.time-(rows.length-i)*.1)/duration)):1;
      const fan=1-Math.pow(1-reveal,3);
      const row=rows[i],keys=splitBenefits(row.benefits),match=p.benefit==='全部'||keys.includes(p.benefit);
      const s=(ratingScale[String(row.ingredient_rating)]??1)/2*r/263*Number(p.bloom);
      g.save();g.translate(x,y);g.rotate(i/rows.length*Math.PI*2*fan+Number(p.rotation)*Math.PI/180);
      g.globalAlpha=match?1:0.12;g.scale(s,s);g.translate(-14,-263);
      const colors=['#090b08',...keys.map(k=>benefits[k]?.color).filter(Boolean).reverse()];
      if(colors.length===1)colors.push(isTrue(row.matched)?'#3A3931':'#5d6055');
      const gradient=g.createLinearGradient(0,0,0,263);
      colors.forEach((color,j)=>gradient.addColorStop(j/(colors.length-1),color));
      const crayon=Number.isFinite(Number(p.crayon))?Math.max(0,Math.min(1,Number(p.crayon))):1;
      const alpha=g.globalAlpha;g.globalAlpha=alpha*(1-crayon);g.fillStyle=gradient;g.fill(outline);
      if(crayon>0){g.globalAlpha=alpha*crayon;waxMaterial.paint(g,outline,{colors,bounds:{x:-16,y:-13,width:64,height:292},gradient:[0,0,0,263],seed:(Number(row.ingredient_order)||i)%4});}
      g.restore();
      if(p.preservatives&&isTrue(row.is_preservative)){
        const angle=i/rows.length*Math.PI*2*fan+Number(p.rotation)*Math.PI/180;
        g.fillStyle='#ff3e2f';g.beginPath();g.arc(x+Math.sin(angle)*r*.24,y-Math.cos(angle)*r*.24,Math.max(0.9,r*.021),0,Math.PI*2);g.fill();
      }
    }
    g.fillStyle=bg;g.beginPath();g.arc(x,y,Math.max(1.4,r*.045),0,Math.PI*2);g.fill();
    if(selected){g.strokeStyle='#dce9b2';g.lineWidth=1;g.beginPath();g.arc(x,y,r*1.08,0,Math.PI*2);g.stroke();}
  }
  function legend(x:number,y:number,w:number){
    const cols=w>600?5:Math.max(2,Math.floor(w/120)),cell=w/cols;
    Object.entries(benefits).forEach(([key,b],i)=>{const xx=x+i%cols*cell,yy=y+Math.floor(i/cols)*18;g.globalAlpha=p.benefit==='全部'||p.benefit===key?1:.3;g.fillStyle=b.color;g.fillRect(xx,yy-7,5,5);text(b.label,xx+12,yy,10);});g.globalAlpha=1;
    return Math.ceil(10/cols)*18;
  }
  function grid(list:any[],x:number,y:number,w:number,h:number,columns:number){
    const nrows=Math.ceil(list.length/columns),cw=w/columns,ch=h/nrows;
    const compact=ch<75;
    const r=Math.max(6,Math.min(cw*.41,(ch-(compact?12:32))*.47));
    list.forEach((product,i)=>{
      const xx=x+(i%columns)*cw,yy=y+Math.floor(i/columns)*ch;
      hits.push({id:product.id,x:xx,y:yy,w:cw,h:ch});
      const selected=c.selectedId===product.id;
      if(selected){g.fillStyle=ink+'09';g.fillRect(xx+2,yy,cw-4,ch-1);}
      flower(product,xx+cw*.5,yy+r+3,r,selected);
      const size=Math.max(6,Math.min(10,cw/12));
      text(String(product.cohort_rank).padStart(2,'0'),xx+4,yy+9,Math.max(7,size),ink+'66','monospace');
      text(Number(product.product_score).toFixed(1),xx+cw-4,yy+9,Math.max(7,size),ink+'99','monospace','right');
      wrap(compact?product.brand:product.product_name,xx+6,yy+2*r+(compact?9:13),cw-12,compact?Math.min(7,size):size,compact?1:2,ink+'cc');
      rule(xx+4,yy+ch-1,cw-8);
    });
  }
  function detail(product:any,w:number,h:number){
    if(!product){text('当前查询没有此产品；请恢复完整查询或选择其他序号。',32,130,13);return;}
    const narrow=w<850,left=w*(narrow?.53:.58),r=Math.min(left*.43,(h-180)*.43);
    flower(product,left*.5,170+(h-220)*.44,r,c.selectedId===product.id);
    const x=left+22,rw=w-x-32;
    text(`${product.cohort} ${String(product.cohort_rank).padStart(2,'0')}`,x,130,11,'#dce9b2','monospace');
    wrap(product.product_name,x,160,rw,Math.max(14,Math.min(23,rw/15)),3);
    text(product.brand,x,223,11,ink+'99');rule(x,240,rw);
    text(`${Number(product.product_score).toFixed(1)} / 5`,x,267,23,ink,'Georgia,serif');
    text(`${product.review_count_raw??product.review_count} · 原表用户计数`,x,289,10,ink+'88');
    const matched=product.ingredients.filter((i:any)=>isTrue(i.matched)).length;
    text(`${product.ingredients.length} 个成分 · ${matched} 个匹配词典`,x,313,11);
    const pageSize=Math.max(3,Math.min(12,Math.floor((h-380)/30))),page=Math.min(Number(p.ingredientPage)-1,Math.max(0,Math.ceil(product.ingredients.length/pageSize)-1)),start=page*pageSize;
    if(!product.ingredients.length)text('原表没有成分记录，不绘制推测花瓣。',x,350,11,ink+'99');
    for(const [j,row] of product.ingredients.slice(start,start+pageSize).entries()){
      const yy=347+j*30;rule(x,yy+15,rw);
      text(String(row.ingredient_order).padStart(2,'0'),x,yy,9,ink+'55','monospace');
      const ks=splitBenefits(row.benefits),color=ks.map(k=>benefits[k]?.color).find(Boolean)??'#7a7f6f';
      g.fillStyle=color;g.fillRect(x+23,yy-7,4,7);
      wrap(row.ingredient_name,x+33,yy,rw-65,10,1);
      if(p.preservatives&&isTrue(row.is_preservative)){g.fillStyle='#ff3e2f';g.beginPath();g.arc(x+rw-5,yy-3,2,0,Math.PI*2);g.fill();}
      text(row.ingredient_rating||'未匹配',x+33,yy+11,7,ink+'66','monospace');
    }
    text(`成分清单 ${Math.min(start+1,product.ingredients.length)}–${Math.min(start+pageSize,product.ingredients.length)} / ${product.ingredients.length}`,x,h-23,9,ink+'77');
    hits.push({id:product.id,x:0,y:100,w:left,h:h-100});
  }
  return {
    dispose(){waxMaterial.dispose();},
    timeline(context:any){return {enabled:Boolean(context.parameters.animate),label:'花瓣展开',duration:10,reason:'当前为静态配方图',enableParameters:{animate:true},usesSeed:false};},
    objects:products.map(product=>({id:product.id,label:`${product.cohort} ${product.cohort_rank} · ${product.product_name}`})),
    hitTest(x:number,y:number){return hits.find(h=>x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h)?.id;},
    draw(context:any){
      c=context;g=c.ctx;p=c.parameters;ink=String(p.ink);bg=String(p.background);hits=[];
      const w=c.width,h=c.height;g.fillStyle=bg;g.fillRect(0,0,w,h);
      if(w<250||h<250)return;
      const margin=Math.max(24,w*.035),usable=w-margin*2;
      text('S K I N B L O O M',margin,margin+12,11,'#dce9b2','monospace');
      text('配方的花园',margin,margin+52,Math.min(36,w*.044),ink,'Georgia,serif');
      text('INGREDIENTS, UNFOLDED',w-margin,margin+12,9,ink+'77','monospace','right');
      text(`${products.length} 个产品 / ${c.data.filter((r:any)=>Number(r.ingredient_order)>0).length} 条成分`,w-margin,margin+32,10,ink+'aa','sans-serif','right');
      const header=Math.max(110,margin+80);rule(margin,header,usable);
      if(p.view==='单产品'){
        detail(products.find(v=>v.cohort===p.cohort&&Number(v.cohort_rank)===Math.round(p.productRank)),w,h-80);
        legend(margin,h-57,usable);
      }else{
        const bottom=h-112,top=header+38;
        if(p.view==='对照总览'){
          const gap=24,half=(usable-gap)/2;
          for(const [j,cohort] of ['TOP','BOTTOM'].entries()){
            const x=margin+j*(half+gap);text(`${cohort} 50`,x,header+23,14,cohort==='TOP'?'#dce9b2':'#e5baa8','Georgia,serif');
            const list=products.filter(v=>v.cohort===cohort),page=Math.round(Number(p.page)||0);
            const visible=page?list.slice((page-1)*10,page*10):list;
            grid(visible,x,top,half,bottom-top,half>400?5:2);
            if(page)text(`${(page-1)*10+1}–${Math.min(page*10,list.length)} / ${list.length}`,x+half,header+23,9,ink+'77','monospace','right');
          }
        }else{
          const cohort=p.view==='BOTTOM 50'?'BOTTOM':'TOP',list=products.filter(v=>v.cohort===cohort);
          const page=Math.round(Number(p.page)||0),visible=page?list.slice((page-1)*10,page*10):list;
          text(`${p.view} · 产品评分${cohort==='TOP'?'降序':'升序'}${page?` · ${((page-1)*10+1)}–${Math.min(page*10,list.length)} / ${list.length}`:''}`,margin,header+23,12,'#dce9b2');
          text('同分按原表行序排列',w-margin,header+23,9,ink+'77','sans-serif','right');
          grid(visible,margin,top,usable,bottom-top,page?5:(w>1100?10:5));
        }
        const ly=bottom+20;legend(margin,ly,usable);
        const selected=products.find(v=>v.id===c.selectedId);
        if(selected)text(`${selected.product_name} · ${selected.ingredients.length} 个成分`,margin,h-28,10,ink);
        else text('一片花瓣 = 一个成分  /  顺序 = 旋转角度  /  长度 = 词典评级  /  红点 = 已识别防腐剂',margin,h-28,Math.max(8,Math.min(10,w/90)),ink+'99');
      }
      text('Euan · SkinBloom  /  Sephora 历史样本 · AVA 数据核心  /  产品评分不代表功效或成分浓度',margin,h-10,Math.max(6,Math.min(8,w/100)),ink+'66');
    }
  };
}
