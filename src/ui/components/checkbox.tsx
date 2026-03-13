import * as Checkbox from '@radix-ui/react-checkbox';
import { cn } from 'lib/utility';

export default function CheckboxCommon({
  name,
  onChange,
  className,
  ...props
}: {
  name: string;
  onChange?: (checked: boolean) => void;
  className?: string;
  [k: string]: unknown;
}) {
  return (
    <Checkbox.Root
      className={cn(
        'flex h-3 w-3 flex-none appearance-none items-center justify-center border border-textColor cursor-pointer',
        className,
      )}
      id={name}
      name={name}
      onCheckedChange={onChange}
      {...props}
    >
      <Checkbox.Indicator className='h-full w-full bg-textColor'></Checkbox.Indicator>
    </Checkbox.Root>
  );
}
