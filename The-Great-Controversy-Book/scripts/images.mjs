#!/usr/bin/env node
// Illustration production workflow. Nothing here talks to Google Flow or spends credits:
// these commands plan, gate, record and verify the work that is done in Flow (by you, or by
// Claude driving your own signed-in browser). See docs/FLOW-WORKFLOW.md.
//
//   <target> is a chapter number (1–42) or "characters".
//
//   status  <target>                      progress report (also written to output/<target>/image-report.*)
//   next    <target>                      what needs doing now, in book order
//   prompt  <target> <id>                 show the exact prompt and reference images for one picture
//   submit  <target> <id> --confirmed     record your go-ahead to spend credits on this picture
//           [--batch]                       …without waiting for earlier pictures to be approved
//   ingest  <target> <id> <files…>        validate downloaded variations and file them as candidates
//   review  <target> [id]                 build a side-by-side review sheet of the candidates
//   approve <target> <id> <variation>     approve one variation; it is copied into assets/images and the PDF rebuilt
//           [--no-build]
//   approve-batch <target> [--variation N]  approve variation N (default 1) of every picture awaiting review
//   reject  <target> <id> [variation|all] --reason "…"
//   edit    <target> <id> <field> "<value>"   change a prompt field (sceneDescription, lighting, cameraAngle, …)
//   note    <target> <id> "<text>"            add a revision note to the prompt
//   regenerate <target> <id>              start a new round for this picture (needs a new `submit --confirmed`)
//   fail    <target> <id> --reason "…"    record a failed generation
//   pause   <target>  /  resume <target>  stop or continue production
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib.mjs';
import {
  resolveTarget, loadManifest, saveManifest, findImage, approvedPath, isApproved, logHistory,
  loadArtDirection, buildPrompt, validateImage, probeImage, fileHash, buildReport, reportMarkdown,
} from './image-lib.mjs';

const argv = process.argv.slice(2);
const opts = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--reason' || a === '--variation') opts[a.slice(2)] = argv[++i];
  else if (a.startsWith('--')) opts[a.slice(2)] = true;
  else pos.push(a);
}
const [cmd, targetArg, id, ...rest] = pos;
const rel = (p) => path.relative(ROOT, p);
const die = (msg, code = 1) => { console.error(`\n✖ ${msg}\n`); process.exit(code); };

if (!cmd || cmd === 'help' || !targetArg) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 24).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(cmd ? 1 : 0);
}

let target; let manifest;
try { target = resolveTarget(targetArg); manifest = loadManifest(target); } catch (e) { die(e.message); }
const art = loadArtDirection();
const save = () => saveManifest(target, manifest);
const need = (v, what) => { if (!v) die(`Missing ${what}. Run "node scripts/images.mjs help".`); return v; };
const currentCandidates = (img) => img.candidates.filter((c) => c.round === img.round);

function pickCandidate(img, label) {
  const want = /^r\d+-v\d+$/.test(String(label)) ? label : `r${img.round}-v${Number(label)}`;
  const c = img.candidates.find((x) => x.variant === want);
  if (!c) die(`No variation "${label}" for ${img.id}. Available: ${currentCandidates(img).map((x) => x.variant).join(', ') || 'none'}`);
  return c;
}

function showPrompt(img) {
  const p = buildPrompt(img, art);
  console.log(`\n── ${img.id} · ${img.title} ${'─'.repeat(Math.max(4, 60 - img.id.length - img.title.length))}`);
  console.log(`Platform:      ${manifest.platform}`);
  console.log(`Aspect ratio:  ${p.aspectRatio}`);
  console.log(`Variations:    ${p.variations} (or more, if Flow offers them)`);
  console.log(`Saves as:      ${rel(approvedPath(target, img))}`);
  console.log(`Page:          ${img.intendedPage}`);
  if (p.references.length) {
    console.log('Attach these approved reference images:');
    p.references.forEach((r) => console.log(`   • ${r.character}: ${rel(r.file)}`));
  }
  if (p.missingReferences.length) console.log(`! Character references not approved yet: ${p.missingReferences.join(', ')}`);
  console.log(`\nPROMPT\n${'-'.repeat(72)}\n${p.prompt}\n${'-'.repeat(72)}`);
  return p;
}

/** The first picture, in book order, that is not yet approved. */
const firstOpen = () => manifest.images.find((i) => !isApproved(target, i));

function writeReport() {
  const rep = buildReport(target, manifest);
  fs.mkdirSync(target.outDir, { recursive: true });
  fs.writeFileSync(path.join(target.outDir, 'image-report.json'), JSON.stringify(rep, null, 2) + '\n');
  fs.writeFileSync(path.join(target.outDir, 'image-report.md'), reportMarkdown(rep));
  return rep;
}

