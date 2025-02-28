import {
  formatDateTime,
  getStatusColor,
} from 'components/managers/orders-catalog/components/utility';
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
      {/* className={styles.hide_cell} */}
      <Text variant='uppercase' size='small'>{`order id: ${orderDetails?.order?.id}`}</Text>

      {/* className={isPrinting ? styles.hide_cell : ''} */}
      <Text variant='uppercase' size='small' className='flex items-center'>
        {[
          'uuid: ',
          <CopyToClipboard key='copy' text={orderDetails?.order?.uuid || ''} cutText={true} />,
        ]}
      </Text>

      <Text
        variant='uppercase'
        className={statusColor}
        size='small'
        // className={isPrinting ? styles.hide_cell : styles.non_print_state}
      >
        {`status: ${orderStatus}`}
      </Text>

      {/* className={styles.support} */}
      <Text variant='uppercase' size='small'>{`company adress: adress adress adress`}</Text>

      <Text variant='uppercase' size='small'>{`placed: ${orderPlaced}`}</Text>

      {/* className={styles.hide_cell} */}
      <Text variant='uppercase' size='small'>{`modified: ${orderModified}`}</Text>
    </div>
  );
}
