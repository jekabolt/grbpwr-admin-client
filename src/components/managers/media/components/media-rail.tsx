import { Button } from 'ui/components/button';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import { SideRail, SideRailGroup, SideRailItem } from 'ui/components/side-rail';
import Text from 'ui/components/text';
import { FilterType, OTHER_RATIO } from '../utils/useFilter';

/**
 * Рельс отбора медиатеки: тип и форма кадра со счётчиками.
 *
 * До него весь отбор был тремя контролами в шапке (поиск, тип, порядок), и на вопрос «что у меня
 * вообще лежит» ответа не было: чтобы узнать, есть ли в библиотеке хоть один кадр 2:1 под баннер,
 * приходилось листать бесконечную сетку. Рельс отвечает на него до первого движения колесом.
 *
 * Цифры считаются по УЖЕ ЗАГРУЖЕННЫМ страницам: `ListObjectsPaged` не отдаёт ни общего числа, ни
 * разбивки. Молчаливый счётчик читался бы как «во всей библиотеке», поэтому знаменатель подписан
 * прямо под рельсом.
 */
export function MediaRail({
  type,
  ratio,
  typeCounts,
  ratioCounts,
  isFiltered,
  loaded,
  onType,
  onRatio,
  onReset,
}: {
  type: FilterType;
  ratio: string | null;
  typeCounts: { all: number; image: number; video: number };
  ratioCounts: { key: string; count: number }[];
  isFiltered: boolean;
  /** Сколько объектов подгружено — знаменатель, к которому относятся все счётчики. */
  loaded: number;
  onType: (t: FilterType) => void;
  onRatio: (r: string | null) => void;
  onReset: () => void;
}) {
  return (
    <SideRail className='sticky top-2.5'>
      <SideRailGroup flush>type</SideRailGroup>
      <SideRailItem
        label='all'
        count={typeCounts.all}
        selected={type === 'all'}
        onClick={() => onType('all')}
      />
      <SideRailItem
        label='photo'
        count={typeCounts.image}
        selected={type === 'image'}
        onClick={() => onType(type === 'image' ? 'all' : 'image')}
      />
      <SideRailItem
        label='video'
        count={typeCounts.video}
        selected={type === 'video'}
        onClick={() => onType(type === 'video' ? 'all' : 'video')}
      />

      {ratioCounts.length > 0 && (
        <>
          <SideRailGroup>ratio</SideRailGroup>
          {ratioCounts.map(({ key, count }) => (
            <SideRailItem
              key={key}
              selected={ratio === key}
              count={count}
              onClick={() => onRatio(ratio === key ? null : key)}
              label={
                <span className='flex items-center gap-1.5'>
                  <RatioGlyph
                    ratio={key === OTHER_RATIO ? '1:1' : key}
                    size={10}
                    className={key === OTHER_RATIO ? 'opacity-40' : undefined}
                  />
                  {key === OTHER_RATIO ? 'other' : key}
                </span>
              }
            />
          ))}
        </>
      )}

      {isFiltered && (
        <Button size='xs' className='mt-2 w-full' onClick={onReset}>
          clear filter
        </Button>
      )}

      <Text size='micro' variant='label' component='p' className='mt-2'>
        counted over the {loaded} loaded so far
      </Text>
    </SideRail>
  );
}
