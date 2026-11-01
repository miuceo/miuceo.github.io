// Run: node --test scripts/uz-alphabet.test.mjs scripts/uz-alphabet-integration.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latinToNew,
  latinToNewMarkdown,
  latinToNewContentFile,
  latinToNewDeep,
} from '../src/lib/uz-alphabet.mjs';

const eq = (input, expected, opts) => assert.equal(latinToNew(input, opts), expected);

test('sh and ch, every case shape', () => {
  eq('shahar', 'şahar');
  eq('Shahar', 'Şahar');
  eq('SHAHAR', 'ŞAHAR');
  eq('choy', 'çoy');
  eq('Choy', 'Çoy');
  eq('CHOY', 'ÇOY');
  eq('mashhur', 'maşhur');
});

test('oʻ and gʻ with every apostrophe people type', () => {
  for (const a of ["'", '‘', '’', 'ʻ', 'ʼ', '`', '´']) {
    eq(`o${a}zbek`, 'özbek');
    eq(`g${a}oya`, 'ğoya');
    eq(`O${a}zbekiston`, 'Özbekiston');
    eq(`G${a}alaba`, 'Ğalaba');
  }
  eq("O'ZBEKISTON", 'ÖZBEKISTON');
  eq("TOG'", 'TOĞ');
});

test('oʻ / gʻ at the end of a word (togʻ, boʻ)', () => {
  eq("tog'", 'toğ');
  eq('bog‘lanish', 'boğlaniş'); // "-nish" is a real sh, so it changes too
});

test('the tutuq sign stays', () => {
  eq("ma'no", "ma'no");
  eq('aʼzo', 'aʼzo');
  eq("e'lon", "e'lon");
  eq("she'r", "şe'r");
  eq('sheʼr', 'şeʼr');
});

test('ng is unchanged', () => {
  eq('tong', 'tong');
  eq('ming', 'ming');
});

test('s + tutuq + h is not a digraph', () => {
  eq("is'hoq", "is'hoq");
});

test('a double apostrophe is a quotation, not a digraph', () => {
  eq("'to''", "'to''");
});

test('a leading quote mark is not part of the letter', () => {
  eq("'o'zbek'", "'özbek'");
});

test('whole sentence', () => {
  eq(
    "Men O'zbekistonda yashayman, shahar chiroyli.",
    'Men Özbekistonda yaşayman, şahar çiroyli.'
  );
});

test('URLs and e-mail are untouched', () => {
  eq('Qarang: https://example.com/shop?ch=1 va men@chat.uz', 'Qarang: https://example.com/shop?ch=1 va men@chat.uz');
});

test('Cyrillic and Russian are untouched', () => {
  eq('Привет, ширина', 'Привет, ширина');
});

test('idempotent: converting twice gives the same result', () => {
  const once = latinToNew("O'zbekiston shahri choyxonasi, tog' va she'r");
  assert.equal(latinToNew(once), once);
});

test('protected words and suffixes after an apostrophe', () => {
  const opts = { protectedWords: ['ChatGPT', 'Machine', 'Churn'] };
  eq("ChatGPT'da shahar", "ChatGPT'da şahar", opts);
  eq('Machine Learning va Customer Churn', 'Machine Learning va Customer Churn', opts);
  eq('CHATGPT', 'CHATGPT', opts);
});

test('exceptions keep the case shape of the source', () => {
  const opts = { exceptions: { "is'hoq": 'ishoq' } };
  eq("is'hoq", 'ishoq', opts);
  eq("Is'hoq", 'Ishoq', opts);
  eq("IS'HOQ", 'ISHOQ', opts);
});

test('tutuq normalisation is opt-in', () => {
  eq("ma'no", "ma'no");
  eq("ma'no", 'maʼno', { normalizeTutuq: true });
});

test('markdown: code, link targets and tags are skipped', () => {
  const md = [
    'Shahar `shell` va **choy**.',
    '',
    '```js',
    "const shop = 'o\\'zbek';",
    '```',
    '',
    '[sayt](https://example.com/shop) <a href="/chat">chat</a> ![rasm shakli](https://x.uz/ch.png)',
  ].join('\n');
  const out = latinToNewMarkdown(md);
  assert.ok(out.startsWith('Şahar `shell` va **çoy**.'));
  assert.ok(out.includes("const shop = 'o\\'zbek';"));
  assert.ok(out.includes('](https://example.com/shop)'));
  assert.ok(out.includes('<a href="/chat">çat</a>'));
  assert.ok(out.includes('![rasm şakli](https://x.uz/ch.png)'));
});

test('content file: only title/excerpt/description in front matter change', () => {
  const file = [
    '---',
    'title: "Shahar haqida"',
    'excerpt: "Oʻzbek tili"',
    'coverImage: "https://example.com/shop.png"',
    'createdAt: "2026-08-17T08:32:45.278Z"',
    '---',
    'Choy ichamiz.',
  ].join('\n');
  const out = latinToNewContentFile(file);
  assert.ok(out.includes('title: "Şahar haqida"'));
  assert.ok(out.includes('excerpt: "Özbek tili"'));
  assert.ok(out.includes('coverImage: "https://example.com/shop.png"'));
  assert.ok(out.endsWith('Çoy içamiz.'));
});

test('deep conversion of a JSON-like object', () => {
  const out = latinToNewDeep({ a: 'shahar', b: ['choy', { c: "o'zbek" }], n: 3, ok: true });
  assert.deepEqual(out, { a: 'şahar', b: ['çoy', { c: 'özbek' }], n: 3, ok: true });
});
