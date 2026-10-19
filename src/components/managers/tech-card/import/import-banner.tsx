/**
 * БАННЕР «карточка приехала из архива» + боковая панель (Drawer) её отчёта.
 *
 * Карточка после импорта НЕОТЛИЧИМА от заведённой руками — это решение формата, а не недосмотр.
 * Единственное, что помнит о её происхождении и о потерях, — отчёт импорта, и единственное, что
 * о нём сообщает, — этот баннер. Пока человек его не закрыл, потери на карточке видны; закрыл —
 * значит прочитал и взял на себя, и баннер не возвращается (`acknowledged_at` живёт на сервере,
 * а не в этой вкладке).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { GetTechCardImportReportResponse } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { productionRunKeys } from 'components/managers/production-runs/components/useProductionRuns';
import { styleReadViewKeys } from 'components/managers/tech-card/components/useStyleReadViews';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button, CalloutBox, Drawer, Text } from 'ui';
import {
  ApplyColorwaysAction,
  ImportReportCounters,
  ImportReportTable,
} from './import-report-table';

const importReportKey = (techCardId: number) => ['techCardImportReport', techCardId] as const;

/**
 * КАРТОЧКА БЕЗ ИМПОРТА — НОРМА, А НЕ ОШИБКА, и таких подавляющее большинство. Сервер отвечает на
 * неё NotFound (404), поэтому 404 гасится ЗДЕСЬ и превращается в `null`: пусть отсутствие отчёта
 * будет обычным значением, а не пойманной аварией.
 *
 * Замерено, вопреки опасению из брифа: глобального тоста на 404 в приложении НЕТ — `src/api/api.ts`
 * только бросает `Error` со `status`, а у `QueryClient` (`src/index.tsx`) нет ни `QueryCache`
 * onError, ни какого-либо обработчика ошибок. Гасить нечего; `null` нужен затем, чтобы запрос не
 * висел в состоянии ошибки и не ретраился.
 */
function useImportReport(techCardId: number | undefined) {
  return useQuery({
    queryKey: importReportKey(techCardId ?? 0),
    enabled: !!techCardId,
    // Один запрос на открытие карточки, а не на каждый рендер: без этого дефолтный staleTime в
    // 5 минут всё равно перезапрашивал бы отчёт при возвращении на вкладку.
    staleTime: Infinity,
    // Дефолт клиента — retry: 1. Для «нормального» 404 это лишний круг по сети на каждой карте.
    retry: false,
    queryFn: async (): Promise<GetTechCardImportReportResponse | null> => {
      try {
        return await adminService.GetTechCardImportReport({ techCardId });
      } catch (error) {
        if ((error as { status?: number } | undefined)?.status === 404) return null;
        throw error;
      }
    },
  });
}

