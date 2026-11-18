import { useRef, type AnchorHTMLAttributes } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

/** Pointer spring adapted from ibelick/motion-primitives Magnetic (MIT).
 * The anchor's hit area stays still; only its contents follow the pointer. */
export default function MagneticLink({ children, className = '', ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0), y = useMotionValue(0);
  const spring = { stiffness: 240, damping: 23, mass: .4 };
  const sx = useSpring(x, spring), sy = useSpring(y, spring);
  const reset = () => { x.set(0); y.set(0); };
  return <a {...props} ref={ref} className={`magnetic-link ${className}`}
    onPointerMove={event => {
      if (reduced || event.pointerType !== 'mouse') return;
      const box = ref.current!.getBoundingClientRect();
      x.set(Math.max(-7, Math.min(7, (event.clientX - box.left - box.width / 2) * .13)));
      y.set(Math.max(-5, Math.min(5, (event.clientY - box.top - box.height / 2) * .13)));
    }} onPointerLeave={reset} onBlur={reset}>
    <motion.span style={{ x: sx, y: sy }} whileTap={reduced ? undefined : { scale: .97 }}>{children}</motion.span>
  </a>;
}
