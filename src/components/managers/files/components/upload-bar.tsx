import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ROUTES } from 'constants/routes';
import { useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
import {
  noteUploadBarMounted,
  useCanHideUploadBar,
  useUploadQueueStore,
} from 'lib/stores/upload-queue';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Progress } from 'ui/components/progress';
import { SkeletonLine } from 'ui/components/skeleton';
import Text from 'ui/components/text';
import { MAX_UPLOAD_BYTES, filesService } from '../api/filesService';
import { filesKeys, useFileTopics } from '../hooks/useFiles';
import {
  barFraction,
  inheritTopics,
  isLive,
  rowActions,
  tally,
  type QueueAction,
  type QueueRow,
} from '../upload/queue';
import {
  actionLabel,
  inheritanceNote,
  plural,
  rowWhy,
  statusLabel,
  statusTone,
  summaryLine,
} from '../upload/text';
import { extensionOf, formatBytes } from '../utils/format';

/**
 * ЗАГРУЗКА — ПОЛОСА СНИЗУ, А НЕ ДИАЛОГ.
 *
 * Диалог загрузки (`UploadDialog`) держал очередь в своём состоянии, поэтому закрытие диалога
 * или переход в другую тему молча убивали отправку — а первый настоящий сеанс этого раздела
 * выглядит как «бросил сорок накопившихся макетов и пошёл работать дальше». Полоса ничего не
 * блокирует: сетка под ней живая, карточку можно открыть, тему — переключить.
 *
 * Компонент — ТОЛЬКО ЗРИТЕЛЬ стора `lib/stores/upload-queue`. XHR живут там, в модуле, который
 * не размонтируется; здесь нет ни одного собственного состояния очереди, и размонтирование
 * полосы (уход на экран тем) отправку не трогает.
 *
 * Слова — из `upload/text.ts`, переходы — из `upload/queue.ts`. Здесь верстка и три побочных
 * эффекта: занятый низ экрана, страж закрытия вкладки и инвалидация выдачи.
 */

/**
 * Сколько принятых сервером файлов уже отражено в выдаче. Живёт в модуле, потому что полоса
 * размонтируется на каждом уходе из раздела, а очередь — нет.
 */
let reflectedCompletions = 0;

const PILL_TONE = {
  ok: 'ok',
  warn: 'warn',
  att: 'attention',
  ink: 'ink',
  plain: 'mut',
} as const;

/**
 * Занятый полосой низ экрана, объявленный всей странице.
 *
 * Прецедент — док очереди медиа (`pending-media-plate.tsx`): отступ `body` поднимает то, что
 * лежит в потоке, а `--dock-bottom-h` + `data-dock-bottom` поднимают прилипшее к низу вьюпорта
 * (правило в `global.css`). Без второго полоса группового выбора файлов — `sticky bottom-0` —
 * ушла бы под эту полосу вместе со всеми своими кнопками.
 */
function setInset(px: string) {
  document.body.style.paddingBottom = px;
  if (px) {
    document.body.style.setProperty('--dock-bottom-h', px);
    document.body.dataset.dockBottom = '';
  } else {
    document.body.style.removeProperty('--dock-bottom-h');
    delete document.body.dataset.dockBottom;
  }
}

/** Мини-кадр строки: расширение, а не превью. Превью живёт в движке и наружу не выдаётся. */
function RowMini({ row }: { row: QueueRow }) {
  return (
    <span className='flex size-7 flex-none items-center justify-center overflow-hidden border border-borderColor bg-bgSecondary'>
      {row.status === 'prev' ? (
        <SkeletonLine className='h-7' />
      ) : (
        <Text size='nano' variant='label' component='span' className='uppercase'>
          {extensionOf(row.name)}
        </Text>
      )}
    </span>
  );
}

/** Действия, которые ПИШУТ: повтор уводит файл в библиотеку, «дать темы» правит чужую запись. */
const WRITER_ACTIONS: QueueAction[] = ['retry', 'assignTopics'];

