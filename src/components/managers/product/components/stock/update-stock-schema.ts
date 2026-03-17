import type { DefaultValues } from 'react-hook-form';
import { z } from 'zod';

const stockAdjustmentModes = ['STOCK_ADJUSTMENT_MODE_SET', 'STOCK_ADJUSTMENT_MODE_ADJUST'] as const;

const stockAdjustmentDirections = [
  'STOCK_ADJUSTMENT_DIRECTION_INCREASE',
  'STOCK_ADJUSTMENT_DIRECTION_DECREASE',
] as const;

const stockChangeReasons = [
  'STOCK_CHANGE_REASON_STOCK_COUNT',
  'STOCK_CHANGE_REASON_DAMAGE',
  'STOCK_CHANGE_REASON_LOSS',
  'STOCK_CHANGE_REASON_FOUND',
  'STOCK_CHANGE_REASON_CORRECTION',
  'STOCK_CHANGE_REASON_RESERVED_RELEASE',
  'STOCK_CHANGE_REASON_OTHER',
] as const;

const modeLabels: Record<(typeof stockAdjustmentModes)[number], string> = {
  STOCK_ADJUSTMENT_MODE_SET: 'Set',
  STOCK_ADJUSTMENT_MODE_ADJUST: 'Adjust',
};

const directionLabels: Record<(typeof stockAdjustmentDirections)[number], string> = {
  STOCK_ADJUSTMENT_DIRECTION_INCREASE: 'Increase',
  STOCK_ADJUSTMENT_DIRECTION_DECREASE: 'Decrease',
};

const reasonLabels: Record<(typeof stockChangeReasons)[number], string> = {
  STOCK_CHANGE_REASON_STOCK_COUNT: 'Stock count',
  STOCK_CHANGE_REASON_DAMAGE: 'Damage',
  STOCK_CHANGE_REASON_LOSS: 'Loss',
  STOCK_CHANGE_REASON_FOUND: 'Found',
  STOCK_CHANGE_REASON_CORRECTION: 'Correction',
  STOCK_CHANGE_REASON_RESERVED_RELEASE: 'Reserved release',
  STOCK_CHANGE_REASON_OTHER: 'Other',
};

const REASON_MODE_SET = 'STOCK_CHANGE_REASON_STOCK_COUNT';
const REASON_MODE_ADJUST = [
  'STOCK_CHANGE_REASON_DAMAGE',
  'STOCK_CHANGE_REASON_LOSS',
  'STOCK_CHANGE_REASON_FOUND',
  'STOCK_CHANGE_REASON_CORRECTION',
  'STOCK_CHANGE_REASON_RESERVED_RELEASE',
  'STOCK_CHANGE_REASON_OTHER',
] as const;

const REASON_DIRECTION_DECREASE = [
  'STOCK_CHANGE_REASON_DAMAGE',
  'STOCK_CHANGE_REASON_LOSS',
] as const;
const REASON_DIRECTION_INCREASE = [
  'STOCK_CHANGE_REASON_FOUND',
  'STOCK_CHANGE_REASON_RESERVED_RELEASE',
] as const;

export const MODE_OPTIONS: { label: string; value: string }[] = stockAdjustmentModes.map((v) => ({
  label: modeLabels[v],
  value: v,
}));

export const DIRECTION_OPTIONS: { label: string; value: string }[] = stockAdjustmentDirections.map(
  (v) => ({
    label: directionLabels[v],
    value: v,
  }),
);

export const REASON_OPTIONS: { label: string; value: string }[] = stockChangeReasons.map((v) => ({
  label: reasonLabels[v],
  value: v,
}));

export const updateStockSchema = z
  .object({
    mode: z.enum(stockAdjustmentModes),
    sizeId: z.number().min(1, 'Size is required'),
    quantity: z.number().refine((n) => !Number.isNaN(n), 'Quantity must be a valid number'),
    direction: z.enum(stockAdjustmentDirections).optional(),
    reason: z.enum(stockChangeReasons),
    comment: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const { mode, direction, reason, comment, quantity } = data;

    // quantity: set requires >= 0, adjust requires > 0
    if (typeof quantity === 'number' && !Number.isNaN(quantity)) {
      if (mode === 'STOCK_ADJUSTMENT_MODE_SET' && quantity < 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Quantity cannot be negative for Set mode',
          path: ['quantity'],
        });
      } else if (mode === 'STOCK_ADJUSTMENT_MODE_ADJUST' && quantity <= 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Quantity must be greater than 0 for Adjust mode',
          path: ['quantity'],
        });
      }
    }

    // stock_count: only with mode=set, direction not allowed
    if (reason === REASON_MODE_SET) {
      if (mode !== 'STOCK_ADJUSTMENT_MODE_SET') {
        ctx.addIssue({
          code: 'custom',
          message: 'Stock count is only allowed with mode "Set"',
          path: ['reason'],
        });
      }
      if (direction != null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Direction is not allowed for stock count',
          path: ['direction'],
        });
      }
      return;
    }

    // damage, loss, found, correction, reserved_release, other: only with mode=adjust
    if (!REASON_MODE_ADJUST.includes(reason)) return;

    if (mode !== 'STOCK_ADJUSTMENT_MODE_ADJUST') {
      ctx.addIssue({
        code: 'custom',
        message: 'This reason requires mode "Adjust"',
        path: ['reason'],
      });
    }

    if (mode !== 'STOCK_ADJUSTMENT_MODE_ADJUST') return;

    // direction required for adjust mode
    if (direction == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Direction is required',
        path: ['direction'],
      });
      return;
    }

    // damage, loss: direction must be decrease
    if (
      (REASON_DIRECTION_DECREASE as readonly string[]).includes(reason) &&
      direction !== 'STOCK_ADJUSTMENT_DIRECTION_DECREASE'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Direction must be "Decrease" for this reason',
        path: ['direction'],
      });
    }

    // found, reserved_release: direction must be increase
    if (
      (REASON_DIRECTION_INCREASE as readonly string[]).includes(reason) &&
      direction !== 'STOCK_ADJUSTMENT_DIRECTION_INCREASE'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Direction must be "Increase" for this reason',
        path: ['direction'],
      });
    }

    // other: comment required
    if (reason === 'STOCK_CHANGE_REASON_OTHER' && (!comment || !comment.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'Comment is required for "Other"',
        path: ['comment'],
      });
    }
  });

export const defaultData: DefaultValues<z.infer<typeof updateStockSchema>> = {
  mode: 'STOCK_ADJUSTMENT_MODE_SET',
  sizeId: undefined,
  quantity: undefined,
  direction: undefined,
  reason: undefined,
  comment: undefined,
};

export type UpdateStockData = z.infer<typeof updateStockSchema>;
