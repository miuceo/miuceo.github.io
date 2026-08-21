import type { Env, Lang } from './types';

/**
 * The ONLY file that knows an LLM provider exists (ARCHITECTURE.md §10,
 * SKILLS.md `agent-task` step 2). Feature code calls `runAgent` and never
 * imports a provider SDK or hardcodes a model id.
 *
 * This module deliberately does NOT import ./github or ./telegram. The agent
 * produces text and nothing else; it has no path to publishing anything
 * (D6, CLAUDE.md rule 3 — the boundary is the absent capability, not a
 * system prompt). Do not add such an import.
 *
 * Provider order for text is Groq first, then OpenRouter — following §10's
 * per-task routing table rather than its generic ladder, because the free
 * tiers differ by an order of magnitude: OpenRouter allows ~50 requests/day
 * without a one-time $10 credit purchase, while Groq allows ~14,400/day with
 * no card at all. Spending the scarce quota on plain text translation would
 * be backwards; OpenRouter is reserved as fallback here and as the primary
 * for multimodal work later, where D11 actually requires it.
 */

export type AgentTask = 'translate' | 'improve';

export interface AgentInput {
  title: string;
  excerpt?: string;
  markdown: string;
  targetLang?: Lang;
}

export interface AgentResult {
  title: string;
  excerpt: string;
  markdown: string;
  provider: string;
  model: string;
}

/**
 * Rejected before any provider call. Sized against the *output* budget, not
 * the context window: a translation is roughly as long as its source, and
 * MAX_OUTPUT_TOKENS has to cover that plus any reasoning tokens the model
 * emits. The first version of this file allowed 24,000 chars, which silently
 * produced truncated replies on a long post — see the header comment on
 * parseModelOutput.
 */
export const MAX_INPUT_CHARS = 20000;

/**
 * Sized from the real limits, not guessed: gpt-oss-120b on Groq allows 65,536
 * output tokens against a 131,072 context, so this is well inside them.
 *
 * The budget that matters is output. 20,000 chars of English source becomes
 * roughly 22,000 chars of Russian (Cyrillic runs longer), and Cyrillic
 * tokenises at about 2 chars/token — so ~11,000 tokens of document, plus a
 * few thousand reasoning tokens. 32,000 leaves roughly 2x headroom.
 *
 * Raising the cap is only safe because truncation is now a hard failure
 * (finish_reason=length throws and advances the ladder). Before that fix an
 * over-large cap meant silently published garbage; now the worst case is a
 * clear error.
 */
const MAX_OUTPUT_TOKENS = 32000;

/* ---------- Speech to text ----------
   Groq whisper-large-v3, per §10's routing table. Kept behind this same
   interface so no feature code talks to a provider directly (SKILLS.md
   `agent-task` step 2). Free-tier limits: 25 MB per file, 20 req/min,
   28,800 audio-seconds/day. */

/** Groq's hard per-file limit. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface TranscriptResult {
  text: string;
  language: string | null;
  model: string;
}

/**
 * Language is detected, never assumed — the author speaks all three
 * (SKILLS.md `voice-pipeline` step 3), so `verbose_json` is used to read the
 * detected language back rather than passing one in.
 */
/**
 * Groq accepts flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm — and decides
 * from the *filename extension*, not the bytes.
 *
 * Telegram delivers voice notes as `.oga`, which is Ogg/Opus in an extension
 * Groq does not list, so every voice note was rejected. Same container, wrong
 * label: renaming it to `.ogg` is accurate, not a trick.
 */
const GROQ_AUDIO_EXTS = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];

export function normaliseAudioFilename(filename: string): string {
  const base = (filename.split('/').pop() || 'audio').replace(/\?.*$/, '');
  const ext = (base.split('.').pop() || '').toLowerCase();
  if (GROQ_AUDIO_EXTS.includes(ext)) return base;
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  // .oga and .opus are both Ogg containers; anything else unknown is a better
  // bet as ogg than as a rejected extension.
  return `${stem}.ogg`;
}

