import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { UpdateSettingsRequest } from 'api/proto-http/admin';
import { useDictionaryStore, useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import ToggleField from 'ui/form/fields/toggle-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { Layout } from 'ui/layout';
import {
  defaultSettings,
  SettingsSchema,
  settingsSchema,
  transformDictionaryToSettings,
} from './utility/schema';

export function Settings() {
  const { dictionary, fetchDictionary } = useDictionaryStore();
  const { showMessage } = useSnackBarStore();
  const [isLoading, setIsLoading] = useState(false);

  const initialValues = useMemo(
    () => (dictionary ? transformDictionaryToSettings(dictionary) : defaultSettings),
    [dictionary],
  );

  const form = useForm<SettingsSchema>({
    resolver: zodResolver(settingsSchema),
    values: initialValues,
  });

  const handleSave = async (data: SettingsSchema) => {
    try {
      setIsLoading(true);
      await adminService.UpdateSettings(data as UpdateSettingsRequest);
      showMessage('Settings updated successfully', 'success');
      await fetchDictionary(true);
    } catch (error) {
      showMessage('Failed to update settings', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const paymentMethods = form.watch('paymentMethods');
  const shipmentCarriers = form.watch('shipmentCarriers');
  const baseCurrency = dictionary?.baseCurrency || 'EUR';

  return (
    <Layout>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSave)}
          className='grid gap-6 justify-center items-center h-full pt-10'
        >
          <div className='space-y-4'>
            <Text variant='uppercase'>payment methods</Text>
            <div className='grid gap-3 lg:grid-cols-2 grid-cols-1'>
              {paymentMethods?.map((method, index) => (
                <ToggleField
                  key={method.paymentMethod || index}
                  name={`paymentMethods.${index}.allow`}
                  label={method.paymentMethod
                    ?.replace('PAYMENT_METHOD_NAME_ENUM_', '')
                    .replace(/_/g, ' ')}
                />
              ))}
            </div>
          </div>

          <div className='space-y-4'>
            <Text variant='uppercase'>shipment carriers</Text>
            <div className='grid gap-4'>
              {shipmentCarriers?.map((carrier, index) => (
                <div key={carrier.carrier || index} className='space-y-2'>
                  <div className='flex items-center gap-4'>
                    <ToggleField name={`shipmentCarriers.${index}.allow`} label={carrier.carrier} />
                    <InputField
                      name={`shipmentCarriers.${index}.prices.${baseCurrency}.value`}
                      type='text'
                      placeholder='Price'
                      className='w-32'
                      keyboardRestriction={/[\d.]/}
                    />
                  </div>
                  <Text size='small' variant='uppercase' className='text-inactive'>
                    {dictionary?.shipmentCarriers?.[index]?.shipmentCarrier?.description}
                  </Text>
                </div>
              ))}
            </div>
          </div>

          <div className='flex items-center gap-4'>
            <Text variant='uppercase' className='whitespace-nowrap font-bold'>
              max order quantity
            </Text>
            <InputField
              name='maxOrderItems'
              type='text'
              className='w-32'
              keyboardRestriction={/\d/}
            />
          </div>

          <div className='space-y-4'>
            <Text variant='uppercase'>announce</Text>
            <InputField name='announce.link' label='' placeholder='Enter link URL' />
            <TranslationField label='' fieldPrefix='announce.translations' fieldName='text' />
          </div>

          <ToggleField name='siteAvailable' label='site available' />

          <ToggleField name='bigMenu' label='big menu' />

          <Text variant='uppercase'>base currency: {baseCurrency}</Text>

          <Button
            type='submit'
            size='lg'
            disabled={isLoading || !form.formState.isDirty}
            loading={isLoading}
          >
            save
          </Button>
        </form>
      </Form>
    </Layout>
  );
}
