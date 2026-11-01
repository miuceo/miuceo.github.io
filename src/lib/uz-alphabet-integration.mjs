/**
 * Astro integration: after the site is built, rewrite the Uzbek pages
 * (dist/uz/**) and the Uzbek RSS feed into the revised Uzbek alphabet.
 *
 * Source files keep today's spelling. English and Russian pages are never read.
 * Only the exact text spans that change are replaced, so the rest of every
 * page stays byte-for-byte identical.
 *
 * Switch:
 *   UZ_NEW_ALPHABET=1   force on  (use for testing: `UZ_NEW_ALPHABET=1 npm run build`)
 *   UZ_NEW_ALPHABET=0   force off
 *   unset               on from 2027-04-22 (the law's effective date). The
 *                       site only rebuilds when something is pushed or the
 *                       workflow is run by hand, so trigger a deploy that day.
 *
 * Config: src/lib/uz-alphabet.config.json  { "protectedWords": [], "exceptions": {} }
 *
 * Needs `rehype-parse` and `unified` (already installed as Astro dependencies;
 * list them in devDependencies so an update cannot silently remove them).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import { visit, SKIP } from 'unist-util-visit';
import { latinToNew } from './uz-alphabet.mjs';

const SWITCH_DATE = Date.parse('2027-04-22T00:00:00+05:00');
const SKIP_TAGS = new Set(['script', 'style', 'pre', 'code', 'kbd', 'samp', 'textarea', 'noscript', 'svg']);
const LD_KEYS = new Set(['headline', 'alternativeHeadline', 'description']);

export function isEnabled(env = process.env, now = Date.now()) {
  if (env.UZ_NEW_ALPHABET === '1') return true;
  if (env.UZ_NEW_ALPHABET === '0') return false;
  return now >= SWITCH_DATE;
}

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const START_TAG =
  /^<[a-zA-Z][\w-]*(?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/;

// hast property name -> HTML attribute name
const ATTRS = [
  ['alt', 'alt'],
  ['title', 'title'],
  ['ariaLabel', 'aria-label'],
  ['placeholder', 'placeholder'],
];
const META_NAMES = new Set(['description', 'twitter:title', 'twitter:description']);
const META_PROPS = new Set(['og:title', 'og:description']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Convert one HTML document. Returns the new source (identical if nothing changed). */
export function convertHtml(source, opts = {}) {
  const tree = unified().use(rehypeParse).parse(source);
  const edits = [];

  visit(tree, 'element', (node) => {
    if (SKIP_TAGS.has(node.tagName)) {
      // JSON-LD is the one script worth converting (headline, description).
      if (node.tagName === 'script' && String(node.properties?.type) === 'application/ld+json') {
        const text = node.children?.[0];
        if (text?.type === 'text' && text.position) {
          try {
            const data = JSON.parse(text.value);
            let changed = false;
            const fix = (v) => {
              if (Array.isArray(v)) v.forEach(fix);
              else if (v && typeof v === 'object') {
                for (const [k, val] of Object.entries(v)) {
                  if (LD_KEYS.has(k) && typeof val === 'string') {
                    const out = latinToNew(val, opts);
                    if (out !== val) { v[k] = out; changed = true; }
                  } else fix(val);
                }
              }
            };
            fix(data);
            if (changed) {
              edits.push({
                start: text.position.start.offset,
                end: text.position.end.offset,
                text: JSON.stringify(data).replace(/</g, '\\u003c'),
              });
            }
          } catch { /* not valid JSON: leave it */ }
        }
      }
      return SKIP;
    }

    if (!node.position) return;
    const wanted = [];
    for (const [prop, attr] of ATTRS) {
      if (typeof node.properties?.[prop] === 'string') wanted.push([prop, attr]);
    }
    if (
      node.tagName === 'meta' &&
      typeof node.properties?.content === 'string' &&
      (META_NAMES.has(String(node.properties.name)) || META_PROPS.has(String(node.properties.property)))
    ) {
      wanted.push(['content', 'content']);
    }
    if (!wanted.length) return;

    const startOffset = node.position.start.offset;
    const tag = source.slice(startOffset).match(START_TAG)?.[0];
    if (!tag) return;
    for (const [prop, attr] of wanted) {
      const before = node.properties[prop];
      const after = latinToNew(before, opts);
      if (after === before) continue;
      const m = tag.match(new RegExp(`(\\s${attr}\\s*=\\s*)("([^"]*)"|'([^']*)')`));
      if (!m) continue;
      const valueStart = startOffset + m.index + m[1].length;
      edits.push({ start: valueStart, end: valueStart + m[2].length, text: `"${escAttr(after)}"` });
    }
  });

  visit(tree, 'text', (node, _i, parent) => {
    if (!node.position) return;
    // A text node inside a skipped element never reaches here for scripts/code
    // because visit() cannot see that, so check the ancestors by tag.
    if (parent && SKIP_TAGS.has(parent.tagName)) return;
    const after = latinToNew(node.value, opts);
    if (after !== node.value) {
      edits.push({ start: node.position.start.offset, end: node.position.end.offset, text: escText(after) });
    }
  });

  // Text nodes inside skipped elements: drop edits that fall within them.
  const skipRanges = [];
  visit(tree, 'element', (node) => {
    if (SKIP_TAGS.has(node.tagName) && node.position) {
      skipRanges.push([node.position.start.offset, node.position.end.offset]);
    }
  });
  const kept = edits.filter(
    (e) =>
      e.text.startsWith('{') || // the JSON-LD edit lives inside a <script> on purpose
      !skipRanges.some(([a, b]) => e.start >= a && e.end <= b)
  );

  kept.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of kept) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/**
 * Every visible word in an HTML page that the conversion would change, as
 * [before, after] pairs. Used by `node scripts/convert-uz.mjs --built dist`
 * so the review list covers exactly what the built site shows (tags, cards,
 * page titles), not just what the source files contain.
 */
