import React from 'react';
import { createRoot } from 'react-dom/client';
import Portal from './Portal';
import { watchPortalAnchor } from './usePortalAnchor';
import './portal.css';

const root = document.getElementById('root')!;
const app = createRoot(root);
const loader = document.getElementById('portal-loader')!;
const status = document.getElementById('portal-load-status')!;
const retry = document.getElementById('portal-load-retry') as HTMLButtonElement;

async function loadPortalFonts() {
  const faces = await Promise.all([
    document.fonts.load('400 56px Smiley', '数字艺术与数据可视化'),
    document.fonts.load('500 14px Unbounded', 'Visloom'),
  ]);
  if (faces.some(group => !group.length)) throw new Error('Homepage font is unavailable');
  await document.fonts.ready;
}

const artworkReady = new Promise<void>(resolve => {
  app.render(<React.StrictMode><Portal onIntroSettled={resolve} /></React.StrictMode>);
});

void Promise.all([loadPortalFonts(), artworkReady]).then(() => {
  const stopAnchors = watchPortalAnchor(window, document);
  import.meta.hot?.dispose(stopAnchors);
  requestAnimationFrame(() => {
    root.inert = false;
    loader.inert = true;
    loader.setAttribute('data-ready', '');
    window.setTimeout(() => loader.remove(), 300);
  });
}).catch(() => {
  app.unmount();
  status.textContent = '页面资源加载失败';
  retry.hidden = false;
});
