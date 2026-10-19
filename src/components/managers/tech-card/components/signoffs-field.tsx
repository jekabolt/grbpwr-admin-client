import { common_TechCardInsert } from 'api/proto-http/admin';
import { useCurrentAccount } from 'components/managers/accounts/utils/hooks';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardSignoffSectionOptions, techCardSignoffStateOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import {
  Button,
  Close,
  FoldCaret,
  GroupLabel,
  Input,
  Pill,
  SectionHeader,
  Text,
  InputField,
  SelectField,
} from 'ui';
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
  // COLOUR watched the RHF `colorways` array, which has been permanently empty since a colourway
  // became a product — so this section could never light pre-save. Its content in the form is the
  // cut pieces' per-colourway fabric map, which is also what the server's colour projection hashes
  // (piece line_keys + the BOM keys the map points at).
  TECH_CARD_SIGNOFF_SECTION_COLOUR: ['pieces'],
  // Legacy `labels` left the LABELS digest in 0386 (never written any more), so it is not watched.
  TECH_CARD_SIGNOFF_SECTION_LABELS: ['careLabel', 'garmentLabels'],
  TECH_CARD_SIGNOFF_SECTION_PACKAGING: ['packaging', 'packagingItems'],
  TECH_CARD_SIGNOFF_SECTION_COSTING: ['costing'],
};

// Which sign-off sections a row stored WITHOUT a stable line_key can invalidate. Server-side each
// section's fingerprint hashes those keys (dto/techcard_section_digest.go): materialsProjection
// hashes every BOM line's line_key, colourProjection hashes each cut piece's line_key plus the BOM
// keys its fabric map points at, constructionProjection hashes the piece keys and the keys each
// operation references. A keyless row gets a fresh ULID minted on READ (schema.ts mapBomItemToForm /
// the pieces mapper) and the key CANNOT be suppressed — every downstream reference, from an
// operation's piece list to a colourway recipe, is keyed by it. So the first save of such a card
// writes identity the stored approval digest never covered, and the section flips to «changed after
// approval» with no operator edit behind it. Naming the cause is all this client can honestly do.
function legacyKeyedSections(insert?: common_TechCardInsert): Set<string> {
  const bomKeyless = (insert?.bomItems ?? []).some((b) => !b.lineKey?.trim());
  const pieceKeyless = (insert?.pieces ?? []).some((p) => !p.lineKey?.trim());
  const out = new Set<string>();
  if (bomKeyless) out.add('TECH_CARD_SIGNOFF_SECTION_MATERIALS');
  if (bomKeyless || pieceKeyless) {
    out.add('TECH_CARD_SIGNOFF_SECTION_COLOUR');
    out.add('TECH_CARD_SIGNOFF_SECTION_CONSTRUCTION');
  }
  return out;
}

