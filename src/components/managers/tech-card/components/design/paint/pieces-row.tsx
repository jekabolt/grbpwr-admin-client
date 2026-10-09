import type { common_DesignPartsPieces } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

/**
 * ═══ PIECES — THE CLOSED NAMES OF PARTS (M6, tmp/plans/flat-consistency 107) ═══════════════════
 *
 * The labeller names the regions only from this list. The server reads it once from the accepted
 * FRONT/BACK flats (never the photos, never the join list); the designer corrects it here, once, as
 * chips: click a name to rename it, ✕ to drop it, `+ piece` to add one, `save pieces` to keep the
 * list (the parts are then named again under it). A later read of changed flats never writes over a
 * saved list: it waits on the line below as `new read` until the designer takes it or keeps theirs.
 *
 * One input at a time, sized as a chip (owner: inputs in a row are one size).
 */

/** A name as the server stores it: lowercase, single spaces. */
export const pieceName = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const RESERVED = /^(opening|openings|unnamed)$|^opening /;
const MAX_RUNES = 40;

/** Why a name cannot stand ('' = it can). */
export function pieceRefusal(name: string, others: readonly string[]): string {
  if (!name) return '';
  if (RESERVED.test(name)) return 'openings and unnamed regions are not pieces';
  if ([...name].length > MAX_RUNES) return `at most ${MAX_RUNES} characters`;
  if (others.includes(name)) return 'already in the list';
  return '';
}

/** The read's names against the list: what it would add and what it would drop. */
export function proposalDiff(list: readonly string[], read: readonly string[]) {
  return {
    added: read.filter((n) => !list.includes(n)),
    dropped: list.filter((n) => !read.includes(n)),
  };
}

/* One line = a fixed head, the chips wrapping in the middle, the actions pinned top-right. */
const LINE = 'flex items-start gap-2';
const HEAD = 'w-16 shrink-0 pt-px uppercase';
const CHIPS = 'flex min-w-0 flex-1 flex-wrap items-center gap-1';
const ACTIONS = 'flex shrink-0 items-center gap-1';

const namesOf = (p: { pieces?: { name?: string }[] } | undefined): string[] =>
  (p?.pieces ?? []).map((x) => x.name ?? '').filter(Boolean);

function PieceInput({
  initial,
  others,
  onCommit,
  onCancel,
}: {
  initial: string;
  others: readonly string[];
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const name = pieceName(value);
  const refusal = pieceRefusal(name, others);
  const commit = () => (name && !refusal ? onCommit(name) : onCancel());
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by the click that asked for it
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={commit}
      size={Math.max(10, value.length + 1)}
      maxLength={MAX_RUNES + 10}
      aria-label='piece name'
      aria-invalid={!!refusal || undefined}
      title={refusal || 'Enter keeps it · Esc leaves it'}
      data-paint-piece-input=''
      // A chip's box and type, so the row keeps one height while a name is typed.
      className='border border-textColor bg-bgColor px-[7px] py-px text-micro uppercase tracking-pill text-textColor outline-none aria-[invalid=true]:border-error'
    />
  );
}

