import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import { ViewSwitch } from 'ui/components/view-switch';

import type { TechCardFormData } from '../../schema';
import { InertDoor } from '../bench-slot';
import { ColorwaySelect } from '../colorway-picker';
import { EmptyState, GROUP_GAP, GROUP_SEAM } from '../core';
import { useCardFit, useThreedDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { GenerateRow, LockBar, RunRefusal } from './generate-row';
import {
  benchSides,
  PRESENTATIONS,
  fitChoices,
  threedColorwayOptions,
  threedGate,
  threedRunViews,
  threedSides,
  turntableSourceIds,
  type Gate,
  type Presentation,
} from './model';
import { BodyPicker } from './model-picker';
import { OutputsSection } from './outputs';
import { RendersByViewGroup } from './side-row';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE 3D STUDIO — step 5 of the chain, as the prototype draws it (`_step-3d.js`):
 *
 *   3D · one model of this card                                                      [STEP 5]
 *   ── INPUT · RENDERS BY VIEW ── the render bench, read only, a door back on every empty side
 *   ── GENERATION ──── [1 MODEL · FROM N SIDES]        ← ОДНА КОЛОНКА ПОЛЕЙ (r3 п.35)
 *      PRESENTATION   in the air | on a model
 *      THE BODY       one picker: any body · a build · one of our models      (on a model only)
 *      GARMENT SIZE * the card's own size run                                 (on a model only)
 *      FIT            the card's fit, or a stated deviation for this run
 *      LOCKED …  · FILL THE EMPTY SIDES ›
 *      GENERATE · for: [sample ▾] ……………………………………………………………… WHAT THE MODEL GETS ▸
 *   3D MODELS OF THIS CARD · built here or brought — the shelf, and BRING YOUR OWN (`./outputs`)
 *
 * 3D IS BUILT FROM THE RENDERS, NOT FROM THE DRAWINGS: the input lists the RENDER bench by view,
 * and a filled render slot IS the side's membership in the run — there is no mark to set here
 * (`sides.filter(s => s.picture)`). The bench is the SAME one the server assembles from
 * (`designSelectBench`), keyed by the studio's one colourway number.
 *
 * ⚠ ONE SIDE IS REQUIRED — THE FRONT (K-10/K-11): `multi-view-to-3d` builds a volume out of views,
 * and the provider's free refusal lands on a missing front alone. The other sides make the volume
 * better and are named as encouragement, not as a condition.
 *
 * TWO PRESENTATIONS, and the body is never mandatory: a card starts from the garment, not from a
 * figure. In the air there is no body row and no size row, and neither of their gates. Switching
 * the presentation does not wipe the body and the size — they stay in the draft and are simply not
 * read in the air, by the screen, the inventory or the gate.
 *
 * LOCKED IS A STATE OF THE SCREEN, NOT ITS ABSENCE: the reason of a dead GENERATE is a visible bar
 * with its door, never a `title` alone.
 */

/** Radix forbids an empty item value, so every «nothing chosen» option here is a sentinel. */
const CARD_FIT = '__card__';
const NO_SIZE = '__nosize__';

export function ThreedStudio({
  band,
  techCardId,
  disabled,
  onGoToKind,
  colorwayId = 0,
  colorwayLabel = '',
  colorwayArchived = false,
  colorways = [],
  onColorwayChange,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Switch the studio to another step — the doors of the lock bar and of the empty sides. */
  onGoToKind?: (kind: 'flat' | 'render') => void;
  /**
   * ═══ ЧТО СОБИРАЕМ — ТОТ ЖЕ ЕДИНСТВЕННЫЙ СЕТТЕР СТУДИИ (G2-7) ═════════════════════════════════
   * Список сужает САМ ЭКРАН: собирать можно только из колорвеев, у которых на render-верстаке
   * стоит FRONT. Не задан `onColorwayChange` — органа нет вовсе (композитор без оси).
   * Стоит он в ряду GENERATE, подписанный `for`, — ровно там же и тем же словом, что на FABRIC
   * RENDER (разбор у самого ряда, ниже по файлу).
   */
  colorways?: common_AdminColorwayRef[];
  onColorwayChange?: (id: number) => void;
  /**
   * THE BENCH BEING BUILT — one number for the whole studio (`useColorwayChoice`). It addresses the
   * bench the SERVER reads (`designSelectBench`) and the set the door opens on (`no_fabric_render`).
   */
  colorwayId?: number;
  /** Its human name; `''` под `sample` — отказы называют его тем же словом (`benchName`). */
  colorwayLabel?: string;
  /** ⚠ Read by the GATE only: reading and the input strip work under an archived colourway. */
  colorwayArchived?: boolean;
}): JSX.Element {
  /* Черновик ключуется КАРТОЧКОЙ, а не монтированием: разбор — в шапке хука (`./drafts`). */
  const { draft, patch } = useThreedDraft(techCardId);
  const cardFit = useCardFit();
  const { dictionary } = useDictionary();
  const { data: models, isLoading: modelsLoading } = useAllModels();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the blocks. */
  const [inspecting, setInspecting] = useState(false);

  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);

  /**
   * ═══ ИЗ ЧЕГО МОЖНО СОБРАТЬ — И ТОЛЬКО ИЗ ЭТОГО (G2-7) ═══════════════════════════════════════
   *
   * Владелец: «в 3D выбираем колорвей из размеченных в SIDES». Сервер собирает поворот из
   * render-слотов ровно этого колорвея и без фронта отказывает бесплатно, поэтому список,
   * предлагающий колорвей без фронта, продавал бы отказ. Считается по `band.bench` целиком, а не
   * по `render_bench_colorway_ids`: серверное множество отвечает «занят ХОТЯ БЫ ОДИН слот», и
   * колорвей с одной спинкой в нём есть, а собрать его нельзя (разбор — у `threedColorwayOptions`).
   */
  const buildable = useMemo(
    () => threedColorwayOptions(band, colorways),
    [band, colorways],
  );

  /**
   * ═══ ⚠ ЗАХОД НА 3D НЕ ПЕРЕДВИГАЕТ ОБЩИЙ ВЫБОР СТУДИИ. НИКОГДА (G2-7, побочка G2a) ════════════
   *
   * ЗДЕСЬ СТОЯЛ ЭФФЕКТ, ПЕРЕВОДИВШИЙ ЦЕЛЬ НА «ПЕРВУЮ ПОДХОДЯЩУЮ», и довод у него был вежливый:
   * экран, открытый на цели без фронта, показывает пустой вход и погашенную кнопку, притом что
   * рядом лежит собранный ROSSO. Цена этой вежливости замерена и она не про 3D:
   * `colorwayId` — ОДНО состояние всей студии (`useColorwayChoice`), и то же самое число называет
   * ЦЕЛЬ СЛЕДУЮЩЕГО ПЛАТНОГО ПРОГОНА на FABRIC RENDER (`for:`) и ось чипов on-model. Человек,
   * заглянувший на 3D и вернувшийся назад, обнаруживал в `for:` ЧУЖОЕ имя — молча, без единого
   * своего клика, — и следующий рендер уезжал под ним. `run.colorway_id` неизменяем: такой прогон
   * не переименовать, его можно только выбросить и купить заново.
   *
   * ЧТО ВМЕСТО НЕГО: экран говорит, чего не хватает, и ЖДЁТ ЖЕСТА. Список `for:` предлагает
   * только собираемые цели; текущая, если она не из них, в список не дописывается, а на её месте
   * стоит пункт-приглашение «pick a colourway» (инвариант «значение всегда среди пунктов» держит
   * сам `ColorwaySelect`, см. проп `unmatched`). Причину и ИМЯ цели называет полоса LOCKED ниже
   * («the render bench of sample holds renders, but not on FRONT»), поэтому приглашение не
   * пересказывает её второй раз. Общее состояние меняет ТОЛЬКО клик человека по этому селекту.
   */

  const sizes = dictionary?.sizes ?? [];
  const sizeName = (id: number) =>
    (sizes.find((s) => s.id === id)?.name ?? '').trim() || (id ? `size ${id}` : '');

  /**
   * ═══ РАЗМЕРНЫЙ РЯД КАРТОЧКИ (r3 п.36) ════════════════════════════════════════════════════════
   *
   * Владелец: «GARMENT SIZE * — только размеры, доступные для этого типа одежды».
   *
   * ИСТОЧНИК — ФОРМА, А НЕ ВТОРОЙ ВЫВОД ИЗ КАТЕГОРИИ. `sizeIds` — это ряд, который карточка уже
   * объявила своим в CARD DETAILS: он сужен разрешёнными для категории системами (`SizeIdsField`
   * → `permittedSizeSystems`) и по нему градуируются выкройки, нормы и раскрой. Вывести ряд здесь
   * заново из категории значило бы завести ВТОРОЙ ответ на тот же вопрос — и он разошёлся бы с
   * первым в тот день, когда технолог снимет размер с карточки.
   *
   * ⚠ ФОРМА ЗДЕСЬ ОБЯЗАТЕЛЬНА, И ЭТО СКАЗАНО ПРЯМО. На этом месте стоял каст к `| null` с
   * оговоркой «студию собирает и стенд без формы, поэтому контекст читается мягко» — и мягким это
   * чтение НЕ БЫЛО: `useWatch({ control: undefined })` внутри сам берёт `useFormContext()`, а у
   * `null` читает `.control` (RHF 7.62), то есть обещанный мягкий путь падал бы `TypeError`ом и
   * уносил бы вкладку в белое — над ней нет ни одной границы ошибок. Обещание снято, а не
   * подкреплено: `ThreedStudio` монтирует только `StudioTab`, который сам зовёт `useFormContext`
   * безусловно (`studio-tab.tsx`), значит форма есть у ВСЕГО поддерева, включая стенд проб (он
   * оборачивает студию в `FormProvider`). Понадобится монтаж без формы — читать `sizeIds` пропом
   * от композитора, как читается `band`; выдумывать вторую мягкость на месте не нужно.
   *
   * ⚠ И ПУСТОЙ РЯД — ЭТО НЕ ПУСТОЙ СПИСОК: карточка без объявленного ряда законна, а поле помечено
   * `*` и держит ворота прогона; пустой список сделал бы 3D недостижимым молча. Тогда предлагается
   * словарь целиком — ровно как до этой правки.
   */
  const { control } = useFormContext<TechCardFormData>();
  const cardSizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const baseSizeId = Number(useWatch({ control, name: 'baseSampleSizeId' }) ?? 0);
  const sizeItems = useMemo(() => {
    const run = new Set(cardSizeIds.filter((id) => (id ?? 0) > 0));
    const offered = run.size ? sizes.filter((s) => run.has(s.id ?? 0)) : sizes;
    return offered
      .filter((s) => (s.id ?? 0) > 0)
      .map((s) => {
        const name = (s.name ?? '').trim() || `size ${s.id}`;
        return {
          value: String(s.id),
          label: s.id === baseSizeId ? `${name} · base` : name,
        };
      });
  }, [sizes, cardSizeIds, baseSizeId]);

  /** The refusal over the INPUT — the render bench and the colourway; an obstacle of the chain. */
  const input: Gate = useMemo(
    () => threedGate(band, colorwayId, colorwayLabel, colorwayArchived),
    [band, colorwayId, colorwayLabel, colorwayArchived],
  );

  /** The whole gate — the input first, then the screen's OWN questions (body, size). */
  const gate: Gate = useMemo(() => {
    if (!input.ok) return input;
    if (draft.presentation === 'model') {
      // ONE QUESTION — «on what body» — answerable by EITHER half: a named model, or a build.
      if (!draft.modelId && !draft.bodyType) {
        return {
          ok: false,
          reason:
            'say what body it sits on · pick one of our models, or name a build; or turn it in the air instead',
        };
      }
      if (!draft.garmentSizeId) {
        return {
          ok: false,
          reason: 'pick which garment size sits on that body · a fit on a figure has to name one',
        };
      }
    }
    return { ok: true };
  }, [input, draft.presentation, draft.modelId, draft.bodyType, draft.garmentSizeId]);

  /** WHAT IS BOUGHT — in sides, not frames (K-11): one volume, built from the standing sides. */
  const marked = useMemo(() => threedRunViews(sides), [sides]);
  const shape =
    marked.length === 0
      ? '1 model · nothing came back yet'
      : `1 model · from ${marked.length} ${marked.length === 1 ? 'side' : 'sides'}`;

  const fitOptions = useMemo(() => fitChoices(cardFit), [cardFit]);
  const fitStated = (cardFit ?? '').trim();
  const fitDiffers = !!draft.fitOverride && draft.fitOverride !== fitStated;


  const generate = () => {
    const sourcePictureIds = turntableSourceIds(sides);
    // The gate already refuses an incomplete set; this is the second, cheap guard.
    if (!sourcePictureIds.length) return;
    run.start({
      kind: 'threed',
      ask: '',
      params: {
        // ONLY THE STANDING SIDES: `views` is frozen in the history as «what was asked».
        views: marked,
        detailSlotIds: [],
        // THE COLOURWAY OF THE BUILD (L-3): the server reads ONLY this colourway's render bench.
        colorwayId,
        layout: '',
        colour: undefined,
        threed: {
          // EXPLICIT ZERO — «not said» (K-11): nobody turns the garment by 12 frames any more.
          frames: 0,
          presentation: draft.presentation,
          modelId: draft.presentation === 'model' ? draft.modelId : 0,
          garmentSizeId: draft.presentation === 'model' ? draft.garmentSizeId : 0,
          fitOverride: draft.fitOverride,
          // THE BUILD IS A PERSON'S CHOICE, NOT A STUB (V-15): '' reads as «not said».
          bodyType: draft.presentation === 'model' ? draft.bodyType : '',
          sourcePictureIds,
        },
        fixTarget: '',
        extraInputMediaIds: [],
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        pattern: undefined,
        // НЕ ПЛЕЙГРАУНД: поле осмысленно только на kind=freeform и на любом другом роде
        // отвергается сервером (`freeform_forbidden`), поэтому здесь оно названо пустым вслух.
        freeform: undefined,
        useFlatSlots: false,
        flatSlotIds: [],
      },
    });
  };

  /* THE DOOR OF THE LOCKED BAR — where the refusal is FIXED. The input refusals point at another
     step; the screen's own (body, size) are fixed a few rows up, and a door there would point at
     an organ a centimetre away. `colourway` — the exit is the select on the rail. */
  const lockDoors = (() => {
    if (gate.ok || input.ok) return null;
    if (!onGoToKind) {
      return (
        <InertDoor
          label='fill the empty sides ›'
          reason='the way out is the rail above — FABRIC RENDER colours a side and puts it into a slot'
        />
      );
    }
    switch (input.ok ? undefined : input.next) {
      case 'render':
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            fill the empty sides ›
          </Button>
        );
      case 'front-slot':
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            put a render into front ›
          </Button>
        );
      case 'refill':
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            re-fill the odd sides ›
          </Button>
        );
      case 'flat':
        /* The mockup's one door — FILL THE EMPTY SIDES › — and the flat bench only when it is
           empty too: a card with flats drawn has nothing to generate on FLAT, and a door that
           says so would send the person a step back for nothing. */
        return (
          <>
            {benchSides(band, 'flat', 0).every((side) => !side.picture) && (
              <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
                the flat bench ›
              </Button>
            )}
            <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
              fill the empty sides ›
            </Button>
          </>
        );
      case 'colourway':
        return null;
      default:
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            fill the empty sides ›
          </Button>
        );
    }
  })();

  return (
    <>
      <Section
        id='design-threed-generation'
        title='3d'
        question='· one model of this card'
        action={<Pill tone='ink'>step 5</Pill>}
        /* ГЭПЫ КАК В CARD DETAILS (r3 п.38) — ТОТ ЖЕ ТОКЕН, ЧТО НА CARD DETAILS И FABRIC RENDER.
           `GROUP_SEAM` разводит группы блока (вход · генерация · ряд прогона) швом в 20px,
           `GROUP_GAP` на самих линейках держит зазор «подпись → содержимое» в 12px. Обе группы
           обёрнуты своим `<div>`, иначе шов встал бы и внутри них. */
        className={GROUP_SEAM}
      >
        {/* ═══ INPUT · RENDERS BY VIEW — a READING of the render bench; every empty cell is a
            door back to FABRIC RENDER, where a side is filled. */}
        <RendersByViewGroup band={band} colorwayId={colorwayId} onGoToKind={onGoToKind} />

        {/* ═══ GENERATION — ОДНА КОЛОНКА ПОЛЕЙ ОДНОЙ ВЫСОТЫ (r3 п.35) ═══════════════════════
            Владелец: «3D GENERATION: слишком много разных кнопок — упростить».
            ЧТО ЗДЕСЬ БЫЛО: четыре ряда РАЗНОЙ грамматики и разного роста — подпись+сегментированная
            полоса+фраза справа, потом ЛИНЕЙКА ГРУППЫ с двумя пилюлями, под ней стопка из чипов,
            поиска и галереи фотографий, потом подпись+селект+фраза, потом подпись+селект+пилюля.
            Три предмета говорили одно и то же тремя способами (пилюля `named` / `not named yet`,
            счётчик моделей, пилюли фита), и ни один не был вопросом, на который человек отвечает.
            ЧТО СТАЛО: ЧЕТЫРЕ РЯДА `FieldRow` — тот же орган, которым набраны PARTS и COLOURWAY, с
            колонкой подписи в 92px и рулёной линией `#e6e6e6` под каждым. Подписи стоят столбиком,
            контролы стоят столбиком, рост у всех рядов один. Пилюли и счётчик сняты; фраза про фит
            осталась ОДНА и только когда она правда (`fitDiffers`). */}
        <div>
          <GroupLabel
            flush
            className={GROUP_GAP}
            action={
              <Pill tone='ink' data-threed-shape=''>
                {shape}
              </Pill>
            }
          >
            generation
          </GroupLabel>

          <FieldRow label='presentation' data-presentation=''>
            {/* A SEGMENTED STRIP, NOT A SELECT: both options on screen at all times. */}
            <ViewSwitch<Presentation>
              className='shrink-0'
              label='presentation'
              value={draft.presentation}
              disabled={disabled}
              options={PRESENTATIONS.map((p) => ({ value: p.value, label: p.label }))}
              onChange={(next) => patch({ presentation: next })}
            />
          </FieldRow>

          {/* THE BODY AND THE SIZE ONLY ON «ON A MODEL»: a figure picker for a figure that is not in
              the picture is an organ without an act. */}
          {draft.presentation === 'model' && (
            <>
              {/* ОДИН ПИКЕР ТЕЛА (r3 п.37) — селект с превью вместо чипов, поиска и галереи;
                  разбор целиком в шапке `./model-picker`. */}
              <FieldRow label='the body' data-body=''>
                <BodyPicker
                  models={models}
                  loading={modelsLoading}
                  modelId={draft.modelId}
                  bodyType={draft.bodyType}
                  sizeName={sizeName}
                  disabled={disabled}
                  onModel={(id) => patch({ modelId: id })}
                  onBodyType={(value) => patch({ bodyType: value })}
                />
              </FieldRow>

              {/* ═══ РАЗМЕРЫ — РЯД КАРТОЧКИ, А НЕ ВЕСЬ СЛОВАРЬ (r3 п.36) ══════════════════════
                  Владелец: «GARMENT SIZE * — только размеры, доступные для этого типа одежды».
                  Источник — `sizeIds` формы: тот самый ряд, который карточка объявляет своим
                  (CARD DETAILS → BASE MODEL & SAMPLE SIZE) и по которому градуируются выкройки и
                  нормы. Базовый помечен словом, а не порядком: он и есть «этот размер по
                  умолчанию». ⚠ ПУСТОЙ РЯД — НЕ ПУСТОЙ СПИСОК: карточка без ряда законна, и селект
                  на ней предлагает словарь целиком, иначе поле, помеченное `*`, стало бы
                  невыполнимым требованием, а прогон — недостижимым. */}
              <FieldRow label='garment size *' data-garment-size=''>
                <div className='w-[200px] shrink-0'>
                  <SelectComponent
                    name='design-threed-size'
                    value={draft.garmentSizeId ? String(draft.garmentSizeId) : NO_SIZE}
                    placeholder='not set'
                    disabled={disabled}
                    items={[{ value: NO_SIZE, label: 'not set' }, ...sizeItems]}
                    onValueChange={(value: string) =>
                      patch({ garmentSizeId: value === NO_SIZE ? 0 : Number(value) || 0 })
                    }
                    fullWidth
                  />
                </div>
              </FieldRow>
            </>
          )}

          {/* FIT — in both presentations: the garment hangs in the air and sits on a figure equally
              cut. The override is a STATED DEVIATION for this run only; the card stays the truth. */}
          <FieldRow label='fit' data-fit=''>
            <div className='w-[210px] shrink-0'>
              <SelectComponent
                name='design-threed-fit'
                value={draft.fitOverride || CARD_FIT}
                placeholder='not set'
                disabled={disabled}
                items={[
                  {
                    value: CARD_FIT,
                    label: fitStated ? `${fitStated} · from the card` : 'the card names no fit',
                  },
                  ...fitOptions.map((fit) => ({ value: fit, label: fit })),
                ]}
                onValueChange={(value: string) =>
                  patch({ fitOverride: value === CARD_FIT ? '' : value })
                }
                fullWidth
              />
            </div>
            {/* ⚠ ТРИ ПИЛЮЛИ СНЯТЫ, ОДНА ФРАЗА ОСТАЛАСЬ. Две из трёх пересказывали выбранный пункт
                («regular from the card» под пунктом «regular · from the card»; «the card does not
                name a fit» под пунктом «the card names no fit»). Третья говорила то, чего в
                списке НЕ ВИДНО: что отклонение будет проштамповано на результате, а карточка при
                этом не меняется. Она и осталась — и только когда она правда. */}
            {fitDiffers && (
              <Hint>
                this run only · the result carries the badge and the card is not changed
              </Hint>
            )}
          </FieldRow>
        </div>

        {/* ═══ THE RUN DOORS — the LOCKED bar with its door, the server's last refusal verbatim,
            then GENERATE · money · WHAT THE MODEL GETS ▸ (one row on every generative screen). */}
        {!gate.ok && <LockBar reason={`locked · ${gate.reason}`}>{lockDoors}</LockBar>}
        <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
        {/* ⚠ `shape` ЗДЕСЬ НЕ ПЕРЕДАЁТСЯ, И ЭТО СНЯТИЕ ДУБЛЯ, А НЕ ПОТЕРЯ. Ряд печатал
            `1 model · from 3 sides · priced by the server when the run starts` — ту же самую
            строку, посимвольно, что стоит пилюлей на линейке GENERATION в трёх рядах выше
            (`data-threed-shape`). Одно утверждение дважды на одном экране — ровно то, на что
            владелец жалуется пунктом 35 («слишком много»); а цена «по факту в истории» (п.27)
            касается обоих платных экранов, не одного. Дверь описи осталась: она висит на
            `onInspect`, а не на `shape` (разбор в `./generate-row`). */}
        {/* ═══ ДЛЯ КОГО ЭТОТ ПРОГОН — В ОДНОМ РЯДУ С ДЕНЬГАМИ, КАК НА FABRIC RENDER ════════════
            Владелец, дословно: «в 3D сделай выбор колорвея как в фабрик рендере около кнопки
            генерейт». Орган стоял ШАПКОЙ блока (`build:`), над входом, и довод был про порядок
            чтения — «сначала решаем, чем будет этот вход». Он не учёл того, что на соседнем
            платном экране этот же самый выбор человек делает у самой кнопки: два места для одного
            состояния (`useColorwayChoice`) заставляли искать орган заново на каждом шаге.

            ТЕПЕРЬ РЯД ОДИН НА ОБА ЭКРАНА, И ПОДПИСЬ ТОЖЕ ОДНА — `for`. `colorway_id` прогона
            неизменяем: и лист FABRIC RENDER, и поворот 3D навсегда остаются в истории того цвета,
            под которым были куплены, — то есть это один и тот же вопрос, «для кого эта покупка»,
            и задавать его двумя разными словами в двух шагах одной цепочки значило бы делать вид,
            что вопросов два.

            ⚠ СУЖЕНИЕ СПИСКА ОСТАЛОСЬ РОВНО ТЕМ ЖЕ (G2-7): предлагаются ТОЛЬКО колорвеи, у которых
            на render-верстаке стоит FRONT (`buildable`), а цель, этого не прошедшая, НЕ
            подменяется сама — на её месте стоит пункт-приглашение, и общий выбор студии двигает
            только клик человека. Разбор целиком — у `threedColorwayOptions` и в шапке
            `ColorwaySelect` (проп `unmatched`). */}
        <GenerateRow
          gate={gate}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
          trailing={
            !onColorwayChange ? null : buildable.length === 0 ? (
              /* ⚠ ПУСТОЙ СПИСОК — ЭТО НЕ ПУСТОЙ СЕЛЕКТ, А ПРЕДЛОЖЕНИЕ ЖЕСТА. Живой список с нулём
                 пунктов читается как поломка («не загрузилось»); строка называет, ЧЕГО не хватает,
                 и ведёт ровно туда, где это делают. Она НЕ пересказывает полосу LOCKED над собой:
                 та говорит про ТЕКУЩИЙ верстак («the render slots of sample are empty»), а эта —
                 что и переключаться некуда, ни один колорвей карточки фронта не держит.

                 ⚠ ДВЕРИ У НЕЁ НЕТ НАРОЧНО, И ЭТО ЗАМЕРЕНО ГЛАЗАМИ НА СНИМКЕ. `EmptyState`
                 принимает `action`, и первая редакция ставила туда `fabric render ›` — а ровно
                 такая же кнопка с той же подписью и тем же назначением стоит на линейке INPUT
                 выше, СТОИТ ВСЕГДА. Две одинаковые кнопки за одно (владелец: «не делай разные
                 кнопки для одного и того же»). Осталась одна — та, что выше; предложение называет
                 и место, и жест словами. */
              <div data-threed-build-empty='' className='min-w-0 flex-1'>
                <EmptyState>
                  no colourway has a front render yet — mark one in FABRIC RENDER › SIDES
                </EmptyState>
              </div>
            ) : (
              <ColorwaySelect
                band={band}
                label='for'
                /* ИМЯ ОРГАНА — ПАРА К `design-render-target`: тот же вопрос, тот же ряд, соседний
                   шаг. Прежнее `design-threed-build` называло место, которого больше нет. */
                probe='design-threed-target'
                disabled={disabled}
                only={buildable}
                /* ⚠ ЦЕЛЬ, КОТОРУЮ СОБРАТЬ НЕЛЬЗЯ, НЕ ДОПИСЫВАЕТСЯ В СПИСОК И НЕ ПОДМЕНЯЕТСЯ САМА:
                   на её месте стоит приглашение к жесту, а общий выбор студии ждёт клика человека
                   (разбор — выше по файлу, на месте снятого эффекта-переезда).
                   ⚠ ФРАЗА КОРОТКАЯ НАРОЧНО, И ЭТО ЗАМЕР, А НЕ ВКУС: «pick a colourway with a front
                   render» не влезает в орган (190px) и ложится ДВУМЯ строками, поднимая ряд вдвое
                   над той метрикой, которой набран ряд GENERATE. Условие при этом не потеряно —
                   его называет полоса LOCKED над рядом, и НЕ вообще, а по имени текущей цели («the
                   render bench of sample holds renders, but not on FRONT»). Орган спрашивает ЖЕСТ,
                   полоса называет ПРИЧИНУ; одно утверждение в двух местах было бы хуже. */
                unmatched='pick a colourway'
                choice={{
                  colorwayId,
                  setColorwayId: onColorwayChange,
                  colorways,
                  current: colorways.find((c) => (c.colorwayId ?? 0) === colorwayId) ?? null,
                  label: colorwayLabel,
                  archived: colorwayArchived,
                  loading: false,
                }}
              />
            )
          }
        />
      </Section>

      {/* ═══ 3D MODELS OF THIS CARD · built here or brought — the shelf and BRING YOUR OWN. */}
      <OutputsSection
        band={band}
        techCardId={techCardId}
        kind='threed'
        disabled={disabled}
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='threed'
        threed={draft}
        cardFit={cardFit}
        models={models}
        sizeName={sizeName}
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />
    </>
  );
}
