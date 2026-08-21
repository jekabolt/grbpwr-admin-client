// Точка входа пробы полосы остатков: НАСТОЯЩИЙ редактор шага, настоящая форма, настоящий zod.
//
// Здесь не переписано ничего из проверяемого — ни таблица состояний полей, ни гейты рендера, ни
// правило «остаток = заполнено и не показано». Стенд даёт контекст формы (тот же
// `zodResolver(techCardSchema)`, что на карточке), роутер (редактор читает `useParams` /
// `useSearchParams`) и три рукоятки: смонтировать шаг, прочитать значения, спросить, ГРЯЗНАЯ ли
// форма. Писать в форму мимо органов рукоятки не умеют — в этом весь смысл: «карточка не пачкается
// от одного открытия» проверяется тем, что её никто не трогал.
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
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';

type Ops = NonNullable<TechCardFormData['operations']>;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// ОДНО ИМЯ НА ВСЕ РУКОЯТКИ, а не пять глобалей: `Window` в этом репозитории расширяют и соседние
// стенды, и одноимённое `__mount` с другой сигнатурой роняет `tsc` всему проекту (TS2717).
type ResidueProbe = {
  mount: (op: Record<string, unknown>) => void;
  values: () => Record<string, unknown>;
  dirty: () => { isDirty: boolean; fields: string[] };
  trigger: () => Promise<void>;
  // Кладёт отказ на путь ТЕМ ЖЕ методом, каким его кладёт applyServerFieldErrors на карточке
  // (`setError(path, { type: 'server', message })`). Нужна второму роду строк полосы: отказ на
  // пути, чей контрол не смонтирован, — включая отказ на пустом поле.
  setError: (path: string, message: string) => void;
};
declare global {
  interface Window {
    __residue: ResidueProbe;
  }
}

const probe: ResidueProbe = {} as ResidueProbe;
window.__residue = probe;

function Harness({ op }: { op: Record<string, unknown> }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      operations: [{ ...emptyOperation, ...op }] as unknown as Ops,
    },
  });
  probe.values = () => (methods.getValues('operations') ?? [])[0] as Record<string, unknown>;
  probe.dirty = () => ({
    isDirty: methods.formState.isDirty,
    fields: Object.keys(
      ((methods.formState.dirtyFields.operations ?? [])[0] ?? {}) as Record<string, unknown>,
    ),
  });
  probe.trigger = async () => {
    await methods.trigger('operations');
  };
  probe.setError = (path, message) => {
    methods.setError(path as never, { type: 'server', message });
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

probe.mount = (op) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness op={op} />);
};
