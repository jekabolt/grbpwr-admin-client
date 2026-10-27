import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import {
  AddDoor,
  Chip,
  Close,
  ConfirmationModal,
  FoldCaret,
  GroupLabel,
  Row,
  Select,
  Text,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  DecimalField,
  InputField,
  SelectField,
} from 'ui';
import { StitchPictogram } from 'components/managers/tech-card/annotation/stitch-pictogram';
import { ulid } from 'utils/ulid';
import {
  automationLevelOptions,
  bedTypeOptions,
  isMachineStepType,
  isPressStepType,
  machineProfileName,
  machineTypeLabel,
  machineTypeOptions,
  needleTypeOptions,
  pressClothOptions,
  pressEquipmentLabel,
  pressEquipmentOptions,
  pressProcessShort,
  pressProfileName,
  pressProfileProcessOptions,
  resolveMachineProfile,
  resolvePressProfile,
  stitchTypeNumber,
  threadTensionOptions,
} from './equipment-options';
import { attachmentOptions, machineProfileSummary, pressProfileSummary } from './operation-options';
import { TechCardFormData } from './schema';

// ══ THE CARD'S EQUIPMENT PARK (0306) ═══════════════════════════════════════════════════════════
//
// «This style is sewn on THESE machines with THESE settings and pressed in THESE modes.» Two lists
// on CARD DEFAULTS, and the top rung but one of the inheritance ladder every step's blank field
// resolves through (§3): step override → the profile it names → the single profile of its type →
// card defaults → not set.
//
// SEVERAL PROFILES OF ONE TYPE ARE THE ORDINARY CASE, not a duplicate to collapse: two overlocks
// threaded differently is what a floor looks like. That is why the type picker is never disabled by
// «already used», why identity is a minted key rather than the type, and why the by-type rung of the
// ladder resolves NOTHING when the card holds two of a kind — with two overlocks, «the overlock» is
// not an answer, and guessing the first would print a thread count off a machine nobody chose.
//
// IDENTITY IS `profileKey` — a client-minted ULID, exactly like a BOM line's `lineKey`, minted when
// the row is created here and round-tripped verbatim ever after. The list is FULL-REPLACED on every
// save, so a position or a server id would detach every step pointing at a row the moment another
// row is added above it. The human `label` («оверлок у окна») is NOT part of it: that is the
// scope_key lesson, where two different keys ended up living under one name.

type EquipmentDefaultsForm = NonNullable<TechCardFormData['construction']['equipmentDefaults']>;
export type MachineProfileRow = NonNullable<EquipmentDefaultsForm['machines']>[number];
export type PressProfileRow = NonNullable<EquipmentDefaultsForm['presses']>[number];
type StepRow = NonNullable<TechCardFormData['operations']>[number];

const MACHINES = 'construction.equipmentDefaults.machines' as const;
const PRESSES = 'construction.equipmentDefaults.presses' as const;

const NONE_MACHINE = 'TECH_CARD_MACHINE_TYPE_UNKNOWN';
const NONE_PRESS_EQUIPMENT = 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN';
const NONE_NEEDLE = 'TECH_CARD_NEEDLE_TYPE_UNKNOWN';
const NONE_TENSION = 'TECH_CARD_THREAD_TENSION_UNKNOWN';
const NONE_PRESS_CLOTH = 'TECH_CARD_PRESS_CLOTH_UNKNOWN';
const NONE_ATTACHMENT = 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN';
const ANY_PROCESS = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';

const DIRTY = { shouldDirty: true } as const;

// The form field components take `name: string`, so a mistyped path is not a build error — it is a
// control that edits a field nobody reads, silently, forever. These two put the row's field names
// back under the type checker: `keyof` is the schema's own key set, so a field renamed in the zod
// object fails the build here instead of going quiet on screen. (react-hook-form's own setValue
// checks its paths, which is why the adopt button below writes them as plain template literals.)
const machineField = <F extends keyof MachineProfileRow>(index: number, field: F) =>
  `${MACHINES}.${index}.${field}` as const;
const pressField = <F extends keyof PressProfileRow>(index: number, field: F) =>
  `${PRESSES}.${index}.${field}` as const;

// A fresh row spells out EVERY key rather than leaning on the zod defaults — the object is spread
// straight into the field array, and a key missing here is a field react-hook-form never registers,
// so the control's first render would read `undefined` off a row the schema believes is complete.
// (Same rule, same reason, as emptyOperation in operations-field.)
const emptyMachineProfile: MachineProfileRow = {
  profileKey: '',
  label: '',
  machineType: NONE_MACHINE,
  threadCount: 0,
  needleType: NONE_NEEDLE,
  needleSizeNm: 0,
  bedType: 'TECH_CARD_BED_TYPE_UNKNOWN',
  automation: 'TECH_CARD_AUTOMATION_LEVEL_UNKNOWN',
  threadTension: NONE_TENSION,
  threadTensionNote: '',
  attachmentKind: NONE_ATTACHMENT,
  stitchesPerCm: '',
  stitchWidthMm: '',
  note: '',
};

const emptyPressProfile: PressProfileRow = {
  profileKey: '',
  label: '',
  pressEquipment: NONE_PRESS_EQUIPMENT,
  operationType: ANY_PROCESS,
  pressTemperatureC: 0,
  pressDwellSec: 0,
  pressPressureNCm2: '',
  // NOT `false`: three-valued (absent = «not stated», false = «press it DRY», true = «with steam»),
  // and a default of false would state an instruction on every profile nobody has answered.
  pressSteam: undefined,
  pressCloth: NONE_PRESS_CLOTH,
  note: '',
};

// ── WHO POINTS AT A PROFILE ──────────────────────────────────────────────────────────────────────
//
// «used by N steps», counted THROUGH THE LADDER RESOLVERS the step editor and the printed sheet
// already walk (resolveMachineProfile / resolvePressProfile) rather than by a rule of its own. That
// is the whole point of the shared helper: a count computed here with its own arithmetic could say
// «used by 2» over a card where the step editor shows «— pick one of 2 —» and inherits nothing.
//
// Split into the two ways a step can arrive: BY KEY it named the profile, BY TYPE it merely happens
// to be the only machine of its kind on the card. The split matters on delete — a named reference
// survives as a dangling key the operator can see and repair, an inherited one just silently stops
// resolving.
type ProfileUse = { byKey: number; byType: number };
const NO_USE: ProfileUse = { byKey: 0, byType: 0 };

function countProfileUses(
  operations: StepRow[],
  machines: MachineProfileRow[],
  presses: PressProfileRow[],
): { machines: Map<string, ProfileUse>; presses: Map<string, ProfileUse> } {
  const m = new Map<string, ProfileUse>();
  const p = new Map<string, ProfileUse>();
  const bump = (map: Map<string, ProfileUse>, key: string, named: boolean) => {
    const cur = map.get(key) ?? { byKey: 0, byType: 0 };
    if (named) cur.byKey += 1;
    else cur.byType += 1;
    map.set(key, cur);
  };
  for (const op of operations) {
    const type = op.operationType ?? '';
    if (isMachineStepType(type)) {
      const named = (op.machineProfileKey ?? '').trim();
      const hit = resolveMachineProfile(machines, op.machineType, named);
      const key = (hit?.profileKey ?? '').trim();
      if (key) bump(m, key, !!named);
    } else if (isPressStepType(type)) {
      const named = (op.pressProfileKey ?? '').trim();
      const hit = resolvePressProfile(presses, op.pressEquipment, named, type);
      const key = (hit?.profileKey ?? '').trim();
      if (key) bump(p, key, !!named);
    }
  }
  return { machines: m, presses: p };
}

// ── WHAT AN EDIT TO THIS LIST WOULD DO ───────────────────────────────────────────────────────────
//
// Asked of the ladder TWICE — once over the list as it stands, once over the list as it would be —
// and never inferred from the reference count above, because those are two different questions and
// on this card the difference bites. With TWO overlocks and a step that names neither, the by-type
// rung is ambiguous and resolves to NOTHING: both profiles read «used by no step», and deleting
// EITHER one leaves the survivor alone in its class, so that step suddenly starts inheriting
// settings it never had. An edit that begins by silently handing a step new instructions must not
// be the one edit that skips the warning.
//
// Two buckets, both reachable: a step that STOPS resolving to what it resolved to, and a step that
// STARTS resolving to something. (A by-key reference always lands in the first: the ladder
// short-circuits on a named key, so it detaches rather than falling back to the type rung.)
//
// THE SAME QUESTION IS ASKED OF A DELETE AND OF A RETYPE, which is why the diff is a parameter
// rather than three near-copies. Changing what a profile IS is not a smaller event than deleting
// it: every step that named it as something else loses the reference (see the detach rules below),
// every step that inherited it by type stops, and steps of the NEW type may start — and «type reset
// to not set» is a delete in all but name, because the mapper drops such a row from the payload
// entirely. `keyAfter` is what makes the two cases one function: a delete leaves the step's key
// alone (it dangles and the ladder resolves nothing), a retype clears the keys it invalidates.
type RemovalImpact = { losing: number; gaining: number };
const impactTotal = (i: RemovalImpact) => i.losing + i.gaining;

