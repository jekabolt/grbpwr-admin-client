// A tech-card's graded DXF -> AAMA/ASTM base-size DXF + RUL, delivered as one ZIP. The grade
// writer and its proof live with the RUL importer: `packRul` expands what it wrote through the
// real reader and refuses the package unless every size comes back within 0.1 mm.
import { strToU8, zipSync } from 'fflate';
import { readDxf, segmentDxf, bareSize } from 'lib/pattern-import/adapters/dxf';
import { packRul } from 'lib/pattern-import/adapters/rul';
import type { ExportResult } from './formats';

export type DxfRulWriteOptions = {
  /** Downloaded pair basename (without an extension). */
  stem: string;
  /** Grade order as the DXF spells it. */
  sizes: string[];
  /** Base/sample size. Default: the middle size. */
  base?: string;
  /** Grade-rule table name. Default: `stem`. */
  tableName?: string;
  now?: Date;
};

export type DxfRulExportResult = ExportResult & {
  dxfFileName: string;
  rulFileName: string;
  base: string;
  sizes: string[];
  rules: number;
  pieces: number;
  maxErrMm: number;
  nudges: number;
  insertions: number;
};

export const RUL_SINGLE_SIZE_REASON = 'one size only: there is no grading to store';

const safeStem = (value: string): string =>
  value
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim() || 'pattern';

const errorOf = (reasons: readonly string[]): Error =>
  new Error(reasons.length === 1 ? reasons[0] : reasons.map((r) => `- ${r}`).join('\n'));

/**
 * Known sizes + one graded DXF -> a proved AAMA/ASTM pair in a ZIP. This pure writer is also the
 * narrow unit-test surface; the browser helper below only discovers the size list first.
 */
export function writeDxfRulArchive(
  gradedDxf: ArrayBuffer | string,
  opts: DxfRulWriteOptions,
): DxfRulExportResult {
  const stem = safeStem(opts.stem);
  const pack = packRul(gradedDxf, {
    sizes: opts.sizes,
    base: opts.base,
    name: opts.tableName?.trim() || stem,
    now: opts.now,
    product: 'grbpwr admin',
    author: 'GRBPWR',
  });
  if (!pack.ok) throw errorOf(pack.reasons);

  const dxfFileName = `${stem}.dxf`;
  const rulFileName = `${stem}.rul`;
  const bytes = zipSync(
    {
      [dxfFileName]: strToU8(pack.baseDxf),
      [rulFileName]: strToU8(pack.rulText),
    },
    { level: 6, mtime: opts.now },
  );
  return {
    blob: new Blob([bytes], { type: 'application/zip' }),
    fileName: `${stem}.zip`,
    warnings: [],
    dxfFileName,
    rulFileName,
    base: pack.base,
    sizes: pack.sizes,
    rules: pack.rules,
    pieces: pack.pieces,
    maxErrMm: pack.maxErrMm,
    nudges: pack.nudges,
    insertions: pack.insertions,
  };
}

/** Discover the drawing's grade order and sample, then write the pair. */
export async function exportDxfRulArchive(
  gradedDxf: ArrayBuffer,
  fileName: string,
  title?: string,
): Promise<DxfRulExportResult> {
  const read = await readDxf(
    { id: 'rul-export', name: fileName, bytes: gradedDxf },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(read);
  if (!seg.presegmented) throw new Error('the DXF has no inserted piece blocks');
  if (seg.sizes.length < 2) throw new Error(RUL_SINGLE_SIZE_REASON);

  const sizes = seg.sizes.map((s) => s.raw.find((v) => v.trim()) ?? s.token);
  const sample = seg.sampleSize?.token;
  const base = sample
    ? sizes.find((s) => bareSize(s) === bareSize(sample))
    : sizes[Math.floor((sizes.length - 1) / 2)];
  const stem = safeStem(fileName);
  return writeDxfRulArchive(gradedDxf, {
    stem,
    sizes,
    base,
    tableName: title?.trim() || stem,
  });
}
