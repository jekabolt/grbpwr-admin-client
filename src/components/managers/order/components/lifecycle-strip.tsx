import type { common_OrderFull, common_OrderStatusEnum } from 'api/proto-http/frontend';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { Pill } from 'ui/components/pill';
import { Stepper, type Step } from 'ui/components/stepper';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';

// The happy path every order walks. Anything else (cancelled, the refund states) is
// appended only once it has actually happened, so a normal order never renders a rail
// of statuses it will never reach.
const LIFECYCLE: common_OrderStatusEnum[] = [
  'ORDER_STATUS_ENUM_PLACED',
  'ORDER_STATUS_ENUM_AWAITING_PAYMENT',
  'ORDER_STATUS_ENUM_CONFIRMED',
  'ORDER_STATUS_ENUM_SHIPPED',
  'ORDER_STATUS_ENUM_DELIVERED',
];

// Statuses that end the lifecycle — once one is reached nothing after it is "pending".
const TERMINAL: string[] = [
  'ORDER_STATUS_ENUM_CANCELLED',
  'ORDER_STATUS_ENUM_REFUNDED',
  'ORDER_STATUS_ENUM_DELIVERED',
];

export function statusLabel(status?: string): string {
  return (status ?? '')
    .replace('ORDER_STATUS_ENUM_', '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
}

function clockTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// How long the order has been sitting where it is. This is the whole point of the strip:
// it turns a log nobody opens into a number that reads as an alarm.
function dwell(since?: string): { label: string; days: number } | null {
  if (!since) return null;
  const from = new Date(since).getTime();
  if (Number.isNaN(from)) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - from) / 60000));
  const days = Math.floor(minutes / 1440);
  if (minutes < 60) return { label: `${minutes}m`, days };
  if (minutes < 2880) return { label: `${Math.floor(minutes / 60)}h`, days };
  return { label: `${days}d`, days };
}

/**
 * ordHist v3 — the lifecycle as a permanent strip, not a popover behind an `i`.
 *
 * `statusHistory[]` carries `changedBy` and `notes`; both were dropped on the floor by the
 * old popover. `changedBy` is now shown for the current status, `notes` rides along as the
 * step's title so it is at least reachable.
 */
export function LifecycleStrip({
  orderDetails,
  orderStatus,
}: {
  orderDetails?: common_OrderFull;
  orderStatus?: string;
}) {
  const history = orderDetails?.statusHistory ?? [];
  if (!history.length && !orderStatus) return null;

  // Last entry wins per status — a status can be re-entered (shipped → returned → shipped).
  const reached = new Map<string, { changedAt?: string; changedBy?: string; notes?: string }>();
  history.forEach((h) => {
    if (!h.status) return;
    reached.set(h.status, { changedAt: h.changedAt, changedBy: h.changedBy, notes: h.notes });
  });

  const ordered = [...history]
    .filter((h) => !!h.changedAt)
    .sort((a, b) => new Date(a.changedAt!).getTime() - new Date(b.changedAt!).getTime());
  const latest = ordered[ordered.length - 1];
  const currentEnum =
    latest?.status ??
    LIFECYCLE.find((s) => statusLabel(s) === (orderStatus ?? '').toLowerCase().trim());

  // Off-path statuses only appear once they happened, and always at the end of the strip.
  const offPath = history
    .map((h) => h.status)
    .filter((s): s is common_OrderStatusEnum => !!s && !LIFECYCLE.includes(s));
  const rail: common_OrderStatusEnum[] = [
    ...LIFECYCLE,
    ...offPath.filter((s, i) => offPath.indexOf(s) === i),
  ];

  const currentIndex = currentEnum ? rail.indexOf(currentEnum) : -1;

  const steps: Step[] = rail.map((s, i) => {
    const entry = reached.get(s);
    const time = clockTime(entry?.changedAt);
    return {
      label: (
        <span title={entry?.notes || formatDateShort(entry?.changedAt, true) || undefined}>
          {statusLabel(s)}
          {time ? ` ${time}` : ''}
        </span>
      ),
      done: currentIndex >= 0 ? i < currentIndex : !!entry,
      current: i === currentIndex,
    };
  });

  const sitting = dwell(latest?.changedAt);
  const isTerminal = !!currentEnum && TERMINAL.includes(currentEnum);
  const tone = isTerminal || !sitting ? 'mut' : sitting.days > 14 ? 'warn' : sitting.days > 3 ? 'attention' : 'mut';
  const changedBy = currentEnum ? reached.get(currentEnum)?.changedBy : undefined;

  return (
    <Toolbar>
      <Stepper steps={steps} />
      <ToolbarSpacer />
      {changedBy && (
        <Text size='micro' variant='label' component='span' className='uppercase'>
          by {changedBy}
        </Text>
      )}
      {sitting && currentEnum && (
        <Pill tone={tone}>
          {sitting.label} in {statusLabel(currentEnum)}
        </Pill>
      )}
    </Toolbar>
  );
}
