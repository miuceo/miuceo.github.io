import type { Lang } from './i18n';

export type Localized = string | { uz: string; en?: string; ru?: string };

/** `en`/`ru` are optional translations of an artifact's title/description — a
 * missing one falls back to `uz`, never to a raw empty string. */
export function resolveLocalized(value: Localized, lang: Lang): string {
  if (typeof value === 'string') return value;
  return value[lang] ?? value.uz;
}

export interface ModelBadge {
  label: string;
  emoji: string;
}

/* The Journal palette has a single accent, so a model badge differentiates
 * by emoji + label rather than color. */
const MODEL_EMOJI: Record<string, string> = {
  claude: '✦',
  gemini: '✨',
  chatgpt: '◉',
};

export function modelBadge(model: string): ModelBadge {
  const key = model.trim().toLowerCase();
  return { label: model, emoji: MODEL_EMOJI[key] ?? '◆' };
}
