import { cn } from 'lib/utility';
import { forwardRef } from 'react';

export interface TextareaProps {
  className?: string;
  name: string;
  variant?: 'default' | 'secondary';
  [k: string]: any;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, name, variant = 'default', ...props }, ref) => {
    return (
      <textarea
        id={name}
        ref={ref}
        className={cn(
          // Same box as Input. It used to be min-h-56 (224px) with a 40px bottom
          // margin and no border, which is why every notes field dominated its section.
          'block min-h-[44px] w-full resize-y appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none',
          'aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error',
          'placeholder:text-textInactiveColor disabled:bg-bgZebra disabled:text-labelColor',
          {
            'border-textInactiveColor': variant === 'secondary',
          },
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';

export default Textarea;
