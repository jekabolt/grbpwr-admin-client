// T4 · the apply step's ASSEMBLY tiles (mockup v3 «piece tiles», owner 09.11). What the re-import
// does to the card's operations and seams, said as pieces: a block of the file beside the card
// pieces it may be, a card piece the file no longer draws as an old tile with what hangs on it, a
// setting the drawing changes as a keep / take pair. The model is `assemblyImpact` (pure); the
// answers ride in `draft.answers` and are written only by apply (`withAnswers`). A clean re-import
// renders nothing.
import type { ImpactAnswers, PieceSpec } from 'lib/pattern-import/types';
import {
  KEEP_OLD,
  NEW_PIECE,
  answer,
  identityOfPiece,
  type Impact,
  type ImpactDiffer,
  type ImpactLost,
  type ImpactOp,
  type ImpactUnclear,
} from 'lib/pattern-import/fabrics/assembly-impact';
import { useState } from 'react';
import { Button, FoldCaret, GroupLabel, Row, Text, Tile } from 'ui';
import { workHeadingWord } from '../../operation-work';
import { useOperationWorkCatalog } from '../../useOperationWorkCatalog';
import type { CardContext } from '../client';
import type { ImportSessionApi } from '../use-import-session';
import { ask } from '../ui-bits';

type Pt = [number, number];
type Shape = { pts: Pt[]; w: number; h: number; minX: number; maxY: number };

const shapeOf = (pts: readonly Pt[] | null | undefined): Shape | null => {
  if (!pts || pts.length < 3) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  return {
    pts: [...pts],
    w: Math.max(Math.max(...xs) - minX, 1),
    h: Math.max(maxY - Math.min(...ys), 1),
    minX,
    maxY,
  };
};

/** The scale that fits the largest shape of a row into `box` px (mockup `rowScale`). */
const rowScale = (shapes: (Shape | null)[], box: number) => {
  const m = Math.max(1, ...shapes.map((s) => (s ? Math.max(s.w, s.h) : 1)));
  return box / m;
};

/** A piece's outline, scaled with its row; y up (the drawing) → y down (the screen). */
function Silhouette({
  shape,
  scale,
  tone = 'ink',
}: {
  shape: Shape | null;
  scale: number;
  tone?: 'ink' | 'dim' | 'old';
}) {
  if (!shape) return null;
  const d = `${shape.pts
    .map(
      ([x, y], i) =>
        `${i ? 'L' : 'M'}${(x - shape.minX).toFixed(1)} ${(shape.maxY - y).toFixed(1)}`,
    )
    .join(' ')}Z`;
  return (
    <svg
      aria-hidden
      width={+(shape.w * scale).toFixed(1)}
      height={+(shape.h * scale).toFixed(1)}
      viewBox={`0 0 ${shape.w.toFixed(1)} ${shape.h.toFixed(1)}`}
      className={
        'block overflow-visible ' +
        (tone === 'old' ? 'text-error' : tone === 'dim' ? 'text-borderColor' : 'text-textColor')
      }
    >
      <path
        d={d}
        fill='none'
        stroke='currentColor'
        strokeWidth={1}
        strokeLinejoin='round'
        strokeDasharray={tone === 'old' ? '4 3' : undefined}
        vectorEffect='non-scaling-stroke'
      />
    </svg>
  );
}

/** The tile's picture area: the silhouette (or a glyph) centred above the name. */
const Fig = ({ children, small }: { children?: React.ReactNode; small?: boolean }) => (
  <span className={`flex flex-1 items-center justify-center ${small ? 'min-h-14' : 'min-h-20'}`}>
    {children}
  </span>
);

const TILE = 'w-28 min-h-33 shrink-0 text-center';
const FIG_ONLY = 'w-19 min-h-26 shrink-0 text-center';
const ROW = 'flex flex-wrap items-stretch gap-2 border-b border-hairline py-2.5 last:border-b-0';

const Is = ({ open, word = 'is' }: { open?: boolean; word?: string }) => (
  <Text
    size='micro'
    component='span'
    variant={open ? undefined : 'label'}
    className={`self-center px-0.5 ${open ? 'text-error' : ''}`}
  >
    {word}
  </Text>
);

const dimmed = (on: boolean, s: React.ReactNode) =>
  on ? <span className='text-labelColor'>{s}</span> : s;

const SYMMETRY_WORD: Record<string, string> = {
  TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL: 'identical',
  TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED: 'mirrored',
  TECH_CARD_PIECE_CUT_SYMMETRY_FOLD: 'on fold',
};
const valueWord = (field: ImpactDiffer['field'], v: number | string | boolean) =>
  field === 'piecesPerGarment'
    ? `×${v}`
    : field === 'fused'
      ? v
        ? 'fused'
        : 'not fused'
      : SYMMETRY_WORD[String(v)] ?? String(v).toLowerCase();
