// Точка входа пробы ВТО-под-глагола: НАСТОЯЩИЙ редактор шага, настоящая форма, настоящий zod.
//
// Здесь не переписано ничего из проверяемого — ни таблица видов, ни гейты рендера, ни правило
// «направление только при заутюживании», ни мапперы. Стенд даёт ровно три вещи: контекст формы
// (`FormProvider` с тем же `zodResolver(techCardSchema)`, что и на карточке), роутер (редактор
// читает `useParams` / `useSearchParams`) и рукоятки, которыми проба ЧИТАЕТ состояние формы и
// катает круг «форма → провод → форма». Писать в форму мимо органов рукоятки не умеют.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';

import { OperationsField, emptyOperation } from 'components/managers/tech-card/components/operations-field';
import {
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { offeredKinds, kindLabelOf } from 'components/managers/tech-card/components/operation-kinds';

type Ops = NonNullable<TechCardFormData['operations']>;

// Запросов стенд не делает (сеть заглушена), но редактор живёт под провайдером и на карточке —
// поднимать его тут значит держать тот же контекст, а не подменять компонент.
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// ОДНО ИМЯ НА ВСЕ РУКОЯТКИ, а не пять глобалей: `Window` в этом репозитории расширяют и соседние
// стенды, и одноимённое `__mount` с другой сигнатурой роняет `tsc` всему проекту (TS2717).
type PressProbe = {
  mount: (op: Record<string, unknown>) => void;
  values: () => Record<string, unknown>;
  trigger: () => Promise<boolean>;
  roundTrip: (op: Record<string, unknown>) => {
    wire: Record<string, unknown> | undefined;
    back: Record<string, unknown> | undefined;
  };
  offered: () => { id: string; label: string }[];
};
declare global {
  interface Window {
    __press: PressProbe;
  }
}

const probe: PressProbe = {} as PressProbe;
window.__press = probe;

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
  probe.trigger = async () => {
    await methods.trigger('operations');
    return true;
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

// КРУГ «ФОРМА → ПРОВОД → ФОРМА» — теми же двумя мапперами, что ходят на сервер и обратно. Ни один
// из них проба не подменяет: потеря поля видна только на настоящей паре.
probe.roundTrip = (op) => {
  const data = {
    ...techCardDefaultData,
    operations: [{ ...emptyOperation, ...op }],
  } as unknown as TechCardFormData;
  const insert = mapFormToTechCardInsert(data, undefined, true);
  const wireOp = (insert.operations ?? [])[0] as unknown as Record<string, unknown>;
  const back = mapTechCardToForm({ techCard: insert } as never);
  return {
    wire: wireOp,
    back: (back.operations ?? [])[0] as unknown as Record<string, unknown>,
  };
};

probe.offered = () => offeredKinds().map((k) => ({ id: k.id, label: kindLabelOf(k) }));

probe.mount = (op) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness op={op} />);
};
