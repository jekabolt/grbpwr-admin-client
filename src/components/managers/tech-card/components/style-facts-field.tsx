import { adminService } from 'api/api';
import { common_CareEntry } from 'api/proto-http/admin';
import { useModel } from 'components/managers/models/components/useModelQuery';
import { CareSymbol } from 'components/managers/product/components/care/care-card';
import { CarePicker } from 'components/managers/product/components/care/care-picker';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useRef, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import SelectField from 'ui/form/fields/select-field';
import { emptyLabel } from './labels-field';
import { TechCardFormData } from './schema';
import { parseSeasonToSku } from './season-util';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// One set of style facts per card, so one staging key.
const STAGING_KEY = 'styleFacts';

const FIT_OPTIONS = ['regular', 'slim', 'loose', 'relaxed', 'skinny', 'cropped', 'tailored'].map(
  (f) => ({ label: f, value: f }),
);

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
  const fitLine = [fit ? `${fit} fit` : '', modelLine].filter(Boolean).join(' · ');

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
            — на карточке нет этикетки «care» —
          </Text>
          {canEdit && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              className='ml-auto shrink-0'
              onClick={createCareLabel}
            >
              создать
            </Button>
          )}
        </div>
        <Text size='micro' variant='label'>
          символы ухода хранятся на этикетке «care» (вкладка LABELS) — здесь то же самое поле.
          «создать» добавит туда строку.
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
          этикеток «care» на карточке: {careCount} — сюда и на витрину идёт первая, остальные
          редактируются только на вкладке LABELS
        </Text>
      ) : (
        <Text size='micro' variant='label'>
          то же поле, что и на вкладке LABELS (этикетка «care»)
        </Text>
      )}
      {canEdit && removable && (
        <Button type='button' variant='simple' size='xs' onClick={removeCareLabel}>
          убрать пустую этикетку
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
}: {
  styleId?: number;
  canEdit: boolean;
  /** Server-resolved care symbols off the card read — display only, never written from here. */
  careEntries?: common_CareEntry[];
}) {
  const { getValues, control, resetField, setValue } = useFormContext<TechCardFormData>();
  const [saving, setSaving] = useState(false);
  const staging = useTechCardStaging();

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
    name: ['fit', 'careInstructions', 'brand', 'collection', 'season', 'targetGender'],
  });
  const changed = [
    dirtyFields.fit ? 'фасон' : '',
    dirtyFields.careInstructions ? 'уход' : '',
    dirtyFields.brand ? 'бренд' : '',
    dirtyFields.collection ? 'коллекция' : '',
    dirtyFields.season ? 'сезон' : '',
    dirtyFields.targetGender ? 'пол' : '',
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
  async function commitFacts(dirty: {
    fit: boolean;
    care: boolean;
    brand: boolean;
    collection: boolean;
    season: boolean;
    targetGender: boolean;
  }) {
    if (!styleId) return;
    if (!Object.values(dirty).some(Boolean)) return;
    setSaving(true);
    try {
      // The chart read is the cheapest way to read the fresh shared lock (it echoes
      // tech_card.lock_version). It has to happen HERE, right before the write: the card body
      // commits first and bumps that version, so anything read at mount is already stale.
      const cur = await adminService.GetStyleSizeChart({ styleId });
      const expectedLockVersion = cur.chart?.lockVersion ?? 0;
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
      await adminService.UpdateStyle({
        styleId,
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
  useEffect(() => {
    if (!staging || !styleId || !canEdit) return;
    if (changed.length === 0) {
      staging.unstage(STAGING_KEY);
      return;
    }
    // The dirty set is FROZEN into the commit here, from the same render that computed the label —
    // so the two can never disagree, and the card body's form.reset() (which runs between staging and
    // committing whenever the body was dirty too) cannot widen the mask back onto untouched care.
    const dirty = {
      fit: !!dirtyFields.fit,
      care: !!dirtyFields.careInstructions,
      brand: !!dirtyFields.brand,
      collection: !!dirtyFields.collection,
      season: !!dirtyFields.season,
      targetGender: !!dirtyFields.targetGender,
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
      },
    });
    // commitFacts/settle are redefined every render by design (they read current form state);
    // depending on them here would restage on every keystroke for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    styleId,
    canEdit,
    dirtyFields.fit,
    dirtyFields.careInstructions,
    dirtyFields.brand,
    dirtyFields.collection,
    dirtyFields.season,
    dirtyFields.targetGender,
  ]);

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
        <SelectField name='fit' label='fit' items={FIT_OPTIONS} readOnly={!canEdit} />
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
