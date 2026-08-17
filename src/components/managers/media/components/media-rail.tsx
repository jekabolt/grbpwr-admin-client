import { Button } from 'ui/components/button';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import { SideRail, SideRailGroup, SideRailItem } from 'ui/components/side-rail';
import Text from 'ui/components/text';
import { FilterType, OTHER_RATIO, UsageShelf } from '../utils/useFilter';

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
  usageShelf,
  typeCounts,
  ratioCounts,
  usageCounts,
  usagePending,
  usageFailed,
  isFiltered,
  loaded,
  onType,
  onRatio,
  onUsage,
  onReset,
}: {
  type: FilterType;
  ratio: string | null;
  usageShelf: UsageShelf | null;
  typeCounts: { all: number; image: number; video: number };
  ratioCounts: { key: string; count: number }[];
  /** Свободно / занято и сколько ещё не выяснено — последнее подписывается, а не прячется. */
  usageCounts: { free: number; used: number; unknown: number };
  /** Запрос занятости ещё идёт. Отличает «сейчас узнаем» от «узнать не удалось». */
  usagePending: boolean;
  /** Хотя бы одна корзина занятости не ответила. */
  usageFailed: boolean;
  isFiltered: boolean;
  /** Сколько объектов подгружено — знаменатель, к которому относятся все счётчики. */
  loaded: number;
  onType: (t: FilterType) => void;
  onRatio: (r: string | null) => void;
  onUsage: (u: UsageShelf | null) => void;
  onReset: () => void;
}) {
  const usageKnown = usageCounts.free + usageCounts.used;
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

      {/* ПОЛКА ЗАНЯТОСТИ ПОЯВЛЯЕТСЯ ПО ОТВЕТУ, А НЕ ЗАРАНЕЕ. Пустая полка «free 0 / in use 0»,
          висящая, пока ответ в пути, читается как «библиотека вся свободна» — то самое, из-за
          чего удаление было рулеткой. Невыясненное вместо этого названо числом ниже.
          Но если полка УЖЕ ВЫБРАНА, она остаётся видимой при любых счётчиках: цифры сужены
          типом и соотношением, и на их пересечении ноль прятал бы единственную кнопку, которой
          отбор снимается, — сетка оставалась бы пустой без видимой причины. */}
      {(usageKnown > 0 || usageShelf !== null) && (
        <>
          <SideRailGroup>usage</SideRailGroup>
          <SideRailItem
            label='free'
            count={usageCounts.free}
            selected={usageShelf === 'free'}
            onClick={() => onUsage(usageShelf === 'free' ? null : 'free')}
          />
          <SideRailItem
            label='in use'
            count={usageCounts.used}
            selected={usageShelf === 'used'}
            onClick={() => onUsage(usageShelf === 'used' ? null : 'used')}
          />
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
      {/* ТРИ РАЗНЫХ МОЛЧАНИЯ. Пока запрос идёт — «считаем»; если корзина не ответила — так и
          сказано, иначе провал выглядел бы как вечное «ещё не проверено» и человек ждал бы
          ответа, которого не будет. Остаток — честное «столько ещё не спрошено». */}
      {usageFailed ? (
        <Text size='micro' variant='label' component='p'>
          usage could not be checked
        </Text>
      ) : usagePending ? (
        <Text size='micro' variant='label' component='p'>
          checking usage…
        </Text>
      ) : (
        usageCounts.unknown > 0 && (
          <Text size='micro' variant='label' component='p'>
            {usageCounts.unknown} not checked for usage yet
          </Text>
        )
      )}
    </SideRail>
  );
}
