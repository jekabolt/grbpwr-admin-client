import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';

import { assetLabel, clothShelf } from '../../assets/model';
import { CardPicturePicker } from '../../core/card-picture-picker';
import { cardPictureGroups, countTiles } from '../../core/card-pictures-model';
import { Counter, EmptyState, GROUP_GAP, GROUP_SEAM } from '../../core/organs';
import { PictureTile } from '../../picture-tile';
import { mediaThumb } from '../../render/model';
import { useFocusReturn } from '../focus';

/**
 * ═══ REUSE — ONE DOOR TO EVERY PICTURE THE ADMIN ALREADY HOLDS (C-02) ═══════════════════════════
 *
 * The empty slot above this door IS the library door (`MediaSlot`: click to browse or upload, ⌘V,
 * drop a file), so this door does not offer the library a second time: two buttons for one thing
 * is what the owner asked us to stop doing (the ON MODEL shot strip made the same call before C-06 removed it). What it
 * offers is everything the slot cannot reach by itself:
 *
 *   · this card     the card's pictures, renders and cut pieces — the app's own `CardPicturePicker`
 *   · models        the gallery photographs of every model profile
 *   · fittings      the photographs of this card's fittings
 *   · fabrics       the cloth and pattern pictures on this card's shelf
 *
 * ONE BUTTON, ONE SHORT LIST, THEN THE PICKER. The list says how many pictures each source holds so a
 * person does not open an empty one; a source with nothing is shown, greyed, with the reason. When
 * only one source exists the list is skipped and the picker opens straight away.
 *
 * The pickers keep the studio's pick grammar: pictures chosen by looking, a click takes or drops one,
 * the modal stays open while several are taken, `done` hands them over. `room` caps the pick and
 * `taken` greys what the slots already hold.
 */
export type ReuseSource = 'card' | 'models' | 'fittings' | 'fabrics';

export const REUSE_SOURCES: readonly ReuseSource[] = ['card', 'models', 'fittings', 'fabrics'];

const SOURCE_WORD: Record<ReuseSource, string> = {
  card: 'this card',
  models: 'model gallery',
  fittings: 'fittings',
  fabrics: 'fabrics',
};

export type ReuseDoorProps = {
  /** The design band: needed for this card's pictures and fabrics. Absent → those sources hide. */
  band?: GetDesignBandResponse;
  /** The card id: needed for fittings. Absent → that source hides. */
  techCardId?: number;
  /** Which sources to offer (subset of `REUSE_SOURCES`, in that order). Default: all available. */
  sources?: readonly ReuseSource[];
  /** How many more pictures may be taken. 0 → the door is locked. */
  room: number;
  /** Media ids the slots already hold: shown greyed, not takeable twice. */
  taken?: readonly number[];
  onPick: (media: common_MediaFull[]) => void;
  /** Button text; the owner's references use «Reuse» under a slot, «Reuse an asset» full width. */
  label?: string;
  disabled?: boolean;
};

type GalleryGroup = { key: string; label: string; media: common_MediaFull[] };

