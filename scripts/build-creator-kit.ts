import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const portal = path.join(root, 'dist/portal');
const downloads = path.join(portal, 'downloads');
const staging = await mkdtemp(path.join(tmpdir(), 'visbloom-creator-kit-'));
const kit = path.join(staging, 'visbloom-creator-kit');
await mkdir(downloads, { recursive: true });

async function write(relative: string, content: string) {
  const target = path.join(kit, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
async function copy(relative: string, target = relative) {
  await cp(path.join(root, relative), path.join(kit, target), { recursive: true });
}
function archive(base: string, member: string, filename: string) {
  execFileSync('tar', ['-czf', path.join(downloads, filename), '-C', base, member], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
}

try {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const { start, visbloom, mcp } = manifest.scripts;
  await write('package.json', JSON.stringify({ ...manifest, scripts: { start, visbloom, mcp } }, null, 2));
  await copy('package-lock.json');
  for (const app of ['agent', 'server', 'workbench']) await copy(`apps/${app}/package.json`);
  for (const app of ['agent', 'server', 'share-server']) await copy(`apps/${app}/src`);
  for (const pkg of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    await copy(`packages/${pkg.name}/package.json`);
    await copy(`packages/${pkg.name}/src`);
  }
  await copy('dist/creator-workbench', 'dist/workbench');
  await copy('apps/workbench/public/visbloom.svg', 'dist/workbench/visbloom.svg');
  await copy('apps/workbench/public/help/agent-setup.html', 'dist/workbench/help/agent-setup.html');
  await copy('apps/workbench/public/portal/fonts', 'dist/workbench/portal/fonts');
  await copy('dist/portal/collection/physarum.png', 'dist/workbench/collection/physarum.png');
  await write('dist/workbench/collection.html', '<!doctype html><meta charset="utf-8"><a href="https://visbloom.euantop.work/collection.html">VisBloom 作品集</a>');

  for (const file of ['artwork.ts', 'controls.json', 'bindings.json', 'files.json']) await copy(`cases/physarum/${file}`);
  const physarumFiles = JSON.parse(await readFile(path.join(root, 'cases/physarum/files.json'), 'utf8')) as { source: string }[];
  for (const { source } of physarumFiles) await copy(source);
  const rows = JSON.parse(await readFile(path.join(portal, 'collection/physarum.json'), 'utf8')) as Record<string, unknown>[];
  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => value == null ? '' : `"${String(value).replaceAll('"', '""')}"`;
  const growthCsv = [columns.join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\n');
  await write('cases/physarum/data/growth.csv', growthCsv);
  const series = JSON.parse(await readFile(path.join(root, 'cases/physarum/series/provenance.json'), 'utf8'));
  const sites = JSON.parse(await readFile(path.join(root, 'cases/physarum/provenance.json'), 'utf8'));
  const frames = series.frames.map(({ index, timestamp_utc, seconds_since_frame_zero }: {
    index: number; timestamp_utc: string; seconds_since_frame_zero: number;
  }) => ({ index, timestamp_utc, seconds_since_frame_zero }));
  await write('cases/physarum/data/provenance.json', JSON.stringify({
    source: series.source_record,
    creators: series.creators,
    license: series.license,
    licenseUrl: series.license_url,
    csvSha256: createHash('sha256').update(growthCsv).digest('hex'),
    rowCount: rows.length,
    observationRows: rows.filter(row => row.kind === 'tile').length,
    frames,
    observations: {
      grid: [24, 24],
      aggregation: 'Each output cell averages the source 64 × 64 tile measurements without area weighting. samples counts the contributing source tiles.',
      time: 'seconds is elapsed time from frame zero, taken from the publisher timestamps.',
      coordinates: 'x increases to the right, y increases upwards. grid_x and grid_y are indices in the aggregated grid.',
      sourceTileMeasures: {
        rgb: series.measurements.r_g_b,
        luma: series.measurements.luma,
        texture: series.measurements.texture,
        change: series.measurements.change,
      },
      limitations: series.limitations,
    },
    otherRows: {
      nutrient: 'Manually annotated oat sites from the first scan.',
      inoculum: 'An authored initial condition. Its location and radius are artistic inputs.',
      frame: sites.frame.index,
    },
  }, null, 2) + '\n');
  await write('cases/physarum/growth.sql', 'SELECT * FROM data ORDER BY frame NULLS FIRST, grid_y NULLS FIRST, grid_x NULLS FIRST, id');
  await write('cases/physarum/README.md', '# 生长之间 · Physarum\n\n[数据](data/growth.csv)包含 12 个时刻的扫描影像网格统计和首帧位置标记。亮度与变化量描述扫描影像的外观。时间戳、网格汇总方式、手工标注及作者和许可见[数据来源](data/provenance.json)。\n');

  const entries = JSON.parse(await readFile(path.join(root, 'skills/entries.json'), 'utf8')) as {
    entries: { id: string; version: string; group: string }[];
  };
  const catalog = JSON.parse(await readFile(path.join(root, 'skills/catalog.json'), 'utf8')) as {
    skills: { id: string; version: string; directory: string }[];
  };
  const refs = new Set(entries.entries.map(({id, version}) => `${id}@${version}`));
  catalog.skills = catalog.skills.filter(({id, version}) => refs.has(`${id}@${version}`));
  for (const {group, id} of entries.entries) await copy(`skills/${group}/${id}`);
  for (const {directory} of catalog.skills) await copy(directory);
  await write('skills/catalog.json', JSON.stringify(catalog, null, 2));
  await copy('skills/entries.json');
  await copy('skills/default.lock.json');
  await copy('apps/workbench/public-site/skills/visbloom', 'skills/visbloom');
  const files = ['visbloom-creator-kit-0.1.17.tar.gz', 'visbloom-skill-0.1.17.tar.gz'];
  archive(staging, 'visbloom-creator-kit', files[0]);
  archive(path.join(portal, 'skills'), 'visbloom', files[1]);
  const sums = await Promise.all(files.map(async file => {
    const digest = createHash('sha256').update(await readFile(path.join(downloads, file))).digest('hex');
    return `${digest}  ${file}`;
  }));
  await writeFile(path.join(downloads, 'SHA256SUMS'), sums.join('\n') + '\n');
} finally {
  await rm(staging, { recursive: true, force: true });
}
