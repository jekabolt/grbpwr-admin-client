import { useMemo, useState, type ReactNode } from 'react';

import { AnnotationEditor } from './editor';
import { useEditHistory } from './history';
import { kindDef } from './kinds';
import {
  AnnotationSurface,
  rememberPen,
  type PenStyle,
  type ShapePoint,
  type SurfaceCallout,
} from './surface';
import { AnnotationZoomDialog } from './zoom-dialog';

// ХОЛСТ УКАЗАНИЙ — ДОМЕННО-НЕЙТРАЛЬНЫЙ АДАПТЕР над поверхностью.
//
// Сама поверхность (`surface.tsx`) не знает ни формы карточки, ни задачи: она принимает вью-модель
// указания и отдаёт гранулярные правки. Здесь живёт ровно перевод в обе стороны — значение
// владельца ↔ вью-модель — и сборка `surface`-объекта.
//
// ЖИВЁТ В `ui/`, А НЕ В ТЕХ-КАРТЕ. Владельцев указаний теперь двое: снимок шага сборки и вложение
// задачи. Импортировать адаптер из `managers/tech-card` в `managers/tasks` значило бы связать два
// домена через голову общего слоя — и первая же правка тех-карты меняла бы поведение задач.
// Доменное (типы значения, пикер деталей кроя, подписи деталей) остаётся у владельца тонкой
// обёрткой.
//
// РЕЖИМ ПОДПИСИ — ПЛАШКА. Швея читает лист у машинки, и текст обязан стоять на самом снимке рядом
// со стрелкой: легенда-таблица здесь лишний прыжок глазами, а на десяток фото он умножается.
// Карточный эскиз работает наоборот (нумерованный маркер + таблица) — см. довод в surface.tsx.
//
// КООРДИНАТЫ ХРАНЯТСЯ СТРОКАМИ. Тот же decimal, что на проводе и в БД: круговой рейс без
// округлений. Поверхность считает числами, поэтому перевод — здесь, и только здесь.

/** Зеркало серверного предела: узнать о нём при сохранении всей карточки — поздно. */
const MAX_ANNOTATIONS = 30;

/**
 * ЗНАЧЕНИЕ УКАЗАНИЯ У ВЛАДЕЛЬЦА. Структурно — то, что лежит в JSON-колонке и приезжает по проводу
 * как `TechCardAnnotation`: и снимок шага, и вложение задачи хранят ОДНО И ТО ЖЕ.
 *
 * Виды и цвета здесь `string`, а не union: домен сужает их своей схемой (zod у тех-карты), а холст
 * обязан пережить незнакомый ключ с провода — реестр всё равно разрешит его в пин.
 */
export type AnnotationValue = {
  kind: string;
  points: { x: string; y: string }[];
  text: string;
  labelX: string;
  labelY: string;
  color: string;
  dashed: boolean;
  filled: boolean;
  pieceLineKey: string;
  pieceLineKeys: string[];
};

const num = (v?: string) => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const str = (n: number) => String(Math.round(n * 10000) / 10000);

/** Номер пина = его порядок СРЕДИ ПИНОВ: легенда нумеруется подряд, а не по общему списку. */
export function pinNumber(list: AnnotationValue[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i++) if ((list[i]?.kind ?? 'pin') === 'pin') n++;
  return n;
}

/** Индекс указания по номеру пина. -1 — такого номера на кадре нет. */
export function indexOfPin(list: AnnotationValue[], number: number): number {
  for (let i = 0; i < list.length; i++) {
    if ((list[i]?.kind ?? 'pin') === 'pin' && pinNumber(list, i) === number) return i;
  }
  return -1;
}

export type AnnotationSurfaceOptions = {
  src: string;
  alt?: string;
  annotations: AnnotationValue[];
  /** Отсутствует = холст только читается. Печать и архив зовут его именно так. */
  onChange?: (next: AnnotationValue[]) => void;
  frozen?: boolean;
  /** Пикер детали кроя. Получает уже выбранные, чтобы помечать их в списке, и отдаёт ключ. */
  renderPiecePicker?: (opts: {
    selected: string[];
    onPick: (lineKey: string) => void;
  }) => ReactNode;
  pieceLabel?: (lineKey: string) => string | undefined;
  /**
   * Строка редактора, которая есть только у ЭТОГО владельца (слот `extra` редактора). У вложения
   * задачи это «сослаться на указание из текста».
   */
  renderExtraEditor?: (ctx: {
    index: number;
    annotation: AnnotationValue;
    number: number;
  }) => ReactNode;
  /** Выбранное указание, когда выбором владеет ВЫЗЫВАЮЩИЙ (ссылка из текста открывает кадр на нём). */
  selectedKey?: string | null;
  onSelect?: (key: string | null, opts?: { focus?: boolean }) => void;
};

/**
 * Сборка `surface`-объекта — ОТДЕЛЬНО ОТ ОТРИСОВКИ КАДРА.
 *
 * Инлайн-кадр нужен не всем: вложение задачи открывается сразу во весь экран по клику на плитку, и
 * второй кадр под плиткой был бы лишней картинкой. Держать ради этого два адаптера значило бы
 * разойтись в правилах правки — а правка тут и есть всё содержание.
 */
