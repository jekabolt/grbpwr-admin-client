import { cn } from 'lib/utility';

export interface InputProps {
  type?: 'email' | 'number' | 'tel' | 'text' | 'file' | 'color' | 'date';
  className?: string;
  name: string;
  [k: string]: any;
}

function Input({ type = 'text', className, name, ref, ...props }: InputProps) {
  return (
    <input
      id={name}
      type={type}
      ref={ref}
      className={cn(
        'w-full appearance-none rounded-none border-b border-textColor bg-bgColor text-textBaseSize focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

Input.displayName = 'Input';

export default Input;
