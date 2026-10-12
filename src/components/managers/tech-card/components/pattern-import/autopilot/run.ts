// A10 · AUTOPILOT — the two moves of an autopilot run outside the policy, shared by the wizard and
// the metric:
//   · `autopilotApply`: on check with a green gate, the EXPLICIT gated path to the card — check →
//     apply with the default "replace the previous import" (never a resolver event: the drive
//     always stops on check, and apply is this function's alone);
//   · `hookDriveCtx`: the drive tick's context (auto-drive.ts) over the wizard API, for a caller
//     that drives the hook from outside (the e2e probe over the React shim) — the wizard's own
//     effect builds the same context over its refs.
import type {
  CardDraft,
  ImportSession,
  SeedId,
  WizardEvent,
  WizardStep,
} from 'lib/pattern-import/types';
import { aliasKey, aliasNames } from 'lib/pattern-import/fabrics/draft';
import { liningIdentity } from 'lib/pattern-import/fabrics/scope';
import type { DriveCtx } from '../auto-drive';
import type { AutoResolver } from '../auto-advance';
import type { CardContext } from '../client';
import type { ImportSessionApi, Inputs } from '../use-import-session';
import { autopilotResolver, type AutopilotStop } from './policy';
import { isReplayed } from './replay-record';
import type { Assumption } from './types';

/** The gate's blocking checks on the check step ("main G3-coverage"), empty = green. */
export function gateBlocks(api: Pick<ImportSessionApi, 'session'>): string[] {
  return Object.entries(api.session.gate).flatMap(([scope, g]) =>
    g.checks
      .filter((c) => !c.ok && c.severity === 'block')
      .map((c) => `${scope.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()} ${c.id}`),
  );
}

export type ApplyOutcome =
  | { ok: true; downloadOnly: boolean }
  | { ok: false; reason: string; step: 'check' | 'apply' };

/**
 * What the autopilot's apply would do to the card without proof:
 *   · 'reuse' — a code the autopilot GENERATED in this run (P01 … in reading order, `name-code`, not
 *     replayed) would UPDATE a card piece (by name or block link). A generated code says nothing
 *     about which piece it is: on a re-import where an unnamed piece moved or was added the codes
 *     shift, and P01 would silently rewrite another piece.
 *   · 'beside-vanished' — ANY new card piece (a generated code or a name from the file) while a card
 *     piece a previous import of THESE files drew (same sha256 or file name, any scope) is no longer
 *     drawn: «FP» added beside «P01» may be the same piece under another name — cut twice.
 * Only lineage proves a reuse — AP-replay matched the piece by its outline to the import that wrote
 * that card piece; the name is then the replay's (isReplayed) and never listed here; an honest
 * unchanged re-import draws every piece it drew before, so nothing is gone and nothing is new.
 */
export type GeneratedRisk = {
  kind: 'reuse' | 'beside-vanished';
  /** The piece of this import (its identity / card name). */
  identity: string;
  /** The card piece: the one reused, or the one the previous import drew and this one does not. */
  existing: string;
  seed?: SeedId;
};

