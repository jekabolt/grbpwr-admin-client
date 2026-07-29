import { adminService } from 'api/api';
import { useModel } from 'components/managers/models/components/useModelQuery';
import { CarePicker } from 'components/managers/product/components/care/care-picker';
import { useCareVocabulary } from 'components/managers/product/components/care/use-care-vocabulary';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// One set of style facts per card, so one staging key.
const STAGING_KEY = 'styleFacts';

const FIT_OPTIONS = ['regular', 'slim', 'loose', 'relaxed', 'skinny', 'cropped', 'tailored'].map(
  (f) => ({ label: f, value: f }),
);

const ORIGIN_LABEL = 'TECH_CARD_LABEL_TYPE_ORIGIN';
const HEIGHT = 'BODY_MEASUREMENT_NAME_HEIGHT';

// Render the picked care codes as symbol + text chips (the "symbols + text" view the wizard
// produces), so the constructor reads the actual instructions, not a raw "MWN,DNB" code string.
function CareSummary({ name }: { name: string }) {
  const vocabulary = useCareVocabulary();
  const value = (useWatch({ name }) as string) || '';
  const codes = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-1'>
      {codes.map((code) => {
        const m = vocabulary.byCode[code];
        return (
          <span key={code} className='flex items-center gap-1 border border-borderColor px-1.5'>
            {m?.img ? <img src={m.img} alt='' className='size-5' /> : null}
            <Text size='micro' component='span'>
              {m?.name ?? code}
            </Text>
          </span>
        );
      })}
    </div>
  );
}

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

// StyleFactsField edits the style catalogue facts fit / care at the tech-card level — they belong to
// the style (shared by every colourway), so they are authored here and shown read-only on each
// colourway card. They are stored on tech_card but written via UpdateStyle (not the tech-card write:
// mapFormToTechCardInsert echoes the stored values back untouched), with a field mask limited to
// these two so no other style fact is touched.
// Composition is NOT edited here: it is derived from the BOM's shell-fabric materials (composition_
// entries, shown read-only on the BOM tab), never hand-entered.
export function StyleFactsField({ styleId, canEdit }: { styleId?: number; canEdit: boolean }) {
  const { getValues, control, resetField } = useFormContext<TechCardFormData>();
  const [saving, setSaving] = useState(false);
  const staging = useTechCardStaging();
  // Both fields live in the card's RHF form, so "dirty" here is exactly RHF's own answer: they moved
  // off the loaded card's defaults. That is also what makes the header's label a FACT — it names the
  // fields that actually changed rather than guessing "style facts".
  const { dirtyFields } = useFormState({ control, name: ['fit', 'careInstructions'] });
  const changed = [
    dirtyFields.fit ? 'фасон' : '',
    dirtyFields.careInstructions ? 'уход' : '',
  ].filter(Boolean);

  // The panel's mutation, unwrapped: it THROWS on failure instead of toasting, because the header's
  // one save is what reports the outcome now — it needs the rejection to name this panel in a
  // partial-failure banner and keep everything after it staged (19.3).
  async function commitFacts() {
    if (!styleId) return;
    setSaving(true);
    try {
      // The chart read is the cheapest way to read the fresh shared lock (it echoes
      // tech_card.lock_version). It has to happen HERE, right before the write: the card body
      // commits first and bumps that version, so anything read at mount is already stale.
      const cur = await adminService.GetStyleSizeChart({ styleId });
      const expectedLockVersion = cur.chart?.lockVersion ?? 0;
      await adminService.UpdateStyle({
        styleId,
        patch: {
          fit: getValues('fit') || '',
          careInstructions: getValues('careInstructions') || '',
        } as Parameters<typeof adminService.UpdateStyle>[0]['patch'],
        expectedLockVersion,
        updateMask: 'fit,careInstructions',
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
    staging.stage({
      key: STAGING_KEY,
      label: `${changed.join('/')} — ${changed.length} ${changed.length === 1 ? 'field' : 'fields'}`,
      order: COMMIT_ORDER.styleFacts,
      commit: commitFacts,
      // These two values ARE form fields, so the card body's own reset normally clears them first —
      // but only when the body was dirty. Re-baselining them here keeps the header count honest on
      // the panel's own terms instead of borrowing another panel's cleanup.
      settle: () => {
        const v = getValues();
        resetField('fit', { defaultValue: v.fit });
        resetField('careInstructions', { defaultValue: v.careInstructions });
      },
    });
    // commitFacts/settle are redefined every render by design (they read current form state);
    // depending on them here would restage on every keystroke for no gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, styleId, canEdit, dirtyFields.fit, dirtyFields.careInstructions]);

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
          Fit and care are style facts shared by every colourway. Composition is not entered here —
          it is derived from the BOM’s shell-fabric materials (see the composition on the BOM tab).
        </Text>
        <SelectField name='fit' label='fit' items={FIT_OPTIONS} readOnly={!canEdit} />
        {/* Structured care wizard (ISO 3758: washing / bleaching / tumble-dry / ironing /
            professional care) — reuses the app's CarePicker instead of a free-form textarea, so
            care is pickable symbols that render on labels and the storefront, not typed prose. */}
        <CarePicker name='careInstructions' label='care instructions' editMode={canEdit} />
        <CareSummary name='careInstructions' />
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
