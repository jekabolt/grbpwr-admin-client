import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useRef, useState } from 'react';

import { designKeys, newClientRequestId } from '../use-design-band';
import { PATTERN, normaliseRepeat } from './model';

/**
 * ЗАПУСК ПРОГОНА-ПЛИТКИ. Одна запись, которую делает эта вкладка.
 *
 * ═══ ПОЧЕМУ НЕ `render/use-design-run.ts`, ХОТЯ ЭТО ТОТ ЖЕ `StartDesignRun` ════════════════════
 *
 * Две причины, и обе — про КОНТРАКТ ТОГО ХУКА, а не про вкус:
 *
 *   1. ЕГО ВХОД СУЖЕН ТИПОМ: `StartRunInput.kind` объявлен как `'flat' | 'render' | 'threed'`.
 *      Провести через него `pattern` можно было бы только приведением — то есть соврав
 *      компилятору ровно там, где контракт как раз добавил новый род. Расширение того типа — правка
 *      чужого файла (см. список «что должен сделать другой» в отчёте волны).
 *   2. ЕГО ВЫХОД ТЕРЯЕТ ОТКАЗ. Он возвращает `{ start, isPending }`, а сообщение сервера показывает
 *      ТОСТОМ и забывает. Для этой вкладки этого мало и это прямо оговорено требованием: маршрут
 *      без ключа отказывается СЛОВАМИ И НАЗЫВАЕТ ПЕРЕМЕННУЮ ОКРУЖЕНИЯ, и такой отказ обязан
 *      остаться на экране, дословно, пока его не сменит следующая попытка. Тост живёт четыре
 *      секунды, уезжает сам и уносит с собой имя переменной — то есть единственное, ради чего его
 *      стоило читать. Отказы `no_source_picture`, `one_source_picture` и `provider_model_retired`
 *      — той же природы: это не «сеть моргнула», а состояние, которое надо прочесть и исправить.
 *
 * ВСЁ ОСТАЛЬНОЕ ПОВТОРЕНО ЗА НИМ ДОСЛОВНО, И ЭТО НАМЕРЕННО: ключ идемпотентности по отпечатку
 * намерения, инвалидация ОДНОГО ключа полосы, чтение 409 как «кто-то успел раньше». Разойтись
 * здесь с соседним экраном значило бы завести второй диалект денежной двери.
 */

/** grpc-gateway отображает `codes.Aborted` в HTTP 409 — кто-то другой успел первым. */
function isAborted(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 409;
}

export type PatternRunInput = {
  /** РОВНО ОДНА картинка. Сервер отказывает `one_source_picture` на любое другое число. */
  sourceMediaId: number;
  /** Раппорт в целых миллиметрах; 0 = не назван, что законно. */
  repeatMm: number;
  /** Фраза человека — подпись строки в истории. Обычно пуста. */
  ask?: string;
};

export type PatternRunState = {
  start: (input: PatternRunInput) => void;
  isPending: boolean;
  /**
   * ПОСЛЕДНИЙ ОТКАЗ, ДОСЛОВНО, И ОН ЖИВЁТ ДО СЛЕДУЮЩЕЙ ПОПЫТКИ.
   *
   * `null` — отказа не было. Пустая строка невозможна: сервер, отказавший без слов, всё равно
   * получает здесь строку-заглушку, потому что «отказ произошёл» и «отказ ничего не сказал» —
   * разные новости, и вторая обязана быть видимой.
   */
  refusal: string | null;
  /** Снять отказ с экрана рукой. Ставится только человеком; успех снимает его сам. */
  dismissRefusal: () => void;
};

export function useStartPatternRun(techCardId?: number): PatternRunState {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const ledger = useRef<{ fingerprint: string; id: string } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: PatternRunInput & { clientRequestId: string }) =>
      adminService.StartDesignRun({
        techCardId: techCardId ?? 0,
        clientRequestId: input.clientRequestId,
        kind: PATTERN,
        ask: input.ask ?? '',
        params: {
          // ПЛИТКА НЕ ИМЕЕТ ВИДА ИЗДЕЛИЯ. Список пуст ЯВНО, а не отсутствует: пустой список — это
          // утверждение «этот прогон не просит ни одной стороны», и сервер сверяет его длину.
          views: [],
          layout: '',
          colour: undefined,
          threed: undefined,
          fixTarget: '',
          // ⚠ ИМЯ ПОЛЯ ГОВОРИТ «EXTRA», А ВЕЗЁТ ОНО ЗДЕСЬ ЕДИНСТВЕННЫЙ ВХОД. Это переиспользование
          // из контракта, а не небрежность: на рендере это действительно «сверх слотов», на
          // `pattern` — та самая одна картинка, из которой строится плитка.
          extraInputMediaIds: [input.sourceMediaId],
          fixTargets: [],
          fixSlotIds: [],
          autoSplit: false,
          detailSlotIds: [],
          pattern: { repeatMm: normaliseRepeat(input.repeatMm) },
          useFlatSlots: false,
        },
        rerunOfRunId: 0,
      }),
    onSuccess: () => {
      ledger.current = null;
      setRefusal(null);
      qc.invalidateQueries({ queryKey: designKeys.band(techCardId ?? 0) });
      // Прогон возвращается PENDING, а не готовым: плитка приезжает в ленту, когда ответит
      // провайдер. Сказать это — разница между «ничего не произошло» и «заказано».
      showMessage('tile run started — it lands below when it finishes', 'success');
    },
    onError: (error: unknown) => {
      const message = (error as Error)?.message?.trim();
      // ДОСЛОВНО. Ни перевода, ни обобщения: отказ без ключа НАЗЫВАЕТ ПЕРЕМЕННУЮ, и наш пересказ
      // потерял бы её. Своё у нас только приписка «что с этим делать», и она стоит рядом, не вместо.
      const words = message || 'the run did not start, and the server said nothing about why';
      setRefusal(isAborted(error) ? `someone changed this first — ${words}` : words);
      if (isAborted(error)) qc.invalidateQueries({ queryKey: designKeys.band(techCardId ?? 0) });
    },
  });

  const start = useCallback(
    (input: PatternRunInput) => {
      if (!techCardId || techCardId <= 0) return;
      // ОТПЕЧАТОК ПОКРЫВАЕТ ВСЁ, ЧТО УЕЗЖАЕТ НА ПРОВОД. Повторное нажатие с тем же намерением
      // отдаёт тот же `client_request_id`, и сервер возвращает УЖЕ СОЗДАННЫЙ прогон вместо второй
      // платной работы; изменённое число раппорта — новое намерение, новый ключ.
      const fingerprint = JSON.stringify([
        input.sourceMediaId,
        normaliseRepeat(input.repeatMm),
        input.ask ?? '',
      ]);
      if (ledger.current?.fingerprint !== fingerprint) {
        ledger.current = { fingerprint, id: newClientRequestId() };
      }
      mutation.mutate({ ...input, clientRequestId: ledger.current.id });
    },
    [techCardId, mutation],
  );

  const dismissRefusal = useCallback(() => setRefusal(null), []);

  return { start, isPending: mutation.isPending, refusal, dismissRefusal };
}
