import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardSignoffSectionOptions, techCardSignoffStateOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { SectionHeader } from 'ui/components/section-header';
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

// green = signed · red = rejected · grey = not started.
const stateTone = (state?: string): 'ok' | 'warn' | 'mut' =>
  state === APPROVED ? 'ok' : state === REJECTED ? 'warn' : 'mut';

// Which other form sections feed the PRE-SAVE half of the "changed since sign-off" check below
// (§44 / :41). The durable answer is now a digest comparison — TechCardSignoff.signedDigest, the
// fingerprint taken when the section was approved, against the matching entry in
// TechCard.sectionDigests, recomputed by the server on every read — and it survives a reload.
// But both sides of that comparison are server-computed, so an edit made in this session has not
// moved either one yet. This map covers exactly that window: it lights the flag while the user is
// still typing, and the digests take over the moment the card is saved.
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
// the schema comment). Bound to its row when one exists; otherwise a dashed "not started" card.
// Approve/reject/reset are explicit actions rather than a bare state dropdown so the "changed
// since sign-off" flag has a natural, obvious place to send the user. `re-approve` clears the
// staleness in a single save: it blanks signedDigest, and an empty digest is exactly how the
// contract expresses "I am approving this now" (a save that echoes the digest back is treated as
// an ordinary save and never re-blesses a section against its own new content).
//
// «changed after it was approved» is a CARD-LEVEL condition: the frame turns red and the header
// carries the pill. It used to be a red sentence sitting above the note input, which read as a
// validation error on the note field rather than a fact about the section.
function SignoffSectionCard({
  section,
  label,
  index,
  snapshot,
  currentDigest,
  onStart,
  onRemove,
  onChangedReport,
}: {
  section: string;
  label: string;
  index: number; // -1 = no row yet for this section
  snapshot: string;
  currentDigest: string;
  onStart: () => void;
  onRemove: () => void;
  onChangedReport: (section: string, changed: boolean) => void;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const bound = index >= 0;
  const state = (useWatch({ control, name: `signoffs.${index}.state` }) ?? PENDING) as string;
  const signedAt = (useWatch({ control, name: `signoffs.${index}.signedAt` }) ?? '') as string;
  const signedDigest = (useWatch({ control, name: `signoffs.${index}.signedDigest` }) ??
    '') as string;

  // Durable half: what this section was when it was approved vs what it is now. Both sides are
  // server-computed, so it holds across a reload.
  // An EMPTY digest on either side is UNKNOWN, never "changed": an empty signedDigest is a
  // sign-off taken before the field existed, and an empty currentDigest is a card the server sent
  // none for (or one still loading). Reading either as changed would turn every historical
  // approval red on the day this ships.
  const signedStale =
    bound &&
    state === APPROVED &&
    !!signedDigest &&
    !!currentDigest &&
    signedDigest !== currentDigest;

  // Pre-save half of the same question. Armed the moment this section is (re)approved (see
  // `approve` below) and compared against the live `snapshot` prop, it answers for the window
  // between an edit and the save that would move the server digest — without it the warning would
  // only appear after a round-trip, which is a beat too late to stop the person making the edit.
  const [baseline, setBaseline] = useState<string | null>(() =>
    bound && state === APPROVED ? snapshot : null,
  );
  const sessionStale = bound && state === APPROVED && baseline != null && baseline !== snapshot;

  const changed = signedStale || sessionStale;

  useEffect(() => {
    onChangedReport(section, changed);
  }, [changed, section, onChangedReport]);

  if (!bound) {
    return (
      <div className='flex flex-wrap items-center gap-1.5 border border-dashed border-borderColor p-2'>
        <Text size='micro' component='span' className='font-bold uppercase'>
          {label}
        </Text>
        <Pill tone='mut'>not started</Pill>
        <div className='ml-auto'>
          <Button type='button' variant='secondary' size='xs' onClick={onStart}>
            start review
          </Button>
        </div>
      </div>
    );
  }

  const approve = () => {
    setValue(`signoffs.${index}.state`, APPROVED, { shouldDirty: true });
    if (!signedAt) setValue(`signoffs.${index}.signedAt`, todayISODate(), { shouldDirty: true });
    // Clearing the digest is what MAKES this an approval on the wire: an empty signedDigest asks the
    // server to fingerprint the content being saved, while a present one means "ordinary save, do
    // not re-bless". So `re-approve` on a stale section really does clear it, in one save — the user
    // does not have to go the long way round through reset → save → approve → save.
    setValue(`signoffs.${index}.signedDigest`, '', { shouldDirty: true });
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
      className={cn(
        'flex flex-col gap-1.5 border p-2',
        changed ? 'border-error' : 'border-borderColor',
      )}
    >
      <div className='flex flex-wrap items-center gap-1.5'>
        <Text size='micro' component='span' className='font-bold uppercase'>
          {label}
        </Text>
        {/* mid-flight, needs a human → blue. It replaces the state pill: "approved" next to
            "changed after approval" would be two answers to the same question. */}
        {changed ? (
          <Pill tone='attention'>changed after approval</Pill>
        ) : (
          <Pill tone={stateTone(state)}>{stateLabel(state)}</Pill>
        )}
        <div className='ml-auto'>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            aria-label={`remove ${label} sign-off`}
            onClick={onRemove}
          >
            ✕
          </Button>
        </div>
      </div>

      <div className='flex flex-wrap gap-1'>
        <Button
          type='button'
          variant='secondary'
          size='xs'
          disabled={state === APPROVED && !changed}
          onClick={approve}
        >
          {changed ? 're-approve' : 'approve'}
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='xs'
          disabled={state === REJECTED}
          onClick={reject}
        >
          reject
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='xs'
          disabled={state === PENDING}
          onClick={resetPending}
        >
          reset to pending
        </Button>
      </div>

      <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-3'>
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
// either bound to its row or shown as a dashed "not started". The roll-up that used to sit in a
// tinted box above the grid now rides in the section header's question slot.
export function SignoffsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { append, remove } = useFieldArray({ control, name: 'signoffs' });
  const watchedSignoffs = (useWatch({ control, name: 'signoffs' }) ?? []) as SignoffRowValue[];

  // The card's CURRENT per-section fingerprints, the other side of each row's signedDigest. Read
  // from the route + react-query rather than taken as a prop: this is the same cached detail the
  // editor around us already holds, so it costs nothing, and this tab is rendered without props.
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  const { data: techCard } = useTechCard(numId);
  const currentDigests = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of techCard?.sectionDigests ?? []) m.set(d.section ?? '', d.digest ?? '');
    return m;
  }, [techCard?.sectionDigests]);

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

  const summary = [
    `— ${approvedCount} of ${total} approved`,
    rejectedCount ? `${rejectedCount} rejected` : '',
    pendingCount ? `${pendingCount} pending` : '',
    changedCount ? `${changedCount} invalidated by later edits` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex flex-col'>
      <SectionHeader title='every section signed before release' question={summary} />
      <Text size='micro' variant='label' className='mb-2'>
        each section is checked and approved by its responsible role — confirmation the sheet is
        ready for production, not just that it has been filled in. A section that changed after
        approval must re-open; all {total} must be approved to release.
      </Text>

      <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-2'>
        {techCardSignoffSectionOptions.map((opt) => (
          <SignoffSectionCard
            key={opt.value}
            section={opt.value}
            label={opt.label}
            index={indexBySection.get(opt.value) ?? -1}
            snapshot={sectionSnapshot[opt.value] ?? ''}
            currentDigest={currentDigests.get(opt.value) ?? ''}
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
        <>
          <GroupLabel>other entries</GroupLabel>
          <Text size='micro' variant='label' className='mb-1'>
            duplicate or unrecognised section entries — safe to remove if unintended.
          </Text>
          <div className='flex flex-col gap-1.5'>
            {extraIndices.map((index) => (
              <div
                key={index}
                className='grid grid-cols-1 items-end gap-1.5 border border-borderColor p-2 lg:grid-cols-5'
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
                <div className='flex items-end gap-1.5'>
                  <div className='flex-1'>
                    <InputField name={`signoffs.${index}.note`} label='note' />
                  </div>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    aria-label='remove sign-off'
                    onClick={() => remove(index)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
