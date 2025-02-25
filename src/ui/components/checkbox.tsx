import * as Checkbox from '@radix-ui/react-checkbox';

export default function CheckboxCommon({ name, ...props }: { name: string; [k: string]: unknown }) {
  return (
    <Checkbox.Root
      className='flex h-3 w-3 flex-none appearance-none items-center justify-center border border-text'
      id={name}
      name={name}
      {...props}
    >
      <Checkbox.Indicator className='h-full w-full bg-text'></Checkbox.Indicator>
    </Checkbox.Root>
  );
}
