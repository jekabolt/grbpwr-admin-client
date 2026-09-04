import type {
  GetDesignBandResponse,
  common_DesignRun,
  common_DesignRunParams,
} from 'api/proto-http/admin';

import { stampIsSet } from '../visibility';
import { normaliseViewKey, viewLabel } from '../views';

/**
 * WHAT A RUN IS DOING RIGHT NOW — pure readers over `common_DesignRun`, no React, no queries.
 *
 * The rules live here rather than inside the history component because three organs ask the same
 * questions of the same row (the history line, the run panel, the poller), and a status vocabulary
 * spelled three times drifts the first time the server adds a member. `status` is an OPEN string on
 * the wire — `pending | running | done | failed | cancelled` today — so every reader below treats an
 * unknown value as «not one of ours» rather than as `done`.
 */

/** The two statuses that mean the band must keep looking. */
export const LIVE_STATUSES: readonly string[] = ['pending', 'running'];

/**
 * ═══ THIS RUN ANSWERS IN WORDS, NOT IN PICTURES (D-2) ══════════════════════════════════════════
 *
 * `draft_idea` is the one kind of run that produces no file at all: the server executes it
 * synchronously and writes the answer into `output_text`. Everything downstream of this reader
 * exists because the history used to draw it with the picture-run's grammar — reserving a tile
 * while it ran, and then showing a bare line with nothing under it once it finished. Measured on
 * beta, card 38: run 28, `kind = draft_idea`, `requested_outputs = 0`, ZERO rows in
 * `design_picture`, and 2 081 characters in `output_text` that no screen has ever read back.
 *
 * IT IS ASKED BY KIND, NOT BY «HAS NO PICTURES». A picture run that failed also has none, and the
 * two must not collapse: one has nothing to show because it broke, the other because a paragraph
 * is not a picture.
 */
export function isTextRun(run: Pick<common_DesignRun, 'kind'>): boolean {
  return (run.kind ?? '').trim().toLowerCase() === 'draft_idea';
}

/** What a text run actually produced, or empty when it produced nothing (yet). */
export function runOutputText(run: Pick<common_DesignRun, 'outputText'>): string {
  return (run.outputText ?? '').trim();
}

export function runStatus(run: Pick<common_DesignRun, 'status'>): string {
  return (run.status ?? '').trim().toLowerCase();
}

export function isRunLive(run: Pick<common_DesignRun, 'status'>): boolean {
  return LIVE_STATUSES.includes(runStatus(run));
}

/**
 * Asked to stop, but the answer may still arrive AND STILL BE PAID FOR. The contract is explicit
 * that a result landing after this stamp is recorded rather than dropped, so the pill says
 * `cancelling…` and never `cancelled` — the ledger decides which of the two it becomes.
 */
export function isCancelling(
  run: Pick<common_DesignRun, 'status' | 'cancelRequestedAt'>,
): boolean {
  return isRunLive(run) && stampIsSet(run.cancelRequestedAt);
}

/** Does anything on this card still need watching? Drives the poll, and nothing else. */
export function hasLiveRun(band: GetDesignBandResponse): boolean {
  return (band.runs ?? []).some(isRunLive);
}

export function liveRuns(band: GetDesignBandResponse): common_DesignRun[] {
  return (band.runs ?? []).filter(isRunLive);
}

/**
 * HOW MANY TILES TO RESERVE UNDER A RUNNING ROW.
 *
 * `requested_outputs` is the SERVER'S OWN denominator and it is preferred whenever it is stated —
 * the client's arithmetic below is a fallback for a row that predates it, not a second opinion.
 * The fallback repeats the prototype's rule verbatim: a fix asks for one picture, a `one` layout
 * over two or more views comes back as ONE composite, and everything else is one picture per view.
 *
 * ⚠ A TEXT RUN RESERVES NOTHING, AND THIS IS THE FIRST HALF OF D-2. The fallback's last line
 * («everything else is one») answered `1` for `draft_idea`, so a running text draft drew a dashed
 * 4/5 picture frame saying «running 0:07» — a promise of a picture that cannot arrive. Its own
 * `requested_outputs` is 0 on the wire (measured on beta run 28), i.e. the server already says
 * this; the fallback was overruling it because `0` is not `> 0`.
 */
export function expectedTileCount(run: common_DesignRun): number {
  if (isTextRun(run)) return 0;
  const requested = run.requestedOutputs ?? 0;
  if (requested > 0) return requested;
  const views = run.params?.views ?? [];
  const kind = (run.kind ?? '').trim().toLowerCase();
  if (kind === 'flat') {
    // A FIX ASKS FOR ONE PICTURE PER SLOT IT NAMED, not one picture. Reading only the old scalar
    // here returned 1 for every multi-slot fix, so the row reserved one tile and the `2 of 3`
    // denominator under a partial answer was wrong in the direction that hides the loss.
    const fix = fixSelectionOf(run);
    const fixing = fix.views.length + fix.slotIds.length;
    if (fixing) return fixing;
    if ((run.params?.layout ?? '').trim() === 'one' && views.length >= 2) return 1;
    return Math.max(1, views.length);
  }
  if (kind === 'render') return Math.max(1, (run.inputs?.slots ?? []).length);
  return 1;
}

