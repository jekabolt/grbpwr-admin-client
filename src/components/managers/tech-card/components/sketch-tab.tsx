import { common_MediaFull, common_TechCard, common_TechCardMediaKind } from 'api/proto-http/admin';
import { techCardMeasurementUnitOptions, techCardMediaKindOptions } from 'constants/filter';
import { useId, useMemo, useState } from 'react';
import { useController, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { AnnotationEditor } from 'ui/components/annotation/editor';
import { type EditHistory } from 'ui/components/annotation/history';
import { rememberPen, type PenStyle, type SurfaceCallout } from 'ui/components/annotation/surface';
import { Button } from 'ui/components/button';
import { moveItem } from 'components/managers/media/components/gallery-order';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { GroupLabel } from 'ui/components/group-label';
import { ViewSwitch } from 'ui/components/view-switch';
import { SectionHeader } from 'ui/components/section-header';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { cn } from 'lib/utility';
import GenericPopover from 'ui/components/popover';
import { Chip, ChipRow } from 'ui/components/chip';
import { PieceAddChip, normalizePieceName, useFormPieces, type PieceRef } from './piece-picker';
import type { FoundPiece } from './nesting/dxf-geometry';
import { pieceRefKey } from './piece-block-refs';
import { usePieceShapes } from './use-piece-shapes';
import {
  type AnnotationColor,
  type AnnotationKind,
  type TechCardFormData,
} from './schema';

const kindLabels: Record<string, string> = Object.fromEntries(
  techCardMediaKindOptions.map((o) => [o.value, o.label]),
);

const TECHNICAL_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_FRONT',
  'TECH_CARD_MEDIA_KIND_BACK',
  'TECH_CARD_MEDIA_KIND_DETAIL',
  'TECH_CARD_MEDIA_KIND_LINING',
  'TECH_CARD_MEDIA_KIND_PREVIEW',
];
const MOODBOARD_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_MOODBOARD',
  'TECH_CARD_MEDIA_KIND_REFERENCE',
  'TECH_CARD_MEDIA_KIND_SWATCH',
];

type MediaListName = 'moodboardMedia' | 'technicalMedia';

// ── КАК Я СМОТРЮ НА ЛИСТ ────────────────────────────────────────────────────────────────────────
//
// Лента или сетка — свойство РУК И ЭКРАНА, а не карточки: у мудборда пятнадцать референсов и грид
// это рабочий режим, у эскиза три вида и лента — ежедневный, и человек с 27" хочет одного, а с 13"
// другого. Поэтому предпочтение, а не поле формы: переключить вид не имеет права сделать карточку
// «изменённой» — иначе beforeunload и заряженный Save появляются от того, что на лист посмотрели
// иначе. Тот же довод, что у `use-panel-prefs.ts`.

type RailMode = 'strip' | 'grid';
type RailPrefs = { sketch?: RailMode; moodboard?: RailMode };

const RAIL_PREF_KEY = 'plm.techcard.gallery.rail';

