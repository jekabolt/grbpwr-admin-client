import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo } from 'react';

import { designKeys } from '../use-design-band';

/**
 * ЗАПИСИ ПОЛОК АССЕТОВ — ЧЕРЕЗ ОДИН ШОВ, как и всё остальное в полосе.
 *
 * Хук намеренно НЕ живёт в `use-design-band.ts`: тот файл — общий шов полосы, его правят четыре
 * руки в параллель, и добавленный в него глагол это конфликт слияния на ровном месте. Ключ запроса
 * при этом ОБЩИЙ (`designKeys.band`) — полоса читается одним чтением, значит и инвалидация обязана
 * быть одна: своя очередь ключей рассинхронизировала бы полки с верстаком на экране.
 */
export function useAssetWrites(techCardId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = designKeys.band(techCardId);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
  }, [qc, key]);

  const onError = useCallback(
    (error: unknown) => {
      showMessage((error as Error)?.message || 'the change did not go through', 'error');
    },
    [showMessage],
  );

  /**
   * ОДИН ГЛАГОЛ НА ЗАВЕДЕНИЕ И НА ПРАВКУ, потому что жест один: плитку заполняют и сохраняют.
   * `assetId = 0` заводит. Поля шлются ВСЕ — это замена, а не патч: у экрана в руках вся форма
   * целиком, а патч потребовал бы флага присутствия на каждое поле ради вызывающего, которого нет.
   */
  const upsertAsset = useMutation({
    mutationFn: (input: {
      assetId?: number;
      kind: string;
      name: string;
      mediaId?: number;
      colourCode?: string;
      colourHex?: string;
      note?: string;
      derivedFromAssetId?: number;
      repeatMm?: number;
      rotationDeg?: number;
      ordinal?: number;
    }) =>
      adminService.UpsertDesignAsset({
        techCardId,
        assetId: input.assetId ?? 0,
        kind: input.kind,
        name: input.name,
        mediaId: input.mediaId ?? 0,
        colourCode: input.colourCode ?? '',
        colourHex: input.colourHex ?? '',
        note: input.note ?? '',
        derivedFromAssetId: input.derivedFromAssetId ?? 0,
        repeatMm: input.repeatMm ?? 0,
        rotationDeg: input.rotationDeg ?? 0,
        ordinal: input.ordinal ?? 0,
      }),
    onSuccess: invalidate,
    onError,
  });

  /**
   * УДАЛЕНИЕ НАЗЫВАЕТ КАРТОЧКУ, И ЭТО НЕ ЛИШНЕЕ ПОЛЕ.
   *
   * `techCardId` здесь — не копия факта, который и так известен серверу по `assetId`, а НАШЕ
   * УТВЕРЖДЕНИЕ О ТОМ, ЧЬЮ СТЕНУ ПОЛОК МЫ СЕЙЧАС ПОКАЗЫВАЕМ. Сервер сверяет одно с другим и
   * отказывает, когда они расходятся. Расходятся они ровно там, где заметить это нечем: список,
   * отрендеренный до перехода на другую карточку, вторая вкладка, карточка, переключённая под
   * открытой панелью, — раньше такой клик молча сносил чужую строку и КАСКАДОМ все её метки на
   * чужих флэтах, отвечая OK.
   */
  const deleteAsset = useMutation({
    mutationFn: (assetId: number) => adminService.DeleteDesignAsset({ techCardId, assetId }),
    onSuccess: invalidate,
    onError,
  });

  /**
   * ═══ ДВА ГЛАГОЛА МЕТОК СНЕСЕНЫ (J-21) ══════════════════════════════════════════════════════
   *
   * Здесь стояли `setPlacement` и `deletePlacement`. Владелец: «в FABRIC FITTING давай удалим
   * полностью эту функцональность». Их единственным вызывающим был блок примерки
   * (`render/placement/`), снесённый вместе с ними, — то есть это не «мутация без экрана», а
   * половина одного удалённого органа.
   *
   * ⚠ РУЧКИ СЕРВЕРА ЖИВЫ И НЕ ТРОНУТЫ: `SetDesignAssetPlacement` / `DeleteDesignAssetPlacement`
   * по-прежнему отвечают, таблица и её строки на бете стоят. Клиент просто перестал быть их
   * читателем и писателем. Снос ручек и миграция — отдельное решение владельца, не этот круг.
   */

  /**
   * ═══ «ТКАНЬ КОЛОРВЕЯ N — ЭТОТ АССЕТ» — СВОЙ ГЛАГОЛ, А НЕ ПОЛЕ В UPSERT (G-15) ═══════════════
   *
   * Довод контракта, дословно и он же довод этого шва: `UpsertDesignAsset` — ПОЛНАЯ ЗАМЕНА, и
   * proto3-скаляр в нём приезжал бы нулём от любого клиента старше поля И ОТ ЛЮБОГО постороннего
   * сохранения — переименования, правки цвета, «keep as cloth», — молча снимая ткань с колорвея.
   * Этот репозиторий за такую ловушку платил уже дважды (`materialId`, `normMarkerId` в рецепте
   * колорвея). SET-список Upsert'а колонку не называет вовсе, поэтому назначение переживает любую
   * правку ассета — и ровно поэтому мутация здесь ОТДЕЛЬНАЯ, а не поле в `upsertAsset` выше.
   *
   * `colorwayId: 0` — ЭТО СНЯТИЕ, И ЭТО ОТВЕТ, А НЕ ПРОПУСК: «колорвей носит свой собственный
   * цвет». Отрицательное значение сервер отвергает (InvalidArgument), поэтому клиент его не шлёт.
   *
   * SINGLE-SELECT ИСПОЛНЯЕТ СЕРВЕР, В ОДНОЙ ТРАНЗАКЦИИ: назначить X на N значит снять N со всех
   * прочих ассетов карточки. Клиент это НЕ имитирует и не шлёт второго вызова — «сними, потом
   * назначь» дало бы окно, в котором у колорвея нет ткани, и второй вызов мог бы не доехать.
   * Инвалидация та же, что у всех: полка перечитывается вместе с полосой.
   */
  const setAssetColorway = useMutation({
    mutationFn: (input: { assetId: number; colorwayId: number }) =>
      adminService.SetDesignAssetColorway({
        techCardId,
        assetId: input.assetId,
        colorwayId: Math.max(0, Math.trunc(input.colorwayId || 0)),
      }),
    onSuccess: invalidate,
    onError,
  });

  return useMemo(
    () => ({ upsertAsset, deleteAsset, setAssetColorway, invalidate }),
    [upsertAsset, deleteAsset, setAssetColorway, invalidate],
  );
}
