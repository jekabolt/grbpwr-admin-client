// Stand of the LABELS / PACKAGING blocks (labels rework I-10 / I-11). Mounts the REAL blocks under a
// real react-hook-form with the card's own schema and defaults — no line of the checked code is
// restated here. The runner (labels-blocks-probe.mjs) drives it through the DOM and reads the form.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';

import { LabelsBlock, PackagingBlock } from 'components/managers/tech-card/components/labels-blocks';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

type Probe = {
  mount: () => void;
  form: () => Record<string, unknown>;
};
declare global {
  interface Window {
    __lb: Probe;
  }
}
const probe = {} as Probe;
window.__lb = probe;

function Harness() {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: { ...techCardDefaultData } as never,
  });
  probe.form = () => JSON.parse(JSON.stringify(methods.getValues())) as Record<string, unknown>;
  return (
    <FormProvider {...methods}>
      <div className='flex flex-col gap-12' data-labels-tab=''>
        <LabelsBlock />
        <PackagingBlock />
      </div>
    </FormProvider>
  );
}

probe.mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
};
