// Точка входа пробы «у aux-карты не все поля нужны» (п.13 волны ux-0825).
//
// Здесь НАСТОЯЩИЕ органы хедера: `HeaderMetaFields` (браузер категорий + базовая модель) и
// `StyleFactsField` (fit / care / storefront-превью И staged-запись стилевых фактов). Стенд даёт
// ровно то, что даёт карточка: контекст формы, react-query, роутер и провайдер стейджинга.
//
// ПОЧЕМУ СТЕНД МОНТИРУЕТ ПАНЕЛЬ ТАК ЖЕ, КАК ЕЁ МОНТИРУЕТ КАРТОЧКА. Проверяется не разметка, а
// СОХРАНЁННОСТЬ ЗАПИСИ: `StyleFactsField` — единственный писатель brand / collection / season /
// targetGender (staged UpdateStyle), а UpdateTechCard их намеренно не пишет. Спрятать секцию можно
// двумя способами, и они РАЗНЫЕ: `hideFitCare` оставляет компонент смонтированным (запись жива),
// `{!isAux && …}` снимает его с монтажа (запись умирает молча). Стенд, монтирующий панель всегда,
// эту разницу не увидел бы вовсе — поэтому ветка монтажа живёт здесь и мутируется целиком.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { DictionaryProvider } from 'lib/providers/dictionary-provider';

import { HeaderMetaFields } from 'components/managers/tech-card/components/header-meta-fields';
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
        <Section title={isAux ? 'base model & sample size' : 'category & base model'}>
          <HeaderMetaFields hideCategory={isAux} />
        </Section>
        {isAux ? (
          <StyleFactsField styleId={7} canEdit hideFitCare />
        ) : (
          <Section title='style facts — fit / care (shared by all colourways)'>
            <StyleFactsField styleId={7} canEdit />
          </Section>
        )}
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
