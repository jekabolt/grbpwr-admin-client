import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import {
  AddShipmentCarrierRequest,
  common_ShippingRegion,
  UpdateShipmentCarrierRequest,
} from 'api/proto-http/admin';
import { CarrierPrices } from 'components/managers/settings/components/carrier-prices';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import {
  CalloutBox,
  GroupLabel,
  Form,
  InputField,
  Text,
  TextareaField,
  ToggleField,
  ToggleGroupField,
} from 'ui';
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

  // A refused save stands in the dialog until the next attempt.
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setFormError(null);
  }, [open]);

  // No receipt: the dialog closing and the carrier list changing are it.
  const onSubmit: SubmitHandler<ShippingSchema> = async (data: ShippingSchema) => {
    setFormError(null);
    try {
      setIsLoading(true);
      const { from, to, autoDeliverAfterHours, ...rest } = data;
      const payload = {
        ...rest,
        expectedDeliveryTime: `${from}-${to}`,
        autoDeliverAfterHours: Number(autoDeliverAfterHours) || 0,
      };
      if (id) {
        await adminService.UpdateShipmentCarrier({
          ...(payload as unknown as Omit<UpdateShipmentCarrierRequest, 'id'>),
          id,
        });
      } else {
        await adminService.AddShipmentCarrier({
          ...(payload as unknown as AddShipmentCarrierRequest),
        });
      }
      await refetch();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save shipping';
      if (failureClassOfError(e) === 'refused') setFormError(msg);
      else
        notify({
          sev: 'error',
          subject: `CARRIER ${data.carrier || id || ''}`.trim(),
          text: 'not saved',
          detail: msg,
          action:
            failureClassOfError(e) === 'transient'
              ? { label: 'retry', onClick: () => void onSubmit(data) }
              : undefined,
        });
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
          {formError && (
            <CalloutBox tone='error' className='mb-4'>
              <Text size='micro' component='span' role='alert'>
                <b>not saved</b> · {formError}
              </Text>
            </CalloutBox>
          )}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-10 h-full'>
            <div className='flex flex-col gap-6'>
              <InputField name='carrier' label='Carrier *' />
              <TextareaField name='description' label='Description' />
              <div className='flex gap-4 flex-col'>
                <GroupLabel flush>expected delivery time</GroupLabel>
                <div className='flex gap-4 items-end'>
                  <InputField name='from' type='number' min='0' placeholder='from' />
                  <InputField name='to' type='number' min='0' placeholder='to' />
                </div>
              </div>
              <InputField name='trackingUrl' label='Tracking URL' />
              <div className='flex flex-col gap-4'>
                <GroupLabel flush>auto-tracking (aftership)</GroupLabel>
                <InputField
                  name='aftershipSlug'
                  label='AfterShip Slug'
                  placeholder='e.g. dhl (empty = timer-only)'
                />
                <InputField
                  name='autoDeliverAfterHours'
                  type='number'
                  min='0'
                  label='Auto-deliver After (hours, 0 = default)'
                />
              </div>
            </div>
            <div className='flex flex-col gap-6'>
              <div className='space-y-1'>
                <GroupLabel flush>status</GroupLabel>
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
