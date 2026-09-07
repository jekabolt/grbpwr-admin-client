import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';

import { colourPlanGate, planRecipe } from '../colour-plan/model';
import { ColorwaySelect } from '../colorway-picker';
import { ColourwayCreatePopover } from '../colourway-create';
import { useColourPlan } from '../colour-plan/use-colour-plan';
import { GROUP_SEAM } from '../core';
import { useCardFit, useColourDraft } from './drafts';
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
import { OutputsSection } from './outputs';
import { Palette } from './palette';
import { SidesSection } from './side-row';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE FABRIC RENDER STUDIO — step 4 of the chain, FOUR BLOCKS IN THE ORDER OF THE WORK:
 *
 *   FABRIC RENDER · the cloth on the flats                                          [STEP 4]
 *   ── CLOTH AND COLOUR  one grid: cloth tiles and the colour tile
 *   ── CLOTH IS ─────── weight g/m² · opaque · semi sheer · sheer, one line
 *   ── IN WORDS ─────── the free text of the recipe
 *   GENERATE · priced by the server on start · WHAT THE MODEL GETS ▸
 *   SIDES ─────────────── one row per side: what went in, what came back (`SidesSection`)
 *   RENDERS OF THIS CARD  the plates themselves, and every door that puts one into a side
 *   GENERATION HISTORY    (mounted by the step screen)
 *
 * The rows INSIDE the first block are separated by group rules (`GroupLabel`), never by nested
 * boxes: a block never contains another block (DESIGN.md).
 *
 * ⚠ ДВЕ ЛЕНТЫ С ВЕРХА ЭТОГО БЛОКА СНЯТЫ (r2 п.29–30, рулинги r1 §8.3/§8.10). Владелец, дословно:
 * «в FABRIC RENDER раньше было лучше чем сейчас … только таблицу вместо двух лент» и «весь блок
 * FLATS OF THIS CARD в FABRIC RENDER убери полностью и маркировка в SIDES будет происходить только
 * в блоке RENDERS OF THIS CARD». Поэтому здесь больше НЕТ ни `InputFlatsGroup`, ни `SidesGroup`, ни
 * пула неразмеченных чертежей (`RenderInputStrip bare`): стороны — своим блоком ниже, а разметка —
 * у самих картинок, в `OutputsSection`, где лежит материал.
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
 * ОДНО СОСТОЯНИЕ (`useColorwayChoice` у композитора) — но ОРГАН его стоит на этом экране, в ряду
 * GENERATE: `for: [sample ▾]`. Круг раньше он стоял на рельсе шагов, и довод был про место; он не
 * учёл того, что этот выбор РЕШАЕТ: `colorway_id` прогона неизменяем, значит цель — часть покупки.
 * Верстак рендеров ПИШЕТ этот экран (SIDES снимает, `mark ▸` кладёт), ЧИТАЕТ 3D, СОБИРАЕТ сервер
 * (`designSelectBench`) — второй владелец числа заставил бы 3D смотреть в один верстак, пока
 * рендер наполняет другой.
 *
 * ⚠ РЕМОУНТА ПО `key={colorwayId}` БОЛЬШЕ НЕТ, И ОН БЫЛ БЫ ТЕПЕРЬ ПРЯМЫМ ДЕФЕКТОМ: экран,
 * ремоунтящий сам себя на смене цели, закрывал бы собственный список прямо под пальцем. Пересев
 * цветной половины рецепта переехал внутрь `useColourDraft` — ткань и слова там остаются, потому
 * что ткань есть свойство изделия, а цвет — колорвея (D6).
 */
