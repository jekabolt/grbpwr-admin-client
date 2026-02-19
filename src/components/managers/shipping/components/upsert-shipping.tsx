import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import {
  AddShipmentCarrierRequest,
  common_ShippingRegion,
  UpdateShipmentCarrierRequest,
} from 'api/proto-http/admin';
import { CarrierPrices } from 'components/managers/settings/components/carrier-prices';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import ToggleField from 'ui/form/fields/toggle-field';
import ToggleGroupField from 'ui/form/fields/toggle-group-field';
import { shippingSchema, ShippingSchema, transformDictionaryToShipping } from './schema';
import { UpsertShippingModal } from './upsert-modal';

type UpsertShippingProps = {
  id?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ALLOWED_REGIONS: { value: common_ShippingRegion; label: string }[] = [
  { value: 'SHIPPING_REGION_AFRICA', label: 'Africa' },
  { value: 'SHIPPING_REGION_AMERICAS', label: 'Americas' },
  { value: 'SHIPPING_REGION_ASIA_PACIFIC', label: 'Asia Pacific' },
  { value: 'SHIPPING_REGION_EUROPE', label: 'Europe' },
  { value: 'SHIPPING_REGION_MIDDLE_EAST', label: 'Middle East' },
];

export function UpsertShipping({ id, open, onOpenChange }: UpsertShippingProps) {
  const { dictionary, refetch } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const [isLoading, setIsLoading] = useState(false);

  const initialValues = useMemo(
    () => transformDictionaryToShipping(dictionary, id),
    [dictionary, id],
  );

  const form = useForm<ShippingSchema>({
    resolver: zodResolver(shippingSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues]);

  const onSubmit: SubmitHandler<ShippingSchema> = async (data: ShippingSchema) => {
    try {
      setIsLoading(true);
      if (id) {
        await adminService.UpdateShipmentCarrier({
          ...(data as unknown as Omit<UpdateShipmentCarrierRequest, 'id'>),
          id,
        });
        showMessage('Shipping updated successfully', 'success');
      } else {
        await adminService.AddShipmentCarrier({
          ...(data as unknown as AddShipmentCarrierRequest),
        });
        showMessage('Shipping created successfully', 'success');
      }
      await refetch();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save shipping';
      showMessage(msg, 'error');
      console.error('Failed to save shipping', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <UpsertShippingModal
      open={open}
      onOpenChange={onOpenChange}
      onSave={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <form>
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-10 h-full'>
            <div className='flex flex-col gap-6'>
              <InputField name='carrier' label='Carrier' />
              <TextareaField name='description' label='Description' />
              <InputField name='expectedDeliveryTime' label='Expected Delivery Time' />
              <InputField name='trackingUrl' label='Tracking URL' />
            </div>
            <div className='flex flex-col gap-6'>
              <div className='space-y-1'>
                <Text variant='uppercase' className='leading-none'>
                  status
                </Text>
                <ToggleField name='allowed' label='Allowed' />
              </div>
              <ToggleGroupField
                name='allowedRegions'
                label='Allowed Regions'
                items={ALLOWED_REGIONS.map((r) => ({ value: r.value, label: r.label }))}
              />
              <CarrierPrices basePath='prices' />
            </div>
          </div>
        </form>
      </Form>
    </UpsertShippingModal>
  );
}
