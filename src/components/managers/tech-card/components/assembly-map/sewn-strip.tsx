// ПОЛОСА «КАК ШЬЮТ» — плитки в порядке швеи, глиф + одно слово под ним. Глифы только существующие:
// разрез шва — `SeamIcon` (полоса дизайна), стежок — `StitchPictogram` (кисти флэта). Пустой слот —
// пунктир и слово, и это ДВЕРЬ: щелчок открывает шаг и ставит фокус в его поле.
import { cn } from 'lib/utility';
import { StitchPictogram } from 'ui/components/annotation/stitch-pictogram';
import { SeamIcon } from '../design/seam-icons';
import type { SewnField, SewnTile } from './sewn';

const GLYPH_H = 'h-6';

export function SewnGlyph({ tile, size = 40 }: { tile: SewnTile; size?: number }) {
  if (tile.kind === 'empty') return null;
  if (tile.seam) return <SeamIcon kind={tile.seam} band size={size} />;
  if (tile.iso) return <StitchPictogram iso={tile.iso} width={size} />;
  return null;
}

export function SewnStrip({
  tiles,
  onDoor,
}: {
  tiles: readonly SewnTile[];
  /** Пустой слот: открыть шаг и поставить фокус в поле. */
  onDoor: (field: SewnField) => void;
}) {
  return (
    <div className='flex flex-wrap gap-1' data-map-sewn>
      {tiles.map((t, i) =>
        t.kind === 'empty' ? (
          <span
            key={i}
            role='button'
            tabIndex={0}
            title={t.title}
            data-sewn-tile='empty'
            data-sewn-field={t.field}
            onClick={() => onDoor(t.field)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onDoor(t.field);
            }}
            className='flex min-w-[56px] cursor-pointer flex-col items-center justify-center border border-dashed border-borderColor px-1 py-0.5 text-labelColor transition-colors hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
          >
            <span className={cn(GLYPH_H, 'flex items-center text-micro')}>+</span>
            <span className='text-nano leading-[1.35] tracking-pill uppercase'>{t.word}</span>
            <span className='text-nano leading-[1.35]'>not set</span>
          </span>
        ) : (
          <span
            key={i}
            title={t.title}
            data-sewn-tile={t.kind}
            data-sewn-std={t.std ? '1' : undefined}
            className='relative flex min-w-[56px] max-w-[96px] flex-col items-center bg-bgZebra px-1 pt-1 pb-0.5'
          >
            <span className={cn(GLYPH_H, 'flex items-center justify-center text-textColor')}>
              <SewnGlyph tile={t} />
            </span>
            <span
              className={cn(
                'max-w-full text-center text-nano leading-[1.35] tracking-pill',
                t.kind === 'stitch' && t.iso ? 'font-bold tabular-nums' : 'uppercase',
              )}
            >
              {t.word}
            </span>
            {t.std && (
              <span
                className='absolute top-0 right-0.5 text-nano leading-[1.35] text-labelColor'
                title='the card’s own standard applies'
              >
                std
              </span>
            )}
          </span>
        ),
      )}
    </div>
  );
}
