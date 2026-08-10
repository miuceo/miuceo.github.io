// Ported from post-builder.html's block editor + dual-write publish flow.
// Same data model (block-based, stored as posts-data/<slug>.json), same
// Worker API, same v1+v2 dual-write — just running inside the Astro site
// instead of a standalone v1 HTML file. See ARCHITECTURE.md §9 Phase 4.
import { marked } from 'marked';

const WORKER_URL = 'https://miuceo-worker.ibrokhimovmiu.workers.dev';
const SITE_URL = 'https://muhammadjon.me';

type Block =
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'media'; url: string; mediaType: 'image' | 'youtube' | null };

marked.setOptions({ breaks: true, gfm: true });

let blocks: Block[] = [];
let idCounter = 0;
let currentSlug: string | null = null;
let currentCreatedAt: string | null = null;
let currentTelegramMsgId: number | null = null;
let currentTelegramHasMedia = false;

function uid(): string {
  return 'b' + idCounter++;
}
function escapeHtml(s: string | null | undefined): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function yamlString(s: unknown): string {
  return JSON.stringify(s == null ? '' : String(s));
}

/* ---------- BLOCK EDITOR ---------- */
function addTextBlock() {
  blocks.push({ id: uid(), type: 'text', content: '' });
  render();
}
function addMediaBlock() {
  blocks.push({ id: uid(), type: 'media', url: '', mediaType: null });
  render();
}
function removeBlock(id: string) {
  blocks = blocks.filter((b) => b.id !== id);
  render();
}
function moveBlock(id: string, dir: number) {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + dir;
  if (j < 0 || j >= blocks.length) return;
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  render();
}
function detectMediaType(url: string): 'youtube' | 'image' | null {
  if (!url) return null;
  if (/youtu\.?be/.test(url)) return 'youtube';
  return 'image';
}
function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function mdToHtml(text: string): string {
  if (!text) return '';
  return marked.parse(text, { async: false }) as string;
}
function plainTextFromBlocks(): string {
  return blocks
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.content)
    .join(' ');
}
function getExcerpt(): string {
  const text = plainTextFromBlocks()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[#*_`~[\]()>|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(' ').slice(0, 240);
}
function getCoverImage(): string | null {
  const m = blocks.find((b) => b.type === 'media' && detectMediaType(b.url) === 'image' && b.url) as
    | Extract<Block, { type: 'media' }>
    | undefined;
  return m ? m.url : null;
}
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'post-' + Date.now();
}

function render() {
  renderEditor();
  renderPreview();
  const statusText = document.getElementById('statusText');
  if (statusText) statusText.textContent = blocks.length + ' blok';
}

function renderEditor() {
  const container = document.getElementById('blocksContainer');
  if (!container) return;
  container.innerHTML = '';
  blocks.forEach((b) => {
    const el = document.createElement('div');
    el.className = 'block';
    if (b.type === 'text') {
      el.innerHTML = `
        <div class="block-head">
          <span class="block-type">Matn</span>
          <div class="block-actions">
            <button class="btn ghost icon" data-act="up">↑</button>
            <button class="btn ghost icon" data-act="down">↓</button>
            <button class="btn ghost icon" data-act="del">✕</button>
          </div>
        </div>
        <textarea class="text-input" placeholder="Markdown to'liq qo'llab-quvvatlanadi: # sarlavha, **qalin**, *qiya*, - ro'yxat, 1. raqamli ro'yxat, > iqtibos, kod uchun backtick, [link](url), --- chiziq...">${b.content}</textarea>
      `;
      el.querySelector('textarea')!.addEventListener('input', (e) => {
        (b as Extract<Block, { type: 'text' }>).content = (e.target as HTMLTextAreaElement).value;
        renderPreview();
      });
    } else {
      const mtype = detectMediaType(b.url);
      let previewHtml = '<div class="media-empty">Link kiriting</div>';
      if (mtype === 'youtube') {
        const yid = getYoutubeId(b.url);
        previewHtml = yid
          ? `<div><iframe src="https://www.youtube.com/embed/${yid}" allowfullscreen></iframe><div class="media-hint" style="margin-top:6px; margin-bottom:0;">Embed ishlamasa, video egasi joylashtirishni o'chirgan — <a href="https://www.youtube.com/watch?v=${yid}" target="_blank" rel="noopener">YouTube'da ochish</a> doim ishlaydi.</div></div>`
          : `<div class="media-empty">YouTube linkini tekshiring</div>`;
      } else if (mtype === 'image' && b.url) {
        previewHtml = `<img src="${b.url}" onerror="this.parentElement.innerHTML='Rasm yuklanmadi, linkni tekshiring'">`;
      }
      el.innerHTML = `
        <div class="block-head">
          <span class="block-type">Rasm / Video</span>
          <div class="block-actions">
            <button class="btn ghost icon" data-act="up">↑</button>
            <button class="btn ghost icon" data-act="down">↓</button>
            <button class="btn ghost icon" data-act="del">✕</button>
          </div>
        </div>
        <div class="media-hint">YouTube video linki yoki rasm URL manzilini joylashtiring</div>
        <input type="text" class="media-url" placeholder="https://youtube.com/watch?v=... yoki https://.../image.jpg" value="${b.url}">
        <div class="media-preview">${previewHtml}</div>
      `;
      el.querySelector('input')!.addEventListener('input', (e) => {
        const mb = b as Extract<Block, { type: 'media' }>;
        mb.url = (e.target as HTMLInputElement).value;
        mb.mediaType = detectMediaType(mb.url);
        renderEditor();
        renderPreview();
      });
    }
    el.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        if (act === 'up') moveBlock(b.id, -1);
        if (act === 'down') moveBlock(b.id, 1);
        if (act === 'del') removeBlock(b.id);
      });
    });
    container.appendChild(el);
  });
}

