// Ported from post-builder.html's block editor + dual-write publish flow.
// Same data model (block-based, stored as posts-data/<slug>.json), same
// Worker API, same v1+v2 dual-write — just running inside the Astro site
// instead of a standalone v1 HTML file. See ARCHITECTURE.md §9 Phase 4.
import { marked } from 'marked';

const WORKER_URL = 'https://miuceo-worker.ibrokhimovmiu.workers.dev';
const SITE_URL = 'https://muhammadjon.me';

type Block =
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'media'; url: string; mediaType: 'image' | 'youtube' | null; alt?: string };

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

/**
 * Alt text going inside `![...](...)`. Brackets and newlines would break out of
 * the markdown image syntax, so they are neutralised rather than escaped —
 * backslash escaping inside link text is not portable across parsers.
 */
function markdownAlt(alt: string | undefined): string {
  return (alt || '').replace(/[\[\]]/g, '').replace(/\s*\n\s*/g, ' ').trim();
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
            <button class="btn ghost small mic-btn" type="button" title="Gapirib yozdirish">🎙 Ovoz</button>
            <button class="btn ghost icon" data-act="up">↑</button>
            <button class="btn ghost icon" data-act="down">↓</button>
            <button class="btn ghost icon" data-act="del">✕</button>
          </div>
        </div>
        <textarea class="text-input" placeholder="Markdown to'liq qo'llab-quvvatlanadi: # sarlavha, **qalin**, *qiya*, - ro'yxat, 1. raqamli ro'yxat, > iqtibos, kod uchun backtick, [link](url), --- chiziq...">${escapeHtml(b.content)}</textarea>
      `;
      el.querySelector('textarea')!.addEventListener('input', (e) => {
        (b as Extract<Block, { type: 'text' }>).content = (e.target as HTMLTextAreaElement).value;
        renderPreview();
      });
      wireMicButton(
        el.querySelector('button.mic-btn') as HTMLButtonElement,
        b as Extract<Block, { type: 'text' }>
      );
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
        <input type="text" class="media-url" placeholder="https://youtube.com/watch?v=... yoki https://.../image.jpg" value="${escapeHtml(b.url)}">
        ${
          mtype === 'image'
            ? `<div class="alt-row">
                 <input type="text" class="media-alt" placeholder="Alt matn (ko'rmaydigan o'quvchilar uchun)" value="${escapeHtml(b.alt || '')}">
                 <button class="btn ghost small alt-gen" type="button">🖼 Alt matn</button>
               </div>`
            : ''
        }
        <div class="media-preview">${previewHtml}</div>
      `;
      el.querySelector('input.media-url')!.addEventListener('input', (e) => {
        const mb = b as Extract<Block, { type: 'media' }>;
        mb.url = (e.target as HTMLInputElement).value;
        mb.mediaType = detectMediaType(mb.url);
        renderEditor();
        renderPreview();
      });

      const altInput = el.querySelector('input.media-alt') as HTMLInputElement | null;
      altInput?.addEventListener('input', (e) => {
        (b as Extract<Block, { type: 'media' }>).alt = (e.target as HTMLInputElement).value;
      });

      // The agent proposes; the author keeps or edits it, exactly like every
      // other agent output in this editor.
      el.querySelector('button.alt-gen')?.addEventListener('click', async () => {
        const mb = b as Extract<Block, { type: 'media' }>;
        const btn = el.querySelector('button.alt-gen') as HTMLButtonElement;
        if (!mb.url) return;
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = '...';
        try {
          const res = await fetch(`${WORKER_URL}/api/agent/alt-text`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ imageUrl: mb.url, lang: 'uz' }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Alt matn xatosi');
          mb.alt = data.alt;
          if (altInput) altInput.value = data.alt;
        } catch (err) {
          alert('Alt matn yaratib bo\'lmadi: ' + (err as Error).message);
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
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

/* ---------- VOICE → TEXT ----------
   Dictation for a text block: record, transcribe, punctuate, append. The
   Worker does both model calls (/api/agent/transcribe); this side only
   captures audio and hands it over.

   D14's approval gate is satisfied structurally rather than by a confirmation
   prompt — the result lands in the author's own editor, where it sits next to
   everything else they wrote and is read and edited before publishing. The
   audio itself is never uploaded anywhere but the Worker, which drops it as
   soon as Whisper has read it. */

/** Long enough for a whole section, short enough to stay inside Groq's 25 MB
 *  per-file limit and its daily audio-seconds allowance. */
const MAX_RECORDING_MS = 10 * 60 * 1000;

/**
 * Groq decides an audio file's format from its FILENAME EXTENSION, not from
 * its bytes or its Content-Type — so the extension we send has to match what
 * MediaRecorder actually produced. Browsers disagree here: Chrome and Firefox
 * give WebM/Opus, Safari gives MP4/AAC. Picking the container and its
 * extension together is what keeps that from silently becoming a rejected
 * upload.
 */
function pickAudioFormat(): { mime: string; ext: string } {
  const candidates = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mime: 'audio/mp4', ext: 'mp4' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: '', ext: 'webm' };
}

interface Recording {
  ext: string;
  stop(): Promise<Blob>;
}

async function beginRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const { mime, ext } = pickAudioFormat();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start();

  return {
    ext,
    stop() {
      return new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          // Release the microphone as soon as the recorder is done — leaving
          // the track live keeps the browser's recording indicator on.
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: mime || 'audio/webm' }));
        };
        if (rec.state === 'inactive') rec.onstop!(new Event('stop'));
        else rec.stop();
      });
    },
  };
}

