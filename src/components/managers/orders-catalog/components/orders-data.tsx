import { common_Dictionary } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { formatDateTime, getOrderStatusName, getStatusColor } from './utility';

export const orderData = (dictionary: common_Dictionary | undefined) => [
  { field: 'id', headerName: 'Order ID', width: 120 },
  {
    field: 'orderStatusId',
    headerName: 'Order status',
    width: 180,
    renderCell: (params: any) => {
      const status = getOrderStatusName(dictionary, params.value);
      return <div className={cn(getStatusColor(status), 'w-full h-full')}>{status}</div>;
    },
  },
  {
    field: 'placed',
    headerName: 'Placed',
    flex: 1,
    minWidth: 180,
    width: 250,
    renderCell: (params: any) => {
      return formatDateTime(params.value);
    },
  },
  {
    field: 'modified',
    headerName: 'Modified',
    flex: 1,
    minWidth: 180,
    width: 300,
    renderCell: (params: any) => {
      return formatDateTime(params.value);
    },
  },
  {
    field: 'totalPrice',
    headerName: 'Total',
    width: 180,
    flex: 0.5,
    minWidth: 100,
    valueGetter: (params: any) => `${params.value} ${dictionary?.baseCurrency}`,
  },
];
