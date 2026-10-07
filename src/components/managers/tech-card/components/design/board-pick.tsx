import type { common_DesignReference } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import type { TechCardFormData } from '../schema';
import { takeProposals, type BoardMenuPick } from './board-labels';
import { isBoardRow } from './core/mood-gate';
import { DetailNamingModal } from './detail-naming-modal';
import {
  holdFlatInput,
  readFlatInput,
  rowsBusySay,
  rowsWritable,
  useFlatInput,
} from './flat-input';
import { forgetInputRemovalOf } from './removal-undo';
import { useDesignWrites } from './use-design-band';
import { DETAIL_VIEW } from './views';

/**
 * ═══ ОДНА ЛОГИКА ПИКА ДЛЯ ДОСКИ И ДЛЯ ВХОДА ФЛЭТА (M15, 109 §2.2, §5) ═══════════════════════════
 *
 * «Сервер предполагает, человек решает» живёт в двух местах экрана — на плитке доски и на плитке
 * входа FLAT — и обязан быть ОДНОЙ функцией: назначение пишется в форму (автосейв), вид и деталь —
 * ярлыком человека (`SetDesignReferenceRole`, модель его больше не трогает), `new detail…` заводит
 * слот флэтового верстака первым и привязывает к нему фото. Здесь же — применение предложения
 * модели на ПУСТОЕ назначение (`takeProposals`): доска на шаге FLAT не смонтирована, и без второго
 * монтирования картинка, брошенная во вход, повисла бы без назначения.
 */

type BoardItemLike = { mediaId: number; role?: string | null; kind?: string | null };

const boardRows = (all: unknown): BoardItemLike[] =>
  ((all ?? []) as BoardItemLike[]).filter((i) => isBoardRow(i));

/** Пишет назначение в строку ДОСКИ этого медиа (строку входа с тем же id не трогает). */
function withPurpose(live: BoardItemLike[], mediaId: number, role: string): BoardItemLike[] {
  return live.map((i) => (isBoardRow(i) && i.mediaId === mediaId ? { ...i, role } : i));
}

export function useBoardPick(techCardId: number, readOnly: boolean) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const { setReferenceRole, setBenchSlot } = useDesignWrites(techCardId);
  const flatInput = useFlatInput(techCardId);
  const [namingFor, setNamingFor] = useState<number | null>(null);

  const ordinalOf = useCallback(
    (mediaId: number) =>
      Math.max(
        1,
        boardRows(getValues('moodboardMedia')).findIndex((i) => i.mediaId === mediaId) + 1,
      ),
    [getValues],
  );

  const busy = useCallback(
    (what: string) => {
      if (!flatInput.run && rowsWritable(readFlatInput(techCardId))) return false;
      showMessage(rowsBusySay(readFlatInput(techCardId), what), 'error');
      return true;
    },
    [flatInput.run, techCardId, showMessage],
  );

  const setPurpose = useCallback(
    (mediaId: number, role: string) => {
      if (busy('change the board')) return;
      const live = (getValues('moodboardMedia') ?? []) as BoardItemLike[];
      setValue(
        'moodboardMedia',
        withPurpose(live, mediaId, role) as TechCardFormData['moodboardMedia'],
        { shouldDirty: true },
      );
    },
    [busy, getValues, setValue],
  );

  /* ЯРЛЫК — ЧАСТЬ ВХОДА ФЛЭТА: посреди GENERATE не пишется, пока пишется — GENERATE ждёт
     (`holdFlatInput`). Отказ сказан швом записи; плитка остаётся с прежним словом. */
  const writeLabel = useCallback(
    async (mediaId: number, role: string, detailSlotId = 0): Promise<boolean> => {
      const card = techCardId;
      if (busy('set the label')) return false;
      const release = holdFlatInput(card);
      try {
        await setReferenceRole.mutateAsync({
          mediaId,
          role,
          ordinal: ordinalOf(mediaId),
          detailSlotId,
        });
        return true;
      } catch {
        return false;
      } finally {
        release();
      }
    },
    [techCardId, busy, setReferenceRole, ordinalOf],
  );

  const onPick = useCallback(
    (mediaId: number, pick: BoardMenuPick) => {
      if (readOnly) return;
      if (pick.kind === 'purpose') setPurpose(mediaId, pick.purpose);
      else if (pick.kind === 'view') void writeLabel(mediaId, pick.view);
      else if (pick.kind === 'detail') void writeLabel(mediaId, DETAIL_VIEW, pick.slotId);
      else setNamingFor(mediaId);
    },
    [readOnly, setPurpose, writeLabel],
  );

  /**
   * ПРИНЯТЬ ДОГАДКУ МОДЕЛИ = тот же ярлык, записанный человеком (109 §2.2): плашка чернеет, модель
   * строку больше не перечитывает. Деталь — с её слотом (ноль значил бы «про слот ничего»).
   */
  const accept = useCallback(
    (ref: common_DesignReference | undefined) => {
      const mediaId = ref?.mediaId ?? 0;
      const role = (ref?.role ?? '').trim();
      if (readOnly || mediaId <= 0 || !role) return;
      void writeLabel(mediaId, role, role === DETAIL_VIEW ? ref?.detailSlotId ?? 0 : 0);
    },
    [readOnly, writeLabel],
  );

  /** `new detail…`: слот флэтового верстака заводится ПЕРВЫМ, его id едет с ярлыком (J-9). */
  const addDetail = useCallback(
    async (mediaId: number, name: string) => {
      const card = techCardId;
      if (busy(`add detail “${name}”`)) return;
      const release = holdFlatInput(card);
      try {
        const created = await setBenchSlot.mutateAsync({
          slot: { viewKey: DETAIL_VIEW, kind: 'flat', colorwayId: 0 },
          pictureId: 0,
          expectedSlotRev: 0,
          newDetailName: name,
        });
        const slotId = created?.slot?.id ?? 0;
        if (slotId > 0)
          await setReferenceRole.mutateAsync({
            mediaId,
            role: DETAIL_VIEW,
            ordinal: ordinalOf(mediaId),
            detailSlotId: slotId,
          });
      } catch {
        /* сказано швом записи */
      } finally {
        release();
      }
    },
    [techCardId, busy, setBenchSlot, setReferenceRole, ordinalOf],
  );

  const naming = (
    <DetailNamingModal
      open={namingFor != null}
      onCancel={() => setNamingFor(null)}
      onConfirm={(name) => {
        const mediaId = namingFor;
        setNamingFor(null);
        if (mediaId != null) void addDetail(mediaId, name);
      }}
    />
  );

  return { onPick, accept, setPurpose, writeLabel, naming };
}