export function generatedReuse(
  draft: Pick<CardDraft, 'scopes' | 'pieces' | 'aliases'> | null | undefined,
  sem: Pick<NonNullable<ImportSession['semantics']>, 'pieces'> | null | undefined,
  autopilot: readonly Assumption[],
  /** The card as read (its previous imports' sheets, links and pieces). */
  card?: Pick<CardContext, 'existingPatterns' | 'existingAliases' | 'existingPieces'> | null,
): GeneratedRisk[] {
  if (!draft || !sem) return [];
  const out = new Map<string, GeneratedRisk>();

  // ── reuse: a generated code bound to an existing card piece ──
  // seed → the code the autopilot generated for it (the latest answer about the seed's name)
  const gen = new Map<SeedId, string>();
  for (const a of autopilot) {
    if (a.seed == null || (a.kind !== 'name-code' && a.kind !== 'name-typed')) continue;
    if (a.kind === 'name-code' && !isReplayed(a)) {
      const v = a.value;
      const code =
        v && typeof v === 'object' && !Array.isArray(v) && typeof v.code === 'string'
          ? v.code
          : a.answer;
      gen.set(a.seed, code.split('_')[0].toUpperCase());
    } else gen.delete(a.seed);
  }
  // the identities written under a generated code (the name still the generated one)
  const ids = new Map<string, SeedId>();
  for (const p of sem.pieces) {
    const c = gen.get(p.seed);
    if (c && p.code.toUpperCase() === c) {
      ids.set(p.identity.toUpperCase(), p.seed);
      ids.set(liningIdentity(p.identity).toUpperCase(), p.seed);
    }
  }
  // their blocks as the draft binds them (scope + block, the card's alias key)
  const blocks = new Map<string, { identity: string; seed: SeedId }>();
  for (const sc of draft.scopes) {
    const names = aliasNames(sc.manifest);
    for (const mp of sc.manifest.pieces) {
      const sd = ids.get(mp.identity.toUpperCase());
      if (sd == null) continue;
      blocks.set(aliasKey(sc.target.scopeKey, names.get(mp.identity) ?? mp.identity), {
        identity: mp.identity,
        seed: sd,
      });
    }
  }
  const byKey = new Map(draft.pieces.map((p) => [p.lineKey, p] as const));
  for (const a of draft.aliases) {
    const hit = blocks.get(aliasKey(a.scopeKey, a.blockName));
    const piece = byKey.get(a.pieceLineKey);
    if (hit && piece?.existingLineKey)
      out.set(`reuse|${hit.identity}|${piece.existingLineKey}`, {
        kind: 'reuse',
        ...hit,
        existing: piece.name,
      });
  }

  // ── beside-vanished: a new card piece while a piece of the previous import is not drawn ──
  // (only a sheet made from one of THIS import's source files — by sha256, or by file name: a
  // file edited since, a piece moved, has another sha256 but is still the same source; another
  // import's sheet is not ours). Any scope: a piece can move to another fabric under a new name.
  const own = draft.scopes.flatMap((sc) => sc.manifest.source?.files ?? []);
  const shas = new Set(own.map((f) => f.sha256).filter(Boolean));
  const fileNames = new Set(own.map((f) => f.name.trim().toLowerCase()).filter(Boolean));
  const ours = (f: { sha256?: string; name?: string }) =>
    (!!f.sha256 && shas.has(f.sha256)) || (!!f.name && fileNames.has(f.name.trim().toLowerCase()));
  // what this import draws, per scope (the card's alias keys)
  const drawnNow = new Set(
    draft.scopes.flatMap((sc) =>
      [...aliasNames(sc.manifest).values()].map((b) => aliasKey(sc.target.scopeKey, b)),
    ),
  );
  // a card piece this draft still binds (reused through another block or its name) is not gone
  const kept = new Set(draft.pieces.flatMap((p) => (p.existingLineKey ? [p.existingLineKey] : [])));
  const nameOf = new Map((card?.existingPieces ?? []).map((p) => [p.lineKey, p.name] as const));
  const gone = new Map<string, string>();
  const note = (lineKey: string, name: string) => {
    if (!kept.has(lineKey)) gone.set(lineKey, name);
  };
  // the draft's own reading (its replace target), then every sheet of these files on the card
  for (const sc of draft.scopes)
    for (const v of sc.vanished ?? []) note(v.pieceLineKey, v.pieceName);
  for (const row of card?.existingPatterns ?? []) {
    if (!row.manifest || !(row.manifest.source?.files ?? []).some(ours)) continue;
    const drawnThen = new Set(
      [...aliasNames(row.manifest).values()].map((b) => aliasKey(row.scopeKey, b)),
    );
    for (const a of card?.existingAliases ?? []) {
      const k = aliasKey(a.scopeKey, a.blockName);
      if (a.scopeKey === row.scopeKey && drawnThen.has(k) && !drawnNow.has(k))
        note(a.pieceLineKey, nameOf.get(a.pieceLineKey) ?? a.pieceLineKey);
    }
  }
  if (gone.size) {
    const seedOf = new Map<string, SeedId>();
    for (const p of sem.pieces) {
      seedOf.set(p.identity.toUpperCase(), p.seed);
      seedOf.set(liningIdentity(p.identity).toUpperCase(), p.seed);
    }
    for (const piece of draft.pieces) {
      if (piece.existingLineKey) continue;
      const block = draft.aliases.find((a) => a.pieceLineKey === piece.lineKey)?.blockName;
      const seed = block != null ? seedOf.get(block.toUpperCase()) : undefined;
      for (const [lineKey, name] of gone)
        out.set(`new|${piece.lineKey}|${lineKey}`, {
          kind: 'beside-vanished',
          identity: piece.name,
          existing: name,
          ...(seed != null ? { seed } : {}),
        });
    }
  }
  return [...out.values()];
}