function renderPreview() {
  const previewBody = document.getElementById('previewBody');
  const titleInput = document.getElementById('titleInput') as HTMLInputElement | null;
  if (!previewBody || !titleInput) return;
  const title = titleInput.value.trim();
  if (!title && blocks.length === 0) {
    previewBody.innerHTML = '<div class="preview-placeholder">Postni yozishni boshlaganingda shu yerda ko\'rasan</div>';
    return;
  }
  let html = '';
  if (title) html += `<h1 class="preview-title">${escapeHtml(title)}</h1>`;
  blocks.forEach((b) => {
    if (b.type === 'text' && b.content.trim()) {
      html += `<div class="preview-block">${mdToHtml(b.content)}</div>`;
    } else if (b.type === 'media' && b.url) {
      const mtype = detectMediaType(b.url);
      if (mtype === 'youtube') {
        const yid = getYoutubeId(b.url);
        if (yid) html += `<div class="preview-block"><iframe src="https://www.youtube.com/embed/${yid}" allowfullscreen></iframe></div>`;
      } else {
        html += `<div class="preview-block"><img src="${b.url}"></div>`;
      }
    }
  });
  previewBody.innerHTML = html || '<div class="preview-placeholder">Postni yozishni boshlaganingda shu yerda ko\'rasan</div>';
}

/* ---------- WORKER API (holds every secret server-side) ---------- */
// Telegram's embedded Mini App webview blocks the cross-site session
// cookie (confirmed live) — post-builder.astro's auth gate stores the
// session id from a successful Mini App login here, and every call below
// sends it as a Bearer token too. Harmless no-op in a normal browser,
// where the cookie already works and this key is simply empty.
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('miuceo_session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ghGetFile(path: string): Promise<{ sha: string; content: string } | null> {
  const res = await fetch(`${WORKER_URL}/api/github/get`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ path }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `GET ${path} xato`);
  return data.file;
}
async function ghPutFileSafe(path: string, contentStr: string, message: string, sha?: string | null) {
  const res = await fetch(`${WORKER_URL}/api/github/put`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ path, content: contentStr, message, sha: sha || null }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `PUT ${path} xato`);
  return { content: { sha: data.sha as string } };
}
async function tgSendPost(title: string, excerpt: string, coverImage: string | null, postUrl: string): Promise<number> {
  const res = await fetch(`${WORKER_URL}/api/telegram/send`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, excerpt, coverImage, postUrl }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Telegram yuborish xatosi');
  return data.message_id;
}
async function tgEditPost(
  messageId: number,
  title: string,
  excerpt: string,
  coverImage: string | null,
  postUrl: string,
  hadMediaOriginally: boolean
) {
  const res = await fetch(`${WORKER_URL}/api/telegram/edit`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ messageId, title, excerpt, postUrl, hadMedia: hadMediaOriginally }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Telegram tahrirlash xatosi');
}

