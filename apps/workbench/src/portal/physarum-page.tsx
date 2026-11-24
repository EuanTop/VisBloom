import { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useMotionValue } from 'motion/react';
import BrandMark from '../BrandMark';
import PhysarumHero from './PhysarumHero';
import PhysarumData from './PhysarumData';
import { ArrowUpRight } from './PortalIcons';
import { portalHome } from './portal-links';
import './portal.css';
import './physarum-page.css';

function PhysarumPage() {
  const [rows, setRows] = useState<unknown[] | null>();
  const observationTime = useMotionValue(0);
  const trackObservationTime = useCallback((progress: number) => observationTime.set(progress), [observationTime]);

  return (
    <div className="physarum-page">
      <header className="site-header">
        <div className="physarum-page-brand">
          <a className="small-brand" href={portalHome} aria-label="VisBloom 首页">
            <BrandMark className="app-mark" />
            <span className="brand-wordmark" translate="no">VisBloom</span>
          </a>
          <h1 id="physarum-title">生长之间</h1>
        </div>
        <nav aria-label="作品导航">
          <a className="physarum-collection" href="/collection.html">作品集 <ArrowUpRight size={14} /></a>
          <a className="physarum-data-jump" href="#physarum-data">数据</a>
        </nav>
      </header>
      <main className="physarum-layout">
        <PhysarumHero onObservations={setRows} onObservationTime={trackObservationTime} />
        <aside id="physarum-data" className="physarum-data" aria-labelledby="physarum-data-title">
          <h2 id="physarum-data-title">观测数据</h2>
          <PhysarumData rows={rows} progress={observationTime} />
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<PhysarumPage />);
