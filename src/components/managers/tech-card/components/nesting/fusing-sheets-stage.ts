import { GENERATED_FUSING_NAME_PREFIX, regenerateFusingSheets } from 'lib/fusing-dxf';
import { SECTION } from 'lib/pattern-import/fabrics/scope';
import { notify } from 'lib/stores/store';
import type { StagedChange } from '../useTechCardStaging';

// THE FUSIBLE SHEETS FOLLOW THE FUSE MARKUP. One staged change, shared by the PIECES modal (which
// stages it on apply) and the card's own write (which stages it whenever the body it is about to
// send moves the fuse markup or the interlining lines — whoever moved them). Staged behind the
// body: the rebuild reads the STORED card, so it must run after the pieces landed.
export const FUSING_SHEETS_KEY = 'fusingSheets';
export const FUSING_SHEETS_ORDER = 90;

// A failed or partial rebuild is a toast, never a refusal of the save: the pieces stay saved.
export function fusingSheetsChange(techCardId: number): StagedChange {
  return {
    key: FUSING_SHEETS_KEY,
    label: 'fusing DXF',
    order: FUSING_SHEETS_ORDER,
    commit: async () => {
      try {
        const r = await regenerateFusingSheets(techCardId);
        // L5: the warnings were dropped — a piece fused with no interlining chosen built no sheet,
        // and the rebuild ended with no request and no word.
        if (r.warnings.length)
          notify({
            sev: 'warn',
            subject: 'FUSING DXF',
            text: r.generated ? `${r.warnings.length} warnings` : 'nothing built',
            detail: r.warnings.join('\n'),
          });
        if (r.skippedSizes.length)
          notify({
            sev: 'warn',
            subject: 'FUSING DXF',
            text: `${r.skippedSizes.length} sizes skipped`,
            detail: r.skippedSizes.map((x) => `${x.piece} ${x.size}: ${x.reason}`).join('\n'),
          });
      } catch (error) {
        notify({
          sev: 'error',
          subject: 'FUSING DXF',
          text: 'not rebuilt',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

// What a fusible sheet is built from, as the form holds it: every piece's fuse markup (and the name
// / key the DXF block is matched by), the interlining lines, the block aliases and the main DXFs.
// Two equal signatures build the same sheets; a moved one needs a rebuild.
const FUSE_FIELDS = [
  'fused',
  'fusingMode',
  'fusingWidthMm',
  'fusingBomLineKey',
  'fusingEdges',
  'fusingZone',
  'fusingInsetMm',
  'fusingInsetNet',
  'fusingGrain',
  'fusingDarts',
] as const;

type Row = { [k: string]: unknown };
type FuseSource = {
  pieces?: ReadonlyArray<Row>;
  bomItems?: ReadonlyArray<Row>;
  pieceDxfAliases?: unknown;
  patterns?: ReadonlyArray<{ url?: string; name?: string }>;
};

export function hasFusedPiece(v: FuseSource | null | undefined): boolean {
  return (v?.pieces ?? []).some((p) => !!p.fused);
}

export function fusingSignature(v: FuseSource | null | undefined): string {
  if (!v) return '';
  const pieces = (v.pieces ?? []).map((p) => [
    String(p.lineKey ?? '').trim(),
    String(p.name ?? '').trim(),
    ...FUSE_FIELDS.map((f) => p[f] ?? null),
    // The colourway's interlining line rides on the piece's materials.
    p.materials ?? null,
  ]);
  const interlining = (v.bomItems ?? [])
    .filter(
      (b) => b.section === SECTION.interlining || String(b.purpose ?? '').includes('INTERLINING'),
    )
    .map((b) => [String(b.lineKey ?? '').trim(), b.supplierRef ?? null, b.name ?? null]);
  const sheets = (v.patterns ?? [])
    .filter((p) => !(p.name ?? '').startsWith(GENERATED_FUSING_NAME_PREFIX))
    .map((p) => p.url ?? '');
  try {
    return JSON.stringify([pieces, interlining, v.pieceDxfAliases ?? null, sheets]);
  } catch {
    return '';
  }
}
