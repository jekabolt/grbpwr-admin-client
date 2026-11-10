// The composition block already lays out the ribbons (fonts, materials, planAll). The LABELS section
// reads the same pages from here instead of laying them out a second time.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PaperDoc } from '../../assembly-print/paper';

type Slot = { pages: readonly PaperDoc[]; publish: (pages: readonly PaperDoc[]) => void };

const EMPTY: readonly PaperDoc[] = [];
const BuiltRibbonsContext = createContext<Slot>({ pages: EMPTY, publish: () => {} });

export function BuiltRibbonsProvider({ children }: { children: ReactNode }) {
  const [pages, publish] = useState<readonly PaperDoc[]>(EMPTY);
  return (
    <BuiltRibbonsContext.Provider value={{ pages, publish }}>
      {children}
    </BuiltRibbonsContext.Provider>
  );
}

/** The block hands its pages over; pass a memoised array, the same ref writes nothing. */
export function usePublishBuiltRibbons(pages: readonly PaperDoc[]) {
  const { publish } = useContext(BuiltRibbonsContext);
  useEffect(() => publish(pages), [publish, pages]);
  useEffect(() => () => publish(EMPTY), [publish]);
}

/** The built ribbons, page by page; empty while they load or with no plan. */
export const useBuiltRibbons = (): readonly PaperDoc[] => useContext(BuiltRibbonsContext).pages;
