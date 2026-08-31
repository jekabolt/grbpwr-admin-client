import type { common_DesignBenchSlot, common_DesignPicture } from 'api/proto-http/admin';

/**
 * THE provenance selector of the DESIGN band. There is exactly one, and the places that show
 * provenance — the tile in a feed row, the footer of a bench slot, the plate on ARTIFACTS — read it
 * from here.
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
 * The provenance columns of a live picture.
 *
 * THIS TYPE USED TO SPAN TWO SHAPES — the picture and the frozen plate of a minted version — and
 * carried `content_hash` for the plate alone, because a version was SIGNED over those bytes. The
 * mint and its versions were removed on the owner's decision, so the second shape no longer exists
 * and the hash has no reader: a live picture IS the file, and a second copy of its hash could only
 * ever disagree with the first. What is left is one shape, which is why the union is gone rather
 * than merely narrowed.
 */
export type PlateProvenanceSource = Partial<
  Pick<
    common_DesignPicture,
    'sourceClass' | 'runId' | 'batchId' | 'derivedFrom' | 'layerRev' | 'mixedInput'
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

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * ЗДЕСЬ СТОЯЛА ПРОВЕРКА УСТАРЕВАНИЯ ПЛИТЫ (`plateStaleReason` / `isPlateStale`), и её больше нет.
 *
 * Она отвечала на вопрос, который задаёт только ПОДПИСАННАЯ ВЕРСИЯ: «плита, замороженная в vN,
 * разошлась с тем, что под ней сейчас?» — слой правки уехал вперёд или байты подменили. Оба
 * сравнения велись против фактов, которые несла сама плита версии (`layer_rev`, `content_hash` на
 * момент минта). Минт и версии сняты по решению владельца, замороженных плит не существует, и
 * сравнивать живую картинку стало НЕ С ЧЕМ: у неё нет второго «как было».
 *
 * Оставить функции «на всякий случай» значило бы держать сторожа у мёртвого кода — он не может
 * загореться никогда, а читается как работающая защита.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */
