// Точка входа пробы счётчика неназванных шагов (Д6): НАСТОЯЩИЙ рельс из НАСТОЯЩЕЙ формы.
//
// ПОЧЕМУ ЖИВОЙ ЭКРАН, А НЕ ВЫЗОВ ФУНКЦИИ. Считать пустые `work` в массиве умеет и тест на три
// строки — но проверяется здесь не арифметика, а то, что ШАПКА РЕЛЬСА эту строку показывает
// ОДНУ и ПРЯЧЕТ ЦЕЛИКОМ на нуле. Обе половины — свойства отрисовки: функция, возвращающая 0,
// зеленела бы и в том случае, когда экран рисует «0 steps not named yet», то есть ровно при том
// дефекте, ради которого проба заведена.
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
type Op = Record<string, unknown>;

type UnnamedProbe = { mount: (ops: Op[]) => void };
declare global {
  interface Window {
    __unnamed: UnnamedProbe;
  }
}

const probe: UnnamedProbe = {} as UnnamedProbe;
window.__unnamed = probe;

let qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });

function Harness({ ops }: { ops: Op[] }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: {
      ...techCardDefaultData,
      operations: ops.map((o) => ({ ...emptyOperation, ...o })) as unknown as Ops,
    },
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
  // КЛИЕНТ ЗАНОВО НА КАЖДОЕ МОНТИРОВАНИЕ: каталог работ кэшируется, и общий клиент донёс бы
  // ответ первого стенда до второго — а стенды в этой пробе намеренно разные.
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness ops={ops} />);
};
