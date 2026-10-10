// PIECES — каждое семейство деталей один раз, номер шага у каждой сшиваемой кромки (§4 zone 4, D7).
// Близнецы L/R — одна плитка «L·R», одинаковые слои — «×n»; номера двойника ложатся на ту же кромку.
import { isJoin, pieceFamilies } from 'lib/assembly-skeleton/map';
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { PieceMapShape } from './piece-map-shape';
import { seamSignature, sewnWords, type SewnTile } from './sewn';
import { SewnGlyph } from './sewn-strip';
import { MAP_W } from './step-view';
import type { MapModel } from './use-map-model';

const COLS = 3;
const GAP = 4;
const TILE = Math.floor((MAP_W - GAP * (COLS - 1)) / COLS);
const NAME_H = 14;

const num = (i: number) => (i + 1) * 10;

export function PiecesView({
  model,
  active,
  onHover,
  onPick,
  onHoverMany,
}: {
  model: MapModel;
  active: number | null;
  onHover: (index: number | null) => void;
  onPick: (index: number) => void;
  /** Строка легенды швов светит все свои шаги — на карте и в рельсе. */
  onHoverMany: (indexes: readonly number[] | null) => void;
}) {
  const families = useMemo(() => (model.read ? pieceFamilies(model.read) : []), [model.read]);
  const [legendHot, setLegendHot] = useState<readonly number[] | null>(null);
  // ШВЫ ЭТОЙ ВЕЩИ — каждый различный шов (разрез + стежок) один раз, с номерами шагов, что его шьют.
  // Глифов у каждого номера нет намеренно: в колонке 320 px это шум; подсказка номера несёт полосу.
  const legend = useMemo(() => {
    const read = model.read;
    if (!read) return [];
    const rows = new Map<string, { tiles: SewnTile[]; steps: number[] }>();
    read.steps.forEach((st, i) => {
      if (!st.sews || !isJoin(read, i) || (read.seams[i] ?? []).length === 0) return;
      const tiles = model.sewnOf(i);
      const sig = seamSignature(tiles) ?? '';
      const row = rows.get(sig) ?? { tiles, steps: [] };
      row.steps.push(i);
      rows.set(sig, row);
    });
    return [...rows.entries()]
      .map(([sig, r]) => ({ sig, ...r }))
      .sort((a, b) => (a.sig === '' ? 1 : b.sig === '' ? -1 : a.steps[0] - b.steps[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.read, model.sewnOf]);
  if (!model.read) return null;
  const shown = legendHot ?? active;
  return (
    <div className='flex flex-col gap-1.5'>
      <div
        className='grid gap-1'
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        data-map-pieces={families.length}
      >
        {families.map((f) => {
          const hot =
            shown != null &&
            f.picture.edges.some((e) =>
              e.steps.some((st) => (Array.isArray(shown) ? shown.includes(st) : st === shown)),
            );
          const name = f.name;
          return (
            <div
              key={f.leader}
              data-map-family={f.leader}
              data-map-family-hot={hot ? '1' : undefined}
              className={cn(
                'relative flex flex-col items-center bg-bgZebra',
                hot && 'outline outline-2 -outline-offset-2 outline-textColor',
              )}
              title={`${name}${f.tag ? ` ${f.tag}` : ''} · ${f.members.map(model.pieceName).join(', ')}`}
            >
              <PieceMapShape
                picture={f.picture}
                boxW={TILE}
                boxH={TILE - NAME_H}
                active={shown}
                numberOf={num}
                titleOf={(i) => sewnWords(model.sewnOf(i)) || 'nothing stated on how it is sewn'}
                onHoverStep={onHover}
                onPickStep={onPick}
                label={`${name}: sewn edges numbered by step`}
              />
              {f.tag && (
                <span className='absolute top-0 right-0.5 text-nano leading-[1.35] tracking-pill text-labelColor tabular-nums'>
                  {f.tag}
                </span>
              )}
              <span className='w-full truncate px-0.5 text-center text-nano leading-[1.35] tracking-pill uppercase'>
                {name}
              </span>
            </div>
          );
        })}
      </div>
      {legend.length > 0 && (
        <div data-map-legend>
          <GroupLabel flush>seams on this garment</GroupLabel>
          {legend.map((r) => {
            const sec = r.tiles.find((t) => t.kind === 'section');
            const st = r.tiles.find((t) => t.kind === 'stitch');
            return (
              <div
                key={r.sig || 'unset'}
                data-map-legend-row={r.steps.join(',')}
                onMouseEnter={() => {
                  setLegendHot(r.steps);
                  onHoverMany(r.steps);
                }}
                onMouseLeave={() => {
                  setLegendHot(null);
                  onHoverMany(null);
                }}
                className='flex items-center gap-1.5 border-b border-hairline py-0.5 last:border-b-0 hover:bg-bgZebra'
              >
                <span className='flex h-5 w-8 shrink-0 items-center justify-center'>
                  {sec ? <SewnGlyph tile={sec} size={30} /> : null}
                </span>
                <span className='flex h-5 w-7 shrink-0 items-center justify-center'>
                  {st ? <SewnGlyph tile={st} size={26} /> : null}
                </span>
                <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                  {r.sig === ''
                    ? 'seam type not set'
                    : [sec?.word, st && st.kind !== 'empty' ? st.word : '']
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
                <Text
                  size='micro'
                  variant='label'
                  component='span'
                  className='shrink-0 truncate tabular-nums'
                  title={r.steps.map(num).join(', ')}
                >
                  {r.steps.length > 4
                    ? `${r.steps.slice(0, 3).map(num).join(' ')} +${r.steps.length - 3}`
                    : r.steps.map(num).join(' ')}
                </Text>
              </div>
            );
          })}
        </div>
      )}
      <Text size='micro' variant='label'>
        number at an edge = the step that sews it · thin edge = not sewn in any step · tick = notch
      </Text>
    </div>
  );
}
