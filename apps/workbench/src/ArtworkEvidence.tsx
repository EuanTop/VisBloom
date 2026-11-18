import { useEffect, useRef } from 'react';
import type { Project, Value } from '@art/contracts';
import { figures, rivers } from '../../../artworks/alpine-rain/network';

type Row = Record<string, unknown>;
const clock = (second: number) => Math.floor(second / 60) + ':' + String(second % 60).padStart(2, '0');
const number = (value: unknown, digits = 1) => typeof value === 'number' ? value.toFixed(digits) : '—';

function RouteEvidence({ rows, date }: { rows: Row[]; date?: Value }) {
  const dates = [...new Set(rows.map(row => String(row.date)))].sort();
  const active = typeof date === 'string' && dates.includes(date) ? date : dates.at(0);
  const pair = rows.filter(row => row.date === active).sort((a,b) => Number(a.bird_index) - Number(b.bird_index));
  return <section className="evidence evidence-migration" aria-label="迁徙数据">
    <header><h3>同日对照</h3><span>{active} UTC · {dates.length} 天</span></header>
    <div className="evidence-routes">
      {pair.map(row => <article key={String(row.bird)} data-bird={String(row.bird)}>
        <h4>{String(row.bird)}</h4>
        <p className="evidence-region">{String(row.country)} · {String(row.ecoregion)}</p>
        <dl><div><dt>日均气温</dt><dd>{number(row.temperature_c)} °C</dd></div>
          <div><dt>日降水</dt><dd>{number(row.rain_mm)} mm</dd></div>
          <div><dt>日净位移</dt><dd>{number(row.displacement_km)} km</dd></div></dl>
      </article>)}
    </div>
    <footer>点画面上的片段或拖动日期，可查看当天记录。天气匹配当日末次小时定位。</footer>
  </section>;
}

function unpack(rows: Row[]) {
  const channels: [number[],number[]] = [[],[]];
  for(const row of rows){
    if(typeof row.samples_b64 !== 'string') continue;
    try{
      const bytes = Uint8Array.from(atob(row.samples_b64), char => char.charCodeAt(0));
      const values = new DataView(bytes.buffer);
      for(let offset = 0; offset + 8 <= bytes.length; offset += 8){
        channels[0].push(values.getFloat32(offset,true));
        channels[1].push(values.getFloat32(offset+4,true));
      }
    }catch{ continue; }
  }
  return channels;
}

function WaveEvidence({ rows, window }: { rows: Row[]; window?: Value }) {
  const sorted = [...rows].sort((a,b) => Number(a.second) - Number(b.second));
  const current = typeof window === 'number' ? window : Number(sorted[0]?.window_10s);
  const windowRows = sorted.filter(row => row.window_10s === current);
  const plot = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = plot.current;
    if(!canvas) return;
    const channels = unpack(windowRows);
    function paint(){
      if(!canvas) return;
      const {width,height} = canvas.getBoundingClientRect();
      if(width<1||height<1) return;
      const ratio=Math.min(devicePixelRatio,2);
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
      const c=canvas.getContext('2d');
      if(!c) return;
      c.scale(ratio,ratio);
      c.strokeStyle='#635063';
      for(const y of [.25,.75]) { c.beginPath();c.moveTo(0,y*height);c.lineTo(width,y*height);c.stroke(); }
      channels.forEach((values,index)=>{
        if(!values.length) return;
        const low=Math.min(...values), high=Math.max(...values);
        c.beginPath();
        for(const [i,value] of values.entries()){
          const x=i/Math.max(1,values.length-1)*width;
          const y=height*(.445+index*.5-.39*(value-low)/(high-low||1));
          if(i===0)c.moveTo(x,y);
          else c.lineTo(x,y);
        }
        c.strokeStyle=index===0?'#f4a1b3':'#a4e1de';c.lineWidth=1.15;c.stroke();
      });
    }
    paint();
    const observer = new ResizeObserver(paint);observer.observe(canvas);
    return () => observer.disconnect();
  },[rows,current]);
  const begin = Number(windowRows[0]?.second);
  const last = windowRows.at(-1);
  const end = last ? Number(last.second) + (Number(last.sample_count)>1 ? 1 : 0) : NaN;
  const pairs = windowRows.reduce((sum,row)=>sum+Number(row.sample_count),0);
  return <section className="evidence evidence-wave" aria-label="呼吸与脉搏数据">
    <header><h3>同步波形</h3><span>{Number.isFinite(begin) ? clock(begin)+'–'+clock(end) : '此窗口无记录'} · 125 Hz</span></header>
    <div className="evidence-wave-body"><div><p>RESP · 呼吸</p><p>PLETH · 脉搏</p></div><canvas ref={plot} role="img" aria-label="图示窗口的呼吸与脉搏波形"/></div>
    <footer>{pairs.toLocaleString('zh-CN')} 对同步采样。两行独立缩放。点画面波形可切换十秒窗。</footer>
  </section>;
}

