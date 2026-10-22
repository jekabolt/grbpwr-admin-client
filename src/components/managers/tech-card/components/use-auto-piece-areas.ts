// AUTOMATIC PIECE AREAS (PATTERNS-LITE, decision 9) — replaces the «∑ piece areas» button + dialog.
//
// Every fabric scope whose server-side measurement is missing, stale or partial is measured and
// published by itself, with the dialog's inputs and the dialog's refusals, and with no click:
//   · the set of pieces = the block→piece links of the scope (`scopeAreaPieces`), as the server
//     checks it against exactly those links;
//   · contour layer = the card default (`index.contourLayer`), or the manifest's cut layer for a
//     scope made only of converted sheets; seam allowance = `applySeamPrefill` (file-measured →
//     card standard → workshop → NEST_DEFAULTS), i.e. what the dialog would open with;
//   · `dxfNormAreas` computes, `publishPieceAreas` writes (SaveTechCardPieceAreas).
//
// WAITS (nothing returned, nothing written) while the server could not accept the measurement yet:
// the form has unsaved patterns / links / ungraded ticks, a save is in flight, the form's size range
// differs from the saved one, a piece of the set is not on the server, the parse or the workshop
// settings are still coming. Those clear by themselves when the card saves.
//
// REFUSES (short reason in the returned map, keyed by the CLIENT scope key the slots use) only for
// what stays wrong until somebody changes the files, the links or the BOM.
//
// LOOP SAFETY: an attempt is keyed by a signature of everything it measured (sheets, links, pieces,
// sizes, layer, allowance). A signature is attempted once; success or failure, it is not retried
// until one of its inputs changes. Runs are serial across the whole card (concurrent writes into
// one card race), and the outcome is read back from the server by invalidating the card read.
import { useQueryClient } from '@tanstack/react-query';
import {
  techCardKeys,
  useTechCard,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useWorkshopSettings } from '../../workshop/useWorkshopSettings';
import { aliasInScope, bindingScopes } from './bom-purpose';
import { mmToEngineCm } from './nesting/allowance-units';
import { sizeTokensOf } from './nesting/block-code';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { contourIsCutLine } from './nesting/contour-layer';
import { applyLayerOptions, applySeamPrefill } from './nesting/dxf-apply-conditions';
import { dxfByScope } from './nesting/dxf-by-scope';
import { dxfNormAreas } from './nesting/dxf-consumption';
import { useDxfGeometry, useDxfIndex } from './nesting/dxf-geometry';
import { isFetchFailure } from './nesting/dxf-warnings';
import { rollGoodsScopes, type PieceAliasRow } from './piece-block-refs';
import {
  pieceAreaSheetsRefusal,
  pieceAreaSizeRangeRefusal,
  publishPieceAreas,
  scopeAreaPieces,
  useUnsavedAreaSource,
} from './piece-areas';
import { areaReadKeysOfScope, scopeAreaState, serverKeyOfScope } from './piece-areas-state';
import type { TechCardFormData } from './schema';
import { isDxfUrl } from 'utils/pattern';

type SheetRow = {
  url?: string;
  lineKey?: string;
  fabricPurpose?: string;
  bomLineKey?: string;
};
type PieceRow = {
  lineKey?: string;
  name?: string;
  piecesPerGarment?: number;
  ungraded?: boolean;
};

/** One scope ready to be measured: everything the async run needs, frozen at plan time. */
type Job = {
  scopeKey: string;
  sig: string;
  /**
   * `stillCurrent` is asked right before the write: a run frozen at plan time must not publish
   * once the card moved on (dirty form, save in flight, RELEASED, disabled, unmounted, or a new
   * signature for this scope). `dropped` = nothing written, nothing to report.
   */
  run: (
    stillCurrent: () => boolean,
  ) => Promise<{ ok: true } | { ok: false; reason: string } | { ok: 'dropped' }>;
};

const RELEASED = 'TECH_CARD_APPROVAL_STATE_RELEASED';

const PREFIX = 'piece areas: ';

