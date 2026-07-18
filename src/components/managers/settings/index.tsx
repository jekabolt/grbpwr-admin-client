import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { UpdateSettingsRequest } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FxRatesModal } from 'components/managers/tech-cards/components/fx-rates-modal';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import ToggleField from 'ui/form/fields/toggle-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { CarrierPrices } from './components/carrier-prices';
import { PaymentFeesEditor } from './components/payment-fees-editor';
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
  const [fxOpen, setFxOpen] = useState(false);
  const { canWrite, canRead } = usePermissions();

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

  // "is prod" is an environment switch, not a cosmetic toggle: it moves checkout between the
  // live Stripe account and the test one (see the description rendered next to it below). Stage
  // the flip behind a confirmation instead of applying it straight from the switch, since it
  // sits in the same grid as purely cosmetic toggles and is easy to flip by accident.
  const [pendingIsProd, setPendingIsProd] = useState<boolean | null>(null);
  const confirmIsProdChange = () => {
    if (pendingIsProd !== null) {
      form.setValue('isProd', pendingIsProd, { shouldDirty: true });
    }
    setPendingIsProd(null);
  };

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
            <div className='flex flex-col gap-1'>
              <ToggleSwitch
                checked={!!form.watch('isProd')}
                onCheckedChange={(checked) => setPendingIsProd(checked)}
                label='is prod'
              />
              <Text variant='inactive' size='small'>
                environment switch — on charges real cards via live Stripe, off uses test Stripe
                (CARD_TEST) and takes no real payment
              </Text>
            </div>
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

        <ConfirmationModal
          open={pendingIsProd !== null}
          onOpenChange={(open) => !open && setPendingIsProd(null)}
          onConfirm={confirmIsProdChange}
          title={pendingIsProd ? 'switch to live stripe?' : 'switch to test stripe?'}
          confirmLabel={pendingIsProd ? 'go live' : 'switch to test'}
        >
          <Text size='small' className='max-w-xs'>
            {pendingIsProd
              ? 'This moves checkout onto the PRODUCTION Stripe account (CARD) — customers will be charged real money once you save.'
              : 'This moves checkout onto the TEST Stripe account (CARD_TEST) — real cards will stop being charged once you save.'}
          </Text>
        </ConfirmationModal>

        {canRead(SECTION.techCards) && (
          <>
            <Section
              title='currency / FX rates'
              description='Costing FX rates fold multi-currency tech-card BOM lines into the base currency. Shared across every tech card.'
            >
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <Text variant='label' size='small'>
                  Base currency is {baseCurrency}. Add a rate for each other currency so its costs
                  convert into {baseCurrency}.
                </Text>
                <Button
                  type='button'
                  size='lg'
                  variant='secondary'
                  className='uppercase'
                  onClick={() => setFxOpen(true)}
                >
                  edit FX rates
                </Button>
              </div>
            </Section>
            <FxRatesModal open={fxOpen} onOpenChange={setFxOpen} />
          </>
        )}

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

        <Section
          title='processing fees'
          description='estimated fee per payment method — feeds contribution margin for non-Stripe methods'
        >
          <PaymentFeesEditor
            methods={(paymentMethods ?? []).map((m) => m.paymentMethod ?? '')}
            baseCurrency={baseCurrency}
          />
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
