// Stand of the sewn-in label rows: the REAL LabelsBlock under a real react-hook-form with the card's own
// schema. Every RPC is answered by the runner (sewn-label-row-probe.mjs), which drives the DOM.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { common_TechCard } from 'api/proto-http/admin';
import { createRoot, type Root } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';

import { LabelsBlock } from 'components/managers/tech-card/components/labels-blocks';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';

type Probe = {
  mount: (card: common_TechCard, over: Record<string, unknown>) => void;
  form: () => Record<string, unknown>;
};
declare global {
  interface Window {
    __sr: Probe;
  }
}
const probe = {} as Probe;
window.__sr = probe;

function Harness({ card, over }: { card: common_TechCard; over: Record<string, unknown> }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: { ...techCardDefaultData, ...over } as never,
  });
  probe.form = () => JSON.parse(JSON.stringify(methods.getValues())) as Record<string, unknown>;
  return (
    <FormProvider {...methods}>
      <div className='bg-pageBg p-6'>
        <LabelsBlock techCard={card} />
      </div>
    </FormProvider>
  );
}

let root: Root | null = null;
probe.mount = (card, over) => {
  root?.unmount();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.getElementById('root')!);
  root.render(
    <QueryClientProvider client={qc}>
      <DictionaryProvider>
        <Harness card={card} over={over} />
      </DictionaryProvider>
    </QueryClientProvider>,
  );
};
