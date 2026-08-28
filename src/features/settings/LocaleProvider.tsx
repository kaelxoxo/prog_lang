import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { readLocale, saveLocale } from './localeStorage';
import { type CopyKey, type Locale, localeTag, translate } from './translations';

type LocaleContextValue = {
  locale: Locale;
  localeTag: string;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: CopyKey, values?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    let active = true;
    void readLocale()
      .then((savedLocale) => {
        if (active) setLocaleState(savedLocale);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setLocale = useCallback(async (nextLocale: Locale) => {
    await saveLocale(nextLocale);
    setLocaleState(nextLocale);
  }, []);
  const t = useCallback(
    (key: CopyKey, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  );
  const value = useMemo(
    () => ({ locale, localeTag: localeTag(locale), setLocale, t }),
    [locale, setLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider.');
  return value;
}