function audioMimeFor(filename: string): string {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    ogg: 'audio/ogg', mp3: 'audio/mpeg', mpeg: 'audio/mpeg', mpga: 'audio/mpeg',
    m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Whisper accepts a short `prompt` that biases spelling and vocabulary. For
 * Uzbek this matters more than usual: without it the model tends to drift
 * toward Turkish orthography and drop the ʻ modifiers in oʻ/gʻ.
 */
const STT_PROMPTS: Record<string, string> = {
  uz:
    "O'zbek tilida, lotin alifbosida yozilgan texnik blog. Imlo namunalari: o'zbek, g'oya, ta'lim, " +
    "san'at, kompyuter, ovozli, matn, yozib olinmoqda, bundan tashqari, narsalar, ma'lumot, " +
    "dastur, tarmoq, ma'lumotlar bazasi, sun'iy intellekt, AI, machine learning, backend, model.",
  ru: 'Текст на русском языке. Технические термины: AI, machine learning, backend.',
  en: 'A technical blog post in English about AI, machine learning and backend engineering.',
};

export async function transcribeAudio(
  env: Env,
  audio: ArrayBuffer,
  filename: string,
  language?: string | null
): Promise<TranscriptResult> {
  if (!env.GROQ_API_KEY) throw new Error('transcribe: GROQ_API_KEY not configured');
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`transcribe: file too large (${audio.byteLength} bytes)`);
  }

  const model = (env.GROQ_STT_MODEL || 'whisper-large-v3').trim();
  const safeName = normaliseAudioFilename(filename);
  const form = new FormData();
  // Type derived from the (normalised) extension rather than hardcoded, so an
  // mp3 or m4a is not mislabelled as ogg.
  form.append('file', new Blob([audio], { type: audioMimeFor(safeName) }), safeName);
  form.append('model', model);
  form.append('response_format', 'verbose_json');

  // Pinning the language skips detection entirely. That is the single biggest
  // lever for Uzbek, which is routinely detected as Turkish or Azerbaijani —
  // and once that happens the entire note is decoded with the wrong phonetics.
  if (language && language !== 'auto') {
    form.append('language', language);
    const hint = STT_PROMPTS[language];
    if (hint) form.append('prompt', hint);
  }

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`transcribe ${model} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as { text?: string; language?: string };
  const text = (data.text || '').trim();
  if (!text) throw new Error(`transcribe ${model} returned empty text`);
  return { text, language: data.language ?? null, model };
}

const LANG_NAMES: Record<Lang, string> = {
  uz: 'Uzbek (Latin script)',
  en: 'English',
  ru: 'Russian',
};

function parseModelList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * The body is requested as plain Markdown, NOT wrapped in JSON.
 *
 * Asking a model to return a multi-kilobyte Markdown document as a JSON
 * string value is needlessly fragile: every newline and quote has to survive
 * escaping, and a reply truncated anywhere in the middle yields nothing
 * parseable at all. Plain text has no such failure mode — a truncated reply
 * is still valid Markdown, and truncation is detected separately via
 * finish_reason. Title and excerpt are short, so they get their own tiny
 * call where JSON is cheap and safe.
 */
/**
 * Explicit fences around the source document. The first version delimited it
 * with a bare `---`, which models echoed back as the first line of their
 * answer — and a body starting with `---` collides with YAML frontmatter once
 * it is written into a .md file. Named markers are unambiguous and are
 * stripped from the reply by `stripFences` regardless.
 */
const DOC_START = '<<<DOCUMENT';
const DOC_END = 'DOCUMENT>>>';

const PRESERVE_RULES =
  'Preserve every Markdown construct exactly: heading levels, lists, links, ' +
  'image syntax ![](url), code blocks and their language tags, blockquotes and ' +
  'tables. Never translate, alter or drop a URL. ' +
  'Output ONLY the resulting Markdown — no preamble, no explanation, no code fence ' +
  'around the whole document, no commentary about what you did.';

function buildBodyPrompt(task: AgentTask, input: AgentInput): string {
  if (task === 'translate') {
    const target = LANG_NAMES[input.targetLang || 'en'];
    return (
      `Translate the Markdown document below into ${target}.\n\n` +
      `Keep the author's voice and register — this is a personal technical blog, not ` +
      `marketing copy. Do not summarise, do not expand, do not add commentary. ` +
      `Technical terms and product names stay in their original form.\n${PRESERVE_RULES}\n\n` +
      `${DOC_START}\n${input.markdown}\n${DOC_END}`
    );
  }
  return (
    `Improve the writing of the Markdown document below without changing its meaning, ` +
    `its language, or its structure. Fix grammar, awkward phrasing and typos. Keep the ` +
    `author's voice. Do not add new claims, do not remove content.\n${PRESERVE_RULES}\n\n` +
    `${DOC_START}\n${input.markdown}\n${DOC_END}`
  );
}