function QueueRowView({
  row,
  busy,
  writable,
  onAction,
}: {
  row: QueueRow;
  busy: boolean;
  /** Право плюс тумблер режима. Отмена и «убрать» живут и без него: они ничего не пишут. */
  writable: boolean;
  onAction: (action: QueueAction, row: QueueRow) => void;
}) {
  const actions = rowActions(row);
  // «Дать ему темы» без тем — пустое действие: пачка уехала в «разобрать», дописывать нечего.
  const noTopics = !row.topicIds.length && !row.newTopics.length;

  return (
    <div
      role='listitem'
      className='flex flex-wrap items-center gap-2 border-b border-hairline px-2.5 py-1 last:border-b-0'
    >
      <RowMini row={row} />

      <span className='flex min-w-[180px] flex-1 flex-col'>
        <Text component='span' className='truncate leading-tight' title={row.name}>
          {row.name}
        </Text>
        <Text size='micro' variant='label' component='span' className='truncate leading-tight'>
          {rowWhy(row, MAX_UPLOAD_BYTES)}
        </Text>
      </span>

      <Text size='micro' variant='label' component='span' className='w-16 flex-none text-right tabular-nums'>
        {formatBytes(row.size)}
      </Text>

      {/* Полоска — та же величина, что уже сказана словами в пилюле рядом, поэтому для
          скринридера она молчит: безымянный progressbar иначе читается как «60 процентов»
          посреди строки, без ответа на вопрос «чего именно». */}
      <span className='w-[110px] flex-none' aria-hidden>
        <Progress value={barFraction(row) * 100} />
      </span>

      <span className='w-[140px] flex-none'>
        <Pill tone={PILL_TONE[statusTone(row)]}>{statusLabel(row)}</Pill>
      </span>

      <span className='flex flex-none items-center gap-1'>
        {actions.map((action) => {
          const writer = WRITER_ACTIONS.includes(action);
          const off = busy || (writer && !writable) || (action === 'assignTopics' && noTopics);
          return (
            <Button
              key={action}
              size='xs'
              variant='secondary'
              disabled={off}
              title={
                writer && !writable
                  ? 'сейчас только чтение — загрузка и правка выключены'
                  : action === 'assignTopics' && noTopics
                    ? 'у этой пачки не было тем — дописывать нечего'
                    : undefined
              }
              onClick={() => onAction(action, row)}
            >
              {actionLabel(action)}
            </Button>
          );
        })}
      </span>
    </div>
  );
}

