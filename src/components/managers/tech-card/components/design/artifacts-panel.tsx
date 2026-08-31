import type {
  GetDesignBandResponse,
  common_MediaFull,
  common_TechCard,
  common_TechCardMediaKind,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { EditHistory } from 'ui/components/annotation/history';
// ПЛИТА АРТЕФАКТА — ТА ЖЕ ПОВЕРХНОСТЬ, ЧТО ЛИСТ ЭСКИЗА И СНИМОК ШАГА СБОРКИ, а не третья
// отрисовка «для превью». Прежняя своя рисовалка на плитке была третьим словарём видов: дуга или
// мерка ставились в редакторе и молча пропадали на плитке, а человек читал это как «выноска не
// сохранилась». Тот же компонент указание и СТАВИТ — ровно поэтому модалка рисования этому экрану
// больше не нужна (см. довод у `ArtifactsPanel`).
import {
  AnnotationSurface,
  rememberPen,
  type AnnotationSurfaceProps,
  type PenStyle,
  type ShapePoint,
  type SurfaceCallout,
} from 'ui/components/annotation/surface';
import { AnnotationStyleRow } from 'ui/components/annotation/style-row';
import { AnnotationToolbar, placingHint } from 'ui/components/annotation/toolbar';
import { AnnotationZoomDialog } from 'ui/components/annotation/zoom-dialog';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { ViewSwitch } from 'ui/components/view-switch';

import type { AnnotationColor, AnnotationKind, TechCardFormData } from '../schema';
import { InertDoor } from './bench-slot';
import { clockStamp } from './handles';
import {
  DiffRows,
  MintDialog,
  SHEET_MINIMUM,
  SILHOUETTE_VIEWS,
  VIEW_LABELS,
  analyseMint,
  benchDiverged,
  benchDoor,
  benchMinimumMet,
  openDoor,
  readBench,
  sheetMinimumMissing,
  slotIsFilled,
  useDesignSaveHost,
  type BenchSlots,
  type MintOrigin,
} from './mint-dialog';
import { provenanceLabel, readProvenance } from './provenance';
import {
  SELECT_MARK_NOT_STATED,
  outputsOfKind,
  pictureIsSelected,
  serverStatesSelected,
} from './render';
import { buildSheetSvg, downloadSvg, type SheetSvgPlate } from './sheet-svg';
import { PrintSheetButton, SheetJournal, versionShortHash } from './sheet-journal';
import { useDesignSheetVersion, useDesignWrites } from './use-design-band';

/**
 * ARTIFACTS — where the drawing is a document, and the document becomes paper.
 *
 * ═══ THE TWO STOREYS, AND WHY THEY ARE IN THIS ORDER ═══════════════════════════════════════════
 *
 * (a) THE DOCUMENT. The plates the card holds and the callouts drawn on them, editable, on every
 *     card that exists. It needs no new RPC and no bench: it reads `technicalMedia` and `callouts`
 *     off the form, exactly as they are saved by the ordinary Save. This is the storey that makes
 *     the tab useful to the whole of production on the day it ships (`17` П-Ж): every live card
 *     enters this band with its technical media full, its callouts drawn and a bench nobody has
 *     ever touched, and a screen that led with the bench would tell all of them «no plates» and ask
 *     for a re-upload of files the card already holds.
 *
 * (b) THE VERSIONS. The strip, the journal, the divergence plate, the mint. This storey is ABSENT
 *     — not empty, absent — until a version exists. There is no `SHEET v0`: a version is a frozen
 *     composition somebody minted, so a zeroth one is a sentence about nothing. What stands in its
 *     place is one plate saying versions arrive with the mint, and the act that would mint one.
 *
 * ═══ WHAT A VERSION FREEZES ════════════════════════════════════════════════════════════════════
 *
 * THE COMPOSITION OF PLATES, AND ONLY THAT. Which pictures were on the sheet, with the hash of the
 * bytes each one pinned. THE CALLOUTS ARE NOT FROZEN: paper prints the callouts the card holds at
 * the moment it is printed. That is the prototype's own division — it snapshots the plates
 * (`70-actions.js:216-222`) and draws the shapes from live state at export (`:276`) — and it is the
 * division this build follows, against the plan's extra tier of frozen callouts (`design_sheet_
 * version_callout`, migration 0342). That tier is left INERT on purpose: nothing here writes it and
 * nothing here reads it. A second, frozen copy of a callout is precisely how one signature comes to
 * cover two different factory truths — the floor reading v3's frozen note while the card's own
 * callout says something else, and neither piece of paper admitting the other exists.
 *
 * The consequence, stated so nobody re-derives it wrongly: EDITING A CALLOUT AFTER v1 DOES NOT NEED
 * v2. A version is born of an ACT — a print, a release — never of a file changing under it.
 */

/** One plate of the document: a picture with a name, wherever it came from. */
export type DocumentPlate = {
  key: string;
  name: string;
  mediaId: number;
  media?: common_MediaFull;
  /**
   * Where this plate is listed.
   *   `card`  — the card's own technical media. This is the DOCUMENT: what a callout's `media_id`
   *             points at, what prints, and what the mint freezes.
   *   `bench` — a design bench slot. The mint carries it into the card's media; until then it is
   *             visible here and cannot be drawn on.
   *   `run`   — an output of a generation run that nobody has taken onto the card yet. It exists in
   *             the band and nowhere else, which is why it gets a verb of its own.
   */
  origin: 'card' | 'bench' | 'run';
  /** The server states this picture is the one the studio settled on — `DesignPicture.selected`. */
  chosen?: boolean;
  /**
   * The `DesignPicture` behind this plate, WHEN THE LOADED PAGE STATES ONE. The mark «chosen» is a
   * fact about the picture, not the media, so the verb that writes it (`SetDesignPictureSelected`)
   * needs this id — a plate whose run is off the loaded page honestly has none, and its select
   * door is drawn inert with that reason rather than guessing.
   */
  pictureId?: number;
  /** Only for a bench plate: the address of its slot, for the door. */
  door?: string;
  /**
   * Only for a bench plate: the slot's view key (`front` / `back` / `side_l` / `side_r`, anything
   * else is a detail). It is what `takeIntoCard` derives the media KIND from — the same derivation
   * the server's mint performs (`entity.DesignPlateMediaKind`), so a plate taken in by hand and a
   * plate injected by the mint are filed under the same name.
   */
  viewKey?: string;
  note?: string;
};

/**
 * ═══ WHICH REPRESENTATION A PICTURE IS — the axis ARTIFACTS switches along (W-14) ══════════════
 *
 * READ OFF THE RUN THE PICTURE CAME OUT OF, and only then off the card's own `kind`. `DesignRun.
 * kind` is spelled out in the contract and frozen at launch; `TechCardMediaKind` has one member for
 * an accepted render and NONE for a turntable frame, so a card-side reading alone would file every
 * 3D frame under «flat» and the switcher would have an empty segment that is not honestly empty.
 *
 * The fallback is still needed and is still right: a render accepted onto the card months ago, on a
 * page of the feed the band no longer ships, is not in `band.runs` at all — and `kind=RENDER` on
 * the card media is exactly the statement «this is a render and it is official».
 */
export type ArtifactKind = 'flat' | 'render' | 'threed';

export const ARTIFACT_KINDS: { value: ArtifactKind; label: string; hint: string }[] = [
  { value: 'flat', label: 'flats', hint: 'the drawings — and the only thing the sheet is made of' },
  { value: 'render', label: 'renders', hint: 'coloured over the flats; not part of the sheet' },
  { value: 'threed', label: '3D', hint: 'turntable frames; not part of the sheet' },
];

export function artifactKindOf(
  mediaId: number,
  runKindByMedia: Map<number, string>,
  cardKind?: string,
): ArtifactKind {
  const fromRun = runKindByMedia.get(mediaId);
  if (fromRun === 'render') return 'render';
  if (fromRun === 'threed') return 'threed';
  if (cardKind === 'TECH_CARD_MEDIA_KIND_RENDER') return 'render';
  return 'flat';
}

/** media id → the kind of the run that produced it, for every picture on the loaded page. */
export function runKindByMediaId(band: GetDesignBandResponse): Map<number, string> {
  const map = new Map<number, string>();
  for (const run of band.runs ?? []) {
    const kind = (run.kind ?? '').trim().toLowerCase();
    if (kind !== 'render' && kind !== 'threed' && kind !== 'flat') continue;
    for (const picture of run.pictures ?? []) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0) map.set(mediaId, kind);
    }
  }
  return map;
}

/**
 * ═══ THE PICTURES ARTIFACTS OFFERS TO MARK UP, BEYOND THE DOCUMENT ITSELF ═════════════════════
 *
 * The owner's sentence is «we can put callouts on the CHOSEN generated / annotated media (or ones
 * uploaded by hand), and switch between flats, renders and 3D». So the carrier of the switch is the
 * chosen pictures — not only the plates that reached the technical sheet — and «chosen» is the very
 * mark W-12 asks for on a turntable. One notion, two requirements; a second one would drift.
 *
 * THE LIST NARROWS TO THE CHOSEN ONES ONLY WHEN A CHOICE HAS BEEN MADE, and that condition is the
 * whole of the honesty here — PER KIND: a mark on a turntable narrows the 3D segment and leaves
 * the renders segment whole, because «which turntable» and «which render» are separate verdicts.
 * The mark is written by `SetDesignPictureSelected`, through the band's one write seam
 * (`useDesignWrites().setPictureSelected`) — on the studio's outputs strips and on the plates of
 * this very panel — so on most cards nothing is marked yet, and filtering unconditionally would
 * leave both segments permanently and inexplicably empty on a card full of renders. So: if
 * anything of this kind is marked, the segment IS the marked ones; if nothing is, it lists every
 * unhidden picture of that kind on the loaded page — and the panel says WHICH of the two lists is
 * on screen, rather than letting «renders · 3» read as «three chosen renders» when nothing has
 * been chosen at all.
 */
export function bandPlates(
  band: GetDesignBandResponse,
  kind: 'render' | 'threed',
  already: Set<number>,
): { plates: DocumentPlate[]; filteredToSelected: boolean; serverStates: boolean } {
  const outputs = outputsOfKind(band, kind);
  const serverStates = outputs.some((o) => serverStatesSelected(o.picture));
  const filteredToSelected = outputs.some((o) => pictureIsSelected(o.picture));
  const plates: DocumentPlate[] = [];
  for (const { picture, run } of outputs) {
    if (filteredToSelected && !pictureIsSelected(picture)) continue;
    const mediaId = picture.media?.id ?? 0;
    if (mediaId <= 0 || already.has(mediaId)) continue;
    already.add(mediaId);
    const view = (picture.ghostView ?? '').trim();
    plates.push({
      key: `run-${picture.id}`,
      name:
        (VIEW_LABELS[view] || view.toUpperCase() || '') ||
        `frame ${picture.ordinal ?? plates.length + 1}`,
      mediaId,
      media: picture.media,
      origin: 'run',
      chosen: pictureIsSelected(picture),
      pictureId: picture.id ?? 0,
      note: `run ${run.id ?? '—'}${run.rrev ? ` · r${run.rrev}` : ''}`,
    });
  }
  return { plates, filteredToSelected, serverStates };
}

/**
 * One row of the form's `callouts` array as the FORM holds it (`z.input` — every field optional).
 *
 * Declared here and exported because two doors upstream have to name it: `ArtifactsTab` passes the
 * page's undo history down, and the history's element type is what says WHAT is being undone.
 */
export type SheetCallout = NonNullable<TechCardFormData['callouts']>[number];

/**
 * ═══ ДОЛЯ КАДРА ИЗ СТРОКИ ФОРМЫ — ИЛИ ЦЕНТР, ЕСЛИ ДОЛИ НЕТ ВОВСЕ ══════════════════════════════
 *
 * `Number('')` РАВЕН НУЛЮ, И НОЛЬ — ЗАКОННАЯ КООРДИНАТА. Здесь стояло `Number.isFinite(Number(c.
 * posX ?? ''))`, и оно принимало пустоту за настоящий левый край: строка без координат (старая
 * выноска, у которой `pos_x` в базе NULL — с провода при `EmitUnpopulated` он приезжает ЯВНЫМ
 * null, а форма держит его пустой строкой) ставила маркер в ЛЕВЫЙ ВЕРХНИЙ УГОЛ кадра, ровно там,
 * где соседний комментарий обещал центр. Экспорт повторял ту же ошибку своей копией той же
 * строки, поэтому и на бумаге номер садился в угол.
 *
 * Значит отличать «координаты нет» от «координата равна нулю» надо ДО преобразования, по самому
 * значению, а не по числу, в которое оно превратилось. После преобразования эти два случая уже
 * неразличимы — в этом весь дефект.
 *
 * ДИАПАЗОН СТОРОЖИТСЯ ТЕМ ЖЕ ПРОХОДОМ. Доля — это часть СВОЕГО кадра, и `1.4` или `-3` адресуют
 * место за картинкой: такой маркер не виден вообще, то есть выноска пропадает молча, а её текст и
 * номер продолжают числиться на плите. Центр хотя бы достижим и правится перетаскиванием. Живая
 * запись сюда не попадает: поверхность пишет `pos_x/pos_y` только через `clamp01`, так что всё,
 * что ставили руками, лежит в [0, 1] по построению.
 */
