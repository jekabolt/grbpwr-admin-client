import { common_MaterialPrice as MaterialPrice } from 'api/proto-http/admin';

export function isPurchasePrice(price?: MaterialPrice): boolean {
  const source = price?.source?.trim().toLowerCase();
  return source === 'purchase' || source === 'production_run';
}
