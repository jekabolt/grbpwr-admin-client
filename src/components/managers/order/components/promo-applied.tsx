import { common_OrderFull } from 'api/proto-http/frontend';
import Text from 'ui/components/text';

interface Props {
  orderDetails: common_OrderFull | undefined;
}

export function PromoApplied({ orderDetails }: Props) {
  const promoCode = orderDetails?.promoCode?.promoCodeInsert;
  return (
    promoCode && (
      <div className='flex flex-row lg:flex-col gap-2'>
        <Text variant='uppercase' className='font-bold'>
          {`promo applied: ${promoCode.code} - ${promoCode.discount?.value}%`}
        </Text>
        {promoCode.freeShipping && (
          <Text variant='uppercase' size='small'>
            free ship
          </Text>
        )}
        {promoCode.voucher && (
          <Text variant='uppercase' size='small'>
            voucher
          </Text>
        )}
      </div>
    )
  );
}