export function frameFraction(value: string | number | null | undefined, fallback = 0.5): number {
  if (value == null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/**
 * WHY A BENCH OR RUN PLATE CANNOT BE DRAWN ON *AS IT STANDS* — and what the door does about it.
 *
 * A callout addresses `technicalMedia` — the card's OWN media list. A bench slot and a run's output
 * are not in that list, so a plate of theirs cannot carry a callout as it stands, and its plate says
 * so on the face of its door («take in to draw on it ▸»). R-13 is the reason the door exists at all
 * — «к любому артефакту можно делать все виды колаутов» — and naming the price on the button rather
 * than hiding it in a side effect is what keeps it honest: taking a picture in IS an edit of the card.
 *
 * ОДНОТАКТНАЯ, А НЕ СОСТАВНАЯ, С ТЕХ ПОР КАК ПЛИТА РИСУЕТ САМА. Дверь была парой «взять + открыть
 * редактор», и вторая половина была дефектом T-20: редактор разрешал свежий media_id через
 * СОХРАНЁННУЮ карточку, которая о нём ещё не знала. Открывать теперь нечего — взятая плита
 * становится рабочей на месте.
 *
 * FOR A BENCH PLATE THIS IS SANCTIONED BY THE SERVER, NOT GUESSED AT. The mint's
 * `injectBenchPlatesAsTechnicalMedia` (design_sheet_mint.go) skips media the document already
 * lists — «УЖЕ ПЕРЕЧИСЛЕННОЕ НЕ ТРОГАЕТСЯ. Клиент вправе прислать плиту сам (и со временем
 * будет)» — so a plate taken in here is NOT doubled by the next mint. Detaching it here is still
 * refused: the slot keeps holding the picture and the next mint would bring it straight back —
 * the way OFF the bench is clearing the slot in STUDIO.
 */
const BENCH_PLATE_DETACH =
  'a bench plate is taken off by clearing its slot in STUDIO — dropped here it would come back with the next mint';

/**
 * The view key of a bench slot → the card's media kind. THE SAME DERIVATION THE MINT PERFORMS
 * (`entity.DesignPlateMediaKind`, backend): front/back/sides by name, everything else a detail.
 * A second, different mapping here would mean a plate taken in by hand and the same plate injected
 * by the mint disagree about what view they are — visibly, in the plate's own caption.
 */
const BENCH_VIEW_MEDIA_KIND: Record<string, common_TechCardMediaKind> = {
  front: 'TECH_CARD_MEDIA_KIND_FRONT',
  back: 'TECH_CARD_MEDIA_KIND_BACK',
  side_l: 'TECH_CARD_MEDIA_KIND_SIDE_L',
  side_r: 'TECH_CARD_MEDIA_KIND_SIDE_R',
};

const CARD_PLATE_KINDS: Partial<Record<common_TechCardMediaKind, string>> = {
  TECH_CARD_MEDIA_KIND_FRONT: 'FRONT',
  TECH_CARD_MEDIA_KIND_BACK: 'BACK',
  TECH_CARD_MEDIA_KIND_SIDE_L: 'SIDE L',
  TECH_CARD_MEDIA_KIND_SIDE_R: 'SIDE R',
  TECH_CARD_MEDIA_KIND_DETAIL: 'detail',
  TECH_CARD_MEDIA_KIND_LINING: 'lining',
  TECH_CARD_MEDIA_KIND_PREVIEW: 'preview',
  TECH_CARD_MEDIA_KIND_RENDER: 'render',
};

/**
 * The document's plates, in one list keyed by MEDIA ID.
 *
 * The card's own technical media come first — they are the document, they are what a callout's
 * `media_id` points at, and they are what every existing card has. A bench slot is appended only
 * when it holds a picture the card does not already list, so the same image can never appear twice
 * under two names.
 *
 * Pure, and exported, because the precedence between the two sources is the part of this tab most
 * likely to be «simplified» later by somebody who has not opened a production card.
 */
export function documentPlates(
  formMedia: { mediaId?: number; kind?: string }[],
  resolved: Map<number, common_MediaFull>,
  bench: BenchSlots,
): DocumentPlate[] {
  const plates: DocumentPlate[] = [];
  const seen = new Set<number>();

  formMedia.forEach((item, i) => {
    const mediaId = item.mediaId ?? 0;
    if (mediaId <= 0 || seen.has(mediaId)) return;
    seen.add(mediaId);
    plates.push({
      key: `card-${mediaId}`,
      name: CARD_PLATE_KINDS[(item.kind ?? '') as common_TechCardMediaKind] ?? `image ${i + 1}`,
      mediaId,
      media: resolved.get(mediaId),
      origin: 'card',
    });
  });

  const benchSlots = [
    ...SILHOUETTE_VIEWS.map((v) => bench.byView.get(v)).filter(Boolean),
    ...bench.details,
  ];
  for (const slot of benchSlots) {
    if (!slotIsFilled(slot)) continue;
    const media = slot!.picture?.media;
    const mediaId = media?.id ?? 0;
    if (mediaId <= 0 || seen.has(mediaId)) continue;
    seen.add(mediaId);
    const view = (slot!.viewKey ?? '').trim();
    plates.push({
      key: `bench-${slot!.id}`,
      name: (slot!.detailName ?? '').trim() || VIEW_LABELS[view] || view.toUpperCase() || 'detail',
      mediaId,
      media,
      origin: 'bench',
      door: benchDoor({ viewKey: slot!.viewKey, id: slot!.id }),
      viewKey: view,
      note: provenanceLabel(readProvenance(slot!.picture ?? {})),
    });
  }

  return plates;
}

export function ArtifactsPanel({
  techCardId,
  band,
  disabled,
  techCard,
  calloutHistory,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
  /**
   * The loaded card, as the page holds it: one of the two sources a plate's picture is resolved
   * from (see `resolved`). Optional because a harness may mount this panel with a form and no card
   * — and then a plate says «image address not resolved» on its own face rather than vanishing.
   */
  techCard?: common_TechCard;
  /**
   * The form's ONE undo history over `callouts`, handed down from the page.
   *
   * NOT made here. The page resets it whenever the form is re-seeded from the server
   * (`calloutHistory.reset()` after a save), and a history minted inside this panel would survive
   * that reset — ⌘Z would then restore callouts the card no longer holds, silently.
   */
  calloutHistory?: EditHistory<SheetCallout>;
}): JSX.Element {
  const form = useFormContext<TechCardFormData>();
  const host = useDesignSaveHost();
  const { showMessage } = useSnackBarStore();
  // The SAME cache entry the page reads and re-primes after every save. Not a second fetch.
  const { data: card } = useTechCard(techCardId);
  // The band's ONE write seam — the same `setPictureSelected` the studio's outputs strips call.
  // A second way to write the mark is exactly what must not exist; a second DOOR to the one way is
  // what W-14 asks for: the choice is consumed here, so it can be amended here.
  const { setPictureSelected } = useDesignWrites(techCardId);

  // `SheetCallout` (z.input строки формы), а НЕ узкий CalloutLike: плиты теперь РИСУЮТ фигуру
  // выноски (kind/points/dashed/filled/color), и тип обязан нести её, иначе каст компилируется, а
  // превью молча теряет дуги и мерки — ровно та ловушка, о которой предупреждает downloadSheet.
  const callouts = (useWatch({ control: form.control, name: 'callouts' }) ?? []) as SheetCallout[];
  const technicalMedia = (useWatch({ control: form.control, name: 'technicalMedia' }) ?? []) as {
    mediaId?: number;
    kind?: string;
  }[];

  /**
   * ═══ media id → КАРТИНКА. ДВА ИСТОЧНИКА, И ВТОРОЙ — ЭТО ПОЧИНКА T-20 ════════════════════════
   *
   * Жалоба владельца дословно: «когда делаю TAKE IN + DRAW ▸ в артефактах оно теряет картинку и
   * пишет image address not resolved». Причина здесь, в одной строке разрешения адреса.
   *
   * `resolvedTechnicalMedia` — это СЕРВЕРНЫЙ разбор СОХРАНЁННОЙ карточки. «Взять к себе»
   * (`takeIntoCard`) дописывает media_id в ФОРМУ и ничего не сохраняет: до ближайшего Save
   * сохранённая карточка об этом id не знает. С этого мгновения плита переставала быть выходом
   * прогона (её id уже в `technicalMedia`) и становилась плитой карточки — то есть уходила
   * разрешаться через карту, которой её нет. Картинка исчезала на самой плите, а редактор,
   * разрешавший id тем же способом, писал «image address not resolved». Данные при этом были
   * целы; не хватало ровно того, что уже лежало в полосе.
   *
   * ПОЛОСА И ЕСТЬ ВТОРОЙ ИСТОЧНИК. Медиа приезжает объектом внутри `DesignPicture`, поэтому взятая
   * картинка разрешается СРАЗУ и тем же самым байтом, что показывался секунду назад. Карточка
   * стоит первой: её разбор — официальное слово документа о своих плитах, полоса лишь закрывает
   * промежуток между «взял» и «сохранил».
   */
  const bench = useMemo(() => readBench(band), [band]);
  /**
   * Картинки, выбранные в библиотеке ПРЯМО СЕЙЧАС. Живут здесь, а не в форме: форма несёт только
   * `media_id`, а адрес до ближайшего Save знает лишь тот, кто картинку выбрал.
   */
  const [picked, setPicked] = useState<common_MediaFull[]>([]);

  const resolved = useMemo(() => {
    const map = new Map<number, common_MediaFull>();
    for (const run of band.runs ?? []) {
      for (const picture of run.pictures ?? []) {
        if (picture.media?.id != null) map.set(picture.media.id, picture.media);
      }
    }
    // Верстачная плита берётся в карточку тем же нажатием, и её картинка так же обязана пережить
    // переезд. Слот может держать снимок прогона, которого на загруженной странице полосы уже нет.
    for (const slot of [...bench.byView.values(), ...bench.details]) {
      const media = slot?.picture?.media;
      if (media?.id != null) map.set(media.id, media);
    }
    for (const item of [
      ...(techCard?.resolvedTechnicalMedia ?? []),
      ...(card?.resolvedTechnicalMedia ?? []),
    ]) {
      if (item.media?.id != null) map.set(item.media.id, item.media);
    }
    // Только что выбранная в библиотеке картинка — тот же промежуток «уже в форме, ещё не
    // сохранено», и без неё новая плита рождалась бы пустой, как рождалась взятая.
    for (const item of picked) if (item.id != null) map.set(item.id, item);
    return map;
  }, [card?.resolvedTechnicalMedia, techCard?.resolvedTechnicalMedia, band.runs, bench, picked]);

  const plates = useMemo(
    () => documentPlates(technicalMedia, resolved, bench),
    [technicalMedia, resolved, bench],
  );
  const diverged = useMemo(() => benchDiverged(band.latestVersion, bench), [band, bench]);

  /**
   * ═══ THE THREE REPRESENTATIONS OF THIS CARD, AS ONE LIST PER SEGMENT (W-14) ═════════════════
   *
   * Each segment is the DOCUMENT's plates of that kind FIRST — those are the ones a callout can be
   * drawn on today — and then the chosen pictures of that kind that nobody has taken onto the card
   * yet. The order is the argument: what is already part of the card outranks what is offered to
   * become part of it, and the door between the two states is one button on the offered plate.
   */
  const runKinds = useMemo(() => runKindByMediaId(band), [band]);
  const cardKindOf = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of technicalMedia) {
      if ((item.mediaId ?? 0) > 0) map.set(item.mediaId as number, item.kind ?? '');
    }
    return map;
  }, [technicalMedia]);

  /**
   * The media ids the server states are CHOSEN — read once, applied to every plate whatever list it
   * came from. Without this the mark would vanish at the exact moment it starts to matter: taking a
   * chosen turntable onto the card turns it into a `card` plate, built by `documentPlates`, which
   * knows nothing about runs — and the badge would silently disappear as a REWARD for accepting it.
   *
   * `idByMedia` rides along for the same reason in the other direction: the verb that WRITES the
   * mark addresses the picture, not the media, so a card plate needs its picture looked back up
   * before its select door can act. A media the loaded page states no picture for stays out of the
   * map, and its door is drawn inert with that reason.
   */
  const chosenMedia = useMemo(() => {
    const ids = new Set<number>();
    const idByMedia = new Map<number, number>();
    for (const run of band.runs ?? []) {
      for (const picture of run.pictures ?? []) {
        const mediaId = picture.media?.id ?? 0;
        if (mediaId <= 0) continue;
        if ((picture.id ?? 0) > 0 && !idByMedia.has(mediaId)) idByMedia.set(mediaId, picture.id!);
        if (pictureIsSelected(picture)) ids.add(mediaId);
      }
    }
    return { ids, idByMedia };
  }, [band.runs]);

  const segments = useMemo(() => {
    const of = (p: DocumentPlate) => artifactKindOf(p.mediaId, runKinds, cardKindOf.get(p.mediaId));
    const mark = (list: DocumentPlate[]) =>
      list.map((p) => {
        const chosen = p.chosen || chosenMedia.ids.has(p.mediaId);
        const pictureId = p.pictureId ?? chosenMedia.idByMedia.get(p.mediaId);
        if (chosen === !!p.chosen && pictureId === p.pictureId) return p;
        return { ...p, chosen, pictureId };
      });
    const flat = plates.filter((p) => of(p) === 'flat');
    const onCard = new Set(plates.map((p) => p.mediaId));
    const renderBand = bandPlates(band, 'render', new Set(onCard));
    const threedBand = bandPlates(band, 'threed', new Set(onCard));
    return {
      flat: { plates: mark(flat), filteredToSelected: false, serverStates: true },
      render: {
        plates: mark([...plates.filter((p) => of(p) === 'render'), ...renderBand.plates]),
        filteredToSelected: renderBand.filteredToSelected,
        serverStates: renderBand.serverStates,
      },
      threed: {
        plates: mark([...plates.filter((p) => of(p) === 'threed'), ...threedBand.plates]),
        filteredToSelected: threedBand.filteredToSelected,
        serverStates: threedBand.serverStates,
      },
    };
  }, [plates, band, runKinds, cardKindOf, chosenMedia]);

  const [selected, setSelected] = useState<number | null>(null);
  const [mintOrigin, setMintOrigin] = useState<MintOrigin | null>(null);
  /** Which representation is on screen. `flat` is the default because the SHEET is made of flats. */
  const [kind, setKind] = useState<ArtifactKind>('flat');
  /** The «replace the sheet with a file» explanation — a procedure, not a button. */
  const [replacing, setReplacing] = useState(false);
  /** Which frozen composition is on screen. 0 = the document, which is the default and the point. */
  const [inspecting, setInspecting] = useState(0);
  /**
   * Взведённый вид указания — ОДИН НА ВЕСЬ ЛИСТ, а не на плиту. Панель видов стоит над рядом
   * (семь чипов под каждой из десяти плит съели бы экран), но ТОЧКИ КОПЯТСЯ НА СВОЁМ КАДРЕ,
   * внутри поверхности: мерка, начатая на переде и достроенная на спинке, — не мерка.
   */
  const [tool, setTool] = useState<string | null>(null);
  /** Сколько якорей набрано в незавершённом жесте — подсказку рисует панель, а она снаружи. */
  const [placed, setPlaced] = useState(0);
  /** Плита, открытая во весь экран. Индекс в ряду на экране, чтобы листалось по всему ряду. */
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  /** Счётчик просьб «поставь курсор в правку выбранной выноски». Растёт только по ЖЕСТУ выбора. */
  const [focusEditor, setFocusEditor] = useState(0);
  /** The plate whose detach is waiting on a human, because callouts stand on it. */
  const [detaching, setDetaching] = useState<DocumentPlate | null>(null);

  const versionNumbers = useMemo(
    () => [...(band.versionNumbers ?? [])].sort((a, b) => b - a),
    [band.versionNumbers],
  );
  const latest = band.latestVersion?.versionNumber ?? 0;
  const hasVersions = versionNumbers.length > 0 || latest > 0;

  const frozen = useDesignSheetVersion(
    techCardId,
    inspecting > 0 && inspecting !== latest ? inspecting : undefined,
  );
  const shownVersion =
    inspecting === 0
      ? undefined
      : inspecting === latest
        ? band.latestVersion
        : frozen.data?.version;

  const frozenPlates: DocumentPlate[] = useMemo(() => {
    const source = shownVersion?.plates ?? [];
    return source.map((plate, i) => ({
      key: `frozen-${i}`,
      name:
        (plate.detailName ?? '').trim() ||
        VIEW_LABELS[plate.viewKey ?? ''] ||
        (plate.viewKey ?? 'plate'),
      mediaId: plate.media?.id ?? 0,
      media: plate.media,
      origin: 'card' as const,
      note: (plate.contentHash ?? '').trim()
        ? `froze ${(plate.contentHash ?? '').slice(0, 8)}`
        : 'no hash — predates 0336',
    }));
  }, [shownVersion]);

  /**
   * A FROZEN VERSION HAS NO REPRESENTATIONS TO SWITCH BETWEEN. It froze a composition of flats and
   * that is all it is; offering «renders» over it would draw a segment that could only ever be
   * empty and would read as a defect. So inspecting a version drops back to the frozen list whole.
   */
  const segment = segments[kind];
  const onScreen = inspecting === 0 ? segment.plates : frozenPlates;

  /**
   * ═══ РИСОВАНИЕ ЖИВЁТ НА САМИХ ПЛИТАХ, И МОДАЛКИ БОЛЬШЕ НЕТ (T-21) ═══════════════════════════
   *
   * Слова владельца: «для выставления колаутов не нужна модалка оно должно быть инлайн». Раньше
   * `draw ▸` открывала над этой вкладкой `SketchTab` — второй экран с ТЕМИ ЖЕ картинками. Теперь
   * плита сама и есть поверхность постановки: панель видов над рядом, указание ставится кликом по
   * плите, правится в блоке CALLOUTS справа, читается в легенде под кадром.
   *
   * ЭТИМ ЖЕ СНЯТ ДЕФЕКТ T-20 («take in + draw ▸ теряет картинку, пишет image address not
   * resolved»), и снят он ПРИЧИНОЙ, а не текстом. `SketchTab` разрешал `media_id` в картинку
   * ЧЕРЕЗ СОХРАНЁННУЮ КАРТОЧКУ (`resolvedTechnicalMedia`), а «взять к себе» дописывает id в ФОРМУ
   * — id, о котором сохранённая карточка ещё не знает и узнает только после Save. Редактор честно
   * говорил, что адреса не знает, и картинка пропадала. Плита же держит СВОЁ медиа объектом
   * (`plate.media`, приехало с полосой), поэтому разрешать по id больше нечего и негде.
   *
   * ВТОРОГО useFieldArray НАД `callouts` ЗДЕСЬ ПО-ПРЕЖНЕМУ НЕТ. В react-hook-form 7.62 мутаторы
   * поля-массива не эмитят `_subjects.array`, и два экземпляра над одним именем расходятся молча.
   * Панель пишет корнем (`setValue('callouts', next)`) и листьями по индексу — как писала.
   */
  const canDraw = !!calloutHistory;
  /**
   * ТРИ ПРИЧИНЫ, А НЕ ДВЕ, и третья — та, что случается чаще всех. Мёртвая дверь обязана называть
   * СВОЮ причину: «карточка выпущена» читалось как «экран собран без редактора», то есть как
   * поломка сборки вместо состояния карточки.
   */
  const drawInert =
    inspecting > 0
      ? `v${inspecting} is a record of what was minted — switch to “the document” to draw on it`
      : disabled
        ? 'the card is released: its sheet is frozen, and a callout is an edit of it'
        : 'the form’s undo history was not handed to this screen, and a gesture without an undo is not one to offer';

  /**
   * Ставить указание можно ТОЛЬКО на плиту, которая уже числится в медиа карточки: `media_id`
   * выноски адресует именно этот список. Верстачная плита и выход прогона сперва берутся в
   * карточку — одним нажатием на своей плите, — и с этого мгновения рисуются здесь же.
   */
  const canPlaceOn = (plate: DocumentPlate) =>
    inspecting === 0 && !disabled && canDraw && plate.origin === 'card';
  /** Панель видов имеет смысл, только если на экране есть хоть одна такая плита. */
  const drawableHere = inspecting === 0 && !disabled && canDraw && onScreen.some(canPlaceOn);

  /**
   * ═══ ЗАПИСЬ УКАЗАНИЙ: КОРНЕМ И ПО ИНДЕКСУ ═══════════════════════════════════════════════════
   *
   * ИДЕНТИЧНОСТЬ ВЫНОСКИ ДЛЯ ПОВЕРХНОСТИ — ЕЁ ИНДЕКС В МАССИВЕ ФОРМЫ, строкой. Не «упрощение
   * вместо ключей RHF»: индексом эта панель адресует выноску ВЕЗДЕ — `selected`, leaf-запись
   * `callouts.N.description`, якорь `data-field` для серверного отказа. Второй способ назвать
   * строку означал бы две таблицы соответствия, которые разъезжаются на первом же удалении.
   * Цена индекса — сдвиг после удаления соседа; она оплачена тем, что удаление и откат снимают
   * выбор явно (ниже), а не оставляют его висеть на съехавшей строке.
   */
  const calloutsOfPlate = (mediaId: number): SurfaceCallout[] =>
    callouts
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => (c.mediaId ?? 0) === mediaId)
      .map(({ c, index }) => {
        return {
          key: String(index),
          number: c.number || index + 1,
          kind: c.kind ?? 'pin',
          points: (c.points ?? []).map((p) => ({
            x: Number(p.x ?? '') || 0,
            y: Number(p.y ?? '') || 0,
          })),
          // Легаси-строка без координат остаётся достижимой в ЦЕНТРЕ кадра, а не садится в угол:
          // разбор пустоты и выхода за диапазон живёт в `frameFraction`, там же и довод.
          label: { x: frameFraction(c.posX), y: frameFraction(c.posY) },
          text: c.description ?? '',
          hasText: !!(c.description ?? '').trim(),
          color: c.color ?? '',
          dashed: !!c.dashed,
          filled: !!c.filled,
        };
      });

  /**
   * СЛЕДУЮЩИЙ НОМЕР — ТОТ ЖЕ СЧЁТ, ЧТО НА ЛИСТЕ ЭСКИЗА (`sketch-tab.tsx`), и это обязательство,
   * а не совпадение: массив `callouts` и список `technicalMedia` у них ОДНИ, и второй счёт выдал
   * бы два указания под одним номером на одной карточке.
   *
   * max+1, а не length+1: после удаления из середины length+1 сталкивается с живым номером. Максимум
   * берётся и по номерам, на которые ещё ССЫЛАЮТСЯ, — сервер выводит имя выкроенной детали из
   * выноски ПО НОМЕРУ, и переиспользованный номер молча переименовал бы чужую деталь.
   */
  function nextCalloutNumber(): number {
    const values = form.getValues();
    const onCard = new Set(
      ((values.technicalMedia ?? []) as { mediaId?: number }[]).map((m) => m.mediaId ?? 0),
    );
    const mine = ((values.callouts ?? []) as SheetCallout[])
      .filter((c) => (c.mediaId ? onCard.has(c.mediaId) : true))
      .map((c) => (Number.isFinite(c.number) ? Number(c.number) : 0));
    const referenced = [
      ...(values.pieces ?? []).map((p) => p.calloutNumber ?? 0),
      ...(values.operations ?? []).map((o) => o.calloutNumber ?? 0),
      ...(values.issues ?? []).map((i) => i.calloutNumber ?? 0),
    ].filter((n) => Number.isFinite(n) && n > 0);
    return Math.max(0, ...mine, ...referenced) + 1;
  }

  /**
   * Указание поставлено. ОДИН путь на все виды: у пина якорей нет — его единственная точка И ЕСТЬ
   * нумерованный маркер; у фигуры маркер садится сам, над серединой якорей и чуть выше, чтобы
   * номер не сел на саму линию. Стиль наследуется от ПАМЯТИ ПЕРА: у человека одна рука, и выбрав
   * красный пунктир, он рисует им дальше.
   */
  function addCalloutOn(mediaId: number, shape: string, pts: ShapePoint[], pen: PenStyle) {
    if (pts.length === 0) return;
    const pin = shape === 'pin';
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const marker = pin
      ? pts[0]
      : { x: Math.min(0.96, Math.max(0.04, cx)), y: Math.min(0.96, Math.max(0.06, cy - 0.08)) };
    const rows = (form.getValues('callouts') ?? []) as SheetCallout[];
    form.setValue(
      'callouts',
      [
        ...rows,
        {
          number: nextCalloutNumber(),
          part: '',
          parts: [],
          description: '',
          dimensions: '',
          mediaId,
          posX: marker.x.toFixed(3),
          posY: marker.y.toFixed(3),
          kind: shape as AnnotationKind,
          points: pin ? [] : pts.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
          color: pen.color as AnnotationColor,
          dashed: pen.dashed,
          filled: pen.filled,
        },
      ],
      { shouldDirty: true },
    );
    // ВЫБОР ПОСТАВЛЕННОЙ ВЫНОСКИ ЗДЕСЬ НЕ ДЕЛАЕТСЯ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Третий такт жеста
    // «клик — клик — напиши, что это» исполняет сама поверхность: она выбирает выноску, только что
    // выросшую в ЕЁ списке, и просит поставить в правку курсор. Написанный ещё и здесь, он открывал
    // бы правку и после ЛИПКОГО инструмента (маркер), где штрихуют сериями, — а там открытый
    // редактор после каждого штриха превращает набросок в процедуру.
  }

  /** Leaf-запись по индексу: строку никто не добавляет и не переставляет, идентичность цела. */
  const writeCallout = (index: number, patch: Partial<SheetCallout>) => {
    for (const [field, value] of Object.entries(patch)) {
      form.setValue(`callouts.${index}.${field}` as never, value as never, { shouldDirty: true });
    }
  };

  function removeCalloutAt(index: number) {
    calloutHistory?.record();
    const rows = (form.getValues('callouts') ?? []) as SheetCallout[];
    form.setValue(
      'callouts',
      rows.filter((_, i) => i !== index),
      { shouldDirty: true },
    );
    // ВЫБОР СНИМАЕТСЯ ВСЕГДА. Он адресует строку индексом, а после удаления по этому индексу
    // стоит СОСЕДНЯЯ выноска: оставленный выбор открыл бы чужую правку, ничего об этом не сказав.
    setSelected(null);
  }

  /** Фигура становится нумерованной точкой, номер остаётся. Откатывается ⌘Z, как и жест. */
  function demoteCalloutAt(index: number) {
    calloutHistory?.record();
    writeCallout(index, {
      kind: 'pin',
      points: [],
      // Пунктир и штриховка у точки не значат ничего: сервер обнулил бы их сам, а расхождение
      // формы с хранимым делает карточку «изменённой» сразу после сохранения.
      dashed: false,
      filled: false,
    });
  }

  /**
   * ОБВЯЗКА ПОВЕРХНОСТИ — ОДНА НА ОБА ЕЁ ВОПЛОЩЕНИЯ: плита в ряду и она же во весь экран. Второй
   * набор колбэков означал бы, что перетаскивание маркера в увеличенном виде и на плитке пишут
   * разными путями, и разойтись им негде, кроме как молча.
   */
  const surfaceBindings = {
    onMoveLabel: (key: string, at: ShapePoint) =>
      writeCallout(Number(key), { posX: at.x.toFixed(3), posY: at.y.toFixed(3) }),
    onEditPoints: (key: string, points: ShapePoint[]) => {
      const index = Number(key);
      // ВИД ПОДПИСИ СЛЕДУЕТ ЗА ЧИСЛОМ СТРЕЛОК: панель знает один вид, провод различает одну
      // стрелку (`label`) и несколько (`multi`). Различие — счётчик, и держать его руками значило
      // бы просить человека объявить то, что и так видно.
      const prev = callouts[index]?.kind;
      writeCallout(index, {
        ...(prev === 'label' || prev === 'multi'
          ? { kind: (points.length > 1 ? 'multi' : 'label') as AnnotationKind }
          : {}),
        points: points.map((p) => ({ x: p.x.toFixed(4), y: p.y.toFixed(4) })),
      });
    },
    onRemove: (key: string) => removeCalloutAt(Number(key)),
    // ТРЕТИЙ ТАКТ ЖЕСТА «клик — клик — напиши, что это». Поверхность просит поставить курсор в
    // правку сразу после постановки, и просьбу надо ИСПОЛНИТЬ: без этого поставленная выноска
    // требует поездки мышью в соседний блок, чтобы её назвать, — а безымянная выноска на листе
    // хуже отсутствующей. Счётчиком, а не флагом: два подряд выбора одной и той же строки обязаны
    // дать два наведения курсора.
    onSelect: (key: string | null, opts?: { focus?: boolean }) => {
      setSelected(key == null ? null : Number(key));
      if (key != null && opts?.focus) setFocusEditor((n) => n + 1);
    },
    onBeforeMutate: calloutHistory?.record,
    // ОТКАТ СНИМАЕТ ВЫБОР по тому же доводу, что и удаление: ⌘Z возвращает МАССИВ целиком, и
    // строка под запомненным индексом после отката может быть уже не той.
    onUndo: calloutHistory
      ? () => {
          calloutHistory.undo();
          setSelected(null);
        }
      : undefined,
    canUndo: calloutHistory?.canUndo,
  };

  /** How many callouts stand on a plate — the number the confirmation has to say out loud. */
  const calloutsOn = (mediaId: number) =>
    callouts.filter((c) => (c.mediaId ?? 0) === mediaId).length;

  /**
   * TAKE A PLATE OFF THE DOCUMENT — AND ITS CALLOUTS DIE WITH IT (R-14, слова владельца: «если
   * медиа удаляются, то колауты к нему тоже»).
   *
   * ЭТО СМЕНА ПРАВИЛА, И ВОТ ПОЧЕМУ СТАРОЕ БЫЛО ХУЖЕ. Раньше выноски «откручивались»
   * (`media_id = 0`) в расчёте на «повесь обратно в редакторе» — и каждый снос плиты плодил ровно
   * те строки, которые владелец запретил показывать: якорь — доля СВОЕГО кадра, на другой плите он
   * бессмыслен, и открученная выноска жила в списке вечным «unpinned». Мудборд ведёт себя так с
   * самого начала (`mood-board.tsx` → `confirmRemove`: «УКАЗАНИЯ УМИРАЮТ ВМЕСТЕ С ПЛИТКОЙ, а не
   * открепляются») — это тот же акт с той же ценой, и цену называет подтверждение с числом
   * (`askDetach`), а не тихий побочный эффект.
   *
   * СТАРЫЕ открученные строки из базы этот код НЕ трогает: они фильтруются НА ПОКАЗЕ (`sheetRows`),
   * а не стираются при загрузке — молча удалять чужие данные нельзя, и в редакторе («callouts
   * without an image») они по-прежнему доступны для ре-пина или явного удаления.
   *
   * THE ARRAY IS WRITTEN AT ITS ROOT, never through a field-array mutator. That is the convention of
   * these files and it exists because the mutators do not broadcast; a root `setValue` does, so
   * every other reader of the path re-syncs.
   */
  function detachPlate(plate: DocumentPlate) {
    const media = form.getValues('technicalMedia') ?? [];
    form.setValue(
      'technicalMedia',
      media.filter((m) => (m.mediaId ?? 0) !== plate.mediaId),
      { shouldDirty: true },
    );
    const cs = form.getValues('callouts') ?? [];
    if (cs.some((c) => (c.mediaId ?? 0) === plate.mediaId)) {
      form.setValue(
        'callouts',
        cs.filter((c) => (c.mediaId ?? 0) !== plate.mediaId),
        { shouldDirty: true },
      );
      // Выбор адресует строку ИНДЕКСОМ, а вырезанные строки сдвигают весь хвост: оставленный
      // выбор открыл бы правку чужой выноски, ничего об этом не сказав.
      setSelected(null);
    }
  }

  /** Silent when nothing is pinned; a question naming the COUNT when something is. */
  function askDetach(plate: DocumentPlate) {
    if (calloutsOn(plate.mediaId) === 0) {
      detachPlate(plate);
      return;
    }
    setDetaching(plate);
  }

  const detachInert =
    inspecting > 0
      ? `v${inspecting} is a record of what was minted — nothing on this tab edits it`
      : 'the card is released: its sheet is frozen';

  /**
   * ═══ TAKE A GENERATED PICTURE ONTO THE CARD — the verb the switcher needs (W-14) ════════════
   *
   * A callout's `media_id` addresses the card's OWN media. So a render that lives only in the band
   * cannot carry a callout: it has to become part of the card first, and that is a decision a person
   * makes, not a side effect of looking at it. Its picture survives the move because `resolved`
   * reads the band too — that is the whole of the T-20 fix, and it lives there, not here.
   *
   * `kind=RENDER` IS THE CARD'S OWN WORD FOR IT, and it means what the contract says it means: «an
   * ACCEPTED render — one that leaves the studio and goes out with the card». A turntable frame
   * accepted here is filed under the same kind because the card's vocabulary HAS NO 3D MEMBER; the
   * segment it appears in afterwards is still right, because the segment is read off the RUN that
   * produced the picture and not off the card's label. Said plainly on the button's own row.
   *
   * WRITTEN AT THE ROOT OF THE ARRAY, never through a field-array mutator — the convention of these
   * files, and the reason is that the mutators do not broadcast while a root `setValue` does.
   */
  function takeIntoCard(plate: DocumentPlate) {
    const media = form.getValues('technicalMedia') ?? [];
    if (media.some((m) => (m.mediaId ?? 0) === plate.mediaId)) return;
    // Вид — по происхождению плиты. У верстачной он выводится из слота ТЕМ ЖЕ правилом, что у
    // серверного минта (см. BENCH_VIEW_MEDIA_KIND); у плиты прогона это RENDER, потому что в
    // словаре карточки нет члена для 3D-кадра, а RENDER по контракту и значит «принятая картинка
    // прогона, уходящая с карточкой».
    const kind: common_TechCardMediaKind =
      plate.origin === 'bench'
        ? (BENCH_VIEW_MEDIA_KIND[(plate.viewKey ?? '').trim()] ?? 'TECH_CARD_MEDIA_KIND_DETAIL')
        : 'TECH_CARD_MEDIA_KIND_RENDER';
    form.setValue('technicalMedia', [...media, { mediaId: plate.mediaId, kind, caption: '' }], {
      shouldDirty: true,
    });
    showMessage(
      plate.origin === 'bench'
        ? 'taken into the card’s media as its bench view — the next mint lists it once, not twice'
        : 'taken into the card’s media — it is not on the technical sheet, and callouts drawn on it are not either',
      'success',
    );
  }

  /**
   * ═══ ПОЛОЖИТЬ НА ЛИСТ КАРТИНКУ ИЗ БИБЛИОТЕКИ ════════════════════════════════════════════════
   *
   * Раньше эта дверь вела в модалку рисования: «add a drawing ▸» открывала лист эскиза, где картинку
   * и добавляли. Модалки больше нет (T-21), поэтому дверь обязана вести куда-то ЗДЕСЬ — иначе
   * снятие модалки молча уносит единственный способ завести первую плиту на карточке без верстака.
   *
   * ВИД — `DETAIL`, и это не догадка, а признание: библиотека не знает, перед это или спинка.
   * Назвать его можно тут же, селектором в подвале плиты, — тем самым, что стоял в подвале кадра
   * на листе эскиза.
   */
  function addPlateFromLibrary(items: common_MediaFull[]) {
    const media = form.getValues('technicalMedia') ?? [];
    const have = new Set(media.map((m) => m.mediaId ?? 0));
    const fresh = items.filter((it) => it.id != null && !have.has(it.id));
    if (!fresh.length) return;
    setPicked((prev) => [...prev, ...fresh]);
    form.setValue(
      'technicalMedia',
      [
        ...media,
        ...fresh.map((it) => ({
          mediaId: it.id as number,
          kind: 'TECH_CARD_MEDIA_KIND_DETAIL' as common_TechCardMediaKind,
          caption: '',
        })),
      ],
      { shouldDirty: true },
    );
  }

  /**
   * ═══ `download SVG` — THE SHEET AS ONE FILE ═════════════════════════════════════════════════
   *
   * EXPORTS THE FLATS AND THEIR CALLOUTS, whatever segment is on screen, and that is deliberate.
   * The sheet IS the flats — the mint composes it from them and nothing else — so an export that
   * followed the switcher would produce a file called «sheet» containing three turntable frames.
   * The button says which composition it took.
   */
  const exportPlates: DocumentPlate[] =
    inspecting === 0 ? segments.flat.plates : frozenPlates;

  const downloadSheet = async () => {
    // READ THROUGH `getValues`, NOT THROUGH THE WATCHED LIST. `callouts` above is narrowed to
    // `CalloutLike`, which carries only the fields the rest of this tab writes — the SHAPE
    // (`kind`, `points`, `dashed`, `filled`, `color`) is on the form row and is exactly what the
    // export must not lose. A cast would have compiled and shipped pins where arrows were drawn.
    const rows = (form.getValues('callouts') ?? []) as SheetCallout[];
    const svgPlates: SheetSvgPlate[] = exportPlates.map((plate) => ({
      name: plate.name,
      url:
        plate.media?.media?.fullSize?.mediaUrl ||
        plate.media?.media?.compressed?.mediaUrl ||
        plate.media?.media?.thumbnail?.mediaUrl ||
        '',
      callouts: rows
        .map((c, index) => ({ c, index }))
        .filter(({ c }) => (c.mediaId ?? 0) === plate.mediaId)
        .map(({ c, index }) => {
          return {
            number: c.number || index + 1,
            kind: c.kind ?? 'pin',
            points: (c.points ?? []).map((p) => ({
              x: Number(p.x ?? '') || 0,
              y: Number(p.y ?? '') || 0,
            })),
            // ТА ЖЕ ФУНКЦИЯ, ЧТО У ЭКРАНА (`calloutsOfPlate`), и это обязательство: бумага обязана
            // повторять экран. Своя копия разбора здесь и была вторым местом, где ноль от пустоты
            // не отличался, — маркер садился в угол листа ровно так же, как садился на плите.
            label: { x: frameFraction(c.posX), y: frameFraction(c.posY) },
            hasText: !!(c.description ?? '').trim(),
            color: c.color ?? '',
            dashed: !!c.dashed,
            filled: !!c.filled,
          };
        }),
    }));

    const style = (card?.techCard?.styleNumber ?? '').trim() || `card-${techCardId}`;
    const version = inspecting === 0 ? (latest ? `v${latest}` : 'draft') : `v${inspecting}`;
    const pinned = svgPlates.reduce((n, p) => n + p.callouts.length, 0);
    try {
      const markup = await buildSheetSvg({
        title: `${style} · sheet ${version} · ${pinned} callout${pinned === 1 ? '' : 's'}`,
        plates: svgPlates,
      });
      downloadSvg(`${style}-sheet-${version}.svg`, markup);
    } catch (error) {
      showMessage(
        `the sheet could not be written: ${(error as Error)?.message || 'unknown failure'}`,
        'error',
      );
    }
  };

  /**
   * ЧТО ПОКАЗЫВАЕТ ПАНЕЛЬ CALLOUTS: только выноски, стоящие на плитах ДОКУМЕНТА (R-14).
   *
   * Массив `callouts` шире того, что этому экрану принадлежит, двумя сортами строк:
   *   — открученные (`media_id = 0`) со старых карточек: раздела «unpinned» быть не должно, и
   *     detachPlate таких больше не создаёт. Они НЕ стираются — фильтр стоит на показе, строки
   *     живут в payload и в редакторе («callouts without an image»), где их можно ре-пиннуть или
   *     удалить явно; тихо выбросить чужие данные при загрузке — значит потерять текст, который
   *     писал человек;
   *   — мудбордные: их `media_id` принадлежит мудборду, не листу (`mood-callouts.tsx` — «второго
   *     дома у них нет»), и раньше они показывались тут как «off the sheet». Членство в плитах
   *     документа отсекает их без отдельного списка мудбордных id; если одно медиа стоит И на
   *     мудборде И в технических — членство в документе побеждает, потому что спрятать листовую
   *     выноску хуже, чем показать мудбордную на снимке, который на листе стоит.
   *
   * ИНДЕКС — МЕСТО СТРОКИ В ПОЛНОМ МАССИВЕ, и фильтр обязан его пережить: и маркеры плит, и
   * leaf-записи полей (`callouts.N.description`), и `selected` адресуют строку по этому индексу.
   * Отфильтрованный список с переиндексацией писал бы текст в ЧУЖУЮ выноску.
   *
   * Счётчик в шапке секции берётся от ЭТОГО списка — то, что названо числом, и то, что видно,
   * обязаны совпадать, иначе «7 callouts» при пяти строках на экране.
   */
  const sheetRows = useMemo(() => {
    const onDocument = new Set(plates.map((p) => p.mediaId));
    return callouts
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => onDocument.has(c.mediaId ?? 0));
  }, [callouts, plates]);

  /** Read once, so the question and the act cannot disagree about how many are at stake. */
  const detachCount = detaching ? calloutsOn(detaching.mediaId) : 0;

  return (
    <SectionStack>
      {/* ─── STOREY (a): THE DOCUMENT ─────────────────────────────────────────────────────── */}
      <SectionStack row>
        <Section
          title={inspecting === 0 ? 'the sheet' : `sheet v${inspecting} — frozen`}
          question={
            inspecting === 0
              ? '— the document as it stands; every change here is saved by the card’s own Save'
              : '— the composition this version pinned; nothing on this tab edits it'
          }
          action={
            hasVersions ? (
              <ChipRow>
                <Chip
                  selected={inspecting === 0}
                  pressed={inspecting === 0}
                  onClick={() => setInspecting(0)}
                >
                  the document
                </Chip>
                {versionNumbers.map((n) => (
                  <Chip
                    key={n}
                    selected={inspecting === n}
                    pressed={inspecting === n}
                    onClick={() => setInspecting(n)}
                  >
                    v{n}
                  </Chip>
                ))}
              </ChipRow>
            ) : undefined
          }
          className='min-w-0 flex-1'
        >
          {inspecting === 0 && (
            <>
              {/* THE SWITCH IS A `lead`, NOT AN `action`. It belongs to the label it sits beside, so
                  its position must not depend on how wide the block happens to be in the current
                  layout — the version chips already own the right edge of the header above. */}
              <GroupLabel
                flush
                lead={
                  <ViewSwitch<ArtifactKind>
                    label='representation'
                    value={kind}
                    options={ARTIFACT_KINDS}
                    onChange={setKind}
                  />
                }
                action={
                  <Text size='micro' variant='label' component='span'>
                    {segment.plates.length} picture{segment.plates.length === 1 ? '' : 's'}
                    {kind !== 'flat' &&
                      (segment.filteredToSelected
                        ? ' · the chosen ones'
                        : ' · everything on this page')}
                  </Text>
                }
              >
                what you are marking up
              </GroupLabel>

              <SheetMembershipWarning
                kind={kind}
                filteredToSelected={segment.filteredToSelected}
                serverStates={segment.serverStates}
                hasPictures={segment.plates.length > 0}
              />

              {/* ПАНЕЛЬ ВИДОВ УКАЗАНИЙ — НАД РЯДОМ, ОДНА НА ЛИСТ. Не бордерная полоса: внутри
                  блока новая коробка была бы блоком в блоке, а ступень «подгруппа» рисуется
                  линией. Стоит только там, где ею есть чем воспользоваться: без единой плиты
                  карточки взводить вид не на что, и панель обещала бы жест, которого нет. */}
              {drawableHere && (
                <GroupLabel
                  lead={
                    <AnnotationToolbar
                      tool={tool}
                      onTool={setTool}
                      hint={tool ? placingHint(tool, placed) : undefined}
                    />
                  }
                  action={
                    <Text size='nano' variant='label' component='span' className='normal-case'>
                      {tool
                        ? 'click the plate you mean'
                        : 'arm a kind, then click a plate — the text is written beside, under CALLOUTS'}
                    </Text>
                  }
                >
                  draw
                </GroupLabel>
              )}
            </>
          )}

          {onScreen.length === 0 ? (
            kind === 'flat' || inspecting > 0 ? (
              <EmptyDocument
                bench={bench}
                disabled={disabled}
                onAddPlate={inspecting === 0 && !disabled ? addPlateFromLibrary : undefined}
              />
            ) : (
              <Text size='micro' variant='label' component='p'>
                nothing of this kind on the loaded page of the band.{' '}
                {kind === 'render'
                  ? 'A fabric render is made on STUDIO, from the flats standing in the bench slots.'
                  : 'A turntable is made on STUDIO, and it turns the renders — so the renders come first.'}
              </Text>
            )
          ) : (
            <PlateGrid
              plates={onScreen}
              calloutsOf={inspecting === 0 ? calloutsOfPlate : () => []}
              selected={inspecting === 0 ? selected : null}
              canPlaceOn={canPlaceOn}
              drawInert={drawInert}
              tool={tool}
              onToolDone={() => setTool(null)}
              onPlacedCountChange={setPlaced}
              onAddCallout={addCalloutOn}
              bindings={surfaceBindings}
              onZoom={setZoomAt}
              onAddPlate={
                inspecting === 0 && !disabled && kind === 'flat' ? addPlateFromLibrary : undefined
              }
              onDetach={inspecting === 0 && !disabled ? askDetach : undefined}
              detachInert={detachInert}
              onTakeIn={inspecting === 0 && !disabled ? takeIntoCard : undefined}
              /* THE MARK'S DOOR RIDES ONLY THE LIVE, NON-FLAT LISTS. A flat is chosen by standing
                 in a bench slot, not by the mark, so a select door there would be a second registry
                 of one election; a frozen version is a record, and records are not edited. */
              onToggleChosen={
                inspecting === 0 && kind !== 'flat' && !disabled && segment.serverStates
                  ? (plate) =>
                      setPictureSelected.mutate({
                        pictureId: plate.pictureId ?? 0,
                        selected: !plate.chosen,
                      })
                  : undefined
              }
              chosenInert={
                inspecting > 0 || kind === 'flat'
                  ? undefined
                  : disabled
                    ? 'the card is read-only for you — the mark is an edit of the card'
                    : SELECT_MARK_NOT_STATED
              }
              chosenPending={setPictureSelected.isPending}
              offSheet={inspecting === 0 && kind !== 'flat'}
              halo={inspecting === 0 && kind !== 'flat'}
            />
          )}

          {/* ─── THE TWO DOORS OF THE DOCUMENT ITSELF ─────────────────────────────────────── */}
          <div className='flex flex-wrap items-center gap-1.5 pt-1'>
            {exportPlates.length ? (
              <Button variant='secondary' size='sm' onClick={downloadSheet}>
                download SVG
              </Button>
            ) : (
              <InertDoor
                label='download SVG'
                reason='there is nothing on the sheet to write: no flat plate stands on this card yet'
              />
            )}
            <Button variant='secondary' size='sm' onClick={() => setReplacing(true)}>
              replace the sheet with a file ▸
            </Button>
            <Text size='nano' variant='label' component='span' className='min-w-0 normal-case'>
              the file carries the <b>flats</b> and the callouts standing on them — {exportPlates.length}{' '}
              plate{exportPlates.length === 1 ? '' : 's'} — whichever representation is on screen,
              because the sheet is made of flats. Pictures are LINKED by address, not embedded.
            </Text>
          </div>

          {inspecting > 0 && (
            <CalloutBox tone='note'>
              <Text size='micro' component='p'>
                <b>v{inspecting} as it was minted.</b> A version freezes the COMPOSITION — which
                pictures are on the sheet.{' '}
                {versionShortHash(shownVersion) && (
                  <>
                    Its first plate pinned bytes <code>{versionShortHash(shownVersion)}</code>.{' '}
                  </>
                )}
                The callouts are not frozen: printing v{inspecting} prints the callouts the card
                holds now, which is why fixing a note never needs a new version.
              </Text>
            </CalloutBox>
          )}
        </Section>

        <Section
          title='callouts'
          question='— a number is minted once and never reused'
          action={
            /* ЧИСЛО = СПИСОК. Считается ровно то, что панель ниже рисует (`sheetRows`): выноски на
               плитах документа. Открученные и мудбордные не показываются — значит и не считаются;
               пилюли «unpinned» больше нет по слову владельца (R-14), а не по забывчивости. */
            <Pill tone='mut'>
              {sheetRows.length} on the plate{sheetRows.length === 1 ? '' : 's'}
            </Pill>
          }
          className='lg:w-[340px] lg:shrink-0'
        >
          <CalloutPanel
            rows={sheetRows}
            plates={plates}
            selected={selected}
            onSelect={setSelected}
            disabled={disabled || inspecting > 0}
            onRemove={inspecting === 0 && !disabled ? removeCalloutAt : undefined}
            onDemote={inspecting === 0 && !disabled ? demoteCalloutAt : undefined}
            focusToken={focusEditor}
          />
        </Section>
      </SectionStack>

      {/* ─── STOREY (b): THE VERSIONS ─────────────────────────────────────────────────────── */}
      {hasVersions ? (
        <>
          {diverged && (
            <Section
              title={`differs from v${latest}`}
              question='— the composition has moved on; the paper has not'
              action={
                <Pill tone='attention'>
                  {diverged.length} change{diverged.length === 1 ? '' : 's'}
                </Pill>
              }
            >
              <Text size='micro' component='p'>
                <b>{diverged.join(', ').toLowerCase()}</b> — pieces and print stay on v{latest}{' '}
                until a new version is minted. Nothing here is broken: a version is born of an act,
                so v{latest + 1} appears when somebody prints or releases, not when a picture
                changes.
              </Text>
              <div>
                <GroupLabel>v{latest} → the bench</GroupLabel>
                <DiffRows version={band.latestVersion} bench={bench} />
              </div>
              <PrintSheetButton
                techCardId={techCardId}
                band={band}
                diverged={diverged}
                disabled={disabled}
                onMintFirst={setMintOrigin}
              />
            </Section>
          )}

          <SectionStack row>
            <Section
              title={`v${latest}`}
              question={
                <>
                  — minted by {(band.latestVersion?.mintedBy ?? '').trim() || '—'}{' '}
                  {clockStamp(band.latestVersion?.mintedAt)}
                  {band.latestVersion?.mintedVia ? ` · via ${band.latestVersion.mintedVia}` : ''}
                  {band.latestVersion?.mixedConsent ? ' · mixed composition accepted' : ''}
                </>
              }
              action={
                <PrintSheetButton
                  techCardId={techCardId}
                  band={band}
                  diverged={diverged}
                  disabled={disabled}
                  onMintFirst={setMintOrigin}
                />
              }
              className='min-w-0 flex-1'
            >
              <Row
                label={
                  <Text size='micro' component='span'>
                    versions minted
                  </Text>
                }
                value={versionNumbers.length}
              />
              <Row
                label={
                  <Text size='micro' component='span'>
                    plates frozen in v{latest}
                  </Text>
                }
                value={band.latestVersion?.plates?.length ?? 0}
              />
              <Text size='micro' variant='label' component='p'>
                No QR is printed in this wave. There is no public viewer behind one yet, and paper
                carrying a code that answers nothing dies silently on the shop floor — so the sheet
                carries its version number instead.
              </Text>
            </Section>

            <Section
              title='journal'
              question='— what left the building, and when'
              className='lg:w-[340px] lg:shrink-0'
            >
              <SheetJournal journal={band.journal} />
              <Text size='nano' variant='label' component='p' className='uppercase'>
                a reprint is a line here, never a new version
              </Text>
            </Section>
          </SectionStack>
        </>
      ) : (
        <NoVersionsYet
          bench={bench}
          plates={plates}
          disabled={disabled}
          onMint={setMintOrigin}
          say={showMessage}
        />
      )}

      {!host && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>the mint is not wired to this card’s save path.</b> A version is written by the same
            transaction that saves the document, so it cannot be minted until this tab is mounted
            inside <code>DesignSaveHostProvider</code>. Everything above works; only minting does
            not.
          </Text>
        </CalloutBox>
      )}

      {mintOrigin && (
        <MintDialog
          open
          onOpenChange={(open) => !open && setMintOrigin(null)}
          techCardId={techCardId}
          band={band}
          origin={mintOrigin}
          disabled={disabled}
          onMinted={() => setInspecting(0)}
        />
      )}

      {/* ═══ УВЕЛИЧЕННЫЙ ВИД — ТА ЖЕ ПОВЕРХНОСТЬ, ЧТО НА ПЛИТЕ ═══════════════════════════════════
          Это НЕ возвращение модалки рисования: модалка была ЕДИНСТВЕННЫМ местом, где указание
          вообще ставилось, а увеличение — способ прочесть и поправить то, что на плите уже стоит.
          Мерку по миллиметровой детали иначе не разглядеть, и ровно поэтому окно умеет и ставить
          тоже: два разных набора умений на одной картинке расходятся первым же новым видом.
          Листается по ВСЕМУ ряду на экране — соседний артефакт на расстоянии стрелки. */}
      {zoomAt != null && onScreen[zoomAt] && (
        <AnnotationZoomDialog
          open
          onOpenChange={(open) => !open && setZoomAt(null)}
          title={onScreen[zoomAt].name}
          src={plateUrl(onScreen[zoomAt])}
          callouts={calloutsOfPlate(onScreen[zoomAt].mediaId)}
          frozen={!canPlaceOn(onScreen[zoomAt])}
          onAdd={
            canPlaceOn(onScreen[zoomAt])
              ? (shape, points, pen) => addCalloutOn(onScreen[zoomAt].mediaId, shape, points, pen)
              : undefined
          }
          selectedKey={selected == null ? null : String(selected)}
          {...surfaceBindings}
          legend
          halo={inspecting === 0 && kind !== 'flat'}
          readOnlyNote={
            canPlaceOn(onScreen[zoomAt]) ? undefined : (
              <Text size='micro' variant='label' component='span'>
                {onScreen[zoomAt].origin === 'card'
                  ? drawInert
                  : 'this picture is not in the card’s media yet — take it in on its plate, and it becomes drawable here'}
              </Text>
            )
          }
          onPrev={
            onScreen.length > 1
              ? () => setZoomAt((at) => ((at ?? 0) - 1 + onScreen.length) % onScreen.length)
              : undefined
          }
          onNext={
            onScreen.length > 1
              ? () => setZoomAt((at) => ((at ?? 0) + 1) % onScreen.length)
              : undefined
          }
          position={{ index: zoomAt, total: onScreen.length }}
        />
      )}

      {/* ═══ «REPLACE THE SHEET WITH A FILE» — A PROCEDURE, EXPLAINED, NOT A BUTTON THAT DOES IT ══
          The prototype's own modal of this name explains rather than acts, and this build keeps the
          division for a reason it can state exactly: replacing the picture under a sheet means every
          callout on it has to be WALKED to a new address by hand. `pos_x/pos_y` and `points` are
          fractions of a FRAME; carried onto a different drawing they land somewhere else entirely
          and look perfectly normal doing it. A one-press «replace» would therefore either lose the
          markup or silently misplace it, and the second is worse. What this admin already has is
          the honest version of the same walk, spread over controls that each do one thing. */}
      {replacing && (
        <ConfirmationModal
          open
          onOpenChange={(open) => !open && setReplacing(false)}
          onConfirm={() => setReplacing(false)}
          title='replace the sheet with a file'
          confirmLabel='close'
          cancelLabel='close'
          width='md'
        >
          <div className='space-y-stack'>
            <Text size='micro' component='p'>
              There is no single «replace» here, and that is deliberate. A callout stores its
              position as a <b>fraction of its own picture</b>. Swap the picture underneath it and
              the marker keeps the fraction: it lands somewhere else on the garment and looks
              entirely normal doing it. So the exchange is done as three visible acts instead of one
              invisible one.
            </Text>
            <div>
              <GroupLabel>the walk</GroupLabel>
              <Row
                label={<Text size='micro' component='span'>1 · bring the file in</Text>}
                value={<Text size='micro' component='span'>the + reference slot in INPUT</Text>}
              />
              <Row
                label={<Text size='micro' component='span'>2 · put it in the slot it replaces</Text>}
                value={<Text size='micro' component='span'>the bench, same view</Text>}
              />
              <Row
                label={<Text size='micro' component='span'>3 · move the callouts across</Text>}
                value={<Text size='micro' component='span'>detach here, re-pin in the editor</Text>}
              />
            </div>
            <Text size='micro' component='p'>
              <b>The callouts go with the plate.</b> Their text, their number and their marker are
              removed together with it — a callout is a fraction of THIS frame, and a fraction
              outlives its picture only as a number nobody can place. This is what the owner asked
              for; the previous wording promised they would survive as «unpinned», and that promise
              is no longer true.
            </Text>
          </div>
        </ConfirmationModal>
      )}

      {detaching && (
        <ConfirmationModal
          open
          onOpenChange={(open) => !open && setDetaching(null)}
          onConfirm={() => detachPlate(detaching)}
          title={`take ${detaching.name} off the sheet`}
          confirmLabel='take it off'
          width='sm'
        >
          <div className='space-y-stack'>
            <Text size='micro' component='p'>
              <b>
                {detachCount} callout{detachCount === 1 ? '' : 's'} stand
                {detachCount === 1 ? 's' : ''} on this plate.
              </b>{' '}
              Their TEXT is kept — a person wrote it and it outlives the picture, and the server
              takes a cut piece’s name from it. What goes is the anchor: the marker, its position
              and any shape drawn on it, because a fraction of a frame only means something on its
              own picture.
            </Text>
            <Text size='micro' component='p'>
              They are removed with it. Nothing is kept as an «unpinned» line beside the sheet:
              a number without a picture cannot be read back onto a garment, and a list of such
              numbers grows until nobody trusts any of it.
            </Text>
          </div>
        </ConfirmationModal>
      )}
    </SectionStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ═══ SAID BEFORE THE PENCIL IS PICKED UP, NOT AFTER ═══════════════════════════════════════════
 *
 * THE DEFECT THIS EXISTS TO PREVENT. The technical sheet is composed of FLATS ONLY: the mint takes
 * the bench's flat plates and nothing else, and the server's `freezeCallouts` then keeps the
 * callouts that stand ON THOSE PLATES — SILENTLY DROPPING every other one. So a person who opens
 * ARTIFACTS, switches to «renders», carefully annotates a fabric render and mints a version gets a
 * sheet with none of that work on it, no error, no warning, and no line in the journal saying
 * anything went missing. The annotation is not corrupted; it simply is not there.
 *
 * WHY IT IS A BLUE BOX AND NOT A GREY FOOTNOTE. This is the mid-flight, needs-a-human tone of the
 * system, and it is the correct one: nothing is broken, and the person is not doing anything wrong
 * — annotating a render is a perfectly good thing to do, it just does not reach paper. Red would
 * claim a fault; a grey hint at the bottom of the block would be read after the drawing, which is
 * exactly too late. It sits ABOVE the pictures, tied to the representation that is on screen.
 *
 * IT IS NOT SHOWN ON `flat`, and that is the point of tying it to the kind: a warning that is
 * always on screen is furniture, and furniture is not read.
 */
