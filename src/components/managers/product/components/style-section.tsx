import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';
import { buildStylePatch, STYLE_UPDATE_MASK } from './utils';

// R4: UpdateStyle is the SOLE writer of a style's catalogue facts (brand, season, collection, gender,
// fit, composition, care, model-wears, categories). Those fields are edited in <BodyFields/> above;
// this section owns their SAVE, separately from the colourway save, because:
//   - style facts are shared by every colourway of the style, and
//   - changing a SKU fact (season) is refused with FAILED_PRECONDITION when any sibling colourway is
//     SKU-frozen (has order/label history) — that must not fail the colourway save.
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
        updateMask: STYLE_UPDATE_MASK,
      });
      showMessage('Style facts updated', 'success');
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
          style facts · shared
        </Text>
        <Text variant='inactive' size='small'>
          style #{styleId}
        </Text>
      </div>
      <Text variant='inactive' size='small'>
        Brand, season, collection, gender, fit, categories, composition, care and model-wears are
        style-level facts shared by every colourway of this style. Edit them in the details above and
        save them here. A season change is blocked if any sibling colourway is already SKU-frozen —
        clone the style for the new season instead.
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
          {saving ? 'saving…' : 'save style facts'}
        </Button>
      )}
    </section>
  );
}
