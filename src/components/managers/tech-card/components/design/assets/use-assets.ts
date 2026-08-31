import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_TechCardAnnotation } from 'api/proto-http/admin';
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

  const deleteAsset = useMutation({
    mutationFn: (assetId: number) => adminService.DeleteDesignAsset({ assetId }),
    onSuccess: invalidate,
    onError,
  });

  /** Метка на флэте: заводится с `placementId = 0`, двигается с его id. */
  const setPlacement = useMutation({
    mutationFn: (input: {
      placementId?: number;
      assetId: number;
      pictureId: number;
      annotation: common_TechCardAnnotation;
      note?: string;
    }) =>
      adminService.SetDesignAssetPlacement({
        techCardId,
        placementId: input.placementId ?? 0,
        assetId: input.assetId,
        pictureId: input.pictureId,
        annotation: input.annotation,
        note: input.note ?? '',
      }),
    onSuccess: invalidate,
    onError,
  });

  const deletePlacement = useMutation({
    mutationFn: (placementId: number) => adminService.DeleteDesignAssetPlacement({ placementId }),
    onSuccess: invalidate,
    onError,
  });

  return useMemo(
    () => ({ upsertAsset, deleteAsset, setPlacement, deletePlacement, invalidate }),
    [upsertAsset, deleteAsset, setPlacement, deletePlacement, invalidate],
  );
}
