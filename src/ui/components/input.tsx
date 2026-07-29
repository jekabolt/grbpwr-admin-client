import { cn } from 'lib/utility';

export interface InputProps {
  type?: 'email' | 'number' | 'tel' | 'text' | 'file' | 'color' | 'date';
  className?: string;
  name?: string;
  [k: string]: any;
}

function Input({ type = 'text', className, name, ref, ...props }: InputProps) {
  return (
    <input
      id={name}
      type={type}
      ref={ref}
      className={cn(
        // Reference field metrics: a full 1px box, 3px/7px padding, 22px min height.
        // Not an underline — every control in the app is a box on the page canvas.
        'block min-h-[22px] w-full appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none',
        // A field that is blocking the save underlines RED. FormControl already puts aria-invalid on
        // every control it wraps, so styling it here lights up EVERY input in the admin at once —
        // never field-by-field at the call site, which is the version of this that rots.
        // The `focus:` pair is not redundant: plain `aria-[invalid=true]:` and `focus:` have equal
        // specificity, so the compound variant is what guarantees red survives on the focused field
        // (which is exactly the one a failed save deep-links to).
        'aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error',
        'placeholder:text-textInactiveColor disabled:bg-bgZebra disabled:text-labelColor',
        className,
      )}
      {...props}
    />
  );
}

Input.displayName = 'Input';

export default Input;