/** «12 Aug» from a timestamp; `''` when there is none. */
function dayStamp(stamp?: string | null): string {
  if (!stamp) return '';
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function withPicture(list: readonly (common_MediaFull | undefined)[]): common_MediaFull[] {
  const seen = new Set<number>();
  const out: common_MediaFull[] = [];
  for (const m of list) {
    const id = m?.id ?? 0;
    if (!m || id <= 0 || seen.has(id) || !mediaThumb(m)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

/* ── the three sources the card picker does not cover ───────────────────────────────────────── */

type Loaded = { groups: GalleryGroup[]; loading: boolean; failed: boolean };

function useModelGroups(on: boolean): Loaded {
  // Mounted only while the list or the picker is open, so the query waits for a person to ask.
  const models = useAllModels();
  return useMemo(() => {
    if (!on) return { groups: [], loading: false, failed: false };
    const groups = (models.data ?? [])
      .map((m) => ({
        key: `model-${m.id ?? 0}`,
        label: (m.model?.name ?? '').trim() || `model ${m.id ?? 0}`,
        media: withPicture([...(m.media ?? []), m.thumbnail]),
      }))
      .filter((g) => g.media.length > 0);
    return { groups, loading: models.isLoading, failed: models.isError };
  }, [on, models.data, models.isLoading, models.isError]);
}

function useFittingGroups(techCardId: number | undefined): Loaded {
  const fittings = useTechCardFittings(techCardId);
  const { dictionary } = useDictionary();
  return useMemo(() => {
    const sizes = dictionary?.sizes ?? [];
    const sizeName = (id: number) =>
      (sizes.find((s) => s.id === id)?.name ?? '').trim() || (id > 0 ? `size ${id}` : '');
    const groups = (fittings.data ?? [])
      .map((row) => {
        const f = row.fitting;
        const day = dayStamp(f?.fittingDate);
        const size = (f?.sizes ?? [])
          .map((s) => sizeName(s.sizeId ?? 0))
          .filter(Boolean)
          .join(' · ');
        return {
          key: `fitting-${row.id ?? 0}`,
          label: [day ? `fitting on ${day}` : `fitting ${row.id ?? 0}`, size]
            .filter(Boolean)
            .join(' · '),
          media: withPicture(row.media ?? []),
        };
      })
      .filter((g) => g.media.length > 0);
    return {
      groups,
      loading: fittings.isLoading && !!techCardId,
      failed: fittings.isError,
    };
  }, [fittings.data, fittings.isLoading, fittings.isError, dictionary?.sizes, techCardId]);
}

function fabricGroups(band: GetDesignBandResponse | undefined): GalleryGroup[] {
  if (!band) return [];
  const media = withPicture(clothShelf(band).map((a) => a.media));
  return media.length ? [{ key: 'fabrics', label: 'fabrics and patterns', media }] : [];
}

function fabricName(band: GetDesignBandResponse | undefined): Map<number, string> {
  const out = new Map<number, string>();
  for (const a of band ? clothShelf(band) : []) {
    if ((a.mediaId ?? 0) > 0) out.set(a.mediaId ?? 0, assetLabel(a));
  }
  return out;
}

const count = (groups: readonly GalleryGroup[]) => groups.reduce((n, g) => n + g.media.length, 0);

/* ── the gallery picker (models / fittings / fabrics) ─────────────────────────────────────────── */

function GalleryPicker({
  open,
  onOpenChange,
  title,
  groups,
  loading,
  failed,
  empty,
  names,
  room,
  taken,
  onPick,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  groups: readonly GalleryGroup[];
  loading: boolean;
  failed?: boolean;
  empty: string;
  names?: Map<number, string>;
  room: number;
  taken: ReadonlySet<number>;
  onPick: (media: common_MediaFull[]) => void;
  onCloseAutoFocus?: (event: Event) => void;
}): JSX.Element {
  const [picked, setPicked] = useState<number[]>([]);
  // A pick abandoned by closing the modal is not waiting the next time the door opens.
  const wasOpen = useRef(open);
  if (wasOpen.current !== open) {
    wasOpen.current = open;
    if (!open && picked.length) setPicked([]);
  }
  const byId = useMemo(() => {
    const map = new Map<number, common_MediaFull>();
    for (const g of groups) for (const m of g.media) map.set(m.id ?? 0, m);
    return map;
  }, [groups]);
  const left = Math.max(0, room - picked.length);

  const toggle = (id: number) =>
    setPicked((was) =>
      was.includes(id) ? was.filter((x) => x !== id) : was.length < room ? [...was, id] : was,
    );
  const commit = () => {
    const media = picked.map((id) => byId.get(id)).filter(Boolean) as common_MediaFull[];
    if (media.length) onPick(media);
    setPicked([]);
    onOpenChange(false);
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      onConfirm={commit}
      hideActions
      width='lg'
      title={title}
    >
      <div data-reuse-picker={title}>
        {loading ? (
          <EmptyState>loading…</EmptyState>
        ) : failed && groups.length === 0 ? (
          <EmptyState>could not load these pictures · close and try again</EmptyState>
        ) : groups.length === 0 ? (
          <EmptyState>{empty}</EmptyState>
        ) : (
          <div className={`isolate ${GROUP_SEAM}`}>
            {groups.map((g) => (
              <div key={g.key}>
                <GroupLabel
                  flush
                  className={GROUP_GAP}
                  action={<Counter n={g.media.length} noun='picture' />}
                >
                  {g.label}
                </GroupLabel>
                <div className='flex flex-wrap items-start gap-2.5'>
                  {g.media.map((m) => {
                    const id = m.id ?? 0;
                    const already = taken.has(id);
                    const on = already || picked.includes(id);
                    const full = !on && left <= 0;
                    const dead = already || full;
                    const name = names?.get(id);
                    return (
                      <div key={id} className='flex w-[112px] shrink-0 flex-col gap-1'>
                        <PictureTile
                          url={mediaThumb(m)}
                          alt={name ?? `picture ${id}`}
                          aspect='1/1'
                          fit='cover'
                          selected={on}
                          dim={full}
                          className='w-full bg-bgColor'
                          onOpen={dead ? undefined : () => toggle(id)}
                          onSelect={
                            dead
                              ? undefined
                              : {
                                  onClick: () => toggle(id),
                                  ariaLabel: on ? `drop picture ${id}` : `take picture ${id}`,
                                  title: on ? 'drop it from the pick' : 'take this picture',
                                }
                          }
                          selectLabel={on ? 'drop' : 'take'}
                        />
                        <Text size='nano' variant='label' component='span' className='truncate'>
                          {already
                            ? 'already in the slot'
                            : full
                              ? 'no room left'
                              : name ?? `media ${id}`}
                        </Text>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className='sticky -bottom-2.5 z-[var(--z-sticky)] -mx-2.5 -mb-2.5 mt-5 flex items-center gap-2 border-t border-borderColor bg-bgColor px-2.5 py-1.5'>
          <Counter n={picked.length} noun='picture' total={Math.max(room, 0)} />
          <Button
            variant='main'
            size='sm'
            className='ml-auto'
            disabled={picked.length === 0}
            onClick={commit}
          >
            done
          </Button>
        </div>
      </div>
    </ConfirmationModal>
  );
}

/* ── the source list ──────────────────────────────────────────────────────────────────────────── */

function SourceRow({
  source,
  n,
  loading,
  failed,
  onChoose,
}: {
  source: ReuseSource;
  n: number;
  loading: boolean;
  failed?: boolean;
  onChoose: () => void;
}): JSX.Element {
  const none = !loading && !failed && n === 0;
  return (
    <button
      type='button'
      disabled={none}
      onClick={onChoose}
      data-reuse-source={source}
      className={cn(
        'flex w-full items-baseline gap-3 px-2.5 py-2 text-left',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
        none ? 'cursor-not-allowed' : 'hover:bg-bgSecondary',
      )}
    >
      <span
        className={cn(
          'text-micro uppercase tracking-label',
          none ? 'text-textInactiveColor' : 'text-textColor',
        )}
      >
        {SOURCE_WORD[source]}
      </span>
      <span className='ml-auto text-micro text-labelColor'>
        {loading
          ? '…'
          : failed && n === 0
            ? 'could not load'
            : n === 0
              ? 'none yet'
              : `${n} picture${n === 1 ? '' : 's'}`}
      </span>
    </button>
  );
}

/** The list inside the popover — its own component so the model/fitting reads wait for an open. */
function SourceList({
  sources,
  band,
  techCardId,
  onChoose,
}: {
  sources: readonly ReuseSource[];
  band?: GetDesignBandResponse;
  techCardId?: number;
  onChoose: (s: ReuseSource) => void;
}): JSX.Element {
  const cardN = useMemo(
    () => (band ? countTiles(cardPictureGroups(band).flatMap((g) => g.tiles)) : 0),
    [band],
  );
  const models = useModelGroups(sources.includes('models'));
  const fittings = useFittingGroups(sources.includes('fittings') ? techCardId : undefined);
  const fabricsN = useMemo(() => count(fabricGroups(band)), [band]);
  const n: Record<ReuseSource, [number, boolean, boolean]> = {
    card: [cardN, false, false],
    models: [count(models.groups), models.loading, models.failed],
    fittings: [count(fittings.groups), fittings.loading, fittings.failed],
    fabrics: [fabricsN, false, false],
  };
  return (
    <div role='group' aria-label='reuse from' className='flex flex-col py-1'>
      {sources.map((s) => (
        <SourceRow
          key={s}
          source={s}
          n={n[s][0]}
          loading={n[s][1]}
          failed={n[s][2]}
          onChoose={() => onChoose(s)}
        />
      ))}
    </div>
  );
}

/** The picker of one gallery source; mounted only while open. */
function GallerySource({
  source,
  band,
  techCardId,
  room,
  taken,
  onPick,
  onClose,
  onCloseAutoFocus,
}: {
  source: Exclude<ReuseSource, 'card'>;
  band?: GetDesignBandResponse;
  techCardId?: number;
  room: number;
  taken: ReadonlySet<number>;
  onPick: (media: common_MediaFull[]) => void;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}): JSX.Element {
  const models = useModelGroups(source === 'models');
  const fittings = useFittingGroups(source === 'fittings' ? techCardId : undefined);
  const fabrics = useMemo(() => fabricGroups(band), [band]);
  const names = useMemo(
    () => (source === 'fabrics' ? fabricName(band) : undefined),
    [source, band],
  );
  const pick =
    source === 'models'
      ? { ...models, title: 'reuse from the model gallery', empty: 'no model has a photograph yet' }
      : source === 'fittings'
        ? {
            ...fittings,
            title: 'reuse a fitting photograph',
            empty: 'no fitting of this card has a photograph yet',
          }
        : {
            groups: fabrics,
            loading: false,
            failed: false,
            title: 'reuse a fabric picture',
            empty: 'no fabric on this card has a picture yet',
          };
  return (
    <GalleryPicker
      open
      onOpenChange={(o) => !o && onClose()}
      title={pick.title}
      groups={pick.groups}
      loading={pick.loading}
      failed={pick.failed}
      empty={pick.empty}
      names={names}
      room={room}
      taken={taken}
      onPick={onPick}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  );
}

export function ReuseDoor({
  band,
  techCardId,
  sources,
  room,
  taken = [],
  onPick,
  label = 'reuse',
  disabled,
}: ReuseDoorProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSource, setOpenSource] = useState<ReuseSource | null>(null);
  /* The pickers are opened by state (no `Dialog.Trigger`), and from the menu the pressed row is gone
     by the time the picker opens: focus is handed back to the door itself on close (G-01). */
  const door = useRef<HTMLSpanElement | null>(null);
  const focus = useFocusReturn();
  const takenSet = useMemo(() => new Set(taken.filter((id) => id > 0)), [taken]);

  // A source that cannot work here is not offered at all (no band → no card, no fabrics; no card id
  // → no fittings). What remains keeps the fixed order of `REUSE_SOURCES`.
  const offered = REUSE_SOURCES.filter(
    (s) =>
      (!sources || sources.includes(s)) &&
      (s === 'card' || s === 'fabrics' ? !!band : s === 'fittings' ? (techCardId ?? 0) > 0 : true),
  );
  const locked = disabled || room <= 0 || offered.length === 0;

  const choose = (s: ReuseSource) => {
    focus.remember(door.current?.querySelector<HTMLElement>('button'));
    setMenuOpen(false);
    setOpenSource(s);
  };
  const close = () => setOpenSource(null);

  // The door fills the width it is given: the slot's column, or the whole row under a strip.
  const skin = 'w-full justify-center';
  const title =
    room <= 0
      ? 'every slot is filled; take a picture out first'
      : 'pick a picture the admin already holds';

  return (
    <span ref={door} className='contents'>
      {offered.length === 1 ? (
        <Button
          variant='secondary'
          size='sm'
          className={skin}
          disabled={locked}
          title={title}
          onClick={() => choose(offered[0])}
        >
          {label}
        </Button>
      ) : (
        <GenericPopover
          open={menuOpen}
          onOpenChange={(o) => !locked && setMenuOpen(o)}
          title='reuse from'
          noTail
          className='w-[260px]'
          contentProps={{ align: 'start', side: 'bottom', sideOffset: 4 }}
          triggerProps={{
            disabled: locked,
            title,
            className:
              'flex w-full items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
          }}
          openElement={
            <Button
              asChild
              variant='secondary'
              size='sm'
              className={cn(
                skin,
                locked && 'pointer-events-none border-textInactiveColor text-textInactiveColor',
                menuOpen && 'bg-textColor text-bgColor',
              )}
            >
              <span>{label}</span>
            </Button>
          }
        >
          <SourceList sources={offered} band={band} techCardId={techCardId} onChoose={choose} />
        </GenericPopover>
      )}

      {band && offered.includes('card') && (
        <CardPicturePicker
          open={openSource === 'card'}
          onOpenChange={(o) => !o && close()}
          band={band}
          taken={takenSet}
          room={room}
          onPick={onPick}
          title='reuse a picture of this card'
          onCloseAutoFocus={focus.onCloseAutoFocus}
        />
      )}
      {openSource && openSource !== 'card' && (
        <GallerySource
          source={openSource}
          band={band}
          techCardId={techCardId}
          room={room}
          taken={takenSet}
          onPick={onPick}
          onClose={close}
          onCloseAutoFocus={focus.onCloseAutoFocus}
        />
      )}
    </span>
  );
}
