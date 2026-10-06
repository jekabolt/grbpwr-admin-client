import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  GetDesignBandResponse,
  common_DesignJoinItem,
  common_DesignJoins,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Chip } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { serverSpeaksDesign } from './capability';
import { GROUP_GAP } from './core';
import { useFlatModeDraft } from './flat-input';
import { joinsConfirmed } from './flat-mode';
import {
  EMPTY_JOINS,
  NECK_TYPES,
  VISIBILITY,
  VISIBILITY_GLYPH,
  addAbsence,
  addItem,
  dropAbsence,
  dropItem,
  dropUncertain,
  editAbsence,
  editItem,
  editLayer,
  hasAbsence,
  isNeckItem,
  joinLine,
  joinStructure,
  keepPhotos,
  layersOf,
  parseJoinLine,
  replayEdit,
  visibilityOf,
  type JoinsEdit,
  uniqueAbsences,
} from './joins-model';
import { cardOnScreen, designKeys, rereadBandNow } from './use-design-band';

/**
 * ═══ JOINS — THE CONSTRUCTION THE FLAT IS CHECKED AGAINST (flat route, 05.10) ═══════════════════
 *
 * A group of the INPUT — REFERENCES block, right above the flat's GENERATE: the run freezes this
 * list into its prompt. One compact row per join (`binding NARROW · NP_R → CFN → NP_L · front`, the
 * model's note in its tooltip), the absences as one row of chips, the model's doubts folded behind
 * `? N` in the header. Double-click edits a row (Enter saves, Esc cancels), ✕ drops it, `+ join` adds one.
 * A garment with several layers groups its rows under one line per layer (name, sheer) and gives
 * each row a visibility glyph: — visible · ╌ seen through · ○ hidden.
 *
 * The list is READ from the photos once per card per session on the first visit with photos and no
 * list (`reading…`); `rejoin` reads it again. Photos of two garments → `photos disagree · pick`:
 * the kept ones are stored with the list (`keep_media_ids`) and the server sends only those into the
 * flat run; the others stay in the input, dimmed in the picker, one click from coming back.
 */

/* ─── the read: per card, outliving the step (a read takes ~50 s) ─── */
const asked = new Set<number>();
const reading = new Set<number>();
/** `rev` — the list's rev when the failed read started: a retry that finds another one has it. */
const failed = new Map<number, { why: string; force: boolean; rev: number }>();
/**
 * The read's own request, until IT answers — past the client's wait too: a timed-out read may still
 * run (and land) on the server, so no second read (and no forced one) starts beside it.
 */
const inflight = new Set<number>();
const unsupported = new Set<number>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/* ─── saves in flight, per card: GENERATE waits for them (the run freezes the SAVED list) ─── */
const savingCount = new Map<number, number>();
const markSaving = (card: number, delta: number) => {
  const n = Math.max(0, (savingCount.get(card) ?? 0) + delta);
  if (n) savingCount.set(card, n);
  else savingCount.delete(card);
  bump();
};

/* ─── a row editor holding typed, unsaved text, per card: GENERATE waits (the run reads the SAVED list) ─── */
const unsaved = new Set<number>();
const markUnsaved = (card: number, on: boolean) => {
  if (on === unsaved.has(card)) return;
  if (on) unsaved.add(card);
  else unsaved.delete(card);
  bump();
};

/** A JOINS row editor of this card holds text that is not saved (Enter saves, Esc cancels). */
export function useJoinsUnsaved(card: number): boolean {
  useSyncExternalStore(subscribe, () => version);
  return unsaved.has(card);
}
export const joinsUnsaved = (card: number): boolean => unsaved.has(card);

/* ─── a confirmation the server refused as stale (other photos / note since): per card, at its rev ─── */
const staleConfirm = new Map<number, number>();
/** The server said this rev's confirmation is stale: the pill drops until the list is confirmed again. */
export function markConfirmStale(card: number, rev: number): void {
  staleConfirm.set(card, rev);
  bump();
}
/** The list is confirmed and its confirmation is not known stale. */
export function confirmedNow(card: number, joins: common_DesignJoins | null | undefined): boolean {
  return joinsConfirmed(joins) && staleConfirm.get(card) !== (joins?.rev ?? 0);
}

