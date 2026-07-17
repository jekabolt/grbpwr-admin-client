import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';

const FIT_OPTIONS = ['regular', 'slim', 'loose', 'relaxed', 'skinny', 'cropped', 'tailored'].map(
  (f) => ({ label: f, value: f }),
);

// StyleFactsField edits the style catalogue facts fit / composition / care at the tech-card level —
// they belong to the style (shared by every colourway), so they are authored here and shown read-only
// on each colourway card. They are stored on tech_card but written via UpdateStyle (not the tech-card
// write), so this saves through UpdateStyle with a field mask limited to these three — the shared
// tech_card.lock_version is read fresh right before the write, and no other style fact is touched.
// composition is legacy free-text (M1): a plain string, never a JSON encoding of the structured
// fibre breakdown (which is derived from materials and shown read-only on the BOM tab).
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
          composition: getValues('composition') || '',
          careInstructions: getValues('careInstructions') || '',
        } as Parameters<typeof adminService.UpdateStyle>[0]['patch'],
        expectedLockVersion,
        updateMask: 'fit,composition,careInstructions',
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
        Save the tech card first, then enter fit / composition / care here.
      </Text>
    );
  }

  return (
    <div className='space-y-3'>
      <Text variant='inactive' size='small'>
        Fit, composition and care are style facts shared by every colourway. Composition is the
        free-text label; the structured fibre breakdown is derived from materials (BOM tab).
      </Text>
      <SelectField name='fit' label='fit' items={FIT_OPTIONS} readOnly={!canEdit} />
      <InputField
        name='composition'
        label='composition (free-text, e.g. 70% cotton, 30% polyester)'
        readOnly={!canEdit}
      />
      <TextareaField name='careInstructions' label='care instructions' rows={2} />
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
