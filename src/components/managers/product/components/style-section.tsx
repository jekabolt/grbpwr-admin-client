import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';
import { buildStylePatch, MODEL_WEARS_UPDATE_MASK } from './utils';

// UpdateStyle is the SOLE writer of a style's catalogue facts. Most of them (brand, season,
// collection, gender, fit, composition, care, categories) are now edited on the tech card and shown
// read-only in <BodyFields/> above; the colourway card keeps only model-wears (the per-colourway
// photo-shoot note), which this section saves. The field mask limits the write to model-wears, so
// saving here never touches a fact owned by the tech card.
export function StyleSection({
  styleId,
  lockVersion,
  canWrite,
  onChanged,
}: {
  styleId: number;
  lockVersion?: number;
  canWrite: boolean;
  onChanged?: () => void;
}) {
  const { getValues } = useFormContext<ProductFormData>();
  const { showMessage } = useSnackBarStore();
  const [saving, setSaving] = useState(false);

  async function saveStyle() {
    setSaving(true);
    try {
      await adminService.UpdateStyle({
        styleId,
        patch: buildStylePatch(getValues()),
        expectedLockVersion: lockVersion,
        updateMask: MODEL_WEARS_UPDATE_MASK,
      });
      showMessage('Model-wears updated', 'success');
      onChanged?.();
    } catch (e) {
      const err = e as Error & { status?: number };
      // ABORTED (stale lock) -> 409; FAILED_PRECONDITION (e.g. a season change blocked by SKU-frozen
      // siblings — use clone-for-season instead) -> 400, whose server message names the cause.
      const message =
        err?.status === 409
          ? 'This style changed since you loaded it — reload and retry.'
          : err instanceof Error
            ? err.message
            : 'Failed to update style';
      showMessage(message, 'error');
      console.error('UpdateStyle error', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className='space-y-3 border border-textInactiveColor p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text variant='uppercase' size='large'>
          model presentation
        </Text>
        <Text variant='inactive' size='small'>
          style #{styleId}
        </Text>
      </div>
      <Text variant='inactive' size='small'>
        Model-wears height and size describe this colourway’s photo shoot and save here. The other
        style facts (brand, season, collection, gender, fit, category, composition, care) are shared
        across all colourways and are edited on the tech card.
      </Text>
      {canWrite && (
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          disabled={saving}
          onClick={saveStyle}
        >
          {saving ? 'saving…' : 'save model-wears'}
        </Button>
      )}
    </section>
  );
}