/** Every joins save of this card has answered (or `ms` passed: false). */
export function joinsSavesSettled(card: number, ms: number): Promise<boolean> {
  if (!savingCount.get(card)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (!savingCount.get(card)) return resolve(true);
      if (Date.now() - started > ms) return resolve(false);
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

const statusOf = (e: unknown) => (e as { status?: number } | null)?.status ?? 0;
const messageOf = (e: unknown) => (e instanceof Error && e.message) || 'the join list did not load';
/** The read takes ~50 s; past these the wait ends and says so (the request may still land). */
const READ_TIMEOUT_MS = 300_000;
const SAVE_TIMEOUT_MS = 20_000;
class TimedOut extends Error {}
class ChangedElsewhere extends Error {}
/** The one line a lost race says: the editor stays, with what was typed. */
const CHANGED = 'list changed — check again';
function timed<T>(ms: number, call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new TimedOut('timed out')), ms);
    call().then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}
const isStale = (e: unknown) =>
  statusOf(e) === 409 || (e instanceof Error && e.message.includes('joins_rev_mismatch'));

function putJoins(qc: QueryClient, card: number, joins: common_DesignJoins | undefined) {
  if (!joins) return;
  qc.setQueryData<GetDesignBandResponse>(designKeys.band(card), (old) =>
    old ? { ...old, joins } : old,
  );
}

async function readJoins(qc: QueryClient, card: number, force: boolean): Promise<void> {
  if (reading.has(card) || inflight.has(card)) return;
  reading.add(card);
  inflight.add(card);
  failed.delete(card);
  bump();
  const rev = qc.getQueryData<GetDesignBandResponse>(designKeys.band(card))?.joins?.rev ?? 0;
  const call = adminService.GenerateDesignJoins({ techCardId: card, force });
  // The request's own end — after a timeout too: a late answer lands, and only then is a retry free.
  void call.then(
    (r) => {
      inflight.delete(card);
      if (!reading.has(card)) {
        putJoins(qc, card, r.joins);
        failed.delete(card);
      }
      bump();
    },
    () => {
      inflight.delete(card);
      bump();
    },
  );
  try {
    const r = await timed(READ_TIMEOUT_MS, () => call);
    putJoins(qc, card, r.joins);
  } catch (e) {
    const s = statusOf(e);
    if (s === 404 || s === 501) unsupported.add(card);
    else if (e instanceof TimedOut) {
      failed.set(card, { why: 'the read took too long', force, rev });
      // It may still land: the next band read shows it.
      void qc.invalidateQueries({ queryKey: designKeys.band(card) });
    } else failed.set(card, { why: messageOf(e), force, rev });
  } finally {
    reading.delete(card);
    bump();
  }
}

/**
 * `joins · retry` after a failed read: re-read the band first — a list that arrived meanwhile (a
 * timed-out read that landed late) is read the non-force way (a free cache hit, never a second
 * paid read over it); otherwise the read is asked again as it was.
 */
async function retryRead(qc: QueryClient, card: number): Promise<void> {
  const f = failed.get(card);
  if (!f || inflight.has(card) || reading.has(card)) return;
  // Locked (`reading…`) from the press: nothing is edited between the band read and the read.
  reading.add(card);
  bump();
  let force = f.force;
  try {
    const fresh = await rereadBandNow(qc, card);
    if (fresh.joins && (fresh.joins.rev ?? 0) !== f.rev) force = false;
  } catch {
    // The band could not be read: a forced read would replace a list nobody has looked at.
    force = false;
  } finally {
    reading.delete(card);
  }
  await readJoins(qc, card, force);
}

/** `was` — the text the editor opened with: a blur closes it only when nothing was typed. */
type Editing = { key: string; value: string; was: string; why?: string } | null;

