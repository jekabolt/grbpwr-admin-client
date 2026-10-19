import * as DialogPrimitives from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { cn } from 'lib/utility';
import { BackLink, Button, PopoverContent, Text } from 'ui';

/**
 * ОБОЛОЧКИ ФОРМЫ ЗАДАЧИ НА ТЕЛЕФОНЕ — локальные для раздела задач, не примитивы `ui`.
 *
 * На телефоне заведение задачи — страница во весь экран (← назад, заголовок, доска; снизу одна
 * кнопка), а свойства выбираются шторкой снизу. На десктопе та же шторка — поповер у чипа.
 * Обе сделаны на тех же Radix Dialog / Popover, что и `ConfirmationModal` / `PopoverContent`.
 */

export function TaskPageShell({
  open,
  onRequestClose,
  title,
  headerRight,
  footer,
  children,
  onOpenAutoFocus,
}: {
  open: boolean;
  /** ← back, Escape: the caller decides (it may ask about an unsaved draft first). */
  onRequestClose: () => void;
  title: string;
  headerRight?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={(o) => !o && onRequestClose()}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Content
          aria-describedby={undefined}
          onOpenAutoFocus={onOpenAutoFocus}
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-bgColor text-textColor'
        >
          <div className='flex min-h-13 shrink-0 items-center gap-2 border-b border-borderColor pl-2 pr-2'>
            <BackLink className='min-h-11 shrink-0 px-2' onClick={onRequestClose} />
            <DialogPrimitives.Title asChild>
              <Text
                size='micro'
                variant='uppercase'
                tracking='group'
                component='span'
                className='min-w-0 flex-1 truncate font-bold'
              >
                {title}
              </Text>
            </DialogPrimitives.Title>
            {headerRight}
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-4'>{children}</div>
          <div className='shrink-0 border-t border-borderColor bg-bgColor px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]'>
            {footer}
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}

/**
 * Выбор свойства: шторка снизу на телефоне, поповер у чипа на десктопе. `trigger` — один
 * элемент (чип), он получает обработчики через Radix `asChild`.
 */
export function PickerSheet({
  phone,
  open,
  onOpenChange,
  title,
  trigger,
  children,
}: {
  phone: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  if (phone) {
    return (
      <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitives.Trigger asChild>{trigger}</DialogPrimitives.Trigger>
        <DialogPrimitives.Portal container={document.body}>
          <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
          <DialogPrimitives.Content
            aria-describedby={undefined}
            className='fixed inset-x-0 bottom-0 z-[var(--z-modal)] flex max-h-[75vh] flex-col border-t-2 border-textColor bg-bgColor pb-[env(safe-area-inset-bottom)] text-textColor'
          >
            <DialogPrimitives.Title asChild>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='px-4 pt-3 pb-2 uppercase'
              >
                {title}
              </Text>
            </DialogPrimitives.Title>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4'>{children}</div>
          </DialogPrimitives.Content>
        </DialogPrimitives.Portal>
      </DialogPrimitives.Root>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <PopoverContent title={title} noTail className='w-72'>
        {children}
      </PopoverContent>
    </Popover.Root>
  );
}

/** One choice inside a `PickerSheet`: a full-width row, 48px on the phone. */
export function OptionRow({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      type='button'
      variant='default'
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-12 w-full items-center gap-2.5 border-b border-hairline px-4 text-left last:border-b-0 md:min-h-8 md:px-1',
        className,
      )}
    >
      {children}
      {selected && (
        <span aria-hidden className='ml-auto'>
          ✓
        </span>
      )}
    </Button>
  );
}
