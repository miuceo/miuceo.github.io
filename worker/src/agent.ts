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
  /**
   * Skip the second (title/excerpt) call. Halves latency, which matters for
   * the Telegram bot: a capture has a placeholder title the author replaces in
   * the Mini App anyway, and two sequential reasoning-model calls exceeded the
   * runtime's budget for post-response work.
   */
  skipMeta?: boolean;
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
async function callChatCompletions(
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string
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
      max_tokens: MAX_OUTPUT_TOKENS,
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

/**
 * Walks every configured model of every provider in order. Rate limits and
 * transient provider errors are a normal path, not an exception (SKILLS.md
 * `agent-task` step 5) — each failure just advances to the next candidate.
 * Only when every candidate is exhausted does this throw.
 */
export async function runAgent(env: Env, task: AgentTask, input: AgentInput): Promise<AgentResult> {
  const providers: ProviderAttempt[] = [
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

  const failures: string[] = [];
  const bodyPrompt = buildBodyPrompt(task, input);

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
        const rawBody = await callChatCompletions(provider.endpoint, provider.apiKey, model, bodyPrompt);
        const markdown = stripFences(stripReasoning(rawBody));

        if (!markdown) {
          throw new Error(`${model} returned only reasoning, no document`);
        }
        if (looksLikeScaffolding(markdown)) {
          throw new Error(`${model} returned scaffolding instead of prose: ${markdown.slice(0, 120)}`);
        }

        // Title/excerpt are short and independent. If this second call fails,
        // it must not throw away a perfectly good body — fall back to the
        // originals and let the author edit two short fields in the review
        // modal. That is a real graceful degradation, unlike the one this
        // function used to do for the body.
        let title = input.title;
        let excerpt = input.excerpt || '';
        if (input.skipMeta) {
          return { title, excerpt, markdown, provider: provider.name, model };
        }
        try {
          const rawMeta = await callChatCompletions(
            provider.endpoint,
            provider.apiKey,
            model,
            buildMetaPrompt(task, input)
          );
          const meta = parseMeta(stripReasoning(rawMeta));
          if (meta.title) title = meta.title;
          if (meta.excerpt) excerpt = meta.excerpt;
        } catch (metaErr) {
          console.warn(`meta call failed for ${model}, keeping originals: ${(metaErr as Error).message}`);
        }

        return { title, excerpt, markdown, provider: provider.name, model };
      } catch (err) {
        failures.push(`${provider.name}/${model}: ${(err as Error).message}`);
      }
    }
  }

  throw new Error(`All agent providers failed. ${failures.join(' | ')}`);
}
