import { adminService } from 'api/api';
import {
  CARE_CODE_META,
  CarePicker,
} from 'components/managers/product/components/care/care-picker';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

const FIT_OPTIONS = ['regular', 'slim', 'loose', 'relaxed', 'skinny', 'cropped', 'tailored'].map(
  (f) => ({ label: f, value: f }),
);

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
    <div className='flex flex-wrap gap-1.5'>
      {codes.map((code) => {
        const m = CARE_CODE_META[code];
        return (
          <span
            key={code}
            className='flex items-center gap-1 border border-textInactiveColor px-1.5 py-0.5'
          >
            {m?.img ? <img src={m.img} alt='' className='size-5' /> : null}
            <Text size='small'>{m?.name ?? code}</Text>
          </span>
        );
      })}
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
      <Text variant='inactive' size='small'>
        Save the tech card first, then enter fit / care here.
      </Text>
    );
  }

  return (
    <div className='space-y-3'>
      <Text variant='inactive' size='small'>
        Fit and care are style facts shared by every colourway. Composition is not entered here — it
        is derived from the BOM’s shell-fabric materials (see the composition on the BOM tab).
      </Text>
      <SelectField name='fit' label='fit' items={FIT_OPTIONS} readOnly={!canEdit} />
      <div className='space-y-2'>
        {/* Structured care wizard (ISO 3758: washing / bleaching / tumble-dry / ironing /
            professional care) — reuses the app's CarePicker instead of a free-form textarea, so
            care is pickable symbols that render on labels and the storefront, not typed prose. */}
        <CarePicker name='careInstructions' label='care instructions' editMode={canEdit} />
        <CareSummary name='careInstructions' />
        <div className='border border-textInactiveColor p-2'>
          <Text variant='inactive' size='small'>
            Saved as a canonical ISO-3758 code string (e.g. “MWN,DNB,TDL”) — this already feeds the
            care-label generator. Backend gap: symbol-accurate labels & storefront care need a
            STRUCTURED backend care field; today care round-trips as one plain string.
          </Text>
        </div>
      </div>
      {canEdit && (
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          disabled={saving}
          onClick={save}
        >
          {saving ? 'saving…' : 'save style facts'}
        </Button>
      )}
    </div>
  );
}
