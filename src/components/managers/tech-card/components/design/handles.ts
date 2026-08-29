import type { common_DesignBatch, common_DesignPicture } from 'api/proto-http/admin';
import { formatBytes } from 'utils/pattern';

import { wireInt } from '../wire-int';

/**
 * THE address vocabulary of the DESIGN band. There is exactly one, and every organ that has to NAME
 * a picture out loud — a tile footer, a slot badge, a fix door, a mixed-composition warning, a
 * print caption — spells it from here.
 *
 * WHY AN ADDRESS AT ALL. A camera filename is not an address: it means nothing to the second person
 * in the conversation and it changes when the file is re-saved. A generated picture gets a short,
 * stable handle instead — `run 5 · b` — and that handle is what the fix door, the warning and the
 * print caption all quote, so «BACK is behind» and «generate BACK from run 5 ▸» name the same thing
 * with the same words.
 *
 * EXACTLY ONE OF run_id / batch_id IS SET — never both, never neither. That is a promise of the
 * contract, so there is no third branch below and no «unaddressable picture» state to design for.
 *
 * GENERATED AND BROUGHT-BY-HAND ARE ADDRESSED DIFFERENTLY, AND THAT IS THE DESIGN. The one shared
 * counter across both was tried and withdrawn: uploads no longer sit in the same gutter as runs, so
 * there is nothing left to compare at a glance. A run's outputs stay unique inside their run; a
 * hand-brought file is addressed by its BATCH — the batch carries its author, its clock stamp, its
 * weight and its coherence, and it is the unit one gesture creates.
 *
 * IN THIS WAVE ONLY THE BATCH HALF IS LIVE. The generative machine is cut: no GENERATE button, no
 * run-history section, zero runs on beta. `runHandle` and the run branch of `pictureHandle` are
 * written and tested but unexercised by the product tonight.
 *
 * Pure functions only: no state, no queries, no React.
 */

export type PictureHandleSource = Pick<common_DesignPicture, 'runId' | 'batchId' | 'ordinal'>;
export type BatchCaptionSource = Pick<
  common_DesignBatch,
  'id' | 'author' | 'filesCount' | 'sizeBytes' | 'createdAt'
>;

const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

/**
 * Zero-based index → `a`, `b`, … `z`, `aa`, `ab`, … Bijective base-26, so there is no `a0` gap and
 * no collision: a run's outputs are few, but a split composite can put a dozen siblings under one
 * batch and the letters have to keep working past `z`.
 *
 * ASSUMES `DesignPicture.ordinal` IS ZERO-BASED — ordinal 0 is `a`. If the server mints it 1-based,
 * this is the single line that moves, which is why the arithmetic lives here and not at the call
 * sites.
 */
export function ordinalLetter(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let out = '';
  for (;;) {
    out = String.fromCharCode(97 + (n % 26)) + out;
    if (n < 26) return out;
    n = Math.floor(n / 26) - 1;
  }
}

/** `run 5`. Empty string when there is no run — never `run 0`, which addresses nothing. */
export function runHandle(runId?: number | null): string {
  return typeof runId === 'number' && runId > 0 ? `run ${runId}` : '';
}

/**
 * `upload 3` — the batch's position on THIS card's shelf, not its database id. A global id is not
 * an address a human can say out loud; the position is. Pass the ordinal from `shelfBatchOrdinals`.
 * Without one it still answers `upload`, so a caption is never blank while a page is loading.
 */
export function batchHandle(shelfOrdinal?: number | null): string {
  return typeof shelfOrdinal === 'number' && shelfOrdinal > 0 ? `upload ${shelfOrdinal}` : 'upload';
}

/**
 * The spoken address of one picture: `run 5 · b`, or `upload 3 · b` for a hand-brought file whose
 * batch position the caller knows.
 *
 * Two branches, not three: no run means a batch, because the contract permits nothing else.
 */
export function pictureHandle(
  picture: PictureHandleSource,
  options?: { shelfOrdinal?: number | null },
): string {
  const letter = ordinalLetter(picture.ordinal ?? 0);
  const run = runHandle(picture.runId);
  return run ? `${run} · ${letter}` : `${batchHandle(options?.shelfOrdinal)} · ${letter}`;
}

/**
 * Batch id → its 1-based position on this card's shelf, in the order the batches were created.
 *
 * Computed here rather than stored, because the number is a property of ONE card's shelf and the
 * batch row is global: storing it would mean a second identity for the same object, drifting the
 * first time two batches are created concurrently.
 *
 * Ties on the clock stamp fall back to the id, so the order is total and stable across renders —
 * two batches created in the same microsecond otherwise swap places between two paints.
 */
export function shelfBatchOrdinals(batches: readonly BatchCaptionSource[]): Map<number, number> {
  const sorted = [...batches].sort((a, b) => {
    const at = a.createdAt ?? '';
    const bt = b.createdAt ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return (a.id ?? 0) - (b.id ?? 0);
  });
  const out = new Map<number, number>();
  sorted.forEach((b, i) => {
    if (typeof b.id === 'number' && b.id > 0) out.set(b.id, i + 1);
  });
  return out;
}

/**
 * `14:41` from a wire Timestamp. Empty string for every spelling of «unset» — absent key, the
 * explicit `null` an EmitUnpopulated gateway writes, `''`, and the zero instant.
 *
 * 24-hour and explicitly zero-padded through `hourCycle: 'h23'`: the default for an English locale
 * is `14:41` on some runtimes and `2:41 PM` on others, and a shelf stamp that changes shape by
 * browser is not a stamp. `timeZone` is injectable so a test can assert on a fixed value.
 */
export function clockStamp(stamp?: string | null, options?: { timeZone?: string }): string {
  if (!stamp || stamp === ZERO_TIMESTAMP) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: options?.timeZone,
  }).format(date);
}

/**
 * The stamp of one shelf batch: `uploaded · T. · 14:41 · 12 MB · 4 files`.
 *
 * This caption IS the provenance carrier for everything brought by hand — author, moment, weight,
 * count — which is why every segment is stated and none is invented. A segment the response does
 * not carry is DROPPED rather than filled with a placeholder: `uploaded · — · 14:41` reads as a
 * missing author, `uploaded · 14:41` reads as a caption that does not claim one.
 *
 * `size_bytes` goes through `wireInt`: it is int64, so it arrives as a JSON STRING however the
 * generated type declares it. `formatBytes` is the repository's existing one (`utils/pattern`), not
 * a second spelling of the same arithmetic — which is why weights round to `12 MB` above 10 units
 * and keep a decimal below.
 */
export function batchCaption(batch: BatchCaptionSource, options?: { timeZone?: string }): string {
  const files = typeof batch.filesCount === 'number' && batch.filesCount > 0 ? batch.filesCount : 0;
  const bytes = wireInt(batch.sizeBytes);
  const segments = [
    'uploaded',
    (batch.author ?? '').trim(),
    clockStamp(batch.createdAt, options),
    bytes > 0 ? formatBytes(bytes) : '',
    files > 0 ? `${files} file${files === 1 ? '' : 's'}` : '',
  ];
  return segments.filter(Boolean).join(' · ');
}
