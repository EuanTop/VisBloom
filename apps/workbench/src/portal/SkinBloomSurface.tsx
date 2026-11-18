import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as THREE from 'three';

/* Stroke-mask and ordered-dither shader adapted from David Haz / React Bits
 * DitherVeil, blob b162f2e3763db1b5a40540c6fb1e0e4dea770f0f.
 * MIT + Commons Clause; /portal/react-bits-LICENSE.txt.
 * Adaptation: existing Three.js, one local screenshot crop, on-demand drawing,
 * no OGL/blue-noise/CPU diffusion, static fallback and keyboard colour toggle. */
const vertex = `out vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const maskFragment = `precision highp float;
uniform sampler2D tPrev;
uniform vec2 uSize,uFrom,uTo;
uniform float uRadius,uStrength,uFade;
in vec2 vUv; out vec4 outColor;
float strokeDistance(vec2 p,vec2 a,vec2 b){
 vec2 ab=b-a; float h=clamp(dot(p-a,ab)/max(dot(ab,ab),.0001),0.,1.);
 return length(p-a-ab*h);
}
void main(){
 vec2 p=vec2(vUv.x,1.-vUv.y)*uSize;
 float trail=max(texture(tPrev,vUv).r-uFade,0.);
 float d=strokeDistance(p,uFrom,uTo);
 trail=max(trail,clamp((uRadius-d)/(uRadius*.65),0.,1.)*uStrength);
 outColor=vec4(trail,0.,0.,1.);
}`;
const viewFragment = `precision highp float;
precision highp int;
uniform sampler2D tImage,tMask;
uniform vec2 uResolution;
uniform float uRetain;
in vec2 vUv; out vec4 outColor;
float bayer(vec2 cell){
 ivec2 p=ivec2(mod(cell,8.)); int v=p.x^p.y;
 int m=((v&1)<<5)|((p.y&1)<<4)|((v&2)<<2)|((p.y&2)<<1)|((v&4)>>1)|((p.y&4)>>2);
 return (float(m)+.5)/64.;
}
void main(){
 vec2 px=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);
 vec2 cell=floor(px/2.);
 // Only the flower in the real SkinBloom screenshot, not its UI or labels.
 vec3 raw=texture(tImage,vec2(.07,.1556)+vUv*vec2(.38,.6222)).rgb;
 float matte=1.-smoothstep(.025,.085,distance(raw,vec3(.09,.105,.07)));
 vec3 photo=mix(raw,vec3(.031,.02,.051),matte);
 float light=dot(photo,vec3(.2126,.7152,.0722));
 float tone=step(bayer(cell),pow(clamp(light*1.8,0.,1.),1.3))*(1.-matte);
 vec3 ink=vec3(.031,.02,.051),paper=vec3(.68,.57,.47);
 vec3 dither=mix(ink,paper,clamp((light*1.25+tone*.24)*(1.-matte),0.,.86));
 float shown=max(uRetain,clamp(texture(tMask,vUv).r*1.6,0.,1.));
 vec3 color=mix(dither,photo,smoothstep(0.,1.,shown));
 float edge=smoothstep(0.,.07,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));
 outColor=vec4(mix(ink,color,edge),1.);
}`;

export default function SkinBloomSurface() {
  const host = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const [retain, setRetain] = useState(false), [ready, setReady] = useState(false);
  const retainRef = useRef(retain), redraw = useRef(() => {});
  useEffect(() => { retainRef.current = retain; redraw.current(); }, [retain]);
  useEffect(() => {
    const element = host.current;
    setReady(false);
    if (!element || reduced) return;
    let closed = false, lost = false, visible = false, raf = 0, last = 0, until = 0;
    let width = 1, height = 1;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false }); }
    catch { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    element.append(renderer.domElement);
    const geometry = new THREE.PlaneGeometry(2, 2), camera = new THREE.Camera();
    const target = () => new THREE.WebGLRenderTarget(256, 256, { depthBuffer: false, stencilBuffer: false });
    let masks = [target(), target()];
    const mask = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: maskFragment,
      uniforms: { tPrev: { value: masks[0].texture }, uSize: { value: new THREE.Vector2(1, 1) },
        uFrom: { value: new THREE.Vector2(-1000, -1000) }, uTo: { value: new THREE.Vector2(-1000, -1000) },
        uRadius: { value: 115 }, uStrength: { value: 0 }, uFade: { value: 1 } } });
    const view = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: viewFragment,
      uniforms: { tImage: { value: null }, tMask: { value: masks[0].texture }, uResolution: { value: new THREE.Vector2(1, 1) }, uRetain: { value: 0 } } });
    const maskMesh = new THREE.Mesh(geometry, mask), viewMesh = new THREE.Mesh(geometry, view);
    const point = new THREE.Vector2(-1000, -1000), previous = point.clone();
    let inside = false, texture: THREE.Texture | undefined;
    const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0; };
    const tick = (now: number) => {
      raf = 0;
      if (closed || lost || !visible || document.hidden || !texture) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
      mask.uniforms.tPrev.value = masks[0].texture;
      mask.uniforms.uFrom.value.copy(previous); mask.uniforms.uTo.value.copy(point);
      mask.uniforms.uStrength.value = inside ? 1 : 0;
      mask.uniforms.uFade.value = Math.max(dt / .85, 1.5 / 255);
      renderer.setRenderTarget(masks[1]); renderer.render(maskMesh, camera); masks.reverse();
      previous.copy(point);
      view.uniforms.tMask.value = masks[0].texture; view.uniforms.uRetain.value = retainRef.current ? 1 : 0;
      renderer.setRenderTarget(null); renderer.render(viewMesh, camera);
      if ((inside && !retainRef.current) || now < until) raf = requestAnimationFrame(tick);
      else last = 0;
    };
    const wake = () => {
      if (!closed && !lost && visible && !document.hidden && !raf && texture) raf = requestAnimationFrame(tick);
    };
    redraw.current = wake;
    const layout = () => {
      width = Math.max(1, element.clientWidth); height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      renderer.getDrawingBufferSize(view.uniforms.uResolution.value);
      mask.uniforms.uSize.value.set(width, height);
      mask.uniforms.uRadius.value = Math.min(145, width * .26);
      for (const t of masks) t.setSize(Math.max(2, Math.round(width * .5)), Math.max(2, Math.round(height * .5)));
      renderer.setRenderTarget(masks[0]); renderer.clear(); renderer.setRenderTarget(masks[1]); renderer.clear(); renderer.setRenderTarget(null);
      wake();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = element.getBoundingClientRect();
      point.set(event.clientX - rect.left, event.clientY - rect.top);
      if (!inside) previous.copy(point);
      inside = true; until = performance.now() + 1100; wake();
    };
    const leave = () => { inside = false; until = performance.now() + 1100; wake(); };
    const visibility = () => { if (document.hidden) stop(); else wake(); };
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; stop(); setReady(false); };
    element.addEventListener('pointermove', move, { passive: true }); element.addEventListener('pointerleave', leave);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    document.addEventListener('visibilitychange', visibility);
    const resize = new ResizeObserver(layout); resize.observe(element);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); else stop(); }); observer.observe(element);
    new THREE.TextureLoader().load('/portal/platform-skinbloom-canvas.jpg', loaded => {
      if (closed || lost) { loaded.dispose(); return; }
      texture = loaded; view.uniforms.tImage.value = texture; layout(); setReady(true); wake();
    }, undefined, () => { if (!closed) setReady(false); });
    return () => {
      closed = true; stop(); redraw.current = () => {};
      observer.disconnect(); resize.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      masks.forEach(t => t.dispose()); texture?.dispose(); mask.dispose(); view.dispose(); geometry.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [reduced]);
  const interactive = ready && !reduced;
  return <figure className="platform-material-study" data-interactive={interactive}>
    <button className="platform-material-surface" ref={host} type="button" disabled={!interactive}
      onClick={() => setRetain(value => !value)} aria-pressed={retain} aria-label={retain ? '恢复 SkinBloom 材质的鼠标显色交互' : '保留 SkinBloom 材质原色'}>
      <img src="/portal/platform-skinbloom-canvas.jpg" alt="SkinBloom 花瓣的蜡笔颗粒与叠色局部，取自工作台实拍。" loading="lazy" />
    </button>
    <figcaption><span>SkinBloom · 材质局部</span></figcaption>
  </figure>;
}
