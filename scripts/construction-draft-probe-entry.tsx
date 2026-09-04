// Точка входа пробы «черновик construction не может стереть карточку».
//
// ЗДЕСЬ НЕ ПЕРЕПИСАНО НИ ОДНОЙ ПРОВЕРЯЕМОЙ СТРОКИ. Монтируются ДВА НАСТОЯЩИХ органа репозитория,
// и именно в паре, потому что вопрос пробы — межорганный:
//   · `ConstructionDraft` — тот, кто предлагает и по клику пишет;
//   · `ConstructionGeneralInfo` — ТОТ, КТО РИСУЕТ ПОЛЕ. Цитата снимается с его собственной
//     textarea (`[data-c19-detail=silhouette]`), а не с состояния формы, потому что вопрос звучит
//     «дошло ли значение до поля, которое человек видит», а не «положили ли мы его в объект».
// Контексты даны ровно те, что даёт карточка: форма с `zodResolver(techCardSchema)`, клиент
// запросов, словарь и `DesignCapabilityProvider value` — без последнего `serverSpeaksDesign()`
// вернул бы `false` (умолчание контекста), кнопка встала бы инертной дверью, и вся проба зеленела
// бы на экране, где нажимать нечего.
//
// ФИКСТУРА ЗАЕЗЖАЕТ `defaultValues`, А НЕ `setValue`. Орган отказывает на несохранённой доске
// (`dirtyFields` по `concept` / `moodboardMedia` / `callouts`), и фикстура, посаженная записью,
// сама включила бы этот отказ — стенд измерял бы отказ вместо предложения.
import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';

import { ConstructionGeneralInfo } from 'components/managers/tech-card/components/construction-general-info';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { ConstructionDraft } from 'components/managers/tech-card/components/design/head/construction-draft';
import {
  diffProposal,
  parseConstructionDraft,
} from 'components/managers/tech-card/components/design/head/construction-draft-model';
import {
  techCardDefaultData,
  techCardSchema,
  type TechCardFormData,
} from 'components/managers/tech-card/components/schema';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';

type Probe = {
  mount: (fixture: Record<string, unknown>) => void;
  /** Значения формы, как их держит RHF. Не DOM — второй свидетель для цитат про списки. */
  form: () => Record<string, unknown>;
  /** Сообщения снекбара: «отказ» обязан отличаться от «молча ничего не сделал». */
  alerts: () => string[];
  /** Чистые функции модели — их же зовёт орган; проба спрашивает их напрямую, без экрана. */
  diff: (draft: unknown, form: Record<string, unknown>) => unknown;
  parse: (input: unknown) => unknown;
  /**
   * Пачкает доску ТАК ЖЕ, КАК ЕЁ ПАЧКАЕТ ЧЕЛОВЕК — настоящим `setValue` с `shouldDirty`. Ставить
   * `formState.isDirty` руками значило бы проверять собственную ложь стенда вместо того, как орган
   * читает RHF.
   */
  dirtyBoard: () => void;
};

declare global {
  interface Window {
    __c19: Probe;
    /** Ответ, который отдаст заглушенная сеть на `DraftDesignIdea`. Читается В МОМЕНТ ВЫЗОВА. */
    __c19Stub: { draft?: { mode: 'ok' | 'error'; response?: unknown } };
    /** Имена вызванных RPC — пустой список значит «прогон вообще не уходил». */
    __c19Calls: string[];
  }
}

const probe = {} as Probe;
window.__c19 = probe;
probe.alerts = () => useSnackBarStore.getState().alerts.map((a) => a.message);
probe.diff = (draft, form) => diffProposal(draft as never, form as never);
probe.parse = (input) => parseConstructionDraft(input);

function Harness({ fixture }: { fixture: Record<string, unknown> }) {
  const methods = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema) as never,
    mode: 'onChange',
    defaultValues: { ...techCardDefaultData, ...fixture } as never,
  });
  probe.form = () => methods.getValues() as unknown as Record<string, unknown>;
  probe.dirtyBoard = () =>
    methods.setValue('concept', `${methods.getValues('concept') ?? ''} — edited, not saved`, {
      shouldDirty: true,
    });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return (
    <QueryClientProvider client={qc}>
      <DictionaryProvider>
        <DesignCapabilityProvider value={true}>
          <FormProvider {...methods}>
            <form>
              {/* Обёртка карточки, дословно: на релизнутой карточке блоки живут внутри
                  `<fieldset disabled>`. Здесь карточка ЖИВАЯ, поэтому fieldset открыт — но он
                  стоит, чтобы стенд не отличался от продукта структурой. */}
              <fieldset>
                <ConstructionDraft techCardId={7} conceptMax={2000} />
                <ConstructionGeneralInfo isAux={false} readOnly={false} />
              </fieldset>
            </form>
          </FormProvider>
        </DesignCapabilityProvider>
      </DictionaryProvider>
    </QueryClientProvider>
  );
}

probe.mount = (fixture) => {
  useSnackBarStore.setState({ alerts: [] });
  window.__c19Calls = [];
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness fixture={fixture} />);
};
