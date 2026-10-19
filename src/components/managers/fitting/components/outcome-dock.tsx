import { useDockBottom } from 'hooks/useDockBottom';
import { useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Pill, Text, ViewSwitch, ViewSwitchOption } from 'ui';
import { FittingFormData } from './schema';
import { useFittingWorkspace } from './workspace';

type OutcomeKey = 'rework' | 'approved' | 'dropped';

const OPTIONS: readonly ViewSwitchOption<OutcomeKey | ''>[] = [
  { value: 'rework', label: 'rework' },
  { value: 'approved', label: 'approved' },
  { value: 'dropped', label: 'dropped' },
];

// Form outcome (wire value) ↔ the dock's segment. 'undecided' is the form's empty sentinel.
const TO_FORM: Record<OutcomeKey, string> = {
  rework: 'new_round',
  approved: 'approved',
  dropped: 'dropped',
};
function fromForm(outcome: string | undefined): OutcomeKey | '' {
  if (outcome === 'new_round') return 'rework';
  if (outcome === 'approved' || outcome === 'dropped') return outcome;
  return '';
}

// Docked outcome bar: pick rework / approved / dropped, then Finish closes the fitting
// (status done + outcome, saved at once). After Finish the outcome is shown and locked; the rest
// of the screen stays editable.
export function OutcomeDock({ saveError }: { saveError: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useDockBottom(ref, []);
  const { control, setValue } = useFormContext<FittingFormData>();
  const { done, readOnly, changeRequests, roundNumber, saveNow } = useFittingWorkspace();
  const outcome = fromForm(useWatch({ control, name: 'outcome' }));

  const open = changeRequests.filter((cr) => (cr.status || 'open') !== 'resolved').length;

  const locked = done || readOnly;

  function pick(next: OutcomeKey | '') {
    if (locked) return;
    const value = !next || next === outcome ? 'undecided' : TO_FORM[next];
    setValue('outcome', value, { shouldDirty: true });
  }

  function finish() {
    if (!outcome || locked) return;
    setValue('status', 'FITTING_STATUS_DONE', { shouldDirty: true });
    saveNow();
  }

  let summary: React.ReactNode = null;
  if (done) {
    summary = (
      <Pill tone='ok'>
        {outcome === 'rework'
          ? `round ${roundNumber + 1} · ${open} carried`
          : outcome === 'approved'
            ? 'approved'
            : outcome === 'dropped'
              ? 'dropped'
              : 'done'}
      </Pill>
    );
  } else if (outcome === 'approved' && open) {
    summary = <Pill tone='warn'>{`${open} open`}</Pill>;
  }

  return (
    <div
      ref={ref}
      className='fixed inset-x-0 bottom-0 z-40 border-t border-borderColor bg-bgColor px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]'
    >
      <div className='mx-auto flex max-w-screen-2xl flex-nowrap items-center gap-2 md:flex-wrap md:gap-3'>
        <Text
          size='micro'
          variant='label'
          component='span'
          className='hidden uppercase tracking-label md:inline'
        >
          outcome
        </Text>
        <ViewSwitch
          label='outcome'
          value={outcome}
          options={OPTIONS}
          onChange={pick}
          disabled={locked}
          className='flex-[2] md:flex-none [&>span]:flex-1 [&>span]:justify-center [&>span]:py-2 md:[&>span]:py-1'
        />
        <span className='hidden md:inline-flex'>{summary}</span>
        {saveError && (
          <Text
            size='micro'
            variant='error'
            component='span'
            role='alert'
            title={saveError}
            className='truncate'
          >
            not saved
          </Text>
        )}
        <span className='hidden flex-1 md:block' />
        <Button
          type='button'
          variant='main'
          size='lg'
          className='flex-1 py-2 md:flex-none md:py-2.5'
          disabled={!outcome || locked}
          onClick={finish}
        >
          {done ? 'Done' : 'Finish'}
        </Button>
      </div>
    </div>
  );
}
