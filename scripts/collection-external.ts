export interface ExternalWork {
  title: string;
  author: string;
  url: string;
  description?: string;
}

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => entities[character]);

export function externalWorkCard(work: ExternalWork, publicPortal: boolean) {
  if (!work.title?.trim() || !work.author?.trim()) throw new Error('External collection works require a title and author');
  const entry = new URL(work.url);
  if (entry.protocol !== 'https:' || entry.username || entry.password) {
    throw new Error('External collection works require a public HTTPS page');
  }

  const cover = new URL(entry.href);
  if (!cover.pathname.endsWith('/') && !/\.html?$/i.test(cover.pathname)) cover.pathname += '/';
  const coverUrl = new URL('cover.jpg', cover);
  const href = escapeHtml(entry.href);
  const image = `<img class="work-cover" src="${escapeHtml(coverUrl.href)}" referrerpolicy="no-referrer" alt="" data-external-cover hidden>`;
  const title = escapeHtml(work.title);
  const author = escapeHtml(work.author);
  const description = work.description ? `<p>${escapeHtml(work.description)}</p>` : '';

  return publicPortal ? `<article>
    <a href="${href}">${image}<h2>${title} <span aria-hidden="true">↗</span></h2>${description}</a>
    <p class="work-author">${author}</p>
  </article>` : `<a class="work" href="${href}">${image}<div><h2>${title}</h2><span>${author} ↗</span></div></a>`;
}

export const externalCoverScript = `<script>
for (const image of document.querySelectorAll('[data-external-cover]')) {
  const showCover = () => { if (image.naturalWidth) image.hidden = false; };
  image.addEventListener('load', showCover, { once: true });
  if (image.complete) showCover();
}
</script>`;
