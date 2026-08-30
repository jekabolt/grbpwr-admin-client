import { useCallback, useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import type { ShapePoint } from 'ui/components/annotation/geometry';
import type { PenStyle, SurfaceCallout } from 'ui/components/annotation/surface';

import type { AnnotationColor, AnnotationKind, TechCardFormData } from '../schema';
import { newClientRequestId } from './use-design-band';

/**
 * УКАЗАНИЯ МУДБОРДА — ЭТО `callouts` ФОРМЫ, И ВТОРОГО ДОМА У НИХ НЕТ.
 *
 * Мудбордная пометка живёт в том же массиве, что и выноска эскиза, отличаясь ровно одним фактом:
 * её `media_id` принадлежит мудборду. Отдельное поле для них уже стоило одной переделки, и цена
 * второго дома известна заранее — печать, экспорт, дайджест и откат читают ОДИН массив, и всё, что
 * поселилось рядом, из них выпадает молча.
 *
 * ОДИН `useFieldArray` НА `callouts` ВО ВСЁМ ЭТОМ ДЕРЕВЕ, И ОН ЗДЕСЬ.
 *
 * Замерено в react-hook-form 7.62 и записано в двух местах репозитория: `append`/`remove` шлют
 * только в `_subjects.state` и правят СВОЙ `fields` напрямую — второй экземпляр массива о правке
 * не узнаёт вовсе. Поэтому:
 *   1) экземпляр здесь ровно один, и все органы мудборда ходят через него;
 *   2) запись идёт `setValue` ПО КОРНЮ массива, а не мутаторами поля-массива, — корневая запись
 *      событие эмитит, и любой соседний читатель пересинхронизируется.
 * Правило не зависит от того, смотрит ли на массив кто-то ещё: соседа заводят позже и молча.
 *
 * НОМЕРА У МУДБОРДНЫХ УКАЗАНИЙ НЕТ, И ЭТО НЕ УПУЩЕНИЕ. Номер выноски — это АДРЕС: им деталь кроя
 * называет свою выноску, им операция ссылается на мерку, его печатает тех-пак. Мудбордная пометка
 * не адресуется ничем и никем, а взяв номер из той же последовательности, она вырвала бы его у
 * листа. Прототип держит то же самое (`47-annwire.js` — у мудбордной выноски нет поля `n`).
 * Отсюда `number: 0` при рождении и `number: undefined` во вью-модели: `PinMarker` рисует
 * `{number || ''}`, то есть пустой кружок, а `Plate` показывает номер только при `number != null`.
 */

/** Одна строка массива `callouts` как её видит ФОРМА (`z.input`: поля необязательны). */
export type MoodCallout = NonNullable<TechCardFormData['callouts']>[number];

/**
 * Мудбордные выноски шлют client_ref только когда у MintCalloutNumbers появился предикат по
 * медиа (internal/dto/techcard.go). Без него мудбордная заметка съедает номер листа, и это
 * портит данные, а не экран: откат клиента такое не чинит. Поднимать ТОЛЬКО после того, как
 * бэкенд с предикатом выкачен на этот контур.
 *
 * ЗАМЕР, НА КОТОРОМ СТОИТ ФЛАГ (`origin/beta`, `internal/dto/techcard.go:440-442`):
 *
 *     func calloutAwaitsNumber(c entity.TechCardCallout) bool {
 *         return c.Number == 0 && c.ClientRef.Valid && c.ClientRef.String != ""
 *     }
 *
 * Предиката по медиа здесь нет вовсе — значит номер ЛИСТА минтится любой выноске, назвавшей себя
 * `client_ref`, включая мудбордную. Нумерация листа поедет дырами на живых карточках.
 *
 * ФЛАГ СТОИТ ВПЛОТНУЮ К ПРОВЕРКЕ, КОТОРУЮ ОН УПРАВЛЯЕТ, а не в далёком конфиге: список имён в
 * фильтре payload утекает молча при первой же правке соседа, и проза в комментарии этого не ловит.
 * Исполняемая половина — `scripts/moodboard-client-ref-probe.mjs`.
 */
export const MOODBOARD_CALLOUTS_CARRY_CLIENT_REF = false;

/**
 * Payload-фильтр: снимает `client_ref` с МУДБОРДНЫХ выносок, пока флаг опущен. Чистая функция —
 * ни состояния, ни формы, ни React, чтобы проба могла звать её напрямую.
 *
 * КЛЮЧ УДАЛЯЕТСЯ, а не ставится в `undefined`/`null`: удалённый ключ — единственное написание
 * фразы «этот бандл про поле ничего не сказал», и только на него у сервера есть правило «неси
 * хранимое дальше». Ровно тот же довод, что в `./payload-gate`.
 *
 * ВЫНОСКИ ЭСКИЗА НЕ ТРОГАЮТСЯ. Ограничение — про мудбордные, и расширить его на весь массив
 * значило бы запретить минт номера НОВОЙ технической выноске, то есть сломать лист ради мудборда.
 */
export function gateMoodboardClientRefs<T extends { mediaId?: number; clientRef?: string | null }>(
  callouts: readonly T[],
  moodboardMediaIds: ReadonlySet<number>,
): T[] {
  if (MOODBOARD_CALLOUTS_CARRY_CLIENT_REF) return [...callouts];
  return callouts.map((callout) => {
    if (!('clientRef' in callout)) return callout;
    if (!moodboardMediaIds.has(callout.mediaId ?? 0)) return callout;
    const copy = { ...callout };
    delete copy.clientRef;
    return copy;
  });
}

const numOf = (v?: string) => {
  const n = parseFloat(v ?? '');
  return Number.isNaN(n) ? 0 : n;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export type MoodCalloutsHandle = {
  /** Указания, стоящие на одной картинке мудборда, во вью-модели поверхности. */
  calloutsFor: (mediaId: number) => SurfaceCallout[];
  /** Строка по ключу поверхности — редактору нужны и индекс, и значение. */
  at: (key: string) => { index: number; value: MoodCallout } | null;
  add: (mediaId: number, kind: string, points: ShapePoint[], pen: PenStyle) => void;
  editPoints: (key: string, points: ShapePoint[]) => void;
  moveLabel: (key: string, x: number, y: number) => void;
  removeByKey: (key: string) => void;
  setText: (index: number, value: string) => void;
  setColor: (index: number, value: string) => void;
  setDashed: (index: number, value: boolean) => void;
  setFilled: (index: number, value: boolean) => void;
  demote: (index: number) => void;
  /** Сколько указаний стоит на этой картинке — цитата для ✕ плитки. */
  countOn: (mediaId: number) => number;
  /** Указания умирают ВМЕСТЕ с плиткой: жить им больше негде (Г1). */
  removeOn: (mediaId: number) => void;
  /** Тексты всех мудбордных указаний в порядке доски — это и есть то, что читает черновик (Г1). */
  texts: () => string[];
};

/**
 * @param moodMediaIds Картинки, стоящие на доске СЕЙЧАС. Мудбордное указание — это указание,
 * приколотое к одной из них; ничего другого мудборду не принадлежит. Указание с `media_id = 0`
 * («открепившееся») к мудборду НЕ относится: оно осталось от эскиза, и забрать его сюда значило бы
 * увести чужую строку с чужого экрана.
 */
export function useMoodCallouts(moodMediaIds: ReadonlySet<number>): MoodCalloutsHandle {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  // ЕДИНСТВЕННЫЙ экземпляр поля-массива на `callouts` в дереве STUDIO. Нужен ради устойчивых
  // ключей: индекс массива переживает удаление соседа плохо, а на ключе стоит и выбор фигуры, и
  // адресация редактора.
  const fa = useFieldArray({ control, name: 'callouts' });
  const values = (useWatch({ control, name: 'callouts' }) ?? []) as MoodCallout[];

  const writeCallouts = useCallback(
    (next: MoodCallout[]) =>
      setValue('callouts', next as TechCardFormData['callouts'], { shouldDirty: true }),
    [setValue],
  );

  const keyToIndex = useMemo(
    () => new Map(fa.fields.map((f, i) => [f.id, i] as const)),
    [fa.fields],
  );

  const isMine = useCallback(
    (c?: MoodCallout) => !!c && moodMediaIds.has(c.mediaId ?? 0),
    [moodMediaIds],
  );

  const calloutsFor = (mediaId: number): SurfaceCallout[] =>
    fa.fields
      .map((f, index) => ({ f, index, c: values[index] }))
      .filter((x) => (x.c?.mediaId ?? 0) === mediaId && mediaId > 0)
      .map((x) => {
        const px = parseFloat(x.c?.posX ?? '');
        const py = parseFloat(x.c?.posY ?? '');
        return {
          key: x.f.id,
          // НОМЕРА НЕТ — см. шапку файла. `undefined`, а не 0: у плашки это разные вещи.
          number: undefined,
          kind: x.c?.kind ?? 'pin',
          points: (x.c?.points ?? []).map((pt) => ({ x: numOf(pt.x), y: numOf(pt.y) })),
          // Указание, приколотое без координат (старая карточка, откат), падает в центр кадра —
          // иначе оно невидимо и неудаляемо, продолжая сохраняться.
          label: { x: Number.isNaN(px) ? 0.5 : px, y: Number.isNaN(py) ? 0.5 : py },
          text: x.c?.description ?? '',
          hasText: !!x.c?.description?.trim(),
          color: x.c?.color ?? '',
          dashed: !!x.c?.dashed,
          filled: !!x.c?.filled,
        };
      });

  const at = (key: string) => {
    const index = keyToIndex.get(key);
    if (index == null) return null;
    const value = values[index];
    return value ? { index, value } : null;
  };

  const add = (mediaId: number, kind: string, pts: ShapePoint[], pen: PenStyle) => {
    if (!pts.length || !mediaId) return;
    const pin = kind === 'pin';
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    // У пина единственная точка И ЕСТЬ маркер; у фигуры подпись отводится над центром, чтобы не
    // легла на саму линию.
    const marker = pin ? pts[0] : { x: clamp(cx, 0.04, 0.96), y: clamp(cy - 0.08, 0.06, 0.96) };
    writeCallouts([
      ...((getValues('callouts') ?? []) as MoodCallout[]),
      {
        // Ноль — не «легаси-ноль»: пара «ноль + client_ref» это заявка на минт, и она законна.
        // Что именно уедет на провод, решает `gateMoodboardClientRefs` выше.
        number: 0,
        part: '',
        parts: [],
        description: '',
        dimensions: '',
        mediaId,
        posX: marker.x.toFixed(3),
        posY: marker.y.toFixed(3),
        kind: kind as AnnotationKind,
        points: pin ? [] : pts.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
        color: pen.color as AnnotationColor,
        dashed: pen.dashed,
        filled: pen.filled,
        // КЛЮЧ СТРОКИ МИНТИТСЯ ПРИ РОЖДЕНИИ, ВСЕГДА. Он — личность строки: без него после сейва
        // форма не понимает, какой её строке достался какой серверный ответ, и «легаси-ноль»
        // становится неотличим от новорождённой выноски навсегда. Опустить его тут — значит
        // завести новые легаси-нули (`17` П-О).
        clientRef: newClientRequestId(),
      },
    ]);
  };

  const editPoints = (key: string, points: ShapePoint[]) => {
    const i = keyToIndex.get(key);
    if (i == null) return;
    // Вид подписи следует за числом стрелок: панель знает один вид, провод различает одну стрелку
    // (`label`) и несколько (`multi`). Различие — счётчик, и держать его руками значило бы просить
    // человека объявить то, что и так видно.
    const prev = values[i]?.kind;
    if (prev === 'label' || prev === 'multi') {
      setValue(`callouts.${i}.kind`, points.length > 1 ? 'multi' : 'label', { shouldDirty: true });
    }
    setValue(
      `callouts.${i}.points`,
      points.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
      { shouldDirty: true },
    );
  };

  const moveLabel = (key: string, x: number, y: number) => {
    const i = keyToIndex.get(key);
    if (i == null) return;
    setValue(`callouts.${i}.posX`, x.toFixed(3), { shouldDirty: true });
    setValue(`callouts.${i}.posY`, y.toFixed(3), { shouldDirty: true });
  };

  const removeByKey = (key: string) => {
    const i = keyToIndex.get(key);
    if (i == null) return;
    writeCallouts(((getValues('callouts') ?? []) as MoodCallout[]).filter((_, ci) => ci !== i));
  };

  const setText = (i: number, v: string) =>
    setValue(`callouts.${i}.description`, v, { shouldDirty: true });
  const setColor = (i: number, v: string) =>
    setValue(`callouts.${i}.color`, v as AnnotationColor, { shouldDirty: true });
  const setDashed = (i: number, v: boolean) =>
    setValue(`callouts.${i}.dashed`, v, { shouldDirty: true });
  const setFilled = (i: number, v: boolean) =>
    setValue(`callouts.${i}.filled`, v, { shouldDirty: true });

  // Разжаловать фигуру в точку — единственный способ избавиться от неудачной геометрии, СОХРАНИВ
  // текст: ручки ниже минимума точек не опускаются.
  const demote = (i: number) => {
    setValue(`callouts.${i}.kind`, 'pin', { shouldDirty: true });
    setValue(`callouts.${i}.points`, [], { shouldDirty: true });
  };

  const countOn = (mediaId: number) =>
    values.reduce((n, c) => n + ((c?.mediaId ?? 0) === mediaId && mediaId > 0 ? 1 : 0), 0);

  const removeOn = (mediaId: number) =>
    writeCallouts(
      ((getValues('callouts') ?? []) as MoodCallout[]).filter((c) => (c?.mediaId ?? 0) !== mediaId),
    );

  const texts = () =>
    values
      .filter(isMine)
      .map((c) => (c.description ?? '').trim())
      .filter(Boolean);

  return {
    calloutsFor,
    at,
    add,
    editPoints,
    moveLabel,
    removeByKey,
    setText,
    setColor,
    setDashed,
    setFilled,
    demote,
    countOn,
    removeOn,
    texts,
  };
}
