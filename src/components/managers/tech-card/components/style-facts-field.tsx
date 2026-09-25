import { adminService } from 'api/api';
import { common_CareEntry } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useModel } from 'components/managers/models/components/useModelQuery';
import { CareSymbol } from 'components/managers/product/components/care/care-card';
import { CarePicker } from 'components/managers/product/components/care/care-picker';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
import { FIT_KEYS, fitChoicesFor, fitLabel } from './design/fit-vocabulary';
import { emptyLabel } from './labels-field';
import { TechCardFormData, toPurposeEnum } from './schema';
import { parseSeasonToSku } from './season-util';
import { isAgeGroupSet } from './tech-card-options';
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

/** Which facts one staged commit writes — frozen when it is staged (see the staging effect). */
type FactsDirty = {
  fit: boolean;
  care: boolean;
  brand: boolean;
  collection: boolean;
  season: boolean;
  targetGender: boolean;
  ageGroup: boolean;
};

const ORIGIN_LABEL = 'TECH_CARD_LABEL_TYPE_ORIGIN';
const CARE_LABEL = 'TECH_CARD_LABEL_TYPE_CARE';
const HEIGHT = 'BODY_MEASUREMENT_NAME_HEIGHT';

// Derived from the schema rather than restated, so a new label field cannot slip past the
// "is this row still blank" check below.
type LabelRowValue = NonNullable<TechCardFormData['labels']>[number];

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
  const { getValues, control, resetField, setValue } = useFormContext<TechCardFormData>();
  const [saving, setSaving] = useState(false);
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
  useEffect(
    () => () => {
      const waiting = idWaiters.current;
      idWaiters.current = [];
      waiting.forEach((w) => {
        window.clearTimeout(w.timer);
        w.reject(new Error(NO_STYLE_ID));
      });
    },
    [],
  );
  const currentStyleId = (): Promise<number> => {
    const now = styleIdRef.current;
    if (now) return Promise.resolve(now);
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
  const firstCareSync = useRef(true);
  useEffect(() => {
    const cur = (getValues('careInstructions') || '').trim();
    if (firstCareSync.current) {
      firstCareSync.current = false;
      // On mount only adopt a care label that actually carries symbols — never clear a stored value
      // just because no care label exists yet.
      if (careFromLabel && careFromLabel !== cur) {
        setValue('careInstructions', careFromLabel, { shouldDirty: false });
      }
      return;
    }
    if (careFromLabel !== cur) {
      setValue('careInstructions', careFromLabel, { shouldDirty: true });
    }
  }, [careFromLabel, getValues, setValue]);
  // Both fields live in the card's RHF form, so "dirty" here is exactly RHF's own answer: they moved
  // off the loaded card's defaults. That is also what makes the header's label a FACT — it names the
  // fields that actually changed rather than guessing "style facts".
  // brand / collection / targetGender are edited in the card HEADER, not in this panel — but they
  // are style catalogue facts, so UpdateStyle is their only writer. UpdateTechCard deliberately
  // excludes them (R4/§14.7, "no fact is written by two paths"), while the card kept sending them
  // in its insert and reporting success: the operator changed the brand, saw "saved", reloaded, and
  // got the old value back. They ride this panel's staged UpdateStyle now, because that is the RPC
  // that owns them. Season rides along too, but only half of it can land — see commitFacts.
  const { dirtyFields } = useFormState({
    control,
    name: ['fit', 'careInstructions', 'brand', 'collection', 'season', 'targetGender', 'ageGroup'],
  });
  const { isDirty: formDirty } = useFormState({ control });

  // FIT IS WRITTEN ONLY WHERE IT IS DRAWN (Codex M2). CARD DETAILS hides the field on an auxiliary
  // card and on a family with no fit (accessories, shoes, bags, objects), and the same predicate —
  // `fitChoicesFor` — answers here. A fit edited and THEN hidden by a category change goes back to
  // the loaded value (the effect below) and never reaches the mask: a value nobody can see any more
  // is not a value anybody chose.
  const { dictionary } = useDictionary();
  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const purpose = useWatch({ control, name: 'purpose' }) as string | undefined;
  const fitApplies =
    fitChoicesFor(
      dictionary?.categories,
      categoryId,
      toPurposeEnum(purpose) === 'TECH_CARD_PURPOSE_AUXILIARY',
    ) !== null;
  const fitDirty = fitApplies && !!dirtyFields.fit;
  useEffect(() => {
    if (fitApplies || !dirtyFields.fit) return;
    const loaded = (control._defaultValues as Partial<TechCardFormData>).fit ?? '';
    // `shouldDirty` with the LOADED value is what clears the flag (RHF compares against the
    // default) — and it does so for a field no control has registered; `resetField` would not.
    setValue('fit', loaded, { shouldDirty: true });
  }, [fitApplies, dirtyFields.fit, control, setValue]);

  // AGE GROUP (T01, D-01'). Written like every fact here — dirty, then masked — plus ONE case of
  // its own: a card being CREATED proposes adult (techCardDefaultData), and the new style row has
  // no age group at all (0366 adds none), so that proposal is a write although nobody touched it.
  // It rides only once the card is actually being filled in (`formDirty`: staging on a blank form
  // would raise «unsaved changes» on a page nobody typed into), only for an account that may call
  // UpdateStyle (products:write — FIT's lock), and never as «— unset —»: UNKNOWN under the mask is
  // refused, so an unset select simply stays out of it.
  //
  // `createMode` is taken at MOUNT and ends when this panel's own commit settles — NOT when the id
  // arrives. index.tsx hands the id in with a flushSync right before commitAll; read off `styleId`,
  // the pending default would unstage in that very render and the card would be created without it.
  const [createMode, setCreateMode] = useState(!styleId);
  const { canWrite } = usePermissions();
  const ageGroup = useWatch({ control, name: 'ageGroup' });
  const ageWrites =
    isAgeGroupSet(ageGroup) &&
    (!!dirtyFields.ageGroup || (createMode && formDirty && canWrite(SECTION.products)));

  const changed = [
    fitDirty ? 'fit' : '',
    dirtyFields.careInstructions ? 'care' : '',
    dirtyFields.brand ? 'brand' : '',
    dirtyFields.collection ? 'collection' : '',
    dirtyFields.season ? 'season' : '',
    dirtyFields.targetGender ? 'gender' : '',
    ageWrites ? 'age group' : '',
  ].filter(Boolean);

  // The panel's mutation, unwrapped: it THROWS on failure instead of toasting, because the header's
  // one save is what reports the outcome now — it needs the rejection to name this panel in a
  // partial-failure banner and keep everything after it staged (19.3).
  //
  // The mask names ONLY the fields that actually moved, and the patch carries only those. That is not
  // tidiness: UpdateStyle validates careInstructions STRICTLY whenever the mask names it (every token
  // must be a care-dictionary code), and a card whose style still holds pre-ISO free text — which the
  // backend explicitly keeps — would then reject a fit-only edit with unknown_care_code on a field the
  // operator never touched. Which fields moved is decided at STAGING time, not here: the card body
  // commits first and its form.reset() clears the dirty flags before this runs.
  async function commitFacts(dirty: FactsDirty) {
    type StylePatch = NonNullable<Parameters<typeof adminService.UpdateStyle>[0]['patch']>;
    const patch: Partial<StylePatch> = {};
    const mask: string[] = [];
    if (dirty.fit) {
      patch.fit = getValues('fit') || '';
      mask.push('fit');
    }
    if (dirty.care) {
      patch.careInstructions = getValues('careInstructions') || '';
      mask.push('careInstructions');
    }
    if (dirty.brand) {
      patch.brand = getValues('brand') || '';
      mask.push('brand');
    }
    if (dirty.collection) {
      patch.collection = getValues('collection') || '';
      mask.push('collection');
    }
    if (dirty.season) {
      // Code AND year: sku_season is one fact, and both travel under the single "season" mask
      // path. The form holds a label ("SS26"); parseSeasonToSku is the same parser the style
      // number is minted from, so what is saved is what the label says. An unrecognised label
      // parses to nothing and is skipped rather than written as UNKNOWN — the operator's typo
      // must not re-mint every colourway's SKU under a blank season.
      const sku = parseSeasonToSku(getValues('season') || '');
      if (sku?.code && sku.code !== 'SEASON_ENUM_UNKNOWN') {
        patch.season = sku.code;
        // 0 is "keep the stored year" server-side, so a label carrying no year changes only the
        // code — which is exactly what a label like "Resort" means.
        patch.seasonYear = sku.year ?? 0;
        mask.push('season');
      }
    }
    if (dirty.targetGender) {
      // The form holds the GenderEnum string the header's select writes, which is what the patch
      // wants — no mapping. An unmasked enum is replaced by a placeholder server-side, so naming
      // it in the mask is what makes it real.
      patch.targetGender = getValues('targetGender') as StylePatch['targetGender'];
      mask.push('targetGender');
    }
    if (dirty.ageGroup) {
      // Read again at commit time: the select may be back at «— unset —», and UNKNOWN is never
      // sent under the mask (the server refuses it — «unset» means «leave it», not «clear it»).
      const age = getValues('ageGroup');
      if (isAgeGroupSet(age)) {
        patch.ageGroup = age;
        mask.push('age_group');
      }
    }
    // AN EMPTY MASK IS NOT «WRITE NOTHING». UpdateStyle reads a request without one as a FULL
    // replace of the style's facts, so a commit whose every field fell out above (a season label
    // that does not parse, an age group back at «— unset —») sends no request at all.
    if (mask.length === 0) return;
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
  }

  // Hand the mutation to the card's one save. Re-staged whenever the changed set moves, so the
  // header's label keeps naming the right fields; `commit` reads through getValues, so unlike the
  // grid panels its payload cannot go stale between staging and committing.
  //
  // Staged on a card that is NOT SAVED YET too (no `styleId`): the commit resolves the id itself
  // (`currentStyleId`), so the change has to be in the queue when index.tsx commits it right after
  // CreateTechCard. `styleId` is deliberately NOT a dependency: the id arriving is not an edit, and
  // re-staging on it would bump the key's generation mid-commit and file a written change as
  // «changed while the save was running».
  useEffect(() => {
    if (!staging || !canEdit) return;
    if (changed.length === 0) {
      staging.unstage(STAGING_KEY);
      return;
    }
    // The dirty set is FROZEN into the commit here, from the same render that computed the label —
    // so the two can never disagree, and the card body's form.reset() (which runs between staging and
    // committing whenever the body was dirty too) cannot widen the mask back onto untouched care.
    const dirty: FactsDirty = {
      fit: fitDirty,
      care: !!dirtyFields.careInstructions,
      brand: !!dirtyFields.brand,
      collection: !!dirtyFields.collection,
      season: !!dirtyFields.season,
      targetGender: !!dirtyFields.targetGender,
      ageGroup: ageWrites,
    };
    staging.stage({
      key: STAGING_KEY,
      label: `${changed.join('/')} — ${changed.length} ${changed.length === 1 ? 'field' : 'fields'}`,
      order: COMMIT_ORDER.styleFacts,
      commit: () => commitFacts(dirty),
      // These two values ARE form fields, so the card body's own reset normally clears them first —
      // but only when the body was dirty. Re-baselining them here keeps the header count honest on
      // the panel's own terms instead of borrowing another panel's cleanup.
      settle: () => {
        const v = getValues();
        resetField('fit', { defaultValue: v.fit });
        resetField('careInstructions', { defaultValue: v.careInstructions });
        resetField('brand', { defaultValue: v.brand });
        resetField('collection', { defaultValue: v.collection });
        resetField('season', { defaultValue: v.season });
        resetField('targetGender', { defaultValue: v.targetGender });
        resetField('ageGroup', { defaultValue: v.ageGroup });
        // The style is written: from here on only an edit writes its age group.
        setCreateMode(false);
      },
    });
    // commitFacts/settle are redefined every render by design (they read current form state);
    // depending on them here would restage on every keystroke for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    canEdit,
    fitDirty,
    dirtyFields.careInstructions,
    dirtyFields.brand,
    dirtyFields.collection,
    dirtyFields.season,
    dirtyFields.targetGender,
    ageWrites,
  ]);

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
