import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRunCutReceiptInsert } from 'api/proto-http/admin';
import { productionRunKeys } from './useProductionRuns';

// ПРИЁМКА КРОЯ (Ф5б.5) — провод трёх RPC: список по ПРОГОНУ, апсерт пары (настил, размер),
// удаление той же пары. Ни одного числа здесь не считается: соединение строк приёмки со строками
// прогона живёт в cut-receipts.tsx, потому что это решение о ЗНАЧЕНИИ чисел, а не о их доставке.
//
// Ключ лежит ПОД detail(runId) — тем же приёмом, что `layKeys` (useLays.ts:14-16) и `useMaterialPlan`
// (useProductionRuns.ts:115-121). Это не косметика: React Query матчит ключи по префиксу, поэтому
// инвалидация настилов (`invalidateLayWrite` дёргает detail(runId)) заодно перечитывает приёмку — а
// перечитать её ОБЯЗАНО, потому что строка приёмки висит на настиле через FK ON DELETE CASCADE
// (0287): удалённый настил уносит свои строки приёмки с собой, и список без перечитки показывал бы
// числа, которых в базе уже нет.
export const cutReceiptKeys = {
  list: (runId: number) => [...productionRunKeys.detail(runId), 'cutReceipts'] as const,
};

export function useCutReceipts(runId: number, enabled: boolean) {
  return useQuery({
    queryKey: cutReceiptKeys.list(runId),
    queryFn: () => adminService.ListProductionRunCutReceipts({ runId }),
    enabled,
  });
}

/** Строки ОДНОГО настила, отправляемые одним нажатием «сохранить» в его таблице. */
export type SaveCutReceiptRowsInput = {
  runId: number;
  layKey: string;
  rows: common_ProductionRunCutReceiptInsert[];
};

/**
 * Исход пакета — ПОРОВНУ про успех и про отказ, и поэтому мутация не бросает.
 *
 * RPC адресует ОДНУ пару, значит «сохранить настил» — это N вызовов, и на середине пакета одна пара
 * уже записана, а другая ещё нет. Если бы цикл бросал первой же ошибкой, вызывающий не смог бы
 * узнать, какие строки уже уехали, и был бы обязан либо потерять черновик целиком, либо оставить
 * грязными уже сохранённые строки. Апсерт идемпотентен, так что повтор безопасен; неизвестность — нет.
 */
export type SaveCutReceiptRowsResult = {
  /** size_id строк, которые сервер принял. */
  saved: number[];
  /** size_id строк, которые он отверг, с готовым текстом отказа. */
  failed: { sizeId: number; message: string }[];
};

export function useSaveCutReceiptRows() {
  const qc = useQueryClient();
  return useMutation<SaveCutReceiptRowsResult, Error, SaveCutReceiptRowsInput>({
    mutationFn: async (input) => {
      const out: SaveCutReceiptRowsResult = { saved: [], failed: [] };
      // ПОСЛЕДОВАТЕЛЬНО, а не Promise.all: пары независимы (у каждой свой UNIQUE (lay_id, size_id)),
      // но сервер берёт X-лок на строку ПРОГОНА на каждый апсерт (resolveCutReceiptRun ... FOR
      // UPDATE), так что параллельный пакет выстроился бы в ту же очередь — только на стороне базы и
      // без предсказуемого порядка в отчёте об отказе.
      for (const receipt of input.rows) {
        try {
          await adminService.SaveProductionRunCutReceipt({
            runId: input.runId,
            layKey: input.layKey,
            receipt,
          });
          out.saved.push(receipt.sizeId ?? 0);
        } catch (e) {
          out.failed.push({ sizeId: receipt.sizeId ?? 0, message: cutReceiptErrorMessage(e) });
        }
      }
      return out;
    },
    // onSettled, а не onSuccess: пакет с отказом всё равно мог записать часть строк, и экран,
    // оставшийся на доотказном списке, показывал бы старые числа рядом с сообщением об ошибке.
    // ПРОМИС ВОЗВРАЩАЕТСЯ, а не проглатывается: React Query ждёт его прежде, чем разрешить
    // mutateAsync, поэтому вызывающий снимает черновик уже с перечитанного списка. Без этого между
    // «сохранено» и приехавшим ответом был бы кадр с ДОсохранёнными числами — экран, на мгновение
    // отрицающий только что подтверждённое действие.
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: cutReceiptKeys.list(v.runId) }),
  });
}

// Удаление пары — единственный способ сказать «этого размера на этом настиле не кроили»: строка из
// нулей это СЧЁТ, равный нулю, а отсутствие строки — отсутствие счёта (та же пара смыслов, что у
// сервера в DeleteCutReceipt).
export function useDeleteCutReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { runId: number; layKey: string; sizeId: number }) =>
      adminService.DeleteProductionRunCutReceipt({
        runId: input.runId,
        layKey: input.layKey,
        sizeId: input.sizeId,
      }),
    // Тот же возврат промиса, что у сохранения: удалённая строка обязана исчезнуть из списка до
    // того, как экран скажет «удалено».
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: cutReceiptKeys.list(v.runId) }),
  });
}

/**
 * Отказы приёмки кроя. Таблица — зеркало серверной (production_cut_receipt.go:136-151).
 *
 * 409 (Aborted) здесь НЕ «изменено в другом окне» в смысле оптимистичной блокировки: у строки
 * приёмки нет lock_version, и сервер отдаёт Aborted ровно в одном случае — гонка create/create по
 * одной паре. Поэтому и совет другой: не «обновите страницу и решайте, чья версия верна», а
 * «перечитайте — ваша повторная запись станет правкой». Копия updateRunErrorMessage соврала бы о
 * природе конфликта.
 *
 * 400 приходит и с InvalidArgument, и с FailedPrecondition (gateway отдаёт 400 на оба), и текст в
 * обоих случаях написан сервером для оператора — поэтому идёт как есть.
 */
export function cutReceiptErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  const msg = e instanceof Error ? e.message : '';
  if (status === 409)
    return 'this pair was just entered in another window — refresh the page and retry';
  if (status === 404)
    return "the lay or the receipt line wasn't found — the lay may have been deleted";
  if (status === 400) return msg || "the server didn't accept these numbers";
  return msg || "couldn't save the cut receipt";
}
