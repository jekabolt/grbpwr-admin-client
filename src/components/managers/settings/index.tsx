import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { UpdateSettingsRequest } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import ToggleField from 'ui/form/fields/toggle-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { CarrierPrices } from './components/carrier-prices';
import {
  defaultSettings,
  SettingsSchema,
  settingsSchema,
  transformDictionaryToSettings,
} from './utility/schema';

export function Settings() {
  const { dictionary, refetch } = useDictionary();
  const showMessage = useSnackBarStore((state) => state.showMessage);
  const [isLoading, setIsLoading] = useState(false);

  const initialValues = useMemo(
    () => (dictionary ? transformDictionaryToSettings(dictionary) : defaultSettings),
    [dictionary],
  );

  const form = useForm<SettingsSchema>({
    resolver: zodResolver(settingsSchema),
    values: initialValues,
  });

  const paymentMethods = form.watch('paymentMethods');
  const shipmentCarriers = form.watch('shipmentCarriers');
  const baseCurrency = dictionary?.baseCurrency || 'EUR';

  const handleSave = async (data: SettingsSchema) => {
    try {
      setIsLoading(true);
      await adminService.UpdateSettings(data as UpdateSettingsRequest);
      showMessage('Settings updated successfully', 'success');
      await refetch();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update settings';
      showMessage(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSave)}
        className='grid gap-y-10 justify-center items-center h-full pb-10'
      >
        <div className='space-y-4'>
          <Text variant='uppercase' className='font-bold' size='large'>
            payment methods
          </Text>
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
          <Text variant='uppercase' className='font-bold' size='large'>
            shipment carriers
          </Text>
          <div className='grid gap-6'>
            {shipmentCarriers?.map((carrier, index) => {
              const isFreeCarrier = carrier.carrier?.toString().toUpperCase() === 'FREE';

              return (
                <div key={carrier.carrier || index} className='space-y-3'>
                  <div className='flex items-center gap-4'>
                    <ToggleField name={`shipmentCarriers.${index}.allow`} label={carrier.carrier} />
                  </div>
                  {!isFreeCarrier && <CarrierPrices carrierIndex={index} />}
                  <Text variant='uppercase' className='text-textInactiveColor'>
                    {dictionary?.shipmentCarriers?.[index]?.shipmentCarrier?.description}
                  </Text>
                </div>
              );
            })}
          </div>
        </div>
        <div className='flex items-center gap-4'>
          <Text variant='uppercase' size='large' className='whitespace-nowrap font-bold'>
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
          <Text variant='uppercase' className='font-bold' size='large'>
            announce
          </Text>
          <InputField name='announce.link' label='' placeholder='Enter link URL' />
          <TranslationField label='' fieldPrefix='announce.translations' fieldName='text' />
        </div>
        <ToggleField name='siteAvailable' label='site available' />
        <ToggleField name='bigMenu' label='big menu' />
        <Text variant='uppercase' className='font-bold' size='large'>
          base currency: {baseCurrency}
        </Text>

        <Button
          type='submit'
          size='lg'
          variant='main'
          className='fixed bottom-3 right-3 z-50 cursor-pointer uppercase'
          disabled={isLoading}
          loading={isLoading}
        >
          save
        </Button>
      </form>
    </Form>
  );
}
