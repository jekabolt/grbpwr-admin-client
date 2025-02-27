import {
  common_OrderFactor,
  common_OrderStatusEnum,
  common_PaymentMethodNameEnum,
  ListOrdersRequest,
} from 'api/proto-http/admin';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Email from './filter-components/email';
import Order from './filter-components/order';
import OrderId from './filter-components/order-id';
import Payment from './filter-components/payment';
import Status from './filter-components/status';
import { FilterProps } from './interfaces';
export default function Filter({ onSearch, loading = false }: FilterProps) {
  const [orderFactor, setOrderFactor] = useState<string>('');
  const [payment, setPayment] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  const handleSearch = () => {
    if (onSearch) {
      const filters: Partial<ListOrdersRequest> = {};
      if (orderFactor) {
        filters.orderFactor = orderFactor as common_OrderFactor;
      }

      if (payment) {
        filters.paymentMethod = payment as common_PaymentMethodNameEnum;
      }

      if (status) {
        filters.status = status as common_OrderStatusEnum;
      }

      if (orderId) {
        filters.orderId = parseInt(orderId);
      }

      if (email) {
        filters.email = email;
      }

      onSearch(filters);
    }
  };

  return (
    <div className='flex lg:flex-row flex-col gap-3 items-center'>
      <Order value={orderFactor} onChange={setOrderFactor} disabled={loading} />
      <Payment value={payment} onChange={setPayment} disabled={loading} />
      <Status value={status} onChange={setStatus} disabled={loading} />
      <OrderId value={orderId} onChange={setOrderId} disabled={loading} />
      <Email value={email} onChange={setEmail} disabled={loading} />
      <Button size='lg' onClick={handleSearch} disabled={loading}>
        Search
      </Button>
    </div>
  );
}
