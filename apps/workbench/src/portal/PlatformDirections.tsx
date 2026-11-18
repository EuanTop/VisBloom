import { ArrowUpRight } from './PortalIcons';
import { SceneTitle } from './PortalScene';
import { publicPortal } from './portal-links';

export default function PlatformDirections() {
  const artwork = publicPortal ? '/artworks/physarum.html' : '/study.html?work=physarum';

  return <section className="platform-directions" aria-labelledby="directions-heading">
    <div className="platform-section-heading">
      <SceneTitle id="directions-heading" lines={['创作示例']} />
    </div>
    <div className="platform-directions-grid">
      <figure>
        <h3>信息设计</h3>
        <a className="platform-direction-image" href="https://artwork.euantop.work/artworks/skinbloom-ingredients.html" aria-label="体验 SkinBloom Ingredients">
          <img src="/portal/skinbloom-petals.jpg" alt="SkinBloom 的彩色配方花瓣、红色防腐剂标记和右侧成分表" width={1280} height={720} loading="lazy" />
          <ArrowUpRight aria-hidden="true" size={18} />
        </a>
        <figcaption>
          <strong translate="no">SkinBloom Ingredients</strong>
          <p>每片花瓣对应一项成分，颜色标出功效，红点标出防腐剂。</p>
        </figcaption>
      </figure>
      <figure>
        <h3>数据艺术</h3>
        <a className="platform-direction-image" href={artwork} aria-label="体验《生长之间》">
          <img src="/collection/physarum.png" alt="金色和蓝色粒子组成蔓延的分枝" width={480} height={360} loading="lazy" />
          <ArrowUpRight aria-hidden="true" size={18} />
        </a>
        <figcaption>
          <strong>生长之间</strong>
          <p>以黏菌扫描里的亮度和变化驱动粒子生长。</p>
        </figcaption>
      </figure>
    </div>
  </section>;
}