const FIELD_WORD: Record<ImpactDiffer['field'], string> = {
  piecesPerGarment: '× per garment',
  fused: 'fusing',
  cutSymmetry: 'symmetry',
};

export function AssemblyTiles({
  api,
  card,
  impacts,
  locked,
}: {
  api: ImportSessionApi;
  card: CardContext;
  impacts: Impact[];
  /** Applying or applied: the tiles show the answers, nothing is clickable. */
  locked: boolean;
}) {
  const { catalog } = useOperationWorkCatalog();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const draft = api.session.draft;
  if (!impacts.length || !draft) return null;

  const specs = api.session.semantics?.pieces ?? [];
  const blockShape = (identity: string | null): Shape | null => {
    if (!identity) return null;
    const spec: PieceSpec | undefined =
      specs.find((p) => p.identity === identity) ??
      specs.find((p) => p.identity.toLowerCase() === identity.toLowerCase());
    if (!spec?.sizes.length) return null;
    const mid = spec.sizes[Math.floor(spec.sizes.length / 2)];
    return shapeOf(mid.cut.map((q) => [q.x, q.y] as Pt));
  };
  const cardShape = (lineKey: string, scopeKey?: string): Shape | null => {
    const refs = (card.existingShapes ?? []).filter((r) => r.pieceLineKey === lineKey && r.outline);
    const ref = refs.find((r) => r.scopeKey === scopeKey) ?? refs[0];
    return shapeOf(ref?.outline);
  };

  const opWord = (o: ImpactOp) => `${o.number} ${workHeadingWord(catalog, o.work) || o.work}`;
  const say = (next: ImpactAnswers) => void api.dispatch({ type: 'impact-answer', answers: next });
  const prev = draft.answers;
  const unclear = impacts.filter((i): i is ImpactUnclear => i.kind === 'unclear');
  const firstOpen = impacts.find(
    (i) =>
      (i.kind === 'unclear' && i.state === 'open') ||
      (i.kind === 'lost' && i.severity === 'block' && !i.answer),
  );
  const asked = (i: Impact) => (i === firstOpen ? ask('impact', 'pick one') : {});

  // ── an unclear block: the file's tile, «is», the card pieces it may be, a new piece ──────────
  const unclearRow = (u: ImpactUnclear) => {
    if (u.state === 'wait') return null;
    const followers = unclear.filter((x) => x.after === u.blockName).map((x) => x.key);
    const pick = (v: string) =>
      say(answer(prev, 'blocks', u.key, u.answer === v ? undefined : v, u.after ? [] : followers));
    const offered = u.state === 'open' ? u.candidates : u.all;
    const own = blockShape(u.identity);
    const shapes = offered.map((c) => cardShape(c.pieceLineKey, u.scopeKey));
    const s = rowScale([own, ...shapes], 78);
    const live = !locked && u.state !== 'auto';
    const isNew = u.answer === NEW_PIECE;
    return (
      <div key={u.key} className={ROW} {...asked(u)} data-ask-zone=''>
        <Tile
          className={`${TILE} border-hairline`}
          media={
            <Fig>
              <Silhouette shape={own} scale={s} />
            </Fig>
          }
          name={u.blockName}
          sub='file'
          title={u.blockName}
        />
        <Is open={u.state === 'open'} word={u.state === 'auto' ? '=' : 'is'} />
        {offered.map((c, i) => {
          const chosen = u.answer === c.pieceLineKey;
          const dim = !!u.answer && !chosen;
          const suggested = u.state === 'open' && i === 0;
          return (
            <Tile
              key={c.pieceLineKey}
              className={`${TILE} ${suggested ? 'border-textColor' : ''}`}
              selected={chosen}
              pressed={live ? chosen : undefined}
              onClick={live ? () => pick(c.pieceLineKey) : undefined}
              media={
                <Fig>
                  <Silhouette shape={shapes[i]} scale={s} tone={dim ? 'dim' : 'ink'} />
                </Fig>
              }
              name={dimmed(dim, `${c.pieceName}${chosen ? ' ✓' : ''}`)}
              sub={c.op != null ? `op ${c.op} · ${c.seams} seams` : `${c.seams} seams`}
              title={c.pieceName}
            />
          );
        })}
        {u.state !== 'auto' && (
          <Tile
            className={TILE}
            dashed
            selected={isNew}
            pressed={live ? isNew : undefined}
            onClick={live ? () => pick(NEW_PIECE) : undefined}
            media={
              <Fig>
                <span className='text-lg text-labelColor'>+</span>
              </Fig>
            }
            name={dimmed(!!u.answer && !isNew, `new piece${isNew ? ' ✓' : ''}`)}
            sub='no ops'
          />
        )}
      </div>
    );
  };

  // ── a lost card piece: the old tile and what hangs on it, then the answer (owner default 1) ──
  const lostRows = (l: ImpactLost) => {
    const own = cardShape(l.pieceLineKey, l.scopeKey);
    const lines: { k: string; v: string; ops?: number }[] = [];
    if (l.direct.length) lines.push({ k: 'ops', v: l.direct.map(opWord).join(' · ') });
    for (const u of l.units)
      if (u.ops.length)
        lines.push({
          k: u.unitName.toLowerCase(),
          v: u.ops.map(opWord).join(' · '),
          ops: u.ops.length,
        });
    if (l.seams) lines.push({ k: 'seams', v: `${l.seams} lose a side` });
    if (l.fused)
      lines.push({ k: 'fusing', v: `off the fusing sheet${l.fused === 'zone' ? ' · zone' : ''}` });
    lines.push({ k: 'cut', v: 'off cut list and marker' });
    lines.push({ k: 'stays', v: 'old tile on the scheme' });
    const id = `lost:${l.pieceLineKey}`;
    const unfolded = !!open[id];
    const shown = unfolded ? lines : lines.slice(0, 2);
    const after = lines.slice(2).reduce((n, x) => n + (x.ops ?? 0), 0);
    const linkShapes = l.links.map((k) => blockShape(identityOfPiece(draft, k.pieceLineKey)));
    const s = rowScale([own, ...linkShapes], 78);
    const live = !locked;
    const pick = (v: string) =>
      say(answer(prev, 'lost', l.pieceLineKey, l.answer === v ? undefined : v));
    const asking = l.severity === 'block' || l.links.length > 0;
    return (
      <div key={id}>
        <div className={ROW}>
          <Tile
            className={TILE}
            tone='error'
            media={
              <Fig>
                <Silhouette shape={own} scale={rowScale([own], 78)} tone='old' />
              </Fig>
            }
            name={<span className='text-error'>{l.pieceName}</span>}
            sub={<span className='text-error'>not drawn</span>}
            title={l.pieceName}
          />
          <div className='grid min-w-0 max-w-160 flex-1 basis-64 content-start gap-0.5 border border-error px-2.5 py-2'>
            {shown.map((x) => (
              <Text key={x.k} size='micro' component='p' className='break-words'>
                <span className='text-labelColor'>{x.k}</span> {x.v}
              </Text>
            ))}
            {lines.length > 2 && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='justify-self-start text-error'
                aria-expanded={unfolded}
                onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}
              >
                {unfolded ? 'less' : `${after} ops after · ${l.seams} seams`}
                <FoldCaret open={unfolded} />
              </Button>
            )}
          </div>
        </div>
        {asking && (
          <div className={ROW} {...asked(l)} data-ask-zone=''>
            <Is open={l.severity === 'block' && !l.answer} />
            {l.links.map((k, i) => {
              const chosen = l.answer === k.pieceLineKey;
              const dim = !!l.answer && !chosen;
              return (
                <Tile
                  key={k.pieceLineKey}
                  className={`${TILE} ${!l.answer && i === 0 ? 'border-textColor' : ''}`}
                  selected={chosen}
                  pressed={live ? chosen : undefined}
                  onClick={live ? () => pick(k.pieceLineKey) : undefined}
                  media={
                    <Fig>
                      <Silhouette shape={linkShapes[i]} scale={s} tone={dim ? 'dim' : 'ink'} />
                    </Fig>
                  }
                  name={dimmed(dim, `${k.name}${chosen ? ' ✓' : ''}`)}
                  sub='file'
                  title={k.name}
                />
              );
            })}
            <Tile
              className={`${TILE} ${!l.answer && !l.links.length ? 'border-textColor' : ''}`}
              selected={l.answer === KEEP_OLD}
              pressed={live ? l.answer === KEEP_OLD : undefined}
              onClick={live ? () => pick(KEEP_OLD) : undefined}
              media={
                <Fig>
                  <Silhouette shape={own} scale={s} tone='dim' />
                </Fig>
              }
              name={dimmed(
                !!l.answer && l.answer !== KEEP_OLD,
                `keep old${l.answer === KEEP_OLD ? ' ✓' : ''}`,
              )}
              sub='card'
            />
          </div>
        )}
      </div>
    );
  };

  // ── a setting the drawing changes: the pieces, then keep card / take file (owner default 3) ──
  const differRows = (d: ImpactDiffer) => {
    const shapes = d.pieces.map((p) => cardShape(p.pieceLineKey));
    const s = rowScale(shapes, 52);
    const one = <T,>(xs: T[]) => (xs.every((x) => String(x) === String(xs[0])) ? xs[0] : null);
    const cardV = one(d.pieces.map((p) => p.cardValue));
    const fileV = one(d.pieces.map((p) => p.drawingValue));
    const live = !locked;
    const pick = (v: 'card' | 'drawing') =>
      say(answer(prev, 'take', d.field, d.answer === v ? undefined : v));
    const choice = (v: 'card' | 'drawing', value: number | string | boolean | null) => {
      const chosen = d.answer === v;
      return (
        <Tile
          key={v}
          className={`${FIG_ONLY} ${!d.answer && v === 'card' ? 'border-textColor' : ''}`}
          selected={chosen}
          pressed={live ? chosen : undefined}
          onClick={live ? () => pick(v) : undefined}
          media={
            <Fig small>
              <span className='text-lg'>{value == null ? '' : valueWord(d.field, value)}</span>
            </Fig>
          }
          name={dimmed(
            !!d.answer && !chosen,
            `${v === 'card' ? 'keep' : 'take'}${chosen ? ' ✓' : ''}`,
          )}
          sub={v === 'card' ? 'card' : 'file'}
        />
      );
    };
    return (
      <div key={`differ:${d.field}`}>
        <div className={ROW}>
          {d.pieces.map((p, i) => (
            <Tile
              key={p.pieceLineKey}
              className={FIG_ONLY}
              media={
                <Fig small>
                  <Silhouette shape={shapes[i]} scale={s} />
                </Fig>
              }
              name={p.pieceName}
              sub={
                d.answer === 'drawing' ? (
                  valueWord(d.field, p.drawingValue)
                ) : d.answer === 'card' ? (
                  valueWord(d.field, p.cardValue)
                ) : (
                  <span className='text-error'>
                    {valueWord(d.field, p.cardValue)} → {valueWord(d.field, p.drawingValue)}
                  </span>
                )
              }
              title={p.pieceName}
            />
          ))}
        </div>
        <div className={ROW}>
          <Is open={!d.answer && d.severity === 'warn'} word={FIELD_WORD[d.field]} />
          {choice('card', cardV)}
          {choice('drawing', fileV)}
        </div>
      </div>
    );
  };

  return (
    <>
      <GroupLabel>assembly</GroupLabel>
      {impacts.map((i) =>
        i.kind === 'unclear'
          ? unclearRow(i)
          : i.kind === 'lost'
            ? lostRows(i)
            : i.kind === 'differ'
              ? differRows(i)
              : null,
      )}
      {impacts.map((f) =>
        f.kind === 'fresh' ? (
          <div key={`fresh:${f.key}`} className={ROW}>
            <Tile
              className={TILE}
              dashed
              media={
                <Fig>
                  <Silhouette
                    shape={blockShape(f.identity)}
                    scale={rowScale([blockShape(f.identity)], 78)}
                  />
                </Fig>
              }
              name={f.name}
              sub='new · no ops'
              title={f.name}
            />
          </div>
        ) : null,
      )}
    </>
  );
}

