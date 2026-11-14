// Block renderers: turn the structured content (JSON) into HTML fragments.
// Every top-level fragment carries class="block" — the paginator moves whole blocks between pages.
// data-min="N" tells the QA checker the smallest font size (pt) allowed inside that element.

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal inline markup: **bold**, *italic*. Everything else is escaped. */
export const inline = (s = '') =>
  esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');

const paras = (text) =>
  (Array.isArray(text) ? text : [text]).map((t) => `<p>${inline(t)}</p>`).join('');

const CHIPS = {
  scripture: ['chip', 'Scripture · KJV'],
  history: ['chip chip--history', 'History'],
  egw: ['chip chip--egw', 'Ellen White’s View'],
  note: ['chip chip--note', 'Study Note'],
  apply: ['chip', 'For Your Life'],
};
export const chip = (kind) => {
  const [cls, label] = CHIPS[kind] || CHIPS.note;
  return `<div class="${cls}" data-min="12">${label}</div>`;
};

const STATUS_TEXT = {
  'not-started': 'Not generated yet',
  submitted: 'Submitted — waiting for results',
  generated: 'Generated — waiting for approval',
  failed: 'Generation failed',
};

/**
 * An approved illustration, or an honest placeholder. Only pictures marked "approved" in the
 * chapter's image-manifest.json (and present in assets/images/chapter-NN/) are ever placed.
 */
export function imageHtml(img, ctx) {
  if (!img) throw new Error('A block refers to an image id that is not in the chapter image manifest.');
  ctx.used.add(img.id);
  if (ctx.isApproved(img)) {
    return `<img data-image-id="${esc(img.id)}" src="${esc(ctx.imageUrl(img))}" alt="${esc(img.alt)}">`;
  }
  ctx.missing.add(img.outputFilename);
  const status = img.approvalStatus === 'rejected' ? 'Rejected — to be regenerated' : (STATUS_TEXT[img.generationStatus] || img.generationStatus);
  return `<div class="img-placeholder" data-placeholder data-image-id="${esc(img.id)}" data-min="12">
    <div class="ph-label">Illustration pending</div>
    <div class="ph-desc">${esc(img.alt)}</div>
    <div class="ph-file">${esc(img.outputFilename)}</div>
    <div class="ph-status">${esc(status)}</div>
  </div>`;
}

/** CSS aspect-ratio value for a manifest ratio such as "16:9". */
export const ratioCss = (img) => String(img.aspectRatio || '16:9').replace(':', ' / ');

const renderers = {
  p: (b) => `<p class="block${b.lead ? ' lead' : ''}">${inline(b.text)}</p>`,

  heading: (b) => `<h3 class="block sub" data-keep-next>${inline(b.text)}</h3>`,

  // The frame takes the picture's own aspect ratio, so the whole painting shows without cropping.
  image: (b, ctx) => {
    const img = ctx.images[b.image];
    if (!img) throw new Error(`Image "${b.image}" is not in the chapter image manifest.`);
    return `<figure class="block illus illus--${b.size || 'wide'}">
      <div class="frame" style="aspect-ratio: ${ratioCss(img)}">${imageHtml(img, ctx)}</div>
      ${b.caption ? `<figcaption data-min="14">${inline(b.caption)}</figcaption>` : ''}
    </figure>`;
  },

  // A hand-built SVG diagram (map, chart) stored in the chapter's images folder; inlined so book fonts apply.
  svg: (b, ctx) => `<figure class="block svg-figure" data-min="12">
      ${ctx.readSvg(b.file)}
      ${b.caption ? `<figcaption data-min="14">${inline(b.caption)}</figcaption>` : ''}
    </figure>`,

  panel: (b) => `<div class="block panel panel--${b.kind}"${b.keep ? ' data-no-split' : ''}>
      ${chip(b.kind)}
      ${b.title ? `<h4>${inline(b.title)}</h4>` : ''}
      ${paras(b.text)}
    </div>`,

  verse: (b) => `<figure class="block verse">
      ${chip('scripture')}
      <blockquote class="verse-text">${inline(b.text)}</blockquote>
      <figcaption class="verse-ref">${esc(b.ref)}</figcaption>
    </figure>`,

  // Each timeline entry is its own block, so a long timeline flows across pages.
  timeline: (b) => b.items.map((it) => `<div class="block tl-item">
      <div class="tl-date">${inline(it.date)}</div>
      <div class="tl-body"><h4>${inline(it.title)}</h4><p>${inline(it.text)}</p></div>
    </div>`).join('\n'),

  people: (b) => b.items.map((p) => `<div class="block person">
      <div class="monogram" aria-hidden="true">${esc(p.name.trim()[0])}</div>
      <div><h4>${inline(p.name)}</h4><div class="role" data-min="14">${inline(p.role)}</div><p class="bio">${inline(p.text)}</p></div>
    </div>`).join('\n'),

  lessons: (b) => b.items.map((it, i) => `<div class="block numbered">
      <div class="num" aria-hidden="true">${i + 1}</div>
      <div><h4>${inline(it.title)}</h4><p>${inline(it.text)}</p></div>
    </div>`).join('\n'),

  questions: (b) => b.items.map((q, i) => `<div class="block numbered numbered--question">
      <div class="num" aria-hidden="true">${i + 1}</div>
      <div><p>${inline(q)}</p></div>
    </div>`).join('\n'),

  legend: (b) => `<div class="block">${b.items.map((it) => `<div class="legend-row">
      ${chip(it.kind)}<p>${inline(it.text)}</p></div>`).join('')}</div>`,

  parts: (b) => `<div class="block parts-list">${b.items.map((t, i) =>
      `<div><b>${i + 1}</b>${inline(t)}</div>`).join('')}</div>`,
};

export function renderBlock(block, ctx) {
  const fn = renderers[block.type];
  if (!fn) throw new Error(`Unknown block type "${block.type}"`);
  return fn(block, ctx);
}

export function sectionHead(section) {
  return `<header class="block section-head" data-keep-next>
    ${section.part ? `<div class="kicker" data-min="14">Part ${section.part} of 8</div>` : ''}
    <h2 class="section-title">${inline(section.title)}</h2>
    <div class="ornament" aria-hidden="true"><span></span></div>
  </header>`;
}