function SheetMembershipWarning({
  kind,
  filteredToSelected,
  serverStates,
  hasPictures,
}: {
  kind: ArtifactKind;
  filteredToSelected: boolean;
  serverStates: boolean;
  hasPictures: boolean;
}): JSX.Element | null {
  if (kind === 'flat') return null;
  const what = kind === 'render' ? 'a fabric render' : 'a turntable frame';
  return (
    <CalloutBox tone='warning'>
      <Text size='micro' component='p'>
        <b>callouts drawn here do not reach the technical sheet.</b> The sheet is composed of{' '}
        <b>flats</b> and nothing else — the mint takes the bench’s flat plates, and the freeze then
        keeps only the callouts standing on them. A callout you place on {what} stays on the card
        and stays in the list beside this block, but it is <b>silently left out</b> of every version
        minted from now on, and no message says so at the time. Mark up {what} for the studio and
        for yourself; mark up the <b>flats</b> for the factory.
      </Text>
      {/* THE PROVENANCE OF THE LIST IS ONLY WORTH A SENTENCE WHEN THERE IS A LIST. With nothing of
          this kind on the page, «nothing is marked as chosen» and «this server does not state the
          mark» are both true and both useless — and the second one names a server defect that may
          not exist, because an empty page gives nothing to sample the flag from. */}
      {hasPictures && !filteredToSelected && (
        <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
          {serverStates
            ? 'Nothing of this kind is marked as chosen on this card, so the segment lists every one on the loaded page. Press select on a picture — here, or on the studio’s own strip of this kind — and the segment narrows to the chosen ones.'
            : 'This server does not state the mark at all — a binary older than the field — so the segment lists every picture of this kind on the loaded page.'}
        </Text>
      )}
      {/* THE WAY BACK IS SAID WHERE THE NARROWING HAPPENS. A narrowed list with no word about how
          it widens again reads as «the other pictures are gone» — and the pictures it no longer
          shows are exactly where a select door cannot be, so the sentence is the only door. */}
      {filteredToSelected && (
        <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
          Only the chosen ones of this kind are listed. un-select takes the mark off a picture;
          with none left chosen, the segment lists everything of this kind again. Choosing among
          ALL of them — chosen or not — is done on the studio’s own strip of this kind.
        </Text>
      )}
    </CalloutBox>
  );
}

