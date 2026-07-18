import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';

const AUDIENCE_OPTIONS = [
  { label: 'everyone', value: 'HERO_AUDIENCE_ALL' },
  { label: 'guests only', value: 'HERO_AUDIENCE_GUESTS' },
  { label: 'members only', value: 'HERO_AUDIENCE_MEMBERS' },
  { label: 'tier & above', value: 'HERO_AUDIENCE_TIER' },
];

/**
 * The cross-cutting TARGETING modifier shown under every hero block: who the
 * block is shown to (audience), plus a minimum tier when audience is TIER.
 * Writes to the entity-level `audience` / `minTierId` fields (empty audience is
 * treated as "everyone" by the storefront).
 */
export function TargetingFields({ index }: { index: number }) {
  const { control } = useFormContext();
  const audience = useWatch({ control, name: `entities.${index}.audience` });

  return (
    <div className='space-y-3'>
      <Text variant='uppercase' size='small'>
        targeting
      </Text>
      <SelectField
        name={`entities.${index}.audience`}
        label='show to'
        items={AUDIENCE_OPTIONS}
        placeholder='everyone'
      />
      {audience === 'HERO_AUDIENCE_TIER' && (
        <div className='space-y-1'>
          <InputField
            name={`entities.${index}.minTierId`}
            label='minimum tier id'
            type='number'
            valueAsNumber
            placeholder='e.g. 2'
          />
          {/* H10: this is a raw numeric id with no dictionary anywhere in the admin
              app to resolve it against — the named tier system
              (membership/utils/tier-utils.ts TIER_OPTIONS) is keyed by TierCode
              (a string enum: TIER_CODE_MEMBER/PLUS/PLUS_PLUS/HACKER), not a
              numeric id, so a Select can't be safely built without guessing an
              id<->tier mapping. Confirm the id against tier-config before use. */}
          <Text variant='label' size='small'>
            numeric tier id (not the same as the tier code used elsewhere) — check the current
            tier-config order to confirm which id you want; lower ids are typically earlier/lower
            tiers.
          </Text>
        </div>
      )}
    </div>
  );
}
