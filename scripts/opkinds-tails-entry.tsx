// Точка входа пробы ДВУХ ХВОСТОВ волны видов операций: замороженный релиз и сварочная заметка.
//
// Здесь не переписано ничего из проверяемого — ни составители фактов, ни zod, ни мапперы, ни сам
// архив релизов. Стенд даёт три вещи: контекст формы (тот же `zodResolver(techCardSchema)`, что и
// на карточке) с настоящим редактором шага, настоящий маппер записи — которым СОБИРАЕТСЯ БЛОБ
// СНАПШОТА, ровно как его собирает сервер на выпуске карточки, — и второй корень, в котором
// настоящий `ReleasesField` читает этот блоб через настоящий сетевой слой (fetch перехвачен
// маршрутом пробы, а не подменён внутри компонента).
//
// ПОЧЕМУ АРХИВ МОНТИРУЕТСЯ ЦЕЛИКОМ, А НЕ ЗОВЁТСЯ `SnapshotOperations`. Дефект в том и состоял, что
// составитель фактов существовал, а ветка ВТО его не звала. Проба, зовущая составителя напрямую,
// зеленела бы при ровно том же дефекте; проба, монтирующая внутренний компонент в обход запроса,
// не увидела бы, что читается ИМЕННО замороженный снапшот.
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
import { ReleasesField } from 'components/managers/tech-card/components/releases-field';
import {
  mapFormToTechCardInsert,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

type Ops = NonNullable<TechCardFormData['operations']>;
type Op = Record<string, unknown>;

// СВОЁ ИМЯ РУКОЯТКИ, А НЕ `__review`: соседний стенд объявляет `Window.__review` со своей
// сигнатурой, и одноимённое поле с другой формой роняет `tsc` всему проекту (TS2717).
type TailsProbe = {
  /** Смонтировать НАСТОЯЩИЙ редактор шага на одном шаге. */
  mount: (op: Op) => void;
  values: () => Op;
  /** Прогнать настоящий резолвер по операциям — чтобы отказы встали на своих контролах. */
  trigger: () => Promise<boolean>;
  /** Блоб снапшота: настоящим маппером записи, тем же, которым карточка уезжает на выпуск. */
  insert: (op: Op) => Op;
  /** Смонтировать НАСТОЯЩИЙ архив релизов — он сходит за снапшотом в сеть сам. */
  release: () => void;
  /** Отказы настоящего `techCardSchema` — путями и текстами, без пересказа правил. */
  validate: (op: Op) => Array<{ path: string; message: string }>;
};
declare global {
  interface Window {
    __tails: TailsProbe;
  }
}

const probe: TailsProbe = {} as TailsProbe;
window.__tails = probe;

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
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
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

probe.insert = (op) =>
  mapFormToTechCardInsert(dataOf(op), undefined, true) as unknown as Op;

probe.mount = (op) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness op={op} />);
};

// АРХИВ — ТОТ ЖЕ КОМПОНЕНТ, ЧТО РИСУЕТ ВКЛАДКУ РЕЛИЗОВ КАРТОЧКИ, и снапшот он получает своим
// запросом. Свежий `QueryClient` на каждый монтаж — иначе второй прогон читал бы кэш первого и
// «четыре приёма дали четыре строки» зеленело бы на одной.
probe.release = () => {
  let host = document.getElementById('release');
  if (!host) {
    host = document.createElement('div');
    host.id = 'release';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  createRoot(host).render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/tech-cards/1?tab=releases']}>
        <DictionaryProvider>
          <ReleasesField techCardId={1} />
        </DictionaryProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

probe.validate = (op) => {
  const parsed = techCardSchema.safeParse(dataOf(op));
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};
