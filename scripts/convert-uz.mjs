#!/usr/bin/env node
/**
 * Preview or apply the Uzbek new-alphabet conversion.
 *
 *   node scripts/convert-uz.mjs --built dist    # BEST: report from the built site (run `npm run build` first)
 *   node scripts/convert-uz.mjs                 # report from the source files (misses tags and page chrome)
 *   node scripts/convert-uz.mjs --write FILE... # rewrite uz.md / uz.json files in place
 *
 * Run it from the repo root. With no FILE arguments it finds the Uzbek sources:
 * src/i18n/uz.json, src/content/posts/<slug>/uz.md, the `uz:` lines of
 * src/content/projects/*.md and the title/description of src/content/artifacts/*.json.
 *
 * --write only supports whole-Uzbek files (uz.md, uz.json). Never run it on
 * posts-data/, posts/ or posts.json (they are machine-generated), and do not
 * use it before the switch date: the site converts at build time instead.
 *
 * Words the converter must leave alone, and words with a special spelling, go
 * in src/lib/uz-alphabet.config.json: { "protectedWords": [], "exceptions": {} }.
 */
import fs from 'node:fs';
import path from 'node:path';
import { changedWords } from '../src/lib/uz-alphabet-integration.mjs';
import {
  latinToNew,
  latinToNewContentFile,
  latinToNewDeep,
} from '../src/lib/uz-alphabet.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const builtIdx = args.indexOf('--built');
const builtDir = builtIdx >= 0 ? args[builtIdx + 1] : null;
const files = args.filter((a, i) => !a.startsWith('--') && i !== builtIdx + 1);

const configPath = path.resolve('src/lib/uz-alphabet.config.json');
const opts = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

const list = (dir, test) =>
  fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)).filter(test) : [];

function discover() {
  return [
    'src/i18n/uz.json',
    ...list('src/content/posts', (f) => /[\\/]uz\.md$/.test(f)),
    ...list('src/content/projects', (f) => f.endsWith('.md')),
    ...list('src/content/artifacts', (f) => f.endsWith('.json')),
  ].filter((f) => fs.existsSync(f));
}

/** The Uzbek strings inside a file, for the report. */
function uzStrings(file, source) {
  if (file.endsWith('uz.json')) {
    const out = [];
    (function walk(v) {
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(JSON.parse(source));
    return out;
  }
  if (/[\\/]uz\.md$/.test(file)) return [source];
  if (file.includes(`${path.sep}projects${path.sep}`)) {
    return [...source.matchAll(/^\s+uz:\s*"(.*)"\s*$/gm)].map((m) => m[1]);
  }
  if (file.includes(`${path.sep}artifacts${path.sep}`)) {
    const j = JSON.parse(source);
    return [j.title, j.description]
      .filter(Boolean)
      .map((v) => (typeof v === 'string' ? v : v.uz))
      .filter(Boolean);
  }
  return [];
}

function writeFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  let out;
  if (file.endsWith('uz.json')) out = JSON.stringify(latinToNewDeep(JSON.parse(source), opts), null, 2) + '\n';
  else if (/[\\/]uz\.md$/.test(file)) out = latinToNewContentFile(source, opts);
  else throw new Error(`--write supports only uz.md and uz.json files, not ${file}`);
  fs.writeFileSync(file, out);
  console.log(`rewrote ${file}`);
}

if (builtDir) {
  // Report from the built Uzbek pages. Build with UZ_NEW_ALPHABET=0 first so
  // the pages still hold today's spelling.
  const counts = new Map();
  const root = path.join(builtDir, 'uz');
  for (const f of list(root, (f) => f.endsWith('.html'))) {
    for (const [before, after] of changedWords(fs.readFileSync(f, 'utf8'), opts)) {
      const key = `${before}  ->  ${after}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  [...counts].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(String(n).padStart(4), k));
  console.log(`\n${counts.size} distinct words would change. Any English word or name in this list is a false positive: add it to protectedWords in src/lib/uz-alphabet.config.json, rebuild, and run this again.`);
} else if (write) {
  if (!files.length) throw new Error('--write needs explicit file paths');
  files.forEach(writeFile);
} else {
  const counts = new Map();
  for (const file of files.length ? files : discover()) {
    for (const text of uzStrings(file, fs.readFileSync(file, 'utf8'))) {
      for (const word of text.match(/[\p{L}\p{M}'‘’ʻʼ`´]+/gu) ?? []) {
        const after = latinToNew(word, opts);
        if (after !== word) {
          const key = `${word}  ->  ${after}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  rows.forEach(([k, n]) => console.log(String(n).padStart(4), k));
  console.log(`\n${rows.length} distinct words would change. Read the list: any English word or name is a false positive; add it to protectedWords.`);
}