function buildMetaPrompt(task: AgentTask, input: AgentInput): string {
  const instruction =
    task === 'translate'
      ? `Translate the title and excerpt below into ${LANG_NAMES[input.targetLang || 'en']}.`
      : 'Improve the wording of the title and excerpt below, keeping the same language and meaning.';
  return (
    `${instruction}\n\n` +
    'Respond with ONLY a JSON object, no code fence:\n' +
    '{"title": "...", "excerpt": "..."}\n\n' +
    `TITLE: ${input.title}\n` +
    `EXCERPT: ${input.excerpt || ''}`
  );
}

/**
 * Reasoning models (gpt-oss among them) emit a <think> block before the real
 * answer. Strip it, or it ends up in the article body.
 */
function stripReasoning(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '') // truncated mid-think — nothing usable follows
    .trim();
}

/**
 * Removes scaffolding models tend to echo: our own document markers, a code
 * fence wrapped around the whole answer, and a leading `---`.
 *
 * The `---` case is not cosmetic: the result is written straight into a .md
 * file below YAML frontmatter, so a body beginning with `---` produces a
 * malformed document.
 */
function stripFences(text: string): string {
  let out = text.trim();
  out = out.replace(new RegExp(`^${DOC_START}\\s*`), '').replace(new RegExp(`\\s*${DOC_END}$`), '');

  // A fence around the entire answer (```markdown … ```), not fences inside it.
  const whole = out.match(/^```(?:\w+)?\s*\n([\s\S]*)\n```$/);
  if (whole && whole[1]) out = whole[1];

  out = out.replace(/^---\s*\n/, '');
  return out.trim();
}

/**
 * Rejects output that is obviously machine scaffolding rather than prose.
 *
 * This exists because of a real incident: the first version of this file
 * treated any parse failure as "fall back to using the raw output as the
 * body", on the theory that raw text beats an error. That was wrong. When a
 * reply was truncated mid-JSON or mid-<think>, the fallback produced
 * plausible-looking garbage — a chain-of-thought transcript, or a literal
 * `{"title":"...` string — which then got published. Failing loudly is
 * strictly better than handing the author something that looks saveable.
 */
function looksLikeScaffolding(text: string): boolean {
  const head = text.slice(0, 200).trimStart();
  return head.startsWith('{') || head.startsWith('<think') || /^"?(title|excerpt|body)"?\s*:/i.test(head);
}

/** Title/excerpt only — small enough that JSON is safe here. */
function parseMeta(raw: string): { title?: string; excerpt?: string } {
  let candidate = raw.trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) candidate = fenced[1].trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return {};

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt.trim() : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Both providers speak the OpenAI chat-completions shape, so one caller
 * covers them. Throws with provider detail for the server log; index.ts's
 * catch-all collapses it to a generic message before it reaches a client.
 */
/**
 * Either a plain prompt string, or OpenAI-shaped content parts for vision
 * calls. Both providers accept the same shape, so one caller covers text and
 * image work.
 */
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
type ChatContent = string | ContentPart[];

