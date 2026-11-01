export interface UzAlphabetOptions {
  protectedWords?: string[];
  exceptions?: Record<string, string>;
  normalizeTutuq?: boolean;
}
export const DEFAULT_PROTECTED: string[];
export const DEFAULT_EXCEPTIONS: Record<string, string>;
export function latinToNew(text: string, opts?: UzAlphabetOptions): string;
export function latinToNewMarkdown(md: string, opts?: UzAlphabetOptions): string;
export function latinToNewContentFile(source: string, opts?: UzAlphabetOptions): string;
export function latinToNewDeep<T>(value: T, opts?: UzAlphabetOptions): T;
