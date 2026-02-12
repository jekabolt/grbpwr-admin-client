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
  return dictionary?.orderStatuses
    ?.find((x) => x.id === orderStatusId)
    ?.name?.replace('ORDER_STATUS_ENUM_', '')
    .replace('_', ' ');
}

export function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'PLACED':
      return 'bg-white';
    case 'AWAITING PAYMENT':
      return 'bg-sky-500';
    case 'CONFIRMED':
      return 'bg-blue-500';
    case 'SHIPPED':
      return 'bg-teal-500';
    case 'DELIVERED':
      return 'bg-green-500';
    case 'CANCELLED':
      return 'bg-red-500';
    case 'REFUNDED':
      return 'bg-gray-500';
    case 'PENDING RETURN':
      return 'bg-yellow-500';
    case 'REFUND IN PROGRESS':
      return 'bg-gray-500';
    default:
      return 'bg-white';
  }
}

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
