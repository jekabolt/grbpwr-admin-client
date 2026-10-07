import type { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useLocation, useSearchParams } from 'react-router-dom';
import { FIELD_REVEAL_EVENT, type FieldRevealDetail } from 'utils/field-errors';
import type { EditHistory } from 'ui/components/annotation/history';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Section, SectionStack } from 'ui/components/section';
import { ConstructionGeneralInfo } from '../construction-general-info';
import type { TechCardFormData } from '../schema';
import { createReady } from '../create-ready';
import { ArtifactsPanel, type SheetCallout } from './artifacts-panel';
import { Bench } from './bench';
import { useColorwayChoice } from './colorway-picker';
import { ColourwayProposals } from './colourway-proposals';
import { Workbench } from './generation';
import type { DesignKind } from './bench-kinds';
import { ChainRail, useChainCtx, useMoodMinimumGate } from './chain-rail';
import {
  PLAYGROUND_WF_PARAM,
  addressedStep,
  defaultStep,
  kindOfStep,
  legacyStep,
  openGateDoor,
  stepDone,
  stepOfField,
  stepOfKind,
  threedStepRetired,
  type StepId,
} from './core/chain';
import { RenderStudio, ThreedStudio } from './render';
import { RENDER_MIN_VIEWS, benchSides, type Gate } from './render/model';
import { StepFooter } from './step-footer';
import { GenerationHistory } from './generation';
import { DesignCapabilityProvider } from './capability';
import { MaterialSlots } from './material-slots';
import { MoodBoard } from './mood-board';
import {
  PlaygroundStudio,
  inPlaygroundRoom,
  playgroundHistoryMatch,
  playgroundHistoryRep,
  playgroundHistoryScope,
  useLegacyStepRewrite,
  useStepAddress,
} from './playground';
import { FabricsHardware, clothSlots, labelSeedsOf, materialSlots } from './pattern';
import { DraftedProvider } from './head/drafted-provider';
import { useStudioKindSwitch } from './history-recall';
import { PictureGalleryProvider } from './picture-tile';
import { PickModeProvider, usePickMode } from './pick-mode';
import { PickTray } from './band-feed';
import { ReferencesSection } from './references-section';
import { useDesignBand } from './use-design-band';

/**
 * THE STUDIO — the composed DESIGN band, and the only place that knows the order of its organs.
 *
 * The organs themselves are written independently against frozen signatures; this file is where
 * they meet. It holds ONE state of its own — which STEP is on screen — and nothing else: anything
 * more it stored would become a fifth place to look for the truth about a card.
 *
 * ═══ THE SHAPE IS THE PROTOTYPE'S, BLOCK FOR BLOCK (`design-flow.html`, `_core.js` `render`) ═════
 *
 *     stage = railBlock() + RENDER[S.step]()
 *
 * The CHAIN RAIL stands at the TOP — «where this card stands», six cells and the aside, the LOCKED
 * bar under them — and under the rail there is EXACTLY ONE STEP:
 *   · step 0 CARD DETAILS  → the header of the card (`cardDetails`, a slot from `index.tsx`);
 *   · step 1 MOODBOARD     → the board with its callouts, DESCRIPTION and CONSTRUCTION DRAFT (four
 *                            blocks, all drawn by `MoodBoard`), then GENERAL INFORMATION,
 *                            CONSTRUCTION, MATERIAL SLOTS (and the colourway proposals, a product
 *                            block the prototype has no row for) — each organ draws its OWN block;
 *   · steps 2–5 and the aside → the generative screens (flat · pattern · fabric render · 3D ·
 *                            playground), each with its own input, GENERATE and history.
 * Nothing is «always on screen above the rail» any more: the previous build stacked steps 0 and 1
 * over the rail and switched only the screens below it, and the owner, seeing it, said «не как в
 * референсе». Clicking a cell — any cell — switches the step, as `ACTIONS['go']` sets `S.step`.
 *
 * ONE READ FEEDS ALL OF THEM. `useDesignBand` is called here, once, and the band object is passed
 * down. Organs that called it separately would each get their own cache entry and the bench could
 * disagree with the feed about which instant of the card is on screen.
 */

/**
 * The pick banner. It belongs to neither the bench (which asks) nor the feed (which answers), so it
 * lives with the composer that owns both. It promises Esc in words, and `PickModeProvider` makes
 * that true with a document-level listener — the promise and its keeper are deliberately close.
 */
function PickBanner() {
  const { target, cancel } = usePickMode();
  if (!target) return null;
  return (
    <div className='sticky top-0 z-40 flex items-center justify-between gap-4 bg-textColor px-4 py-2'>
      <Text variant='selected' size='control'>
        choosing for {target.label} — click a picture in the band below
      </Text>
      <button type='button' className='uppercase underline' onClick={cancel}>
        esc to cancel
      </button>
    </div>
  );
}

