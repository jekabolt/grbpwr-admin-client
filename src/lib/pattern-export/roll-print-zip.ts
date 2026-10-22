// Batch print download: already-compressed PDFs are stored without another compression pass.
// Naming lives here too, so the UI and the node probe exercise the same archive contract.
import { zipSync } from 'fflate';

export type RollPrintPaper =
  | { kind: 'roll'; widthCm: number }
  | { kind: 'tiles'; paper: 'A4' | 'A3' };

export type RollPrintZipFile = {
  slotLabel: string;
  bytes: Uint8Array;
};

const safeStem = (value: string): string =>
  value.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pattern';

export const rollPrintSlotSlug = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'slot';

const paperSuffix = (paper: RollPrintPaper): string =>
  paper.kind === 'roll' ? `roll${paper.widthCm}` : paper.paper.toLowerCase();

export const rollPrintSlotFileName = (
  title: string,
  slotLabel: string,
  paper: RollPrintPaper,
): string => `${safeStem(title)}_${rollPrintSlotSlug(slotLabel)}_${paperSuffix(paper)}.pdf`;

export const rollPrintZipName = (title: string, paper: RollPrintPaper): string =>
  `${safeStem(title)}_print_${paperSuffix(paper)}.zip`;

export function zipRollPrintPdfs(
  title: string,
  paper: RollPrintPaper,
  files: readonly RollPrintZipFile[],
): { name: string; bytes: Uint8Array; paths: string[] } {
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const file of files) {
    const path = rollPrintSlotFileName(title, file.slotLabel, paper);
    if (entries[path]) throw new Error(`print zip has duplicate file name ${path}`);
    entries[path] = [file.bytes, { level: 0 }];
  }
  if (Object.keys(entries).length === 0) throw new Error('there are no PDFs to archive');
  return {
    name: rollPrintZipName(title, paper),
    bytes: zipSync(entries, { level: 0 }),
    paths: Object.keys(entries),
  };
}