export function FlatJoins({
  techCardId,
  band,
  disabled,
  thumbOf,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
  /** The picture of a reference by its media id (the input's own map). */
  thumbOf: (mediaId: number) => string;
}): JSX.Element | null {
  const qc = useQueryClient();
  const speaks = serverSpeaksDesign();
  const { showMessage } = useSnackBarStore();
  useSyncExternalStore(subscribe, () => version);
  const card = techCardId;
  const isReading = reading.has(card);
  /** A read of this card still runs on the server (maybe past our wait): no second one. */
  const readRunning = inflight.has(card);
  const failure = failed.get(card);

  const [draft, setDraft] = useState<common_DesignJoins | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [picking, setPicking] = useState<Set<number> | null>(null);
  const [askRejoin, setAskRejoin] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  /** «straps & openings» is chosen in the run row: the list must be confirmed before it runs. */
  const strapsMode = useFlatModeDraft(card) === 'straps';

  /** The photos the read is given: references that carry a prompt role. */
  const photos = useMemo(
    () =>
      (band.references ?? [])
        .filter((r) => (r.mediaId ?? 0) > 0 && !!(r.role ?? '').trim())
        .map((r) => r.mediaId ?? 0),
    [band.references],
  );
  const joins = draft ?? band.joins;
  const writesOff = !!disabled || !speaks;
  const locked = writesOff || saving || isReading || readRunning;

  /* An open editor with typed text holds GENERATE (`useJoinsUnsaved`); unmounting drops the text. */
  const dirty = !!editing && editing.value.trim() !== editing.was.trim();
  useEffect(() => {
    markUnsaved(card, dirty);
  }, [card, dirty]);
  useEffect(() => () => markUnsaved(card, false), [card]);

  /* The first visit with photos and no list reads it — once per card per session. */
  useEffect(() => {
    if (writesOff || band.joins || photos.length === 0 || asked.has(card)) return;
    asked.add(card);
    void readJoins(qc, card, false);
  }, [writesOff, band.joins, photos.length, card, qc]);

  if (unsupported.has(card)) return null;

  /**
   * One edit, written under CAS; a stale rev re-reads the band and applies the SAME edit once more —
   * only when its row reads on the fresh list as it did (`replayEdit`): a row gone, rewritten
   * elsewhere, or an edit that would change nothing keeps the editor open: «list changed — check
   * again». `confirm` (the `confirm joins` door) marks the saved rev confirmed — and is NEVER retried
   * on a stale rev: the fresh list is one the designer has not looked at, so it is not theirs to confirm.
   */
  const apply = async (edit: JoinsEdit, quiet = false, confirm = false): Promise<string | null> => {
    const base = band.joins ?? EMPTY_JOINS;
    const next = edit(base);
    setDraft(next);
    setSaving(true);
    markSaving(card, 1);
    try {
      let saved: common_DesignJoins | undefined;
      try {
        saved = (
          await timed(SAVE_TIMEOUT_MS, () =>
            adminService.SetDesignJoins({
              techCardId: card,
              joins: next,
              expectedRev: base.rev ?? 0,
              confirm,
            }),
          )
        ).joins;
      } catch (e) {
        if (!isStale(e)) throw e;
        if (confirm) throw new ChangedElsewhere(CHANGED);
        const fresh = (await rereadBandNow(qc, card)).joins ?? EMPTY_JOINS;
        const again = replayEdit(edit, base, fresh);
        if (!again) throw new ChangedElsewhere(CHANGED);
        setDraft(again);
        saved = (
          await timed(SAVE_TIMEOUT_MS, () =>
            adminService.SetDesignJoins({
              techCardId: card,
              joins: again,
              expectedRev: fresh.rev ?? 0,
              confirm: false,
            }),
          )
        ).joins;
      }
      putJoins(qc, card, saved);
      void qc.invalidateQueries({ queryKey: designKeys.band(card) });
      return null;
    } catch (e) {
      void qc.invalidateQueries({ queryKey: designKeys.band(card) });
      const why =
        e instanceof TimedOut
          ? 'not saved — the save took too long'
          : e instanceof ChangedElsewhere
            ? e.message
            : isStale(e)
              ? 'not saved — the list changed elsewhere twice'
              : `not saved — ${messageOf(e)}`;
      if (!quiet && cardOnScreen(card)) showMessage(why, 'error');
      return why;
    } finally {
      markSaving(card, -1);
      setDraft(null);
      setSaving(false);
    }
  };

  const commit = (key: string, value: string, item?: common_DesignJoinItem) => {
    const text = value.trim();
    const was = editing?.was ?? '';
    /* A failed save keeps the editor open with what was typed and the reason under it. */
    const save = (edit: JoinsEdit) =>
      void apply(edit, true).then((why) => setEditing(why ? { key, value, was, why } : null));
    const refuse = (why: string) => setEditing({ key, value, was, why });
    // A row gone from the stored list (a lost race): its typed line is added as a new one on Enter.
    if (
      key.startsWith('layer:') &&
      !layersOf(band.joins).some((l) => `layer:${l.index ?? 0}` === key)
    )
      return refuse(CHANGED);
    if (key.startsWith('abs:') && hasAbsence(band.joins, key.slice(4))) {
      const old = key.slice(4);
      if (!text) return save(dropAbsence(old));
      if (!/^(no|not|none|nothing|without|never|zero)\b/i.test(text))
        return refuse('an absence starts with “no”');
      return save(editAbsence(old, text));
    }
    if (key.startsWith('layer:')) {
      const index = Number(key.slice(6));
      const name = layersOf(band.joins).find((l) => (l.index ?? 0) === index)?.name ?? '';
      if (name !== was) return setEditing({ key, value, was: name, why: CHANGED });
      return save(editLayer(index, { name: text }));
    }
    if (item) {
      // The row was rewritten elsewhere while the editor was open (a band refetch landed): the typed
      // line was made against the old one — say so, once; Enter again saves it over the new row.
      if (joinLine(item) !== was)
        return setEditing({ key, value, was: joinLine(item), why: CHANGED });
      // The structure left as it was: only the note changed (also how an opening is edited).
      const head = joinStructure(item);
      if (text === head || text.startsWith(`${head} — `)) {
        const note = text === head ? '' : text.slice(head.length + 3).trim();
        return save(editItem(item.id ?? '', { text: note }));
      }
      const parsed = parseJoinLine(text);
      if (parsed.kind !== 'item')
        return refuse(parsed.kind === 'refused' ? parsed.why : 'a join is not an absence');
      return save(editItem(item.id ?? '', parsed.patch));
    }
    // `+ join`
    const parsed = parseJoinLine(text);
    if (parsed.kind === 'refused') return refuse(parsed.why);
    return save(parsed.kind === 'absence' ? addAbsence(parsed.text) : addItem(parsed.patch));
  };

  const editor = (key: string, item?: common_DesignJoinItem) =>
    editing?.key === key ? (
      <span className='block min-w-0 flex-1'>
        <Input
          autoFocus
          aria-label={key === 'new' ? 'new join' : 'edit join'}
          value={editing.value}
          placeholder={
            key === 'new' ? 'binding NP_R → CFN → NP_L — note · or · no back neckline' : ''
          }
          disabled={saving}
          className='min-h-[22px] py-0.5'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setEditing({ key, value: e.target.value, was: editing.was })
          }
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(key, editing.value, item);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(null);
            }
          }}
          /* A blur closes an untouched editor only — typed text is never dropped silently. */
          onBlur={() => !saving && editing.value === editing.was && setEditing(null)}
        />
        {editing.why && (
          <Text size='micro' component='span' className='mt-0.5 block text-error'>
            {editing.why}
          </Text>
        )}
      </span>
    ) : null;

  const startEdit = (key: string, value: string) =>
    !locked && setEditing({ key, value, was: value });

  const row = (
    key: string,
    body: ReactNode,
    value: string,
    onDrop: (() => void) | null,
    opts: {
      lead?: ReactNode;
      item?: common_DesignJoinItem;
      question?: boolean;
      trail?: ReactNode;
    } = {},
  ) => (
    <div key={key} data-join-row={key} className='flex min-w-0 items-baseline gap-2 py-1'>
      {opts.lead}
      {editor(key, opts.item) ?? (
        <span
          role={locked || opts.question ? undefined : 'button'}
          tabIndex={locked || opts.question ? undefined : 0}
          className={cn('min-w-0 flex-1 truncate', !locked && !opts.question && 'cursor-text')}
          title={opts.question ? value : `${value} · double-click to edit`}
          onDoubleClick={opts.question ? undefined : () => startEdit(key, value)}
          onKeyDown={
            opts.question
              ? undefined
              : (e) => {
                  if (e.key === 'Enter') startEdit(key, value);
                }
          }
        >
          {body}
        </span>
      )}
      {editing?.key !== key && opts.trail}
      {onDrop && !writesOff && editing?.key !== key && (
        <button
          type='button'
          aria-label={opts.question ? 'dismiss' : 'remove'}
          title={opts.question ? 'clear' : 'remove'}
          disabled={locked}
          onClick={onDrop}
          className='shrink-0 text-micro text-labelColor hover:text-textColor disabled:text-textInactiveColor'
        >
          ✕
        </button>
      )}
    </div>
  );

  const items = joins?.items ?? [];
  const layers = layersOf(joins);
  const layered = layers.length > 1;

  const itemRow = (it: common_DesignJoinItem) => {
    const id = it.id ?? '';
    const vis = visibilityOf(it);
    const nextVis = VISIBILITY[(VISIBILITY.indexOf(vis) + 1) % VISIBILITY.length];
    return row(
      `item:${id}`,
      /* The note is the row's tooltip and part of its edit line — never printed under it. */
      joinStructure(it),
      joinLine(it),
      () => void apply(dropItem(id)),
      {
        item: it,
        trail: isNeckItem(it) ? (
          /* THE NECK SHAPE — the server's CHECK sentence names it («a HIGH CREW neck, NOT a V»). */
          <select
            data-join-neck={id}
            aria-label='neck shape'
            title='neck shape'
            value={
              NECK_TYPES.includes((it.type ?? '') as (typeof NECK_TYPES)[number]) ? it.type : ''
            }
            disabled={locked}
            onChange={(e) => void apply(editItem(id, { type: e.target.value }))}
            className='shrink-0 cursor-pointer appearance-none border-0 bg-transparent px-0 text-micro uppercase tracking-label text-labelColor underline hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:cursor-default disabled:no-underline'
          >
            <option value=''>shape ▾</option>
            {NECK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : undefined,
        lead: layered ? (
          <button
            type='button'
            data-join-visibility={vis}
            aria-label={`${vis} — make it ${nextVis}`}
            title={`${vis} · click: ${nextVis}`}
            disabled={locked}
            onClick={() => void apply(editItem(id, { visibility: nextVis }))}
            className='w-3 shrink-0 text-center text-labelColor hover:text-textColor disabled:cursor-default'
          >
            {VISIBILITY_GLYPH[vis]}
          </button>
        ) : undefined,
      },
    );
  };

  const groups: ReactNode[] = [];
  if (layered) {
    const known = new Set(layers.map((l) => l.index ?? 0));
    for (const layer of layers) {
      const index = layer.index ?? 0;
      const own = items.filter((it) =>
        index === 0 ? !known.has(it.layer ?? 0) || (it.layer ?? 0) === 0 : it.layer === index,
      );
      const key = `layer:${index}`;
      groups.push(
        <div key={key} data-join-layer={index}>
          <div className='flex min-w-0 items-baseline gap-2 border-b border-hairline py-1'>
            <button
              type='button'
              data-join-sheer={layer.sheer ? 'sheer' : 'opaque'}
              aria-pressed={!!layer.sheer}
              title={layer.sheer ? 'sheer · click: opaque' : 'opaque · click: sheer'}
              disabled={locked}
              onClick={() => void apply(editLayer(index, { sheer: !layer.sheer }))}
              className='shrink-0 text-micro uppercase tracking-label text-labelColor hover:text-textColor disabled:cursor-default'
            >
              {layer.sheer ? '● sheer' : '○ opaque'}
            </button>
            {editor(key) ?? (
              <span
                role={locked ? undefined : 'button'}
                tabIndex={locked ? undefined : 0}
                className='min-w-0 flex-1 truncate text-micro font-bold uppercase tracking-label'
                title='double-click to rename'
                onDoubleClick={() => startEdit(key, layer.name ?? '')}
                onKeyDown={(e) => e.key === 'Enter' && startEdit(key, layer.name ?? '')}
              >
                {layer.name || `layer ${index}`}
                {layer.face && (
                  <Text size='micro' variant='label' component='span' className='font-normal'>
                    {' '}
                    · {layer.face}
                  </Text>
                )}
              </span>
            )}
          </div>
          <div className='divide-y divide-hairline'>{own.map(itemRow)}</div>
        </div>,
      );
    }
  } else if (items.length) {
    groups.push(
      <div key='items' className='divide-y divide-hairline'>
        {items.map(itemRow)}
      </div>,
    );
  }

  const absences = uniqueAbsences(joins?.absences);
  const uncertain = joins?.uncertain ?? [];
  /** An open editor whose row is no longer on the list: it stays, under the rows, with its line. */
  const orphan =
    !!editing &&
    editing.key !== 'new' &&
    !items.some((it) => `item:${it.id ?? ''}` === editing.key) &&
    !absences.some((a) => `abs:${a}` === editing.key) &&
    !(layered && layers.some((l) => `layer:${l.index ?? 0}` === editing.key));
  const anyRows = items.length + absences.length + (questionsOpen ? uncertain.length : 0) > 0;

  /* ─── photos disagree · pick ─── */
  const cons = joins?.consistency;
  const disagree = !!joins && !!cons && cons.consistent === false && (cons.groups ?? []).length > 1;
  const kept = cons?.keepMediaIds ?? [];
  /** The designer has picked (the model's own `keep` is only its suggestion). */
  const settled = disagree && kept.length > 0 && !!joins?.edited;

  /* The pick is stored with the list (keep_media_ids) and nothing else: the server reads only the
     kept photos into the flat run. No role is touched — un-picking brings a photo straight back. */
  const savePick = async (ids: Set<number>) => {
    const keep = [...ids];
    if (!keep.length) return;
    if (!(await apply(keepPhotos(keep)))) setPicking(null);
  };

  const picker = picking && cons && (
    <div data-joins-pick='' className='space-y-2 py-1'>
      {(cons.groups ?? []).map((g, gi) => {
        const ids = (g.mediaIds ?? []).filter((id) => id > 0);
        const all = ids.length > 0 && ids.every((id) => picking.has(id));
        return (
          <div key={gi} className='flex min-w-0 items-center gap-2'>
            {ids.map((id) => {
              const on = picking.has(id);
              const url = thumbOf(id);
              return (
                <button
                  key={id}
                  type='button'
                  aria-pressed={on}
                  title={on ? 'kept · click: leave out' : 'left out · click: keep'}
                  onClick={() => {
                    const next = new Set(picking);
                    if (on) next.delete(id);
                    else next.add(id);
                    setPicking(next);
                  }}
                  className={cn(
                    'size-12 shrink-0 border bg-bgColor',
                    on ? 'border-2 border-textColor' : 'border-borderColor opacity-40',
                  )}
                >
                  {url ? (
                    <img src={url} alt='' className='size-full object-contain' />
                  ) : (
                    <Text size='micro' variant='label' component='span'>
                      #{id}
                    </Text>
                  )}
                </button>
              );
            })}
            <button
              type='button'
              aria-pressed={all}
              onClick={() => {
                const next = new Set(picking);
                ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
                setPicking(next);
              }}
              className={cn(
                'min-w-0 truncate text-left text-micro',
                all ? 'text-textColor' : 'text-labelColor hover:text-textColor',
              )}
              title={g.what}
            >
              {g.what || `garment ${gi + 1}`}
            </button>
          </div>
        );
      })}
      <div className='flex items-center gap-3'>
        <button
          type='button'
          data-joins-keep=''
          disabled={locked || picking.size === 0}
          onClick={() => void savePick(picking)}
          className='text-micro uppercase tracking-label underline disabled:text-textInactiveColor'
        >
          keep {picking.size}
        </button>
        <button
          type='button'
          onClick={() => setPicking(null)}
          className='text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
        >
          cancel
        </button>
      </div>
    </div>
  );

  const rejoin = () => (joins?.edited ? setAskRejoin(true) : void readJoins(qc, card, true));

  const status = (
    <span className='flex items-center gap-1' data-joins-status=''>
      {isReading ? (
        <span data-joins-reading=''>
          <Pill tone='mut'>reading…</Pill>
        </span>
      ) : saving ? (
        <Pill tone='mut'>saving</Pill>
      ) : failure ? (
        <button
          type='button'
          title={failure.why}
          disabled={writesOff || readRunning}
          onClick={() => void retryRead(qc, card)}
          data-joins-retry=''
        >
          <Pill tone={readRunning ? 'mut' : 'warn'}>
            {readRunning ? 'still reading' : 'joins · retry'}
          </Pill>
        </button>
      ) : null}
      {uncertain.length > 0 && (
        <button
          type='button'
          data-joins-doubts={uncertain.length}
          aria-expanded={questionsOpen}
          title={questionsOpen ? 'hide the open questions' : 'what the photos could not tell'}
          onClick={() => setQuestionsOpen((v) => !v)}
        >
          <Pill tone='mut'>? {uncertain.length}</Pill>
        </button>
      )}
      {disagree && !isReading && (
        <button
          type='button'
          data-joins-disagree=''
          title={cons?.note || 'the photos show more than one garment'}
          disabled={writesOff}
          onClick={() => setPicking(picking ? null : new Set(kept.length ? kept : photos))}
          aria-expanded={!!picking}
        >
          <Pill tone={settled ? 'mut' : 'attention'}>
            {settled ? `${kept.length} photos kept · pick` : 'photos disagree · pick'}
          </Pill>
        </button>
      )}
      {/* STRAPS & OPENINGS RUNS ONLY ON A CONFIRMED LIST — the door saves it as is, confirmed. */}
      {strapsMode &&
        !!joins &&
        !isReading &&
        (confirmedNow(card, joins) ? (
          <span data-joins-confirmed=''>
            <Pill tone='ok'>confirmed</Pill>
          </span>
        ) : (
          !writesOff &&
          items.length + absences.length > 0 && (
            <button
              type='button'
              data-joins-confirm=''
              /* An open editor holds an unsaved line: the list on screen is not the one stored. */
              disabled={locked || editing !== null}
              title='the list is right — straps & openings may run on it'
              onClick={() => void apply((j) => j, false, true)}
            >
              <Pill tone='attention'>confirm joins</Pill>
            </button>
          )
        ))}
      {!writesOff && !isReading && (photos.length > 0 || !!joins) && (
        <button
          type='button'
          data-joins-rejoin=''
          disabled={locked}
          title='read the photos again'
          onClick={rejoin}
        >
          <Pill tone='mut'>rejoin</Pill>
        </button>
      )}
    </span>
  );

  return (
    <div data-flat-joins='' data-joins-rev={joins?.rev ?? 0}>
      <GroupLabel flush className={GROUP_GAP} action={status}>
        joins
      </GroupLabel>
      {picker}
      <div className='divide-y divide-hairline'>
        {groups}
        {/* ABSENCES — one wrapping row of chips: ✕ drops, double-click edits. */}
        {absences.length > 0 && (
          <div data-joins-absences='' className='flex flex-wrap items-center gap-1 py-1.5'>
            {absences.map((a) => {
              const key = `abs:${a}`;
              return editing?.key === key ? (
                <span key={key} className='w-64'>
                  {editor(key)}
                </span>
              ) : (
                <Chip
                  key={key}
                  data-joins-absence={a}
                  title={locked ? a : `${a} · double-click to edit`}
                  onDoubleClick={() => startEdit(key, a)}
                  onRemove={writesOff ? undefined : () => void apply(dropAbsence(a))}
                  disabled={locked}
                  className='normal-case'
                >
                  {a}
                </Chip>
              );
            })}
          </div>
        )}
        {/* DOUBTS — folded behind `? N` in the header. */}
        {questionsOpen && uncertain.length > 0 && (
          <div data-joins-questions='' className='divide-y divide-hairline text-labelColor'>
            {uncertain.map((u) =>
              row(
                `q:${u}`,
                <Text size='micro' variant='label' component='span'>
                  ? {u}
                </Text>,
                u,
                () => void apply(dropUncertain(u)),
                { question: true },
              ),
            )}
          </div>
        )}
      </div>
      {!writesOff &&
        (editing && (editing.key === 'new' || orphan) ? (
          <div
            data-joins-orphan={orphan ? '' : undefined}
            className={cn('flex min-w-0 items-baseline gap-2 py-1', anyRows && 'mt-4')}
          >
            {editor(editing.key)}
          </div>
        ) : (
          <button
            type='button'
            data-joins-add=''
            disabled={locked}
            onClick={() => setEditing({ key: 'new', value: '', was: '' })}
            className={cn(
              'flex w-full items-center border border-dashed border-borderColor bg-bgColor px-2 py-1.5 text-micro uppercase tracking-label text-labelColor hover:border-textColor hover:text-textColor disabled:hover:border-borderColor disabled:hover:text-labelColor',
              anyRows && 'mt-4',
            )}
          >
            + join
          </button>
        ))}
      <ConfirmationModal
        open={askRejoin}
        onOpenChange={(open) => !open && setAskRejoin(false)}
        onCancel={() => setAskRejoin(false)}
        onConfirm={() => {
          setAskRejoin(false);
          void readJoins(qc, card, true);
        }}
        title='rejoin'
        confirmLabel='read again'
        width='sm'
      >
        <Text size='control'>The edited list is replaced by a new read of the photos.</Text>
      </ConfirmationModal>
    </div>
  );
}