export function StudioTab({
  techCardId,
  disabled,
  cardDetails,
  constructionAspects,
  navTo,
  labelMedia,
  guided = false,
  onCreate,
}: {
  techCardId?: number;
  /**
   * A card born from CREATE NEW and still on its guide (server flag `guided`, onboarding Q4). The
   * footer of FLAT then offers `skip → fabric render ›` beside `go to materials ›` (Q6). Legacy
   * cards: `false`, and the studio is exactly what it was, footers aside.
   */
  guided?: boolean;
  /**
   * Creates the card that does not exist yet and resolves to its id (`undefined` = not created —
   * refused, or a field error is on screen). The owner of the form (`components/index.tsx`) holds
   * the CREATE path, so it arrives as a prop, like `navTo`. Absent: the CARD DETAILS footer of an
   * unsaved card stays dead with its reason — nothing here creates a card on its own.
   */
  onCreate?: () => Promise<number | undefined>;
  disabled?: boolean;
  /** The card's resolved label media (`resolvedLabelMedia`): the composition label's logo. */
  labelMedia?: common_TechCard['resolvedLabelMedia'];
  /**
   * ПЕРЕХОД НА СОСЕДНЮЮ ВКЛАДКУ — ЧУЖОЙ ПИСАТЕЛЬ, А НЕ СВОЙ.
   *
   * Писатель `?tab=` ровно один и живёт у владельца адреса (`components/index.tsx`, `navTo`),
   * читатель у него тоже один — тот же файл берёт оттуда активную вкладку. Заведи студия своё
   * письмо `?tab=`, и писателей стало бы два: первая же правка правила («не ронять ещё и `?bom=`»,
   * «пушить, а не replace») попала бы в одного из двух, и вкладка вела бы себя по-разному в
   * зависимости от того, какая кнопка её открыла, — расхождение, которого не видно ни в типах, ни
   * в сборке. Поэтому переход на вкладку — проп, а не импорт.
   *
   * ⚠ ЭТО НЕ ЗАПРЕТ НА ЧТЕНИЕ АДРЕСА. Студия ПИШЕТ СВОЙ параметр — `?step=` (ниже, `goStep`) — и
   * у НЕГО писатель тоже ровно один, этот файл: `navTo` его не трогает (сохраняет при смене
   * вкладки), а `index.tsx` не читает. Два параметра, по одному владельцу на каждый.
   *
   * Проп ОБЯЗАТЕЛЕН, а не «не задан — двери нет»: дверь отсюда — это работа, а не украшение, и
   * композитор, смонтированный без адресата, обязан не собраться, а не тихо её потерять. Его
   * читатель — таблица слотов материалов (`›` ведёт в редактор строки на вкладке BOM).
   */
  navTo: (tab: string, extra?: Record<string, string>) => void;
  /**
   * ═══ АСПЕКТЫ СБОРКИ — БЛОК CONSTRUCTION ШАГА MOODBOARD (K-8) ═══════════════════════════════════
   *
   * ПОЧЕМУ ПРОП, А НЕ ИМПОРТ `DetailsEditor` ЗДЕСЬ. Редактор аспектов держит СВОЁ локальное
   * состояние показанных аспектов, и два всегда-смонтированных экземпляра уже расходились им
   * (U-9). Экземпляр обязан остаться ОДИН, а отдать его может только владелец шапки
   * (`components/index.tsx`). Пустой слот не рисует ничего: полустрочка `{constructionAspects}`
   * ниже — это `undefined`, а не пустая секция.
   *
   * `Section`-ОБЁРТКА — У САМОГО ОРГАНА (r1). `DetailsEditor` рисует СВОЙ блок `construction ·
   * described aspect by aspect` и ставит ряд `FROM THE MOODBOARD · N OF M DRAFTED ASPECTS · +
   * ASPECT · MOODBOARD MOVED ON` в его `action` — в правый угол линейки, как макет (`step-1.png`).
   * Раньше обёртку держал этот файл и слота `action` не отдавал, и ряд стоял ПОД линейкой; счёты
   * и дверь `+ aspect` знает только редактор, поэтому блок собран там, а не тянет их сюда пропами.
   * Этот файл решает ПОРЯДОК блоков полосы; узел кладётся в стек как есть — обернуть его ещё раз
   * значило бы коробку в коробке. То же у `ConstructionGeneralInfo`.
   */
  constructionAspects?: ReactNode;
  /**
   * ═══ CARD DETAILS — STEP 0 OF THE CHAIN, AS A SLOT, NOT A MOVE (WAVE2 p.1) ═══════════════════
   *
   * The header of the card (identification / classification / base model / roles / linked products)
   * is the first step of the rail and is drawn as ITS OWN SCREEN, under the rail, when step 0 is
   * open. It arrives as a node from the owner of the header (`components/index.tsx`), by the same
   * device as `constructionAspects`, and for two reasons that are correctness, not taste:
   *   · the fields inside it (`name`, `styleNumber`, …) must render on a card that DOES NOT EXIST
   *     YET — otherwise a new card cannot be created at all. The studio has three states
   *     (`!techCardId`, `isLoading`, loaded), and step 0 is drawn in ALL of them: it is the one step
   *     that hangs off the form alone and needs no band;
   *   · `StyleFactsField` — the ONE writer of brand / collection / season / targetGender through its
   *     own `UpdateStyle` — stays in `index.tsx`, mounted unconditionally. Moved under
   *     `activeTab === 'studio'` it would silently roll those fields back on every other tab.
   */
  cardDetails?: ReactNode;
}) {
  /* ═══ EVERY HOOK STANDS ABOVE THE ONE RETURN, AND THERE IS NO EARLY RETURN LEFT ═══════════════
     Below an early return a hook runs on some renders and not on others; React answers with
     error 310 and takes the WHOLE tree down — the tab went white for exactly that once. The three
     states of the studio (`!techCardId`, `isLoading`, loaded) are branches of `body` below, not
     returns. */
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);

  /* Что нужно блокам шага MOODBOARD. Все поля, которые они правят (`fit`, `categoryId`,
     `details[]`, `bomItems[]`), живут в ОДНОЙ форме тех-карты и берутся через `useFormContext`:
     ни один проп ниже не заводит копию состояния. */
  const { control } = useFormContext<TechCardFormData>();
  const purpose = useWatch({ control, name: 'purpose' }) as string | undefined;
  const isAux = purpose === 'TECH_CARD_PURPOSE_AUXILIARY';
  /* ═══ СЛОТЫ ТКАНИ — ОДНО ЧТЕНИЕ `bomItems` НА ВСЮ СТУДИЮ (STEP 3) ══════════════════════════════
     Шаг PATTERN рисует ряд на каждую пару (колорвей, слот ткани), а FABRIC RENDER засевает ткани
     колорвея из тех же пар — значит оба экрана обязаны читать ОДИН список слотов, и читает его
     композитор, раздавая массив пропом (`slots`). Второй `useWatch` в экране развёл бы их о том,
     какие у изделия ткани, на первой же несохранённой правке строки.
     `compute` + глубокое сравнение внутри `useWatch`: студия перерисовывается, только когда слоты
     изменились ПО СМЫСЛУ (имя, состав, назначение, сохранённый id), а не на каждую правку нормы
     расхода или строки ниток. Форма здесь только ЧИТАЕТСЯ: писатель `bomItems` — корневой
     `setValue`, и `useFieldArray` над ним один (вкладка BOM). */
  const cloth = useWatch({ control, name: 'bomItems', compute: (lines) => clothSlots(lines) });
  // STEP 3 · MATERIALS: every saved BOM line except threads.
  const materials = useWatch({
    control,
    name: 'bomItems',
    compute: (lines) => materialSlots(lines),
  });
  // A label slot seeds placement · fold · size from its card LABELS row (read, never written).
  const labelSeeds = useWatch({
    control,
    name: 'garmentLabels',
    compute: (rows) => labelSeedsOf(rows),
  });
  // A label slot seeds its logo from the composition label's (resolved by the card read).
  const logoMediaId = useWatch({ control, name: 'careLabel.logoMediaId' }) as number | undefined;
  const labelLogo = (labelMedia ?? []).find(
    (m) => (m.media?.id ?? 0) > 0 && m.media?.id === (logoMediaId ?? 0),
  )?.media;
  const { canWrite } = usePermissions();
  const canWriteCard = canWrite(SECTION.techCards);

  /* АДРЕС — ОДИН НА ОБА ПАРАМЕТРА СТУДИИ (`?step=` ниже, `?colorway=` тут же). Читается ВЫШЕ
     `useColorwayChoice`, потому что цель, названную адресом, хук получает пропом. */
  const [params, setParams] = useSearchParams();

  /* ═══ ЧЕЙ ЭТО РЕНДЕР — ОДНО ЧИСЛО НА ВСЮ СТУДИЮ (круг 19, C1) ═════════════════════════════════
     Ось — продуктовый колорвей карточки, тот самый, которым ключуются верстак рендеров, ворота 3D и
     история. Владелец хука — композитор, не экран: верстак рендеров ПИШЕТ FABRIC RENDER, ЧИТАЕТ 3D,
     а СЕРВЕР по нему собирает (`designSelectBench`); заведи второго владельца — и полоса входа 3D
     показывала бы ROSSO, пока прогон уезжает за OLIVE. Число раздаётся вниз ПРОПОМ.

     ═══ ⚠ `?colorway=<id>` — ЭТО ВТОРАЯ ПОЛОВИНА ДВЕРИ «open in studio ›» (Codex MAJOR 2) ═══════
     Пишет её вкладка COLOURWAYS (`colorway-recipe.tsx`), у КОНКРЕТНОГО колорвея, вместе с
     `?tab=studio&step=render`. Правило системы одно и оно же держит обе половины: ПАРАМЕТР ЧИТАЕТ
     ТА ВКЛАДКА, КОТОРУЮ НАЗЫВАЕТ `?tab=`. Вкладки тех-карты смонтированы ВСЕ СРАЗУ (`SectionStack
     hidden=…`, index.tsx), поэтому без этого гейта две вкладки читали бы одно число и та, что
     быстрее, съедала бы его у адресата.

     ЧИСЛО РАЗБИРАЕТСЯ ЗДЕСЬ, А ПРОВЕРЯЕТСЯ В ХУКЕ: `Number(null) === 0` и `Number('olive')`
     — `NaN`, оба не проходят `> 0`; а вот «есть ли такой колорвей у карточки» знает только тот,
     кто читал карточку. Снятие параметра — тоже здесь: адрес принадлежит композитору, и второй
     его писатель развёл бы правило «replace, не трогая `tab`/`step`» на две редакции. */
  const addressedTab = params.get('tab');
  const askedColorway = addressedTab === 'studio' ? Number(params.get('colorway')) : NaN;
  const deepLinkColorway = Number.isFinite(askedColorway) && askedColorway > 0 ? askedColorway : 0;
  /* The entry's own state rides along: dropping a spent `?colorway=` is not a navigation, and it
     must not wipe the playground's «opened from the grid» mark (G-01). */
  const entryState = useLocation().state as unknown;
  const dropColorwayParam = useCallback(() => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('colorway');
        return p;
      },
      { replace: true, state: entryState },
    );
  }, [setParams, entryState]);
  const colorway = useColorwayChoice(techCardId, band, deepLinkColorway, dropColorwayParam);

  const readOnly = !!disabled;

  // WHAT SURVIVES A SERVER THAT DOES NOT SPEAK THE BAND: the moodboard step and the card step are
  // fields of the tech card form — they save through the ordinary UpdateTechCard and touch not one
  // design RPC. On a contour whose binary predates the band the generative steps degrade to a
  // notice; these two do not.
  const bandless = !serverSpeaks;

  /* ═══ THE STEP — `S.step` OF THE PROTOTYPE, THE ONE STATE OF THIS COMPOSER ═══════════════════════

     WHERE IT LIVES: in the address, `?step=…`, and nowhere else. The prototype keeps it in the URL
     hash (`render()` ends with `history.replaceState(null, '', '#' + S.step + …)`, `boot()` reads it
     back), so that a reload lands where the person was. There is no `localStorage` in this zone by
     decision, and a `useState` beside the URL would be a second owner that the URL contradicts on
     the first reload. Writer: `goStep` below, the only one; reader: this line. `?tab=` stays with
     `index.tsx` (see the `navTo` prop) — two parameters, one owner each.

     WHAT IT MEANS WHEN THE ADDRESS SAYS NOTHING — the opening step, `boot()`'s «otherwise the first
     step», read as the first step WITH WORK LEFT (`defaultStep`, core/chain.ts): a card that has
     drawn nothing opens on CARD DETAILS, a card with pictures on the first link not yet done.

     ⚠ DECIDED ONCE PER CARD, NOT FOLLOWED LIVE, and the difference is a hand on the keyboard:
     followed live, the step would jump under a person the moment a run finished or a picture was
     pinned. The latch waits for what the rule reads to have ARRIVED — the band (`!isLoading`) and
     the seeded form (`name` is required to save, so an empty name on a saved card means the reset
     has not landed yet) — then fixes the answer for the life of this card on this mount.

     ONE CARD, ONE MOUNT — in the app. `page.tsx` keys the whole card by its route id
     (`TechCardStagingProvider key={id}`), so walking to another card, and a new card getting its
     id (index.tsx navigates to the new address), each mount a fresh composer with a fresh latch;
     «the composer is not remounted between cards» (the old invariant 12) is not true of the page.
     The reset below, in the body of the render and never in an effect, is a belt for a parent that
     swaps the id under a mounted composer (the probes do): it costs nothing and leaves no committed
     frame with the other card's step. There a card that does not exist yet keeps its one step when
     its id arrives — the person who just pressed Save is on the header, and the header must not
     blink out while the (empty) band is read for the first time.

     UNDECIDED IS NOT «CARD DETAILS FOR NOW». While the address says nothing and the latch has not
     fired, no step is drawn — the screen says «loading…» under the rail — rather than the header
     being shown and then swapped for the decided step a moment later. A step that is on screen
     must be a step the person can stay on; the cells are live throughout, so CARD DETAILS is one
     click away at any moment (and that click writes the address, which then wins). */
  /* `params` / `setParams` взяты выше — у чтения `?colorway=`: адрес один, и читатель его один. */
  const urlStep = params.get('step');
  const chain = useChainCtx({
    band,
    bandless,
    colorway: { id: colorway.colorwayId, label: colorway.label, archived: colorway.archived },
  });
  const opened = useRef<{ id: number | undefined; step: StepId | null }>({
    id: techCardId,
    step: null,
  });
  if (opened.current.id !== techCardId) {
    opened.current = { id: techCardId, step: opened.current.id === undefined ? 'card' : null };
  }
  if (opened.current.step === null) {
    if (!techCardId) opened.current.step = 'card';
    else if (!isLoading && chain.card.name.trim()) opened.current.step = defaultStep(chain);
  }
  /* A step that no longer exists (`?step=aside`) is read as its new home in this very render and
     rewritten once below, so neither the default-step latch nor a blank frame ever sees it. An
     unknown value falls through to the latch, as before.

     ⚠ `?step=threed` IS BOTH A STEP AND A LEGACY ADDRESS (C-10), AND THE SERVER DECIDES WHICH. STEP 5
     left the rail for the playground tile `image_to_3d` — on a server that lists its playground
     workflows. On an older one it is still the only way to a 3D model and stays a step; while the
     band has not answered it is neither (the screen says «loading…»). So the legacy answer is asked
     FIRST (`addressedStep`): `threed` is a valid `StepId` and would otherwise win. */
  const threedRetired = threedStepRetired(chain);
  const legacy = legacyStep(urlStep, threedRetired);
  const decided: StepId | null = addressedStep(urlStep, threedRetired) ?? opened.current.step;
  const ctx = { ...chain, now: decided };
  /* The rail's write and the legacy rewrite live with the playground's address rules
     (`playground/address.ts`): every one of them replaces, so the card's steps stay one history
     entry and Back leaves the card (G-01 r2). */
  const goStep = useStepAddress();
  useLegacyStepRewrite(legacy);

  /* ═══ THE GENERATIVE KIND IS DERIVED FROM THE STEP, NEVER HELD BESIDE IT ═════════════════════════
     `kind` was the studio's state (`state.kind` of the old prototype); now the step is, and the
     kind is what the step says it opens (`kindOfStep`). CARD DETAILS and MOODBOARD open no
     generative screen — `kind` is undefined there, and that is a value, not a gap. Two states here
     would be two places that can disagree about which screen is on. */
  const kind: DesignKind | undefined = decided ? kindOfStep(decided) : undefined;
  /* A DOOR TO 3D WHERE STEP 5 HAS LEFT THE RAIL (C-10) opens the playground ON the workflow that
     replaced it, in one write — «with ± the same functionality» (the owner), so the door keeps its
     destination. Where STEP 5 is still drawn, or the server has not answered, it is the step. */
  const goKind = (next: DesignKind) =>
    next === 'threed' && threedRetired
      ? goStep('playground', 'image_to_3d')
      : goStep(stepOfKind(next).id);
  /* РЕКОЛ ПЕРЕКЛЮЧАЕТ ЭКРАН СТУДИИ (V-12в, владелец: «если мы нажимаем на рекол из генерации
     допустим фабрик рендера оно должно переключатся на фабрик рендер а не пихать их во флеты»).
     Наружу отдаётся не копия состояния, а дверь к владельцу: `goKind` — это `goStep` через таблицу
     шагов. ⚠ РЕГИСТРИРУЕТСЯ ТОЛЬКО ПОКА ОТКРЫТ ГЕНЕРАТИВНЫЙ ЭКРАН: запись в реестре — это «на
     экране стоит вид `kind`», и на CARD DETAILS / MOODBOARD такого вида нет. Сказать реестру
     `'flat'`, стоя на мудборде, значило бы соврать всем его читателям («уже на флэте — не
     переключать»); контракт хука для «нечего регистрировать» — нулевая карточка, и здесь она
     означает ровно это. Ни одна дверь рекола с этих двух шагов не открывается (история прогонов
     стоит только на генеративных), так что читателей у пустой записи нет. */
  useStudioKindSwitch(kind ? techCardId ?? 0 : 0, kind ?? 'flat', goKind);

  /* ═══ THE STEP FOOTER — ONE FORWARD DOOR PER STEP, DECIDED HERE (onboarding S3) ═══════════════
     The composer knows the step and owns `goStep`, so the footer of every step is chosen in this one
     place and drawn as the last child of that step's screen (`step-footer.tsx`). Each door is the
     owner's: CARD DETAILS → moodboard, MOODBOARD → flats, FLAT → materials, MATERIALS → fabric
     render, FABRIC RENDER → image to 3D, where the guide ends (Q7) — 3D and the playground keep
     their own doors and get no footer. Each gate is the one the next step is opened by: the
     moodboard minimum (the same sentence the flat's GENERATE refuses with), front and back on the
     flat bench (what a fabric render is coloured over, `RENDER_MIN_VIEWS`), a render on the bench
     (`stepDone('render')`, what 3D is built from). MATERIALS is optional and never holds anyone. */
  const [newName, newCategoryId, newSeason, newStyleNumber] = useWatch({
    control,
    name: ['name', 'categoryId', 'season', 'styleNumber'],
  });
  const moodMinimum = useMoodMinimumGate();
  const flatsMissing = bandless
    ? [...RENDER_MIN_VIEWS]
    : benchSides(band)
        .filter((s) => RENDER_MIN_VIEWS.includes(s.view) && !s.picture)
        .map((s) => s.view);
  const flatGate: Gate = flatsMissing.length
    ? {
        ok: false,
        reason: `${flatsMissing.join(' and ')} flat${flatsMissing.length > 1 ? 's' : ''} first`,
      }
    : { ok: true };
  let footer: ReactNode = null;
  switch (decided) {
    case 'card': {
      if (techCardId) {
        footer = (
          <StepFooter
            step='card'
            label='next · moodboard ›'
            gate={{ ok: true }}
            onGo={() => goStep('mood')}
          />
        );
        break;
      }
      const ready = createReady({
        name: newName,
        categoryId: newCategoryId,
        season: newSeason,
        styleNumber: newStyleNumber,
      });
      footer = (
        <StepFooter
          step='card'
          label='next · moodboard ›'
          pendingLabel='creating…'
          gate={
            !ready.ok
              ? ready
              : onCreate
                ? { ok: true }
                : { ok: false, reason: 'add the card first' }
          }
          onGo={async () => {
            const id = await onCreate?.();
            if (id) goStep('mood');
          }}
        />
      );
      break;
    }
    case 'mood':
      footer = (
        <StepFooter
          step='mood'
          label='go to flats ›'
          gate={moodMinimum}
          /* Only the doors that lead OFF this screen (the category, on CARD DETAILS): the board and
             DESCRIPTION are blocks of this very step, and three doors beside one dead primary
             would be the clutter the footer exists to avoid. */
          doors={
            !moodMinimum.ok &&
            moodMinimum.doors
              .filter((d) => d.step !== 'mood')
              .map((d) => (
                <Button
                  key={d.field}
                  variant='secondary'
                  size='xs'
                  onClick={() => openGateDoor(d)}
                  data-gate-door={d.field}
                >
                  {d.label}
                </Button>
              ))
          }
          onGo={() => goStep('flat')}
        />
      );
      break;
    case 'flat':
      footer = (
        <StepFooter
          step='flat'
          label='go to materials ›'
          gate={flatGate}
          aside={
            guided &&
            flatGate.ok && (
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                data-step-skip='render'
                onClick={() => {
                  goStep('render');
                  window.scrollTo({ top: 0 });
                }}
              >
                skip → fabric render ›
              </Button>
            )
          }
          onGo={() => goStep('pattern')}
        />
      );
      break;
    case 'pattern':
      footer = (
        <StepFooter
          step='pattern'
          label='go to fabric render ›'
          gate={{ ok: true }}
          onGo={() => goStep('render')}
        />
      );
      break;
    case 'render':
      footer = (
        <StepFooter
          step='render'
          label='image to 3d ›'
          gate={
            stepDone('render', ctx)
              ? { ok: true }
              : { ok: false, reason: 'a fabric render on the bench first' }
          }
          onGo={() => goKind('threed')}
        />
      );
      break;
  }

  /* ═══ A REFUSAL AIMED AT A FIELD OF ANOTHER STEP SWITCHES TO THAT STEP ═════════════════════════
     One step is on screen at a time, so `revealField` (utils/field-errors) finds NO anchor for a
     field of a step that is not open — a Save refused over `fit` while the flat is on, a server
     violation on `bomItems.2.name` from the BOM tab (ERROR_TAB in index.tsx routes it to STUDIO,
     and this is where the route ends). Rather than say «not on this tab» over a field that IS on
     this tab, one step away, `revealField` asks the document who can bring it on, and this listener
     answers from the step map (`stepOfField`): claim (`preventDefault`) and switch. The reveal
     then waits frames for the step to mount and pulses the field. Not claimed: a path this map does
     not know, or a field of the step already open (a hidden anchor there is its own container's
     business) — `revealField` keeps its honest `false`. Imperative because React attaches no
     custom events from JSX; on `document` because a missing anchor has nothing to bubble from.

     ⚠ ONCE THE STEP IS ON, THE REQUEST IS ASKED AGAIN WHILE ITS ANCHOR IS STILL MISSING (round-3
     review, MIN-5). Some anchors are drawn only when their owner opens them: a moodboard callout's
     text (`callouts.N.description`) exists for the SELECTED row alone, and the board, which selects
     it on request, was not mounted when the first request went out. So for a few frames after the
     switch the same request goes out again — to `document` while there is no anchor, until an
     owner claims it; on the anchor while it is drawn but hidden (a folded board), so the fold
     around it opens — and stops once the anchor is shown. This listener no longer claims it (the
     step is on), so nothing loops. */
  const stepRef = useRef(decided);
  stepRef.current = decided;
  const goRef = useRef(goStep);
  goRef.current = goStep;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const path = (e as CustomEvent<FieldRevealDetail>).detail?.path ?? '';
      const home = stepOfField(path);
      if (!home || home === stepRef.current) return;
      e.preventDefault();
      goRef.current(home);
      let left = 90;
      const again = () => {
        const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(path)}"]`);
        const shown =
          !!el &&
          (typeof el.checkVisibility === 'function'
            ? el.checkVisibility()
            : el.getClientRects().length > 0);
        if (shown) return;
        if (stepRef.current === home) {
          const ask = new CustomEvent<FieldRevealDetail>(FIELD_REVEAL_EVENT, {
            bubbles: true,
            cancelable: true,
            detail: { path },
          });
          if (!(el ?? document).dispatchEvent(ask) && !el) return;
        }
        if (--left > 0) requestAnimationFrame(again);
      };
      requestAnimationFrame(again);
    };
    document.addEventListener(FIELD_REVEAL_EVENT, onAsk);
    return () => document.removeEventListener(FIELD_REVEAL_EVENT, onAsk);
  }, []);

  /* ═══ THE RAIL — FIRST CHILD OF THE STACK IN EVERY STATE ═══════════════════════════════════════
     Drawn before the band is read and before the card exists: while the band loads every
     band-derived state is «unknown» (`bandless`), never «locked», and the cells still navigate.

     ⚠ СЕЛЕКТА КОЛОРВЕЯ ЗДЕСЬ БОЛЬШЕ НЕТ (G2-2). Ось показывают общие плиточные полосы MATERIALS
     и FABRIC RENDER, селект в ряду GENERATE у 3D и чипы PAINT on-model. Состояние по-прежнему
     ОДНО (`useColorwayChoice` выше) и раздаётся вниз пропами. */
  const rail = <ChainRail ctx={ctx} onStepChange={goStep} />;

  /* ═══ ONE RETURN, ONE STACK: `SectionStack > [rail, screen]` ═══════════════════════════════════
     The header used to be drawn inside each of three returns — same element, different parents —
     and React remounted its fields on every `!techCardId → loaded` and `loading → loaded`
     transition (the season picker a person had open closed by itself when the band arrived). Now
     the screen of step 0 is the SAME node at the SAME position in all three states, because step 0
     is decided BEFORE the state is looked at: a card that does not exist yet and a card whose band
     is loading both draw the header, untouched. Only the other steps have a «save first» and a
     «loading…» face. The wrapper is `display: contents`, so the blocks inside stay direct flex
     items of the stack and keep its 24px gutter. */
  let screen: ReactNode;
  if (decided === null || (decided !== 'card' && techCardId && isLoading)) {
    screen = (
      <Section title='studio'>
        <Text variant='inactive' size='control'>
          loading…
        </Text>
      </Section>
    );
  } else if (decided === 'card') {
    screen = cardDetails ? (
      <div data-step-screen='card' className='contents'>
        {cardDetails}
        {footer}
      </div>
    ) : null;
  } else if (!techCardId) {
    // A card that has not been created yet has no band and cannot have one: every write below is
    // keyed by tech_card_id. Saying so is more useful than rendering seven empty organs.
    screen = (
      <Section title='studio' question='· what this style looks like, before it is frozen'>
        <Text variant='inactive' size='control'>
          Save this tech card first. The studio hangs off the card, so there is nothing to hang it
          on yet — card details is the one step it has.
        </Text>
      </Section>
    );
  } else {
    const step: StepId = decided;
    screen = (
      <DesignCapabilityProvider value={!bandless}>
        {/* ОДИН ПРОСМОТРЩИК НА ВСЮ СТУДИЮ, и он монтируется ЗДЕСЬ, потому что это единственное
            место, откуда видны сразу все органы полосы: референсы, история прогонов, верстак.
            Владелец (круг 4, пункт 8): «что бы можно было в зум вью по всем картинкам из всех
            генераций итерироваться не только этой». Ряд собирают сами плитки (`PictureTile`), а
            порядок берётся из документа, поэтому листается ровно то, что видно. */}
        <PictureGalleryProvider techCardId={techCardId} band={band}>
          <PickModeProvider>
            <div data-step-screen={step} className='contents'>
              <PickBanner />
              {/* ═══ STEP 1 · MOODBOARD — the board with its callouts, the DESCRIPTION and the
                  CONSTRUCTION DRAFT (four blocks, drawn by `MoodBoard` as its own stack), then what
                  the draft writes into: GENERAL INFORMATION, CONSTRUCTION, MATERIAL SLOTS. The
                  order is the prototype's step screen (`_step-mood.js`) top to bottom, and reads
                  as a story: what the style looks like, what it is, how it is made, what it is
                  made of.

                  ⚠ THE ONE `useFieldArray` OVER `callouts` LIVES IN THE BOARD (`mood-callouts.tsx`),
                  and this is the only step that mounts it — zero or one in the tree, never two
                  (invariant 1: two instances over one name do not synchronise in RHF 7.62, rows are
                  lost). `moodboardMedia` and `bomItems` are written by root `setValue` only; the BOM
                  tab's own `useFieldArray` over `bomItems` stays mounted in `index.tsx` (`hidden`),
                  untouched by which step is open here. */}
              {step === 'mood' && (
                <>
                  {/* `ai ✦` of the DESCRIPTION and the draft's GENERATE are writes of this card
                      (EnhanceText and DraftDesignIdea need tech_cards:write), so the board locks on
                      the grant as GENERAL INFORMATION does — one rule per door on every surface
                      (seam review, S-m2). */}
                  <MoodBoard techCardId={techCardId} disabled={readOnly || !canWriteCard} />
                  {/* КАЖДЫЙ ОРГАН — СВОЙ БЛОК, И ШАПКА С `action` У НЕГО (r1, макет `step-1.png`):
                      `ConstructionGeneralInfo` рисует `general information · what this style is`
                      с рядом `FROM THE MOODBOARD · N OF M DRAFTED FIELDS · MOODBOARD MOVED ON` в
                      правом углу линейки, `DetailsEditor` — `construction · described aspect by
                      aspect` со своим рядом и дверью `+ aspect`; счёты знают только они. Обёртки
                      здесь больше нет — обернуть их ещё раз значило бы коробку в коробке
                      («A block NEVER contains another block»), а порядок «общие сведения → аспекты
                      → слоты» выражается соседством в стеке. Слот аспектов может быть пуст
                      (владелец шапки отдаёт сюда свой единственный `DetailsEditor`); пустой он не
                      рисует ни секции, ни отступа. */}
                  <ConstructionGeneralInfo
                    isAux={isAux}
                    readOnly={readOnly || !canWriteCard}
                    frozen={readOnly}
                  />
                  {constructionAspects}
                  {/* ТАБЛИЦА СЛОТОВ — НА МЕСТЕ СНЯТОЙ СПЕЦИФИКАЦИИ (B-16 / B-19 / B-20). Рисуется
                      ВСЕГДА, даже пустой: пустая спецификация — такое же утверждение о карточке, и
                      именно её пустота зовёт нажать «draft the construction» выше. `Section` у
                      блока СВОЯ: у него собственный `action` — чипы рождения слота. `navTo` — его
                      дверь `›` в редактор ЭТОЙ строки на вкладке BOM. */}
                  <MaterialSlots
                    techCardId={techCardId}
                    readOnly={readOnly || !canWriteCard}
                    onGoTab={navTo}
                  />
                  {/* КОЛОРВЕИ, ПРЕДЛОЖЕННЫЕ ЧЕРНОВИКОМ (B-25, D5) — продуктовый блок, которого в
                      макете нет; стоит сразу под таблицей слотов и читается её продолжением: «вот
                      слоты; вот чем их красят». Блока НЕТ ВОВСЕ, пока черновик ничего не предложил —
                      условие знает только орган (модульный стор), поэтому обёртка у него своя. */}
                  <ColourwayProposals
                    techCardId={techCardId}
                    readOnly={readOnly || !canWriteCard}
                  />
                </>
              )}
              {step !== 'mood' &&
                (bandless ? (
                  <Section title='bench' question='· the flats this style is drawn from'>
                    <Text variant='inactive' size='control'>
                      {error
                        ? `The bench could not be read: ${error.message}`
                        : 'This server does not serve the design band yet, so the bench and the ' +
                          'reference roles are not available here. The card details and the ' +
                          'moodboard save normally.'}
                    </Text>
                  </Section>
                ) : (
                  <>
                    {/* ═══ STEP 2 · FLAT — input (references, words, GENERATE), the latest
                        generation (O-67), the history, the flat slots. The input section is THIS step's (prototype: «референсы
                        рисуются только у FLAT; в render и 3D они в одном клике, не на экране»).
                        `#design-input` is the anchor the doors «+ add files» of the empty studio
                        and of the folded generation form lead to. */}
                    {step === 'flat' && (
                      <>
                        <div id='design-input'>
                          {/* WORDS' `ai ✦` and the flat's GENERATE lock on the grant too (S-m2):
                              a viewer is stopped at the door, not by a 403 after it. */}
                          <ReferencesSection
                            techCardId={techCardId}
                            band={band}
                            disabled={readOnly || !canWriteCard}
                          />
                        </div>
                        {/* ═══ WORKBENCH — ONE BLOCK, RIGHT UNDER INPUT — REFERENCES (T30): what this
                            step's GENERATE brought back, then the GENERATION HISTORY folded as its
                            last part (`generation/studio.tsx`). Its `[data-workbench]` wrapper is
                            the next sibling of `#design-input`. */}
                        <Workbench
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly || !canWriteCard}
                        />
                      </>
                    )}
                    {/* ═══ STEP 3 · MATERIALS — the studio's shared colourway strip, then the
                        material cells and their generate panel. Polls its own runs. */}
                    {step === 'pattern' && (
                      <FabricsHardware
                        band={band}
                        techCardId={techCardId}
                        disabled={readOnly || !canWriteCard}
                        colorways={colorway.cardColorways ?? colorway.colorways}
                        colorwayId={colorway.colorwayId}
                        onColorwayChange={colorway.setColorwayId}
                        slots={materials.slots}
                        labelSeeds={labelSeeds}
                        labelLogo={labelLogo}
                        onGoStep={goStep}
                        loading={colorway.loading}
                      />
                    )}
                    {/* ═══ STEP 4 · FABRIC RENDER.

                        ⚠ `key={colorway.colorwayId}` СНЯТ (G2-3), И ЭТО ОБЯЗАТЕЛЬНО, А НЕ УБОРКА.
                        Ремоунт стоял ради одного: `useColourDraft` засевает рецепт ОДИН РАЗ ЗА
                        МОНТИРОВАНИЕ, и «однажды» ≠ «заново на смене цвета». Теперь полоса цели
                        живёт ВНУТРИ этого экрана — компонент не может ремоунтить сам себя, не
                        уничтожив состояние собственного органа выбора. Второе правило живёт у
                        `useColourDraft`: на смене цели он переселяет цвет и ткани из привязок
                        новой цели, не теряя ручной выбор по правилам происхождения.
                        `colorwayArchived` — ЕДИНСТВЕННЫЙ предикат архива студии
                        (`useColorwayChoice`), поэтому подсказка и отказ не могут разойтись. */}
                    {step === 'render' && (
                      <>
                        <RenderStudio
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          onGoToKind={goKind}
                          colorwayId={colorway.colorwayId}
                          colorwayRef={colorway.current}
                          colorwayLabel={colorway.label}
                          colorwayArchived={colorway.archived}
                          /* ЦЕЛЬ ВЫБИРАЮТ ЗДЕСЬ, НО ВЛАДЕЕТ ЕЮ КОМПОЗИТОР: вниз едет список
                             колорвеев карточки и ТОТ ЖЕ САМЫЙ сеттер, которым пользуется полоса
                             MATERIALS. Второго состояния не заводится ни на одном экране. */
                          colorways={colorway.colorways}
                          onColorwayChange={colorway.setColorwayId}
                          /* O-57 r4: СЫРОЙ список колорвеев карточки, архивные без плит тоже, —
                             правило столбца `sample` (D-56″: семпл только у карточки без единого
                             колорвея) и членство плит у дверей рендера (снесённый колорвей против
                             архивного пустого, `render/render-tile.tsx`). Берётся у того же хука,
                             то есть у ОДНОГО чтения карточки в студии, а не вторым наблюдателем в
                             разделе. */
                          cardColorways={colorway.cardColorways}
                          /* STEP 3: ТЕ ЖЕ слоты, что у шага PATTERN, — из ОДНОГО `useWatch`
                             выше. По ним подача засевает ткани колорвея из привязок, а сетка
                             CLOTHS ставит надетые плитки первыми. */
                          slots={cloth.slots}
                          /* R7 · artworks = the DECORATION lines of the same MATERIALS read. */
                          artworkSlots={materials.slots}
                          /* T30: the history is mounted by the studio, inside its workbench block. */
                        />
                      </>
                    )}
                    {/* ═══ STEP 5 · 3D — ONLY WHERE THE RAIL STILL DRAWS IT (C-10). On a server that
                        lists its playground workflows the step is the tile «Image to 3D» and
                        `?step=threed` is rewritten before it gets here (`legacyStep`); this screen
                        is the old server's one way to a 3D model and stays exactly as it was.

                        The same colourway number as the render, and NO remount: the 3D draft
                        (presentation, model, body, size) is not a colour and must survive a change
                        of colourway; everything colour-dependent (`threedSides`, the gate, the run
                        body) is a selector over the band and follows the prop. */}
                    {step === 'threed' && (
                      <>
                        <ThreedStudio
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          onGoToKind={goKind}
                          colorwayId={colorway.colorwayId}
                          colorwayLabel={colorway.label}
                          colorwayArchived={colorway.archived}
                          /* `for:` в ряду GENERATE — тот же единственный сеттер, что у фабрик-
                             рендера. Список экран сузит сам: собирать можно только из колорвеев,
                             у которых стоит FRONT. */
                          colorways={colorway.colorways}
                          onColorwayChange={colorway.setColorwayId}
                        />
                        {/* E-23: closed by default. */}
                        <GenerationHistory
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          defaultRep='threed'
                          defaultOpen={false}
                        />
                      </>
                    )}
                    {/* ═══ ASIDE · PLAYGROUND — the one room beside the chain (C-01). ON MODEL
                        lives here now as the workflow `change_color`, STEP 5 as `image_to_3d`; a
                        legacy `?step=aside` / `?step=threed` is rewritten above. NO colourway
                        prop: a workflow that binds one carries it itself.

                        ⚠ ONE MOUNT POINT FOR THE PLAYGROUND SCREEN. The screen owns `?wf=`; the
                        history below shows the room's runs (playground + recolour); an open
                        workflow narrows it to its own (`playgroundHistoryMatch`, C-05 — a stable
                        matcher per workflow, the room's on the grid). */}
                    {step === 'playground' && (
                      <>
                        <PlaygroundStudio band={band} techCardId={techCardId} disabled={readOnly} />
                        <GenerationHistory
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          /* The open workflow names its rows: «3D runs» under Image to 3D, whose
                             models are not pictures of the room (C-10); «playground runs» else. */
                          defaultRep={playgroundHistoryRep(params.get(PLAYGROUND_WF_PARAM), band)}
                          match={
                            playgroundHistoryMatch(params.get(PLAYGROUND_WF_PARAM), band) ??
                            inPlaygroundRoom
                          }
                          /* Which list this is: the page and the autofill budget belong to it,
                             not to the shared `defaultRep` (G-01, Codex 4). */
                          scopeKey={playgroundHistoryScope(params.get(PLAYGROUND_WF_PARAM), band)}
                          defaultOpen={false}
                        />
                      </>
                    )}
                    {/* ═══ THE FLAT SLOTS STAND ONLY ON FLAT — J-14, J-18, J-30, one organ, gated by
                        the composer because the composer knows the step; the bench itself reads one
                        band and knows no step. `RecallBenchIntake` (generation-history) writes slots
                        THROUGH THE API, so recall on the render step is untouched. `PickTray` is
                        mounted but has nothing left to arm it (J-15 removed every `pick.start`);
                        it is kept under the flat gate so the dead organ is at least not mounted on
                        four other steps. */}
                    {step === 'flat' && (
                      <>
                        <PickTray band={band} />
                        <Bench techCardId={techCardId} band={band} disabled={readOnly} />
                      </>
                    )}
                  </>
                ))}
              {/* THE STEP'S ONE FORWARD DOOR — always its last child, chosen above. */}
              {footer}
            </div>
          </PickModeProvider>
        </PictureGalleryProvider>
      </DesignCapabilityProvider>
    );
  }

  /* ═══ «DRAFTED» — ОДНО СОСТОЯНИЕ НА ВСЕ ШАГИ (волна 25.09, D-07', `drafted-contract.ts`) ═════
     Провайдер стоит ЗДЕСЬ, над рельсом и экраном, потому что пометки черновика читают органы
     разных шагов: поля — на MOODBOARD, предложенные слоты — на FLAT. Состояние своё он не держит:
     ответ считается из журнала черновика против живой формы (`head/drafted-provider.tsx`). */
  return (
    <DraftedProvider techCardId={techCardId}>
      <SectionStack>
        {rail}
        {screen}
      </SectionStack>
    </DraftedProvider>
  );
}

