import { z } from 'zod';

const stockChangeSourceEnum = z.enum([
  'STOCK_CHANGE_SOURCE_UNSPECIFIED',
  'STOCK_CHANGE_SOURCE_ADMIN_ADD_PRODUCT',
  'STOCK_CHANGE_SOURCE_ADMIN_UPDATE_PRODUCT',
  'STOCK_CHANGE_SOURCE_ADMIN_UPDATE_SIZE_STOCK',
  'STOCK_CHANGE_SOURCE_ORDER_PLACED',
  'STOCK_CHANGE_SOURCE_ORDER_CANCELLED',
  'STOCK_CHANGE_SOURCE_ORDER_EXPIRED',
  'STOCK_CHANGE_SOURCE_ORDER_REFUNDED',
]);

const orderFactorEnum = z.enum(['ORDER_FACTOR_ASC', 'ORDER_FACTOR_DESC']);

export const stockHistoryFilterSchema = z.object({
  dateFrom: z.string().default(''),
  dateTo: z.string().default(''),
  limit: z.string().default('30'),
  source: stockChangeSourceEnum.default('STOCK_CHANGE_SOURCE_UNSPECIFIED'),
  orderFactor: orderFactorEnum.default('ORDER_FACTOR_DESC'),
  sizeId: z.string().default(''),
});

export type StockHistoryFilterSchema = z.infer<typeof stockHistoryFilterSchema>;

export const defaultStockHistoryFilters: StockHistoryFilterSchema = {
  dateFrom: '',
  dateTo: '',
  limit: '30',
  source: 'STOCK_CHANGE_SOURCE_UNSPECIFIED',
  orderFactor: 'ORDER_FACTOR_DESC',
  sizeId: '',
};
