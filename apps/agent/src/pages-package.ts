import { mkdir, lstat, readFile, open, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { CLIError } from './cli-support.ts';

export async function checkPagesDirectory(directory: string) {
  try {
    await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new CLIError('output_exists', `${path.resolve(directory)} 已存在。请为这次发布指定一个新目录。`, 1);
}

export async function readCover(filename: string) {
  const bytes = await readFile(filename);
  if (bytes.length < 4 || !bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
      !bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) {
    throw new CLIError('invalid_cover', '请提供有效的 JPEG 图片。', 2);
  }
  return bytes;
}

async function captureCover(html: Uint8Array) {
  const { chromium } = await import('playwright');
  const launchOptions = { chromiumSandbox: true, timeout: 15_000 };
  const browser = await chromium.launch(launchOptions)
    .catch(() => chromium.launch({ ...launchOptions, channel: 'chrome' }))
    .catch(() => {
      throw new CLIError('cover_browser_unavailable', '无法启动截图浏览器。请运行 npm exec playwright install chromium，或用 --cover 提供 JPEG。', 1);
    });
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    const entry = 'http://visloom-cover.invalid/index.html';
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => route.request().url() === entry
      ? route.fulfill({ body: Buffer.from(html), contentType: 'text/html; charset=utf-8' })
      : route.abort());
    const page = await context.newPage();
    let runtimeFailed = false;
    page.on('pageerror', () => { runtimeFailed = true; });
    await page.goto(entry, { waitUntil: 'load', timeout: 15_000 });
    await page.waitForFunction(() => {
      const status = document.documentElement.dataset.visloomRender;
      return status === 'error' || (status === 'ready' && document.fonts.status === 'loaded');
    }, undefined, { timeout: 15_000 });
    // Leave time for a work's entrance animation after the renderer draws its first frame.
    await wait(1800);
    if (runtimeFailed || await page.locator('html').getAttribute('data-visloom-render') !== 'ready') {
      throw new Error('Artwork render failed');
    }
    return await page.screenshot({ type: 'jpeg', quality: 92, timeout: 10_000 });
  } catch {
    throw new CLIError('cover_capture_failed', '作品页面未能完成封面截图。请检查 HTML 预览，或用 --cover 指定这个版本的 JPEG。', 1);
  } finally {
    await browser.close();
  }
}

export async function stagePages(directory: string, html: Uint8Array, chosenCover?: Buffer) {
  const target = path.resolve(directory);
  await checkPagesDirectory(target);
  const cover = chosenCover ?? await captureCover(html);
  await mkdir(path.dirname(target), { recursive: true });
  // Claim the directory exclusively. Write the entry point after its companion files.
  await mkdir(target).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CLIError('output_exists', `${target} 已存在。请为这次发布指定一个新目录。`, 1);
    }
    throw error;
  });
  const staged: string[] = [];
  try {
    for (const [name, bytes] of [['cover.jpg', cover], ['.nojekyll', ''], ['index.html', html]] as const) {
      const file = path.join(target, name);
      const handle = await open(file, 'wx');
      staged.push(file);
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
    }
  } catch (error) {
    await Promise.allSettled(staged.map(file => unlink(file)));
    await rmdir(target).catch(() => {});
    throw error;
  }
  return {
    directory: target,
    html: path.join(target, 'index.html'),
    cover: path.join(target, 'cover.jpg'),
    coverSource: chosenCover ? 'author' : 'captured',
  };
}
