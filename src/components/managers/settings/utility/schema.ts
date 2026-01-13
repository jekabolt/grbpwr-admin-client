import z from 'zod';
//comment
const announceTranslationSchema = z.object({
  languageId: z.number().optional(),
  text: z.string().optional(),
});

const paymentMethodSchema = z.object({
  allow: z.boolean().optional(),
  paymentMethod: z
    .enum([
      'PAYMENT_METHOD_NAME_ENUM_UNKNOWN',
      'PAYMENT_METHOD_NAME_ENUM_CARD',
      'PAYMENT_METHOD_NAME_ENUM_CARD_TEST',
      'PAYMENT_METHOD_NAME_ENUM_ETH',
      'PAYMENT_METHOD_NAME_ENUM_ETH_TEST',
      'PAYMENT_METHOD_NAME_ENUM_USDT_TRON',
      'PAYMENT_METHOD_NAME_ENUM_USDT_SHASTA',
    ])
    .optional(),
});

const shipmentCarrierSchema = z.object({
  allow: z.boolean().optional(),
  carrier: z.string().optional(),
  prices: z.record(z.string(), z.object({ value: z.string().optional() })).optional(),
});

export const settingsSchema = z.object({
  announce: z
    .object({
      link: z.string().optional(),
      translations: z.array(announceTranslationSchema).optional(),
    })
    .optional(),
  bigMenu: z.boolean().optional(),
  maxOrderItems: z.number().optional(),
  paymentMethods: z.array(paymentMethodSchema).optional(),
  shipmentCarriers: z.array(shipmentCarrierSchema).optional(),
  siteAvailable: z.boolean().optional(),
});

export const defaultSettings = {
  announce: {
    link: '',
    translations: [],
  },
  bigMenu: false,
  maxOrderItems: 0,
  paymentMethods: [],
  shipmentCarriers: [],
  siteAvailable: true,
};

export type SettingsSchema = z.infer<typeof settingsSchema>;

export function transformDictionaryToSettings(dictionary: any): SettingsSchema {
  return {
    paymentMethods: dictionary.paymentMethods?.map((method: any) => ({
      paymentMethod: method.name,
      allow: method.allowed ?? false,
    })),
    shipmentCarriers: dictionary.shipmentCarriers?.map((carrier: any) => {
      const pricesMap: Record<string, { value: string }> = {};
      carrier.prices?.forEach((price: any) => {
        if (price.currency && price.price?.value) {
          pricesMap[price.currency] = { value: price.price.value };
        }
      });
      return {
        carrier: carrier.shipmentCarrier?.carrier,
        allow: carrier.shipmentCarrier?.allowed ?? false,
        prices: pricesMap,
      };
    }),
    maxOrderItems: dictionary.maxOrderItems || 0,
    siteAvailable: dictionary.siteEnabled || false,
    bigMenu: dictionary.bigMenu || false,
    announce: {
      link: dictionary.announce?.link || '',
      translations:
        dictionary.announce?.translations?.map?.((translation: any) => ({
          languageId: translation.languageId,
          text: translation.text,
        })) || [],
    },
  };
}
