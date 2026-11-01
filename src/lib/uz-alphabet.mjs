/**
 * Uzbek Latin: current alphabet -> the revised alphabet (law signed 2026-10-21,
 * in force 2027-04-22).
 *
 *   sh -> ş     ch -> ç     oʻ -> ö     gʻ -> ğ
 *
 * "ng" stays as it is (it stops being a separate letter, spelling unchanged).
 * The tutuq sign (ma'no, she'r) stays; only the mark inside oʻ and gʻ goes.
 *
 * Plain JavaScript on purpose (like rehype-journal.mjs): Astro and Node can
 * both import it, and `node --test scripts/` runs its tests with no build step.
 *
 * Only call this on UZBEK text. English and Russian text must never pass
 * through it ("machine" would become "maçine").
 */

// Every character people type for the apostrophe in oʻ / gʻ / tutuq:
// ' (U+0027)  ‘ (2018)  ’ (2019)  ʻ (02BB)  ʼ (02BC)  ` (0060)  ´ (00B4)
const APOS = "'‘’ʻʼ`´";
const APOS_CLASS = `[${APOS}]`;

/**
 * Words and names that are NOT Uzbek and must stay exactly as written.
 * Lowercase. A token is kept untouched when it equals one of these, or is one
 * followed by an Uzbek suffix after an apostrophe (ChatGPT'da).
 * Extend this list whenever `node scripts/convert-uz.mjs --report` shows a
 * wrongly changed word.
 */
export const DEFAULT_PROTECTED = [];

/**
 * Uzbek words where s+h or c+h (or g/o + a real tutuq) are separate sounds, so
 * the usual rule is wrong. Maps lowercase current spelling -> lowercase new
 * spelling. Empty on purpose: fill it from a trusted dictionary, not from guesses.
 */
export const DEFAULT_EXCEPTIONS = {};

const UPPER = { o: 'Ö', O: 'Ö', g: 'Ğ', G: 'Ğ' };
const LOWER = { o: 'ö', O: 'Ö', g: 'ğ', G: 'Ğ' };

const URL_OR_EMAIL = /(https?:\/\/[^\s<>)\]]+|www\.[^\s<>)\]]+|[\w.+-]+@[\w-]+\.[\w.-]+)/gi;
const TOKEN = new RegExp(`([\\p{L}\\p{M}${APOS}]+)`, 'u');
const DIGRAPH_OG = new RegExp(`([oOgG])${APOS_CLASS}(?!${APOS_CLASS})`, 'g');

function normKey(token) {
  return token.toLowerCase().replace(new RegExp(APOS_CLASS, 'g'), "'");
}

function isAllUpper(token) {
  return token === token.toUpperCase() && token !== token.toLowerCase();
}

function matchCase(source, target) {
  if (isAllUpper(source) && source.length > 1) return target.toUpperCase().replace(/İ/g, 'I');
  if (source[0] !== source[0].toLowerCase()) return target[0].toUpperCase() + target.slice(1);
  return target;
}

function isProtected(token, protectedSet) {
  const key = normKey(token);
  if (protectedSet.has(key)) return true;
  const cut = key.indexOf("'");
  return cut > 0 && protectedSet.has(key.slice(0, cut));
}

function convertToken(token, protectedSet, exceptions) {
  if (isProtected(token, protectedSet)) return token;

  const key = normKey(token);
  if (Object.prototype.hasOwnProperty.call(exceptions, key)) return matchCase(token, exceptions[key]);

  // A quote mark at the very start of a token is never part of a letter.
  const lead = token.match(new RegExp(`^${APOS_CLASS}+`))?.[0] ?? '';
  let word = token.slice(lead.length);

  // oʻ / gʻ first, so the apostrophe is consumed before sh/ch run.
  word = word.replace(DIGRAPH_OG, (_, letter, offset, whole) => {
    const upperContext = letter === letter.toUpperCase();
    // Inside an all-caps word the neighbouring letters decide (ÖZBEKISTON).
    return upperContext ? UPPER[letter] : LOWER[letter];
  });
  word = word.replace(/[sS][hH]/g, (m) => (m[0] === 's' ? 'ş' : 'Ş'));
  word = word.replace(/[cC][hH]/g, (m) => (m[0] === 'c' ? 'ç' : 'Ç'));

  return lead + word;
}

/**
 * Convert plain Uzbek text. URLs and e-mail addresses are left alone.
 * @param {string} text
 * @param {{ protectedWords?: string[], exceptions?: Record<string,string>, normalizeTutuq?: boolean }} [opts]
 */
export function latinToNew(text, opts = {}) {
  if (typeof text !== 'string' || text === '') return text;
  const protectedSet = new Set([...DEFAULT_PROTECTED, ...(opts.protectedWords ?? [])].map((w) => w.toLowerCase()));
  const exceptions = { ...DEFAULT_EXCEPTIONS, ...(opts.exceptions ?? {}) };

  return text
    .split(URL_OR_EMAIL)
    .map((part, i) => {
      if (i % 2 === 1) return part; // a URL or e-mail
      return part
        .split(TOKEN)
        .map((piece, j) => {
          if (j % 2 === 0) return piece;
          let out = convertToken(piece, protectedSet, exceptions);
          if (opts.normalizeTutuq) out = out.replace(new RegExp(`(?<=\\p{L})${APOS_CLASS}(?=\\p{L})`, 'gu'), 'ʼ');
          return out;
        })
        .join('');
    })
    .join('');
}

const MD_PROTECTED =
  /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\]\([^)\s]*(?:\s+"[^"]*")?\)|<[^>\n]+>|https?:\/\/[^\s)>\]]+)/g;

/** Convert Markdown prose; code, link targets, raw HTML tags and URLs are skipped. */
export function latinToNewMarkdown(md, opts = {}) {
  return md
    .split(MD_PROTECTED)
    .map((part, i) => (i % 2 === 1 ? part : latinToNew(part, opts)))
    .join('');
}

/**
 * Convert one content file (a posts/<slug>/uz.md). Front matter is left alone
 * except the values of title, excerpt and description.
 */
export function latinToNewContentFile(source, opts = {}) {
  const m = source.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/);
  if (!m) return latinToNewMarkdown(source, opts);
  const [, open, front, close, body] = m;
  const convertedFront = front.replace(
    /^(title|excerpt|description):(\s*)(.*)$/gm,
    (_, key, space, value) => `${key}:${space}${latinToNew(value, opts)}`
  );
  return open + convertedFront + close + latinToNewMarkdown(body, opts);
}

/** Convert every string inside a JSON-like value (for src/i18n/uz.json). */
export function latinToNewDeep(value, opts = {}) {
  if (typeof value === 'string') return latinToNew(value, opts);
  if (Array.isArray(value)) return value.map((v) => latinToNewDeep(v, opts));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, latinToNewDeep(v, opts)]));
  }
  return value;
}
