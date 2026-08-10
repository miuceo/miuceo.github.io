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

/** Rejected before any provider call — see the cap rationale in index.ts. */
export const MAX_INPUT_CHARS = 24000;

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

function buildPrompt(task: AgentTask, input: AgentInput): string {
  const shape =
    'Respond with ONLY a JSON object, no prose and no code fence, shaped exactly:\n' +
    '{"title": "...", "excerpt": "...", "body": "..."}\n' +
    'The "body" value is Markdown. Preserve every Markdown construct from the source ' +
    'exactly: heading levels, lists, links, image syntax ![](url), code blocks and their ' +
    'language tags, blockquotes and tables. Never translate, alter or drop a URL.';

  if (task === 'translate') {
    const target = LANG_NAMES[input.targetLang || 'en'];
    return (
      `Translate the following blog post into ${target}.\n\n` +
      `Translate the title, the excerpt and the body. Keep the author's voice and register — ` +
      `this is a personal technical blog, not marketing copy. Do not summarise, do not expand, ` +
      `do not add commentary. Technical terms and product names stay in their original form.\n\n` +
      `${shape}\n\n` +
      `TITLE: ${input.title}\n` +
      `EXCERPT: ${input.excerpt || ''}\n` +
      `BODY:\n${input.markdown}`
    );
  }

  return (
    `Improve the writing of the following blog post without changing its meaning, ` +
    `its language, or its structure. Fix grammar, awkward phrasing and typos. Keep the ` +
    `author's voice. Do not add new claims, do not remove content, do not add commentary.\n\n` +
    `${shape}\n\n` +
    `TITLE: ${input.title}\n` +
    `EXCERPT: ${input.excerpt || ''}\n` +
    `BODY:\n${input.markdown}`
  );
}

/**
 * Small models frequently wrap JSON in a code fence or add a sentence before
 * it, so parse defensively. A parse failure is NOT treated as a hard failure:
 * we fall back to using the raw output as the body and keeping the original
 * title, which is far more useful to the author than an error — they review
 * everything before it goes anywhere regardless (D6).
 */
function parseModelOutput(raw: string, input: AgentInput): { title: string; excerpt: string; markdown: string } {
  const fallback = { title: input.title, excerpt: input.excerpt || '', markdown: raw.trim() };
  if (!raw.trim()) return fallback;

  let candidate = raw.trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) candidate = fenced[1].trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return fallback;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    if (!body) return fallback;
    return {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : input.title,
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt.trim() : '',
      markdown: body,
    };
  } catch {
    return fallback;
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
    }),
  });

  if (!res.ok) {
    throw new Error(`${model} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
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
  const prompt = buildPrompt(task, input);

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
        const raw = await callChatCompletions(provider.endpoint, provider.apiKey, model, prompt);
        const parsed = parseModelOutput(raw, input);
        return { ...parsed, provider: provider.name, model };
      } catch (err) {
        failures.push(`${provider.name}/${model}: ${(err as Error).message}`);
      }
    }
  }

  throw new Error(`All agent providers failed. ${failures.join(' | ')}`);
}