function machineImpact(
  operations: StepRow[],
  before: MachineProfileRow[],
  after: MachineProfileRow[],
  keyAfter: (op: StepRow, i: number) => string,
): RemovalImpact {
  const impact: RemovalImpact = { losing: 0, gaining: 0 };
  operations.forEach((op, i) => {
    if (!isMachineStepType(op.operationType ?? '')) return;
    const was =
      resolveMachineProfile(before, op.machineType, op.machineProfileKey)?.profileKey ?? '';
    const now = resolveMachineProfile(after, op.machineType, keyAfter(op, i))?.profileKey ?? '';
    if (was === now) return;
    if (was) impact.losing += 1;
    else impact.gaining += 1;
  });
  return impact;
}

function pressImpact(
  operations: StepRow[],
  before: PressProfileRow[],
  after: PressProfileRow[],
  keyAfter: (op: StepRow, i: number) => string,
): RemovalImpact {
  const impact: RemovalImpact = { losing: 0, gaining: 0 };
  operations.forEach((op, i) => {
    const type = op.operationType ?? '';
    if (!isPressStepType(type)) return;
    const was =
      resolvePressProfile(before, op.pressEquipment, op.pressProfileKey, type)?.profileKey ?? '';
    const now =
      resolvePressProfile(after, op.pressEquipment, keyAfter(op, i), type)?.profileKey ?? '';
    if (was === now) return;
    if (was) impact.losing += 1;
    else impact.gaining += 1;
  });
  return impact;
}

// A REMOVAL keeps every step's key exactly as it is: the pointer survives the delete as a dangling
// reference the operator can see and repair, which is the whole distinction the dialog draws
// between a named and an inherited use.
const keptKey =
  (field: 'machineProfileKey' | 'pressProfileKey') =>
  (op: StepRow): string =>
    op[field] ?? '';

const machineRemovalImpact = (operations: StepRow[], rows: MachineProfileRow[], index: number) =>
  machineImpact(
    operations,
    rows,
    rows.filter((_, i) => i !== index),
    keptKey('machineProfileKey'),
  );

const pressRemovalImpact = (operations: StepRow[], rows: PressProfileRow[], index: number) =>
  pressImpact(
    operations,
    rows,
    rows.filter((_, i) => i !== index),
    keptKey('pressProfileKey'),
  );

// WHICH STEPS A RETYPE WOULD DETACH — the indices, not a count, so the sentence the operator reads
// and the write the confirm performs are the SAME list. Counting them a second time by a rule of
// its own is how a warning ends up describing an edit that did something else.
//
// A reference is dropped when it names THIS profile and the step is not of the profile's new type:
// the server refuses that pair by name (resolveProfileKey → profile_type_mismatch for a machine)
// and would refuse the whole card over a step that is not even on screen.
const machineStepsToDetach = (operations: StepRow[], key: string, nextType: string): number[] =>
  !key.trim()
    ? []
    : operations.reduce<number[]>((acc, op, i) => {
        if (!isMachineStepType(op.operationType ?? '')) return acc;
        if ((op.machineProfileKey ?? '').trim() !== key.trim()) return acc;
        if ((op.machineType ?? '') === nextType) return acc;
        acc.push(i);
        return acc;
      }, []);

const pressStepsToDetach = (operations: StepRow[], key: string, nextEquipment: string): number[] =>
  !key.trim()
    ? []
    : operations.reduce<number[]>((acc, op, i) => {
        if (!isPressStepType(op.operationType ?? '')) return acc;
        if ((op.pressProfileKey ?? '').trim() !== key.trim()) return acc;
        if ((op.pressEquipment ?? '') === nextEquipment) return acc;
        acc.push(i);
        return acc;
      }, []);

// A RETYPE also detaches, and the diff has to be computed WITH that detach in it — otherwise the
// dialog would count a step as keeping a reference the confirm is about to clear. Both sides are
// built explicitly from `from` / `to` rather than read off the form, because this runs after the
// select has already written the new value and «which snapshot am I holding» is not a question a
// warning should depend on.
function machineRetypeImpact(
  operations: StepRow[],
  rows: MachineProfileRow[],
  index: number,
  from: string,
  to: string,
): RemovalImpact {
  const key = (rows[index]?.profileKey ?? '').trim();
  const dropped = new Set(machineStepsToDetach(operations, key, to));
  const at = (t: string) => rows.map((r, i) => (i === index ? { ...r, machineType: t } : r));
  return machineImpact(operations, at(from), at(to), (op, i) =>
    dropped.has(i) ? '' : op.machineProfileKey ?? '',
  );
}

function pressReequipImpact(
  operations: StepRow[],
  rows: PressProfileRow[],
  index: number,
  from: string,
  to: string,
): RemovalImpact {
  const key = (rows[index]?.profileKey ?? '').trim();
  const dropped = new Set(pressStepsToDetach(operations, key, to));
  const at = (e: string) => rows.map((r, i) => (i === index ? { ...r, pressEquipment: e } : r));
  return pressImpact(operations, at(from), at(to), (op, i) =>
    dropped.has(i) ? '' : op.pressProfileKey ?? '',
  );
}

// WHAT THE DIALOG IS ABOUT. One shape for both lists and both events: `retype` carries the value to
// put back if the operator declines, which is the only difference in what confirm and cancel do.
type PendingChange = {
  kind: 'remove' | 'retype';
  index: number;
  name: string;
  impact: RemovalImpact;
  /**
   * retype: how many steps lose their explicit reference. COUNTED APART FROM `impact`, because the
   * two do not always coincide and the one that goes uncounted is the one that bites: a press step
   * naming a profile written for another process already inherits NOTHING from it (the ladder
   * refuses the mismatch), so re-equipping that profile changes no inherited value at all — while
   * still erasing, irreversibly, the pick the operator can see in that step's picker. A change with
   * `impact` zero and `detaching` two must still ask.
   */
  detaching?: number;
  /** retype: the value the control held before, restored on cancel. */
  from?: string;
  /** retype: the value just picked. */
  to?: string;
  /** The new value is «not set», so the row will not be sent at all — see mapEquipmentDefaultsOut. */
  drops?: boolean;
};

// The tile's selection handle. The profile key IS the identity, so it is what selection is keyed on
// — never react-hook-form's row `id`, which is REGENERATED for every row whenever the array is
// written at its root (see THE ONE RULE below): a selection held by row id would jump to another
// profile, or vanish, every time a step adopted its settings into the park.
const rowKey = (profileKey: string | undefined, index: number) =>
  (profileKey ?? '').trim() || `#${index}`;

// ══ THE ONE RULE THIS MODULE EXISTS TO HOLD ════════════════════════════════════════════════════
//
// HOW A LIST IS MUTATED FROM OUTSIDE THE COMPONENT THAT OWNS IT. Measured against the installed
// react-hook-form 7.62 (sources recoverable from the dist source map):
//
//   · `useFieldArray`'s own append/remove/move go through `control._setFieldArray`, which emits ONLY
//     on `_subjects.state`. They never touch `_subjects.array`, and each hook instance updates its
//     OWN `fields`. So a SECOND `useFieldArray` on the same name — the obvious way to let the step
//     editor push a profile — renders a stale list: the row saves and is invisible.
//   · `setValue(<array name>, next)` is the ONLY write that emits on `_subjects.array`, which is
//     what every mounted `useFieldArray` on that name is subscribed to. It re-syncs the owner (and
//     re-keys every row, hence the selection rule above).
//   · With the owner UNMOUNTED — CARD DEFAULTS is an accordion, and its body is not rendered while
//     it is folded — the same call degrades to a plain leaf write into `_formValues`. The row still
//     saves, and the list picks it up when it next mounts, because `useFieldArray` seeds its state
//     from `control._getFieldArray(name)`. (This form does not set `shouldUnregister`, so an
//     unmounted field keeps its value.)
//
// Hence: SHAPE CHANGES go through the array root, VALUE CHANGES go through the leaf path. A leaf
// write needs none of the above — it is what every registered control does on every keystroke.
// This is also why the «set as card profile» button lives in this file rather than in the step
// editor that renders it.
//
// (The two «+ add» chips are the exception that proves it: they sit INSIDE the owning component and
// therefore use its own `append`, which updates that instance's `fields` directly.)