/**
 * check → apply → the card, on a green gate only (a gate block is never answered: the export would
 * be known wrong). The previous import of a scope is replaced (the apply step's default).
 */
export async function autopilotApply(
  get: () => ImportSessionApi,
  card: CardContext,
  settle: () => Promise<void> = async () => {},
): Promise<ApplyOutcome> {
  const step = (): WizardStep => get().session.step;
  if (step() !== 'check') return { ok: false, step: 'check', reason: `not on check (${step()})` };
  const stale = get().cardStale();
  if (stale) return { ok: false, step: 'check', reason: stale };
  const blocks = gateBlocks(get());
  if (blocks.length)
    return { ok: false, step: 'check', reason: `the gate blocks: ${blocks.join(', ')}` };
  if (card.downloadOnly) {
    await get().next();
    await settle();
    if (step() !== 'apply')
      return { ok: false, step: 'check', reason: get().session.error ?? 'did not reach apply' };
    return { ok: true, downloadOnly: true };
  }
  // a card piece is never updated through a generated code, nor a new one added beside a piece
  // the previous import drew and this one does not, without proof: only lineage (AP-replay)
  const reuse = generatedReuse(
    get().session.draft,
    get().session.semantics,
    get().inputs.autopilot ?? [],
    get().runCard ?? card,
  );
  if (reuse.length)
    return {
      ok: false,
      step: 'check',
      reason: `${reuse
        .slice(0, 3)
        .map((r) =>
          r.kind === 'reuse'
            ? `generated code ${r.identity} would update the card's existing piece «${r.existing}»`
            : `a new card piece «${r.identity}» would be added while «${r.existing}» of the previous import of these files is no longer drawn`,
        )
        .join(
          '; ',
        )}${reuse.length > 3 ? ` (+${reuse.length - 3} more)` : ''} — nothing proves which card piece is which: confirm on the apply step`,
    };
  // the lock first (synchronous): an apply already running or done for this draft refuses this one
  const token = get().lockApply();
  if (token == null)
    return { ok: false, step: 'check', reason: 'this draft is already being applied, or was' };
  await get().next();
  await settle();
  if (step() !== 'apply') {
    get().unlockApply(token);
    return { ok: false, step: 'check', reason: get().session.error ?? 'did not reach apply' };
  }
  await get().dispatch({ type: 'apply', token });
  await settle();
  const a = get().apply;
  if (a.phase !== 'done') return { ok: false, step: 'apply', reason: 'the apply did not finish' };
  if (!a.result.ok)
    return { ok: false, step: 'apply', reason: `the card refused: ${a.result.message}` };
  return { ok: true, downloadOnly: false };
}

/**
 * The drive tick's context over the wizard API (a caller outside React: `get()` is the latest
 * render's API, `settle()` lets the hook re-render between moves).
 */
export function hookDriveCtx(
  get: () => ImportSessionApi,
  settle: () => Promise<void>,
  resolve: AutoResolver<Inputs>,
  /** AP-replay: the previous import's unasked answers (replay.ts `replayDrive().prefill`). */
  prefill?: AutoResolver<Inputs>,
): DriveCtx<Inputs> {
  const api = get();
  return {
    session: api.session,
    inputs: api.inputs,
    blocker: api.blocker,
    offer: api.offer,
    notice: api.notice,
    busy: false,
    resolve,
    ...(prefill ? { prefill } : {}),
    current: () => ({ session: get().session, inputs: get().inputs }),
    forward: async () => {
      const from = get().session.step;
      await get().next();
      await settle();
      return get().session.step !== from;
    },
    patch: async (p) => {
      get().patchInputs(p);
      await settle();
    },
    dispatch: async (ev: WizardEvent) => {
      await get().dispatch(ev);
      await settle();
    },
    live: () => true,
    failed: () => !!get().session.error,
  };
}

/** The autopilot's resolver with the hook's extras (the first run's seeds, the DXF fast path). */
export const resolverFor = (
  card: CardContext,
  get: () => Pick<ImportSessionApi, 'baseSeeds' | 'extracted' | 'runCard'>,
  onStop?: (stop: AutopilotStop) => void,
) =>
  autopilotResolver(card, {
    onStop,
    extra: () => ({
      baseSeeds: get().baseSeeds,
      presegmented: !!get().extracted.presegmented,
      card: get().runCard,
    }),
  });
