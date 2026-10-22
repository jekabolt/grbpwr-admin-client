// applyDraft — the ONE commit of an import to the card (08-CONTRACT §4.3, Codex C5, K1 item 9).
// Main thread. Everything outside comes in through `ApplyDeps` (the upload RPC, the form, the
// card's save), so a probe drives it with a fake upload service and a fake form.
//
//   1. UPLOAD every scope's DXF first, sequentially (the server has no batch and no rollback,
//      pattern-upload-button.tsx does the same). A scope whose identical file is already a row of
//      that scope is not uploaded again. ANY failure → `{ok:false}` and NOTHING is written to the
//      form; files that landed before it are listed as orphans (unreferenced objects in storage —
//      acceptable, K1; the card's orphan sweep only sees URLs the card once held).
//   2. ONE ordered batch of form writes, re-resolved against the LIVE form (the card may have moved
//      since the wizard read it): `patterns` (append rows; a scope in 'replace' mode (MF-C, M4) puts
//      its file into the previous import's row instead — same lineKey, name, size slot and binding,
//      new url/filename/size, version 0 so the server numbers the new file) → `pieces` (append
//      created) → point writes
//      `pieces.N.*` (symmetry, × per garment, fused — never a root rewrite of existing pieces) →
//      `pieceDxfAliases` (full set: other scopes' links preserved, ours keyed
//      `${scopeKey}|${normBlock(block).toLowerCase()}` as the piece-match modal keys them).
//      A write that changes nothing is not made: re-applying the same import makes zero writes.
//   3. The card's own save (autosave `flush`): only that save is a transaction (K1: BOM, pieces,
//      aliases and sheets in one UpdateTechCard). Piece areas and the size index are separate calls
//      made AFTER that save succeeded — `followup.ts` runs them (MF-C, M3); this function does
//      neither, and their failure never undoes what it wrote.
//   Links to blocks the new file no longer draws are NEVER removed here (MF-C): the draft lists them
//   (`DraftScope.vanished`) and the piece-match modal removes them on the card's complete parse.

import type { ApplyResult, ApplyUploaded, CardDraft, DraftPiece } from '../types';
import { FUSING_FULL, FUSING_UNKNOWN, IDENTICAL, aliasKey, mintLineKey } from './draft';
import {
  FOLD_CUT_SYMMETRY,
  importedCutSymmetry,
} from 'components/managers/tech-card/components/piece-codes';

/** 40 MiB — `MAX_PATTERN_BYTES` (utils/pattern.ts), the server's hard limit. */
export const MAX_PATTERN_BYTES = 40 * 1024 * 1024;
/** `MAX_PATTERN_NAME` bytes (utils/pattern.ts `clampPatternName`). */
const MAX_NAME_BYTES = 255;

export type LivePattern = {
  sizeId?: number;
  url?: string;
  filename?: string;
  name?: string;
  sizeBytes?: number;
  lineKey?: string;
  fabricPurpose?: string;
  bomLineKey?: string;
  version?: number;
  uploadedAt?: string;
  sha256?: string;
};
export type LivePiece = {
  lineKey?: string;
  name?: string;
  piecesPerGarment?: number;
  cutSymmetry?: string;
  fused?: boolean;
  fusingMode?: string;
  ungraded?: boolean;
};
export type LiveAlias = {
  bomLineKey?: string;
  fabricPurpose?: string;
  blockName?: string;
  pieceLineKey?: string;
};
export type LiveCard = { patterns: LivePattern[]; pieces: LivePiece[]; aliases: LiveAlias[] };

export type ApplyReplaced = { scopeKey: string; lineKey: string; oldUrl: string; newUrl: string };

export type FormWrite = { path: string; value: unknown };

export type ApplyProgressEvent = { scopeKey: string; state: 'uploading' | 'uploaded' | 'failed' };

