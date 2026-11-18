import { ArrowUpRight } from './PortalIcons';
import { motion, type MotionStyle } from 'motion/react';
import MagneticLink from './MagneticLink';
import { createLabel, createLink } from './portal-links';

export default function PlatformHeroCopy({style, inactive = false}:{style?:MotionStyle; inactive?:boolean}) {
  return <motion.div className="physarum-title platform-hero-copy" style={style} inert={inactive} aria-hidden={inactive || undefined}>
    <h1 id="platform-title">数字艺术与<br />数据可视化</h1>
    <p className="platform-hero-description">用自己的 Agent 构思，在同一个工作台里调整画面、源码与数据。</p>
    <div className="platform-hero-actions"><MagneticLink className="platform-hero-primary" href={createLink}>{createLabel} <ArrowUpRight size={21} /></MagneticLink><a href="#platform">看创作示例 <ArrowUpRight size={17} /></a></div>
  </motion.div>;
}
