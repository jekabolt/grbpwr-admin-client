import type { googletype_Decimal } from 'api/proto-http/admin';
import { normalizeDecimalInput } from 'utils/decimal';

const wireCount = (raw?: string): googletype_Decimal => ({
  value: normalizeDecimalInput(raw).replace(/\.$/, ''),
});

/**
 * ПАРА НА ПРОВОДЕ (`qty_per_garment` + `spare_qty`): присутствие одно на двоих. Форма не знает
 * ни одной половины — обе не едут («не трогай»); знает хоть одну — едут обе, пустая явным
 * `{value:''}`. Одну половину без другой не шлём никогда: сервер записал бы обе.
 */
export function countedPairOut(
  qtyPerGarment?: string,
  spareQty?: string,
): { qtyPerGarment?: googletype_Decimal; spareQty?: googletype_Decimal } {
  if (qtyPerGarment == null && spareQty == null) return {};
  return { qtyPerGarment: wireCount(qtyPerGarment), spareQty: wireCount(spareQty) };
}
