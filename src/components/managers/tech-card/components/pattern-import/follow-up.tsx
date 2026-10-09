// AFTER AN IMPORT: piece areas and the size index, measured the way the Patterns tab measures them
// (MF-C, M3 / W1). Headless: mounted by patterns-field only while a follow-up job is open, because
// the measuring conditions arm the card's DXF parse (the same cached parse the tab already holds).
//
// What it waits for before measuring — every one of these is what the "∑ piece areas" dialog would
// refuse on, and measuring earlier would publish areas for a card the server has not seen:
//   · the card save went through (apply only starts a job on save 'ok') and the form is clean;
//   · the card's parse is done AND contains every uploaded url (the sheet just written);
//   · the measuring conditions settled (workshop settings read).
// Then `runFollowUp` (lib/pattern-import/fabrics/followup.ts): per scope areas, then the size index.
// Every refusal or server error becomes a warning on that cell; nothing is rolled back.
import { useQueryClient } from '@tanstack/react-query';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  failWaiting,
  followUpPending,
  runFollowUp,
  type FollowUpRow,
  type FollowUpTarget,
  type StepAnswer,
} from 'lib/pattern-import/fabrics/followup';
import { useEffect, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { FabricScope, RollGoodsLine } from '../bom-purpose';
import { mmToEngineCm } from '../nesting/allowance-units';
import { sizeTokensOf } from '../nesting/block-code';
import { dxfNormAreas } from '../nesting/dxf-consumption';
import { useDxfMeasureConditions } from '../nesting/dxf-measure-conditions';
import type { PublishSizeIndexResult } from '../pattern-size-index';
import {
  pieceAreaSheetsRefusal,
  pieceAreaSizeRangeRefusal,
  publishPieceAreas,
  scopeAreaPieces,
  type PieceAreaSheet,
} from '../piece-areas';
import { serverKeyOfScope } from '../piece-areas-state';
import type { TechCardFormData } from '../schema';

export type FollowUpJob = {
  id: number;
  rows: FollowUpRow[];
  /** Urls the parse must contain before anything is measured (the files apply just wrote). */
  urls: string[];
  /** Bumped by a retry: the runner re-arms on it. */
  nonce: number;
};

/** How long the card may take to save, re-read and parse before the waiting cells give up. */
const READY_TIMEOUT_MS = 120_000;

type AliasRow = {
  bomLineKey?: string;
  fabricPurpose?: string;
  blockName?: string;
  pieceLineKey?: string;
};

export function ImportFollowUpRunner({
  job,
  techCardId,
  scopes,
  sheetsOfScope,
  aliasesOfScope,
  sizeIds,
  savedSizeIds,
  sizeNameById,
  sourceDirty,
  publishIndex,
  onRows,
}: {
  job: FollowUpJob;
  techCardId: number;
  scopes: FabricScope<RollGoodsLine>[];
  /** ALL sheets of a scope (PDF too): the server fingerprints the scope by its whole set. */
  sheetsOfScope: (scopeKey: string) => PieceAreaSheet[];
  aliasesOfScope: (scope: FabricScope<RollGoodsLine>) => AliasRow[];
  sizeIds: number[];
  savedSizeIds?: number[];
  sizeNameById: Map<number, string>;
  sourceDirty: boolean;
  /** patterns-field's size-index publish (shares its once-per-set bookkeeping). */
  publishIndex: (scopeKey: string, force: boolean) => Promise<PublishSizeIndexResult>;
  onRows: (jobId: number, rows: FollowUpRow[]) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const queryClient = useQueryClient();
  const conditions = useDxfMeasureConditions(control);
  const pieceRows = (useWatch({ control, name: 'pieces' }) ?? []) as {
    lineKey?: string;
    name?: string;
    piecesPerGarment?: number;
    ungraded?: boolean;
  }[];

  // The async run reads the LATEST render through this ref: a save or a parse finishing mid-run
  // must not be measured against the closure the run started with.
  const live = useRef({
    conditions,
    pieceRows,
    scopes,
    sheetsOfScope,
    aliasesOfScope,
    sizeIds,
    savedSizeIds,
    sizeNameById,
    sourceDirty,
    publishIndex,
  });
  live.current = {
    conditions,
    pieceRows,
    scopes,
    sheetsOfScope,
    aliasesOfScope,
    sizeIds,
    savedSizeIds,
    sizeNameById,
    sourceDirty,
    publishIndex,
  };

  const pending = followUpPending(job.rows);
  // Every file apply wrote carries our manifest, so "the parse has read the new sheet" is "its url
  // has a manifest in the bundle". A sheet whose manifest does not match its drawing fails the parse
  // (F6b) and never shows up here: the cells then time out with the reason, they do not guess.
  const parsedUrls = conditions.bundle?.manifestByUrl;
  const packUrls = new Set(parsedUrls?.keys() ?? []);
  const parsedAll =
    !!conditions.bundle &&
    !!conditions.index &&
    !conditions.parsePending &&
    job.urls.every((u) => packUrls.has(u));
  const settled = !conditions._fields.workshopPending;
  const ready = pending && !sourceDirty && parsedAll && settled;

  const started = useRef<string>('');
  const jobRef = useRef(job);
  jobRef.current = job;
  const statusRef = useRef({ sourceDirty, parseError: conditions.parseError, parsedAll });
  statusRef.current = { sourceDirty, parseError: conditions.parseError, parsedAll };
  // Give up on waiting cells after a while: say why instead of spinning forever. Only while the run
  // has not started — a started run answers every cell itself, and the rows this timer saw would be
  // stale by then.
  useEffect(() => {
    if (!pending) return;
    const key = `${job.id}|${job.nonce}`;
    const t = setTimeout(() => {
      if (started.current === key) return;
      const st = statusRef.current;
      const why = st.sourceDirty
        ? 'the card has not saved its pattern edits yet'
        : st.parseError
          ? `the card's DXF parse failed: ${st.parseError.message}`
          : !st.parsedAll
            ? 'the card did not finish parsing the new sheet'
            : 'the measuring conditions did not settle';
      onRows(
        job.id,
        failWaiting(jobRef.current.rows, `${why}. retry, or use “∑ piece areas” on the fabric`),
      );
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
    // re-armed per job/retry only; the reason is read when the timer fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.nonce, pending]);

  useEffect(() => {
    if (!ready) return;
    const key = `${job.id}|${job.nonce}`;
    if (started.current === key) return;
    started.current = key;
    void runFollowUp(
      job.rows,
      {
        areas: (t) => measureAreas(t),
        sizeIndex: async (t) => {
          const res = await live.current.publishIndex(t.scopeKey, true);
          return res.ok
            ? {
                ok: true,
                detail: `${res.tokenCount} ${res.tokenCount === 1 ? 'size' : 'sizes'} in the files, ${res.resolvedSizeCount} on the card`,
              }
            : { ok: false, reason: res.reason };
        },
      },
      (rows) => onRows(job.id, rows),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, job.id, job.nonce]);

  async function measureAreas(t: FollowUpTarget): Promise<StepAnswer> {
    const L = live.current;
    const c = L.conditions;
    const scope = L.scopes.find((s) => s.key === t.scopeKey);
    if (!scope) return { ok: false, reason: 'this fabric is no longer in the BOM' };
    if (!c.index) return { ok: false, reason: "the card's DXF parse is not ready" };
    // The dialog's conditions, read the same way; a converted sheet adds one rule of its own: its
    // layer 1 IS the cut line, so measuring another layer or adding allowance would be wrong.
    if (c.downloadFailures.length > 0)
      return { ok: false, reason: `a sheet did not download: ${c.downloadFailures.join('; ')}` };
    if (c.layer !== t.cutLayer)
      return {
        ok: false,
        reason: `the card measures on layer ${c.layer || '—'}, the converted sheet cuts on layer ${t.cutLayer}: measure in “∑ piece areas” and pick layer ${t.cutLayer}`,
      };
    if (c.seamMm > 0)
      return {
        ok: false,
        reason: `a ${c.seamMm} mm seam allowance would be added to a contour that already is the cut line: measure in “∑ piece areas” with 0 mm`,
      };
    if (c.blocked)
      return { ok: false, reason: 'the measuring conditions are not usable (see “∑ piece areas”)' };
    if (L.sourceDirty) return { ok: false, reason: 'the card has unsaved pattern edits' };

    const pieces = scopeAreaPieces(L.aliasesOfScope(scope), L.pieceRows, scope.key);
    if (pieces.length === 0)
      return { ok: false, reason: 'no cut piece of this fabric is linked to a block' };
    const unsaved = pieces.filter((p) => !(p.lineKey ?? '').trim());
    if (unsaved.length)
      return {
        ok: false,
        reason: `not saved on the server yet: ${unsaved.map((p) => p.name).join(', ')}`,
      };
    const outcome = dxfNormAreas({
      index: c.index,
      pieces,
      unaliasedPieces: [],
      sizeIds: L.sizeIds,
      tokensOfSize: (id) => sizeTokensOf(L.sizeNameById.get(id)),
      contourLayer: c.layer,
      allowanceCm: mmToEngineCm(c.seamMm) ?? 0,
    });
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    if (outcome.areas.sizesIncompleteWhy.length)
      return { ok: false, reason: outcome.areas.sizesIncompleteWhy.join('; ') };
    const sheets = L.sheetsOfScope(scope.key);
    const scopeKey = serverKeyOfScope(scope);
    const sheetsWhy = pieceAreaSheetsRefusal(sheets, scopeKey);
    if (sheetsWhy) return { ok: false, reason: sheetsWhy };
    const name = (id: number) => L.sizeNameById.get(id) ?? `#${id}`;
    const rangeWhy = pieceAreaSizeRangeRefusal(
      L.sizeIds,
      L.savedSizeIds,
      name,
      outcome.areas.pieceRows,
    );
    if (rangeWhy) return { ok: false, reason: rangeWhy };

    const res = await publishPieceAreas({
      techCardId,
      scopeKey,
      sheets,
      areas: outcome.areas.pieceRows,
      contourLayer: c.layer,
      seamAllowanceMm: Number(c.seamMm) || 0,
      nameOfPiece: (key) => pieces.find((p) => (p.lineKey ?? '').trim() === key)?.name ?? key,
    });
    if (!res.ok) return { ok: false, reason: res.reason };
    // freshness of the measurement is the server's answer on the card read
    queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
    const sizes = new Set(outcome.areas.pieceRows.flatMap((r) => (r.sizeId > 0 ? [r.sizeId] : [])))
      .size;
    return {
      ok: true,
      detail: `${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'}${sizes ? ` × ${sizes} ${sizes === 1 ? 'size' : 'sizes'}` : ''}, layer ${c.layer}, ${res.stored} areas`,
    };
  }

  return null;
}
