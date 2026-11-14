#!/usr/bin/env node
// Build one chapter: content.json -> paginated HTML -> quality control -> A4 PDF.
//
//   node scripts/build.mjs 1            final build (fails if any illustration is missing)
//   node scripts/build.mjs 1 --draft    proof build (missing illustrations become labelled placeholders)
//   node scripts/build.mjs 1 --preview  also write one PNG per page for visual inspection
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, chapterSlug, chapterDir, loadBook, loadChapter, parseArgs } from './lib.mjs';
import { documentHtml } from '../templates/document.mjs';
import { runQa } from './qa.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const { chapter: n, flags } = parseArgs(process.argv.slice(2));
const draft = flags.has('--draft');
const book = loadBook();
const ch = loadChapter(n);
const slug = chapterSlug(n);
const imgDir = path.join(chapterDir(n), 'images');
const outDir = path.join(ROOT, 'output', slug);
fs.mkdirSync(outDir, { recursive: true });

// ---- 1. Render HTML ---------------------------------------------------------
const ctx = {
  images: Object.fromEntries((ch.images || []).map((i) => [i.id, i])),
  missing: new Set(),
  imageExists: (file) => fs.existsSync(path.join(imgDir, file)),
  imageUrl: (file) => path.relative(outDir, path.join(imgDir, file)).split(path.sep).join('/'),
  readSvg: (file) => fs.readFileSync(path.join(imgDir, file), 'utf8').replace(/<\?xml[^>]*\?>/, ''),
};
const html = documentHtml(ch, book, ctx, {
  draft,
  startPage: ch.startPage || 1,
  cssHref: path.relative(outDir, path.join(ROOT, 'styles', 'book.css')).split(path.sep).join('/'),
  paginateSrc: path.relative(outDir, path.join(ROOT, 'templates', 'paginate.js')).split(path.sep).join('/'),
});
const htmlFile = path.join(outDir, `${slug}.html`);
fs.writeFileSync(htmlFile, html);

if (ctx.missing.size && !draft) {
  console.error(`\n✖ ${ctx.missing.size} illustration(s) have not been generated:\n` +
    [...ctx.missing].map((f) => `    chapters/${slug}/images/${f}`).join('\n') +
    `\n\n  Run  npm run images -- ${n}  (needs an image-generation API key — see README),` +
    `\n  or build a proof with placeholders:  npm run build -- ${n} --draft\n`);
  process.exit(1);
}

// ---- 2. Paginate in Chromium and run quality control ------------------------
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.goto(pathToFileURL(htmlFile).href);
  await page.waitForFunction('window.__paginated === true', null, { timeout: 60_000 });

  const qa = await runQa(page);
  fs.writeFileSync(path.join(outDir, 'qa-report.json'), JSON.stringify({ chapter: n, draft, ...qa }, null, 2));

  console.log(`\nChapter ${n}: ${ch.title} — ${qa.stats.pages} pages, smallest text ${qa.stats.smallestTextPt}pt`);
  if (qa.stats.placeholders) console.log(`  ! ${qa.stats.placeholders} illustration placeholder(s) — DRAFT, not for distribution`);
  qa.warnings.forEach((w) => console.log(`  ! ${w}`));
  qa.errors.forEach((e) => console.log(`  ✖ ${e}`));
  if (qa.errors.length) {
    console.error(`\n✖ Quality control found ${qa.errors.length} error(s). PDF not exported. Fix them and rebuild.\n`);
    process.exitCode = 1;
  } else {
    // ---- 3. Export a real, text-based PDF -----------------------------------
    const pdfFile = path.join(outDir, `${slug}${draft ? '-DRAFT' : ''}.pdf`);
    await page.pdf({ path: pdfFile, width: '210mm', height: '297mm', printBackground: true, preferCSSPageSize: true });
    console.log(`  ✔ Quality control passed\n  ✔ ${path.relative(ROOT, pdfFile)}`);

    if (flags.has('--preview')) {
      const prevDir = path.join(outDir, 'preview');
      fs.rmSync(prevDir, { recursive: true, force: true });
      fs.mkdirSync(prevDir, { recursive: true });
      const pages = await page.locator('#book > .page').all();
      for (let i = 0; i < pages.length; i++) {
        await pages[i].screenshot({ path: path.join(prevDir, `page-${String(i + 1).padStart(2, '0')}.png`) });
      }
      console.log(`  ✔ ${pages.length} preview images in ${path.relative(ROOT, prevDir)}/ (for inspection only)`);
    }
  }
} finally {
  await browser.close();
}