export type ApplyDeps = {
  /** `adminService.UploadPattern` behind the same rules as pattern-upload-button.tsx. */
  upload: (file: {
    filename: string;
    text: string;
  }) => Promise<{ url: string; filename: string; sizeBytes: number; sha256?: string }>;
  /** The live form, read at commit time (getValues). */
  read: () => LiveCard;
  /** `setValue(path, value, { shouldDirty: true })`. */
  write: (path: string, value: unknown) => void;
  /** The size id a new pattern row is stored under (patterns-field `storageSizeId`). */
  storageSizeId: number;
  /** The card's save (autosave `flush`); its answer is returned as `save`. */
  save?: (reason: string) => Promise<string>;
  /**
   * Rows replaced in place (old url → new url), told after the form writes and BEFORE the save, so
   * the caller can arm the snapshot reason the save carries (nesting/reupload-session.ts).
   */
  onReplaced?: (replaced: ApplyReplaced[]) => void;
  /**
   * Codex r5 #3: rows an earlier try wrote into the form whose save was not confirmed ('ok') — a
   * retry finds them there (nothing to write) and must still save. Kept by the caller across tries.
   */
  unsaved?: { get: () => boolean; set: (v: boolean) => void };
  mintKey?: () => string;
  /**
   * The card scope a live sheet or link belongs to (bom-purpose `scopeKeyOfBinding` over the card's
   * scopes and the live set of that kind: a legacy purpose-only row is read for an interlining line
   * only while the line has no rows of that kind bound to it) — the same key the draft's targets carry. Without it the raw stored key is used, which
   * misses rows whose stored key is not the scope's (a line sorted into a purpose, an interlining
   * line bound with its purpose, a generated sheet bound to UNSET).
   */
  scopeOf?: ScopeOf;
};

export type ScopeOf = (
  a: { fabricPurpose?: string; bomLineKey?: string },
  kind: 'sheet' | 'link',
) => string;

/** fabricScopeKey (bom-purpose.ts): purpose first, else the legacy line. */
export const scopeKeyOf = (a: { fabricPurpose?: string; bomLineKey?: string }) => {
  const p = (a.fabricPurpose ?? '').trim();
  if (p && p !== 'TECH_CARD_BOM_PURPOSE_UNKNOWN' && p !== 'TECH_CARD_BOM_PURPOSE_UNSPECIFIED')
    return p;
  return (a.bomLineKey ?? '').trim();
};

const NO_PURPOSE = new Set([
  'TECH_CARD_BOM_PURPOSE_UNSET',
  'TECH_CARD_BOM_PURPOSE_UNKNOWN',
  'TECH_CARD_BOM_PURPOSE_UNSPECIFIED',
]);
type Binding = { fabricPurpose: string; bomLineKey: string };
/** The row is stored bound to the target's LINE (no purpose beside it). */
const boundTo = (a: { fabricPurpose?: string; bomLineKey?: string }, t: Binding) => {
  const p = (a.fabricPurpose ?? '').trim();
  return (
    (!p || NO_PURPOSE.has(p)) &&
    (a.bomLineKey ?? '').trim().toLowerCase() === t.bomLineKey.trim().toLowerCase()
  );
};

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
function clampBytes(s: string, max: number): string {
  let out = s.trim();
  while (utf8Bytes(out) > max) out = out.slice(0, -1);
  return out;
}

/** The scope's identical file is already a pattern row of that scope (same fingerprinted name). */
export function onCard(
  draft: CardDraft,
  live: LiveCard,
  scopeKey: string,
  scopeOf: ScopeOf = scopeKeyOf,
): LivePattern | null {
  const sc = draft.scopes.find((s) => s.target.scopeKey === scopeKey);
  if (!sc) return null;
  return (
    live.patterns.find(
      (p) => scopeOf(p, 'sheet') === scopeKey && (p.filename ?? '') === sc.filename,
    ) ?? null
  );
}

/**
 * The ordered form writes for a draft against the live card, given what was uploaded. Pure: the
 * probe checks "re-apply = zero writes" and "failure = no writes" on this exact function.
 */
