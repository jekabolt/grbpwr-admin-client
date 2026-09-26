import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { DraftDesignIdeaResponse } from 'api/proto-http/admin';

import { designKeys } from '../use-design-band';

/**
 * `DraftDesignIdea` — ЕДИНСТВЕННЫЙ ТЕКСТОВЫЙ ПРОГОН ПОЛОСЫ, и он идёт через ту же денежную и
 * идемпотентную машину, что и картиночные: платный вызов без строки в реестре — это дыра в
 * бухгалтерии. Ответ уже готов (`run.status = done`, `run.output_text` заполнен): прогон
 * исполняется ИНЛАЙНОМ, поэтому его нечего опрашивать и незачем заводить ему тайл в истории.
 *
 * ЭТОТ ХУК ОБЯЗАН ПЕРЕЕХАТЬ В `../use-design-band`. Тот файл — шов данных полосы, и он говорит про
 * себя прямо: «ни один орган не зовёт `adminService` напрямую», потому что второй адрес одной и той
 * же записи — это место, где два автора расходятся в том, что инвалидировать после неё. Хук лежит
 * здесь ровно по одной причине: этот заход не имеет права править чужие файлы. Складывать его надо
 * НЕ копией, а переносом — иначе появится ровно тот второй адрес.
 *
 * `client_request_id` МИНТИТСЯ НА НАМЕРЕНИЕ, А НЕ НА ПОПЫТКУ. Он и есть ключ идемпотентности:
 * повтор с тем же значением возвращает ТУ ЖЕ строку вместо второй оплаты. Сгенерированный внутри
 * `mutationFn`, он бы обнулял весь механизм — ретрай нёс бы свежий id, и сервер честно списал бы
 * деньги второй раз. Поэтому id приходит СНАРУЖИ, от того, кто владеет намерением.
 *
 * ═══ ЭТА ДВЕРЬ ПРОСИТ СТРУКТУРУ. ВТОРАЯ — ПРОЗУ. И ОБЕ ГОВОРЯТ ЭТО ВСЛУХ ══════════════════════
 *
 * ⚠ `construction: true` — НЕ НАСТРОЙКА, А ВЫБОР ФОРМЫ ОТВЕТА, И У НЕГО ЕСТЬ ЧИТАТЕЛЬ. Ответ этой
 * двери разбирает `construction-draft-model.ts` — по СВОЕЙ zod-схеме, из `res.construction`.
 * Вторая дверь (`generation/use-generation.ts`) шлёт `construction: false` и обязана продолжать:
 * её читатель режет `output_text` по трём заголовкам (`DESCRIPTION` / `DESIGN ASPECTS` /
 * `MISSING CALLOUTS`) и, получив JSON, нашёл бы ноль заголовков и НАРИСОВАЛ БЫ ПУСТОЙ ЧЕРНОВИК
 * без единой ошибки — прогон оплачен, экран пуст, причины на экране нет. Флаг здесь назван явно
 * именно поэтому: следующему автору должно быть видно, что у формы ответа есть чтец, а не что
 * «здесь просто включили новое поле».
 *
 * ЧТО ВОЗВРАЩАЕТСЯ. Ответ целиком, потому что у него ДВА разных читателя и разные судьбы:
 * `res.construction` — предложение (единственное, что попадает в форму, и только по клику), а
 * `res.run` — строка реестра, из которой берётся ЦЕНА этого нажатия. Смешивать их нельзя: цена
 * есть и у прогона, который ничего не предложил.
 */
export function useDraftDesignIdea(techCardId?: number) {
  const qc = useQueryClient();
  return useMutation<DraftDesignIdeaResponse, Error, { clientRequestId: string }>({
    mutationFn: (input) =>
      adminService.DraftDesignIdea({
        techCardId: techCardId ?? 0,
        clientRequestId: input.clientRequestId,
        construction: true,
      }),
    // Прогон встал в реестр — полоса обязана перечитаться, иначе его строка и её ЦЕНА появятся
    // только со следующим опросом, а платный вызов уже случился. (Дневной суммы на экране нет и
    // не будет: потолок снят, показывается цена прогона.)
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: designKeys.band(techCardId ?? 0) });
    },
  });
}

