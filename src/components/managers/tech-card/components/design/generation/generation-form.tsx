import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import type { TechCardFormData } from '../../schema';
import { InertDoor, readBench } from '../bench-slot';
import { markedPlatesOf, useMarkedPlateUploads } from '../fix-markup';
import { VectorModal, WhatModelGetsModal } from '../modals';
import { serverSpeaksDesign } from '../capability';
import { DESIGN_VIEW_KEYS, SHEET_MIN_VIEWS, viewLabel } from '../views';
import { useAnnounceDesignQuestion } from '../history-question';
import { useFixContext } from './fix-context';
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
 * WHAT TRAVELS AND WHAT DOES NOT. `StartDesignRun` takes the QUESTION — views, layout, the ask, a
 * fix target — and nothing else. The references, the description, the moodboard and the bench are
 * snapshotted BY THE SERVER, because provenance a caller supplies is a claim rather than
 * provenance. So this form has no inputs section: there is nothing here to send.
 *
 * THERE IS NO PRICE ON THIS SCREEN BEFORE THE CLICK, and its absence is a decision. The prototype
 * showed `$0.04 · ~25 s`, both of them constants of the prototype. The contract has no quote verb
 * and no profile catalogue: the first honest number is `price_estimate` on the row the server
 * files, and the day's ceiling is `budget`. Inventing a per-picture price here would make the one
 * screen in this admin that spends money the one screen that guesses about it.
 *
 * FIT IS NOT EDITED HERE. It is a fact about the GARMENT — the run copies it at launch and stamps
 * every output with it — so it is shown read-only with its home named. A fit editable in two places
 * is a fit that disagrees with itself.
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
  const [drawOpen, setDrawOpen] = useState(false);
  const speaks = serverSpeaksDesign();
  const { showMessage } = useSnackBarStore();
  const startRun = useStartRun(techCardId);
  const fix = useFixContext().target;

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

  /**
   * FIT, READ FROM THE CARD'S OWN FORM. `useFormContext` answers null outside a provider (a print
   * page, a harness), and the line degrades to «not stated» rather than throwing — there is no error
   * boundary over this tab, so one exception here takes the whole screen white.
   */
  const form = useFormContext<TechCardFormData>();
  const fit = (form?.watch('fit') ?? '').trim();

  const bench = useMemo(() => readBench(band), [band]);
  const budget = useMemo(() => readBudget(band.budget), [band.budget]);

  const ticked = DESIGN_VIEW_KEYS.filter((v) => views[v]);
  // Половина сравнения для дивайдера «current / earlier» в истории живёт ТОЛЬКО здесь: только эта
  // форма знает, какой вопрос задан прямо сейчас. Хук стоит ВЫШЕ раннего возврата `if (!isOpen)`
  // намеренно — под ним число хуков менялось бы между рендерами, и React снял бы всё дерево
  // (ошибка #310, которой этот экран уже стоил одного вечера). При размонтировании вопрос
  // отзывается сам, поэтому свёрнутая форма не оставляет устаревшего.
  useAnnounceDesignQuestion(techCardId, ticked, layout);
  const fixing = !!fix;

  /**
   * THE MARKED PLATES OF THE ARMED FIX (W-10). Their «plate + marks» rasters are prepared at
   * launch and travel in `extra_input_media_ids` — `fix-markup.tsx` holds the mechanism, this form
   * only owes the human the count before the click and the busy state during it. All of it sits
   * ABOVE the `if (!isOpen)` return: a hook below it changes the hook count between renders and
   * React #310 takes the whole tree down.
   */
  const prepareMarks = useMarkedPlateUploads(techCardId);
  const marked = useMemo(() => (fix ? markedPlatesOf(band, fix) : []), [band, fix]);
  const [prepping, setPrepping] = useState(false);
  const [marksRefusal, setMarksRefusal] = useState<string | null>(null);
  // A state flag alone lets a double click in one tick through — the re-render that disables the
  // button has not happened yet. The ref answers synchronously.
  const preppingRef = useRef(false);

  const writesOff = !!disabled || !speaks;
  const noViews = !fixing && ticked.length === 0;
  const capReached = !!budget?.exhausted;

  const gateReason = !speaks
    ? 'this server does not speak the design band yet — nothing can be generated here'
    : disabled
      ? 'this card is read-only'
      : noViews
        ? 'no views ticked — tick at least one, or start a fix from a slot'
        : capReached
          ? `daily budget reached — ${budget?.line ?? ''}`
          : null;

  /**
   * The three variants of W-4, spoken. Null while nothing is ticked — there is no shape to name
   * yet, and the gate below already says why the button is off.
   */
  const askShape = fixing
    ? null
    : ticked.length === 0
      ? null
      : ticked.length === 1
        ? `one view · ${viewLabel(ticked[0])}`
        : layout === 'one'
          ? `${ticked.length} views · one picture`
          : `${ticked.length} views · a picture each`;

  const outputsLine = fixing
    ? `${fix.labels.length} picture${fix.labels.length === 1 ? '' : 's'} — ${fix.labels.join(', ')}`
    : layout === 'one' && ticked.length >= 2
      ? `1 picture · ${ticked.length} views inside · it comes back needing a cut, and no slot reads a composite until it is split`
      : `${ticked.length} picture${ticked.length === 1 ? '' : 's'}`;

  /**
   * ONE INTENT, ONE `client_request_id` — the ledger that makes that true lives in `useStartRun`,
   * shared with the render and 3D studios, because the money and the idempotency are one mechanism
   * whichever of the three screens pressed the button.
   */
  const submit = async () => {
    if (gateReason || preppingRef.current || startRun.isPending) return;

    /**
     * THE MARKS GO FIRST, OR THE RUN DOES NOT GO AT ALL. For a fix over marked plates the screen
     * has promised «already marked up»; a launch that silently proceeded with clean plates after a
     * failed rasterisation would spend the money on the exact lie W-10 exists to remove. So a
     * refusal here stops the launch with words, and nothing is filed or charged.
     *
     * TAKEN FRESH AT LAUNCH — the current layer revision, not a preview's snapshot. An unchanged
     * layer re-uses its uploaded raster (same media ids, same params fingerprint, same
     * `client_request_id` on retry); a layer that moved is a changed ask and honestly mints a new
     * intent.
     */
    let extraInputMediaIds: number[] = [];
    if (fixing && fix) {
      preppingRef.current = true;
      setPrepping(true);
      setMarksRefusal(null);
      try {
        extraInputMediaIds = await prepareMarks(band, fix);
      } catch (error) {
        setMarksRefusal(
          error instanceof Error && error.message
            ? error.message
            : 'the marked plates could not be prepared',
        );
        return;
      } finally {
        preppingRef.current = false;
        setPrepping(false);
      }
    }

    const params: common_DesignRunParams = {
      // A fix asks for the SIDES ALREADY ON THE BENCH; the matrix took no part in it, and the
      // snapshot must say so rather than freezing ticks the run did not use.
      views: fixing ? [...fix.viewKeys] : [...ticked],
      layout: fixing ? 'per_view' : layout,
      colour: undefined,
      threed: undefined,
      // THE SCALAR IS DELIBERATELY LEFT EMPTY BY EVERY NEW RUN. `fix_target` is what rows frozen
      // before the array say; the contract's rule is that a reader takes `fix_targets` when it is
      // non-empty and falls back to the scalar otherwise. Writing both would put the same claim in
      // two places, and the day they disagree there is no way to tell which one the human meant.
      fixTarget: '',
      fixTargets: fixing ? [...fix.viewKeys] : [],
      // Details travel by ADDRESS, because a bare view key cannot tell two details apart and this
      // list is frozen into the run's history. Sides and details are ONE selection, not two modes.
      fixSlotIds: fixing ? [...fix.slotIds] : [],
      // ASK FOR THE PROPOSED CUT WHENEVER A COMPOSITE IS BEING ASKED FOR — derived, not a fourth
      // control. `auto_split` is only meaningful with `layout = one`, and it CUTS NOTHING: it
      // records that the server was asked to GUESS the frames, so the split modal opens on a
      // proposal instead of two blind rectangles the human drags into place from nothing. The
      // prototype's composite always arrives with its boxes; this is the field that makes that
      // true here, and refusing it by default would leave the guess permanently unasked-for while
      // the modal below is written to consume it.
      autoSplit: !fixing && layout === 'one' && ticked.length >= 2,
      // THE MARKED PLATES OF A FIX, «plate + marks» rasterised at this very launch — empty for an
      // ordinary run and for a fix whose slots carry no layer. See `fix-markup.tsx`.
      extraInputMediaIds,
    };
    startRun.start({ kind: 'flat', ask: ask.trim(), params }, () => setAsk(''));
  };

  const gotoUploads = () => {
    const el = document.getElementById('design-uploads');
    if (!el) {
      showMessage('the uploads shelf is not on this screen', 'error');
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
      {/* Чип заявки рисует STUDIO, над этой формой. Здесь он был вторым и дублировал ту же
          заявку. Чтение контекста (`useFixContext` выше) остаётся — оно и отправляет параметры. */}

      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the form is here, but nothing can be
          started against it.
        </CalloutBox>
      )}

      {/* П4: WHILE A FIX IS ARMED THE MATRIX AND THE LAYOUT ARE NOT DRAWN. They would describe a
          request that is not being sent — a fix asks for one picture of one side — and three organs
          would lie at once: the ticks, the count and the snapshot the panel later shows. */}
      {!fixing && (
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
          <Text size='nano' variant='label' component='p'>
            {ticked.length <= 1
              ? 'only one view is asked — both layouts return one picture, so this switch changes nothing here.'
              : layout === 'one'
                ? 'one file with all the ticked views drawn to one another. It arrives carrying a «probably …» mark per glued view and NEEDING A CUT: it has no single view, so no slot takes it and no picker is offered on it until «split into views ▸» has run.'
                : 'each ticked view comes back as its own picture with a guessed view; you mark the ones that go into a slot.'}
          </Text>
        </>
      )}

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
        <Text size='nano' variant='label' component='span' className='min-w-0'>
          empty → the row is captioned by its number
        </Text>
      </div>

      <div className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'>
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-20 shrink-0 uppercase tracking-label'
        >
          fit
        </Text>
        <Text size='micro' component='span'>
          {fit || 'not stated'}
        </Text>
        <Pill tone='mut'>from classification</Pill>
        <Text size='nano' variant='label' component='span' className='min-w-0'>
          fit changes the GARMENT, so it is edited on the card and copied by the run at launch
        </Text>
      </div>

      <div className='flex flex-wrap items-center gap-2 py-1'>
        {gateReason ? (
          <InertDoor label='GENERATE' reason={gateReason} />
        ) : (
          <Button
            variant='main'
            size='sm'
            onClick={submit}
            disabled={startRun.isPending || prepping}
          >
            {prepping ? 'pressing the marks in…' : startRun.isPending ? 'starting…' : 'GENERATE'}
          </Button>
        )}
        <Text size='micro' variant='label' component='span'>
          {outputsLine}
          {/* THE COUNT STANDS BESIDE THE BUTTON THAT SPENDS THE MONEY. The chip above names the
              marked slots and opens the preview; this is the last word before the click. */}
          {fixing && marked.length > 0
            ? ` · ${marked.length} marked plate${marked.length === 1 ? '' : 's'} ride${
                marked.length === 1 ? 's' : ''
              } along with the marks pressed in`
            : ''}
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

      {marksRefusal && (
        <CalloutBox tone='error'>
          <b>the run was not started.</b> {marksRefusal} Nothing was filed and nothing was charged —
          press GENERATE to try again, or flatten the marks from edit ▸ and fix without them.
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

      <div className='flex flex-wrap items-center gap-2 pt-1'>
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-20 shrink-0 uppercase tracking-label'
        >
          without the model
        </Text>
        <Button variant='secondary' size='xs' onClick={gotoUploads}>
          upload a flat ▸
        </Button>
        {/* ДВЕРЬ ОЖИЛА. Причина «на этом контуре нет поверхности для рисования» была верной ровно
            до того, как приехал векторный редактор (`vectorModal` прототипа). Здесь он открывается
            БЕЗ ОСНОВЫ — рисование с нуля, а не обводка: у слоя просто нет картинки снизу. */}
        <Button variant='secondary' size='xs' onClick={() => setDrawOpen(true)}>
          draw it ▸
        </Button>
        <Text size='nano' variant='label' component='span' className='min-w-0'>
          an uploaded flat lands on the uploads shelf, carries «uploaded» instead of «AI · run N»,
          and goes into a slot exactly the same way.
        </Text>
      </div>

      <WhatModelGetsModal open={wmgOpen} onOpenChange={setWmgOpen} band={band} />
      <VectorModal
        open={drawOpen}
        onOpenChange={setDrawOpen}
        techCardId={techCardId}
        band={band}
        base={null}
        disabled={disabled}
      />
    </Section>
  );
}
