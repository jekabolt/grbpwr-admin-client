import type { common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useEffect, useRef, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { FIELD_REVEAL_EVENT, type FieldRevealDetail } from 'utils/field-errors';
import type { EditHistory } from 'ui/components/annotation/history';
import Text from 'ui/components/text';
import { Section, SectionStack } from 'ui/components/section';
import { ConstructionGeneralInfo } from '../construction-general-info';
import type { TechCardFormData } from '../schema';
import { ArtifactsPanel, type SheetCallout } from './artifacts-panel';
import { Bench } from './bench';
import { useColorwayChoice } from './colorway-picker';
import { ColourwayProposals } from './colourway-proposals';
import { GenerationStudio } from './generation';
import type { DesignKind } from './bench-kinds';
import { ChainRail, useChainCtx } from './chain-rail';
import {
  defaultStep,
  isStepId,
  kindOfStep,
  stepOfField,
  stepOfKind,
  type StepId,
} from './core/chain';
import { RenderStudio, ThreedStudio } from './render';
import { GenerationHistory } from './generation';
import { DesignCapabilityProvider } from './capability';
import { MaterialSlots } from './material-slots';
import { MoodBoard } from './mood-board';
import { OnModelStudio } from './onmodel';
import { PatternStudio } from './pattern';
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
 *   · steps 2–5 and the aside → the generative screens (flat · pattern · fabric render · 3D · on
 *                            model), each with its own input, GENERATE and history.
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
}: {
  techCardId?: number;
  disabled?: boolean;
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
  const { canWrite } = usePermissions();
  const canWriteCard = canWrite(SECTION.techCards);

  /* ═══ ЧЕЙ ЭТО РЕНДЕР — ОДНО ЧИСЛО НА ВСЮ СТУДИЮ (круг 19, C1) ═════════════════════════════════
     Ось — продуктовый колорвей карточки, тот самый, которым ключуются верстак рендеров, ворота 3D и
     история. Владелец хука — композитор, не экран: верстак рендеров ПИШЕТ FABRIC RENDER, ЧИТАЕТ 3D,
     а СЕРВЕР по нему собирает (`designSelectBench`); заведи второго владельца — и полоса входа 3D
     показывала бы ROSSO, пока прогон уезжает за OLIVE. Число раздаётся вниз ПРОПОМ. */
  const colorway = useColorwayChoice(techCardId, band);

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
     has not landed yet) — then fixes the answer for the life of this card on this mount. It is
     RESET IN THE BODY OF THE RENDER when the card changes (invariant 12: the composer is not
     remounted between cards), never in an effect. A card that does not exist yet has one step —
     and KEEPS it when its id arrives: the person who just pressed Save on a new card is on the
     header, and the header must not blink out while the (empty) band is read for the first time.

     UNDECIDED IS NOT «CARD DETAILS FOR NOW». While the address says nothing and the latch has not
     fired, no step is drawn — the screen says «loading…» under the rail — rather than the header
     being shown and then swapped for the decided step a moment later. A step that is on screen
     must be a step the person can stay on; the cells are live throughout, so CARD DETAILS is one
     click away at any moment (and that click writes the address, which then wins). */
  const [params, setParams] = useSearchParams();
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
  const decided: StepId | null = isStepId(urlStep) ? urlStep : opened.current.step;
  const ctx = { ...chain, now: decided };
  const goStep = (next: StepId) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('step', next);
        return p;
      },
      // `replace`, as the prototype's `replaceState`: Back leaves the card, it does not walk the
      // rail backwards one cell at a time.
      { replace: true },
    );

  /* ═══ THE GENERATIVE KIND IS DERIVED FROM THE STEP, NEVER HELD BESIDE IT ═════════════════════════
     `kind` was the studio's state (`state.kind` of the old prototype); now the step is, and the
     kind is what the step says it opens (`kindOfStep`). CARD DETAILS and MOODBOARD open no
     generative screen — `kind` is undefined there, and that is a value, not a gap. Two states here
     would be two places that can disagree about which screen is on. */
  const kind: DesignKind | undefined = decided ? kindOfStep(decided) : undefined;
  const goKind = (next: DesignKind) => goStep(stepOfKind(next).id);
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
     custom events from JSX; on `document` because a missing anchor has nothing to bubble from. */
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
    };
    document.addEventListener(FIELD_REVEAL_EVENT, onAsk);
    return () => document.removeEventListener(FIELD_REVEAL_EVENT, onAsk);
  }, []);

  /* ═══ THE RAIL — FIRST CHILD OF THE STACK IN EVERY STATE ═══════════════════════════════════════
     Drawn before the band is read and before the card exists: while the band loads every
     band-derived state is «unknown» (`bandless`), never «locked», and the cells still navigate.

     ⚠ СЕЛЕКТА КОЛОРВЕЯ ЗДЕСЬ БОЛЬШЕ НЕТ (G2-2). Он стоял в слоте `action` — «чей это рендер», —
     и уехал ТУДА, ГДЕ ЭТОТ ВЫБОР ТРАТИТ ДЕНЬГИ: `for:` в ряду GENERATE фабрик-рендера, `build:`
     над сборкой 3D, чипы PAINT на on-model. Довод целиком — в шапке `ChainRail` и у самого
     `ColorwaySelect`; коротко: `colorway_id` прогона неизменяем, и цель обязана называться у
     кнопки, которая её замораживает, а не в ряду «где я нахожусь». Состояние по-прежнему ОДНО
     (`useColorwayChoice` выше) и раздаётся вниз пропами. */
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
                  <MoodBoard techCardId={techCardId} disabled={readOnly} />
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
                  <ConstructionGeneralInfo isAux={isAux} readOnly={readOnly || !canWriteCard} />
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
                    {/* ═══ STEP 2 · FLAT — input (references, words, GENERATE), the history, the
                        flat slots. The input section is THIS step's (prototype: «референсы
                        рисуются только у FLAT; в render и 3D они в одном клике, не на экране»).
                        `#design-input` is the anchor the doors «+ add files» of the empty studio
                        and of the folded generation form lead to. */}
                    {step === 'flat' && (
                      <>
                        <div id='design-input'>
                          <ReferencesSection
                            techCardId={techCardId}
                            band={band}
                            disabled={readOnly}
                          />
                        </div>
                        <GenerationStudio band={band} techCardId={techCardId} disabled={readOnly} />
                      </>
                    )}
                    {/* ═══ STEP 3 · PATTERN — the screen plus the SHARED run history, as on every
                        generative step, and not for symmetry: `GenerationHistory` mounts
                        `useRunPolling`, the one place a live run is re-read from; without it
                        «making a tile…» would stand forever. No colourway picker here (E-1: «в MAKE
                        A PATTERN оставь только имя убери колорвей»); the history opens on its own
                        kind (J-12) and closed (E-21). */}
                    {step === 'pattern' && (
                      <>
                        <PatternStudio band={band} techCardId={techCardId} disabled={readOnly} />
                        <GenerationHistory
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          defaultRep='pattern'
                          defaultOpen={false}
                        />
                      </>
                    )}
                    {/* ═══ STEP 4 · FABRIC RENDER.

                        ⚠ `key={colorway.colorwayId}` СНЯТ (G2-3), И ЭТО ОБЯЗАТЕЛЬНО, А НЕ УБОРКА.
                        Ремоунт стоял ради одного: `useColourDraft` засевает рецепт ОДИН РАЗ ЗА
                        МОНТИРОВАНИЕ, и «однажды» ≠ «заново на смене цвета». Теперь селект цели
                        живёт ВНУТРИ этого экрана — компонент не может ремоунтить сам себя, не
                        уничтожив состояние собственного органа выбора (список закрылся бы прямо
                        под пальцем). Второе правило переехало туда, где ему место: `useColourDraft`
                        на смене цели переселяет ТОЛЬКО цветную половину (hex/code), а ткань и слова
                        остаются — ткань есть свойство изделия, цвет есть свойство колорвея.
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
                             колорвеев карточки и ТОТ ЖЕ САМЫЙ сеттер, которым пользуются чипы
                             on-model. Второго состояния не заводится ни на одном экране. */
                          colorways={colorway.colorways}
                          onColorwayChange={colorway.setColorwayId}
                        />
                        {/* J-18: the history filters to fabric renders by default; E-22: closed. */}
                        <GenerationHistory
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          defaultRep='render'
                          defaultOpen={false}
                        />
                      </>
                    )}
                    {/* ═══ STEP 5 · 3D — the same colourway number as the render, and NO remount:
                        the 3D draft (presentation, model, body, size) is not a colour and must
                        survive a change of colourway; everything colour-dependent (`threedSides`,
                        the gate, the run body) is a selector over the band and follows the prop. */}
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
                          /* `build:` над сборкой — тот же единственный сеттер. Список экран сузит
                             сам: собирать можно только из колорвеев, у которых стоит FRONT. */
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
                    {/* ═══ ASIDE · ON MODEL — a recolour of a photograph of a real person (K-17).
                        No remount on a change of colourway, measured: `useTargetColourDraft` seeds
                        from the card's last recipe (not narrowed by colourway), the input row shows
                        library media, the outputs are card-wide — a remount would guard nothing and
                        cost four gathered photographs. The name and the archive ride here for the
                        reason the number does: the screen FREEZES `colorwayId` in the run. */}
                    {step === 'aside' && (
                      <>
                        <OnModelStudio
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          colorwayId={colorway.colorwayId}
                          colorwayLabel={colorway.label}
                          colorwayArchived={colorway.archived}
                          /* THE COLOURWAY CHIPS OF THE PAINT GROUP (r1, mock-up `_step-aside.js`
                             `om:way`): the card's colourways and THE SAME SETTER the select on the
                             rail calls. The one writer of the choice stays this file's
                             `useColorwayChoice`; the chips are a second door to it, not a second
                             state, and nothing is written into the form. */
                          colorways={colorway.colorways}
                          onColorwayChange={colorway.setColorwayId}
                        />
                        {/* J-31 / E-23: sorted to on-model, closed by default. */}
                        <GenerationHistory
                          band={band}
                          techCardId={techCardId}
                          disabled={readOnly}
                          defaultRep='onmodel'
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
            </div>
          </PickModeProvider>
        </PictureGalleryProvider>
      </DesignCapabilityProvider>
    );
  }

  return (
    <SectionStack>
      {rail}
      {screen}
    </SectionStack>
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
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);

  if (!techCardId) {
    return (
      <SectionStack>
        {/* НИ «ВЕРСИЙ», НИ «МИНТА»: подсистема версий листа снята целиком (V-22), и обещать их с
            пустого экрана значило бы звать человека к органу, которого нет. Ждёт эта заглушка
            ровно одного — сохранённой карточки: пластины живут в её медиа, а у несохранённой
            карточки медиа некуда положить. */}
        <Section title='artifacts' question='— the pictures of this card, and the sheet the factory prints'>
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
