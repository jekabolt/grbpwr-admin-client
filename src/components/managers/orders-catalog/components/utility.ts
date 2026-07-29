import { common_Dictionary } from 'api/proto-http/admin';

export function formatDateTime(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${formattedDate}, ${formattedTime}`;
}

export function formatDate(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function getOrderStatusName(
  dictionary: common_Dictionary | undefined,
  orderStatusId: number | undefined,
): string | undefined {
  if (!orderStatusId) {
    return undefined;
  }
  return (
    dictionary?.orderStatuses
      ?.find((x) => x.id === orderStatusId)
      ?.name?.replace('ORDER_STATUS_ENUM_', '')
      // /_/g, not '_': a plain replace only swaps the FIRST underscore, so
      // REFUND_IN_PROGRESS came out as "REFUND IN_PROGRESS" and never matched the
      // "REFUND IN PROGRESS" literals the order card compares against (the refund
      // button was silently missing on exactly those orders).
      .replace(/_/g, ' ')
  );
}

/**
 * Status is expressed by `OrderStatus` (ui/components/stepper + Pill), not by a fill
 * colour — see ./order-status.tsx. The old `getStatusColor` map lived here and handed
 * out ten unranked Tailwind palette hues, one of which (`bg-white-500`, for
 * PARTIALLY REFUNDED) was not a real class and rendered as nothing at all.
 */

export function formatDateShort(value: string | undefined, withTime = false): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();

  if (!withTime) {
    return `${day} ${month} ${year}`;
  }

  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return `${day} ${month} ${year}, ${formattedTime}`;
}