async function callChatCompletions(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: ChatContent,
  maxTokens: number = MAX_OUTPUT_TOKENS
): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    throw new Error(`${model} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const choice = data.choices?.[0];

  // The bug that shipped broken translations: a reply cut off at the output
  // limit still arrives as HTTP 200 with usable-looking content. Treat it as
  // a hard failure so the ladder tries the next candidate instead of handing
  // back half a document.
  if (choice?.finish_reason === 'length') {
    throw new Error(`${model} truncated at the output limit (finish_reason=length)`);
  }

  const content = choice?.message?.content;
  if (!content) throw new Error(`${model} returned no content`);
  return content;
}

interface ProviderAttempt {
  name: string;
  endpoint: string;
  apiKey: string;
  models: string[];
}

function textProviders(env: Env): ProviderAttempt[] {
  return [
    {
      name: 'groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: env.GROQ_API_KEY,
      models: parseModelList(env.GROQ_TEXT_MODELS),
    },
    {
      name: 'openrouter',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: env.OPENROUTER_API_KEY,
      models: parseModelList(env.OPENROUTER_TEXT_MODELS),
    },
  ];
}

interface LadderSuccess {
  text: string;
  providerName: string;
  model: string;
  endpoint: string;
  apiKey: string;
}

/**
 * Walks every configured model of every provider in order. Rate limits and
 * transient provider errors are a normal path, not an exception (SKILLS.md
 * `agent-task` step 5) — each failure just advances to the next candidate.
 * Only when every candidate is exhausted does this throw.
 *
 * `validate` both cleans the raw reply and rejects anything unusable (empty,
 * truncated-looking, scaffolding) — a thrown error there advances the ladder
 * exactly like a provider-level failure, it just came from the parsing side.
 * Shared by every text task here — each needs the same
 * Groq-first-then-OpenRouter fallback but a different prompt and a different
 * response shape.
 */
async function walkLadder(
  providers: ProviderAttempt[],
  content: ChatContent,
  validate: (raw: string) => string,
  maxTokens: number = MAX_OUTPUT_TOKENS
): Promise<LadderSuccess> {
  const failures: string[] = [];
  for (const provider of providers) {
    if (!provider.apiKey) {
      failures.push(`${provider.name}: no api key configured`);
      continue;
    }
    if (provider.models.length === 0) {
      failures.push(`${provider.name}: no models configured`);
      continue;
    }
    for (const model of provider.models) {
      try {
        const raw = await callChatCompletions(provider.endpoint, provider.apiKey, model, content, maxTokens);
        const text = validate(raw);
        return { text, providerName: provider.name, model, endpoint: provider.endpoint, apiKey: provider.apiKey };
      } catch (err) {
        failures.push(`${provider.name}/${model}: ${(err as Error).message}`);
      }
    }
  }
  throw new Error(`All providers failed. ${failures.join(' | ')}`);
}

/* ---------- Vision: alt text ----------
   The first place OpenRouter is genuinely primary rather than a fallback:
   Groq has no vision model, so §10's routing table sends image work here.
   §10 routes plain vision-language work to gemma and reserves the omni model
   for true multimodal reasoning, so the config list is ordered that way. */

export interface AltTextResult {
  alt: string;
  provider: string;
  model: string;
}

/** Screen readers want the content, not the word "image". */
function buildAltPrompt(lang: Lang): ContentPart {
  return {
    type: 'text',
    text:
      `Describe this image in ONE short factual sentence in ${LANG_NAMES[lang]}, ` +
      `for use as HTML alt text for a blind reader.\n` +
      `Describe only what is actually visible. If the image contains text or a chart, ` +
      `say what it states. Do not begin with "image of", "picture of" or similar. ` +
      `Do not speculate about meaning or context. Output the sentence and nothing else.`,
  };
}

export async function describeImage(env: Env, imageUrl: string, lang: Lang): Promise<AltTextResult> {
  const models = parseModelList(env.OPENROUTER_VISION_MODELS);
  if (!env.OPENROUTER_API_KEY) throw new Error('describeImage: OPENROUTER_API_KEY not configured');
  if (models.length === 0) throw new Error('describeImage: no vision models configured');

  const content: ChatContent = [buildAltPrompt(lang), { type: 'image_url', image_url: { url: imageUrl } }];
  const failures: string[] = [];

  for (const model of models) {
    try {
      const raw = await callChatCompletions(
        'https://openrouter.ai/api/v1/chat/completions',
        env.OPENROUTER_API_KEY,
        model,
        content
      );
      const alt = stripFences(stripReasoning(raw))
        .replace(/^["'`]+|["'`]+$/g, '') // models like to quote a one-line answer
        .split('\n')[0]!
        .trim();
      if (!alt) throw new Error(`${model} returned empty alt text`);
      return { alt, provider: 'openrouter', model };
    } catch (err) {
      failures.push(`openrouter/${model}: ${(err as Error).message}`);
    }
  }

  throw new Error(`All vision models failed. ${failures.join(' | ')}`);
}

