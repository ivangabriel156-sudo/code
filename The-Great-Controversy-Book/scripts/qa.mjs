// Automated quality control, run inside the paginated document before the PDF is exported.
// Returns { errors: [...], warnings: [...], stats: {...} }. Errors block the export.

export const REQUIRED_SECTIONS = [
  'story', 'background', 'meaning', 'visual', 'scripture', 'lessons', 'questions', 'application',
];

// Typography rules from the project brief (points).
export const SIZE_RULES = [
  { name: 'Chapter title', selector: '.cover-title', min: 30, max: 36 },
  { name: 'Section heading', selector: '.section-title', min: 25, max: 30 },
  { name: 'Subheading', selector: 'h3.sub, .panel h4, .tl-body h4, .person h4, .numbered h4', min: 21, max: 24 },
  { name: 'Bible passage', selector: '.verse-text', min: 18, max: 20 },
  { name: 'Main text', selector: 'p.block, .panel p, .tl-body p, .person p.bio, .numbered p, .legend-row p', min: 17, max: 19 },
];

export async function runQa(page, { minImageDpi = 150 } = {}) {
  return page.evaluate(({ REQUIRED_SECTIONS, SIZE_RULES, minImageDpi }) => {
    const errors = [];
    const warnings = [];
    const PT = 0.75; // 1 CSS px = 0.75 pt
    const EPS = 0.75;
    const pages = [...document.querySelectorAll('#book > .page')];
    const label = (p) => `page ${p.dataset.page}`;
    const snippet = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);

    // 1. All eight study sections present.
    const present = new Set(pages.flatMap((p) => (p.dataset.sections || '').split(' ')));
    for (const id of REQUIRED_SECTIONS) if (!present.has(id)) errors.push(`Missing required section "${id}"`);

    // 2. Typography size rules.
    for (const rule of SIZE_RULES) {
      for (const el of document.querySelectorAll(rule.selector)) {
        const pt = parseFloat(getComputedStyle(el).fontSize) * PT;
        if (pt < rule.min - 0.05 || pt > rule.max + 0.05) {
          errors.push(`${rule.name} is ${pt.toFixed(1)}pt (allowed ${rule.min}–${rule.max}pt): "${snippet(el)}"`);
        }
      }
    }

    let smallest = Infinity;
    for (const p of pages) {
      const pr = p.getBoundingClientRect();

      // 3. No text below its minimum size (default 17pt; captions, labels and running heads declare data-min).
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.nodeValue.trim()) continue;
        const el = node.parentElement;
        let pt = parseFloat(getComputedStyle(el).fontSize) * PT;
        const svg = el.closest('svg');
        if (svg && svg.viewBox.baseVal.width) pt *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const holder = el.closest('[data-min]');
        const min = holder ? Number(holder.dataset.min) : 17;
        smallest = Math.min(smallest, pt);
        if (pt < min - 0.05) errors.push(`${label(p)}: text is ${pt.toFixed(1)}pt, below the ${min}pt minimum: "${snippet(el)}"`);
      }

      // 4. Body content fits the page (no overflow, no oversize blocks).
      const body = p.querySelector('.page-body');
      if (body) {
        if (body.scrollHeight > body.clientHeight + 1) errors.push(`${label(p)}: content overflows the page body`);
        const kids = [...body.children];
        if (!kids.length) errors.push(`${label(p)}: page is empty`);
        // 5. Blocks do not overlap one another.
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1].getBoundingClientRect();
          const b = kids[i].getBoundingClientRect();
          if (b.top < a.bottom - EPS) errors.push(`${label(p)}: blocks overlap near "${snippet(kids[i])}"`);
        }
        const br = body.getBoundingClientRect();
        const used = kids.length ? kids[kids.length - 1].getBoundingClientRect().bottom - br.top : 0;
        if (used / br.height < 0.35) warnings.push(`${label(p)}: page is only ${Math.round((used / br.height) * 100)}% full`);
      }
      for (const el of p.querySelectorAll('[data-oversize]')) errors.push(`${label(p)}: block is taller than a page: "${snippet(el)}"`);

      // 6. Nothing sticks out of the page or is clipped inside its own box.
      for (const el of p.querySelectorAll('*')) {
        if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        if (r.left < pr.left - EPS || r.right > pr.right + EPS || r.top < pr.top - EPS || r.bottom > pr.bottom + EPS) {
          errors.push(`${label(p)}: <${el.tagName.toLowerCase()} class="${el.className}"> extends beyond the page edge`);
        }
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && el !== body) {
          errors.push(`${label(p)}: text is clipped horizontally in "${snippet(el)}"`);
        }
      }
      // SVG labels must stay inside their drawing.
      for (const svg of p.querySelectorAll('svg')) {
        const sr = svg.getBoundingClientRect();
        for (const t of svg.querySelectorAll('text')) {
          const r = t.getBoundingClientRect();
          if (r.left < sr.left - EPS || r.right > sr.right + EPS || r.top < sr.top - EPS || r.bottom > sr.bottom + EPS) {
            errors.push(`${label(p)}: map/diagram label "${snippet(t)}" runs outside the drawing`);
          }
        }
        // …and must not collide with each other.
        const texts = [...svg.querySelectorAll('text')].map((t) => [t, t.getBoundingClientRect()]);
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
          const [a, ra] = texts[i]; const [b, rb] = texts[j];
          if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) {
            errors.push(`${label(p)}: map/diagram labels overlap: "${snippet(a)}" and "${snippet(b)}"`);
          }
        }
      }

      // 7. Images loaded and sharp enough for print.
      for (const img of p.querySelectorAll('img')) {
        if (!img.complete || !img.naturalWidth) { errors.push(`${label(p)}: image failed to load: ${img.getAttribute('src')}`); continue; }
        const r = img.getBoundingClientRect();
        const dpi = Math.min(img.naturalWidth / (r.width / 96), img.naturalHeight / (r.height / 96));
        if (dpi < minImageDpi) warnings.push(`${label(p)}: image ${img.getAttribute('src').split('/').pop()} prints at about ${Math.round(dpi)} dpi (target ${minImageDpi}+)`);
      }
    }

    const placeholders = document.querySelectorAll('[data-placeholder]').length;
    return {
      errors, warnings,
      stats: { pages: pages.length, placeholders, images: document.images.length, smallestTextPt: Number(smallest.toFixed(1)) },
    };
  }, { REQUIRED_SECTIONS, SIZE_RULES, minImageDpi });
}
