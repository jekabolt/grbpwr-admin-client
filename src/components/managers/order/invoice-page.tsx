import { adminService } from 'api/api';
import { getOrderStatusName } from 'components/managers/orders-catalog/components/utility';
import { ROUTES } from 'constants/routes';
import { useQuery } from '@tanstack/react-query';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { InvoiceDocument } from './components/invoice-document';

// Standalone invoice print surface — renders OUTSIDE the app Layout (ProtectedBare in
// index.tsx), so the document is plain top-level content in normal flow and printing needs
// no isolation tricks. Same approach as the tech pack print page (see tech-card/print-page).
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  .invoice-toolbar { display: none !important; }
  .invoice-doc { border: 0 !important; box-shadow: none !important; }
  .invoice-doc > * { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export function OrderInvoicePrint() {
  const { uuid } = useParams<{ uuid: string }>();
  const { dictionary } = useDictionary();

  const {
    data: orderDetails,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['order-invoice', uuid],
    queryFn: async () => (await adminService.GetOrderByUUID({ orderUuid: uuid || '' })).order,
    enabled: !!uuid,
  });

  const orderStatus = getOrderStatusName(dictionary, orderDetails?.order?.orderStatusId);

  return (
    <div className='mx-auto flex max-w-[230mm] flex-col gap-4 p-4 pb-10'>
      <style>{PRINT_CSS}</style>

      <div className='invoice-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='secondary' size='lg'>
            <Link to={uuid ? `/orders/${uuid}` : ROUTES.orders}>← back</Link>
          </Button>
          <Text variant='uppercase' size='large'>
            invoice — pdf
          </Text>
        </div>
        <div className='flex items-center gap-3'>
          <Text variant='inactive' size='small'>
            choose “save as PDF” as the destination
          </Text>
          <Button
            variant='main'
            size='lg'
            className='uppercase'
            disabled={!orderDetails}
            onClick={() => window.print()}
          >
            save as pdf
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading order…
          </Text>
        </div>
      ) : isError || !orderDetails ? (
        <div className='flex flex-col items-center gap-4 py-20'>
          <Text variant='inactive' className='uppercase'>
            order not found
          </Text>
          <Button asChild variant='main' size='lg' className='uppercase'>
            <Link to={ROUTES.orders}>← back to orders</Link>
          </Button>
        </div>
      ) : (
        <div className='invoice-doc border border-textInactiveColor shadow-sm'>
          <InvoiceDocument
            orderDetails={orderDetails}
            orderStatus={orderStatus}
            dictionary={dictionary}
          />
        </div>
      )}
    </div>
  );
}
