// Browser-side automatic pagination.
// Moves content blocks from #source onto fixed A4 pages, opening a new page whenever a block
// would not fit. Blocks are never shrunk or split — more pages are created instead.
(async function paginate() {
  // Content starts hidden, so the browser has not fetched the fonts yet: load every face explicitly
  // before measuring anything, otherwise text reflows after pagination.
  await Promise.all([...document.fonts].map((f) => f.load()));
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) =>
    img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));

  const meta = JSON.parse(document.getElementById('meta').textContent);
  const book = document.getElementById('book');
  const pages = [];
  let page = null;
  let body = null;

  function newPage(template, sectionId) {
    page = document.createElement('div');
    page.className = `page page--${template}`;
    page.dataset.sections = sectionId;
    page.innerHTML = `
      <div class="page-header" data-min="11"><span>${meta.bookTitle}</span><span>${meta.chapterLabel}</span></div>
      <div class="page-body"></div>
      <div class="page-footer" data-min="11"><span class="page-number"></span>${
        meta.draft ? '<span class="draft-flag">Draft proof</span>' : ''}</div>`;
    body = page.querySelector('.page-body');
    book.append(page);
    pages.push(page);
  }

  const overflows = () => body.scrollHeight > body.clientHeight + 1;

  // Move trailing paragraphs of an overflowing panel into a continuation panel.
  // Returns the continuation, or null if the panel cannot be divided so that its first part fits.
  function splitPanel(block) {
    if (!block.classList.contains('panel') || block.hasAttribute('data-no-split')) return null;
    const paras = [...block.querySelectorAll(':scope > p')];
    if (paras.length < 2) return null;
    const rest = block.cloneNode(false);
    rest.classList.add('panel--cont');
    const chip = block.querySelector(':scope > .chip');
    if (chip) {
      const c = chip.cloneNode(true);
      c.textContent += ' · continued';
      rest.append(c);
    }
    const anchor = rest.lastChild;
    while (overflows() && block.querySelectorAll(':scope > p').length > 1) {
      const last = [...block.querySelectorAll(':scope > p')].pop();
      if (anchor) anchor.after(last); else rest.prepend(last);
    }
    if (overflows()) {
      block.append(...rest.querySelectorAll(':scope > p')); // could not make it fit — undo
      return null;
    }
    return rest;
  }

  for (const section of [...document.querySelectorAll('#source > section')]) {
    const template = section.dataset.template;

    if (template === 'cover') {
      const cover = document.createElement('div');
      cover.className = 'page page--cover';
      cover.dataset.sections = 'cover';
      cover.append(...section.childNodes);
      book.append(cover);
      pages.push(cover);
      page = null;
      continue;
    }

    const id = section.dataset.id;
    // "flow" sections continue on the current page; others open a fresh page.
    if (!page || !section.hasAttribute('data-flow')) newPage(template, id);
    else page.dataset.sections += ' ' + id;

    const queue = [...section.children];
    while (queue.length) {
      const block = queue.shift();
      body.append(block);
      if (!overflows()) continue;

      // A long panel may be divided between paragraphs; the second part keeps its source label.
      const rest = splitPanel(block);
      if (rest) {
        queue.unshift(rest);
        newPage(template, id);
        continue;
      }

      // Otherwise carry the whole block to a new page, with any heading that must stay with it.
      const carry = [block];
      let prev = block.previousElementSibling;
      while (prev && prev.hasAttribute('data-keep-next')) {
        carry.unshift(prev);
        prev = prev.previousElementSibling;
      }
      if (body.children.length === carry.length) {
        block.dataset.oversize = 'true'; // taller than a whole page — QA reports this as an error
        continue;
      }
      newPage(template, id);
      queue.unshift(...carry);
    }
  }

  pages.forEach((p, i) => {
    const n = p.querySelector('.page-number');
    if (n) n.textContent = String(meta.startPage + i);
    p.dataset.page = String(meta.startPage + i);
  });

  document.getElementById('source').remove();
  window.__paginated = true;
})();
