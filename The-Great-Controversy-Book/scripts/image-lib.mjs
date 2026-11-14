// Shared logic for the illustration pipeline: manifests, prompts, file validation, reports.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, chapterSlug, readJson } from './lib.mjs';

// ---- Targets ------------------------------------------------------------------------------
// A target is either a chapter number (1–42) or the word "characters" (recurring character references).
export function resolveTarget(arg) {
  if (arg === 'characters') {
    return {
      key: 'characters', label: 'Character references',
      manifestFile: path.join(ROOT, 'art-direction', 'characters.json'),
      approvedDir: path.join(ROOT, 'assets', 'images', 'characters'),
      candidatesDir: path.join(ROOT, 'art-direction', 'candidates'),
      outDir: path.join(ROOT, 'output', 'characters'),
    };
  }
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1 || n > 42) {
    throw new Error(`"${arg}" is not a target. Use a chapter number (1–42) or "characters".`);
  }
  const slug = chapterSlug(n);
  return {
    key: slug, chapter: n, label: `Chapter ${n}`,
    manifestFile: path.join(ROOT, 'chapters', slug, 'image-manifest.json'),
    approvedDir: path.join(ROOT, 'assets', 'images', slug),
    candidatesDir: path.join(ROOT, 'chapters', slug, 'images', 'candidates'),
    outDir: path.join(ROOT, 'output', slug),
  };
}

export function loadManifest(target) {
  if (!fs.existsSync(target.manifestFile)) {
    throw new Error(`No image manifest for ${target.label}. Expected ${path.relative(ROOT, target.manifestFile)}`);
  }
  return readJson(target.manifestFile);
}

export function saveManifest(target, manifest) {
  fs.writeFileSync(target.manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}

export function findImage(manifest, id) {
  const img = manifest.images.find((i) => i.id === id);
  if (!img) throw new Error(`No image "${id}" in this manifest. IDs: ${manifest.images.map((i) => i.id).join(', ')}`);
  return img;
}

export const approvedPath = (target, img) => path.join(target.approvedDir, img.outputFilename);
export const isApproved = (target, img) => img.approvalStatus === 'approved' && fs.existsSync(approvedPath(target, img));

export function logHistory(img, action, detail) {
  img.history.push({ at: new Date().toISOString(), action, ...(detail ? { detail } : {}) });
}

export const parseRatio = (r) => {
  const [w, h] = String(r).split(':').map(Number);
  if (!w || !h) throw new Error(`Bad aspect ratio "${r}" (expected e.g. 16:9)`);
  return w / h;
};

// ---- Prompt builder -----------------------------------------------------------------------
export function loadArtDirection() {
  return {
    style: readJson(path.join(ROOT, 'art-direction', 'style-guide.json')),
    characters: readJson(path.join(ROOT, 'art-direction', 'characters.json')),
  };
}

/** Builds the exact text to submit, plus the approved reference images that must be attached. */
export function buildPrompt(img, art = loadArtDirection()) {
  const { style, characters } = art;
  const charTarget = resolveTarget('characters');
  const lines = [];
  const references = [];
  const missingReferences = [];

  lines.push(img.visualStyle && img.visualStyle !== 'house' ? img.visualStyle : style.style);
  lines.push(`SCENE: ${img.sceneDescription}`);
  lines.push(`PERIOD: ${img.historicalPeriod}`);

  if (img.mainCharacters?.length) {
    const people = img.mainCharacters.map((c) => {
      const ref = c.characterRef && characters.characters[c.characterRef];
      if (!ref) return `${c.name} — ${c.description}`;
      // A character's own reference sheet is generated from the written description alone.
      if (img.character !== c.characterRef) {
        for (const refId of ref.referenceImages) {
          const refImg = characters.images.find((i) => i.id === refId);
          if (refImg && isApproved(charTarget, refImg)) references.push({ character: ref.name, id: refId, file: approvedPath(charTarget, refImg) });
          else missingReferences.push(refId);
        }
      }
      const own = img.character === c.characterRef;
      return `${ref.name} — ${c.description}. Appearance${own ? '' : ' (keep identical to the attached reference images)'}: ${ref.age}; ${ref.face}; hair: ${ref.hair}; build: ${ref.build}; clothing: ${ref.clothing}. ${ref.notes}`;
    });
    lines.push(`CHARACTERS: ${people.join(' | ')}`);
  }

  lines.push(`ENVIRONMENT: ${img.environment}`);
  lines.push(`CAMERA: ${img.cameraAngle}`);
  lines.push(`LIGHTING: ${style.lightingPresets[img.lighting] || img.lighting}`);
  const notes = (img.historicalNotes || []).map((k) => style.historicalNotes[k]).filter(Boolean);
  if (notes.length) lines.push(`HISTORICAL ACCURACY: ${notes.join(' ')}`);
  lines.push(`REQUIREMENTS: ${style.mustHave.join('; ')}.`);
  lines.push(`AVOID: ${style.avoid.join('; ')}.`);
  if (img.allow?.length) lines.push(`EXCEPTIONS FOR THIS SCENE: ${img.allow.join('; ')}.`);
  if (img.promptNotes?.length) lines.push(`REVISIONS: ${img.promptNotes.join(' ')}`);

  return {
    prompt: lines.join('\n\n'),
    aspectRatio: img.aspectRatio || style.defaults.aspectRatio,
    variations: style.defaults.variations,
    references,
    missingReferences,
  };
}

// ---- Image file validation ------------------------------------------------------------------
/** Reads format and pixel size straight from the file header (PNG, JPEG, WebP). */
export function probeImage(file) {
  const buf = fs.readFileSync(file);
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { format: 'jpeg', width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5), bytes: buf.length };
      }
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
      o += 2 + buf.readUInt16BE(o + 2);
    }
    throw new Error('JPEG has no size header (file is damaged or incomplete)');
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), bytes: buf.length };
    if (kind === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, bytes: buf.length };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, bytes: buf.length };
    }
  }
  throw new Error('Not a PNG, JPEG or WebP image');
}

