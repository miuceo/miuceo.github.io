// Run: npm run test:uz   (needs `npm ci` first: it uses Astro's HTML parser)
import test from 'node:test';
import assert from 'node:assert/strict';
import { convertHtml, convertRss, isEnabled, changedWords } from '../src/lib/uz-alphabet-integration.mjs';

const page = (body, head = '') =>
  `<!DOCTYPE html><html lang="uz"><head><title>Shahar</title>${head}</head><body>${body}</body></html>`;

test('text, alt and title attributes change; everything else is byte-identical', () => {
  const src = page('<main class="shop" id="chat"><h1>Choy</h1><img src="/ch/shop.png" alt="Shahar rasmi" title="Oʻzbek"><a href="/uz/shop/">Bosh sahifa</a></main>');
  const out = convertHtml(src);
  assert.ok(out.includes('<title>Şahar</title>'));
  assert.ok(out.includes('<h1>Çoy</h1>'));
  assert.ok(out.includes('alt="Şahar rasmi"'));
  assert.ok(out.includes('title="Özbek"'));
  assert.ok(out.includes('Boş sahifa'));
  // classes, ids and links never change, even when they contain "sh" or "ch"
  assert.ok(out.includes('class="shop" id="chat"'));
  assert.ok(out.includes('src="/ch/shop.png"'));
  assert.ok(out.includes('href="/uz/shop/"'));
});

test('code, pre, script and style are untouched', () => {
  const src = page('<pre><code>const shop = "choy";</code></pre><p>choy <code>shell</code></p><script>var ch = "shahar";</script><style>.ch{color:red}</style>');
  const out = convertHtml(src);
  assert.ok(out.includes('<pre><code>const shop = "choy";</code></pre>'));
  assert.ok(out.includes('<p>çoy <code>shell</code></p>'));
  assert.ok(out.includes('<script>var ch = "shahar";</script>'));
  assert.ok(out.includes('<style>.ch{color:red}</style>'));
});

test('meta description and open-graph tags change, other meta does not', () => {
  const head =
    '<meta name="description" content="Shahar choy">' +
    '<meta property="og:title" content="Choyxona">' +
    '<meta property="og:url" content="https://example.com/shop">' +
    '<meta name="robots" content="noindex">';
  const out = convertHtml(page('', head));
  assert.ok(out.includes('<meta name="description" content="Şahar çoy">'));
  assert.ok(out.includes('<meta property="og:title" content="Çoyxona">'));
  assert.ok(out.includes('content="https://example.com/shop"'));
  assert.ok(out.includes('content="noindex"'));
});

test('JSON-LD: only headline and description change', () => {
  const ld = JSON.stringify({ '@type': 'BlogPosting', headline: 'Shahar', description: 'Choy', url: 'https://example.com/shop', author: { name: 'Ali Shermatov' } });
  const out = convertHtml(page(`<script type="application/ld+json">${ld}</script>`));
  const m = out.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1];
  const d = JSON.parse(m);
  assert.equal(d.headline, 'Şahar');
  assert.equal(d.description, 'Çoy');
  assert.equal(d.url, 'https://example.com/shop');
  assert.equal(d.author.name, 'Ali Shermatov');
});

test('HTML entities in text are handled (&#39; is an apostrophe)', () => {
  const out = convertHtml(page('<p>o&#39;zbek &amp; shahar</p>'));
  assert.ok(out.includes('<p>özbek &amp; şahar</p>'));
});

test('a page with nothing to change comes back identical', () => {
  const src = page('<p>Hello world, machine learning</p>', '<meta name="description" content="Hello">');
  assert.equal(convertHtml(src, { protectedWords: ['machine'] }), src.replace('<title>Shahar</title>', '<title>Şahar</title>'));
});

test('RSS: title and description change, links do not, entities survive', () => {
  const xml = '<channel><title>Shahar</title><link>https://example.com/shop/</link><description>O&apos;zbek &amp; choy</description><guid>https://example.com/ch</guid></channel>';
  const out = convertRss(xml);
  assert.ok(out.includes('<title>Şahar</title>'));
  assert.ok(out.includes('<description>Özbek &amp; çoy</description>'));
  assert.ok(out.includes('<link>https://example.com/shop/</link>'));
  assert.ok(out.includes('<guid>https://example.com/ch</guid>'));
});

test('switch: env wins, otherwise the law\'s effective date decides', () => {
  assert.equal(isEnabled({ UZ_NEW_ALPHABET: '1' }, 0), true);
  assert.equal(isEnabled({ UZ_NEW_ALPHABET: '0' }, Date.parse('2030-01-01')), false);
  assert.equal(isEnabled({}, Date.parse('2027-04-21T12:00:00+05:00')), false);
  assert.equal(isEnabled({}, Date.parse('2027-04-22T00:00:01+05:00')), true);
});

test('changedWords reports visible words only', () => {
  const pairs = changedWords(page('<p>choy</p><script>var shop=1</script><code>shell</code>'));
  assert.deepEqual(pairs.map((p) => p[0]).sort(), ['Shahar', 'choy']);
});
