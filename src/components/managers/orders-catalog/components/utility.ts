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
      return 'bg-sky-200';
    case 'CONFIRMED':
      return 'bg-blue-300';
    case 'SHIPPED':
      return 'bg-teal-200';
    case 'DELIVERED':
      return 'bg-green-300';
    case 'CANCELLED':
      return 'bg-red-300';
    case 'REFUNDED':
      return 'bg-gray-700';
    default:
      return 'bg-white';
  }
}