/** The engine's long refusals, folded to a few words for a header warning. */
function shortNormReason(reason: string): string {
  if (reason.includes('no size range')) return 'no size range';
  if (reason.includes('size suffix and without')) return 'piece drawn graded and ungraded';
  if (reason.includes("today's patterns have no pieces")) return 'linked pieces missing in drawing';
  if (reason.includes('several variants')) return 'two revisions on one layer';
  if (reason.includes('UNI mark') || reason.includes('ungraded piece')) return 'UNI copies differ';
  if (reason.includes('not a single contour')) return 'no contour in the drawing';
  if (reason.includes('full set of pieces on layer')) return 'no full set on contour layer';
  if (reason.includes('no cut pieces bound')) return 'no piece linked to the drawing';
  return 'the drawing does not add up';
}

export function useAutoPieceAreas(args: {
  techCardId: number | undefined;
  enabled: boolean;
}): Record<string, string> {
  const { techCardId, enabled } = args;
  const { control } = useFormContext<TechCardFormData>();
  const queryClient = useQueryClient();
  const { isSubmitting } = useFormState({ control });
  const sourceDirty = useUnsavedAreaSource(control);

  const { data: cardRead } = useTechCard(techCardId);
  const workshop = useWorkshopSettings();
  const sizeNameById = useSizeNames();

  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as SheetRow[];
  const aliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as PieceAliasRow[];
  const pieceRows = (useWatch({ control, name: 'pieces' }) ?? []) as PieceRow[];
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const cardSeamMm = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? null) as
    | number
    | string
    | null;
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    lineKey?: string;
    section?: string;
    purpose?: string;
    name?: string;
  }>;
  const scopes = useMemo(() => rollGoodsScopes(bomItems), [bomItems]);

  // The card's parse — the same cached query PatternsField arms (key = pack contents). Armed here
  // only when enabled: a hidden tab must not download anything on our account.
  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, enabled);
  const index = useDxfIndex(geometry.data);
  const layers = useMemo(
    () => (geometry.data && index ? applyLayerOptions(geometry.data, index) : []),
    [geometry.data, index],
  );

  // ALL sheets of a scope (PDF too): the server fingerprints the scope by its whole set.
  const sheetsByScope = useMemo(() => dxfByScope(patterns, scopes, (r) => r), [patterns, scopes]);

  // A RELEASED card is frozen server-side: nothing is measured or written for it.
  const released = cardRead?.techCard?.approvalState === RELEASED;
  const savedSizeIds = cardRead?.techCard?.sizeIds ?? undefined;
  const savedPieceKeys = useMemo(() => {
    const s = new Set<string>();
    for (const p of cardRead?.techCard?.pieces ?? []) {
      const k = (p.lineKey ?? '').trim();
      if (k) s.add(k);
    }
    return s;
  }, [cardRead?.techCard?.pieces]);

  // ── the plan: per scope, wait / refuse / run ────────────────────────────────────────────────
  const plan = useMemo(() => {
    const refusals: Record<string, string> = {};
    const jobs: Job[] = [];
    const id = techCardId ?? 0;
    // Global waits: nothing the server could accept right now.
    if (!enabled || id <= 0 || !cardRead || released || isSubmitting || sourceDirty)
      return { refusals, jobs };
    const saved = new Set(savedSizeIds ?? []);
    const sameRange =
      savedSizeIds != null &&
      saved.size === new Set(sizeIds).size &&
      sizeIds.every((s) => saved.has(s));
    if (!sameRange) return { refusals, jobs };

    const links = bindingScopes(scopes, aliases);
    for (const scope of scopes) {
      const sheets = sheetsByScope.get(scope.key) ?? [];
      const dxfSheets = sheets.filter((s) => !!s.url && isDxfUrl(s.url));
      if (dxfSheets.length === 0) continue;
      const areaKeys = areaReadKeysOfScope(scope, scopes, sheets, cardRead.pieceAreaScopes);
      const state = scopeAreaState(areaKeys, cardRead.pieceAreaScopes);
      if (state.phase === 'fresh') continue;

      const scopeAliases = aliases.filter((a) => aliasInScope(a, scope, links));
      const pieces = scopeAreaPieces(scopeAliases, pieceRows, scope.key);
      if (pieces.length === 0) {
        refusals[scope.key] = `${PREFIX}no piece linked to the drawing`;
        continue;
      }
      // A piece the server does not have yet: the save will bring it.
      if (pieces.some((p) => !(p.lineKey ?? '').trim() || !savedPieceKeys.has(p.lineKey!.trim())))
        continue;

      const serverKey = serverKeyOfScope(scope);
      const sheetsWhy = pieceAreaSheetsRefusal(sheets, serverKey, scopes);
      if (sheetsWhy) {
        // «no identifier yet» is the save's job; the binding mismatches are not.
        if (!sheetsWhy.includes('no identifier yet'))
          refusals[scope.key] = `${PREFIX}sheets bound inconsistently`;
        continue;
      }

      // Parse and workshop must have answered; until then this is a wait, not a refusal.
      if (!geometry.data || !index || workshop.isPending) {
        if (geometry.isError) refusals[scope.key] = `${PREFIX}patterns could not be parsed`;
        continue;
      }
      if ((geometry.data.warnings ?? []).some(isFetchFailure)) {
        refusals[scope.key] = `${PREFIX}a sheet download failed`;
        continue;
      }

      // Converted sheets (our importer's manifest): their cut layer IS the cut line. A scope made
      // only of them is measured on that layer; a mix with CAD sheets has no single right layer.
      const manifests = dxfSheets.map((s) => geometry.data!.manifestByUrl?.get(s.url!));
      const converted = manifests.filter(Boolean);
      if (converted.length > 0 && converted.length < manifests.length) {
        refusals[scope.key] = `${PREFIX}converted and CAD sheets mixed`;
        continue;
      }
      const cutLayers = new Set(converted.map((m) => m!.layers.cut));
      if (cutLayers.size > 1) {
        refusals[scope.key] = `${PREFIX}converted sheets disagree on layer`;
        continue;
      }
      const layer = converted.length > 0 ? [...cutLayers][0] : index.contourLayer || '';
      const option = layers.find((o) => o.layer === layer);
      const seamMm = applySeamPrefill(
        option,
        cardSeamMm,
        workshop.data?.settings?.defaultSeamAllowanceMm,
      ).value;
      if (!Number.isFinite(seamMm) || seamMm < 0) {
        refusals[scope.key] = `${PREFIX}seam allowance unusable`;
        continue;
      }
      if ((converted.length > 0 || contourIsCutLine(option?.allowance)) && seamMm > 0) {
        refusals[scope.key] = `${PREFIX}double seam allowance`;
        continue;
      }

      const sig = JSON.stringify([
        id,
        scope.key,
        serverKey,
        sheets.map((s) => [s.lineKey, s.url, s.fabricPurpose, s.bomLineKey]),
        pieces.map((p) => [p.lineKey, p.ungraded, p.refs.map((r) => r.block)]),
        [...sizeIds].sort((a, b) => a - b),
        layer,
        seamMm,
      ]);
      const idx = index;
      const sizeName = (sid: number) => sizeNameById.get(sid) ?? `#${sid}`;
      jobs.push({
        scopeKey: scope.key,
        sig,
        run: async (stillCurrent) => {
          if (!stillCurrent()) return { ok: 'dropped' };
          const outcome = dxfNormAreas({
            index: idx,
            pieces,
            unaliasedPieces: [],
            sizeIds,
            tokensOfSize: (sid) => sizeTokensOf(sizeNameById.get(sid)),
            contourLayer: layer,
            allowanceCm: mmToEngineCm(seamMm) ?? 0,
          });
          if (!outcome.ok) return { ok: false, reason: shortNormReason(outcome.reason) };
          if (outcome.areas.sizesIncompleteWhy.length > 0)
            return { ok: false, reason: 'set incomplete in some sizes' };
          if (pieceAreaSizeRangeRefusal(sizeIds, savedSizeIds, sizeName, outcome.areas.pieceRows))
            return { ok: false, reason: 'size range not saved' };
          // Last gate before the write: the plan this run was frozen from must still be the live one.
          if (!stillCurrent()) return { ok: 'dropped' };
          const res = await publishPieceAreas({
            techCardId: id,
            scopeKey: serverKey,
            scopes,
            sheets: [...sheets],
            areas: outcome.areas.pieceRows,
            contourLayer: layer,
            seamAllowanceMm: Number(seamMm) || 0,
            nameOfPiece: (k) => pieces.find((p) => (p.lineKey ?? '').trim() === k)?.name ?? k,
          });
          if (!res.ok) {
            if (res.reason.includes('zero or smaller')) return { ok: false, reason: 'zero-area piece' };
            if (res.reason.includes('no areas at all')) return { ok: false, reason: 'no areas found' };
            return { ok: false, reason: 'server refused the measurement' };
          }
          return { ok: true };
        },
      });
    }
    return { refusals, jobs };
  }, [
    enabled,
    techCardId,
    cardRead,
    released,
    isSubmitting,
    sourceDirty,
    savedSizeIds,
    sizeIds,
    scopes,
    sheetsByScope,
    aliases,
    pieceRows,
    savedPieceKeys,
    geometry.data,
    geometry.isError,
    index,
    workshop.isPending,
    workshop.data,
    layers,
    cardSeamMm,
    sizeNameById,
  ]);

  // ── the runner: one attempt per signature, one write at a time ─────────────────────────────
  // scopeKey → { sig attempted, failure reason ('' = succeeded) }.
  const [attempts, setAttempts] = useState<Record<string, { sig: string; reason: string }>>({});
  const attemptedSigs = useRef(new Set<string>());
  const busy = useRef(false);
  const alive = useRef(true);
  // Bumped when a run ends, so the next pending job (if any) starts.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The LIVE gates and per-scope signatures, refreshed at every commit. A running job compares
  // its frozen signature against these before it writes (see Job.run).
  const live = useRef<{ gatesOk: boolean; sigByScope: Map<string, string> }>({
    gatesOk: false,
    sigByScope: new Map(),
  });
  useLayoutEffect(() => {
    live.current = {
      gatesOk: enabled && !isSubmitting && !sourceDirty && !released && !!cardRead,
      sigByScope: new Map(plan.jobs.map((j) => [j.scopeKey, j.sig])),
    };
  }, [enabled, isSubmitting, sourceDirty, released, cardRead, plan]);

  useEffect(() => {
    if (busy.current) return;
    const job = plan.jobs.find((j) => !attemptedSigs.current.has(j.sig));
    if (!job) return;
    attemptedSigs.current.add(job.sig);
    busy.current = true;
    const id = techCardId ?? 0;
    const stillCurrent = () =>
      alive.current &&
      live.current.gatesOk &&
      live.current.sigByScope.get(job.scopeKey) === job.sig;
    void (async () => {
      let reason = '';
      try {
        const r = await job.run(stillCurrent);
        if (r.ok === 'dropped') {
          // Stale before the write: nothing published, nothing recorded. Forget the signature so it
          // may run again if it becomes current once more, and let the next plan take over.
          busy.current = false;
          attemptedSigs.current.delete(job.sig);
          if (alive.current) setTick((t) => t + 1);
          return;
        }
        if (!r.ok) reason = `${PREFIX}${r.reason}`;
      } catch {
        reason = `${PREFIX}measurement failed`;
      }
      busy.current = false;
      // Success: the server's freshness answer arrives with the re-read card (silently). A failed
      // write changed nothing on the server, so there is nothing to re-read.
      if (!reason && id > 0) {
        void queryClient.invalidateQueries({ queryKey: techCardKeys.detail(id) });
      }
      if (!alive.current) return;
      setAttempts((prev) => ({ ...prev, [job.scopeKey]: { sig: job.sig, reason } }));
      setTick((t) => t + 1);
    })();
  }, [plan, tick, techCardId, queryClient]);

  return useMemo(() => {
    const out: Record<string, string> = { ...plan.refusals };
    for (const j of plan.jobs) {
      const a = attempts[j.scopeKey];
      if (a && a.sig === j.sig && a.reason) out[j.scopeKey] = a.reason;
    }
    return out;
  }, [plan, attempts]);
}
