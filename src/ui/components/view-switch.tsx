import { useRef } from 'react';

import { cn } from 'lib/utility';

export type ViewSwitchOption<T extends string> = {
  value: T;
  /** One or two words. It names the VIEW, never the action that reaches it. */
  label: string;
  /** What that view shows — the segment's tooltip. */
  hint?: string;
};

/**
 * Exclusive view switch — the non-form counterpart of `SegmentedField`.
 *
 * For "which way am I looking at this data" controls (a schematic vs a list, a board vs a table):
 * state that lives in a preference, not in a record. Every option is on screen at all times, so
 * the strip states the current view instead of naming the next one, and its width never changes
 * with the selection.
 *
 * ПОЧЕМУ НЕ ЧИП-ПЕРЕКЛЮЧАТЕЛЬ. Один чип, меняющий подпись на «как список» / «как схема», сообщал
 * ЦЕЛЬ, а не положение: с открытой схемой он читался «список», и понять, где ты, можно было
 * только по полотну под ним. Заодно он менял ширину на каждое нажатие — а прижатый к правому краю
 * контейнера, ширина которого зависит от режима, ещё и уезжал через полэкрана. Полоса из двух
 * сегментов снимает обе беды разом: подпись — это состояние, а ширина постоянна.
 *
 * ШРИФТ НЕ МЕНЯЕТ НАСЫЩЕННОСТЬ. Выбранный сегмент заливается, но не жирнеет: FeatureMono
 * моноширинный, а его подмены (Inter/Arial) — нет, и на подменном шрифте жирный сегмент был бы
 * шире обычного. Ширина полосы обязана быть одинаковой в любом положении.
 */
export function ViewSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  disabled,
}: {
  value: T;
  options: readonly ViewSwitchOption<T>[];
  onChange: (next: T) => void;
  /** Announced as the group name. "sequence view", "orders layout". */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  // Клавиатурный вход в группу — ровно один сегмент, и он обязан существовать всегда. Если
  // текущее значение ни одному не соответствует (чужая запись в предпочтениях, снятый вид),
  // табом в полосу было бы не попасть вовсе — тогда вход берёт первый сегмент.
  const current = options.findIndex((o) => o.value === value);
  const entry = current >= 0 ? current : 0;

  const go = (i: number) => {
    const next = options[(i + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    refs.current[(i + options.length) % options.length]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (disabled) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      go(i + step);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      go(e.key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      onChange(options[i].value);
    }
  };

  return (
    <div
      role='radiogroup'
      aria-label={label}
      className={cn('inline-flex items-stretch', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          // СЕГМЕНТЫ — SPAN'Ы, А НЕ КНОПКИ, и это несущее решение: переключатель вида обязан
          // работать на выпущенной карточке, которую целиком глушит внешний `<fieldset disabled>`.
          // Настоящая `<button>` там мертва, и своими пропами этого не исправить, а `span` под
          // запрет не попадает — он не орган формы. Ровно та же причина, что у `nonForm` в `Chip`.
          // Отсюда и ручные роль, tabindex и клавиатура. Ставить сюда что-либо пишущее в данные
          // нельзя: заморозке такой орган не подотчётен.
          <span
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role='radio'
            aria-checked={on}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? undefined : i === entry ? 0 : -1}
            title={o.hint}
            onClick={disabled ? undefined : () => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              '-ml-px inline-flex select-none items-center border px-2 py-px text-micro uppercase tracking-label transition-colors first:ml-0',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
              // `relative` НА ВЫБРАННОМ — не украшение. Сегменты склеены `-ml-px`, то есть их
              // рамки лежат в одном пикселе, и позже нарисованный сосед закрывает край залитого
              // чернилами сегмента своей серой рамкой: чёрный блок получал светлую кромку с одной
              // стороны и не с другой. Позиционированный элемент рисуется поверх статичных в том
              // же контексте, поэтому хватает `relative` — z-index заводить не нужно.
              on
                ? 'relative border-textColor bg-textColor text-bgColor'
                : cn(
                    'border-borderColor bg-bgColor text-labelColor',
                    !disabled && 'hover:text-textColor',
                  ),
            )}
          >
            {o.label}
          </span>
        );
      })}
    </div>
  );
}
