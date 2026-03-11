import { z } from 'zod';

export const promoDraftSchema = z
  .object({
    code: z.string().min(1, 'Code is required'),
    start: z.string(),
    expiration: z.string(),
    discount: z
      .string()
      .refine((v) => !v || /^\d+(\.\d+)?$/.test(v), 'Invalid number')
      .refine(
        (v) => {
          const n = parseFloat(v || '0');
          return Number.isNaN(n) || (n >= 0 && n <= 100);
        },
        { message: 'Discount must be between 0 and 100' }
      ),
    freeShipping: z.boolean(),
    voucher: z.boolean(),
    allowed: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.start && data.expiration) {
      const start = new Date(data.start).getTime();
      const exp = new Date(data.expiration).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(exp) && start > exp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Start must be before expiration',
          path: ['expiration'],
        });
      }
    }
  });

export type PromoDraftSchema = z.infer<typeof promoDraftSchema>;

export const emptyPromoDraft: PromoDraftSchema = {
  code: '',
  start: '',
  expiration: '',
  discount: '0',
  freeShipping: false,
  voucher: false,
  allowed: true,
};
