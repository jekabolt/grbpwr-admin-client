import type {
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignPicture,
  common_DesignRun,
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
  noteArrowsOf,
  rememberPen,
  type AnnotationSurfaceProps,
  type NoteArrows,
  type PenStyle,
  type ShapePoint,
  type SurfaceCallout,
} from 'ui/components/annotation/surface';
import { kindDef, PALETTE_KINDS } from 'ui/components/annotation/kinds';
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
import {
  COLORWAY_NONE,
  cardOutputRows,
  refColorwayFor,
  runIsOnPage,
  runRepresentation,
  serverStatesOutputs,
} from './bench-kinds';
import { readBench, type BenchRead } from './bench-slot';
import { benchDoor } from './doors';
import { pictureHandle } from './handles';
import { VectorModal } from './modals';
import { recolorOutputs } from './onmodel/model';
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
  benchSides,
  outputsOfKind,
  pictureIsSelected,
  serverStatesSelected,
  type BenchSide,
} from './render';
import { pictureIsModel, threedResults } from './threed/media';
import { ThreedModelModal } from './threed/model-modal';
import {
  DISPLAY_ONLY_NOT_STATED,
  pictureIsDisplayOnly,
  serverStatesDisplayOnly,
  type WireUploadItem,
} from './threed/wire';
import { newClientRequestId, useDesignWrites } from './use-design-band';
import { SHEET_MIN_VIEWS, viewLabel } from './views';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { isPictureHidden } from './visibility';

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
  /**
   * Only for a bench plate: WHICH bench its slot is on. A render front and a flat front are two
   * slots under one view key (L-5), and «take in» files them under different card kinds: a flat
   * front is `FRONT`, a render front is `RENDER` — the card's vocabulary has no «render of the
   * front».
   */
  benchKind?: 'flat' | 'render';
  /**
   * КАДР ТОЛЬКО ДЛЯ ПОКАЗА (D-24, `DesignPicture.display_only`). Виден здесь и на листе, никогда
   * не уезжает в промпт: сервер отказывает ему в слоте, в референсах и у денежной двери. Плита
   * говорит это пилюлей; сужение сегмента до «выбранных» его не прячет — он и заведён затем,
   * чтобы показываться ДОПОЛНИТЕЛЬНО.
   */
  displayOnly?: boolean;
  /** The `.glb` behind this plate — a 3D poster stands in for a model, and the model can be opened. */
  model?: string;
  /**
   * The plate IS the model file: a 3D result whose run returned no raster. There is nothing to
   * draw a callout on, so it is drawn as a door into the model window, not as a surface.
   */
  modelOnly?: boolean;
};

/**
 * ═══ A CELL OF THE SHEET'S ROW — a plate, or the EMPTY SLOT where one would stand (D-15) ═══════
 *
 * Владелец: «в основном большом вьюере показываются флеты рендеры паттерны и тд которые мы
 * выбрали в слоты добавление через плейсхолдеры своих медиа из медиа селектора так же их
 * обновляет в слотах во вкладке студио». Лист — не отдельная коллекция, а ВТОРОЕ ЛИЦО ТЕХ ЖЕ
 * СЛОТОВ: сторона, в которой на верстаке пусто, стоит здесь пустым плейсхолдером тех же
 * пропорций, и файл, положенный в него, уезжает в слот СТУДИИ одной записью
 * (`RegisterDesignUpload` с `target`) — той же, которой заполняют слот из полосы входа. Одна
 * запись, а не две.
 *
 * `index` у плиты — её место в ряду ПЛИТ сегмента (без слотов): по нему листает увеличенный вид,
 * и порядок обязан совпадать с тем, что видит человек.
 */
