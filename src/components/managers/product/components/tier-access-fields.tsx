import { useWatch } from 'react-hook-form';
import FieldsGroupContainer from 'ui/components/fields-group';
import SelectField from 'ui/form/fields/select-field';

// Per-product tier gating: minimum loyalty tier required to buy (product.proto min_tier).
const MIN_TIER_OPTIONS = [
  { label: 'grbpwr', value: '0' },
  { label: 'grbpwr+', value: '1' },
  { label: 'grbpwr++', value: '2' },
  { label: 'grbpwr hacker', value: '99' },
];

export function TierAccessFields({ editMode }: { editMode: boolean }) {
  // minTier defaults to 0 (open to everyone) — collapse it behind "access · advanced" so the common
  // case stays quiet, but auto-open whenever a non-default tier is set so restricted access is never
  // hidden. The field is preserved (schema default '0', round-tripped through utils); only the input
  // is demoted.
  const minTier = useWatch({ name: 'product.productBodyInsert.minTier' }) as string | undefined;
  const isRestricted = Boolean(minTier && minTier !== '0');

  return (
    <FieldsGroupContainer
      title='access · advanced'
      isOpen={isRestricted}
      childrenSpacingClass='space-y-3'
      headerContentGapClass='space-y-3'
    >
      <SelectField
        fullWidth
        name='product.productBodyInsert.minTier'
        label='minimum tier (access)'
        items={MIN_TIER_OPTIONS}
        readOnly={!editMode}
      />
    </FieldsGroupContainer>
  );
}
