import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import {
  useCanHideUploadBar,
  useUploadIsLive,
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
  batchSummary,
  inheritanceNote,
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

function QueueRowView({
  row,
  busy,
  onAction,
}: {
  row: QueueRow;
  busy: boolean;
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

      <span className='w-[110px] flex-none'>
        <Progress value={barFraction(row) * 100} />
      </span>

      <span className='w-[140px] flex-none'>
        <Pill tone={PILL_TONE[statusTone(row)]}>{statusLabel(row)}</Pill>
      </span>

      <span className='flex flex-none items-center gap-1'>
        {actions.map((action) => (
          <Button
            key={action}
            size='xs'
            variant='secondary'
            disabled={busy || (action === 'assignTopics' && noTopics)}
            title={
              action === 'assignTopics' && noTopics
                ? 'у этой пачки не было тем — дописывать нечего'
                : undefined
            }
            onClick={() => onAction(action, row)}
          >
            {actionLabel(action)}
          </Button>
        ))}
      </span>
    </div>
  );
}

export function FilesUploadBar() {
  const navigate = useNavigate();
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

  const live = useUploadIsLive();
  const canHide = useCanHideUploadBar();
  const rows = queue.rows;
  const t = tally(queue);

  const topicsQuery = useFileTopics();
  const dictionary = topicsQuery.data?.topics;

  const dockRef = useRef<HTMLDivElement>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  /** Имена тем по id — для строки «что унаследует пачка» и итоговой сводки. */
  const nameOf = useMemo(() => {
    const map = new Map<number, string>();
    (dictionary ?? []).forEach((x) => map.set(Number(x.id), x.name ?? ''));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [dictionary]);

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
  useLayoutEffect(() => {
    const node = dockRef.current;
    if (!node) {
      setInset('');
      return;
    }
    const apply = () => setInset(`${node.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      setInset('');
    };
  }, [collapsed, hidden, rows.length]);

  // СТРАЖ ЗАКРЫТИЯ ВКЛАДКИ. Сейчас закрытие молча убивает отправку: XHR умирает вместе с
  // документом, и половина пачки просто не доезжает — узнать об этом можно только по тому,
  // что файлов в библиотеке меньше, чем бросали.
  useEffect(() => {
    if (!live) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Текст свой браузеры давно не показывают, но непустое значение всё ещё включает диалог.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [live]);

  // ПРИНЯТЫЙ ФАЙЛ МЕНЯЕТ ВЫДАЧУ. Инвалидация с задержкой: на пачке в сорок файлов
  // немедленная означала бы сорок перезапросов всех загруженных страниц подряд.
  useEffect(() => {
    if (!completions) return;
    const timer = setTimeout(() => qc.invalidateQueries({ queryKey: filesKeys.all }), 1200);
    return () => clearTimeout(timer);
  }, [completions, qc]);

  // ИТОГ ПАЧКИ СЛОВАМИ. Полосу часто сворачивают и уходят на другой экран — без этого
  // сообщения окончание отправки не наступает нигде.
  const wasLive = useRef(false);
  useEffect(() => {
    if (live) {
      wasLive.current = true;
      return;
    }
    if (!wasLive.current) return;
    wasLive.current = false;
    if (!queue.rows.length) return;
    const { labels } = labelsOf(queue.rows);
    showMessage(batchSummary(queue, labels), 'success');
    // Сводка снимается ровно на переходе «живое → отстоялось»; отдельные правки строк
    // (убрали одну, повторили другую) её не повторяют.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const giveTopics = async (row: QueueRow) => {
    const dup = row.duplicateOf;
    if (!dup) return;
    setBusyRow(row.id);
    try {
      // ДОПИСЫВАЮЩАЯ семантика: у оригинала свои темы, и replace стёр бы их ради пачки,
      // которая копией так и не стала.
      const res = await filesService.assignTopics({
        fileIds: [dup.id],
        topicIds: row.topicIds,
        newTopics: row.newTopics,
      });
      const n = Number(res.assigned ?? 0);
      showMessage(
        n ? `${dup.name}: новых связей ${n}` : `${dup.name}: эти темы уже стояли`,
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
        if (row.duplicateOf) navigate(`${ROUTES.files}/${row.duplicateOf.id}`);
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
      <div className='fixed bottom-2.5 right-2.5 z-[var(--z-dock)]'>
        <Button size='sm' variant='secondary' onClick={() => setHidden(false)}>
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
      className='fixed inset-x-0 bottom-0 z-[var(--z-dock)] border-t-2 border-textColor bg-bgColor'
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
          {notSent > 0 && <Pill tone='warn'>{notSent} не ушли</Pill>}
          {pending.length > 0 && !pendingTopics.labels.length && <Pill tone='attention'>без тем</Pill>}

          <div className='ml-auto flex flex-wrap items-center gap-1.5'>
            {t.lost + t.fail > 0 && (
              <Button size='sm' variant='main' onClick={retryAll}>
                повторить все ({t.lost + t.fail})
              </Button>
            )}
            {t.done + t.dup + t.big > 0 && (
              <Button size='sm' variant='secondary' onClick={clearSettled}>
                убрать отстоявшиеся ({t.done + t.dup + t.big})
              </Button>
            )}
            {/* ОТКАЗЫ ПОШТУЧНО НЕ УБИРАЮТСЯ (`rowActions`: у lost/fail есть только «повторить»),
                поэтому строке, которая никогда не уедет, нужен выход целой очередью. Кнопка
                появляется только на отстоявшейся очереди — иначе она обрывала бы живую отправку. */}
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
