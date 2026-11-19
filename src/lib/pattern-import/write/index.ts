// write/ — PieceSpec[] of one fabric-purpose scope → one CLO-style DXF + its ConversionManifest.
//
//   writeDxf(job)            the contract's WriteDxfFn: text WITH the manifest embedded (gate: null)
//   writeDxfDetailed(job)    + the plan (written-frame specs, per-block transforms, offsets) the
//                              gate and the write stage need; `embed: null` returns the bare DXF
//   writeScopes(input)       one job per scope (the `write` stage's fan-out)
//   blockNameOf(spec, size)  `<IDENTITY>_<SIZE>` / `<IDENTITY>_UNI`
//
// Dialects: 'r2000' (default, CLO-DXF AC1015 — the card path) and 'r12' (CLO-AAMA, opt-in).

import type {
  Affine,
  DraftScopeTarget,
  EmbedManifestFn,
  ManifestSize,
  ManifestSource,
  PieceSpec,
  RetainedLineSplit,
  WriteDxfFn,
  WriteJob,
  WriteResult,
} from '../types';
import { isAsciiDxf } from './format';
import { buildManifest } from './manifest-build';
import { embedManifest as embedManifestLocal } from '../manifest';
import { type Plan, pieceInScope, planBlocks } from './plan';
import type { AuthoredLineSplitInput } from './protected-line-split';
import { writeR12 } from './r12';
import { writeR2000 } from './r2000';

export { blockNameOf, LAYOUT_GAP_MM, pieceInScope, pieceSizeCutBounds, UNI_TOKEN } from './plan';
export type { Plan, PlannedBlock } from './plan';
export {
  RetainedRankedDraftPointErrorV1,
  writeDxfWithRetainedRankedDraftPointV1,
} from './retained-ranked-draft-point-v1';
export type {
  RetainedRankedDraftPointInputV1,
  RetainedRankedDraftPointResultV1,
} from './retained-ranked-draft-point-v1';

export type WriteOptions = {
  /** Manifest embedder; null = bare DXF. Default: the shared `manifest/` `embedManifest`. */
  embed?: EmbedManifestFn | null;
  /** Clock for `createdAt` (tests pin it). */
  now?: () => Date;
  /** Retain the original grain midpoint when verifying a historical bare R12 fusing row. */
  legacyFusingGrainAnchor?: true;
};

export type WriteDetail = WriteResult & {
  plan: Plan;
  /** Bare DXF without the manifest comment block. */
  bareText: string;
  /** block name → source frame → written frame (for walls: `wallsByBlock`). */
  transforms: Record<string, Affine>;
};

export function writeDxfDetailed(job: WriteJob, opts: WriteOptions = {}): WriteDetail {
  if (
    opts.legacyFusingGrainAnchor &&
    (job.generator !== 'grbpwr/fusing-dxf' ||
      job.dialect !== 'r12' ||
      !job.scope.isInterlining ||
      opts.embed !== null)
  )
    throw new Error('Historical fusing grain is supported only for bare R12 interlining replay.');
  return emitPlannedDxf(
    job,
    planBlocks(job.pieces, job.scope, [], {
      keepOriginalGrainAnchor: opts.legacyFusingGrainAnchor,
      preserveNativeLayout: job.preserveNativeLayout,
    }),
    opts,
  );
}

/** First compile only. The caller owns the current card and selection. No Apply or worker authority is implied. */
export async function writeDxfWithAuthoredLineSplit(
  sourceJob: WriteJob,
  input: AuthoredLineSplitInput,
  opts: Pick<WriteOptions, 'now'> = {},
): Promise<WriteDetail> {
  const job = structuredClone(sourceJob);
  const args = structuredClone(input);
  const plan = planBlocks(job.pieces, job.scope, [], {
    preserveNativeLayout: job.preserveNativeLayout,
  });
  const { preserveAuthoredLineSplit } = await import('./protected-line-split');
  await preserveAuthoredLineSplit(job, plan, args);
  return emitPlannedDxf(job, plan, { now: opts.now });
}

/** Replays exactly one existing native vertex after independent worker verification of the reviewed file. */
export async function writeDxfWithRetainedLineSplit(
  sourceJob: WriteJob,
  occurrence: RetainedLineSplit,
  opts: WriteOptions = {},
): Promise<WriteDetail> {
  const job = structuredClone(sourceJob),
    retained = structuredClone(occurrence);
  const plan = planBlocks(job.pieces, job.scope, [], {
    preserveNativeLayout: job.preserveNativeLayout,
  });
  const { retainReviewedLineSplit } = await import('./retained-line-split');
  await retainReviewedLineSplit(job, plan, retained);
  return emitPlannedDxf(job, plan, opts);
}

function emitPlannedDxf(job: WriteJob, plan: Plan, opts: WriteOptions): WriteDetail {
  const createdAt = (opts.now ?? (() => new Date()))().toISOString();
  const manifest = buildManifest(job, plan.specs, plan.blocks, createdAt);
  const sample = job.sizes.length
    ? [...job.sizes].sort((a, b) => a.rank - b.rank)[Math.floor((job.sizes.length - 1) / 2)].token
    : '';
  const bareText =
    job.dialect === 'r12'
      ? writeR12(plan.blocks, {
          styleName: job.scope.label || job.scope.scopeKey,
          createdAt,
          sampleSize: sample,
        })
      : writeR2000(plan.blocks);
  if (!isAsciiDxf(bareText)) throw new Error('writer produced non-ASCII bytes'); // §1.2 invariant
  const embed = opts.embed === undefined ? embedManifestLocal : opts.embed;
  const dxfText = embed ? embed(bareText, manifest) : bareText;
  const transforms: Record<string, Affine> = {};
  for (const b of plan.blocks) transforms[b.name] = b.transform;
  return { dxfText, manifest, warnings: plan.warnings, plan, bareText, transforms };
}

export const writeDxf: WriteDxfFn = (job) => {
  const { dxfText, manifest, warnings } = writeDxfDetailed(job);
  return { dxfText, manifest, warnings };
};

/** One DXF per fabric-purpose scope (never two per scope: the card would read them as revisions). */
export function writeScopes(
  input: {
    techCardId: number;
    scopes: DraftScopeTarget[];
    pieces: PieceSpec[];
    sizes: ManifestSize[];
    source: ManifestSource;
    generator: string;
    dialect: WriteJob['dialect'];
    autopilot?: WriteJob['autopilot'];
    passport?: WriteJob['passport'];
    replay?: WriteJob['replay'];
  },
  opts: WriteOptions = {},
): { scope: DraftScopeTarget; job: WriteJob; detail: WriteDetail }[] {
  const seen = new Set<string>();
  const out: { scope: DraftScopeTarget; job: WriteJob; detail: WriteDetail }[] = [];
  for (const scope of input.scopes) {
    if (seen.has(scope.scopeKey)) throw new Error(`scope ${scope.scopeKey} listed twice`);
    seen.add(scope.scopeKey);
    const job: WriteJob = {
      techCardId: input.techCardId,
      scope,
      pieces: input.pieces.filter((p) => pieceInScope(p, scope)),
      sizes: input.sizes,
      source: input.source,
      generator: input.generator,
      dialect: input.dialect,
      ...(input.autopilot ? { autopilot: input.autopilot } : {}),
      ...(input.passport ? { passport: input.passport } : {}),
      ...(input.replay ? { replay: input.replay } : {}),
    };
    out.push({ scope, job, detail: writeDxfDetailed(job, opts) });
  }
  return out;
}
