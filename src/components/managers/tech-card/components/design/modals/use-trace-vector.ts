import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignEditLayer,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isRunLive, runStatus } from '../generation/run-state';
import { designKeys, newClientRequestId } from '../use-design-band';
import { SILHOUETTE_VIEWS } from '../views';
import { importSvg, type SvgImportResult } from './svg-import';
import { writeLayer, type VectorStroke } from './vector-strokes';

/**
 * MACHINE VECTORISATION — the data seam of the entry fork's «yes, convert the raster» branch.
 *
 * WHAT THE MACHINE DOES, AND WHY THE WHOLE FLOW IS SHAPED BY IT. The vector run is a REDRAW, not a
 * trace (the provider's `vectorize` verb produces the many-node mush the owner forbade, and the
 * backend never calls it — internal/recraft/recraft.go states this in its header). A vector model
 * draws the garment AGAIN, using the approved raster only as its composition reference: a cuff can
 * come back a different cuff, a pocket can move, a seam line can disappear. That is the price of
 * clean, editable curves — and it is why the result lands in an ACCEPTANCE step, side by side with
 * the source raster, and never replaces the approved flat by itself. Nothing in this hook publishes
 * anything until a person has looked and pressed «keep».
 *
 * THE MONEY GOES THROUGH THE ONE DOOR. `StartDesignRun(kind = 'vector')` — the same paid-run verb
 * as every generation, with the same server gates (budget, hourly ceiling, one run in flight,
 * provider configured). This hook copies the gates NOWHERE: the door stays live and the server's
 * refusal is shown in words, because a client-side copy of a server rule is a copy that drifts
 * (the flag lives next to the check, and the check is on the server).
 *
 * WHAT THE RUN READS IS THE BENCH, NARROWED TO THIS PLATE. The server assembles a vector run's
 * inputs from the FLAT bench and the worker feeds the FIRST selected plate to the provider — so
 * the request narrows the selection to exactly the slot this editor was opened from
 * (`fix_targets` for a side, `fix_slot_ids` for a detail). The narrowing is not decoration: an
 * unnarrowed run on a four-sided bench would redraw the FRONT no matter which plate the person
 * was looking at.
 *
 * THE SVG IS ALREADY IN THE MEDIA LIBRARY WHEN IT ARRIVES. The design worker mints every artifact
 * through the same media sink the upload doors use, so a finished run's picture IS a media row —
 * the owner's «сохранение в библиотеку, там где все картинки и видео» is done by the worker at
 * the moment of generation. `UploadContentVector` is deliberately NOT called on this path: the
 * bytes are on the shelf already, and uploading them again would mint a second identical object.
 * (That verb is for a vector file only the client holds — a foreign SVG from disk.)
 *
 * ACCEPTING FILES THE LAYER, AND THE LAYER IS WHAT RE-ENTRY READS. `ImportDesignVector` writes
 * `source_media_id` (the authoritative file), `source_picture_id` (the raster it was traced from),
 * `origin = 'vectorised'` and the editable projection parsed out of the SVG by the same importer
 * the upload door uses. `GetDesignBand` lists the layer from then on — «при повторном заходе
 * вектор уже был» is held by the band, not by this tab's memory. Idempotent by client_request_id,
 * minted once per arrived file and kept across retries, so a retry after a lost response cannot
 * file the same SVG as a second layer.
 *
 * A RUN SURVIVES THE TAB, AND THE HOOK KNOWS IT. Closing the editor does not stop the run — it is
 * a server job with a ledger row. On re-entry the hook scans the band's first history page: a LIVE
 * vector run whose frozen input names this plate is resumed into the waiting phase, and a FINISHED
 * one that was never accepted is offered for review — both instead of starting a second paid run.
 */

/** How often a live run is re-read. The contract names `GetDesignRun` as the watch verb: polling
 *  one row costs one row, where polling through the band would cost the whole band per tick. */
