import { motion, useReducedMotion, type Variants } from 'motion/react';

export const sceneEase = [.22, 1, .36, 1] as const;
export const sceneStagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: .13 } } };
export const sceneItem: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: .85, ease: sceneEase } },
};

export function SceneTitle({ id, lines }: { id: string; lines: string[] }) {
  const reduced = useReducedMotion();
  return <motion.h2 id={id} aria-label={lines.join('')} initial={reduced ? false : 'hidden'} whileInView="visible"
    viewport={{ amount: .35 }} variants={{ hidden: {}, visible: { transition: { staggerChildren: .1 } } }}>
    {lines.map(line => <span className="portal-title-mask" aria-hidden="true" key={line}><motion.span
      variants={{ hidden: { y: '105%' }, visible: { y: '0%', transition: { duration: .95, ease: sceneEase } } }}>{line}</motion.span></span>)}
  </motion.h2>;
}

export function FlowConnector({ delay = 0 }: { delay?: number }) {
  const reduced = useReducedMotion();
  return <svg className="portal-flow-connector" viewBox="0 0 120 24" fill="none" aria-hidden="true">
    <motion.path d="M2 12H115M107 4L115 12L107 20" stroke="currentColor" strokeWidth="2"
      initial={reduced ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ amount: .8 }}
      transition={{ duration: .85, delay: reduced ? 0 : delay, ease: sceneEase }}/>
  </svg>;
}
