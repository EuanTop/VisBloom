import type { Parameter } from '@art/contracts';
export const controls:Parameter[]=[
  {id:'accent',label:'主色 / 海沫',type:'color',default:'#d8f0d9',group:'色彩'},
  {id:'secondary',label:'映色 / 紫雾',type:'color',default:'#b8a2e9',group:'色彩'},
  {id:'background',label:'背景',type:'color',default:'#101b1c',group:'色彩'},
  {id:'density',label:'线条数量',type:'number',default:36,min:8,max:72,step:1,group:'形态'},
  {id:'spread',label:'空间舒展',type:'number',default:1,min:0.4,max:2,step:0.01,group:'形态'},
  {id:'height',label:'起伏幅度',type:'number',default:1.4,min:0.1,max:3,step:0.01,group:'形态'},
  {id:'thickness',label:'线条厚度',type:'number',default:0.65,min:0.1,max:2,step:0.01,group:'形态'},
  {id:'speed',label:'流动节奏',type:'number',default:0.3,min:0,max:1.5,step:0.01,group:'运动'},
];
export function artworkSource(preset:'flow'|'ribbons') { return `// 原创示例 · 合成数据。修改代码后保存，工作台会保留兼容参数。
// ctx: THREE, parameters, data, weights, mapping, seed, time, width, height
export function createArtwork(ctx: any) {
  const T = ctx.THREE;
  const scene = new T.Scene();
  scene.background = new T.Color(ctx.parameters.background);
  scene.fog = new T.Fog(ctx.parameters.background, 19, 43);
  const group = new T.Group();
  scene.add(group);
  scene.add(new T.AmbientLight(0xffffff, 2.0));
  const light = new T.DirectionalLight(0xffffff, 3.0);
  light.position.set(2, 8, 6); scene.add(light);
  const curves: any[] = [];
  let signature = '';
  function rebuild(c: any) {
    group.children.slice().forEach((o: any) => { o.geometry.dispose(); o.material.dispose(); group.remove(o); });
    curves.length = 0;
    const p = c.parameters;
    const weights = c.weights.length ? c.weights : [0.5];
    const n = Math.round(p.density);
    for (let i = 0; i < n; i++) {
      const weight = weights[i % weights.length];
      const points = [];
      const phase = i * 0.19 + (c.seed % 997) / 997;
      const amplitude = p.height * (c.mapping.target === 'height' ? 0.25 + weight * 1.5 : 1);
      const width = 0.012 * p.thickness * (c.mapping.target === 'weight' ? 0.3 + weight * 2.7 : 1);
      for (let j = 0; j <= 100; j++) {
        const u = j / 100;
        ${preset==='flow'?`const x = (u - 0.5) * 15 * p.spread;
        const y = Math.sin(u * Math.PI * 2 + phase) * amplitude + (i / n - 0.5) * 4;
        const z = Math.cos(u * Math.PI * 2 + phase * 0.55) * 1.8 + Math.sin(u * 6 + phase) * 0.3;`:`const angle = u * Math.PI * 2;
        const radius = (2.2 + i / n * 3.0) * p.spread;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle * 3 + phase) * amplitude * 0.55 + (i / n - 0.5) * 2.5;
        const z = Math.sin(angle) * radius * 0.65;`}
        points.push(new T.Vector3(x, y, z));
      }
      const path = new T.CatmullRomCurve3(points);
      const color = new T.Color(p.accent).lerp(new T.Color(p.secondary), i / n);
      const material = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.35, metalness: 0.18 });
      const mesh = new T.Mesh(new T.TubeGeometry(path, 100, width, 5, false), material);
      group.add(mesh); curves.push(mesh);
      const mote = new T.Mesh(new T.SphereGeometry(0.035 + weight * 0.045, 8, 8), new T.MeshBasicMaterial({color}));
      mote.userData.path = path; mote.userData.phase = i / n;
      if(c.mapping.target !== 'density' || i / n <= 0.2 + weight * 0.8) group.add(mote);
    }
  }
  return {
    scene,
    timeline: { enabled: true, label: '作品动画', duration: 30, usesSeed: true },
    objects: [{ id: 'data-form', label: '${preset==='flow'?'流线 / 数据形态':'等高环 / 数据形态'}', object: group }],
    update(c: any) {
      const p = c.parameters;
      scene.background.set(p.background); scene.fog.color.set(p.background);
      const next = JSON.stringify([p.accent,p.secondary,p.density,p.spread,p.height,p.thickness,c.mapping,c.seed,c.weights]);
      if(signature !== next) { rebuild(c); signature = next; }
      group.rotation.y = Math.sin(c.time * p.speed * 0.2) * 0.16;
      group.rotation.z = Math.sin(c.time * p.speed * 0.1) * 0.03;
      group.children.forEach((o: any) => {
        if(o.userData.path) o.position.copy(o.userData.path.getPointAt((c.time * p.speed * 0.07 + o.userData.phase) % 1));
      });
    }
  };
}
`; }
export const sampleCSV='hour,intensity,region\n'+Array.from({length:36},(_,i)=>`${i},${Math.round(35+24*Math.sin(i*0.38)+12*Math.cos(i*0.81))},${i%2?'east':'west'}`).join('\n');
