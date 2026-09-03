import * as Select from '@radix-ui/react-select';
import React, { useState } from 'react';

import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { Arrow } from 'ui/icons/arrow';

export default function SelectComponent({
  name,
  items,
  className,
  itemClassName,
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
  //
  // ЯРЛЫК — УЗЕЛ, А НЕ ТОЛЬКО СТРОКА (круг 15). Список видов шва выбирают ГЛАЗАМИ: семнадцать
  // названий без картинок — это тот же слепой список, по которому владелец уже ходил. `ItemText`
  // законно держит разметку, и доступное имя пункта по-прежнему собирается из его ТЕКСТА, поэтому
  // `<svg aria-hidden>` рядом с названием ничего не ломает ни в чтении с экрана, ни в пробах,
  // ищущих пункт по имени.
  //
  // `group` — СОСЕДНИЕ пункты с одним значением заворачиваются в `Select.Group` с заголовком.
  // Именно соседние, а не «все с таким значением»: порядок пунктов задаёт вызывающая сторона, и
  // переставлять их за неё список не имеет права. Пункт без `group` рендерится ровно как прежде.
  items: { value: string | number; label: React.ReactNode; disabled?: boolean; group?: string }[];
  className?: string;
  /**
   * Классы КАЖДОГО пункта этого списка. Заведено ради одного свойства, которого у примитива не
   * было вовсе: показать, КАКОЙ пункт выбран, когда список раскрыт (`data-[state=checked]`).
   *
   * ПОЧЕМУ НЕ ГЛОБАЛЬНО. Инверсия выбранной строки — правильное поведение и ступень
   * `chip-selected` из DESIGN.md, но включить её разом во всех восьмидесяти списках админки
   * значит поменять вид экранов, о которых этот круг не спрашивал и которых он не меряет.
   * Правка вида — отдельное решение по всему админу; здесь — общая дверь, а не флаг под одного
   * вызывающего.
   */
  itemClassName?: string;
  customWidth?: number;
  fullWidth?: boolean;
  readOnly?: boolean;
  // Set by SelectField from the field's RHF error. A Radix select has no <input> for FormControl's
  // Slot to land aria-invalid on, so the flag is threaded down to the trigger explicitly.
  invalid?: boolean;
  onValueChange?: (value: string) => void;
  renderValue?: (
    selectedValue: string | number,
    selectedItem: { label: React.ReactNode; value: string | number } | undefined,
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

  // ПУСТОЕ ЗНАЧЕНИЕ ПУНКТА РОНЯЛО ВСЮ СТРАНИЦУ, а не только список.
  //
  // Radix кидает исключение на `<Select.Item value="">` (пустая строка зарезервирована за «снять
  // выбор»), а поверх вкладки нет границы ошибок — поэтому один такой пункт уносил весь экран в
  // белое, и `tsc` при этом был зелёный. За одну ночь это случилось дважды в новом коде, поэтому
  // правило живёт ЗДЕСЬ: примитив уже разрешал пустой пункт (`offersEmptyOption` выше), а
  // отрисовать его не умел — то есть контракт списка сам себе противоречил.
  //
  // Пустое значение едет вниз подстановкой и переводится обратно на выходе. Наружу примитив
  // по-прежнему говорит `''` — вызывающая сторона о подстановке не знает и знать не должна.
  const EMPTY_SENTINEL = '\u0000none';
  const outward = (value: string) => (value === EMPTY_SENTINEL ? '' : value);

  return (
    <Select.Root
      {...props}
      onValueChange={(value: string) => {
        const v = outward(value);
        if (v === '' && !offersEmptyOption) return;
        onValueChange?.(v);
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
        {groupRuns(items).map((run) =>
          run.group === undefined ? (
            run.items.map((item) => (
              <SelectItem
                key={item.value}
                value={String(item.value) === '' ? EMPTY_SENTINEL : String(item.value)}
                disabled={item.disabled}
                className={itemClassName}
              >
                {item.label}
              </SelectItem>
            ))
          ) : (
            <Select.Group key={`grp:${run.group}`}>
              {/* СТУПЕНЬ `GroupLabel`, А НЕ ВТОРАЯ ГРАММАТИКА: 10px uppercase серым над чертой
                  `borderColor`. Заголовок внутри списка — то же деление, что заголовок группы
                  на рейке, и выглядеть иначе он не имеет права. */}
              <Select.Label className='border-b border-borderColor px-2.5 pb-0.5 pt-1.5 text-micro font-bold uppercase tracking-group text-labelColor'>
                {run.group}
              </Select.Label>
              {run.items.map((item) => (
                <SelectItem
                  key={item.value}
                  value={String(item.value) === '' ? EMPTY_SENTINEL : String(item.value)}
                  disabled={item.disabled}
                  className={itemClassName}
                >
                  {item.label}
                </SelectItem>
              ))}
            </Select.Group>
          ),
        )}
      </SelectContent>
    </Select.Root>
  );
}

/**
 * ПУНКТЫ, РАЗБИТЫЕ НА ПОДРЯД ИДУЩИЕ ПРОБЕГИ ОДНОЙ ГРУППЫ. Пробег без имени группы отдаётся
 * пунктами как есть — то есть список БЕЗ `group` собирает ровно ту же разметку, что собирал до
 * этой правки, и это утверждение проверяется снимком операций (`operation-work-apply-probe.mjs`).
 */
type SelectRun = {
  group: string | undefined;
  items: { value: string | number; label: React.ReactNode; disabled?: boolean; group?: string }[];
};
function groupRuns(
  items: { value: string | number; label: React.ReactNode; disabled?: boolean; group?: string }[],
): SelectRun[] {
  const runs: SelectRun[] = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else runs.push({ group: item.group, items: [item] });
  }
  return runs;
}

// todo: add type
export function SelectItem({ children, className, ref, ...props }: any) {
  return (
    <Select.Item
      className={cn(
        'relative flex min-h-6 select-none items-center px-2.5 leading-none data-[disabled]:pointer-events-none data-[highlighted]:bg-[rgba(0,0,0,0.08)] data-[highlighted]:text-textColor data-[disabled]:opacity-30 data-[highlighted]:outline-none',
        className,
      )}
      {...props}
      ref={ref}
    >
      {/* ⚠ `Text` РЕНДЕРИТ <p>, И ПОЭТОМУ ВЫСОТА ЗДЕСЬ `min-h`, А НЕ `h`. Ярлык-узел (образец шва
          над названием) выше двадцати четырёх пикселей, и жёсткая высота срезала бы его молча.
          На однострочном текстовом ярлыке `min-h-6` даёт ТУ ЖЕ коробку, что `h-6`: 12px строка с
          `leading-none` в неё не упирается. И по той же причине узел-ярлык обязан состоять из
          фразовых элементов (`span`, `svg`): `<div>` внутри `<p>` парсер закрыл бы абзацем. */}
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
    selectedItem: { label: React.ReactNode; value: string | number } | undefined,
  ) => React.ReactNode;
  value?: string | number;
  items?: { label: React.ReactNode; value: string | number }[];
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
