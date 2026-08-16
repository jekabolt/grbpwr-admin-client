import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import Text from 'ui/components/text';
import { FilterType, OTHER_RATIO } from '../utils/useFilter';

/**
 * Компактный отбор ВНУТРИ диалога выбора медиа.
 *
 * Диалог монтировал библиотеку с `showFilters={false}`: поиск, тип и сортировка были спрятаны
 * ровно там, где библиотеку листают чаще всего. Выбрать кадр из пятисот значило прокрутить
 * бесконечную неотсортированную сетку до нужного места. Рельса, как на самой странице, здесь
 * нет: он съел бы треть ширины диалога, а выбирают в нём глазами по картинкам, — поэтому чипы
 * строкой над сеткой.
 */
export function MediaFilterBar({
  type,
  ratio,
  search,
  typeCounts,
  ratioCounts,
  isFiltered,
  showVideos,
  onType,
  onRatio,
  onSearch,
  onReset,
}: {
  type: FilterType;
  ratio: string | null;
  search: string;
  typeCounts: { all: number; image: number; video: number };
  ratioCounts: { key: string; count: number }[];
  isFiltered: boolean;
  showVideos: boolean;
  onType: (t: FilterType) => void;
  onRatio: (r: string | null) => void;
  onSearch: (q: string) => void;
  onReset: () => void;
}) {
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <div className='w-44'>
        <Input
          name='mediaDialogSearch'
          type='text'
          value={search}
          placeholder='id or url'
          aria-label='search the media library'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
        />
      </div>

      {showVideos && (
        <ChipRow>
          <Chip selected={type === 'image'} onClick={() => onType(type === 'image' ? 'all' : 'image')}>
            photo {typeCounts.image}
          </Chip>
          <Chip selected={type === 'video'} onClick={() => onType(type === 'video' ? 'all' : 'video')}>
            video {typeCounts.video}
          </Chip>
        </ChipRow>
      )}

      {ratioCounts.length > 1 && (
        <ChipRow>
          {ratioCounts.slice(0, 6).map(({ key, count }) => (
            <Chip key={key} selected={ratio === key} onClick={() => onRatio(ratio === key ? null : key)}>
              <span className='flex items-center gap-1'>
                <RatioGlyph
                  ratio={key === OTHER_RATIO ? '1:1' : key}
                  size={9}
                  className={key === OTHER_RATIO ? 'opacity-40' : undefined}
                />
                {key === OTHER_RATIO ? 'other' : key} {count}
              </span>
            </Chip>
          ))}
        </ChipRow>
      )}

      {isFiltered && (
        // «сбросить ОТБОР» — тем же глаголом с тем же объектом, что в рельсе и на странице:
        // одна и та же команда не должна называться по-разному в трёх местах.
        <Button
          type='button'
          variant='underline'
          size='xs'
          className='text-labelColor hover:text-textColor'
          onClick={onReset}
        >
          clear filter
        </Button>
      )}

      <Text size='micro' variant='label' component='span' className='ml-auto'>
        ⌘V pastes from the clipboard
      </Text>
    </div>
  );
}
