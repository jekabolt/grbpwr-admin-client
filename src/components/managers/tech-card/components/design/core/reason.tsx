import { cn } from 'lib/utility';
import Text from 'ui/components/text';

/**
 * THE VISIBLE REASON UNDER A DEAD DOOR.
 *
 * `InertDoor` (`../bench-slot.tsx`) carries its reason in `title` and `data-inert` — legible to a
 * hover and to a probe, invisible to a glance. This is the same sentence PRINTED: micro, muted,
 * one line under the control it explains. The door stays as it was; this only adds the caption.
 */
export function Reason({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text size='micro' variant='label' component='span' className={cn('block min-w-0', className)}>
      {children}
    </Text>
  );
}
