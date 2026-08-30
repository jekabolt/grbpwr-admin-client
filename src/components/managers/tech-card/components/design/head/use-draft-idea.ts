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
 */
export function useDraftDesignIdea(techCardId?: number) {
  const qc = useQueryClient();
  return useMutation<DraftDesignIdeaResponse, Error, { clientRequestId: string }>({
    mutationFn: (input) =>
      adminService.DraftDesignIdea({
        techCardId: techCardId ?? 0,
        clientRequestId: input.clientRequestId,
      }),
    // Прогон встал в реестр и подвинул дневной бюджет — полоса обязана перечитаться, иначе
    // счётчик денег на соседних органах отстаёт ровно на один платный вызов.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: designKeys.band(techCardId ?? 0) });
    },
  });
}

/**
 * Отказ, сказанный словами технолога. Сервер называет две предпосылки токенами
 * (`no_moodboard`, `budget_exceeded`), и обе — не поломка, а состояние карточки: их нельзя
 * показывать как «что-то сломалось», потому что чинить нечего, надо доложить картинок или
 * дождаться завтра.
 */
export function draftIdeaRefusal(error: unknown): string {
  const message = (error as Error | null)?.message ?? '';
  if (message.includes('no_moodboard')) {
    return 'there is nothing to read: put at least one picture on the moodboard first';
  }
  if (message.includes('budget_exceeded')) {
    return 'today’s generation budget is spent — the draft is a paid call like any other';
  }
  return message || 'the draft did not come back';
}