// ── the two controls the field library has no shape for ─────────────────────────────────────────

// A NUMBER WHOSE ZERO MEANS «NOT STATED», and therefore a box that has to be EMPTY at zero: an
// unset thread count sitting in the control as a literal `0` is both a wrong reading (there is no
// zero-thread machine) and a lie about what the profile says. `step='any'` with no min/max is the
// less obvious half — the card's <form> carries no noValidate, so a number input's IMPLICIT step of
// 1 turns a mistyped «92.5» into a native stepMismatch that aborts the submit with a browser bubble
// before react-hook-form ever runs, pointing at a control inside a folded accordion. The bands are
// enforced in the schema, where the message lands on the field. (The step editor's
// InheritableNumberField is the same control for the operation paths.)
function ProfileNumberField({
  name,
  label,
  value,
  placeholder,
}: {
  name: string;
  label: string;
  value: number;
  placeholder?: string;
}) {
  return (
    <InputField
      name={name}
      type='number'
      step='any'
      valueAsNumber
      label={label}
      placeholder={placeholder}
      value={value || ''}
    />
  );
}

// STEAM IS THREE-VALUED and a Radix select can only hold a non-empty string, so the sentinel is
// encoded AT THE CONTROL. It must never reach the form: «__unset__» in `pressSteam` would travel to
// the server as a boolean nobody chose.
const STEAM_UNSET = '__unset__';
function ProfileSteamField({ name }: { name: `${typeof PRESSES}.${number}.pressSteam` }) {
  const { control } = useFormContext<TechCardFormData>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>steam</FormLabel>
          <Select
            name={name}
            items={[
              { value: STEAM_UNSET, label: '— not stated —' },
              { value: 'yes', label: 'with steam' },
              { value: 'no', label: 'no steam — press dry' },
            ]}
            placeholder='steam'
            value={
              field.value === undefined || field.value === null
                ? STEAM_UNSET
                : field.value
                  ? 'yes'
                  : 'no'
            }
            onValueChange={(v?: string) =>
              field.onChange(v === STEAM_UNSET || !v ? undefined : v === 'yes')
            }
            invalid={!!fieldState.error}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Keep a Radix select from ballooning when its selected option is long — same class, same reason, as
// in the step editor: clip the trigger's value span instead of letting it wrap the control taller.
const selectNoGrow = '[&>span:first-child]:min-w-0 [&>span:first-child]:truncate';
const fieldGrid = 'grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3';

function nameSays(name: string, fact: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/\bfusing\b/g, 'fuse')
      .replace(/\bpressing\b/g, 'press')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const n = normalize(name);
  const f = normalize(fact);
  return !!n && !!f && (n === f || n.includes(f));
}

function machineRowSummary(row: MachineProfileRow): string {
  const name = machineProfileName(row);
  const machine = machineTypeLabel(row.machineType);
  const settings = machineProfileSummary(row).replace(/\b1 threads\b/g, '1 thread');
  return [nameSays(name, machine) ? '' : machine, settings].filter(Boolean).join(' · ');
}

function pressEquipmentFact(name: string, equipment: string): string {
  if (nameSays(name, equipment)) return '';
  const withDetail = equipment.match(/^([^()]+?)\s*\(([^)]+)\)$/);
  if (withDetail && nameSays(name, withDetail[1] ?? '')) return withDetail[2] ?? '';
  return equipment;
}

function pressRowSummary(row: PressProfileRow): string {
  const name = pressProfileName(row);
  const process = row.operationType === ANY_PROCESS ? '' : pressProcessShort(row.operationType);
  const equipment = pressEquipmentFact(name, pressEquipmentLabel(row.pressEquipment));
  const settings = pressProfileSummary(row).replace(/none — press bare/g, 'bare');
  return [nameSays(name, process) ? '' : process, equipment, settings].filter(Boolean).join(' · ');
}

type ProfileSelection = { kind: 'machine' | 'press'; key: string } | null;

// The row stays readable inside a disabled release fieldset: opening it is a read action, so the
// full-width disclosure target is a span rather than a native button. Delete remains a real button
// and therefore stays disabled on a released card.
function ProfileRow({
  open,
  machine,
  glyph,
  name,
  summary,
  title,
  editorId,
  invalid,
  onToggle,
  onRemove,
  removeLabel,
}: {
  open: boolean;
  machine?: boolean;
  glyph?: ReactNode;
  name: string;
  summary: string;
  title: string;
  editorId: string;
  invalid: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <Row
      tone={invalid ? 'error' : 'default'}
      className='group relative w-full items-start border-b-0 py-2 [&>span:first-child]:flex-1'
      label={
        <span className='flex w-full min-w-0 items-start gap-2'>
          <span
            role='button'
            tabIndex={0}
            aria-expanded={open}
            aria-controls={editorId}
            onClick={onToggle}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle();
              }
            }}
            title={title}
            className='absolute inset-0 z-10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
          />
          {machine && (
            <span className='pointer-events-none relative z-0 flex min-h-4 w-10 shrink-0 items-center'>
              {glyph}
            </span>
          )}
          <span className='grid min-w-0 flex-1 grid-cols-1 gap-x-2 gap-y-0.5 sm:grid-cols-3'>
            <Text
              size='micro'
              component='span'
              className='pointer-events-none relative z-0 font-bold uppercase'
            >
              {name}
            </Text>
            <Text
              size='micro'
              variant={invalid ? 'error' : 'label'}
              component='span'
              className='pointer-events-none relative z-0 min-w-0 whitespace-normal break-words sm:col-span-2'
            >
              {summary}
            </Text>
          </span>
          <span className='pointer-events-none relative z-20 flex shrink-0 items-center gap-4'>
            <Close
              size='sm'
              aria-label={removeLabel}
              onClick={onRemove}
              className='pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:opacity-100'
            />
            <span className='pointer-events-none flex size-4 items-center justify-center'>
              <FoldCaret open={open} className='ml-0' />
            </span>
          </span>
        </span>
      }
    />
  );
}

// ── WALKING THE SELECTION TO A FAILING ROW ───────────────────────────────────────────────────────
//
// Only the SELECTED profile renders its controls, so a violation pinned at
// `construction.equipment_defaults.machines[2].thread_count` — by the schema's band checks or by the
// server — is otherwise an INVISIBLE BLOCKER: the save stops working, and the card's error router
// calls revealField on a field that is not in the DOM. (It retries for a few frames, which is
// exactly long enough for this to mount and nowhere near long enough for a human to find the row.)
//
// DRIVEN BY submitCount, not by «which index is first» — the same rule, and the same reason, as the
// operations rail. A second failed save on the same row leaves the first failing INDEX unchanged, so
// an effect keyed on that index alone never fires again once the operator has wandered off to
// another profile, and every reveal from then on misses. Between saves (a server-pinned violation
// arriving on its own) the selection only moves when a NEW error appeared and the open row is clean:
// otherwise deleting a row would yank the editor away from what somebody is typing.
const NO_ERRORS: unknown[] = [];

