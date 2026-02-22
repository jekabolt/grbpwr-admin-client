import { z } from 'zod';

const INTEGER_CURRENCIES = ['JPY', 'KRW'];

export const shippingSchema = z
  .object({
    allowed: z.boolean(),
    allowedRegions: z.array(z.string()),
    carrier: z.string(),
    description: z.string(),
    expectedDeliveryTime: z.string(),
    prices: z.record(z.string(), z.object({ value: z.string() })),
    trackingUrl: z.string(),
  })
  .superRefine((data, ctx) => {
    const hasInvalid = INTEGER_CURRENCIES.some((currency) => {
      const v = data.prices?.[currency]?.value;
      return v != null && v !== '' && !/^\d+$/.test(v);
    });
    if (hasInvalid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JPY and KRW must be whole numbers (no decimals)',
        path: ['prices'],
      });
    }
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
      let value = price.price.value;
      if (INTEGER_CURRENCIES.includes(price.currency)) {
        const n = parseFloat(value);
        value = (!Number.isNaN(n) ? Math.round(n) : 0).toString();
      }
      pricesMap[price.currency] = { value };
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