/**
 * ПРЕДЛОЖЕНИЕ НАЗНАЧЕНИЯ (101 §2.4): модель прочла картинку без назначения — назначение встаёт в
 * форму, только если оно там ПУСТО, и один раз на картинку; автосейв уносит его на сервер. Не во
 * время GENERATE (прогон взял бы доску наполовину) — после него эффект догонит.
 */
export function useBoardProposals(
  techCardId: number,
  items: readonly BoardItemLike[],
  labels: ReadonlyMap<number, common_DesignReference>,
  readOnly: boolean,
) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const flatInput = useFlatInput(techCardId);
  useEffect(() => {
    if (readOnly || !(techCardId > 0) || !labels.size || flatInput.run) return;
    const live = (getValues('moodboardMedia') ?? []) as BoardItemLike[];
    const take = takeProposals(
      techCardId,
      boardRows(live),
      labels as Map<number, common_DesignReference>,
    );
    if (!take.length) return;
    let next = live;
    for (const t of take) next = withPurpose(next, t.mediaId, t.purpose);
    setValue('moodboardMedia', next as TechCardFormData['moodboardMedia'], { shouldDirty: true });
    // `items` — форма могла дочитаться позже полосы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels, items, readOnly, techCardId, flatInput.run]);
}

/**
 * «SEND AGAIN ›» — a picture taken out of the prompt goes back into it (109 §4.1): the modal's door,
 * the board's corner, a second `+ picture` of the same file. One write (`SetDesignReferenceHeld`
 * held=false) under the input's hold — GENERATE waits for it — and the input's undo memory forgets it.
 */
export function usePutBack(techCardId: number) {
  const { showMessage } = useSnackBarStore();
  const { setReferenceHeld } = useDesignWrites(techCardId);
  return useCallback(
    async (mediaId: number): Promise<boolean> => {
      const card = techCardId;
      if (!rowsWritable(readFlatInput(card))) {
        showMessage(rowsBusySay(readFlatInput(card), 'send it again'), 'error');
        return false;
      }
      const release = holdFlatInput(card);
      try {
        await setReferenceHeld.mutateAsync({ mediaId, held: false, silent: true });
        forgetInputRemovalOf(card, mediaId);
        return true;
      } catch {
        showMessage('could not put it back into the prompt — try again', 'error');
        return false;
      } finally {
        release();
      }
    },
    [techCardId, setReferenceHeld, showMessage],
  );
}