export type SheetCell =
  | { type: 'plate'; plate: DocumentPlate; index: number }
  | { type: 'slot'; benchKind: 'flat' | 'render'; view: string; slotRev: number };

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
export type ArtifactKind = 'flat' | 'pattern' | 'render' | 'threed' | 'onmodel';

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
    hint: '3D models; their thumbnails print too, once they are in the card’s media',
  },
  {
    // D-25, дословно: «в THE SHEET должна быть вкладка ON MODEL». Тот же ряд, что у студии:
    // снимки человека в этой вещи, переодетые на STUDIO → ON MODEL, — пятое представление, по
    // тому же правилу отбора (выбранные, иначе все), что у трёх соседей справа от флэтов.
    value: 'onmodel',
    label: 'on model',
    hint: 'photographs of a person wearing it, re-dressed on STUDIO → ON MODEL; print too, once on the card',
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
  /* ПЕРЕКРАС ЧИТАЕТСЯ ПО ПРОГОНУ, И ФОЛБЭКА У НЕГО НЕТ — тем же путём, что у плитки: вывод
     рекола приходит с `kind: "render"` (у карточки нет рода для переодетого снимка), и взятый
     на карточку он числится там `RENDER`. Без этой строки принятие снимка молча переносило бы
     его к рендерам — то же наказание за принятие, что стоило пробы плитке. */
  if (fromRun === 'onmodel') return 'onmodel';
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

/**
 * media id → the representation of the run that produced it, for every picture on the loaded page.
 *
 * ═══ ОДИН СЛОВАРЬ РОДА НА ВСЮ ПОЛОСУ (G-1), И ЭТО СВЁРТКА БЕЗ ВИДИМЫХ ПОСЛЕДСТВИЙ ══════════════
 *
 * Здесь стоял свой список допустимых родов прогона строками — четвёртое написание правила,
 * которое волна G-1 сводит в `runRepresentation`. Свёртка проверена по случаям, а не по виду:
 *
 *   · `recolor` → `onmodel` и ПРОПУСКАЕТСЯ — ровно как прежний список пропускал `recolor`.
 *     Перекрашенные снимки в ARTIFACTS не появляются и теперь; заслуживают ли они там своего
 *     сегмента — вопрос владельцу, а не молчаливая правка этой волны;
 *   · неизвестный род → `null` и пропускается — как пропускался прежде;
 *   · `vector`/`draft_idea` → `flat`, то есть ПОПАДАЮТ в карту, тогда как прежний список их
 *     отбрасывал. Видимого следствия нет и быть не может: `artifactKindOf` ветки на `flat` не
 *     имеет вовсе, и значение `flat` доходит до того же запасного чтения рода карточки, до
 *     которого доходило ОТСУТСТВИЕ записи. Тот же ответ, другим путём.
 */
export function runKindByMediaId(band: GetDesignBandResponse): Map<number, string> {
  const map = new Map<number, string>();
  for (const run of band.runs ?? []) {
    const rep = runRepresentation(run);
    /* `onmodel` БОЛЬШЕ НЕ ПРОПУСКАЕТСЯ (D-25): вопрос «заслуживают ли перекрашенные снимки
       своего сегмента», отложенный волной G-1 владельцу, владелец решил — вкладка ON MODEL. */
    if (!rep) continue;
    for (const picture of run.pictures ?? []) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0) map.set(mediaId, rep);
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
  kind: 'pattern' | 'render' | 'threed' | 'onmodel',
  already: Set<number>,
): { plates: DocumentPlate[]; filteredToSelected: boolean; serverStates: boolean } {
  /* ПЛИТКИ БЕРУТСЯ СВОИМ ЧИТАТЕЛЕМ, А НЕ ЧЕРЕЗ `outputsOfKind`. Та функция сужена типом до
     `'render' | 'threed'`; `patternOutputs` держит то же правило чтения и живёт рядом со своим
     экраном.

     ⚠ ОХВАТ БОЛЬШЕ НЕ «ОДНА СТРАНИЦА ЛЕНТЫ», И ЭТОТ ЭКРАН УЗНАЛ ОБ ЭТОМ ПОСЛЕДНИМ. Волна H-9
     сделала обоих читателей ОБЩЕКАРТОЧНЫМИ, и ARTIFACTS получил новый охват даром — вместе со
     старыми словами вокруг него. Так и вышло, что экран, который никто не правил, стал единственным
     местом, где остались все четыре починенные по соседству неправды разом: «everything on this
     page» над полным списком, `run 0` у плиты без прогона, «no repeat stated» о прогоне, которого
     нет, и два одинаковых имени у двух разных плиток. Список тут ни при чём — врали ПОДПИСИ.

     ЧЕТВЁРТЫЙ ПОТРЕБИТЕЛЬ — ЭТО ТЕПЕРЬ СКАЗАНО ВСЛУХ И ЗДЕСЬ, И У САМОГО ЧИТАТЕЛЯ
     (`bench-kinds.ts`): кто расширяет охват — обязан обойти всех, кто на него подписан, а не
     только тех, чей экран он в тот день открыл. */
  /**
   * ⚠ ФАЙЛ МОДЕЛИ ПЛИТОЙ НЕ БЫВАЕТ, И ОТСЕИВАЕТСЯ ОН ЗДЕСЬ, ДО ВСЕХ ТРЁХ ЧТЕНИЙ СПИСКА.
   *
   * Прогон 3D отдаёт две строки одного рода `threed` — сам `.glb` и растровую миниатюру. Плита —
   * это поверхность, по которой рисуют указания; по `.glb` рисовать нечего, и до этой строки он
   * становился второй плитой сегмента: счётчик говорил «2 pictures» на один результат, а листание
   * приводило человека на кадр, который не рисуется ничем.
   *
   * ОТСЕВ СТОИТ НАД `serverStates` И `filteredToSelected`, А НЕ В ЦИКЛЕ, И ЭТО НЕСУЩЕЕ МЕСТО. На
   * прогоне БЕЗ миниатюры пометку несёт сама модель (см. `markable` в `threed/media.ts`); фильтр
   * «показывать только помеченные», посчитанный ВМЕСТЕ с моделями, увидел бы такую пометку и
   * вычистил бы из сегмента все настоящие плиты, оставив его пустым.
   */
  /* ПЕРЕКРАС — СВОИМ ЧИТАТЕЛЕМ (D-25), по тому же доводу, что плитка: `outputsOfKind` сужен
     типом до `'render' | 'threed'`, а `recolorOutputs` держит то же правило чтения (вся карточка,
     когда сервер её называет, иначе страница ленты) и живёт рядом со своим экраном. */
  const rows =
    kind === 'pattern'
      ? patternOutputs(band)
      : kind === 'onmodel'
        ? recolorOutputs(band)
        : outputsOfKind(band, kind);
  const outputs = rows.filter(({ picture }) => !pictureIsModel(picture));
  /**
   * ЧТО СТОИТ ЗА РАСТРОМ 3D — ФАЙЛ МОДЕЛИ (D-26). Свод пары «модель + её миниатюра» один на всю
   * полосу (`threedResults`, довод в `threed/media.ts`); здесь по нему плита-постер узнаёт адрес
   * `.glb`, за которым стоит, — и получает дверь в окно модели. Второе правило свода рядом с
   * первым разошлось бы с ним молча.
   */
  const modelBehind = new Map<number, string>();
  const results = kind === 'threed' ? threedResults(rows) : [];
  for (const result of results) {
    const posterMedia = result.poster?.media?.id ?? 0;
    if (posterMedia > 0 && result.modelUrl) modelBehind.set(posterMedia, result.modelUrl);
  }
  const serverStates = outputs.some((o) => serverStatesSelected(o.picture));
  const filteredToSelected = outputs.some((o) => pictureIsSelected(o.picture));
  const plates: DocumentPlate[] = [];
  for (const { picture, run } of outputs) {
    /* КАДР ТОЛЬКО ДЛЯ ПОКАЗА НЕ СУЖАЕТСЯ ПОМЕТКОЙ (D-24): владелец завёл его «для визуализации в
       артефактах ДОПОЛНИТЕЛЬНО», а сужение до выбранных — вердикт о том, ЧТО из выходов
       официально; витринный кадр вердикта не носит и прятаться за ним не должен. */
    const displayOnly = pictureIsDisplayOnly(picture);
    if (filteredToSelected && !displayOnly && !pictureIsSelected(picture)) continue;
    const mediaId = picture.media?.id ?? 0;
    if (mediaId <= 0 || already.has(mediaId)) continue;
    already.add(mediaId);
    const view = (picture.ghostView ?? '').trim();
    /* У ПЛИТКИ НЕТ ВИДА ИЗДЕЛИЯ, И ВЫДУМЫВАТЬ ЕГО НЕЛЬЗЯ: она не сторона и не кадр поворота, а
       квадрат ткани. Её опознают по РАППОРТУ, потому что это единственное, чем две плитки одной
       карточки отличаются друг от друга на глаз в маленьком кадре. */
    /* РАППОРТ ЧИТАЕТСЯ С ПРОГОНА, И ПРОГОНА МОЖЕТ НЕ БЫТЬ. У выхода, вытесненного со страницы
       ленты, рядом стоит ШТАМП из четырёх фактов, в котором `params` нет вовсе, и `repeatOfRun`
       отвечает на него 0 — это «спросить не у кого», а не «не назван». Та же ловушка, что стоила
       PATTERNS записи выдуманного нуля на полку; здесь она стоит дешевле (только слова), и
       закрывается тем же предикатом. */
    const runKnown = runIsOnPage(band, run);
    const repeat = kind === 'pattern' && runKnown ? repeatOfRun(run) : 0;
    /* ИМЯ ОБЯЗАНО БЫТЬ РАЗНЫМ У РАЗНЫХ ПЛИТ, И `ordinal` ЭТОГО НЕ ДАЁТ. Он нумерует выход ВНУТРИ
       своего прогона, так что две плитки из двух прогонов — обе «первые»; вдобавок `?? ` не ловит
       ноль, и обе выходили `TILE 0`. Два одинаковых имени в одном списке — это разметка не той
       картинки. `pictureHandle` (`run 70 · A`) уникален по построению: прогон плюс буква выхода —
       и это тот же словарь имён, которым плитку зовут в ленте. */
    const handle = pictureHandle(picture).toUpperCase();
    plates.push({
      // КЛЮЧ — ПО МЕДИА, А НЕ ПО ПРОИСХОЖДЕНИЮ (D-18): плита, взятая на карточку первым же
      // указанием, меняет `origin`, но не ключ — иначе React пересобрал бы поверхность посреди
      // третьего такта жеста («выбери поставленное и поставь курсор»), и такт терялся бы.
      key: `m-${mediaId}`,
      name:
        kind === 'pattern'
          ? repeat
            ? `TILE ${repeat} MM`
            : `TILE · ${handle}`
          : viewLabel(view).toUpperCase() || handle,
      mediaId,
      media: picture.media,
      origin: 'run',
      chosen: pictureIsSelected(picture),
      pictureId: picture.id ?? 0,
      displayOnly: displayOnly || undefined,
      model: modelBehind.get(mediaId),
      /* ⚠ `run 0` — ЭТО НЕ ПРОГОН НОМЕР НОЛЬ, а его отсутствие: `?? '—'` мимо нуля не срабатывает,
         а общекарточный список впервые привёл сюда плиты, за которыми прогона нет вовсе
         (загруженная руками, «плоская» правка без основы). Слово то же, что на полосе выходов
         рендеров, — одно имя одному состоянию на всех экранах. */
      note:
        kind === 'pattern'
          ? `${(run.id ?? 0) > 0 ? `run ${run.id}` : 'no run'}${
              repeat
                ? ` · ${repeat} mm`
                : runKnown
                  ? ' · no repeat stated'
                  : ' · repeat unknown, its run is off this page of the feed'
            }`
          : `${(run.id ?? 0) > 0 ? `run ${run.id}` : 'no run'}${run.rrev ? ` · r${run.rrev}` : ''}`,
    });
  }
  /**
   * МОДЕЛЬ БЕЗ МИНИАТЮРЫ — ТОЖЕ ПЛИТА СЕГМЕНТА 3D (D-26), но плита-ДВЕРЬ, а не поверхность:
   * рисовать указание по `.glb` нечем, а посмотреть и снять с ракурса — есть что. Раньше такой
   * результат из сегмента выпадал вовсе (отсев `pictureIsModel` выше), и «в THE SHEET 3д можно
   * что бы было посмотреть» на прогоне без растра было невыполнимо.
   */
  for (const result of results) {
    if (!result.model || result.poster || !result.modelUrl) continue;
    const picture = result.model;
    const mediaId = picture.media?.id ?? 0;
    if (mediaId <= 0 || already.has(mediaId)) continue;
    if (filteredToSelected && !pictureIsSelected(picture)) continue;
    already.add(mediaId);
    plates.push({
      key: `m-${mediaId}`,
      name: `MODEL · ${pictureHandle(picture).toUpperCase()}`,
      mediaId,
      media: picture.media,
      origin: 'run',
      chosen: pictureIsSelected(picture),
      pictureId: picture.id ?? 0,
      model: result.modelUrl,
      modelOnly: true,
      note: `${(result.run.id ?? 0) > 0 ? `run ${result.run.id}` : 'no run'} · no thumbnail came back`,
    });
  }
  return { plates, filteredToSelected, serverStates };
}

/**
 * ═══ КАДРЫ ТОЛЬКО ДЛЯ ПОКАЗА ОДНОГО ПРЕДСТАВЛЕНИЯ (D-24) — читатель для флэтов ══════════════════
 *
 * Сегменты рендеров, плиток, 3D и перекраса получают такие кадры даром, через `bandPlates`: их
 * читатели идут по `outputs` карточки, где лежит и загруженное руками. У флэтов читателя выходов
 * на этом экране нет — их сегмент это документ плюс верстак, — и витринный флэт без этой
 * функции не появлялся бы нигде.
 *
 * ВСЯ КАРТОЧКА, КОГДА СЕРВЕР ЕЁ НАЗЫВАЕТ (`cardOutputRows`), иначе — прогоны страницы и пачки
 * загрузок: на старом бинаре поля `display_only` нет вовсе, и ветка честно отдаёт пусто.
 */
export function displayOnlyPlates(
  band: GetDesignBandResponse,
  rep: 'flat',
  already: Set<number>,
): DocumentPlate[] {
  const rows =
    cardOutputRows(band, rep) ??
    [
      ...(band.runs ?? [])
        .filter((run) => runRepresentation(run) === rep)
        .flatMap((run) => (run.pictures ?? []).map((picture) => ({ picture, run }))),
      ...(band.batches ?? []).flatMap((batch) =>
        (batch.pictures ?? []).map((picture) => ({
          picture,
          run: { id: 0 } as common_DesignRun,
        })),
      ),
    ].filter(({ picture }) => !isPictureHidden(picture));
  const plates: DocumentPlate[] = [];
  for (const { picture, run } of rows) {
    if (!pictureIsDisplayOnly(picture)) continue;
    const mediaId = picture.media?.id ?? 0;
    if (mediaId <= 0 || already.has(mediaId)) continue;
    already.add(mediaId);
    plates.push({
      key: `m-${mediaId}`,
      name: pictureHandle(picture).toUpperCase(),
      mediaId,
      media: picture.media,
      origin: 'run',
      chosen: pictureIsSelected(picture),
      pictureId: picture.id ?? 0,
      displayOnly: true,
      note: (run.id ?? 0) > 0 ? `run ${run.id}` : 'no run',
    });
  }
  return plates;
}

/**
 * ═══ ПЛИТЫ РЕНДЕР-ВЕРСТАКА — ЧТО СТОИТ В FABRIC RENDER SLOTS (D-15) ══════════════════════════════
 *
 * Тот же верстак, который читает 3D (`threedSides`) и собирает сервер (`designSelectBench`), и по
 * той же функции (`benchSides`): лист показывает рендер-слоты, а не свой список «что мы считаем
 * рендерами». Скоуп — безколорвейный верстак (`COLORWAY_NONE`), единственный, который пишет
 * студия после E-16.
 *
 * Плита, которая УЖЕ в медиа карточки, приходит отсюда карточной: документ старше верстака, и
 * сузить её до «bench» значило бы спрятать `✕` и пилюлю «on paper» у картинки, которая печатается.
 */
export function renderBenchPlates(
  sides: BenchSide[],
  onCard: Set<number>,
  already: Set<number>,
): DocumentPlate[] {
  const plates: DocumentPlate[] = [];
  for (const side of sides) {
    const picture = side.picture;
    const mediaId = picture?.media?.id ?? 0;
    if (!picture || mediaId <= 0 || already.has(mediaId)) continue;
    already.add(mediaId);
    plates.push({
      key: `m-${mediaId}`,
      name: viewLabel(side.view).toUpperCase(),
      mediaId,
      media: picture.media,
      origin: onCard.has(mediaId) ? 'card' : 'bench',
      benchKind: 'render',
      viewKey: side.view,
      door: benchDoor({ viewKey: side.view, id: side.slot?.id }),
      pictureId: picture.id ?? 0,
      chosen: pictureIsSelected(picture),
      displayOnly: pictureIsDisplayOnly(picture) || undefined,
      note: provenanceLabel(readProvenance(picture)),
    });
  }
  return plates;
}

/**
 * ═══ РЯД ЛИСТА: СТОРОНЫ ПО ПОРЯДКУ, ПУСТЫЕ — ПЛЕЙСХОЛДЕРАМИ, ОСТАЛЬНОЕ СЛЕДОМ (D-15) ═══════════
 *
 * Сторона V показывает: то, что стоит в её слоте верстака; иначе — плиту карточки, чей род и есть
 * V (у живых карточек верстак пуст, а `technicalMedia` держит FRONT/BACK — и сказать такой
 * карточке «перед пуст» рядом с её же передом было бы неправдой); иначе — пустой слот. За
 * четырьмя сторонами идут все прочие плиты сегмента (детали, витринные, выходы прогонов) в
 * своём порядке.
 *
 * ПОРЯДОК ПЛИТ ПЕРЕСЧИТЫВАЕТСЯ ПО РЯДУ: `index` у плитной ячейки — место среди ПЛИТ в том
 * порядке, в каком они стоят на экране, и именно по нему листает увеличенный вид.
 */
export function sideCells(
  benchKind: 'flat' | 'render',
  sides: BenchSide[],
  plates: DocumentPlate[],
  cardViewOf: (mediaId: number) => string,
): { cells: SheetCell[]; ordered: DocumentPlate[] } {
  const used = new Set<number>();
  const ordered: DocumentPlate[] = [];
  const cells: SheetCell[] = [];
  const place = (plate: DocumentPlate) => {
    used.add(plate.mediaId);
    cells.push({ type: 'plate', plate, index: ordered.length });
    ordered.push(plate);
  };
  for (const side of sides) {
    const inSlot = side.picture?.media?.id ?? 0;
    const bySlot = inSlot > 0 ? plates.find((p) => p.mediaId === inSlot && !used.has(p.mediaId)) : undefined;
    const byCard =
      bySlot ??
      plates.find(
        (p) => !used.has(p.mediaId) && p.origin === 'card' && cardViewOf(p.mediaId) === side.view,
      );
    if (byCard) place(byCard);
    else cells.push({ type: 'slot', benchKind, view: side.view, slotRev: side.slotRev });
  }
  for (const plate of plates) if (!used.has(plate.mediaId)) place(plate);
  return { cells, ordered };
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

/**
 * The card's own kind → the side it IS. The inverse of `BENCH_VIEW_MEDIA_KIND`, and the reason
 * both are spelled here: a live card enters with `FRONT`/`BACK` in its media and an empty bench,
 * and the sheet's front cell must show that front rather than an empty slot beside it (D-15).
 */
const CARD_KIND_VIEW: Partial<Record<common_TechCardMediaKind, string>> = {
  TECH_CARD_MEDIA_KIND_FRONT: 'front',
  TECH_CARD_MEDIA_KIND_BACK: 'back',
  TECH_CARD_MEDIA_KIND_SIDE_L: 'side_l',
  TECH_CARD_MEDIA_KIND_SIDE_R: 'side_r',
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
      // КЛЮЧ — ПО МЕДИА, у всех плит листа одинаково (довод у `bandPlates`): плита не меняет
      // ключа оттого, что её взяли на карточку или сняли с неё.
      key: `m-${mediaId}`,
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
      key: `m-${mediaId}`,
      name: (slot!.detailName ?? '').trim() || viewLabel(view).toUpperCase() || 'detail',
      mediaId,
      media,
      origin: 'bench',
      benchKind: 'flat',
      door: benchDoor({ viewKey: slot!.viewKey, id: slot!.id }),
      viewKey: view,
      displayOnly: pictureIsDisplayOnly(slot!.picture) || undefined,
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
  // `registerUpload` — та же дверь, которой полоса входа кладёт файл в слот (D-10) и которой
  // «принести свою модель» файлит `.glb`: лист пишет слот и витринный кадр ЕЮ, а не своей.
  const { setPictureSelected, registerUpload } = useDesignWrites(techCardId);

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
  // The FLAT bench: `documentPlates` below offers bench plates to the DOCUMENT, and «whatever is
  // marked here is what the sheet and the tech pack read» is the flat bench's own subtitle. Before
  // the kind filter (L-5) a render front row could displace the flat front in this read.
  const bench = useMemo(() => readBench(band, 'flat'), [band]);
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
    // ОБА ВЕРСТАКА, впрямую по строкам: это разрешение БАЙТОВ по media_id, а не чтение одного
    // верстака — плита render-верстака, взятая в медиа карточки, обязана разрешаться так же.
    for (const slot of band.bench ?? []) {
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
  }, [card?.resolvedTechnicalMedia, techCard?.resolvedTechnicalMedia, band.runs, band.bench, picked]);

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
    // ОБА ВЕРСТАКА, впрямую по строкам: карта разрешает media_id → картинку, а не читает один
    // верстак, и плита render-верстака имеет ровно те же права на своё имя в пилюле «base».
    for (const slot of band.bench ?? []) {
      const picture = slot?.picture;
      const id = picture?.media?.id ?? 0;
      if (picture && id > 0 && !map.has(id)) map.set(id, picture);
    }
    return map;
  }, [band.runs, band.bench]);

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

  /**
   * ═══ ВЕРСТАКИ, ЧЬИМ ВТОРЫМ ЛИЦОМ СТАЛ ЛИСТ (D-15) ══════════════════════════════════════════
   *
   * Флэт-верстак уже читался (`bench`, для плит документа); рендер-верстак — тот же, что у 3D
   * (`threedSides` = `benchSides(band, 'render', 0)`), и лист показывает его СТОРОНАМИ: заполненная
   * — плитой, пустая — плейсхолдером, который пишет в слот.
   */
  const flatSides = useMemo(() => benchSides(band, 'flat', COLORWAY_NONE), [band]);
  const renderSides = useMemo(() => benchSides(band, 'render', COLORWAY_NONE), [band]);

  const segments = useMemo(() => {
    const of = (p: DocumentPlate) => artifactKindOf(p.mediaId, runKinds, cardKindOf.get(p.mediaId));
    const mark = (list: DocumentPlate[]) =>
      list.map((p) => {
        const chosen = p.chosen || chosenMedia.ids.has(p.mediaId);
        const pictureId = p.pictureId ?? chosenMedia.idByMedia.get(p.mediaId);
        if (chosen === !!p.chosen && pictureId === p.pictureId) return p;
        return { ...p, chosen, pictureId };
      });
    const cardViewOf = (mediaId: number) =>
      CARD_KIND_VIEW[(cardKindOf.get(mediaId) ?? '') as common_TechCardMediaKind] ?? '';
    const asCells = (list: DocumentPlate[]): SheetCell[] =>
      list.map((plate, index) => ({ type: 'plate', plate, index }));

    const onCard = new Set(plates.map((p) => p.mediaId));

    // ФЛЭТЫ: документ + флэт-верстак (`plates`) + витринные флэты; стороны по порядку.
    const flatAll = mark([
      ...plates.filter((p) => of(p) === 'flat'),
      ...displayOnlyPlates(band, 'flat', new Set(onCard)),
    ]);
    const flat = sideCells('flat', flatSides, flatAll, cardViewOf);

    // РЕНДЕРЫ: плиты рендер-верстака — ДО выходов ленты и вместе с карточными: слот старше
    // списка «всё, что есть». Занятые слотом медиа не предлагаются второй раз из ленты.
    const seenRender = new Set(onCard);
    const benchRender = renderBenchPlates(renderSides, onCard, seenRender);
    const renderBand = bandPlates(band, 'render', seenRender);
    const renderAll = mark([
      ...plates.filter((p) => of(p) === 'render'),
      ...benchRender.filter((p) => p.origin === 'bench'),
      ...renderBand.plates,
    ]);
    const render = sideCells('render', renderSides, renderAll, cardViewOf);

    const patternBand = bandPlates(band, 'pattern', new Set(onCard));
    const threedBand = bandPlates(band, 'threed', new Set(onCard));
    const onmodelBand = bandPlates(band, 'onmodel', new Set(onCard));
    const patternAll = mark([...plates.filter((p) => of(p) === 'pattern'), ...patternBand.plates]);
    const threedAll = mark([...plates.filter((p) => of(p) === 'threed'), ...threedBand.plates]);
    const onmodelAll = mark([...plates.filter((p) => of(p) === 'onmodel'), ...onmodelBand.plates]);
    return {
      flat: { plates: flat.ordered, cells: flat.cells, filteredToSelected: false, serverStates: true },
      // K-15 — ПЛИТКИ ПОПАДАЮТ СЮДА ТЕМ ЖЕ ПУТЁМ, ЧТО РЕНДЕРЫ: сначала те, что уже в медиа
      // карточки, потом помеченные `selected` из ленты. Сужение до помеченных — то же правило и
      // ПО РОДУ: вердикт «эта плитка» ничего не говорит о том, какой рендер выбран.
      pattern: {
        plates: patternAll,
        cells: asCells(patternAll),
        filteredToSelected: patternBand.filteredToSelected,
        serverStates: patternBand.serverStates,
      },
      render: {
        plates: render.ordered,
        cells: render.cells,
        filteredToSelected: renderBand.filteredToSelected,
        serverStates: renderBand.serverStates,
      },
      threed: {
        plates: threedAll,
        cells: asCells(threedAll),
        filteredToSelected: threedBand.filteredToSelected,
        serverStates: threedBand.serverStates,
      },
      onmodel: {
        plates: onmodelAll,
        cells: asCells(onmodelAll),
        filteredToSelected: onmodelBand.filteredToSelected,
        serverStates: onmodelBand.serverStates,
      },
    };
  }, [plates, band, runKinds, cardKindOf, chosenMedia, flatSides, renderSides]);

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
  const [tool, setTool] = useState<string | null>(DEFAULT_TOOL);
  /** Сколько якорей набрано в незавершённом жесте — подсказку рисует панель, а она снаружи. */
  const [placed, setPlaced] = useState(0);
  /**
   * ВЫНОСКА ПОД КУРСОРОМ В СПИСКЕ CALLOUTS (C-2) — индекс строки формы, как и `selected`. Плита
   * подсвечивает её накладкой; хранится здесь, потому что список и плита — соседи, и общий у них
   * только этот панель.
   */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** Плита, чью 3D-модель открыли в окне (D-26). Плита, а не адрес: окну нужно её имя. */
  const [viewing3d, setViewing3d] = useState<DocumentPlate | null>(null);
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
   * ═══ УКАЗАНИЕ СТАВИТСЯ НА ЛЮБУЮ ПЛИТУ С КАРТИНКОЙ, И ВЗЯТИЕ НА КАРТОЧКУ — ЧАСТЬ ЖЕСТА (D-18) ═══
   *
   * `media_id` выноски по-прежнему адресует медиа КАРТОЧКИ — это провод, и он не тронут. Что
   * изменилось: шаг «сначала возьми плиту к себе» больше не стоит ПЕРЕД первым кликом, а
   * исполняется ИМ. Владелец: «колаут мод должен быть сразу включен тк там уже сразу выбранные
   * нами в слоты медиа» — то есть плита в слоте для него уже своя, и просить нажать `take in`
   * ради права поставить точку — это просить подтвердить решение, которое он принял, кладя
   * картинку в слот. `addCalloutOn` дописывает медиа в форму тем же путём, что `take in`, и
   * говорит об этом одной строкой; сама дверь `take in` остаётся для тех, кто хочет взять плиту
   * на бумагу без единого указания.
   *
   * Нельзя только там, где рисовать не по чему: файл модели без растра (`modelOnly`).
   */
  const canPlaceOn = (plate: DocumentPlate) =>
    !disabled && canDraw && !plate.modelOnly && !!plate.media;
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
    /* ПЕРВОЕ УКАЗАНИЕ БЕРЁТ ПЛИТУ НА КАРТОЧКУ (D-18, довод у `canPlaceOn`). Плита ищется по
       СЕГМЕНТУ на экране: род, под которым она ляжет в медиа, — это род вкладки. */
    const plate = onScreen.find((p) => p.mediaId === mediaId);
    if (plate && plate.origin !== 'card') takeIntoCard(plate, { withCallout: true });
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

  /**
   * ОБВЯЗКА ПОВЕРХНОСТИ — ОДНА НА ОБА ЕЁ ВОПЛОЩЕНИЯ: плита в ряду и она же во весь экран. Второй
   * набор колбэков означал бы, что перетаскивание маркера в увеличенном виде и на плитке пишут
   * разными путями, и разойтись им негде, кроме как молча.
   */
  /**
   * ВЗВОД «+ POINT» ЛИСТА ARTIFACTS. Тот же довод, что у выбора: кнопка стоит в списке CALLOUTS
   * сбоку, а клик, которого она ждёт, приходит на ПЛИТУ — держать взвод внутри плиты значило бы,
   * что кнопка не может ни поднять его, ни погасить.
   *
   * Строку здесь адресуют ИНДЕКСОМ, поверхность — строковым ключом: перевод в обе стороны стоит
   * ровно `String`/`Number`, как и у выбора выше.
   */
  const [addingCallout, setAddingCallout] = useState<number | null>(null);

  const surfaceBindings = {
    addingKey: addingCallout == null ? null : String(addingCallout),
    onAddingChange: (key: string | null) => setAddingCallout(key == null ? null : Number(key)),
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
      // Взвод принадлежит ОДНОЙ записке: перевыбор — уже другая строка.
      setAddingCallout(null);
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
  function takeIntoCard(plate: DocumentPlate, opts?: { withCallout?: boolean }) {
    const media = form.getValues('technicalMedia') ?? [];
    if (media.some((m) => (m.mediaId ?? 0) === plate.mediaId)) return;
    // Вид — по происхождению плиты. У ФЛЭТ-верстачной он выводится из слота ТЕМ ЖЕ правилом, что
    // у серверного минта (см. BENCH_VIEW_MEDIA_KIND); у плиты РЕНДЕР-верстака и у плиты прогона
    // это RENDER, потому что в словаре карточки нет члена ни для «рендера переда», ни для
    // 3D-кадра, а RENDER по контракту и значит «принятая картинка прогона, уходящая с карточкой».
    // Витринный флэт (`run` в сегменте флэтов) — DETAIL: рендером он не является.
    const mediaKind: common_TechCardMediaKind =
      plate.origin === 'bench' && plate.benchKind !== 'render'
        ? (BENCH_VIEW_MEDIA_KIND[(plate.viewKey ?? '').trim()] ?? 'TECH_CARD_MEDIA_KIND_DETAIL')
        : kind === 'flat'
          ? 'TECH_CARD_MEDIA_KIND_DETAIL'
          : 'TECH_CARD_MEDIA_KIND_RENDER';
    form.setValue(
      'technicalMedia',
      [...media, { mediaId: plate.mediaId, kind: mediaKind, caption: '' }],
      { shouldDirty: true },
    );
    // ЧТО ГОВОРИТСЯ ЧЕЛОВЕКУ. Здесь стояло «it is not on the technical sheet, and callouts drawn
    // on it are not either» — неправда: печать берёт `technicalMedia` целиком, и внесённая плита
    // уходит на страницу технического эскиза вместе со своими выносками. Сообщение называет
    // приобретённое СЛЕДСТВИЕ, потому что именно оно тут решается, а не «положил в список».
    showMessage(
      opts?.withCallout
        ? `${plate.name} joined the card’s media with its first callout — it prints on the tech pack’s technical sketch page`
        : plate.origin === 'bench'
          ? 'taken into the card’s media as its bench view — you can draw on it now'
          : 'taken into the card’s media: it prints on the tech pack’s technical sketch page, with any callout you draw on it',
      'success',
    );
  }

  /**
   * ═══ ФАЙЛ В ПУСТУЮ СТОРОНУ ЛИСТА — ЭТО ЗАПИСЬ В СЛОТ СТУДИИ, ОДНОЙ ТРАНЗАКЦИЕЙ (D-15) ═════════
   *
   * Тот же вызов, что у полосы входа (`threed-input-strip.tsx:placeMedia`, D-10) и у верстака
   * (`bench.tsx:placeMedia`): `RegisterDesignUpload` заводит медиа в полосу И кладёт кадр в
   * сторону, названную в `target`. Лист ничего не пишет в форму: слот принадлежит студии, а
   * лист — его второе лицо; на карточку плита придёт первым указанием (D-18) или дверью `take in`.
   *   · `kind` — род ВЕРСТАКА, в который положили: под стороной флэтов приходит флэт, под
   *     стороной рендеров — рендер, и ничто ниже не восстановит это по пикселям;
   *   · `ghostView` — сторона, которую человек ТОЛЬКО ЧТО НАЗВАЛ, положив файл в этот слот;
   *   · колорвей — по правилу рефа (`refColorwayFor`): у флэта его нет по существу (L-4), у
   *     рендера это безколорвейный верстак, единственный, который пишет студия;
   *   · `expectedSlotRev` — ревизия строки, прочитанная ЭТИМ рендером;
   *   · `clientRequestId` минтится один раз на намерение, не внутри мутации.
   * ⚠ БЕЗ `slotId`: `view_key` и `slot_id` — члены одного `oneof` (F-11).
   */
  function placeInSlot(
    benchKind: 'flat' | 'render',
    view: string,
    slotRev: number,
    items: common_MediaFull[],
  ) {
    const first = items[0];
    const mediaId = first?.id ?? 0;
    if (!mediaId) return;
    const colorwayId = refColorwayFor(benchKind, COLORWAY_NONE);
    const item: WireUploadItem = {
      mediaId,
      ghostView: view,
      kind: benchKind,
      colorwayId,
      compositeViews: undefined,
      displayOnly: false,
    };
    registerUpload.mutate({
      clientRequestId: newClientRequestId(),
      items: [item],
      target: { viewKey: view, kind: benchKind, colorwayId },
      expectedSlotRev: slotRev,
    });
    if (items.length > 1) {
      showMessage(
        `one file per side — the first one went into ${viewLabel(view)}, the other ${items.length - 1} did not`,
        'error',
      );
    }
  }

  /**
   * ═══ МЕДИА ТОЛЬКО ДЛЯ ПОКАЗА — БЕЗ СЛОТА, БЕЗ ПРОМПТА (D-24) ═══════════════════════════════════
   *
   * Владелец: «в THE SHEET должна быть возможность добавить отдельно медиа без слотов КОТОРЫЕ НЕ
   * ПОЙДУТ в промпты они нужны только для визуализации в артефактах дополнительной». Кадр
   * заводится в полосу ТЕМ ЖЕ `RegisterDesignUpload`, но с `display_only`: сервер сам откажет ему
   * в слоте, в референсах и у денежной двери, и клиенту остаётся только назвать, ЧТО он положил.
   *
   * РОД — ПО ВКЛАДКЕ, где человек стоит: витринный флэт под флэтами, витринный рендер под
   * рендерами. У перекраса своего рода загрузки нет (`kind` знает flat | render | threed |
   * pattern), и на вкладке ON MODEL витринный кадр честно файлится рендером — дверь говорит это
   * заголовком до нажатия, а не тостом после.
   */
  function displayOnlyFromLibrary(items: common_MediaFull[]) {
    const uploadKind: 'flat' | 'render' | 'threed' | 'pattern' =
      kind === 'onmodel' ? 'render' : kind;
    const lands = ARTIFACT_KINDS.find((k) => k.value === uploadKind)?.label ?? uploadKind;
    const wire: WireUploadItem[] = items
      .filter((it) => (it.id ?? 0) > 0)
      .map((it) => ({
        mediaId: it.id as number,
        ghostView: '',
        kind: uploadKind,
        colorwayId: COLORWAY_NONE,
        compositeViews: undefined,
        displayOnly: true,
      }));
    if (!wire.length) return;
    registerUpload.mutate(
      { clientRequestId: newClientRequestId(), items: wire },
      {
        onSuccess: () =>
          showMessage(
            `${wire.length === 1 ? 'one picture' : `${wire.length} pictures`} filed for display only — shown under ${lands}, never sent to a prompt`,
            'success',
          ),
      },
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
        `the card’s media has no kind for ${kind === 'pattern' ? 'a repeating tile' : kind === 'onmodel' ? 'an on-model photograph' : 'a 3D model'}, so this one is filed as a render — it is listed under ${ARTIFACT_KINDS.find((k) => k.value === lands)?.label ?? lands}, and it prints like any other plate`,
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
  /**
   * ═══ …И ТОЛЬКО ТЕ, ЧТО СТОЯТ НА ПЛИТАХ ТЕКУЩЕЙ ВКЛАДКИ (C-1) ══════════════════════════════════
   *
   * Владелец: «в ARTIFACTS в зависимости от того на какой мы вкладке должны в боковом меню
   * показывать только те колауты которые на этом листе флет рендер или лист и тд». ЗАМЕРЕНО ДО:
   * на вкладке FLATS список показывал пять строк, пятая — с плиты RENDER (`w19-before-flats.png`,
   * пилюля «RENDER» в списке под флэтами). Членство считается по плитам СЕГМЕНТА НА ЭКРАНЕ, а не
   * по документу целиком; индекс строки в полном массиве при этом цел (довод ниже не менялся).
   */
  const sheetRows = useMemo(() => {
    const onTab = new Set(onScreen.map((p) => p.mediaId));
    return callouts
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => onTab.has(c.mediaId ?? 0));
  }, [callouts, onScreen]);

  /** Read once, so the question and the act cannot disagree about how many are at stake. */
  const detachCount = detaching ? calloutsOn(detaching.mediaId) : 0;

  /**
   * ЖИВА ЛИ ДВЕРЬ «ТОЛЬКО ДЛЯ ПОКАЗА» ПРОТИВ ЭТОГО БИНАРЯ (D-24). `false` — сервер поля не знает,
   * и дверь стоит инертной с причиной; `true`/`null` — живой (довод у `serverStatesDisplayOnly`).
   */
  const displayOnlyDoor = useMemo(() => serverStatesDisplayOnly(band), [band]);

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
              <div className='flex flex-wrap items-center gap-2'>
                <Text size='micro' variant='label' component='span'>
                  {segment.plates.length} picture{segment.plates.length === 1 ? '' : 's'}
                  {/* ⚠ ОХВАТ НАЗЫВАЕТСЯ ТЕМ, ЧЕМ ОН СТАЛ. Список этого сегмента — плиты карточки
                      плюс ВЫХОДЫ ВСЕЙ КАРТОЧКИ (H-9), и фраза про страницу ленты над сорока
                      рендерами двадцати прогонов — ровно та неправда охватом, которую владелец
                      поймал на соседнем экране. Читается БИНАРЬ (`serverStatesOutputs`), а не
                      длина списка: на сервере старше поля читатели по-прежнему обходят страницу,
                      и прежние слова там по-прежнему верны. */}
                  {kind !== 'flat' &&
                    (segment.filteredToSelected
                      ? ' · the chosen ones'
                      : serverStatesOutputs(band)
                        ? ' · everything this card holds'
                        : ' · everything on this page')}
                </Text>
                {/* ═══ ДВЕРЬ «ТОЛЬКО ДЛЯ ПОКАЗА» — В ШАПКЕ РЯДА, А НЕ ВТОРОЙ ПЛИТОЙ (D-24) ═══════
                    Слот «+ add …» в конце ряда кладёт файл В ДОКУМЕНТ (или в слот); эта дверь —
                    наоборот, никуда: кадр остаётся в полосе витринным. Две пунктирные плиты
                    по 680px в конце каждого ряда спорили бы друг с другом ростом, а не
                    смыслом; тихая кнопка у счёта говорит своё одной строкой заголовка.
                    Сама библиотека — тот же `MediaSelector`, что за слотом: свой пикер завёл
                    бы второй диалект выбора. */}
                {!disabled &&
                  (displayOnlyDoor === false ? (
                    <Button
                      variant='secondary'
                      size='xs'
                      disabled
                      data-display-only-door='inert'
                      title={`+ display only — ${DISPLAY_ONLY_NOT_STATED}`}
                    >
                      + display only
                    </Button>
                  ) : (
                    <MediaSelector
                      label='+ display only'
                      purpose='display only · shown on the sheet, never sent to a prompt'
                      aspectRatio={['Custom']}
                      allowMultiple
                      showVideos={false}
                      saveSelectedMedia={displayOnlyFromLibrary}
                      trigger={
                        <Button
                          variant='secondary'
                          size='xs'
                          data-display-only-door='live'
                          title={`a picture shown under ${ARTIFACT_KINDS.find((k) => k.value === kind)?.label ?? kind} for looking at only — it goes into no slot and is never sent to a prompt${kind === 'onmodel' ? '; the card has no on-model upload kind, so it is filed as a render' : ''}`}
                        >
                          + display only
                        </Button>
                      }
                    />
                  ))}
              </div>
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
                                `· everything this card holds` (и `· everything on this page` на
                                сервере старше поля `outputs`);
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
          {/* ═══ СТРОК «click the plate you mean» И «arm a kind, then click a plate…» ЗДЕСЬ БОЛЬШЕ
              НЕТ (D-22, D-23) — И НЕ ПОТОМУ, ЧТО ИХ ВЫЧЕРКНУЛИ. Они объясняли порядок «сначала
              взведи, потом выбери плиту», а порядка не стало: вид взведён с открытия (D-18,
              `DEFAULT_TOOL`), плита выбрана самим слотом (D-15). Подсказка палитры остаётся,
              но только когда она сообщает ход жеста — набранные точки многоточечного вида; у
              взведённой по умолчанию записки без единой точки ей нечего сказать, кроме тех же
              снятых слов. */}
          {drawableHere && (
            <GroupLabel
              lead={
                <AnnotationToolbar
                  tool={tool}
                  onTool={setTool}
                  hint={
                    tool && (placed > 0 || tool !== DEFAULT_TOOL)
                      ? placingHint(tool, placed)
                      : undefined
                  }
                />
              }
            >
              draw
            </GroupLabel>
          )}

          {/* `EmptyDocument` СНЯТ ВМЕСТЕ С ЕГО ЧЕТЫРЬМЯ КНОПКАМИ «front slot ✗» (D-15): стороны
              стоят теперь В САМОМ РЯДУ плейсхолдерами, и кнопка, ведущая к слоту, рядом с самим
              слотом — второй орган на одно место. */}
          <>
            {/* ПУСТОЙ СЕГМЕНТ ГОВОРИТ, ОТКУДА БЕРУТСЯ ЕГО КАРТИНКИ, И ОСТАВЛЯЕТ РЯД НА МЕСТЕ.
                Раньше здесь стояла ТОЛЬКО эта строка, вместо ряда целиком, — и вместе с рядом
                исчезала дверь загрузки. То есть на карточке без единого рендера положить свой
                рендер было нельзя вовсе, ровно вопреки V-20 (г) («если мы не хотим генерировать
                их в нашем туле»): отсутствие генерации и было тем случаем, ради которого дверь
                просили. Теперь ряд рисуется всегда, и в пустом сегменте он состоит из слотов
                сторон (у флэтов и рендеров) и одного добавляющего слота. */}
            {onScreen.length === 0 && (
              <Text size='micro' variant='label' component='p'>
                {kind === 'flat'
                  ? 'nothing is drawn on this card yet. Put a flat into a side below, or draw one on STUDIO — callouts are placed on the plate itself, here, once one exists.'
                  : kind === 'render'
                    ? 'no render of this card yet. A fabric render is made on STUDIO, from the flats standing in the bench slots — or put your own file into a side below.'
                    : kind === 'pattern'
                      ? 'no tile of this card yet. A repeating tile is made on STUDIO → PATTERN, out of one picture; the ones you mark as chosen there are listed here — or put your own file into the slot below.'
                      : kind === 'onmodel'
                        ? 'no on-model picture of this card yet. STUDIO → ON MODEL re-dresses a photograph of a person in this garment; the ones you mark as chosen there are listed here.'
                        : 'no 3D of this card yet. A model is built on STUDIO from the renders standing in the sides — or put your own file into the slot below.'}
              </Text>
            )}
              <PlateGrid
                cells={segment.cells}
                layout={layout}
                hoverIndex={hoverIndex}
                onSlotMedia={!disabled ? placeInSlot : undefined}
                onView3d={setViewing3d}
                calloutsOf={calloutsOfPlate}
                selected={selected}
                canPlaceOn={canPlaceOn}
                tool={tool}
                /* ОДНОРАЗОВЫЙ ЖЕСТ ВОЗВРАЩАЕТ РУКУ К ЗАПИСКЕ, А НЕ К ПУСТОТЕ (D-18): лист живёт с
                   взведённым видом, и «поставил линию — рука пуста» вернуло бы снятый порядок
                   «сначала взведи». */
                onToolDone={() => setTool(DEFAULT_TOOL)}
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
                        : kind === 'onmodel'
                          ? '+ add an on-model photo'
                          : '+ add a 3D model'
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
                      : kind === 'onmodel'
                        ? 'filed as a render: the card has no on-model kind'
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
        </Section>

        <Section
          title='callouts'
          question='— a number is minted once and never reused'
          action={
            /* ЧИСЛО = СПИСОК. Считается ровно то, что панель ниже рисует (`sheetRows`): выноски на
               плитах документа. Открученные и мудбордные не показываются — значит и не считаются;
               пилюли «unpinned» больше нет по слову владельца (R-14), а не по забывчивости. */
            <Pill tone='mut' data-callouts-count=''>
              {sheetRows.length} on {ARTIFACT_KINDS.find((k) => k.value === kind)?.label ?? kind}
            </Pill>
          }
          className='lg:w-[340px] lg:shrink-0'
        >
          <CalloutPanel
            rows={sheetRows}
            plates={onScreen}
            selected={selected}
            onSelect={setSelected}
            hoverIndex={hoverIndex}
            onHover={setHoverIndex}
            disabled={disabled}
            onRemove={!disabled ? removeCalloutAt : undefined}
            arrows={
              disabled
                ? undefined
                : noteArrowsOf(selected == null ? undefined : callouts[selected], {
                    arming: addingCallout != null && addingCallout === selected,
                    arm: () => setAddingCallout(selected),
                    cancel: () => setAddingCallout(null),
                  })
            }
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
                {onScreen[zoomAt].modelOnly
                  ? 'this is the model file itself — there is no raster to draw on; open it in 3D and take a snapshot to get one'
                  : drawInert}
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

      {/* ═══ ОКНО МОДЕЛИ — ТО ЖЕ, ЧТО ОТКРЫВАЕТ ПЛИТКА СТУДИИ (D-26) ═══════════════════════════════
          Одно окно на оба экрана, и снимок живёт в нём (довод в `threed/model-modal.tsx`).
          Карточка передаётся ПРОПОМ: лист её знает, и просить окно искать её по индексу, когда
          она на руках, значило бы полагаться на индекс там, где он не нужен. */}
      {viewing3d?.model && (
        <ThreedModelModal
          url={viewing3d.model}
          title={viewing3d.name}
          techCardId={techCardId}
          onClose={() => setViewing3d(null)}
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
    // КОЛОРВЕЙ — ТОЖЕ `undefined`, ПО ПРАВИЛУ ЭТОЙ ЖЕ ШАПКИ: ни одно поле не выдумывается. `0` на
    // проводе означало бы «не атрибутирован» — УТВЕРЖДЕНИЕ о картинке, которой в полосе нет вовсе;
    // мы же не знаем о ней ничего, кроме того, что её файл лежит в медиа карточки. `undefined` —
    // «эта подделка про колорвей не говорит», и `colorwayOf` читает его нулём там, где ответ
    // всё-таки нужен, не превращая молчание в запись.
    colorwayId: undefined,
    ghostView: undefined,
    compositeViews: undefined,
    derivedFrom: undefined,
    // И ГЛАГОЛ ПРОИСХОЖДЕНИЯ — ТОЖЕ МОЛЧАНИЕ, по тому же правилу. Пустая строка здесь была бы
    // УТВЕРЖДЕНИЕМ («сервер посмотрел и не смог определить»), а эта подделка ничего не смотрела:
    // она знает только, что файл лежит в медиа карточки. Читатели ленты требуют `'crop'` явно, и
    // молчание у них само выпадает из колоды — то есть подделка не может создать колоду.
    derivation: undefined,
    sourceClass: undefined,
    mixedInput: undefined,
    layerRev: undefined,
    hiddenAt: undefined,
    hiddenBy: undefined,
    createdAt: undefined,
    selected: undefined,
    displayOnly: undefined,
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
 *
 * ═══ 520 → 680: ЕЩЁ ВЫШЕ, ПО ПРЯМОМУ СЛОВУ (D-16) ═══════════════════════════════════════════════
 *
 * Владелец: «выота самих карточек должна быть больше чем сейчас в THE SHEET». Замерено ДО
 * (`w19-before-flats.png`, 1500×1300): кадр 520 из 1300 пикселей окна — две пятых. 680 — чуть
 * больше половины окна той же высоты: указание ставится по чертежу, а не по его миниатюре, и
 * альбомный флэт 4:3 (907 в ширину) всё ещё стоит в блоке рядом с плейсхолдером соседней
 * стороны. Дальше начинается один кадр на весь экран, то есть увеличенный вид, который уже есть.
 */
const PLATE_FRAME_HEIGHT = 680;

/**
 * ИНСТРУМЕНТ ПО УМОЛЧАНИЮ — ПЕРВЫЙ ЧИП ПАЛИТРЫ, И ОН ВЗВЕДЁН СРАЗУ (D-18).
 *
 * Владелец: «колаут мод должен быть сразу включен в THE SHEET тк там уже сразу выбранные нами в
 * слоты медиа». Раньше лист открывался в режиме чтения: сначала взведи вид, потом выбери плиту —
 * и две строки объясняли этот порядок («arm a kind, then click a plate…», «click the plate you
 * mean»). Порядка больше нет: лист открывается с записью в руке, а одноразовый жест (линия,
 * зона) возвращает её обратно, а не пустую руку. Обе строки сняты (D-22, D-23) как СЛЕДСТВИЕ, не
 * как правка текста: у них не осталось предмета.
 *
 * ЧИТАЕТСЯ ИЗ РЕЕСТРА, А НЕ ПИШЕТСЯ КЛЮЧОМ: палитра принадлежит `ui/annotation`, и её первый
 * чип — её решение; лист лишь берёт то, что палитра считает первым жестом.
 *
 * ЦЕНА НАЗВАНА: пока инструмент взведён, клик по уже стоящей выноске НА ПЛИТЕ не выбирает её
 * (поверхность прозрачна для попаданий во время постановки — иначе точку под чужой фигурой не
 * поставить). Выбирают из списка CALLOUTS рядом, где и пишут текст; чип «cancel» отдаёт руку
 * чтению, если надо потаскать маркеры кликом по плите.
 */
const DEFAULT_TOOL: string = PALETTE_KINDS[0]?.key ?? 'label';

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
  cells,
  layout,
  hoverIndex,
  onSlotMedia,
  onView3d,
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
  /** Ряд листа: плиты и пустые слоты сторон, в порядке показа (D-15, довод у `SheetCell`). */
  cells: SheetCell[];
  /** Лента с прокруткой или переносящийся ряд. Высота плиты от этого не зависит — см. V-20. */
  layout: PlateLayout;
  /** Индекс выноски под курсором в списке CALLOUTS — плита подсвечивает её накладкой (C-2). */
  hoverIndex: number | null;
  /** Файл из библиотеки в пустую сторону → слот студии, или `undefined` — карточка только читается. */
  onSlotMedia?: (
    benchKind: 'flat' | 'render',
    view: string,
    slotRev: number,
    items: common_MediaFull[],
  ) => void;
  /** Открыть модель, стоящую за плитой, в окне 3D (D-26). */
  onView3d: (plate: DocumentPlate) => void;
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
      {cells.map((cell) => {
        if (cell.type === 'slot') {
          return (
            <SlotTile
              key={`slot-${cell.benchKind}-${cell.view}`}
              benchKind={cell.benchKind}
              view={cell.view}
              onSelect={
                onSlotMedia
                  ? (items) => onSlotMedia(cell.benchKind, cell.view, cell.slotRev, items)
                  : undefined
              }
            />
          );
        }
        const { plate, index } = cell;
        if (plate.modelOnly) {
          return <ModelPlateTile key={plate.key} plate={plate} onView3d={onView3d} />;
        }
        const drawable = canPlaceOn(plate);
        const mine = calloutsOf(plate.mediaId);
        /* ВЫНОСКА ПОД КУРСОРОМ СПИСКА — ЕСЛИ ОНА НА ЭТОЙ ПЛИТЕ (C-2). Ключ поверхности — индекс
           строки формы строкой; сравнение ровно то же, что у выбора. */
        const hovered =
          hoverIndex == null ? undefined : mine.find((c) => c.key === String(hoverIndex));
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
            data-plate-media={plate.mediaId}
            className='group relative w-fit max-w-full shrink-0'
          >
            {/* ПОДСВЕТКА ВЫНОСКИ ИЗ СПИСКА (C-2) — накладка НАД кадром, прозрачная для указателя,
                тем же законом, что ярлык: под ней поверхность постановки. */}
            {hovered && <CalloutHighlight callout={hovered} />}
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
                  data-plate-name
                  className='min-w-0 truncate'
                >
                  {plate.name}
                </Text>
              {plate.origin === 'bench' && <Pill tone='mut'>bench</Pill>}
              {plate.origin === 'run' && <Pill tone='mut'>not on the card</Pill>}
              {plate.chosen && <Pill tone='ok'>chosen</Pill>}
              {/* КАДР ТОЛЬКО ДЛЯ ПОКАЗА ГОВОРИТ ЭТО САМ (D-24): голубая пилюля — «нужен человек»,
                  и здесь это верно буквально: в промпт этот кадр не уедет ни при каком жесте. */}
              {plate.displayOnly && (
                <Pill
                  tone='attention'
                  title='filed for display only — it goes into no slot and is never sent to a prompt'
                >
                  display only
                </Pill>
              )}
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
                    data-plate-note
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
                    {/* ═══ 3D — ДВЕРЬ В ОКНО МОДЕЛИ, ЗА КОТОРУЮ ЭТОТ РАСТР СТОИТ (D-26) ════════
                        Только у плиты, за которой модель есть: у чужой это обещание сцены,
                        которой нет. В том же ряду, что zoom: оба — «посмотреть крупнее». */}
                    {plate.model && (
                      <PlateCorner
                        label={`open the 3D model behind ${plate.name} — orbit it and take a snapshot from any angle`}
                        onPress={() => onView3d(plate)}
                      >
                        3D
                      </PlateCorner>
                    )}
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
 * ═══ ПУСТАЯ СТОРОНА ЛИСТА — И ЭТО ДВЕРЬ В СЛОТ СТУДИИ (D-15) ═══════════════════════════════════
 *
 * Тот же скелет, что у настоящей плиты и у добавляющей (ярлык накладкой, кадр во всю высоту),
 * и тот же `MediaSlot`, что у пустой стороны полосы входа (D-10): файл, положенный сюда, уезжает
 * в слот верстака одной записью, и лист узнаёт о нём тем же перечитыванием полосы, что студия.
 * Плейсхолдер, а не кнопка: на месте рамки появится ПЛИТА этой стороны.
 *
 * ИМЯ СТОРОНЫ — В ЯРЛЫКЕ, КАК У ПЛИТЫ: слот читается в ряду как «перед, которого нет», а не как
 * «пустая рамка». Обязательность переда и спинки — клиентское соглашение `SHEET_MIN_VIEWS`
 * (`views.ts`), сервер его не знает и ни на чём не настаивает: строка сообщает, но не запрещает.
 */
function SlotTile({
  benchKind,
  view,
  onSelect,
}: {
  benchKind: 'flat' | 'render';
  view: string;
  /** Файл в эту сторону, или `undefined` — карточка только читается, рамка стоит немая. */
  onSelect?: (items: common_MediaFull[]) => void;
}) {
  const label = viewLabel(view);
  const required = benchKind === 'flat' && SHEET_MIN_VIEWS.includes(view);
  const noun = benchKind === 'flat' ? 'flat' : 'render';
  return (
    <div
      data-plate-tile=''
      data-slot-cell={view}
      data-slot-bench={benchKind}
      className='group relative w-fit max-w-full shrink-0'
    >
      <div className={PLATE_BADGE_BAR}>
        <div className={PLATE_BADGE_CHIP}>
          <Text
            size='nano'
            variant='uppercase'
            tracking='label'
            component='span'
            className='min-w-0 truncate'
          >
            {label}
          </Text>
          <Pill tone={required ? 'attention' : 'mut'}>
            {required ? 'empty · required' : 'empty'}
          </Pill>
        </div>
        <span className={cn(PLATE_BADGE_CHIP, TILE_QUIET)}>
          <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
            {benchKind === 'flat'
              ? 'goes into the FLAT SLOT of this side on STUDIO'
              : 'goes into the FABRIC RENDER SLOT of this side on STUDIO'}
          </Text>
        </span>
      </div>
      {onSelect ? (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          heightPx={PLATE_FRAME_HEIGHT}
          label={`+ ${label} ${noun}`}
          purpose={`sheet · ${noun} for the ${label} slot`}
          showVideos={false}
          onSelect={onSelect}
          sizeClassName='w-auto max-w-[85vw]'
        />
      ) : (
        <div
          className='flex w-auto max-w-[85vw] items-center justify-center border border-dashed border-borderColor bg-bgZebra'
          style={{ height: PLATE_FRAME_HEIGHT, aspectRatio: '4/5' }}
          title={`no ${noun} stands in ${label}; this card is read-only for you`}
        >
          <Text size='micro' variant='label' component='span'>
            no {noun} in {label}
          </Text>
        </div>
      )}
    </div>
  );
}

/** Глиф модели — куб, как у двери «принести свою модель»: фотография обещала бы картинку. */
function ModelGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox='0 0 24 24'
      aria-hidden='true'
      className={cn('h-8 w-8', className)}
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
    >
      <path d='M12 2.75 20.5 7v10L12 21.25 3.5 17V7z' />
      <path d='M3.5 7 12 11.25 20.5 7' />
      <path d='M12 11.25v10' />
    </svg>
  );
}

/**
 * ═══ ПЛИТА-МОДЕЛЬ: РЕЗУЛЬТАТ 3D БЕЗ РАСТРА (D-26) ═══════════════════════════════════════════════
 *
 * Рисовать по `.glb` нечего, поэтому это не поверхность, а дверь тех же пропорций и той же высоты,
 * что соседние плиты: ряд остаётся рядом. Единственный жест — открыть модель; снимок с ракурса
 * делается уже в окне, и он и есть способ получить у такого результата растр.
 */
function ModelPlateTile({
  plate,
  onView3d,
}: {
  plate: DocumentPlate;
  onView3d: (plate: DocumentPlate) => void;
}) {
  return (
    <div
      data-plate-tile=''
      data-plate-media={plate.mediaId}
      data-plate-model=''
      className='group relative w-fit max-w-full shrink-0'
    >
      <div className={PLATE_BADGE_BAR}>
        <div className={PLATE_BADGE_CHIP}>
          <Text
            size='nano'
            variant='uppercase'
            tracking='label'
            component='span'
            data-plate-name
            className='min-w-0 truncate'
          >
            {plate.name}
          </Text>
          <Pill tone='mut'>3d file</Pill>
          {plate.chosen && <Pill tone='ok'>chosen</Pill>}
        </div>
        {plate.note ? (
          <span className={cn(PLATE_BADGE_CHIP, TILE_QUIET)}>
            <Text size='nano' variant='label' component='span' className='line-clamp-2 min-w-0 break-words'>
              {plate.note}
            </Text>
          </span>
        ) : null}
      </div>
      <button
        type='button'
        onClick={() => onView3d(plate)}
        title={`open ${plate.name} in 3D — orbit it and take a snapshot from any angle to get a picture of it`}
        className='flex w-auto max-w-[85vw] cursor-pointer flex-col items-center justify-center gap-2 border border-borderColor bg-bgZebra text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        style={{ height: PLATE_FRAME_HEIGHT, aspectRatio: '4/5' }}
      >
        <ModelGlyph />
        <Text size='micro' variant='label' component='span' className='uppercase'>
          open the model ▸
        </Text>
        <Text size='nano' variant='label' component='span' className='normal-case'>
          no thumbnail came back — a snapshot from the 3D window makes one
        </Text>
      </button>
    </div>
  );
}

/**
 * ═══ ПОДСВЕТКА ВЫНОСКИ, НАД КОТОРОЙ СТОИТ КУРСОР В СПИСКЕ (C-2) ═════════════════════════════════
 *
 * Владелец: «на ховер в левом меню CALLOUTS должны подсвечивать тот колаут который заховерили».
 *
 * НАКЛАДКА ЛИСТА, А НЕ СОСТОЯНИЕ ПОВЕРХНОСТИ. У поверхности своё наведение (маркер под мышью
 * гасит соседей), но снаружи его не задать: пропа нет, а файл чужой и прямо сейчас переписывается
 * соседней волной. Накладка живёт в долях кадра — тех же, в которых хранится выноска, — и потому
 * стоит ровно там, где стоит плашка: `left/top` в процентах кадра, чья высота задана числом, а
 * ширина равна ширине плиты (`w-fit`).
 *
 * КВАДРАТ ВОКРУГ ПЛАШКИ И ПУНКТИРНАЯ РАМКА ПО ЯКОРЯМ ФИГУРЫ — та же геометрия, какой поверхность
 * показывает ВЫБОР (маркиза): человек уже знает этот язык. Белая подложка в 2px — чтобы чернильная
 * рамка читалась и на пёстром рендере, где линия тонет.
 */
function CalloutHighlight({ callout }: { callout: SurfaceCallout }) {
  const pts = callout.points ?? [];
  const box =
    pts.length >= 2
      ? {
          x0: Math.min(...pts.map((p) => p.x)),
          y0: Math.min(...pts.map((p) => p.y)),
          x1: Math.max(...pts.map((p) => p.x)),
          y1: Math.max(...pts.map((p) => p.y)),
        }
      : null;
  return (
    <div
      data-callout-highlight={callout.key}
      aria-hidden='true'
      className='pointer-events-none absolute left-0 top-0 z-[6] w-full'
      style={{ height: PLATE_FRAME_HEIGHT }}
    >
      {box && (
        <div
          className='absolute border border-dashed border-textColor shadow-[0_0_0_2px_var(--color-bgColor)]'
          style={{
            left: `calc(${box.x0 * 100}% - 6px)`,
            top: `calc(${box.y0 * 100}% - 6px)`,
            width: `calc(${(box.x1 - box.x0) * 100}% + 12px)`,
            height: `calc(${(box.y1 - box.y0) * 100}% + 12px)`,
          }}
        />
      )}
      <div
        data-callout-highlight-mark=''
        className='absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 border-2 border-textColor shadow-[0_0_0_2px_var(--color-bgColor)]'
        style={{ left: `${callout.label.x * 100}%`, top: `${callout.label.y * 100}%` }}
      />
    </div>
  );
}

/**
 * ═══ ПИКТОГРАММА ВИДА УКАЗАНИЯ В СПИСКЕ (C-2) ═══════════════════════════════════════════════════
 *
 * Владелец: «в этом меню пиктограмкой помечать какой это вид колаута кривая там линия и тд».
 *
 * ВИД ЧИТАЕТСЯ ИЗ РЕЕСТРА (`kindDef`), И ГЛИФ КЛЮЧУЕТСЯ ЕГО ПОЛЕМ `tool` — тем же, каким палитра
 * сводит виды хранения к чипам: `dim` и `bracket` дают один глиф линии, `label` и `multi` — один
 * глиф записки. Ярлык и подсказка — тоже реестра: переименует его соседняя волна («line»,
 * «curve») — переименуется и здесь, без правки этого файла. Незнакомый вид рисуется словом, а не
 * пустотой: реестр отвечает пином на всё неизвестное, и глиф пина у него есть.
 */
function KindGlyph({ kind }: { kind: string }) {
  const def = kindDef(kind);
  const tool = def.tool;
  const common = {
    viewBox: '0 0 12 12',
    'aria-hidden': true as const,
    className: 'h-3 w-3 shrink-0',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const glyph =
    tool === 'label' ? (
      <svg {...common}>
        <path d='M1.5 10.5 6 6' />
        <rect x='5.5' y='1.5' width='5' height='4' />
      </svg>
    ) : tool === 'dim' ? (
      <svg {...common}>
        <path d='M1.5 6h9M1.5 3.5v5M10.5 3.5v5' />
      </svg>
    ) : tool === 'arc' ? (
      <svg {...common}>
        <path d='M1.5 9.5C3 2 9 2 10.5 9.5' />
      </svg>
    ) : tool === 'polygon' ? (
      <svg {...common}>
        <path d='M2 3.5 8 1.5l2.5 5.5L6 10.5 1.5 8z' />
      </svg>
    ) : tool === 'ink' ? (
      <svg {...common}>
        <path d='M1.5 8C3 2 5 10 7 5s3 4 3.5-2' />
      </svg>
    ) : tool === 'pin' ? (
      <svg {...common}>
        <circle cx='6' cy='6' r='3.5' />
        <circle cx='6' cy='6' r='1' fill='currentColor' />
      </svg>
    ) : null;
  return (
    <span
      data-callout-kind={tool}
      title={`${def.label} — ${def.hint}`}
      aria-label={def.label}
      className='inline-flex h-4 w-4 shrink-0 items-center justify-center text-labelColor'
    >
      {glyph ?? (
        <Text size='nano' variant='label' component='span'>
          {def.label}
        </Text>
      )}
    </span>
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
  hoverIndex,
  onHover,
  disabled,
  onRemove,
  arrows,
  focusToken = 0,
}: {
  rows: { c: SheetCallout; index: number }[];
  plates: DocumentPlate[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  /**
   * НАВЕДЕНИЕ НА СТРОКУ (C-2) — индекс формы, как у выбора. Мышью И фокусом: у клавиатуры ховера
   * не бывает, и подсветка только для мыши была бы органом не для всех (тот же довод, что у
   * `hoverNotes` поверхности).
   */
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
  disabled?: boolean;
  /** Удалить выноску целиком, или `undefined` — и двери нет: на выпущенной карточке её и не должно быть. */
  onRemove?: (index: number) => void;
  /**
   * ЛУЧИ ВЫБРАННОЙ ЗАПИСКИ. Считаются ОДНОЙ функцией с редактором под кадром (`noteArrowsOf`):
   * ответ на вопрос «есть ли у этого указания лучи» обязан совпадать на всех экранах.
   */
  arrows?: NoteArrows;
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
        none on this tab yet. A callout is placed on the picture itself — click a plate; the row
        appears here the moment it exists, and this is where its text is written.
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
        const hot = hoverIndex === index;
        return (
          <div
            key={index}
            data-callout-row={index}
            data-callout-hot={hot ? 'true' : undefined}
            /* СТРОКА ПОД КУРСОРОМ ЗАЛИВАЕТСЯ ПАНЕЛЬЮ (`bgSecondary` — «a fill, not a container»),
               а плита в тот же миг подсвечивает выноску: два конца одного жеста. */
            className={cn('border-b border-hairline py-1 px-1 -mx-1', hot && 'bg-bgSecondary')}
            onPointerEnter={() => onHover(index)}
            onPointerLeave={() => onHover(null)}
            onFocusCapture={() => onHover(index)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(null);
            }}
          >
            <div className='flex items-center gap-2'>
              <Text size='nano' variant='uppercase' component='span' className='w-5 shrink-0'>
                {c.number || '—'}
              </Text>
              <KindGlyph kind={c.kind ?? 'pin'} />
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
                  {/* НА МЕСТЕ «MAKE IT A PIN» — «+ POINT», И ЭТО ОБМЕН, А НЕ ДВЕ ПРАВКИ.
                      Убрана она вместе с «make it a point» редактора (E-27): жест один, имён было
                      два, и оставленная здесь кнопка вернула бы на соседний экран ровно то, что
                      владелец убрал. Смысла у неё тоже не осталось — пин ушёл из палитры (E-29).
                      Пришедшая на её место кнопка добавляет записке ещё один луч и заменяет собой
                      весь бывший «мультилидер». */}
                  {arrows &&
                    selected === index &&
                    (arrows.arming ? (
                      <Button
                        variant='secondary'
                        size='xs'
                        data-arrows='cancel'
                        onClick={arrows.cancel}
                        title='stop waiting for the click'
                      >
                        cancel
                      </Button>
                    ) : (
                      <Button
                        variant='secondary'
                        size='xs'
                        data-arrows='add'
                        disabled={arrows.full}
                        onClick={arrows.arm}
                        title={
                          arrows.full
                            ? `a note points at ${arrows.max} places at most`
                            : 'point this note at one more place — then click it on the plate'
                        }
                      >
                        + point
                      </Button>
                    ))}
                  <Text size='nano' variant='label' component='span' className='normal-case'>
                    {arrows && arrows.count > 1
                      ? `${arrows.count} points · shape and position are dragged on the plate itself`
                      : 'shape and position are dragged on the plate itself'}
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

