// THE SEAMS REVIEW (03-SEAMS-DESIGN §5): a fullscreen overlay over the CONSTRUCTION tab where the
// technologist accepts / rejects the engine's seams and connects two edges by hand. Three blocks on
// the grey ground: the header (progress, bulk accept, filter, the honesty line), the SHEET (every
// piece flat, every edge a door) beside the RAIL (the seams grouped by what is left to do), and the
// CONNECT strip in hand mode. Decisions are written to the card as they are made (one row per
// decision, optimistic) and come back through the provider's graph — the ASSEMBLY MAP behind this
// overlay re-reads with them.
//
// Keyboard (§5.3): ↑ / ↓ walk the rows · Enter accept · Backspace reject · f flip · c closure ·
// u undo · h hand mode · Esc closes the words field, then the strip, then the overlay.

import * as Dialog from '@radix-ui/react-dialog';
import { baseModel, POM } from 'lib/pom';
import type { EdgeId, SeamGraph, SkeletonFacts } from 'lib/assembly-skeleton/types';
import type { StoredSeam, StoredSeamDirection } from 'lib/seams';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip } from 'ui/components/chip';
import { Progress } from 'ui/components/progress';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { ViewSwitch, type ViewSwitchOption } from 'ui/components/view-switch';
import { FROZEN_REFUSAL } from '../assembly-fullscreen';
import { ConnectStrip } from './connect-strip';
import { GROUPS, progressWords, type ReviewItem, type SeamGroup } from './review-model';
import {
  flipped,
  reconfirmRow,
  rowFromHand,
  rowFromProposal,
  type AnchorCtx,
} from './seam-actions';
import { SeamRail } from './seam-rail';
import type { RowDoors } from './seam-row';
import { SeamsSheet } from './seams-sheet';
import { useSeamsStore } from './seams-store';
import { useSeamReview, useSeamWrites } from './use-seam-decisions';
import { pieceWords, type RoleWords } from './words';

type Filter = 'all' | 'decide' | 'confirmed' | 'rejected' | 'stale';
const FILTERS = [
  { value: 'all', label: 'all', hint: 'every seam, grouped by what is left to do' },
  { value: 'decide', label: 'to decide', hint: 'the engine’s proposals nobody has decided' },
  { value: 'confirmed', label: 'confirmed', hint: 'seams forced into the graph' },
  { value: 'rejected', label: 'rejected', hint: 'pairs the engine may not sew' },
  { value: 'stale', label: 'stale', hint: 'decisions today’s pattern no longer backs' },
] as const satisfies readonly ViewSwitchOption<Filter>[];

const visibleOf = (f: Filter): ReadonlySet<SeamGroup> =>
  new Set<SeamGroup>(f === 'all' ? GROUPS : f === 'stale' ? ['stale', 'orphan'] : [f]);

/** POM role words of every edge it reads with confidence («shoulder», «armhole»); empty on failure. */
function rolesOf(facts: SkeletonFacts | null, graph: SeamGraph | null): RoleWords {
  const out = new Map<EdgeId, string>();
  if (!facts || !graph) return out;
  try {
    const m = baseModel(facts, graph, '');
    for (const [id, r] of m.roles)
      if (r.confidence >= POM.roleAccept) out.set(id, r.role.replace(/-/g, ' '));
  } catch {
    // The words fall back to «edge 3 of 6»: a role is a courtesy, never a reason to fail.
  }
  return out;
}

type Hand = {
  a: EdgeId[];
  b: EdgeId[];
  direction: StoredSeamDirection;
  /** «connect again» of a stale row: written under its key. */
  replace: StoredSeam | null;
};

