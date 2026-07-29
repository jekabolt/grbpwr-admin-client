import { Pill } from 'ui/components/pill';
import { Step, Stepper } from 'ui/components/stepper';

/**
 * ordStatus v3 — "lifecycle micro-stepper".
 *
 * An order that is walking the happy path has a POSITION, so it renders as a
 * stepper: placed › confirmed › shipped › delivered. An order that has left the
 * happy path has no position — only a word — so it renders as a `Pill`.
 *
 * This replaces the ten-hue `getStatusColor` fill map that used to live in
 * ./utility.ts. Colour now carries meaning instead of identity:
 *   red  (`warn`) — a human has to act before this order can move again
 *   grey (`mut`)  — the order is closed and will not move again
 */

/** The path an order walks when nothing goes wrong. Order matters. */
export const ORDER_HAPPY_PATH = ['PLACED', 'CONFIRMED', 'SHIPPED', 'DELIVERED'] as const;

/** Off-path and blocking: somebody has to do something. */
const NEEDS_ACTION: readonly string[] = [
  'AWAITING PAYMENT',
  'PENDING RETURN',
  'REFUND IN PROGRESS',
];

/**
 * Accepts either the raw enum (`ORDER_STATUS_ENUM_REFUND_IN_PROGRESS`) or the
 * dictionary-resolved name (`REFUND IN PROGRESS`) and returns the resolved form.
 */
export function normalizeStatusName(status: string | undefined): string {
  return (status ?? '')
    .replace('ORDER_STATUS_ENUM_', '')
    .replace(/_/g, ' ')
    .toUpperCase()
    .trim();
}

export function isHappyPath(status: string | undefined): boolean {
  return (ORDER_HAPPY_PATH as readonly string[]).includes(normalizeStatusName(status));
}

export function OrderStatus({ status, className }: { status?: string; className?: string }) {
  const key = normalizeStatusName(status);

  if (!key) {
    return (
      <Pill tone='mut' className={className}>
        unknown
      </Pill>
    );
  }

  const index = (ORDER_HAPPY_PATH as readonly string[]).indexOf(key);
  if (index >= 0) {
    const last = ORDER_HAPPY_PATH.length - 1;
    const steps: Step[] = ORDER_HAPPY_PATH.map((label, i) => ({
      label: label.toLowerCase(),
      // The final step is never "current": a delivered order has arrived, it is not
      // sitting in delivery. All four read as done, which is the whole point of it.
      done: i < index || (i === index && index === last),
      current: i === index && index !== last,
    }));
    return <Stepper steps={steps} className={className} />;
  }

  // Everything else — cancelled, refunded, partially refunded, and whatever the
  // dictionary grows next — is closed or unknown, and both read neutral grey.
  return (
    <Pill tone={NEEDS_ACTION.includes(key) ? 'warn' : 'mut'} className={className}>
      {key.toLowerCase()}
    </Pill>
  );
}
