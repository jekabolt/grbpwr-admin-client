// Точка входа пробы «единственный писатель»: НАСТОЯЩИЙ редактор шага, настоящий пикер работ,
// настоящая запись формы. Ни одной строки проверяемого здесь не переписано — стенд даёт ровно
// контекст формы (тот же `zodResolver(techCardSchema)`, что и на карточке), роутер (редактор читает
// `useParams`) и две рукоятки чтения.
//
// ЭТОТ ФАЙЛ СОБИРАЕТСЯ ДВАЖДЫ И ОБЯЗАН СОБИРАТЬСЯ ОБОИМИ ДЕРЕВЬЯМИ. Проба строит из него два
// бандла: один из рабочего дерева, второй — из блобов коммита ДО экстракции писателя. Поэтому
// импортировать здесь можно только то, что было в дереве и ТОГДА: ни `workApplication`, ни любого
// другого нового имени тут нет и быть не может — иначе базовый бандл не собрался бы, и «поведение
// не изменилось» доказывалось бы одной половиной пары.
//
// ПАРК ПРИХОДИТ СНАРУЖИ, СТРОКОЙ ФОРМЫ, а не подменой хука: обе ветки подбора профиля (сужение
// «на чём» единственным профилем парка и запись ссылки в пустой ключ) читают ровно
// `construction.equipmentDefaults`, и стенд, кладущий их мимо формы, проверял бы не их.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import {
  OperationsField,
  emptyOperation,
} from 'components/managers/tech-card/components/operations-field';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

type Ops = NonNullable<TechCardFormData['operations']>;
type Park = NonNullable<TechCardFormData['construction']['equipmentDefaults']>;

type ApplyProbe = {
  mount: (ops: Record<string, unknown>[], park: Record<string, unknown>) => void;
  /** Значения ОТКРЫТОГО шага (нулевого) — как их держит форма, целиком. */
  values: () => Record<string, unknown>;
  /** Имена полей строки шага — чтобы снимок сравнивался по ЗАКРЫТОМУ списку, а не по тому, что нашлось. */
  fields: () => string[];
};
declare global {
  interface Window {
    __opApply: ApplyProbe;
  }
}

const probe: ApplyProbe = {} as ApplyProbe;
window.__opApply = probe;

probe.fields = () => Object.keys(emptyOperation).sort();

function Harness({ ops, park }: { ops: Record<string, unknown>[]; park: Record<string, unknown> }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      construction: {
        ...techCardDefaultData.construction,
        equipmentDefaults: park as unknown as Park,
      },
      operations: ops.map((o) => ({ ...emptyOperation, ...o })) as unknown as Ops,
    },
  });
  probe.values = () => (methods.getValues('operations') ?? [])[0] as Record<string, unknown>;
  // Свой QueryClient НА КАЖДОЕ МОНТИРОВАНИЕ: каталог кэшируется на час, и общий клиент донёс бы
  // ответ первого случая батареи до всех последующих.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
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

probe.mount = (ops, park) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness ops={ops} park={park} />);
};
