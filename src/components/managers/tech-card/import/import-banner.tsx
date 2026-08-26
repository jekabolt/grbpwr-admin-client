/**
 * БАННЕР «карточка приехала из архива» + модалка её отчёта.
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
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { ImportReportCounters, ImportReportTable } from './import-report-table';

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
  // `acknowledgedAt` незадан — с провода приезжает ЯВНЫМ null (EmitUnpopulated), а не пропущенным
  // ключом. Проверка на falsy покрывает и null, и undefined; `=== undefined` не покрыла бы.
  if (!report || data?.acknowledgedAt) return null;

  const lines = report.lines ?? [];
  const counters = report.counters ?? [];
  // «Требует внимания» — это НЕ все строки отчёта: `imported` в отчёте означает «приехало как
  // было», и звать человека к нему незачем. Считаем только то, что он может закрыть руками.
  const needsAttention = lines.filter((l) => l.status && l.status !== 'imported').length;

  return (
    <>
      <CalloutBox tone='warning'>
        <div className='flex flex-wrap items-center gap-2.5'>
          <Text size='control'>
            {needsAttention > 0
              ? `Imported from archive — ${needsAttention} item(s) need attention`
              : 'Imported from archive — nothing needs attention'}
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
      </CalloutBox>

      <ConfirmationModal
        open={open}
        onOpenChange={setOpen}
        width='lg'
        title='import report'
        cancelLabel='close'
        // Подвал целиком, а не одна кнопка: пустой `confirmLabel` шелл НЕ понимает — он рисует
        // «главную» кнопку всегда и выдал бы чёрный прямоугольник без подписи. Тот же приём, что
        // у `sample-delete.tsx` и `colorway-delete.tsx`: нет пишущего действия — нет подвала.
        // Читателю остаются ✕ в шапке, Esc и клик по подложке.
        hideActions={!mayDismiss}
        confirmLabel='dismiss'
        // Закрывает модалку onSuccess мутации: авто-закрытие спрятало бы отказ сервера,
        // и баннер остался бы висеть без объяснения, почему «dismiss» ничего не сделал.
        closeOnConfirm={false}
        onConfirm={() => {
          if (!mayDismiss) return;
          acknowledge.mutate();
        }}
      >
        <div className='flex flex-col gap-2.5'>
          <Text size='micro' variant='label'>
            {report.styleNumber ? `${report.styleNumber} · ` : ''}
            {report.importId ?? ''}
          </Text>
          <ImportReportCounters counters={counters} />
          <ImportReportTable lines={lines} />
          {mayDismiss ? (
            <Text size='micro' variant='label'>
              «dismiss» takes these holes on yourself — the banner will not come back.
            </Text>
          ) : null}
        </div>
      </ConfirmationModal>
    </>
  );
}