export function PiecesRow({
  pieces,
  hidden,
  disabled,
  naming,
  onSave,
  onNameAgain,
  canNameAgain,
  onDirty,
}: {
  pieces: common_DesignPartsPieces;
  /** Folded away by `rename parts`: still mounted, so an unsaved draft survives the fold. */
  hidden?: boolean;
  disabled?: boolean;
  /** The labeller is answering: a save now would be named after it. */
  naming?: boolean;
  /** Saves the whole list on `expectedRev` — the rev the draft was made on (CAS). */
  onSave: (names: string[], expectedRev: number, settle?: boolean) => Promise<void>;
  onNameAgain: () => void;
  canNameAgain: boolean;
  /** The draft differs from the saved list (the header says `unsaved`). */
  onDirty?: (dirty: boolean) => void;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const saved = useMemo(() => namesOf(pieces), [pieces]);
  const rev = pieces.rev ?? 0;
  const [draft, setDraft] = useState<string[]>(saved);
  /** The server's names the draft was made from: «edited» is measured against THEM, not the list now. */
  const [madeFrom, setMadeFrom] = useState<string[]>(saved);
  /** The rev the draft was made on; null = after a refused save, the designer saves over the list now. */
  const [base, setBase] = useState<number | null>(rev);
  const [editing, setEditing] = useState(-1); // index being renamed; draft.length = the new one
  const [busy, setBusy] = useState(false);
  const key = (names: readonly string[]) => names.join('\n');
  // M10: a read that moves the list under an untouched row is not an edit. Measured against the list
  // now, the old names looked edited, so the row stayed on them under a false «unsaved» (and its save
  // would have been refused, then written back over the new read).
  const edited = key(draft) !== key(madeFrom);
  const dirty = edited && key(draft) !== key(saved);

  // The server's list moved (a save, a read, another tab): an untouched draft — or one that now says
  // exactly what the server says (its own save landed) — follows it and is made on the new rev; an
  // edited draft keeps its own rev, so its save is refused, never blind. A name being typed is an edit
  // too (Codex M10): the list stays put under an open input, and is taken up once it closes untouched.
  useEffect(() => {
    if ((edited || editing !== -1) && key(draft) !== key(saved)) return;
    setDraft(saved);
    setMadeFrom(saved);
    setBase(rev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key(saved), rev, key(draft), editing]);
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

  const proposal = pieces.proposal;
  const read = namesOf(proposal);
  const diff = proposal ? proposalDiff(saved, read) : null;
  const off = disabled || busy;

  /* A failed save keeps the draft (only `cancel` drops it). A refused rev re-reads the list: the
     designer sees theirs against the new one and saves again over it, or cancels. */
  const save = async (names: string[], expectedRev: number, settle = false) => {
    if (names.length === 0) {
      showMessage('keep at least one piece', 'error');
      return;
    }
    setBusy(true);
    try {
      await onSave(names, expectedRev, settle);
      setEditing(-1);
    } catch (e) {
      const msg = (e instanceof Error && e.message) || 'the pieces were not saved';
      const moved = /rev_mismatch|aborted/i.test(msg);
      if (moved && !settle) setBase(null);
      showMessage(
        moved
          ? 'the pieces changed meanwhile (another tab or a new read); your edit is kept: save again to replace them, or cancel'
          : msg,
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const put = (i: number, name: string) => {
    setDraft((d) => (i >= d.length ? [...d, name] : d.map((x, k) => (k === i ? name : x))));
    setEditing(-1);
  };

  return (
    <div className='space-y-1 pb-2' data-paint-pieces='' hidden={hidden}>
      <div className={LINE}>
        <Text size='micro' variant='label' tracking='label' component='span' className={HEAD}>
          pieces
        </Text>
        <div className={CHIPS}>
          {draft.map((name, i) =>
            editing === i ? (
              <PieceInput
                key={`e${i}`}
                initial={name}
                others={draft.filter((_, k) => k !== i)}
                onCommit={(n) => put(i, n)}
                onCancel={() => setEditing(-1)}
              />
            ) : (
              <Chip
                key={name}
                onClick={() => setEditing(i)}
                onRemove={() => setDraft((d) => d.filter((_, k) => k !== i))}
                disabled={off}
                title={saved.includes(name) ? 'rename · click' : 'not saved yet · click to rename'}
                tone={saved.includes(name) ? 'default' : 'attention'}
                data-paint-piece={name}
              >
                {name}
              </Chip>
            ),
          )}
          {editing === draft.length ? (
            <PieceInput
              initial=''
              others={draft}
              onCommit={(n) => put(draft.length, n)}
              onCancel={() => setEditing(-1)}
            />
          ) : (
            <Chip
              dashed
              onClick={() => setEditing(draft.length)}
              disabled={off}
              title='add a piece the labeller may use'
              data-paint-piece-add=''
            >
              + piece
            </Chip>
          )}
        </div>
        <span className={ACTIONS}>
          {dirty ? (
            <>
              <Button
                variant='underline'
                size='xs'
                onClick={() => void save(draft, base ?? rev)}
                disabled={off || naming}
                title={naming ? 'the parts are being named; save when they land' : undefined}
                data-paint-pieces-save=''
              >
                save pieces
              </Button>
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                onClick={() => {
                  setDraft(saved);
                  setMadeFrom(saved);
                  setBase(rev);
                  setEditing(-1);
                }}
                disabled={busy}
              >
                cancel
              </Button>
            </>
          ) : (
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              onClick={onNameAgain}
              disabled={off || !canNameAgain}
              title='ask the model to name the parts of every side again, from these pieces'
              data-paint-parts-rename=''
            >
              name again
            </Button>
          )}
        </span>
      </div>
      {proposal && diff && (
        <div className={LINE} data-paint-pieces-proposal=''>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className={HEAD}
            title='the flats changed; this is what the model reads from them now'
          >
            new read
          </Text>
          <div className={CHIPS}>
            {diff.added.map((n) => (
              <Pill key={`+${n}`} tone='attention'>
                + {n}
              </Pill>
            ))}
            {diff.dropped.map((n) => (
              <Pill key={`-${n}`} tone='mut'>
                − {n}
              </Pill>
            ))}
            {diff.added.length + diff.dropped.length === 0 && (
              <Text size='micro' variant='label' component='span'>
                the changed flats show the same pieces
              </Text>
            )}
          </div>
          <span className={ACTIONS}>
            <Button
              variant='underline'
              size='xs'
              onClick={() => void save(read, rev, true)}
              disabled={off || dirty}
              title={
                dirty ? 'save or cancel your edit first' : 'use the pieces read from the new flats'
              }
              data-paint-pieces-take=''
            >
              take new read
            </Button>
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              onClick={() => void save(saved, rev, true)}
              disabled={off || dirty}
              title={
                dirty
                  ? 'save or cancel your edit first'
                  : 'keep your pieces; the new read is dropped'
              }
              data-paint-pieces-keep=''
            >
              keep mine
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
