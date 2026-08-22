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
import { useState } from 'react';
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
type Bom = NonNullable<TechCardFormData['bomItems']>;
type Park = NonNullable<TechCardFormData['construction']['equipmentDefaults']>;

type PanelProbe = {
  mount: (
    ops: Record<string, unknown>[],
    park: Record<string, unknown>,
    frozen: boolean,
    /**
     * СТРОКИ BOM КАРТОЧКИ. Приезжают в форму, а не мимо неё: РОД строки BOM — единственный
     * различитель четырёх пунктов фурнитуры, и обе поверхности (пикер шага и панель) читают его
     * ровно из `bomItems` формы. Стенд, кладущий их мимо, проверял бы не их.
     */
    bom?: Record<string, unknown>[],
  ) => void;
  /** Значения строки шага — как их держит ФОРМА, целиком. */
  values: (index: number) => Record<string, unknown>;
  /** Имена полей строки шага: снимок сравнивается по ЗАКРЫТОМУ списку, а не по тому, что нашлось. */
  fields: () => string[];
  /**
   * ВЫПУСТИТЬ КАРТОЧКУ ПОСРЕДИ СЕАНСА, НЕ ПЕРЕМОНТИРУЯ ДЕРЕВО.
   *
   * Дефект панели был именно в ПЕРЕХОДЕ: открытая на черновике, она переживала выпуск карточки под
   * собой и продолжала писать. Перемонтирование стенда с `frozen: true` этого не проверяет вовсе —
   * оно закрыло бы панель само, вместе со всем деревом.
   */
  freeze: () => void;
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
  bom,
}: {
  ops: Record<string, unknown>[];
  park: Record<string, unknown>;
  frozen: boolean;
  bom: Record<string, unknown>[];
}) {
  // ВЫПУСК — СОСТОЯНИЕ СТЕНДА, А НЕ ПРОП МОНТИРОВАНИЯ: см. `PanelProbe.freeze`.
  const [released, setReleased] = useState(frozen);
  probe.freeze = () => setReleased(true);
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      construction: {
        ...techCardDefaultData.construction,
        equipmentDefaults: park as unknown as Park,
      },
      bomItems: bom as unknown as Bom,
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
          <fieldset disabled={released}>
            <form>
              <OperationsField frozen={released} />
            </form>
          </fieldset>
        </FormProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

probe.mount = (ops, park, frozen, bom) => {
  // РЕЖИМ РЕЛЬСА ЖИВЁТ В `localStorage` — и без сброса протекал бы из случая в случай, делая
  // «панель открылась в схеме» неотличимым от «панель открылась в списке».
  try {
    window.localStorage.clear();
  } catch {
    /* приватный режим — тогда протекать всё равно нечему */
  }
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness ops={ops} park={park} frozen={frozen} bom={bom ?? []} />);
};
