import { cn } from 'lib/utility';
import { useState } from 'react';
import { Input, Text } from 'ui';

/**
 * CUSTOM-BOARDS (owner OK 21.10, mockup «+ board» / «rename»): a board name typed in place —
 * in the rail on desktop, in place of the board select on the phone. Enter saves, Esc cancels;
 * the «enter» word at the right edge is the only hint.
 */
export function BoardNameField({
  initial = '',
  name,
  busy,
  onSubmit,
  onCancel,
  className,
  inputClassName,
}: {
  initial?: string;
  name: string;
  busy?: boolean;
  /** Called with the trimmed name, only when it is non-empty and differs from `initial`. */
  onSubmit: (value: string) => void;
  onCancel: () => void;
  className?: string;
  /** Type of the name inside: the phone select is uppercase, the rail is not. */
  inputClassName?: string;
}) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    const v = value.trim();
    if (!v || v === initial.trim()) return onCancel();
    onSubmit(v);
  };
  return (
    <div className={cn('relative flex', className)}>
      <Input
        name={name}
        aria-label='board name'
        value={value}
        autoFocus
        disabled={busy}
        enterKeyHint='done'
        maxLength={64}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        className={cn('flex-1 border-textColor pr-12', inputClassName)}
      />
      <Text
        size='nano'
        variant='label'
        component='span'
        className='pointer-events-none absolute inset-y-0 right-2 flex items-center uppercase tracking-label'
      >
        enter
      </Text>
    </div>
  );
}
