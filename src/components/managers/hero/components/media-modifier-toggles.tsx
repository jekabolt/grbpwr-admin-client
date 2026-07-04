import { useFormContext, useWatch } from 'react-hook-form';
import { ToggleSwitch } from 'ui/components/toggle-switch';

interface Props {
  /** RHF path of the media slot, e.g. `entities.3.statement`, `entities.3.main`. */
  prefix: string;
}

/**
 * Per-slot media presentation toggles bound to the flat form fields the hero
 * mappers read into HeroMedia: `tint` (on = the storefront's background-colour
 * tint is shown; writes disableTint = !on) and `stroke` (a border/outline around
 * the media).
 */
export function MediaModifierToggles({ prefix }: Props) {
  const { control, setValue } = useFormContext();
  const disableTint = useWatch({ control, name: `${prefix}.disableTint` });
  const stroke = useWatch({ control, name: `${prefix}.stroke` });

  return (
    <div className='flex flex-wrap items-center gap-6'>
      <ToggleSwitch
        checked={!disableTint}
        onCheckedChange={(v: boolean) =>
          setValue(`${prefix}.disableTint`, !v, { shouldDirty: true })
        }
        label='tint'
      />
      <ToggleSwitch
        checked={!!stroke}
        onCheckedChange={(v: boolean) => setValue(`${prefix}.stroke`, v, { shouldDirty: true })}
        label='stroke'
      />
    </div>
  );
}