const META_MAX_TOKENS = 1000;

export async function runAgent(env: Env, task: AgentTask, input: AgentInput): Promise<AgentResult> {
  const bodyPrompt = buildBodyPrompt(task, input);

  const body = await walkLadder(textProviders(env), bodyPrompt, (raw) => {
    const markdown = stripFences(stripReasoning(raw));
    if (!markdown) throw new Error('returned only reasoning, no document');
    if (looksLikeScaffolding(markdown)) {
      throw new Error(`returned scaffolding instead of prose: ${markdown.slice(0, 120)}`);
    }
    return markdown;
  });

  // Title/excerpt are short and independent. If this second call fails, it
  // must not throw away a perfectly good body — fall back to the originals
  // and let the author edit two short fields in the review modal. That is a
  // real graceful degradation, unlike the one this function used to do for
  // the body. Deliberately tied to the model that already succeeded above,
  // not a fresh ladder walk — a second full fallback pass here would double
  // the worst-case latency for a call whose failure is already recoverable.
  let title = input.title;
  let excerpt = input.excerpt || '';
  try {
    // A short JSON reply — the full MAX_OUTPUT_TOKENS budget is unnecessary
    // and actively harmful: Groq's per-minute token quota is checked against
    // the *requested* max_tokens, not actual usage, so asking for 32,000
    // tokens for a two-field JSON object was getting rejected outright
    // (429/413) even though the real reply is a few dozen tokens.
    const rawMeta = await callChatCompletions(
      body.endpoint, body.apiKey, body.model, buildMetaPrompt(task, input), META_MAX_TOKENS
    );
    const meta = parseMeta(stripReasoning(rawMeta));
    if (meta.title) title = meta.title;
    if (meta.excerpt) excerpt = meta.excerpt;
  } catch (metaErr) {
    console.warn(`meta call failed for ${body.model}, keeping originals: ${(metaErr as Error).message}`);
  }

  return { title, excerpt, markdown: body.text, provider: body.providerName, model: body.model };
}

/* ---------- Transcript reconstruction ----------
   Whisper is materially weaker in Uzbek than in English or Russian, and it
   fails in a specific, exploitable way: it produces a phonetically plausible
   string that is not Uzbek. "Ushbu kompiyutirdi, o'vazli matin yazib olim
   moqdi" is what came back for "Ushbu kompyuterda ovozli matn yozib
   olinmoqda" — every word recognisable by sound, almost none of them real
   words.

   That is recoverable, because the information is still in the string: a
   model that knows Uzbek can read the sounds and reconstruct the words. This
   task does exactly that, and nothing more. It is emphatically not `improve`
   — it does not restyle, shorten or edit the author's thinking, it only turns
   heard-sounds back into written Uzbek.

   An earlier version of this prompt told the model to leave garbled passages
   alone rather than "invent a replacement". That was the wrong instinct:
   it is the difference between a transcript the author can use and one they
   have to retype, and reconstruction from phonetics is not invention. The
   protection against invention is the guard below plus the fact that the
   author reads the result in their own editor before it is published. */

const POLISH_MAX_TOKENS = 8000;

