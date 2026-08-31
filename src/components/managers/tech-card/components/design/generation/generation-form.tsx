import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { InertDoor, displayDetailName, readBench } from '../bench-slot';
import { markedPlatesOf } from '../fix-markup';
import { WhatModelGetsModal } from '../modals';
import { serverSpeaksDesign } from '../capability';
import { DETAIL_VIEW, SILHOUETTE_VIEWS, viewLabel } from '../views';
import { readBudget } from './money';
import { useStartRun } from './use-generation';

/**
 * THE GENERATION FORM — what to ask for, and in what shape it comes back.
 *
 * IT UNFOLDS ON DEMAND AND IS NOT A PERMANENT FIXTURE. A card that has never generated anything
 * shows two equal doors instead (bring files / GENERATE ▸), because nothing on this card requires
 * a run — the manual path is equal in rights, and a form standing open above an empty studio
 * argues the opposite before the human has said anything. Once the card HAS a flat run, the form is
 * open by default: the question «what next» is now the standing one.
 *
 * WHAT TRAVELS AND WHAT DOES NOT. `StartDesignRun` takes the QUESTION — views and layout — and
 * nothing else. The references, the description, the moodboard and the bench are snapshotted
 * BY THE SERVER, because provenance a caller supplies is a claim rather than provenance. So this
 * form has no inputs section: there is nothing here to send.
 *
 * THE ASK FIELD IS GONE (T-3, round 4): everything the human wants said lives in GARMENT
 * DESCRIPTION, which the server freezes into every run. The wire still carries `ask`, so this form
 * sends it EMPTY — and the removal does not blind the history, because the run stores the actual
 * prompt it sent (`design_run.prompt`, round 3) and the row shows it. Do not "compensate" for the
 * missing field here.
 *
 * THE FIX CYCLE IS GONE FROM THIS FORM, WHOLE (owner, S-15: «FIX функциональность выпиливаем
 * полностью»). `fix_targets` / `fix_slot_ids` stay LIVE on the wire — they now belong to the
 * vector path, which narrows a machine redraw to its plate (`modals/use-trace-vector.ts`) — but
 * every run STARTED HERE sends them empty. With the fix went the one road marked-up plates had
 * into a run's input: `useFixContext().target` was permanently null after the provider was
 * unmounted, so `prepareMarks` could never run again and every branch below that read `fixing`
 * was dead weight promising a door that no longer exists. Deliberately NOT resurrected — feeding
 * bench rasters into an ordinary flat run would silently change what a PAID request contains,
 * against the owner's removal order. What replaces it is WORDS: when any bench plate carries
 * edit ▸ marks, the line beside GENERATE says out loud that they do not travel, so nobody pays
 * for a run believing the model saw their markup. `fix-markup.tsx` keeps `markedPlatesOf` alive
 * for exactly that sentence.
 *
 * THERE IS NO PRICE ON THIS SCREEN BEFORE THE CLICK, and its absence is a decision. The prototype
 * showed `$0.04 · ~25 s`, both of them constants of the prototype. The contract has no quote verb
 * and no profile catalogue: the first honest number is `price_estimate` on the row the server
 * files. Inventing a per-picture price here would make the one screen in this admin that spends
 * money the one screen that guesses about it. Since round 4 (T-12) the DAY BAR is not printed
 * either: `today $x of $y` is gone, the ceiling still GATES the button when the day is spent, and
 * the only money a person is shown is the price of the generation itself, on its history row.
 *
 * FIT IS NOT SHOWN HERE AT ALL (owner, S-3). It is a fact about the GARMENT — its home is the
 * HEADER's classification, and the run snapshots it server-side at launch — so this form neither
 * edits nor mirrors it. The one place the full composition of a request is auditable before the
 * click, fit included, is «what the model gets ▸», which also carries the door to edit it.
 */

const LAYOUT_OPTIONS = [
  { value: 'one' as const, label: 'one picture', hint: 'all the ticked views drawn into one file' },
  {
    value: 'per_view' as const,
    label: 'a picture per view',
    hint: 'each ticked view comes back on its own',
  },
];

type Layout = 'one' | 'per_view';

/**
 * A card that has already generated a flat opens the form by default; one that has not shows the
 * doors instead. It is DERIVED and not seeded into state, so a first run arriving through a poll
 * unfolds the form — while an explicit fold by the human wins from then on and is never fought by
 * the data. That is the same disclosure discipline `Section` itself uses.
 */
