/* eslint-disable no-case-declarations */
import queryString from 'query-string';
import React, { FC, useEffect, useState } from 'react';
import { orderById } from 'api/orders';
import { common_Dictionary, common_OrderFull } from 'api/proto-http/admin';
import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import { getDictionary } from 'api/admin';
import styles from 'styles/orderId.scss';
import arrow from 'img/arrow-right.jpg';
import { findInDictionary } from './utility';

function formatDate(dateString: string | number | Date | undefined) {
  if (!dateString) {
    return '';
  }

  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', options as Intl.DateTimeFormatOptions);
}

const pattern: { [key: string]: RegExp } = {
  size: /SIZE_ENUM_/,
  order: /ORDER_STATUS_ENUM_/,
  payment: /PAYMENT_METHOD_NAME_ENUM_/,
  status: /ORDER_STATUS_ENUM_/,
};

export const OrderId: FC = () => {
  const { orderId } = queryString.parse(window.location.search) as { orderId: string };
  const [orders, setOrders] = useState<common_OrderFull | undefined>();
  const [dictionary, setDictionary] = useState<common_Dictionary | undefined>();
  const [showBilling, setShowBilling] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [orderResponse, dictionaryResponse] = await Promise.all([
          orderById({ orderId: Number(orderId) }),
          getDictionary({}),
        ]);
        setOrders(orderResponse.order);
        setDictionary(dictionaryResponse.dictionary);
      } catch (error) {
        console.error(error);
      }
    };
    fetchData();
  }, [orderId]);

  const back = () => {
    navigate({ to: ROUTES.orders, replace: true });
  };

  return (
    <div className={styles.order_id_main}>
      <button onClick={back}>
        <img src={arrow} alt='' style={{ rotate: '180deg' }} />
      </button>
      <div className={styles.orders_info}>
        <h3>id:{orders?.order?.id}</h3>
        <div className={styles.order_status}>
          <h3>{findInDictionary(dictionary, orders?.order?.orderStatusId, 'status')}</h3>
          <div
            className={
              styles[
                `${findInDictionary(
                  dictionary,
                  orders?.order?.orderStatusId,
                  'status',
                )?.toLowerCase()}`
              ]
            }
          ></div>
        </div>
        <h3>{formatDate(orders?.order?.modified)}</h3>
      </div>
      <div className={styles.product_information}>
        <div className={styles.table_container}>
          <table>
            <thead>
              <tr>
                <th>product</th>
                <th>quantity</th>
                <th>size</th>
              </tr>
            </thead>
            <tbody>
              {orders?.orderItems?.map((item) => (
                <tr key={item.orderId}>
                  <td>
                    <img src={item.thumbnail} alt='' />
                  </td>
                  <td>{item.orderItem?.quantity}</td>
                  <td>
                    {dictionary
                      ? findInDictionary(dictionary, item.orderItem?.sizeId, 'size')
                      : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.order_shippmet_price_info}>
          {orders?.promoCode?.promoCodeInsert?.code && (
            <div className={styles.promo_code_info}>
              <h3>promo applied: {orders?.promoCode?.promoCodeInsert?.code}</h3>
              <h3>
                {orders.promoCode.promoCodeInsert.freeShipping ? 'free ship' : '-'}/
                {orders.promoCode.promoCodeInsert.voucher ? 'voucher' : '-'}
              </h3>
            </div>
          )}
          <div className={styles.promo_code_info}>
            <h3>
              shipping method:{' '}
              {findInDictionary(dictionary, orders?.shipment?.carrierId, 'carrier')}
              {dictionary?.shipmentCarriers?.find((s) => s.id === orders?.shipment?.carrierId)
                ?.shipmentCarrier?.price?.value
                ? parseFloat(
                    dictionary?.shipmentCarriers?.find((s) => s.id === orders?.shipment?.carrierId)
                      ?.shipmentCarrier?.price?.value || '0',
                  ) > 0
                  ? ` $${
                      dictionary?.shipmentCarriers?.find(
                        (s) => s.id === orders?.shipment?.carrierId,
                      )?.shipmentCarrier?.price?.value
                    }`
                  : ''
                : ' '}
            </h3>
          </div>
          <h3 className={styles.price}>total:{orders?.order?.totalPrice?.value}</h3>
        </div>
        <div className={styles.payment_shippement_section}>
          <div className={styles.payment_shippement_container}>
            <h3>payment</h3>
            <div className={styles.payment_shippement_info}>
              <p>
                <span>Transaction Status</span>
                {orders?.payment?.paymentInsert?.isTransactionDone ? 'Completed' : 'Pending'}
              </p>
              <p>
                <span>Last Modified</span>
                {formatDate(orders?.payment?.modifiedAt)}
              </p>
              <p>
                <span>Method</span>
                {orders?.payment?.paymentInsert?.paymentMethod?.replace(
                  'PAYMENT_METHOD_NAME_ENUM_',
                  '',
                )}
              </p>
              {['usdt', 'usdc', 'eth'].includes(
                orders?.payment?.paymentInsert?.paymentMethod
                  ?.replace('PAYMENT_METHOD_NAME_ENUM_', '')
                  .toLowerCase() ?? '',
              ) ? (
                <div className={styles.transaction_info}>
                  <p>
                    <span>Amount</span>
                    {orders?.payment?.paymentInsert?.transactionAmount?.value}
                  </p>
                  <p>
                    <span>TxID</span> {orders?.payment?.paymentInsert?.transactionId}
                  </p>
                  <p>
                    <span>Payer</span> {orders?.payment?.paymentInsert?.payer}
                  </p>
                  <p>
                    <span>Payee</span> {orders?.payment?.paymentInsert?.payee}
                  </p>
                </div>
              ) : (
                <div className={styles.transaction_info}>
                  <p>
                    <span>amount</span>
                    {orders?.payment?.paymentInsert?.transactionAmount?.value}
                  </p>
                  <a href='#smth'>
                    <p>view tx</p>
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className={styles.payment_shippement_container}>
            <h3>adress</h3>
            <div className={styles.payment_shippement_info}>
              <p>
                <span>apartement &#8470;</span>
                {orders?.shipping?.addressInsert?.apartmentNumber}
              </p>
              <p>
                <span>city</span>
                {orders?.shipping?.addressInsert?.city}
              </p>
              <p>
                <span>country</span>
                {orders?.shipping?.addressInsert?.country}
              </p>
              <p>
                <span>house &#8470;</span>
                {orders?.shipping?.addressInsert?.houseNumber}
              </p>
              <p>
                <span>postal code</span>
                {orders?.shipping?.addressInsert?.postalCode}
              </p>
              <p>
                <span>state</span>
                {orders?.shipping?.addressInsert?.state}
              </p>
              <p>
                <span>street</span>
                {orders?.shipping?.addressInsert?.street}
              </p>
            </div>
          </div>
          <div className={styles.payment_shippement_container}>
            <h3>buyer</h3>
            <div className={styles.payment_shippement_info}>
              <p>
                <span>email</span>
                {orders?.buyer?.buyerInsert?.email}
              </p>
              <p>
                <span>first name</span>
                {orders?.buyer?.buyerInsert?.firstName}
              </p>
              <p>
                <span>last name</span>
                {orders?.buyer?.buyerInsert?.lastName}
              </p>
              <p>
                <span>phone</span>
                {orders?.buyer?.buyerInsert?.phone}
              </p>
              <p>
                <span>promo email</span>
                {orders?.buyer?.buyerInsert?.receivePromoEmails ? 'true' : 'false'}
              </p>
            </div>
          </div>
          <div className={styles.payment_shippement_container}>
            <button type='button' onClick={() => setShowBilling(!showBilling)}>
              <h3>billing</h3>
            </button>
            {showBilling && (
              <div
                className={`${styles.payment_shippement_info} ${styles.billing} ${
                  showBilling ? styles.show_billing_info : ''
                }`}
              >
                <p>
                  <span>apartement &#8470;</span>
                  {orders?.billing?.addressInsert?.apartmentNumber}
                </p>
                <p>
                  <span>city</span>
                  {orders?.billing?.addressInsert?.city}
                </p>
                <p>
                  <span>country</span>
                  {orders?.billing?.addressInsert?.country}
                </p>
                <p>
                  <span>house &#8470;</span>
                  {orders?.billing?.addressInsert?.houseNumber}
                </p>
                <p>
                  <span>postal code</span>
                  {orders?.billing?.addressInsert?.postalCode}
                </p>
                <p>
                  <span>state</span>
                  {orders?.billing?.addressInsert?.state}
                </p>
                <p>
                  <span>street</span>
                  {orders?.billing?.addressInsert?.street}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
