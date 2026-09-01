// K-12 · Стенд горизонтального скролла тех-карты.
//
// Здесь НЕ воспроизводится вёрстка проверяемого: `OperationsField` настоящий, форма настоящая,
// zod настоящий. Стенд даёт ровно ту ЦЕПОЧКУ КОРОБОК, в которой поле живёт в приложении, потому
// что предмет замера — не поле само по себе, а вылезает ли оно за коробку страницы. Цепочка
// переписана из живых файлов один в один:
//
//   src/ui/layout.tsx:80                  'h-full print:h-full print:pt-0 pt-26 px-2.5'
//   tech-card/page.tsx:44                 'flex flex-col gap-6'
//   tech-card/components/index.tsx:1847   'grid gap-2.5 pt-3 lg:grid-cols-[150px_1fr]'
//   tech-card/components/index.tsx:1850   <aside> рельса (150px)
//   tech-card/components/index.tsx:1910   <form className='min-w-0 pb-24'>
//   tech-card/components/index.tsx:1911   <fieldset className='m-0 min-w-0 border-0 p-0'>
//
// `min-w-0` на форме и филдсете оставлены НАМЕРЕННО: это последние защищённые коробки в цепочке,
// и весь вопрос K-12 в том, что происходит НИЖЕ них.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { OperationsField } from 'components/managers/tech-card/components/operations-field';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

type HScrollProbe = { mount: (card: Record<string, unknown>) => void };
declare global {
  interface Window {
    __hscroll: HScrollProbe;
  }
}

const probe: HScrollProbe = {} as HScrollProbe;
window.__hscroll = probe;

function Harness({ card }: { card: Record<string, unknown> }) {
  const dv = techCardDefaultData as unknown as Record<string, unknown>;
  const merged = {
    ...dv,
    ...card,
    construction: {
      ...(dv.construction as Record<string, unknown>),
      ...((card.construction as Record<string, unknown>) ?? {}),
    },
  };
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: merged as unknown as TechCardFormData,
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <FormProvider {...methods}>
          {/* layout.tsx:80 — КОРОБКА СТРАНИЦЫ. Она и есть то, что не имеет права ехать вбок. */}
          <div className='h-full px-2.5 pt-26 print:h-full print:pt-0' data-page-body='1'>
            {/* page.tsx:44 */}
            <div className='flex flex-col gap-6'>
              {/* index.tsx:1847 — рельс 150px + содержимое */}
              <div className='grid gap-2.5 pt-3 lg:grid-cols-[150px_1fr]'>
                {/* index.tsx:1850 — рельс. Себя он клипает сам (overflow-y-auto). */}
                <aside className='top-16 self-start lg:sticky lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto'>
                  <div className='flex gap-1 overflow-x-auto lg:block lg:overflow-visible'>
                    <span className='text-control uppercase'>construction</span>
                  </div>
                </aside>
                {/* index.tsx:1910 / :1911 — последние коробки с min-w-0 */}
                <form className='min-w-0 pb-24'>
                  <fieldset className='m-0 min-w-0 border-0 p-0'>
                    <OperationsField />
                  </fieldset>
                </form>
              </div>
            </div>
          </div>
        </FormProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

probe.mount = (card) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness card={card} />);
};