/**
 * The right-hand note of a finished row: how it ended, and — when it ended badly — why.
 *
 * `done · 2 of 3` is not decoration: without the denominator a partial provider answer is
 * indistinguishable from a complete one, and the money was spent either way.
 */
export function runOutcomeNote(run: common_DesignRun): string {
  const status = runStatus(run);
  const delivered = (run.pictures ?? []).length;
  const requested = expectedTileCount(run);
  if (status === 'done') {
    // A TEXT RUN IS NEVER «2 OF 3». Its denominator is `expectedTileCount` = 0 (see above), so the
    // partial-answer clause is unreachable for it by construction rather than by a second `if`.
    return delivered && requested && delivered < requested
      ? `done · ${delivered} of ${requested}`
      : 'done';
  }
  if (status === 'failed') {
    const why = (run.errorCode ?? '').trim() || (run.lastError ?? '').trim();
    return why ? `failed · ${why}` : 'failed';
  }
  /* ОТКАЗ ВИДЕН НЕ ТОЛЬКО У МЁРТВОГО ПРОГОНА, И ЭТО НЕ УКРАШЕНИЕ (S-12).
   *
   * Владелец: «оно 3 раза попробывало и я отключил никаких ошибок я не поулчил». Он смотрел на
   * ЖИВОЙ прогон. Сервер честно писал `error_code` на строку после каждой неудачной попытки и
   * честно слал его сюда — а эта функция отдавала код ТОЛЬКО при статусе `failed`. Живой прогон
   * рисовался голым «pending», отменённый — голым «cancelled», и три HTTP-400 подряд не оставили
   * на экране ни следа.
   *
   * Поэтому код показывается везде, где он есть:
   *   · живой прогон с кодом — это ПОВТОР после неудачи, и слово «retrying» честнее, чем «pending»:
   *     оно говорит, что попытка уже была и чем она кончилась;
   *   · отменённый прогон с кодом — человек оборвал не тишину, а что-то конкретное, и после отмены
   *     он вправе узнать, что именно.
   *
   * Причина берётся тем же порядком, что и у `failed`: машинный код, а если его нет — текст
   * последней ошибки. */
  const why = (run.errorCode ?? '').trim() || (run.lastError ?? '').trim();
  if (status === 'cancelled') return why ? `cancelled · ${why}` : 'cancelled';
  if (isCancelling(run)) return 'cancelling…';
  return why ? `retrying · ${why}` : status;
}

/**
 * THE WHOLE FAILURE TEXT — the provider's own words, uncut, for a surface that can hold a
 * paragraph. `error_code` is the stable machine token; `last_error` is the human tail, and the
 * server caps it at 4 000 characters (`designMaxErrorText`), never at a line.
 */
export function runFailureText(
  run: Pick<common_DesignRun, 'errorCode' | 'lastError'>,
): { code: string; text: string } {
  return { code: (run.errorCode ?? '').trim(), text: (run.lastError ?? '').trim() };
}

/**
 * ═══ THE SAME OUTCOME, CUT TO FIT A PILL — AND THIS IS A WIDTH DEFECT, NOT TIDYING (D-4) ═══════
 *
 * `Pill` is `whitespace-nowrap` by construction: it is a status marker, and a marker that wraps
 * stops being one. `runOutcomeNote` above, however, may return the PROVIDER'S OWN TEXT, and that
 * text is bounded only by the server's `designMaxErrorText` = 4 000 characters. Four thousand
 * characters on one unbreakable line is ~24 000 px of pill — sixteen screens — and because the
 * history's `Section` is a plain block in a `SectionStack`, that width overflows visibly and
 * scrolls THE WHOLE PAGE sideways.
 *
 * IT IS NOT HYPOTHETICAL. `failRun` writes `error_code = nullStr(req.ErrorCode)`, so a worker that
 * reports a failure without a code stores NULL there and the full text is what this reader falls
 * back to. Beta already holds such a tail — run 1 of card 38 carries 1 132 characters of provider
 * JSON in `last_error` — and it stays off the screen today only because that row happens to also
 * carry a code. Measured with that exact string in the stand: page 1 500 px → 6 800 px.
 *
 * SO THE PILL GETS A BOUNDED LINE AND NOTHING IS LOST. Newlines collapse (a pill is one line by
 * definition), the tail is cut at `MAX` with an ellipsis that says so, the full note rides in the
 * `title`, and the untruncated text lives in the run panel, which is a surface that can wrap.
 */
