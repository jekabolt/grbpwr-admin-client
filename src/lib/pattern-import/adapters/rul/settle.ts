// RUL · after the graded drawing is read: the reader must see exactly the table's sizes (one block
// per piece × size, every size present) — the claim the run rests on, proved on what was read.
import type { DxfSegmentation } from '../dxf/dxf-types';
import { bareSize } from '../dxf/segment';

/** null = the reader saw every size of the table and nothing else; else what differs. */
export function rulSizesMismatch(sizes: readonly string[], seg: DxfSegmentation): string | null {
  if (!seg.presegmented) return 'the graded drawing did not read as piece blocks';
  const want = new Set(sizes.map(bareSize));
  const got = new Set(seg.sizes.map((s) => bareSize(s.token)));
  const lost = [...want].filter((s) => !got.has(s));
  const extra = [...got].filter((s) => !want.has(s));
  if (!lost.length && !extra.length) return null;
  return `the graded drawing read as sizes ${[...got].join(' ') || '—'}, the table lists ${[...want].join(' ')}${lost.length ? ` (${lost.join(' ')} not read)` : ''}`;
}