/**
 * The guard that keeps reconstruction from becoming rewriting. A model asked
 * to fix text will sometimes summarise it instead, and a summary silently
 * replacing the author's dictation is the same class of failure as the
 * truncation incident `looksLikeScaffolding` exists to prevent.
 *
 * Length is crude but reliable for this: correcting words to their real
 * spellings moves the character count by a few percent in either direction,
 * never by half. The band is deliberately tighter on the low side, because
 * the dangerous failure is losing content, not gaining punctuation.
 */
function assertSameSubstance(original: string, rebuilt: string): void {
  const ratio = rebuilt.length / Math.max(original.length, 1);
  if (ratio < 0.75 || ratio > 1.4) {
    throw new Error(
      `reconstruction changed the text's length by too much (${original.length} → ${rebuilt.length} chars)`
    );
  }
}

const RECONSTRUCT_RULES: Record<Lang, string> = {
  uz:
    'This transcript is Uzbek dictated aloud, and the speech recogniser is weak at Uzbek: it wrote ' +
    'down what it HEARD, not real words. Your job is to read it phonetically and write what the ' +
    'speaker actually said, in correct Uzbek (Latin script).\n\n' +
    'The errors follow patterns. Fix all of them:\n' +
    "- Vowels swapped: a/o, i/u, e/i. \"matin\" → \"matn\", \"yazib\" → \"yozib\", \"boshqan\" → \"boshqa\".\n" +
    "- Missing or wrong modifiers: write oʻ and gʻ where the word needs them. \"o'vazli\" → \"ovozli\", " +
    '"kop" → "koʻp".\n' +
    '- Suffixes and case endings mangled or split off the wrong word. "yazib olim moqdi" → ' +
    '"yozib olinmoqda", "kompiyutirdi" → "kompyuterda".\n' +
    '- Word boundaries in the wrong place — sounds run together or split apart. "arsanar xan" → ' +
    '"narsalar ham".\n' +
    '- Borrowed and technical terms mangled: restore the normal spelling ("kompyuter", "internet", ' +
    '"model", "server"). English technical terms stay in English.\n\n' +
    'Worked example — this exact input:\n' +
    "  Ushbu kompiyutirdi, o'vazli matin yazib olim moqdi.\n" +
    'must become:\n' +
    '  Ushbu kompyuterda ovozli matn yozib olinmoqda.\n\n' +
    'Every content word there was wrong and every one was recoverable from its sound. Be that ' +
    'thorough. A sentence that still contains a non-word means you did not finish.',
  en:
    'This transcript is English dictated aloud. Fix mis-heard words using the surrounding sense, ' +
    'restore the normal spelling of technical terms and proper nouns, and repair word boundaries.',
  ru:
    'This transcript is Russian dictated aloud. Fix mis-heard words using the surrounding sense, ' +
    'restore the normal spelling of technical terms and proper nouns, and repair word boundaries.',
};

/**
 * Turns a raw speech-to-text transcript back into correct prose. Returns the
 * text only — like everything else in this file it proposes text and has no
 * way to store or publish it.
 */
export async function polishTranscript(env: Env, raw: string, lang: Lang = 'uz'): Promise<string> {
  const source = raw.trim();
  if (!source) throw new Error('polish: empty transcript');

  const prompt =
    `You are correcting a speech-to-text transcript for the author of a personal technical blog. ` +
    `It will be pasted straight into their editor.\n\n` +
    `${RECONSTRUCT_RULES[lang]}\n\n` +
    `Then make it readable:\n` +
    `- Add sentence punctuation and capitalisation.\n` +
    `- Break it into paragraphs where the speaker changes subject.\n\n` +
    `Hard limits. The speaker's words are the content; you are fixing how they were heard, not ` +
    `what they said:\n` +
    `- Keep every sentence, in the same order, in the same language.\n` +
    `- Do NOT summarise, shorten, expand, or rephrase for style.\n` +
    `- Do NOT add a fact, an opinion, an example or a conclusion that is not already there.\n` +
    `- If a passage is so garbled that no reading is plausible, write the closest real words you ` +
    `can and leave it at that — never replace it with something you made up.\n` +
    `- If a sentence is already correct, leave it exactly as it is.\n\n` +
    `Output ONLY the corrected text — no preamble, no explanation, no notes about what you ` +
    `changed, no code fence.\n\n` +
    `${DOC_START}\n${source}\n${DOC_END}`;

  const result = await walkLadder(
    textProviders(env),
    prompt,
    (rawReply) => {
      const text = stripFences(stripReasoning(rawReply));
      if (!text) throw new Error('reconstruction returned nothing');
      if (looksLikeScaffolding(text)) throw new Error('reconstruction returned scaffolding');
      assertSameSubstance(source, text);
      return text;
    },
    POLISH_MAX_TOKENS
  );
  return result.text;
}

/* ---------- Post summaries ----------
   Two summaries of the same post, for two places with genuinely different
   limits, produced in one call because they need the same reading of the
   article and a second call would double both latency and free-tier spend. */

const SUMMARY_MAX_TOKENS = 2000;

/** Google truncates a description around here, so a 3-4 sentence summary
 * cannot serve both this and the Telegram post. */
const MAX_META_EXCERPT_CHARS = 160;

export interface PostSummary {
  /** 3-4 sentences. The body of the Telegram channel announcement. */
  channel: string;
  /** One sentence. meta description, RSS, and the post card on the index. */
  meta: string;
  provider: string;
  model: string;
}

function buildSummaryPrompt(title: string, markdown: string): string {
  return (
    `Read the blog post below and write two summaries of it, both in the same language as the post ` +
    `itself.\n\n` +
    `1. "channel": 3 to 4 complete sentences, for a Telegram channel announcement. Say what the post ` +
    `is actually about and what a reader gets from it. Write it as prose the author would write — no ` +
    `hashtags, no emoji, no "in this article we will", no marketing tone, no call to action.\n` +
    `2. "meta": ONE sentence, at most ${MAX_META_EXCERPT_CHARS} characters, for the page's meta ` +
    `description and RSS feed.\n\n` +
    `Do not invent anything that is not in the post.\n\n` +
    `Respond with ONLY a JSON object, no code fence:\n` +
    `{"channel": "...", "meta": "..."}\n\n` +
    `TITLE: ${title}\n\n${DOC_START}\n${markdown}\n${DOC_END}`
  );
}

/**
 * Replaces post-builder's old getExcerpt(), which took the first two
 * sentences and cut them at 240 characters — so a post opening with a
 * scene-setting anecdote announced itself to the channel with the anecdote
 * and nothing else.
 */
export async function summarisePost(env: Env, title: string, markdown: string): Promise<PostSummary> {
  const result = await walkLadder(
    textProviders(env),
    buildSummaryPrompt(title, markdown),
    (raw) => {
      const parsed = parseSummary(stripReasoning(raw));
      // Carried through walkLadder as JSON and split apart by the caller:
      // `validate` is typed to return one string, and inventing a second
      // ladder for a two-field result would be worse than re-parsing once.
      return JSON.stringify(parsed);
    },
    SUMMARY_MAX_TOKENS
  );
  const { channel, meta } = JSON.parse(result.text) as { channel: string; meta: string };
  return { channel, meta, provider: result.providerName, model: result.model };
}

function parseSummary(raw: string): { channel: string; meta: string } {
  let candidate = raw.trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) candidate = fenced[1].trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('summary: no JSON object in reply');

  const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  const channel = typeof parsed.channel === 'string' ? parsed.channel.trim() : '';
  const meta = typeof parsed.meta === 'string' ? parsed.meta.trim() : '';

  // A missing field is a hard failure, not something to paper over with the
  // other one: the two serve different places and a 4-sentence meta
  // description or a one-line channel post is a worse outcome than an error
  // the author can retry.
  if (!channel) throw new Error('summary: no channel summary in reply');
  if (!meta) throw new Error('summary: no meta description in reply');

  return { channel, meta: meta.slice(0, MAX_META_EXCERPT_CHARS) };
}
