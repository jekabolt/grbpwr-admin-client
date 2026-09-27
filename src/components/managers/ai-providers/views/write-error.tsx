import { cn } from 'lib/utility';
import Text from 'ui/components/text';

// THE REFUSAL STANDS BESIDE THE CONTROL THAT MADE IT. A write refused by the server says why in one
// micro line directly under that control — the switch, the key field, the select, the route — and
// keeps saying it until that control's next write. The snackbar still speaks too, but it fades; this
// line is what an operator reads when they look back at a control that snapped back.
export function WriteError({
  text,
  id,
  className,
}: {
  text: string | null | undefined;
  /** `data-write-error`: which control the line belongs to. */
  id: string;
  className?: string;
}) {
  if (!text) return null;
  return (
    <Text
      size='micro'
      variant='errorLabel'
      role='alert'
      data-write-error={id}
      className={cn('max-w-96', className)}
    >
      ! {text}
    </Text>
  );
}
