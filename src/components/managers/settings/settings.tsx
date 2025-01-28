import {
  Box,
  Checkbox,
  FormControlLabel,
  Grid,
  TextField,
  Theme,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { UpdateSettingsRequest } from 'api/proto-http/admin';
import { updateSettings } from 'api/settings';
import { Layout } from 'components/common/layout';
import { Field, FieldProps, Formik } from 'formik';
import { useDictionaryStore, useSnackBarStore } from 'lib/stores/store';
import debounce from 'lodash/debounce';
import { FC, useCallback, useEffect, useState } from 'react';
import { defaultSettingsStates } from './defaultSettingsStates';
import { usePaymentMethodsMapping, useShipmentCarriersMapping } from './mappingFunctions';

export const Settings: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionaryStore();
  const [settings, setSettings] = useState<UpdateSettingsRequest>(defaultSettingsStates);
  const shipmentCarriers = useShipmentCarriersMapping();
  const paymentMethods = usePaymentMethodsMapping();
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      shipmentCarriers,
      paymentMethods,
      maxOrderItems: dictionary?.maxOrderItems,
      siteAvailable: dictionary?.siteEnabled,
    }));
  }, [shipmentCarriers, paymentMethods]);

  const handleFieldChange = async (values: UpdateSettingsRequest) => {
    try {
      await updateSettings(values);
      showMessage('Settings updated successfully.', 'success');
    } catch (error) {
      showMessage('Failed to update settings.', 'error');
    }
  };

  const debouncedHandleFieldChange = useCallback(debounce(handleFieldChange, 1000), []);

  const handleCheckboxChange = (
    index: number,
    values: UpdateSettingsRequest,
    setFieldValue: any,
  ) => {
    const enabledCarriersCount =
      values.shipmentCarriers?.filter((carrier) => carrier.allow).length || 0;

    if (enabledCarriersCount === 1 && values.shipmentCarriers?.[index].allow) {
      return;
    }

    const updatedCarriers = values.shipmentCarriers?.map((carrier, idx) => ({
      ...carrier,
      allow: idx === index ? !carrier.allow : carrier.allow,
    }));

    setFieldValue('shipmentCarriers', updatedCarriers);
    debouncedHandleFieldChange({
      ...values,
      shipmentCarriers: updatedCarriers,
    });
  };

  return (
    <Layout>
      <Formik initialValues={settings} enableReinitialize={true} onSubmit={() => {}}>
        {({ values, setFieldValue }) => (
          <form>
            <Grid
              container
              spacing={2}
              direction='column'
              alignContent='center'
              padding={isMobile ? '20%' : '3%'}
            >
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
                              if (
                                window.confirm(
                                  'Are you sure you want to change this payment method?',
                                )
                              ) {
                                field.onChange(e);
                                handleFieldChange({
                                  ...values,
                                  paymentMethods: values.paymentMethods?.map((p, idx) =>
                                    idx === id ? { ...p, allow: e.target.checked } : p,
                                  ),
                                });
                              }
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
                  <Box display='flex'>
                    <Field name={`shipmentCarriers[${index}].allow`}>
                      {({ field }: FieldProps) => (
                        <FormControlLabel
                          control={
                            <Checkbox
                              {...field}
                              checked={field.value ?? false}
                              onChange={() => handleCheckboxChange(index, values, setFieldValue)}
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
                      type='text'
                      size='small'
                      inputProps={{ min: 0, step: '.01' }}
                      onChange={(e: any) => {
                        if (/^\d*\.?\d{0,2}$/.test(e.target.value)) {
                          setFieldValue(`shipmentCarriers[${index}].price.value`, e.target.value);
                        }
                      }}
                      onBlur={(e: any) => {
                        const formattedValue = parseFloat(e.target.value || '0').toFixed(2);
                        setFieldValue(`shipmentCarriers[${index}].price.value`, formattedValue);
                        debouncedHandleFieldChange({
                          ...values,
                          shipmentCarriers: values.shipmentCarriers?.map((c, idx) =>
                            idx === index ? { ...c, price: { value: formattedValue } } : c,
                          ),
                        });
                      }}
                    />
                  </Box>
                  <Typography variant='body2' color='textSecondary'>
                    {dictionary?.shipmentCarriers?.find((c) => c.id === index + 1)?.shipmentCarrier
                      ?.description || 'No description available'}
                  </Typography>
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
                          onChange={(e) => {
                            field.onChange(e);
                            handleFieldChange({ ...values, siteAvailable: e.target.checked });
                          }}
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const newValue = parseInt(e.target.value, 10);
                    setFieldValue('maxOrderItems', newValue);
                    debouncedHandleFieldChange({ ...values, maxOrderItems: newValue });
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant='body1'>BASE CURRENCY: {dictionary?.baseCurrency}</Typography>
              </Grid>
            </Grid>
          </form>
        )}
      </Formik>
    </Layout>
  );
};
