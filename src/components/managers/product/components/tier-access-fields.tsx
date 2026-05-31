import SelectField from 'ui/form/fields/select-field';

// Per-product tier gating: minimum loyalty tier required to buy (product.proto min_tier).
const MIN_TIER_OPTIONS = [
  { label: 'grbpwr', value: '0' },
  { label: 'grbpwr+', value: '1' },
  { label: 'grbpwr++', value: '2' },
  { label: 'grbpwr hacker', value: '99' },
];

export function TierAccessFields({ editMode }: { editMode: boolean }) {
  return (
    <SelectField
      fullWidth
      name='product.productBodyInsert.minTier'
      label='minimum tier (access)'
      items={MIN_TIER_OPTIONS}
      readOnly={!editMode}
    />
  );
}
