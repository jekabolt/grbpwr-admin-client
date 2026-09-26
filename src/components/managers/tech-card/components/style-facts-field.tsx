import { adminService } from 'api/api';
import { common_CareEntry } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useModel } from 'components/managers/models/components/useModelQuery';
import { CareSymbol } from 'components/managers/product/components/care/care-card';
import { careCodes } from 'components/managers/product/components/care/care-codes';
import { CarePicker } from 'components/managers/product/components/care/care-picker';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  get,
  set,
  useFormContext,
  useFormState,
  useWatch,
  type FieldValues,
} from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
import { useCareDrift, type CareDrift } from './care-drift';
import { FIT_KEYS, fitChoicesFor, fitLabel } from './design/fit-vocabulary';
import { emptyLabel } from './labels-field';
import { TechCardFormData, toPurposeEnum } from './schema';
import { parseSeasonToSku } from './season-util';
import { isAgeGroupSet, STYLE_FACT_KEYS, type StyleFact } from './tech-card-options';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// One set of style facts per card, so one staging key.
const STAGING_KEY = 'styleFacts';

// The app's ONE fit vocabulary (`design/fit-vocabulary.ts`, wave 2026-09-25). The private copy
// that stood here is gone: the list is keyed like the storefront, and CARD DETAILS narrows it per
// family.
const FIT_ITEMS = FIT_KEYS.map((k) => ({ label: fitLabel(k), value: k }));

// How long a commit waits for a card being CREATED to hand its new id in (see `currentStyleId`).
const STYLE_ID_WAIT_MS = 5000;
const NO_STYLE_ID = 'the card has no id yet, so its style facts (fit, season…) were not written';

/** One commit waiting for the new card's id — settled by the id, by the timeout, or by unmount. */
type IdWaiter = { resolve: (id: number) => void; reject: (e: Error) => void; timer: number };

/**
 * The facts this panel writes, in the order of the mask and of the header's label —
 * `STYLE_FACT_KEYS`, the ONE list the card's body save reads too (Codex R8).
 */
type Fact = StyleFact;

/** R1: a baseline the dirty compare does not read is reported once per page, not once per fact. */
let baselineDriftReported = false;

/** Which facts one staged commit writes — frozen when it is staged (see the staging effect). */
type FactsDirty = Record<Fact, boolean>;

/**
 * The facts CreateTechCard seeds from the card's own insert (AddTechCard). On a card being created
 * they are the create's to write, whoever the account; CARD DETAILS leaves those cells open.
 */
const SEEDED_BY_CREATE: ReadonlySet<Fact> = new Set<Fact>([
  'brand',
  'collection',
  'season',
  'targetGender',
]);

/** How the header's label names each fact. */
const FACT_WORD: Record<Fact, string> = {
  fit: 'fit',
  careInstructions: 'care',
  brand: 'brand',
  collection: 'collection',
  season: 'season',
  targetGender: 'gender',
  ageGroup: 'age group',
};

/** A fact's value as comparable text: the form holds strings and enum strings; unset is ''. */
const factText = (v: unknown): string => (v == null ? '' : String(v));

/**
 * Two care values that name the same symbols. The server stores care in its own print order, so
 * a label picked in another order is the same care, not a difference to report.
 */
const sameCare = (a: string, b: string): boolean => {
  const x = new Set(careCodes(a));
  const y = new Set(careCodes(b));
  return x.size === y.size && [...x].every((c) => y.has(c));
};

const ORIGIN_LABEL = 'TECH_CARD_LABEL_TYPE_ORIGIN';
const CARE_LABEL = 'TECH_CARD_LABEL_TYPE_CARE';
const HEIGHT = 'BODY_MEASUREMENT_NAME_HEIGHT';

// Derived from the schema rather than restated, so a new label field cannot slip past the
// "is this row still blank" check below.
type LabelRowValue = NonNullable<TechCardFormData['labels']>[number];

/** The content of the first CARE label in a labels list: the one that feeds the storefront. */
const careLabelContent = (rows: unknown): string => {
  const list = Array.isArray(rows) ? (rows as LabelRowValue[]) : [];
  return list.find((l) => l?.labelType === CARE_LABEL)?.content?.trim() ?? '';
};

