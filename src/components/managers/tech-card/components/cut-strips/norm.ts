import type { common_TechCardCutStripNorm } from 'api/proto-http/admin';
import { decimalToInput } from 'utils/decimal';

/** Read the server's summed strip norm at the card's base size (or its first available size). */
export function cutStripNorm(
  norms: readonly common_TechCardCutStripNorm[] | undefined,
  bomLineKey: string | undefined,
  baseSizeId: number | undefined,
): string {
  const key = bomLineKey?.trim() ?? '';
  const norm = (norms ?? []).find((candidate) => candidate.bomLineKey?.trim() === key);
  if (!norm) return '';
  const scalar = decimalToInput(norm.norm);
  if (scalar) return scalar;
  const sizes = norm.sizeNorms ?? [];
  const base =
    sizes.find((candidate) => Number(candidate.sizeId) === Number(baseSizeId)) ?? sizes[0];
  return decimalToInput(base?.consumption);
}
