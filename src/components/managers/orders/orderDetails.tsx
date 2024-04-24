import LaunchIcon from '@mui/icons-material/Launch';
import { Button, Grid, TextField } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { DataGrid, GridCallbackDetails, GridPaginationModel } from '@mui/x-data-grid';
import { MakeGenerics, useMatch, useNavigate } from '@tanstack/react-location';
import { getDictionary } from 'api/admin';
import {
  deliveredOrderUpdate,
  getOrderById,
  refundOrderUpdate,
  setTrackingNumberUpdate,
} from 'api/orders';
import { common_Dictionary, common_OrderFull } from 'api/proto-http/admin';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { useEffect, useState } from 'react';
import { formatDateTime, getOrderStatusName, getStatusColor } from './utility';

// Define the expected params structure
export type OrderDetailsPathProps = MakeGenerics<{
  Params: {
    id: string;
  };
}>;

export const OrderDetails = () => {
  const {
    params: { id },
  } = useMatch<OrderDetailsPathProps>();

  const [orderDetails, setOrderDetails] = useState<common_OrderFull | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);

  const [showBilling, setShowBilling] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [orderStatus, setOrderStatus] = useState<string | undefined>('');

  const fetchDictionary = async () => {
    const response = await getDictionary({});
    setDictionary(response.dictionary);
  };

  const fetchOrderDetails = async () => {
    setIsLoading(true);
    try {
      const response = await getOrderById({ orderId: parseInt(id) });
      setOrderDetails(response.order);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
    fetchDictionary();
  }, [id]);

  useEffect(() => {
    setOrderStatus(getOrderStatusName(dictionary, orderDetails?.order?.orderStatusId));
  }, [orderDetails, dictionary]);

  const navigate = useNavigate();

  const orderItemsColumns = [
    {
      field: 'thumbnail',
      headerName: '',
      width: 300,
      renderCell: (params: any) => (
        <img src={params.value} alt='product' style={{ height: '100px', width: 'auto' }} />
      ),
    },
    {
      field: 'productName',
      headerName: 'PRODUCT NAME',
      width: 300,
    },
    {
      field: 'sku',
      headerName: 'SKU',
      width: 300,
    },
    {
      field: 'quantity',
      headerName: 'QUANTITY',
      width: 200,
      valueGetter: (_params: any, row: any) => {
        return row.orderItem.quantity;
      },
    },
    {
      field: 'size',
      headerName: 'SIZE',
      width: 200,
      valueGetter: (_params: any, row: any) => {
        return dictionary?.sizes
          ?.find((x) => x.id === row.orderItem.sizeId)
          ?.name?.replace('SIZE_ENUM_', '');
      },
    },
    {
      field: 'productPrice',
      headerName: 'PRICE',
      width: 200,
      valueGetter: (params: any, row: any) =>
        `${params * row.orderItem.quantity} ${dictionary?.baseCurrency}`,
    },
    {
      field: 'productLink',
      headerName: 'LINK',
      width: 100,
      valueGetter: (_params: any, row: any) => {
        return row.orderItem.productId;
      },
      renderCell: (params: any) => (
        <IconButton
          aria-label='explore product'
          onClick={() => {
            navigate({ to: `${ROUTES.singleProduct}/${params.value}` });
          }}
        >
          <LaunchIcon />
        </IconButton>
      ),
    },
  ];

  const onPaginationChange = (model: GridPaginationModel, details: GridCallbackDetails) => {
    setPage(model.page);
    setPageSize(model.pageSize);
  };

  const showBillingButtonClick = () => {
    setShowBilling(true);
  };

  const handleTrackingNumberChange = (event: any) => {
    setTrackingNumber(event.target.value);
  };

  const saveTrackingNumber = async () => {
    const response = await setTrackingNumberUpdate({
      orderId: orderDetails?.order?.id,
      trackingCode: trackingNumber,
    });
    if (response) {
      fetchOrderDetails();
    }
  };

  const markAsDelivered = async () => {
    const response = await deliveredOrderUpdate({
      orderId: orderDetails?.order?.id,
    });
    if (response) {
      fetchOrderDetails();
    }
  };

  const refundOrder = async () => {
    const response = await refundOrderUpdate({
      orderId: orderDetails?.order?.id,
    });
    if (response) {
      fetchOrderDetails();
    }
  };

  let promoApplied = (() => {
    const promoCode = orderDetails?.promoCode?.promoCodeInsert;
    return (
      promoCode && (
        <div>
          PROMO APPLIED: {promoCode.code} - {promoCode.discount?.value}%
          {promoCode.freeShipping && ', FREE SHIP'}
          {promoCode.voucher && ', VOUCHER'}
        </div>
      )
    );
  })();

  let payment = (() => {
    const payment = orderDetails?.payment;
    return (
      payment && (
        <div>
          <div>PAYMENT:</div>
          <div style={{ display: 'flex' }}>
            STATUS:&nbsp;
            {payment.paymentInsert?.isTransactionDone ? (
              <div style={{ backgroundColor: '#008f0080' }}>PAYED</div>
            ) : (
              <div style={{ backgroundColor: '#fc000080' }}>UNPAYED</div>
            )}
          </div>
          {payment.modifiedAt && <div>MADE AT: {formatDateTime(payment.modifiedAt)}</div>}
          {payment.paymentInsert?.paymentMethod && (
            <div>
              PAYMENT METHOD:{' '}
              {payment.paymentInsert?.paymentMethod.replace('PAYMENT_METHOD_NAME_ENUM_', '')}
            </div>
          )}
          {payment.paymentInsert?.transactionAmount && (
            <div>
              AMOUNT: {payment.paymentInsert?.transactionAmount.value}{' '}
              {payment.paymentInsert?.transactionAmountPaymentCurrency?.value}
            </div>
          )}
          {payment.paymentInsert?.payer && (
            <div style={{ display: 'flex' }}>
              PAYER:&nbsp;
              <CopyToClipboard text={payment.paymentInsert?.payer} />
            </div>
          )}
          {payment.paymentInsert?.payee && (
            <div style={{ display: 'flex' }}>
              PAYEE:&nbsp;
              <CopyToClipboard text={payment.paymentInsert?.payee} />
            </div>
          )}
        </div>
      )
    );
  })();

  let shipping = (() => {
    const shipping = orderDetails?.shipping?.addressInsert;
    const buyer = orderDetails?.buyer?.buyerInsert;
    return (
      <div>
        <div>SHIPPING:</div>
        {orderDetails?.shipment?.trackingCode && (
          <div>TRACKING NUMBER: {orderDetails?.shipment?.trackingCode}</div>
        )}
        <Grid container spacing={2}>
          {' '}
          {/* Adds spacing between items */}
          <Grid item xs={3}>
            {shipping && (
              <div>
                {shipping.street && shipping.houseNumber && (
                  <div>
                    STREET ADDRESS: {shipping.street} {shipping.houseNumber}
                    {shipping.apartmentNumber ? ', ' + shipping.apartmentNumber : ''}
                  </div>
                )}
                {shipping.city && <div>CITY: {shipping.city}</div>}
                {shipping.state && <div>STATE: {shipping.state}</div>}
                {shipping.country && <div>COUNTRY: {shipping.country}</div>}
                {shipping.postalCode && <div>POSTAL CODE: {shipping.postalCode}</div>}
              </div>
            )}
          </Grid>
          <Grid item xs={3}>
            {buyer && (
              <div>
                {buyer?.email && (
                  <div style={{ display: 'flex' }}>
                    EMAIL:&nbsp;
                    <CopyToClipboard text={buyer.email} />
                  </div>
                )}
                {buyer?.firstName && <div>FIRST NAME: {buyer.firstName}</div>}
                {buyer?.lastName && <div>LAST NAME: {buyer.lastName}</div>}
                {buyer?.phone && <div>PHONE: {buyer.phone}</div>}
                <div style={{ display: 'flex' }}>
                  RECIEVE PROMO EMAILS:&nbsp;
                  {buyer?.receivePromoEmails ? (
                    <div style={{ backgroundColor: '#008f0080' }}>YES</div>
                  ) : (
                    <div style={{ backgroundColor: '#fc000080' }}>NO</div>
                  )}
                </div>
              </div>
            )}
          </Grid>
        </Grid>
      </div>
    );
  })();

  let billing = (() => {
    const billing = orderDetails?.billing?.addressInsert;
    return (
      billing && (
        <div>
          {showBilling ? (
            <div>
              <div>BILLING ADDRESS:</div>
              {billing.street && billing.houseNumber && (
                <div>
                  STREET ADDRESS: {billing.street} {billing.houseNumber}
                  {billing.apartmentNumber ? ', ' + billing.apartmentNumber : ''}
                </div>
              )}
              {billing.city && <div>CITY: {billing.city}</div>}
              {billing.state && <div>STATE: {billing.state}</div>}
              {billing.country && <div>COUNTRY: {billing.country}</div>}
              {billing.postalCode && <div>POSTAL CODE: {billing.postalCode}</div>}
            </div>
          ) : (
            <Button onClick={showBillingButtonClick} variant='contained'>
              SHOW BILLING INFO
            </Button>
          )}
        </div>
      )
    );
  })();

  let trackingNumberSection = (() => {
    return (
      orderStatus === 'CONFIRMED' &&
      !orderDetails?.shipment?.trackingCode && (
        <div>
          <TextField
            id='tracking-number-input'
            label='Tracking number'
            variant='outlined'
            onChange={handleTrackingNumberChange}
            size='small'
          />
          <Button
            onClick={saveTrackingNumber}
            variant='contained'
            style={{ marginLeft: '1rem' }}
            disabled={!trackingNumber}
          >
            SAVE
          </Button>
        </div>
      )
    );
  })();

  let markAsDeliveredSection = (() => {
    return (
      orderStatus === 'SHIPPED' && (
        <Button onClick={markAsDelivered} variant='contained'>
          MARK AS DELIVERED
        </Button>
      )
    );
  })();

  let refundOrderSection = (() => {
    const criteriaMet = orderStatus === 'CONFIRMED' || orderStatus === 'DELIVERED';
    return (
      criteriaMet && (
        <Button onClick={refundOrder} variant='contained'>
          REFUND ORDER
        </Button>
      )
    );
  })();

  let orderStatusColored = (() => {
    return (
      <div style={{ backgroundColor: getStatusColor(orderStatus), height: 'fit-content' }}>
        {orderStatus}
      </div>
    );
  })();

  if (isLoading)
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <CircularProgress />
      </div>
    );

  return (
    <Layout>
      <div style={{ margin: '5% 5%' }}>
        <Grid container spacing={2}>
          <Grid item xs={3}>
            ORDER ID: {orderDetails?.order?.id}
          </Grid>
          <Grid item xs={3} style={{ display: 'flex' }}>
            STATUS:&nbsp;{orderStatusColored}
          </Grid>
          <Grid item xs={3}>
            PLACED: {formatDateTime(orderDetails?.order?.placed)}
          </Grid>
          <Grid item xs={3}>
            MODIFIED: {formatDateTime(orderDetails?.order?.modified)}
          </Grid>
        </Grid>

        <DataGrid
          rows={orderDetails?.orderItems || []}
          columns={orderItemsColumns}
          rowSelection={false}
          paginationModel={{ page: page, pageSize: pageSize }}
          onPaginationModelChange={onPaginationChange}
          pageSizeOptions={[5, 10, 20]}
          sx={{ marginTop: '2rem' }}
          rowHeight={100}
        />
        <div style={{ marginTop: '2rem' }}>{promoApplied}</div>
        <div style={{ marginTop: '2rem' }}>{payment}</div>
        <div style={{ marginTop: '2rem' }}>{shipping}</div>
        <div style={{ marginTop: '2rem' }}>{billing}</div>
        <div style={{ marginTop: '2rem' }}>{trackingNumberSection}</div>
        <div style={{ marginTop: '2rem' }}>{markAsDeliveredSection}</div>
        <div style={{ marginTop: '2rem' }}>{refundOrderSection}</div>
      </div>
    </Layout>
  );
};
