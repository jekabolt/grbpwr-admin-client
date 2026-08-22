// Точка входа пробы «двоекодье имени шага» (R8): НАСТОЯЩИЙ рельс, НАСТОЯЩИЙ открытый шаг,
// НАСТОЯЩАЯ карта примерки и НАСТОЯЩИЙ печатный лист — все четыре из ОДНОЙ формы.
//
// ПОЧЕМУ ЧЕТЫРЕ ЭКРАНА В ОДНОМ СТЕНДЕ, А НЕ ЧЕТЫРЕ ВЫЗОВА КОМПОЗИТОРА. Проверяется не то, что
// функция возвращает правильную строку, а то, что ЭКРАН эту функцию зовёт и зовёт с работой.
// Ровно этим и был плох бы функциональный гейт: остаток R6 состоял в том, что композитор
// существовал, а заголовок про работу не спрашивал, — и проба, зовущая композитор напрямую,
// зеленела бы при том же самом дефекте. Печатный лист держал СВОЮ развилку по типу шага и мимо
// композитора вовсе; увидеть это можно только напечатав лист.
//
// КАТАЛОГ ПРИЕЗЖАЕТ ПО СЕТИ И ПЕРЕХВАТЫВАЕТСЯ СНАРУЖИ. Подменить хук здесь значило бы проверить
// всё, кроме проверяемого: цитата «каталог не приехал» именно про путь «сеть → разбор → имя».
//
// ЛИСТ И РЕДАКТОР ДЕЛЯТ ОДИН `QueryClient` — иначе они читали бы каталог двумя разными ответами, и
// совпадение их имён ничего не доказывало бы. Клиент СОЗДАЁТСЯ ЗАНОВО НА КАЖДОЕ МОНТИРОВАНИЕ:
// каталог кэшируется на час, и общий клиент донёс бы ответ первого стенда до второго.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { EMPTY_QUERY, buildPrintScope } from 'components/managers/print/scope';
import {
  OperationsField,
  emptyOperation,
} from 'components/managers/tech-card/components/operations-field';
import { SampleAssemblyMap } from 'components/managers/tech-card/components/sample-assembly-map';
import { TechPackDocument } from 'components/managers/tech-card/components/tech-pack-document';
import {
  mapFormToTechCardInsert,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { operationHeading } from 'components/managers/tech-card/components/operation-options';
import type {
  common_TechCardGarmentZone,
  common_TechCardMachineType,
  common_TechCardOperationType,
} from 'api/proto-http/admin';

type Ops = NonNullable<TechCardFormData['operations']>;
type Op = Record<string, unknown>;

type StepNameProbe = {
  mount: (ops: Op[]) => void;
  /** Напечатать лист ИЗ ЖИВОЙ ФОРМЫ настоящим маппером записи — без промежуточной копии значений. */
  sheet: () => void;
  /**
   * Напечатать лист ИЗ РЕЛИЗНОГО СНАПШОТА — той же формой, но БЕЗ поля `work` ни на одном шаге.
   *
   * ПОЧЕМУ ИМЕННО ВЫЧЁРКИВАНИЕМ ПОЛЯ, А НЕ ФЛАГОМ «ЭТО РЕЛИЗ». Замороженный релиз — protojson-блоб,
   * записанный ДО появления оси работ: поля `work` в нём нет физически, и появиться ему неоткуда.
   * Фикстура обязана воспроизводить ИСТОЧНИК, а не режим отрисовки, — иначе она проверяла бы ветку
   * по флагу, которой в продуктовом коде нет и быть не должно (`print-page` подставляет снапшот на
   * место карты одной строкой `snapshot ?? techCard`, и дальше документ читает ОДИН источник).
   *
   * Ревизия объявляется релизной ещё и в скоупе — так лист печатает шапку «Rev.N · snapshot», и
   * видно, что это тот самый документ, а не живая карта под чужим заголовком.
   */
  release: () => void;
  /** Значения шага, как их держит форма. */
  values: (i: number) => Op;
  /**
   * СЕГОДНЯШНЕЕ ИМЯ той же записи — тот же композитор, но БЕЗ работы. Нужен ровно для одного:
   * отличить «шаг без работы зовётся по-старому» от «работа перебила всех», не пересказывая
   * лестницу глаголов второй раз в пробе.
   */
  derived: (op: Op) => string;
};
declare global {
  interface Window {
    __stepName: StepNameProbe;
  }
}

const probe: StepNameProbe = {} as StepNameProbe;
window.__stepName = probe;

let qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });

probe.derived = (op) =>
  operationHeading({
    operationType: op.operationType as common_TechCardOperationType,
    machineType: op.machineType as common_TechCardMachineType,
    seamClass: op.seamClass as string,
    zone: op.zone as common_TechCardGarmentZone,
    // ИМЕННО БЕЗ РАБОТЫ — в этом вся рукоятка: она отвечает «как звался бы этот шаг сегодня».
    work: undefined,
    workCatalog: undefined,
    pieceNames: [],
    note: op.note as string,
  });

/**
 * ВЫЧЕРКНУТЬ ОСЬ РАБОТ ИЗ ЗАПИСИ — так выглядит релиз, подписанный ДО 0330. Поле удаляется, а не
 * ставится пустым: в protojson-блобе того времени ключа `work` нет вовсе, и «пустая строка» была
 * бы другой фикстурой — той, где работу СНЯЛИ, а не той, где её негде было назвать.
 */
const freeze = (insert: Record<string, unknown>): Record<string, unknown> => ({
  ...insert,
  operations: ((insert.operations ?? []) as Array<Record<string, unknown>>).map((o) => {
    const { work: _dropped, ...rest } = o;
    return rest;
  }),
});

function renderSheet(data: TechCardFormData, frozen = false) {
  const live = mapFormToTechCardInsert(data, undefined, true) as unknown as Record<string, unknown>;
  const insert = frozen ? freeze(live) : live;
  const techCard = { id: 1, techCard: insert } as never;
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
          <TechPackDocument
            techCard={techCard}
            // СКОУП ОБЪЯВЛЯЕТ РЕВИЗИЮ ЗАМОРОЖЕННОЙ — ровно тем же вызовом, каким её объявляет
            // `print-page`, когда снапшот прочитан. Документу он про имена шагов ничего не
            // сообщает (и не должен), но без него лист печатал бы «live card» над бумагой,
            // которую мы выдаём за подписанную ревизию, — фикстура врала бы о самой себе.
            scope={
              frozen
                ? buildPrintScope({
                    techCard,
                    query: EMPTY_QUERY,
                    revision: { source: 'release', number: 3 },
                  })
                : undefined
            }
          />
        </DictionaryProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function Harness({ ops }: { ops: Op[] }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      operations: ops.map((o) => ({ ...emptyOperation, ...o })) as unknown as Ops,
    },
  });
  probe.values = (i) => (methods.getValues('operations') ?? [])[i] as Op;
  probe.sheet = () => renderSheet(methods.getValues() as TechCardFormData);
  probe.release = () => renderSheet(methods.getValues() as TechCardFormData, true);
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <FormProvider {...methods}>
          <form>
            <OperationsField />
            {/* КАРТА ПРИМЕРКИ ЖИВЁТ В ТОЙ ЖЕ ФОРМЕ, что и рельс: на карточке она стоит на вкладке
                семплов и читает те же строки контекстом. Второй React-корень контекст формы не
                делит — поэтому она рисуется здесь, рядом, а не отдельным корнем. */}
            <div id='map'>
              <SampleAssemblyMap />
            </div>
          </form>
        </FormProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

probe.mount = (ops) => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  const sheetHost = document.getElementById('sheet');
  if (sheetHost) sheetHost.innerHTML = '';
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness ops={ops} />);
};