export function FilesUploadBar({
  mayWrite,
}: {
  /**
   * ПРАВО, а не готовый `writable`. Тумблер «только чтение» полоса читает из стора сама:
   * пока она получала его подмешанным снаружи, экран тем — второй, где она стоит, — про
   * тумблер не знал, и поставленный на холсте режим чтения там молча отменялся.
   */
  mayWrite: boolean;
}) {
  const writable = useFilesWritable(mayWrite);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();

  const queue = useUploadQueueStore((s) => s.queue);
  const collapsed = useUploadQueueStore((s) => s.collapsed);
  const hidden = useUploadQueueStore((s) => s.hidden);
  const completions = useUploadQueueStore((s) => s.completions);
  const setCollapsed = useUploadQueueStore((s) => s.setCollapsed);
  const setHidden = useUploadQueueStore((s) => s.setHidden);
  const cancel = useUploadQueueStore((s) => s.cancel);
  const dismiss = useUploadQueueStore((s) => s.dismiss);
  const retry = useUploadQueueStore((s) => s.retry);
  const retryAll = useUploadQueueStore((s) => s.retryAll);
  const clearSettled = useUploadQueueStore((s) => s.clearSettled);
  const reset = useUploadQueueStore((s) => s.reset);
  const setTopicNames = useUploadQueueStore((s) => s.setTopicNames);

  const canHide = useCanHideUploadBar();
  const rows = queue.rows;
  const t = tally(queue);

  const topicsQuery = useFileTopics();
  const dictionary = topicsQuery.data?.topics;

  const dockRef = useRef<HTMLDivElement>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  // Пока полоса на экране, итог пачки печатает она сама; ушла — итог достаётся тостом из
  // стора. Стор обязан знать, кто из двоих сейчас на месте.
  useEffect(() => noteUploadBarMounted(), []);

  /** Имена тем по id — для строки «что унаследует пачка» и итоговой сводки. */
  const nameOf = useMemo(() => {
    const map = new Map<number, string>();
    (dictionary ?? []).forEach((x) => map.set(Number(x.id), x.name ?? ''));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [dictionary]);

  // Словарь уезжает в стор: итоговую сводку показывают и тому, кто из раздела ушёл, а там
  // react-query уже не спросить — «#7» вместо «съёмка» ему ничего не скажет.
  useEffect(() => {
    const names: Record<number, string> = {};
    (dictionary ?? []).forEach((x) => {
      names[Number(x.id)] = x.name ?? '';
    });
    setTopicNames(names);
  }, [dictionary, setTopicNames]);

  const labelsOf = useMemo(
    () => (list: QueueRow[]) => {
      const union = inheritTopics(
        list.flatMap((r) => r.topicIds),
        list.flatMap((r) => r.newTopics),
      );
      return {
        topics: union,
        labels: [...union.topicIds.map(nameOf), ...union.newTopics],
      };
    },
    [nameOf],
  );

  const pending = rows.filter((r) => isLive(r.status));
  const pendingTopics = labelsOf(pending);

  // ЗАНЯТЫЙ НИЗ ЭКРАНА. Полоса перекрывает последний ряд плиток, а под ней живая сетка —
  // страница обязана узнать высоту полосы, иначе последний ряд навсегда останется под ней.
  //
  // Меряется РАССТОЯНИЕ ОТ НИЗА ОКНА, а не высота узла: свёрнутая до кнопки «показать
  // загрузку» полоса висит в 10px над краем, и по высоте кнопки полоса выделения всё равно
  // ложилась бы поверх неё.
  useLayoutEffect(() => {
    const node = dockRef.current;
    if (!node) {
      setInset('');
      return;
    }
    const apply = () =>
      setInset(`${Math.max(0, Math.round(window.innerHeight - node.getBoundingClientRect().top))}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      setInset('');
    };
  }, [collapsed, hidden, rows.length]);

  // СТРАЖ ЗАКРЫТИЯ ВКЛАДКИ переехал В СТОР (`lib/stores/upload-queue`): здесь он защищал
  // только тех, кто не уходил с двух экранов раздела, — то есть как раз не тот случай,
  // ради которого очередь и вынесена из компонентов.

  // ПРИНЯТЫЙ ФАЙЛ МЕНЯЕТ ВЫДАЧУ. Инвалидация с задержкой: на пачке в сорок файлов
  // немедленная означала бы сорок перезапросов всех загруженных страниц подряд.
  //
  // Счётчик отражённого — МОДУЛЬНЫЙ, а не в компоненте: полосу размонтирует любой уход из
  // раздела, а отправка при этом продолжается. Без него файлы, доехавшие «в фоне», не
  // появлялись бы в сетке до истечения staleTime (полчаса) — выдача выглядела бы отставшей
  // ровно у того, кто эти файлы и загрузил.
  useEffect(() => {
    if (completions === reflectedCompletions) return;
    const timer = setTimeout(() => {
      reflectedCompletions = completions;
      qc.invalidateQueries({ queryKey: filesKeys.all });
    }, 1200);
    return () => clearTimeout(timer);
  }, [completions, qc]);

  // ИТОГ ПАЧКИ СЛОВАМИ тоже переехал в стор — по той же причине: его показывают ровно тому,
  // кто ушёл со страницы и в полосу больше не смотрит. Стор знает, смонтирована ли полоса
  // (`noteUploadBarMounted`) и свёрнута ли она, и молчит, когда итог и так перед глазами.

  const giveTopics = async (row: QueueRow) => {
    const dup = row.duplicateOf;
    if (!dup) return;
    setBusyRow(row.id);
    try {
      // ДОПИСЫВАЮЩАЯ семантика: у того файла свои темы, и replace стёр бы их ради тем пачки,
      // которая пришла позже.
      const res = await filesService.assignTopics({
        fileIds: [dup.id],
        topicIds: row.topicIds,
        newTopics: row.newTopics,
      });
      const n = Number(res.assigned ?? 0);
      // Те же слова, что у групповой простановки тем в полосе выделения: один и тот же исход,
      // названный в двух местах по-разному, читается как два разных исхода.
      showMessage(
        n ? `${dup.name} — новых связей: ${n}` : `${dup.name} — эти темы уже стояли`,
        'success',
      );
      qc.invalidateQueries({ queryKey: filesKeys.all });
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'не удалось дописать темы', 'error');
    } finally {
      setBusyRow(null);
    }
  };

  const onAction = (action: QueueAction, row: QueueRow) => {
    switch (action) {
      case 'cancel':
        // ОТМЕНА НА 100% УЖЕ НИЧЕГО НЕ ОТМЕНЯЕТ: байты ушли, и сервер, скорее всего, файл
        // сохранил — обрыв соединения происходит уже после. Молчать здесь нельзя (человек
        // уверен, что отменил) и обещать нельзя (ответа мы не дождались), поэтому говорим
        // как есть и перепрашиваем выдачу: иначе доехавший файл всплыл бы через полчаса.
        if (row.status === 'run' && row.progress >= 1) {
          showMessage(
            `${row.name} — файл уже ушёл целиком: если сервер успел его сохранить, он в библиотеке`,
            'success',
          );
          qc.invalidateQueries({ queryKey: filesKeys.all });
        }
        cancel(row.id);
        return;
      case 'dismiss':
        dismiss(row.id);
        return;
      case 'retry':
        retry(row.id);
        return;
      case 'reveal':
        // Карточка оригинала — модальный роут поверх сетки; полоса при этом остаётся на месте.
        // С ТЕКУЩИМ ПОИСКОМ: голый /files/:id стирает выбранные чипы и строку поиска, а
        // холст держит прямо противоположный контракт — фильтр живёт в адресе.
        if (row.duplicateOf) {
          navigate({
            pathname: `${ROUTES.files}/${row.duplicateOf.id}`,
            search: location.search,
          });
        }
        return;
      case 'assignTopics':
        void giveTopics(row);
        return;
      default:
        return;
    }
  };

  if (!rows.length) return null;

  // Полосу УБРАЛИ — но отправка идёт. Возврат обязан быть на экране: иначе очередь, которая
  // продолжает есть канал, становится невидимой совсем.
  if (hidden) {
    return createPortal(
      // ПО ЦЕНТРУ, А НЕ В УГЛУ: углы низа уже заняты — слева тосты, справа кнопка devtools в
      // разработке. Возврат стоит там же, где стояла полоса, и читается как её след.
      //
      // Тот же `dockRef`, что у развёрнутой полосы: убранная полоса ТОЖЕ занимает низ экрана,
      // и без объявленной высоты полоса группового выбора (`sticky bottom-0`) ложилась прямо
      // поверх этой кнопки.
      <div ref={dockRef} className='fixed bottom-2.5 left-1/2 z-[var(--z-dock)] -translate-x-1/2'>
        <Button size='sm' variant='main' onClick={() => setHidden(false)}>
          показать загрузку ({rows.length})
        </Button>
      </div>,
      document.body,
    );
  }

  const notSent = t.big + t.lost + t.fail;

  const dock = (
    <div
      ref={dockRef}
      role='region'
      aria-label='очередь загрузки'
      // МЕБЕЛЬ СТРАНИЦЫ, А НЕ ТОСТ: очередь идёт фоном и ничего не спрашивает, поэтому она
      // ЛЕЖИТ НИЖЕ МОДАЛКИ (иначе накрыла бы подвал карточки файла — обе его кнопки).
      //
      // Край — обычная 1px рамка: 2px чернилами по DESIGN.md — это линейка ПОД ЗАГОЛОВКОМ
      // блока, а не кант мебели, и лишний вес здесь читается как заголовок страницы.
      className='fixed inset-x-0 bottom-0 z-[var(--z-dock)] border-t border-borderColor bg-bgColor'
    >
      <div className='mx-auto w-full max-w-[1400px] px-2.5'>
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 py-1.5',
            !collapsed && 'border-b border-hairline',
          )}
        >
          <Text component='h2' size='control' variant='uppercase' tracking='group' className='font-bold'>
            загрузка
          </Text>
          {/* СВЁРНУТАЯ ПОЛОСА ЧИТАЕТСЯ БОКОВЫМ ЗРЕНИЕМ, поэтому сводка — слова, а не цвет:
              «готово 3 из 7 · идёт 1 · обрыв» видно, не приглядываясь, а красную точку — нет. */}
          <Text size='micro' variant='label' component='p' className='min-w-0 truncate'>
            {summaryLine(queue)}
          </Text>
          {/* Склонение — из `upload/text.ts`, как и везде в разделе: «1 не ушли» в пилюле рядом
              с аккуратной сводкой читается как недоделанный шаблон. */}
          {notSent > 0 && (
            <Pill tone='warn'>
              {notSent} {plural(notSent, 'не ушёл', 'не ушли', 'не ушли')}
            </Pill>
          )}
          {pending.length > 0 && !pendingTopics.labels.length && <Pill tone='attention'>без тем</Pill>}

          <div className='ml-auto flex flex-wrap items-center gap-1.5'>
            {/* Число — только те отказы, которые повтор ЛЕЧИТ. Сорок 401 после истёкшей
                сессии кнопка не предлагает: она отправила бы их заново за тем же ответом. */}
            {t.retryable > 0 && (
              <Button
                size='sm'
                variant='main'
                disabled={!writable}
                title={writable ? undefined : 'сейчас только чтение — отправка выключена'}
                onClick={retryAll}
              >
                повторить все ({t.retryable})
              </Button>
            )}
            {t.done + t.dup + t.big > 0 && (
              <Button size='sm' variant='secondary' onClick={clearSettled}>
                убрать отстоявшиеся ({t.done + t.dup + t.big})
              </Button>
            )}
            {/* Повторяемый отказ поштучно не убирается (`rowActions`: у него одно действие —
                «повторить»), поэтому строке, которая никогда не уедет, нужен выход целой
                очередью. Кнопка появляется только на отстоявшейся очереди — иначе она
                обрывала бы живую отправку. */}
            {canHide && t.lost + t.fail > 0 && (
              <Button
                size='sm'
                variant='secondary'
                title='очередь забудет всё, включая отказы; отправленное останется в библиотеке'
                onClick={reset}
              >
                очистить
              </Button>
            )}
            <Button
              size='sm'
              variant='secondary'
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? 'развернуть' : 'свернуть'}
            </Button>
            {/* «УБРАТЬ» ЗАБЛОКИРОВАНО, ПОКА ИДЁТ ОТПРАВКА: спрятать полосу можно, отправку —
                нет, и полоса остаётся единственным местом, где отмена вообще существует. */}
            <Button
              size='sm'
              variant='secondary'
              disabled={!canHide}
              title={canHide ? undefined : 'пока идёт отправка — прятать нечего'}
              onClick={() => setHidden(true)}
            >
              убрать
            </Button>
          </div>
        </div>

        {!collapsed && (
          <>
            {pending.length > 0 && (
              <Text size='micro' variant='label' component='p' className='py-1'>
                {inheritanceNote(pendingTopics.topics, pendingTopics.labels, pending.length)}
              </Text>
            )}
            <div className='max-h-[42vh] overflow-y-auto' role='list' aria-label='файлы в очереди'>
              {rows.map((row) => (
                <QueueRowView
                  key={row.id}
                  row={row}
                  busy={busyRow === row.id}
                  writable={writable}
                  onAction={onAction}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // Полоса живёт над страницей, а не там, где смонтирована: она мебель раздела, а не элемент
  // сетки — вложенная в неё, она уехала бы вместе с прокруткой и попала бы под чужой overflow.
  return createPortal(dock, document.body);
}
