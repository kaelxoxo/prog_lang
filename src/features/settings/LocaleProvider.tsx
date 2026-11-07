import { localeTag, translate } from './translations';

const englishCopy = { localeTag, t: translate } as const;

/** English-only copy. Adding a language later means a dictionary in translations.ts plus state here. */
export function useLocale() {
  return englishCopy;
}
