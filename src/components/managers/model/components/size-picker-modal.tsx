import { common_SizeSkuSystem } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { cn } from 'lib/utility';
import type { ReactNode } from 'react';
import { Chip, ChipRow, GroupLabel, GenericPopover, Text } from 'ui';
import { useSizeSystems } from './use-size-systems';

/**
 * Size selector — a POPOVER anchored to its trigger, not a dialog.
 *
 * It used to be a 720 × 640 centred modal with apply/cancel. Picking a size is a one-click
 * decision you want to see land: the chips behind the panel update as you click, which is the
 * whole reason to anchor rather than overlay. There is nothing to apply and nothing to cancel —
 * clicking a chip toggles it in the caller's state immediately.
 *
 * `scope='other'` is the tech card's case: the permitted systems are already rendered inline on
 * the page, so the panel's remaining job is the systems the category does NOT default to.
 * `scope='all'` (the default) is the model's case, where nothing is rendered inline.
 *
 * The name is kept for the two existing call sites; `SizePickerPopover` is the alias to migrate to.
 */
export function SizePickerModal({
  selectedIds,
  onToggle,
  gender,
  allowedSizeSystems,
  triggerLabel = 'select sizes',
  title = 'sizes',
  triggerClassName,
  scope = 'all',
  disabled,
  renderTrigger,
}: {
  selectedIds: number[];
  onToggle: (id: number) => void;
  gender?: string;
  // When set (S10/WS5), only offer sizes in these SKU systems — resolved from the style's category
  // (already-selected sizes stay visible so an existing choice is never hidden). Unset = all sizes.
  allowedSizeSystems?: common_SizeSkuSystem[];
  triggerLabel?: string;
  title?: string;
  triggerClassName?: string;
  /** 'other' shows only what the category filtered out (its permitted systems are inline already). */
  scope?: 'all' | 'other';
  disabled?: boolean;
  /** Replaces the default text trigger; must render ONE element (it becomes the trigger via asChild). */
  renderTrigger?: (isOpen: boolean) => ReactNode;
}) {
  const { permitted, other } = useSizeSystems({ gender, allowedSizeSystems, selectedIds });
  const groups = scope === 'other' ? other : [...permitted, ...other];

  const selected = new Set(selectedIds);
  const genderNote =
    gender && gender !== 'GENDER_ENUM_UNKNOWN' ? 'filtered by target gender' : 'all genders';

  return (
    <GenericPopover
      title={title}
      className='w-[270px] max-w-[calc(100vw-1.5rem)]'
      triggerProps={{ disabled, asChild: !!renderTrigger }}
      openElement={
        renderTrigger ?? (
          <span
            className={cn(
              'inline-flex items-center gap-1 border border-borderColor bg-bgColor px-2.5 py-1',
              'text-micro uppercase tracking-label',
              disabled ? 'text-borderColor' : 'text-textColor hover:border-textColor',
              triggerClassName,
            )}
          >
            {triggerLabel}
            {selectedIds.length ? ` (${selectedIds.length})` : ''} ▾
          </span>
        )
      }
    >
      <div className='flex flex-col'>
        {groups.length === 0 ? (
          <Text size='micro' variant='label'>
            {scope === 'other' ? 'no other systems for this category' : 'no sizes available'}
          </Text>
        ) : (
          groups.map((group, gi) => (
            <div key={group.key}>
              <GroupLabel className={gi === 0 ? 'mt-0' : undefined}>{group.label}</GroupLabel>
              <ChipRow>
                {group.sizes.map((s) => {
                  const id = s.id ?? 0;
                  return (
                    <Chip
                      key={id}
                      selected={selected.has(id)}
                      pressed={selected.has(id)}
                      onClick={() => onToggle(id)}
                    >
                      {formatSizeName(s.name)}
                    </Chip>
                  );
                })}
              </ChipRow>
            </div>
          ))
        )}
        <Text size='micro' variant='label' className='mt-2'>
          {selectedIds.length} selected · {genderNote}
        </Text>
      </div>
    </GenericPopover>
  );
}

/** Preferred name — the component is a popover, not a modal. */
export const SizePickerPopover = SizePickerModal;