export const fileHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Returns { info, errors, warnings } for a candidate file against its manifest entry. */
export function validateImage(file, img, style) {
  const errors = [];
  const warnings = [];
  let info = null;
  try { info = probeImage(file); } catch (e) { return { info, errors: [e.message], warnings }; }
  if (info.bytes < 30_000) errors.push(`file is only ${info.bytes} bytes — probably a thumbnail or a failed download`);
  const long = Math.max(info.width, info.height);
  if (long < style.defaults.minWidthPx) errors.push(`${info.width}×${info.height}px is too small (need at least ${style.defaults.minWidthPx}px on the long side)`);
  else if (long < style.defaults.printWidthPx) warnings.push(`${info.width}×${info.height}px prints below 300 dpi at full width — download the upscaled (2K or larger) version if Flow offers one`);
  const want = parseRatio(img.aspectRatio);
  const got = info.width / info.height;
  if (Math.abs(got / want - 1) > 0.03) warnings.push(`aspect ratio is ${got.toFixed(2)}:1 but the page frame is ${img.aspectRatio} — the picture will be cropped to fit`);
  return { info, errors, warnings };
}

// ---- Report -----------------------------------------------------------------------------------
export function buildReport(target, manifest) {
  const rows = manifest.images.map((img) => {
    const approvedFileMissing = img.approvalStatus === 'approved' && !fs.existsSync(approvedPath(target, img));
    const missingCandidates = img.candidates.filter((c) => !fs.existsSync(path.join(ROOT, c.file))).map((c) => c.file);
    const current = img.candidates.filter((c) => c.round === img.round);
    return {
      id: img.id, title: img.title, file: img.outputFilename, intendedPage: img.intendedPage,
      generationStatus: img.generationStatus, approvalStatus: img.approvalStatus,
      round: img.round, candidates: current.length,
      approvedFileMissing, missingCandidates,
    };
  });
  const count = (fn) => rows.filter(fn).length;
  return {
    target: target.key, generatedAt: new Date().toISOString(), paused: !!manifest.production?.paused,
    totals: {
      required: rows.length,
      generated: count((r) => r.generationStatus === 'generated' || r.approvalStatus === 'approved'),
      approved: count((r) => r.approvalStatus === 'approved' && !r.approvedFileMissing),
      pending: count((r) => r.approvalStatus === 'pending'),
      rejected: count((r) => r.approvalStatus === 'rejected'),
      missingFiles: count((r) => r.approvedFileMissing) + rows.reduce((n, r) => n + r.missingCandidates.length, 0),
      failedGenerations: count((r) => r.generationStatus === 'failed'),
    },
    images: rows,
  };
}

export function reportMarkdown(rep) {
  const t = rep.totals;
  return `# Image report — ${rep.target}

Generated ${rep.generatedAt}${rep.paused ? ' · **PRODUCTION PAUSED**' : ''}

| Measure | Count |
| --- | --- |
| Total images required | ${t.required} |
| Images generated | ${t.generated} |
| Images approved | ${t.approved} |
| Images pending | ${t.pending} |
| Images rejected | ${t.rejected} |
| Missing files | ${t.missingFiles} |
| Failed generations | ${t.failedGenerations} |

| # | ID | Output file | Page | Generation | Approval | Round | Candidates |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rep.images.map((r, i) => `| ${i + 1} | ${r.id} | ${r.file}${r.approvedFileMissing ? ' **(FILE MISSING)**' : ''} | ${r.intendedPage} | ${r.generationStatus} | ${r.approvalStatus} | ${r.round} | ${r.candidates} |`).join('\n')}
`;
}
