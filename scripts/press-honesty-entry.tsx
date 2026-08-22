// Точка входа пробы «экран не утверждает под-глагол, которого в записи нет»: НАСТОЯЩИЙ редактор
// шага, настоящая таблица видов, настоящий резолв.
//
// Здесь не переписано ничего из проверяемого: ни `kindOf`, ни `kindPickerItems`, ни подписи, ни
// мапперы. Стенд даёт контекст формы (тот же `zodResolver(techCardSchema)`, что и на карточке),
// роутер (редактор читает `useParams`) и рукоятки, которыми проба ЧИТАЕТ состояние. Писать в
// форму мимо органов рукоятки не умеют — приём ВТО проба выбирает кликом по живому пикеру.
//
// ОТДЕЛЬНЫЙ СТЕНД, А НЕ ВЕТКА В `press-action-entry`: одноимённая глобаль с другой сигнатурой
// роняет `tsc` всему проекту (TS2717), а рукоятки здесь спрашивают ДРУГОЕ — не круг «форма →
// провод», а то, каким словом экран называет запись.
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
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import {
  kindLabelOf,
  kindOf,
  kindPickerItems,
  offeredKinds,
} from 'components/managers/tech-card/components/operation-kinds';
import { operationHeading } from 'components/managers/tech-card/components/operation-options';
import type {
  common_TechCardGarmentZone,
  common_TechCardOperationType,
} from 'api/proto-http/admin';

type Ops = NonNullable<TechCardFormData['operations']>;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

type HonestyProbe = {
  mount: (op: Record<string, unknown>) => void;
  values: () => Record<string, unknown>;
  /** Каким пунктом резолв называет ЭТУ запись — сам резолв, без экрана. */
  resolve: (step: Record<string, string>) => { id: string; label: string } | null;
  /** Строки пикера при данном активном пункте — тот же сборщик, что кормит оба экрана. */
  rows: (activeId?: string) => { value: string; label: string; disabled?: boolean }[];
  /** Инвентарь пунктов АВТОРИНГА: список, из которого человек выбирает. */
  offered: () => { id: string; label: string }[];
  /** Заголовок шага — он собирается своим композитором и здесь не должен был измениться. */
  heading: (op: Record<string, string>) => string;
  /** Что уезжает на провод — доказательство, что починка display-only. */
  wire: (op: Record<string, unknown>) => Record<string, unknown> | undefined;
};
declare global {
  interface Window {
    __pressHonesty: HonestyProbe;
  }
}

const probe: HonestyProbe = {} as HonestyProbe;
window.__pressHonesty = probe;

probe.resolve = (step) => {
  const k = kindOf(step);
  return k ? { id: k.id, label: kindLabelOf(k) } : null;
};
probe.rows = (activeId) => kindPickerItems(activeId, true);
probe.offered = () => offeredKinds().map((k) => ({ id: k.id, label: kindLabelOf(k) }));
probe.heading = (op) =>
  operationHeading({
    operationType: op.operationType as common_TechCardOperationType,
    zone: op.zone as common_TechCardGarmentZone,
    // Эта проба — про имя, выведенное ИЗ ЗАПИСИ, и работы у неё нет по замыслу (R8 требует
    // сказать это вслух, а не промолчать необязательным полем).
    work: undefined,
    workCatalog: undefined,
    pieceNames: [],
  });
probe.wire = (op) => {
  const data = {
    ...techCardDefaultData,
    operations: [{ ...emptyOperation, ...op }],
  } as unknown as TechCardFormData;
  const insert = mapFormToTechCardInsert(data, undefined, true);
  return (insert.operations ?? [])[0] as unknown as Record<string, unknown>;
};

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
