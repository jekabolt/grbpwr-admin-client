/**
 * Shared shape/mark types and helpers for the 30 base drawings and the batch files b1..b9.
 * Runtime-free of garment-pictograms / garment-parts on purpose: a batch file imports only this
 * module and the manifest types, so the drawing batches never form an import cycle.
 */

/** One family's drawing in the 64×96 frame: `body` shared by front and back, `side` = full left profile. */
export type GarmentShape = { body: string; front: string[]; back: string[]; side: string[] };

/** One part highlight: the view that shows it, its paths (absolute, 64×96), `zone` = fill only. */
export type PartMark = {
  view: 'front' | 'back' | 'side_l';
  d: string[];
  zone?: boolean;
};

export const mark = (view: PartMark['view'], ...d: string[]): PartMark => ({ view, d });
export const zone = (view: PartMark['view'], ...d: string[]): PartMark => ({ view, d, zone: true });
