import { common_BuyerInsert } from 'api/proto-http/frontend';
import { STATUS } from 'constants/filter';
import { cn } from 'lib/utility';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';

interface Props {
  buyer: common_BuyerInsert | undefined;
  isPrinting: boolean;
}

export function Buyer({ buyer, isPrinting }: Props) {
  return (
    <div className='flex flex-col gap-1'>
      <Text variant='uppercase' className='font-bold'>
        buyer information:
      </Text>
      <Text className='flex items-center gap-2' variant='uppercase'>
        {[
          `email: `,
          <Text component='span' className='lowercase'>
            <CopyToClipboard text={buyer?.email || ''} />
          </Text>,
        ]}
      </Text>

      <Text variant='uppercase'>{`first name: ${buyer?.firstName}`}</Text>

      <Text variant='uppercase'>{`last name: ${buyer?.lastName}`}</Text>

      <Text variant='uppercase'>{`phone: ${buyer?.phone}`}</Text>

      <Text
        variant='uppercase'
        className={cn({
          hidden: isPrinting,
        })}
      >
        {[
          `receive promo emails: `,
          buyer?.receivePromoEmails ? (
            <Text component='span' className={STATUS.confirmed}>
              yes
            </Text>
          ) : (
            <Text component='span' className={STATUS.denied}>
              no
            </Text>
          ),
        ]}
      </Text>
    </div>
  );
}
