import {
  formatDateShort,
  getStatusColor,
} from 'components/managers/orders-catalog/components/utility';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { OrderDescriptionProps } from '../interface';
import { StatusHistory } from './status-history';

export function Description({ orderDetails, orderStatus, isPrinting }: OrderDescriptionProps) {
  const statusColor = getStatusColor(orderStatus);
  const orderPlaced = formatDateShort(orderDetails?.order?.placed, true);

  return (
    <div className='flex flex-col lg:flex-row lg:justify-between'>
      <Text
        variant='uppercase'
        className={cn('block', {
          'print:hidden': isPrinting,
        })}
      >
        {`order id: ${orderDetails?.order?.id}`}
      </Text>

      <Text variant='uppercase'>
        {`order reference: `}
        <span className='select-all'>{orderDetails?.order?.uuid}</span>
      </Text>

      <div className='flex items-center gap-2 print:hidden'>
        <Text variant='uppercase'>status:</Text>
        <Text variant='uppercase' className={cn(statusColor)}>
          {orderStatus}
        </Text>
        <StatusHistory orderDetails={orderDetails} />
      </div>

      <Text variant='uppercase'>{`placed: ${orderPlaced}`}</Text>
    </div>
  );
}
