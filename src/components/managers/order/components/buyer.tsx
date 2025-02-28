import { common_BuyerInsert } from 'api/proto-http/frontend';
import { STATUS } from 'components/managers/order/interface';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';
// import styles from 'styles/order.scss';

interface Props {
  buyer: common_BuyerInsert | undefined;
  isPrinting: boolean;
}

export function Buyer({ buyer, isPrinting }: Props) {
  return (
    <div className='grid gap-2 w-full'>
      <Text variant='uppercase' className='font-bold'>
        buyer information:
      </Text>
      <Text className='flex items-center gap-2' variant='uppercase' size='small'>
        {[
          `email: `,
          <Text component='span' className='lowercase'>
            <CopyToClipboard text={buyer?.email || ''} />
          </Text>,
        ]}
      </Text>

      <Text variant='uppercase' size='small'>{`first name: ${buyer?.firstName}`}</Text>

      <Text variant='uppercase' size='small'>{`last name: ${buyer?.lastName}`}</Text>

      <Text variant='uppercase' size='small'>{`phone: ${buyer?.phone}`}</Text>

      {/*   // className={isPrinting ? styles.hide_cell : styles.non_print_state} */}
      <Text variant='uppercase' size='small'>
        {[
          `receive promo emails: `,
          buyer?.receivePromoEmails ? (
            <Text component='span' size='small' className={STATUS.confirmed}>
              yes
            </Text>
          ) : (
            <Text component='span' size='small' className={STATUS.denied}>
              no
            </Text>
          ),
        ]}
      </Text>
    </div>
  );
}
