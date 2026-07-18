import { techCardSignoffSectionOptions, techCardSignoffStateOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

const PENDING = 'TECH_CARD_SIGNOFF_STATE_PENDING';
const APPROVED = 'TECH_CARD_SIGNOFF_STATE_APPROVED';
const REJECTED = 'TECH_CARD_SIGNOFF_STATE_REJECTED';

type SignoffRowValue = NonNullable<TechCardFormData['signoffs']>[number];

const emptySignoff: SignoffRowValue = {
  section: 'TECH_CARD_SIGNOFF_SECTION_DESIGN',
  state: PENDING,
  signedBy: '',
  signedAt: '',
  note: '',
};

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function stateLabel(state?: string): string {
  return techCardSignoffStateOptions.find((o) => o.value === state)?.label ?? 'pending';
}

// Which other form sections feed each sign-off section's "changed since sign-off" check below
// (§44 / :41). Best-effort only: common_TechCardSignoff carries no lock_version/snapshot field on
// the wire (signoffSchema in schema.ts mirrors the proto 1:1 — section/state/signedBy/signedAt/
// note, nothing else), so nothing here can be durably persisted. This can only catch an edit made
// in the SAME session, after the section is (re)approved — reloading the card resets it. A durable
// version needs a new field on TechCardSignoff (proto + schema.ts), both out of this file's scope.
const SECTION_WATCH_FIELDS: Record<string, (keyof TechCardFormData)[]> = {
  TECH_CARD_SIGNOFF_SECTION_DESIGN: ['moodboardMedia', 'technicalMedia', 'callouts', 'details'],
  TECH_CARD_SIGNOFF_SECTION_CONSTRUCTION: ['construction', 'operations', 'pieces'],
  TECH_CARD_SIGNOFF_SECTION_MATERIALS: ['bomItems'],
  TECH_CARD_SIGNOFF_SECTION_COLOUR: ['colorways'],
  TECH_CARD_SIGNOFF_SECTION_LABELS: ['labels'],
  TECH_CARD_SIGNOFF_SECTION_PACKAGING: ['packaging'],
  TECH_CARD_SIGNOFF_SECTION_COSTING: ['costing'],
};

// One canonical section (Sheet «Титул» coordination — one row per section, unique per card, per
// the schema comment). Bound to its row when one exists; otherwise a quiet "not yet reviewed"
// placeholder. Approve/reject/reset are explicit actions rather than a bare state dropdown so the
// live "changed since sign-off" flag has a natural, obvious place to send the user (reset+re-review).
function SignoffSectionCard({
  section,
  label,
  index,
  snapshot,
  onStart,
  onRemove,
  onChangedReport,
}: {
  section: string;
  label: string;
  index: number; // -1 = no row yet for this section
  snapshot: string;
  onStart: () => void;
  onRemove: () => void;
  onChangedReport: (section: string, changed: boolean) => void;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const bound = index >= 0;
  const state = (useWatch({ control, name: `signoffs.${index}.state` }) ?? PENDING) as string;
  const signedAt = (useWatch({ control, name: `signoffs.${index}.signedAt` }) ?? '') as string;

  // Armed the moment this section is (re)approved (see `approve` below) — frozen until the next
  // approve/reject/reset. Comparing it against the live `snapshot` prop is the whole "changed
  // since sign-off" check.
  const [baseline, setBaseline] = useState<string | null>(() =>
    bound && state === APPROVED ? snapshot : null,
  );
  const changed = bound && state === APPROVED && baseline != null && baseline !== snapshot;

  useEffect(() => {
    onChangedReport(section, changed);
  }, [changed, section, onChangedReport]);

  if (!bound) {
    return (
      <div className='flex flex-wrap items-center justify-between gap-3 border border-dashed border-textInactiveColor p-3'>
        <div>
          <Text variant='uppercase' size='small'>
            {label}
          </Text>
          <Text variant='inactive' size='small'>
            not yet reviewed
          </Text>
        </div>
        <Button type='button' variant='secondary' onClick={onStart}>
          start review
        </Button>
      </div>
    );
  }

  const approve = () => {
    setValue(`signoffs.${index}.state`, APPROVED, { shouldDirty: true });
    if (!signedAt) setValue(`signoffs.${index}.signedAt`, todayISODate(), { shouldDirty: true });
    setBaseline(snapshot);
  };
  const reject = () => {
    setValue(`signoffs.${index}.state`, REJECTED, { shouldDirty: true });
    setBaseline(null);
  };
  const resetPending = () => {
    setValue(`signoffs.${index}.state`, PENDING, { shouldDirty: true });
    setBaseline(null);
  };

  return (
    <div
      className={cn('space-y-3 border p-3', changed ? 'border-error' : 'border-textInactiveColor')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <Text variant='uppercase' size='small'>
            {label}
          </Text>
          <Text size='small' variant={state === REJECTED ? 'error' : 'inactive'}>
            {stateLabel(state)}
          </Text>
        </div>
        <Button
          type='button'
          variant='secondary'
          aria-label={`remove ${label} sign-off`}
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>

      {changed && (
        <Text size='small' variant='error'>
          ⚠ this section changed after it was approved — reset to pending for another review, or
          re-approve to confirm it's still fine as-is.
        </Text>
      )}

      <div className='flex flex-wrap gap-2'>
        <Button type='button' variant='secondary' disabled={state === APPROVED} onClick={approve}>
          approve
        </Button>
        <Button type='button' variant='secondary' disabled={state === REJECTED} onClick={reject}>
          reject
        </Button>
        <Button
          type='button'
          variant='secondary'
          disabled={state === PENDING}
          onClick={resetPending}
        >
          reset to pending
        </Button>
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <InputField name={`signoffs.${index}.signedBy`} label='signed by' />
        <InputField name={`signoffs.${index}.signedAt`} type='date' label='signed at' />
        <InputField name={`signoffs.${index}.note`} label='note' />
      </div>
    </div>
  );
}

// Per-section sign-off (#44): one responsible role approves each sheet before it's treated as
// production-ready, so the header approval_state isn't the only gate. One card per canonical
// section (fixed by common_TechCardSignoffSection — see techCardSignoffSectionOptions), each
// either bound to its row or shown as "not yet reviewed"; a roll-up above answers "why is this
// needed" and "are we done yet" at a glance.
export function SignoffsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { append, remove } = useFieldArray({ control, name: 'signoffs' });
  const watchedSignoffs = (useWatch({ control, name: 'signoffs' }) ?? []) as SignoffRowValue[];

  // One useWatch per top-level section this tab can flag as "changed since sign-off" (see
  // SECTION_WATCH_FIELDS) — called individually, not from a dynamic list, so the hook order never
  // depends on data.
  const moodboardMedia = useWatch({ control, name: 'moodboardMedia' });
  const technicalMedia = useWatch({ control, name: 'technicalMedia' });
  const callouts = useWatch({ control, name: 'callouts' });
  const details = useWatch({ control, name: 'details' });
  const construction = useWatch({ control, name: 'construction' });
  const operations = useWatch({ control, name: 'operations' });
  const pieces = useWatch({ control, name: 'pieces' });
  const bomItems = useWatch({ control, name: 'bomItems' });
  const colorways = useWatch({ control, name: 'colorways' });
  const labels = useWatch({ control, name: 'labels' });
  const packaging = useWatch({ control, name: 'packaging' });
  const costing = useWatch({ control, name: 'costing' });

  // SECTION_WATCH_FIELDS is the single source of truth for the mapping — looked up here, not
  // hand-duplicated per section, so the two can't drift apart.
  const watchedByField: Partial<Record<keyof TechCardFormData, unknown>> = {
    moodboardMedia,
    technicalMedia,
    callouts,
    details,
    construction,
    operations,
    pieces,
    bomItems,
    colorways,
    labels,
    packaging,
    costing,
  };
  const sectionSnapshot = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [section, fieldNames] of Object.entries(SECTION_WATCH_FIELDS)) {
      out[section] = JSON.stringify(fieldNames.map((name) => watchedByField[name]));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    moodboardMedia,
    technicalMedia,
    callouts,
    details,
    construction,
    operations,
    pieces,
    bomItems,
    colorways,
    labels,
    packaging,
    costing,
  ]);

  // First row index per section (schema intent: unique per card). Sourced from useWatch, not
  // useFieldArray's own `fields`, because `fields` only refreshes on append/remove — a live
  // section/state edit needs the current value, not a stale structural snapshot.
  const indexBySection = useMemo(() => {
    const m = new Map<string, number>();
    watchedSignoffs.forEach((s, i) => {
      const sec = s?.section || '';
      if (!m.has(sec)) m.set(sec, i);
    });
    return m;
  }, [watchedSignoffs]);

  const extraIndices = useMemo(() => {
    const primary = new Set(
      techCardSignoffSectionOptions
        .map((o) => indexBySection.get(o.value))
        .filter((i): i is number => i != null),
    );
    return watchedSignoffs.map((_, i) => i).filter((i) => !primary.has(i));
  }, [watchedSignoffs, indexBySection]);

  const [changedFlags, setChangedFlags] = useState<Record<string, boolean>>({});
  const reportChanged = useCallback((section: string, isChanged: boolean) => {
    setChangedFlags((prev) =>
      prev[section] === isChanged ? prev : { ...prev, [section]: isChanged },
    );
  }, []);

  const total = techCardSignoffSectionOptions.length;
  const approvedCount = techCardSignoffSectionOptions.filter((o) => {
    const idx = indexBySection.get(o.value);
    return idx != null && watchedSignoffs[idx]?.state === APPROVED;
  }).length;
  const rejectedCount = techCardSignoffSectionOptions.filter((o) => {
    const idx = indexBySection.get(o.value);
    return idx != null && watchedSignoffs[idx]?.state === REJECTED;
  }).length;
  const pendingCount = total - approvedCount - rejectedCount;
  const changedCount = Object.values(changedFlags).filter(Boolean).length;

  return (
    <div className='space-y-4'>
      <div className='space-y-1 border border-textInactiveColor bg-textInactiveColor/10 p-3'>
        <Text variant='uppercase' size='small'>
          {approvedCount} / {total} sections approved
        </Text>
        <Text variant='inactive' size='small'>
          {rejectedCount ? `${rejectedCount} rejected · ` : ''}
          {pendingCount} pending
          {changedCount ? ` · ${changedCount} changed since sign-off` : ''}
        </Text>
        <Text variant='inactive' size='small'>
          Each section is checked and approved by its responsible role — confirmation the sheet is
          ready for production, not just that it's been filled in.
        </Text>
      </div>

      <div className='space-y-3'>
        {techCardSignoffSectionOptions.map((opt) => (
          <SignoffSectionCard
            key={opt.value}
            section={opt.value}
            label={opt.label}
            index={indexBySection.get(opt.value) ?? -1}
            snapshot={sectionSnapshot[opt.value] ?? ''}
            onStart={() => append({ ...emptySignoff, section: opt.value })}
            onRemove={() => {
              const idx = indexBySection.get(opt.value);
              if (idx != null) remove(idx);
            }}
            onChangedReport={reportChanged}
          />
        ))}
      </div>

      {extraIndices.length > 0 && (
        <div className='space-y-2'>
          <Text variant='uppercase' size='small'>
            other entries
          </Text>
          <Text variant='inactive' size='small'>
            duplicate or unrecognised section entries — safe to remove if unintended.
          </Text>
          <div className='space-y-2'>
            {extraIndices.map((index) => (
              <div
                key={index}
                className='grid grid-cols-1 items-end gap-2 border border-textInactiveColor p-2 lg:grid-cols-5'
              >
                <SelectField
                  name={`signoffs.${index}.section`}
                  label='section'
                  items={techCardSignoffSectionOptions}
                />
                <SelectField
                  name={`signoffs.${index}.state`}
                  label='state'
                  items={techCardSignoffStateOptions}
                />
                <InputField name={`signoffs.${index}.signedBy`} label='signed by' />
                <InputField name={`signoffs.${index}.signedAt`} type='date' label='signed at' />
                <div className='flex items-end gap-2'>
                  <div className='flex-1'>
                    <InputField name={`signoffs.${index}.note`} label='note' />
                  </div>
                  <Button
                    type='button'
                    variant='secondary'
                    aria-label='remove sign-off'
                    onClick={() => remove(index)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
