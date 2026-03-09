import { z } from 'zod';

const stockChangeReasons = [
  'STOCK_CHANGE_REASON_DAMAGED',
  'STOCK_CHANGE_REASON_LOST',
  'STOCK_CHANGE_REASON_FOUND',
  'STOCK_CHANGE_REASON_RESTOCK',
  'STOCK_CHANGE_REASON_INVENTORY_CORRECTION',
  'STOCK_CHANGE_REASON_RETURN_DEFECTIVE',
  'STOCK_CHANGE_REASON_THEFT',
] as const;

const reasonLabels: Record<(typeof stockChangeReasons)[number], string> = {
  STOCK_CHANGE_REASON_DAMAGED: 'Damaged',
  STOCK_CHANGE_REASON_LOST: 'Lost',
  STOCK_CHANGE_REASON_FOUND: 'Found',
  STOCK_CHANGE_REASON_RESTOCK: 'Restock',
  STOCK_CHANGE_REASON_INVENTORY_CORRECTION: 'Inventory correction',
  STOCK_CHANGE_REASON_RETURN_DEFECTIVE: 'Return defective',
  STOCK_CHANGE_REASON_THEFT: 'Theft',
};

export const REASON_OPTIONS: { label: string; value: string }[] = stockChangeReasons.map((v) => ({
  label: reasonLabels[v],
  value: v,
}));

export const updateStockSchema = z.object({
  sizeId: z.number().min(1, 'Size is required'),
  quantity: z.number().min(1, 'Quantity is required'),
  reason: z.enum(stockChangeReasons),
  comment: z.string().optional(),
});

export const defaultData = {
  sizeId: undefined,
  quantity: undefined,
  reason: undefined,
  comment: undefined,
};

export type UpdateStockData = z.infer<typeof updateStockSchema>;
