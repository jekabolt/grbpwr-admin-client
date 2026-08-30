import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useState } from 'react';
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
import { VectorModal, WhatModelGetsModal } from '../modals';
import { serverSpeaksDesign } from '../capability';
import { DESIGN_VIEW_KEYS, SHEET_MIN_VIEWS, viewLabel } from '../views';
import { FixContext, useFixContext } from './fix-context';
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
  const fixing = !!fix;

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

  const outputsLine = fixing
    ? '1 picture — the side being fixed'
    : layout === 'one' && ticked.length >= 2
      ? `1 picture · ${ticked.length} views inside · it comes back needing a cut, and no slot reads a composite until it is split`
      : `${ticked.length} picture${ticked.length === 1 ? '' : 's'}`;

  /**
   * ONE INTENT, ONE `client_request_id` — the ledger that makes that true lives in `useStartRun`,
   * shared with the render and 3D studios, because the money and the idempotency are one mechanism
   * whichever of the three screens pressed the button.
   */
  const submit = () => {
    if (gateReason) return;
    const params: common_DesignRunParams = {
      // A fix asks for exactly one picture of exactly one side; the matrix took no part in it, and
      // the snapshot must say so rather than freezing ticks the run did not use.
      views: fixing ? [fix.viewKey] : [...ticked],
      layout: fixing ? 'per_view' : layout,
      colour: undefined,
      threed: undefined,
      fixTarget: fixing ? fix.viewKey : '',
      extraInputMediaIds: [],
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
      <FixContext band={band} techCardId={techCardId} disabled={writesOff} />

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

          <GroupLabel>how it comes back</GroupLabel>
          <ViewSwitch
            label='layout'
            value={layout}
            options={LAYOUT_OPTIONS}
            disabled={writesOff}
            onChange={setLayout}
          />
          <Text size='nano' variant='label' component='p'>
            {ticked.length <= 1
              ? 'only one view is asked — both layouts return one picture'
              : layout === 'one'
                ? 'one file with all the ticked views drawn to one another. It comes back NEEDING A CUT: no slot reads a composite until «split ▸» has run.'
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
