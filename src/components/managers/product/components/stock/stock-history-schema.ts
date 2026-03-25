import { z } from 'zod';

const stockChangeSourceEnum = z.enum([
  'STOCK_CHANGE_SOURCE_UNSPECIFIED',
  'STOCK_CHANGE_SOURCE_ADMIN_NEW_PRODUCT',
  'STOCK_CHANGE_SOURCE_MANUAL_ADJUSTMENT',
  'STOCK_CHANGE_SOURCE_ORDER_PAID',
  'STOCK_CHANGE_SOURCE_ORDER_CUSTOM',
  'STOCK_CHANGE_SOURCE_ORDER_RETURNED',
  'STOCK_CHANGE_SOURCE_ORDER_CANCELLED',
]);

const orderFactorEnum = z.enum(['ORDER_FACTOR_ASC', 'ORDER_FACTOR_DESC']);

export const stockHistoryFilterSchema = z.object({
  dateFrom: z.string().default(''),
  dateTo: z.string().default(''),
  limit: z.string().default('30'),
  source: stockChangeSourceEnum.default('STOCK_CHANGE_SOURCE_UNSPECIFIED'),
  orderFactor: orderFactorEnum.default('ORDER_FACTOR_DESC'),
  sizeId: z.string().default('__all__'),
});

export type StockHistoryFilterSchema = z.infer<typeof stockHistoryFilterSchema>;

export const defaultStockHistoryFilters: StockHistoryFilterSchema = {
  dateFrom: '',
  dateTo: '',
  limit: '30',
  source: 'STOCK_CHANGE_SOURCE_UNSPECIFIED',
  orderFactor: 'ORDER_FACTOR_DESC',
  sizeId: '__all__',
};
