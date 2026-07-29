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
