import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  indexOfPin,
  useAnnotationSurface,
  type AnnotationValue,
} from 'ui/components/annotation/canvas';
import { AnnotationZoomDialog } from 'ui/components/annotation/zoom-dialog';
import { Chip } from 'ui/components/chip';
import type { MediaViewerItem } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import type { TaskMedia, TaskMediaAnnotations } from '../api/types';
import { mediaRefToken, type MediaRef } from './task-text';

/**
 * ОДНА ДВЕРЬ К ВЛОЖЕНИЮ КАРТОЧКИ — и ведёт она в ПОВЕРХНОСТЬ УКАЗАНИЙ.
 *
 * Открыть вложение просят из трёх мест: плитка в ряду вложений, чип посреди описания, чип в
 * комментарии. Если каждое заведёт себе смотрелку, то и открываться они будут по-разному — а
 * дальше их придётся менять по одному. Раньше за этой дверью стоял лайтбокс `MediaViewer`; теперь
 * тот же полноэкранный холст, что на экране операций тех-карты: зум, панорама, панель видов и
 * правка. Смотреть на снимок, о котором идёт спор, и не мочь ткнуть в него стрелкой — и была
 * исходная жалоба.
 *
 * `index` ряда СОВПАДАЕТ с позицией вложения в карточке: кадр без адреса не выбрасывается, а
 * остаётся своим местом в ряду. Отсев сдвинул бы номера — и чип `▣ 3` показал бы четвёртый снимок.
 */

const NO_ANNOTATIONS: AnnotationValue[] = [];

/**
 * ОТМЕТКА ЧИСЛА УКАЗАНИЙ НА ПЛИТКЕ — ОДНА НА ОБА РЯДА (форма и страница карточки).
 *
 * Слово и число чернилами, без цвета и без глифа — ровно как «used N» в библиотеке медиа: там
 * та же задача (сказать о кадре то, чего по нему не видно) и уже выбранное решение. Пустой снимок
 * не подписывается ничем: «notes 0» на каждой второй плитке утопило бы ряд.
 *
 * Ступень размера — единственная уступка месту: в форме плитка 64 пикселя, и десятипиксельное
 * «notes 3» вылезает за её край (замерено). Ступенью ниже — та же отметка, тем же словом.
 */
export function NotesMark({ count, size = 'micro' }: { count: number; size?: 'micro' | 'nano' }) {
  if (!count) return null;
  return (
    <Text size={size} component='span' className='tabular-nums'>
      notes {count}
    </Text>
  );
}

/** Указания одного вложения. Нет набора — пустой список, а не `undefined`: читателей у него трое. */
export function annotationsOf(sets: TaskMediaAnnotations[], mediaId: number): AnnotationValue[] {
  return sets.find((s) => s.mediaId === mediaId)?.annotations ?? NO_ANNOTATIONS;
}

