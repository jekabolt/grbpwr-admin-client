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

export function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'PLACED':
      return '#ffffff';
    case 'AWAITING PAYMENT':
      return '#73eaff80';
    case 'CONFIRMED':
      return '#0800ff80';
    case 'SHIPPED':
      return '#00ffa280';
    case 'DELIVERED':
      return '#008f0080';
    case 'CANCELLED':
      return '#fc000080';
    case 'REFUNDED':
      return '#29292980';
    default:
      return '#ffffff'; // Default color if status doesn't match
  }
}