// What the storefront will actually print from these fields. It is the same copy, built from the
// same values — the care line is worded by the care dictionary, the same rows the storefront
// resolves the stored codes against, so the product page and this preview cannot disagree.
//
// Two of the four lines are not authored here and are shown read-only, at their real source:
// model height comes from the BASE MODEL (header, «base model & sample size»), country of origin
// from the «origin» label on the labels tab — the same place generateCareLabel reads it.
function StorefrontPreview() {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const vocabulary = useCareVocabulary();

  const name = (useWatch({ control, name: 'name' }) as string) || '';
  const fit = (useWatch({ control, name: 'fit' }) as string) || '';
  const care = (useWatch({ control, name: 'careInstructions' }) as string) || '';
  const baseModelId = (useWatch({ control, name: 'baseModelId' }) as number | undefined) ?? 0;
  const baseSampleSizeId =
    (useWatch({ control, name: 'baseSampleSizeId' }) as number | undefined) ?? 0;
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as Array<{
    labelType?: string;
    content?: string;
  }>;

  const { data: model } = useModel(baseModelId || undefined);
  const heightMm = (model?.model?.measurements ?? []).find((m) => m.name === HEIGHT)?.valueMm ?? 0;
  const heightCm = heightMm ? Math.round(heightMm / 10) : 0;

  // no dictionary entry → no "wears M" clause; a raw "#12" is not storefront copy
  const sizeName = (dictionary?.sizes ?? []).find((s) => s.id === baseSampleSizeId)?.name ?? '';
  const sampleSize = sizeName ? formatSizeName(sizeName) : '';

  const origin = labels.find((l) => l.labelType === ORIGIN_LABEL)?.content?.trim() ?? '';
  const careLine = vocabulary.prose(care);

  const modelLine = [
    heightCm ? `model is ${heightCm} cm` : '',
    sampleSize ? `wears ${sampleSize}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const fitLine = [fit ? `${fitLabel(fit)} fit` : '', modelLine].filter(Boolean).join(' · ');

  return (
    <div className='border border-borderColor p-2.5'>
      <GroupLabel flush>product page · preview</GroupLabel>
      <Text className='font-bold uppercase'>{name || '— style name —'}</Text>
      {fitLine && (
        <Text size='micro' variant='label'>
          {fitLine}
        </Text>
      )}
      {careLine && (
        <Text size='micro' variant='label'>
          {careLine}
        </Text>
      )}
      {origin && (
        <Text size='micro' variant='label'>
          made in {origin}
        </Text>
      )}
      {!fitLine && !careLine && !origin && (
        <Text size='micro' variant='label'>
          — nothing else to show yet —
        </Text>
      )}
      <Text size='micro' variant='label' className='mt-2 border-t border-hairline pt-1'>
        model height comes from the base model, origin from the «origin» label — set them there,
        this only reads them.
      </Text>
    </div>
  );
}

// The care symbols AS THE SERVER RESOLVED THEM (TechCard.care_entries) — the structured projection
// of the stored code string, already in canonical print order (wash, bleach, dry, iron,
// professional) and named by the same care_symbol dictionary the label generator and the storefront
// read. Read-only by contract: care is written as the code string, on the care label.
//
// It is not a duplicate of the picker's own rendering. The picker shows what someone TYPED; this
// shows what the backend made of it after the last save — a stored token the vocabulary does not
// know simply has no entry here, which is the only place in this admin where that is visible at all.
function ResolvedCareEntries({ entries }: { entries?: common_CareEntry[] }) {
  const rows = (entries ?? []).filter((e) => e.code?.trim());
  if (rows.length === 0) return null;
  return (
    <div>
      <GroupLabel>care — resolved on the last save</GroupLabel>
      <div className='flex flex-wrap items-start gap-1'>
        {rows.map((e) => (
          <CareSymbol key={e.code} code={e.code as string} />
        ))}
      </div>
      <Text size='micro' variant='label' className='mt-1'>
        {rows.map((e) => e.name?.trim() || e.code).join(' · ')}
      </Text>
    </div>
  );
}

// The header's care picker. It edits the SAME field the LABELS tab does — the care label's
// `content` — by being handed that exact RHF path, so the two tabs are two views of one value and
// not two values to reconcile. (The picker that was removed from the header owned its OWN field;
// that is what made it a duplicate, not the fact that it stood on the header. Care being reachable
// only from the labels tab reads as "care can no longer be edited" to anyone who never went there.)
// `careIdx` is resolved by the PARENT and handed down, not looked up again here: the parent's mirror
// reads the same row to feed `careInstructions`, and two independent lookups over the same array are
// two chances to disagree the day a card carries more than one care label.
function HeaderCarePicker({
  canEdit,
  careIdx,
  careCount,
  careRow,
}: {
  canEdit: boolean;
  careIdx: number;
  /** How many care labels the card carries — >1 makes «the same field» a lie, see below. */
  careCount: number;
  /**
   * The care row itself, resolved by the parent off the array it already watches. Deliberately NOT
   * a local `useWatch` on `labels.${careIdx}`: RHF's useWatch does not re-read when its `name`
   * changes — it only moves on the next emit — so the render right after the row is created would
   * still be showing whichever row used to sit at that index.
   */
  careRow?: LabelRowValue;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();

  const writeLabels = (rows: NonNullable<TechCardFormData['labels']>) =>
    setValue('labels', rows, { shouldDirty: true });

  // A card with no care label yet gets one from here rather than sending the operator to the labels
  // tab to create an empty row first.
  //
  // Written with setValue on the ARRAY NAME — deliberately not a second useFieldArray('labels').
  // Field-array instances do not broadcast their own mutations: only `setValue` on a name that is IN
  // `control._names.array` pushes through `_subjects.array`, and that broadcast is what re-syncs
  // LabelsField's array instead of leaving the labels tab rendering a stale row list.
  //
  // That makes this depend on LabelsField being MOUNTED when the button is pressed — it is what puts
  // 'labels' in `_names.array`, and that set is not append-only (`unregister` and `reset` clear it).
  // Today the tech card mounts every tab and only `hidden`s them, so the dependency holds. If the
  // labels panel is ever mounted conditionally, this call silently falls back to a plain leaf write:
  // the row would still save while staying INVISIBLE on the labels tab. Move it onto a handler owned
  // by LabelsField if that day comes.
  const createCareLabel = () => {
    const rows = (getValues('labels') ?? []) as NonNullable<TechCardFormData['labels']>;
    writeLabels([...rows, { ...emptyLabel, labelType: CARE_LABEL }]);
  };

  // The undo for the button above. Adding a label row moves the LABELS sign-off to «changed after
  // approval» — so an operator who pressed «создать», thought better of it and walked away would
  // have unblessed a signed-off section from a tab that offered no way back. Only offered while the
  // row is still ENTIRELY blank: a care label carries the composition text in `note` (that is what
  // «сгенерировать состав» writes), and dropping the row would take that with it.
  const removable =
    careIdx >= 0 &&
    !careRow?.content?.trim() &&
    !careRow?.note?.trim() &&
    !careRow?.placement?.trim() &&
    !careRow?.attachment?.trim() &&
    !careRow?.size?.trim() &&
    !careRow?.bomItemId;
  const removeCareLabel = () => {
    const rows = (getValues('labels') ?? []) as NonNullable<TechCardFormData['labels']>;
    writeLabels(rows.filter((_, i) => i !== careIdx));
  };

  if (careIdx < 0) {
    return (
      <div className='space-y-1'>
        <FormLabel>care symbols</FormLabel>
        <div className='flex min-h-9 items-center gap-2 border border-borderColor p-1.5'>
          <Text variant='label' size='micro'>
            — the card has no “care” label —
          </Text>
          {canEdit && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              className='ml-auto shrink-0'
              onClick={createCareLabel}
            >
              create
            </Button>
          )}
        </div>
        <Text size='micro' variant='label'>
          the care symbols live on the “care” label (the LABELS tab) — this is the very same field.
          “create” adds a row there.
        </Text>
      </div>
    );
  }

  return (
    <div className='space-y-1'>
      <CarePicker name={`labels.${careIdx}.content`} label='care symbols' editMode={canEdit} />
      {careCount > 1 ? (
        // Nothing forbids a second care label, and the mirror, the printed tag and this picker all
        // read the FIRST one. Saying «the same field» here would then be false for whoever is editing
        // the other row on the labels tab, so name which row actually reaches the storefront.
        <Text size='micro' className='text-error'>
          “care” labels on the card: {careCount} — the first one is what reaches this field and the
          storefront, the rest are edited only on the LABELS tab
        </Text>
      ) : (
        <Text size='micro' variant='label'>
          the same field as on the LABELS tab (the “care” label)
        </Text>
      )}
      {canEdit && removable && (
        <Button type='button' variant='simple' size='xs' onClick={removeCareLabel}>
          remove the empty label
        </Button>
      )}
    </div>
  );
}

// StyleFactsField edits the style catalogue facts fit / care at the tech-card level — they belong to
// the style (shared by every colourway), so they are authored here and shown read-only on each
// colourway card. They are stored on tech_card but written via UpdateStyle (not the tech-card write:
// mapFormToTechCardInsert echoes the stored values back untouched), with a field mask limited to
// these two so no other style fact is touched.
// Composition is NOT edited here: it is derived from the BOM's shell-fabric materials (composition_
// entries, shown read-only on the BOM tab), never hand-entered.
export function StyleFactsField({
  styleId,
  canEdit,
  careEntries,
  hideFitCare = false,
}: {
  styleId?: number;
  canEdit: boolean;
  /** Server-resolved care symbols off the card read — display only, never written from here. */
  careEntries?: common_CareEntry[];
  /**
   * Прячет ВИДИМОЕ трио (fit / care picker / storefront preview) у auxiliary-карты, но оставляет
   * компонент СМОНТИРОВАННЫМ. Размонтировать его нельзя: это единственный писатель
   * brand / collection / season / targetGender — их редактируют в хедере, а UpdateTechCard их
   * намеренно не пишет (R4/§14.7, «ни один факт не пишется двумя путями»). Сняв панель с монтажа,
   * мы бы вернули ровно тот дефект, который описан в комментарии к dirtyFields выше: оператор
   * меняет бренд у aux-карты, видит «saved», перезагружает — и получает старое значение.
   */
  hideFitCare?: boolean;
}) {
  const { control, setValue, getFieldState } = useFormContext<TechCardFormData>();
  const [saving, setSaving] = useState(false);

  // THE LIVE VALUE, NEVER `getValues` (Codex R7). getValues answers from the BASELINE while RHF
  // counts the form as unmounted — from a reset until the next render — so a read in that window
  // would send, or re-baseline over, the stored value instead of the one on screen. `_formValues`
  // is what every setValue and every onChange writes.
  const live = (f: Fact): unknown => get(control._formValues, f);
  // MOVE ONE FACT'S BASELINE — the baseline only, never the value (Codex R1). RHF has no public
  // call for it: `resetField` writes the VALUE along with the default (a brand typed while the
  // write was in flight jumped back under the caret, or was taken as saved) and does nothing at all
  // for a field no control has registered — care never is (it mirrors the care label), nor are the
  // CARD DETAILS cells before the studio opens. So the baseline goes where resetField itself puts
  // it, through RHF's exported path writer `set`, and `setValue` with `shouldDirty` re-derives the
  // field's flag and the form's isDirty against it, registered or not. That rests on
  // `_defaultValues` being the live object RHF's dirty compare reads — true of react-hook-form
  // 7.62, pinned `~7.62.0` in package.json; the check below says so in the console, once, if a
  // later RHF stops honouring it.
  const moveBaseline = (f: Fact, to: unknown, value: unknown = live(f)) => {
    set(control._defaultValues as FieldValues, f, to);
    setValue(f, value as never, { shouldDirty: true });
    const dirty = getFieldState(f).isDirty;
    if (dirty === Object.is(value, to) && !baselineDriftReported) {
      baselineDriftReported = true;
      console.error(
        `style facts: «${f}» reads ${dirty ? 'dirty' : 'clean'} right after its baseline moved — ` +
          "react-hook-form's dirty compare no longer reads control._defaultValues (moveBaseline)",
      );
    }
  };
  const staging = useTechCardStaging();

  // THE STYLE ID IS READ AT COMMIT TIME, NEVER CAPTURED AT STAGING TIME (Codex B-07, D-24).
  //
  // On a card being created the change is staged BEFORE the card exists: the operator picks a fit,
  // presses «add», and only CreateTechCard's answer names the row UpdateStyle has to write.
  // index.tsx hands that id in as `styleId` and then commits the staged queue — but a prop set from
  // an async save lands on the NEXT render, while `commitAll` starts running in the same tick. So
  // the commit does not read a value closed over when the change was staged (that was `undefined`,
  // and the old `if (!styleId) return` dropped fit/season silently on every new card): it reads
  // this ref, and when the ref is still empty it waits for the render that fills it — bounded, and
  // loud when it never comes (a rejected commit is a named line in the save banner, a silent return
  // is a lost fact).
  const styleIdRef = useRef<number | undefined>(styleId || undefined);
  const idWaiters = useRef<IdWaiter[]>([]);
  useLayoutEffect(() => {
    styleIdRef.current = styleId || undefined;
    if (!styleId) return;
    const waiting = idWaiters.current;
    idWaiters.current = [];
    waiting.forEach((w) => {
      window.clearTimeout(w.timer);
      w.resolve(styleId);
    });
  }, [styleId]);
  // Leaving the screen ends the wait (Codex m1): every timer is cleared and a commit still waiting
  // is rejected NOW, by name — not by a timer firing five seconds later into a page that is gone.
  // A commit that only STARTS after the page is gone («add», then away while CreateTechCard is in
  // flight — index.tsx commits the queue when the create answers) never begins a wait at all:
  // nothing will hand this panel an id any more.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const waiting = idWaiters.current;
      idWaiters.current = [];
      waiting.forEach((w) => {
        window.clearTimeout(w.timer);
        w.reject(new Error(NO_STYLE_ID));
      });
    };
  }, []);
  const currentStyleId = (): Promise<number> => {
    const now = styleIdRef.current;
    if (now) return Promise.resolve(now);
    if (!mounted.current) return Promise.reject(new Error(NO_STYLE_ID));
    return new Promise<number>((resolve, reject) => {
      const waiter: IdWaiter = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          idWaiters.current = idWaiters.current.filter((w) => w !== waiter);
          reject(new Error(NO_STYLE_ID));
        }, STYLE_ID_WAIT_MS),
      };
      idWaiters.current.push(waiter);
    });
  };

  // Care is authored once, on the care label — reachable from this panel and from the LABELS tab,
  // both writing that one field. The style-level careInstructions (what the storefront + the preview
  // below read) mirrors that single source, so neither entry point can leave the storefront care
  // behind. Reconciled without dirtying on mount — and a legacy card that authored care in the old
  // header field keeps it until a care label is actually filled, so nothing is silently wiped.
  const labels = (useWatch({ control, name: 'labels' }) ?? []) as LabelRowValue[];
  // ONE lookup: it is both what the mirror below copies and what the header's picker writes into.
  const careIdx = labels.findIndex((l) => l.labelType === CARE_LABEL);
  const careFromLabel = careIdx < 0 ? '' : labels[careIdx].content?.trim() ?? '';
  const careCount = labels.filter((l) => l.labelType === CARE_LABEL).length;
  // WHO MAY WRITE A STYLE FACT AT ALL (Codex R3): UpdateStyle is `products:write` on the server
  // (rbac.go:163) — `tech_cards:write` is not enough. Staged for an account without it, every one
  // of these edits came back refused and, a failed commit staying staged (m5), was sent again on
  // every autosave with the banner up. Nothing is staged for such an account; CARD DETAILS locks
  // the cells on the same grant (brand, collection, season and gender stay open on a card being
  // created: CreateTechCard seeds those four from its own insert).
  const { canWrite, isLoading: grantLoading } = usePermissions();
  const canStyle = canWrite(SECTION.products);
  // What the style held when the mirror last adopted the care label over it (see CARE DRIFT
  // below). Null when it adopted nothing, and again once a care write has landed.
  const [careAdopted, setCareAdopted] = useState<{ stored: string; label: string } | null>(null);
  const careHeld = useWatch({ control, name: 'careInstructions' }) as string | undefined;
  useEffect(() => {
    // THE STYLE'S CARE IS LEFT ALONE FOR AN ACCOUNT THAT CANNOT WRITE IT (Codex M2). The care
    // label is the card's (LABELS, tech_cards:write) and saves as it always did; mirroring it into
    // `careInstructions` here only made an edit nobody could stage — and once the card body's
    // save took it as saved, the storefront care silently never followed. The LABELS row says so
    // in words. An account still loading reads as allowed (the grants fail open), so the mirror
    // waits for the answer: nothing is adopted for an account that turns out not to hold the grant.
    if (!canStyle || grantLoading) return;
    const held = live('careInstructions');
    const cur = factText(held).trim();
    if (careFromLabel === cur) return;
    // ADOPTED, NOT EDITED (Codex R2) — whenever the care AND the care label are what the server
    // holds: the page has just read them, on open or on a rebase onto a newer read (which sets the
    // care's value and baseline both — MJ-1: adopted once at mount only, a rebased card's `sync ›`
    // then staged nothing). The label is the server's when it is its own baseline. The baseline
    // moves WITH the value: adopted with only `shouldDirty: false`, the value parted from it, and
    // the first rebuild of the dirty map read it as an edit — a fit-only save masked care too, and
    // a label that is not care codes made UpdateStyle refuse the whole style write with
    // unknown_care_code, on every autosave. What the adoption went over is kept, since the style
    // still holds it (CARE DRIFT). An empty or missing care label adopts nothing: a stored care is
    // never cleared just because no care label is filled yet.
    const serverLabel = careLabelContent(get(control._defaultValues, 'labels'));
    if (!getFieldState('careInstructions').isDirty && careFromLabel === serverLabel) {
      if (careFromLabel) {
        moveBaseline('careInstructions', careFromLabel, careFromLabel);
        setCareAdopted({ stored: factText(held), label: careFromLabel });
      }
      return;
    }
    // EDITED: the care label is not the one the server holds (the operator changed it in this
    // session, or before the grant answered), or care is staged already and follows the label.
    // Care is masked only then.
    setValue('careInstructions', careFromLabel, { shouldDirty: true });
    // `live`, `moveBaseline` and `getFieldState` read the page's one form control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careFromLabel, canStyle, grantLoading, careHeld, setValue]);
  // brand / collection / season / targetGender / fit / age group are edited in CARD DETAILS and
  // care on the labels — but they are style catalogue facts, so UpdateStyle is their only writer.
  // UpdateTechCard deliberately excludes them (R4/§14.7, "no fact is written by two paths"), while
  // the card kept sending them in its insert and reporting success: the operator changed the brand,
  // saw "saved", reloaded, and got the old value back. They ride this panel's staged UpdateStyle,
  // because that is the RPC that owns them. Season rides along too — see commitFacts.
  //
  // WHICH FACTS MOVED IS RHF'S OWN ANSWER — each field against its baseline, the value the server
  // holds. That holds through the card body's save too: while this panel is staged, that save keeps
  // these seven baselines where they are (`keepBaseline` over STYLE_FACT_KEYS, CL-A 61c6af0b), so
  // a style write that FAILS leaves its facts dirty and the change staged under the same truthful
  // label until it lands or the operator puts the old value back (Codex m5). Only this panel moves
  // them: to what its write SENT (the staging effect), or with an adopted care label (above).
  const { dirtyFields } = useFormState({ control, name: [...STYLE_FACT_KEYS] });
  const { isDirty: formDirty } = useFormState({ control });

  // FIT IS WRITTEN ONLY WHERE IT IS DRAWN (Codex M2). CARD DETAILS hides the field on an auxiliary
  // card and on a family with no fit (accessories, shoes, bags, objects), and the same predicate —
  // `fitChoicesFor` — answers here. A fit edited and THEN hidden by a category change goes back to
  // the value the server holds (the effect below) and never reaches the mask: a value nobody can
  // see any more is not a value anybody chose.
  const { dictionary } = useDictionary();
  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const purpose = useWatch({ control, name: 'purpose' }) as string | undefined;
  const fitApplies =
    fitChoicesFor(
      dictionary?.categories,
      categoryId,
      toPurposeEnum(purpose) === 'TECH_CARD_PURPOSE_AUXILIARY',
    ) !== null;
  const fitEdited = !!dirtyFields.fit;
  useEffect(() => {
    if (fitApplies || !fitEdited) return;
    const loaded = factText((control._defaultValues as Partial<TechCardFormData>).fit);
    // `shouldDirty` with the loaded value is what clears the flag (RHF compares against the
    // default) — and it does so for a field no control has registered; `resetField` would not.
    setValue('fit', loaded, { shouldDirty: true });
  }, [fitApplies, fitEdited, control, setValue]);

  // AGE GROUP (T01, D-01'). Written like every fact here — dirty, then masked — plus ONE case of
  // its own: a card being CREATED proposes adult (techCardDefaultData), and the new style row has
  // no age group at all (0366 adds none), so that proposal is a write although nobody touched it.
  // It rides only once the card is actually being filled in (`formDirty`: staging on a blank form
  // would raise «unsaved changes» on a page nobody typed into), only for an account that may call
  // UpdateStyle (products:write — FIT's lock), and never as «— unset —»: UNKNOWN under the mask is
  // refused, so an unset select simply stays out of it.
  //
  // `createMode` is taken at MOUNT and ends when this panel's own write lands — NOT when the id
  // arrives. index.tsx hands the id in with a flushSync right before commitAll; read off `styleId`,
  // the pending default would unstage in that very render and the card would be created without it.
  const [createMode, setCreateMode] = useState(!styleId);
  // `canStyle` — see the care mirror above: without products:write nothing here is staged.
  const proposeAge = createMode && formDirty && canStyle;
  const ageGroup = useWatch({ control, name: 'ageGroup' });

  const writes: FactsDirty = {
    fit: canStyle && fitApplies && fitEdited,
    careInstructions: canStyle && !!dirtyFields.careInstructions,
    brand: canStyle && !!dirtyFields.brand,
    collection: canStyle && !!dirtyFields.collection,
    season: canStyle && !!dirtyFields.season,
    targetGender: canStyle && !!dirtyFields.targetGender,
    ageGroup: canStyle && isAgeGroupSet(ageGroup) && (!!dirtyFields.ageGroup || proposeAge),
  };
  const changed = STYLE_FACT_KEYS.filter((f) => writes[f]).map((f) => FACT_WORD[f]);
  const writesKey = STYLE_FACT_KEYS.map((f) => (writes[f] ? 1 : 0)).join('');

  // A STYLE FACT THIS ACCOUNT CANNOT WRITE IS NEVER LEFT DIRTY (CL-A round-3 review, mn-3). Without
  // products:write the cells are locked and nothing here is staged. So a fact made dirty another
  // way — a restored draft (`form.reset` keeps the baselines), a programmatic write — could be
  // neither written nor put back by hand: the page asked «leave?» on every unload, and any foreign
  // write to the card body opened the conflict modal over it. Once the grant has answered, each
  // such fact goes back to its baseline, the value the server holds, by the hidden-fit rule's
  // mechanism (`shouldDirty` with the baseline clears the flag, registered or not). Keyed by WHICH
  // facts are dirty, so it runs at the answer and again after every restore or write that dirties
  // one. On a card being created (`createMode`, taken at mount; the create's navigation remounts
  // the page) brand, collection, season and gender are the create's own and stay as typed.
  const unwritable =
    grantLoading || canStyle
      ? ''
      : STYLE_FACT_KEYS.filter(
          (f) => !!dirtyFields[f] && !(createMode && SEEDED_BY_CREATE.has(f)),
        ).join(',');
  useEffect(() => {
    if (!unwritable) return;
    for (const f of unwritable.split(',') as Fact[]) {
      setValue(f, get(control._defaultValues, f) as never, { shouldDirty: true });
    }
  }, [unwritable, control, setValue]);

  // CARE DRIFT — THE STOREFRONT'S CARE IS NOT THE CARE LABEL (25.09 decision: no write on open).
  // Two ways to get here. A legacy card's care was authored somewhere else, and the mirror adopted
  // the label over it. Or the label was edited by an account that cannot write the style (M2), and
  // the style kept its care. The care label row says so (`useCareDrift`, LABELS) and offers one
  // door, `sync ›`: it puts the stored care back under the label as the baseline, so the label
  // reads as the edit it is and is staged like any other care edit (mask [careInstructions]). An
  // account without products:write gets the words and no door (the row's own line names that
  // grant); for it the care in the form IS the stored care, since nothing here writes it.
  //  - Not while care is staged: that write is what ends the difference.
  //  - The same symbols in another order are no difference: the server stores its own print order.
  //  - Without a door the words say why (mn-4): UpdateStyle refuses any unknown code under the
  //    mask, and a refused write would stay staged and retry on every autosave; a released card
  //    and an account without tech_cards:write stage nothing at all.
  //  - The latest card read only ever CLEARS the words (mn-1): a read that shows the label's
  //    symbols stored ends the difference, whatever the form last knew. It never raises them — a
  //    read that raced this panel's own write would bring back a difference already written. A
  //    newer stored care reaches the form by the page's rebase, and the mirror re-adopts (above).
  const careVocabulary = useCareVocabulary();
  const careDirty = !!dirtyFields.careInstructions;
  const readCare = careEntries?.map((e) => e.code?.trim() ?? '').join(',');
  const readShowsLabel = readCare !== undefined && sameCare(readCare, careFromLabel);
  const careDrift =
    !grantLoading &&
    careIdx >= 0 &&
    !!careFromLabel &&
    !readShowsLabel &&
    (canStyle
      ? !!careAdopted &&
        careAdopted.label === careFromLabel &&
        !careDirty &&
        !sameCare(careAdopted.stored, careFromLabel)
      : !sameCare(factText(careHeld), careFromLabel));
  // WHAT THE DOOR STAGED (mn-2): care staged exactly as `sync ›` stages it — the label as the
  // value over the stored care as the baseline. The row says so, with «cancel»: a write that
  // failed stays staged and is retried on every autosave (m5), and the label offers no way back.
  const careStagedByDoor =
    canStyle &&
    !!careAdopted &&
    careDirty &&
    careAdopted.label === careFromLabel &&
    factText(careHeld) === careFromLabel &&
    factText(get(control._defaultValues, 'careInstructions')) === careAdopted.stored;
  const labelCodes = careCodes(careFromLabel);
  const unknownCodes = labelCodes.filter((c) => !careVocabulary.byCode[c]);
  const archivedCodes = labelCodes.filter((c) => careVocabulary.byCode[c]?.archived);
  const careCannot: string | null =
    !careDrift || !canStyle
      ? null
      : !canWrite(SECTION.techCards)
        ? 'needs tech_cards:write'
        : !canEdit
          ? 'the card is released'
          : !staging
            ? 'nothing on this page stages it'
            : !careVocabulary.loaded
              ? 'care symbols are still loading'
              : labelCodes.length === 0
                ? 'no care symbols'
                : unknownCodes.length + archivedCodes.length > 0
                  ? [
                      unknownCodes.length > 0 ? `unknown ${unknownCodes.join(', ')}` : '',
                      archivedCodes.length > 0 ? `archived ${archivedCodes.join(', ')}` : '',
                    ]
                      .filter(Boolean)
                      .join(', ')
                  : null;
  useEffect(() => {
    const adopted = careAdopted;
    const label = careFromLabel;
    let drift: CareDrift | null = null;
    if (careStagedByDoor) {
      drift = {
        row: careIdx,
        state: 'staged',
        sync: null,
        cannot: null,
        // The label goes back over the label: care clean, the staged write gone, the words back.
        cancel: () => moveBaseline('careInstructions', label, label),
      };
    } else if (careDrift) {
      drift = {
        row: careIdx,
        state: 'differs',
        // The value is the LABEL, handed in — never read back from the form (MJ-1).
        sync:
          canStyle && !careCannot && adopted
            ? () => moveBaseline('careInstructions', adopted.stored, label)
            : null,
        cannot: careCannot,
        cancel: null,
      };
    }
    useCareDrift.setState({ drift });
    return () => useCareDrift.setState({ drift: null });
    // `moveBaseline` reads the page's one form control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careDrift, careStagedByDoor, careCannot, canStyle, careIdx, careAdopted, careFromLabel]);

  // The panel's mutation, unwrapped: it THROWS on failure instead of toasting, because the header's
  // one save is what reports the outcome now — it needs the rejection to name this panel in a
  // partial-failure banner and keep everything after it staged (19.3).
  //
  // The mask names ONLY the fields that actually moved, and the patch carries only those. That is not
  // tidiness: UpdateStyle validates careInstructions STRICTLY whenever the mask names it (every token
  // must be a care-dictionary code), and a card whose style still holds pre-ISO free text — which the
  // backend explicitly keeps — would then reject a fit-only edit with unknown_care_code on a field the
  // operator never touched. Which fields go is decided at STAGING time and frozen into the commit
  // (the staging effect below), never re-derived here.
  //
  // MASK PATHS ARE lowerCamelCase. The gateway decodes the body with protojson, which refuses any
  // JSON FieldMask path containing `_` (400 «paths contains invalid path», before UpdateStyle runs)
  // and maps `ageGroup` onto the proto field age_group itself.
  //
  // It answers with what it SENT — each masked fact as the form held it when read — and the
  // commit moves exactly those baselines (Codex R5): a fact that fell out of the mask (an age group
  // back at «— unset —») was not written and keeps the baseline the server still holds; a value
  // typed while the request was in flight was not written either, and stays an edit.
  async function commitFacts(dirty: FactsDirty): Promise<Partial<Record<Fact, unknown>>> {
    type StylePatch = NonNullable<Parameters<typeof adminService.UpdateStyle>[0]['patch']>;
    const patch: Partial<StylePatch> = {};
    const mask: string[] = [];
    const read: Partial<Record<Fact, unknown>> = {};
    for (const f of STYLE_FACT_KEYS) if (dirty[f]) read[f] = live(f);
    // The mask path IS the fact's name (lowerCamelCase, see above), and what is masked is recorded
    // as sent in the same breath.
    const sent: Partial<Record<Fact, unknown>> = {};
    const send = (f: Fact) => {
      mask.push(f);
      sent[f] = read[f];
    };
    if (dirty.fit) {
      patch.fit = factText(read.fit);
      send('fit');
    }
    if (dirty.careInstructions) {
      patch.careInstructions = factText(read.careInstructions);
      send('careInstructions');
    }
    if (dirty.brand) {
      patch.brand = factText(read.brand);
      send('brand');
    }
    if (dirty.collection) {
      patch.collection = factText(read.collection);
      send('collection');
    }
    if (dirty.season) {
      // Code AND year: sku_season is one fact, and both travel under the single "season" mask
      // path. The form holds a label ("SS26"); parseSeasonToSku is the same parser the style
      // number is minted from, so what is saved is what the label says.
      const label = factText(read.season).trim();
      const sku = parseSeasonToSku(label);
      if (!sku?.code || sku.code === 'SEASON_ENUM_UNKNOWN') {
        // A season that does not parse is NOT «nothing to write» (Codex m4): it was changed and it
        // cannot be sent — UNKNOWN would re-mint every colourway's SKU under a blank season. So
        // this panel refuses by name, BEFORE any request: the change stays staged and the save
        // banner says why. Returning quietly let `settle` adopt the unparsed label as the new
        // baseline while the header said «saved». (The card's schema refuses such a label before
        // a save starts; this is the panel's own guard, not the only one.)
        const why = label
          ? `the season «${label}» is not one a style can take (SS26, FW25, Resort 26…)`
          : 'a style cannot be left without a season';
        throw new Error(`${why} — nothing from «style facts» was written`);
      }
      patch.season = sku.code;
      // 0 is "keep the stored year" server-side, so a label carrying no year changes only the
      // code — which is exactly what a label like "Resort" means.
      patch.seasonYear = sku.year ?? 0;
      send('season');
    }
    if (dirty.targetGender) {
      // The form holds the GenderEnum string the header's select writes, which is what the patch
      // wants — no mapping. An unmasked enum is replaced by a placeholder server-side, so naming
      // it in the mask is what makes it real.
      patch.targetGender = read.targetGender as StylePatch['targetGender'];
      send('targetGender');
    }
    if (dirty.ageGroup) {
      // Read at commit time: the select may be back at «— unset —», and UNKNOWN is never sent
      // under the mask (the server refuses it — «unset» means «leave it», not «clear it»).
      const age = factText(read.ageGroup);
      if (isAgeGroupSet(age)) {
        patch.ageGroup = age;
        send('ageGroup');
      }
    }
    // AN EMPTY MASK IS NOT «WRITE NOTHING». UpdateStyle reads a request without one as a FULL
    // replace of the style's facts, so a commit whose every field fell out above (an age group
    // back at «— unset —») sends no request at all.
    if (mask.length === 0) return sent;
    // The id as of NOW — on a new card it arrives with the render after CreateTechCard (see above).
    const id = await currentStyleId();
    setSaving(true);
    try {
      // The chart read is the cheapest way to read the fresh shared lock (it echoes
      // tech_card.lock_version). It has to happen HERE, right before the write: the card body
      // commits first and bumps that version, so anything read at mount is already stale.
      const cur = await adminService.GetStyleSizeChart({ styleId: id });
      const expectedLockVersion = cur.chart?.lockVersion ?? 0;
      await adminService.UpdateStyle({
        styleId: id,
        // The mask is what decides which of these the server reads; the rest of StylePatch is
        // deliberately absent rather than echoed back.
        patch: patch as StylePatch,
        expectedLockVersion,
        updateMask: mask.join(','),
      });
    } finally {
      setSaving(false);
    }
    return sent;
  }

  // Hand the mutation to the card's one save. Re-staged whenever the set of facts to write moves,
  // so the header's label keeps naming the right fields; `commit` reads the live values when it
  // runs, so an unchanged set needs no new closure.
  //
  // Staged on a card that is NOT SAVED YET too (no `styleId`): the commit resolves the id itself
  // (`currentStyleId`), so the change has to be in the queue when index.tsx commits it right after
  // CreateTechCard. `styleId` is deliberately NOT a dependency: the id arriving is not an edit, and
  // re-staging on it would bump the key's generation mid-commit and file a written change as
  // «changed while the save was running».
  const lastStaged = useRef<string | null>(null);
  const [settledTimes, setSettledTimes] = useState(0);
  useEffect(() => {
    if (!staging || !canEdit) return;
    const queued = staging.peek().some((c) => c.key === STAGING_KEY);
    if (changed.length === 0) {
      lastStaged.current = null;
      if (queued) staging.unstage(STAGING_KEY);
      return;
    }
    // Still queued with the same facts: nothing to tell the queue. The effect re-runs with an
    // unchanged set when `staging` takes a new identity (a draft's hydrate) or `canEdit` returns,
    // and a panel without a snapshot counts every stage() as an edit — so re-staging then would
    // bump the key's generation, and mid-commit that files a written change as «changed while the
    // save was running» and leaves it unsettled. A commit that FAILED stays queued the same way,
    // under the same truthful label — its facts stay dirty, the body's save keeps their baselines
    // (keepBaseline) — until it lands or the operator puts the old value back.
    if (queued && lastStaged.current === writesKey) return;
    lastStaged.current = writesKey;
    // The set is FROZEN into the commit here, from the same render that computed the label — so the
    // two can never disagree, and nothing that runs between staging and committing can widen the
    // mask back onto untouched care.
    const dirty: FactsDirty = { ...writes };
    staging.stage({
      key: STAGING_KEY,
      label: `${changed.join('/')} — ${changed.length} ${changed.length === 1 ? 'field' : 'fields'}`,
      order: COMMIT_ORDER.styleFacts,
      commit: async () => {
        const sent = await commitFacts(dirty);
        // THE BASELINES MOVE HERE, the moment the write has landed — not in `settle`, which
        // commitAll skips for a key that moved while it was committing (Codex R6). From this
        // answer on the server holds what was SENT, whatever the queue did meanwhile: a fact put
        // back while its write was on the wire must read as an edit against that value, and be
        // staged again, not as clean and «saved». Each baseline becomes what was sent, never what
        // the field holds by now — a value typed in flight is still an edit (see moveBaseline).
        for (const f of STYLE_FACT_KEYS) if (f in sent) moveBaseline(f, sent[f]);
        // The style holds the care that was sent now: whatever the first sync adopted over is gone.
        if ('careInstructions' in sent) setCareAdopted(null);
        // The style is written: from here on only an edit writes its age group.
        if (Object.keys(sent).length > 0) setCreateMode(false);
      },
      // Runs only when the write landed and nothing re-staged meanwhile: commitAll drops the key
      // right after, and the render this bump causes stages again whatever is still an edit.
      settle: () => {
        lastStaged.current = null;
        setSettledTimes((n) => n + 1);
      },
    });
    // The closures read current form state when they run; `writesKey` is what a reader (the
    // label) and the commit (the frozen set) can see; `settledTimes` re-stages what a settle left
    // dirty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, canEdit, writesKey, settledTimes]);

  // Ниже — только разметка. Все хуки (зеркало care, staging brand/collection/season/gender) уже
  // отработали выше, поэтому невидимая панель продолжает ПИСАТЬ ровно то же, что и видимая.
  if (hideFitCare) return null;

  if (!styleId) {
    return (
      <Text size='micro' variant='label'>
        Save the tech card first, then enter fit / care here.
      </Text>
    );
  }

  return (
    <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-2'>
      <div className='space-y-2.5'>
        <Text size='micro' variant='label'>
          Fit is a style fact shared by every colourway. Care is stored once — on the care label —
          and can be picked here or on the LABELS tab, it is the same field either way; composition
          is derived from the BOM’s shell-fabric materials (see the composition on the BOM tab).
        </Text>
        <SelectField name='fit' label='fit' items={FIT_ITEMS} readOnly={!canEdit} />
        <HeaderCarePicker
          canEdit={canEdit}
          careIdx={careIdx}
          careCount={careCount}
          careRow={careIdx < 0 ? undefined : labels[careIdx]}
        />
        <ResolvedCareEntries entries={careEntries} />
        {canEdit && changed.length > 0 && (
          <div className='flex flex-wrap items-center gap-2'>
            <Pill tone='attention'>{saving ? 'saving…' : 'staged for save'}</Pill>
            <Text size='micro' variant='label' component='span' className='ml-auto'>
              included in the card’s Save
            </Text>
          </div>
        )}
      </div>

      <StorefrontPreview />
    </div>
  );
}
