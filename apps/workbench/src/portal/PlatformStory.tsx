import { useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowUpRight, Braces, Database, Download, Globe, MessageSquare, SlidersHorizontal, X } from './PortalIcons';
import SkinBloomSurface from './SkinBloomSurface';
import MagneticLink from './MagneticLink';
import PlatformDirections from './PlatformDirections';
import { SceneTitle, FlowConnector, sceneEase, sceneItem, sceneStagger } from './PortalScene';
import { agentSetup, createLabel, createLink, publicPortal } from './portal-links';
import './platform-home.css';

const ways = [
  { id: 'agent', caption: 'SkinBloom · 创作对话示例', label: '与 Agent 构思', icon: MessageSquare, title: '继续用你熟悉的 Agent。', description: publicPortal ? '把数据和想法交给自己的 Agent，打开本机预览，再回到对话里改稿。' : '连接工作台，用你熟悉的 Agent 从当前作品继续构思、修改与创作。', detail: '项目 Skill 按需提供数据表达、构成、材质与交互参考。', action: '了解 Agent 接入', href: agentSetup },
  { id: 'canvas', image: 'canvas', caption: 'SkinBloom · 画面调整', alt: 'SkinBloom 工作台：花瓣画面与右侧参数面板，可直接调整观看方式和绘制参数。', label: '在画面中调整', icon: SlidersHorizontal, title: '想亲手改，就直接动手。', description: '拖动参数，直接观察构图、色彩与细节的变化。', detail: '手动调整保留在同一项目中，Agent 从你的当前状态继续。', action: publicPortal ? '本机接入' : '打开画面调整', href: createLink },
  { id: 'code', image: 'code', caption: 'SkinBloom · 源码编辑', alt: 'SkinBloom 工作台：作品画面和源码编辑器同时可见，在同一项目中改变绘制规则。', label: '用代码改变规则', icon: Braces, title: '表达，不止于现有控件。', description: '打开源码，修改绘制、运动与交互规则，保存后回到画面查看。', detail: '数据、源码与画面状态一起保存，随时回到之前的版本。', action: publicPortal ? '本机接入' : '进入代码工作台', href: createLink },
];

