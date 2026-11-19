import type { EmbeddedSeamSupportV1 } from '../../compiler/seam-constraints';

const SUPPORTS_PER_ROW = 6;
const INDEX_BYTES = SUPPORTS_PER_ROW * Uint32Array.BYTES_PER_ELEMENT;
const F32_RELATIVE_TOLERANCE = 2 ** -22;
const UINT32_MAX = 0xffff_ffff;

export const XPBD_SEAM_SUPPORT_PACKET_V1 = Object.freeze({
  schemaVersion: 'xpbd-seam-support-packet/1',
  supportsPerRow: SUPPORTS_PER_ROW,
  particleIndicesOffsetBytes: 0,
  signedWeightsOffsetBytes: INDEX_BYTES,
  rowStrideBytes: INDEX_BYTES + SUPPORTS_PER_ROW * Float32Array.BYTES_PER_ELEMENT,
} as const);

/** One storage row per color-grouped seam constraint. A zero weight denotes an unused slot. */
export function packXpbdSeamSupportRowsV1(
  rows: readonly (readonly EmbeddedSeamSupportV1[])[],
  particleCount: number,
  byteBudget: number,
): ArrayBuffer {
  const { rowStrideBytes } = XPBD_SEAM_SUPPORT_PACKET_V1;
  const size = rows.length * rowStrideBytes;
  if (
    !Number.isSafeInteger(particleCount) ||
    particleCount < 1 ||
    particleCount > UINT32_MAX ||
    !Number.isSafeInteger(byteBudget) ||
    size > byteBudget ||
    size > UINT32_MAX ||
    rows.length === 0
  ) {
    throw new Error('Seam support packet exceeds its integer or byte bounds.');
  }

  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  for (const [rowIndex, row] of rows.entries()) {
    if (row.length < 2 || row.length > SUPPORTS_PER_ROW) {
      throw new Error('A seam support row requires two to six active particles.');
    }
    let positive = 0;
    let negative = 0;
    let previous = -1;
    const rowOffset = rowIndex * rowStrideBytes;
    for (const [slot, { particleIndex, signedWeight }] of row.entries()) {
      if (
        !Number.isSafeInteger(particleIndex) ||
        particleIndex <= previous ||
        particleIndex >= particleCount ||
        !Number.isFinite(signedWeight) ||
        signedWeight === 0 ||
        Math.abs(signedWeight) > 1 ||
        Math.fround(signedWeight) !== signedWeight
      ) {
        throw new Error('Seam supports require increasing active indices and finite f32 weights.');
      }
      previous = particleIndex;
      positive += Math.max(0, signedWeight);
      negative += Math.max(0, -signedWeight);
      view.setUint32(rowOffset + slot * 4, particleIndex, true);
      view.setFloat32(rowOffset + INDEX_BYTES + slot * 4, signedWeight, true);
    }
    const scale = Math.max(positive, negative);
    if (
      scale > 1 + F32_RELATIVE_TOLERANCE ||
      Math.abs(positive - negative) > scale * F32_RELATIVE_TOLERANCE
    ) {
      throw new Error('Seam support weights do not preserve rigid translation.');
    }
  }
  return buffer;
}