/** Адрес плиты: полный размер, потом сжатый, потом миниатюра. Пусто — поверхность скажет сама. */
function plateUrl(plate: DocumentPlate): string {
  return (
    plate.media?.media?.fullSize?.mediaUrl ||
    plate.media?.media?.compressed?.mediaUrl ||
    plate.media?.media?.thumbnail?.mediaUrl ||
    ''
  );
}

/** Пропорции кадра плиты: собственные, если сервер их назвал, иначе честный фолбэк. */
function plateAspect(plate: DocumentPlate): string {
  const dim = plate.media?.media?.fullSize ?? plate.media?.media?.thumbnail;
  const w = dim?.width ?? 0;
  const h = dim?.height ?? 0;
  return w > 0 && h > 0 ? `${w}/${h}` : '4/5';
}

/**
 * ВЫСОТА КАДРА ПЛИТЫ. Слова владельца: «высота картинок должна быть больше».
 *
 * ЧИСЛОМ, А НЕ ДОЛЕЙ КОЛОНКИ, и в этом вся починка. Раньше плита была ячейкой 4/5 в трёхколоночной
 * сетке, а снимок вписывался в неё `contain`ом: у альбомного чертежа (4:3 — обычное дело для
 * флэта) от трёхсот пикселей ширины оставалось двести с небольшим пикселей высоты, остальное
 * съедали поля. То есть «низкие плиты» были не малой ячейкой, а ЛЕТТЕРБОКСОМ внутри неё.
 *
 * Теперь кадр — сам снимок: высота задана, ширина выведена из его собственных пропорций, полей
 * нет вовсе. Равная высота у всех плит остаётся (ряд читается как ряд), а доли выносок считаются
 * от кадра, чьи пропорции РАВНЫ пропорциям картинки, — то есть маркер стоит там, где его
 * поставили.
 *
 * ЧИСЛО, А НЕ `clamp`: этой же высотой живёт слот «+ add a plate», а он принимает пиксели. Ряд, в
 * котором добавляющая рамка ниже соседних плит, читается как сбой раскладки, и платить за это
 * отзывчивостью, которой на столе никто не пользуется, незачем. Полоса эскиза стоит на 480.
 */
const PLATE_FRAME_HEIGHT = 400;

/**
 * The plates — and each one IS the drawing surface, not a picture of it.
 *
 * ═══ ПОЧЕМУ ПЛИТА РИСУЕТ САМА (T-21) ═══════════════════════════════════════════════════════════
 *
 * Слова владельца: «для выставления колаутов не нужна модалка оно должно быть инлайн». Плита несёт
 * ту же `AnnotationSurface`, что лист эскиза и снимок шага сборки: указание ставится кликом по
 * самой плите, маркер таскается, якоря фигуры правятся ручками, Backspace удаляет. Своей отрисовки
 * «для превью» у плиты больше нет — она была третьим словарём видов и отставала бы первым же новым.
 *
 * ═══ КАКАЯ ПЛИТА ПРИНИМАЕТ УКАЗАНИЕ, И ПОЧЕМУ ЭТО ПРОП, А НЕ `fieldset` ════════════════════════
 *
 * `media_id` выноски адресует медиа КАРТОЧКИ, поэтому верстачная плита и выход прогона сперва
 * берутся в карточку. До этого мгновения поверхность заморожена — `frozen`, ПРОПОМ. Замерено в
 * Chromium: под `<fieldset disabled>` не стреляют ровно `click` и `focus`, а `pointerdown`,
 * `pointerup` и `pointerenter` стреляют — то есть постановка указания (она начинается с
 * `pointerdown`) прошла бы сквозь такую «заморозку» в полный рост.
 *
 * ═══ ДВЕРИ ═══════════════════════════════════════════════════════════════════════════════════
 *
 * EVERY PLATE CARRIES ITS DOORS, and a door that cannot act is DRAWN INERT WITH ITS REASON rather
 * than omitted. Absence teaches that the flow does not exist; a dead control with a reason teaches
 * which of the true things is in the way — a frozen version, a released card, or a plate that is
 * not on the document yet.
 */
function PlateGrid({
  plates,
  calloutsOf,
  selected,
  canPlaceOn,
  drawInert,
  tool,
  onToolDone,
  onPlacedCountChange,
  onAddCallout,
  bindings,
  onZoom,
  onAddPlate,
  onDetach,
  detachInert,
  onTakeIn,
  onToggleChosen,
  chosenInert,
  chosenPending,
  offSheet,
  halo,
}: {
  plates: DocumentPlate[];
  /** Указания одной плиты, уже в вью-модели поверхности. */
  calloutsOf: (mediaId: number) => SurfaceCallout[];
  selected: number | null;
  /** Принимает ли эта плита указание — и, значит, заморожена её поверхность или нет. */
  canPlaceOn: (plate: DocumentPlate) => boolean;
  /** Почему рисовать нельзя нигде на этом экране — для мёртвой двери на плите карточки. */
  drawInert: string;
  tool: string | null;
  onToolDone: () => void;
  onPlacedCountChange: (n: number) => void;
  onAddCallout: (mediaId: number, kind: string, points: ShapePoint[], pen: PenStyle) => void;
  /** Общая обвязка поверхности: перенос, правка якорей, удаление, выбор, откат. */
  bindings: Omit<AnnotationSurfaceProps, 'src' | 'callouts'>;
  /** Открыть плиту во весь экран — по её месту в ряду, чтобы листалось по всему ряду. */
  onZoom: (index: number) => void;
  /** Положить на лист картинку из библиотеки, или `undefined` — и слота нет вовсе. */
  onAddPlate?: (items: common_MediaFull[]) => void;
  /** Take a plate off the document, or `undefined` — and then `detachInert` says why not. */
  onDetach?: (plate: DocumentPlate) => void;
  detachInert: string;
  /**
   * Put a bench slot's or a run's picture into the card's own media, so a callout can address it
   * at all. С ним же живёт составная дверь «take in + draw ▸» на этих плитах (R-13).
   */
  onTakeIn?: (plate: DocumentPlate) => void;
  /**
   * Flip the mark «chosen» on the picture behind a plate (W-12), or `undefined` — and then
   * `chosenInert` says why not. BOTH absent means the door is not part of this list at all: flats
   * are chosen by the bench slot, and a frozen version is a record — on those lists absence is the
   * truth, not an omission.
   */
  onToggleChosen?: (plate: DocumentPlate) => void;
  chosenInert?: string;
  /** A write of the mark is in flight — the doors wait for the band to answer. */
  chosenPending?: boolean;
  /** This segment is not what the sheet is made of — every plate says so on its own face. */
  offSheet?: boolean;
  /**
   * Белая подложка под линиями указаний. ПО РОДУ АРТЕФАКТА, а не по вкусу: на рендере и на кадре
   * турнтейбла чернильная линия тонет в пёстром снимке, и указание перестаёт быть видно ровно там,
   * где его поставили; на ШТРИХОВОМ флэте та же подложка перекрыла бы линии самого чертежа.
   */
  halo?: boolean;
}) {
  return (
    // РЯД С ПЕРЕНОСОМ, А НЕ СЕТКА КОЛОНОК. Ширину плиты теперь диктует сам снимок (высота задана,
    // пропорции его собственные), поэтому колонка фиксированной ширины либо резала бы широкий
    // чертёж, либо оставляла бы пустоту под узким. `items-start`: плиты разной высоты подвала не
    // растягивают друг друга.
    <div className='flex flex-wrap items-start gap-2'>
      {plates.map((plate, index) => {
        const drawable = canPlaceOn(plate);
        const mine = calloutsOf(plate.mediaId);
        const compound = plate.origin === 'bench' || plate.origin === 'run';
        const detachReason = !onDetach
          ? detachInert
          : plate.origin === 'bench'
            ? BENCH_PLATE_DETACH
            : plate.origin === 'run'
              ? 'this picture is not in the card’s media, so there is nothing here to take off'
              : null;

        return (
          // ШИРИНУ ПЛИТЫ ЗАДАЁТ КАДР, И ТОЛЬКО ОН. `w-0 min-w-full` на всём, что стоит над и под
          // кадром (идиома этого репозитория, ею же обёрнута легенда внутри поверхности): такой
          // ряд рисуется во всю ширину плиты, но в её СОБСТВЕННУЮ ширину не входит. Без этого
          // длинная строка дверей растягивала бы плиту шире её же картинки — у портретного
          // чертежа заметно, и ряд переставал бы читаться как ряд равных.
          <div
            key={plate.key}
            data-field={plate.door}
            className='w-fit max-w-full border border-borderColor p-1'
          >
            <div className='flex w-0 min-w-full items-baseline gap-1.5'>
              <Text
                size='nano'
                variant='uppercase'
                tracking='label'
                component='span'
                className='min-w-0 truncate'
              >
                {plate.name}
              </Text>
              {plate.origin === 'bench' && <Pill tone='mut'>bench</Pill>}
              {plate.origin === 'run' && <Pill tone='mut'>not on the card</Pill>}
              {plate.chosen && <Pill tone='ok'>chosen</Pill>}
              {/* THE PLATE SAYS IT ITSELF, not only the box above the grid. The warning is read
                  once, on arrival; the badge is on screen for as long as the picture is, and it is
                  what a person sees when they come back to this tab an hour later. */}
              {offSheet && <Pill tone='attention'>not on the sheet</Pill>}
              <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
                {mine.length || ''}
              </Text>
            </div>

            {/* КАДР — САМ СНИМОК: высота задана, ширина выведена из его пропорций (см. довод у
                `PLATE_FRAME_HEIGHT`). `preferNaturalAspect`: если сервер размеров не назвал, коробка
                переходит на пропорции ЗАГРУЖЕННОЙ картинки — тогда доли выносок честны и на таком
                медиа, а не «маркеры не рисуем», как было. */}
            <div className='mt-1'>
              <AnnotationSurface
                {...bindings}
                src={plateUrl(plate)}
                alt={plate.name}
                aspectRatio={plateAspect(plate)}
                preferNaturalAspect
                className='w-fit'
                frameClassName='w-auto'
                frameStyle={{ height: PLATE_FRAME_HEIGHT }}
                callouts={mine}
                selectedKey={selected == null ? null : String(selected)}
                frozen={!drawable}
                tool={drawable ? tool : null}
                onToolDone={onToolDone}
                onPlacedCountChange={drawable ? onPlacedCountChange : undefined}
                onAdd={
                  drawable
                    ? (shape, points, pen) => onAddCallout(plate.mediaId, shape, points, pen)
                    : undefined
                }
                legend
                halo={halo}
                // Читательский жест, живой и на выпущенной карточке: мерку и дугу на плите иначе
                // не разглядеть, а увеличение и есть способ их прочесть.
                cornerSlot={
                  <PlateCorner label={`zoom · ${plate.name}`} onPress={() => onZoom(index)}>
                    zoom
                  </PlateCorner>
                }
              />
            </div>

            {/* Только когда есть что сказать: пустая строка занимала бы полтора десятка пикселей
                под каждой плитой ради ничего. Размеры снимка отсюда ушли — их роль («доли честны»)
                исполняет теперь сам кадр, взявший пропорции картинки. */}
            {plate.note ? (
              <Text
                size='nano'
                variant='label'
                component='p'
                className='mt-1 w-0 min-w-full truncate'
              >
                {plate.note}
              </Text>
            ) : null}

            <div className='mt-1 flex w-0 min-w-full flex-wrap items-center gap-1'>
              {compound &&
                (onTakeIn ? (
                  /* СОСТАВНАЯ ДВЕРЬ (R-13), И ТЕПЕРЬ ОНА ОДНОТАКТНАЯ. Выноска адресует медиа
                     КАРТОЧКИ, поэтому рисованию предшествует взятие — но открывать после этого
                     нечего: плита рисует сама, и взятая картинка становится рабочей на месте.
                     Прежняя пара «взять + открыть модалку» и была дефектом T-20: модалка
                     разрешала свежий id через СОХРАНЁННУЮ карточку и не находила его. */
                  <Button
                    variant='secondary'
                    size='xs'
                    onClick={() => onTakeIn(plate)}
                    title='lists this picture in the card’s own media — from that moment a callout can be placed on it right here'
                  >
                    take in to draw on it ▸
                  </Button>
                ) : (
                  <InertDoor
                    label='take in to draw on it ▸'
                    reason='this card is read-only for you, or a frozen version is on screen — taking a picture onto the card is an edit of the card'
                  />
                ))}
              {!compound && !drawable && <InertDoor label='draw' reason={drawInert} />}
              {detachReason ? (
                <InertDoor label='detach' reason={detachReason} />
              ) : (
                <Button
                  variant='secondary'
                  size='xs'
                  onClick={() => onDetach?.(plate)}
                  title='take this picture off the sheet — the callouts on it go with it'
                >
                  detach
                </Button>
              )}
              {(onToggleChosen || chosenInert) &&
                (onToggleChosen && (plate.pictureId ?? 0) > 0 ? (
                  <Button
                    variant='secondary'
                    size='xs'
                    disabled={chosenPending}
                    onClick={() => onToggleChosen(plate)}
                    title={
                      plate.chosen
                        ? 'take the mark off — with none of this kind chosen, the segment lists everything again'
                        : 'mark as chosen — the segment narrows to the chosen ones of this kind'
                    }
                  >
                    {plate.chosen ? 'un-select' : 'select'}
                  </Button>
                ) : (
                  <InertDoor
                    label={plate.chosen ? 'un-select' : 'select'}
                    reason={
                      onToggleChosen
                        ? 'the picture behind this plate is not on the loaded page of the band — the mark is set on the picture, and this page does not carry it'
                        : chosenInert!
                    }
                  />
                ))}
            </div>
          </div>
        );
      })}

      {/* ПУСТОЙ КАДР И ЕСТЬ КНОПКА, КОТОРАЯ ЕГО ЗАПОЛНЯЕТ — тот же слот, что на листе эскиза и в
          мудборде. Кнопка «add a picture» в ряду органов ничего не говорила бы о том, что появится
          на её месте, а появляется ПЛИТА. Стоит только на флэтах: лист состоит из них, и рендер,
          положенный сюда руками, ушёл бы на бумагу под видом чертежа. */}
      {onAddPlate && (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          heightPx={PLATE_FRAME_HEIGHT}
          label='+ add a plate'
          purpose='technical sheet plate'
          allowMultiple
          showVideos={false}
          onSelect={onAddPlate}
          sizeClassName='w-auto max-w-[85vw]'
          className='shrink-0'
        />
      )}
    </div>
  );
}

