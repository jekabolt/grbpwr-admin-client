import { TextField } from '@mui/material';
import { UpdateSettingsRequest } from 'api/proto-http/admin';
import { updateSettings } from 'api/settings';
import { Field, FieldProps, Formik } from 'formik';
import { useDictionaryStore, useSnackBarStore } from 'lib/stores/store';
import debounce from 'lodash/debounce';
import { FC, useCallback, useEffect, useState } from 'react';
import CheckboxCommon from 'ui/components/checkbox';
import Text from 'ui/components/text';
import { Layout } from 'ui/layout';
import { defaultSettingsStates } from './defaultSettingsStates';
import { usePaymentMethodsMapping, useShipmentCarriersMapping } from './mappingFunctions';

export const Settings: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { dictionary, fetchDictionary } = useDictionaryStore();
  const [settings, setSettings] = useState<UpdateSettingsRequest>(defaultSettingsStates);
  const shipmentCarriers = useShipmentCarriersMapping();
  const paymentMethods = usePaymentMethodsMapping();

  useEffect(() => {
    fetchDictionary(true);
  }, []);

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
          <form className='grid gap-4 items-center justify-center w-full border border-red-500'>
            <div>
              <Text variant='uppercase' className='font-bold'>
                payment methods
              </Text>
            </div>
            {values.paymentMethods?.map((payment, id) => (
              <div key={id}>
                <Field name={`paymentMethods[${id}].allow`}>
                  {({ field }: FieldProps) => (
                    <label className='flex items-center space-x-2'>
                      <CheckboxCommon
                        name={field.name}
                        checked={field.value ?? false}
                        onCheckedChange={(checked: boolean) => {
                          if (
                            window.confirm('Are you sure you want to change this payment method?')
                          ) {
                            field.onChange({ target: { name: field.name, checked } });
                            handleFieldChange({
                              ...values,
                              paymentMethods: values.paymentMethods?.map((p, idx) =>
                                idx === id ? { ...p, allow: checked } : p,
                              ),
                            });
                          }
                        }}
                      />
                      <span>{payment.paymentMethod?.replace('PAYMENT_METHOD_NAME_ENUM_', '')}</span>
                    </label>
                  )}
                </Field>
              </div>
            ))}
            <Text variant='uppercase' className='font-bold'>
              shipment carriers
            </Text>
            {values.shipmentCarriers?.map((carrier, index) => (
              <div key={index} className='space-y-2'>
                <div className='flex items-center space-x-4'>
                  <Field name={`shipmentCarriers[${index}].allow`}>
                    {({ field }: FieldProps) => (
                      <label className='flex items-center space-x-2'>
                        <CheckboxCommon
                          name={field.name}
                          checked={field.value ?? false}
                          onCheckedChange={() => handleCheckboxChange(index, values, setFieldValue)}
                        />
                        <span>{carrier.carrier}</span>
                      </label>
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
                </div>
                <Text size='small'>
                  {dictionary?.shipmentCarriers?.find((c) => c.id === index + 1)?.shipmentCarrier
                    ?.description || 'No description available'}
                </Text>
              </div>
            ))}

            <div>
              <Field name='siteAvailable'>
                {({ field }: FieldProps) => (
                  <label className='flex items-center space-x-2'>
                    <CheckboxCommon
                      name={field.name}
                      checked={field.value ?? false}
                      onCheckedChange={(checked: boolean) => {
                        field.onChange({ target: { name: field.name, checked } });
                        handleFieldChange({ ...values, siteAvailable: checked });
                      }}
                    />
                    <span>SITE AVAILABLE</span>
                  </label>
                )}
              </Field>
            </div>

            <div>
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
            </div>
            <Text className='font-semibold' variant='uppercase'>
              base currency: {dictionary?.baseCurrency}
            </Text>
          </form>
        )}
      </Formik>
    </Layout>
  );
};
