import { Button, Checkbox, Grid, TextField } from '@mui/material';
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
  const [baseCurrency, setbaseCurrency] = useState<string>();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setPayment(response.dictionary?.paymentMethods?.sort((a, b) => a.id! - b.id!) || []);

      const carrierData = (
        response.dictionary?.shipmentCarriers
          ?.sort((a, b) => a.id! - b.id!)
          .map((carrier) => carrier.shipmentCarrier) || []
      ).filter((c): c is common_ShipmentCarrierInsert => c !== undefined);

      setCarrier(carrierData);
      setMaxItems(response.dictionary?.maxOrderItems);
      setSiteEnabled(response.dictionary?.siteEnabled);
      setbaseCurrency(response.dictionary?.baseCurrency);
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
    await setPaymentMethod({
      paymentMethod: paymentMethod as common_PaymentMethodNameEnum,
      allow,
    });
  };

  const handleShipmentCarrier = async (carrier: string | undefined, allow: boolean) => {
    await setShipmentCarrier({
      carrier: carrier,
      allow,
    });
  };

  const handleShipmentCarrierPrice = async (carrier: string | undefined) => {
    if (!carrier) {
      return;
    }
    const newPrice = price[carrier];
    if (newPrice) {
      await setShipmentCarrierPrice({
        carrier: carrier,
        price: { value: newPrice },
      });
    }
  };

  const handlePriceChange = (carrier: string | undefined, price: string) => {
    if (carrier) {
      setPrice((prev) => ({ ...prev, [carrier]: price }));
    }
  };

  const handlerMaxOrderItems = async (e: string) => {
    const maxOrderItemsParsed = parseInt(e, 10);
    setMaxItems(maxOrderItemsParsed);
    await setMaxOrderItems({ maxOrderItems: maxItems });
  };

  const handleSiteAvailability = async (available: boolean) => {
    setSiteEnabled(available);
    await setSiteAvailability({
      available,
    });
  };

  const cutUnusedPartOfPaymentName = (name: string | undefined) => {
    return name?.replace('PAYMENT_METHOD_NAME_ENUM_', '');
  };
  return (
    <Layout>
      <Grid container spacing={8} className={styles.grid} direction='column'>
        <Grid item xs={12} sm={3}>
          <div>
            <h2>Payment Methods</h2>
            {payment?.map((m, id) => (
              <Grid container direction='row' alignItems='center' spacing={2} key={id}>
                <Grid item>
                  <Checkbox
                    checked={m.allowed}
                    onChange={(e) => handlerPaymentMethod(m.name, e.target.checked)}
                  />
                </Grid>
                <Grid item>
                  <div>{cutUnusedPartOfPaymentName(m.name)}</div>
                </Grid>
              </Grid>
            ))}
          </div>
        </Grid>

        <Grid item xs={12} sm={3}>
          <h2>Shipment Carrier</h2>
          {carrier.map((c, id) => (
            <div>
              <h3 className={styles.carrier_header}>{c.carrier}</h3>
              <Grid container spacing={2} key={id} direction='row' alignItems='center'>
                <Grid item>
                  <Checkbox
                    checked={c.allowed}
                    onChange={(e) => handleShipmentCarrier(c.carrier, e.target.checked)}
                  />
                </Grid>
                <Grid item>
                  <TextField
                    size='small'
                    type='number'
                    defaultValue={c.price?.value}
                    onChange={(e) => handlePriceChange(c.carrier, e.target.value)}
                  />
                </Grid>
                <Grid item>
                  <Button variant='contained' onClick={() => handleShipmentCarrierPrice(c.carrier)}>
                    Update Price
                  </Button>
                </Grid>
              </Grid>
            </div>
          ))}
        </Grid>

        <Grid item xs={12} sm={3}>
          <div>
            <h2>Max Items</h2>
            <TextField
              size='small'
              type='number'
              defaultValue={maxItems}
              onChange={(e) => handlerMaxOrderItems(e.target.value)}
              inputProps={{ min: 0 }}
            />
          </div>
        </Grid>

        <Grid item xs={12} sm={3}>
          <div>
            <h2>Base currency: {baseCurrency}</h2>
          </div>
        </Grid>

        <Grid item xs={12} sm={3}>
          <div>
            <h2>Site Availability</h2>
            <Checkbox
              checked={siteEnabled}
              onChange={(e) => handleSiteAvailability(e.target.checked)}
            />
          </div>
        </Grid>
      </Grid>
    </Layout>
  );
};
