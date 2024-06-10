import EditIcon from '@mui/icons-material/Edit';
import LaunchIcon from '@mui/icons-material/Launch';
import { Button, Grid, TextField } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { DataGrid, GridPaginationModel } from '@mui/x-data-grid';
import { MakeGenerics, useMatch, useNavigate } from '@tanstack/react-location';
import { getDictionary } from 'api/admin';
import {
  deliveredOrderUpdate,
  getOrderByUUID,
  refundOrderUpdate,
  setTrackingNumberUpdate,
} from 'api/orders';
import { common_Dictionary } from 'api/proto-http/admin';
import { common_OrderFull } from 'api/proto-http/frontend';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import logo from 'img/tex-text.png';
import { useEffect, useState } from 'react';
import styles from 'styles/order.scss';
import { formatDateTime, getOrderStatusName, getStatusColor } from './utility';

// Define the expected params structure
export type OrderDetailsPathProps = MakeGenerics<{
  Params: {
    uuid: string;
  };
}>;

export const OrderDetails = () => {
  const {
    params: { uuid },
  } = useMatch<OrderDetailsPathProps>();

  const [orderDetails, setOrderDetails] = useState<common_OrderFull | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);

  const [showBilling, setShowBilling] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [orderStatus, setOrderStatus] = useState<string | undefined>('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState({
    thumbnail: true,
    productLink: true,
    size: true,
  });
  const [isEdit, setIsEdit] = useState(false);

  const toggleEditTrackingNumber = () => {
    if (!isPrinting && orderStatus === 'SHIPPED') {
      setIsEdit(!isEdit);
      if (isEdit) {
        setTrackingNumber(orderDetails?.shipment?.trackingCode || '');
      }
    }
  };

  useEffect(() => {
    setColumnVisibility({ thumbnail: !isPrinting, productLink: !isPrinting, size: !isPrinting });
  }, [isPrinting]);

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const fetchDictionary = async () => {
    const response = await getDictionary({});
    setDictionary(response.dictionary);
  };

  const fetchOrderDetails = async () => {
    setIsLoading(true);
    try {
      const response = await getOrderByUUID({ orderUuid: uuid });
      setOrderDetails(response.order);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
    fetchDictionary();
  }, [uuid]);

  useEffect(() => {
    setOrderStatus(getOrderStatusName(dictionary, orderDetails?.order?.orderStatusId));
  }, [orderDetails, dictionary]);

  const navigate = useNavigate();

  const orderItemsColumns = [
    {
      field: 'thumbnail',
      headerName: '',
      width: 200,
      renderCell: (params: any) => (
        <img src={params.value} alt='product' style={{ height: '100px', width: 'auto' }} />
      ),
    },
    {
      field: 'sku',
      headerName: 'SKU',
      width: isPrinting ? 250 : 300,
    },
    {
      field: 'productName',
      headerName: isPrinting ? 'name' : 'PRODUCT NAME',
      width: isPrinting ? 250 : 200,
    },
    {
      field: 'quantity',
      headerName: 'QUANTITY',
      width: isPrinting ? 250 : 200,
      valueGetter: (_params: any, row: any) => {
        return row.orderItem.quantity;
      },
    },
    {
      field: 'size',
      headerName: 'SIZE',
      width: 200,
      cellClassName: styles.hide_cell,
      valueGetter: (_params: any, row: any) => {
        return dictionary?.sizes
          ?.find((x) => x.id === row.orderItem.sizeId)
          ?.name?.replace('SIZE_ENUM_', '');
      },
    },
    {
      field: 'productPrice',
      headerName: 'PRICE',
      width: isPrinting ? 250 : 200,
      valueGetter: (params: any, row: any) =>
        `${params * row.orderItem.quantity} ${dictionary?.baseCurrency}`,
    },
    {
      field: 'productLink',
      headerName: 'LINK',
      width: 100,
      cellClassName: styles.hide_cell,
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

  const onPaginationChange = (model: GridPaginationModel) => {
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
    if (!trackingNumber.trim()) {
      setIsEdit(false);
      return;
    }
    const response = await setTrackingNumberUpdate({
      orderUuid: orderDetails?.order?.uuid,
      trackingCode: trackingNumber,
    });
    if (response) {
      fetchOrderDetails();
      setIsEdit(false);
    }
  };

  const markAsDelivered = async () => {
    const response = await deliveredOrderUpdate({
      orderUuid: orderDetails?.order?.uuid,
    });
    if (response) {
      fetchOrderDetails();
    }
  };

  const refundOrder = async () => {
    const response = await refundOrderUpdate({
      orderUuid: orderDetails?.order?.uuid,
    });
    if (response) {
      fetchOrderDetails();
    }
  };

  const promoApplied = (() => {
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

  const payment = (() => {
    const payment = orderDetails?.payment;
    return (
      payment && (
        <div>
          <div>PAYMENT:</div>
          <div style={{ display: 'flex' }}>
            STATUS:&nbsp;
            {payment.paymentInsert?.isTransactionDone ? (
              <div style={{ backgroundColor: '#008f0080' }}>PAID</div>
            ) : (
              <div style={{ backgroundColor: '#fc000080' }}>UNPAID</div>
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
            <div style={{ display: 'flex', alignItems: 'center' }}>
              PAYER:&nbsp;
              <CopyToClipboard text={payment.paymentInsert?.payer} />
            </div>
          )}
          {payment.paymentInsert?.payee && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              PAYEE:&nbsp;
              <CopyToClipboard text={payment.paymentInsert?.payee} />
            </div>
          )}
          {payment.paymentInsert?.isTransactionDone && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              TXID:&nbsp;
              <CopyToClipboard
                text={payment?.paymentInsert?.transactionId || ''}
                displayText={
                  payment?.paymentInsert?.transactionId
                    ? `${payment?.paymentInsert?.transactionId.slice(0, 4)}...${payment?.paymentInsert?.transactionId.slice(-4)}`
                    : ''
                }
              />
            </div>
          )}
        </div>
      )
    );
  })();

  const shipping = (() => {
    const shipping = orderDetails?.shipping?.addressInsert;
    const buyer = orderDetails?.buyer?.buyerInsert;
    return (
      <div>
        <div>SHIPPING:</div>
        <Grid container spacing={2} alignItems='flex-start'>
          {' '}
          <Grid item xs={3}>
            {orderDetails?.shipment?.trackingCode && (
              <div>
                {isEdit && !isPrinting ? (
                  <>
                    <TextField
                      id='tracking-number-input'
                      label='Tracking number'
                      variant='filled'
                      value={trackingNumber}
                      onChange={handleTrackingNumberChange}
                      size='small'
                    />
                    <Button
                      onClick={saveTrackingNumber}
                      variant='contained'
                      style={{ marginLeft: '1rem' }}
                    >
                      SAVE
                    </Button>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {!isPrinting && (
                      <>
                        <div>TRACKING NUMBER: {orderDetails?.shipment?.trackingCode}</div>
                        {orderStatus === 'SHIPPED' && (
                          <IconButton onClick={toggleEditTrackingNumber} size='small'>
                            <EditIcon style={{ fontSize: '15px' }} />
                          </IconButton>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
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
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    EMAIL:&nbsp;
                    <div>
                      <CopyToClipboard text={buyer.email} />
                    </div>
                  </div>
                )}
                {buyer?.firstName && <div>FIRST NAME: {buyer.firstName}</div>}
                {buyer?.lastName && <div>LAST NAME: {buyer.lastName}</div>}
                {buyer?.phone && <div>PHONE: {buyer.phone}</div>}
                <div className={isPrinting ? styles.hide_cell : styles.non_print_state}>
                  RECEIVE PROMO EMAILS:&nbsp;
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

  const billing = (() => {
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

  const trackingNumberSection = (() => {
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

  const markAsDeliveredSection = (() => {
    return (
      orderStatus === 'SHIPPED' && (
        <Button onClick={markAsDelivered} variant='contained'>
          MARK AS DELIVERED
        </Button>
      )
    );
  })();

  const refundOrderSection = (() => {
    const criteriaMet = orderStatus === 'CONFIRMED' || orderStatus === 'DELIVERED';
    return (
      criteriaMet && (
        <Button onClick={refundOrder} variant='contained'>
          REFUND ORDER
        </Button>
      )
    );
  })();

  const orderStatusColored = (() => {
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
      <img src={logo} className={styles.img_print} alt='logo' />
      <div style={{ margin: '5% 5%' }}>
        <Grid container spacing={1} style={{ alignItems: 'center' }}>
          <Grid item xs={2} className={styles.hide_cell}>
            ORDER ID: {orderDetails?.order?.id}
          </Grid>
          <Grid item xs={2} className={isPrinting ? styles.hide_cell : styles.non_print_state}>
            UUID:&nbsp;
            <CopyToClipboard
              text={orderDetails?.order?.uuid || ''}
              displayText={
                orderDetails?.order?.uuid
                  ? `${orderDetails.order.uuid?.slice(0, 4)}...${orderDetails.order.uuid?.slice(-4)}`
                  : 'NO UUID'
              }
            />
          </Grid>
          <Grid item xs={2} className={isPrinting ? styles.hide_cell : styles.non_print_state}>
            STATUS:&nbsp;{orderStatusColored}
          </Grid>
          <Grid item xs={3} className={styles.support}>
            COMPANY ADRESS: ADRESS ADRESS ADRESS
          </Grid>
          <Grid item xs={3} className={styles.support}>
            COMPANY VAT ID: ID
          </Grid>
          <Grid item xs={isPrinting ? 4 : 2}>
            PLACED: {formatDateTime(orderDetails?.order?.placed)}
          </Grid>
          <Grid item className={styles.hide_cell} xs={3}>
            MODIFIED: {formatDateTime(orderDetails?.order?.modified)}
          </Grid>
        </Grid>

        <DataGrid
          rows={orderDetails?.orderItems || []}
          columns={orderItemsColumns}
          columnVisibilityModel={columnVisibility}
          rowSelection={false}
          paginationModel={
            isPrinting
              ? { page: page, pageSize: orderDetails?.orderItems?.length || pageSize }
              : { page: page, pageSize: pageSize }
          }
          onPaginationModelChange={onPaginationChange}
          pageSizeOptions={[5, 10, 20]}
          sx={{ marginTop: '2rem', width: '90%' }}
          rowHeight={100}
          hideFooterPagination={isPrinting}
          hideFooter={isPrinting}
        />
        <div className={styles.hide_cell} style={{ marginTop: '2rem' }}>
          {promoApplied}
        </div>
        <div className={styles.hide_cell} style={{ marginTop: '2rem' }}>
          {payment}
        </div>
        <div style={{ marginTop: '2rem' }}>{shipping}</div>
        <div className={styles.hide_cell} style={{ marginTop: '2rem' }}>
          {billing}
        </div>
        <div className={styles.hide_cell} style={{ marginTop: '2rem' }}>
          {trackingNumberSection}
        </div>
        <div className={styles.hide_cell} style={{ marginTop: '2rem' }}>
          {markAsDeliveredSection}
        </div>
        <div className={styles.hide_cell} style={{ marginTop: '2rem' }}>
          {refundOrderSection}
        </div>
        <div className={styles.total}>
          Total: {orderDetails?.order?.totalPrice?.value}&nbsp;{dictionary?.baseCurrency}
        </div>
        <div className={styles.support}>
          If you have any questions, please send an email to customercare@grbpwr.com
        </div>
      </div>
    </Layout>
  );
};
