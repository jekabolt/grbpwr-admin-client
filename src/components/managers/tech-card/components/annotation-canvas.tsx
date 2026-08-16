import { useMemo, useState, type ReactNode } from 'react';
import { AnnotationEditor } from 'ui/components/annotation/editor';
import { useEditHistory } from 'ui/components/annotation/history';
import { ALL_KIND_KEYS, kindDef } from 'ui/components/annotation/kinds';
import {
  AnnotationSurface,
  rememberPen,
  type PenStyle,
  type ShapePoint,
  type SurfaceCallout,
} from 'ui/components/annotation/surface';
import { AnnotationZoomDialog } from 'ui/components/annotation/zoom-dialog';
import Text from 'ui/components/text';

import type { AnnotationForm } from './schema';

// СНИМОК ШАГА СБОРКИ — ДОМЕННЫЙ АДАПТЕР над общей поверхностью указаний.
//
// Сама поверхность (ui/components/annotation) не знает ни слова «операция», ни формы карточки: она
// принимает вью-модель указания и отдаёт гранулярные правки. Здесь живёт ровно перевод в обе
// стороны — форма RHF ↔ вью-модель — и то, что специфично для снимка узла: легенда пинов,
// увеличенный вид и пикер деталей кроя.
//
// РЕЖИМ ПОДПИСИ — ПЛАШКА. Швея читает лист у машинки, и текст обязан стоять на самом снимке рядом
// со стрелкой: легенда-таблица здесь лишний прыжок глазами, а на десяток фото он умножается.
// Карточный эскиз работает наоборот (нумерованный маркер + таблица) — см. довод в surface.tsx.
//
// КООРДИНАТЫ ХРАНЯТСЯ СТРОКАМИ. Тот же decimal, что на проводе и в БД: круговой рейс без
// округлений. Поверхность считает числами, поэтому перевод — здесь, и только здесь.

/** Зеркало серверного предела: узнать о нём при сохранении всей карточки — поздно. */
const MAX_ANNOTATIONS = 30;

/** Подписи и подсказки видов — из общего реестра, а не своим словарём. */
export const KIND_LABEL: Record<string, string> = Object.fromEntries(
  ALL_KIND_KEYS.map((k) => [k, kindDef(k).label]),
);
export const KIND_HINT: Record<string, string> = Object.fromEntries(
  ALL_KIND_KEYS.map((k) => [k, kindDef(k).hint]),
);

const num = (v?: string) => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const str = (n: number) => String(Math.round(n * 10000) / 10000);

/** Номер пина = его порядок СРЕДИ ПИНОВ: легенда нумеруется подряд, а не по общему списку. */
function pinNumber(list: AnnotationForm[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i++) if ((list[i]?.kind ?? 'pin') === 'pin') n++;
  return n;
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
  src: string;
  alt?: string;
  maxHeightClass?: string;
  /**
   * Фиксированная высота снимка: кадр становится «ростом с полосу», ширину берёт от своих
   * пропорций. Так филмстрип выстраивается в ровный ряд, а альбомный снимок остаётся альбомным —
   * картинку не режут, поэтому указания по-прежнему ложатся на свои места.
   */
  heightPx?: number;
  annotations: AnnotationForm[];
  /** Отсутствует = холст только читается. Печать и архив зовут его именно так. */
  onChange?: (next: AnnotationForm[]) => void;
  frozen?: boolean;
  className?: string;
  /** Вид, выбранный СНАРУЖИ (общая панель полосы). undefined = холст решает сам. */
  placingKind?: string | null;
  onPlaced?: () => void;
  cornerSlot?: ReactNode;
  zoomable?: boolean;
  /** Пикер детали кроя. Получает уже выбранные, чтобы помечать их в списке, и отдаёт ключ. */
  renderPiecePicker?: (opts: { selected: string[]; onPick: (lineKey: string) => void }) => ReactNode;
  pieceLabel?: (lineKey: string) => string | undefined;
  /** Сколько якорей набрано — общая панель полосы рисует подсказку сама. */
  onPlacedCountChange?: (n: number) => void;
}) {
  const [ownKind, setOwnKind] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  // ⌘Z откатывает ЖЕСТ над фигурой. Правка текста сюда не входит: там откат принадлежит браузеру.
  const history = useEditHistory(annotations, (prev) => onChange?.(prev));
  const tool = externalKind !== undefined ? externalKind : ownKind;
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
        number: pinNumber(annotations, i),
        text: a.text ?? '',
        color: a.color ?? '',
        dashed: !!a.dashed,
        filled: !!a.filled,
        pieceLineKeys: a.pieceLineKeys ?? [],
      })),
    [annotations],
  );

  const patch = (key: string, fields: Partial<AnnotationForm>) => {
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
    labelMode: 'plate' as const,
    frozen,
    pieceLabel,
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
              kind: kind as AnnotationForm['kind'],
              points: points.map((p) => ({ x: str(p.x), y: str(p.y) })),
              text: '',
              labelX: str(Math.min(0.96, Math.max(0.04, cx))),
              labelY: str(Math.min(0.96, Math.max(0.06, cy - 0.1))),
              color: pen.color as AnnotationForm['color'],
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
              ? ((points.length > 1 ? 'multi' : 'label') as AnnotationForm['kind'])
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
          const a = annotations[Number(key)];
          if (!a) return null;
          return (
            <AnnotationEditor
              kind={a.kind ?? 'pin'}
              number={pinNumber(annotations, Number(key))}
              text={a.text ?? ''}
              color={a.color ?? ''}
              dashed={!!a.dashed}
              filled={!!a.filled}
              pieceKeys={a.pieceLineKeys ?? []}
              pieceLabel={pieceLabel}
              onText={(text) => patch(key, { text })}
              // Оформление запоминается ПЕРОМ: следующая фигура наследует цвет и пунктир этой, и
              // серию штрихов одним цветом не приходится перекрашивать поштучно.
              onColor={(c) => {
                rememberPen({ color: c });
                patch(key, { color: c as AnnotationForm['color'] });
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
function FrameButton({
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