export function SeamsReview({
  open,
  onClose,
  cardId,
  frozen,
  title,
  size,
  focus,
}: {
  open: boolean;
  onClose: () => void;
  cardId: number | undefined;
  frozen: boolean;
  /** Style number, or the card name. */
  title: string;
  /** Size code the pieces were read on. */
  size: string;
  /**
   * Open on this seam (the 3D doll's «fix in seams review»): its row is selected; a seam the
   * engine does not give is laid in the connect strip, edges picked, nothing written.
   */
  focus?: { a: EdgeId[]; b: EdgeId[] } | null;
}) {
  const { graph, geoms, review, settling } = useSeamReview();
  // While the provider re-reads (a decision or a pattern edit, 400 ms + an idle read) the graph on
  // screen is the previous one: nothing is anchored on it until the new read lands.
  const rereading = settling;
  const facts = useSeamsStore((s) => s.facts);
  const grainDeg = useSeamsStore((s) => s.grainDeg);
  const unreadable = useSeamsStore((s) => s.unreadable);
  const writes = useSeamWrites(cardId, frozen);
  const showMessage = useSnackBarStore((s) => s.showMessage);
  const roles = useMemo(() => (open ? rolesOf(facts, graph) : new Map()), [open, facts, graph]);

  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hand, setHand] = useState<Hand | null>(null);
  const [dirs, setDirs] = useState<Record<string, StoredSeamDirection>>({});
  const [words, setWords] = useState<{ id: string; kind: 'reject' | 'note' } | null>(null);

  const visible = useMemo(() => visibleOf(filter), [filter]);
  // Rail order: group by group, by number inside a group — the order ↑ / ↓ walk.
  const railItems = useMemo(
    () =>
      review
        ? GROUPS.flatMap((g) => (visible.has(g) ? review.items.filter((it) => it.group === g) : []))
        : [],
    [review, visible],
  );
  const selected = (selectedId && review?.byId.get(selectedId)) || null;
  const hovered = (hoverId && review?.byId.get(hoverId)) || null;

  const ctx: AnchorCtx | null = graph
    ? {
        pieces: graph.pieces,
        grainDeg,
        nameOf: (k) => pieceWords(geoms.get(k), k),
        ...(size ? { size } : {}),
      }
    : null;
  const dirOf = useCallback(
    (it: ReviewItem): StoredSeamDirection => dirs[it.id] ?? it.row?.direction ?? 'reversed',
    [dirs],
  );

  const select = useCallback((it: ReviewItem | null, scroll = true) => {
    setSelectedId(it?.id ?? null);
    if (scroll) setFocusId(it?.id ?? null);
  }, []);
  /** After a decision the next undecided row is selected, so Enter / Backspace keep walking. */
  const advance = (from: ReviewItem) => {
    const rest = railItems.filter((it) => it.group === 'decide' && it.id !== from.id);
    const next = rest.find((it) => it.n > from.n) ?? rest[0] ?? null;
    select(next);
  };

  const gone = () =>
    showMessage('this seam is not on today’s pattern any more — wait for the re-read', 'error');

  /** A write door is shut: released card, the row in flight, or the graph being re-read. */
  const shut = (it?: ReviewItem) => {
    if (frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return true;
    }
    return !!it?.pending || rereading;
  };

  const doors: RowDoors = {
    select: (it) => select(it),
    hover: (it) => setHoverId(it?.id ?? null),
    accept: (it, alt) => {
      if (shut(it)) return;
      const c = alt ?? it.candidate;
      if (!c || !ctx) return;
      const row = rowFromProposal(c, ctx, { status: 'confirmed', direction: dirOf(it) });
      if (!row) return gone();
      void writes.upsert([row], it.id);
      advance(it);
    },
    reject: (it, note) => {
      if (shut(it)) return;
      setWords(null);
      if (!it.candidate || !ctx) return;
      const row = rowFromProposal(it.candidate, ctx, {
        status: 'rejected',
        direction: dirOf(it),
        note,
      });
      if (!row) return gone();
      void writes.upsert([row], it.id);
      advance(it);
    },
    flip: (it) => {
      if (it.group === 'decide') setDirs((d) => ({ ...d, [it.id]: flipped(dirOf(it)) }));
      // Only a confirmed row is rewritten: a stale, rejected or orphan row is re-confirmed, undone
      // or removed — never refreshed on the server by a flip (that would clear its stale flag).
      else if (it.group === 'confirmed' && it.row && !it.pending && !rereading)
        void writes.upsert([{ ...it.row, direction: flipped(it.row.direction) }]);
    },
    closure: (it) => {
      if (shut(it)) return;
      if (it.group !== 'decide' || !it.candidate || !ctx) return;
      const row = rowFromProposal(it.candidate, ctx, {
        status: 'confirmed',
        closure: true,
        direction: dirOf(it),
      });
      if (!row) return gone();
      void writes.upsert([row], it.id);
      advance(it);
    },
    undo: (it) => {
      if (shut(it)) return;
      if (it.row && (it.group === 'confirmed' || it.group === 'rejected'))
        void writes.remove([it.row]);
    },
    note: (it, note) => {
      if (shut(it)) return;
      setWords(null);
      if (it.row) void writes.upsert([{ ...it.row, note: note.trim().slice(0, 255) }]);
    },
    reconfirm: (it) => {
      if (shut(it)) return;
      if (!ctx) return;
      const row = reconfirmRow(it, ctx);
      if (!row) {
        showMessage('it no longer fits today’s pattern — connect it again by hand', 'error');
        return;
      }
      void writes.upsert([row]);
    },
    remove: (it) => {
      if (shut(it)) return;
      if (it.row) void writes.remove([it.row]);
    },
    connectAgain: (it) => {
      if (frozen) return showMessage(FROZEN_REFUSAL, 'error');
      setHand({
        a: [],
        b: [],
        direction: it.row?.direction ?? 'reversed',
        replace: it.row ?? null,
      });
    },
    words: (it, kind) => setWords(it && kind ? { id: it.id, kind } : null),
  };

  const acceptAllSure = () => {
    if (!review || !ctx || shut()) return;
    const rows = review.sure
      .map((it) =>
        it.candidate
          ? rowFromProposal(it.candidate, ctx, { status: 'confirmed', direction: dirOf(it) })
          : null,
      )
      .filter((r): r is StoredSeam => !!r);
    if (rows.length) void writes.upsert(rows);
  };

  const startHand = (first?: EdgeId) => {
    if (frozen) return showMessage(FROZEN_REFUSAL, 'error');
    setWords(null);
    setHand({ a: first ? [first] : [], b: [], direction: 'reversed', replace: null });
  };

  const onEdge = (id: EdgeId, shift: boolean) => {
    if (hand) {
      setHand((h) => {
        if (!h) return h;
        // A picked edge clicked again leaves its side.
        if (h.a.includes(id)) return { ...h, a: h.a.filter((x) => x !== id) };
        if (h.b.includes(id)) return { ...h, b: h.b.filter((x) => x !== id) };
        if (h.a.length === 0) return { ...h, a: [id] };
        if (shift) return h.b.length === 0 ? { ...h, a: [...h.a, id] } : { ...h, b: [...h.b, id] };
        if (h.b.length === 0) return { ...h, b: [id] };
        return { ...h, a: [id], b: [] };
      });
      return;
    }
    // Outside hand mode an edge finds its seam; an edge nobody sews starts a hand connection.
    const owners = railItems.filter((it) => it.a.includes(id) || it.b.includes(id));
    if (owners.length) {
      const cur = owners.findIndex((it) => it.id === selectedId);
      setSelectedId(owners[(cur + 1) % owners.length].id);
      return;
    }
    if (!frozen) startHand(id);
  };

  const connect = () => {
    if (!hand || !ctx || hand.a.length === 0 || hand.b.length === 0 || shut()) return;
    const row = rowFromHand(hand.a, hand.b, geoms, ctx, {
      direction: hand.direction,
      ...(hand.replace ? { seamKey: hand.replace.seamKey, note: hand.replace.note } : {}),
    });
    if (!row) {
      showMessage(
        'these edges cannot be anchored — pick whole edges of a contoured piece',
        'error',
      );
      return;
    }
    void writes.upsert([row]);
    setHand(null);
    setSelectedId(`s:${row.seamKey}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const it = selected;
    const k = e.key;
    // On a focused button Enter / Space already press it; the row keys must not act twice.
    if ((k === 'Enter' || k === ' ') && t.closest('button, [role="button"], a')) return;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (railItems.length === 0) return;
      const i = it ? railItems.findIndex((x) => x.id === it.id) : -1;
      const next = Math.max(0, Math.min(railItems.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
      select(railItems[next]);
      return;
    }
    if (k === 'h') {
      e.preventDefault();
      if (hand) setHand(null);
      else startHand();
      return;
    }
    if (hand) {
      if (k === 'Enter') {
        e.preventDefault();
        connect();
      } else if (k === 'f') {
        e.preventDefault();
        setHand({ ...hand, direction: flipped(hand.direction) });
      }
      return;
    }
    if (!it || frozen) return;
    if (k === 'Enter' && it.group === 'decide') {
      e.preventDefault();
      doors.accept(it);
    } else if (k === 'Backspace' && it.group === 'decide') {
      e.preventDefault();
      doors.reject(it, '');
    } else if (k === 'f') {
      e.preventDefault();
      doors.flip(it);
    } else if (k === 'c' && it.group === 'decide') {
      e.preventDefault();
      doors.closure(it);
    } else if (k === 'u') {
      e.preventDefault();
      doors.undo(it);
    }
  };

  const focused = useRef(false);
  useEffect(() => {
    if (!focus || focused.current || !review || !graph) return;
    focused.current = true;
    const known = new Set(graph.pieces.flatMap((p) => p.edges.map((e) => e.id)));
    const fa = focus.a.filter((e) => known.has(e));
    const fb = focus.b.filter((e) => known.has(e));
    const meets = (x: readonly EdgeId[], y: readonly EdgeId[]) => x.some((e) => y.includes(e));
    const it = review.items.find(
      (x) => (meets(x.a, fa) && meets(x.b, fb)) || (meets(x.a, fb) && meets(x.b, fa)),
    );
    if (it) {
      setFilter('all');
      select(it);
    } else if (!frozen && fa.length && fb.length)
      setHand({ a: fa, b: fb, direction: 'reversed', replace: null });
  }, [focus, review, graph, frozen, select]);

  const pct = review && review.total > 0 ? (review.decided / review.total) * 100 : 0;
  const sure = review?.sure.length ?? 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          data-seams-review=''
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col gap-gutter bg-pageBg p-4 text-textColor focus:outline-none'
          onEscapeKeyDown={(e) => {
            if (words) {
              e.preventDefault();
              setWords(null);
            } else if (hand) {
              e.preventDefault();
              setHand(null);
            }
          }}
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className='sr-only'>seams — review</Dialog.Title>
          <Dialog.Description className='sr-only'>
            the engine’s proposed seams on the pieces laid flat; accept, reject, or connect two
            edges by hand
          </Dialog.Description>

          <Section
            title='seams'
            question={`— ${title}${size ? ` · size ${size}` : ''} · which edge is sewn to which`}
            action={
              <>
                <Chip
                  quiet
                  onClick={acceptAllSure}
                  disabled={frozen || sure === 0 || rereading}
                  title='confirm every proposal the engine is sure of and reads one way only; likely and check are looked at one by one'
                  data-seams-door='accept-sure'
                >
                  accept all sure ({sure})
                </Chip>
                <Chip
                  quiet
                  selected={!!hand}
                  onClick={() => (hand ? setHand(null) : startHand())}
                  disabled={frozen}
                  data-seams-door='hand'
                >
                  connect by hand · h
                </Chip>
                <Chip quiet onClick={onClose} data-seams-door='close'>
                  close · esc
                </Chip>
              </>
            }
          >
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <div className='w-60 shrink-0'>
                <Progress value={pct} />
              </div>
              <Text component='span' className='tabular-nums' data-seams-progress=''>
                {review ? progressWords(review) : 'reading the pattern…'}
                {settling && review ? ' · re-reading' : ''}
              </Text>
              <div className='ml-auto'>
                <ViewSwitch<Filter>
                  label='show seams'
                  value={filter}
                  onChange={setFilter}
                  options={FILTERS}
                />
              </div>
            </div>
            <Text size='micro' variant='label' component='p'>
              decisions are stored on the card · the engine’s proposals are read from the pattern
              laid flat (seam lines) · a changed DXF marks them stale
              {unreadable > 0
                ? ` · ${unreadable} ${unreadable === 1 ? 'decision was' : 'decisions were'} written by a newer version and are not shown`
                : ''}
            </Text>
            {frozen && (
              <Text size='micro' variant='label' component='p' data-seams-frozen=''>
                {FROZEN_REFUSAL} — every decision is shown, none can be changed
              </Text>
            )}
          </Section>

          <div className='grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-gutter'>
            <Section
              title='pieces'
              question={
                hand
                  ? '— click the edges to connect'
                  : '— every piece laid flat; an edge finds its seam, a free edge starts a connection'
              }
              className='flex min-h-0 flex-col overflow-hidden'
            >
              <div className='min-h-0 flex-1'>
                {graph && review ? (
                  <SeamsSheet
                    pieces={graph.pieces}
                    review={review}
                    roles={roles}
                    visible={visible}
                    active={hand ? null : hovered ?? selected}
                    focusId={focusId}
                    hand={hand}
                    onEdge={onEdge}
                  />
                ) : (
                  <Text size='micro' variant='label' component='p'>
                    reading the pattern…
                  </Text>
                )}
              </div>
            </Section>
            <Section
              title='seams'
              question='— decide each one'
              className='flex min-h-0 flex-col overflow-hidden'
            >
              <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
                {review && (
                  <SeamRail
                    items={railItems}
                    visible={visible}
                    geoms={geoms}
                    roles={roles}
                    selectedId={selectedId}
                    frozen={frozen}
                    rereading={rereading}
                    directionOf={dirOf}
                    wordsFor={(it) => (words?.id === it.id ? words.kind : null)}
                    doors={doors}
                  />
                )}
              </div>
            </Section>
          </div>

          {hand && (
            <Section>
              <ConnectStrip
                pick={hand}
                geoms={geoms}
                roles={roles}
                direction={hand.direction}
                rereading={rereading}
                replacing={
                  hand.replace ? `#${review?.byId.get(`s:${hand.replace.seamKey}`)?.n ?? ''}` : null
                }
                frozen={frozen}
                onConnect={connect}
                onFlip={() => setHand({ ...hand, direction: flipped(hand.direction) })}
                onCancel={() => setHand(null)}
              />
            </Section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
