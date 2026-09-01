import { cva, VariantProps } from 'class-variance-authority';

const textVariants = cva('', {
  variants: {
    variant: {
      default: ['text-text'],
      error: ['text-error', 'uppercase'],
      selected: ['text-bgColor', 'bg-textColor', 'uppercase'],
      uppercase: ['text-text', 'uppercase'],
      underlined: ['underline', 'text-text'],
      underLineWithColor: ['underline', 'text-blue', 'uppercase'],
      strikethrough: ['line-through', 'text-text'],
      strileTroughInactive: ['line-through', 'text-inactive'],
      inactive: ['text-textInactiveColor'],
      // Readable secondary text for functional field labels/hints (AA on white).
      label: ['text-labelColor'],
      /**
       * K-20 · ЗАПРЕТ, СКАЗАННЫЙ ПРЕДЛОЖЕНИЕМ. Тон `error`, но БЕЗ `uppercase`.
       *
       * Это не вкусовая добавка, а недостающая половина системы. DESIGN.md §3
       * («The Uppercase-Is-A-Label Rule») разрешает капслок только ярлыку, контролу или
       * заголовку секции — вещам в четыре слова и короче; предложения и подсказки остаются в
       * обычном регистре. При этом `variant='error'` зашивает `uppercase` безусловно, поэтому
       * ЛЮБОЙ error-текст длиннее ярлыка автоматически нарушал собственное правило проекта и
       * кричал абзацем во всю ширину.
       *
       * Добавлено СВЕРХУ, а не правкой `error`: тот стоит в 80+ местах приложения (archive,
       * orders, accounting, fulfillment), и снятие капслока там — отдельное решение по всему
       * админу, а не побочный эффект правки одной карточки.
       *
       * Красный ЗДЕСЬ ОСТАЁТСЯ: это настоящий блокирующий запрет, а не примечание. Монохромную
       * безопасность (DESIGN.md, «state is never carried by colour alone») держит ведущий
       * глиф `!` и сама формулировка, а не цвет.
       */
      errorLabel: ['text-error'],
    },
    size: {
      default: ['text-textBaseSize'],
      giant: [
        'lg:text-giant',
        'text-giantSmall',
        'leading-tight',
        'lg:leading-tight',
        'whitespace-nowrap',
      ],
      /** @deprecated alias of `default` — kept so existing size='small' compiles. */
      small: ['text-small'],
      control: ['text-control'], // 11px — chips, buttons, tabs, option labels
      micro: ['text-micro'], // 10px — labels, pills, table headers, hints
      nano: ['text-nano'], // 9px — badges, pin numbers, band labels
      stat: ['text-stat', 'font-bold', 'tabular-nums'],
      statBig: ['text-statBig', 'font-bold', 'tabular-nums'],
      large: ['text-lg'],
    },
    // Pairs with variant='uppercase'. Never set letter-spacing by hand in a screen.
    tracking: {
      none: [],
      pill: ['tracking-pill'],
      label: ['tracking-label'],
      group: ['tracking-group'],
      section: ['tracking-section'],
    },
  },
  defaultVariants: {
    size: 'default',
    variant: 'default',
    tracking: 'none',
  },
});

interface Props extends VariantProps<typeof textVariants> {
  children: React.ReactNode;
  className?: string;
  component?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'label';
  [k: string]: unknown;
}

export default function Text({
  size,
  children,
  className,
  variant,
  tracking,
  component = 'p',
  ...props
}: Props) {
  const Component = component;
  return (
    // `tracking` must be destructured AND passed through: left in ...props it would
    // leak onto the DOM node as an unknown attribute and the variant would be dead
    // code, so no uppercase label in the app would get its letter-spacing.
    <Component {...props} className={textVariants({ variant, size, tracking, className })}>
      {children}
    </Component>
  );
}
