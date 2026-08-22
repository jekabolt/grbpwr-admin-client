// Точка входа пробы «пикер работ»: НАСТОЯЩИЙ редактор шага, настоящий хук каталога, настоящая
// запись формы. Каталог приезжает по СЕТИ — проба перехватывает запрос и отдаёт свою фикстуру
// (или отказ), потому что вся суть R6 в том, откуда берётся список: подменить хук здесь значило бы
// проверить всё, кроме проверяемого.
//
// Здесь не переписано ничего из проверяемого: ни разбор ответа, ни поиск, ни приоритет дефолтов,
// ни мапперы. Стенд даёт контекст формы (тот же `zodResolver(techCardSchema)`, что и на карточке),
// роутер (редактор читает `useParams`) и рукоятки, которыми проба ЧИТАЕТ состояние. Писать в форму
// мимо органов рукоятки не умеют — работу проба выбирает кликом по живому пикеру.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import {
  OperationsField,
  emptyOperation,
} from 'components/managers/tech-card/components/operations-field';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import {
  KIND_WORK_TOKEN,
  offeredKinds,
} from 'components/managers/tech-card/components/operation-kinds';
import { BUNDLED_WORK_CATALOG } from 'components/managers/tech-card/components/operation-work';

type Ops = NonNullable<TechCardFormData['operations']>;

type WorkPickerProbe = {
  mount: (ops: Record<string, unknown>[]) => void;
  /** Значения ОТКРЫТОГО шага (нулевого) — как их держит форма. */
  values: () => Record<string, unknown>;
  /** Что уезжает на провод — доказательство, что незнакомый токен переживает круг. */
  wire: (op: Record<string, unknown>) => Record<string, unknown> | undefined;
  /** Круг «провод → форма»: токен, которого бандл не знает, обязан доехать до формы целым. */
  readBack: (op: Record<string, unknown>) => Record<string, unknown> | undefined;
  /** Инвентарь снимка бандла — тот самый фолбэк, которым живёт пикер без каталога. */
  bundle: () => {
    items: number;
    offered: number;
    tokens: number;
    uniq: number;
    derived: number;
    list: Array<Record<string, unknown>>;
  };
  /** Щит осведомлённости: пятый aware-флаг, который КАЖДАЯ запись обязана объявлять. */
  aware: () => boolean | undefined;
};
declare global {
  interface Window {
    __workPicker: WorkPickerProbe;
  }
}

const probe: WorkPickerProbe = {} as WorkPickerProbe;
window.__workPicker = probe;

probe.wire = (op) => {
  const data = {
    ...techCardDefaultData,
    operations: [{ ...emptyOperation, ...op }],
  } as unknown as TechCardFormData;
  const insert = mapFormToTechCardInsert(data, undefined, true);
  return (insert.operations ?? [])[0] as unknown as Record<string, unknown>;
};

probe.readBack = (op) => {
  const wire = probe.wire(op);
  const form = mapTechCardToForm({ techCard: { operations: [wire] } } as never);
  return (form.operations ?? [])[0] as unknown as Record<string, unknown>;
};

probe.aware = () => {
  const data = {
    ...techCardDefaultData,
    operations: [{ ...emptyOperation }],
  } as unknown as TechCardFormData;
  return mapFormToTechCardInsert(data, undefined, true).operationWorkAware;
};

probe.bundle = () => {
  const tokens = Object.values(KIND_WORK_TOKEN);
  // СПИСОК ЦЕЛИКОМ, А НЕ ТОЛЬКО СЧЁТЧИКИ: по нему сторож сверяет снимок с САМИМИ МИГРАЦИЯМИ —
  // токен за токеном, ярлык за ярлыком. Счётчик поймал бы только пропажу строки, а расхождение
  // 0331 было в ярлыке и в снятии, то есть внутри строки.
  const list = BUNDLED_WORK_CATALOG.items.map((w) => ({
    ...w,
    machines: [...w.machines],
    syn: [...w.syn],
  }));
  return {
    items: list.length,
    offered: offeredKinds().length,
    tokens: tokens.length,
    uniq: new Set(tokens).size,
    // ПУНКТ ЕСТЬ НЕ У ВСЕГО СНИМКА: работы 0331 приходят каталогом и пункта в этом файле не имеют
    // вовсе. Полноту сшивки поэтому проверяет именно ЭТО число, а не длина списка.
    derived: list.filter((w) => tokens.includes(w.token)).length,
    list,
  };
};

function Harness({ ops }: { ops: Record<string, unknown>[] }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      operations: ops.map((o) => ({ ...emptyOperation, ...o })) as unknown as Ops,
    },
  });
  probe.values = () => (methods.getValues('operations') ?? [])[0] as Record<string, unknown>;
  // Свой QueryClient НА КАЖДОЕ МОНТИРОВАНИЕ, и это условие проверки, а не гигиена: каталог
  // кэшируется на час, и общий клиент донёс бы ответ ПЕРВОГО стенда до второго — то есть цитата
  // «каталог не приехал» проверяла бы кэш предыдущей цитаты.
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

probe.mount = (ops) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness ops={ops} />);
};