const POLL_MS = 3000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// REFUSALS, IN WORDS A PERSON CAN ACT ON
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The refusal of the START — read by the server's own machine tokens, exactly like the layer
 * verbs read theirs. The tokens are the vocabulary; matching the English sentence around them
 * would reclassify a fault the day the sentence is reworded.
 */
export function startRefusalText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : '';
  const has = (code: string) => raw.includes(code);

  if (status === 404 || status === 501 || has('Unimplemented'))
    return 'this server does not know the vector run yet — the routes are not deployed. Nothing was charged.';
  if (has('kind_not_available'))
    return 'machine vectorisation is switched off on this contour — the vector route has no provider configured (kind_not_available). Nothing was charged; drawing over the raster works as always.';
  if (has('budget_exceeded'))
    return 'today’s generation budget is spent (budget_exceeded) — the run was refused before any money moved. The bar resets with the budget’s own day.';
  if (has('run_in_flight'))
    return 'another run on this card is still in flight (run_in_flight) — one at a time. Watch it in the history; press again when it lands.';
  if (has('hourly_limit'))
    return 'the hourly ceiling on runs was reached (hourly_limit) — nothing was charged. Wait a little and press again.';
  if (raw) return raw;
  return 'the run did not start. Nothing was filed and nothing was charged — pressing again carries the same request id, so a run that DID start comes back instead of a second paid one.';
}

/** The refusal of the FILING — `ImportDesignVector` spends nothing, so every refusal here is a
 *  fact about the request, and the server names it. */
export function importRefusalText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : '';
  if (status === 404 || status === 501 || raw.includes('Unimplemented'))
    return 'this server cannot file a vector layer yet — the import route is not deployed. The SVG itself is safe: it stays on the run’s history row.';
  return (
    raw ||
    'the layer was not filed. The SVG is safe on the run’s history row — pressing again carries the same request id, so a filing that DID land comes back instead of a duplicate.'
  );
}

