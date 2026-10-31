// THE CARD'S HINTS, MAP VIEW (unit-seams F, mockup variant B, owner OK). The AI's guess of what is
// sewn to what, over the card's real DXF silhouettes: joins listed on the left (each with its whole
// scheme, pieces + edge → pieces + edge), the selected one drawn as a line between its pieces, and
// under the map its editable row and the roles of its pieces. AI = blue dashed, the owner's word =
// ink, off = struck grey. Nothing here writes a seam: an override or a dictionary row is a hint for
// the guess, the seam is still the owner's click in the picker.

import { piecePicture } from 'lib/assembly-skeleton/map';
import {
  ownerCodeOf,
  pieceCodeOf,
  seamEdgeWordSchema,
  seamRoleSchema,
  type EffectiveJoinHint,
  type EffectiveRoleHint,
  type SeamHintOverride,
  type SeamHintsState,
  type SeamJoinSide,
  type SeamRole,
} from 'lib/seam-hints';
import { atlasLayout } from 'lib/seam-hints/atlas';
import { readName } from 'lib/assembly-skeleton/skeleton/model';
import { staticCodeRole, seamRoleOfBook } from 'lib/seam-hints/dictionary';
import { useMemo, useState } from 'react';
import { Chip, ChipRow, GenericPopover, GroupLabel, Pill, Text } from 'ui';
import { PieceMapShape } from '../assembly-map/piece-map-shape';
import { useStepSeams } from './step-seams-context';

const ROLES = seamRoleSchema.options;
const EDGES = seamEdgeWordSchema.options;
const word = (s: string) => s.replace(/_/g, ' ');
const MAP_W = 800;
const MAP_H_MAX = 460;

type RoleView = {
  role: SeamRole;
  hand: 'L' | 'R' | null;
  src: 'own' | 'all' | 'ai' | 'book';
  off: boolean;
};

/** What a piece is, by precedence: the owner's fix on this card > dictionary row > AI > static. */
function roleView(
  name: string,
  aiRole: EffectiveRoleHint | undefined,
  override: SeamHintOverride | undefined,
): RoleView | null {
  if (override?.kind === 'role' && override.state !== 'off' && override.value)
    return { role: override.value.role, hand: override.value.hand ?? null, src: 'own', off: false };
  const off = override?.kind === 'role' && override.state === 'off';
  const row = ownerCodeOf(name);
  if (row) return { role: row.role, hand: row.hand, src: 'all', off };
  if (aiRole) return { role: aiRole.role, hand: aiRole.hand, src: 'ai', off };
  const book = seamRoleOfBook(readName(name).role ?? staticCodeRole(name));
  return book ? { role: book, hand: null, src: 'book', off } : null;
}