export function RenderStudio({
  band,
  techCardId,
  disabled,
  onGoToKind,
  colorwayId = 0,
  colorwayRef = null,
  colorwayLabel = '',
  colorwayArchived = false,
  colorways = [],
  onColorwayChange,
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
   * уезжает за OLIVE. Не задан `onColorwayChange` — селекта нет вовсе (композитор без оси).
   */
  colorways?: common_AdminColorwayRef[];
  onColorwayChange?: (id: number) => void;
  /**
   * WHOSE render this is. `0` — верстак `sample`: не пропуск, а настоящее и вечно законное
   * значение, на котором стоит всякий рендер, сделанный до появления оси, и всякая проба цвета.
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
   * Go to another step of the studio. The step lives in ONE place (`StudioTab`); a screen that kept
   * its own would desynchronise the rail from its own content.
   */
  onGoToKind?: (kind: 'flat' | 'pattern' | 'render' | 'threed' | 'onmodel') => void;
}): JSX.Element {
  const draft = useColourDraft(band, colorwayId, colorwayRef);
  /**
   * ⚠ THE PLAN LIVES HERE, NOT IN THE PALETTE, for the reason the draft does: the gate and the run
   * body read it together with the parts row; two hooks would be two documents of different
   * revisions — saving under one, refusing by the other.
   */
  const colourPlan = useColourPlan(techCardId, band);
  const cardFit = useCardFit();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the block. */
  const [inspecting, setInspecting] = useState(false);

  /**
   * ═══ РОЖДЕНИЕ КОЛОРВЕЯ — ОДНО ОКНО НА ЭКРАН, СКОЛЬКО БЫ ДВЕРЕЙ К НЕМУ НИ ВЕЛО (G2-4) ═════════
   *
   * Дверей три: пункт `+ colourway…` в селекте цели, заголовок-плейсхолдер столбца в SIDES и цель
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
  const openCreate = (then?: (id: number) => void) => {
    after.current = then ?? null;
    setCreating(true);
  };

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
  const sent = useMemo(() => {
    const hex = hexIsPaintable(draft.recipe.hex) ? (draft.recipe.hex ?? '').trim() : '';
    return {
      ...draft.recipe,
      words: statedWords(draft),
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
  }, [draft.recipe, draft.cloth, colorwayId, colorwayLabel]);

  /** What will actually travel — the recipe SUBSTITUTED BY THE PLAN when colour maps ride along. */
  const wire = useMemo(
    () => planRecipe(band, colourPlan.plan, sent),
    [band, colourPlan.plan, sent],
  );

  const gate: Gate = useMemo(() => {
    /* An archived name refuses first — even before an empty bench: under a retired colour «front
       and back must hold a drawing» sends a person to draw what will not be bought anyway. */
    const base = renderGate(band, colorwayArchived, colorwayLabel);
    if (!base.ok) return base;
    /* ⚠ THE PAINT GATE STANDS BEFORE THE RECIPE GATE: a painted colour without a cloth is a
       person's statement left unanswered, not an empty recipe. Three of its four refusals mirror
       the server's doors. */
    const painted = colourPlanGate(band, colourPlan.plan);
    if (!painted.ok) return painted;
    /* ⚠ UNDER PAINT THE STATEMENT ABOUT THE CLOTH LIVES PER PART, NOT IN THE SCALARS; a non-empty
       `colour_maps` already means «everything is stated», because the gate above refused every
       painted colour nothing was said about. */
    if ((wire.colourMaps ?? []).length === 0 && !recipeIsStated(wire)) {
      return {
        ok: false,
        reason:
          'no fabric is stated · pick a cloth, a colour, say what it is, or describe it. Any one is enough',
      };
    }
    return { ok: true };
  }, [band, sent, wire, colourPlan.plan, colorwayArchived, colorwayLabel]);

  const generate = () => {
    run.start({
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
        useFlatSlots: false,
        // Meaningful on kind=flat only; named because the contract wants the field named.
        flatSlotIds: [],
      },
    });
  };

  /* ⚠ СТРОКА СОСТАВА СНЯТА ЦЕЛИКОМ (r3 п.27) — «made of pattern 1 — … · split into the slots
     afterwards · priced by the server when the run starts». Владелец: «убрать».
     ЧТО ОНА ГОВОРИЛА И ГДЕ ЭТО ОСТАЛОСЬ, ПОШТУЧНО, потому что снимать строку, не проверив каждый
     её член, — это и есть тихая потеря:
       · «1 picture · N views in a row» и «split into the slots afterwards» — форма листа. Живёт в
         модалке «what the model gets», дверь которой стоит в ЭТОМ ЖЕ ряду, у правого края;
       · «made of …» (`madeOfLine`) — из чего сделан рецепт. Это дословный пересказ сетки CLOTH AND
         COLOUR, стоящей на три сантиметра выше: ткани там помечены «in» с номером, цвет — квадратом;
       · «priced by the server when the run starts» — цена. Владелец: «цена — по факту в истории»,
         и она там печатается строкой прогона (`priceActual`).
     ПОЭТОМУ `shape` БОЛЬШЕ НЕ ПЕРЕДАЁТСЯ, а не подменяется пустой строкой: у `GenerateRow` это
     ровно тот проп, которым экран объявляет «мой состав называю стандартными словами». Дверь описи
     при этом осталась — она висит на `onInspect`, а не на `shape` (разбор там же). */

  /* THE DOOR OF A REFUSAL: where it is fixed, when that is another step. Missing flats → the flat
     bench; the archived colourway → the select on the rail (no door here); everything else is this
     screen's own input, a few rows up. */
  const lockDoors =
    !gate.ok && gate.next === 'flat' && onGoToKind ? (
      <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
        the flat bench ›
      </Button>
    ) : null;

  return (
    <>
      <Section
        /* THE ANCHOR OF THE STEP'S ONE BLOCK: statements of absence («no colourway picker in this
           block», E-16) and of belonging («the cloth grid lives HERE», E-7) are made about it. */
        id='design-render-bench'
        title='fabric render'
        question='· the cloth on the flats'
        action={<Pill tone='ink'>step 4</Pill>}
        /* ГЭПЫ КАК В CARD DETAILS (r3 п.34) — ОДИН ТОКЕН НА ВСЮ ПОЛОСУ. `GROUP_SEAM` разводит
           прямых детей блока (рецепт · полоса замка · отказ · ряд GENERATE) одним швом в 20px
           вместо `space-y-stack` в 10px; зазор «линейка группы → содержимое» внутри рецепта
           держит `GROUP_GAP` на самих линейках (`./palette`). */
        className={GROUP_SEAM}
      >
        {/* ═══ CLOTH AND COLOUR · CLOTH IS · IN WORDS — the recipe, three group rows. The palette
            owns them because they write one draft (`useColourDraft`) and the gate above reads
            the same one. ⚠ THE ANCHOR `#design-fabric-menu` STAYS ON THE GRID: E-7 («no cloth
            placeholder in the input») and E-16 («no colourway picker in the menu») are asserted
            against it. */}
        <div id='design-fabric-menu'>
          <Palette
            band={band}
            techCardId={techCardId}
            disabled={disabled}
            draft={draft}
            colourPlan={colourPlan}
            /* K-16: the second door of the cloth shelf. Without `onGoToKind` it does not exist —
               a button with nowhere to lead is worse than none. */
            onMakePattern={onGoToKind && (() => onGoToKind('pattern'))}
          />
        </div>

        {/* ═══ THE RUN DOORS — the prototype's `runDoors`: the LOCKED bar when the gate refuses,
            the last refusal of the server verbatim, then GENERATE · WHAT THE MODEL GETS ▸ · money. */}
        {!gate.ok && <LockBar reason={`locked · ${gate.reason}`}>{lockDoors}</LockBar>}
        <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
        {/* ═══ ДЛЯ КОГО ЭТОТ ПРОГОН — В ОДНОМ РЯДУ С ДЕНЬГАМИ (D2, G2-3) ═══════════════════════
            `colorway_id` прогона НЕИЗМЕНЯЕМ: лист, купленный не под тем именем, останется в
            истории чужим навсегда. Поэтому цель называется у самой кнопки, а не на рельсе шагов,
            где она стояла кругом раньше (`chain-rail.tsx` слота `action` больше не имеет). Пункт
            `+ colourway…` — та же дверь, что и заголовок столбца в SIDES: одно окно, три двери. */}
        <GenerateRow
          gate={gate}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
          trailing={
            onColorwayChange ? (
              <ColorwaySelect
                band={band}
                label='for'
                probe='design-render-target'
                disabled={disabled}
                onCreate={() => openCreate()}
                choice={{
                  colorwayId,
                  setColorwayId: onColorwayChange,
                  colorways,
                  current: colorwayRef,
                  label: colorwayLabel,
                  archived: colorwayArchived,
                  loading: false,
                }}
              />
            ) : null
          }
        />
      </Section>

      {/* ═══ SIDES — СВОЙ БЛОК, НАД РЕНДЕРАМИ КАРТОЧКИ (r2 п.29) ══════════════════════════════
          Строка на сторону: слева — чертёж, который пошёл в прогон (пустой заводится прямо тут:
          половина «из медиатеки», половина «draw»), справа — рендер, который вернулся. Класть
          рендер в сторону эта таблица не умеет намеренно — жест `mark ▸` стоит у самой картинки,
          в блоке ниже. */}
      <SidesSection
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        /* ═══ ТАБЛИЦА ЕДЕТ ПО ОСИ КОЛОРВЕЕВ, А НЕ ОДНОГО ВЫБРАННОГО (п.28/29) ═══════════════════
           Столбец на каждый занятый верстак — `sample` первым, затем колорвеи карточки, — и
           заголовок столбца есть ВТОРАЯ ДВЕРЬ к той же цели, что и `for:` выше (`onPickColorway`
           — тот же единственный сеттер). `onCreateColorway` открывает то же окно рождения. */
        colorways={colorways}
        targetColorwayId={colorwayId}
        onPickColorway={onColorwayChange ?? (() => {})}
        onCreateColorway={() => openCreate()}
        onGoToKind={onGoToKind}
      />

      {/* The renders this card holds — where `mark ▸`, `split ▸` and `apply splitted` live: the
          doors that put a render into a side from the card's own pictures. `mark ▸` addresses the
          bench of the PICTURE's colourway (see `./outputs`). */}
      {/* ═══ РЕНДЕРЫ КАРТОЧКИ — НЕ СУЖЕНЫ ЦЕЛЬЮ (D5) ══════════════════════════════════════════
          Список показывает ВСЕ рендеры карточки, а чей каждый — говорит пилюля на самой плитке.
          Сужение фильтром прятало плиты, которые человек видел минуту назад, и вопрос «куда её
          положить» всё равно задаётся у двери `mark ▸`, а не фильтром над разделом.
          `adopts` — сказал ли СЕРВЕР, что семпл-плита усыновляется при постановке в слот
          колорвея (B7). Отсутствие поля читается как «не сказано» (доктрина `has_fabric_render`),
          и тогда дверей в чужой столбец не рисуется вовсе. */}
      <OutputsSection
        band={band}
        techCardId={techCardId}
        kind='render'
        disabled={disabled}
        colorways={colorways}
        adopts={band.benchAdoptsUnattributed === true}
        onCreateColorway={openCreate}
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
          пункт селекта, заголовок столбца, цель разреза. После успеха цель прогона переключается
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
    </>
  );
}