export function hasFlatRun(band: GetDesignBandResponse): boolean {
  return (band.runs ?? []).some((run) => (run.kind ?? '').trim().toLowerCase() === 'flat');
}

export function hasAnyPictures(band: GetDesignBandResponse): boolean {
  return (band.runs ?? []).length > 0 || (band.batches ?? []).length > 0;
}

export function GenerationForm({
  band,
  techCardId,
  disabled,
  open,
  onOpenChange,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Controlled disclosure. Omit and the form manages its own, opening once the card has a run. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [wmgOpen, setWmgOpen] = useState(false);
  const speaks = serverSpeaksDesign();
  const { showMessage } = useSnackBarStore();
  const startRun = useStartRun(techCardId);

  const [manual, setManual] = useState<boolean | null>(null);
  const isOpen = open ?? manual ?? hasFlatRun(band);
  const setOpen = useCallback(
    (next: boolean) => {
      setManual(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const [views, setViews] = useState<Record<string, boolean>>({ front: true, back: true });
  // Галки ДЕТАЛЕЙ живут по id слота, отдельно от силуэтов (T-5): деталь можно спросить, только
  // если она ОПИСАНА в THE PICTURES, и на каждую описанную — своя галка.
  const [detailTicks, setDetailTicks] = useState<Record<number, boolean>>({});
  const [layout, setLayout] = useState<Layout>('per_view');

  const bench = useMemo(() => readBench(band), [band]);
  const budget = useMemo(() => readBudget(band.budget), [band.budget]);

  const tickedSides = SILHOUETTE_VIEWS.filter((v) => views[v]);
  // Производная от стенда, не от состояния: деталь, снятая со стенда после отметки, выпадает из
  // запроса сама, и чистить `detailTicks` не нужно.
  const tickedDetails = bench.details.filter((d) => (d.id ?? 0) > 0 && detailTicks[d.id ?? 0]);
  // ПРОВОД: по записи `detail` на каждую отмеченную деталь — и рядом ИМЕНА этих деталей,
  // слотами. Ключ вида `detail` не различает воротник и карман, поэтому одного `views` было мало:
  // прогон на две детали просил у модели «нарисуй две детали» и получал два произвольных крупных
  // плана. `detail_slot_ids` идёт ПОЗИЦИОННО и в том же порядке, что элементы `detail` в `views`
  // (сервер отвергает прогон, у которого длины разошлись), а разрезчик подписывает кадры
  // склеенного листа тем же порядком — пересортировать любой из двух списков значит разъехаться.
  const ticked: string[] = [...tickedSides, ...tickedDetails.map(() => DETAIL_VIEW)];
  const tickedDetailIds: number[] = tickedDetails.map((d) => d.id ?? 0);
  // Половина сравнения для дивайдера «current / earlier» в истории живёт ТОЛЬКО здесь: только эта
  // форма знает, какой вопрос задан прямо сейчас. Хук стоит ВЫШЕ раннего возврата `if (!isOpen)`
  // намеренно — под ним число хуков менялось бы между рендерами, и React снял бы всё дерево
  // (ошибка #310, которой этот экран уже стоил одного вечера). При размонтировании вопрос
  // отзывается сам, поэтому свёрнутая форма не оставляет устаревшего.

  /**
   * EVERY BENCH PLATE THAT CARRIES EDIT ▸ MARKS — not a fix selection (the fix cycle is gone,
   * S-15), but the audience of the one sentence this form still owes: those marks are stroke data
   * in an edit layer, a flat run's inputs are assembled server-side from the card's REFERENCES,
   * and nothing of the layer travels with GENERATE. The human who drew a correction and is about
   * to pay must read that fact BEFORE the click, not discover it on the output.
   */
  const wholeBench = useMemo(
    () => ({
      viewKeys: bench.sides.map((s) => s.view),
      slotIds: bench.details.map((d) => d.id ?? 0).filter((id) => id > 0),
    }),
    [bench],
  );
  const marked = useMemo(() => markedPlatesOf(band, wholeBench), [band, wholeBench]);

  const writesOff = !!disabled || !speaks;
  const noViews = ticked.length === 0;
  const capReached = !!budget?.exhausted;

  const gateReason = !speaks
    ? 'this server does not speak the design band yet — nothing can be generated here'
    : disabled
      ? 'this card is read-only'
      : noViews
        ? // The old tail of this refusal recommended arming a fix — a door removed with the whole
          // cycle (S-15). A refusal that advises a verb the product no longer has teaches the
          // reader to distrust every other sentence on the screen, so the tail went with the door.
          'no views ticked — tick at least one'
        : capReached
          ? // T-12: без чисел. Дневная полоса «today $x of $y» снята отовсюду; потолок по-прежнему
            // ГЕЙТИТ кнопку, но человеку показывается только цена самого прогона — в истории.
            'daily budget reached — new runs start tomorrow'
          : null;

  /**
   * The three variants of W-4, spoken. Null while nothing is ticked — there is no shape to name
   * yet, and the gate below already says why the button is off.
   */
  // Единственная отмеченная деталь называется по имени, а не безликим `detail`: пилюля читает два
  // органа выше, и «one view · detail · collar» — это то, что человек реально отметил.
  const tickedNames = [
    ...tickedSides.map((v) => viewLabel(v)),
    ...tickedDetails.map((d) => `detail · ${displayDetailName(bench.details, d)}`),
  ];
  const askShape =
    ticked.length === 0
      ? null
      : ticked.length === 1
        ? `one view · ${tickedNames[0]}`
        : layout === 'one'
          ? `${ticked.length} views · one picture`
          : `${ticked.length} views · a picture each`;

  const outputsLine =
    layout === 'one' && ticked.length >= 2
      ? `1 picture · ${ticked.length} views glued · split it before the slots read it`
      : `${ticked.length} picture${ticked.length === 1 ? '' : 's'}`;

  /**
   * ONE INTENT, ONE `client_request_id` — the ledger that makes that true lives in `useStartRun`,
   * shared with the render and 3D studios, because the money and the idempotency are one mechanism
   * whichever of the three screens pressed the button.
   */
  const submit = () => {
    if (gateReason || startRun.isPending) return;

    const params: common_DesignRunParams = {
      views: [...ticked],
      detailSlotIds: [...tickedDetailIds],
      layout,
      colour: undefined,
      threed: undefined,
      // THE FIX FIELDS — SCALAR AND ARRAYS ALIKE — STAY EMPTY ON EVERY RUN THIS FORM STARTS. The
      // fix cycle is removed whole (S-15); the arrays now carry the VECTOR path's narrowing and
      // the scalar is what rows frozen before the arrays say. Writing any of them here would put
      // a claim on the wire that this form no longer means.
      fixTarget: '',
      fixTargets: [],
      fixSlotIds: [],
      // ASK FOR THE PROPOSED CUT WHENEVER A COMPOSITE IS BEING ASKED FOR — derived, not a fourth
      // control. `auto_split` is only meaningful with `layout = one`, and it CUTS NOTHING: it
      // records that the server was asked to GUESS the frames, so the split modal opens on a
      // proposal instead of two blind rectangles the human drags into place from nothing. The
      // prototype's composite always arrives with its boxes; this is the field that makes that
      // true here, and refusing it by default would leave the guess permanently unasked-for while
      // the modal below is written to consume it.
      autoSplit: layout === 'one' && ticked.length >= 2,
      // Empty since S-15: the marked-plate rasters travelled only inside a fix, and feeding them
      // to an ordinary run would silently change what a paid request contains. See the header.
      extraInputMediaIds: [],
    };
    // T-3: поле ASK снято — всё, что человек хочет сказать, живёт в GARMENT DESCRIPTION. Провод
    // всё ещё принимает `ask` (сервер лишь триммит и меряет потолок), поэтому едет пустая строка —
    // выдуманного значения здесь быть не может, а настоящий промпт прогона хранит сервер.
    startRun.start({ kind: 'flat', ask: '', params });
  };

  // Дверь ведёт в INPUT — REFERENCES: полка загрузок снесена владельцем (R-18), файлы теперь
  // приносят слотом «+ reference» входа (и сплитом — склейки видов). Якорь #design-input держит
  // studio-tab.tsx; прежний #design-uploads больше не существует, и кнопка на него была бы живой
  // дверью в пустоту.
  const gotoUploads = () => {
    const el = document.getElementById('design-input');
    if (!el) {
      showMessage('the input block is not on this screen', 'error');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // CLOSED, AND THE CARD ALREADY HAS SOMETHING ON IT: two equal doors and no form. On a card with
  // nothing at all the doors belong to `EmptyStudio`, which says more with them.
  if (!isOpen) {
    if (!hasAnyPictures(band)) return null;
    return (
      <Section title='generation' question='— the form unfolds when you ask for it'>
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='secondary' size='sm' onClick={gotoUploads}>
            + add files
          </Button>
          <Button variant='main' size='sm' onClick={() => setOpen(true)} disabled={writesOff}>
            GENERATE ▸
          </Button>
          {/* Фраза «two equal doors…» здесь снята (T-6): её учит пустой стенд, где она — первый
              экран; на карточке с материалом эксперт видит две кнопки и без подписи. */}
        </div>
      </Section>
    );
  }

  return (
    <Section
      id='design-generation'
      title='generation — flat'
      question='— what to ask for, and in what shape it comes back'
      action={
        <button
          type='button'
          onClick={() => setOpen(false)}
          className='cursor-pointer uppercase text-labelColor hover:text-textColor'
        >
          <Text size='micro' variant='uppercase' tracking='label' component='span'>
            − fold away
          </Text>
        </button>
      }
    >
      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the form is here, but nothing can be
          started against it.
        </CalloutBox>
      )}

      {/* ПИКЕР ВИДОВ — ОДНА СТРОКА ЧИПОВ (T-4), а не пять строк с чекбоксами и прозой статусов.
          Отмеченный чип заливается чернилами — это и есть состояние; «slot filled / slot empty»
          переехали в title, потому что стенд с плитками стоит прямо под формой и показывает то же
          самое глазами. Сноска про «the sheet needs front and back…» снята владельцем (T-1) вместе
          со звёздочками: правило живёт в стенде (N of 4) и на минте, форма его не повторяет. */}
      <GroupLabel>views</GroupLabel>
      <ChipRow>
        {SILHOUETTE_VIEWS.map((view) => {
          const on = !!views[view];
          const slot = bench.sides.find((s) => s.view === view)?.slot ?? null;
          const filled = (slot?.pictureId ?? 0) > 0;
          return (
            <Chip
              key={view}
              selected={on}
              pressed={on}
              disabled={writesOff}
              title={
                filled ? 'its slot in the pictures is already filled' : 'its slot in the pictures is empty'
              }
              onClick={() => setViews((prev) => ({ ...prev, [view]: !prev[view] }))}
            >
              {viewLabel(view)}
            </Chip>
          );
        })}
        {/* ДЕТАЛИ — ПО ГАЛКЕ НА КАЖДУЮ ОПИСАННУЮ (T-5, решение владельца). Деталь можно спросить,
            только если она описана в THE PICTURES, поэтому чипы — производная от bench.details:
            описал деталь — появился чип, снял со стенда — исчез. Каждая отмеченная едет своей
            картинкой (запись `detail` в views на каждую), а её слот человек назначает на выходе. */}
        {bench.details.map((d) => {
          const id = d.id ?? 0;
          if (id <= 0) return null;
          const on = !!detailTicks[id];
          return (
            <Chip
              key={`d:${id}`}
              selected={on}
              pressed={on}
              disabled={writesOff}
              title='a described detail — ticked, it comes back as its own picture'
              onClick={() => setDetailTicks((prev) => ({ ...prev, [id]: !prev[id] }))}
            >
              detail · {displayDetailName(bench.details, d)}
            </Chip>
          );
        })}
        {/* Отсутствие деталей сказано словами, а не пустотой (T-5): иначе ряд молча выглядит как
            «деталей не бывает», и дверь к ним не видна. */}
        {bench.details.length === 0 && (
          <Text size='nano' variant='label' component='span'>
            details appear here once described in the pictures
          </Text>
        )}
      </ChipRow>

          {/* THE SHAPE OF THE ASK, NAMED — and named by DERIVING it, never by a third control.
              The owner's three variants (W-4) are ① one view on its own, ② several views as
              separate pictures, ③ several views glued into one and cut afterwards. They are the
              product of TWO independent organs — how many ticks, and which layout — and that is
              deliberate: a single three-way switch would have to invent a rule for «one view,
              glued», which is not a third thing but the same picture under another name. So the
              two organs stay free and this pill reads them back, which is also what makes «only one
              view is asked — both layouts return one picture» true rather than a caveat. */}
      <GroupLabel
        action={
          askShape ? (
            <Pill tone='mut' title='what the two controls above add up to'>
              {askShape}
            </Pill>
          ) : undefined
        }
      >
        how it comes back
      </GroupLabel>
      <ViewSwitch
        label='layout'
        value={layout}
        options={LAYOUT_OPTIONS}
        disabled={writesOff}
        onChange={setLayout}
      />
      {/* S-1 (owner): the glued-file paragraph is gone. The composite rule it recited is not
          lost — it is CONSTRUCTION (a declared composite offers the cut and refuses the picker,
          `generation-history.tsx`) and it is still worded once, in `outputsLine` beside the
          button that spends the money. T-2 (round 4): the per-view teaching line («each ticked
          view comes back as its own picture…») is gone too — the behaviour stays, the prose went.
          What remains below is STATE speech, drawn only while the switch genuinely changes
          nothing. */}
      {ticked.length <= 1 && (
        <Text size='nano' variant='label' component='p'>
          only one view is asked — both layouts return one picture, so this switch changes nothing here.
        </Text>
      )}

      {/* T-3 (круг 4): строки ASK больше нет — всё, что человек хочет сказать модели, описывается
          в GARMENT DESCRIPTION. Провод шлёт `ask` пустым (см. submit), историю это не слепит:
          настоящий отправленный промпт хранится на прогоне (`design_run.prompt`). S-2/S-3 прошлых
          кругов: подпись о нумерации живёт в строке истории, FIT — в классификации хедера. */}

      <div className='flex flex-wrap items-center gap-2 py-1'>
        {gateReason ? (
          <InertDoor label='GENERATE' reason={gateReason} />
        ) : (
          <Button variant='main' size='sm' onClick={submit} disabled={startRun.isPending}>
            {startRun.isPending ? 'starting…' : 'GENERATE'}
          </Button>
        )}
        <Text size='micro' variant='label' component='span'>
          {outputsLine}
        </Text>
        {/* «ЧТО ПОЛУЧИТ МОДЕЛЬ» — `wmgModal` прототипа. Единственное место, где человек видит
            ПОЛНЫЙ состав запроса до того, как заплатит за прогон: доска, роли референсов, тексты
            указаний, замысел и посадка. Без него форма просит согласиться на то, чего не показывает. */}
        <Button variant='secondary' size='xs' onClick={() => setWmgOpen(true)}>
          what the model gets ▸
        </Button>
        {/* T-12: дневная полоса «today $x of $y» снята — показывается только цена генерации, и
            живёт она на строке прогона в истории; три слова справа говорят, где её искать. */}
        <Text size='micro' variant='label' component='span' className='ml-auto'>
          priced on its history row
        </Text>
      </div>

      {/* THE MARKS DO NOT TRAVEL, SAID WHERE THE MONEY IS SPENT. Since the fix cycle was removed
          (S-15) there is NO road from an edit layer into a run's input — see the header — and the
          only honest thing left is to say so before the click: a person who drew a correction with
          edit ▸ and presses GENERATE would otherwise pay believing the model saw their markup.
          Drawn only while marks exist; a permanent disclaimer would be noise on every clean card. */}
      {marked.length > 0 && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>
              the edit ▸ marks on {marked.map((p) => p.label).join(', ')} stay on this screen.
            </b>{' '}
            a flat run reads the card’s references, never the bench plates, so nothing drawn there
            travels with GENERATE — the marks remain on their plates for people.
          </Text>
        </CalloutBox>
      )}

      {startRun.isError && (
        <CalloutBox tone='error'>
          <b>the run did not start.</b> Nothing was filed and nothing was charged. Pressing GENERATE
          again carries the same request id, so a run that DID start on the server comes back
          instead of a second paid one.
        </CalloutBox>
      )}

      {/* S-7 (owner): the «without the model» row and both of its doors are gone. Uploading lives
          where the file lands — a FLAT SLOTS plate takes it three equal ways (browse the library,
          ⌘V or drop, mark a band picture — `bench.tsx`). Drawing from scratch was retired with it:
          drawing is an EDIT of an existing flat, and that door is `edit ▸` on the slot plate
          (`bench-slot.tsx`), never a blank canvas here. */}

      <WhatModelGetsModal open={wmgOpen} onOpenChange={setWmgOpen} band={band} />
    </Section>
  );
}
