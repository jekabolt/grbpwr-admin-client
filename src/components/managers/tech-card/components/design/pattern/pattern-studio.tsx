import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { PantonePicker } from 'components/managers/tech-card/components/pantone-picker';
import {
  ensurePantoneLibrary,
  pantoneLibraryState,
  pantoneVersion,
  subscribePantone,
} from 'components/managers/tech-card/components/pantone-swatches';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
} from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { assetFull, assetLabel, assetThumb } from '../assets/model';
import { BENCH_CELL_STYLE, InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { Counter, EmptyState, GROUP_GAP, GROUP_SEAM, Money, Reason } from '../core';
import { stepById, type StepId } from '../core/chain';
import { Thumb, useRunPolling } from '../generation';
import { PictureTile } from '../picture-tile';
import { Swatch } from '../render/field-row';
import { RunRefusal } from '../render/generate-row';
import { archivedColorwayGate, type Gate } from '../render/model';
import { useStartDesignRun } from '../render/use-design-run';
import { refusalAdvice } from './model';
import { CornerLabel, FABRIC_CELL_ASPECT, PendingTile, TiledFace } from './organs';
import {
  READ_ONLY_RUN_REASON,
  bindingsSpoken,
  boundAssetsByPair,
  mintSlotName,
  pairKey,
  rowColour,
  runTraceNote,
  slotSuggestions,
  slotUsage,
  swatchGate,
  type ClothSlot,
  type ShelfCeiling,
} from './slot-fabrics';
import { usePatternStepView } from './step-view';

/**
 * ═══ STEP 3 · PATTERN — ТКАНЬ НА КАЖДУЮ ПАРУ (КОЛОРВЕЙ, СЛОТ) ════════════════════════════════════
 *
 * Владелец (2026-09-26), дословно по смыслу: «разбивка по СУЩЕСТВУЮЩИМ колорвеям; внутри колорвея —
 * по слотам ткани (white → outer, inner); на пару — свотч из пантона (с поиском по подцветам) и,
 * по желанию, текстуры; пометить так, чтобы ушло в FABRIC RENDER. Отдельный блок IMAGE TO FABRIC,
 * его история — каруселью. Просто, просторно, без кучи кнопок, одна дверь на глагол».
 *
 * ШАГ — ДВА СОСЕДНИХ БЛОКА В СТЕКЕ КОМПОЗИТОРА, и этот файл — первый из них. Структура его
 * `Section` — только линейки (`GroupLabel`) и волосяные ряды:
 *
 *   PATTERN — a fabric swatch for every colourway and slot     step 3 · k of n fabrics · money
 *   ■ ROSSO ───────────────────────────────────────────────────────────── 1 of 2 fabrics
 *     [ячейка 138×162]  OUTER  main material  100% cotton twill · 300 gsm
 *                       COLOUR [18-1664 TCX ▾]   [+ texture]   [generate]
 *     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 *     [ячейка]          LINING  lining  …
 *   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 24px серого поля ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 *   IMAGE TO FABRIC — a seamless fabric out of a photograph                          money
 *     [фото]  [extract fabric]
 *     LAST FABRICS  ‹ ›   [плитка] [плитка] [плитка] …
 *
 * ⚠ IMAGE TO FABRIC — СВОЙ `Section` (`ImageToFabricSection`, `image-to-fabric.tsx`), А НЕ ГРУППА
 * ЭТОГО. Владелец, с беты: «IMAGE TO FABRIC должно быть отдельным блоком». Он и был задуман
 * отдельным, но стоял линейкой внутри PATTERN — и читался продолжением последнего колорвея. Блок в
 * блок не кладут (DESIGN.md), поэтому оба смонтированы композитором рядом, и разделяет их не
 * линия, а 24px серого поля. Что им обоим нужно из полосы, выводит одна функция —
 * `usePatternStepView` (`step-view.ts`): какой живой прогон ждут в ячейке, а какой в карусели.
 *
 * ═══ ЧТО ЗДЕСЬ СОЗНАТЕЛЬНО НЕ СТОИТ ═══════════════════════════════════════════════════════════
 *   · СТРОКА ДЕНЕГ — ОДНА, в шапке блока, а не у каждого `generate` (ревью, UX-решение): цена
 *     прогона на проводе до прогона не существует, и десять одинаковых «priced by the server»
 *     были бы шумом, а не сведением;
 *   · КАНДИДАТОВ СЛОТА НЕТ (ревью, B5 — «один орган истории»): новейший свотч садится на пару сам
 *     (посадка прогона пишет привязку в той же транзакции), а прежние достаются из карусели
 *     дверью `use for ▸`. Вторая полоса «made for this slot» была бы второй историей;
 *   · БЛОКА GENERATION HISTORY ПОД ШАГОМ НЕТ: композитор снял его отсюда. Он стоял здесь ради
 *     `useRunPolling` — и опрос теперь поднимает сам этот экран (ниже), без истории. ОДИН ОПРОС НА
 *     ШАГ: соседний блок IMAGE TO FABRIC его не зовёт — его живые прогоны едут в той же полосе,
 *     которую опрашивает этот, а второй опрос удвоил бы чтения без единого нового факта;
 *   · ЗАПИСИ ПОСЛЕ ПРОГОНА НЕТ: пару связывает посадка на сервере, клиент не пишет ничего.
 *
 * ═══ ИНВАРИАНТЫ, КОТОРЫЕ ЭТОТ ФАЙЛ ДЕРЖИТ ════════════════════════════════════════════════════
 *   · ОДНО ЧТЕНИЕ ПОЛОСЫ — `band` пропом из `studio-tab.tsx`; всякая запись инвалидирует
 *     `designKeys.band` (хуки `assets/use-assets.ts`, `render/use-design-run.ts`);
 *   · ОДНА ОСЬ КОЛОРВЕЕВ — `colorways` пропом (`useColorwayChoice` композитора); этот экран её не
 *     выбирает, а рисует все колорвеи сразу;
 *   · СЛОТЫ ЧИТАЕТ КОМПОЗИТОР (один `useWatch` на `bomItems`), сюда они приходят массивом;
 *   · ОДНА ПЛАТНАЯ ДВЕРЬ — `useStartDesignRun`, свой экземпляр на ряд (свой отказ и своё «starting…»
 *     у каждой пары; ключ идемпотентности всё равно считается от параметров, а они у пар разные);
 *   · НЕ РЕМОУНТИТСЯ МЕЖДУ КАРТОЧКАМИ (инвариант 12): всякая местная заготовка — цвет и текстура
 *     каждой пары — гаснет В ТЕЛЕ РЕНДЕРА при смене `techCardId` (`shownCard` ниже).
 *
 * ═══ ВОРОТА ВОЗМОЖНОСТИ — ПЕРВЫМИ ════════════════════════════════════════════════════════════
 * `band.assetBindings === undefined` — это бинарь старше привязок (контракт: «ABSENT ≠ EMPTY»):
 * там нет ни `SetDesignAssetBinding`, ни режима свотча, и рисовать двери по слотам против него
 * значило бы продавать прогоны, которые сядут не туда. Превью Vercel против старого backend-beta —
 * обычный случай такого расхождения, поэтому экран говорит одну серую строку и больше ничего.
 * Блок IMAGE TO FABRIC рядом на таком сервере работает (режим «картинка» — легаси) и гасит только
 * `use for ▸` (`bindingsSpoken`, `NO_BINDINGS_REASON`).
 */
export type PatternStudioProps = {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Колорвеи карточки так, как их отдаёт ОДНА ось студии (`useColorwayChoice` композитора). */
  colorways: common_AdminColorwayRef[];
  /** Слоты ткани, прочитанные композитором ОДИН раз (`clothSlots` над `bomItems`). */
  slots: ClothSlot[];
  /** Строки рулонного товара без `id` — сосчитаны, но не нарисованы: сослаться на них нечем. */
  unsavedSlots: number;
  /**
   * Дверь на ДРУГУЮ ВКЛАДКУ карточки (`navTo` из `index.tsx`, писатель `?tab=` один). Не задана —
   * двери нет: у вспомогательной карточки вкладки колорвеев не существует вовсе.
   */
  onGoTab?: (tab: string) => void;
  /** Дверь на другой ШАГ студии — `goStep` композитора, единственный писатель `?step=`. */
  onGoStep: (step: StepId) => void;
};

const QUESTION = '— a fabric swatch for every colourway and slot';

/** Местная заготовка пары: `code` — выбранный пантон (`''` — цвет снят), `texture` — снимок. */
type SlotPick = { code?: string; texture?: common_MediaFull | null };
const NO_PICK: SlotPick = {};

export function PatternStudio({
  band,
  techCardId,
  disabled,
  colorways,
  slots,
  unsavedSlots,
  onGoTab,
  onGoStep,
}: PatternStudioProps): JSX.Element {
  /* ОПРОС ПОЛОСЫ, ПОКА ИДЁТ ПРОГОН — здесь, потому что истории под шагом больше нет, а без опроса
     «making the fabric…» стояло бы вечно. Хук сам молчит, когда живых прогонов нет.
     ОДИН НА ШАГ, И ОН ЗДЕСЬ, ДО ВОРОТ ВОЗМОЖНОСТИ: этот блок смонтирован на шаге всегда (на старом
     сервере — одной строкой), поэтому живой «картинка → ткань» соседнего IMAGE TO FABRIC кончается
     и там. Соседний блок опроса не зовёт. */
  useRunPolling(techCardId, band);
  const speaks = serverSpeaksDesign();
  const step = stepById('pattern');

  /* ═══ ЗАГОТОВКИ ПАР — ОДИН СЛОВАРЬ НА ЭКРАН, И ОН ГАСНЕТ С КАРТОЧКОЙ ═════════════════════════════
     Ключ — `pairKey` (колорвей, строка BOM). Держится ЗДЕСЬ, а не в рядах, ровно ради сброса: ряды
     ключуются id строки, и у другой карточки id другие, так что ряды и так бы пересоздались, — но
     правило шага одно на все заготовки, и оно сказано в одном месте, как у соседей.
     В ТЕЛЕ РЕНДЕРА, А НЕ В ЭФФЕКТЕ (инвариант 12): эффект оставил бы один закоммиченный кадр с
     новой карточкой и старым цветом — а один кадр это одно нажатие `generate`. */
  const [picks, setPicks] = useState<Record<string, SlotPick>>({});
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (Object.keys(picks).length > 0) setPicks({});
  }
  const setPick = useCallback(
    (key: string, patch: SlotPick) =>
      setPicks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } })),
    [],
  );

  const capable = bindingsSpoken(band);
  const byPair = useMemo(() => boundAssetsByPair(band), [band]);

  /* ═══ ПОЛНАЯ БИБЛИОТЕКА ПАНТОНОВ — С ПЕРВОГО КАДРА ШАГА, А НЕ С ПЕРВОГО ОТКРЫТИЯ ПИКЕРА (ревью M-2)
     `swatchColour` берёт hex у `findPantone`, а тот до `ensurePantoneLibrary()` знает только
     отобранные 274 кода. Пикер тянул библиотеку лишь при открытии — значит пантон рецепта вне 274
     уезжал в прогон без hex, пока человек случайно не откроет поповер. Теперь её тянет сам шаг, а
     подписка на версию набора перерисовывает ряды, когда он вырос (чанк приезжает в чужом такте).
     Пока едет — ворота ряда держат `generate` для кода без hex (`swatchGate`, `pantonePending`). */
  useEffect(() => {
    if (capable) void ensurePantoneLibrary();
  }, [capable]);
  useSyncExternalStore(subscribePantone, pantoneVersion, pantoneVersion);
  const libraryState = pantoneLibraryState();
  const pantonePending = libraryState === 'idle' || libraryState === 'loading';

  /* КОЛОРВЕИ ЭКРАНА, ЖИВЫЕ ПРОГОНЫ ПАР И ИХ СЛЕДЫ, ПОТОЛОК ПОЛКИ — тем же выводом, что у соседнего
     блока IMAGE TO FABRIC (`usePatternStepView`): свотч нарисованной пары ждут в её ячейке, всё
     прочее — первым в его карусели, и граница между ними проведена в одном месте. */
  const { shown, liveByPair, traces, ceiling } = usePatternStepView(band, colorways, slots);

  const total = shown.length * slots.length;
  const dressedPairs = shown.reduce(
    (n, c) => n + slots.filter((s) => byPair.has(pairKey(c.colorwayId ?? 0, s.bomItemId))).length,
    0,
  );

  const stepPill = (
    <Pill tone='ink' data-step-pill=''>
      {`step ${step.n}`}
    </Pill>
  );

  if (!capable) {
    return (
      <Section id='design-pattern' title='pattern' question={QUESTION} action={stepPill}>
        <Text size='micro' variant='label' component='p' data-pattern-capability='absent'>
          this server does not know fabric bindings yet — a fabric per slot needs the backend of
          2026-09-26 or later
        </Text>
      </Section>
    );
  }

  return (
    <Section
      id='design-pattern'
      title='pattern'
      question={QUESTION}
      className={GROUP_SEAM}
      action={
        <>
          {stepPill}
          {total > 0 && (
            <Counter
              n={dressedPairs}
              total={total}
              noun='fabric'
              title='pairs of colourway and slot that have a fabric in FABRIC RENDER'
            />
          )}
          {/* THE ONE MONEY LINE OF THE BLOCK: no price exists on the wire before a run is asked
              for, so it says so once here instead of ten times beside ten doors. */}
          <Money data-probe='run-price' />
        </>
      }
    >
      {unsavedSlots > 0 && shown.length > 0 && (
        <Text size='micro' variant='label' component='p' data-slots-unsaved={unsavedSlots}>
          {`save the card to make swatches for ${unsavedSlots} new slot${unsavedSlots === 1 ? '' : 's'}`}
        </Text>
      )}

      {shown.length === 0 ? (
        <div data-pattern-empty='colourways'>
          <EmptyState
            action={
              onGoTab ? (
                <Button variant='secondary' size='xs' onClick={() => onGoTab('colorways')}>
                  colourways ›
                </Button>
              ) : undefined
            }
          >
            {onGoTab
              ? 'no colourways yet — add one on the COLOURWAYS tab'
              : 'no colourways — an auxiliary card makes a material, not colourways'}
          </EmptyState>
        </div>
      ) : slots.length === 0 ? (
        unsavedSlots > 0 ? null : (
          <div data-pattern-empty='slots'>
            <EmptyState
              action={
                <Button variant='secondary' size='xs' onClick={() => onGoStep('mood')}>
                  moodboard ›
                </Button>
              }
            >
              no fabric slots yet — state the cloths on the MOODBOARD step
            </EmptyState>
          </div>
        )
      ) : (
        shown.map((c) => {
          const cwId = c.colorwayId ?? 0;
          const cwName = colorwayLabel(c);
          const archived = archivedRef(c);
          const dressed = slots.filter((s) => byPair.has(pairKey(cwId, s.bomItemId))).length;
          return (
            <div key={cwId} data-slot-colourway-group={cwId} className='min-w-0'>
              <GroupLabel
                flush
                className={GROUP_GAP}
                action={<Counter n={dressed} total={slots.length} noun='fabric' />}
              >
                {/* Свотч — `self-center`, чтобы ряд линейки остался выровнен по базовой линии
                    ТЕКСТА: пустой квадрат своей базовой линии не имеет и опустил бы подпись. */}
                <span className='inline-flex items-baseline gap-1.5'>
                  <Swatch hex={(c.devHex ?? '').trim()} size={10} className='self-center' />
                  {archived ? `${cwName} · archived` : cwName}
                </span>
              </GroupLabel>
              <div className='divide-y divide-hairline'>
                {slots.map((s) => {
                  const key = pairKey(cwId, s.bomItemId);
                  return (
                    <SlotRow
                      key={key}
                      band={band}
                      techCardId={techCardId}
                      disabled={disabled}
                      speaks={speaks}
                      colorway={c}
                      colorwayName={cwName}
                      archived={archived}
                      slot={s}
                      asset={byPair.get(key)}
                      liveRun={liveByPair.get(key)}
                      trace={traces.byPair.get(key)}
                      ceiling={ceiling}
                      pantonePending={pantonePending}
                      pick={picks[key] ?? NO_PICK}
                      onPick={(patch) => setPick(key, patch)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </Section>
  );
}

/**
 * Подпись поля в строке управления. Стоит у ЦВЕТА и только у него (UX-проход, U-2): чип цвета
 * показывает КОД («18-1664 TCX»), а не глагол, и без подписи не сказано, что это за поле; дверь
 * текстуры называет себя сама («+ texture»), и подпись «TEXTURE» рядом читалась словом дважды.
 */
function FieldWord({ children }: { children: string }): JSX.Element {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

/**
 * ═══ ОДИН РЯД — ОДНА ПАРА (КОЛОРВЕЙ, СЛОТ), ДВЕ СТРОКИ ═════════════════════════════════════════
 *
 *   [ячейка]   ИМЯ СЛОТА  назначение  состав · спецификация    ← строка 1: что это
 *              COLOUR [пантон ▾]   [+ texture]   [generate]   ← строка 2: из чего — и дверь
 *
 * Ряд — единица работы (ревью, UX-решение): `generate` стоит у КАЖДОГО ряда, но одна и тихая
 * (secondary, той же меры `xs`, что двери рядом); модель «сначала выбери ряд, потом одна кнопка»
 * завела бы скрытое состояние выбора. Закрытые ворота — погашенная дверь с поводом в `title`
 * (`InertDoor`), никогда не серая плашка и никогда не отсутствие.
 *
 * ⚠ `generate` — В КОНЦЕ СТРОКИ УПРАВЛЕНИЯ, А НЕ У КРАЯ РЯДА (UX-проход, U-1). На 1280 `ml-auto`
 * уносил её на ~650px от цвета и текстуры, из которых она делает свотч, — глаз искал дверь не там,
 * где выбирал. Теперь она стоит следом за дверью текстуры на обычном шаге строки (`gap-x-6`, 24px).
 */
function SlotRow({
  band,
  techCardId,
  disabled,
  speaks,
  colorway,
  colorwayName,
  archived,
  slot,
  asset,
  liveRun,
  trace,
  ceiling,
  pantonePending,
  pick,
  onPick,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  speaks: boolean;
  colorway: common_AdminColorwayRef;
  colorwayName: string;
  archived: boolean;
  slot: ClothSlot;
  asset?: common_DesignAsset;
  liveRun?: common_DesignRun;
  /** Новейший прогон пары, если он кончился без ткани (`runTraces`). */
  trace?: common_DesignRun;
  ceiling: ShelfCeiling;
  /** Полная библиотека пантонов ещё едет — код без hex пока не пускается (`swatchGate`). */
  pantonePending: boolean;
  pick: SlotPick;
  onPick: (patch: SlotPick) => void;
}): JSX.Element {
  const run = useStartDesignRun(techCardId);
  const cwId = colorway.colorwayId ?? 0;
  const usage = useMemo(() => slotUsage(colorway, slot), [colorway, slot]);
  const suggested = useMemo(
    () => slotSuggestions(colorway, colorwayName, slot),
    [colorway, colorwayName, slot],
  );
  const colour = rowColour(pick.code, usage);
  const texture = pick.texture ?? null;
  const pickedCode = pick.code ?? usage.pantone;
  /* ЦВЕТ БЕЗ ПАНТОНА — ЭКРАННЫЙ ЦВЕТ КОЛОРВЕЯ ИЛИ ЦВЕТ РЕЦЕПТА. Он уедет (см. `rowColour`), значит
     он обязан стоять на месте пикера — но ПО ПРАВИЛУ ПИКЕРА ДЛЯ УНАСЛЕДОВАННОГО (его `label`):
     свотч, если это hex, и серое слово ИСТОЧНИКА на двери — «colourway colour» / «recipe colour»,
     а само значение (hex, слово) — в `title` (ревью m-3). Сырой «#5B6236 ▾» на двери читался как
     выбранный пантон, то есть как чужой выбор, сделанный за человека. */
  const fallback = !pickedCode.trim() && colour ? colour.hex || colour.words : '';
  const fallbackLabel = usage.colorSource === 'recipe' ? 'recipe colour' : 'colourway colour';
  const fallbackTitle = fallback
    ? `${fallback} — no Pantone is named for this slot, so the ${fallbackLabel} travels until one is picked`
    : undefined;

  const archivedGate = archivedColorwayGate(archived, colorwayName, 'swatch');
  const gate: Gate = disabled
    ? { ok: false, reason: READ_ONLY_RUN_REASON }
    : !archivedGate.ok
      ? archivedGate
      : liveRun
        ? {
            ok: false,
            reason: 'a swatch for this slot is being made — it lands in the cell by itself',
          }
        : swatchGate(colour, ceiling, speaks, pantonePending);

  const start = () => {
    if (!gate.ok || !colour) return;
    run.start({
      kind: 'pattern',
      ask: '',
      params: {
        // A swatch has no side of a garment: the list is empty EXPLICITLY.
        views: [],
        // THE PAIR IS THE ADDRESS: this colourway and (below) this BOM line. The landing files the
        // swatch AND makes it the fabric of the pair in one transaction — nothing is written after.
        colorwayId: cwId,
        layout: '',
        // THE COLOUR IS THE ONE INPUT A SWATCH IS BUILT FROM (`no_colour` without it): code, the
        // screen hex of that code (the one place the approximation travels on purpose —
        // `swatchColour`) and the words «Pantone … · slot · composition · spec».
        colour: {
          source: '',
          code: colour.code,
          hex: colour.hex,
          words: [colour.words, slot.words].filter(Boolean).join(' · '),
          fabricMediaId: 0,
          fabrics: [],
          colourMaps: [],
        },
        threed: undefined,
        fixTarget: '',
        // ZERO OR ONE TEXTURE picture (`one_texture_picture` past one): the weave and the surface
        // are read from it, never its colour.
        extraInputMediaIds: texture?.id ? [texture.id] : [],
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        detailSlotIds: [],
        pattern: {
          repeatMm: 0,
          name: mintSlotName(band, colorwayName, slot.name),
          sourceAssetId: 0,
          mode: 'swatch',
          bomItemId: slot.bomItemId,
        },
        freeform: undefined,
        useFlatSlots: false,
        flatSlotIds: [],
        // НЕ ПЛЕЙГРАУНД: движок прогона называет только плейграунд; `undefined` провод не меняет.
        image: undefined,
      },
    });
  };

  const advice = run.refusal ? refusalAdvice(run.refusal.words) : '';
  const traceNote = trace ? runTraceNote(trace) : null;
  const traceAdvice = trace
    ? refusalAdvice(`${trace.errorCode ?? ''} ${trace.lastError ?? ''}`)
    : '';

  /* РИТМ: ряд `py-4`, первый прижат к своей линейке (`pt-0` — подпись держит свои ряды), последний
     низ сохраняет: 16px + шов группы 20px разводят колорвеи шире, чем ряды внутри одного (33px). */
  return (
    <div
      data-slot-row={slot.bomItemId}
      data-slot-colourway={cwId}
      className='flex min-w-0 items-start gap-6 py-4 first:pt-0'
    >
      <div style={BENCH_CELL_STYLE}>
        <FabricCell asset={asset} liveRun={liveRun} />
      </div>

      <div className='flex min-w-0 flex-1 flex-col gap-3'>
        {/* ─── строка 1: что это за слот ─────────────────────────────────────────────────── */}
        <div className='flex min-w-0 flex-col gap-1'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='span'
              className='min-w-0 truncate font-bold'
              title={slot.name}
            >
              {slot.name}
            </Text>
            {/* ИМЯ = НАЗНАЧЕНИЕ — ОДНО СЛОВО ОДИН РАЗ (U-3): у строки без своего имени имя берётся
                из назначения, и «CONTRAST / FACING [CONTRAST / FACING]» говорило одно дважды. */}
            {slot.purposeLabel &&
              slot.purposeLabel.trim().toLowerCase() !== slot.name.trim().toLowerCase() && (
                <Pill tone='mut'>{slot.purposeLabel}</Pill>
              )}
          </div>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='block min-w-0 truncate'
            title={slot.detail || 'no composition or spec stated on this BOM line'}
          >
            {slot.detail || '—'}
          </Text>
        </div>

        {/* ─── строка 2: из чего свотч и дверь ────────────────────────────────────────────── */}
        <div className='flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2'>
          <div
            className='flex items-center gap-2'
            data-slot-colour={colour?.code || colour?.hex || 'none'}
            data-slot-colour-inherited={fallback ? usage.colorSource : undefined}
            title={fallbackTitle}
          >
            <FieldWord>colour</FieldWord>
            {fallback && colour?.hex && <Swatch hex={colour.hex} size={14} />}
            <PantonePicker
              name={`slot-${cwId}-${slot.bomItemId}`}
              value={pickedCode}
              label={fallback ? fallbackLabel : '+ pantone'}
              suggested={suggested}
              disabled={disabled}
              onPick={(code) => onPick({ code: code.trim() })}
            />
          </div>

          <div className='flex items-center gap-2' data-slot-texture={texture?.id || 'none'}>
            {texture ? (
              <>
                <Thumb media={texture} alt='texture' className='h-10 w-10' />
                {!disabled && (
                  <Button
                    variant='secondary'
                    size='xs'
                    aria-label='take the texture off'
                    title='take the texture off — a swatch is made from the colour alone just as well'
                    onClick={() => onPick({ texture: null })}
                  >
                    ✕
                  </Button>
                )}
              </>
            ) : disabled ? (
              <InertDoor label='+ texture' reason={READ_ONLY_RUN_REASON} />
            ) : (
              <MediaSelector
                label='+ texture'
                purpose='design · a texture the swatch takes its weave and surface from — never its colour'
                aspectRatio={['Custom']}
                allowMultiple={false}
                showVideos={false}
                saveSelectedMedia={(media) => {
                  const first = media[0];
                  if (first?.id) onPick({ texture: first });
                }}
                trigger={
                  <Button
                    variant='secondary'
                    size='xs'
                    className='border-dashed'
                    title='optional — a picture of the cloth whose weave and surface the swatch should have; its colour is ignored'
                  >
                    + texture
                  </Button>
                }
              />
            )}
          </div>

          <span data-slot-generate={gate.ok ? 'live' : 'inert'}>
            {gate.ok ? (
              <Button
                variant='secondary'
                size='xs'
                disabled={run.isPending}
                onClick={start}
                title={`make a seamless swatch of ${slot.name} in this colour — when it lands it becomes the fabric of ${colorwayName} · ${slot.name} in FABRIC RENDER`}
              >
                {run.isPending ? 'starting…' : 'generate'}
              </Button>
            ) : (
              <InertDoor label='generate' reason={gate.reason} />
            )}
          </span>
        </div>

        {/* THE REFUSAL STAYS ON SCREEN AND IS QUOTED VERBATIM (Ф4): the server's words name the
            cause; our half is the advice under them, never instead of them. */}
        <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
        {run.refusal && advice && (
          <span data-refusal-advice=''>
            <Reason>{advice}</Reason>
          </span>
        )}
        {/* THE LAST RUN OF THE PAIR ENDED WITHOUT A FABRIC (review M-1): said once, under the row,
            in the history's own words, until a newer run or a newer binding answers the pair.
            «last attempt», not «last swatch»: the whole point of the line is that no swatch came
            of it (final review, m-E). */}
        {trace && traceNote && (
          <span
            data-slot-last-run={trace.id ?? ''}
            className='flex flex-col gap-0.5'
            title={traceNote.full}
          >
            <Reason>{`last attempt: ${traceNote.line}`}</Reason>
            {traceAdvice && <Reason>{traceAdvice}</Reason>}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * ЯЧЕЙКА ТКАНИ ПАРЫ — 138 × 162, три состояния одной коробки: живой прогон («making the fabric…»
 * с часами), надетая ткань (2×2 лицо, угол `in render`, зум) или пунктир «no fabric yet». Живой
 * прогон главнее надетой ткани: человек только что нажал `generate`, и ячейка обязана ответить.
 */
function FabricCell({
  asset,
  liveRun,
}: {
  asset?: common_DesignAsset;
  liveRun?: common_DesignRun;
}): JSX.Element {
  if (liveRun) return <PendingTile startedAt={liveRun.startedAt ?? liveRun.createdAt} />;
  if (asset) {
    const label = assetLabel(asset);
    const full = assetFull(asset);
    if (!full) {
      return (
        <Placeholder
          label={`${label} · no image`}
          style={{ aspectRatio: FABRIC_CELL_ASPECT }}
          className='w-full px-2 text-center'
        />
      );
    }
    return (
      <div title={label} data-slot-fabric={asset.id}>
        <PictureTile
          url={full}
          alt={label}
          aspect={FABRIC_CELL_ASPECT}
          className='w-full'
          face={<TiledFace url={full} alt={label} />}
          gallery={{ src: full, thumbnail: assetThumb(asset) || full, type: 'image', alt: label }}
        >
          <CornerLabel at='bl'>in render</CornerLabel>
        </PictureTile>
      </div>
    );
  }
  return (
    <Placeholder
      dashed
      label='no fabric yet'
      style={{ aspectRatio: FABRIC_CELL_ASPECT }}
      className='w-full'
    />
  );
}