function SwatchEvidence({ rows, sample }: { rows: Row[]; sample?: Value }) {
  const row=rows.find(item=>item.sample===sample)??rows.find(item=>item.sample==='3_3_009k1p1rib')??rows[0];
  const relaxed=Number(row.relaxed_width_mm), stretched=Number(row.stretched_width_mm);
  const ratio=Number.isFinite(relaxed)&&Number.isFinite(stretched)&&relaxed>0?Math.round((stretched/relaxed-1)*100):null;
  const values=[
    {label:'放松',width:relaxed,height:Number(row.relaxed_height_mm)},
    {label:'拉伸',width:stretched,height:Number(row.stretched_height_mm)},
  ];
  const bound=Math.max(1,relaxed,stretched);
  return <section className="evidence evidence-swatch" aria-label="织片的尺寸实测">
    <header><h3>{String(row.name)} · 尺寸实测</h3><span>{ratio===null?'':`横向 +${ratio}%`}</span></header>
    <dl>{values.map(({label,width,height})=><div key={label}>
      <dt>{label}</dt><dd><span>{width} × {height} mm</span><i style={{width:`${100*width/bound}%`}} aria-hidden="true"/></dd>
    </div>)}</dl>
    <footer>点击织片来切换记录。宽 × 高。KnitDB 标本 {String(row.sample)}。</footer>
  </section>;
}

function RiverEvidence({ rows, riverId }: { rows: Row[]; riverId?: Value }) {
  const data = rivers.map(river => {
    const reaches = rows.filter(row => row.river === river.id);
    const outlet = reaches.find(row => row.next_down === 0);
    const route = reaches.filter(row => row.alpine_trace === 1);
    const length = route.reduce((longest, row) => Math.max(longest, Number(row.distance_to_outlet_km) + Number(row.length_km)), 0);
    return { river, outlet, length, count: reaches.length };
  }).filter(item => item.count > 0);
  return <section className="evidence evidence-rivers" aria-label="阿尔卑斯山水系数据">
    <header><h3>源点到河口</h3><span>{figures.format(rows.length)} 条河段</span></header>
    <dl aria-label="示范路径与河口汇水面积">{data.map(({river, length, outlet}) =>
      <div key={river.id} className={riverId === river.id ? 'is-selected' : undefined}>
        <dt style={{ color: river.pale }}>{river.name}<span>{river.sea}</span></dt>
        <dd>{length ? figures.format(length) + ' km' : '—'}</dd>
        <dd>{typeof outlet?.upstream_km2 === 'number' ? figures.format(outlet.upstream_km2) + ' km²' : '—'}</dd>
      </div>
    )}</dl>
    <footer>两列分别为示范路径长度、河口上游汇水面积。线宽随面积增大。</footer>
  </section>;
}

export default function ArtworkEvidence({ project, selectedKey }: {
  project: Project;
  selectedKey?: Record<string,Value>;
}) {
  const rows = project.result?.rows;
  if(!rows?.length) return null;
  if(project.preset==='stork-migration') return <RouteEvidence rows={rows} date={selectedKey?.date}/>;
  if(project.preset==='breathing-quilt') return <WaveEvidence rows={rows} window={selectedKey?.window_10s}/>;
  if(project.preset==='alpine-rain') return <RiverEvidence rows={rows} riverId={selectedKey?.river}/>;
  if(project.preset==='knit-stretch') return <SwatchEvidence rows={rows} sample={selectedKey?.sample}/>;
  return null;
}
