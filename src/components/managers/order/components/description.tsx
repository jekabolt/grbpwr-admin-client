import {
  formatDateTime,
  getStatusColor,
} from 'components/managers/orders-catalog/components/utility';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { OrderDescriptionProps } from '../interface';

export function Description({ orderDetails, orderStatus, isPrinting }: OrderDescriptionProps) {
  const statusColor = getStatusColor(orderStatus);
  const orderPlaced = formatDateTime(orderDetails?.order?.placed);
  const orderModified = formatDateTime(orderDetails?.order?.modified);
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

      <Text variant='uppercase'>{`order reference: ${orderDetails?.order?.uuid}`}</Text>

      <div className='flex items-center gap-2 print:hidden'>
        <Text variant='uppercase'>status:</Text>
        <Text variant='uppercase' className={cn(statusColor)}>
          {orderStatus}
        </Text>
      </div>

      <Text variant='uppercase'>{`placed: ${orderPlaced}`}</Text>

      <Text
        variant='uppercase'
        className={cn('block', {
          'print:hidden': isPrinting,
        })}
      >{`modified: ${orderModified}`}</Text>
    </div>
  );
}
