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
  onValueChange,
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
  onValueChange?: (value: string) => void;
  renderValue?: (
    selectedValue: string | number,
    selectedItem: { label: string; value: string | number } | undefined,
  ) => React.ReactNode;
  [k: string]: any;
}) {
  const [open, setOpen] = useState(false);

  // ПУСТОТА, КОТОРОЙ НИКТО НЕ ПРЕДЛАГАЛ, — НЕ ОТВЕТ ЧЕЛОВЕКА, А СБРОС КОНТРОЛА.
  //
  // ЗАМЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО (стенд `scripts/operation-work-apply-probe.mjs`, состояния S5/S6).
  // Radix держит рядом со списком СКРЫТЫЙ НАТИВНЫЙ <select> для интеграции с формами и
  // синхронизирует его эффектом ПОСЛЕ рендера. Если в этот момент текущего значения нет среди
  // отрисованных <option> — а список сужается соседним полем и успевает сузиться раньше, чем
  // доезжает новое значение, — нативный принять его не может, остаётся при пустой строке, и его
  // событие приходит сюда как `onValueChange('')`. Форма получает пустоту, которую никто не
  // выбирал, и записывает её поверх правильного значения.
  //
  // Как это выглядело на операциях: выбор работы, переставляющей шаг с прямострочки на оверлок,
  // писал машинку ПРАВИЛЬНО (трасса: `setValue` звался дважды и оба раза с `OVERLOCK`), а форма
  // кончала пустой строкой. Шаг MACHINE без машинки сервер отвергает — строка становилась
  // несохраняемой от одного нажатия. Тем же путём терялась ссылка на профиль парка.
  //
  // ПОЧЕМУ ГРАНИЦА ИМЕННО ТАКАЯ. Пустая строка — законный ВЫБОР там, где её предлагают пунктом
  // («— zone —», «— no kind —»): такой пункт стоит в `items`, и жест проходит как прежде. Пустая
  // строка, которой в списке НЕТ, прийти от человека не может по построению — выбирать нечего.
  // Различие берётся у самого списка, поэтому правило не знает ни одного имени поля и не заводит
  // второго словаря «что можно очищать».
  //
  // ЗДЕСЬ, А НЕ В SelectField: `EncodedSelectField` на карточке тех-карты обращается к этому
  // примитиву НАПРЯМУЮ, минуя поле формы, и теряла ссылку на профиль парка именно она. Правило
  // принадлежит контракту списка, а не одной из двух его обёрток.
  const offersEmptyOption = items.some((item) => String(item.value) === '');

  return (
    <Select.Root
      {...props}
      onValueChange={(value: string) => {
        if (value === '' && !offersEmptyOption) return;
        onValueChange?.(value);
      }}
      open={open}
      onOpenChange={(open) => !readOnly && setOpen(open)}
    >
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
