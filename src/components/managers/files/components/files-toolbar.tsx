import { Link } from 'react-router-dom';
import { ROUTES } from 'constants/routes';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { SORT_LABEL, type FilesSort } from '../hooks/useFiles';

const SORT_ITEMS = (Object.keys(SORT_LABEL) as FilesSort[]).map((k) => ({
  value: k,
  label: SORT_LABEL[k],
}));

/**
 * Полоса управления холстом.
 *
 * Подпись поиска — обязательство, а не украшение: сервер ищет по имени файла, по названию
 * темы и по имени того, кто загрузил, и НЕ смотрит внутрь файла (текст из pdf, выгруженного
 * фигмой, не извлекается вообще). Подпись уже поведения хуже её отсутствия: человек ищет по
 * имени коллеги, не находит и делает вывод, что поиск сломан.
 */
export function FilesToolbar({
  search,
  onSearch,
  sort,
  onSort,
  mode,
  onMode,
  canWrite,
  onUpload,
  className,
}: {
  search: string;
  onSearch: (v: string) => void;
  sort: FilesSort;
  onSort: (v: FilesSort) => void;
  /** Добровольный режим. Без `files:write` принудительно `read` и заблокирован. */
  mode: 'write' | 'read';
  onMode: (v: 'write' | 'read') => void;
  canWrite: boolean;
  onUpload: () => void;
  /** Полоса — часть общего блока со словарём тем, поэтому свой внешний бордер она снимает. */
  className?: string;
}) {
  const writing = canWrite && mode === 'write';
  return (
    <Toolbar className={className}>
      <Input
        name='search'
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
        placeholder='имя файла, тема или человек'
        className='max-w-[260px]'
      />
      <Text size='micro' variant='label' className='max-w-[40ch]'>
        ищет по именам, темам и людям, не по содержимому файла
      </Text>
      <SelectComponent
        name='sort'
        value={sort}
        onValueChange={(v: string) => onSort(v as FilesSort)}
        placeholder='порядок'
        items={SORT_ITEMS}
        customWidth={160}
        className='max-w-[170px]'
      />
      <ToolbarSpacer />
      {/* Словарь тем правится на своём экране: здесь чип по клику фильтрует, и правка имени
          на том же элементе потребовала бы второго жеста. */}
      <Button asChild size='xs' variant='secondary'>
        <Link to={ROUTES.fileTopics}>темы</Link>
      </Button>
      {/* Тумблер и права — ОДИН механизм. Без files:write он не «спрятан», а заблокирован в
          «чтении»: спрятанного не попросишь, а строка над сеткой объясняет, чего не хватает. */}
      <Button
        size='xs'
        variant='secondary'
        aria-pressed={mode === 'write'}
        disabled={!canWrite}
        title={canWrite ? undefined : 'нужно право files:write'}
        onClick={() => onMode(mode === 'write' ? 'read' : 'write')}
      >
        {writing ? 'режим: запись' : 'режим: только чтение'}
      </Button>
      <Button size='xs' variant='main' disabled={!writing} onClick={onUpload}>
        загрузить
      </Button>
    </Toolbar>
  );
}
