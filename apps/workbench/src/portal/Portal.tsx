import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ArrowDown, ArrowUpRight, ChevronDown, FileJson, GitHub, Globe, LoaderCircle, Menu, MessageSquare, MousePointer2, Pause, Play, X } from './PortalIcons';
import type {HeroPlayback} from './PhysarumHero';
const PhysarumHero=lazy(()=>import('./PhysarumHero'));
import PlatformStory from './PlatformStory';
import PlatformHeroCopy from './PlatformHeroCopy';
import BrandMark from '../BrandMark';
import { useStudy } from './useStudy';
import { usePortalPages } from './usePortalPages';
import PortalChapterNav from './PortalChapterNav';
import { SceneTitle } from './PortalScene';
import { agentSetup, createLabel, createLink, portalHome, projectRepository, publicPortal } from './portal-links';
import './physarum-hero.css';
import './portal-pages.css';


export default function Portal({ onIntroSettled }: { onIntroSettled: () => void }) {
  const pages = usePortalPages();
  const [faq, setFaq] = useState<string | null>(null);
  const [headerSolid, setHeaderSolid] = useState(false);
  const [playback,setPlayback]=useState<HeroPlayback|null>(null);
  const playbackLabel=playback?.playing?'暂停背景动画':'继续背景动画';
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; const section = document.getElementById('platform'); setHeaderSolid(Boolean(section && section.getBoundingClientRect().top <= 80)); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);
  const menu = useRef<HTMLDialogElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  const study = useStudy(!publicPortal);
  function closeMenu() { menu.current?.close(); menuButton.current?.focus(); }
  return <MotionConfig reducedMotion="user"><div className="platform-home" data-current-page={pages.current + 1}>
    <a className="skip-link" href="#content">跳到主要内容</a>
    <header className="site-header" data-solid={headerSolid}>
      <a className="small-brand" href={portalHome} aria-label="Visloom 首页"><BrandMark className="app-mark" /><span className="brand-wordmark" translate="no">Visloom</span></a>
      <nav className="main-nav" aria-label="主要导航"><a href="#practice">怎么创作</a><a href="/collection.html">作品集</a>{!publicPortal&&<a href={agentSetup}>Agent 接入</a>}</nav>
      <div className="portal-header-actions">
        <div className="portal-workbench-actions">
          {playback && pages.current > 1 && <button className="icon-button" disabled={!playback.ready} aria-label={playbackLabel} title={playbackLabel} onClick={playback.toggle}>{playback.playing ? <Pause size={16} /> : <Play size={16} />}</button>}
          <a className="workbench-link" href={createLink}>{publicPortal ? createLabel : '工作台'} <ArrowUpRight size={17} /></a>
        </div>
        <button className="portal-mobile-page" type="button" disabled={pages.current === pages.chapters.length - 1} onClick={() => pages.goTo(pages.current + 1)} aria-label={`第 ${pages.current + 1} 页，共 ${pages.chapters.length} 页${pages.current < pages.chapters.length - 1 ? '，前往下一页' : '，最后一页'}`}>{String(pages.current + 1).padStart(2, '0')} / {String(pages.chapters.length).padStart(2, '0')}{pages.current < pages.chapters.length - 1 && <ArrowDown size={16} />}</button>
        <a className="icon-button portal-github-link" href={projectRepository} aria-label="Visloom GitHub 仓库" title="GitHub"><GitHub size={23} /></a>
        <button ref={menuButton} className="menu-button icon-button" aria-label="打开导航" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}><Menu size={22} /></button>
      </div>
      <dialog ref={menu} className="navigation-dialog" onClose={() => menuButton.current?.focus()}><div className="dialog-top"><BrandMark className="app-mark" /><button className="icon-button" aria-label="关闭导航" onClick={closeMenu}><X size={23} /></button></div><nav aria-label="移动端导航"><a href="#practice" onClick={closeMenu}>怎么创作 <ArrowUpRight /></a><a href="/collection.html" onClick={closeMenu}>作品集 <ArrowUpRight /></a><a href={agentSetup}>{publicPortal ? createLabel : 'Agent 接入'} <ArrowUpRight /></a>{!publicPortal&&<a href="/">打开工作台 <ArrowUpRight /></a>}</nav>{playback&&<button className="portal-menu-playback" disabled={!playback.ready} onClick={playback.toggle}>{playback.playing?<Pause size={16}/>:<Play size={16}/>} {playbackLabel}</button>}</dialog>
    </header>
    <main id="content">
      <div className="portal-intro" data-portal-page="intro"><Suspense fallback={<section className="physarum-story" data-platform="true" aria-labelledby="platform-title"><div className="physarum-hero"><PlatformHeroCopy /></div></section>}><PhysarumHero study={study} platform onPlaybackChange={setPlayback} onIntroSettled={onIntroSettled}/></Suspense></div>
      <PlatformStory />
      <section className="portal-start" data-portal-page="start" aria-labelledby="start-heading"><div className="page-width">
        <div className="portal-start-top"><div><SceneTitle id="start-heading" lines={['开始你的第一件作品。']}/><p>{publicPortal ? '打开创作指南，把提示词发给你常用的编程 Agent。可以带上自己的想法，也可以用内置的观测数据试做一件作品。' : '带上数据、参考和想法，连接你自己的 Agent。也可以先打开工作台，熟悉画面与编辑方式。'}</p></div><motion.div className="portal-start-actions" initial={false} whileInView={{y:[16,0]}} viewport={{amount:.5}} transition={{duration:.8,ease:[.22,1,.36,1]}}><a className="portal-primary" href={agentSetup}>{publicPortal ? '打开创作指南' : '接入自己的 Agent'} <ArrowUpRight size={23} /></a>{!publicPortal&&<a className="portal-secondary" href="/">打开工作台 <ArrowUpRight size={18} /></a>}</motion.div></div>
        <div className="practical-notes">{[{ id: 'first', icon: MousePointer2, question: '需要先会写代码吗？', answer: '可以从观看和调整画面开始。需要改变绘制规则时，可以打开源码，或交给自己的 Agent。' }, { id: 'agent', icon: MessageSquare, question: '平台自带 AI 模型吗？', answer: '创作时使用你已有的编程 Agent 和模型。Visloom 提供创作指南、本机工作台和数据工具。' }, { id: 'files', icon: FileJson, question: '怎样使用自己的数据？', answer: '工作台支持导入 CSV 或对象数组 JSON。用 AVA 查看和整理数据，再与你的 Agent 决定怎样把它变成画面。' }, { id: 'share', icon: Globe, question: '作品可以直接发给别人吗？', answer: publicPortal ? '让 Agent 导出独立 HTML，再发布到你自己的 GitHub Pages，就能分享观看链接或嵌入其他网站。' : '可以导出 PNG 或独立 HTML，也可以通过已连接的服务生成观看链接和嵌入代码。本机链接只在本机可用；互联网访问需要连接公开分享服务。' }].map(item => <div className="practical-item" key={item.id}><button aria-expanded={faq === item.id} aria-controls={'answer-' + item.id} onClick={() => setFaq(faq === item.id ? null : item.id)}><item.icon size={20} /><span>{item.question}</span><ChevronDown size={16} className={faq === item.id ? 'is-open' : ''} /></button><p id={'answer-' + item.id} hidden={faq !== item.id}>{item.answer}</p></div>)}</div>
        {study.online === false && <p className="service-info" role="status">保存作品前，请连接自己的工作台服务。</p>}
      </div></section>
    </main>
    <footer className="site-footer page-width">
      <a className="footer-name" href={portalHome}><BrandMark className="app-mark" /><span className="brand-wordmark" translate="no">Visloom</span></a>
      <div><a href="/portal/credits.html">材料与开源致谢<ArrowUpRight size={13} /></a><a href={agentSetup}>Agent 接入<ArrowUpRight size={13} /></a></div>
      <a className="footer-note" href="/collection.html">浏览作品集 <ArrowUpRight size={13} /></a>
      <p className="portal-footer-legal"><span>© 2026 Visloom</span><a href={`${projectRepository}/blob/main/LICENSE`} rel="license">CC BY-NC 4.0</a></p>
    </footer>
    <PortalChapterNav current={pages.current} goTo={pages.goTo} chapters={pages.chapters}/>
    <AnimatePresence>{study.error && <motion.div className="error-notice" role="alert" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><p>{study.error}</p><button className="icon-button" aria-label="关闭错误提示" onClick={study.clearError}><X size={18} /></button></motion.div>}</AnimatePresence>
    {study.busy && <div className="busy-notice" role="status"><LoaderCircle size={17} className="spin" />正在准备作品副本…</div>}
  </div></MotionConfig>;
}
