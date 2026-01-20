import { cva, VariantProps } from 'class-variance-authority';

const textVariants = cva('', {
  variants: {
    variant: {
      default: ['text-text'],
      error: ['text-error', 'uppercase'],
      selected: ['text-bgColor', 'bg-text', 'uppercase'],
      uppercase: ['text-text', 'uppercase'],
      underlined: ['underline', 'text-text'],
      underLineWithColor: ['underline', 'text-blue-500', 'uppercase'],
      strikethrough: ['line-through', 'text-text'],
      strileTroughInactive: ['line-through', 'text-inactive'],
      inactive: ['text-inactive'],
    },
    size: {
      default: ['text-base'],
      giant: [
        'lg:text-giant',
        'text-giantSmall',
        'leading-tight',
        'lg:leading-tight',
        'whitespace-nowrap',
      ],
      small: ['text-small'],
    },
  },
  defaultVariants: {
    size: 'default',
    variant: 'default',
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
  component = 'p',
  ...props
}: Props) {
  const Component = component;
  return (
    <Component {...props} className={textVariants({ variant, size, className })}>
      {children}
    </Component>
  );
}
