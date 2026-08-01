import * as Select from '@radix-ui/react-select';
import React, { useState } from 'react';

import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { Arrow } from 'ui/icons/arrow';

export default function SelectComponent({
  name,
  items,
  className,
  customWidth,
  fullWidth,
  renderValue,
  readOnly,
  invalid,
  ...props
}: {
  name: string;
  // `disabled` marks an option that is real but not choosable YET — the label is expected to say
  // why. SelectItem already carries the greyed-out styling for it (data-[disabled]).
  items: { value: string | number; label: string; disabled?: boolean }[];
  className?: string;
  customWidth?: number;
  fullWidth?: boolean;
  readOnly?: boolean;
  // Set by SelectField from the field's RHF error. A Radix select has no <input> for FormControl's
  // Slot to land aria-invalid on, so the flag is threaded down to the trigger explicitly.
  invalid?: boolean;
  renderValue?: (
    selectedValue: string | number,
    selectedItem: { label: string; value: string | number } | undefined,
  ) => React.ReactNode;
  [k: string]: any;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Select.Root {...props} open={open} onOpenChange={(open) => !readOnly && setOpen(open)}>
      <SelectTrigger
        placeholder={props.placeholder}
        className={className}
        renderValue={renderValue}
        value={props.value}
        items={items}
        isOpen={open}
        readOnly={readOnly}
        invalid={invalid}
      >
        <Arrow />
      </SelectTrigger>
      <SelectContent fullWidth={fullWidth} customWidth={customWidth}>
        {items.map((item) => (
          <SelectItem key={item.value} value={String(item.value)} disabled={item.disabled}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select.Root>
  );
}

// todo: add type
export function SelectItem({ children, className, ref, ...props }: any) {
  return (
    <Select.Item
      className={cn(
        'relative flex h-6 select-none items-center px-2.5 leading-none data-[disabled]:pointer-events-none data-[highlighted]:bg-[rgba(0,0,0,0.08)] data-[highlighted]:text-textColor data-[disabled]:opacity-30 data-[highlighted]:outline-none',
        className,
      )}
      {...props}
      ref={ref}
    >
      <Select.ItemText>
        <Text variant='uppercase'>{children}</Text>
      </Select.ItemText>
    </Select.Item>
  );
}

SelectItem.displayName = Select.Item.displayName;

export function SelectTrigger({
  children,
  placeholder,
  className,
  value,
  items,
  isOpen,
  renderValue,
  readOnly,
  invalid,
}: {
  children: React.ReactNode;
  placeholder: string;
  className?: string;
  renderValue?: (
    selectedValue: string | number,
    selectedItem: { label: string; value: string | number } | undefined,
  ) => React.ReactNode;
  value?: string | number;
  items?: { label: string; value: string | number }[];
  isOpen?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
}) {
  let displayValue = null;
  if (renderValue && value != null && value !== '' && items) {
    const selectedItem = items.find((item) => String(item.value) === String(value));
    displayValue = renderValue(value, selectedItem);
  }

  return (
    <Select.Trigger
      className={cn(
        // Same box as <Input> — a select must be indistinguishable from a text field
        // until you click it. Was an underline; see tmp/ui-redesign/02-primitives-inline.md.
        'flex min-h-[22px] w-full items-center justify-between gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none focus:ring-0',
        readOnly && 'pointer-events-none cursor-default opacity-90',
        // Same red box as a blocking <Input>, so a required select reads identically.
        'aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error',
        className,
      )}
      aria-invalid={invalid || undefined}
      aria-label={placeholder}
    >
      {displayValue ?? <Select.Value placeholder={placeholder} />}
      <Select.Icon
        className={cn('rotate-180 text-textColor', {
          'rotate-0': isOpen,
        })}
      >
        {children}
      </Select.Icon>
    </Select.Trigger>
  );
}

export function SelectContent({
  children,
  fullWidth,
  customWidth,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
  customWidth?: number;
}) {
  const getWidth = () => {
    if (fullWidth) return 'var(--radix-select-trigger-width)';
    if (customWidth && customWidth > 0) return `${customWidth}px`;
    return undefined;
  };
  return (
    <Select.Portal>
      <Select.Content
        className='z-[var(--z-popover)] w-full overflow-auto border border-textInactiveColor bg-bgColor'
        position='popper'
        style={{
          width: getWidth(),
        }}
      >
        <Select.Viewport className='max-h-[300px] bg-bgColor'>{children}</Select.Viewport>
      </Select.Content>
    </Select.Portal>
  );
}
