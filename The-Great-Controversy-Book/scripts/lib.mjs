// Shared helpers for the build scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const chapterSlug = (n) => `chapter-${String(n).padStart(2, '0')}`;
export const chapterDir = (n) => path.join(ROOT, 'chapters', chapterSlug(n));

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadBook() {
  return readJson(path.join(ROOT, 'book.json'));
}

export function loadChapter(n) {
  const file = path.join(chapterDir(n), 'content.json');
  if (!fs.existsSync(file)) {
    throw new Error(`No content found for chapter ${n}. Expected ${path.relative(ROOT, file)}`);
  }
  return readJson(file);
}

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const chapter = Number(positional[0]);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 42) {
    throw new Error('Give a chapter number from 1 to 42, e.g.  node scripts/build.mjs 1');
  }
  return { chapter, flags };
}