/** How a dead run reads: `failed · provider timeout`, from the row's own facts. */
export function runFailureText(run: common_DesignRun): string {
  const why = (run.errorCode ?? '').trim() || (run.lastError ?? '').trim();
  return why
    ? `the run failed — ${why}. A paid attempt stays on the history row either way.`
    : 'the run failed. The history row holds what is known about why.';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT ARRIVED
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type ArrivedSvg = {
  /** media(id) of the SVG — already a media-library row, minted by the worker. */
  mediaId: number;
  /** The public URL of the file; what the acceptance pane and the download hand out. */
  url: string;
  /**
   * The editable projection, through the SAME importer the upload door uses — one parser, one set
   * of refusal words. `null` while the bytes are still being read back.
   */
  reading: SvgImportResult | null;
  /** The bytes could not be fetched for parsing. The file itself is intact — an accept can still
   *  file it whole, without an editable form. */
  fetchFailed: boolean;
};

/** Does this run's FROZEN input name the given plate? Read from the snapshot, never from today's
 *  bench — the bench may have moved since, and the snapshot is what the machine actually saw. */
export function runReadsMedia(run: common_DesignRun, mediaId: number): boolean {
  if (!mediaId) return false;
  return (run.inputs?.slots ?? []).some((s) => (s.mediaId ?? 0) === mediaId);
}

/**
 * Best-effort URL of a media id, out of the pictures the band's FIRST PAGE already carries. The
 * contract has no media-by-id read on purpose (the band is the one source of re-entry truth), so
 * a file whose run has paged out of the first history page comes back as '' — the caller must
 * degrade to words, never to a broken image.
 */
export function findMediaUrlInBand(band: GetDesignBandResponse, mediaId: number): string {
  if (!mediaId) return '';
  const pools = [
    ...(band.runs ?? []).map((r) => r.pictures ?? []),
    ...(band.batches ?? []).map((b) => b.pictures ?? []),
  ];
  for (const pictures of pools) {
    for (const p of pictures) {
      if ((p.media?.id ?? 0) === mediaId) {
        return (
          p.media?.media?.fullSize?.mediaUrl ||
          p.media?.media?.compressed?.mediaUrl ||
          p.media?.media?.thumbnail?.mediaUrl ||
          ''
        );
      }
    }
  }
  return '';
}

/** The vector runs of the band's first page that read THIS plate, newest first. */
function vectorRunsForMedia(band: GetDesignBandResponse, mediaId: number): common_DesignRun[] {
  return (band.runs ?? [])
    .filter((r) => (r.kind ?? '') === 'vector' && runReadsMedia(r, mediaId))
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
}

export type TraceDoor =
  | { live: true }
  | {
      live: false;
      /** Why the door cannot open — a fact of THIS screen, never a copy of a server gate. */
      reason: string;
    };

export type TracePhase =
  | { k: 'fork'; reviewRun: common_DesignRun | null }
  | { k: 'starting' }
  | { k: 'waiting'; run: common_DesignRun; cancelPending: boolean }
  | { k: 'arrived'; run: common_DesignRun; svg: ArrivedSvg; filing: boolean };

export type TraceVector = {
  door: TraceDoor;
  phase: TracePhase;
  /** The current refusal, in words. Lives beside any phase; cleared by the next gesture. */
  refusal: string | null;
  start: () => void;
  cancel: () => void;
  /** Back to the fork. The run and its SVG stay in the history — discarding loses nothing. */
  discard: () => void;
  /** Review an already-finished, never-accepted run — no new payment. */
  review: (run: common_DesignRun) => void;
  /**
   * File the accepted SVG as this plate's layer. Returns the stored layer plus the parsed strokes
   * (empty when the file has no editable form yet) — the editor adopts both. `null` = refused,
   * with the reason already in `refusal`.
   */
  accept: (
    plateRatio: number,
  ) => Promise<{ layer: common_DesignEditLayer; strokes: VectorStroke[]; fileUrl: string } | null>;
};

export function useTraceVector(input: {
  techCardId: number;
  band: GetDesignBandResponse;
  base?: common_DesignPicture | null;
  slot?: { ref: DesignBenchSlotRef; label: string } | null;
  /** The fork is on screen. While false the hook idles and holds no state worth keeping. */
  active: boolean;
}): TraceVector {
  const { techCardId, band, base, slot, active } = input;
  const qc = useQueryClient();
  const baseMediaId = base?.media?.id ?? 0;

  const [run, setRun] = useState<common_DesignRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [filing, setFiling] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [svg, setSvg] = useState<ArrivedSvg | null>(null);
  /** The person pressed «discard» on THIS run — do not resume it again this visit. */
  const dismissed = useRef<Set<number>>(new Set());

  const invalidateBand = useCallback(
    () => qc.invalidateQueries({ queryKey: designKeys.band(techCardId) }),
    [qc, techCardId],
  );

  // ── the door ─────────────────────────────────────────────────────────────────────────────────

  /** Today's bench, asked whether the slot still holds this plate. The run reads the LIVE bench at
   *  start, so a moved slot would spend money redrawing a picture nobody is looking at. */
  const slotStillHoldsBase = useMemo(() => {
    if (!slot) return false;
    const bench = band.bench ?? [];
    const row = bench.find((s) => {
      const byId = (slot.ref.slotId ?? 0) > 0 && (s.id ?? 0) === slot.ref.slotId;
      // Kind is normalised through «empty spells flat» — the contract's own reading — because the
      // wire legitimately carries either spelling for the flat bench.
      const orFlat = (kind?: string) => (kind ?? '').trim() || 'flat';
      const byView =
        !slot.ref.slotId &&
        (s.viewKey ?? '') === (slot.ref.viewKey ?? '') &&
        orFlat(s.kind) === orFlat(slot.ref.kind);
      return byId || byView;
    });
    return (row?.picture?.media?.id ?? 0) === baseMediaId;
  }, [band.bench, slot, baseMediaId]);

  const door: TraceDoor = useMemo(() => {
    if (!base || !baseMediaId) return { live: false, reason: 'there is no raster to convert.' };
    if (!slot)
      return {
        live: false,
        reason:
          'the machine reads the bench, and this picture is not open from a bench slot — open it from the slot that holds it.',
      };
    const silhouette = SILHOUETTE_VIEWS.includes(
      (slot.ref.viewKey ?? '') as (typeof SILHOUETTE_VIEWS)[number],
    );
    const detail = (slot.ref.slotId ?? 0) > 0;
    if (!silhouette && !detail)
      return {
        live: false,
        reason: 'this slot cannot be named to the machine — it has neither a side nor a minted id.',
      };
    if (!slotStillHoldsBase)
      return {
        live: false,
        reason: `this picture is no longer in the ${slot.label} slot — the machine reads the bench, and the bench moved. Reopen the editor from where the picture stands now.`,
      };
    return { live: true };
  }, [base, baseMediaId, slot, slotStillHoldsBase]);

  // ── resume and review: the band already knows about runs this tab forgot ────────────────────

  const knownRuns = useMemo(
    () => vectorRunsForMedia(band, baseMediaId),
    [band, baseMediaId],
  );

  useEffect(() => {
    if (!active || run) return;
    const live = knownRuns.find((r) => isRunLive(r) && !dismissed.current.has(r.id ?? 0));
    if (live) setRun(live);
  }, [active, run, knownRuns]);

  const reviewRun = useMemo(() => {
    if (!active) return null;
    return (
      knownRuns.find(
        (r) =>
          runStatus(r) === 'done' &&
          (r.pictures ?? []).some((p) => p.media?.id) &&
          !dismissed.current.has(r.id ?? 0),
      ) ?? null
    );
  }, [active, knownRuns]);

  // ── start: one payment per human intent ─────────────────────────────────────────────────────

  /**
   * The idempotency ledger, the same discipline as `useStartRun`: the id is minted once per
   * intent and survives a retry, so a press after a network failure replays the SAME id and the
   * server hands back the run that already exists instead of starting a second paid one. A RUN
   * THAT FILED AND THEN DIED is different — retrying it is a new intent (the old id would only
   * fetch the dead row back), so the ledger is cleared the moment a row lands.
   */
  const ledger = useRef<{ fingerprint: string; id: string } | null>(null);

  const startMutation = useMutation({
    mutationFn: (req: {
      clientRequestId: string;
      fixTargets: string[];
      fixSlotIds: number[];
    }) =>
      adminService.StartDesignRun({
        techCardId,
        clientRequestId: req.clientRequestId,
        kind: 'vector',
        ask: '',
        params: {
          views: [],
          layout: '',
          colour: undefined,
          threed: undefined,
          fixTarget: '',
          fixTargets: req.fixTargets,
          // Деталей этот прогон не просит, и список пуст ЯВНО: сервер сверяет его длину с числом
        // элементов `detail` в `views`, и «поле не задано» здесь означало бы то же, что пустой
        // список, только молча.
        detailSlotIds: [],
        fixSlotIds: req.fixSlotIds,
          extraInputMediaIds: [],
          autoSplit: false,
        },
        rerunOfRunId: 0,
      }),
  });

  const start = useCallback(() => {
    if (!door.live || !slot || starting) return;
    const silhouette = SILHOUETTE_VIEWS.includes(
      (slot.ref.viewKey ?? '') as (typeof SILHOUETTE_VIEWS)[number],
    );
    const fixTargets = silhouette ? [slot.ref.viewKey as string] : [];
    const fixSlotIds = silhouette ? [] : [slot.ref.slotId ?? 0];
    const fingerprint = JSON.stringify([techCardId, baseMediaId, fixTargets, fixSlotIds]);
    if (ledger.current?.fingerprint !== fingerprint) {
      ledger.current = { fingerprint, id: newClientRequestId() };
    }
    setStarting(true);
    setRefusal(null);
    startMutation
      .mutateAsync({ clientRequestId: ledger.current.id, fixTargets, fixSlotIds })
      .then((res) => {
        // The row exists — this intent is spent. The next press, whatever it is, is a new one.
        ledger.current = null;
        if (res.run) setRun(res.run);
        else setRefusal('the server answered without the run row — reload the band to find it.');
        invalidateBand();
      })
      .catch((error: unknown) => {
        setRefusal(startRefusalText(error));
      })
      .finally(() => setStarting(false));
  }, [door.live, slot, starting, techCardId, baseMediaId, startMutation, invalidateBand]);

  // ── watch: GetDesignRun is the contract's own verb for one live row ─────────────────────────

  const runId = run?.id ?? 0;
  const live = !!run && isRunLive(run);
  useEffect(() => {
    if (!active || !runId || !live) return;
    let stopped = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await adminService.GetDesignRun({ runId });
        if (!stopped && res.run) {
          setRun(res.run);
          if (!isRunLive(res.run)) invalidateBand();
        }
      } catch {
        // A missed tick is weather; the next one answers. A run cannot be lost by not being read.
      }
    };
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [active, runId, live, invalidateBand]);

  // ── the arrival: fetch the bytes back and parse them with the one importer ──────────────────

  const donePicture = useMemo(() => {
    if (!run || runStatus(run) !== 'done') return null;
    return (run.pictures ?? []).find((p) => p.media?.id) ?? null;
  }, [run]);

  const doneUrl =
    donePicture?.media?.media?.fullSize?.mediaUrl ||
    donePicture?.media?.media?.compressed?.mediaUrl ||
    '';

  /**
   * Какой файл УЖЕ читается/прочитан — реф, а не `svg` из состояния: свой же `setSvg` менял бы
   * зависимость эффекта, клинап помечал бы живой фетч устаревшим, и `reading` зависал бы null
   * навсегда — с запертой кнопкой приёмки (замерено пробой 26/27 до этого гарда).
   */
  const fetchedFor = useRef(0);
  useEffect(() => {
    if (!active || !donePicture || !doneUrl) return;
    const mediaId = donePicture.media?.id ?? 0;
    if (fetchedFor.current === mediaId) return;
    fetchedFor.current = mediaId;
    setSvg({ mediaId, url: doneUrl, reading: null, fetchFailed: false });
    void (async () => {
      try {
        const text = await (await fetchMediaBlob(doneUrl)).text();
        // Гонки нет: пришедший позже ответ на ДРУГОЙ файл отсеивается сверкой с рефом.
        if (fetchedFor.current === mediaId)
          setSvg({ mediaId, url: doneUrl, reading: importSvg(text), fetchFailed: false });
      } catch {
        if (fetchedFor.current === mediaId)
          setSvg({ mediaId, url: doneUrl, reading: null, fetchFailed: true });
      }
    })();
  }, [active, donePicture, doneUrl]);

  // ── cancel, discard, review ─────────────────────────────────────────────────────────────────

  const cancel = useCallback(() => {
    if (!runId || cancelPending) return;
    setCancelPending(true);
    setRefusal(null);
    adminService
      .CancelDesignRun({ runId })
      .then((res) => {
        if (res.run) setRun(res.run);
        invalidateBand();
      })
      .catch((error: unknown) => {
        setRefusal(
          (error as Error)?.message ||
            'the run could not be cancelled — it may already be past the point of stopping.',
        );
      })
      .finally(() => setCancelPending(false));
  }, [runId, cancelPending, invalidateBand]);

  const discard = useCallback(() => {
    if (runId) dismissed.current.add(runId);
    fetchedFor.current = 0;
    setRun(null);
    setSvg(null);
    setRefusal(null);
  }, [runId]);

  const review = useCallback((next: common_DesignRun) => {
    fetchedFor.current = 0;
    setRefusal(null);
    setSvg(null);
    setRun(next);
  }, []);

  // ── accept: the filing, idempotent per arrived file ─────────────────────────────────────────

  const importLedger = useRef<{ fingerprint: string; id: string } | null>(null);

  const accept = useCallback(
    async (
      plateRatio: number,
    ): Promise<{
      layer: common_DesignEditLayer;
      strokes: VectorStroke[];
      fileUrl: string;
    } | null> => {
      if (!svg || !donePicture || filing) return null;
      // PROVENANCE GUARD, at the moment it matters. The layer will claim «traced from this
      // raster»; a run whose frozen input names another plate must not be filed under this one.
      if (run && !runReadsMedia(run, baseMediaId)) {
        setRefusal(
          'this run read a different plate than the one under the editor — the bench moved before it started. Discard it here; it stays reviewable on its own history row.',
        );
        return null;
      }
      const strokes = svg.reading?.ok ? svg.reading.strokes : [];
      const doc = strokes.length ? writeLayer(strokes, plateRatio) : '';
      const fingerprint = JSON.stringify([techCardId, svg.mediaId]);
      if (importLedger.current?.fingerprint !== fingerprint) {
        importLedger.current = { fingerprint, id: newClientRequestId() };
      }
      setFiling(true);
      setRefusal(null);
      try {
        const res = await adminService.ImportDesignVector({
          techCardId,
          clientRequestId: importLedger.current.id,
          sourceMediaId: svg.mediaId,
          sourcePictureId: base?.id ?? 0,
          origin: 'vectorised',
          baseMediaId,
          strokes: doc,
        });
        importLedger.current = null;
        invalidateBand();
        const layer = res.layer;
        if (!layer?.id) {
          setRefusal('the server filed the layer but answered without it — reload the band.');
          return null;
        }
        return { layer, strokes, fileUrl: svg.url };
      } catch (error) {
        setRefusal(importRefusalText(error));
        return null;
      } finally {
        setFiling(false);
      }
    },
    [svg, donePicture, filing, run, baseMediaId, techCardId, base?.id, invalidateBand],
  );

  // ── the phase, derived ──────────────────────────────────────────────────────────────────────

  const phase: TracePhase = useMemo(() => {
    if (starting) return { k: 'starting' };
    if (run && isRunLive(run)) return { k: 'waiting', run, cancelPending };
    if (run && runStatus(run) === 'done' && donePicture) {
      // Пока байты результата не начали читаться (svg ещё null — эффект выше выставит его на
      // следующем коммите), экран остаётся в ожидании: кадр развилки между «done» и разбором —
      // это мигнувший вопрос, на который никто не отвечал.
      if (svg) return { k: 'arrived', run, svg, filing };
      return { k: 'waiting', run, cancelPending: false };
    }
    return { k: 'fork', reviewRun };
  }, [starting, run, cancelPending, donePicture, svg, filing, reviewRun]);

  // Уход с развилки (вход в редактор, закрытие экрана) уносит и слова прошлого отказа: назавтра
  // они описывали бы вчерашнюю попытку.
  useEffect(() => {
    if (!active) setRefusal(null);
  }, [active]);

  // A run that ended without a usable picture — failed, cancelled, or done-but-empty — speaks
  // through `refusal` and drops back to the fork, where the retry mints a NEW intent.
  useEffect(() => {
    if (!run || isRunLive(run)) return;
    const status = runStatus(run);
    if (status === 'failed') {
      setRefusal(runFailureText(run));
      dismissed.current.add(run.id ?? 0);
      setRun(null);
    } else if (status === 'cancelled') {
      setRefusal('the run was cancelled — nothing was filed on the plate.');
      dismissed.current.add(run.id ?? 0);
      setRun(null);
    } else if (status === 'done' && !donePicture) {
      setRefusal(
        'the run finished but no picture arrived — the history row holds what is known. Nothing was filed.',
      );
      dismissed.current.add(run.id ?? 0);
      setRun(null);
    }
  }, [run, donePicture]);

  return { door, phase, refusal, start, cancel, discard, review, accept };
}
