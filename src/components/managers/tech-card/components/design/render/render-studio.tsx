import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useCallback, useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import { HeaderNote } from 'ui/components/section-header';

import { ColourwayCreatePopover } from '../colourway-create';
import { ColourwayStrip } from '../colourway-strip';
import { GROUP_SEAM } from '../core';
import { openStepOf } from '../core/chain';
import { Workbench } from '../generation/studio';
import type { ClothSlot } from '../pattern/slot-fabrics';
import { packOf, useCardFit, useColourDraft } from './drafts';
import { GenerateRow, LockBar, RunRefusal } from './generate-row';
import {
  clampColourName,
  hexIsPaintable,
  recipeIsStated,
  renderGate,
  renderSheetViews,
  statedWords,
  wireColourSource,
  type Gate,
} from './model';
import { MaterialsPack } from './materials-pack';
import { InWords } from './palette';
import { RenderStepScope, type RenderStep } from './render-tile';
import { SidesSection, useSidesTarget } from './side-row';
import { useStartDesignRun, type StartRunInput } from './use-design-run';
import { seedBriefInFlight, settleSeedBrief } from '../words-brief';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE FABRIC RENDER STUDIO — step 4 of the chain, FOUR BLOCKS IN THE ORDER OF THE WORK:
 *
 *   FABRIC RENDER · the cloth on the flats                                          [STEP 4]
 *   ── MATERIALS ────── the colourway's pack from MATERIALS, read-only (V5: the pack is the recipe)
 *   ── IN WORDS ─────── the free text of the recipe
 *   GENERATE · priced by the server on start · WHAT THE MODEL GETS ▸
 *   WORKBENCH ─────────── the newest render run, its tiles with the doors, and under them the
 *                         GENERATION HISTORY folded — ONE block (T30; `Workbench`, O-63, O-67)
 *   SIDES ─────────────── one row per side: what went in, what came back (`SidesSection`)
 *
 * The rows INSIDE the first block are separated by group rules (`GroupLabel`), never by nested
 * boxes: a block never contains another block (DESIGN.md).
 *
 * ═══ RENDERS OF THIS CARD IS GONE (27.09, O-63, D-62) ════════════════════════════════════════
 * Owner, verbatim: «после генерации результат показывать как во флетах те с LATEST GENERATION и
 * GENERATION HISTORY свернут по дефолту и RENDERS OF THIS CARD получается не нужен». A render
 * lands under GENERATE as a flat does; the older runs stand in the history, folded; the plates
 * brought by hand that SIDES does not show stand there too, as one folded group («N brought ▸»).
 * Every one of those tiles carries the doors the section had (`./render-tile`), their rules one
 * hook per host and their refusal notes printed once per host.
 *
 * ⚠ ДВЕ ЛЕНТЫ С ВЕРХА ЭТОГО БЛОКА СНЯТЫ (r2 п.29–30, рулинги r1 §8.3/§8.10). Владелец, дословно:
 * «в FABRIC RENDER раньше было лучше чем сейчас … только таблицу вместо двух лент» и «весь блок
 * FLATS OF THIS CARD в FABRIC RENDER убери полностью и маркировка в SIDES будет происходить только
 * в блоке RENDERS OF THIS CARD». Поэтому здесь больше НЕТ ни `InputFlatsGroup`, ни `SidesGroup`, ни
 * пула неразмеченных чертежей (`RenderInputStrip bare`): стороны — своим блоком ниже, а разметка —
 * у самих картинок, где лежит материал (тогда в RENDERS OF THIS CARD, с O-63 — на плитках
 * последней генерации и истории).
 *
 * THE REFERENCES ARE NOT DRAWN HERE: a fabric render is coloured over THE FLATS OF THIS CARD, and
 * the model never sees the reference photographs. They belong to FLAT, one click away.
 *
 * ONE RUN COMES BACK AS ONE SHEET OF SEVERAL VIEWS (the owner's answer of 2026-08-31), split into
 * the slots afterwards; that is why the shape line names one picture however many sides stand.
 *
 * ═══ FIT IS NOT ON THIS SCREEN (J-20), BUT IT IS ON THE WIRE ═══════════════════════════════════
 * Владелец: «FIT полностью убираем отсюда». The server still freezes the card's fit into every
 * render's snapshot and prints it into the paid prompt, so `useCardFit` stays and feeds the modal
 * «what the model gets»: the inventory must name EVERYTHING that travels.
 *
 * ═══ THE COLOURWAY IS ONE NUMBER FOR THE WHOLE STUDIO, AND IT IS CHOSEN HERE (D2, G2-3) ════════
 * ОДНО СОСТОЯНИЕ (`useColorwayChoice` у композитора), показанное общей плиточной полосой над
 * рецептом. Выбор РЕШАЕТ: `colorway_id` прогона неизменяем, значит цель — часть покупки.
 * Верстак рендеров ПИШЕТ этот экран (SIDES снимает, `mark ▸` кладёт), ЧИТАЕТ 3D, СОБИРАЕТ сервер
 * (`designSelectBench`) — второй владелец числа заставил бы 3D смотреть в один верстак, пока
 * рендер наполняет другой.
 *
 * ⚠ РАБОЧАЯ ЦЕЛЬ СОВПАДАЕТ СО СТОЛБЦАМИ SIDES (O-57). Таблица рисует столбец `sample`, пока у
 * карточки нет ни одного колорвея (архивные тоже считаются, D-56″), и экран работает там, где
 * столбец виден: сохранённая цель без столбца (`sample` у карточки с колорвеями, списанный пустой
 * колорвей) читается ПЕРВЫМ столбцом. Столбца нет ни одного (одни архивные без плит) — цели нет,
 * и GENERATE закрыт той же фразой, что стоит строкой в таблице. Это число экран ВЫВОДИТ и никуда
 * не пишет — общий выбор студии двигает только жест человека (G2-7; разбор у `useSidesTarget`,
 * `./side-row`).
 *
 * ⚠ РЕМОУНТА ПО `key={colorwayId}` БОЛЬШЕ НЕТ, И ОН БЫЛ БЫ ТЕПЕРЬ ПРЯМЫМ ДЕФЕКТОМ: экран,
 * ремоунтящий сам себя на смене цели, закрывал бы собственную полосу прямо под пальцем. Пересев
 * цвета и привязанных тканей живёт внутри `useColourDraft`; ручные ткани сохраняются по его
 * правилам происхождения.
 */
export function RenderStudio({
  band,
  techCardId,
  disabled,
  onGoToKind,
  colorwayId: storedColorwayId = 0,
  colorwayRef: storedColorwayRef = null,
  colorwayLabel: storedColorwayLabel = '',
  colorwayArchived: storedColorwayArchived = false,
  colorways = [],
  onColorwayChange,
  cardColorways,
  slots,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ═══ ЦЕЛЬ ПРОГОНА ВЫБИРАЮТ ЗДЕСЬ, НО ВЛАДЕЕТ ЕЮ КОМПОЗИТОР (D2, G2-3) ════════════════════════
   *
   * Список колорвеев карточки и ТОТ ЖЕ САМЫЙ сеттер, которым пользуются чипы on-model. Второго
   * состояния не заводится: верстак рендеров ПИШЕТ этот экран, ЧИТАЕТ 3D, а СЕРВЕР по нему
   * собирает — заведи второго владельца, и полоса входа 3D показывала бы ROSSO, пока прогон
   * уезжает за OLIVE. Не задан `onColorwayChange` — полосы нет вовсе (композитор без оси).
   */
  colorways?: common_AdminColorwayRef[];
  onColorwayChange?: (id: number) => void;
  /**
   * O-57 r4 · КОЛОРВЕИ КАРТОЧКИ КАК ЕСТЬ — сырой список (`useColorwayChoice().cardColorways`),
   * архивные без плит тоже; `colorways` выше сужен. Нужен двум вопросам: стоит ли столбец `sample`
   * (D-56″: только пока у карточки нет ни одного колорвея, архивные тоже считаются —
   * `colourwayColumns`) и членству плиты у дверей рендера (колорвей, снесённый с карточки, против
   * архивного пустого, — разбор у `useRenderDoors`, `./render-tile`). Не задан — «не сказано»:
   * правило семпла считает по `colorways`, а двери не отказывают по членству.
   */
  cardColorways?: common_AdminColorwayRef[];
  /**
   * WHOSE render this is. `0` — верстак `sample`: не пропуск, а настоящее и вечно законное
   * значение, на котором стоит всякий рендер, сделанный до появления оси, и всякая проба цвета.
   * ⚠ ЭТО СОХРАНЁННАЯ ЦЕЛЬ СТУДИИ, А НЕ ОБЯЗАТЕЛЬНО ЦЕЛЬ ЭКРАНА (O-57): у `sample` рядом с
   * колорвеями столбца нет, и экран работает под первым столбцом SIDES, не трогая этого числа —
   * разбор у `useSidesTarget` (`./side-row`).
   */
  colorwayId?: number;
  /** Its row — the second half of the seed («its own colour», when it has no renders yet). */
  colorwayRef?: common_AdminColorwayRef | null;
  /** Its name — for refusals, captions and the recipe's `code`; `''` под `sample`, и это тоже ответ. */
  colorwayLabel?: string;
  /**
   * ⚠ ARCHIVED COLOURWAYS ARE NOT WORKED ON, and this is the only thing this screen refuses by the
   * name of a colour. Read by the GATE ONLY: the bench, the palette, the outputs and the split work
   * under an archived colourway word for word as under a live one.
   */
  colorwayArchived?: boolean;
  /**
   * ═══ СЛОТЫ ТКАНИ КАРТОЧКИ — ТОТ ЖЕ МАССИВ, ЧТО У ШАГА PATTERN (STEP 3) ═══════════════════════
   *
   * Читает их ОДИН `useWatch` композитора (`studio-tab.tsx`) и раздаёт обоим шагам: второе чтение
   * `bomItems` здесь развело бы PATTERN и FABRIC RENDER о том, какие у изделия ткани. Нужны ровно
   * двум органам, и оба про привязки (колорвей, слот): засеву тканей подачи (`useColourDraft`) и
   * сетке CLOTHS, которая ставит надетые плитки первыми и подписывает их слотом (`Palette`). Не
   * задан — привязок нет, и экран работает как до STEP 3.
   */
  slots?: readonly ClothSlot[];
  /**
   * Go to another step of the studio. The step lives in ONE place (`StudioTab`); a screen that kept
   * its own would desynchronise the rail from its own content.
   */
  onGoToKind?: (kind: 'flat' | 'pattern' | 'render' | 'threed' | 'onmodel') => void;
}): JSX.Element {
  /* ═══ O-57 · ЦЕЛЬ, ПОД КОТОРОЙ РАБОТАЕТ ЭКРАН, — ПЕРВЫМ ДЕЛОМ, ДО ВСЕХ ЕЁ ЧИТАТЕЛЕЙ ═════════════
     У сохранённой цели нет столбца в SIDES — экран работает под первым столбцом, и читают это
     число под прежними именами ВСЕ органы ниже: черновик рецепта, ворота, тело прогона, `for:` и
     сама таблица. Поднять его в одном из них (скажем, в лице селекта) значило бы купить лист под
     `sample`, показывая ROSSO. Композитору оно НЕ уходит: число выведено, а не выбрано, и общий
     выбор студии двигает только жест человека (G2-7, разбор у `useSidesTarget`). */
  const target = useSidesTarget(
    band,
    colorways,
    {
      colorwayId: storedColorwayId,
      ref: storedColorwayRef,
      label: storedColorwayLabel,
      archived: storedColorwayArchived,
    },
    /* D-56″: столбец `sample` решает СЫРОЙ список карточки — архивный без плит тоже колорвей. */
    cardColorways,
  );
  const { colorwayId, ref: colorwayRef, label: colorwayLabel, archived: colorwayArchived } = target;
  /* ⚠ `techCardId` ЗДЕСЬ НЕСУЩИЙ, А НЕ СПРАВОЧНЫЙ: черновик подачи умирает вместе с карточкой, и
     умирает он ПО ЭТОМУ ЧИСЛУ (`StudioTab` между карточками не размонтируется — инвариант 12).
     Без него на карточке B стояли бы ткани карточки A — `design_asset.id` ЧУЖОЙ полки, — и
     GENERATE покупал бы лист по чужому рецепту. Довод целиком — в шапке `useColourDraft`. */
  const draft = useColourDraft(band, colorwayId, colorwayRef, techCardId, slots);
  const cardFit = useCardFit();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the block. */
  const [inspecting, setInspecting] = useState(false);

  /**
   * ═══ РОЖДЕНИЕ КОЛОРВЕЯ — ОДНО ОКНО НА ЭКРАН, СКОЛЬКО БЫ ДВЕРЕЙ К НЕМУ НИ ВЕЛО (G2-4) ═════════
   *
   * Дверей три: плитка `new colourway`, заголовок-плейсхолдер столбца в SIDES и цель
   * `mark ▸` / `apply splitted` в блоке рендеров. Окно одно — иначе три копии формы разошлись бы в
   * проверке имени и в подборе словарного цвета, и разошлись бы молча.
   *
   * `after` — ЧТО ДОДЕЛАТЬ ПОСЛЕ УСПЕХА, и это ref, а не состояние: продолжение жеста ничего не
   * рисует, а состоянием оно давало бы вторую перерисовку ровно синхронно с первой. Дверь SIDES
   * просто переключает цель (продолжения нет), а `apply splitted` продолжает свой жест В НОВЫЙ
   * столбец — ему нужен id, которого до ответа сервера не существует.
   */
  const [creating, setCreating] = useState(false);
  const after = useRef<((id: number) => void) | null>(null);
  const openCreate = useCallback((then?: (id: number) => void) => {
    after.current = then ?? null;
    setCreating(true);
  }, []);

  /**
   * ⚠ КАРТОЧКА СМЕНИЛАСЬ — ОКНО ЗАКРЫВАЕТСЯ, ПРОДОЛЖЕНИЕ ЖЕСТА ЗАБЫВАЕТСЯ (инвариант 12).
   * `StudioTab` при смене карточки НЕ размонтируется, а продолжение держит план, собранный по
   * ПЛИТАМ ПРЕДЫДУЩЕЙ карточки: исполнить его под новой значило бы разложить чужие рендеры по её
   * слотам. В теле рендера, а не в эффекте: эффект оставил бы один закоммиченный кадр, в котором
   * карточка уже новая, а окно ещё чужое, — и по нему успевают нажать.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    after.current = null;
    if (creating) setCreating(false);
  }

  /**
   * ═══ WHAT THE RENDER DOORS OF THIS STEP READ — ONE VALUE FOR EVERY HOST (27.09, O-63, D-62) ═══
   * The tiles of the latest generation below GENERATE and the rows of GENERATION HISTORY (drawn
   * last, `children`) put a render into a side with the doors RENDERS OF THIS CARD had
   * (`render/render-tile.tsx`), and those doors read the step: the
   * colourway axis of SIDES (the narrowed list and the card's raw one, O-57 r4), whether the server
   * adopts a sample plate (B7 — `benchAdoptsUnattributed`, compared, never read as its absence) and
   * the one birth window of the screen. Stable while they are: the tiles re-render with the band,
   * not with every keystroke of the recipe above.
   */
  const renderStep = useMemo<RenderStep>(
    () => ({
      colorways,
      cardColorways,
      adopts: band.benchAdoptsUnattributed === true,
      onCreateColorway: openCreate,
    }),
    [colorways, cardColorways, band.benchAdoptsUnattributed, openCreate],
  );

  /**
   * THE VIEWS THIS RUN ASKS FOR, IN SHEET ORDER — a walk around the garment, narrowed to the slots
   * that hold a drawing. ⚠ SENT, PROMPTED AND SPLIT AS ONE LIST (`params.views` → `compositeViewsOf`
   * → the splitter's labels); sorting it anywhere else mislabels the cut frames.
   */
  const views = useMemo(() => renderSheetViews(band), [band]);

  /**
   * ONE POINT OF COMPOSITION FOR THE WHOLE SCREEN. The gate, the run body, the shape line and the
   * modal read ONE object; assembled in four places, the first divergence costs a bought picture.
   * ⚠ THE GATE READS THIS, NOT `draft.recipe`: a run stated only by opacity and weight is a legal
   * statement about the cloth (H-13).
   */
  // V5: the cloths that travel are the colourway's pack, whatever the draft held before.
  const pack = useMemo(() => packOf(band, colorwayId, slots), [band, colorwayId, slots]);
  const sent = useMemo(() => {
    const hex = hexIsPaintable(draft.recipe.hex) ? (draft.recipe.hex ?? '').trim() : '';
    return {
      ...draft.recipe,
      ...pack,
      /* ⚠ ONLY THE VISIBLE IN WORDS TEXT TRAVELS: the retired CLOTH IS opacity / GSM may still sit
         seeded in the hidden `draft.cloth`, and nothing unseen may be composed into a paid run. */
      words: statedWords({ recipe: draft.recipe, cloth: null }),
      /**
       * ⚠ THE COLOUR INVARIANT IS HELD BY THIS DOOR, NOT BY THE FIELD: no hex the screen calls
       * «not stated» travels. The client's predicate (`hexIsPaintable`) and the server's («any
       * non-empty hex») disagreed on five values out of six, and one value of the field bought a
       * different prompt than the one shown. The door PASSES OR DROPS, it does not repair —
       * completing the `#` lives at the field's blur, where the person sees the result.
       */
      hex,
      /**
       * ═══ ИМЯ ЦВЕТА — ЭТО ИМЯ КОЛОРВЕЯ, И СОБИРАЕТСЯ ОНО ЗДЕСЬ (H-8, п.23) ══════════════════════
       *
       * Поле «colour name» с экрана снято (пантон и есть описание), а промпт цитирует пару:
       * `colourPhrase` печатает «colourway <code> — the exact value is <hex>». Значит `code`
       * обязан приехать из ЕДИНСТВЕННОГО места, где он что-то значит, — из цели прогона. Под
       * `sample` цели нет, и поле уезжает ПУСТЫМ: ветка без кода печатает голый hex, и это правда
       * («мы просто семплимся»), а не пропуск.
       *
       * ⚠ ТОЛЬКО ВМЕСТЕ С ЦВЕТОМ. Имя без hex — это заявление о цвете, которого никто не делал:
       * ворота ниже (`recipeIsStated`) читают ту же склейку, и одно лишь имя цели открывало бы
       * GENERATE на карточке, где про ткань не сказано вообще ничего.
       */
      code: hex ? clampColourName(colorwayId > 0 ? colorwayLabel.trim() : '') : '',
    };
  }, [draft.recipe, pack, colorwayId, colorwayLabel]);

  /**
   * What will actually travel. ⚠ NO COLOUR MAPS ON THIS SCREEN: a saved colour plan would swap the
   * bound pack's fabrics for its own, so the run could buy cloth A while MATERIALS shows B — and the
   * palette, the only surface that repairs a plan, is not mounted. Fabrics come strictly from the
   * bound pack (`packOf`).
   */
  const wire = useMemo(() => ({ ...sent, colourMaps: [] }), [sent]);

  const gate: Gate = useMemo(() => {
    /* O-57 · D-56″: NO COLUMN AT ALL — the card has colourways, every one archived and without a
       plate, so the sample column is hidden and nothing is drawn in its place. There is no bench
       to buy into; the refusal is the SAME sentence the table prints, and its one way out — `+
       colourway…` — stands in `for:` in this very row, so no door is drawn (`next: 'colourway'`). */
    if (target.nowhere) return { ok: false, reason: target.nowhere, next: 'colourway' };
    /* An archived name refuses first — even before an empty bench: under a retired colour «front
       and back must hold a drawing» sends a person to draw what will not be bought anyway. */
    const base = renderGate(band, colorwayArchived, colorwayLabel);
    if (!base.ok) return base;
    /* No paint gate here: colour maps do not travel from this screen (see `wire`). */
    if (!recipeIsStated(wire)) {
      return {
        ok: false,
        reason:
          'no cloth is marked for this colourway · mark one in MATERIALS, or describe it in words',
      };
    }
    return { ok: true };
  }, [band, wire, colorwayArchived, colorwayLabel, target.nowhere]);

  const launch = () => {
    /* O-61 (D-60, D-71): слова карточки, показанные в пустом IN WORDS, становятся СВОИМИ черновику —
       как флэт отдаёт свой засев в форму перед `flush`; правка WORDS флэта после прогона их уже не
       подменит. Тело ниже несёт их и без этого (`wire` — слова на экране), поэтому до ответа
       черновик НЕ трогается (r4; ревью Codex FIX FIRST, Major 2): квитанция нажатия уходит в
       `onStarted` и отдаётся, только когда прогон заведён и поле показывает всё тот же засев. Отказ
       или обрыв не трогают ничего — слова остаются живым засевом. Свои слова уже стоят — квитанции
       нет. */
    const pressed = draft.wordsAtPress();
    const body: StartRunInput = {
      kind: 'render',
      ask: '',
      params: {
        views,
        // THE COLOURWAY OF THE RUN (L-2): the sheet being bought is of THIS colour; the server copies
        // the field onto the run so the history can be cut by colourway. `0` is «without a
        // colourway» — what every render made before the axis is, and the one value under which
        // the run's plates land on the unnamed bench.
        colorwayId,
        // ONE PICTURE, ALL THE VIEWS IN A ROW — the owner's own answer of 2026-08-31. `per_view`
        // was one PAID CALL per view; a sheet is one call, one cloth, one light, and the store's
        // `compositeViewsOf` records the row so the splitter can cut it afterwards.
        detailSlotIds: [],
        layout: 'one',
        colour: {
          ...wire,
          // DERIVED AT THE DOOR, NOT HELD BY A CONTROL: `source` predates combination and never
          // decides what travels — the populated fields do.
          source: wireColourSource(wire),
        },
        threed: undefined,
        fixTarget: '',
        extraInputMediaIds: [],
        // NOT A FIX, AND SAID EXPLICITLY IN BOTH SPELLINGS.
        fixTargets: [],
        fixSlotIds: [],
        // ASK FOR THE PROPOSED CUT. It cuts nothing by itself — the cut stays a person's — it only
        // records that the guess was wanted.
        autoSplit: true,
        pattern: undefined,
        // НЕ ПЛЕЙГРАУНД: поле осмысленно только на kind=freeform и на любом другом роде
        // отвергается сервером (`freeform_forbidden`), поэтому здесь оно названо пустым вслух.
        freeform: undefined,
        useFlatSlots: false,
        // Meaningful on kind=flat only; named because the contract wants the field named.
        flatSlotIds: [],
        image: undefined,
        inpaint: undefined,
        extend: undefined,
        video: undefined,
      },
    };
    run.start(body, pressed ? { onStarted: () => draft.materializeWords(pressed) } : undefined);
  };

  /* R2: бриф WORDS в пути — IN WORDS ещё пусто, и прогон ушёл бы без брифа. GENERATE ждёт его
     (кнопка занята), потом берёт ПОСЛЕДНЮЮ отрисовку — её слова, тело и ворота — и только на той же
     карточке. Набранные руками слова засев не трогает. */
  const [briefing, setBriefing] = useState(false);
  const latest = useRef({ launch, gate, disabled });
  latest.current = { launch, gate, disabled };
  const generate = async () => {
    const card = techCardId;
    if (!seedBriefInFlight(card)) {
      launch();
      return;
    }
    setBriefing(true);
    try {
      if ((await settleSeedBrief(card)) === 'busy') return;
    } finally {
      setBriefing(false);
    }
    const now = latest.current;
    if (shownCard.current !== card || !now.gate.ok || now.disabled) return;
    now.launch();
  };

  /* ⚠ СТРОКА СОСТАВА СНЯТА ЦЕЛИКОМ (r3 п.27) — «made of pattern 1 — … · split into the slots
     afterwards · priced by the server when the run starts». Владелец: «убрать».
     ЧТО ОНА ГОВОРИЛА И ГДЕ ЭТО ОСТАЛОСЬ, ПОШТУЧНО, потому что снимать строку, не проверив каждый
     её член, — это и есть тихая потеря:
       · «1 picture · N views in a row» и «split into the slots afterwards» — форма листа. Живёт в
         модалке «what the model gets», дверь которой стоит в ЭТОМ ЖЕ ряду, у правого края;
       · «made of …» — из чего сделан рецепт. Это дословный пересказ сетки CLOTH AND COLOUR,
         стоящей на три сантиметра выше: ткани там помечены «in» с номером, цвет — квадратом.
         ⚠ ФУНКЦИЯ, СОБИРАВШАЯ ЭТУ ПОЛОВИНУ, СНЕСЕНА ВМЕСТЕ СО СТРОКОЙ, и звалась она `madeOfLine`.
         Прежняя редакция абзаца называла её как живую («`madeOfLine`» в обратных кавычках, будто
         по имени можно перейти), и следующий читатель искал бы её по всему дереву, чтобы понять,
         что именно печаталось. Имя оставлено ТОЛЬКО как след в истории — вызывать нечего;
       · «priced by the server when the run starts» — цена. Владелец: «цена — по факту в истории»,
         и она там печатается строкой прогона (`priceActual`).
     ПОЭТОМУ `shape` БОЛЬШЕ НЕ ПЕРЕДАЁТСЯ, а не подменяется пустой строкой: у `GenerateRow` это
     ровно тот проп, которым экран объявляет «мой состав называю стандартными словами». Дверь описи
     при этом осталась — она висит на `onInspect`, а не на `shape` (разбор там же). */

  /* THE DOOR OF A REFUSAL: where it is fixed, when that is another step. Missing flats → the flat
     bench; the archived colourway → `for:` IN THIS VERY ROW (the rail has no select any more —
     G2-2/G2-3, so no door is drawn for it: the organ is already on screen); everything else is
     this screen's own input, a few rows up. */
  const lockDoors =
    !gate.ok && gate.next === 'flat' && onGoToKind ? (
      <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
        the flat bench ›
      </Button>
    ) : null;

  return (
    <RenderStepScope step={renderStep}>
      <Section
        /* THE ANCHOR OF THE STEP'S ONE BLOCK: the shared colourway strip and cloth grid both live
           here; the recipe menu below does not grow a second colourway control. */
        id='design-render-bench'
        title='fabric render'
        question='· the cloth on the flats'
        action={<HeaderNote tone='ink'>step 4</HeaderNote>}
        /* ГЭПЫ КАК В CARD DETAILS (r3 п.34) — ОДИН ТОКЕН НА ВСЮ ПОЛОСУ. `GROUP_SEAM` разводит
           прямых детей блока (рецепт · полоса замка · отказ · ряд GENERATE) одним швом в 20px
           вместо `space-y-stack` в 10px; зазор «линейка группы → содержимое» внутри рецепта
           держит `GROUP_GAP` на самих линейках (`./palette`). */
        className={GROUP_SEAM}
      >
        {onColorwayChange && (
          <div data-render-colourways=''>
            <GroupLabel flush>colourway</GroupLabel>
            <div className='pt-1.5'>
              {/* Only colourways the render can draw for (the SIDES columns), and the highlighted
                  tile is the EFFECTIVE target — the colourway the paid render actually buys for. */}
              <ColourwayStrip
                colorways={colorways.filter((c) => target.drawn.includes(c.colorwayId ?? 0))}
                selectedId={colorwayId}
                onSelect={onColorwayChange}
                onCreate={() => openStepOf('colorways')}
                disabled={disabled}
                loading={cardColorways === undefined && colorways.length === 0}
              />
            </div>
          </div>
        )}

        {/* V5 · MATERIALS (the pack, read-only) · IN WORDS. The anchor `#design-fabric-menu` moved
            onto the pack; the paint plan keeps its code but has no door this round. */}
        <div id='design-fabric-menu' className={GROUP_SEAM}>
          <MaterialsPack
            band={band}
            colorwayId={colorwayId}
            colorwayLabel={colorwayLabel}
            slots={slots}
            onEdit={onGoToKind && (() => onGoToKind('pattern'))}
          />
          <InWords state={draft} band={band} techCardId={techCardId} disabled={disabled} />
        </div>

        {/* ═══ THE RUN DOORS — the prototype's `runDoors`: the LOCKED bar when the gate refuses,
            the last refusal of the server verbatim, then GENERATE · WHAT THE MODEL GETS ▸ · money. */}
        {!gate.ok && <LockBar reason={`locked · ${gate.reason}`}>{lockDoors}</LockBar>}
        <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
        <GenerateRow
          gate={gate}
          pending={run.isPending || briefing}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      {/* ═══ THE LATEST GENERATION — A BLOCK OF ITS OWN, RIGHT UNDER FABRIC RENDER (28.09, O-67,
          D-73; under GENERATE since 27.09, O-63, D-62 п.1). Owner: «после генерации результат
          показывать как во флетах те с LATEST GENERATION», then «LATEST GENERATION в флетах и фабрик
          рендерах должна быть отдельным блоком». The newest render run of any colourway, live or
          with pictures, its tiles carrying the doors that put a render into a side; the same pin
          while an editor, a split or the zoom is open on it, «newer run ready · show ›», «the one
          before». Its wrapper is the NEXT SIBLING of `#design-render-bench`: what GENERATE bought
          stands right under it, and SIDES below reads what was marked. Still inside
          `RenderStepScope` — its doors' host is the step's host 0, so a refusal it shares with the
          history prints once (D-72 п.5). With no render run at all it draws nothing. */}
      {/* T30: the WORKBENCH — the latest generation and, folded as its last part, this step's
          GENERATION HISTORY: one block (`generation/studio.tsx`). SIDES stands under it. */}
      <Workbench band={band} techCardId={techCardId} disabled={disabled} kind='render' />

      {/* ═══ SIDES — СВОЙ БЛОК, МЕЖДУ ПОСЛЕДНЕЙ ГЕНЕРАЦИЕЙ И ИСТОРИЕЙ (r2 п.29, O-63) ════════════
          Строка на сторону: слева — чертёж, который пошёл в прогон (пустой заводится прямо тут:
          половина «из медиатеки», половина «draw»), справа — рендер, который вернулся. Класть
          рендер в сторону эта таблица не умеет намеренно — жест `mark ▸` стоит у самой картинки:
          на плитках последней генерации выше и истории ниже. */}
      <SidesSection
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        /* ═══ ТАБЛИЦА ЕДЕТ ПО ОСИ КОЛОРВЕЕВ, А НЕ ОДНОГО ВЫБРАННОГО (п.28/29) ═══════════════════
           Столбец на каждый колорвей карточки (`sample` — только у карточки без них, O-57), и
           заголовок столбца есть ВТОРАЯ ДВЕРЬ к той же цели, что и `for:` выше (`onPickColorway`
           — тот же единственный сеттер). `onCreateColorway` открывает то же окно рождения. */
        colorways={colorways}
        cardColorways={cardColorways}
        targetColorwayId={colorwayId}
        onPickColorway={onColorwayChange ?? (() => {})}
        onCreateColorway={() => openCreate()}
        onGoToKind={onGoToKind}
      />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='render'
        /* THE MODAL KNOWS NOTHING OF CHIPS: it is handed the SAME sentence that travels. */
        recipe={wire}
        cardFit={cardFit}
      />

      {/* ОДНО ОКНО РОЖДЕНИЯ НА ВЕСЬ ЭКРАН. Оно не носит `anchor`: двери держат `open` сами —
          плитка полосы, заголовок столбца, цель разреза. После успеха цель прогона переключается
          на новый колорвей, и продолжение жеста (если оно было) доигрывается уже в его столбце. */}
      <ColourwayCreatePopover
        techCardId={techCardId}
        open={creating}
        onOpenChange={setCreating}
        readOnly={disabled}
        onCreated={(id) => {
          onColorwayChange?.(id);
          const then = after.current;
          after.current = null;
          then?.(id);
        }}
      />
    </RenderStepScope>
  );
}