/**
 * ARTIFACTS is a second root over the SAME band read, not a second band. It is kept in this file so
 * that the two tabs cannot drift into calling different reads — the failure that would produce is
 * two tabs of one card showing different plates and different marks for the same picture.
 *
 * IT ALSO CARRIES THE DRAWING EDITOR, and the two props below are the whole of what that needs. The
 * editor is mounted over ARTIFACTS rather than in the studio because `mood-callouts.tsx` holds the
 * studio's single `useFieldArray` over `callouts` and the editor holds one of its own — and in
 * react-hook-form 7.62 two instances over one name do not synchronise. This tab holds none.
 *
 * ⚠ РИСОВАНИЕ БОЛЬШЕ НЕ ЖИВЁТ В МОДАЛКЕ. T-21 круга 4, владелец дословно: «для выставления
 * колаутов не нужна модалка оно должно быть инлайн и высота картинок должна быть больше».
 * Выноски ставятся прямо на плите панели, кадры выросли, а составная дверь «take in + draw ▸»
 * стала однотактной. Довод про два `useFieldArray` при этом НЕ УСТАРЕЛ и остаётся причиной, по
 * которой редактор живёт здесь, а не в студии: он про владение полем формы, а не про модалку.
 */
export function ArtifactsTab({
  techCardId,
  disabled,
  techCard,
  calloutHistory,
}: {
  techCardId?: number;
  disabled?: boolean;
  /** The loaded card: the editor resolves a `media_id` to a picture through it. */
  techCard?: common_TechCard;
  /**
   * The form's ONE undo history over `callouts`. It belongs to the page because the page is what
   * resets it when the form is re-seeded from the server; a history minted down here would outlive
   * that reset and hand back callouts the card no longer holds.
   */
  calloutHistory?: EditHistory<SheetCallout>;
}) {
  const { band, isLoading, serverSpeaks } = useDesignBand(techCardId);

  if (!techCardId) {
    return (
      <SectionStack>
        {/* НИ «ВЕРСИЙ», НИ «МИНТА»: подсистема версий листа снята целиком (V-22), и обещать их с
            пустого экрана значило бы звать человека к органу, которого нет. Ждёт эта заглушка
            ровно одного — сохранённой карточки: пластины живут в её медиа, а у несохранённой
            карточки медиа некуда положить. */}
        <Section
          title='artifacts'
          question='— the pictures of this card, and the sheet the factory prints'
        >
          <Text variant='inactive' size='control'>
            Save this tech card first — pictures are kept on a card that exists.
          </Text>
        </Section>
      </SectionStack>
    );
  }

  if (isLoading) {
    return (
      <SectionStack>
        <Section title='artifacts'>
          <Text variant='inactive' size='control'>
            loading…
          </Text>
        </Section>
      </SectionStack>
    );
  }

  // Same rule as the studio: the LIVE DOCUMENT — the card's plates and their callouts — is form
  // data and needs no design RPC at all. Only the generated pictures and the shelves of assets do.
  // So the panel is mounted either way and is told, once, whether the band answered; refusing to
  // mount it would take the callout editor away from every card on a contour without the band.
  return (
    <DesignCapabilityProvider value={serverSpeaks}>
      <ArtifactsPanel
        techCardId={techCardId}
        band={band}
        disabled={!!disabled}
        techCard={techCard}
        calloutHistory={calloutHistory}
      />
    </DesignCapabilityProvider>
  );
}
