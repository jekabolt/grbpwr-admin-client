import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { InertDoor, readBench } from '../bench-slot';
import { markedPlatesOf } from '../fix-markup';
import { WhatModelGetsModal } from '../modals';
import { serverSpeaksDesign } from '../capability';
import { DESIGN_VIEW_KEYS, SHEET_MIN_VIEWS, viewLabel } from '../views';
import { useAnnounceDesignQuestion } from '../history-question';
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
 * WHAT TRAVELS AND WHAT DOES NOT. `StartDesignRun` takes the QUESTION — views, layout, the ask —
 * and nothing else. The references, the description, the moodboard and the bench are snapshotted
 * BY THE SERVER, because provenance a caller supplies is a claim rather than provenance. So this
 * form has no inputs section: there is nothing here to send.
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
 * files, and the day's ceiling is `budget`. Inventing a per-picture price here would make the one
 * screen in this admin that spends money the one screen that guesses about it.
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
  const [layout, setLayout] = useState<Layout>('per_view');
  const [ask, setAsk] = useState('');

  const bench = useMemo(() => readBench(band), [band]);
  const budget = useMemo(() => readBudget(band.budget), [band.budget]);

  const ticked = DESIGN_VIEW_KEYS.filter((v) => views[v]);
  // Половина сравнения для дивайдера «current / earlier» в истории живёт ТОЛЬКО здесь: только эта
  // форма знает, какой вопрос задан прямо сейчас. Хук стоит ВЫШЕ раннего возврата `if (!isOpen)`
  // намеренно — под ним число хуков менялось бы между рендерами, и React снял бы всё дерево
  // (ошибка #310, которой этот экран уже стоил одного вечера). При размонтировании вопрос
  // отзывается сам, поэтому свёрнутая форма не оставляет устаревшего.
  useAnnounceDesignQuestion(techCardId, ticked, layout);

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
          ? `daily budget reached — ${budget?.line ?? ''}`
          : null;

  /**
   * The three variants of W-4, spoken. Null while nothing is ticked — there is no shape to name
   * yet, and the gate below already says why the button is off.
   */
  const askShape =
    ticked.length === 0
      ? null
      : ticked.length === 1
        ? `one view · ${viewLabel(ticked[0])}`
        : layout === 'one'
          ? `${ticked.length} views · one picture`
          : `${ticked.length} views · a picture each`;

  const outputsLine =
    layout === 'one' && ticked.length >= 2
      ? `1 picture · ${ticked.length} views inside · it comes back needing a cut, and no slot reads a composite until it is split`
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
    startRun.start({ kind: 'flat', ask: ask.trim(), params }, () => setAsk(''));
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
          <Text size='micro' variant='label' component='span'>
            two equal doors — nothing on this card requires a run
          </Text>
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

      <>
          <GroupLabel
            action={
              <Text size='micro' variant='label' component='span'>
                {ticked.length} view{ticked.length === 1 ? '' : 's'} in this run
              </Text>
            }
          >
            views
          </GroupLabel>
          <div>
            {DESIGN_VIEW_KEYS.map((view) => {
              const required = SHEET_MIN_VIEWS.includes(view);
              const on = !!views[view];
              const slot = bench.sides.find((s) => s.view === view)?.slot ?? null;
              const filled = (slot?.pictureId ?? 0) > 0;
              const status =
                view === 'detail'
                  ? 'a detail comes back under its own name'
                  : filled
                    ? 'slot filled'
                    : required && !on
                      ? 'not asked · the sheet needs it'
                      : 'slot empty';
              const statusIsWarning = required && !on && !filled;
              const boxId = `design-view-${view}`;
              return (
                <div
                  key={view}
                  className='flex items-center gap-2 border-b border-hairline py-1 last:border-b-0'
                >
                  <CheckboxCommon
                    name={boxId}
                    checked={on}
                    disabled={writesOff}
                    onChange={(checked: boolean) =>
                      setViews((prev) => ({ ...prev, [view]: checked }))
                    }
                  />
                  {/* `<button>` is a labelable element, so the name forwards the click to the box
                      and the target stays as big as the words. */}
                  <label htmlFor={boxId} className='cursor-pointer'>
                    <Text
                      size='micro'
                      component='span'
                      className={
                        on ? 'uppercase tracking-label' : 'uppercase tracking-label opacity-60'
                      }
                    >
                      {viewLabel(view)}
                    </Text>
                  </label>
                  {required && <span className='text-error'>*</span>}
                  <Text
                    size='micro'
                    variant={statusIsWarning ? 'default' : 'label'}
                    component='span'
                    className={statusIsWarning ? 'ml-auto text-error' : 'ml-auto'}
                  >
                    {status}
                  </Text>
                </div>
              );
            })}
          </div>
          <Text size='nano' variant='label' component='p'>
            * the sheet needs {SHEET_MIN_VIEWS.map((v) => viewLabel(v)).join(' and ')} — a client
            rule the server does not enforce, checked at the mint and not on these ticks.
          </Text>

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
              button that spends the money. */}
          {(ticked.length <= 1 || layout === 'per_view') && (
            <Text size='nano' variant='label' component='p'>
              {ticked.length <= 1
                ? 'only one view is asked — both layouts return one picture, so this switch changes nothing here.'
                : 'each ticked view comes back as its own picture with a guessed view; you mark the ones that go into a slot.'}
            </Text>
          )}
      </>

      <div className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'>
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-20 shrink-0 uppercase tracking-label'
        >
          ask
        </Text>
        <Input
          name='design-ask'
          value={ask}
          disabled={writesOff}
          placeholder="what to change — becomes the run's caption"
          className='max-w-[420px]'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAsk(e.target.value)}
        />
      </div>
      {/* S-2 (owner): the «empty → captioned by its number» aside is gone; the numbering fallback
          itself lives in the history row, which is where it speaks. S-3 (owner): the read-only FIT
          row is gone with it — see the header comment for where fit lives and shows. */}

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
        {budget && (
          <Text size='micro' variant='label' component='span' className='ml-auto'>
            {budget.line}
          </Text>
        )}
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

      <Text size='nano' variant='label' component='p'>
        the price of a run is stated on its history row once the server has filed it — nothing here
        quotes one in advance.
      </Text>

      {/* S-7 (owner): the «without the model» row and both of its doors are gone. Uploading lives
          where the file lands — a FLAT SLOTS plate takes it three equal ways (browse the library,
          ⌘V or drop, mark a band picture — `bench.tsx`). Drawing from scratch was retired with it:
          drawing is an EDIT of an existing flat, and that door is `edit ▸` on the slot plate
          (`bench-slot.tsx`), never a blank canvas here. */}

      <WhatModelGetsModal open={wmgOpen} onOpenChange={setWmgOpen} band={band} />
    </Section>
  );
}