export function useAnnotationSurface({
  src,
  alt,
  annotations,
  onChange,
  frozen = false,
  renderPiecePicker,
  pieceLabel,
  renderExtraEditor,
  selectedKey,
  onSelect,
}: AnnotationSurfaceOptions) {
  // ⌘Z откатывает ЖЕСТ над фигурой. Правка текста сюда не входит: там откат принадлежит браузеру.
  const history = useEditHistory(annotations, (prev) => onChange?.(prev));
  const editable = !frozen && !!onChange;

  // ВЬЮ-МОДЕЛЬ. Ключ — ИНДЕКС строкой: у выноски снимка шага своей идентичности нет (массив лежит
  // в JSON-колонке), и заводить её ради ключа значило бы добавить поле, которого сервер не хранит.
  // Индекс безопасен, потому что запись идёт не через замыкание слушателя, а по свежему массиву:
  // поверхность читает `live`-ссылку на момент записи, а не то, что было при подписке.
  const callouts: SurfaceCallout[] = useMemo(
    () =>
      annotations.map((a, i) => ({
        key: String(i),
        kind: a.kind ?? 'pin',
        points: (a.points ?? []).map((p) => ({ x: num(p.x), y: num(p.y) })),
        label: { x: num(a.labelX), y: num(a.labelY) },
        // НОМЕР ТОЛЬКО У ПИНА. У выноски снимка шага номер — порядок в легенде, а не адрес: на
        // неё никто не ссылается снаружи. Дать его фигуре значило бы напечатать на плашке число,
        // которое ничего не адресует.
        number: (a.kind ?? 'pin') === 'pin' ? pinNumber(annotations, i) : undefined,
        text: a.text ?? '',
        color: a.color ?? '',
        dashed: !!a.dashed,
        filled: !!a.filled,
        pieceLineKeys: a.pieceLineKeys ?? [],
      })),
    [annotations],
  );

  const patch = (key: string, fields: Partial<AnnotationValue>) => {
    const i = Number(key);
    onChange?.(annotations.map((a, k) => (k === i ? { ...a, ...fields } : a)));
  };
  const removeAt = (key: string) => {
    const i = Number(key);
    onChange?.(annotations.filter((_, k) => k !== i));
  };

  const surface = {
    src,
    alt,
    callouts,
    frozen,
    pieceLabel,
    selectedKey,
    onSelect,
    maxCallouts: MAX_ANNOTATIONS,
    // Снимок узла — ФОТОГРАФИЯ: чернильная линия на пёстрой ткани тонет, и без белой подложки
    // указание перестаёт быть видно ровно там, где его поставили.
    halo: true,
    // Легенда пинов рисуется САМОЙ поверхностью: наведение на строку подсвечивает свой пин, а
    // состояние наведения принадлежит ей. Снаружи легенда умела бы только показывать текст.
    legend: true,
    onAdd: editable
      ? (kind: string, points: ShapePoint[], pen: PenStyle) => {
          if (annotations.length >= MAX_ANNOTATIONS) return;
          // Плашка ставится над серединой якорей — оттуда её почти никогда не приходится двигать,
          // а лидер строится сам.
          const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
          const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
          onChange?.([
            ...annotations,
            {
              kind,
              points: points.map((p) => ({ x: str(p.x), y: str(p.y) })),
              text: '',
              labelX: str(Math.min(0.96, Math.max(0.04, cx))),
              labelY: str(Math.min(0.96, Math.max(0.06, cy - 0.1))),
              color: pen.color,
              dashed: pen.dashed,
              filled: pen.filled,
              pieceLineKey: '',
              pieceLineKeys: [],
            },
          ]);
        }
      : undefined,
    onEditPoints: editable
      ? (key: string, points: ShapePoint[]) => {
          const prev = annotations[Number(key)];
          if (!prev) return;
          // ВИД ПОДПИСИ СЛЕДУЕТ ЗА ЧИСЛОМ СТРЕЛОК. Панель знает один вид, провод различает одну
          // стрелку (label) и несколько (multi); различие — счётчик, и держать его руками значило
          // бы просить человека объявить то, что и так видно.
          const kind =
            prev.kind === 'label' || prev.kind === 'multi'
              ? points.length > 1
                ? 'multi'
                : 'label'
              : prev.kind;
          patch(key, { kind, points: points.map((p) => ({ x: str(p.x), y: str(p.y) })) });
        }
      : undefined,
    onMoveLabel: editable
      ? (key: string, at: ShapePoint) => patch(key, { labelX: str(at.x), labelY: str(at.y) })
      : undefined,
    onRemove: editable ? removeAt : undefined,
    onBeforeMutate: editable ? history.record : undefined,
    onUndo: editable ? history.undo : undefined,
    canUndo: history.canUndo,
    renderEditor: editable
      ? (key: string, { close }: { close: () => void }) => {
          const i = Number(key);
          const a = annotations[i];
          if (!a) return null;
          return (
            <AnnotationEditor
              kind={a.kind ?? 'pin'}
              number={pinNumber(annotations, i)}
              text={a.text ?? ''}
              color={a.color ?? ''}
              dashed={!!a.dashed}
              filled={!!a.filled}
              pieceKeys={a.pieceLineKeys ?? []}
              pieceLabel={pieceLabel}
              extra={renderExtraEditor?.({
                index: i,
                annotation: a,
                number: pinNumber(annotations, i),
              })}
              onText={(text) => patch(key, { text })}
              // Оформление запоминается ПЕРОМ: следующая фигура наследует цвет и пунктир этой, и
              // серию штрихов одним цветом не приходится перекрашивать поштучно.
              onColor={(c) => {
                rememberPen({ color: c });
                patch(key, { color: c });
              }}
              onDashed={(v) => {
                rememberPen({ dashed: v });
                patch(key, { dashed: v });
              }}
              onFilled={(v) => {
                rememberPen({ filled: v });
                patch(key, { filled: v });
              }}
              // Одиночное поле — эхо первого элемента: сервер хранит именно так, и разойтись им
              // нельзя, иначе печать покажет одну деталь, а экран другую.
              onPieces={(keys) => patch(key, { pieceLineKeys: keys, pieceLineKey: keys[0] ?? '' })}
              onRemove={() => {
                removeAt(key);
                close();
              }}
              onClose={close}
              renderPiecePicker={renderPiecePicker}
            />
          );
        }
      : undefined,
  };

  return { surface, editable, kindDef };
}

