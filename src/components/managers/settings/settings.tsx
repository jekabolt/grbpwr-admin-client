import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Grid,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
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
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(true);
  };

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
          try {
            await updateSettings(values);
            showMessage('Settings updated successfully.', 'success');
            actions.setSubmitting(false);
          } catch (error) {
            showMessage('Failed to update settings.', 'error');
            actions.setSubmitting(false);
          }
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
                        label={payment.paymentMethod?.replace('PAYMENT_METHOD_NAME_ENUM_', '')}
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
                    onChange={(e: any) =>
                      setFieldValue(
                        `shipmentCarriers[${index}].price.value`,
                        e.target.value.toString(),
                      )
                    }
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
                <Button variant='contained' size='small' type='submit' disabled={isSubmitting}>
                  Save Settings
                </Button>
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
      <Snackbar
        open={isSnackBarOpen}
        autoHideDuration={6000}
        onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Layout>
  );
};
