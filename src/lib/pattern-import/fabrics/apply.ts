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
import { importedCutSymmetry } from 'components/managers/tech-card/components/piece-codes';

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

export type FormWrite = { path: string; value: unknown };

export type ApplyProgressEvent = { scopeKey: string; state: 'uploading' | 'uploaded' | 'failed' };

export type ApplyDeps = {
  /** `adminService.UploadPattern` behind the same rules as pattern-upload-button.tsx. */
  upload: (file: {
    filename: string;
    text: string;
  }) => Promise<{ url: string; filename: string; sizeBytes: number }>;
  /** The live form, read at commit time (getValues). */
  read: () => LiveCard;
  /** `setValue(path, value, { shouldDirty: true })`. */
  write: (path: string, value: unknown) => void;
  /** The size id a new pattern row is stored under (patterns-field `storageSizeId`). */
  storageSizeId: number;
  /** The card's save (autosave `flush`); its answer is returned as `save`. */
  save?: (reason: string) => Promise<string>;
  mintKey?: () => string;
};

/** fabricScopeKey (bom-purpose.ts): purpose first, else the legacy line. */
export const scopeKeyOf = (a: { fabricPurpose?: string; bomLineKey?: string }) => {
  const p = (a.fabricPurpose ?? '').trim();
  if (p && p !== 'TECH_CARD_BOM_PURPOSE_UNKNOWN' && p !== 'TECH_CARD_BOM_PURPOSE_UNSPECIFIED')
    return p;
  return (a.bomLineKey ?? '').trim();
};

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
function clampBytes(s: string, max: number): string {
  let out = s.trim();
  while (utf8Bytes(out) > max) out = out.slice(0, -1);
  return out;
}

/** The scope's identical file is already a pattern row of that scope (same fingerprinted name). */
export function onCard(draft: CardDraft, live: LiveCard, scopeKey: string): LivePattern | null {
  const sc = draft.scopes.find((s) => s.target.scopeKey === scopeKey);
  if (!sc) return null;
  return (
    live.patterns.find((p) => scopeKeyOf(p) === scopeKey && (p.filename ?? '') === sc.filename) ??
    null
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
  opts: { storageSizeId: number; mintKey: () => string },
): {
  writes: FormWrite[];
  created: number;
  reusedPieces: number;
  replaced: { scopeKey: string; lineKey: string; oldUrl: string; newUrl: string }[];
} {
  const writes: FormWrite[] = [];

  // 1. patterns — one row per uploaded scope: the previous import's row replaced in place, or a new
  //    row appended. The replaced row is re-found in the LIVE form by its lineKey and must still be
  //    bound to the same scope; if the operator removed or rebound it meanwhile, the file is added.
  const nextPatterns = live.patterns.map((p) => ({ ...p }));
  const replaced: { scopeKey: string; lineKey: string; oldUrl: string; newUrl: string }[] = [];
  const rows = uploaded.flatMap((u) => {
    const sc = draft.scopes.find((s) => s.target.scopeKey === u.scopeKey);
    if (!sc) return [];
    if (sc.replaces && sc.sheetMode !== 'add') {
      const key = sc.replaces.lineKey.toLowerCase();
      const i = nextPatterns.findIndex(
        (p) => (p.lineKey ?? '').trim().toLowerCase() === key && scopeKeyOf(p) === u.scopeKey,
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
          url: u.url,
          filename: u.filename,
          sizeBytes: u.sizeBytes,
          // 0 = "assign one": the server numbers a url it has not seen on this card (schema.ts)
          version: 0,
          uploadedAt: '',
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
      },
    ];
  });
  if (rows.length || replaced.length)
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
      liveAliasOwner.set(aliasKey(scopeKeyOf(a), a.blockName ?? ''), k);
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
        cutSymmetry: IDENTICAL,
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
  const next: LiveAlias[] = live.aliases.map((a) => ({ ...a }));
  const at = new Map<string, number>();
  next.forEach((a, i) => at.set(aliasKey(scopeKeyOf(a), a.blockName ?? ''), i));
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
      next.push(row);
    } else next[i] = row;
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
    if (onCard(draft, deps.read(), scopeKey)) {
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
  });
  for (const w of plan.writes) deps.write(w.path, w.value);

  // 3. the card's own save (the only transaction)
  const save = plan.writes.length && deps.save ? await deps.save('pattern-import') : undefined;
  return {
    ok: true,
    uploaded,
    reused,
    writes: plan.writes.length,
    ...(plan.replaced.length ? { replaced: plan.replaced } : {}),
    ...(save ? { save } : {}),
  };
}
