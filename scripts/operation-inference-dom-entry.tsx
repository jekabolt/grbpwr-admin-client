// Точка входа половины «живой DOM» пробы выводимости: НАСТОЯЩАЯ `OperationsField`, настоящая
// форма, настоящий zod.
//
// Здесь не переписано ничего из проверяемого — ни подстановка, ни метка, ни её снятие. Стенд даёт
// контекст, в котором редактор шага вообще способен жить (`FormProvider` с тем же
// `zodResolver(techCardSchema)`, роутер, провайдер запросов), и две рукоятки: смонтировать
// карточку и прочитать, что в форме. Писать в форму мимо органов рукоятки не умеют — иначе проба
// доказывала бы работу собственного стенда.
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

type InferenceDomProbe = {
  mount: (card: Record<string, unknown>) => void;
  values: () => Record<string, unknown>[];
  dirty: () => boolean;
};
declare global {
  interface Window {
    __inference: InferenceDomProbe;
  }
}

const probe: InferenceDomProbe = {} as InferenceDomProbe;
window.__inference = probe;

function Harness({ card }: { card: Record<string, unknown> }) {
  // `construction` сливается ПОВЕРХ дефолта, а не вместо него: фикстуре парка прессов нужен один
  // ключ внутри construction, а замена целиком снесла бы остальные дефолты ветки — и стенд
  // проверял бы редактор на форме, которой в приложении не бывает.
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
  probe.values = () =>
    (methods.getValues('operations') ?? []) as unknown as Record<string, unknown>[];
  probe.dirty = () => methods.formState.isDirty;
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <FormProvider {...methods}>
          <form>
            <OperationsField />
          </form>
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
