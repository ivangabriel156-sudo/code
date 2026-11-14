#!/usr/bin/env node
// Generate the illustrations listed in a chapter's content.json.
//
//   OPENAI_API_KEY=... node scripts/generate-images.mjs 1           generate missing images
//   OPENAI_API_KEY=... node scripts/generate-images.mjs 1 --force   regenerate everything
//   node scripts/generate-images.mjs 1 --list                       show prompts, generate nothing
//
// Every prompt is prefixed with the shared art direction in scripts/art-direction.json, which keeps
// the look consistent across all 42 chapters. This script never writes a file unless the image
// service actually returned an image.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, chapterSlug, chapterDir, loadChapter, readJson, parseArgs } from './lib.mjs';

const { chapter: n, flags } = parseArgs(process.argv.slice(2));
const ch = loadChapter(n);
const art = readJson(path.join(ROOT, 'scripts', 'art-direction.json'));
const imgDir = path.join(chapterDir(n), 'images');
const images = ch.images || [];
const fullPrompt = (img) => `${art.style}\n\nScene: ${img.prompt}\n\n${art.avoid}`;

if (flags.has('--list')) {
  for (const img of images) {
    const done = fs.existsSync(path.join(imgDir, img.file));
    console.log(`\n[${done ? 'done   ' : 'MISSING'}] ${img.file} (${img.aspect || 'landscape'})\n${fullPrompt(img)}`);
  }
  process.exit(0);
}

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error(`
✖ No image-generation service is configured, so no illustrations were created.

  To connect one, set an OpenAI API key that has access to image generation:

      export OPENAI_API_KEY="sk-..."
      npm run images -- ${n}

  Optional settings:
      IMAGE_MODEL    image model name (default: ${art.defaultModel})
      IMAGE_QUALITY  low | medium | high (default: high)

  To use a different provider, add it to scripts/generate-images.mjs (see generateOpenAI).
  You can also paint or commission the pictures yourself: save each one under
  chapters/${chapterSlug(n)}/images/ using the filenames shown by:  npm run images -- ${n} --list
`);
  process.exit(2);
}

const SIZES = { landscape: '1536x1024', portrait: '1024x1536', square: '1024x1024' };

async function generateOpenAI(prompt, aspect) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.IMAGE_MODEL || art.defaultModel,
      prompt,
      size: SIZES[aspect] || SIZES.landscape,
      quality: process.env.IMAGE_QUALITY || 'high',
      n: 1,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Image service returned ${res.status}: ${json?.error?.message || res.statusText}`);
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image service returned no image data');
  return Buffer.from(b64, 'base64');
}

fs.mkdirSync(imgDir, { recursive: true });
let made = 0;
let failed = 0;
for (const img of images) {
  const file = path.join(imgDir, img.file);
  if (fs.existsSync(file) && !flags.has('--force')) { console.log(`  = ${img.file} (exists, skipped)`); continue; }
  process.stdout.write(`  … ${img.file} `);
  try {
    fs.writeFileSync(file, await generateOpenAI(fullPrompt(img), img.aspect));
    made++;
    console.log('✔');
  } catch (err) {
    failed++;
    console.log(`✖ ${err.message}`);
  }
}
console.log(`\n${made} image(s) generated, ${failed} failed, ${images.length - made - failed} already present.`);
if (failed) process.exit(1);