function dateOf(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const sideText = (side: SeamJoinSide) => `${side.pieces.join(' + ')} ${word(side.edge)}`;

export function SeamHintsMap() {
  const ctx = useStepSeams();
  if (!ctx?.cardId) return null;
  return (
    <HintsBody state={ctx.seamHints} geometryPieces={ctx.geometry.pieces} frozen={ctx.frozen} />
  );
}

function HintsBody({
  state,
  geometryPieces,
  frozen,
}: {
  state: SeamHintsState;
  geometryPieces: NonNullable<ReturnType<typeof useStepSeams>>['geometry']['pieces'];
  frozen: boolean;
}) {
  const { hints } = state;
  const [picked, setPicked] = useState<number | null>(null);
  const join = hints.joins.find((row) => row.op === picked) ?? hints.joins[0] ?? null;

  const aiRoles = useMemo(() => new Map(hints.roles.map((row) => [row.piece, row])), [hints.roles]);
  const roleOverrides = useMemo(
    () =>
      new Map(
        state.overrides.filter((row) => row.kind === 'role').map((row) => [row.hint_key, row]),
      ),
    [state.overrides],
  );

  const head = (
    <GroupLabel
      flush
      action={
        <span className='flex items-center gap-2'>
          {state.stale && <Pill tone='attention'>stale</Pill>}
          {state.lastSuggest && (
            <Text size='micro' variant='label' component='span'>
              {state.lastSuggest.cached
                ? 'cached'
                : `$${state.lastSuggest.costUsd || '0'} · ${state.lastSuggest.calls}×`}
            </Text>
          )}
          <Chip
            nonForm
            dashed
            tone='attention'
            disabled={state.suggesting || state.isLoading}
            onClick={state.rerun}
          >
            {state.suggesting ? 'running…' : 'rerun'}
          </Chip>
        </span>
      }
    >
      <span className='flex items-center gap-2'>
        hints
        {state.run && (
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {[state.run.model, dateOf(state.run.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        )}
        {state.hasRun && (
          <Text size='micro' variant='label' component='span'>
            {`${hints.roles.length} roles · ${hints.joins.length} joins`}
          </Text>
        )}
      </span>
    </GroupLabel>
  );

  if (state.suggestError)
    return (
      <div className='mb-4'>
        {head}
        <Text size='small' variant='error'>
          {state.suggestError}
        </Text>
      </div>
    );
  if (!state.hasRun && !state.overrides.length)
    return (
      <div className='mb-4'>
        {head}
        <Text size='small' variant='label'>
          {state.isLoading ? 'loading…' : 'no hints'}
        </Text>
      </div>
    );

  const setJoin = (
    row: EffectiveJoinHint,
    patch: Partial<Pick<EffectiveJoinHint, 'a' | 'b'>>,
    ok = false,
  ) =>
    state.setOverride({
      kind: 'join',
      hint_key: String(row.op),
      value: { a: patch.a ?? row.a, b: patch.b ?? row.b, relation: row.relation },
      state: ok ? 'ok' : 'fixed',
    });

  return (
    <div className='mb-4' data-seam-hints>
      {head}
      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
        <div className='flex max-h-96 flex-col overflow-y-auto md:col-span-1'>
          {hints.joins.map((row) => {
            const on = row.op === join?.op;
            return (
              <div
                key={row.op}
                className={`flex items-baseline gap-2 border-b border-hairline py-1 ${
                  row.state === 'off' ? 'line-through' : ''
                }`}
                data-join-op={row.op}
              >
                <Chip nonForm quiet selected={on} pressed={on} onClick={() => setPicked(row.op)}>
                  {row.op}
                </Chip>
                <Text
                  size='micro'
                  variant={on ? 'uppercase' : 'label'}
                  component='span'
                  className={row.state === 'ai' ? 'text-warning' : ''}
                >
                  {sideText(row.a)} → {sideText(row.b)}
                </Text>
              </div>
            );
          })}
          {hints.not_inferred.length > 0 && (
            <Text size='micro' variant='label' component='span' className='px-1 py-1'>
              {`${hints.not_inferred.length} not inferred`}
            </Text>
          )}
        </div>
        <div className='min-w-0 border border-borderColor md:col-span-2'>
          <PiecesMap join={join} state={state} pieces={geometryPieces} />
          {join && (
            <div
              className={`flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2 ${
                join.state === 'off' ? 'line-through' : ''
              }`}
              data-join-row={join.op}
            >
              <Text size='small' component='span' className='tabular-nums'>
                {join.op}
              </Text>
              <SideChips
                side={join.a}
                join={join}
                frozen={frozen}
                onEdge={(edge) => setJoin(join, { a: { ...join.a, edge } }, edge === join.a.edge)}
              />
              <span>→</span>
              <SideChips
                side={join.b}
                join={join}
                frozen={frozen}
                onEdge={(edge) => setJoin(join, { b: { ...join.b, edge } }, edge === join.b.edge)}
              />
              <span className='flex-1' />
              <Text
                size='micro'
                variant={join.state === 'ai' ? 'label' : 'default'}
                component='span'
                className={join.state === 'ai' ? 'text-warning' : ''}
              >
                {join.state === 'ai' ? 'ai' : join.state === 'off' ? 'off' : 'own'}
              </Text>
              <Chip
                nonForm
                quiet
                disabled={frozen || state.writing}
                onClick={() =>
                  join.state === 'off'
                    ? setJoin(join, {}, true)
                    : state.setOverride({
                        kind: 'join',
                        hint_key: String(join.op),
                        value: null,
                        state: 'off',
                      })
                }
              >
                {join.state === 'off' ? 'on' : 'off'}
              </Chip>
            </div>
          )}
          {join && (
            <div className='flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2'>
              <Text size='micro' variant='uppercase' tracking='group' component='span'>
                roles
              </Text>
              {[...new Set([...join.a.pieces, ...join.b.pieces])].map((name) => (
                <RolePick
                  key={name}
                  name={name}
                  view={roleView(name, aiRoles.get(name), roleOverrides.get(name))}
                  hasCardFix={roleOverrides.has(name)}
                  aiHand={aiRoles.get(name)?.hand ?? null}
                  state={state}
                  frozen={frozen}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SideChips({
  side,
  join,
  frozen,
  onEdge,
}: {
  side: SeamJoinSide;
  join: EffectiveJoinHint;
  frozen: boolean;
  onEdge: (edge: SeamJoinSide['edge']) => void;
}) {
  const ai = join.state === 'ai';
  return (
    <ChipRow>
      {side.pieces.map((name, i) => (
        <span key={name} className='flex items-center gap-1'>
          {i > 0 && <span>+</span>}
          <Chip>{name}</Chip>
        </span>
      ))}
      <GenericPopover
        title={String(join.op)}
        triggerProps={{ disabled: frozen, 'aria-label': `edge ${side.edge}` }}
        openElement={
          <Chip
            tone={ai ? 'attention' : 'default'}
            dashed={ai}
            selected={join.state !== 'ai' && join.state !== 'off'}
          >
            {word(side.edge)}
          </Chip>
        }
      >
        <ChipRow>
          {EDGES.map((edge) => (
            <Chip key={edge} selected={edge === side.edge} onClick={() => onEdge(edge)}>
              {word(edge)}
            </Chip>
          ))}
        </ChipRow>
      </GenericPopover>
    </ChipRow>
  );
}

function RolePick({
  name,
  view,
  hasCardFix,
  aiHand,
  state,
  frozen,
}: {
  name: string;
  view: RoleView | null;
  hasCardFix: boolean;
  aiHand: 'L' | 'R' | null;
  state: SeamHintsState;
  frozen: boolean;
}) {
  const [scope, setScope] = useState<'card' | 'all'>(view?.src === 'all' ? 'all' : 'card');
  const [open, setOpen] = useState(false);
  const code = pieceCodeOf(name);
  const pick = async (role: SeamRole) => {
    setOpen(false);
    if (scope === 'all' && code) {
      await state.setDictionary(code, role, null);
      // The dictionary row now speaks for this piece: a card fix would shadow it.
      if (hasCardFix) state.setOverride({ kind: 'role', hint_key: name, state: '' });
      return;
    }
    state.setOverride({
      kind: 'role',
      hint_key: name,
      value: { role, hand: view?.hand ?? aiHand },
      state: view?.src === 'ai' && view.role === role ? 'ok' : 'fixed',
    });
  };
  const label = view ? `${word(view.role)}${view.src === 'all' ? ' · all' : ''}` : '—';
  return (
    <span className='flex items-center gap-1' data-role-piece={name}>
      <Chip>{name}</Chip>
      <GenericPopover
        open={open}
        onOpenChange={setOpen}
        title={name}
        triggerProps={{ disabled: frozen || state.writing, 'aria-label': `role ${name}` }}
        openElement={
          <Chip
            tone={view?.src === 'ai' ? 'attention' : 'default'}
            dashed={view?.src === 'ai'}
            selected={view?.src === 'own' && !view.off}
            className={view?.off ? 'border-borderColor text-borderColor line-through' : ''}
          >
            {label}
          </Chip>
        }
      >
        <div className='flex flex-col gap-2'>
          <ChipRow>
            {ROLES.map((role) => (
              <Chip key={role} selected={role === view?.role} onClick={() => void pick(role)}>
                {word(role)}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow>
            <Chip
              selected={scope === 'card'}
              pressed={scope === 'card'}
              onClick={() => setScope('card')}
            >
              card
            </Chip>
            <Chip
              selected={scope === 'all'}
              pressed={scope === 'all'}
              disabled={!code}
              onClick={() => setScope('all')}
            >
              all cards
            </Chip>
            {scope === 'all' && code && (
              <Text size='micro' variant='label' component='span'>
                {code}
              </Text>
            )}
          </ChipRow>
        </div>
      </GenericPopover>
    </span>
  );
}

type Tile = { key: string; name: string; x: number; y: number; w: number; h: number };

function PiecesMap({
  join,
  state,
  pieces,
}: {
  join: EffectiveJoinHint | null;
  state: SeamHintsState;
  pieces: NonNullable<ReturnType<typeof useStepSeams>>['geometry']['pieces'];
}) {
  const layout = useMemo(() => {
    const list = [...pieces].flatMap(([key, piece]) => {
      const name = state.nameOfKey.get(key);
      return name && piece.geom.rs.length >= 3 ? [{ key, name, outline: piece.geom.rs }] : [];
    });
    let pxPerMm = 0.3;
    let out = atlasLayout(list, MAP_W, pxPerMm);
    while (out.height > MAP_H_MAX && pxPerMm > 0.05) {
      pxPerMm *= 0.85;
      out = atlasLayout(list, MAP_W, pxPerMm);
    }
    const tiles: Tile[] = out.placed.map((p) => ({
      key: p.key ?? '',
      name: p.name,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
    }));
    return { height: out.height, tiles };
  }, [pieces, state.nameOfKey]);

  const pictures = useMemo(() => {
    const map = new Map<string, ReturnType<typeof piecePicture>>();
    for (const tile of layout.tiles) {
      const piece = pieces.get(tile.key);
      if (piece)
        map.set(
          tile.key,
          piecePicture(piece.geom, () => [], []),
        );
    }
    return map;
  }, [layout.tiles, pieces]);

  const keysOf = (names: readonly string[]) =>
    new Set(names.flatMap((name) => state.piecesOfName.get(name) ?? []));
  const aKeys = join ? keysOf(join.a.pieces) : new Set<string>();
  const bKeys = join ? keysOf(join.b.pieces) : new Set<string>();
  const hot = new Set([...aKeys, ...bKeys]);
  const tileOf = new Map(layout.tiles.map((tile) => [tile.key, tile]));
  const centre = (keys: Set<string>) => {
    const list = [...keys].map((key) => tileOf.get(key)).filter((t): t is Tile => !!t);
    if (!list.length) return null;
    return [
      list.reduce((s, t) => s + t.x + t.w / 2, 0) / list.length,
      list.reduce((s, t) => s + t.y + t.h / 2, 0) / list.length,
    ] as const;
  };
  const a = centre(aKeys);
  const b = centre(bKeys);
  const ai = join?.state === 'ai';
  const tone = ai ? 'text-warning' : 'text-textColor';

  return (
    <svg
      viewBox={`0 0 ${MAP_W} ${layout.height}`}
      className='block h-auto w-full'
      role='img'
      aria-label='pieces and the selected join'
    >
      {layout.tiles.map((tile) => {
        const picture = pictures.get(tile.key);
        if (!picture) return null;
        const isHot = hot.has(tile.key);
        return (
          <g key={tile.key} opacity={join && !isHot ? 0.35 : 1}>
            <g transform={`translate(${tile.x - 4} ${tile.y - 4})`}>
              <PieceMapShape
                picture={picture}
                boxW={tile.w + 8}
                boxH={tile.h + 8}
                active={null}
                numberOf={(i) => i}
                numbers={false}
                label={tile.name}
              />
            </g>
            {isHot && join?.state !== 'off' && (
              <rect
                x={tile.x - 5}
                y={tile.y - 5}
                width={tile.w + 10}
                height={tile.h + 10}
                fill='none'
                stroke='currentColor'
                strokeWidth={1.5}
                strokeDasharray={ai ? '4 3' : undefined}
                className={tone}
              />
            )}
            <text
              x={tile.x}
              y={tile.y + tile.h + 14}
              fontSize={10}
              fill='currentColor'
              className={isHot ? 'text-textColor' : 'text-labelColor'}
            >
              {tile.name}
            </text>
          </g>
        );
      })}
      {join && join.state !== 'off' && a && b && (
        <g className={tone} data-join-link={join.op}>
          <path
            d={`M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${Math.min(a[1], b[1]) - 60} ${b[0]} ${b[1]}`}
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            strokeDasharray={ai ? '6 4' : undefined}
          />
          <circle cx={a[0]} cy={a[1]} r={4} fill='currentColor' />
          <circle cx={b[0]} cy={b[1]} r={4} fill='currentColor' />
        </g>
      )}
    </svg>
  );
}