function rebuildChapter() {
  if (!target.chapter) return;
  const allApproved = manifest.images.every((i) => isApproved(target, i));
  const args = [path.join(ROOT, 'scripts', 'build.mjs'), String(target.chapter), ...(allApproved ? [] : ['--draft'])];
  console.log(`\nRebuilding ${target.label} ${allApproved ? '(final — every illustration is approved)' : '(draft — some illustrations are still pending)'}…`);
  spawnSync(process.execPath, args, { stdio: 'inherit' });
}

/** Re-encode to PNG with Chromium when the approved download is JPEG or WebP. */
async function copyAsPng(src, dest) {
  const info = probeImage(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (info.format === 'png' || !dest.toLowerCase().endsWith('.png')) { fs.copyFileSync(src, dest); return; }
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(src).href);
    const b64 = await page.evaluate(async () => {
      const img = document.images[0];
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
  } finally { await browser.close(); }
}

async function approve(img, cand, { build = true } = {}) {
  const src = path.join(ROOT, cand.file);
  if (!fs.existsSync(src)) die(`Candidate file is missing: ${cand.file}`);
  const check = validateImage(src, img, art.style);
  if (check.errors.length) die(`Cannot approve ${cand.variant}: ${check.errors.join('; ')}`);
  const dest = approvedPath(target, img);
  await copyAsPng(src, dest);
  const out = probeImage(dest);
  if (out.width !== cand.width || out.height !== cand.height) die(`Saved file ${rel(dest)} does not match the approved variation — not approved.`);
  img.candidates.forEach((c) => { if (c.status === 'approved') c.status = 'candidate'; });
  cand.status = 'approved';
  img.approvalStatus = 'approved';
  img.approvedVariant = cand.variant;
  logHistory(img, 'approved', `${cand.variant} → ${rel(dest)}`);
  save();
  console.log(`✔ ${img.id}: approved ${cand.variant}, saved ${rel(dest)} (${out.width}×${out.height})`);
  if (build) rebuildChapter();
}

const commands = {
  status() {
    const rep = writeReport();
    const t = rep.totals;
    console.log(`\n${target.label} — illustrations${rep.paused ? '   [PRODUCTION PAUSED]' : ''}\n`);
    console.log(`  Required ${t.required} · Generated ${t.generated} · Approved ${t.approved} · Pending ${t.pending} · Rejected ${t.rejected} · Missing files ${t.missingFiles} · Failed ${t.failedGenerations}\n`);
    rep.images.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r.id.padEnd(24)} ${r.generationStatus.padEnd(12)} ${r.approvalStatus.padEnd(9)} round ${r.round}, ${r.candidates} candidate(s)${r.approvedFileMissing ? '  ✖ APPROVED FILE MISSING' : ''}`));
    console.log(`\n  Report: ${rel(path.join(target.outDir, 'image-report.md'))}\n`);
  },

  next() {
    if (manifest.production?.paused) return console.log(`\n${target.label} is paused. Run:  node scripts/images.mjs resume ${targetArg}\n`);
    const img = firstOpen();
    if (!img) return console.log(`\n✔ Every illustration for ${target.label} is approved.\n`);
    const cands = currentCandidates(img);
    console.log(`\nNext for ${target.label}: ${img.id} — ${img.title}`);
    if (img.generationStatus === 'generated' && img.approvalStatus === 'pending' && cands.length) {
      console.log(`  ${cands.length} variation(s) are waiting for your decision:`);
      console.log(`    node scripts/images.mjs review ${targetArg} ${img.id}`);
      console.log(`    node scripts/images.mjs approve ${targetArg} ${img.id} <variation>   |   reject … all --reason "…"`);
    } else if (img.generationStatus === 'submitted') {
      console.log('  Submitted to Flow. When the variations are downloaded:');
      console.log(`    node scripts/images.mjs ingest ${targetArg} ${img.id} <file1> <file2>`);
    } else {
      showPrompt(img);
      console.log(`\n  No credits have been spent. To authorise generation of this picture:`);
      console.log(`    node scripts/images.mjs submit ${targetArg} ${img.id} --confirmed\n`);
    }
  },

  prompt() { showPrompt(findImage(manifest, need(id, 'image id'))); },

  submit() {
    const img = findImage(manifest, need(id, 'image id'));
    if (manifest.production?.paused) die(`${target.label} is paused. Resume it first.`);
    const p = showPrompt(img);
    if (p.missingReferences.length) die(`This scene needs character references that are not approved yet (${p.missingReferences.join(', ')}). Produce them first:  node scripts/images.mjs next characters`);
    const open = firstOpen();
    if (open && open.id !== img.id && !opts.batch && !isApproved(target, img)) {
      die(`${open.id} comes first and is not approved yet. Finish it, or add --batch to work ahead.`);
    }
    if (!opts.confirmed) die('Not submitted and no credits spent. Generation needs your explicit go-ahead: repeat the command with --confirmed.', 3);
    if (img.generationStatus !== 'submitted') img.round += 1;
    img.generationStatus = 'submitted';
    if (img.approvalStatus !== 'approved') img.approvalStatus = 'pending';
    logHistory(img, 'submission-confirmed', `round ${img.round}`);
    save();
    console.log(`\n✔ Go-ahead recorded for ${img.id}, round ${img.round}. Submit the prompt above in Flow (${p.variations}+ variations, ${p.aspectRatio}), download the results, then:`);
    console.log(`    node scripts/images.mjs ingest ${targetArg} ${img.id} <file1> <file2>\n`);
  },

  ingest() {
    const img = findImage(manifest, need(id, 'image id'));
    if (!rest.length) die('Give the downloaded image files to ingest.');
    if (!['submitted', 'generated', 'failed'].includes(img.generationStatus)) {
      die(`${img.id} has no confirmed submission on record (status: ${img.generationStatus}). Run "submit … --confirmed" first.`);
    }
    const dir = path.join(target.candidatesDir, img.id);
    fs.mkdirSync(dir, { recursive: true });
    const known = new Set(img.candidates.map((c) => c.sha256));
    let n = currentCandidates(img).length;
    let added = 0;
    for (const f of rest) {
      const src = path.resolve(f);
      if (!fs.existsSync(src)) { console.log(`  ✖ ${f}: file not found`); continue; }
      const check = validateImage(src, img, art.style);
      if (check.errors.length) { console.log(`  ✖ ${f}: ${check.errors.join('; ')}`); continue; }
      const sha256 = fileHash(src);
      if (known.has(sha256)) { console.log(`  = ${f}: already ingested, skipped`); continue; }
      known.add(sha256);
      n += 1;
      const variant = `r${img.round}-v${n}`;
      const dest = path.join(dir, `${variant}.${check.info.format === 'jpeg' ? 'jpg' : check.info.format}`);
      fs.copyFileSync(src, dest);
      img.candidates.push({ variant, round: img.round, file: rel(dest), width: check.info.width, height: check.info.height, format: check.info.format, sha256, status: 'candidate' });
      added += 1;
      console.log(`  ✔ ${variant}: ${check.info.width}×${check.info.height} ${check.info.format}`);
      check.warnings.forEach((w) => console.log(`      ! ${w}`));
    }
    if (!added) die('No valid new image was ingested.');
    img.generationStatus = 'generated';
    img.approvalStatus = 'pending';
    logHistory(img, 'ingested', `${added} variation(s), round ${img.round}`);
    save();
    if (currentCandidates(img).length < art.style.defaults.variations) console.log(`  ! Only ${currentCandidates(img).length} variation in this round — the plan asks for at least ${art.style.defaults.variations}.`);
    console.log(`\nReview them:  node scripts/images.mjs review ${targetArg} ${img.id}\n`);
  },

  async review() {
    const imgs = id ? [findImage(manifest, id)] : manifest.images.filter((i) => currentCandidates(i).length && i.approvalStatus !== 'approved');
    if (!imgs.length) return console.log('\nNothing is waiting for review.\n');
    const dir = path.join(target.outDir, 'review');
    fs.mkdirSync(dir, { recursive: true });
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const { chromium } = createRequire(import.meta.url)('playwright');
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    try {
      for (const img of imgs) {
        const cands = currentCandidates(img);
        const html = `<!doctype html><meta charset="utf-8"><title>Review — ${esc(img.id)}</title>
<style>body{font:18px/1.45 system-ui,sans-serif;background:#f4ecdd;color:#241a14;margin:28px}h1{color:#7a1f2b;margin:0 0 4px}
.grid{display:grid;grid-template-columns:repeat(${Math.min(2, Math.max(1, cands.length))},1fr);gap:20px;margin:18px 0}
figure{margin:0;background:#fff;border:2px solid #c7a55b;padding:10px}img{width:100%;display:block}
figcaption{font-weight:700;margin-top:8px;color:#7a1f2b;font-size:22px}small{font-weight:400;color:#241a14}
pre{white-space:pre-wrap;background:#efe2cc;padding:14px;font:14px/1.4 ui-monospace,monospace}</style>
<h1>${esc(img.title)}</h1><div>${esc(img.id)} · round ${img.round} · ${esc(img.intendedPage)} · saves as ${esc(img.outputFilename)}</div>
<div class="grid">${cands.map((c) => `<figure><img src="${pathToFileURL(path.join(ROOT, c.file)).href}"><figcaption>Variation ${c.variant.split('-v')[1]} <small>(${c.variant} · ${c.width}×${c.height} · ${c.status})</small></figcaption></figure>`).join('') || '<p>No candidates in this round yet.</p>'}</div>
<pre>${esc(buildPrompt(img, art).prompt)}</pre>`;
        const file = path.join(dir, `${img.id}.html`);
        fs.writeFileSync(file, html);
        const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
        await page.goto(pathToFileURL(file).href);
        await page.screenshot({ path: path.join(dir, `${img.id}.png`), fullPage: true });
        await page.close();
        console.log(`  ✔ ${rel(file)}  (+ .png)   — ${cands.length} variation(s)`);
      }
    } finally { await browser.close(); }
    console.log(`\nDecide:  approve ${targetArg} <id> <variation>   |   reject ${targetArg} <id> all --reason "…"   |   regenerate ${targetArg} <id>\n`);
  },

  async approve() {
    const img = findImage(manifest, need(id, 'image id'));
    await approve(img, pickCandidate(img, need(rest[0], 'variation number')), { build: !opts['no-build'] });
    writeReport();
  },

  async 'approve-batch'() {
    const v = Number(opts.variation || 1);
    const waiting = manifest.images.filter((i) => i.approvalStatus === 'pending' && currentCandidates(i).length);
    if (!waiting.length) return console.log('\nNothing is waiting for approval.\n');
    for (const img of waiting) await approve(img, pickCandidate(img, v), { build: false });
    rebuildChapter();
    writeReport();
  },

  reject() {
    const img = findImage(manifest, need(id, 'image id'));
    const which = rest[0] || 'all';
    const list = which === 'all' ? currentCandidates(img) : [pickCandidate(img, which)];
    list.forEach((c) => { c.status = 'rejected'; if (opts.reason) c.reason = opts.reason; });
    if (currentCandidates(img).every((c) => c.status === 'rejected')) {
      img.approvalStatus = 'rejected';
      delete img.approvedVariant;
    }
    logHistory(img, 'rejected', `${list.map((c) => c.variant).join(', ') || 'no candidates'}${opts.reason ? ` — ${opts.reason}` : ''}`);
    save(); writeReport();
    console.log(`✔ ${img.id}: rejected ${list.length} variation(s). Approval status: ${img.approvalStatus}.`);
    if (img.approvalStatus === 'rejected') console.log(`  Revise with "edit" or "note", then:  node scripts/images.mjs regenerate ${targetArg} ${img.id}`);
  },

  edit() {
    const img = findImage(manifest, need(id, 'image id'));
    const [field, ...value] = rest;
    const editable = ['title', 'sceneDescription', 'historicalPeriod', 'environment', 'visualStyle', 'cameraAngle', 'lighting', 'aspectRatio', 'alt'];
    if (!editable.includes(field)) die(`Editable fields: ${editable.join(', ')}`);
    if (!value.length) die('Give the new value in quotes.');
    logHistory(img, 'edited', `${field}: "${img[field]}" → "${value.join(' ')}"`);
    img[field] = value.join(' ');
    save();
    showPrompt(img);
  },

  note() {
    const img = findImage(manifest, need(id, 'image id'));
    if (!rest.length) die('Give the revision note in quotes.');
    img.promptNotes.push(rest.join(' '));
    logHistory(img, 'note-added', rest.join(' '));
    save();
    showPrompt(img);
  },

  regenerate() {
    const img = findImage(manifest, need(id, 'image id'));
    img.generationStatus = 'not-started';
    img.approvalStatus = 'pending';
    delete img.approvedVariant;
    logHistory(img, 'regeneration-requested', `after round ${img.round}`);
    save(); writeReport();
    console.log(`✔ ${img.id}: ready for a new round. Nothing is submitted until you run:\n    node scripts/images.mjs submit ${targetArg} ${img.id} --confirmed`);
    if (target.chapter) console.log('  Until a new variation is approved the page shows a placeholder again.');
  },

  fail() {
    const img = findImage(manifest, need(id, 'image id'));
    img.generationStatus = 'failed';
    logHistory(img, 'generation-failed', opts.reason || 'no reason given');
    save(); writeReport();
    console.log(`✔ ${img.id}: recorded as a failed generation.`);
  },

  pause() {
    manifest.production = { paused: true, pausedAt: new Date().toISOString() };
    save(); writeReport();
    console.log(`✔ ${target.label}: production paused. No submissions are accepted until you resume.`);
  },

  resume() {
    manifest.production = { paused: false };
    save(); writeReport();
    console.log(`✔ ${target.label}: production resumed.`);
    commands.next();
  },
};

if (!commands[cmd]) die(`Unknown command "${cmd}". Run "node scripts/images.mjs help".`);
await commands[cmd]();
