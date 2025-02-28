import {
  formatDateTime,
  getStatusColor,
} from 'components/managers/orders-catalog/components/utility';
import { cn } from 'lib/utility';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';
import { OrderDescriptionProps } from '../interface';
// import styles from 'styles/order.scss';

export function Description({ orderDetails, orderStatus, isPrinting }: OrderDescriptionProps) {
  const statusColor = getStatusColor(orderStatus);
  const orderPlaced = formatDateTime(orderDetails?.order?.placed);
  const orderModified = formatDateTime(orderDetails?.order?.modified);
  return (
    <div className='flex flex-col lg:flex-row lg:justify-between'>
      <Text
        variant='uppercase'
        size='small'
        className={cn('block', {
          'print:hidden': isPrinting,
        })}
      >
        {`order id: ${orderDetails?.order?.id}`}
      </Text>

      <Text
        variant='uppercase'
        size='small'
        className={cn('flex items-center', {
          'print:hidden': isPrinting,
        })}
      >
        {[
          'uuid: ',
          <CopyToClipboard key='copy' text={orderDetails?.order?.uuid || ''} cutText={true} />,
        ]}
      </Text>

      <Text
        variant='uppercase'
        className={cn(statusColor, {
          'print:hidden': isPrinting,
        })}
        size='small'
      >
        {`status: ${orderStatus}`}
      </Text>

      <Text
        variant='uppercase'
        size='small'
        className={cn('block', {
          'print:hidden': isPrinting,
        })}
      >{`company adress: adress adress adress`}</Text>

      <Text variant='uppercase' size='small'>{`placed: ${orderPlaced}`}</Text>

      <Text
        variant='uppercase'
        size='small'
        className={cn('block', {
          'print:hidden': isPrinting,
        })}
      >{`modified: ${orderModified}`}</Text>
    </div>
  );
}