const OUTCOME_CHIP_MAX = 72;

export function runOutcomeChip(run: common_DesignRun): string {
  const note = runOutcomeNote(run).replace(/\s+/g, ' ').trim();
  return note.length > OUTCOME_CHIP_MAX ? `${note.slice(0, OUTCOME_CHIP_MAX).trimEnd()}…` : note;
}

/* ⚠ ЗДЕСЬ ЖИЛ `archiveBlockReason`, И ЕГО СНЕСЛИ ПОТОМУ, ЧТО ОН БЫЛ ЗАПРЕТОМ КЛИЕНТА (J-22).
 *
 * Он копировал предусловия `HideDesignPicture` — «картинка в слоте верстака», «вход живого
 * прогона», «родитель видимого кропа» — и гасил дверь `archive ▸` на любой строке, хоть одна
 * картинка которой под них подходила. Проверено по origin/beta: `ArchiveRun`
 * (`internal/store/design/pictures.go`) — один UPDATE `archived_at` и перечитывание строки, ни
 * одного из этих условий; его собственный комментарий говорит «It does NOT hide the row's
 * pictures». `ArchiveDesignRun` в `apisrv/admin/design_band.go` их тоже не добавляет.
 *
 * Клиент отказывал в том, что сервер разрешает, и на карточке, где лист разрезали или плиту
 * поставили в слот, вместо двери стояло серое слово. Запрет, который клиент назначает сам,
 * расходится с сервером на первом же отказе — верна та же строка, что стоит у снятия детали
 * в `bench.tsx`.
 */

/**
 * The caption of a history line.
 *
 * `from references` is claimed ONLY for a run that is provably the first one on the card. The band
 * pages, so «the oldest row I have been given» is not the same statement as «the oldest row there
 * is» — pass `firstRunId` only when the whole history is on screen, and the caption degrades to
 * `run N` rather than lying about which run started this card.
 */
export function runCaption(run: common_DesignRun, firstRunId?: number | null): string {
  const ask = (run.ask ?? '').trim();
  if (ask) return ask;
  const id = run.id ?? 0;
  if (firstRunId && id && id === firstRunId) return 'from references';
  return id ? `run ${id}` : 'run';
}

/** `front, back · per view` — what was asked for, spoken the way the rest of the band spells views. */
export function viewsLine(params?: common_DesignRunParams | null): string {
  const views = (params?.views ?? []).map((v) => viewLabel(v)).filter(Boolean);
  const layout = (params?.layout ?? '').trim();
  const layoutText =
    layout === 'one' ? 'one picture' : layout === 'per_view' ? 'a picture per view' : layout;
  const left = views.length ? views.join(', ') : '—';
  return layoutText ? `${left} · ${layoutText}` : left;
}

/**
 * WHAT A RUN SAYS IT IS FIXING — the arrays when they carry anything, the older scalar otherwise.
 *
 * ONE SELECTION, TWO ADDRESSES: `fix_targets` names silhouette sides by view key and `fix_slot_ids`
 * names details by their minted slot id, and the contract is explicit that the two are one
 * selection rather than two modes — a fix may name three sides and a cuff in one run.
 *
 * THE ARRAY-THEN-SCALAR ORDER IS THE CONTRACT'S OWN READING RULE, and it is why the scalar was not
 * re-typed as repeated: rows frozen before the arrays state their target in `fix_target`, and
 * re-typing the field would have silently rewritten what those rows say on the wire. Nothing in
 * this client ever WRITES the scalar.
 *
 * IT LIVES HERE, IN THE PURE RUN-READER, and `fix-flow.tsx` imports it rather than keeping a second
 * copy: two places answering «what is this run fixing» in two ways drift the first time one of them
 * learns about a field, and the drift is silent — a fix row that simply stops looking like a fix.
 */
export function fixSelectionOf(run: common_DesignRun): { views: string[]; slotIds: number[] } {
  const views = (run.params?.fixTargets ?? []).map(normaliseViewKey).filter(Boolean);
  const slotIds = (run.params?.fixSlotIds ?? []).filter((id) => (id ?? 0) > 0);
  if (views.length || slotIds.length) return { views, slotIds };
  const scalar = normaliseViewKey(run.params?.fixTarget ?? '');
  return { views: scalar ? [scalar] : [], slotIds: [] };
}

/**
 * `fix: back` — the FIRST silhouette side a run was asked to repair, or empty when it is not a fix.
 * A one-line reader for the callers that have room for one name; anything that has to state the
 * whole of what a run is fixing reads `fixSelectionOf` and says «and 2 more».
 */
export function fixTargetOf(run: common_DesignRun): string {
  return fixSelectionOf(run).views[0] ?? '';
}
