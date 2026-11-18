import { useMemo, useState } from 'react';
import { useMotionValueEvent, type MotionValue } from 'motion/react';
import { DEFAULTS } from '../../../../artworks/physarum/model';
import { observationAt, readObservations } from '../../../../artworks/physarum/observations';
import { ArrowUpRight, Download } from './PortalIcons';

type Tile = {
  kind: 'tile';
  frame: number;
  grid_x: number;
  grid_y: number;
  luma: number;
  texture: number;
  change: number;
  samples: number;
};

const dataPath = '/collection/physarum';
const hours = (seconds: number) => `+${(seconds / 3600).toFixed(1)} 小时`;
const numeric = new Intl.NumberFormat('zh-CN');

export default function PhysarumData({ rows, progress }: { rows?: unknown[] | null; progress: MotionValue<number> }) {
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [followingFrame, setFollowingFrame] = useState<number>();
  const frames = useMemo(() => readObservations(rows), [rows]);
  useMotionValueEvent(progress, 'change', value => {
    setFollowingFrame(observationAt(frames, value).nearest?.frame);
  });
  const nearest = frames.find(entry => entry.frame === followingFrame) ?? observationAt(frames, progress.get()).nearest;
  const frameIndex = selectedFrame ?? (nearest ? frames.indexOf(nearest) : 0);
  const frame = frames[frameIndex];
  const tiles = (rows ?? []).filter((row): row is Tile => {
    const tile = row as Tile | null;
    return tile?.kind === 'tile' && tile.frame === frame?.frame;
  });
  const totalSamples = frames.reduce((total, entry) => total + entry.sampleCount, 0);

  return (
    <>
      {!frame ? <p role="status">{rows === undefined ? '正在载入数据…' : '暂时无法显示观测数据。'}</p> : (
        <>
          <p className="physarum-data-meta">{frames.length} 个时刻 · {numeric.format(totalSamples)} 条原始网格记录</p>
          <label className="physarum-data-time">观测时刻
            <select value={selectedFrame ?? ''} onChange={event => {
              const value = event.target.value;
              setSelectedFrame(value === '' ? null : Number(value));
            }}>
              <option value="">跟随画面 · {nearest && hours(nearest.seconds)}</option>
              {frames.map((entry, index) => <option key={entry.frame} value={index}>{hours(entry.seconds)}</option>)}
            </select>
          </label>
          <div key={frame.frame} className="physarum-data-grid" tabIndex={0} role="region" aria-label="观测网格数据，可滚动">
            <table aria-label={`${hours(frame.seconds)}观测网格`}>
              <thead><tr><th scope="col">网格 (X, Y)</th><th scope="col">亮度</th><th scope="col">纹理</th><th scope="col">变化量</th><th scope="col">样本数</th></tr></thead>
              <tbody>{tiles.map(tile => (
                <tr key={`${tile.grid_x},${tile.grid_y}`}>
                  <th scope="row">{tile.grid_x}, {tile.grid_y}</th>
                  <td>{tile.luma.toFixed(4)}</td><td>{tile.texture.toFixed(4)}</td>
                  <td>{tile.change.toFixed(4)}</td><td>{tile.samples}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="physarum-data-note">本帧 {tiles.length} 个有效网格 · {numeric.format(frame.sampleCount)} 条原始记录</p>
          <figure className="physarum-data-scan">
            <img src={`${dataPath}/frame-${String(frame.frame).padStart(4, '0')}.png`} alt={`培养皿扫描，${hours(frame.seconds)}`} />
            <figcaption><strong>原始扫描</strong><span>第 {frame.frame} 帧</span></figcaption>
          </figure>
          <div className="physarum-data-parameters">
            <h3>模拟参数</h3>
            <dl>
              <div><dt>基础感知距离</dt><dd>{DEFAULTS.sensorDistance} 模拟像素</dd></div>
              <div><dt>感知角度</dt><dd>{DEFAULTS.sensorAngle}°</dd></div>
              <div><dt>转向角度</dt><dd>{DEFAULTS.turnAngle}°</dd></div>
              <div><dt>观测场影响</dt><dd>{DEFAULTS.observationInfluence}</dd></div>
            </dl>
            <p>AVA 将 64 × 64 网格聚合到 24 × 24。亮度影响感知距离，纹理与相对首帧的变化影响趋向与组织反馈。</p>
          </div>
        </>
      )}
      <div className="physarum-data-links">
        <a href={`${dataPath}/ava-observations.csv`} download><Download size={16} /> AVA 聚合 CSV</a>
        <a href={`${dataPath}/growth.csv`} download><Download size={16} /> 原始网格 CSV</a>
        <a href="/portal/credits.html#physarum">数据来源 <ArrowUpRight size={14} /></a>
      </div>
    </>
  );
}