export function TechCardImportBanner({ techCardId }: { techCardId: number }) {
  const { data } = useImportReport(techCardId);
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const acknowledge = useMutation({
    mutationFn: () => adminService.AcknowledgeTechCardImportReport({ techCardId }),
    onSuccess: () => {
      // Ack идемпотентен, поэтому перечитывать сервер незачем — достаточно проставить отметку
      // в кэше, и баннер уходит вместе с ней.
      queryClient.setQueryData(
        importReportKey(techCardId),
        (prev: GetTechCardImportReportResponse | null | undefined) =>
          prev ? { ...prev, acknowledgedAt: new Date().toISOString() } : prev,
      );
      setOpen(false);
    },
    onError: (error: unknown) =>
      showMessage(error instanceof Error ? error.message : 'could not dismiss the report', 'error'),
  });

  // ЧИТАТЕЛЬ ВИДИТ ОТЧЁТ, НО НЕ ЗАКРЫВАЕТ ЕГО. Права у двух вызовов РАЗНЫЕ (см.
  // `internal/rbac/rbac.go`): `GetTechCardImportReport` — rd(tech_cards), а
  // `AcknowledgeTechCardImportReport` — wr(tech_cards). Показать баннер читателю правильно:
  // потери на карточке касаются и его. Показать ему «dismiss» — значит предложить кнопку,
  // которая ответит 403 и оставит человека гадать, почему баннер не ушёл.
  const mayDismiss = canWrite(SECTION.techCards);

  const report = data?.report;
  if (!report) return null;
  // `acknowledgedAt` незадан — с провода приезжает ЯВНЫМ null (EmitUnpopulated), а не пропущенным
  // ключом. Проверка на falsy покрывает и null, и undefined; `=== undefined` не покрыла бы.
  //
  // ЗАКРЫТЫЙ ОТЧЁТ ПРЯЧЕТ ПОЛОСУ ВНИМАНИЯ, НО НЕ САМ ОТЧЁТ. Раньше здесь стоял `return null`, и
  // это давало тупик на две стороны. Первая: отчёт — ЕДИНСТВЕННАЯ память карточки о том, чего
  // импорт не довёз, а сервер хранит его вечно; спрятать его насовсем значит стереть эту память
  // из интерфейса, оставив в базе. Вторая: в отчёте живёт кнопка создания колорвеев, и её
  // собственный текст велит «нажать кнопку ещё раз» — человек, закрывший баннер до нажатия,
  // читал инструкцию к органу, до которого больше не мог дойти.
  const acknowledged = Boolean(data?.acknowledgedAt);

  const lines = report.lines ?? [];
  const counters = report.counters ?? [];
  // «Требует внимания» — это НЕ все строки отчёта: `imported` в отчёте означает «приехало как
  // было», и звать человека к нему незачем. Считаем только то, что он может закрыть руками.
  const needsAttention = lines.filter((l) => l.status && l.status !== 'imported').length;

  return (
    <>
      {acknowledged || needsAttention === 0 ? (
        // Закрытый отчёт — приглушённая строка, а не полоса внимания: человек уже сказал, что
        // взял дыры на себя, и звать его второй раз незачем. Но дорога обратно остаётся. Отчёт
        // без дыр — та же строка: звать некуда.
        <div className='flex flex-wrap items-center gap-2.5'>
          <Text size='micro' variant='label'>
            imported from archive
          </Text>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='ml-auto'
            onClick={() => setOpen(true)}
          >
            view report
          </Button>
        </div>
      ) : (
        <CalloutBox tone='warning'>
          <div className='flex flex-wrap items-center gap-2.5'>
            <Text size='control'>imported from archive · {needsAttention} need attention</Text>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='ml-auto'
              onClick={() => setOpen(true)}
            >
              view report
            </Button>
          </div>
        </CalloutBox>
      )}

      {/* Список, который держат рядом с карточкой, пока чинят дыры, — Drawer, а не модалка.
          Подвал только у пишущего: «dismiss» есть лишь у того, кому сервер его разрешит
          (rd ≠ wr), и лишь пока отчёт не закрыт. Остальным — ✕ в шапке. */}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        width={720}
        title='import report'
        footer={
          mayDismiss && !acknowledged ? (
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={acknowledge.isPending}
              // Закрывает панель onSuccess мутации: закрытие сразу спрятало бы отказ сервера.
              onClick={() => acknowledge.mutate()}
            >
              dismiss report
            </Button>
          ) : undefined
        }
      >
        <div className='flex flex-col gap-2.5'>
          <Text size='micro' variant='label'>
            {report.styleNumber ? `${report.styleNumber} · ` : ''}
            {report.importId ?? ''}
          </Text>
          <ImportReportCounters counters={counters} />
          {/* Кнопка стоит МЕЖДУ счётчиками и таблицей: счётчик называет число непривезённых
              цветов, кнопка отвечает на него, таблица под ней объясняет построчно. Сама она
              решает, показываться ли, — см. `ApplyColorwaysAction`. */}
          <ApplyColorwaysAction
            techCardId={techCardId}
            lines={lines}
            onApplied={(fresh) => {
              // ОТВЕТ ЗАМЕЩАЕТ ОТЧЁТ, и именно в кэше: `useImportReport` держит `staleTime:
              // Infinity`, поэтому инвалидация здесь ничего бы не перечитала, а показанный отчёт
              // остался бы утверждать, что колорвеи не приехали — рядом с только что заведёнными.
              queryClient.setQueryData(
                importReportKey(techCardId),
                (prev: GetTechCardImportReportResponse | null | undefined) =>
                  prev ? { ...prev, report: fresh } : prev,
              );
              // КОЛОРВЕИ ПРИХОДЯТ В `GetTechCard` — карточка обязана перечитаться, иначе вкладка
              // «colorways» будет пуста ровно после того, как их создали.
              queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
              // Строка списка и пайплайн несут сведения о колорвеях стиля (то же, что чистит
              // удаление колорвея в `useColorwayRecipe.ts`).
              queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
              queryClient.invalidateQueries({ queryKey: techCardKeys.pipeline() });
              // Матрица костинга — проекция ПО КОЛОРВЕЯМ: у неё появляются целые колонки.
              // Префикс, а не один ключ: цветов создаётся сразу несколько.
              queryClient.invalidateQueries({
                queryKey: styleReadViewKeys.costEstimates(techCardId),
              });
              // Планы материалов и факты прогонов адресуют продукты и лежат под общим корнем.
              queryClient.invalidateQueries({ queryKey: productionRunKeys.all });
              // Образцы, задачи, склад, история остатков и лист ожидания НЕ трогаются
              // сознательно: у только что заведённого драфта их не может быть. Их чистит
              // УДАЛЕНИЕ колорвея, где они остаются сиротами, — а это обратная задача.
            }}
          />
          <ImportReportTable lines={lines} />
        </div>
      </Drawer>
    </>
  );
}