export function AnnotationCanvas({
  src,
  alt,
  annotations,
  onChange,
  frozen = false,
  className,
  maxHeightClass,
  heightPx,
  placingKind: externalKind,
  onPlaced,
  cornerSlot,
  zoomable = false,
  renderPiecePicker,
  pieceLabel,
  onPlacedCountChange,
}: {
  className?: string;
  maxHeightClass?: string;
  /**
   * Фиксированная высота снимка: кадр становится «ростом с полосу», ширину берёт от своих
   * пропорций. Так филмстрип выстраивается в ровный ряд, а альбомный снимок остаётся альбомным —
   * картинку не режут, поэтому указания по-прежнему ложатся на свои места.
   */
  heightPx?: number;
  /** Вид, выбранный СНАРУЖИ (общая панель полосы). undefined = холст решает сам. */
  placingKind?: string | null;
  onPlaced?: () => void;
  cornerSlot?: ReactNode;
  zoomable?: boolean;
  /** Сколько якорей набрано — общая панель полосы рисует подсказку сама. */
  onPlacedCountChange?: (n: number) => void;
} & AnnotationSurfaceOptions) {
  const [ownKind, setOwnKind] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const { surface } = useAnnotationSurface({
    src,
    alt,
    annotations,
    onChange,
    frozen,
    renderPiecePicker,
    pieceLabel,
  });
  const tool = externalKind !== undefined ? externalKind : ownKind;

  return (
    <div className={heightPx != null ? 'w-fit' : undefined}>
      <AnnotationSurface
        {...surface}
        className={className}
        heightPx={heightPx}
        maxHeightClass={maxHeightClass}
        tool={tool}
        onToolDone={() => {
          setOwnKind(null);
          onPlaced?.();
        }}
        onPlacedCountChange={onPlacedCountChange}
        cornerSlot={
          <>
            {cornerSlot}
            {zoomable && (
              <FrameButton
                label='зум'
                title='открыть снимок во весь экран — там же и ставить указания точнее'
                onPress={() => {
                  // ЗУМ ОБРЫВАЕТ НЕЗАВЕРШЁННУЮ ПОСТАНОВКУ. Полноэкранная поверхность — другая,
                  // со своей панелью и своими точками; продолжить в ней мерку, начатую на
                  // миниатюре, нечем, а оставить режим включённым значило бы, что после закрытия
                  // первый же клик по кадру уронит на снимок постороннюю фигуру.
                  if (tool) {
                    setOwnKind(null);
                    onPlaced?.();
                  }
                  setZoomOpen(true);
                }}
              />
            )}
          </>
        }
      />

      {zoomable && (
        <AnnotationZoomDialog
          {...surface}
          open={zoomOpen}
          onOpenChange={setZoomOpen}
          title={alt || 'снимок узла'}
        />
      )}
    </div>
  );
}

/**
 * Кнопка поверх кадра. Не `<button>`: холст живёт внутри общего `<fieldset disabled>` выпущенной
 * карточки, а задизейбленность наследуется — на выпущенной карточке зум перестал бы открываться,
 * то есть читать архив стало бы нечем.
 */
export function FrameButton({
  label,
  title,
  onPress,
}: {
  label: string;
  title: string;
  onPress: () => void;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className='cursor-pointer border border-borderColor bg-bgColor px-1.5 py-px text-nano uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
    >
      {label}
    </span>
  );
}
