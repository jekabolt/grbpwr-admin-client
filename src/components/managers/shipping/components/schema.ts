import { z } from 'zod';

export const shippingSchema = z.object({
  allowed: z.boolean(),
  allowedRegions: z.array(z.string()),
  carrier: z.string(),
  description: z.string(),
  expectedDeliveryTime: z.string(),
  prices: z.record(z.string(), z.object({ value: z.string() })),
  trackingUrl: z.string(),
});

export const defaultShipping = {
  allowed: true,
  allowedRegions: [],
  carrier: '',
  description: '',
  expectedDeliveryTime: '',
  prices: {},
  trackingUrl: '',
};

export type ShippingSchema = z.infer<typeof shippingSchema>;

export function transformDictionaryToShipping(dictionary: any, id?: number): ShippingSchema {
  if (!dictionary) {
    return defaultShipping;
  }

  let source: any = dictionary;

  if (typeof id === 'number' && Array.isArray(dictionary.shipmentCarriers)) {
    const carrier = dictionary.shipmentCarriers.find((c: any) => c.id === id);

    if (!carrier) {
      return defaultShipping;
    }

    source = {
      allowed: carrier.shipmentCarrier?.allowed,
      allowedRegions: carrier.allowedRegions ?? [],
      carrier: carrier.shipmentCarrier?.carrier,
      description: carrier.shipmentCarrier?.description,
      expectedDeliveryTime: carrier.shipmentCarrier?.expectedDeliveryTime,
      prices: carrier.prices,
      trackingUrl: carrier.shipmentCarrier?.trackingUrl,
    };
  }

  const pricesMap: Record<string, { value: string }> = {};
  source.prices?.forEach?.((price: any) => {
    if (price.currency && price.price?.value) {
      pricesMap[price.currency] = { value: price.price.value };
    }
  });

  return {
    allowed: source.allowed ?? true,
    allowedRegions: source.allowedRegions ?? [],
    carrier: source.carrier ?? '',
    description: source.description ?? '',
    expectedDeliveryTime: source.expectedDeliveryTime ?? '',
    prices: pricesMap,
    trackingUrl: source.trackingUrl ?? '',
  };
}