/**
 * Орган в углу кадра. НЕ `<Button>`, а span с ролью: он живёт внутри общего `<fieldset disabled>`
 * выпущенной карточки, а у нативной кнопки под таким предком `click` не стреляет (замерено в
 * Chromium: гасятся ровно `click` и `focus`). Увеличение — единственный способ прочесть мерку на
 * плите, и делать его мёртвым на подписанной карточке значило бы закрыть чтение там, где только
 * чтение и осталось. Свои pointer-события орган гасит сам, иначе нажатие уходит в постановку.
 */
function PlateCorner({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      aria-label={label}
      title={label}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className='cursor-pointer border border-borderColor bg-bgColor px-1.5 py-px text-nano uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The callout panel — and ONE EDIT ON SCREEN AT A TIME, which is the invariant this component
 * exists to hold. Every row is a line; the selected one, and only it, opens its fields. Two open
 * editors on one sheet is how a person types into the wrong callout.
 *
 * ОДИН ВЫБОР НА ЭКРАН, И ЭТО НЕ СОВПАДЕНИЕ: `selected` — то же число, которым плита подсвечивает
 * свой маркер. Нажатие на строку открывает правку И зажигает выноску на картинке; нажатие на пин
 * открывает эту строку. Второе состояние выбора рядом с первым означало бы, что человек правит не
 * ту выноску, которую видит выделенной.
 *
 * WHAT IS WRITTEN HERE AND WHAT IS NOT.
 * Writes are LEAF writes on a dotted path — `callouts.3.description` — which is the same mechanism
 * the surface uses for the same fields. They touch no array identity, so they cannot desynchronise
 * the `useFieldArray` instances that other organs hold over `callouts`; the ROOT write
 * (`setValue('callouts', next)`) is the one that re-syncs them, and this panel needs it for exactly
 * one act — deleting a row — which is why deletion is handed in from the panel that owns the array.
 * ГЕОМЕТРИЯ (якоря, положение маркера) правится ЖЕСТОМ НА ПЛИТЕ, а не полем: доля кадра, набранная
 * с клавиатуры, — это координата, которую человек не видит.
 *
 * СПИСОК ПРИХОДИТ УЖЕ ОТФИЛЬТРОВАННЫМ (`sheetRows`, R-14): только выноски на плитах документа —
 * без открученных («unpinned») и без мудбордных. Каждая строка несёт СВОЙ индекс в полном массиве
 * `callouts`: leaf-запись `callouts.N.description` и `selected` адресуют по нему, и панель,
 * пересчитавшая индексы от видимого списка, писала бы текст в чужую выноску.
 */
function CalloutPanel({
  rows,
  plates,
  selected,
  onSelect,
  disabled,
  onRemove,
  onDemote,
  focusToken = 0,
}: {
  rows: { c: SheetCallout; index: number }[];
  plates: DocumentPlate[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  disabled?: boolean;
  /** Удалить выноску целиком, или `undefined` — и двери нет: на выпущенной карточке её и не должно быть. */
  onRemove?: (index: number) => void;
  /** Разжаловать фигуру в нумерованную точку, сохранив номер. */
  onDemote?: (index: number) => void;
  /**
   * Просьба поставить курсор в правку выбранной строки: растёт по жесту выбора на плите.
   *
   * СЧЁТЧИКОМ, А НЕ ФЛАГОМ, и это тот же довод, что у `EditorPanel` листа эскиза. Данные строки
   * приходят из `useWatch`, то есть новой ссылкой на каждую запись под формой: наводись фокус «при
   * изменении выбранного», он уезжал бы сюда из любого другого поля экрана после первого набранного
   * символа. Число меняется РОВНО в `onSelect`.
   */
  focusToken?: number;
}) {
  const form = useFormContext<TechCardFormData>();
  const plateName = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of plates) map.set(p.mediaId, p.name);
    return map;
  }, [plates]);

  // rows — ПАРЫ «выноска + её индекс В ФОРМЕ», а не отфильтрованный массив. Разница несущая:
  // запись идёт по `callouts.${index}`, и если бы сюда приехал просто отфильтрованный список,
  // индекс сместился бы на каждой скрытой строке — правка уехала бы в ЧУЖУЮ выноску молча.
  if (rows.length === 0) {
    return (
      <Text size='micro' variant='label' component='p'>
        none yet. A callout is placed on the picture itself — arm a kind under <b>draw</b> above and
        click a plate; the row appears here the moment it exists, and this is where its text is
        written.
      </Text>
    );
  }

  // ОДНА leaf-запись на все поля строки, включая оформление: путь `callouts.N.field` не трогает
  // идентичность массива, поэтому соседние читатели пути не рассинхронизируются.
  const write = (
    index: number,
    field: 'description' | 'part' | 'dimensions' | 'color' | 'dashed' | 'filled',
    value: string | boolean,
  ) => {
    form.setValue(`callouts.${index}.${field}` as never, value as never, { shouldDirty: true });
  };

  return (
    <div>
      {rows.map(({ c, index }) => {
        const open = selected === index;
        const anchored = (c.mediaId ?? 0) > 0;
        const where = anchored ? plateName.get(c.mediaId ?? 0) : null;
        return (
          <div key={index} className='border-b border-hairline py-1'>
            <div className='flex items-center gap-2'>
              <Text size='nano' variant='uppercase' component='span' className='w-5 shrink-0'>
                {c.number || '—'}
              </Text>
              <button
                type='button'
                onClick={() => onSelect(open ? null : index)}
                aria-expanded={open}
                className='min-w-0 flex-1 cursor-pointer text-left'
              >
                <Text size='micro' component='span' className='block truncate'>
                  {(c.description ?? '').trim() || (c.part ?? '').trim() || 'no text'}
                </Text>
              </button>
              {/* ОДНА ВЕТКА, И ЭТО НЕ УПРОЩЕНИЕ, А СЛЕДСТВИЕ. Сюда приезжает только `sheetRows` —
                  выноски, стоящие на плитах ДОКУМЕНТА, — поэтому «off the sheet» (мудбордные) и
                  «unpinned» (открученные) недостижимы по построению. Оставить их значило бы
                  держать на экране две ветки, которые никогда не исполнятся, и обещать людям
                  состояния, которых больше нет: владелец снял раздел «unpinned» прямым словом. */}
              {where ? <Pill tone='mut'>{where}</Pill> : null}
            </div>

            {open && (
              <CalloutEditRow focusToken={focusToken} index={index}>
                {/* CONTROLLED, NOT DEFAULT-VALUED, and the difference is a bug that would only
                    show up after a successful save. The page resets the form to what the SERVER
                    returned (`form.reset(settled.values)` — and the mint does the same), and an
                    uncontrolled field keeps whatever was typed into it: the screen would go on
                    showing a note the card no longer holds, with nothing saying so. The value is
                    read back through the same `useWatch` that feeds this list, so a draft restore
                    and an undo land here too. */}
                <Textarea
                  name={`artifacts-callout-${index}-description`}
                  value={c.description ?? ''}
                  disabled={disabled}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    write(index, 'description', e.target.value)
                  }
                />
                <div className='flex gap-1'>
                  <Input
                    name={`artifacts-callout-${index}-part`}
                    value={c.part ?? ''}
                    disabled={disabled}
                    placeholder='part'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      write(index, 'part', e.target.value)
                    }
                  />
                  <Input
                    name={`artifacts-callout-${index}-dimensions`}
                    value={c.dimensions ?? ''}
                    disabled={disabled}
                    placeholder='dimensions'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      write(index, 'dimensions', e.target.value)
                    }
                  />
                </div>
                {/* ЦВЕТ · ПУНКТИР · ШТРИХОВКА — ТОТ ЖЕ РЯД, ЧТО В РЕДАКТОРЕ ЭСКИЗА, а не второй
                    набор свотчей: указание красят одинаково, где бы оно ни стояло. Правка стиля
                    запоминается ПЕРОМ, поэтому следующая выноска родится тем же цветом — у
                    человека одна рука, и серия штрихов одним цветом не должна перекрашиваться
                    поштучно. */}
                {!disabled && (
                  <AnnotationStyleRow
                    kind={c.kind ?? 'pin'}
                    color={c.color ?? ''}
                    dashed={!!c.dashed}
                    filled={!!c.filled}
                    onColor={(v) => {
                      rememberPen({ color: v });
                      write(index, 'color', v);
                    }}
                    onDashed={(v) => {
                      rememberPen({ dashed: v });
                      write(index, 'dashed', v);
                    }}
                    onFilled={(v) => {
                      rememberPen({ filled: v });
                      write(index, 'filled', v);
                    }}
                  />
                )}
                <div className='flex flex-wrap items-center gap-1.5'>
                  {onRemove && (
                    <Button
                      variant='secondary'
                      size='xs'
                      onClick={() => onRemove(index)}
                      title='delete this callout — its number is never handed to another one'
                    >
                      delete
                    </Button>
                  )}
                  {/* РАЗЖАЛОВАТЬ ФИГУРУ В ТОЧКУ — единственный способ избавиться от неудачной
                      геометрии, СОХРАНИВ выноску: ручки ниже минимума точек не опускаются, а
                      «удалить и поставить заново» даёт новый номер, на который уже ссылаются
                      деталь, операция и дефект. */}
                  {onDemote && (c.kind ?? 'pin') !== 'pin' && (
                    <Button
                      variant='secondary'
                      size='xs'
                      onClick={() => onDemote(index)}
                      title='drop the drawn shape and keep the callout as a numbered pin — the number survives'
                    >
                      make it a pin
                    </Button>
                  )}
                  <Text size='nano' variant='label' component='span' className='normal-case'>
                    shape and position are dragged on the plate itself
                  </Text>
                </div>
              </CalloutEditRow>
            )}
          </div>
        );
      })}
      <Text size='micro' variant='label' component='p' className='mt-2'>
        The server takes a cut piece’s name from its callout text, and paper always prints these —
        the current ones, never a frozen copy. A deleted number leaves a hole; numbers are never
        reused.
      </Text>
    </div>
  );
}

