// Точка входа пробы «у aux-карты не все поля нужны» (п.13 волны ux-0825).
//
// Здесь НАСТОЯЩИЕ органы хедера: `CategoryBrowser` + `BaseModelFields` (до круга 20 их держала
// вместе обёртка `HeaderMetaFields`; B-27 развёл эти поля по двум блокам, и стенд следует за
// карточкой, а не за снесённой обёрткой) и `StyleFactsField` (fit / care / storefront-превью И
// staged-запись стилевых фактов). Стенд даёт ровно то, что даёт карточка: контекст формы,
// react-query, роутер и провайдер стейджинга.
//
// ПОЧЕМУ СТЕНД МОНТИРУЕТ ПАНЕЛЬ ТАК ЖЕ, КАК ЕЁ МОНТИРУЕТ КАРТОЧКА. Проверяется не разметка, а
// СОХРАНЁННОСТЬ ЗАПИСИ: `StyleFactsField` — единственный писатель brand / collection / season /
// targetGender (staged UpdateStyle), а UpdateTechCard их намеренно не пишет. Спрятать секцию можно
// двумя способами, и они РАЗНЫЕ: `hideFitCare` оставляет компонент смонтированным (запись жива),
// `{!isAux && …}` снимает его с монтажа (запись умирает молча). Стенд, монтирующий панель всегда,
// эту разницу не увидел бы вовсе — поэтому ветка монтажа живёт здесь и мутируется целиком.
//
// U-2 (18ef993ae, прямое указание владельца): care убран из полосы, FIT уехал в классификацию, и
// карточка больше НЕ рисует панель видимой ни на какой карте — `<StyleFactsField … hideFitCare />`
// смонтирован безусловно, без ветки по isAux. Стенд следует за карточкой: панель здесь тоже всегда
// смонтирована и всегда спрятана, а мутация `--mutate-unmount` вставляет в монтаж ту самую ветку
// `{!isAux && …}`. FIT и CATEGORY живут в GENERAL INFORMATION (`construction-general-info.tsx`,
// 3e34aa61a, B6): `{!isAux && <StyleFacts/>}`, а сторона правки этой строки — `FitCell` (под
// `fitChoicesFor(…, false)`) и `CategoryBrowser`. Стенд рисует ровно эти органы под тем же гейтом.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { DictionaryProvider, useDictionary } from 'lib/providers/dictionary-provider';

import { fitChoicesFor } from 'components/managers/tech-card/components/design/fit-vocabulary';
import { FitCell } from 'components/managers/tech-card/components/design/style-cells';
import {
  BaseModelFields,
  CategoryBrowser,
} from 'components/managers/tech-card/components/header-meta-fields';
import { StyleFactsField } from 'components/managers/tech-card/components/style-facts-field';
import {
  TechCardStagingProvider,
  useStagedChanges,
} from 'components/managers/tech-card/components/useTechCardStaging';
import { Section } from 'ui/components/section';

type Probe = {
  mount: (isAux: boolean) => void;
  /** Тронуть бренд — поле ХЕДЕРА, писателем которого является спрятанная панель. */
  dirtyBrand: () => void;
};
declare global {
  interface Window {
    __aux: Probe;
  }
}
const probe = {} as Probe;
window.__aux = probe;

// Что застейджено — читается ОДНИМ узлом с атрибутом, а не текстом страницы: склейка соседних
// узлов через textContent уже давала здесь ложную зелень.
function StagedReadout() {
  const changes = useStagedChanges();
  return (
    <div
      data-staged={changes.map((c) => `${c.key}=${c.label}`).join(' | ')}
      data-staged-count={changes.length}
    />
  );
}

// Ячейка FIT строки фактов GENERAL INFORMATION (`StyleFacts`, construction-general-info.tsx):
// `fitChoicesFor(categories, categoryId, false)` и `<FitCell creating={false} locked={…} />`.
function GeneralInfoFit() {
  const { dictionary } = useDictionary();
  const categoryId = Number(useWatch({ name: 'categoryId' }) ?? 0);
  const choices = fitChoicesFor(dictionary?.categories, categoryId, false);
  return choices ? <FitCell choices={choices} creating={false} locked={false} /> : null;
}

function Harness({ isAux }: { isAux: boolean }) {
  const form = useForm<any>({
    defaultValues: {
      brand: 'GRBPWR',
      collection: '',
      season: 'SS26',
      targetGender: 'GENDER_ENUM_UNISEX',
      fit: '',
      careInstructions: '',
      categoryId: 0,
      // Панель читает назначение из ФОРМЫ (маска fit — `fitChoicesFor(…, purpose === AUX)`), как
      // на карточке; без него aux-стенд считался бы sellable внутри панели.
      purpose: isAux ? 'TECH_CARD_PURPOSE_AUXILIARY' : 'TECH_CARD_PURPOSE_SELLABLE',
      sizeIds: [],
      baseModelId: 0,
      baseSampleSizeId: 0,
      labels: [],
    },
  });
  probe.dirtyBrand = () => form.setValue('brand', 'NEW BRAND', { shouldDirty: true });
  return (
    <FormProvider {...form}>
      <TechCardStagingProvider>
        <StagedReadout />
        {/* Гейт категории и посадки тот же, что у карточки: `{!isAux && <StyleFacts/>}` в
            GENERAL INFORMATION — ветка МОНТАЖА у вызывающего. Внутри — сторона правки строки
            фактов, те же два органа: `FitCell` и `CategoryBrowser`. */}
        {!isAux && (
          <Section title='general information'>
            <GeneralInfoFit />
            <CategoryBrowser />
          </Section>
        )}
        <Section title='base model & sample size'>
          <BaseModelFields />
        </Section>
        <StyleFactsField styleId={7} canEdit hideFitCare />
      </TechCardStagingProvider>
    </FormProvider>
  );
}

probe.mount = (isAux) => {
  const el = document.getElementById('root')!;
  el.innerHTML = '';
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(el).render(
    <MemoryRouter>
      {/* НАСТОЯЩИЙ провайдер словаря, а не подмена контекста: браузер категорий читает категории
          именно через него, и стенд, кладущий их мимо, проверял бы не тот путь. Ответ словаря
          перехватывается сетью пробы. */}
      <DictionaryProvider>
        <QueryClientProvider client={qc}>
          <Harness isAux={isAux} />
        </QueryClientProvider>
      </DictionaryProvider>
    </MemoryRouter>,
  );
};

// Стенд не должен молча стать одноразовым: вешаем useState-заглушку, чтобы React не ругался на
// неиспользованный импорт при мутации ветки монтажа.
void useState;