function useRevealFailingRow(
  keys: string[],
  rowErrors: unknown[],
  submitCount: number,
  selected: string | null,
  setSelected: (key: string) => void,
) {
  const failing = useMemo(() => {
    const set = new Set<number>();
    rowErrors.forEach((e, i) => {
      if (e) set.add(i);
    });
    return set;
  }, [rowErrors]);
  const first = failing.size > 0 ? Math.min(...failing) : -1;
  const prevSubmit = useRef(submitCount);
  // ZERO, NOT `failing.size`, AND THIS IS THE WHOLE FIRST-FAILED-SAVE CASE. CARD DEFAULTS is folded
  // by default, so on the usual failure this list does not exist yet: ConstructionField sees the
  // error, opens the accordion, and only then does any of this mount — one render AFTER the submit
  // that caused it. Seeded with the current size, the first effect run would find nothing «new» and
  // nothing «submitted» (the count was already incremented before mount), select no row, and the
  // error router would spend its retries on a control that never appears. Seeded with 0, mounting
  // into an error IS the appearance.
  const prevFailing = useRef(0);
  useEffect(() => {
    const submitted = submitCount !== prevSubmit.current;
    const appeared = failing.size > prevFailing.current;
    prevSubmit.current = submitCount;
    prevFailing.current = failing.size;
    if (first < 0) return;
    const openIndex = keys.indexOf(selected ?? '');
    if (submitted || (appeared && !failing.has(openIndex))) setSelected(keys[first] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount, failing]);
}

// ── the machines list ────────────────────────────────────────────────────────────────────────────

function MachineProfiles({
  uses,
  operations,
  selection,
  setSelection,
}: {
  uses: Map<string, ProfileUse>;
  // Passed down rather than watched again: the parent already holds the subscription the counts
  // need, and a second `useWatch('operations')` here would re-render this list on every keystroke
  // in the assembly editor for the same data.
  operations: StepRow[];
  selection: ProfileSelection;
  setSelection: Dispatch<SetStateAction<ProfileSelection>>;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  // THE OWNER of the machine list. Everything that changes its SHAPE goes through this instance or
  // through a root setValue — never through a second useFieldArray somewhere else.
  const { fields, append, remove } = useFieldArray({ control, name: MACHINES });
  const rows = (useWatch({ control, name: MACHINES }) ?? []) as MachineProfileRow[];
  const [pending, setPending] = useState<PendingChange | null>(null);
  const selected = selection?.kind === 'machine' ? selection.key : null;
  const setSelected = (key: string) => setSelection({ kind: 'machine', key });

  // A field violation lands at `construction.equipmentDefaults.machines[i].<field>` — the schema
  // files its band checks there, and the server tags its refusals with the same path. Only the
  // SELECTED row renders its controls, so an error on any other row would be an invisible blocker:
  // the save stops working and the error router walks to a field that is not in the DOM. The tile
  // carries the mark, and the row that owns the first error selects itself.
  const { errors, submitCount } = useFormState({ control, name: MACHINES });
  const rowErrors = ((
    errors.construction as { equipmentDefaults?: { machines?: unknown[] } } | undefined
  )?.equipmentDefaults?.machines ?? NO_ERRORS) as Array<unknown>;
  const keys = rows.map((r, i) => rowKey(r.profileKey, i));
  useRevealFailingRow(keys, rowErrors, submitCount, selected, setSelected);

  // CHANGING WHAT A PROFILE IS DETACHES THE STEPS THAT NAMED IT AS SOMETHING ELSE. A step's
  // machine_profile_key pointing at a profile of a DIFFERENT machine type is a FieldViolation on the
  // server — two answers to one question — and it would refuse the whole card, naming a step that is
  // not even mounted (only the open one is). The step editor already applies exactly this rule to
  // the step it has on screen; doing it for the rest is the same rule, comprehensively, at the one
  // moment the divergence is created.
  //
  // IT IS NOT SILENT ANY MORE, and that was the defect: the detach is irreversible (putting the old
  // machine back does not put the keys back — they are gone from the form), it happens to steps on
  // another tab, and it took one click with no sentence anywhere. The delete beside it has always
  // asked, and asked the right question — not «how many point at this» but «what changes about what
  // the steps inherit» — so this goes through the same dialog rather than growing a second one.
  //
  // Read through getValues rather than the watched copy: this runs from an event, and the value it
  // must not miss is the one that was just written.
  const detachStepsOfOtherType = (profileKey: string, nextType: string) => {
    const ops = (getValues('operations') ?? []) as StepRow[];
    for (const i of machineStepsToDetach(ops, profileKey ?? '', nextType)) {
      setValue(`operations.${i}.machineProfileKey`, '', DIRTY);
    }
  };

  // `from` is the value the CONTROL WAS SHOWING when it was clicked, closed over by the render that
  // drew it — not re-read here, because by now the select has already written the new one and the
  // watched copy is a race with React's next render.
  const onMachineTypePicked = (rowIndex: number, from: string, to: string) => {
    if (from === to) return;
    const live = (getValues(MACHINES) ?? []) as MachineProfileRow[];
    const ops = (getValues('operations') ?? []) as StepRow[];
    const profileKey = live[rowIndex]?.profileKey ?? '';
    const impact = machineRetypeImpact(ops, live, rowIndex, from, to);
    const detaching = machineStepsToDetach(ops, profileKey, to).length;
    // Nothing inherits differently and nothing loses a pointer: there is no price to name, and a
    // dialog over every pick is how people learn to confirm without reading.
    if (impactTotal(impact) + detaching === 0) return;
    setPending({
      kind: 'retype',
      index: rowIndex,
      // Named by what it WAS: an unlabelled profile borrows its name from its machine, and naming
      // it after the machine it is being changed INTO would describe the wrong row.
      name: machineProfileName({ ...(live[rowIndex] ?? {}), machineType: from }),
      impact,
      detaching,
      from,
      to,
      drops: !to || to === NONE_MACHINE,
    });
  };

  return (
    <>
      <GroupLabel flush>machines</GroupLabel>

      {fields.length > 0 && (
        <div role='list'>
          {fields.map((f, i) => {
            const row = rows[i] ?? ({} as MachineProfileRow);
            const key = rowKey(row.profileKey, i);
            const use = uses.get((row.profileKey ?? '').trim()) ?? NO_USE;
            const name = machineProfileName(row);
            const bad = !row.machineType || row.machineType === NONE_MACHINE;
            const invalid = bad || !!rowErrors[i];
            const facts = machineRowSummary(row);
            const summary = bad
              ? 'no machine'
              : rowErrors[i]
                ? `fix fields${facts ? ` · ${facts}` : ''}`
                : facts || 'no settings';
            const open = key === selected;
            const editorId = `machine-profile-${i}`;
            return (
              <div key={f.id} role='listitem' className='border-b border-hairline last:border-b-0'>
                <ProfileRow
                  open={open}
                  machine
                  glyph={
                    <StitchPictogram
                      iso={stitchTypeNumber(row.machineType, row.threadCount)}
                      width={40}
                    />
                  }
                  name={name}
                  summary={summary}
                  invalid={invalid}
                  editorId={editorId}
                  title={[
                    name,
                    machineTypeLabel(row.machineType),
                    facts,
                    (row.note ?? '').trim(),
                    usesSentence(use),
                  ]
                    .filter(Boolean)
                    .join('\n')}
                  onToggle={() =>
                    setSelection((current) =>
                      current?.kind === 'machine' && current.key === key
                        ? null
                        : { kind: 'machine', key },
                    )
                  }
                  onRemove={() => {
                    const impact = machineRemovalImpact(operations, rows, i);
                    if (impactTotal(impact) === 0) {
                      remove(i);
                      if (open) setSelection(null);
                    } else {
                      setPending({ kind: 'remove', index: i, name, impact });
                    }
                  }}
                  removeLabel={`remove ${name}`}
                />

                {open && (
                  <div id={editorId} className='pb-2 pt-1'>
                    <div className={fieldGrid}>
                      {/* THE NAME IS NOT THE IDENTITY. Two overlocks may be called the same thing
                          and stay two machines; the key underneath is what every step points at. */}
                      <InputField
                        name={machineField(i, 'label')}
                        label='name (optional)'
                        maxLength={64}
                        placeholder='overlock by the window'
                      />
                      {/* NOT DISABLED BY «ALREADY USED»: two profiles of one type is ordinary. */}
                      <SelectField
                        name={machineField(i, 'machineType')}
                        label='machine'
                        items={machineTypeOptions}
                        onAfterChange={(v) =>
                          onMachineTypePicked(i, row.machineType ?? '', String(v ?? ''))
                        }
                        className={selectNoGrow}
                      />
                      <ProfileNumberField
                        name={machineField(i, 'threadCount')}
                        label='threads'
                        value={row.threadCount ?? 0}
                      />
                      <SelectField
                        name={machineField(i, 'needleType')}
                        label='needle point'
                        items={needleTypeOptions}
                        className={selectNoGrow}
                      />
                      <ProfileNumberField
                        name={machineField(i, 'needleSizeNm')}
                        label='needle size, Nm'
                        value={row.needleSizeNm ?? 0}
                        placeholder='90'
                      />
                      <SelectField
                        name={machineField(i, 'bedType')}
                        label='bed'
                        items={bedTypeOptions}
                        className={selectNoGrow}
                      />
                      <SelectField
                        name={machineField(i, 'automation')}
                        label='automation'
                        items={automationLevelOptions}
                        className={selectNoGrow}
                      />
                      <SelectField
                        name={machineField(i, 'threadTension')}
                        label='thread tension'
                        items={threadTensionOptions}
                        className={selectNoGrow}
                      />
                      {((row.threadTension ?? NONE_TENSION) !== NONE_TENSION ||
                        (row.threadTensionNote ?? '').trim() !== '') && (
                        <InputField
                          name={machineField(i, 'threadTensionNote')}
                          label='tension note'
                          maxLength={64}
                          placeholder='0.5 tighter, dial 4'
                        />
                      )}
                      <SelectField
                        name={machineField(i, 'attachmentKind')}
                        label='default foot'
                        items={attachmentOptions}
                        className={selectNoGrow}
                      />
                      <DecimalField
                        name={machineField(i, 'stitchesPerCm')}
                        label='stitch density (st/cm)'
                        maxDecimals={2}
                        placeholder='4'
                      />
                      <DecimalField
                        name={machineField(i, 'stitchWidthMm')}
                        label='stitch width, mm'
                        maxDecimals={1}
                        placeholder='2.5'
                      />
                      <InputField
                        name={machineField(i, 'note')}
                        label='note'
                        maxLength={255}
                        placeholder='Juki DDL-8700, table by the window'
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddDoor
        afterRows={fields.length > 0}
        onClick={() => {
          const row = { ...emptyMachineProfile, profileKey: ulid() };
          append(row);
          setSelected(row.profileKey);
        }}
      >
        machine
      </AddDoor>

      <ProfileChangeDialog
        pending={pending}
        what='machine'
        onCancel={() => {
          // Declining a RETYPE has to put the value back — the control already wrote the new one,
          // and leaving it there would apply the change the operator just refused, minus the
          // detach that makes it savable.
          if (pending?.kind === 'retype') {
            setValue(machineField(pending.index, 'machineType'), pending.from ?? '', DIRTY);
          }
          setPending(null);
        }}
        onConfirm={() => {
          if (pending?.kind === 'remove') remove(pending.index);
          if (pending?.kind === 'retype') {
            const key = ((getValues(MACHINES) ?? []) as MachineProfileRow[])[pending.index]
              ?.profileKey;
            detachStepsOfOtherType(key ?? '', pending.to ?? '');
          }
          setPending(null);
        }}
      />
    </>
  );
}

// ── the pressing list ────────────────────────────────────────────────────────────────────────────

function PressProfiles({
  uses,
  operations,
  selection,
  setSelection,
}: {
  uses: Map<string, ProfileUse>;
  operations: StepRow[];
  selection: ProfileSelection;
  setSelection: Dispatch<SetStateAction<ProfileSelection>>;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: PRESSES });
  const rows = (useWatch({ control, name: PRESSES }) ?? []) as PressProfileRow[];
  const [pending, setPending] = useState<PendingChange | null>(null);
  const selected = selection?.kind === 'press' ? selection.key : null;
  const setSelected = (key: string) => setSelection({ kind: 'press', key });

  const { errors, submitCount } = useFormState({ control, name: PRESSES });
  const rowErrors = ((
    errors.construction as { equipmentDefaults?: { presses?: unknown[] } } | undefined
  )?.equipmentDefaults?.presses ?? NO_ERRORS) as Array<unknown>;
  const keys = rows.map((r, i) => rowKey(r.profileKey, i));
  useRevealFailingRow(keys, rowErrors, submitCount, selected, setSelected);

  // The ВТО twin of the machine rule above, and narrower in exactly one way: the server refuses a
  // press key only on the EQUIPMENT (resolveProfileKey), so only an equipment change has to clear
  // the references. Changing which PROCESS a mode is written for keeps them — the key is legal and
  // stays visible — but it is NOT nothing: since the ladder applies the process at both rungs
  // (resolvePressProfile, matching the server's sign-off gate), such a step stops inheriting the
  // mode's temperature and dwell, and the picker marks its choice as «— fusing only». The dialog
  // below covers the equipment change; the process change is visible in the step's own picker.
  const detachStepsOfOtherEquipment = (profileKey: string, nextEquipment: string) => {
    const ops = (getValues('operations') ?? []) as StepRow[];
    for (const i of pressStepsToDetach(ops, profileKey ?? '', nextEquipment)) {
      setValue(`operations.${i}.pressProfileKey`, '', DIRTY);
    }
  };

  // Same shape as the machine twin: `from` is the value the control was showing, closed over by the
  // render that drew it.
  const onPressEquipmentPicked = (rowIndex: number, from: string, to: string) => {
    if (from === to) return;
    const live = (getValues(PRESSES) ?? []) as PressProfileRow[];
    const ops = (getValues('operations') ?? []) as StepRow[];
    const profileKey = live[rowIndex]?.profileKey ?? '';
    const impact = pressReequipImpact(ops, live, rowIndex, from, to);
    // Counted apart from the impact ON PURPOSE — this is the axis where the two come apart: a step
    // naming a mode written for another process inherits nothing from it already, so re-equipping
    // that mode changes no value while still erasing the pick that step visibly holds.
    const detaching = pressStepsToDetach(ops, profileKey, to).length;
    if (impactTotal(impact) + detaching === 0) return;
    setPending({
      kind: 'retype',
      index: rowIndex,
      name: pressProfileName({ ...(live[rowIndex] ?? {}), pressEquipment: from }),
      impact,
      detaching,
      from,
      to,
      drops: !to || to === NONE_PRESS_EQUIPMENT,
    });
  };

  return (
    <>
      <GroupLabel>pressing modes</GroupLabel>

      {fields.length > 0 && (
        <div role='list'>
          {fields.map((f, i) => {
            const row = rows[i] ?? ({} as PressProfileRow);
            const key = rowKey(row.profileKey, i);
            const use = uses.get((row.profileKey ?? '').trim()) ?? NO_USE;
            const name = pressProfileName(row);
            const bad = !row.pressEquipment || row.pressEquipment === NONE_PRESS_EQUIPMENT;
            const invalid = bad || !!rowErrors[i];
            const facts = pressRowSummary(row);
            const summary = bad
              ? 'no equipment'
              : rowErrors[i]
                ? `fix fields${facts ? ` · ${facts}` : ''}`
                : facts || 'no settings';
            const process = pressProcessShort(row.operationType);
            const open = key === selected;
            const editorId = `press-profile-${i}`;
            return (
              <div key={f.id} role='listitem' className='border-b border-hairline last:border-b-0'>
                <ProfileRow
                  open={open}
                  name={name}
                  summary={summary}
                  invalid={invalid}
                  editorId={editorId}
                  title={[
                    name,
                    pressEquipmentLabel(row.pressEquipment),
                    process === 'any pressing step' ? '' : process,
                    facts,
                    (row.note ?? '').trim(),
                    usesSentence(use),
                  ]
                    .filter(Boolean)
                    .join('\n')}
                  onToggle={() =>
                    setSelection((current) =>
                      current?.kind === 'press' && current.key === key
                        ? null
                        : { kind: 'press', key },
                    )
                  }
                  onRemove={() => {
                    const impact = pressRemovalImpact(operations, rows, i);
                    if (impactTotal(impact) === 0) {
                      remove(i);
                      if (open) setSelection(null);
                    } else {
                      setPending({ kind: 'remove', index: i, name, impact });
                    }
                  }}
                  removeLabel={`remove ${name}`}
                />

                {open && (
                  <div id={editorId} className='pb-2 pt-1'>
                    <div className={fieldGrid}>
                      <InputField
                        name={pressField(i, 'label')}
                        label='name (optional)'
                        maxLength={64}
                        placeholder='fusing press'
                      />
                      <SelectField
                        name={pressField(i, 'pressEquipment')}
                        label='equipment'
                        items={pressEquipmentOptions}
                        onAfterChange={(v) =>
                          onPressEquipmentPicked(i, row.pressEquipment ?? '', String(v ?? ''))
                        }
                        className={selectNoGrow}
                      />
                      <SelectField
                        name={pressField(i, 'operationType')}
                        label='for which step'
                        items={pressProfileProcessOptions}
                        className={selectNoGrow}
                      />
                      <ProfileNumberField
                        name={pressField(i, 'pressTemperatureC')}
                        label='temperature, °C'
                        value={row.pressTemperatureC ?? 0}
                        placeholder='145'
                      />
                      <ProfileNumberField
                        name={pressField(i, 'pressDwellSec')}
                        label='dwell, sec'
                        value={row.pressDwellSec ?? 0}
                        placeholder='12'
                      />
                      <DecimalField
                        name={pressField(i, 'pressPressureNCm2')}
                        label='pressure, N/cm²'
                        maxDecimals={1}
                        placeholder='4'
                      />
                      <ProfileSteamField name={pressField(i, 'pressSteam')} />
                      <SelectField
                        name={pressField(i, 'pressCloth')}
                        label='press cloth'
                        items={pressClothOptions}
                        className={selectNoGrow}
                      />
                      <InputField
                        name={pressField(i, 'note')}
                        label='note'
                        maxLength={255}
                        placeholder='lower buck, no steam'
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddDoor
        afterRows={fields.length > 0}
        onClick={() => {
          const row = { ...emptyPressProfile, profileKey: ulid() };
          append(row);
          setSelected(row.profileKey);
        }}
      >
        press mode
      </AddDoor>

      <ProfileChangeDialog
        pending={pending}
        what='equipment'
        onCancel={() => {
          if (pending?.kind === 'retype') {
            setValue(pressField(pending.index, 'pressEquipment'), pending.from ?? '', DIRTY);
          }
          setPending(null);
        }}
        onConfirm={() => {
          if (pending?.kind === 'remove') remove(pending.index);
          if (pending?.kind === 'retype') {
            const key = ((getValues(PRESSES) ?? []) as PressProfileRow[])[pending.index]
              ?.profileKey;
            detachStepsOfOtherEquipment(key ?? '', pending.to ?? '');
          }
          setPending(null);
        }}
      />
    </>
  );
}

// How a profile's references read in a sentence, for the tooltip and the delete warning. The two
// halves are different kinds of loss and are named apart.
function usesSentence(u: ProfileUse): string {
  const parts: string[] = [];
  if (u.byKey > 0)
    parts.push(`${u.byKey} ${u.byKey === 1 ? 'step references' : 'steps reference'} it explicitly`);
  if (u.byType > 0) parts.push(`${u.byType} inherit it by equipment type`);
  return parts.length ? `in use: ${parts.join(', ')}` : 'no step inherits it';
}

// ══ THE BLOCK ══════════════════════════════════════════════════════════════════════════════════

export function EquipmentParkField() {
  const { control } = useFormContext<TechCardFormData>();
  const [selection, setSelection] = useState<ProfileSelection>(null);
  // The counts read the steps, so this subscription re-renders the park on every keystroke in the
  // assembly editor — the same cost, for the same reason, that ConstructionSummary already pays. It
  // is scoped to this leaf and only exists while CARD DEFAULTS is unfolded.
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as StepRow[];
  const machines = (useWatch({ control, name: MACHINES }) ?? []) as MachineProfileRow[];
  const presses = (useWatch({ control, name: PRESSES }) ?? []) as PressProfileRow[];
  const uses = useMemo(
    () => countProfileUses(operations, machines, presses),
    [operations, machines, presses],
  );

  return (
    <div className='mt-3'>
      <MachineProfiles
        uses={uses.machines}
        operations={operations}
        selection={selection}
        setSelection={setSelection}
      />
      <PressProfiles
        uses={uses.presses}
        operations={operations}
        selection={selection}
        setSelection={setSelection}
      />
    </div>
  );
}

// The change is CONFIRMED, never blocked — in both of its shapes. A profile the floor no longer
// has, or a machine that turned out to be a different machine, is a fact about the floor, and a card
// that could not record it would be lying to keep a reference tidy. The dialog names the price and
// nothing else: there is no path here that refuses an edit.
//
// It is rendered by each list rather than above them, so a delete can go through that list's OWN
// `remove(i)` — which shifts the row-indexed error array along with the values. A root setValue
// would leave the errors where they were, and the tile marks would point one row off until the next
// failed save.
function ProfileChangeDialog({
  pending,
  what,
  onCancel,
  onConfirm,
}: {
  pending: PendingChange | null;
  /** what a retype changes, in the accusative: «машинку» / «оборудование». */
  what: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const impact = pending?.impact ?? { losing: 0, gaining: 0 };
  const retype = pending?.kind === 'retype';
  const detaching = pending?.detaching ?? 0;
  return (
    <ConfirmationModal
      open={!!pending}
      onOpenChange={(o) => !o && onCancel()}
      onConfirm={onConfirm}
      onCancel={onCancel}
      title={retype ? `change the ${what} of this profile?` : 'delete the equipment profile?'}
      confirmLabel={retype ? 'change' : 'delete'}
      width='sm'
      // `false`, AND IT IS LOAD-BEARING HERE rather than a preference. The shell's auto-close calls
      // `onOpenChange(false)` right after `onConfirm()`, and this dialog routes that through
      // onCancel — which for a retype PUTS THE OLD VALUE BACK. Left at the default, pressing
      // “change” would detach the references and then silently restore the machine, i.e. do the
      // one half of the change that cannot be undone and none of the half that was asked for. The
      // dialog closes anyway: `open` is derived from `pending`, and both handlers clear it. (Radix
      // fires onOpenChange only for ESC / overlay / ✕ — every one of which IS a decline.)
      closeOnConfirm={false}
    >
      <div className='flex flex-col gap-2'>
        {/* The lead does not promise «inheritance» on a retype: a change may cost only the explicit
            references (see `detaching`), and a heading naming the wrong loss is worse than a plain
            one. */}
        <Text size='micro'>
          {retype
            ? `“${pending?.name}” — here is what this changes:`
            : `“${pending?.name}” — this changes what the steps inherit:`}
        </Text>
        {/* THE HALF THAT MAKES A RETYPE WORSE THAN A DELETE: a deleted profile leaves its key in the
            step, visible as «profile not found» and re-assignable. A retype CLEARS those keys, and
            putting the old value back does not put them back — the form no longer holds them.
            Counted separately from the two below because it does not always come with them. */}
        {retype && detaching > 0 && (
          <Text size='micro'>
            {detaching} {detaching === 1 ? 'step referenced' : 'steps referenced'} it explicitly and
            will LOSE that reference: the server doesn't accept a profile of another type. putting
            the old value back later does not bring the references back — they have to be set again.
          </Text>
        )}
        {/* «Not set» is a delete in all but name: the mapper drops a row with no type from the
            payload, so the profile disappears on save without ever passing the delete dialog. */}
        {retype && pending?.drops && (
          <Text size='micro'>
            “not set” is a delete as well: a profile with no type never travels to the server, so on
            save it disappears from the card.
          </Text>
        )}
        {/* «станет not set» would be the overstatement: the density has a rung BELOW the profile
            (construction.defaultStitchesPerCm), so some fields fall back rather than empty out. */}
        {impact.losing > 0 && (
          <Text size='micro'>
            {impact.losing} {impact.losing === 1 ? 'step stops' : 'steps stop'} inheriting this
            profile — their empty fields fall back to the card defaults, and where there is no
            default they become “not set”.
          </Text>
        )}
        {/* THE HALF NOBODY EXPECTS, and the reason this dialog is computed rather than counted:
            deleting one of two overlocks leaves the other alone in its class, and a step that
            inherited NOTHING (because «the overlock» was not an answer) starts inheriting it. */}
        {impact.gaining > 0 && (
          <Text size='micro'>
            {impact.gaining} {impact.gaining === 1 ? 'step' : 'steps'}, on the contrary, WILL START
            inheriting the remaining profile of this equipment — right now the choice is ambiguous,
            and they inherit nothing.
          </Text>
        )}
        {/* The reference paragraph is conditional TWICE. On a change that only GIVES steps something
            (the two-overlocks case above) nothing was ever pointed at this row, and explaining how
            broken references look would describe a thing that is not happening. And it is a DELETE's
            sentence only: a delete leaves the key in the step to be seen and re-assigned, a retype
            clears it — that is the paragraph above, and printing both would say two things. */}
        {!retype && impact.losing > 0 && (
          <Text size='micro' variant='label'>
            an explicit reference stays visible in the step (“profile not found”) — it can be seen
            and re-assigned; inheritance by equipment type breaks silently.
          </Text>
        )}
        <Text size='micro' variant='label'>
          the steps themselves are neither deleted nor broken, and saving the card isn't blocked.
        </Text>
      </div>
    </ConfirmationModal>
  );
}

// ══ «SET AS CARD PROFILE» ══════════════════════════════════════════════════════════════════════
//
// THE STEP EDITOR RENDERS IT, THIS MODULE OWNS IT — because pressing it writes into the very arrays
// the two lists above hold in `useFieldArray`, and a write that does not go through the root (or a
// leaf) leaves a mounted list showing a profile list that no longer exists. That rule is written
// once, here, next to the only other code that mutates these arrays.
//
// WHAT IT MEANS. The technologist typed settings into a step and then decided they are not this
// step's exception but the card's normal. So the values MOVE: they are written into the profile (an
// existing one for that equipment, or a new one) and CLEARED from the step. They are deliberately
// NOT copied back into the step's fields — a blank field that inherits is the entire difference
// between «the technologist chose 4 threads» and «it defaulted to 4», and the next step on the same
// machine now picks the value up as a placeholder instead of being typed out again.
//
// AN INHERITED VALUE NEVER TRAVELS. Only what the step itself STATES is moved: a blank field is
// already answered by some profile, and copying today's answer into a new one would freeze it.

type MachineAdoptable = {
  machineType: string;
  machineProfileKey: string;
  threadCount: number;
  needleType: string;
  needleSizeNm: number;
  threadTension: string;
  threadTensionNote: string;
  stitchWidthMm: string;
  stitchesPerCm: string;
  attachmentKind: string;
  attachmentSizeMm: string;
};

type PressAdoptable = {
  operationType: string;
  pressEquipment: string;
  pressProfileKey: string;
  pressTemperatureC: number;
  pressDwellSec: number;
  pressPressureNCm2: string;
  pressSteam: boolean | undefined;
  pressCloth: string;
};

// WHICH PROFILE THE PRESS WOULD LAND IN — one function, because the LABEL has to promise what the
// CLICK will do and the two used to disagree on exactly one input: a dangling key.
//
// A DANGLING KEY IS NOT A DECISION ANY MORE, and nowhere does that matter more than here. The ladder
// short-circuits on a named key, so a step still pointing at a profile somebody deleted resolves to
// NOTHING — and taken at face value that would send these settings into a BRAND-NEW second profile
// of a type the card already has one of, which is the one move that makes every OTHER step of that
// type stop inheriting (two overlocks are not «the overlock»). It would also label the button «make
// card profile» over a click that quietly patches a profile several steps share. The server detaches
// such a key on the next save regardless; consolidating settings is exactly the moment to do it a
// beat earlier, so the values land in the profile that is actually there.
//
// (`effectiveKey` is handed back so the caller can re-ask the ladder after inserting a row.)
function machineAdoptTarget(rows: MachineProfileRow[], machineType: string, profileKey: string) {
  const named = (profileKey ?? '').trim();
  const dangling = !!named && !rows.some((m) => (m.profileKey ?? '').trim() === named);
  const effectiveKey = dangling ? '' : named;
  return { dangling, effectiveKey, target: resolveMachineProfile(rows, machineType, effectiveKey) };
}

function pressAdoptTarget(
  rows: PressProfileRow[],
  pressEquipment: string,
  profileKey: string,
  stepType: string,
) {
  const named = (profileKey ?? '').trim();
  const dangling = !!named && !rows.some((p) => (p.profileKey ?? '').trim() === named);
  const effectiveKey = dangling ? '' : named;
  return {
    dangling,
    effectiveKey,
    target: resolvePressProfile(rows, pressEquipment, effectiveKey, stepType),
  };
}

// WHAT THIS STEP STATES that a machine profile can hold. `undefined` = the step is silent about it.
function machineTakes(s: MachineAdoptable) {
  const tensionSet = s.threadTension !== NONE_TENSION;
  return {
    threadCount: s.threadCount > 0 ? s.threadCount : undefined,
    needleType: s.needleType !== NONE_NEEDLE ? s.needleType : undefined,
    needleSizeNm: s.needleSizeNm > 0 ? s.needleSizeNm : undefined,
    threadTension: tensionSet ? s.threadTension : undefined,
    // Only ever alongside the scale it explains: the server refuses a note with no tension, and a
    // note moved without its scale would be refused on the profile instead of on the step.
    threadTensionNote:
      tensionSet && s.threadTensionNote.trim() ? s.threadTensionNote.trim() : undefined,
    stitchWidthMm: s.stitchWidthMm.trim() || undefined,
    stitchesPerCm: s.stitchesPerCm.trim() || undefined,
    // THE FOOT MOVES ONLY WHEN NOTHING IS MEASURED AGAINST IT. `attachmentSizeMm` has no counterpart
    // on a profile, and it is legal only beside a foot that is neither UNKNOWN nor NONE — so
    // clearing the kind out from under a size would not merely strand the size, it would trip the
    // step editor's own «bare foot clears the size» effect and silently delete a number somebody
    // typed. The pair stays on the step; everything else still moves.
    attachmentKind:
      !s.attachmentSizeMm.trim() && s.attachmentKind !== NONE_ATTACHMENT
        ? s.attachmentKind
        : undefined,
  };
}

function pressTakes(s: PressAdoptable) {
  return {
    pressTemperatureC: s.pressTemperatureC > 0 ? s.pressTemperatureC : undefined,
    pressDwellSec: s.pressDwellSec > 0 ? s.pressDwellSec : undefined,
    pressPressureNCm2: s.pressPressureNCm2.trim() || undefined,
    // `false` IS a value here — «press it dry» is an instruction, and only `undefined` is silence.
    pressSteam: s.pressSteam,
    pressCloth: s.pressCloth !== NONE_PRESS_CLOTH ? s.pressCloth : undefined,
  };
}

const countTakes = (takes: Record<string, unknown>) =>
  Object.values(takes).filter((v) => v !== undefined).length;

export function AdoptMachineIntoProfile({
  index,
  step,
}: {
  index: number;
  step: MachineAdoptable;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const machines = (useWatch({ control, name: MACHINES }) ?? []) as MachineProfileRow[];
  const { target } = machineAdoptTarget(machines, step.machineType, step.machineProfileKey);
  const takes = machineTakes(step);
  const moving = countTakes(takes);
  const noMachine = !step.machineType || step.machineType === NONE_MACHINE;

  const apply = () => {
    const rows = (getValues(MACHINES) ?? []) as MachineProfileRow[];
    // RE-RESOLVED against the live array and located BY IDENTITY. Not by `profileKey`: a row whose
    // key is somehow blank would make `findIndex` match the first blank row rather than the one the
    // ladder picked, and patching the wrong profile is a silent, unrecoverable edit. `indexOf` over
    // the very array the resolver read cannot be wrong. Re-resolving also closes the gap between
    // render and click — the park is editable on the same screen.
    const {
      dangling,
      effectiveKey,
      target: hit,
    } = machineAdoptTarget(rows, step.machineType, step.machineProfileKey);
    const at = hit ? rows.indexOf(hit) : -1;
    const s = `operations.${index}` as const;

    if (at >= 0) {
      // AN EXISTING PROFILE IS PATCHED FIELD BY FIELD — leaf writes, which need no array broadcast
      // and leave the row identity (and every step's reference to it) untouched.
      const p = `${MACHINES}.${at}` as const;
      if (takes.threadCount !== undefined) setValue(`${p}.threadCount`, takes.threadCount, DIRTY);
      if (takes.needleType !== undefined) setValue(`${p}.needleType`, takes.needleType, DIRTY);
      if (takes.needleSizeNm !== undefined)
        setValue(`${p}.needleSizeNm`, takes.needleSizeNm, DIRTY);
      if (takes.threadTension !== undefined) {
        // THE SCALE AND ITS NOTE MOVE AS ONE. Leaving the profile's old note under a new scale is
        // the worst of the three options: «tighter — dial 4» becoming «looser — dial 4» reads as a
        // measured instruction and is a настройка nobody gave. So the note is replaced whenever the
        // scale actually CHANGES (with the step's note, or with nothing); a scale that is merely
        // confirmed keeps the qualifier it already had.
        const scaleChanged = (hit?.threadTension ?? '') !== takes.threadTension;
        setValue(`${p}.threadTension`, takes.threadTension, DIRTY);
        if (takes.threadTensionNote !== undefined) {
          setValue(`${p}.threadTensionNote`, takes.threadTensionNote, DIRTY);
        } else if (scaleChanged) {
          setValue(`${p}.threadTensionNote`, '', DIRTY);
        }
      }
      if (takes.stitchWidthMm !== undefined)
        setValue(`${p}.stitchWidthMm`, takes.stitchWidthMm, DIRTY);
      if (takes.stitchesPerCm !== undefined)
        setValue(`${p}.stitchesPerCm`, takes.stitchesPerCm, DIRTY);
      if (takes.attachmentKind !== undefined)
        setValue(`${p}.attachmentKind`, takes.attachmentKind, DIRTY);
      // The broken pointer goes with it: the profile it named is gone, this one was reached by type,
      // and leaving the key would have the step resolve to nothing while its settings sat in a
      // profile it cannot see.
      if (dangling) setValue(`${s}.machineProfileKey`, '', DIRTY);
    } else {
      // A NEW PROFILE. The key is minted here, exactly as a BOM line's is, and the row goes in
      // through the array ROOT — the only write a mounted CARD DEFAULTS list re-syncs from.
      const row: MachineProfileRow = {
        ...emptyMachineProfile,
        profileKey: ulid(),
        machineType: step.machineType,
      };
      if (takes.threadCount !== undefined) row.threadCount = takes.threadCount;
      if (takes.needleType !== undefined) row.needleType = takes.needleType;
      if (takes.needleSizeNm !== undefined) row.needleSizeNm = takes.needleSizeNm;
      if (takes.threadTension !== undefined) row.threadTension = takes.threadTension;
      if (takes.threadTensionNote !== undefined) row.threadTensionNote = takes.threadTensionNote;
      if (takes.stitchWidthMm !== undefined) row.stitchWidthMm = takes.stitchWidthMm;
      if (takes.stitchesPerCm !== undefined) row.stitchesPerCm = takes.stitchesPerCm;
      if (takes.attachmentKind !== undefined) row.attachmentKind = takes.attachmentKind;
      const next = [...rows, row];
      setValue(MACHINES, next, DIRTY);
      // AND THE STEP HAS TO END UP RESOLVING TO IT. Asked of the ladder itself rather than guessed:
      // with another machine of this type already on the card the by-type rung answers NOTHING (two
      // overlocks are not «the overlock»), and a key the step already carried may point at a profile
      // that no longer exists. In both cases the values would have left the step and arrived
      // nowhere, so the step names the new profile explicitly.
      const resolved = resolveMachineProfile(next, step.machineType, effectiveKey);
      if (dangling || resolved?.profileKey !== row.profileKey) {
        setValue(`${s}.machineProfileKey`, row.profileKey, DIRTY);
      }
    }

    // THE STEP GIVES THEM UP — the single place this form clears something the operator typed that
    // is not a hidden control being tidied away. It is deliberate: they did not lose the values,
    // they promoted them, and a field that keeps its copy would go on reading as «this step
    // differs» over a step that is now exactly standard.
    if (takes.threadCount !== undefined) setValue(`${s}.threadCount`, 0, DIRTY);
    if (takes.needleType !== undefined) setValue(`${s}.needleType`, NONE_NEEDLE, DIRTY);
    if (takes.needleSizeNm !== undefined) setValue(`${s}.needleSizeNm`, 0, DIRTY);
    if (takes.threadTension !== undefined) {
      setValue(`${s}.threadTension`, NONE_TENSION, DIRTY);
      setValue(`${s}.threadTensionNote`, '', DIRTY);
    }
    if (takes.stitchWidthMm !== undefined) setValue(`${s}.stitchWidthMm`, '', DIRTY);
    if (takes.stitchesPerCm !== undefined) setValue(`${s}.stitchesPerCm`, '', DIRTY);
    if (takes.attachmentKind !== undefined) setValue(`${s}.attachmentKind`, NONE_ATTACHMENT, DIRTY);
  };

  return (
    <AdoptChip
      disabled={noMachine || moving === 0}
      updating={!!target}
      targetName={target ? machineProfileName(target) : ''}
      moving={moving}
      reason={
        noMachine
          ? 'pick the machine first — a card profile has to say what it is'
          : moving === 0
            ? 'nothing to promote: every setting here is already inherited'
            : ''
      }
      onClick={apply}
    />
  );
}

export function AdoptPressIntoProfile({ index, step }: { index: number; step: PressAdoptable }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const presses = (useWatch({ control, name: PRESSES }) ?? []) as PressProfileRow[];
  const { target } = pressAdoptTarget(
    presses,
    step.pressEquipment,
    step.pressProfileKey,
    step.operationType,
  );
  const takes = pressTakes(step);
  const moving = countTakes(takes);
  const noEquipment = !step.pressEquipment || step.pressEquipment === NONE_PRESS_EQUIPMENT;

  const apply = () => {
    const rows = (getValues(PRESSES) ?? []) as PressProfileRow[];
    // By identity off a fresh resolve, and a dangling key demoted to «no key» — see the machine twin
    // for both arguments.
    const {
      dangling,
      effectiveKey,
      target: hit,
    } = pressAdoptTarget(rows, step.pressEquipment, step.pressProfileKey, step.operationType);
    const at = hit ? rows.indexOf(hit) : -1;
    const s = `operations.${index}` as const;

    if (at >= 0) {
      const p = `${PRESSES}.${at}` as const;
      if (takes.pressTemperatureC !== undefined)
        setValue(`${p}.pressTemperatureC`, takes.pressTemperatureC, DIRTY);
      if (takes.pressDwellSec !== undefined)
        setValue(`${p}.pressDwellSec`, takes.pressDwellSec, DIRTY);
      if (takes.pressPressureNCm2 !== undefined)
        setValue(`${p}.pressPressureNCm2`, takes.pressPressureNCm2, DIRTY);
      if (takes.pressSteam !== undefined) setValue(`${p}.pressSteam`, takes.pressSteam, DIRTY);
      if (takes.pressCloth !== undefined) setValue(`${p}.pressCloth`, takes.pressCloth, DIRTY);
      if (dangling) setValue(`${s}.pressProfileKey`, '', DIRTY);
    } else {
      const row: PressProfileRow = {
        ...emptyPressProfile,
        profileKey: ulid(),
        pressEquipment: step.pressEquipment,
        // FOR THE PROCESS THIS STEP IS, not «any»: 145 °C for twelve seconds is an answer about
        // dublirovanie, and offering it as the card's default for разутюжка would be a настройка
        // nobody gave. A universal mode stays reachable — the profile's own picker says «any».
        operationType: step.operationType,
      };
      if (takes.pressTemperatureC !== undefined) row.pressTemperatureC = takes.pressTemperatureC;
      if (takes.pressDwellSec !== undefined) row.pressDwellSec = takes.pressDwellSec;
      if (takes.pressPressureNCm2 !== undefined) row.pressPressureNCm2 = takes.pressPressureNCm2;
      if (takes.pressSteam !== undefined) row.pressSteam = takes.pressSteam;
      if (takes.pressCloth !== undefined) row.pressCloth = takes.pressCloth;
      const next = [...rows, row];
      setValue(PRESSES, next, DIRTY);
      const resolved = resolvePressProfile(
        next,
        step.pressEquipment,
        effectiveKey,
        step.operationType,
      );
      if (dangling || resolved?.profileKey !== row.profileKey) {
        setValue(`${s}.pressProfileKey`, row.profileKey, DIRTY);
      }
    }

    if (takes.pressTemperatureC !== undefined) setValue(`${s}.pressTemperatureC`, 0, DIRTY);
    if (takes.pressDwellSec !== undefined) setValue(`${s}.pressDwellSec`, 0, DIRTY);
    if (takes.pressPressureNCm2 !== undefined) setValue(`${s}.pressPressureNCm2`, '', DIRTY);
    if (takes.pressSteam !== undefined) setValue(`${s}.pressSteam`, undefined, DIRTY);
    if (takes.pressCloth !== undefined) setValue(`${s}.pressCloth`, NONE_PRESS_CLOTH, DIRTY);
  };

  return (
    <AdoptChip
      disabled={noEquipment || moving === 0}
      updating={!!target}
      targetName={target ? pressProfileName(target) : ''}
      moving={moving}
      reason={
        noEquipment
          ? 'pick the equipment first — a card profile has to say what it is'
          : moving === 0
            ? 'nothing to promote: every setting here is already inherited'
            : ''
      }
      onClick={apply}
    />
  );
}

// One affordance for both axes. The label says which of the two things the press will do, because
// «update» touches a profile OTHER STEPS ALSO INHERIT and «create» does not — and the tooltip says
// so in as many words rather than hiding it behind a confirmation nobody would read twice.
function AdoptChip({
  disabled,
  updating,
  targetName,
  moving,
  reason,
  onClick,
}: {
  disabled: boolean;
  updating: boolean;
  targetName: string;
  moving: number;
  reason: string;
  onClick: () => void;
}) {
  const what = updating ? `update «${targetName}»` : 'make card profile';
  // THE TOOLTIP PROMISES ONLY WHAT IS CERTAIN. «The next step of this machine will pick them up» was
  // the first wording and it is false whenever the card holds two profiles of the type: an unnamed
  // step stays ambiguous and inherits nothing at all. What IS certain is that this step will inherit
  // them, and that anything else already resolving to that profile moves with it.
  const promise = updating
    ? `${moving} ${moving === 1 ? 'setting moves' : 'settings move'} into profile “${targetName}” and clear in the step: it starts inheriting them. steps that already inherit this profile will see the new values.`
    : `${moving} ${moving === 1 ? 'setting moves' : 'settings move'} into a new card profile and clear in the step: it starts inheriting them instead of holding its own copy.`;
  return (
    <Chip quiet disabled={disabled} onClick={onClick} title={reason || promise}>
      {what}
    </Chip>
  );
}