export function planFormWrites(
  draft: CardDraft,
  live: LiveCard,
  uploaded: readonly ApplyUploaded[],
  opts: { storageSizeId: number; mintKey: () => string; scopeOf?: ScopeOf },
): {
  writes: FormWrite[];
  created: number;
  reusedPieces: number;
  replaced: { scopeKey: string; lineKey: string; oldUrl: string; newUrl: string }[];
} {
  const writes: FormWrite[] = [];
  const scopeOf = opts.scopeOf ?? scopeKeyOf;

  // L11 WHOLE-SET MIGRATION. An interlining line reads its rows of one kind as ONE set: the rows
  // bound to the line or, while there are none, the legacy purpose-only set (bom-purpose
  // bindingScopes, backend PreferredFabricArtifactsByScope). The first line-bound row this import
  // writes would silently drop every legacy row it does not replace — the other sheets, the links
  // of blocks the new file shares with them. So an interlining scope the import writes into, whose
  // live set of a kind has no row bound to its line yet, is moved WHOLE: every live sheet and link
  // that resolves to it is re-filed under the line binding (links deduplicated by scope + block).
  const lineTargets = new Map<string, Binding>();
  for (const sc of draft.scopes) {
    const t = sc.target;
    const p = (t.fabricPurpose ?? '').trim();
    if (!t.isInterlining || (p && !NO_PURPOSE.has(p)) || !(t.bomLineKey ?? '').trim()) continue;
    const touched =
      uploaded.some((u) => u.scopeKey === t.scopeKey) ||
      draft.aliases.some((a) => a.scopeKey === t.scopeKey);
    if (touched)
      lineTargets.set(t.scopeKey, { fabricPurpose: t.fabricPurpose, bomLineKey: t.bomLineKey });
  }
  /** Scopes of `lineTargets` whose live rows (resolved `keys`) hold none bound to the line yet. */
  const toMigrate = (
    rows: readonly { fabricPurpose?: string; bomLineKey?: string }[],
    keys: string[],
  ) =>
    new Set(
      [...lineTargets].flatMap(([key, t]) => {
        const mine = rows.filter((_, i) => keys[i] === key);
        return mine.length && !mine.some((r) => boundTo(r, t)) ? [key] : [];
      }),
    );

  // 1. patterns — one row per uploaded scope: the previous import's row replaced in place, or a new
  //    row appended. The replaced row is re-found in the LIVE form by its lineKey and must still be
  //    bound to the same scope; if the operator removed or rebound it meanwhile, the file is added.
  const nextPatterns = live.patterns.map((p) => ({ ...p }));
  const replaced: ApplyReplaced[] = [];
  const rows = uploaded.flatMap((u) => {
    const sc = draft.scopes.find((s) => s.target.scopeKey === u.scopeKey);
    if (!sc) return [];
    if (sc.replaces && sc.sheetMode !== 'add') {
      const key = sc.replaces.lineKey.toLowerCase();
      const i = nextPatterns.findIndex(
        (p) => (p.lineKey ?? '').trim().toLowerCase() === key && scopeOf(p, 'sheet') === u.scopeKey,
      );
      if (i >= 0 && !replaced.some((r) => r.lineKey.toLowerCase() === key)) {
        const old = nextPatterns[i];
        replaced.push({
          scopeKey: u.scopeKey,
          lineKey: old.lineKey ?? '',
          oldUrl: old.url ?? '',
          newUrl: u.url,
        });
        nextPatterns[i] = {
          ...old,
          // the row is re-filed under the scope's binding: a legacy purpose-only sheet of an
          // interlining line becomes line-bound here, instead of staying a purpose row (L11)
          fabricPurpose: sc.target.fabricPurpose,
          bomLineKey: sc.target.bomLineKey,
          url: u.url,
          filename: u.filename,
          sizeBytes: u.sizeBytes,
          // 0 = "assign one": the server numbers a url it has not seen on this card (schema.ts)
          version: 0,
          uploadedAt: '',
          // the new file's digest or '' — never the replaced file's (0423)
          sha256: u.sha256 ?? '',
        };
        return [];
      }
    }
    return [
      {
        sizeId: opts.storageSizeId,
        lineKey: opts.mintKey(),
        url: u.url,
        filename: u.filename,
        sizeBytes: u.sizeBytes,
        name: clampBytes(sc.name, MAX_NAME_BYTES),
        fabricPurpose: sc.target.fabricPurpose,
        bomLineKey: sc.target.bomLineKey,
        sha256: u.sha256 ?? '',
      },
    ];
  });
  const sheetKeys = live.patterns.map((p) => scopeOf(p, 'sheet'));
  const movedSheets = toMigrate(live.patterns, sheetKeys);
  let migrated = 0;
  nextPatterns.forEach((p, i) => {
    const t = movedSheets.has(sheetKeys[i]) ? lineTargets.get(sheetKeys[i]) : undefined;
    if (!t || boundTo(p, t)) return;
    nextPatterns[i] = { ...p, fabricPurpose: t.fabricPurpose, bomLineKey: t.bomLineKey };
    migrated++;
  });
  if (rows.length || replaced.length || migrated)
    writes.push({ path: 'patterns', value: [...nextPatterns, ...rows] });

  // 2. pieces — re-resolve every draft piece against the live card
  const liveIdx = new Map<string, number>();
  live.pieces.forEach((p, i) => {
    const k = (p.lineKey ?? '').trim();
    if (k) liveIdx.set(k.toLowerCase(), i);
  });
  const liveAliasOwner = new Map<string, string>();
  for (const a of live.aliases) {
    const k = (a.pieceLineKey ?? '').trim();
    if (k && liveIdx.has(k.toLowerCase()))
      liveAliasOwner.set(aliasKey(scopeOf(a, 'link'), a.blockName ?? ''), k);
  }
  const liveByName = new Map<string, number>();
  live.pieces.forEach((p, i) => {
    const n = (p.name ?? '').trim().toLowerCase();
    if (n && !liveByName.has(n)) liveByName.set(n, i);
  });
  const remap = new Map<string, string>(); // draft lineKey → the live piece it binds to
  const created: Record<string, unknown>[] = [];
  const points: FormWrite[] = [];
  const taken = new Set<string>();
  const resolveExisting = (p: DraftPiece): number | null => {
    if (p.existingLineKey) {
      const i = liveIdx.get(p.existingLineKey.toLowerCase());
      if (i != null) return i;
    }
    for (const a of draft.aliases.filter((x) => x.pieceLineKey === p.lineKey)) {
      const owner = liveAliasOwner.get(aliasKey(a.scopeKey, a.blockName));
      if (owner && !taken.has(owner.toLowerCase())) return liveIdx.get(owner.toLowerCase())!;
    }
    const byName = liveByName.get(p.name.trim().toLowerCase());
    return byName != null && !taken.has((live.pieces[byName].lineKey ?? '').toLowerCase())
      ? byName
      : null;
  };
  let reusedPieces = 0;
  for (const p of draft.pieces) {
    const i = resolveExisting(p);
    if (i == null) {
      taken.add(p.lineKey.toLowerCase());
      created.push({
        lineKey: p.lineKey,
        name: p.name,
        piecesPerGarment: p.piecesPerGarment,
        // L13: a half on fold is cut on the fold (the draft says so); every other new piece IDENTICAL
        cutSymmetry: p.symmetryForce === 'half' ? FOLD_CUT_SYMMETRY : IDENTICAL,
        ungraded: !!p.ungraded,
        grainline: p.grainline,
        fused: p.fused,
        fusingMode: p.fused ? p.fusingMode ?? FUSING_FULL : FUSING_UNKNOWN,
        fusingWidthMm: '',
        calloutNumber: 0,
        note: '',
        materials: [],
      });
      continue;
    }
    reusedPieces++;
    const cur = live.pieces[i];
    const key = (cur.lineKey ?? '').trim();
    taken.add(key.toLowerCase());
    if (key !== p.lineKey) remap.set(p.lineKey, key);
    // F14 MAJOR 2: the modal's rule on the LIVE value — an explicit MIRRORED/FOLD is rewritten only
    // on the manifest's proof (pair / unfolded fold) or when the new count makes the pair impossible.
    const symmetry = importedCutSymmetry(cur.cutSymmetry, p.piecesPerGarment, p.symmetryForce);
    if (symmetry) points.push({ path: `pieces.${i}.cutSymmetry`, value: symmetry });
    if ((cur.piecesPerGarment ?? 1) !== p.piecesPerGarment)
      points.push({ path: `pieces.${i}.piecesPerGarment`, value: p.piecesPerGarment });
    if (p.fused && !cur.fused) {
      points.push({ path: `pieces.${i}.fused`, value: true });
      const mode = (cur.fusingMode ?? '').trim();
      if (!mode || mode === FUSING_UNKNOWN)
        points.push({ path: `pieces.${i}.fusingMode`, value: p.fusingMode ?? FUSING_FULL });
    }
  }
  if (created.length) writes.push({ path: 'pieces', value: [...live.pieces, ...created] });
  writes.push(...points);

  // 4. aliases — full set, ours replace same-key rows in place, others ride through
  let next: LiveAlias[] = live.aliases.map((a) => ({ ...a }));
  const linkKeys = live.aliases.map((a) => scopeOf(a, 'link'));
  const movedLinks = toMigrate(live.aliases, linkKeys);
  const keyOf = [...linkKeys];
  const at = new Map<string, number>();
  next.forEach((a, i) => at.set(aliasKey(keyOf[i], a.blockName ?? ''), i));
  for (const a of draft.aliases) {
    const row = {
      bomLineKey: a.bomLineKey,
      fabricPurpose: a.fabricPurpose,
      blockName: a.blockName,
      pieceLineKey: remap.get(a.pieceLineKey) ?? a.pieceLineKey,
    };
    const k = aliasKey(a.scopeKey, a.blockName);
    const i = at.get(k);
    if (i == null) {
      at.set(k, next.length);
      keyOf.push(a.scopeKey);
      next.push(row);
    } else {
      next[i] = row;
      keyOf[i] = a.scopeKey;
    }
  }
  if (movedLinks.size) {
    next = next.flatMap((a, i) => {
      const t = movedLinks.has(keyOf[i]) ? lineTargets.get(keyOf[i]) : undefined;
      if (!t) return [a];
      // one row per scope + block: the one the key map holds (the draft's, when it wrote one)
      if (at.get(aliasKey(keyOf[i], a.blockName ?? '')) !== i) return [];
      return boundTo(a, t)
        ? [a]
        : [{ ...a, fabricPurpose: t.fabricPurpose, bomLineKey: t.bomLineKey }];
    });
  }
  const same =
    next.length === live.aliases.length &&
    next.every(
      (a, i) =>
        (a.blockName ?? '') === (live.aliases[i].blockName ?? '') &&
        (a.pieceLineKey ?? '') === (live.aliases[i].pieceLineKey ?? '') &&
        (a.fabricPurpose ?? '') === (live.aliases[i].fabricPurpose ?? '') &&
        (a.bomLineKey ?? '') === (live.aliases[i].bomLineKey ?? ''),
    );
  if (!same) writes.push({ path: 'pieceDxfAliases', value: next });
  return { writes, created: created.length, reusedPieces, replaced };
}