/**
 * Машинная причина отказа: `google.rpc.Status.details` → `ErrorInfo.reason`.
 *
 * КАНАЛ НЕ ВЫДУМАН ПОД ЭТОТ СЛУЧАЙ. Шлюз проносит `details` в тело JSON, `api.ts` кладёт массив на
 * саму ошибку, а `utils/field-errors.ts` уже читает оттуда нарушения полей — разбор тот же, тип
 * детали другой (та же форма стоит в `files/api/notesService.ts`). Прозу сервера здесь не
 * спрашивают ВООБЩЕ: фраза принадлежит серверу и будет переписана в тот день, когда её решат
 * улучшить, а `reason` — это контракт.
 *
 * ⚠ ДОМЕН НЕ СВЕРЯЕТСЯ, И ЭТО НЕ НЕБРЕЖНОСТЬ. У этой двери их два — `design.grbpwr.com` и
 * `ai.grbpwr.com`, — но словари их причин не пересекаются даже регистром (ai пишет
 * `AI_NOT_CONFIGURED`). Второе условие ничего бы не различило, зато протухло бы молча.
 *
 * ПЕРЕЕХАЛА СЮДА ИЗ `construction-draft.tsx` (фиксап раунда 2, MIN-1) — ПЕРЕНОСОМ, а не копией:
 * у отказа два читателя (`draftIdeaRefusal` ниже и ключ идемпотентности черновика, `runIsClosed`),
 * и два разбора одной ошибки однажды разошлись бы в том, что она значит.
 */
export function refusalReason(error: unknown): string {
  const details = (error as { details?: unknown } | null)?.details;
  if (!Array.isArray(details)) return '';
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    const type = (d as { '@type'?: unknown })['@type'];
    // Сверка по СУФФИКСУ типа, как в `field-errors.ts`; голый объект с `reason` тоже принимается.
    if (typeof type === 'string' && !type.endsWith('ErrorInfo')) continue;
    const reason = (d as { reason?: unknown }).reason;
    if (typeof reason === 'string' && reason) return reason;
  }
  return '';
}

/**
 * Отказ, сказанный словами технолога. Сервер называет предпосылку токеном (`no_moodboard`), и это
 * не поломка, а состояние карточки: показывать это как «что-то сломалось» нельзя, потому что
 * чинить нечего — надо доложить картинок или написать описание.
 *
 * ФРАЗА `no_moodboard` — ФРАЗА ГЕЙТА МИНИМУМА (фиксап N1). Своей формулировки здесь больше нет:
 * вызывающий передаёт фразу своей двери, собранную `moodGateSentence` (`core/mood-gate.ts`) из тех
 * же частей, что запирают FLAT на рельсе, — картинка на доске, 40 символов описания, категория.
 *
 * ⚠ СЕГОДНЯШНИЙ СЕРВЕР ТОКЕНА НЕ ШЛЁТ (фиксап раунда 2, MIN-1). `DraftDesignIdea` отказывает
 * голым FailedPrecondition «there is nothing to read: put a picture on the moodboard or write the
 * description» — без `no_moodboard` и без ErrorInfo (`design_run.go`, designDraftIdea). Поэтому
 * узнаётся и эта фраза, по её началу. Токен остаётся для сервера, который начнёт его называть, —
 * в прозе и в ErrorInfo (`refusalReason`, машинная причина — контракт, проза — нет).
 *
 * ВТОРЫМ ЗДЕСЬ СТОЯЛ `budget_exceeded` («today’s generation budget is spent»). Такого отказа
 * больше НЕ СУЩЕСТВУЕТ: сервер снёс дневной потолок целиком — колонку, обе проверки и сам повод, —
 * по слову владельца «убери потолок». Ветка на несуществующий токен не защищает, а обещает
 * состояние, в которое продукт не умеет попасть.
 *
 * ⚠ ТРИ НОВЫХ ИСХОДА ФИЧИ 9 (`invalid_output`, обрезанный ответ, истраченный бюджет ответа) СЮДА
 * НЕ ДОБАВЛЕНЫ НАРОЧНО. Сервер отвечает на них ГОТОВОЙ АНГЛИЙСКОЙ ПРОЗОЙ, и она различает то, что
 * машинный код различить не даёт: «ответ был не той формы — жми ещё раз» лечится повтором, а
 * «ответ обрезан» — доской поменьше. Наш пересказ по токену `invalid_output` схлопнул бы обе в
 * одну фразу и отправил человека жать ту же кнопку до тех пор, пока он не бросит. Последняя
 * строка печатает сообщение сервера ДОСЛОВНО — это и есть правило волны.
 */
export function draftIdeaRefusal(error: unknown, moodSentence: string): string {
  const message = (error as Error | null)?.message ?? '';
  if (
    refusalReason(error) === 'no_moodboard' ||
    message.includes('no_moodboard') ||
    /there is nothing to read/i.test(message)
  ) {
    return moodSentence;
  }
  return message || 'the draft did not come back';
}