export default function PlatformStory() {
  const [way, setWay] = useState('agent');
  const reduced = useReducedMotion(), indicatorId = useId();
  const preview = useRef<HTMLDialogElement>(null);
  const active = ways.find(item => item.id === way)!;
  const previewMotion = { duration: reduced ? 0 : .65, ease: sceneEase };
  return <>
    <div className="page-width" id="platform" data-portal-page="platform">
    <PlatformDirections />
    <section className="platform-workflow" aria-labelledby="workflow-heading">
      <div className="platform-section-heading" id="practice"><SceneTitle id="workflow-heading" lines={['一个作品，','三种创作方式。']}/><p>比如这件 SkinBloom。你可以在对话里和 Agent 改稿、在工作台调画面，也可以直接改代码。</p></div>
      <div className="platform-workflow-body">
        <figure className="platform-workbench-view">
          <div className="platform-preview-topline"><span translate="no">SkinBloom</span></div>
          <motion.div initial={reduced?false:{clipPath:'inset(6% 0% 6% 0%)',scale:.94,y:48,opacity:0}} whileInView={{clipPath:'inset(0% 0% 0% 0%)',scale:1,y:0,opacity:1}} viewport={{amount:.25}} transition={{duration:1.05,ease:sceneEase}} className="platform-preview" data-example={active.id}>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div key={active.id} className="platform-preview-content" data-example={active.id}
                initial={reduced ? false : { clipPath: 'inset(0% 100% 0% 0%)', scale: 1.025 }}
                animate={{ clipPath: 'inset(0% 0% 0% 0%)', scale: 1 }}
                exit={{ opacity: 0 }} transition={previewMotion}>
                {active.image ? <img src={`/portal/platform-skinbloom-${active.image}.jpg`} alt={active.alt} width="1600" height="900"/> : <SkinBloomConversation />}
              </motion.div>
            </AnimatePresence>
            <button type="button" className="platform-preview-open" onClick={() => preview.current?.showModal()} aria-label={`放大查看${active.caption}`}>
              <span className="platform-preview-zoom" aria-hidden="true">放大查看 <ArrowUpRight size={15}/></span>
            </button>
          </motion.div>
          <figcaption><span role="status">{active.caption}</span><div className="platform-preview-progress" aria-hidden="true">{ways.map(item => <i key={item.id} data-active={item.id === way}/>)}</div></figcaption>
        </figure>
        <Tabs.Root value={way} onValueChange={setWay} className="platform-ways" orientation="vertical"><Tabs.List aria-label="平台创作方式">{ways.map((item,index) => <Tabs.Trigger key={item.id} value={item.id}><span className="platform-way-number" aria-hidden="true">0{index+1}</span><item.icon size={22} /><span>{item.label}</span><ArrowUpRight className="platform-way-arrow" size={18}/>{item.id===way&&<motion.i layoutId={indicatorId} className="platform-way-indicator" transition={reduced?{duration:0}:{type:'spring',stiffness:350,damping:32}}/>}</Tabs.Trigger>)}</Tabs.List>
          {ways.map(item => <Tabs.Content key={item.id} value={item.id} className="platform-way-content"><motion.div initial={reduced?false:{y:12,opacity:0}} animate={{y:0,opacity:1}} transition={{duration:.35,ease:[.22,1,.36,1]}}><h3>{item.title}</h3><p>{item.description}</p><p className="platform-way-detail">{item.detail}</p><MagneticLink className="platform-text-link" href={item.href}>{item.action}<ArrowUpRight size={17} /></MagneticLink></motion.div></Tabs.Content>)}
        </Tabs.Root>
      </div>
    </section>
    </div>
    <dialog ref={preview} className="platform-preview-dialog" aria-labelledby="platform-preview-title">
      <div className="platform-preview-dialog-top">
        <h2 id="platform-preview-title">{active.caption}</h2>
        <button type="button" className="icon-button" aria-label="关闭放大预览" onClick={() => preview.current?.close()}><X size={23}/></button>
      </div>
      {active.image ? <div className="platform-preview-image"><img src={`/portal/platform-skinbloom-${active.image}.jpg`} alt={active.alt} width="1600" height="900"/></div> : <SkinBloomConversation />}
      <p><span>{active.image ? '工作台实拍' : '创作对话示例'}{active.image && <span className="platform-preview-hint"> · 滚动查看细节</span>}</span><a href={createLink}>{createLabel} <ArrowUpRight size={14}/></a></p>
    </dialog>
    <section className="platform-data" data-portal-page="data" aria-labelledby="data-heading"><div className="page-width platform-data-layout">
      <div>
        <SceneTitle id="data-heading" lines={['先读懂数据，', '再决定怎么表达。']} />
        <p className="platform-section-copy">导入 CSV 或 JSON，用 AVA 查看字段、分布，完成筛选与聚合。原始材料和处理结果留在项目里，如何表达，由你和 Agent 决定。</p>
        <a className="platform-data-credit" href="https://github.com/antvis/AVA">
          <img src="/portal/ava-logo.svg" alt="" width="50" height="22" loading="lazy" />
          <span>以 AVA 为数据基座</span>
          <ArrowUpRight size={14} />
        </a>
      </div>
      <SkinBloomSurface />
      <motion.div className="platform-data-flow" aria-label="从导入数据、理解整理到视觉表达的工作流程" initial={reduced?false:'hidden'} whileInView="visible" viewport={{amount:.3}} variants={sceneStagger}><motion.div variants={sceneItem}><span className="platform-data-type">CSV <i>/</i> JSON</span><h3>带上你的材料</h3><p>保留原始数据与来源</p></motion.div><FlowConnector delay={.2}/><motion.div variants={sceneItem}><Database size={32} /><h3>理解与整理</h3><p>字段 · 分布 · 筛选 · 聚合</p></motion.div><FlowConnector delay={.4}/><motion.div variants={sceneItem}><span className="platform-data-type platform-expression">形 · 色 · 动</span><h3>成为视觉表达</h3><p>把数据关系写进作品</p></motion.div></motion.div>
    </div></section>
    <section className="platform-delivery page-width" data-portal-page="delivery" aria-labelledby="delivery-heading"><div className="platform-section-heading"><SceneTitle id="delivery-heading" lines={['让作品，','走出工作台。']}/><p>保存画面，分享交互，嵌入你的网站。<br />作品的下一站，由你决定。</p></div>
      <motion.div className="platform-delivery-options" initial={reduced?false:'hidden'} whileInView="visible" viewport={{amount:.3}} variants={sceneStagger}><motion.div variants={sceneItem}><Download size={27} /><h3>一张图，也是一件作品。</h3><p>导出 PNG，留下当前画面。</p></motion.div><motion.div variants={sceneItem}><Braces size={27} /><h3>把交互一起带走。</h3><p>导出独立 HTML，在浏览器中观看。</p></motion.div><motion.div variants={sceneItem}><Globe size={27} /><h3>给作品一个观看入口。</h3><p>分享固定版本或嵌入网页，后续编辑仍留在工作台。</p></motion.div></motion.div>
      <div className="platform-collection-link" id="works"><a className="platform-text-link" href="/collection.html">浏览交互作品集 <ArrowUpRight size={19} /></a></div>
    </section>
  </>;
}

function SkinBloomConversation() {
  return <ol className="platform-conversation" aria-label="SkinBloom 创作对话示例">
    <li className="platform-conversation-creator">
      <p className="platform-conversation-speaker">创作者</p>
      <p className="platform-conversation-bubble">我想把护肤品配方做成一朵花。点一片花瓣，就能查到它对应的成分。花瓣怎么排才方便对照原配方？</p>
    </li>
    <li className="platform-conversation-agent">
      <p className="platform-conversation-speaker"><MessageSquare size={16} /> Agent</p>
      <p className="platform-conversation-bubble">我先用 AVA 核对成分顺序和功效标签。花瓣按原清单顺时针排，颜色区分功效，红点标出防腐剂。先用 REFY 的配方试一版，点击花瓣时同步高亮右侧清单。</p>
    </li>
  </ol>;
}
