export const CUT_STRIP_MODES = ['from_seam', 'per_size', 'one_length'] as const;

type DecimalLike = string | number | { value?: string | null } | null | undefined;

type StripLike = {
  lengthMode?: string | null;
  seamKey?: string | null;
  /** Set by withSeamGone: the strip's seam is stale or rejected, so its stored seam length is not a length. */
  seamGone?: boolean;
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
  if (strip.lengthMode !== 'from_seam' || strip.seamGone) return undefined;

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

type SeamStateLike = { seamKey?: string | null; status?: string | null; stale?: boolean | null };

const confirmedSeam = (status?: string | null) =>
  status === 'confirmed' || status === 'TECH_CARD_SEAM_STATUS_CONFIRMED';

/**
 * The seams whose decision no longer holds: stale (the pattern changed since) or not confirmed. A
 * from_seam strip on one of them has no length, as on the server; a seam key with no row is left alone.
 */
export function goneSeamKeys(
  rows: ReadonlyArray<SeamStateLike> | null | undefined,
): ReadonlySet<string> {
  return new Set(
    (rows ?? [])
      .filter((row) => row.stale || !confirmedSeam(row.status))
      .map((row) => (row.seamKey ?? '').trim())
      .filter(Boolean),
  );
}

/** The strip as the length functions must read it: a from_seam strip on a gone seam has no length. */
export function withSeamGone<T extends StripLike>(strip: T, gone: ReadonlySet<string>): T {
  const key = (strip.seamKey ?? '').trim();
  return strip.lengthMode === 'from_seam' && key && gone.has(key)
    ? { ...strip, seamGone: true }
    : strip;
}
