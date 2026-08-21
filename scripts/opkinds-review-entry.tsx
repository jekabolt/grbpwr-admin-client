// Точка входа пробы четырёх находок ревью: НАСТОЯЩИЙ редактор шага и НАСТОЯЩИЙ печатный лист.
//
// Здесь не переписано ничего из проверяемого — ни таблица видов, ни `kindOf`/`kindClears`, ни
// гейты рендера, ни очистка скрытого, ни zod, ни мапперы, ни композиторы фактов листа. Стенд даёт
// ровно четыре вещи: контекст формы (`FormProvider` с тем же `zodResolver(techCardSchema)`, что и
// на карточке), роутер и провайдер словаря (их читают редактор и документ), рукоятки ЧТЕНИЯ
// состояния формы — и второй корень, в котором тот же `TechPackDocument`, что печатает карточку,
// рисует лист ИЗ ЖИВОЙ ФОРМЫ через настоящий маппер записи.
//
// ПОЧЕМУ ЛИСТ РИСУЕТСЯ ЦЕЛИКОМ, А НЕ ЗОВЁТСЯ КОМПОЗИТОР. Находка №1 в том и состояла, что
// композитор фактов существовал, а лист его не звал: `wireStepFacts` не переносила блок, и
// компилятор молчал. Проба, зовущая композитор напрямую, зеленела бы при ровно том же дефекте.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import {
  OperationsField,
  emptyOperation,
} from 'components/managers/tech-card/components/operations-field';
import { TechPackDocument } from 'components/managers/tech-card/components/tech-pack-document';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

type Ops = NonNullable<TechCardFormData['operations']>;
type Op = Record<string, unknown>;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// ОДНО ИМЯ НА ВСЕ РУКОЯТКИ: `Window` в этом репозитории расширяют и соседние стенды, и
// одноимённое поле с другой сигнатурой роняет `tsc` всему проекту (TS2717).
type ReviewProbe = {
  mount: (op: Op) => void;
  values: () => Op;
  trigger: () => Promise<boolean>;
  /** Провод ИЗ ЖИВОЙ ФОРМЫ — настоящим маппером записи, без промежуточной копии значений. */
  wire: () => Op | undefined;
  roundTrip: (op: Op) => { wire: Op | undefined; back: Op | undefined };
  /** Отказы настоящего `techCardSchema` — путями и текстами, без пересказа правил. */
  validate: (op: Op) => Array<{ path: string; message: string }>;
  /** Печатный лист: без аргумента — из ЖИВОЙ формы, с аргументом — из синтетического шага. */
  sheet: (op?: Op) => void;
};
declare global {
  interface Window {
    __review: ReviewProbe;
  }
}

const probe: ReviewProbe = {} as ReviewProbe;
window.__review = probe;

const dataOf = (op: Op): TechCardFormData =>
  ({
    ...techCardDefaultData,
    operations: [{ ...emptyOperation, ...op }],
  }) as unknown as TechCardFormData;

function Harness({ op }: { op: Op }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      operations: [{ ...emptyOperation, ...op }] as unknown as Ops,
    },
  });
  probe.values = () => (methods.getValues('operations') ?? [])[0] as Op;
  probe.trigger = async () => {
    await methods.trigger('operations');
    return true;
  };
  probe.wire = () => {
    const insert = mapFormToTechCardInsert(methods.getValues() as TechCardFormData, undefined, true);
    return (insert.operations ?? [])[0] as unknown as Op;
  };
  probe.sheet = (o?: Op) => {
    const data = o ? dataOf(o) : (methods.getValues() as TechCardFormData);
    renderSheet(data);
  };
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

// ЛИСТ — ТОТ ЖЕ КОМПОНЕНТ, ЧТО ПЕЧАТАЕТ КАРТОЧКУ, и карточка ему собирается ТЕМ ЖЕ маппером
// записи, которым она уезжает на сервер. Ни одной строки листа стенд не подменяет: сеть заглушена,
// словарь и каталоги приезжают пустыми — ровно как на карточке, у которой их ещё не загрузили, —
// и таблица операций от этого не зависит.
function renderSheet(data: TechCardFormData) {
  const insert = mapFormToTechCardInsert(data, undefined, true);
  let host = document.getElementById('sheet');
  if (!host) {
    host = document.createElement('div');
    host.id = 'sheet';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <DictionaryProvider>
          <TechPackDocument techCard={{ id: 1, techCard: insert } as never} />
        </DictionaryProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

probe.roundTrip = (op) => {
  const insert = mapFormToTechCardInsert(dataOf(op), undefined, true);
  const back = mapTechCardToForm({ techCard: insert } as never);
  return {
    wire: (insert.operations ?? [])[0] as unknown as Op,
    back: (back.operations ?? [])[0] as unknown as Op,
  };
};

probe.validate = (op) => {
  const parsed = techCardSchema.safeParse(dataOf(op));
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};

probe.mount = (op) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness op={op} />);
};