/* ---------- LOAD EXISTING POSTS ---------- */
async function loadPostsIntoSelect() {
  const btn = document.getElementById('loadPostsBtn') as HTMLButtonElement | null;
  const select = document.getElementById('postSelect') as HTMLSelectElement | null;
  if (!btn || !select) return;
  btn.disabled = true;
  btn.textContent = 'Yuklanmoqda...';
  try {
    const file = await ghGetFile('posts.json');
    const allPosts = file ? JSON.parse(file.content) : [];
    select.innerHTML =
      '<option value="">— Yangi post yaratish —</option>' +
      allPosts.map((p: any) => `<option value="${p.slug}">${escapeHtml(p.title)}</option>`).join('');
  } catch (err) {
    alert("Postlarni yuklab bo'lmadi: " + (err as Error).message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Mavjud postlarni yuklash';
  }
}

async function loadPostForEdit(slug: string) {
  const titleInput = document.getElementById('titleInput') as HTMLInputElement;
  const modeText = document.getElementById('modeText')!;
  if (!slug) {
    blocks = [];
    currentSlug = null;
    currentCreatedAt = null;
    currentTelegramMsgId = null;
    currentTelegramHasMedia = false;
    titleInput.value = '';
    titleInput.disabled = false;
    modeText.textContent = 'Yangi post';
    setAgentButtonsEnabled(false);
    render();
    return;
  }
  try {
    const file = await ghGetFile(`posts-data/${slug}.json`);
    if (!file) {
      alert("Post ma'lumotlari topilmadi.");
      return;
    }
    const data = JSON.parse(file.content);
    currentSlug = slug;
    currentCreatedAt = data.created_at;
    currentTelegramMsgId = data.telegram_message_id || null;
    currentTelegramHasMedia = !!data.telegram_has_media;
    idCounter = 0;
    blocks = data.blocks.map((b: any) => ({ ...b, id: uid() }));
    titleInput.value = data.title;
    titleInput.disabled = true;
    modeText.textContent = `Tahrirlash: ${data.title}`;
    setAgentButtonsEnabled(true);
    render();
  } catch (err) {
    alert("Postni yuklab bo'lmadi: " + (err as Error).message);
  }
}

/* ---------- RSS (v1 mirror, same as post-builder.html) ---------- */
function escapeXml(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function generateRssXml(index: any[], siteUrl: string): string {
  const sorted = [...index].sort((a, b) => new Date(b.created_at).valueOf() - new Date(a.created_at).valueOf());
  const items = sorted
    .map(
      (p) => `  <item>
    <title>${escapeXml(p.title)}</title>
    <link>${escapeXml(siteUrl)}/posts/${escapeXml(p.slug)}.html</link>
    <guid isPermaLink="true">${escapeXml(siteUrl)}/posts/${escapeXml(p.slug)}.html</guid>
    <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
    <description>${escapeXml(p.excerpt || '')}</description>
  </item>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>miuceo — Muhammadjon Ibrohimov</title>
  <link>${escapeXml(siteUrl)}/</link>
  <description>Machine learning, AI engineering, backend va DevOps haqida.</description>
  <language>uz</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}
async function publishRss(index: any[], siteUrl: string) {
  const existing = await ghGetFile('rss.xml');
  const xml = generateRssXml(index, siteUrl);
  await ghPutFileSafe('rss.xml', xml, 'Update rss.xml', existing ? existing.sha : null);
}

/* ---------- GENERATE v1 HTML (unchanged generator, keeps posts/<slug>.html working) ---------- */
function generatePostHtml(title: string, postUrl: string, excerpt: string, coverImage: string | null): string {
  let contentHtml = '';
  blocks.forEach((b) => {
    if (b.type === 'text' && b.content.trim()) {
      contentHtml += mdToHtml(b.content) + '\n';
    } else if (b.type === 'media' && b.url) {
      const mtype = detectMediaType(b.url);
      if (mtype === 'youtube') {
        const yid = getYoutubeId(b.url);
        if (yid)
          contentHtml += `<div class="media-embed"><iframe src="https://www.youtube.com/embed/${yid}" allowfullscreen loading="lazy"></iframe><p class="embed-fallback">Video ko'rinmasa, <a href="https://www.youtube.com/watch?v=${yid}" target="_blank" rel="noopener">YouTube'da tomosha qiling</a>.</p></div>\n`;
      } else {
        contentHtml += `<img class="post-image" src="${escapeHtml(b.url)}" alt="" loading="lazy">\n`;
      }
    }
  });

  const createdAtDisplay = new Date(currentCreatedAt!).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' });
  const updatedAt = new Date().toISOString();
  const updatedAtDisplay = new Date(updatedAt).toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' });
  const encodedUrl = encodeURIComponent(postUrl);
  const encodedTitle = encodeURIComponent(title);
  const metaDescription = escapeHtml((excerpt || '').slice(0, 200));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: excerpt || '',
    url: postUrl,
    datePublished: currentCreatedAt,
    dateModified: updatedAt,
    inLanguage: 'uz',
    author: { '@type': 'Person', name: 'Muhammadjon Ibrohimov' },
    ...(coverImage ? { image: coverImage } : {}),
  };

  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — miuceo</title>
<meta name="description" content="${metaDescription}">
<link rel="canonical" href="${postUrl}">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="alternate" type="application/rss+xml" title="miuceo — RSS" href="../rss.xml">

<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${metaDescription}">
<meta property="og:url" content="${postUrl}">
<meta property="og:site_name" content="miuceo">
<meta property="og:locale" content="uz_UZ">
<meta property="article:published_time" content="${currentCreatedAt}">
<meta property="article:modified_time" content="${updatedAt}">
${coverImage ? `<meta property="og:image" content="${escapeHtml(coverImage)}">\n<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${metaDescription}">

<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c')}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/theme.css">
<style>
  .top-nav{ padding:20px 24px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; }
  .top-nav a{ font-size:13px; color:var(--ink-soft); }
  .top-nav a:hover{ color:var(--neon-cyan); }
  .post-wrap{ max-width:760px; margin:0 auto; padding:60px 24px 40px; }
  .post-title{ font-size:36px; font-weight:800; line-height:1.2; margin:0 0 36px; }
  .post-content p{ font-size:16px; line-height:1.8; margin:0 0 18px; }
  .post-content h2{ font-size:24px; font-weight:700; margin:32px 0 14px; }
  .post-content h3{ font-size:19px; font-weight:700; margin:26px 0 12px; }
  .post-content ul, .post-content ol{ margin:0 0 18px; padding-left:26px; }
  .post-content li{ font-size:16px; line-height:1.8; margin-bottom:6px; }
  .post-content blockquote{ margin:22px 0; padding:6px 20px; border-left:3px solid var(--neon-green); color:var(--ink-soft); font-style:italic; }
  .post-content code{ font-size:0.9em; background:var(--bg-3); padding:2px 6px; border-radius:4px; color:var(--neon-cyan); }
  .post-content pre{ background:var(--bg-3); border:1px solid var(--line); border-radius:8px; padding:16px 18px; overflow-x:auto; margin:22px 0; }
  .post-content pre code{ background:none; padding:0; }
  .post-content hr{ border:none; border-top:1px solid var(--line); margin:32px 0; }
  .post-content table{ border-collapse:collapse; width:100%; margin:22px 0; font-size:14px; }
  .post-content th, .post-content td{ border:1px solid var(--line); padding:10px 12px; text-align:left; }
  .post-content a{ color:var(--neon-green); }
  .post-content a:hover{ text-shadow:var(--glow-sm) var(--neon-green); }
  .post-image{ width:100%; border-radius:8px; margin:22px 0; display:block; border:1px solid var(--line); }
  .media-embed{ margin:22px 0; }
  .media-embed iframe{ width:100%; aspect-ratio:16/9; border:0; border-radius:8px; }
  .embed-fallback{ font-size:13px !important; color:var(--ink-soft) !important; margin:8px 0 0 !important; }
  .share-bar{ max-width:760px; margin:0 auto; padding:24px; border-top:1px solid var(--line); display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .share-bar span{ font-size:12px; color:var(--ink-soft); }
  .share-bar a{ font-size:13px; color:var(--ink); padding:6px 12px; border:1px solid var(--line); border-radius:4px; }
  .share-bar a:hover{ border-color:var(--neon-green); color:var(--neon-green); }
  .post-dates{ max-width:760px; margin:0 auto; padding:16px 24px 60px; font-size:12px; color:var(--ink-soft); }
</style>
</head>
<body>
<div class="top-nav">
  <a href="../index.html">← Orqaga</a>
  <button class="theme-toggle" id="themeToggle">☀️</button>
</div>
<main class="post-wrap">
  <h1 class="post-title">${escapeHtml(title)}</h1>
  <div class="post-content">
${contentHtml}
  </div>
</main>
<div class="share-bar">
  <span>Ulashish:</span>
  <a href="https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}" target="_blank" rel="noopener">Telegram</a>
  <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}" target="_blank" rel="noopener">LinkedIn</a>
</div>
<div class="post-dates">Yaratildi: ${createdAtDisplay} · Yangilandi: ${updatedAtDisplay}</div>
<script src="../assets/theme.js"></script>
</body>
</html>`;
}

/* ---------- v2 CONTENT COLLECTION MIRROR (Astro, ARCHITECTURE.md §9 Phase 3/4) ---------- */
function generatePostMarkdownBody(): string {
  let body = '';
  blocks.forEach((b) => {
    if (b.type === 'text' && b.content.trim()) {
      body += b.content.trim() + '\n\n';
    } else if (b.type === 'media' && b.url) {
      const mtype = detectMediaType(b.url);
      if (mtype === 'youtube') {
        const yid = getYoutubeId(b.url);
        body += `[Video](${yid ? `https://www.youtube.com/watch?v=${yid}` : b.url})\n\n`;
      } else {
        body += `![](${b.url})\n\n`;
      }
    }
  });
  return body.trim() + '\n';
}
function generatePostMarkdown(
  title: string,
  excerpt: string,
  coverImage: string | null,
  createdAtIso: string,
  updatedAtIso: string,
  telegramMessageId: number | null,
  telegramHasMedia: boolean
): string {
  const lines = ['---', `title: ${yamlString(title)}`];
  if (excerpt) lines.push(`excerpt: ${yamlString(excerpt)}`);
  if (coverImage) lines.push(`coverImage: ${yamlString(coverImage)}`);
  lines.push(`createdAt: ${yamlString(createdAtIso)}`);
  lines.push(`updatedAt: ${yamlString(updatedAtIso)}`);
  if (telegramMessageId) lines.push(`telegramMessageId: ${telegramMessageId}`);
  lines.push(`telegramHasMedia: ${!!telegramHasMedia}`);
  lines.push('---', '');
  return lines.join('\n') + generatePostMarkdownBody();
}

/**
 * Frontmatter for a translated post. Same shape as generatePostMarkdown, but
 * the body is supplied directly (the agent returns markdown, not blocks) and
 * telegramMessageId is deliberately omitted — that id belongs to the Uzbek
 * post's channel message, and reusing it on a translation would make a later
 * edit clobber the wrong message.
 */
function generateTranslationMarkdown(
  title: string,
  excerpt: string,
  coverImage: string | null,
  createdAtIso: string,
  updatedAtIso: string,
  body: string
): string {
  const lines = ['---', `title: ${yamlString(title)}`];
  if (excerpt) lines.push(`excerpt: ${yamlString(excerpt)}`);
  if (coverImage) lines.push(`coverImage: ${yamlString(coverImage)}`);
  lines.push(`createdAt: ${yamlString(createdAtIso)}`);
  lines.push(`updatedAt: ${yamlString(updatedAtIso)}`);
  lines.push('---', '');
  return lines.join('\n') + body.trim() + '\n';
}

/* ---------- AI ASSISTANT (agent proposes, human approves — D6) ---------- */

type AgentMode = { kind: 'translate'; lang: 'en' | 'ru' } | { kind: 'improve' };
let pendingReview: AgentMode | null = null;

function setAgentButtonsEnabled(enabled: boolean) {
  ['translateEnBtn', 'translateRuBtn', 'improveBtn'].forEach((id) => {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = !enabled;
  });
  const hint = document.getElementById('agentHint');
  if (hint) {
    hint.textContent = enabled ? '' : 'Avval postni saqlang yoki mavjud postni tanlang';
  }
}

/** Reconstructs the Uzbek source markdown from the current blocks. */
function currentSourceMarkdown(): string {
  return generatePostMarkdownBody();
}

async function runAgentTask(mode: AgentMode) {
  const titleInput = document.getElementById('titleInput') as HTMLInputElement;
  const title = titleInput.value.trim();
  if (!currentSlug) {
    alert("Avval postni saqlang — tarjima uchun slug kerak.");
    return;
  }
  if (!title || blocks.length === 0) {
    alert("Sarlavha va kamida bitta blok kerak.");
    return;
  }

  const endpoint = mode.kind === 'translate' ? 'translate' : 'improve';
  const targetLang = mode.kind === 'translate' ? mode.lang : 'uz';

  setAgentButtonsEnabled(false);
  const hint = document.getElementById('agentHint');
  if (hint) hint.textContent = 'AI ishlamoqda...';

  try {
    const res = await fetch(`${WORKER_URL}/api/agent/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        slug: currentSlug,
        targetLang,
        title,
        excerpt: getExcerpt(),
        markdown: currentSourceMarkdown(),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'AI xatosi');

    pendingReview = mode;
    (document.getElementById('reviewTitleInput') as HTMLInputElement).value = data.title || '';
    (document.getElementById('reviewExcerptInput') as HTMLTextAreaElement).value = data.excerpt || '';
    (document.getElementById('reviewBodyInput') as HTMLTextAreaElement).value = data.markdown || '';
    document.getElementById('reviewTitle')!.textContent =
      mode.kind === 'translate'
        ? `AI tarjimasi — ${mode.lang.toUpperCase()}`
        : 'AI yaxshilagan matn';
    document.getElementById('reviewMeta')!.textContent =
      `${data.provider} / ${data.model} — tekshiring va tahrirlang, keyin saqlang`;
    document.getElementById('reviewStatus')!.textContent = '';
    document.getElementById('reviewStatus')!.className = 'review-status';
    document.getElementById('reviewModal')!.style.display = 'flex';
  } catch (err) {
    alert('AI xatosi: ' + (err as Error).message);
  } finally {
    setAgentButtonsEnabled(true);
  }
}

/**
 * The approval action. Only this — a human click, after reading the output —
 * moves agent text toward GitHub, and it does so through the same
 * /api/github/put the author already uses. The agent has no such path (D6).
 */
async function saveReviewedOutput() {
  if (!pendingReview || !currentSlug) return;
  const statusEl = document.getElementById('reviewStatus')!;
  const saveBtn = document.getElementById('reviewSaveBtn') as HTMLButtonElement;

  const title = (document.getElementById('reviewTitleInput') as HTMLInputElement).value.trim();
  const excerpt = (document.getElementById('reviewExcerptInput') as HTMLTextAreaElement).value.trim();
  const body = (document.getElementById('reviewBodyInput') as HTMLTextAreaElement).value;

  if (!title || !body.trim()) {
    statusEl.textContent = 'Sarlavha va matn bo\'sh bo\'lmasligi kerak.';
    statusEl.className = 'review-status err';
    return;
  }

  if (pendingReview.kind === 'improve') {
    // Improvement targets the Uzbek source the author is editing. Writing it
    // back into the block editor keeps the existing publish flow the single
    // way anything reaches the site — no second publish path.
    const titleInput = document.getElementById('titleInput') as HTMLInputElement;
    if (!titleInput.disabled) titleInput.value = title;
    idCounter = 0;
    blocks = [{ id: uid(), type: 'text', content: body.trim() }];
    render();
    document.getElementById('reviewModal')!.style.display = 'none';
    pendingReview = null;
    alert("Matn tahrirlagichga ko'chirildi. Nashr qilish uchun 'Generate & Publish' bosing.");
    return;
  }

  const lang = pendingReview.lang;
  saveBtn.disabled = true;
  statusEl.textContent = 'Saqlanmoqda...';
  statusEl.className = 'review-status';

  try {
    const path = `src/content/posts/${currentSlug}/${lang}.md`;
    const existing = await ghGetFile(path);
    const nowIso = new Date().toISOString();
    const md = generateTranslationMarkdown(
      title,
      excerpt,
      getCoverImage(),
      currentCreatedAt || nowIso,
      nowIso,
      body
    );
    await ghPutFileSafe(
      path,
      md,
      `${existing ? 'Update' : 'Add'} ${lang} translation: ${title}`,
      existing ? existing.sha : null
    );
    statusEl.textContent = `✓ ${path} saqlandi`;
    statusEl.className = 'review-status ok';
    setTimeout(() => {
      document.getElementById('reviewModal')!.style.display = 'none';
      pendingReview = null;
    }, 1200);
  } catch (err) {
    statusEl.textContent = 'Xatolik: ' + (err as Error).message;
    statusEl.className = 'review-status err';
  } finally {
    saveBtn.disabled = false;
  }
}

/* ---------- LOG HELPERS ---------- */
function showLog() {
  document.getElementById('copyModal')!.style.display = 'flex';
}
function appendLog(msg: string) {
  const log = document.getElementById('processLog')!;
  log.textContent += msg + '\n';
  log.scrollTop = log.scrollHeight;
}

/* ---------- GENERATE & PUBLISH (identical dual-write behavior to post-builder.html) ---------- */
async function publish() {
  const titleInput = document.getElementById('titleInput') as HTMLInputElement;
  const title = titleInput.value.trim();
  if (!title) {
    alert('Iltimos, sarlavha kiriting.');
    return;
  }
  if (blocks.length === 0) {
    alert("Iltimos, kamida bitta blok qo'shing.");
    return;
  }

  const isEdit = !!currentSlug;
  const slug = isEdit ? currentSlug! : slugify(title);
  const nowIso = new Date().toISOString();
  if (!isEdit) currentCreatedAt = nowIso;

  const postUrl = `${SITE_URL}/posts/${slug}.html`;
  const excerpt = getExcerpt();
  const coverImage = getCoverImage();

  document.getElementById('processLog')!.textContent = '';
  showLog();
  const genBtn = document.getElementById('generateBtn') as HTMLButtonElement;
  genBtn.disabled = true;

  try {
    appendLog(`Slug: ${slug}`);

    appendLog('HTML post fayli tayyorlanmoqda...');
    const postHtml = generatePostHtml(title, postUrl, excerpt, coverImage);
    const existingPostFile = isEdit ? await ghGetFile(`posts/${slug}.html`) : null;
    await ghPutFileSafe(`posts/${slug}.html`, postHtml, `${isEdit ? 'Update' : 'Create'} post: ${title}`, existingPostFile ? existingPostFile.sha : null);
    appendLog('✓ posts/' + slug + ".html GitHub'ga yuklandi");

    appendLog("Post ma'lumotlari (posts-data) saqlanmoqda...");
    const postData: Record<string, unknown> = {
      title,
      slug,
      blocks: blocks.map(({ id, ...rest }) => rest),
      created_at: currentCreatedAt,
      updated_at: nowIso,
      telegram_message_id: currentTelegramMsgId,
      telegram_has_media: currentTelegramHasMedia,
    };
    const existingDataFile = isEdit ? await ghGetFile(`posts-data/${slug}.json`) : null;
    const dataPutResult = await ghPutFileSafe(
      `posts-data/${slug}.json`,
      JSON.stringify(postData, null, 2),
      `${isEdit ? 'Update' : 'Create'} post data: ${title}`,
      existingDataFile ? existingDataFile.sha : null
    );
    let postDataSha = dataPutResult.content.sha;
    appendLog('✓ posts-data/' + slug + '.json saqlandi');

    appendLog('posts.json yangilanmoqda...');
    const indexFile = await ghGetFile('posts.json');
    let index: any[] = indexFile ? JSON.parse(indexFile.content) : [];
    const entry = {
      slug,
      title,
      excerpt,
      cover_image: coverImage,
      created_at: currentCreatedAt,
      updated_at: nowIso,
      telegram_message_id: currentTelegramMsgId,
      telegram_has_media: currentTelegramHasMedia,
    };
    const existingIdx = index.findIndex((p) => p.slug === slug);
    if (existingIdx >= 0) index[existingIdx] = entry;
    else index.push(entry);
    const indexPutResult = await ghPutFileSafe('posts.json', JSON.stringify(index, null, 2), `Update posts index: ${title}`, indexFile ? indexFile.sha : null);
    let indexSha = indexPutResult.content.sha;
    appendLog('✓ posts.json yangilandi');

    // Best-effort only: v1's publish above must never break because the v2
    // Astro mirror failed (e.g. the Worker allowlist not yet redeployed).
    const mdPath = `src/content/posts/${slug}/uz.md`;
    let mdSha: string | null = null;
    try {
      appendLog('v2 (Astro) content fayli yozilmoqda...');
      const existingMdFile = isEdit ? await ghGetFile(mdPath) : null;
      const mdContent = generatePostMarkdown(title, excerpt, coverImage, currentCreatedAt!, nowIso, currentTelegramMsgId, currentTelegramHasMedia);
      const mdPutResult = await ghPutFileSafe(mdPath, mdContent, `${isEdit ? 'Update' : 'Create'} v2 post content: ${title}`, existingMdFile ? existingMdFile.sha : null);
      mdSha = mdPutResult.content.sha;
      appendLog('✓ ' + mdPath + ' saqlandi');
    } catch (err) {
      appendLog("⚠ v2 content faylini yozib bo'lmadi (" + (err as Error).message + "), v1 nashr davom etmoqda...");
    }

    let telegramUpdated = false;
    if (currentTelegramMsgId) {
      try {
        appendLog('Telegram xabari tahrirlanmoqda...');
        await tgEditPost(currentTelegramMsgId, title, excerpt, coverImage, postUrl, currentTelegramHasMedia);
        appendLog('✓ Telegram xabari yangilandi');
        telegramUpdated = true;
      } catch (err) {
        appendLog("⚠ Telegram xabarini tahrirlab bo'lmadi (" + (err as Error).message + '), yangi xabar yuborilmoqda...');
      }
    }
    if (!telegramUpdated) {
      appendLog('Telegram kanaliga yuborilmoqda...');
      const msgId = await tgSendPost(title, excerpt, coverImage, postUrl);
      currentTelegramMsgId = msgId;
      currentTelegramHasMedia = !!coverImage;
      appendLog("✓ Telegram'ga yuborildi (message_id: " + msgId + ')');
      appendLog('posts.json va posts-data qayta yangilanmoqda (telegram_message_id bilan)...');
      (entry as any).telegram_message_id = msgId;
      (entry as any).telegram_has_media = currentTelegramHasMedia;
      index[index.findIndex((p) => p.slug === slug)] = entry;
      const indexPutResult2 = await ghPutFileSafe('posts.json', JSON.stringify(index, null, 2), `Set telegram id: ${title}`, indexSha);
      indexSha = indexPutResult2.content.sha;
      (postData as any).telegram_message_id = msgId;
      (postData as any).telegram_has_media = currentTelegramHasMedia;
      const dataPutResult2 = await ghPutFileSafe(`posts-data/${slug}.json`, JSON.stringify(postData, null, 2), `Set telegram id: ${title}`, postDataSha);
      postDataSha = dataPutResult2.content.sha;

      try {
        const mdContent2 = generatePostMarkdown(title, excerpt, coverImage, currentCreatedAt!, nowIso, currentTelegramMsgId, currentTelegramHasMedia);
        const mdPutResult2 = await ghPutFileSafe(mdPath, mdContent2, `Set telegram id: ${title}`, mdSha);
        mdSha = mdPutResult2.content.sha;
      } catch (err) {
        appendLog("⚠ v2 content faylini telegram_message_id bilan yangilab bo'lmadi (" + (err as Error).message + ')');
      }
      appendLog('✓ Tayyor');
    }

    appendLog('rss.xml yangilanmoqda...');
    await publishRss(index, SITE_URL);
    appendLog('✓ rss.xml yangilandi');

    currentSlug = slug;
    titleInput.disabled = true;
    document.getElementById('modeText')!.textContent = `Tahrirlash: ${title}`;
    setAgentButtonsEnabled(true);
    appendLog('');
    appendLog(`Tayyor! Post manzili: ${postUrl}`);
  } catch (err) {
    appendLog('✗ Xatolik: ' + (err as Error).message);
  } finally {
    genBtn.disabled = false;
  }
}

/* ---------- INIT ---------- */
export function initPostBuilder() {
  document.getElementById('addTextBtn')?.addEventListener('click', addTextBlock);
  document.getElementById('addMediaBtn')?.addEventListener('click', addMediaBlock);
  document.getElementById('titleInput')?.addEventListener('input', renderPreview);
  document.getElementById('generateBtn')?.addEventListener('click', publish);
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try {
      await fetch(`${WORKER_URL}/auth/logout`, { method: 'POST', credentials: 'include', headers: authHeaders() });
    } catch {}
    localStorage.removeItem('miuceo_session_token');
    window.location.href = '/uz/';
  });
  document.getElementById('clearBtn')?.addEventListener('click', () => {
    if (confirm('Hammasini tozalaysanmi?')) {
      blocks = [];
      currentSlug = null;
      currentCreatedAt = null;
      currentTelegramMsgId = null;
      currentTelegramHasMedia = false;
      const titleInput = document.getElementById('titleInput') as HTMLInputElement;
      titleInput.value = '';
      titleInput.disabled = false;
      (document.getElementById('postSelect') as HTMLSelectElement).value = '';
      document.getElementById('modeText')!.textContent = 'Yangi post';
      setAgentButtonsEnabled(false);
      render();
    }
  });
  document.getElementById('loadPostsBtn')?.addEventListener('click', loadPostsIntoSelect);
  document.getElementById('postSelect')?.addEventListener('change', (e) => {
    loadPostForEdit((e.target as HTMLSelectElement).value);
  });
  document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    document.getElementById('copyModal')!.style.display = 'none';
  });

  document.getElementById('translateEnBtn')?.addEventListener('click', () => runAgentTask({ kind: 'translate', lang: 'en' }));
  document.getElementById('translateRuBtn')?.addEventListener('click', () => runAgentTask({ kind: 'translate', lang: 'ru' }));
  document.getElementById('improveBtn')?.addEventListener('click', () => runAgentTask({ kind: 'improve' }));
  document.getElementById('reviewSaveBtn')?.addEventListener('click', saveReviewedOutput);
  document.getElementById('reviewCancelBtn')?.addEventListener('click', () => {
    document.getElementById('reviewModal')!.style.display = 'none';
    pendingReview = null;
  });

  setAgentButtonsEnabled(false);
  render();

  // ?edit=slug auto-load, same as post-builder.html
  (async () => {
    const params = new URLSearchParams(window.location.search);
    const editSlug = params.get('edit');
    if (!editSlug) return;
    try {
      await loadPostsIntoSelect();
      const select = document.getElementById('postSelect') as HTMLSelectElement;
      select.value = editSlug;
      select.dispatchEvent(new Event('change'));
    } catch (err) {
      alert("Postni avtomatik yuklab bo'lmadi: " + (err as Error).message);
    }
  })();
}
