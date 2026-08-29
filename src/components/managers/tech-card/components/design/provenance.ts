import type {
  common_DesignBenchSlot,
  common_DesignPicture,
  common_DesignSheetPlate,
} from 'api/proto-http/admin';

/**
 * THE provenance selector of the DESIGN band. There is exactly one, and the three places that show
 * provenance — the tile in a feed row, the footer of a bench slot, the snapshot of a minted version
 * and its print — read it from here.
 *
 * WHAT PROVENANCE IS. Where the plate came from, which run produced it, and whether it has since
 * gone stale. It is computed from the plate's ancestry, never chosen by a human: the moment a
 * person can type it, the mixed-composition guard goes blind and the money register lies (a hand
 * file has no price, so it must not sit in the denominator).
 *
 * THE THIRD VALUE IS LOAD-BEARING. Provenance reads three ways — known, known-and-mixed, UNKNOWN —
 * and `unknown` never claims coherence. An unrecognised `source_class` from a server ahead of this
 * bundle folds into `unknown` rather than into a default, because a wrong default here is a green
 * light on a page that has no idea what it is looking at.
 *
 * `mixed_input` NEVER WASHES OFF. A picture produced by fixing a mixed set of slots carries the
 * flag forever: dropped into a slot it silences the red «is behind» warning, but it keeps its own
 * grey note. False green is the one outcome this module exists to prevent.
 *
 * Pure functions only: no state, no queries, no React.
 */

/**
 * The source-class vocabulary as the contract states it — and the contract states it is OPEN, which
 * is why `source_class` is a string on the wire and not an enum. It has already grown once
 * (`drawn`, for a vector base drawn from nothing).
 *
 * So this list is what THIS bundle understands, not what may ever arrive. `readProvenance` folds
 * anything outside it into `unknown` instead of throwing or defaulting, which is what lets the
 * dictionary keep growing server-first without this bundle claiming something false about a value
 * it has never seen.
 */
export const SOURCE_CLASSES = ['ai', 'uploaded', 'ai_edits', 'imported_svg', 'drawn'] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];
export type ProvenanceClass = SourceClass | 'unknown';

/**
 * The provenance columns, shared by the live picture and the frozen plate of a version — which is
 * why ONE reader serves both. The two disagree on exactly one point, and deliberately:
 * `content_hash` lives on the PLATE (the frozen fact a version was signed over) and not on the
 * picture (which IS the live file, so a second copy could only disagree with the first).
 */
export type PlateProvenanceSource = Partial<
  Pick<
    common_DesignPicture & common_DesignSheetPlate,
    'sourceClass' | 'runId' | 'batchId' | 'derivedFrom' | 'layerRev' | 'mixedInput' | 'contentHash'
  >
>;

export type Provenance = {
  sourceClass: ProvenanceClass;
  /** The run that produced it, or null. Null is not «run 0». */
  runId: number | null;
  /** The batch it arrived in, or null. Exactly one of runId / batchId is set. */
  batchId: number | null;
  /** The parent picture (crop source / flatten base), or null. */
  derivedFrom: number | null;
  layerRev: number;
  /** «AI + edits» — a stored class of its own, not a guess from layerRev. */
  handEdited: boolean;
  mixedInput: boolean;
  /** '' means «this plate froze no hash / the media predates 0336», not «hashes differ». */
  contentHash: string;
};

function isSourceClass(value: string): value is SourceClass {
  return (SOURCE_CLASSES as readonly string[]).includes(value);
}

/** Null, 0 and negative all mean «no such id». 0 is a real value on the wire and it means absent. */
function idOrNull(value?: number | null): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}

export function readProvenance(source: PlateProvenanceSource): Provenance {
  const raw = (source.sourceClass ?? '').trim().toLowerCase();
  const sourceClass: ProvenanceClass = isSourceClass(raw) ? raw : 'unknown';
  return {
    sourceClass,
    runId: idOrNull(source.runId),
    batchId: idOrNull(source.batchId),
    derivedFrom: idOrNull(source.derivedFrom),
    layerRev: typeof source.layerRev === 'number' && source.layerRev > 0 ? source.layerRev : 0,
    handEdited: sourceClass === 'ai_edits',
    mixedInput: source.mixedInput === true,
    contentHash: (source.contentHash ?? '').trim(),
  };
}

/**
 * The provenance of whatever stands in a bench slot, or null for an empty slot.
 *
 * Read off the slot itself because the slot carries the RESOLVED picture, not a bare id: the plate
 * a slot holds is routinely older than the first page of the feed, so an id alone would leave the
 * footer with no source_class to print and the mixed-provenance check with nothing to compare.
 */
export function slotProvenance(slot: Pick<common_DesignBenchSlot, 'picture'>): Provenance | null {
  return slot.picture ? readProvenance(slot.picture) : null;
}

export function isProvenanceKnown(p: Provenance): boolean {
  return p.sourceClass !== 'unknown';
}

/**
 * The first token of a tile's footer. Total over the dictionary — every plate says something, and a
 * plate we cannot read says so in words rather than falling back to a class it might not be.
 */
export function provenanceLabel(p: Provenance): string {
  const run = p.runId === null ? '' : ` · run ${p.runId}`;
  switch (p.sourceClass) {
    case 'ai':
      return `AI${run}`;
    case 'ai_edits':
      return `AI + edits${run}`;
    case 'uploaded':
      return 'uploaded';
    case 'imported_svg':
      return 'imported SVG';
    case 'drawn':
      return 'drawn';
    default:
      return 'provenance unknown';
  }
}

/**
 * The grey note that rides along with the label wherever the plate is shown. Separate from the
 * label on purpose: the label answers «where is it from», this answers «and what did it silence».
 * Folding them into one string is how a caller ends up dropping half of it.
 */
export function mixedInputNote(p: Provenance): string | null {
  return p.mixedInput ? 'from mixed input' : null;
}

/** The live facts a stale check is made against — the CURRENT state of the same plate's sources. */
export type LivePlateFacts = {
  /** The edit layer's current revision. */
  layerRev?: number | null;
  /** The media's current content hash. */
  contentHash?: string | null;
};

export type StaleReason = 'layer_advanced' | 'bytes_replaced';

/**
 * Has this plate gone stale?
 *
 * Two causes, and both are read against facts the plate itself carries:
 *  - `layer_advanced` — someone saved a newer revision of the edit layer this plate was flattened
 *    from, so the picture on screen is an older rasterisation than the drawing behind it;
 *  - `bytes_replaced` — the media under it now hashes to something else.
 *
 * Returns null when the answer is «no» AND when the answer is UNKNOWABLE: a missing live revision
 * or an empty hash on either side is not evidence of staleness. `content_hash` is empty for every
 * media older than 0336, and treating «I have no hash» as «the bytes changed» would light a stale
 * badge on most of the existing library at once.
 *
 * Layer advance wins when both fire: it is the CAUSE of the byte change, and naming the effect
 * would send the operator to the wrong door.
 */
export function plateStaleReason(p: Provenance, live: LivePlateFacts): StaleReason | null {
  if (typeof live.layerRev === 'number' && live.layerRev > p.layerRev) return 'layer_advanced';
  const liveHash = (live.contentHash ?? '').trim();
  if (p.contentHash && liveHash && liveHash !== p.contentHash) return 'bytes_replaced';
  return null;
}

export function isPlateStale(p: Provenance, live: LivePlateFacts): boolean {
  return plateStaleReason(p, live) !== null;
}