/** The result panel's «assembly» group after apply: the old tiles and the pieces with no ops. */
export function AssemblyResult({ impacts }: { impacts: Impact[] }) {
  const lost = impacts.filter((i): i is ImpactLost => i.kind === 'lost' && i.answer !== null);
  const kept = impacts.filter(
    (i): i is ImpactLost => i.kind === 'lost' && (i.answer === KEEP_OLD || i.answer === null),
  );
  const fresh = impacts.filter((i) => i.kind === 'fresh');
  if (!kept.length && !fresh.length && !lost.length) return null;
  return (
    <div className='mb-2'>
      <GroupLabel flush>assembly</GroupLabel>
      {kept.map((l) => (
        <Row
          key={l.pieceLineKey}
          label={<span className='text-error'>{l.pieceName}</span>}
          value={<span className='text-error'>old</span>}
        />
      ))}
      {lost
        .filter((l) => l.answer !== KEEP_OLD)
        .map((l) => (
          <Row
            key={l.pieceLineKey}
            label={l.pieceName}
            value={`→ ${l.links.find((k) => k.pieceLineKey === l.answer)?.name ?? ''}`}
          />
        ))}
      {fresh.map((f) =>
        f.kind === 'fresh' ? (
          <Row
            key={f.key}
            label={f.name}
            value={
              <Text size='micro' variant='label' component='span'>
                no ops
              </Text>
            }
          />
        ) : null,
      )}
    </div>
  );
}
