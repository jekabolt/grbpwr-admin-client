// Точка входа пробы панели ратификации: НАСТОЯЩЕЕ поле операций целиком — рельс, счётчик
// неназванных, панель, редактор шага и общая форма карточки. Ни одной строки проверяемого здесь не
// переписано: стенд даёт ровно контекст формы (тот же `zodResolver(techCardSchema)`, что и на
// карточке), роутер (поле читает `useParams`) и три рукоятки чтения.
//
// ПОЧЕМУ ЦЕЛОЕ ПОЛЕ, А НЕ ОДНА ПАНЕЛЬ. Панель — ВТОРОЙ вызыватель единственного писателя, и
// проверяется у неё не разметка, а ЗАПИСЬ В ТУ ЖЕ ФОРМУ, из которой читает рельс. Стенд,
// монтирующий панель отдельно, проверял бы её согласие с самой собой; здесь же имя, записанное
// панелью, тут же читается рельсом — тем самым органом, с которым панель обязана совпасть.
//
// ПАРК ПРИХОДИТ СТРОКОЙ ФОРМЫ, а не подменой хука: обе ветки подбора профиля читают ровно
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

type PanelProbe = {
  mount: (
    ops: Record<string, unknown>[],
    park: Record<string, unknown>,
    frozen: boolean,
  ) => void;
  /** Значения строки шага — как их держит ФОРМА, целиком. */
  values: (index: number) => Record<string, unknown>;
  /** Имена полей строки шага: снимок сравнивается по ЗАКРЫТОМУ списку, а не по тому, что нашлось. */
  fields: () => string[];
};
declare global {
  interface Window {
    __ratifyPanel: PanelProbe;
  }
}

const probe: PanelProbe = {} as PanelProbe;
window.__ratifyPanel = probe;

probe.fields = () => Object.keys(emptyOperation).sort();

function Harness({
  ops,
  park,
  frozen,
}: {
  ops: Record<string, unknown>[];
  park: Record<string, unknown>;
  frozen: boolean;
}) {
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
  probe.values = (index) =>
    ((methods.getValues('operations') ?? [])[index] ?? {}) as Record<string, unknown>;
  // Свой QueryClient НА КАЖДОЕ МОНТИРОВАНИЕ: каталог кэшируется на час, и общий клиент донёс бы
  // ответ первого случая батареи до всех последующих.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <FormProvider {...methods}>
          {/* ВЫПУЩЕННАЯ КАРТОЧКА ЖИВЁТ ПОД ВНЕШНИМ `<fieldset disabled>` — тем же, что и на самом
              экране. Без него «кнопки нет» и «кнопка мертва» были бы неразличимы. */}
          <fieldset disabled={frozen}>
            <form>
              <OperationsField frozen={frozen} />
            </form>
          </fieldset>
        </FormProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

probe.mount = (ops, park, frozen) => {
  // РЕЖИМ РЕЛЬСА ЖИВЁТ В `localStorage` — и без сброса протекал бы из случая в случай, делая
  // «панель открылась в схеме» неотличимым от «панель открылась в списке».
  try {
    window.localStorage.clear();
  } catch {
    /* приватный режим — тогда протекать всё равно нечему */
  }
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness ops={ops} park={park} frozen={frozen} />);
};
