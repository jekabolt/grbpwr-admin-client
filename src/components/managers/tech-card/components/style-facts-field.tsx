import { adminService } from 'api/api';
import { useModel } from 'components/managers/models/components/useModelQuery';
import {
  CARE_CODE_META,
  CarePicker,
} from 'components/managers/product/components/care/care-picker';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { careToProse } from 'utils/care-label';
import { TechCardFormData } from './schema';

const FIT_OPTIONS = ['regular', 'slim', 'loose', 'relaxed', 'skinny', 'cropped', 'tailored'].map(
  (f) => ({ label: f, value: f }),
);

const ORIGIN_LABEL = 'TECH_CARD_LABEL_TYPE_ORIGIN';
const HEIGHT = 'BODY_MEASUREMENT_NAME_HEIGHT';

// Render the picked care codes as symbol + text chips (the "symbols + text" view the wizard
// produces), so the constructor reads the actual instructions, not a raw "MWN,DNB" code string.
function CareSummary({ name }: { name: string }) {
  const value = (useWatch({ name }) as string) || '';
  const codes = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-1'>
      {codes.map((code) => {
        const m = CARE_CODE_META[code];
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
// same values — the care line goes through `careToProse` so the product page and the printed care
// label can never word the same symbols differently.
//
// Two of the four lines are not authored here and are shown read-only, at their real source:
// model height comes from the BASE MODEL (header, «base model & sample size»), country of origin
// from the «origin» label on the labels tab — the same place generateCareLabel reads it.
function StorefrontPreview() {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();

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
  const careLine = careToProse(care);

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
// colourway card. They are stored on tech_card but written via UpdateStyle (not the tech-card write),
// so this saves through UpdateStyle with a field mask limited to these two — the shared
// tech_card.lock_version is read fresh right before the write, and no other style fact is touched.
// Composition is NOT edited here: it is derived from the BOM's shell-fabric materials (composition_
// entries, shown read-only on the BOM tab), never hand-entered.
export function StyleFactsField({ styleId, canEdit }: { styleId?: number; canEdit: boolean }) {
  const { showMessage } = useSnackBarStore();
  const { getValues } = useFormContext<TechCardFormData>();
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!styleId) return;
    setSaving(true);
    try {
      // The chart read is the cheapest way to read the fresh shared lock (it echoes
      // tech_card.lock_version); the main tech-card save shares that version, so a mount-time value
      // could be stale.
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
      showMessage('Style facts saved', 'success');
    } catch (e) {
      const err = e as Error & { status?: number };
      showMessage(
        err?.status === 409
          ? 'This style changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to save style facts',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

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
        <CalloutBox tone='note'>
          <Text size='micro' variant='label'>
            Saved as a canonical ISO-3758 code string (e.g. “MWN,DNB,TDL”) — this already feeds the
            care-label generator. <b>Backend gap:</b> symbol-accurate labels & storefront care need
            a STRUCTURED backend care field; today care round-trips as one plain string.
          </Text>
        </CalloutBox>
        {canEdit && (
          <Button type='button' variant='secondary' size='sm' disabled={saving} onClick={save}>
            {saving ? 'saving…' : 'save style facts'}
          </Button>
        )}
      </div>

      <StorefrontPreview />
    </div>
  );
}
