import { common_PaymentMethodNameEnum } from 'api/proto-http/admin';
import { LANGUAGES, SELLING_CURRENCIES } from 'constants/constants';
import z from 'zod';

// Payment methods the storefront checkout screen (this Settings page) actually supports today.
// `common_PaymentMethodNameEnum` also defines BANK_INVOICE and CASH, but those are for
// manually-created custom orders (see custom-orders/components/schema.ts), not online checkout
// — do not add them here just because they exist on the enum. This is the single allow-list
// source for both the form validator below and which `dictionary.paymentMethods` rows render
// in the "payment methods" / "processing fees" sections of the Settings page — extend only
// here (and only once checkout itself supports the method) to surface a new one.
export const ALLOWED_PAYMENT_METHOD_NAMES = [
  'PAYMENT_METHOD_NAME_ENUM_CARD',
  'PAYMENT_METHOD_NAME_ENUM_CARD_TEST',
] as const satisfies readonly common_PaymentMethodNameEnum[];

const requiredLanguageIds = LANGUAGES.map((l) => l.id);

// Reusable strict translation validator
const createStrictTranslationSchema = <T extends z.ZodType>(
  translationSchema: T,
  requiredIds: number[],
) => {
  return z
    .array(translationSchema)
    .min(1, 'At least one translation is required')
    .refine(
      (arr) => {
        const ids = arr.map((t: any) => t.languageId);
        const uniqueIds = new Set(ids);
        return uniqueIds.size === ids.length;
      },
      { message: 'Each language can only appear once' },
    )
    .refine((arr) => arr.length === requiredIds.length, {
      message: `Exactly ${requiredIds.length} language(s) required`,
    })
    .refine((arr) => requiredIds.every((id) => arr.some((t: any) => t.languageId === id)), {
      message: 'All languages must be filled',
    });
};

const announceTranslationSchema = z.object({
  languageId: z.number().min(1, 'Language is required'),
  text: z
    .string()
    .min(1, 'Announcement text is required')
    .max(110, 'Announcement text cannot exceed 110 characters'),
});

const paymentMethodSchema = z.object({
  allow: z.boolean().optional(),
  paymentMethod: z
    .enum(['PAYMENT_METHOD_NAME_ENUM_UNKNOWN', ...ALLOWED_PAYMENT_METHOD_NAMES] as const)
    .optional(),
});

const INTEGER_CURRENCIES = ['JPY', 'KRW'];

const shipmentCarrierSchema = z.object({
  allow: z.boolean().optional(),
  carrier: z.string().optional(),
  prices: z.record(z.string(), z.object({ value: z.string().optional() })).optional(),
});

const complimentaryPricesSchema = z
  .record(z.string(), z.object({ value: z.string().optional() }))
  .optional();

export const settingsSchema = z
  .object({
    announce: z
      .object({
        link: z.string().optional(),
        translations: createStrictTranslationSchema(announceTranslationSchema, requiredLanguageIds),
      })
      .optional(),
    bigMenu: z.boolean().optional(),
    complimentaryShippingPrices: complimentaryPricesSchema,
    maxOrderItems: z.number().optional(),
    paymentMethods: z.array(paymentMethodSchema).optional(),
    shipmentCarriers: z.array(shipmentCarrierSchema).optional(),
    siteAvailable: z.boolean().optional(),
    isProd: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    data.shipmentCarriers?.forEach((carrier, i) => {
      if (!carrier.prices) return;
      const hasInvalid = INTEGER_CURRENCIES.some((currency) => {
        const v = carrier.prices?.[currency]?.value;
        return v != null && v !== '' && !/^\d+$/.test(v);
      });
      if (hasInvalid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JPY and KRW must be whole numbers (no decimals)',
          path: ['shipmentCarriers', i, 'prices'],
        });
      }
    });
    if (data.complimentaryShippingPrices) {
      const hasInvalid = INTEGER_CURRENCIES.some((currency) => {
        const v = data.complimentaryShippingPrices?.[currency]?.value;
        return v != null && v !== '' && !/^\d+$/.test(v);
      });
      if (hasInvalid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JPY and KRW must be whole numbers (no decimals)',
          path: ['complimentaryShippingPrices'],
        });
      }
    }
  });

export const defaultSettings = {
  announce: {
    link: '',
    translations: LANGUAGES.map((l) => ({ languageId: l.id, text: '' })),
  },
  bigMenu: false,
  complimentaryShippingPrices: SELLING_CURRENCIES.reduce<Record<string, { value: string }>>(
    (acc, c) => ({ ...acc, [c.value]: { value: '0' } }),
    {},
  ),
  maxOrderItems: 0,
  paymentMethods: [],
  shipmentCarriers: [],
  siteAvailable: true,
  isProd: false,
};

export type SettingsSchema = z.infer<typeof settingsSchema>;

export function transformDictionaryToSettings(dictionary: any): SettingsSchema {
  const complimentaryMap: Record<string, { value: string }> = {};
  SELLING_CURRENCIES.forEach((c) => {
    const raw = dictionary.complimentaryShippingPrices?.[c.value]?.value;
    let value = raw ?? '0';
    if (INTEGER_CURRENCIES.includes(c.value)) {
      const n = parseFloat(value);
      value = (!Number.isNaN(n) ? Math.round(n) : 0).toString();
    }
    complimentaryMap[c.value] = { value };
  });

  return {
    complimentaryShippingPrices: complimentaryMap,
    paymentMethods: dictionary.paymentMethods
      ?.filter((method: any) => ALLOWED_PAYMENT_METHOD_NAMES.includes(method?.name))
      .map((method: any) => ({
        paymentMethod: method.name,
        allow: method.allowed ?? false,
      })),
    shipmentCarriers: dictionary.shipmentCarriers?.map((carrier: any) => {
      const pricesMap: Record<string, { value: string }> = {};
      carrier.prices?.forEach((price: any) => {
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
        carrier: carrier.shipmentCarrier?.carrier,
        allow: carrier.shipmentCarrier?.allowed ?? false,
        prices: pricesMap,
      };
    }),
    maxOrderItems: dictionary.maxOrderItems || 0,
    siteAvailable: dictionary.siteEnabled || false,
    bigMenu: dictionary.bigMenu || false,
    isProd: dictionary.isProd || false,
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
