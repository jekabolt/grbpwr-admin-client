import type { GetDesignBandResponse } from 'api/proto-http/admin';
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
import { GROUP_GAP, GROUP_SEAM } from '../core';
import { useCardFit, useThreedDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { GenerateRow, LockBar, RunRefusal } from './generate-row';
import {
  benchSides,
  PRESENTATIONS,
  fitChoices,
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
 *      GENERATE · WHAT THE MODEL GETS ▸
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
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Switch the studio to another step — the doors of the lock bar and of the empty sides. */
  onGoToKind?: (kind: 'flat' | 'render') => void;
  /**
   * THE BENCH BEING BUILT — one number for the whole studio (`useColorwayChoice`). It addresses the
   * bench the SERVER reads (`designSelectBench`) and the set the door opens on (`no_fabric_render`).
   */
  colorwayId?: number;
  /** Its human name; `''` under `no colourway` — the refusals say so in words. */
  colorwayLabel?: string;
  /** ⚠ Read by the GATE only: reading and the input strip work under an archived colourway. */
  colorwayArchived?: boolean;
}): JSX.Element {
  const { draft, patch } = useThreedDraft();
  const cardFit = useCardFit();
  const { dictionary } = useDictionary();
  const { data: models, isLoading: modelsLoading } = useAllModels();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the blocks. */
  const [inspecting, setInspecting] = useState(false);

  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);

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
   * ⚠ ФОРМА МОЖЕТ БЫТЬ НЕ СМОНТИРОВАНА (студию собирает и стенд, и просмотр без формы), поэтому
   * контекст читается мягко. ⚠ И ПУСТОЙ РЯД — ЭТО НЕ ПУСТОЙ СПИСОК: карточка без объявленного ряда
   * законна, а поле помечено `*` и держит ворота прогона; пустой список сделал бы 3D недостижимым
   * молча. Тогда предлагается словарь целиком — ровно как до этой правки.
   */
  const form = useFormContext<TechCardFormData>() as ReturnType<
    typeof useFormContext<TechCardFormData>
  > | null;
  const cardSizeIds = (useWatch({ control: form?.control, name: 'sizeIds' }) ?? []) as number[];
  const baseSizeId = Number(useWatch({ control: form?.control, name: 'baseSampleSizeId' }) ?? 0);
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
        <GenerateRow
          gate={gate}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
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
