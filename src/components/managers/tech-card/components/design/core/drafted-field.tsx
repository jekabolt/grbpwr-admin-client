import { cn } from 'lib/utility';
import type { JSX } from 'react';
import { Pill } from 'ui/components/pill';

/**
 * ═══ ОДНА ОБЁРТКА ПОДСВЕТКИ «DRAFTED» НА ВСЮ СТУДИЮ ════════════════════════════════════════════
 *
 * Тон — тот же, что у баннера «an unsaved draft was found» (`CalloutBox tone='warning'`): синяя
 * рамка, лёгкий синий фон, синий текст. Синий в этом админе значит «в полёте, нужен человек»,
 * и черновик модели — ровно это. Не красный: красный значит убыток.
 *
 * Обёртка НЕ меняет примитивы поля: Textarea/Input/Select внутри остаются собой; класс ложится на
 * рамку снаружи, а текст внутри красится через `[&_textarea]`/`[&_input]`, чтобы не трогать их
 * пропсы.
 *
 * ═══ ПИЛЮЛЯ `drafted` — И ЕСТЬ КНОПКА «ПРИНЯТЬ» (фиксап волны, ревью Codex M3; O-18) ═══════════
 *
 * Владелец: «должна быть кнопка принять». Первая редакция держала одну `accept all N ▸` в блоке
 * черновика и глухую пилюлю на поле: верное значение можно было только принять вместе со всем или
 * «поправить», не меняя. Теперь пилюля сама — кнопка: щелчок или Enter/Space на ней снимает
 * пометку ЭТОГО поля (`acceptKey` / `acceptSlot`). Второй кнопки рядом нет — то же слово на том
 * же месте, только нажимается; при наведении и фокусе к нему встаёт `✓`. `accept all` остаётся.
 */
export const DRAFTED_CLASS =
  'border border-warning bg-warning/5 [&_textarea]:text-warning [&_input]:text-warning [&_select]:text-warning';

/**
 * Пометка «drafted». С `onAccept` — кнопка принятия одного поля; без — глухая пилюля (для мест,
 * где принимать нечего по одному).
 */
export function DraftedPill({
  live,
  onAccept,
  className,
  ...rest
}: {
  live: boolean;
  onAccept?: () => void;
  className?: string;
  [k: string]: unknown;
}): JSX.Element | null {
  if (!live) return null;
  if (!onAccept) {
    return (
      <Pill tone='attention' className={className} data-drafted-pill='' {...rest}>
        drafted
      </Pill>
    );
  }
  return (
    <button
      type='button'
      aria-label='accept drafted value'
      title='accept — the value is already saved; this marks it reviewed'
      data-drafted-pill=''
      data-drafted-accept=''
      onClick={(e) => {
        // Пилюля стоит на рамке поля и рядом с его подписью: щелчок принадлежит ей, не полю.
        e.preventDefault();
        e.stopPropagation();
        onAccept();
      }}
      className={cn(
        'group/accept inline-flex shrink-0 items-center gap-1 whitespace-nowrap border border-warning px-[7px] py-px text-micro uppercase tracking-pill text-warning transition-colors hover:bg-warning hover:text-bgColor focus-visible:bg-warning focus-visible:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
        className,
      )}
      {...rest}
    >
      drafted
      <span
        aria-hidden='true'
        className='hidden group-hover/accept:inline group-focus-visible/accept:inline'
      >
        ✓
      </span>
    </button>
  );
}

export function DraftedField({
  live,
  children,
  className,
  pill = true,
  onAccept,
}: {
  live: boolean;
  children: React.ReactNode;
  className?: string;
  /** Показывать ли угловую пилюлю (в тесных строках её ставит лейбл, а не обёртка). */
  pill?: boolean;
  /** Принять одно это поле — угловая пилюля становится кнопкой (см. шапку файла). */
  onAccept?: () => void;
}) {
  return (
    <div className={cn('relative', live && DRAFTED_CLASS, className)} data-drafted={live || undefined}>
      {children}
      {live && pill && (
        <DraftedPill
          live
          onAccept={onAccept}
          className={cn(
            'absolute right-1.5 top-1.5 bg-bgColor',
            !onAccept && 'pointer-events-none',
          )}
        />
      )}
    </div>
  );
}
