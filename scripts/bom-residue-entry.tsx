// Точка входа пробы полосы остатков НА СТРОКЕ СПЕЦИФИКАЦИИ МАТЕРИАЛОВ.
//
// Здесь не переписано ничего из проверяемого — ни предикаты рендера контролов, ни правило
// «остаток = заполнено и не показано», ни мапперы. Стенд даёт контекст формы (тот же
// `zodResolver(techCardSchema)`, что на карточке) и рукоятки: смонтировать строку, прочитать
// значения, спросить, ГРЯЗНАЯ ли форма, положить отказ на путь и прогнать форму→провод.
//
// МОНТИРУЕТСЯ `SlotIdentityFields` — НАСТОЯЩИЙ КОМПОНЕНТ, а не его копия: это ровно тот блок,
// который обе ветки редактора строки (привязанная и непривязанная) рисуют первым. Тащить сюда
// `BomField` целиком значило бы поднимать каталог материалов, права и react-query поверх сети —
// то есть проверять стенд, а не полосу.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import type { common_TechCard } from 'api/proto-http/admin';
import { SlotIdentityFields } from 'components/managers/tech-card/components/bom-field';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

type Bom = NonNullable<TechCardFormData['bomItems']>;
type Line = Record<string, unknown>;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// ПУСТАЯ СТРОКА БЕРЁТСЯ У МАППЕРА ЧТЕНИЯ, а не выписана константой: `emptyBomItem` не
// экспортируется, а чтение пустой строки с провода даёт ровно ту же строку формы — и даёт её тем
// же кодом, который правится в этой задаче.
function emptyLine(): Line {
  const form = mapTechCardToForm({
    techCard: { bomItems: [{}] },
  } as unknown as common_TechCard);
  return (form.bomItems ?? [])[0] as unknown as Line;
}

type BomProbe = {
  mount: (line: Line) => void;
  empty: () => Line;
  values: () => Record<string, unknown>;
  dirty: () => { isDirty: boolean; fields: string[] };
  trigger: () => Promise<void>;
  // Кладёт отказ на путь ТЕМ ЖЕ методом, каким его кладёт applyServerFieldErrors на карточке.
  setError: (path: string, message: string) => void;
  // Форма → провод, через настоящий `mapFormToTechCardInsert`. Копия маппера в пробе доказывала бы
  // только то, что копия согласна сама с собой.
  mapOut: (line: Line) => Record<string, unknown>;
};
declare global {
  interface Window {
    __bom: BomProbe;
  }
}

const probe = {} as BomProbe;
window.__bom = probe;

probe.empty = emptyLine;
probe.mapOut = (line) => {
  const data = {
    ...techCardDefaultData,
    bomItems: [{ ...emptyLine(), ...line }],
  } as unknown as TechCardFormData;
  return (mapFormToTechCardInsert(data).bomItems ?? [])[0] as unknown as Record<string, unknown>;
};

function Harness({ line }: { line: Line }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      bomItems: [{ ...emptyLine(), ...line }] as unknown as Bom,
    },
  });
  probe.values = () => (methods.getValues('bomItems') ?? [])[0] as Record<string, unknown>;
  probe.dirty = () => ({
    isDirty: methods.formState.isDirty,
    fields: Object.keys(
      ((methods.formState.dirtyFields.bomItems ?? [])[0] ?? {}) as Record<string, unknown>,
    ),
  });
  probe.trigger = async () => {
    await methods.trigger('bomItems');
  };
  probe.setError = (path, message) => {
    methods.setError(path as never, { type: 'server', message });
  };
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tech-cards/1']}>
        <FormProvider {...methods}>
          <form>
            <div data-slot-identity>
              <SlotIdentityFields index={0} />
            </div>
          </form>
        </FormProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

probe.mount = (line) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness line={line} />);
};