/**
 * Раскрытая строка выноски: якорь для серверного отказа И место, куда приезжает курсор.
 *
 * ЯКОРЬ. `data-field` — канонный адрес этой выноски, и ЕДИНСТВЕННЫЙ: поверхность своего не
 * ставит, поэтому `revealField('callouts.N.description')` приходит именно сюда.
 *
 * КУРСОР. Ставится ТОЛЬКО по жесту выбора (счётчик меняется в `onSelect` поверхности), а не при
 * каждом изменении данных строки: значения приходят из `useWatch`, то есть новой ссылкой на каждую
 * запись под формой, — фокус, наведённый «по изменению», уезжал бы сюда из любого другого поля
 * экрана после первого набранного символа.
 */
function CalloutEditRow({
  focusToken,
  index,
  children,
}: {
  focusToken: number;
  index: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusToken === 0) return;
    ref.current?.querySelector<HTMLElement>('textarea, input')?.focus();
  }, [focusToken]);
  return (
    <div ref={ref} className='mt-1 space-y-1' data-field={`callouts.${index}.description`}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Nothing is drawn at all. Say what would make a sheet, and open the door to each thing. */
function EmptyDocument({
  bench,
  disabled,
  onAddPlate,
}: {
  bench: BenchSlots;
  disabled?: boolean;
  /** Положить на лист картинку из библиотеки. `undefined` — карточка только читается. */
  onAddPlate?: (items: common_MediaFull[]) => void;
}) {
  const { showMessage } = useSnackBarStore();
  return (
    <>
      <Text size='micro' variant='label' component='p'>
        Nothing is drawn on this card yet. A sheet is made of flats — put a drawing on it from the
        library below, or fill a bench slot in <b>STUDIO</b>, which the mint carries into the card’s
        own media. Callouts are placed on the plate itself, here, once one exists.
      </Text>
      {/* СЛОТ, А НЕ КНОПКА: на месте пустой рамки появится ПЛИТА, и рамка тех же пропорций про это
          и говорит. ⌘V и бросок файла слот принимает сам. */}
      {onAddPlate && (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          label='+ add a plate'
          purpose='technical sheet plate'
          allowMultiple
          showVideos={false}
          onSelect={onAddPlate}
          sizeClassName='w-[200px] max-w-[85vw]'
        />
      )}
      <div className='flex flex-wrap gap-1.5'>
        {SHEET_MINIMUM.map((view) => (
          <Button
            key={view}
            variant='secondary'
            size='sm'
            disabled={disabled}
            onClick={() =>
              openDoor(
                benchDoor({ viewKey: view }),
                `the ${VIEW_LABELS[view]} slot is on the bench`,
                showMessage,
              )
            }
          >
            {VIEW_LABELS[view]} slot {slotIsFilled(bench.byView.get(view)) ? '✓' : '✗'}
          </Button>
        ))}
      </div>
    </>
  );
}

/**
 * The version storey when there is no version.
 *
 * IT IS A PLATE, NOT AN EMPTY SECTION, AND THERE IS NO `SHEET v0`. A version numbered zero is a
 * sentence about a thing that does not exist; the truthful screen says versions arrive with the
 * mint and shows what the mint is waiting for. Every line is a door (Г10 — the lock used to name a
 * tab and offer no way to reach it).
 *
 * The two informational lines are informational on purpose: an uploaded plate states no fit of its
 * own and a mixed composition is legal with consent, so both are questions the mint ASKS rather
 * than conditions this list enforces. Marking them red would teach people that the list lies.
 */
function NoVersionsYet({
  bench,
  plates,
  disabled,
  onMint,
  say,
}: {
  bench: BenchSlots;
  plates: DocumentPlate[];
  disabled?: boolean;
  onMint: (origin: MintOrigin) => void;
  say: (m: string, t: 'error') => void;
}) {
  const analysis = useMemo(() => analyseMint(bench, []), [bench]);
  const missing = sheetMinimumMissing(bench);
  const ready = benchMinimumMet(bench);

  return (
    <Section
      title='versions'
      question='— none yet; a version arrives with the mint'
      action={
        <Button
          variant='main'
          size='sm'
          disabled={disabled || !ready}
          onClick={() => onMint('print')}
          title={ready ? undefined : 'the sheet minimum is not met'}
        >
          print — mints v1
        </Button>
      }
    >
      <Text size='micro' component='p'>
        Nothing has been minted. A version freezes <b>which pictures are on the sheet</b>, so that a
        printed page can name one composition and be checked against it later. Callouts are not part
        of that freeze — paper always prints the current ones — which is why a version is only ever
        born of an act: the first print or release mints v1.
        {plates.length > 0 && ' The document above is already usable and already prints.'}
      </Text>

      <div>
        <GroupLabel>what the mint needs</GroupLabel>
        {SHEET_MINIMUM.map((view) => {
          const filled = slotIsFilled(bench.byView.get(view));
          return (
            <div key={view} className='flex items-center gap-2 border-b border-hairline py-1'>
              <Text size='micro' component='span' className='min-w-0 flex-1'>
                {VIEW_LABELS[view]} slot
              </Text>
              <Text size='micro' variant='label' component='span'>
                {filled ? 'filled ✓' : 'empty ✗'}
              </Text>
              <Pill tone={filled ? 'ok' : 'warn'}>{filled ? 'ready' : 'blocks the mint'}</Pill>
              {!filled && (
                <Button
                  variant='secondary'
                  size='xs'
                  disabled={disabled}
                  onClick={() =>
                    openDoor(
                      benchDoor({ viewKey: view }),
                      `the ${VIEW_LABELS[view]} slot is on the bench`,
                      say,
                    )
                  }
                >
                  go to it
                </Button>
              )}
            </div>
          );
        })}
        <Row
          label={
            <Text size='micro' component='span'>
              fit on plates brought by hand
            </Text>
          }
          value={<Pill tone='mut'>asked at mint</Pill>}
        />
        {analysis.mixed && (
          <Row
            label={
              <Text size='micro' component='span'>
                mixed composition
              </Text>
            }
            value={<Pill tone='mut'>consent asked at mint</Pill>}
          />
        )}
      </div>

      {missing.length > 0 && (
        <Text size='micro' variant='label' component='p'>
          The bench is free to hold any view; the minimum lives here, at the mint — a sheet without{' '}
          {SHEET_MINIMUM.map((v) => VIEW_LABELS[v]).join(' and ')} is not a sheet somebody can cut
          from.
        </Text>
      )}
    </Section>
  );
}