// One canonical section (Sheet «Титул» coordination — one row per section, unique per card, per
// the schema comment). Bound to its row when one exists; otherwise pending, and approve/reject
// creates the row already decided (no separate «start review» step).
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
  legacyKeys,
  me,
  onStart,
  onRemove,
  onChangedReport,
}: {
  section: string;
  label: string;
  index: number; // -1 = no row yet for this section
  snapshot: string;
  currentDigest: string;
  // This section's content includes rows the server stored with no line_key — see legacyKeyedSections.
  legacyKeys: boolean;
  /** The signed-in account: it is who signs. No typed name. */
  me: string;
  /** Creates this section's row already decided — there is no separate «start review» step. */
  onStart: (row: Partial<SignoffRowValue>) => void;
  onRemove: () => void;
  onChangedReport: (section: string, changed: boolean) => void;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const bound = index >= 0;
  const watchedState = useWatch({ control, name: `signoffs.${index}.state` }) as string | undefined;
  const state = bound ? watchedState ?? PENDING : PENDING;
  const signedBy = (useWatch({ control, name: `signoffs.${index}.signedBy` }) ?? '') as string;
  const signedAt = (useWatch({ control, name: `signoffs.${index}.signedAt` }) ?? '') as string;
  const note = (useWatch({ control, name: `signoffs.${index}.note` }) ?? '') as string;
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

  // Одобренная и нетронутая секция свёрнута в одну строку: на ней нечего делать. Раскрыта всякая,
  // что ждёт решения; стоит одобрению устареть — разворачивается сама.
  const settled = state === APPROVED && !changed;
  const [open, setOpen] = useState(!settled);
  useEffect(() => {
    if (!settled) setOpen(true);
  }, [settled]);

  // Отказ без причины не принимается: поле причины открывается по «reject», кнопка подтверждения
  // молчит, пока поле пусто.
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  // ОДИН КЛИК НА СЕКЦИЮ, никогда пачкой. Подписывает вошедший (`me`), дата — сегодня; имя руками
  // не набирается. Пустой digest — это и есть «одобряю сейчас» на проводе: сервер снимет отпечаток
  // с того, что сохраняется, так что `re-approve` на устаревшей секции чинит её одним сохранением.
  const approve = () => {
    const stamp = { state: APPROVED, signedBy: me, signedAt: todayISODate(), signedDigest: '' };
    if (!bound) onStart(stamp);
    else
      for (const [k, v] of Object.entries(stamp))
        setValue(`signoffs.${index}.${k as 'state'}`, v, { shouldDirty: true });
    setBaseline(snapshot);
  };
  const reject = () => {
    const why = reason.trim();
    if (!why) return;
    const stamp = { state: REJECTED, signedBy: me, signedAt: todayISODate(), note: why };
    if (!bound) onStart(stamp);
    else
      for (const [k, v] of Object.entries(stamp))
        setValue(`signoffs.${index}.${k as 'state'}`, v, { shouldDirty: true });
    setBaseline(null);
    setRejecting(false);
    setReason('');
  };
  const resetPending = () => {
    setValue(`signoffs.${index}.state`, PENDING, { shouldDirty: true });
    setBaseline(null);
  };

  const stampLine = [signedBy, signedAt].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 border p-2',
        changed ? 'border-error' : 'border-borderColor',
      )}
    >
      <div className='flex flex-wrap items-center gap-1.5'>
        <button
          type='button'
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className='flex items-center'
        >
          <Text size='micro' component='span' className='font-bold uppercase'>
            {label}
          </Text>
          <FoldCaret open={open} />
        </button>
        {/* mid-flight, needs a human → blue. It replaces the state pill: "approved" next to
            "changed after approval" would be two answers to the same question. */}
        {changed ? (
          <Pill tone='attention'>changed after approval</Pill>
        ) : (
          <Pill tone={stateTone(state)}>{bound ? stateLabel(state) : 'pending'}</Pill>
        )}
        {bound && stampLine && state !== PENDING && (
          <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
            {stampLine}
          </Text>
        )}
        {open && !settled && (
          <div className='ml-auto'>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={!me}
              title={me ? undefined : 'loading your account…'}
              onClick={approve}
            >
              {changed ? 're-approve' : 'approve'}
            </Button>
          </div>
        )}
      </div>

      {open && (
        <>
          {/* Advisory, never blocking: the mint is unavoidable and the save is legitimate — what
              would otherwise be inexplicable is the section turning red for it. */}
          {legacyKeys && state === APPROVED && (
            <Text size='micro' variant='label'>
              ! next save re-keys old rows and marks this approval changed
            </Text>
          )}

          {state === REJECTED && note && (
            <Text size='micro' variant='error'>
              {note}
            </Text>
          )}

          {rejecting && (
            <div className='flex items-center gap-1.5'>
              <Input
                name={`signoff-reason-${section}`}
                value={reason}
                autoFocus
                autoComplete='off'
                placeholder='reason'
                className='min-w-0 flex-1'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    reject();
                  }
                }}
              />
              <Button
                type='button'
                variant='secondary'
                size='xs'
                disabled={!reason.trim() || !me}
                onClick={reject}
              >
                reject section
              </Button>
            </div>
          )}

          {/* Отказ, сброс и снятие — редкие ходы, свёрнуты; на виду только одобрение. */}
          <details className='group'>
            <summary className='flex cursor-pointer list-none items-center'>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                details
              </Text>
              <FoldCaret open='details' />
            </summary>
            <div className='mt-1 flex flex-wrap gap-1'>
              <Button
                type='button'
                variant='secondary'
                size='xs'
                disabled={state === REJECTED || rejecting}
                onClick={() => setRejecting(true)}
              >
                reject
              </Button>
              {bound && (
                <>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    disabled={state === PENDING}
                    onClick={resetPending}
                  >
                    reset to pending
                  </Button>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    aria-label={`remove ${label} sign-off`}
                    onClick={onRemove}
                  >
                    remove
                  </Button>
                </>
              )}
            </div>
          </details>
        </>
      )}
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
  const { data: account } = useCurrentAccount();
  const me = account?.account?.username ?? '';
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
  // Read from the card AS THE SERVER SENT IT — the form copy is useless here, the mint has already
  // happened by the time mapTechCardToForm has run.
  const legacySections = useMemo(
    () => legacyKeyedSections(techCard?.techCard),
    [techCard?.techCard],
  );

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
  const labels = useWatch({ control, name: 'labels' });
  const packaging = useWatch({ control, name: 'packaging' });
  const careLabel = useWatch({ control, name: 'careLabel' });
  const garmentLabels = useWatch({ control, name: 'garmentLabels' });
  const packagingItems = useWatch({ control, name: 'packagingItems' });
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
    labels,
    packaging,
    careLabel,
    garmentLabels,
    packagingItems,
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
    labels,
    packaging,
    careLabel,
    garmentLabels,
    packagingItems,
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
  const changedCount = Object.values(changedFlags).filter(Boolean).length;

  const summary = [
    `${approvedCount} of ${total} approved`,
    rejectedCount ? `${rejectedCount} rejected` : '',
    changedCount ? `${changedCount} changed` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex flex-col border border-borderColor bg-bgColor p-3'>
      <SectionHeader title='sign-off' question={summary} />

      <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-2'>
        {techCardSignoffSectionOptions.map((opt) => (
          <SignoffSectionCard
            key={opt.value}
            section={opt.value}
            label={opt.label}
            index={indexBySection.get(opt.value) ?? -1}
            snapshot={sectionSnapshot[opt.value] ?? ''}
            currentDigest={currentDigests.get(opt.value) ?? ''}
            legacyKeys={legacySections.has(opt.value)}
            me={me}
            onStart={(row) => append({ ...emptySignoff, ...row, section: opt.value })}
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
                  <Close size='sm' aria-label='remove sign-off' onClick={() => remove(index)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
