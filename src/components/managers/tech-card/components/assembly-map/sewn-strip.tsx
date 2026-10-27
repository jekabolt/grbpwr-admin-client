// Compact seam values in sewing order. Empty fields stay in the step editor.
import { cn } from 'lib/utility';
import { StitchPictogram } from 'components/managers/tech-card/annotation/stitch-pictogram';
import { OpIconArt } from 'components/managers/tech-card/op-icons';
import { SeamIcon } from '../design/seam-icons';
import type { SewnTile } from './sewn';

const GLYPH_H = 'h-6';

export function SewnGlyph({ tile, size = 40 }: { tile: SewnTile; size?: number }) {
  if (tile.kind === 'empty') return null;
  if (tile.seam) return <SeamIcon kind={tile.seam} band size={size} />;
  if (tile.iso) return <StitchPictogram iso={tile.iso} width={size} />;
  if (tile.kind === 'press') {
    return (
      <OpIconArt
        icon={{ key: tile.word === 'press open' ? 'press_open' : 'press_flat' }}
        w={size}
        h={30}
      />
    );
  }
  return null;
}

export function SewnStrip({ tiles }: { tiles: readonly SewnTile[] }) {
  const shown = tiles.filter(
    (tile) =>
      tile.kind !== 'empty' &&
      !(tile.kind === 'foot' && tile.word === 'no foot / bare') &&
      (tile.kind === 'section' ||
        tile.kind === 'stitch' ||
        tile.kind === 'press' ||
        tile.kind === 'foot'),
  );
  if (shown.length === 0) return null;

  return (
    <div
      className='grid gap-1'
      style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
      data-map-sewn=''
    >
      {shown.map((tile, index) => (
        <span
          key={`${tile.kind}:${index}`}
          data-sewn-tile={tile.kind}
          className='flex min-w-0 flex-col items-center justify-center bg-pageBg px-1 py-1'
        >
          <span className={cn(GLYPH_H, 'flex items-center justify-center text-textColor')}>
            <SewnGlyph tile={tile} />
          </span>
          <span
            className={cn(
              'max-w-full truncate text-center text-nano leading-[1.35] tracking-pill',
              tile.kind === 'stitch' && tile.iso ? 'font-bold tabular-nums' : 'uppercase',
            )}
          >
            {tile.word}
          </span>
        </span>
      ))}
    </div>
  );
}
