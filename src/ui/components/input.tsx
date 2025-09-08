import { cn } from 'lib/utility';

export interface InputProps {
  type?: 'text' | 'password' | 'number' | 'file' | 'email';
  name: string;
  className?: string;
  [k: string]: any;
}

function Input({ type = 'text', name, className, ref, ...props }: InputProps) {
  return (
    <input
      id={name}
      ref={ref}
      type={type}
      className={cn(
        'w-full focus:bg-bgColor focus:outline-none focus:border-2 border border-inactive focus:border-text px-1',
        '[&:-webkit-autofill]:bg-bgColor [&:-webkit-autofill]:hover:bg-bgColor [&:-webkit-autofill]:focus:bg-bgColor',
        '[&:-webkit-autofill]:[box-shadow:0_0_0_1000px_theme(colors.bgColor)_inset]',
        className,
      )}
      {...props}
    />
  );
}

Input.displayName = 'Input';

export default Input;
