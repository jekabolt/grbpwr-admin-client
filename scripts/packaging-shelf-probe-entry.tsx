// Stand of the packaging shelf and of PDF sheet 05b: the REAL PackagingBlock and PackagingRecipeField
// under a real react-hook-form seeded by the card's own mapper, and the REAL PackagingPage under the
// real sheet CSS. Provider stack as in src/index.tsx. Every RPC is answered by the runner
// (packaging-shelf-probe.mjs), which drives the DOM.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_TechCard } from 'api/proto-http/admin';
import { ContextProvider } from 'context';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { FormProvider, useForm } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui';

import { PageFurniture } from 'components/managers/print/page-furniture';
import type { PrintOrient } from 'components/managers/print/scope';
import { PackagingBlock } from 'components/managers/tech-card/components/labels-blocks';
import { PackagingRecipeField } from 'components/managers/tech-card/components/packaging-recipe-field';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { collectPdfGaps } from 'components/managers/tech-card/techpack/gaps';
import { PdfLangProvider } from 'components/managers/tech-card/techpack/i18n';
import type { PdfLocale } from 'components/managers/tech-card/techpack/i18n/langs';
import { PackagingPage } from 'components/managers/tech-card/techpack/pages/packaging';
import { TECHPACK_SHEET_CSS } from 'components/managers/tech-card/techpack/sheet';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

type Probe = {
  mount: (card: common_TechCard, opts?: { canEdit?: boolean }) => void;
  mountPdf: (m: { card: common_TechCard; orient: PrintOrient; lang?: PdfLocale }) => void;
  form: () => Record<string, unknown>;
  wire: () => { parsed: boolean; insert: Record<string, unknown> };
};
declare global {
  interface Window {
    __ps: Probe;
  }
}
const probe = {} as Probe;
window.__ps = probe;

function Harness({ card, canEdit }: { card: common_TechCard; canEdit: boolean }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: mapTechCardToForm(card) as never,
  });
  probe.form = () => JSON.parse(JSON.stringify(methods.getValues())) as Record<string, unknown>;
  probe.wire = () => {
    const parsed = techCardSchema.safeParse(methods.getValues());
    const insert = mapFormToTechCardInsert(
      (parsed.success ? parsed.data : methods.getValues()) as TechCardFormData,
      card.techCard,
    );
    return {
      parsed: parsed.success,
      insert: JSON.parse(JSON.stringify(insert)) as Record<string, unknown>,
    };
  };
  return (
    <FormProvider {...methods}>
      <div className='flex flex-col gap-6 bg-pageBg p-4'>
        <PackagingBlock
          techCardId={card.id}
          colorwayRefs={card.colorways}
          resolvedMedia={card.resolvedLabelMedia}
          canEdit={canEdit}
        />
        <div data-recipe-block=''>
          <PackagingRecipeField techCardId={card.id ?? 0} canEdit={canEdit} />
        </div>
      </div>
    </FormProvider>
  );
}

let root: Root | null = null;
const fresh = () => {
  root?.unmount();
  root = createRoot(document.getElementById('root')!);
  return root;
};

probe.mount = (card, opts) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fresh().render(
    <ErrorBoundary fallbackRender={({ error }) => <pre data-crash=''>{String(error)}</pre>}>
      <ContextProvider>
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <TooltipProvider delayDuration={200} skipDelayDuration={150}>
              <DictionaryProvider>
                <Harness card={card} canEdit={opts?.canEdit ?? true} />
              </DictionaryProvider>
            </TooltipProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ContextProvider>
    </ErrorBoundary>,
  );
};

probe.mountPdf = ({ card, orient, lang }) => {
  fresh().render(
    <PdfLangProvider lang={lang ?? 'en'}>
      <PageFurniture line='probe' orient={orient} />
      <style>{TECHPACK_SHEET_CSS}</style>
      <div className='tp-doc'>
        <PackagingPage techCard={card} orient={orient} docline='probe' n='05b' />
      </div>
    </PdfLangProvider>,
  );
};

// Referenced so a broken gap wiring fails the bundle, not the page; the runner reads the sheet.
void collectPdfGaps;
