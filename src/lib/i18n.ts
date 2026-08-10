import uz from '../i18n/uz.json';
import en from '../i18n/en.json';
import ru from '../i18n/ru.json';

export const LANGS = ['uz', 'en', 'ru'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'uz';

const dict = { uz, en, ru };

export function t(lang: Lang) {
  return dict[lang];
}

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}
