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
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { serverSpeaksDesign } from './capability';
import { GROUP_GAP } from './core';
import {
  EMPTY_JOINS,
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
  joinLine,
  joinStructure,
  keepPhotos,
  layersOf,
  parseJoinLine,
  visibilityOf,
  type JoinsEdit,
} from './joins-model';
import { cardOnScreen, designKeys, rereadBandNow } from './use-design-band';

/**
 * ═══ JOINS — THE CONSTRUCTION THE FLAT IS CHECKED AGAINST (flat route, 05.10) ═══════════════════
 *
 * A group of the INPUT — REFERENCES block, right above the flat's GENERATE: the run freezes this
 * list into its prompt. One compact row per join (`binding NARROW · NP_R → CFN → NP_L · front`, the
 * model's note after it in grey), the absences (`no back neckline`), the model's doubts as grey
 * questions. Double-click edits a row (Enter saves, Esc cancels), ✕ drops it, `+ join` adds one.
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
const failed = new Map<number, { why: string; force: boolean }>();
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

const statusOf = (e: unknown) => (e as { status?: number } | null)?.status ?? 0;
const messageOf = (e: unknown) => (e instanceof Error && e.message) || 'the join list did not load';
/** The read takes ~50 s; past these the wait ends and says so (the request may still land). */
const READ_TIMEOUT_MS = 120_000;
const SAVE_TIMEOUT_MS = 20_000;
class TimedOut extends Error {}
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
  if (reading.has(card)) return;
  reading.add(card);
  failed.delete(card);
  bump();
  try {
    const r = await timed(READ_TIMEOUT_MS, () =>
      adminService.GenerateDesignJoins({ techCardId: card, force }),
    );
    putJoins(qc, card, r.joins);
  } catch (e) {
    const s = statusOf(e);
    if (s === 404 || s === 501) unsupported.add(card);
    else if (e instanceof TimedOut) {
      failed.set(card, { why: 'the read took too long', force });
      // It may still land: the next band read shows it.
      void qc.invalidateQueries({ queryKey: designKeys.band(card) });
    } else failed.set(card, { why: messageOf(e), force });
  } finally {
    reading.delete(card);
    bump();
  }
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
  const failure = failed.get(card);

  const [draft, setDraft] = useState<common_DesignJoins | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [picking, setPicking] = useState<Set<number> | null>(null);
  const [askRejoin, setAskRejoin] = useState(false);

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
  const locked = writesOff || saving || isReading;

  /* The first visit with photos and no list reads it — once per card per session. */
  useEffect(() => {
    if (writesOff || band.joins || photos.length === 0 || asked.has(card)) return;
    asked.add(card);
    void readJoins(qc, card, false);
  }, [writesOff, band.joins, photos.length, card, qc]);

  if (unsupported.has(card)) return null;

  /** One edit, written under CAS; a stale rev re-reads the band and applies the SAME edit once more. */
  const apply = async (edit: JoinsEdit, quiet = false): Promise<string | null> => {
    const base = band.joins ?? EMPTY_JOINS;
    const next = edit(base);
    setDraft(next);
    setSaving(true);
    try {
      let saved: common_DesignJoins | undefined;
      try {
        saved = (
          await timed(SAVE_TIMEOUT_MS, () =>
            adminService.SetDesignJoins({
              techCardId: card,
              joins: next,
              expectedRev: base.rev ?? 0,
            }),
          )
        ).joins;
      } catch (e) {
        if (!isStale(e)) throw e;
        const fresh = (await rereadBandNow(qc, card)).joins ?? EMPTY_JOINS;
        const again = edit(fresh);
        setDraft(again);
        saved = (
          await timed(SAVE_TIMEOUT_MS, () =>
            adminService.SetDesignJoins({
              techCardId: card,
              joins: again,
              expectedRev: fresh.rev ?? 0,
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
          : isStale(e)
            ? 'not saved — the list changed elsewhere twice'
            : `not saved — ${messageOf(e)}`;
      if (!quiet && cardOnScreen(card)) showMessage(why, 'error');
      return why;
    } finally {
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
    if (key.startsWith('abs:')) {
      const old = key.slice(4);
      if (!text) return save(dropAbsence(old));
      if (!/^(no|not|none|nothing|without|never|zero)\b/i.test(text))
        return refuse('an absence starts with “no”');
      return save(editAbsence(old, text));
    }
    if (key.startsWith('layer:')) return save(editLayer(Number(key.slice(6)), { name: text }));
    if (item) {
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
    opts: { lead?: ReactNode; item?: common_DesignJoinItem; question?: boolean } = {},
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
    const note = (it.text ?? '').trim();
    const vis = visibilityOf(it);
    const nextVis = VISIBILITY[(VISIBILITY.indexOf(vis) + 1) % VISIBILITY.length];
    return row(
      `item:${id}`,
      <>
        {joinStructure(it)}
        {note && (
          <Text size='micro' variant='label' component='span'>
            {' '}
            {note}
          </Text>
        )}
      </>,
      joinLine(it),
      () => void apply(dropItem(id)),
      {
        item: it,
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

  const absences = joins?.absences ?? [];
  const uncertain = joins?.uncertain ?? [];
  const anyRows = items.length + absences.length + uncertain.length > 0;

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
          disabled={writesOff}
          onClick={() => void readJoins(qc, card, failure.force)}
          data-joins-retry=''
        >
          <Pill tone='warn'>joins · retry</Pill>
        </button>
      ) : null}
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
        {absences.length > 0 && (
          <div className='divide-y divide-hairline'>
            {absences.map((a) => row(`abs:${a}`, a, a, () => void apply(dropAbsence(a))))}
          </div>
        )}
        {uncertain.length > 0 && (
          <div className='divide-y divide-hairline text-labelColor'>
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
        (editing?.key === 'new' ? (
          <div className={cn('flex min-w-0 items-baseline gap-2 py-1', anyRows && 'mt-4')}>
            {editor('new')}
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
