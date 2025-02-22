import { cva, VariantProps } from 'class-variance-authority';

export const buttonVariants = cva('disabled:cursor-not-allowed block', {
  variants: {
    variant: {
      default: [
        'border',
        'border-text',
        'text-md',
        'text-bgColor',
        'disabled:bg-inactive',
        'bg-text',
        'hover:bg-bgColor',
        'hover:text-text',
        'focus:outline-none',
        'focus:ring-2',
        'focus:ring-offset-2',
        'focus:ring-text',
        'disabled:bg-inactive',
        'disabled:text-bgColor',
        'disabled:border-inactive',
        'leading-4',
        'text-center',
      ],

      underline: ['text-text', 'underline', 'disabled:text-inactive'],
    },
    size: {
      sm: ['text-small'],
      default: ['text-base'],
      lg: ['py-2.5', 'px-4', 'text-base'],
      giant: ['py-10', 'px-16', 'text-giant'],
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

interface Props extends VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  loading?: boolean;
  className?: string;
  [k: string]: unknown;
}

export function Button({ children, loading, size, variant, className, ...props }: Props) {
  const Component = 'button';

  return (
    <Component
      {...props}
      className={buttonVariants({
        variant,
        size,
        className,
      })}
    >
      {children}
    </Component>
  );
}
