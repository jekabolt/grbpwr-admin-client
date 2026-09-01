import type {
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignPicture,
  common_MediaFull,
  common_TechCard,
  common_TechCardMediaKind,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
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
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { ViewSwitch } from 'ui/components/view-switch';

import type { AnnotationColor, AnnotationKind, TechCardFormData } from '../schema';
import { readBench, type BenchRead } from './bench-slot';
import { benchDoor, openDoor } from './doors';
import { VectorModal } from './modals';
// K-15 — ПЛИТКИ. Читатель ленты и раппорт прогона берутся у экрана паттернов: одно определение
// «что такое выход прогона-плитки» на панель и на сам экран, иначе сегмент `patterns` и вкладка
// PATTERN однажды разойдутся в составе и никто этого не заметит.
// ⚠ ИЗ `./pattern/model`, А НЕ ИЗ `./pattern`. Индекс папки тянет за собой сам экран, а тот —
// `../render` и `../generation` целиком; этой панели нужны две чистые функции без единого хука.
import { patternOutputs, repeatOfRun } from './pattern/model';
import { TILE_CORNER, TILE_QUIET } from './picture-tile';
import { provenanceLabel, readProvenance } from './provenance';
import {
  SELECT_MARK_NOT_STATED,
  outputsOfKind,
  pictureIsSelected,
  serverStatesSelected,
} from './render';
import { useDesignWrites } from './use-design-band';
import { SHEET_MIN_VIEWS, viewLabel } from './views';

/**
 * ARTIFACTS — the sheet of this card: its plates, and the callouts drawn on them.
 *
 * ═══ ОДИН ЭТАЖ, И РАНЬШЕ ИХ БЫЛО ДВА ══════════════════════════════════════════════════════════
 *
 * THE DOCUMENT. Плиты, которые держит карточка, и указания на них — правятся на любой существующей
 * карточке. Экрану не нужен ни отдельный RPC, ни верстак: он читает `technicalMedia` и `callouts`
 * прямо из формы, ровно так, как их сохраняет обычный Save. Именно это делает вкладку полезной
 * всему производству в день выката (`17` П-Ж): живая карточка приходит сюда с полными техническими
 * медиа и нарисованными указаниями, но с верстаком, которого никто не трогал, — и экран, начинающий
 * с верстака, сказал бы им всем «плит нет» и попросил бы заново загрузить файлы, которые у карточки
 * уже есть.
 *
 * ВТОРОГО ЭТАЖА — ВЕРСИЙ — БОЛЬШЕ НЕТ. Здесь стояли полоса версий, журнал выпусков, плита
 * расхождения и минт: лист замораживался в подписанную vN с дайджестом плит, а печать и релиз этот
 * минт порождали. Владелец снял всё это одной фразой: «PRINT — MINTS V1 вообще этот функционал не
 * нужен как и VERSIONS», и на прямой вопрос о глубине сноса — с названной ценой (уже выпущенные
 * подписанные листы, их дайджесты, ссылки из учёта медиа и записи в правах пропадают) — ответил:
 * «Снести целиком, включая бэкенд». Цена названа и принята.
 *
 * ЧТО ИЗ ЭТОГО СЛЕДУЕТ ДЛЯ ЧИТАЮЩЕГО ЭТОТ ФАЙЛ. Лист больше НЕ АРТЕФАКТ С ПОДПИСЬЮ, а живой
 * документ: то, что на экране, и есть то, что у карточки. Исчезло само различение «документ против
 * замороженной композиции», а с ним — состояние `inspecting`, ветки «только чтение, потому что на
 * экране версия» и вопрос «какая из двух правд поедет на бумагу». Ни одной ветки «а если смотрим
 * vN» ниже быть не должно: если такая появится, значит версии вернулись, а их нет.
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
   *             points at, and what prints.
   *   `bench` — a design bench slot. Editing it carries it into the card's media; until then it is
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
   * else is a detail). It is what `takeIntoCard` derives the media KIND from, so a bench view
   * carried onto the card is filed under the name its side already had rather than under a guess.
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
export type ArtifactKind = 'flat' | 'pattern' | 'render' | 'threed';

/**
 * ПОДСКАЗКИ СЕГМЕНТОВ — ЭТО ТОЖЕ ЗАЯВЛЕНИЕ О БУМАГЕ, и здесь стояло то же неверное «not part of
 * the sheet», что в коробке над рядом и на пилюле плиты. Лист — это медиа карточки, и тех-пак
 * печатает их все; рендер и кадр турнтейбла отличаются от флэта не судьбой, а тем, ЧТО они
 * показывают. Подсказка говорит про это, а не про несуществующий фильтр.
 */
export const ARTIFACT_KINDS: { value: ArtifactKind; label: string; hint: string }[] = [
  { value: 'flat', label: 'flats', hint: 'the drawings the floor sews from' },
  {
    // K-15, дословно: «паттерны можно будет сохранять и как мы делаем с фабрик рендерами и они так
    // же попадают в артифакты». Тем же жестом — пометкой `selected` — и в тот же ряд.
    value: 'pattern',
    label: 'patterns',
    hint: 'repeating tiles; print too, once they are in the card’s media',
  },
  {
    value: 'render',
    label: 'renders',
    hint: 'coloured over the flats; prints too, once it is in the card’s media',
  },
  {
    value: 'threed',
    label: '3D',
    hint: 'turntable frames; print too, once they are in the card’s media',
  },
];

/**
 * СТРИП ИЛИ СЕТКА. Одна ось, два значения, и разница между ними ровно одна: ряд прокручивается или
 * переносится. Всё остальное — кадр, органы, высота плиты — у обеих раскладок общее, потому что это
 * одни и те же плиты, показанные двумя способами, а не два разных экрана.
 *
 * `ViewSwitch`, А НЕ ЧИП: это «как я на это смотрю», то есть предпочтение, а не запись. Полоса из
 * двух сегментов сообщает ПОЛОЖЕНИЕ, тогда как одиночный чип сообщал бы цель — с открытой лентой он
 * читался бы «grid», и понять, где ты, можно было бы только по полотну под ним.
 */
export type PlateLayout = 'strip' | 'grid';

export const PLATE_LAYOUTS: { value: PlateLayout; label: string; hint: string }[] = [
  { value: 'strip', label: 'strip', hint: 'one row, scrolled sideways — the sheet read in order' },
  { value: 'grid', label: 'grid', hint: 'the same plates wrapped over several rows' },
];

export function artifactKindOf(
  mediaId: number,
  runKindByMedia: Map<number, string>,
  cardKind?: string,
): ArtifactKind {
  const fromRun = runKindByMedia.get(mediaId);
  if (fromRun === 'render') return 'render';
  if (fromRun === 'threed') return 'threed';
  /* ПЛИТКА ЧИТАЕТСЯ ПО ПРОГОНУ, И ФОЛБЭКА У НЕЁ НЕТ — как и у кадра турнтейбла: в словаре
     `TechCardMediaKind` нет члена «повторяемая плитка», и взятая на карточку она числится там
     `RENDER`. Отсюда два РАЗНЫХ случая, и путать их нельзя:
       · плитка, ВЗЯТАЯ НА КАРТОЧКУ, чей прогон ещё на загруженной странице ленты, остаётся в
         сегменте `patterns` — род прочитан с прогона, и `RENDER` на карточке до фолбэка не доходит.
         Замерено пробой `oncard=1`: без этой строки принятие плитки МОЛЧА переносило бы её к
         рендерам, то есть было бы наказанием за принятие;
       · плитка, ПРИНЕСЁННАЯ РУКАМИ (прогона нет вовсе) или пережившая свою страницу ленты, честно
         числится рендером — записать «это плитка» просто некуда. Дверь загрузки говорит об этом
         словами до нажатия (`addPlateNote`) и после (`addPlateFromLibrary`). */
  if (fromRun === 'pattern') return 'pattern';
  if (cardKind === 'TECH_CARD_MEDIA_KIND_RENDER') return 'render';
  return 'flat';
}

/** media id → the kind of the run that produced it, for every picture on the loaded page. */
export function runKindByMediaId(band: GetDesignBandResponse): Map<number, string> {
  const map = new Map<number, string>();
  for (const run of band.runs ?? []) {
    const kind = (run.kind ?? '').trim().toLowerCase();
    if (kind !== 'render' && kind !== 'threed' && kind !== 'flat' && kind !== 'pattern') continue;
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
  kind: 'pattern' | 'render' | 'threed',
  already: Set<number>,
): { plates: DocumentPlate[]; filteredToSelected: boolean; serverStates: boolean } {
  /* ПЛИТКИ БЕРУТСЯ СВОИМ ЧИТАТЕЛЕМ, А НЕ ЧЕРЕЗ `outputsOfKind`. Та функция сужена типом до
     `'render' | 'threed'`, и расширять её — правка файла соседней дорожки; `patternOutputs`
     повторяет её правило чтения дословно (род с ПРОГОНА, скрытые прочь, одна страница ленты) и
     живёт рядом со своим экраном. */
  const outputs = kind === 'pattern' ? patternOutputs(band) : outputsOfKind(band, kind);
  const serverStates = outputs.some((o) => serverStatesSelected(o.picture));
  const filteredToSelected = outputs.some((o) => pictureIsSelected(o.picture));
  const plates: DocumentPlate[] = [];
  for (const { picture, run } of outputs) {
    if (filteredToSelected && !pictureIsSelected(picture)) continue;
    const mediaId = picture.media?.id ?? 0;
    if (mediaId <= 0 || already.has(mediaId)) continue;
    already.add(mediaId);
    const view = (picture.ghostView ?? '').trim();
    /* У ПЛИТКИ НЕТ ВИДА ИЗДЕЛИЯ, И ВЫДУМЫВАТЬ ЕГО НЕЛЬЗЯ: она не сторона и не кадр поворота, а
       квадрат ткани. Её опознают по РАППОРТУ, потому что это единственное, чем две плитки одной
       карточки отличаются друг от друга на глаз в маленьком кадре. */
    const repeat = kind === 'pattern' ? repeatOfRun(run) : 0;
    plates.push({
      key: `run-${picture.id}`,
      name:
        kind === 'pattern'
          ? repeat
            ? `TILE ${repeat} MM`
            : `TILE ${picture.ordinal ?? plates.length + 1}`
          : viewLabel(view).toUpperCase() || `frame ${picture.ordinal ?? plates.length + 1}`,
      mediaId,
      media: picture.media,
      origin: 'run',
      chosen: pictureIsSelected(picture),
      pictureId: picture.id ?? 0,
      note:
        kind === 'pattern'
          ? `run ${run.id ?? '—'}${repeat ? ` · ${repeat} mm` : ' · no repeat stated'}`
          : `run ${run.id ?? '—'}${run.rrev ? ` · r${run.rrev}` : ''}`,
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
 * are not in that list, so a plate of theirs cannot carry a callout as it stands. R-13 is the reason
 * the door exists at all — «к любому артефакту можно делать все виды колаутов».
 *
 * ДВЕРЬ ЗОВЁТСЯ `take in` И ЖИВЁТ В ВЕРХНЕМ ПРАВОМ УГЛУ НА ХОВЕР (V-20, K-7). Имена этой двери шли
 * так: «take in to draw on it ▸» → `edit` → `take in`. Средний шаг снял МЕХАНИКУ из названия по
 * жалобе владельца («я не понимаю зачем она нужна»), но занял слово, которое ему понадобилось для
 * другого: круг K-7 — «в артифактс фабрик рендерс кнопка эдит должна открывать растр эдитор». Имя
 * `edit` ушло растровому редактору, а этой двери досталось имя её собственного действия.
 *
 * Сам шаг не выдуман и не убран: он есть цена, которую нельзя не заплатить, потому что выноска
 * физически адресует медиа карточки. Цена не спрятана — она в заголовке органа, который читалка
 * объявляет вместе с именем.
 *
 * ОДНОТАКТНАЯ, А НЕ СОСТАВНАЯ, С ТЕХ ПОР КАК ПЛИТА РИСУЕТ САМА. Дверь была парой «взять + открыть
 * редактор», и вторая половина была дефектом T-20: редактор разрешал свежий media_id через
 * СОХРАНЁННУЮ карточку, которая о нём ещё не знала. Открывать теперь нечего — взятая плита
 * становится рабочей на месте.
 *
 * ОТЦЕПИТЬ ВЕРСТАЧНУЮ ПЛИТУ ЗДЕСЬ ВСЁ РАВНО НЕЛЬЗЯ, и причина пережила снос минта: слот
 * продолжает держать картинку, а список плит собирается из верстака заново при каждом чтении
 * полосы (`documentPlates` ниже). Убранная отсюда плита вернулась бы на следующей же отрисовке —
 * то есть кнопка выглядела бы сломанной, хотя сработала. Дорога ПРОЧЬ с верстака одна: очистить
 * слот в STUDIO.
 */
const BENCH_PLATE_DETACH =
  'a bench plate is taken off by clearing its slot in STUDIO — dropped here it would come straight back';

/**
 * The view key of a bench slot → the card's media kind: front/back/sides by name, everything else a
 * detail. Одно отображение на весь экран: второе, отличающееся, означало бы, что одна и та же
 * картинка называет свой вид по-разному в зависимости от того, какой дверью её внесли, — и видно
 * это было бы в подписи самой плиты.
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
/**
 * ЗАНЯТ ЛИ СЛОТ. Локально, потому что после сноса минта у этой проверки на весь экран два читателя,
 * и оба здесь. Раньше она приезжала из `mint-dialog.tsx` — файла, который держал ВТОРУЮ, устаревшую
 * копию словаря видов (метка `SIDE L` против `side L` в `views.ts`). Копия умерла вместе с минтом;
 * заводить ради двух строк новый общий модуль значило бы завести третью.
 *
 * Оба условия обязательны: слот может ССЫЛАТЬСЯ на картинку, которую полоса не разрешила (страница
 * ленты, до которой чтение не дошло), и такая плита нарисовалась бы дырой без адреса.
 */
function slotIsFilled(slot?: common_DesignBenchSlot | null): boolean {
  return !!slot && (slot.pictureId ?? 0) > 0 && !!slot.picture;
}

export function documentPlates(
  formMedia: { mediaId?: number; kind?: string }[],
  resolved: Map<number, common_MediaFull>,
  bench: BenchRead,
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

  // Стороны идут в порядке `views.ts` (перед, спинка, бока), детали — за ними, как их отдала
  // полоса. `readBench` уже разложил их именно так, поэтому порядок здесь не назначается заново.
  const benchSlots = [...bench.sides.map((s) => s.slot), ...bench.details];
  for (const slot of benchSlots) {
    if (!slotIsFilled(slot)) continue;
    const media = slot!.picture?.media;
    const mediaId = media?.id ?? 0;
    if (mediaId <= 0 || seen.has(mediaId)) continue;
    seen.add(mediaId);
    const view = (slot!.viewKey ?? '').trim();
    plates.push({
      key: `bench-${slot!.id}`,
      name: (slot!.detailName ?? '').trim() || viewLabel(view).toUpperCase() || 'detail',
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
  const { showMessage } = useSnackBarStore();
  // The SAME cache entry the page reads and re-primes after every save. Not a second fetch.
  const { data: card } = useTechCard(techCardId);
  // The band's ONE write seam — the same `setPictureSelected` the studio's outputs strips call.
  // A second way to write the mark is exactly what must not exist; a second DOOR to the one way is
  // what W-14 asks for: the choice is consumed here, so it can be amended here.
  const { setPictureSelected } = useDesignWrites(techCardId);

  // `SheetCallout` (z.input строки формы), а НЕ узкий CalloutLike: плиты теперь РИСУЮТ фигуру
  // выноски (kind/points/dashed/filled/color), и тип обязан нести её, иначе каст компилируется, а
  // превью молча теряло бы дуги и мерки: каст скомпилировался бы, а фигура пропала.
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
    for (const slot of [...bench.sides.map((s) => s.slot), ...bench.details]) {
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

  /**
   * ═══ media id → КАРТИНКА ПОЛОСЫ, ДЛЯ РАСТРОВОГО РЕДАКТОРА (K-7) ═════════════════════════════
   *
   * `VectorModal` живёт от МЕДИА: и слой (`base_media_id`), и склейка растра адресуются им, а не
   * картинкой. Значит редактор открылся бы и от одной `plate.media`. Картинка полосы нужна ему для
   * другого — чтобы НАЗВАТЬ основу вслух: `run 5 · b` в пилюле «base», провенанс рядом с ней и имя
   * файла в выгрузке SVG. Без неё модалка честно, но бесполезно скажет «upload · a» о картинке,
   * которая приехала из прогона 5.
   *
   * ЗАЧЕМ ОТДЕЛЬНАЯ КАРТА, ЕСЛИ РЯДОМ УЖЕ ЕСТЬ `resolved`. Та отображает id → МЕДИА и намеренно
   * собрана из четырёх источников, включая сохранённую карточку и библиотеку, — там картинок
   * полосы нет вовсе. Эта собирается только из полосы, потому что только полоса и знает про
   * прогоны и штампы.
   */
  const bandPictureOfMedia = useMemo(() => {
    const map = new Map<number, common_DesignPicture>();
    for (const run of band.runs ?? []) {
      for (const picture of run.pictures ?? []) {
        const id = picture.media?.id ?? 0;
        if (id > 0 && !map.has(id)) map.set(id, picture);
      }
    }
    // Плита верстака — та же картинка полосы, просто добравшаяся до слота. Её прогона на
    // загруженной странице может уже не быть, а сама она приезжает объектом внутри слота.
    for (const slot of [...bench.sides.map((s) => s.slot), ...bench.details]) {
      const picture = slot?.picture;
      const id = picture?.media?.id ?? 0;
      if (id > 0 && !map.has(id)) map.set(id, picture!);
    }
    return map;
  }, [band.runs, bench]);

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
    const patternBand = bandPlates(band, 'pattern', new Set(onCard));
    const renderBand = bandPlates(band, 'render', new Set(onCard));
    const threedBand = bandPlates(band, 'threed', new Set(onCard));
    return {
      flat: { plates: mark(flat), filteredToSelected: false, serverStates: true },
      // K-15 — ПЛИТКИ ПОПАДАЮТ СЮДА ТЕМ ЖЕ ПУТЁМ, ЧТО РЕНДЕРЫ: сначала те, что уже в медиа
      // карточки, потом помеченные `selected` из ленты. Сужение до помеченных — то же правило и
      // ПО РОДУ: вердикт «эта плитка» ничего не говорит о том, какой рендер выбран.
      pattern: {
        plates: mark([...plates.filter((p) => of(p) === 'pattern'), ...patternBand.plates]),
        filteredToSelected: patternBand.filteredToSelected,
        serverStates: patternBand.serverStates,
      },
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
  /** Which representation is on screen. `flat` is the default because the SHEET is made of flats. */
  const [kind, setKind] = useState<ArtifactKind>('flat');
  /**
   * СТРИП ИЛИ СЕТКА — раскладка ряда плит. Владелец (V-20): «медиа должны отображаться стрипом и с
   * возможностью грида».
   *
   * СТРИП ПО УМОЛЧАНИЮ, и это не вкусовое: лист читают по сторонам — перед, спинка, бока, детали —
   * то есть КАК РЯД, и горизонтальная лента держит этот порядок одной строкой, не разрывая его на
   * произвольном по ширине окна месте. Сетка нужна другому жесту: «покажи всё сразу», когда плит
   * стало больше десятка и нужно найти одну.
   */
  const [layout, setLayout] = useState<PlateLayout>('strip');
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
  /**
   * Плита, открытая в РАСТРОВОМ РЕДАКТОРЕ (K-7). Плита, а не флаг: редактор стоит НАД конкретной
   * картинкой, и один булев флаг на панель означал бы, что открытие второй плиты молча меняет
   * предмет правки. Тот же довод и то же решение, что у плитки истории генераций.
   */
  const [rasterOn, setRasterOn] = useState<DocumentPlate | null>(null);

  const segment = segments[kind];
  const onScreen = segment.plates;

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
   * ДВЕ ПРИЧИНЫ, И КАЖДАЯ НАЗЫВАЕТ СЕБЯ. Мёртвая дверь обязана говорить СВОЮ причину: одно общее
   * «нельзя» читалось как «экран собран без редактора», то есть как поломка сборки вместо
   * состояния карточки.
   *
   * Третьей причиной была «на экране версия vN, она только для чтения». Версий больше нет, и ветка
   * ушла вместе с ними — а не потому, что её сочли редкой.
   */
  const drawInert = disabled
    ? 'the card is released: its sheet is frozen, and a callout is an edit of it'
    : 'the form’s undo history was not handed to this screen, and a gesture without an undo is not one to offer';

  /**
   * ПРИЧИНЫ ДВУХ МЁРТВЫХ ДВЕРЕЙ ВЫПУЩЕННОЙ КАРТОЧКИ, И ОНИ РАЗНЫЕ (K-7). «Взять к себе» правит
   * СПИСОК медиа карточки; «править» заводит НОВУЮ картинку. Одно общее «карточка только для
   * чтения» на обеих дверях читалось бы как одна запертая дверь, показанная дважды.
   */
  const takeInInert = 'this card is read-only for you — taking a picture onto the card is an edit of the card';
  const editInert =
    'this card is read-only for you — a drawing is filed as a new picture, and that is an edit of the card';

  /**
   * Ставить указание можно ТОЛЬКО на плиту, которая уже числится в медиа карточки: `media_id`
   * выноски адресует именно этот список. Верстачная плита и выход прогона сперва берутся в
   * карточку — одним нажатием на своей плите, — и с этого мгновения рисуются здесь же.
   */
  const canPlaceOn = (plate: DocumentPlate) => !disabled && canDraw && plate.origin === 'card';
  /** Панель видов имеет смысл, только если на экране есть хоть одна такая плита. */
  const drawableHere = !disabled && canDraw && onScreen.some(canPlaceOn);

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

  const detachInert = 'the card is released: its sheet is frozen';

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
    // ЧТО ГОВОРИТСЯ ЧЕЛОВЕКУ. Здесь стояло «it is not on the technical sheet, and callouts drawn
    // on it are not either» — неправда: печать берёт `technicalMedia` целиком, и внесённая плита
    // уходит на страницу технического эскиза вместе со своими выносками. Сообщение называет
    // приобретённое СЛЕДСТВИЕ, потому что именно оно тут решается, а не «положил в список».
    showMessage(
      plate.origin === 'bench'
        ? 'taken into the card’s media as its bench view — you can draw on it now'
        : 'taken into the card’s media: it prints on the tech pack’s technical sketch page, with any callout you draw on it',
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
   * ВИД БЕРЁТСЯ У ПРЕДСТАВЛЕНИЯ, КОТОРОЕ СЕЙЧАС НА ЭКРАНЕ (V-20 г). Владелец: «так же должн быть
   * возможность загрузить свой флет, рендер или 3д если мы не хотим генерировать их в нашем туле».
   * Человек стоит в сегменте и кладёт файл ИМЕННО ТУДА — это и есть его заявление о роде, и
   * спрашивать второй раз было бы переспрашиванием уже сказанного.
   *
   * ФЛЭТ — `DETAIL`, и это не догадка, а признание: библиотека не знает, перед это или спинка.
   * РЕНДЕР И 3D — оба `RENDER`, потому что в словаре карточки НЕТ члена для кадра турнтейбла, а
   * `RENDER` по контракту и значит «принятая картинка прогона, уходящая с карточкой».
   *
   * ═══ И ИМЕННО ЗДЕСЬ ТЕРЯЛСЯ РУЧНОЙ 3D-КАДР ═════════════════════════════════════════════════
   *
   * Прежний довод говорил: «сегмент читается по прогону-родителю, а не по этой метке». У картинки,
   * загруженной РУКАМИ, прогона-родителя нет вовсе — её никто не генерировал. Значит
   * `artifactKindOf` доходит до фолбэка по карточке, читает `RENDER` и кладёт кадр в сегмент
   * `renders`. Человек стоял в 3D, нажал «+ add a 3D frame», выбрал файл — и плита не появлялась
   * НИГДЕ на экране: ряд 3D оставался пустым и печатал «nothing of this kind». Молча.
   *
   * ЧИНИТСЯ НЕ ПОДПОРКОЙ, А ПРИЗНАНИЕМ. Записать «это турнтейбл» некуда: в словаре медиа карточки
   * такого члена нет, и сессионная памятка в панели протухла бы первым же сохранением, унеся кадр
   * в другой сегмент уже без всякого повода. Поэтому дверь перестаёт обещать несуществующее:
   * плита кладётся туда, где действительно окажется, экран ТУДА ЖЕ и переключается, и человеку
   * говорят, куда и почему. Слот в ряду 3D называет цену ещё до нажатия (`addPlateNote`).
   *
   * ПОВТОРНАЯ ЗАГРУЗКА ТОГО ЖЕ ФАЙЛА ТОЖЕ ПЕРЕСТАЛА БЫТЬ МОЛЧАНИЕМ: `return` без единого слова
   * читался как сломанная кнопка, хотя всё было правильно.
   */
  function addPlateFromLibrary(items: common_MediaFull[]) {
    const media = form.getValues('technicalMedia') ?? [];
    const have = new Set(media.map((m) => m.mediaId ?? 0));
    const fresh = items.filter((it) => it.id != null && !have.has(it.id));
    if (!fresh.length) {
      showMessage(
        items.length === 1
          ? 'that picture is already on the sheet — nothing was added'
          : 'every one of those pictures is already on the sheet — nothing was added',
        'error',
      );
      return;
    }
    const uploadedKind: common_TechCardMediaKind =
      kind === 'flat' ? 'TECH_CARD_MEDIA_KIND_DETAIL' : 'TECH_CARD_MEDIA_KIND_RENDER';
    setPicked((prev) => [...prev, ...fresh]);
    form.setValue(
      'technicalMedia',
      [
        ...media,
        ...fresh.map((it) => ({
          mediaId: it.id as number,
          kind: uploadedKind,
          caption: '',
        })),
      ],
      { shouldDirty: true },
    );
    // ГДЕ ПЛИТА ОКАЖЕТСЯ — читается ТЕМ ЖЕ правилом, каким читается любая другая плита экрана.
    // Второе, «для загруженных», правило разошлось бы с первым на первой же правке.
    const lands = artifactKindOf(fresh[0].id as number, runKinds, uploadedKind);
    if (lands !== kind) {
      setKind(lands);
      showMessage(
        // ЧТО ИМЕННО ЛЕГЛО НЕ ТУДА — НАЗЫВАЕТСЯ ТЕМ СЛОВОМ, КОТОРОЕ ЧЕЛОВЕК ВЫБРАЛ САМ. Фраза была
        // прибита к «turntable frame», и с появлением сегмента плиток она стала бы врать: человек
        // кладёт файл в PATTERNS, а ему отвечают про поворотный стол. У словаря медиа карточки нет
        // члена ни для того, ни для другого — и это две разные новости, а не одна.
        `the card’s media has no kind for ${kind === 'pattern' ? 'a repeating tile' : 'a turntable frame'}, so this one is filed as a render — it is listed under ${ARTIFACT_KINDS.find((k) => k.value === lands)?.label ?? lands}, and it prints like any other plate`,
        'success',
      );
    }
  }

  /* ═══ `download SVG` И «replace the sheet with a file ▸» СНЯТЫ (V-21) ══════════════════════
   *
   * Владелец дословно: «DOWNLOAD SVG в THE SHEET не нужна как и REPLACE THE SHEET WITH A FILE ▸
   * мы туда можем просто загрузить свои файлы какие захотим».
   *
   * Обе двери отвечали на один вопрос — «а если лист надо собрать не нашим инструментом» — и обе
   * отвечали на него ОБХОДНЫМ путём: одна выгружала лист наружу, вторая объясняла процедуру
   * подмены картинки под выносками. Прямой ответ появился в V-20 (г): свой флэт, рендер или 3D
   * кладут прямо в ряд плит слотом «+ add …». Дверь, объясняющая обход, при живой прямой дороге —
   * это не подстраховка, а второй, худший способ, который кто-то однажды выберет.
   *
   * Вместе с выгрузкой ушёл и `sheet-svg.tsx` целиком: он существовал ровно ради этой кнопки.
   */

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
      <SectionStack row>
        <Section
          title='the sheet'
          question='— the document as it stands; every change here is saved by the card’s own Save'
          className='min-w-0 flex-1'
        >
          {/* ОБА ПЕРЕКЛЮЧАТЕЛЯ — `lead`, И ОНИ ОТВЕЧАЮТ НА РАЗНЫЕ ВОПРОСЫ. «Representation» —
              ЧТО показано (флэт, рендер, 3D); «layout» — КАК показано (лентой или сеткой).
              Стоят рядом, потому что оба относятся к ряду под ними, а не к блоку целиком;
              правый край шапки, где раньше жили чипы версий, теперь свободен и пуст. */}
          <GroupLabel
            flush
            lead={
              <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
                <ViewSwitch<ArtifactKind>
                  label='representation'
                  value={kind}
                  options={ARTIFACT_KINDS}
                  onChange={setKind}
                />
                <ViewSwitch<PlateLayout>
                  label='layout'
                  value={layout}
                  options={PLATE_LAYOUTS}
                  onChange={setLayout}
                />
              </div>
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

          {/* ═══ ЗДЕСЬ СТОЯЛА КОРОБКА `SheetMembershipWarning`, И ЕЁ СНЯЛИ НАСОВСЕМ (K-5) ═══════
              Владелец, четвёртым кругом: «этот текст полностью убери». Абзац объяснял устройство
              («всё из медиа карточки уезжает на фабрику») и поведение отбора («выбрано ничего —
              показывается всё»). Ни то, ни другое не потеряно, и НИ ОДНО из этого не вернётся
              сюда прозой: каждый факт живёт на органе, который его касается.

                печать        → пилюля `on paper` на самой плите карточки (свой `title`) и подсказки
                                сегментов в `ARTIFACT_KINDS` («prints too, once it is in the card’s
                                media»);
                состав списка → строка справа от заголовка ряда: `· the chosen ones` против
                                `· everything on this page`;
                путь туда     → `title` живой метки `select` («the segment narrows to the chosen
                                ones of this kind»);
                путь обратно  → `title` метки `un-select` («with none of this kind chosen, the
                                segment lists everything again») — единственное неочевидное
                                поведение отбора, и оно объяснено ровно на том органе, который его
                                вызывает;
                старый сервер → причина погашенной метки (`SELECT_MARK_NOT_STATED`).

              Абзац над рядом читают один раз и потом перестают видеть; заголовок органа читают
              тогда, когда рука уже на органе. */}

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

          {onScreen.length === 0 && kind === 'flat' ? (
            <EmptyDocument
              bench={bench}
              disabled={disabled}
              onAddPlate={!disabled ? addPlateFromLibrary : undefined}
            />
          ) : (
            <>
              {/* ПУСТОЙ СЕГМЕНТ ГОВОРИТ, ОТКУДА БЕРУТСЯ ЕГО КАРТИНКИ, И ОСТАВЛЯЕТ РЯД НА МЕСТЕ.
                  Раньше здесь стояла ТОЛЬКО эта строка, вместо ряда целиком, — и вместе с рядом
                  исчезала дверь загрузки. То есть на карточке без единого рендера положить свой
                  рендер было нельзя вовсе, ровно вопреки V-20 (г) («если мы не хотим генерировать
                  их в нашем туле»): отсутствие генерации и было тем случаем, ради которого дверь
                  просили. Теперь ряд рисуется всегда, и в пустом сегменте он состоит из одного
                  добавляющего слота. */}
              {onScreen.length === 0 && (
                <Text size='micro' variant='label' component='p'>
                  nothing of this kind on the loaded page of the band.{' '}
                  {kind === 'render'
                    ? 'A fabric render is made on STUDIO, from the flats standing in the bench slots.'
                    : kind === 'pattern'
                      ? 'A repeating tile is made on STUDIO → PATTERN, out of one picture; the ones you mark as chosen there are listed here.'
                      : 'A turntable is made on STUDIO, and it turns the renders — so the renders come first.'}{' '}
                  Or put your own file straight into the slot below.
                </Text>
              )}
              <PlateGrid
                plates={onScreen}
                layout={layout}
                calloutsOf={calloutsOfPlate}
                selected={selected}
                canPlaceOn={canPlaceOn}
                tool={tool}
                onToolDone={() => setTool(null)}
                onPlacedCountChange={setPlaced}
                onAddCallout={addCalloutOn}
                bindings={surfaceBindings}
                onZoom={setZoomAt}
                /* ДВЕРЬ ЗАГРУЗКИ СТОИТ ВО ВСЕХ ТРЁХ ВИДАХ (V-20 г) — см. довод у
                   `addPlateFromLibrary`: род принесённого файла берётся у вида на экране. */
                onAddPlate={!disabled ? addPlateFromLibrary : undefined}
                addPlateLabel={
                  kind === 'flat'
                    ? '+ add a flat'
                    : kind === 'render'
                      ? '+ add a render'
                      : kind === 'pattern'
                        ? '+ add a tile'
                        : '+ add a 3D frame'
                }
                /* ЦЕНА НАЗВАНА ДО НАЖАТИЯ, А НЕ ПОСЛЕ. Словарь медиа карточки не знает кадра
                   турнтейбла, поэтому принесённый сюда файл числится рендером и покажется среди
                   рендеров. Сказать это тостом ПОСЛЕ выбора — значит дать человеку удивиться;
                   строка стоит на самом слоте, в уже зарезервированном под подпись месте. */
                addPlateNote={
                  kind === 'threed'
                    ? 'filed as a render: the card has no 3D kind'
                    : kind === 'pattern'
                      ? 'filed as a render: the card has no tile kind'
                      : undefined
                }
                onDetach={!disabled ? askDetach : undefined}
                detachInert={detachInert}
                /* ═══ ДВЕ ДВЕРИ, КОТОРЫЕ РАНЬШЕ БЫЛИ ОДНОЙ (K-7) ══════════════════════════════
                   `edit` открывает РАСТРОВЫЙ РЕДАКТОР — слова владельца: «в артифактс фабрик
                   рендерс кнопка эдит должна открывать растр эдитор». Прежний акт этой двери
                   (внести картинку в медиа карточки) никуда не делся и не мог: `media_id` выноски
                   адресует медиа КАРТОЧКИ, и без этого шага на рендере полосы указание не
                   поставить вовсе. Он переехал в свой орган — `take in`, в верхний правый ряд, к
                   `✕`: обе двери про ОДНО И ТО ЖЕ — состоит ли картинка в медиа карточки, — и
                   стоять они обязаны на одной оси. */
                onEdit={!disabled ? setRasterOn : undefined}
                editInert={editInert}
                onTakeIn={!disabled ? takeIntoCard : undefined}
                takeInInert={takeInInert}
                /* THE MARK'S DOOR RIDES ONLY THE NON-FLAT LISTS. A flat is chosen by standing in a
                   bench slot, not by the mark, so a select door there would be a second registry of
                   one election. */
                onToggleChosen={
                  kind !== 'flat' && !disabled && segment.serverStates
                    ? (plate) =>
                        setPictureSelected.mutate({
                          pictureId: plate.pictureId ?? 0,
                          selected: !plate.chosen,
                        })
                    : undefined
                }
                chosenInert={
                  kind === 'flat'
                    ? undefined
                    : disabled
                      ? 'the card is read-only for you — the mark is an edit of the card'
                      : SELECT_MARK_NOT_STATED
                }
                chosenPending={setPictureSelected.isPending}
                sayPrints={kind !== 'flat'}
                halo={kind !== 'flat'}
              />
            </>
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
            disabled={disabled}
            onRemove={!disabled ? removeCalloutAt : undefined}
            onDemote={!disabled ? demoteCalloutAt : undefined}
            focusToken={focusEditor}
          />
        </Section>
      </SectionStack>

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
          halo={kind !== 'flat'}
          readOnlyNote={
            canPlaceOn(onScreen[zoomAt]) ? undefined : (
              <Text size='micro' variant='label' component='span'>
                {onScreen[zoomAt].origin === 'card'
                  ? drawInert
                  : 'this picture is not in the card’s media yet — press take in on its plate, and it becomes drawable here'}
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

      {/* ═══ РАСТРОВЫЙ РЕДАКТОР ПЛИТЫ (K-7) ═══════════════════════════════════════════════════════
          Тот же `VectorModal`, что открывает `edit` на плитке истории генераций и на плите
          верстака, — не второй редактор, а ОДИН, вызванный с третьего экрана. Второй означал бы
          два набора кистей, две истории отката и две трактовки «сохранить».

          МОНТИРУЕТСЯ ТОЛЬКО РАСКРЫТЫМ: редактор тянет слой и растр, и десяток спящих копий по
          числу плит на ленте — это десяток лишних деревьев ради одной открытой.

          `slot` НЕ ПЕРЕДАЁТСЯ: плита листа — не слот верстака, и результат правки никуда не обязан
          вставать. Он рождается сиблингом основы (наследует её `run_id` или `batch_id`) и попадает
          в историю генераций или на полку загрузок — туда же, куда попадает правка из тех мест.
          Положить его на ЭТОТ лист — отдельное решение, и оно принимается дверью `take in`. */}
      {rasterOn && (
        <VectorModal
          open
          onOpenChange={(open) => !open && setRasterOn(null)}
          techCardId={techCardId}
          band={band}
          base={bandPictureOfMedia.get(rasterOn.mediaId) ?? plateAsPicture(rasterOn)}
          slot={null}
          disabled={disabled}
        />
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
 * ПЛИТА, У КОТОРОЙ КАРТИНКИ ПОЛОСЫ НЕТ ВОВСЕ, — КАК ОСНОВА РЕДАКТОРА (K-7).
 *
 * Такие плиты обычны: файл, положенный на лист из библиотеки, и медиа карточки, чей прогон давно
 * ушёл с загруженной страницы полосы. Растровому редактору этого достаточно — и слой, и склейка
 * адресуются по `base_media_id`, — но НАЗВАТЬ такую основу нечем.
 *
 * ⚠ НИ ОДНО ПОЛЕ НЕ ВЫДУМЫВАЕТСЯ. Соблазн написать `sourceClass: 'uploaded'` силён и ложен: про
 * файл из библиотеки мы знаем ровно то, что он лежит в медиа карточки, а не то, кто его сделал.
 * `readProvenance` от пустого класса отвечает `unknown`, и подпись основы честно говорит «не
 * читается» вместо уверенной неправды о происхождении.
 */
function plateAsPicture(plate: DocumentPlate): common_DesignPicture {
  return {
    id: plate.pictureId,
    techCardId: undefined,
    media: plate.media,
    runId: undefined,
    batchId: undefined,
    ordinal: undefined,
    kind: undefined,
    ghostView: undefined,
    compositeViews: undefined,
    derivedFrom: undefined,
    sourceClass: undefined,
    mixedInput: undefined,
    layerRev: undefined,
    hiddenAt: undefined,
    hiddenBy: undefined,
    createdAt: undefined,
    selected: undefined,
  };
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
 *
 * ⚠ ЭТО ВЫСОТА КАДРА, А НЕ ПЛИТЫ, И РАЗНИЦА СТОИЛА ДЕФЕКТА. Слоту «+ add …» передавали ровно её —
 * и слот вставал на 120 пикселей ниже соседей, потому что плита это ещё и строка заголовка, и
 * коробка легенды, и строка подписи, и поля. Замерено: плита 521.5, слот 400. Теперь слот несёт
 * ТУ ЖЕ СКЕЛЕТНУЮ РАЗМЕТКУ, что и плита (`AddPlateTile`), поэтому равенство держится по
 * построению, а не совпадением чисел, и переживает правку любой из четырёх строк.
 *
 * ═══ 400 → 520: ПОДБОРОДОК ОТДАН КАРТИНКЕ (K-2/K-4) ═══════════════════════════════════════════
 *
 * Владелец, дословно: «карточка флета имеет большой пустой подбородок зачем он там нужен не
 * понятно вообще зачем там эта рамка сделай высоту картинок больше в этом больше смысла так
 * удобнее на них смотреть и делать пометки а не на пустой подбородок под картинкой».
 *
 * ЗАМЕРЕНО ДО (`tmp/dsgprobe/k-measure.mjs`, обе темы, оба сегмента): плита 330×528, картинка
 * 318×398 — то есть КАРТИНКЕ ДОСТАВАЛОСЬ 75.4% ВЫСОТЫ. Над кадром 30px (рамка + поля + строка
 * заголовка), под кадром 100px (72px коробки легенды + 14px строки подписи + поля + вторая
 * рамка). Из этих 100 пикселей на типичной плите ЗАНЯТО НОЛЬ: легенда пуста, пока на плите нет
 * пинов, а провенанс несёт только верстачная плита.
 *
 * ПОЧЕМУ ЧИСЛО ВЫРОСЛО РОВНО НА ТО, ЧТО СНЯТО. Плита не должна занять на экране больше места —
 * её просили не увеличить, а перестать тратить. 528 − 8 (поля снятой рамки) = 520: тот же
 * след в раскладке, вся высота у снимка. Это и есть ответ на «зачем там эта рамка»: внешняя
 * граница дублировала границу самого кадра (`AnnotationSurface` рисует свою), а 4px между ними
 * были единственным, что эти две линии разделяло.
 */
const PLATE_FRAME_HEIGHT = 520;

/**
 * ПОТОЛОК ЛЕГЕНДЫ ПИНОВ — `max-h`, А НЕ `h`, И ЭТО ВЕСЬ K-2 СО СТОРОНЫ ЛЕГЕНДЫ.
 *
 * Было `h-[72px]`: коробка занимала свои 72 пикселя ВСЕГДА, в том числе на плите без единого пина,
 * — и это и был «пустой подбородок». Довод, ради которого её завели (V-20, «все карточки должны
 * быть одной высоты всегда»), при этом никуда не делся, но он держится не здесь: ряд плит — это
 * flex с `items-stretch`, и коробки соседей выравниваются по самой высокой сами. Резерв высоты
 * ПОД КАЖДОЙ плитой ради выравнивания был платой за то, что flex делает бесплатно.
 *
 * `PinLegend` возвращает `null` при нуле пинов, поэтому на обычной плите обёртка пуста и стоит
 * ноль. Потолок остаётся, чтобы плита с десятью выносками не тянула ряд: сверх четырёх строк
 * легенда прокручивается внутри себя.
 *
 * РОСТ НАЗНАЧАЕТСЯ ЛЕГЕНДЕ, А НЕ ВСЕЙ ПОДКАДРОВОЙ КОЛОНКЕ. Он стоял на `chromeClassName`, то есть
 * на коробке, которая держит ещё и ряд «done · N / cancel» — единственный способ закончить
 * мультивыноску или замкнуть зону пальцем. С заполненной легендой этот ряд уезжал под нижний край
 * скроллера: на планшете, где Enter недоступен, жест становился незавершаемым.
 */
const PLATE_LEGEND_BOX = 'max-h-[72px]';

/**
 * ШАПКА ПЛИТЫ — ТЕПЕРЬ НАКЛАДКА НА КАДРЕ, А НЕ СТРОКА НАД НИМ.
 *
 * Имя, пилюли и число выносок стояли отдельной строкой (`min-h-5` + `mt-1` = 24px над снимком).
 * Владелец просил высоту снимку; строка, которая ничего не рисует поверх картинки, но забирает у
 * неё место, — та же трата, что и подбородок, только сверху.
 *
 * ЗАКОН УГЛОВ УЖЕ НАПИСАН, И ОН ЗДЕСЬ ТОТ ЖЕ, ЧТО У `PictureTile`: ярлык — В ЛЕВОМ ВЕРХНЕМ УГЛУ
 * кадра, прозрачный для указателя, чтобы не отнимать поверхность у постановки указания. Владелец
 * уже платил за расхождение («нахуя ты делаешь везде по разному»), поэтому координаты берутся из
 * примитива, а не изобретаются: `left-1 top-1`, как у `badge` плитки.
 *
 * ⚠ НЕПРОЗРАЧНАЯ ПОДЛОЖКА ОБЯЗАТЕЛЬНА. У `Pill` фон всегда прозрачный (это его контракт), а под
 * ярлыком лежит чертёж — белый в светлой теме и белый же в тёмной, потому что это картинка, а не
 * поверхность. Без `bg-bgColor` пилюля «bench» читалась бы только там, где под ней случайно
 * оказалось пусто. Отсюда же `max-w`: ярлык не должен заезжать под ряд `zoom · ✕` справа.
 */
const PLATE_BADGE_BAR =
  'pointer-events-none absolute left-1 top-1 z-[5] flex max-w-[calc(100%-96px)] flex-col items-start gap-0.5';
/**
 * ЯРЛЫК УСТУПАЕТ РОВНО СТОЛЬКО, СКОЛЬКО ЗАНЯЛ ПРОТИВОПОЛОЖНЫЙ УГОЛ (K-7).
 *
 * 96px в базовом классе — это `zoom · ✕` с их полями. У плиты, которой в медиа карточки ещё нет,
 * между ними встаёт третий орган (`take in`), и ряд вырастает примерно до 150px. Оставить резерв
 * прежним значило бы, что имя вида уезжает под кнопку ровно на тех плитах, где имя нужнее всего:
 * это ряд выходов прогона, и различают их именно по имени.
 *
 * Резерв ДВУХ ЗНАЧЕНИЙ, а не одно широкое на все плиты: у карточной плиты третьего органа нет, и
 * отобранные у ярлыка 64 пикселя резали бы длинное имя без всякой причины.
 */
const PLATE_BADGE_BAR_WIDE_RESERVE = 'max-w-[calc(100%-160px)]';
const PLATE_BADGE_CHIP = 'flex min-w-0 max-w-full items-center gap-1.5 bg-bgColor px-1 py-0.5';

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
 * ═══ ДВЕРИ ЖИВУТ В УГЛАХ КАДРА, А НЕ СТРОКОЙ ПОД НИМ (V-20) ══════════════════════════════════
 *
 * Владелец: «не должно быть кнопки TAKE IN TO DRAW ON IT ▸ я не понимаю зачем она нужна должна
 * быть кнопка эдит на ховер», и в том же пункте — «все карточки должны быть одной высоты всегда».
 * Это ОДНО требование, а не два: строка дверей под кадром переносилась (`flex-wrap`), её состав
 * менялся от вида к виду и от плиты к плите, и именно она делала соседние плиты разной высоты.
 * Убрав её в углы, мы разом получаем и ховер-органы, и постоянную высоту.
 *
 * ЗАКОН УГЛОВ — ОБЩИЙ С `PictureTile`, и координаты берутся ИЗ НЕГО (`TILE_AT_*`), а не пишутся
 * здесь заново: владелец уже жаловался («сделай везде одинаково включая кнопку сплит нахуя ты
 * делаешь везде по разному»). Плита не может БЫТЬ `PictureTile` — она сама поверхность постановки
 * указаний (T-21, «оно должно быть инлайн»), и обернуть её в плитку значило бы вернуть модалку
 * рисования, которую владелец снял. Поэтому общий не компонент, а закон:
 *
 *      верх справа  — zoom, take in, ✕                 ← ряд, кладётся в `cornerSlot` поверхности
 *      низ слева    — select / un-select (метка W-12)
 *      низ справа   — edit
 *
 * ВЕРХНИЙ ПРАВЫЙ РЯД — ОДНА ОСЬ: состоит ли картинка в медиа карточки. `take in` вносит, `✕`
 * выносит, и второй появляется ровно там, где первого уже не нужно. Ось эта существует не ради
 * симметрии: `media_id` выноски адресует медиа КАРТОЧКИ, поэтому на плите прогона или верстака
 * указание не поставить, пока её не внесли.
 *
 * ЧТО ТАКОЕ `edit` ЗДЕСЬ (K-7). Растровый редактор — тот же `VectorModal`, что открывают плитка
 * истории генераций и плита верстака. Слова владельца: «в артифактс фабрик рендерс кнопка эдит
 * должна открывать растр эдитор». До этого круга дверь с тем же именем вносила картинку в медиа
 * карточки; акт остался, имя у него теперь своё (`take in`), и путать их больше нечем.
 *
 * `edit` СТОИТ НА КАЖДОЙ ПЛИТЕ. Раньше карточная плита нижнего правого органа не имела вовсе —
 * довод был «она правится кликом по себе». Клик по себе ставит УКАЗАНИЕ; кисть — другое умение, и
 * отсутствие двери учило, что кистью по плите карточки нельзя, хотя можно.
 *
 * МЁРТВАЯ ДВЕРЬ ОСТАЁТСЯ ВИДИМОЙ И НАЗЫВАЕТ ПРИЧИНУ — но теперь заголовком угла, а не строкой:
 * отсутствие учит, что жеста не существует вовсе, а погашенный орган с причиной учит, что именно
 * стоит на пути (выпущенная карточка, плита не на документе).
 */
function PlateGrid({
  plates,
  layout,
  calloutsOf,
  selected,
  canPlaceOn,
  tool,
  onToolDone,
  onPlacedCountChange,
  onAddCallout,
  bindings,
  onZoom,
  onAddPlate,
  addPlateLabel,
  addPlateNote,
  onDetach,
  detachInert,
  onEdit,
  editInert,
  onTakeIn,
  takeInInert,
  onToggleChosen,
  chosenInert,
  chosenPending,
  sayPrints,
  halo,
}: {
  plates: DocumentPlate[];
  /** Лента с прокруткой или переносящийся ряд. Высота плиты от этого не зависит — см. V-20. */
  layout: PlateLayout;
  /** Указания одной плиты, уже в вью-модели поверхности. */
  calloutsOf: (mediaId: number) => SurfaceCallout[];
  selected: number | null;
  /** Принимает ли эта плита указание — и, значит, заморожена её поверхность или нет. */
  canPlaceOn: (plate: DocumentPlate) => boolean;
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
  /** Слово на пустом слоте: оно называет РОД того, что появится, а род зависит от вида (V-20 г). */
  addPlateLabel?: string;
  /**
   * Строка подписи добавляющей плиты — цена, названная ДО нажатия, а не тостом после. Нужна ровно
   * там, где принесённый файл ляжет не в тот сегмент, где стоит человек: словарь медиа карточки не
   * знает кадра турнтейбла (см. `addPlateFromLibrary`).
   */
  addPlateNote?: string;
  /** Take a plate off the document, or `undefined` — and then `detachInert` says why not. */
  onDetach?: (plate: DocumentPlate) => void;
  detachInert: string;
  /**
   * `edit` нижнего правого угла: открыть плиту в РАСТРОВОМ РЕДАКТОРЕ (K-7). Стоит на КАЖДОЙ плите
   * ряда, чем бы она ни была: редактор работает от медиа, а медиа есть у всех.
   */
  onEdit?: (plate: DocumentPlate) => void;
  editInert: string;
  /**
   * `take in` верхнего правого ряда: внести картинку верстака или прогона в медиа карточки, чтобы
   * на ней вообще можно было поставить указание. До K-7 этот акт носил имя `edit`, а до того —
   * «take in to draw on it ▸».
   */
  onTakeIn?: (plate: DocumentPlate) => void;
  takeInInert: string;
  /**
   * Flip the mark «chosen» on the picture behind a plate (W-12), or `undefined` — and then
   * `chosenInert` says why not. BOTH absent means the door is not part of this list at all: a flat
   * is chosen by standing in a bench slot, so on that list absence is the truth, not an omission.
   */
  onToggleChosen?: (plate: DocumentPlate) => void;
  chosenInert?: string;
  /** A write of the mark is in flight — the doors wait for the band to answer. */
  chosenPending?: boolean;
  /**
   * Сказать на лице плиты, что она ПЕЧАТАЕТСЯ. Ставится в сегментах, где это удивляет (рендеры и
   * 3D): лист — это медиа карточки, и тех-пак печатает их все. Прежний проп `offSheet` утверждал
   * обратное и был неправдой — см. довод у пилюли.
   */
  sayPrints?: boolean;
  /**
   * Белая подложка под линиями указаний. ПО РОДУ АРТЕФАКТА, а не по вкусу: на рендере и на кадре
   * турнтейбла чернильная линия тонет в пёстром снимке, и указание перестаёт быть видно ровно там,
   * где его поставили; на ШТРИХОВОМ флэте та же подложка перекрыла бы линии самого чертежа.
   */
  halo?: boolean;
}) {
  return (
    // ОДНА РАСКЛАДКА, ДВА РЕЖИМА, И РАЗНИЦА РОВНО В ПЕРЕНОСЕ.
    //
    // Ширину плиты диктует сам снимок (высота задана, пропорции его собственные), поэтому колонка
    // фиксированной ширины либо резала бы широкий чертёж, либо оставляла бы пустоту под узким —
    // сетки колонок здесь нет ни в одном из режимов.
    //
    // СТРИП — `flex-nowrap` с горизонтальной прокруткой: ряд остаётся рядом и не рвётся на месте,
    // выбранном шириной окна. СЕТКА — тот же ряд с `flex-wrap`.
    //
    // `items-start` УБРАН НАМЕРЕННО: он был нужен, пока плиты были разной высоты (подвал дверей
    // переносился), и он же эту разницу закреплял. Высота теперь постоянна у всех, растягивать
    // друг друга нечему, а `items-stretch` по умолчанию держит ряд ровным, если высота вдруг
    // разойдётся, — то есть ошибка станет видна, а не замаскируется.
    <div
      className={cn(
        'flex gap-2',
        layout === 'strip' ? 'flex-nowrap overflow-x-auto pb-1' : 'flex-wrap',
      )}
    >
      {plates.map((plate, index) => {
        const drawable = canPlaceOn(plate);
        const mine = calloutsOf(plate.mediaId);
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
          // длинное имя или подпись растянули бы плиту шире её же картинки — у портретного
          // чертежа заметно, и ряд переставал бы читаться как ряд равных.
          //
          // `shrink-0` — ДЛЯ СТРИПА: в ленте `flex-nowrap` плиты иначе сжимались бы, чтобы влезть
          // в ширину блока, и лента «прокручивалась» бы, ничего не прокручивая.
          <div
            key={plate.key}
            data-field={plate.door}
/* ЯКОРЬ ДЛЯ ПРОБ, ПАРНЫЙ К `data-annot-frame`: тот метит КАДР, этот — ПЛИТКУ целиком
               (рамка, шапка, кадр, подпись, подвал дверей). Пробы геометрии меряют вписанность
               кадра в плитку, и опознавать плитку по классам оказалось нельзя — «p-1» ушёл вместе
               с волной медиа, и проба стала находить `null`, то есть молча перестала мерить. */
            data-plate-tile=''
            className='group relative w-fit max-w-full shrink-0'
          >
            {/* ЯРЛЫК ПЛИТЫ — НАКЛАДКОЙ НА КАДРЕ (K-2, довод у `PLATE_BADGE_BAR`). Кадр стоит первым
                ребёнком плиты и начинается в её верхнем левом углу, поэтому `left-1 top-1` плиты и
                `left-1 top-1` кадра — одна точка; отдельной позиционированной обёртки для этого не
                нужно, а лишняя стояла бы между поверхностью и её собственными углами.
                `pointer-events-none` НЕСУЩИЙ: под ярлыком лежит поверхность постановки указаний, и
                проглоченный им `pointerdown` означал бы мёртвую зону в углу каждого чертежа. */}
            <div
              className={cn(
                PLATE_BADGE_BAR,
                plate.origin !== 'card' && PLATE_BADGE_BAR_WIDE_RESERVE,
              )}
            >
              <div className={PLATE_BADGE_CHIP}>
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
                  what a person sees when they come back to this tab an hour later.
                  ЗДЕСЬ ВИСЕЛО «not on the sheet» — прямая неправда: плита, лежащая в медиа
                  карточки, печатается на странице технического эскиза вместе со своими выносками
                  (`tech-pack-document.tsx`, без единого условия по роду). Пилюля называет теперь
                  ровно это, и только там, где оно удивляет: у флэта попадание на бумагу и так
                  никого не удивляет, а у плиты, которой в медиа карточки ещё нет, своя пилюля. */}
              {sayPrints && plate.origin === 'card' && (
                <Pill
                  tone='attention'
                  title='this picture is in the card’s media, so the tech pack prints it on the technical sketch page, with the callouts standing on it'
                >
                  on paper
                </Pill>
              )}
                {/* Число выносок ЭТОЙ плиты. Стояло `ml-auto` у правого края строки-шапки; строки
                    больше нет, а правый верхний угол кадра занят рядом `zoom · ✕`. Здесь оно
                    читается вместе с именем, которому принадлежит, и рисуется только когда есть
                    что считать — ноль сообщал бы то же, что пустое место. */}
                {mine.length > 0 && (
                  <Text size='nano' variant='label' component='span' className='shrink-0'>
                    {mine.length}
                  </Text>
                )}
              </div>

              {/* ПОДПИСЬ (ПРОВЕНАНС) — ВТОРОЙ СТРОКОЙ ЯРЛЫКА, А НЕ СТРОКОЙ ПОД КАДРОМ.
                  Под кадром она занимала 14px ВСЕГДА, включая плиты, у которых провенанса нет
                  вовсе (карточная, принесённая руками), — и ровно это владелец назвал пустым
                  подбородком. Накладка ничего не стоит по высоте, поэтому строка вернулась к
                  честному правилу «рисуется, когда ей есть что сказать».
                  ТИХАЯ (`TILE_QUIET`), потому что имя нужно всегда, а происхождение — когда о нём
                  спрашивают; формула та же, что у углов полосы, и `group` на плите её кормит. */}
              {plate.note ? (
                <span className={cn(PLATE_BADGE_CHIP, TILE_QUIET)}>
                  {/* ДВЕ СТРОКИ, А НЕ ОДНА С МНОГОТОЧИЕМ. Ярлык прозрачен для указателя (иначе в
                      углу чертежа появилась бы мёртвая зона), а значит `title` на нём никогда не
                      всплывёт — обрезанный в одну строку провенанс стал бы текстом, который нечем
                      дочитать. */}
                  <Text
                    size='nano'
                    variant='label'
                    component='span'
                    className='line-clamp-2 min-w-0 break-words'
                  >
                    {plate.note}
                  </Text>
                </span>
              ) : null}
            </div>

            {/* КАДР — САМ СНИМОК: высота задана, ширина выведена из его пропорций (см. довод у
                `PLATE_FRAME_HEIGHT`). `preferNaturalAspect`: если сервер размеров не назвал, коробка
                переходит на пропорции ЗАГРУЖЕННОЙ картинки — тогда доли выносок честны и на таком
                медиа, а не «маркеры не рисуем», как было. */}
            <div>
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
                /* ЛЕГЕНДА — В КОРОБКЕ ПОСТОЯННОЙ ВЫСОТЫ, И ЭТО ВТОРАЯ ПОЛОВИНА «ОДНОЙ ВЫСОТЫ
                   ВСЕГДА» (довод у `PLATE_LEGEND_BOX`). Снять легенду было бы проще, но она не
                   дублирует панель CALLOUTS: наведение на её строку подсвечивает СВОЙ пин на
                   снимке, а это принадлежит поверхности и нигде больше не живёт.

                   `legendClassName`, А НЕ `chromeClassName`: второй держит ВСЁ подкадровое, включая
                   ряд «done · N / cancel», которым заканчивают мультивыноску и зону. Заперев его в
                   72-пиксельном скроллере вместе с легендой, мы делали жест незавершаемым на
                   планшете — там нет ни Enter, ни Escape. */
                legendClassName={cn(PLATE_LEGEND_BOX, 'overflow-y-auto')}
                /* Кадр рисует свою границу сам (`border border-borderColor` внутри поверхности), и
                   после K-2 это ЕДИНСТВЕННАЯ граница плиты: внешняя рамка снята, а вместе с ней и
                   4px, которые только и отделяли одну линию от другой. */
                halo={halo}
                // ВЕРХ СПРАВА — РЯД, А НЕ УГОЛ, ровно как у `PictureTile`: увеличение и снятие
                // обязаны стоять рядом, не наезжая. Место ряда назначает сама поверхность
                // (`cornerSlot` рисуется ею по `right-1 top-1`), поэтому координат здесь нет.
                //
                // ZOOM ЖИВ И НА ВЫПУЩЕННОЙ КАРТОЧКЕ: мерку и дугу на плите иначе не разглядеть, а
                // увеличение и есть способ их прочесть. ✕ (detach) — правка листа, поэтому гаснет.
                //
                // ═══ И ЗДЕСЬ ЖЕ ВТОРАЯ ПОЛОВИНА ОДНОЙ ОСИ — `take in` (K-7) ══════════════════
                // Ряд отвечает на один вопрос: СОСТОИТ ЛИ КАРТИНКА В МЕДИА КАРТОЧКИ. `✕` выносит
                // её оттуда, `take in` вносит. Держать вход и выход в разных углах плиты значило
                // бы, что одна и та же ось читается в двух местах — ровно то «везде по-разному»,
                // из-за которого закон углов вообще появился.
                //
                // ТОЛЬКО У ПЛИТЫ, КОТОРОЙ В МЕДИА КАРТОЧКИ ЕЩЁ НЕТ. У карточной плиты вносить
                // нечего, и живая дверь «внести» рядом с живой «вынести» читалась бы как выбор
                // там, где выбора нет. Погашенной её тоже не рисуем: `✕` по соседству уже
                // говорит, что плита на листе.
                cornerSlot={
                  <>
                    <PlateCorner label={`zoom · ${plate.name}`} onPress={() => onZoom(index)}>
                      zoom
                    </PlateCorner>
                    {plate.origin !== 'card' &&
                      (onTakeIn ? (
                        <PlateCorner
                          label={`take ${plate.name} into the card’s media — from that moment a callout can be placed on it right here, and it prints on the tech pack’s technical sketch page`}
                          onPress={() => onTakeIn(plate)}
                        >
                          take in
                        </PlateCorner>
                      ) : (
                        <PlateCorner label={`take ${plate.name} in`} reason={takeInInert}>
                          take in
                        </PlateCorner>
                      ))}
                    {detachReason ? (
                      <PlateCorner label={`detach ${plate.name}`} reason={detachReason}>
                        ✕
                      </PlateCorner>
                    ) : (
                      <PlateCorner
                        label={`detach ${plate.name} — take this picture off the sheet; the callouts on it go with it`}
                        onPress={() => onDetach?.(plate)}
                      >
                        ✕
                      </PlateCorner>
                    )}
                  </>
                }
                /* НИЖНИЙ РЯД — СЛОТОМ ПОВЕРХНОСТИ, поверх кадра: место назначает она, потому что
                   только она знает, где кончается снимок и начинается легенда. Первый ребёнок
                   садится слева, последний справа — поэтому обе роли передаются ВСЕГДА, пустым
                   `<span />` при отсутствии: иначе единственный орган сменил бы угол молча. */
                cornerSlotBottom={
                  <>
                    {/* НИЗ СЛЕВА — МЕТКА «chosen» (W-12). Роль левого нижнего угла у плитки занята
                        сплитом, а лист не режут; здесь это метка. */}
                    {!(onToggleChosen || chosenInert) ? (
                      <span />
                    ) : onToggleChosen && (plate.pictureId ?? 0) > 0 ? (
                      <PlateCorner
                        disabled={chosenPending}
                        label={
                          plate.chosen
                            ? `un-select ${plate.name} — with none of this kind chosen, the segment lists everything again`
                            : `select ${plate.name} — the segment narrows to the chosen ones of this kind`
                        }
                        onPress={() => onToggleChosen(plate)}
                      >
                        {plate.chosen ? 'un-select' : 'select'}
                      </PlateCorner>
                    ) : (
                      <PlateCorner
                        label={plate.chosen ? `un-select ${plate.name}` : `select ${plate.name}`}
                        reason={
                          onToggleChosen
                            ? 'the picture behind this plate is not on the loaded page of the band — the mark is set on the picture, and this page does not carry it'
                            : chosenInert!
                        }
                      >
                        {plate.chosen ? 'un-select' : 'select'}
                      </PlateCorner>
                    )}

                    {/* ═══ НИЗ СПРАВА — `edit`, И ОН ОТКРЫВАЕТ РАСТРОВЫЙ РЕДАКТОР (K-7) ═════════
                        Владелец: «в артифактс фабрик рендерс кнопка эдит должна открывать растр
                        эдитор». Здесь этой дверью вносили картинку в медиа карточки; тот акт жив,
                        но зовётся `take in` и стоит в верхнем правом ряду, на своей оси.

                        СТОИТ НА КАЖДОЙ ПЛИТЕ, БЕЗ ВЕТКИ ПО ПРОИСХОЖДЕНИЮ. Прежнее `compound ?`
                        оставляло карточную плиту вовсе без нижнего правого органа: рисовать на ней
                        было можно только указаниями, а кистью — нельзя, и объяснить эту разницу
                        человеку нечем. Редактор работает от `base_media_id`, а медиа несёт любая
                        плита ряда.

                        ЧЕГО ЗДЕСЬ БОЛЬШЕ НЕТ. Погашенная дверь `draw` с причиной «рисовать нельзя»
                        ушла вместе с веткой: угол один, слово в нём одно, и `edit` — то слово,
                        которое назвал владелец. Сама причина не потерялась — увеличенный вид
                        печатает её строкой (`readOnlyNote`), а панель видов над рядом просто не
                        появляется, когда взводить вид не на что. */}
                    {onEdit ? (
                      <PlateCorner
                        label={`edit ${plate.name} — draw over this picture; saving files a NEW picture and never overwrites this one`}
                        onPress={() => onEdit(plate)}
                      >
                        edit
                      </PlateCorner>
                    ) : (
                      <PlateCorner label={`edit ${plate.name}`} reason={editInert}>
                        edit
                      </PlateCorner>
                    )}
                  </>
                }
              />
            </div>

            {/* СТРОКИ ПОДПИСИ ПОД КАДРОМ БОЛЬШЕ НЕТ. Она стояла здесь всегда, даже пустая, ради
                выравнивания ряда — и была половиной «пустого подбородка» (K-2). Провенанс переехал
                во вторую строку ярлыка, наверх на сам кадр; ряд же выравнивает `items-stretch`
                flex-контейнера, а не резерв высоты под каждой плитой. */}
          </div>
        );
      })}

      {/* ПУСТОЙ КАДР И ЕСТЬ КНОПКА, КОТОРАЯ ЕГО ЗАПОЛНЯЕТ — тот же слот, что на листе эскиза и в
          мудборде. Кнопка «add a picture» в ряду органов ничего не говорила бы о том, что появится
          на её месте, а появляется ПЛИТА.

          СТОИТ ТЕПЕРЬ ВО ВСЕХ ТРЁХ ВИДАХ (V-20 г). Владелец: «так же должн быть возможность
          загрузить свой флет, рендер или 3д если мы не хотим генерировать их в нашем туле». Раньше
          слот жил только на флэтах, и довод был честный — рендер, положенный в ряд флэтов, уехал бы
          на бумагу под видом чертежа. Он никуда не делся, но решается НЕ ЗАПРЕТОМ, а тем, что
          принесённый файл кладётся в вид, КОТОРЫЙ СЕЙЧАС НА ЭКРАНЕ: загруженный в сегменте рендеров
          файл и числится рендером, а лист по-прежнему собирается из флэтов. Отсутствие двери не
          защищало ни от чего — оно просто не давало обойтись без генератора. */}
      {onAddPlate && (
        <AddPlateTile label={addPlateLabel} note={addPlateNote} onAddPlate={onAddPlate} />
      )}
    </div>
  );
}

/**
 * ДОБАВЛЯЮЩАЯ ПЛИТА — ТА ЖЕ СКЕЛЕТНАЯ РАЗМЕТКА, ЧТО У НАСТОЯЩЕЙ, И ЭТО ВСЯ ПОЧИНКА.
 *
 * ЗАМЕРЕННЫЙ ДЕФЕКТ (исторический). Слоту передавали `heightPx={PLATE_FRAME_HEIGHT}` — высоту
 * КАДРА, тогда как плита складывалась из строки заголовка, кадра, коробки легенды, строки подписи
 * и полей: 521.5 против 400, то есть 120 пикселей пустой земли под добавляющей рамкой. `items-start`
 * в ряду снят намеренно, поэтому ячейка тянулась во весь рост соседей, а рамка сидела в её верху.
 *
 * ПОСЛЕ K-2 ЭТОТ РАЗРЫВ ЗАКРЫТ НЕ РАВЕНСТВОМ СТРОК, А ИХ ОТСУТСТВИЕМ. У настоящей плиты над
 * кадром и под ним не осталось НИЧЕГО, что занимает высоту: имя и провенанс — накладки, легенда
 * растёт от нуля. Значит плита ровно `PLATE_FRAME_HEIGHT` (плюс легенда, когда на ней есть пины),
 * и слот, которому передали то же число, равен ей по построению — совпадать теперь нечему.
 *
 * ЗАГОЛОВОК НЕСЁТ СЛОВО, А НЕ ПУСТОТУ, и это уцелело: «new plate» говорит, что появится на месте
 * рамки, а стоит он накладкой — как имя настоящей плиты, в той же точке кадра.
 */
function AddPlateTile({
  label,
  note,
  onAddPlate,
}: {
  label?: string;
  /** Строка подписи: цена, названная ДО нажатия. Стоит накладкой, как ярлык настоящей плиты. */
  note?: string;
  onAddPlate: (items: common_MediaFull[]) => void;
}) {
  return (
    <div data-plate-tile='' className='group relative w-fit max-w-full shrink-0'>
      <div className={PLATE_BADGE_BAR}>
        <div className={PLATE_BADGE_CHIP}>
          <Text
            size='nano'
            variant='uppercase'
            tracking='label'
            component='span'
            className='min-w-0 truncate'
          >
            new plate
          </Text>
        </div>
        {note ? (
          <span className={cn(PLATE_BADGE_CHIP, TILE_QUIET)} title={note}>
            <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
              {note}
            </Text>
          </span>
        ) : null}
      </div>
      <MediaSlot
        aspectRatio={['Custom']}
        frameAspect='4/5'
        heightPx={PLATE_FRAME_HEIGHT}
        label={label ?? '+ add a plate'}
        purpose='technical sheet plate'
        allowMultiple
        showVideos={false}
        onSelect={onAddPlate}
        sizeClassName='w-auto max-w-[85vw]'
      />
    </div>
  );
}

/**
 * Орган в углу кадра. НЕ `<Button>`, а span с ролью: он живёт внутри общего `<fieldset disabled>`
 * выпущенной карточки, а у нативной кнопки под таким предком `click` не стреляет (замерено в
 * Chromium: гасятся ровно `click` и `focus`). Увеличение — единственный способ прочесть мерку на
 * плите, и делать его мёртвым на подписанной карточке значило бы закрыть чтение там, где только
 * чтение и осталось. Свои pointer-события орган гасит сам, иначе нажатие уходит в постановку.
 *
 * КОЖА И ПОЯВЛЕНИЕ — ОБЩИЕ С ПЛИТКОЙ ПОЛОСЫ (`TILE_CORNER`, `TILE_QUIET` из `picture-tile.tsx`).
 * Владелец просил `edit` «на ховер», и формула появления у полосы уже была написана — своя вторая
 * означала бы, что органы полосы проступают по двум разным правилам. `TILE_QUIET` слушает
 * `group-hover` ХОЗЯИНА, поэтому плита несёт класс `group`: у клавиатуры ховера не бывает, и орган,
 * видимый лишь пока фокус стоит на нём самом, нечем найти — там же формула ловит `group-focus-within`
 * и устройство без наведения.
 */
function PlateCorner({
  label,
  onPress,
  reason,
  disabled,
  children,
}: {
  label: string;
  onPress?: () => void;
  /**
   * Дверь есть, но нажать нельзя — и орган НАЗЫВАЕТ ПРИЧИНУ вместо того, чтобы исчезнуть.
   * Отсутствие учит, что жеста не существует вовсе; погашенный орган с причиной учит, что именно
   * стоит на пути. Задан — `onPress` игнорируется.
   */
  reason?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const inert = !!reason || !onPress;
  const dead = inert || disabled;
  return (
    <span
      role='button'
      // Мёртвый орган выпадает из таба: остановка на кнопке, которая ничего не делает, — это
      // остановка ни на чём, а причину несёт заголовок, который читалка объявляет вместе с именем.
      tabIndex={dead ? -1 : 0}
      aria-disabled={dead || undefined}
      aria-label={label}
      title={reason ? `${label} — ${reason}` : label}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        if (dead) return;
        onPress?.();
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (dead) return;
        onPress?.();
      }}
      className={cn(
        TILE_CORNER,
        TILE_QUIET,
        'py-px leading-none',
        dead ? 'cursor-not-allowed text-textInactiveColor' : 'cursor-pointer',
      )}
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
  bench: BenchRead;
  disabled?: boolean;
  /** Положить на лист картинку из библиотеки. `undefined` — карточка только читается. */
  onAddPlate?: (items: common_MediaFull[]) => void;
}) {
  const { showMessage } = useSnackBarStore();
  return (
    <>
      <Text size='micro' variant='label' component='p'>
        Nothing is drawn on this card yet. A sheet is made of flats — put a drawing on it from the
        library below, or fill a bench slot in <b>STUDIO</b> and bring it in with <b>edit</b> on its
        plate. Callouts are placed on the plate itself, here, once one exists.
      </Text>
      {/* СЛОТ, А НЕ КНОПКА: на месте пустой рамки появится ПЛИТА, и рамка тех же пропорций про это
          и говорит. ⌘V и бросок файла слот принимает сам. */}
      {onAddPlate && (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          label='+ add a flat'
          purpose='technical sheet plate'
          allowMultiple
          showVideos={false}
          onSelect={onAddPlate}
          sizeClassName='w-[200px] max-w-[85vw]'
        />
      )}
      {/* ЧТО ДЕЛАЕТ ЛИСТ ЛИСТОМ — перед и спинка. Это КЛИЕНТСКОЕ соглашение (`SHEET_MIN_VIEWS` в
          `views.ts`), сервер его не знает и ни на чём не настаивает: строка сообщает и ведёт к
          слоту, но ничего не запрещает. Раньше эти два вида были ещё и условием минта — минта
          больше нет, а лист без переда и спинки по-прежнему не лист. */}
      <div className='flex flex-wrap gap-1.5'>
        {SHEET_MIN_VIEWS.map((view) => (
          <Button
            key={view}
            variant='secondary'
            size='sm'
            disabled={disabled}
            onClick={() =>
              openDoor(
                benchDoor({ viewKey: view }),
                `the ${viewLabel(view)} slot is on the bench`,
                showMessage,
              )
            }
          >
            {viewLabel(view)} slot{' '}
            {slotIsFilled(bench.sides.find((s) => s.view === view)?.slot) ? '✓' : '✗'}
          </Button>
        ))}
      </div>
    </>
  );
}
