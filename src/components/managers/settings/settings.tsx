import { UpdateSettingsRequest } from 'api/proto-http/admin';
import { updateSettings } from 'api/settings';
import { useDictionaryStore, useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

export function Settings() {
  const { dictionary, fetchDictionary } = useDictionaryStore();
  const { showMessage } = useSnackBarStore();
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<UpdateSettingsRequest>();
  const [isChanged, setIsChanged] = useState(false);

  useEffect(() => {
    if (dictionary?.paymentMethods) {
      setSettings({
        paymentMethods: dictionary.paymentMethods?.map((method) => ({
          paymentMethod: method.name,
          allow: method.allowed ?? false,
        })),
        shipmentCarriers: dictionary.shipmentCarriers?.map((carrier) => ({
          carrier: carrier.shipmentCarrier?.carrier,
          allow: carrier.shipmentCarrier?.allowed ?? false,
          price: { value: carrier.shipmentCarrier?.price?.value || '0' },
        })),
        maxOrderItems: dictionary.maxOrderItems || 0,
        siteAvailable: dictionary.siteEnabled || false,
        bigMenu: dictionary.bigMenu || false,
      });
    }
  }, [dictionary]);

  const updateField = (field: keyof UpdateSettingsRequest, value: any, index?: number) => {
    setSettings((prev) => {
      if (!prev) return prev;

      if (index !== undefined && field in prev && Array.isArray(prev[field])) {
        const newArray = [...(prev[field] as any[])];
        newArray[index] = { ...newArray[index], ...value };
        return { ...prev, [field]: newArray };
      }
      return { ...prev, [field]: value };
    });
    setIsChanged(true);
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      setIsLoading(true);
      await updateSettings(settings);
      showMessage('Settings updated successfully', 'success');
      setIsChanged(false);
      await fetchDictionary(true);
    } catch (error) {
      showMessage('Failed to update settings', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='grid gap-4 w-full h-full items-center justify-center'>
      <div className='space-y-2'>
        <Text variant='uppercase' className='text-xl font-bold'>
          payment methods
        </Text>
        <div className='grid gap-2'>
          {settings?.paymentMethods?.map((method, index) => (
            <div key={method.paymentMethod} className='flex items-center gap-2'>
              <CheckboxCommon
                name={method.paymentMethod || ''}
                checked={method.allow}
                onChange={() => updateField('paymentMethods', { allow: !method.allow }, index)}
              />
              <Text>
                {method.paymentMethod?.replace('PAYMENT_METHOD_NAME_ENUM_', '').replace('_', ' ')}
              </Text>
            </div>
          ))}
        </div>
      </div>
      <div className='space-y-2'>
        <Text variant='uppercase' className='text-xl font-bold'>
          shipment carriers
        </Text>
        <div className='grid gap-3'>
          {settings?.shipmentCarriers?.map((carrier, index) => (
            <div key={carrier.carrier} className='space-y-2'>
              <div className='flex items-center gap-2'>
                <CheckboxCommon
                  name='carrier'
                  checked={carrier.allow}
                  onChange={() => updateField('shipmentCarriers', { allow: !carrier.allow }, index)}
                />
                <Text>{carrier.carrier}</Text>
                <Input
                  name='carrierPrice'
                  type='text'
                  value={carrier.price?.value || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateField('shipmentCarriers', { price: { value: e.target.value } }, index)
                  }
                  className='w-32'
                />
              </div>
              <Text size='small' variant='uppercase'>
                {dictionary?.shipmentCarriers?.[index]?.shipmentCarrier?.description}
              </Text>
            </div>
          ))}
        </div>
      </div>
      <div className='flex items-center gap-2'>
        <Text variant='uppercase' className='whitespace-nowrap font-bold'>
          max order quantity
        </Text>
        <Input
          name='maxOrderQuantity'
          type='text'
          value={settings?.maxOrderItems}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            /^\d+$/.test(e.target.value) &&
            updateField('maxOrderItems', parseInt(e.target.value, 10))
          }
        />
      </div>
      <div className='flex items-center gap-2'>
        <Text variant='uppercase' className='font-bold'>
          site available
        </Text>
        <CheckboxCommon
          name='siteAvailable'
          checked={settings?.siteAvailable}
          onChange={() => updateField('siteAvailable', !settings?.siteAvailable)}
        />
      </div>
      <Text variant='uppercase' className='font-bold'>
        base currency: {dictionary?.baseCurrency}
      </Text>
      <Button
        size='lg'
        onClick={handleSave}
        disabled={!isChanged || isLoading}
        loading={isLoading}
        className='mt-4'
      >
        {isLoading ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}
