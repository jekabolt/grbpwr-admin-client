import { useNavigate } from '@tanstack/react-location';
import { getDictionary } from 'api/admin';
import {
  common_PaymentMethod,
  common_PaymentMethodNameEnum,
  common_ShipmentCarrierInsert,
} from 'api/proto-http/admin';
import {
  setMaxOrderItems,
  setPaymentMethod,
  setShipmentCarrier,
  setShipmentCarrierPrice,
  setSiteAvailability,
} from 'api/settings';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/settings.scss';

export const Settings: FC = () => {
  const [payment, setPayment] = useState<common_PaymentMethod[] | undefined>([]);
  const [carrier, setCarrier] = useState<common_ShipmentCarrierInsert[]>([]);
  const [price, setPrice] = useState<{ [name: string]: string }>({});
  const [maxItems, setMaxItems] = useState<number>();
  const [siteEnabled, setSiteEnabled] = useState<boolean>();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDictionary = async () => {
      try {
        const response = await getDictionary({});
        setPayment(response.dictionary?.paymentMethods || []);
        const carrierData = (
          response.dictionary?.shipmentCarriers?.map((carrier) => carrier.shipmentCarrier) || []
        ).filter((c): c is common_ShipmentCarrierInsert => c !== undefined);

        setCarrier(carrierData);
        setMaxItems(response.dictionary?.maxOrderItems);
        setSiteEnabled(response.dictionary?.siteEnabled);
      } catch (error) {
        console.error(error);
      }
    };
    fetchDictionary();
  }, []);

  const handlerPaymentMethod = async (paymentMethod: string | undefined, allow: boolean) => {
    if (paymentMethod) {
      setPayment((prevPayment) => {
        return prevPayment?.map((method) => {
          if (method.name === paymentMethod) {
            return { ...method, allowed: allow };
          }
          return method;
        });
      });
    }
    try {
      await setPaymentMethod({
        paymentMethod: paymentMethod as common_PaymentMethodNameEnum,
        allow,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleShipmentCarrier = async (carrier: string | undefined, allow: boolean) => {
    try {
      const response = await setShipmentCarrier({
        carrier: carrier,
        allow,
      });
      console.log(response);
    } catch (error) {
      console.error(error);
    }
  };

  const handleShipmentCarrierPrice = async (carrier: string | undefined) => {
    if (!carrier) {
      console.log('error');
      return;
    }
    const newPrice = price[carrier];
    if (newPrice) {
      try {
        await setShipmentCarrierPrice({
          carrier: carrier,
          price: { value: newPrice },
        });
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handlePriceChange = (carrier: string | undefined, price: string) => {
    if (carrier) {
      setPrice((prev) => ({ ...prev, [carrier]: price }));
    } else {
      console.log('carrier not founf');
    }
  };

  const handlerMaxOrderItems = async (e: string) => {
    const maxOrderItemsParsed = parseInt(e, 10);
    setMaxItems(maxOrderItemsParsed);

    try {
      await setMaxOrderItems({ maxOrderItems: maxItems });
    } catch (error) {
      console.error(error);
    }
  };

  const handleSiteAvailability = async (available: boolean) => {
    setSiteEnabled(available);
    try {
      await setSiteAvailability({
        available,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const cutUnusedPartOfPaymentName = (name: string | undefined) => {
    return name?.replace('PAYMENT_METHOD_NAME_ENUM_', '');
  };
  return (
    <Layout>
      <div className={styles.container}>
        <div className={styles.payment_methods}>
          <h2>payment methods</h2>
          {payment?.map((m, id) => (
            <div key={id} className={styles.payment_wrapper}>
              <h3>{cutUnusedPartOfPaymentName(m.name)}</h3>
              <input
                type='checkbox'
                checked={m.allowed}
                onChange={(e) => handlerPaymentMethod(m.name, e.target.checked)}
              />
            </div>
          ))}
        </div>

        <div className={styles.carrier_container}>
          <h2>shipment carrier</h2>
          {carrier.map((c, id) => (
            <div key={id} className={styles.carrier_wrapper}>
              <div className={styles.carrier_allowance}>
                <h3>{c.carrier}</h3>
                <input
                  type='checkbox'
                  checked={c.allowed}
                  onChange={(e) => handleShipmentCarrier(c.carrier, e.target.checked)}
                />
              </div>
              <div className={styles.carrier_price}>
                <input
                  type='number'
                  defaultValue={c.price?.value}
                  onChange={(e) => handlePriceChange(c.carrier, e.target.value)}
                />
                <button type='button' onClick={() => handleShipmentCarrierPrice(c.carrier)}>
                  update price
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.max_items_container}>
          <h2>max items</h2>
          <input
            type='number'
            defaultValue={maxItems}
            onChange={(e) => handlerMaxOrderItems(e.target.value)}
          />
        </div>

        <div className={styles.site}>
          <h2>site available</h2>
          <input
            type='checkbox'
            checked={siteEnabled}
            onChange={(e) => handleSiteAvailability(e.target.checked)}
          />
        </div>
      </div>
    </Layout>
  );
};