export async function applyDraft(
  draft: CardDraft,
  deps: ApplyDeps,
  onProgress?: (p: ApplyProgressEvent) => void,
): Promise<ApplyResult> {
  const mintKey = deps.mintKey ?? mintLineKey;
  const uploaded: ApplyUploaded[] = [];
  const reused: string[] = [];

  // pre-flight: a file over the server limit fails before anything is uploaded
  for (const s of draft.scopes) {
    const bytes = new TextEncoder().encode(s.dxfText).length;
    if (bytes > MAX_PATTERN_BYTES)
      return {
        ok: false,
        failedScope: s.target.label || s.target.scopeKey,
        message: `${s.filename} is ${(bytes / 1048576).toFixed(1)} MB — over the 40 MB limit; nothing was uploaded`,
        uploaded: [],
      };
  }

  // 1. uploads — all of them, or the form is not touched
  for (const s of draft.scopes) {
    const scopeKey = s.target.scopeKey;
    if (onCard(draft, deps.read(), scopeKey, deps.scopeOf)) {
      reused.push(scopeKey);
      onProgress?.({ scopeKey, state: 'uploaded' });
      continue;
    }
    onProgress?.({ scopeKey, state: 'uploading' });
    try {
      const res = await deps.upload({ filename: s.filename, text: s.dxfText });
      uploaded.push({
        scopeKey,
        url: res.url,
        filename: res.filename || s.filename,
        sizeBytes: Number(res.sizeBytes) || new TextEncoder().encode(s.dxfText).length,
        sha256: res.sha256 ?? '',
      });
      onProgress?.({ scopeKey, state: 'uploaded' });
    } catch (e) {
      onProgress?.({ scopeKey, state: 'failed' });
      return {
        ok: false,
        failedScope: s.target.label || scopeKey,
        message: e instanceof Error ? e.message : String(e),
        uploaded,
      };
    }
  }

  // 2. one ordered batch against the live form
  const plan = planFormWrites(draft, deps.read(), uploaded, {
    storageSizeId: deps.storageSizeId,
    mintKey,
    scopeOf: deps.scopeOf,
  });
  for (const w of plan.writes) deps.write(w.path, w.value);
  if (plan.replaced.length) deps.onReplaced?.(plan.replaced);
  const retry = !plan.writes.length && !!deps.unsaved?.get();
  if (plan.writes.length) deps.unsaved?.set(true);

  // 3. the card's own save (the only transaction) — this try's rows, or an earlier try's rows the
  //    save refused; success only on what the save answered
  const save =
    (plan.writes.length || retry) && deps.save ? await deps.save('pattern-import') : undefined;
  if (save !== undefined) {
    const fine = retry ? save === 'ok' : save === 'ok' || save === 'nothing' || save === 'off';
    if (!fine)
      return {
        ok: false,
        failedScope: '',
        message: `the card did not save (${save}) — the rows are in the form; apply again to save them`,
        uploaded,
      };
    deps.unsaved?.set(false);
  }
  return {
    ok: true,
    uploaded,
    reused,
    writes: plan.writes.length,
    ...(plan.replaced.length ? { replaced: plan.replaced } : {}),
    ...(save ? { save } : {}),
  };
}
