import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { PdfLocale } from './langs';
import { createPdfT, englishT, type PdfT } from './translate';

const PdfLangContext = createContext<{ lang: PdfLocale; t: PdfT }>({ lang: 'en', t: englishT });

export function PdfLangProvider({ lang, children }: { lang: PdfLocale; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: createPdfT(lang) }), [lang]);
  return <PdfLangContext.Provider value={value}>{children}</PdfLangContext.Provider>;
}

export const useT = () => useContext(PdfLangContext);
