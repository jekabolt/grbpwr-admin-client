import { Button, Checkbox, FormControlLabel, Grid, TextField, Typography } from '@mui/material';
import { getDictionary } from 'api/admin';
import { UpdateSettingsRequest, common_Dictionary } from 'api/proto-http/admin';
import { updateSettings } from 'api/settings';
import { Layout } from 'components/login/layout';
import { Field, FieldProps, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import { defaultSettingsStates } from './defaultSettingsStates';
import { mapPaymentMethods, mapShipmentCarriers } from './mappingFunctions';

export const Settings: FC = () => {
  const [settings, setSettings] = useState<UpdateSettingsRequest>(defaultSettingsStates);
  const [dictionary, setDictionary] = useState<common_Dictionary>();

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({}, true);
      setDictionary(response.dictionary);
      setSettings((prev) => ({
        ...prev,
        shipmentCarriers: mapShipmentCarriers(response.dictionary?.shipmentCarriers),
        paymentMethods: mapPaymentMethods(response.dictionary?.paymentMethods),
        maxOrderItems: response.dictionary?.maxOrderItems,
        siteAvailable: response.dictionary?.siteEnabled,
      }));
    };
    fetchDictionary();
  }, []);

  return (
    <Layout>
      <Formik
        initialValues={settings}
        enableReinitialize={true}
        onSubmit={async (values, actions) => {
          await updateSettings(values);
          actions.setSubmitting(false);
        }}
      >
        {({ values, setFieldValue, isSubmitting }) => (
          <Form>
            <Grid container spacing={2} direction='column' alignContent='center' marginTop={4}>
              <Grid item xs={12}>
                <Typography variant='h6'>PAYMENT METHODS</Typography>
              </Grid>
              {values.paymentMethods?.map((payment, id) => (
                <Grid item key={id} xs={12}>
                  <Field name={`paymentMethods[${id}].allow`}>
                    {({ field }: FieldProps) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value ?? false}
                            onChange={(e) => {
                              field.onChange(e);
                            }}
                          />
                        }
                        label={payment.paymentMethod}
                      />
                    )}
                  </Field>
                </Grid>
              ))}
              <Grid item xs={12}>
                <Typography variant='h6'>SHIPMENT CARRIERS</Typography>
              </Grid>
              {values.shipmentCarriers?.map((carrier, index) => (
                <Grid item key={index} xs={12}>
                  <Field name={`shipmentCarriers[${index}].allow`}>
                    {({ field }: FieldProps) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value ?? false}
                            onChange={(e) => {
                              field.onChange(e);
                            }}
                          />
                        }
                        label={carrier.carrier}
                      />
                    )}
                  </Field>
                  <Field
                    as={TextField}
                    name={`shipmentCarriers[${index}].price.value`}
                    label='Price'
                    type='number'
                    size='small'
                    inputProps={{ step: '0.01', min: 0 }}
                  />
                </Grid>
              ))}
              <Grid item xs={12}>
                <Field name='siteAvailable'>
                  {({ field }: FieldProps) => (
                    <FormControlLabel
                      label='SITE AVAILABLE'
                      control={
                        <Checkbox
                          checked={field.value ?? false}
                          onChange={field.onChange}
                          name={field.name}
                          color='primary'
                        />
                      }
                    />
                  )}
                </Field>
              </Grid>
              <Grid item xs={12}>
                <Field
                  as={TextField}
                  label='MAX ORDER ITEMS'
                  name='maxOrderItems'
                  type='number'
                  inputProps={{ min: 0 }}
                  value={values.maxOrderItems}
                  InputLabelProps={{ shrink: true }}
                  size='small'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFieldValue('maxOrderItems', e.target.value)
                  }
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant='body1'>BASE CURRENCY: {dictionary?.baseCurrency}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Button variant='contained' type='submit' disabled={isSubmitting}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
    </Layout>
  );
};
