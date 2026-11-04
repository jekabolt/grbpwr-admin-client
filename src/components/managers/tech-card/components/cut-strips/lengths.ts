export const CUT_STRIP_MODES = ['from_seam', 'per_size', 'one_length'] as const;

type DecimalLike = string | number | { value?: string | null } | null | undefined;

type StripLike = {
  lengthMode?: string | null;
  fitPct?: DecimalLike;
  overlapMm?: DecimalLike;
  oneLengthMm?: string | number | null;
  sizes?: ReadonlyArray<{
    sizeId?: string | number | null;
    seamMm?: DecimalLike;
    manualCutMm?: string | number | null;
  }> | null;
};

type Fraction = { numerator: bigint; denominator: bigint };

const decimalText = (value: DecimalLike): string => {
  if (typeof value === 'object' && value !== null) return (value.value ?? '').trim();
  return value == null ? '' : String(value).trim();
};

const decimalFraction = (value: DecimalLike): Fraction | undefined => {
  const text = decimalText(value).replace(',', '.');
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return undefined;
  const places = match[3]?.length ?? 0;
  const denominator = 10n ** BigInt(places);
  const digits = `${match[2]}${match[3] ?? ''}`;
  const numerator = BigInt(digits) * (match[1] === '-' ? -1n : 1n);
  return { numerator, denominator };
};

const numberValue = (value: string | number | null | undefined): number | undefined => {
  if (value == null || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const roundHalfUp = ({ numerator, denominator }: Fraction): number => {
  const rounded =
    numerator >= 0n
      ? (numerator * 2n + denominator) / (denominator * 2n)
      : -((-numerator * 2n + denominator) / (denominator * 2n));
  return Number(rounded);
};

const decimalNumber = (value: DecimalLike, fallback: number): number => {
  const text = decimalText(value).replace(',', '.');
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function stripCutMm(strip: StripLike, sizeId: number): number | undefined {
  const size = strip.sizes?.find((row) => Number(row.sizeId) === sizeId);
  const manual = numberValue(size?.manualCutMm);

  if (strip.lengthMode !== 'one_length' && manual !== undefined) return manual;
  if (strip.lengthMode === 'one_length') return numberValue(strip.oneLengthMm);
  if (strip.lengthMode !== 'from_seam') return undefined;

  const seam = decimalFraction(size?.seamMm);
  if (!seam) return undefined;
  const fit = decimalFraction(strip.fitPct ?? 100);
  const overlap = decimalFraction(strip.overlapMm ?? 0);
  if (!fit || !overlap) return undefined;

  const scaledDenominator = seam.denominator * fit.denominator * 100n;
  return roundHalfUp({
    numerator:
      seam.numerator * fit.numerator * overlap.denominator + overlap.numerator * scaledDenominator,
    denominator: scaledDenominator * overlap.denominator,
  });
}

export function stripSewnMm(strip: StripLike, sizeId: number): number | undefined {
  const cut = stripCutMm(strip, sizeId);
  return cut === undefined ? undefined : cut - decimalNumber(strip.overlapMm, 0);
}
