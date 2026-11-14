// Assembles one chapter into a single HTML document.
// The <div id="source"> holds un-paginated sections; templates/paginate.js lays them out on A4 pages.
import { esc, inline, renderBlock, sectionHead, imageHtml, ratioCss } from './blocks.mjs';

/** Template A — chapter cover (kicker, chapter number and title above a wide painting, as in the reference). */
function coverHtml(ch, book, ctx) {
  const c = ch.cover;
  const img = ctx.images[c.image];
  if (!img) throw new Error(`Cover image "${c.image}" is not in the chapter image manifest.`);
  return `<section data-template="cover">
    <div class="cover-top">
      ${book.coverKicker ? `<div class="cover-kicker" data-min="12">${esc(book.coverKicker)}</div><div class="cover-rule"></div>` : ''}
      <div class="cover-chapter">Chapter ${ch.number}</div>
      <h1 class="cover-title">${inline(ch.title)}</h1>
      <div class="ornament" aria-hidden="true"><span></span></div>
    </div>
    <div class="cover-art" style="aspect-ratio: ${ratioCss(img)}">${imageHtml(img, ctx)}</div>
    <div class="cover-text">
      <p class="cover-subtitle">${inline(c.subtitle)}</p>
      ${c.verse ? `<div class="cover-verse">“${inline(c.verse.text)}”<b>${esc(c.verse.ref)}</b></div>` : ''}
    </div>
    <div class="cover-series" data-min="11">${esc(book.title)} · ${esc(book.edition)}</div>
  </section>`;
}

export function documentHtml(ch, book, ctx, opts) {
  const sections = ch.sections.map((s) => `
  <section data-template="${esc(s.template)}" data-id="${esc(s.id)}" data-title="${esc(s.title)}"${s.flow ? ' data-flow' : ''}>
    ${sectionHead(s)}
    ${s.blocks.map((b) => renderBlock(b, ctx)).join('\n')}
  </section>`).join('\n');

  const meta = {
    bookTitle: book.title,
    chapterLabel: `Chapter ${ch.number} · ${ch.title}`,
    startPage: opts.startPage,
    draft: opts.draft,
  };

  return `<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
<title>${esc(book.title)} — Chapter ${ch.number}: ${esc(ch.title)}</title>
<link rel="stylesheet" href="${esc(opts.cssHref)}">
</head>
<body>
<div id="book"></div>
<div id="source">
${coverHtml(ch, book, ctx)}
${sections}
</div>
<script id="meta" type="application/json">${JSON.stringify(meta).replace(/</g, '\\u003c')}</script>
<script src="${esc(opts.paginateSrc)}"></script>
</body>
</html>`;
}