export function changedWords(source, opts = {}) {
  const tree = unified().use(rehypeParse).parse(source);
  const pairs = [];
  visit(tree, (node) => {
    if (node.type === 'element' && SKIP_TAGS.has(node.tagName)) return SKIP;
    if (node.type !== 'text') return;
    for (const word of node.value.match(/[\p{L}\p{M}'‘’ʻʼ`´]+/gu) ?? []) {
      const after = latinToNew(word, opts);
      if (after !== word) pairs.push([word, after]);
    }
  });
  return pairs;
}

const decodeXml = (s) =>
  s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encodeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');

/** Convert the text of <title> and <description> in an RSS feed. */
export function convertRss(xml, opts = {}) {
  return xml.replace(/<(title|description)>([^<]*)<\/\1>/g, (whole, tag, inner) => {
    const before = decodeXml(inner);
    const after = latinToNew(before, opts);
    return after === before ? whole : `<${tag}>${encodeXml(after)}</${tag}>`;
  });
}

export default function uzAlphabet() {
  return {
    name: 'uz-new-alphabet',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (!isEnabled()) {
          logger.info('Uzbek new alphabet: off (set UZ_NEW_ALPHABET=1 to test; switches on 2027-04-22)');
          return;
        }
        const root = fileURLToPath(dir);
        const configPath = fileURLToPath(new URL('./uz-alphabet.config.json', import.meta.url));
        const opts = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
        let pages = 0;
        let changed = 0;

        const uzDir = path.join(root, 'uz');
        if (fs.existsSync(uzDir)) {
          for (const file of walk(uzDir)) {
            if (file.endsWith('.html')) {
              const before = fs.readFileSync(file, 'utf8');
              const after = convertHtml(before, opts);
              pages++;
              if (after !== before) { fs.writeFileSync(file, after); changed++; }
            } else if (file.endsWith('rss.xml') || file.endsWith(`rss.xml${path.sep}index.html`)) {
              /* handled below */
            }
          }
        }
        for (const feed of [path.join(uzDir, 'rss.xml'), path.join(root, 'rss.xml')]) {
          if (fs.existsSync(feed) && fs.statSync(feed).isFile()) {
            const before = fs.readFileSync(feed, 'utf8');
            const after = convertRss(before, opts);
            if (after !== before) { fs.writeFileSync(feed, after); changed++; }
          }
        }
        logger.info(`Uzbek new alphabet: ${changed} files rewritten (${pages} Uzbek pages scanned)`);
      },
    },
  };
}