function readRailPrefs(): RailPrefs {
  try {
    const raw = localStorage.getItem(RAIL_PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<keyof RailPrefs, unknown>>;
    // Хранилище правит кто угодно: чужая вкладка, ручная чистка, версия клиента постарше. Поэтому
    // не «доверять и упасть», а взять только то, что похоже на правду.
    const one = (v: unknown): RailMode | undefined =>
      v === 'strip' || v === 'grid' ? v : undefined;
    return { sketch: one(parsed?.sketch), moodboard: one(parsed?.moodboard) };
  } catch {
    return {};
  }
}

/**
 * Режим показа ленты для ОДНОГО листа. Запись — ПАТЧЕМ поверх свежего чтения: эскиз и мудборд
 * смонтированы одновременно и пишут один ключ, и запись состояния целиком у одного стирала бы то,
 * что после его монтирования записал другой.
 */
function useRailMode(sheet: keyof RailPrefs) {
  const [mode, setMode] = useState<RailMode>(() => readRailPrefs()[sheet] ?? 'strip');
  const set = (next: RailMode) => {
    setMode(next);
    try {
      localStorage.setItem(RAIL_PREF_KEY, JSON.stringify({ ...readRailPrefs(), [sheet]: next }));
    } catch {
      // Квота или запрещённое хранилище: режим не переживёт перезагрузку, работать не мешает.
    }
  };
  return [mode, set] as const;
}

type FormCallout = {
  number?: number;
  part?: string;
  description?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
  // ГЕОМЕТРИЯ УКАЗАНИЯ (0309). `posX/posY` по-прежнему «где стоит нумерованный маркер»; `points`
  // держит якоря фигуры и у пина пуст.
  kind?: AnnotationKind;
  points?: { x: string; y: string }[];
  color?: AnnotationColor;
  dimensions?: string;
  dashed?: boolean;
  filled?: boolean;
  /** Детали указания. `part` — эхо первого элемента: на нём стоит связь «деталь ↔ выноска». */
  parts?: string[];
};

/**
 * Детали указания одним списком. `part` — эхо первого элемента, и оба поля живут рядом: на `part`
 * стоит связь «деталь ↔ выноска», его печатает тех-пак и хранит архив релиза. Правило свода то же,
 * что на сервере: непустой список вытесняет одиночное поле, пустой читается как [part].
 */
function calloutParts(c?: FormCallout | null): string[] {
  const list = (c?.parts ?? []).map((n) => (n ?? '').trim()).filter(Boolean);
  if (list.length) return list;
  const one = (c?.part ?? '').trim();
  return one ? [one] : [];
}

const numOf = (v?: string) => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Media resolves to a URL only a tick after it's picked; an unresolved id is skipped (not rendered
// blank), so this gates which field-array rows become gallery images.

// The tech-card adapter over the shared FocusedAnnotator, driven in GRID layout: every view is on
// screen at once carrying its own pins, so front and back can be read together without clicking
// between them. It owns the tech-card-specific data — the `{ mediaId, kind }` media rows, the
// structured `{ part, description }` callouts, the per-image "kind" select, and "set as
// preview" — and hands the shared component only resolved views + callbacks, so moodboard/sketch
// behave exactly as before while the fitting reuses the same component with its own bindings.
function TechCardGallery({
  listName,
  mediaById,
  onPickedMedia,
  emptyLabel,
  addLabel,
  purpose,
  frozen,
  cardPieces,
  shapeOf,
  history,
}: {
  listName: MediaListName;
  mediaById: Map<number, common_MediaFull>;
  onPickedMedia: (items: common_MediaFull[]) => void;
  emptyLabel: string;
  addLabel: string;
  purpose: string;
  /** Выпущенная карточка: гасит ⌘V, который `<fieldset disabled>` не глушит. */
  frozen: boolean;
  /** Детали кроя карточки — для пикера деталей в редакторе указания. */
  cardPieces: PieceRef[];
  shapeOf: (lineKey: string) => FoundPiece | null;
  /** Общая на форму история отката: массив `callouts` один на оба листа. */
  history: EditHistory<FormCallout>;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const mediaFA = useFieldArray({ control, name: listName });
  const [railMode, setRailMode] = useRailMode(
    listName === 'moodboardMedia' ? 'moodboard' : 'sketch',
  );
  const calloutFA = useFieldArray({ control, name: 'callouts' });
  const calloutValues = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const isMoodboard = listName === 'moodboardMedia';
  const siblingName: MediaListName = isMoodboard ? 'technicalMedia' : 'moodboardMedia';
  const kinds = isMoodboard ? MOODBOARD_KINDS : TECHNICAL_KINDS;
  const kindOptions = techCardMediaKindOptions.filter((o) => kinds.includes(o.value));
  const defaultKind: common_TechCardMediaKind = kinds[0];

  const myMediaIds = useMemo(() => new Set(mediaFA.fields.map((f) => f.mediaId)), [mediaFA.fields]);

  // Which sheet a callout counts against — the same rule the surface filters by, so the two can
  // never disagree about who owns a number. An unpinned callout falls to the technical sheet.
  const isMine = (c: FormCallout) => (c.mediaId ? myMediaIds.has(c.mediaId) : !isMoodboard);

  // The sketch and the moodboard number INDEPENDENTLY: they are two different documents, and a
  // moodboard reference note has no business pushing the next sketch callout to 7. Construction,
  // pieces and issues all point at SKETCH callouts, so that sequence stays dense and predictable
  // instead of being perforated by notes stuck on a swatch photo.
  //
  // max+1, not length+1: after a mid-list delete, length+1 collides with an existing number.
  //
  // The max is taken over the live callouts AND over everything still pointing at a number, because
  // deleting a callout does not clear its referrers. Delete the highest sketch callout and the next
  // one added would take its number back — and the server derives a cut piece's NAME from the
  // callout it is pinned to, by number (calloutSync.apply), so an unrelated new callout silently
  // renamed a piece that still carried the old one. A number that is still referenced is not free.
  //
  // Sketch only: pieces, operations and issues point at SKETCH callouts, and folding their numbers
  // into the moodboard's sequence would push moodboard notes up for no reason — the two documents
  // number independently on purpose.
  const referencedNumbers = () => {
    if (isMoodboard) return [];
    const v = getValues();
    return [
      ...(v.pieces ?? []).map((p) => p.calloutNumber ?? 0),
      ...(v.operations ?? []).map((o) => o.calloutNumber ?? 0),
      ...(v.issues ?? []).map((i) => i.calloutNumber ?? 0),
    ].filter((n) => Number.isFinite(n) && n > 0);
  };
  const nextNumber = () =>
    Math.max(
      0,
      ...calloutValues
        .filter(isMine)
        .map((c) => (Number.isFinite(c.number) ? Number(c.number) : 0)),
      ...referencedNumbers(),
    ) + 1;

  // Commit a media pick: dedupe against BOTH lists (ids are unique across technical ∪ moodboard),
  // resolve the picked full-media, append, and report the fresh ids so the gallery focuses one.
  function handleAddMedia(items: common_MediaFull[]): number[] {
    const selectedIds = mediaFA.fields.map((f) => f.mediaId);
    const siblingIds = (getValues(siblingName) ?? []).map((m) => m.mediaId);
    const fresh = items.filter(
      (it) => it.id != null && !selectedIds.includes(it.id) && !siblingIds.includes(it.id),
    );
    if (!fresh.length) return [];
    onPickedMedia(fresh);
    const ids: number[] = [];
    for (const it of fresh) {
      mediaFA.append({ mediaId: it.id as number, kind: defaultKind });
      ids.push(it.id as number);
    }
    return ids;
  }

  // Removing an image un-pins its callouts (keeps the text, drops the now-dead pin) so the
  // payload never carries a media id that is on neither list.
  function removeMedia(view: FocusedView) {
    const index = mediaFA.fields.findIndex((f) => f.mediaId === view.mediaId);
    if (index < 0) return;
    mediaFA.remove(index);
    const cs = getValues('callouts') ?? [];
    cs.forEach((c, ci) => {
      if (c.mediaId === view.mediaId) {
        setValue(`callouts.${ci}.mediaId`, 0, { shouldDirty: true });
        setValue(`callouts.${ci}.posX`, '', { shouldDirty: true });
        setValue(`callouts.${ci}.posY`, '', { shouldDirty: true });
        // ЯКОРЯ УХОДЯТ ВМЕСТЕ С КАРТИНКОЙ. Доли кадра осмысленны только на СВОЁМ снимке: оставить
        // их значило бы, что открепившаяся мерка, приколотая потом к другому эскизу, ляжет по
        // координатам удалённого — с виду нормальная линия, указывающая не туда. Текст выноски
        // при этом остаётся: его писал человек, и он переживает картинку.
        setValue(`callouts.${ci}.kind`, 'pin', { shouldDirty: true });
        setValue(`callouts.${ci}.points`, [], { shouldDirty: true });
      }
    });
  }

  // Единица привязки размера — та же, что у карточки: технолог не должен гадать, сантиметры это
  // или миллиметры.
  const measurementUnit = (useWatch({ control, name: 'measurementUnit' }) ?? '') as string;
  const unitLabel =
    techCardMeasurementUnitOptions.find((o) => o.value === measurementUnit)?.label ?? '';

  // ВТОРАЯ ПОЛОВИНА СВЯЗИ «ДЕТАЛЬ ↔ ВЫНОСКА». Выноска называет детали, а деталь ссылается на
  // выноску НОМЕРОМ — и рисуют пины, считают «открепление» и печатают тех-пак именно по номеру.
  // Клиент писал только первую половину, и номер не ставился НИГДЕ.
  //
  // ТОЛЬКО ЭСКИЗ. Номера пер-листовые: эскиз и мудборд нумеруются независимо, а `calloutNumber`
  // детали адресует выноску ЭСКИЗА. Сопоставление по одному лишь номеру означало, что выбор детали
  // на выноске мудборда №3 молча снимал деталь с выноски эскиза №3.
  const pinPieceToCallout = (calloutIndex: number, parts: string[]) => {
    if (isMoodboard) return;
    const number = calloutValues[calloutIndex]?.number ?? 0;
    if (!number) return;
    // НА ОДИН НОМЕР ЗАКОННО ССЫЛАЮТСЯ НЕСКОЛЬКО ДЕТАЛЕЙ: узел собирает их вместе. Обратная сторона
    // связи однозначна и была такой всегда — деталь называет ОДИН номер.
    const wanted = new Set(parts.map((n) => normalizePieceName(n)).filter(Boolean));
    const live = (getValues('pieces') ?? []) as Array<{ name?: string; calloutNumber?: number }>;
    live.forEach((pp, pi) => {
      const isTarget = wanted.has(normalizePieceName(pp.name ?? ''));
      const holds = (pp.calloutNumber ?? 0) === number;
      if (isTarget === holds) return;
      setValue(`pieces.${pi}.calloutNumber`, isTarget ? number : 0, { shouldDirty: true });
    });
  };

  // ЗАПИСЬ ИДЁТ В КОРЕНЬ МАССИВА, а не через append/remove этого useFieldArray.
  //
  // На «callouts» висел ВТОРОЙ useFieldArray — у списка выносок под галереей, и оба были
  // смонтированы одновременно, соседями в одной секции. Список снят, но запись остаётся корневой:
  // правило «массив пишется целиком» не должно зависеть от того, смотрит ли на него кто-то ещё. В react-hook-form 7.62 append/remove НЕ эмитят
  // _subjects.array (измерено), поэтому соседний массив о правке не узнаёт: пин на картинке
  // появляется (он читается из useWatch), а строки в структурированном списке нет. Хуже того,
  // remove по устаревшему fields адресует НЕ ТУ выноску. setValue по корню массива событие
  // эмитит, и оба useFieldArray пересинхронизируются — это ровно та же починка, что была нужна
  // деталям кроя.
  const writeCallouts = (next: FormCallout[]) => setValue('callouts', next, { shouldDirty: true });


  // ПОСТАНОВКА — ОДИН ПУТЬ НА ВСЕ ВИДЫ. Их было два (пин отдельно, фигура отдельно), и каждый
  // создавал выноску сам: два списка умолчаний на одну сущность разошлись бы первой же добавленной
  // колонкой. У ПИНА ЯКОРЕЙ НЕТ — его единственная точка и есть нумерованный маркер; у фигуры
  // маркер ставится САМ, над серединой якорей и чуть выше, чтобы номер не сел на саму линию.
  function addCalloutTo(
    mediaId: number,
    kind: string,
    pts: { x: number; y: number }[],
    pen: PenStyle,
  ) {
    if (pts.length === 0) return;
    const pin = kind === 'pin';
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const marker = pin
      ? pts[0]
      : {
          x: Math.min(0.96, Math.max(0.04, cx)),
          y: Math.min(0.96, Math.max(0.06, cy - 0.08)),
        };
    writeCallouts([
      ...((getValues('callouts') ?? []) as FormCallout[]),
      {
        number: nextNumber(),
        part: '',
        parts: [],
        description: '',
        mediaId,
        posX: marker.x.toFixed(3),
        posY: marker.y.toFixed(3),
        kind: kind as AnnotationKind,
        points: pin ? [] : pts.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
        // ОФОРМЛЕНИЕ ИЗ ПАМЯТИ ПЕРА, а не с нуля: у человека одна рука, и выбрав красный пунктир,
        // он рисует им дальше. Иначе серия штрихов маркером на мудборде выходит чернильной, и
        // каждый штрих приходится перекрашивать поштучно.
        color: pen.color as AnnotationColor,
        dashed: pen.dashed,
        filled: pen.filled,
      },
    ]);
  }

  // Map a callout's stable field key back to its global index for RHF field paths.
  const keyToIndex = useMemo(
    () => new Map(calloutFA.fields.map((f, i) => [f.id, i] as const)),
    [calloutFA.fields],
  );

  const calloutsFor = (mediaId: number): SurfaceCallout[] =>
    calloutFA.fields
      .map((f, index) => ({ f, index, c: calloutValues[index] }))
      .filter((x) => x.c?.mediaId === mediaId)
      .map((x) => {
        const px = parseFloat(x.c?.posX ?? '');
        const py = parseFloat(x.c?.posY ?? '');
        return {
          key: x.f.id,
          number: x.c?.number ?? x.index + 1,
          kind: x.c?.kind ?? 'pin',
          points: (x.c?.points ?? []).map((pt) => ({ x: numOf(pt.x), y: numOf(pt.y) })),
          // legacy pinned-but-unplaced callouts fall back to centre so they stay reachable.
          label: { x: Number.isNaN(px) ? 0.5 : px, y: Number.isNaN(py) ? 0.5 : py },
          // ТЕКСТ ЕДЕТ В ВЬЮ-МОДЕЛЬ, а не только в редактор: им подписана плашка фигуры на самом
          // эскизе и им же наполняется легенда под кадром. Без него на листе стояли бы фигуры с
          // прочерком вместо указания, а легенда была бы пуста — при заполненных описаниях.
          text: x.c?.description ?? '',
          hasText: !!x.c?.description?.trim(),
          pieceLineKeys: calloutParts(x.c),
          color: x.c?.color ?? '',
          dashed: !!x.c?.dashed,
          filled: !!x.c?.filled,
        };
      });

  // БЕЗ ФИЛЬТРА ПО АДРЕСУ, и здесь цена молчания выше, чем на примерке. Строка медиа, которую не
  // удалось разрешить, выпадала из ряда — а НА ПОЗИЦИЮ В РЯДУ ссылаются деталь кроя, операция и
  // «pinned to»: выпав, картинка СДВИГАЛА номера всех следующих, и указания начинали называть
  // соседний вид. Плюс её собственные выноски исчезали с экрана, продолжая сохраняться.
  // Неразрешённый кадр остаётся на своём месте и говорит о себе сам (пустой `src` в
  // AnnotationSurface), поэтому нумерация больше не зависит от того, что успело приехать.
  const views: FocusedView[] = mediaFA.fields.map((f) => ({
    key: f.id,
    mediaId: f.mediaId,
    full: mediaById.get(f.mediaId),
  }));

  const mediaLabel = (view: FocusedView): string => {
    const f = mediaFA.fields.find((mf) => mf.mediaId === view.mediaId);
    return kindLabels[f?.kind ?? ''] ?? (isMoodboard ? 'reference' : 'sketch');
  };

  // ОТКРЕПИВШИЕСЯ УКАЗАНИЯ. Список выносок под галереей снят — правка живёт в редакторе под тем
  // кадром, на котором указание стоит. Но выноска с `mediaId = 0` не стоит ни на одном: такие
  // остались от старых карточек и рождаются, когда снимают картинку. Без этого ряда они
  // становились бы НЕВИДИМЫМИ и неудаляемыми — данные, которых нет на экране, но которые уезжают
  // на сервер при каждом сохранении.
  // «БЕЗ КАРТИНКИ» — ЭТО НЕ ТОЛЬКО НОЛЬ. Выноска с ненулевым mediaId, которого нет ни в одном из
  // двух списков, так же невидима: строку медиа сняли, а ссылку не обнулили (или карточка пришла
  // с дрейфом данных). Проверять только ноль значило бы оставить половину случаев за экраном —
  // ровно тех, что рождаются откатом ⌘Z после снятия картинки.
  const liveMediaIds = new Set<number>([
    ...mediaFA.fields.map((f) => f.mediaId),
    ...((getValues(siblingName) ?? []) as Array<{ mediaId?: number }>).map((m) => m.mediaId ?? 0),
  ]);
  const strays = calloutValues
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => isMine(c) && !liveMediaIds.has(c.mediaId ?? 0));

  // ВЫНОСКИ, КОТОРЫЕ НАЗЫВАЮТ СУЩЕСТВУЮЩУЮ ДЕТАЛЬ, НО НЕ СВЯЗАНЫ С НЕЙ.
  //
  // Связь двусторонняя: выноска называет детали, а деталь ссылается на выноску НОМЕРОМ — и пины в
  // «деталях кроя», подсчёт «открепления» и печать тех-пака идут по номеру. Клиент годами писал
  // только первую половину, поэтому ровно в этом состоянии лежит каждая живая карточка.
  //
  // Молча дописать на загрузке нельзя — это правка карточки, которой никто не делал. Поэтому
  // связывание остаётся действием человека, но ОДНИМ нажатием на все сразу: переоткрывать по
  // очереди пятнадцать выносок никто не станет, и карточка так и осталась бы без связей.
  const unlinked = (() => {
    if (isMoodboard) return [];
    const held = new Map<string, number>();
    for (const pc of cardPieces) {
      const key = normalizePieceName(pc.name);
      if (key && !held.has(key)) held.set(key, 0);
    }
    const live = (getValues('pieces') ?? []) as Array<{ name?: string; calloutNumber?: number }>;
    for (const pc of live) {
      const key = normalizePieceName(pc.name ?? '');
      if (key) held.set(key, pc.calloutNumber ?? 0);
    }
    return calloutValues
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => isMine(c) && (c.number ?? 0) > 0)
      .filter(({ c }) =>
        calloutParts(c).some((name) => {
          const n = held.get(normalizePieceName(name));
          return n != null && n !== c.number;
        }),
      );
  })();

  const gallery = (
    <FocusedAnnotator
      layout='grid'
      views={views}
      calloutsFor={calloutsFor}
      onAddCallout={addCalloutTo}
      // Детали указания хранятся ИМЕНАМИ, поэтому «резолвер» здесь — проверка существования:
      // имя, которого среди деталей карточки нет, честно показывается как «деталь удалена», а не
      // исчезает молча вместе со связью.
      pieceLabel={(name) =>
        cardPieces.some((pp) => normalizePieceName(pp.name) === normalizePieceName(name))
          ? name
          : undefined
      }
      onBeforeMutate={frozen ? undefined : history.record}
      onUndo={frozen ? undefined : history.undo}
      canUndo={history.canUndo}
      onEditPoints={(key, points) => {
        const i = keyToIndex.get(key);
        if (i == null) return;
        // ВИД ПОДПИСИ СЛЕДУЕТ ЗА ЧИСЛОМ СТРЕЛОК: панель знает один вид, провод различает одну
        // стрелку (label) и несколько (multi). Различие — счётчик, и держать его руками значило
        // бы просить человека объявить то, что и так видно.
        const prev = calloutValues[i]?.kind;
        if (prev === 'label' || prev === 'multi') {
          setValue(`callouts.${i}.kind`, points.length > 1 ? 'multi' : 'label', {
            shouldDirty: true,
          });
        }
        setValue(
          `callouts.${i}.points`,
          points.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
          { shouldDirty: true },
        );
      }}
      readOnly={frozen}
      onMoveCallout={(key, x, y) => {
        const i = keyToIndex.get(key);
        if (i == null) return;
        setValue(`callouts.${i}.posX`, x.toFixed(3), { shouldDirty: true });
        setValue(`callouts.${i}.posY`, y.toFixed(3), { shouldDirty: true });
      }}
      onRemoveCallout={(key) => {
        const i = keyToIndex.get(key);
        if (i != null)
          writeCallouts(
            ((getValues('callouts') ?? []) as FormCallout[]).filter((_, ci) => ci !== i),
          );
      }}
      // ТОТ ЖЕ РЕДАКТОР, ЧТО У СНИМКА ШАГА СБОРКИ, — не «похожий», а буквально он. Выноска на
      // эскизе и указание на фото узла это одно ремесло, и две формы для него означали две
      // грамматики: где-то деталь чипом, где-то селектом, где-то Enter переносит строку, где-то
      // закрывает. Различие у карточного указания ровно одно — привязка размера, и она приходит
      // сюда слотом, а не второй формой.
      renderEditor={(key, { close, arrows }) => {
        const i = keyToIndex.get(key);
        const c = i != null ? calloutValues[i] : undefined;
        if (i == null || !c) return null;
        // ГДЕ СТОИТ ТО, ЧТО ПРАВИШЬ. Редактор один на лист и живёт над рядом кадров: без этой
        // строки правишь текст, не видя, к какой из пяти картинок он приколот. Номер кадра — тот
        // же, которым его называют деталь, операция и «pinned to».
        const at = mediaFA.fields.findIndex((f) => f.mediaId === c.mediaId);
        return (
          <AnnotationEditor
            kind={c.kind ?? 'pin'}
            number={c.number}
            heading={at >= 0 ? `picture ${at + 1}` : undefined}
            text={c.description ?? ''}
            color={c.color ?? ''}
            dashed={!!c.dashed}
            filled={!!c.filled}
            // ДЕТАЛИ ЗДЕСЬ ИМЕНАМИ, а не ключами: на именах стоит связь «деталь ↔ выноска»
            // (`piece.calloutNumber` сверяется по имени) и ими печатается тех-пак.
            pieceKeys={calloutParts(c)}
            pieceLabel={(name) =>
              cardPieces.some((pp) => normalizePieceName(pp.name) === normalizePieceName(name))
                ? name
                : undefined
            }
            onText={(v) => setValue(`callouts.${i}.description`, v, { shouldDirty: true })}
            onColor={(v) => {
              rememberPen({ color: v });
              setValue(`callouts.${i}.color`, v as AnnotationColor, { shouldDirty: true });
            }}
            onDashed={(v) => {
              rememberPen({ dashed: v });
              setValue(`callouts.${i}.dashed`, v, { shouldDirty: true });
            }}
            onFilled={(v) => {
              rememberPen({ filled: v });
              setValue(`callouts.${i}.filled`, v, { shouldDirty: true });
            }}
            onPieces={(names) => {
              setValue(`callouts.${i}.parts`, names, { shouldDirty: true });
              setValue(`callouts.${i}.part`, names[0] ?? '', { shouldDirty: true });
              pinPieceToCallout(i, names);
            }}
            onRemove={() => {
              // ЧЕРЕЗ ИСТОРИЮ, как и удаление клавишей. Одна и та же операция, сделанная мышью,
              // не имеет права быть безвозвратной там, где сделанная с клавиатуры откатывается.
              history.record();
              writeCallouts(
                ((getValues('callouts') ?? []) as FormCallout[]).filter((_, ci) => ci !== i),
              );
              close();
            }}
            onClose={close}
            // ЛУЧИ ЗАПИСКИ приходят от листа: взвод «жду клик по кадру» принадлежит кадру, а не
            // форме, и держит его `FocusedAnnotator` — редактор стоит НАД рядом снимков.
            // Здесь стояла «make it a point» (разжаловать фигуру в нумерованную точку) — владелец
            // её убрал; вместе с пином из палитры у неё не осталось и смысла.
            arrows={arrows}
            // Имена, а не ключи: сравнение — по правилу карточки, иначе легаси-имя в другом
            // регистре даёт два чипа на одну деталь.
            sameKey={(a, b) => normalizePieceName(a) === normalizePieceName(b)}
            renderPiecePicker={({ selected, onPick }) => (
              <PieceAddChip
                pieces={cardPieces}
                selected={cardPieces
                  .filter((pp) => selected.some((n) => normalizePieceName(n) === normalizePieceName(pp.name)))
                  .map((pp) => pp.lineKey)}
                shapeOf={shapeOf}
                onPick={(lineKey) => {
                  const picked = cardPieces.find((pp) => pp.lineKey === lineKey);
                  if (picked) onPick(picked.name);
                }}
              />
            )}
            extra={
              <div className='flex items-center gap-1.5'>
                <Text size='micro' variant='label' component='span' className='shrink-0 uppercase'>
                  dimensions{unitLabel ? ` (${unitLabel})` : ''}:
                </Text>
                <input
                  value={c.dimensions ?? ''}
                  onChange={(e) =>
                    setValue(`callouts.${i}.dimensions`, e.target.value, { shouldDirty: true })
                  }
                  placeholder='e.g. 14 × 16'
                  maxLength={255}
                  className='min-w-0 flex-1 border border-borderColor bg-bgColor px-1 py-px text-micro focus:border-textColor focus:outline-none'
                />
              </div>
            }
          />
        );
      }}
      onPickMedia={handleAddMedia}
      onRemoveMedia={removeMedia}
      addLabel={addLabel}
      purpose={purpose}
      // Мудборд — фотографии, эскиз — штриховой чертёж: подложка спасает линию на первом и
      // перекрывает чертёж на втором.
      halo={isMoodboard}
      pickerAspectRatio={['Custom']}
      emptyLabel={emptyLabel}
      fallbackAspect='3/4'
      // ЛЕНТА ИЛИ СЕТКА — ПО ПРЕДПОЧТЕНИЮ. Лента: фиксированная высота, натуральная ширина
      // (альбомные шире), прокрутка только вбок; снимки не обрезаются, поэтому пины по-прежнему
      // ложатся 1:1. Сетка: та же лента с переносом строк — «все кадры разом».
      gridRowHeight={railMode === 'strip' ? 480 : undefined}
      railWrap={railMode === 'grid'}
      viewControls={
        <ViewSwitch
          label='gallery layout'
          value={railMode}
          onChange={setRailMode}
          options={[
            { value: 'strip', label: 'strip', hint: 'one row, fixed height, scrolls sideways' },
            { value: 'grid', label: 'grid', hint: 'every view at once, wrapped into rows' },
          ]}
        />
      }
      // ПОРЯДОК КАДРОВ — КОРНЕВОЙ ЗАПИСЬЮ, А НЕ `mediaFA.move`. Тот же класс риска, что уже пойман
      // на `callouts` выше: в react-hook-form 7.62 мутаторы поля-массива не эмитят `_subjects.array`,
      // и соседние читатели пути (здесь — `SelectField name={listName}.${index}.kind` в подвале
      // плитки) о перестановке не узнают, то есть показывают вид ПЕРЕЕХАВШЕГО кадра под чужим.
      onReorderMedia={
        frozen
          ? undefined
          : (from, to) =>
              setValue(listName, moveItem(getValues(listName) ?? [], from, to), {
                shouldDirty: true,
              })
      }
      previewFirst
      mediaLabel={mediaLabel}
      carouselLabel={`${isMoodboard ? 'moodboard' : 'sketch'} images`}
      renderFocusedFooter={(view) => {
        const index = mediaFA.fields.findIndex((f) => f.mediaId === view.mediaId);
        if (index < 0) return null;
        return (
          // wraps rather than squeezing: a 180px tile cannot hold the select and the button side
          // by side, and a crushed select is worse than a second line.
          <div className='flex flex-wrap items-end gap-1.5'>
            <div className='min-w-[92px] flex-1'>
              <SelectField name={`${listName}.${index}.kind`} label='kind' items={kindOptions} />
            </div>
            {/* ПЕРВЫЙ КАДР = ОБЛОЖКА КАРТОЧКИ, и бейдж остаётся: он называет инвариант, который
                иначе живёт только в голове у того, кто складывал лист.
                Кнопки «set as preview» больше нет. Она выражала РОВНО ОДНУ перестановку из всех
                («сделай этот первым») и стояла под каждым кадром; ручка ⠿ и стрелки в подвале
                плитки выражают любую и не занимают места под каждым. */}
            {index === 0 && (
              <div className='shrink-0'>
                <Pill tone='mut'>preview</Pill>
              </div>
            )}
          </div>
        );
      }}
    />
  );

  if (strays.length === 0 && unlinked.length === 0) return gallery;
  return (
    <div className='flex flex-col gap-2'>
      {gallery}
      {unlinked.length > 0 && !frozen && (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            title={`a piece is named but doesn't reference a callout: ${unlinked
              .map(({ c }) => `#${c.number} → ${calloutParts(c).join(', ')}`)
              .join('; ')}`}
            onClick={() => unlinked.forEach(({ c, i }) => pinPieceToCallout(i, calloutParts(c)))}
          >
            link pieces to callouts ({unlinked.length})
          </Button>
          <Text size='nano' variant='label' component='span'>
            without the link a piece doesn't know its callout: the pin isn't drawn on “cut pieces”
            and isn't printed in the tech pack
          </Text>
        </div>
      )}
      {strays.length > 0 && (
      <div className='flex flex-col gap-1 border border-dashed border-borderColor p-2'>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          callouts without an image · {strays.length}
        </Text>
        <Text size='nano' variant='label'>
          they don't stand on any image — the shot was removed, or the callout came from an older
          card. you can put it back on the sheet KEEPING ITS NUMBER: a piece, an operation and a
          defect all reference that number, and “delete it and place it again” would tear those
          references. the marker lands in the middle — drag it from there to where it belongs.
        </Text>
        {strays.map(({ c, i }) => (
          <div key={i} className='flex items-baseline gap-1.5'>
            <Text size='nano' variant='label' component='span' className='shrink-0 tabular-nums'>
              {c.number || i + 1}
            </Text>
            <Text size='nano' component='span' className='min-w-0 flex-1'>
              {(c.description ?? '').trim() || calloutParts(c).join(', ') || '—'}
            </Text>
            {!frozen && (
              <ChipRow>
                {/* ЧИПОМ НА КАЖДУЮ КАРТИНКУ, а не селектом: картинок на листе единицы, и список из
                    двух пунктов, спрятанный за раскрытием, дороже двух чипов рядом. */}
                {mediaFA.fields.map((f, mi) => (
                  <Chip
                    key={f.id}
                    dashed
                    onClick={() => {
                      history.record();
                      setValue(`callouts.${i}.mediaId`, f.mediaId, { shouldDirty: true });
                      setValue(`callouts.${i}.posX`, '0.5', { shouldDirty: true });
                      setValue(`callouts.${i}.posY`, '0.5', { shouldDirty: true });
                      // ЯКОРЯ НЕ ПЕРЕЕЗЖАЮТ: доли кадра осмысленны только на своём снимке, и
                      // фигура легла бы на новую картинку по координатам старой — с виду
                      // нормальная линия, указывающая не туда.
                      setValue(`callouts.${i}.kind`, 'pin', { shouldDirty: true });
                      setValue(`callouts.${i}.points`, [], { shouldDirty: true });
                    }}
                    title={`place it on ${isMoodboard ? 'M' : 'T'}#${mi + 1}, keeping its number`}
                  >
                    onto {isMoodboard ? 'M' : 'T'}#{mi + 1}
                  </Chip>
                ))}
                <Chip
                  dashed
                  onClick={() => {
                    history.record();
                    writeCallouts(
                      ((getValues('callouts') ?? []) as FormCallout[]).filter((_, ci) => ci !== i),
                    );
                  }}
                  title='delete a callout that stands on nothing'
                >
                  delete
                </Chip>
              </ChipRow>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// The single free-form comments field for the moodboard. It writes the card's `notes` (the only
// card-level prose field), so overall direction notes round-trip with the rest of the card; the
// per-image caption sprawl that used to sit under each thumbnail is gone.
function MoodboardComments() {
  const { control } = useFormContext<TechCardFormData>();
  const { field } = useController({ control, name: 'notes' });
  const id = useId();
  return (
    <div>
      <GroupLabel>general comments</GroupLabel>
      <label htmlFor={id} className='sr-only'>
        general comments
      </label>
      <Textarea
        {...field}
        id={id}
        value={field.value ?? ''}
        rows={3}
        maxLength={2000}
        placeholder='overall notes on the moodboard, references, direction…'
        className='resize-none'
      />
      <Text size='micro' variant='label' className='mt-px'>
        shared with the card’s notes field
      </Text>
    </div>
  );
}

// Sketch sheet — owns the resolved-media map shared by both surfaces (moodboard + technical) so a
// freshly-picked image can be annotated without a save/reload. Media ids are unique across the
// two lists, so one shared map serves both. `view` splits the two independent media lists
// (technicalMedia vs moodboardMedia) across two constructor tabs; both render the same grid.
export function SketchTab({
  techCard,
  view = 'sketch',
  active = false,
  frozen = false,
  calloutHistory,
}: {
  techCard?: common_TechCard;
  /**
   * История отката указаний — ОДНА НА ФОРМУ, приходит сверху.
   *
   * Эскиз и мудборд смонтированы одновременно и пишут ОДИН массив `callouts`. Своя история у
   * каждого означала бы, что откат на одном листе возвращает снимок, снятый до правок другого, и
   * они исчезают молча — на скрытой вкладке этого не видно.
   */
  calloutHistory: EditHistory<FormCallout>;
  view?: 'sketch' | 'moodboard';
  /** Карточка выпущена и заморожена. Нужен ЯВНО: `<fieldset disabled>` не глушит ⌘V. */
  frozen?: boolean;
  /** Вкладка на экране. Только она заказывает разбор чертежей — вкладки смонтированы все сразу,
   *  и качать мегабайты за того, кто сюда не заходил, незачем (тот же довод, что в CONSTRUCTION). */
  active?: boolean;
}) {
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  // Силуэты деталей для пикера «деталь этой выноски»: та же пачка и тот же индекс, которыми
  // рисует плитки вкладка деталей кроя. Своя эвристика разошлась бы с ней молча.
  const pieces = useFormPieces();
  const { shapeByKey } = usePieceShapes(active);
  const shapeOf = (lineKey: string) => shapeByKey?.get(pieceRefKey(lineKey)) ?? null;

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of [
      ...(techCard?.resolvedTechnicalMedia ?? []),
      ...(techCard?.resolvedMoodboardMedia ?? []),
    ]) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [techCard?.resolvedTechnicalMedia, techCard?.resolvedMoodboardMedia, picked]);

  const onPicked = (items: common_MediaFull[]) => setPicked((prev) => [...prev, ...items]);

  if (view === 'moodboard') {
    return (
      <section className='flex flex-col gap-2.5 border border-borderColor bg-bgColor p-4'>
        <SectionHeader
          title='moodboard'
          question='— mood, reference and swatch images; pin a note on any of them'
        />
        <TechCardGallery
          listName='moodboardMedia'
          mediaById={mediaById}
          onPickedMedia={onPicked}
          frozen={frozen}
          emptyLabel='no moodboard images yet. add references to pin notes on them'
          addLabel='add moodboard image'
          purpose='moodboard reference'
          cardPieces={pieces}
          shapeOf={shapeOf}
          history={calloutHistory}
        />
        <MoodboardComments />
      </section>
    );
  }

  return (
    <section className='flex flex-col gap-2.5 border border-borderColor bg-bgColor p-4'>
      <SectionHeader
        title='technical sketch'
        question='— front / back / detail views, each carrying the numbered callouts the construction tab points at'
      />
      <TechCardGallery
        listName='technicalMedia'
        mediaById={mediaById}
        onPickedMedia={onPicked}
        frozen={frozen}
        emptyLabel='no sketches yet. add a technical drawing to place callouts on it'
        addLabel='add sketch'
        purpose='tech sketch'
        cardPieces={pieces}
        shapeOf={shapeOf}
        history={calloutHistory}
      />
    </section>
  );
}