export function useTaskMediaViewer({
  media,
  annotations,
  onChange,
  onCommit,
  canWrite = false,
}: {
  media: TaskMedia[];
  annotations: TaskMediaAnnotations[];
  /**
   * Каждая правка. Зовётся на каждый штрих — отметка «notes N» на плитке обязана меняться сразу,
   * иначе рисующий не видит, что его работа куда-то записалась.
   */
  onChange?: (next: TaskMediaAnnotations[]) => void;
  /**
   * Диалог закрыт, и состав указаний отличается от того, каким его открыли. Владелец, у которого
   * нет своей кнопки сохранения (страница карточки), пишет здесь; у формы её нет — там сохраняет
   * общая кнопка модалки.
   */
  onCommit?: (next: TaskMediaAnnotations[]) => void;
  /** Нет права записи — читать можно всё, писать нельзя ничего. */
  canWrite?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const items: MediaViewerItem[] = useMemo(
    () => media.map((m) => ({ src: m.fullSize || m.thumbnail || '', thumbnail: m.thumbnail })),
    [media],
  );

  const safeIndex = media.length ? Math.min(Math.max(index, 0), media.length - 1) : 0;
  const current = media[safeIndex];
  const currentId = current?.id ?? 0;
  const list = annotationsOf(annotations, currentId);

  /**
   * ВЫДЕЛЕНИЕ ПО ССЫЛКЕ ПЕРЕЖИВАЕТ СБРОС ДИАЛОГА, и это не украшение порядка вызовов.
   *
   * Диалог при смене кадра гасит выбор — он обязан: индекс, набранный на прошлом снимке, на новом
   * означает другое указание. Но открытие по ссылке `[[media:102#2]]` — это ровно смена кадра
   * плюс выбор, и сброс съедал бы его. Эффект без списка зависимостей стоит У ВЛАДЕЛЬЦА, то есть
   * РОДИТЕЛЯ диалога, а родительские эффекты React выполняет ПОСЛЕ детских: выбор ставится после
   * того, как диалог отработал свой сброс.
   */
  const pendingSelect = useRef<string | null>(null);
  useEffect(() => {
    if (pendingSelect.current === null) return;
    setSelectedKey(pendingSelect.current);
    pendingSelect.current = null;
  });

  // Состав указаний на момент ОТКРЫТИЯ: с ним сравнивается то, что получилось, — иначе владелец
  // не отличит «порисовал» от «посмотрел и закрыл» и слал бы запись после каждого просмотра.
  // Снимок берётся ЧЕРЕЗ ССЫЛКУ: `openAt` объявлена один раз на всю жизнь хука (её держат плитки
  // и чипы), и замыкание запомнило бы состав, каким он был при первом рендере.
  const openedWith = useRef<TaskMediaAnnotations[] | null>(null);
  const live = useRef(annotations);
  live.current = annotations;
  const openAt = useCallback((i: number) => {
    openedWith.current = live.current;
    setIndex(i);
    setSelectedKey(null);
    setOpen(true);
  }, []);

  const openMedia = useCallback(
    (ref: MediaRef) => {
      const i = media.findIndex((m) => m.id === ref.mediaId);
      if (i < 0) return;
      if (ref.note) {
        // Номер в ссылке — номер ПИНА, тот же, что человек видит на кадре и в легенде. Такого
        // номера может уже не быть (указание стёрли): тогда открывается просто кадр — ссылка
        // ведёт туда, куда вела, и молчит только о том, чего нет.
        const k = indexOfPin(annotationsOf(annotations, ref.mediaId), ref.note);
        pendingSelect.current = k >= 0 ? String(k) : null;
      }
      openAt(i);
    },
    [media, annotations, openAt],
  );

  function setForCurrent(next: AnnotationValue[]) {
    if (!onChange || !currentId) return;
    const i = annotations.findIndex((s) => s.mediaId === currentId);
    // ПОРЯДОК НАБОРОВ СОХРАНЯЕТСЯ. Он ничего не значит для чтения, но перекладывание набора в
    // конец на каждый штрих меняло бы полезную нагрузку там, где ничего не менялось.
    if (i >= 0) {
      const copy = [...annotations];
      if (next.length) copy[i] = { mediaId: currentId, annotations: next };
      else copy.splice(i, 1);
      onChange(copy);
      return;
    }
    if (next.length) onChange([...annotations, { mediaId: currentId, annotations: next }]);
  }

  const { surface } = useAnnotationSurface({
    src: current?.fullSize || current?.thumbnail || '',
    alt: current ? `attachment ${safeIndex + 1}` : '',
    annotations: list,
    onChange: canWrite && onChange ? setForCurrent : undefined,
    frozen: !canWrite,
    selectedKey,
    onSelect: setSelectedKey,
    // ПИКЕРА ДЕТАЛЕЙ КРОЯ ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ: деталей у карточки нет, а сервер эти ключи
    // очищает. Ряд, который ничего не выбирает, обещал бы связь, которой не будет.
    renderExtraEditor: ({ annotation, number }) =>
      currentId && (annotation.kind ?? 'pin') === 'pin' ? (
        <ReferenceChip token={mediaRefToken(currentId, number)} />
      ) : null,
  });

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      openedWith.current = annotations;
      return;
    }
    const was = openedWith.current;
    openedWith.current = null;
    setSelectedKey(null);
    if (was && onCommit && JSON.stringify(was) !== JSON.stringify(annotations))
      onCommit(annotations);
  }

  const node = current ? (
    <AnnotationZoomDialog
      {...surface}
      open={open}
      onOpenChange={handleOpenChange}
      title={`attachment ${safeIndex + 1}`}
      position={{ index: safeIndex, total: media.length }}
      onPrev={safeIndex > 0 ? () => setIndex(safeIndex - 1) : undefined}
      onNext={safeIndex < media.length - 1 ? () => setIndex(safeIndex + 1) : undefined}
    />
  ) : null;

  return { items, openIndex: openAt, openMedia, node };
}

/**
 * «Сослаться на это указание» — токен в буфер, чтобы вставить его в описание или комментарий.
 *
 * Замыкает круг «нарисовал → сослался словами»: без него человек, поставивший пин, должен был бы
 * пойти в текст и на память напечатать `[[media:102#3]]`, зная и id вложения (его нигде не видно),
 * и синтаксис.
 *
 * ТОЛЬКО У ПИНА, и это не экономия: `#N` адресует номер, а номер система рисует только пину.
 * Дать чип мерке значило бы выдать ссылку на число, которого на кадре не написано.
 */
function ReferenceChip({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  return (
    <Chip
      dashed={!done}
      title={`copy ${token} — paste it into the description or a comment`}
      onClick={() => {
        navigator.clipboard?.writeText(token);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? 'copied' : 'reference'}
    </Chip>
  );
}
