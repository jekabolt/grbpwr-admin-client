import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { UpdateSettingsRequest } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className='space-y-4 border border-textInactiveColor p-4'>
      <div className='space-y-1'>
        <Text variant='uppercase' size='large'>
          {title}
        </Text>
        {description && (
          <Text variant='inactive' size='small'>
            {description}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}

export function Settings() {
  const { dictionary, refetch } = useDictionary();
  const showMessage = useSnackBarStore((state) => state.showMessage);
  const [isLoading, setIsLoading] = useState(false);
  const { canWrite } = usePermissions();

  const initialValues = useMemo(
    () => (dictionary ? transformDictionaryToSettings(dictionary) : defaultSettings),
    [dictionary],
  );

  const form = useForm<SettingsSchema>({
    resolver: zodResolver(settingsSchema),
    values: initialValues,
  });

  const paymentMethods = form.watch('paymentMethods');
  const baseCurrency = dictionary?.baseCurrency || 'EUR';
  const isDirty = form.formState.isDirty;

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
        className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
          <Text variant='uppercase' size='large'>
            settings
          </Text>
          <div className='flex items-center gap-2'>
            <Text variant='inactive' size='small'>
              base currency
            </Text>
            <span className='border border-textInactiveColor px-1.5 py-0.5'>
              <Text variant='uppercase'>{baseCurrency}</Text>
            </span>
          </div>
        </div>

        <Section title='general'>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <ToggleField name='siteAvailable' label='site available' />
            <ToggleField name='bigMenu' label='big menu' />
            <ToggleField name='isProd' label='is prod' />
            <div className='flex items-center gap-3'>
              <Text variant='inactive'>max order quantity</Text>
              <InputField
                name='maxOrderItems'
                type='text'
                className='w-24'
                keyboardRestriction={/\d/}
                valueAsNumber
              />
            </div>
          </div>
        </Section>

        <Section title='payment methods'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
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
        </Section>

        <Section title='announce'>
          <InputField name='announce.link' label='link' placeholder='Enter link URL' />
          <TranslationField label='text' fieldPrefix='announce.translations' fieldName='text' />
        </Section>

        <Section
          title='complimentary shipping'
          description='threshold per currency above which shipping is free'
        >
          <CarrierPrices basePath='complimentaryShippingPrices' />
        </Section>
      </form>

      {canWrite(SECTION.settings) && (
        <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textInactiveColor bg-bgColor px-3 py-2'>
          <Text variant='inactive' size='small'>
            {isDirty ? 'unsaved changes' : ' '}
          </Text>
          <Button
            type='button'
            size='lg'
            variant='main'
            className='uppercase cursor-pointer'
            disabled={isLoading || !isDirty}
            loading={isLoading}
            onClick={() => form.handleSubmit(handleSave)()}
          >
            save
          </Button>
        </div>
      )}
    </Form>
  );
}