/**
 * One microphone at a time across the whole editor — two open at once
 * produces two overlapping transcripts of the same speech.
 *
 * This lives outside the DOM on purpose. Every state change re-renders the
 * block list, which destroys and rebuilds the buttons, so a state held on the
 * button element would be lost mid-recording. `wireMicButton` reads this on
 * each render and restores whatever phase the block is actually in.
 */
let micState: { blockId: string; phase: 'recording' | 'working'; stop: () => void } | null = null;

async function transcribeBlob(blob: Blob, ext: string): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, `voice.${ext}`);
  form.append('lang', 'uz');
  const res = await fetch(`${WORKER_URL}/api/agent/transcribe`, {
    method: 'POST',
    credentials: 'include',
    // No Content-Type: the browser must set the multipart boundary itself.
    headers: { ...authHeaders() },
    body: form,
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Transkripsiya xatosi');
  if (!data.polished) {
    // Say so rather than let it pass as corrected text: this is Whisper's raw
    // output, so the author should expect to punctuate it themselves.
    alert("Matn tuzatilmadi — tinish belgilarini o'zingiz qo'yishingiz kerak bo'ladi.");
  }
  return data.text as string;
}

/**
 * Appends rather than replaces, and writes to the block model rather than to
 * the textarea element — a re-render between starting and stopping the
 * recording would otherwise drop the result on the floor.
 */
function appendToBlock(block: Extract<Block, { type: 'text' }>, text: string) {
  block.content = block.content.trim() ? `${block.content.trim()}\n\n${text}` : text;
}

function wireMicButton(btn: HTMLButtonElement | null, block: Extract<Block, { type: 'text' }>) {
  if (!btn) return;

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    btn.disabled = true;
    btn.title = "Bu brauzer ovoz yozishni qo'llab-quvvatlamaydi";
    return;
  }

  if (micState) {
    if (micState.blockId !== block.id) {
      btn.disabled = true;
      btn.title = 'Boshqa blokda ovoz yozilmoqda';
      return;
    }
    if (micState.phase === 'working') {
      btn.disabled = true;
      btn.textContent = '⏳ Matnga...';
      return;
    }
    btn.textContent = "⏹ To'xtatish";
    btn.classList.add('recording');
    const stop = micState.stop;
    btn.addEventListener('click', () => stop());
    return;
  }

  btn.addEventListener('click', async () => {
    let recording: Recording;
    try {
      recording = await beginRecording();
    } catch (err) {
      alert('Mikrofonga ruxsat berilmadi yoki mikrofon topilmadi.\n\n' + (err as Error).message);
      return;
    }

    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      clearTimeout(limit);
      // Re-render into the working phase first, so the wait is visible on the
      // live button rather than on the one this closure captured, which the
      // render that started the recording already replaced.
      micState = { blockId: block.id, phase: 'working', stop: () => {} };
      render();
      try {
        const blob = await recording.stop();
        if (blob.size === 0) throw new Error('Ovoz yozilmadi — mikrofonni tekshiring.');
        appendToBlock(block, await transcribeBlob(blob, recording.ext));
      } catch (err) {
        alert("Ovozni matnga o'girib bo'lmadi: " + (err as Error).message);
      } finally {
        micState = null;
        render();
      }
    };

    const limit = setTimeout(() => {
      alert("10 daqiqalik chegaraga yetdi — yozuv to'xtatildi va matnga o'girilmoqda.");
      void finish();
    }, MAX_RECORDING_MS);

    micState = { blockId: block.id, phase: 'recording', stop: () => void finish() };
    // Re-render so every other block's mic button locks while this one runs.
    render();
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
        html += `<div class="preview-block"><img src="${escapeHtml(b.url)}" alt="${escapeHtml(b.alt || '')}"></div>`;
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
        // Alt lives inside the markdown, not beside it — that is what makes
        // it trilingual for free: translation runs over the whole body, so
        // en.md and ru.md get translated alt text without a separate field or
        // extra generation call. Moving this into frontmatter would silently
        // break that.
        body += `![${markdownAlt(b.alt)}](${b.url})\n\n`;
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

/* ---------- THE PUBLISH GATE ----------
   Everything the model wrote, in one panel, editable, before any of it is
   written anywhere. The author writes Uzbek and does not necessarily read the
   Russian or English that goes out under their name — so this panel is the
   place where they can, and where a bad translation is caught before it is
   live rather than after.

   Resolves with the (possibly edited) text on Nashr qil, or null on cancel.
   Nothing in here touches GitHub or Telegram; the caller does that, after. */

interface PublishReview {
  channel: string;
  meta: string;
  translations: Translated[];
}

function openPublishReview(draft: PublishReview): Promise<PublishReview | null> {
  const modal = document.getElementById('publishReviewModal');
  const body = document.getElementById('publishReviewBody');
  const okBtn = document.getElementById('publishConfirmBtn') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('publishCancelBtn') as HTMLButtonElement | null;

  // No panel in the DOM means no gate, and no gate means unreviewed text would
  // publish silently. Refuse instead: a failed publish the author can retry
  // beats one that quietly skipped the review they asked for.
  if (!modal || !body || !okBtn || !cancelBtn) {
    return Promise.reject(new Error("Ko'rib chiqish oynasi topilmadi — nashr to'xtatildi."));
  }

  body.innerHTML = `
    <label class="review-label">Telegram kanal uchun xulosa</label>
    <textarea id="prChannel" class="review-input" rows="5"></textarea>

    <label class="review-label">Qisqacha tavsif — sayt, RSS, Google (160 belgi)</label>
    <textarea id="prMeta" class="review-input" rows="2"></textarea>
    ${draft.translations
      .map(
        (tr) => `
      <div class="pr-lang">
        <label class="review-label">${tr.lang.toUpperCase()} — sarlavha</label>
        <input type="text" class="review-input" data-tr-title="${tr.lang}">
        <label class="review-label">${tr.lang.toUpperCase()} — qisqacha tavsif</label>
        <textarea class="review-input" data-tr-excerpt="${tr.lang}" rows="2"></textarea>
        <label class="review-label">${tr.lang.toUpperCase()} — matn</label>
        <textarea class="review-input review-body" data-tr-body="${tr.lang}" rows="10"></textarea>
      </div>`
      )
      .join('')}
    ${
      draft.translations.length < 2
        ? `<div class="pr-warn">⚠ Ba'zi tillar tarjima qilinmadi — post ularsiz chiqadi. Keyinroq qayta nashr qilsangiz qo'shiladi.</div>`
        : ''
    }
  `;

  // Values are assigned as properties, never interpolated into the markup
  // above: model output containing a quote or a </textarea> would otherwise
  // break out of the element it is supposed to sit inside.
  (document.getElementById('prChannel') as HTMLTextAreaElement).value = draft.channel;
  (document.getElementById('prMeta') as HTMLTextAreaElement).value = draft.meta;
  draft.translations.forEach((tr) => {
    (body.querySelector(`[data-tr-title="${tr.lang}"]`) as HTMLInputElement).value = tr.title;
    (body.querySelector(`[data-tr-excerpt="${tr.lang}"]`) as HTMLTextAreaElement).value = tr.excerpt;
    (body.querySelector(`[data-tr-body="${tr.lang}"]`) as HTMLTextAreaElement).value = tr.markdown;
  });

  modal.style.display = 'flex';

  return new Promise((resolve) => {
    const close = (result: PublishReview | null) => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => {
      close({
        channel: (document.getElementById('prChannel') as HTMLTextAreaElement).value.trim(),
        meta: (document.getElementById('prMeta') as HTMLTextAreaElement).value.trim().slice(0, 160),
        translations: draft.translations.map((tr) => ({
          lang: tr.lang,
          title: (body.querySelector(`[data-tr-title="${tr.lang}"]`) as HTMLInputElement).value.trim(),
          excerpt: (body.querySelector(`[data-tr-excerpt="${tr.lang}"]`) as HTMLTextAreaElement).value.trim(),
          markdown: (body.querySelector(`[data-tr-body="${tr.lang}"]`) as HTMLTextAreaElement).value,
          // An emptied language is a deliberate "don't publish this one".
        })).filter((tr) => tr.title && tr.markdown.trim()),
      });
    };
    const onCancel = () => close(null);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

/* ---------- PUBLISH ----------
   The author writes one post, in Uzbek. Everything else — the English and
   Russian versions, the channel announcement, the meta description — is
   generated from it here, in one pass, and then shown to the author before
   anything is written anywhere.

   The order matters and is deliberate: generate first, gate second, write
   third. Nothing reaches GitHub or Telegram until the author has read the
   generated text and clicked Nashr qil, so cancelling leaves no half-published
   post behind — no Uzbek page live without its translations, no channel
   message pointing at a post that was never committed.

   That click is also what keeps D6 intact. The model proposes; the author
   approves; the author's own client does the writing. */

type Translated = { lang: 'en' | 'ru'; title: string; excerpt: string; markdown: string };

async function generateSummary(title: string, markdown: string): Promise<{ channel: string; meta: string }> {
  const res = await fetch(`${WORKER_URL}/api/agent/summary`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title, markdown }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Xulosa xatosi');
  return { channel: data.channel, meta: data.meta };
}

async function generateTranslation(
  slug: string,
  lang: 'en' | 'ru',
  title: string,
  excerpt: string,
  markdown: string
): Promise<Translated> {
  const res = await fetch(`${WORKER_URL}/api/agent/translate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ slug, targetLang: lang, title, excerpt, markdown }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Tarjima xatosi');
  return { lang, title: data.title || title, excerpt: data.excerpt || '', markdown: data.markdown || '' };
}

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

  // The Astro permalink, not v1's /posts/<slug>.html — that page is no longer
  // generated for new posts, so linking the channel at it would 404.
  const postUrl = `${SITE_URL}/uz/posts/${slug}/`;
  const coverImage = getCoverImage();
  const sourceMarkdown = currentSourceMarkdown();

  document.getElementById('processLog')!.textContent = '';
  showLog();
  const genBtn = document.getElementById('generateBtn') as HTMLButtonElement;
  genBtn.disabled = true;

  try {
    appendLog(`Slug: ${slug}`);

    /* ---- 1. Summaries ---- */
    appendLog('Xulosa yozilmoqda...');
    let channel = '';
    let meta = '';
    try {
      const summary = await generateSummary(title, sourceMarkdown);
      channel = summary.channel;
      meta = summary.meta;
      appendLog('✓ Xulosa tayyor');
    } catch (err) {
      // Degrade to the old two-sentence cut rather than block the publish —
      // but say so, because that cut is exactly what the summary replaced and
      // the author will want to rewrite it in the review panel below.
      appendLog('⚠ Xulosa yozilmadi (' + (err as Error).message + ') — matnning boshi ishlatilmoqda, tekshiring.');
      channel = getExcerpt();
      meta = getExcerpt().slice(0, 160);
    }

    /* ---- 2. Translations ---- */
    // Sequential, not parallel: two full-length translations at once collide
    // with Groq's tokens-per-minute limit, and the log reads as progress
    // rather than as a stall.
    const translations: Translated[] = [];
    for (const lang of ['en', 'ru'] as const) {
      appendLog(`${lang.toUpperCase()} tarjima qilinmoqda...`);
      try {
        translations.push(await generateTranslation(slug, lang, title, meta, sourceMarkdown));
        appendLog(`✓ ${lang.toUpperCase()} tayyor`);
      } catch (err) {
        // One failed language must not cost the other two. Astro builds a page
        // per file that exists, so a missing en.md means no English page for
        // this post — not a broken build.
        appendLog(`⚠ ${lang.toUpperCase()} tarjima qilinmadi (` + (err as Error).message + ') — bu tilsiz davom etamiz.');
      }
    }

    /* ---- 3. The gate ---- */
    appendLog('');
    appendLog("Ko'rib chiqish kutilmoqda...");
    const approved = await openPublishReview({ channel, meta, translations });
    if (!approved) {
      appendLog('Bekor qilindi — hech narsa yozilmadi.');
      return;
    }
    channel = approved.channel;
    meta = approved.meta;

    /* ---- 4. Writes ---- */
    appendLog('');
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
    const index: any[] = indexFile ? JSON.parse(indexFile.content) : [];
    const entry = {
      slug,
      title,
      excerpt: meta,
      cover_image: coverImage,
      created_at: currentCreatedAt,
      updated_at: nowIso,
      telegram_message_id: currentTelegramMsgId,
      telegram_has_media: currentTelegramHasMedia,
    };
    const existingIdx = index.findIndex((p) => p.slug === slug);
    if (existingIdx >= 0) index[existingIdx] = entry;
    else index.push(entry);
    const indexPutResult = await ghPutFileSafe(
      'posts.json',
      JSON.stringify(index, null, 2),
      `Update posts index: ${title}`,
      indexFile ? indexFile.sha : null
    );
    let indexSha = indexPutResult.content.sha;
    appendLog('✓ posts.json yangilandi');

    const mdPath = `src/content/posts/${slug}/uz.md`;
    appendLog('uz.md yozilmoqda...');
    const existingMdFile = isEdit ? await ghGetFile(mdPath) : null;
    const mdContent = generatePostMarkdown(
      title, meta, coverImage, currentCreatedAt!, nowIso, currentTelegramMsgId, currentTelegramHasMedia
    );
    const mdPutResult = await ghPutFileSafe(
      mdPath, mdContent, `${isEdit ? 'Update' : 'Create'} post: ${title}`, existingMdFile ? existingMdFile.sha : null
    );
    let mdSha: string | null = mdPutResult.content.sha;
    appendLog('✓ ' + mdPath + ' saqlandi');

    for (const tr of approved.translations) {
      const path = `src/content/posts/${slug}/${tr.lang}.md`;
      appendLog(`${tr.lang}.md yozilmoqda...`);
      const existing = await ghGetFile(path);
      const md = generateTranslationMarkdown(
        tr.title, tr.excerpt, coverImage, currentCreatedAt!, nowIso, tr.markdown
      );
      await ghPutFileSafe(
        path, md, `${existing ? 'Update' : 'Add'} ${tr.lang} translation: ${title}`, existing ? existing.sha : null
      );
      appendLog('✓ ' + path + ' saqlandi');
    }

    /* ---- 5. The channel ---- */
    let telegramUpdated = false;
    if (currentTelegramMsgId) {
      try {
        appendLog('Telegram xabari tahrirlanmoqda...');
        await tgEditPost(currentTelegramMsgId, title, channel, coverImage, postUrl, currentTelegramHasMedia);
        appendLog('✓ Telegram xabari yangilandi');
        telegramUpdated = true;
      } catch (err) {
        appendLog("⚠ Telegram xabarini tahrirlab bo'lmadi (" + (err as Error).message + '), yangi xabar yuborilmoqda...');
      }
    }
    if (!telegramUpdated) {
      appendLog('Telegram kanaliga yuborilmoqda...');
      const msgId = await tgSendPost(title, channel, coverImage, postUrl);
      currentTelegramMsgId = msgId;
      currentTelegramHasMedia = !!coverImage;
      appendLog("✓ Telegram'ga yuborildi (message_id: " + msgId + ')');

      // The id only exists after the send, so the three files that carry it
      // are rewritten once here rather than being written twice by default.
      appendLog('telegram_message_id yozilmoqda...');
      (entry as any).telegram_message_id = msgId;
      (entry as any).telegram_has_media = currentTelegramHasMedia;
      index[index.findIndex((p) => p.slug === slug)] = entry;
      const indexPutResult2 = await ghPutFileSafe(
        'posts.json', JSON.stringify(index, null, 2), `Set telegram id: ${title}`, indexSha
      );
      indexSha = indexPutResult2.content.sha;

      (postData as any).telegram_message_id = msgId;
      (postData as any).telegram_has_media = currentTelegramHasMedia;
      const dataPutResult2 = await ghPutFileSafe(
        `posts-data/${slug}.json`, JSON.stringify(postData, null, 2), `Set telegram id: ${title}`, postDataSha
      );
      postDataSha = dataPutResult2.content.sha;

      const mdContent2 = generatePostMarkdown(
        title, meta, coverImage, currentCreatedAt!, nowIso, currentTelegramMsgId, currentTelegramHasMedia
      );
      const mdPutResult2 = await ghPutFileSafe(mdPath, mdContent2, `Set telegram id: ${title}`, mdSha);
      mdSha = mdPutResult2.content.sha;
      appendLog('✓ Yozildi');
    }

    currentSlug = slug;
    titleInput.disabled = true;
    document.getElementById('modeText')!.textContent = `Tahrirlash: ${title}`;
    setAgentButtonsEnabled(true);
    appendLog('');
    const langs = ['uz', ...approved.translations.map((tr) => tr.lang)].join(', ');
    appendLog(`Tayyor (${langs})! Post manzili: ${postUrl}`);
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
  // ?draft=id loads a draft captured from the Telegram bot (Phase 5 Stage 2).
  (async () => {
    const params = new URLSearchParams(window.location.search);

    const draftId = params.get('draft');
    if (draftId) {
      await loadCapturedDraft(draftId);
      return;
    }

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

/**
 * Loads a draft the author captured and approved in the Telegram bot, so they
 * can finish and publish it here. The bot only ever produced text — the post
 * still gets its slug, media and publish action from this editor, unchanged.
 */
async function loadCapturedDraft(draftId: string) {
  try {
    const res = await fetch(`${WORKER_URL}/api/drafts/get`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ id: draftId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Qoralamani yuklab bo\'lmadi');

    const titleInput = document.getElementById('titleInput') as HTMLInputElement;
    titleInput.value = data.draft.title || '';
    titleInput.disabled = false;

    idCounter = 0;
    blocks = [{ id: uid(), type: 'text', content: data.draft.markdown || '' }];
    currentSlug = null;
    currentCreatedAt = null;
    currentTelegramMsgId = null;
    currentTelegramHasMedia = false;
    document.getElementById('modeText')!.textContent = 'Telegram qoralamasi';
    setAgentButtonsEnabled(false); // no slug yet — publish first, then translate
    render();
  } catch (err) {
    alert("Qoralamani yuklab bo'lmadi: " + (err as Error).message);
  }
}
