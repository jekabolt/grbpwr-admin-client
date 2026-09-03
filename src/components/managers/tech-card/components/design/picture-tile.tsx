import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import MediaComponent from 'ui/components/media';
import { MediaViewer, type MediaViewerItem } from 'ui/components/media-viewer';
import Text from 'ui/components/text';

import { uploadRaster } from './modals/use-edit-layer';
import { newClientRequestId, useDesignWrites } from './use-design-band';

import { ThreedModelModal } from './threed/model-modal';
import { isModelUrl } from './threed/media';

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * ОДИН ЗАКОН УГЛОВ НА ВСЮ ПОЛОСУ DESIGN.
 *
 * Владелец (круг 4, пункт 8): «сделай везде одинаково включая кнопку сплит нахуя ты делаешь
 * везде по разному может сделать это компонентом или как нибудь еще что бы не было таких
 * проблем». И до этого, пунктом 7: «на тамбнейлах картинок на ховер кнопка сплит должна быть
 * снизу слева я уже второй раз это прошу».
 *
 * Второй раз просьба прозвучала не потому, что её не выполнили, а потому что выполнили В ОДНОМ
 * МЕСТЕ. Замер до этого файла: плита стенда держала органы по `bottom-1 left-1`, ячейка
 * референсов — по `left-0 top-0` и подвалом во всю ширину, история генераций не имела зума
 * вовсе. Три раскладки, три кожи, три набора состояний — и каждая просьба «сделай снизу слева»
 * чинила ровно одну из них.
 *
 * Поэтому раскладка углов больше не решение экрана. Она РЕШЕНИЕ ПРИМИТИВА, и её нельзя задать
 * снаружи: у `PictureTile` нет пропа «где рисовать сплит». Есть роли:
 *
 *      ┌──────────────────────────────┐
 *      │ badge                zoom  ✕ │   верх: ярлык слева, тихие органы справа
 *      │                              │
 *      │        (сама картинка —      │   вся поверхность открывает просмотрщик
 *      │         клик = зум)          │
 *      │                              │
 *      │ split                   edit │   низ: сплит СЛЕВА, правка СПРАВА
 *      └──────────────────────────────┘
 *
 * Экран говорит, КАКИЕ роли у него есть (`onSplit`, `onEdit`, `onRemove`), а не где они лежат.
 * Роль без обработчика не рисуется. Значит «сделать везде одинаково» перестало быть задачей,
 * которую можно выполнить наполовину: разойтись физически негде.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Формула появления тихого органа: наведение ИЛИ фокус ВНУТРИ плитки, и всегда — на устройстве
 * без наведения. Слушается `group-focus-within` хозяина, а не собственный `focus-within`: у
 * клавиатуры ховера не бывает, и орган, видимый лишь пока фокус стоит на нём самом, нечем найти.
 */
export const TILE_QUIET =
  'opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ' +
  'focus-visible:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none';

/**
 * Кожа углового органа — та же, что у примитива `Button`, с видимым `focus-visible`. Семь
 * состояний: покой (тихий), наведение (чернеет), фокус (обводка 2px), нажатие (родное),
 * выключен (серый, некликабелен), занят (`pending` — своё слово и `aria-busy`), отказ
 * (снекбар вызывающего; плитка о записи ничего не знает).
 */
export const TILE_CORNER =
  'pointer-events-auto border border-borderColor bg-bgColor px-1 text-nano uppercase tracking-label ' +
  'text-labelColor hover:text-textColor disabled:cursor-not-allowed disabled:text-textInactiveColor ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

/* ── ГАЛЕРЕЯ ────────────────────────────────────────────────────────────────────────────────── */

interface GalleryEntry {
  node: HTMLElement;
  /** Кадры этой записи, в порядке показа. У плитки один; у ГРУППЫ — сколько угодно. */
  items: MediaViewerItem[];
}

interface GalleryApi {
  register: (key: string, entry: GalleryEntry | null) => void;
  openAt: (key: string, offset?: number) => void;
}

const GalleryContext = createContext<GalleryApi | null>(null);

/**
 * ОДИН ПРОСМОТРЩИК НА ВСЮ ПОЛОСУ. Владелец: «что бы можно было в зум вью по всем картинкам из
 * всех генераций итерироваться не только этой».
 *
 * До этого в полосе жило ПЯТЬ отдельных `MediaViewer` (стенд, референсы, история, рендер, 3D), и
 * каждый получал свой список: история — список ОДНОГО прогона. Стрелка «дальше» упиралась в край
 * прогона не по решению, а потому что дальше просто ничего не было передано.
 *
 * Здесь ряд собирается не вызывающим, а САМИМИ ПЛИТКАМИ: каждая при монтировании кладёт в реестр
 * свой узел и свой кадр. Порядок ряда — не порядок регистрации (перемонтирование его ломает), а
 * ПОРЯДОК В ДОКУМЕНТЕ, вычисляемый в момент открытия через `compareDocumentPosition`. То есть
 * человек листает ровно то, что видит, и в том порядке, в котором видит.
 */
export function PictureGalleryProvider({
  children,
  techCardId,
  band,
}: {
  children: ReactNode;
  /**
   * ДВЕРЬ «ЗАВЕСТИ НОВОЙ КАРТИНКОЙ» ОТКРЫВАЕТСЯ ТОЛЬКО ВМЕСТЕ С ЭТИМИ ДВУМЯ. Без карточки писать
   * некуда, без полосы нечем узнать РОД исходной картинки — а род просмотрщик не знает и знать не
   * может: у кадра есть только `meta.id`, и это id МЕДИА, не картинки полосы.
   */
  techCardId?: number;
  band?: GetDesignBandResponse;
}) {
  const registry = useRef(new Map<string, GalleryEntry>());
  const [row, setRow] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);
  /** Адрес кадра, стоящего на сцене. Держит место человека при пересборке ряда. */
  const onStage = useRef<string | null>(null);

  /** Весь ряд в порядке документа, плюс смещение начала записи `key`, если она нужна. */
  const collect = useCallback((key?: string) => {
    const entries = [...registry.current.entries()].filter(([, e]) => e.node.isConnected);
    entries.sort(([, a], [, b]) => {
      if (a.node === b.node) return 0;
      const rel = a.node.compareDocumentPosition(b.node);
      if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    let before = -1;
    const items: MediaViewerItem[] = [];
    for (const [k, e] of entries) {
      if (k === key) before = items.length;
      items.push(...e.items);
    }
    return { items, before };
  }, []);

  /**
   * ОТКРЫТЫЙ РЯД — НЕ СНИМОК МОМЕНТА. Пока просмотрщик открыт, полоса продолжает жить: опрос
   * приносит картинки завершившегося прогона, соседняя вкладка архивирует строку и её плитки
   * уходят из документа. Ряд, снятый один раз при открытии, показывал бы удалённый кадр и не знал
   * бы о новых — то есть врал бы ровно тем, что молчит.
   *
   * Пересборка держит МЕСТО ЧЕЛОВЕКА, а не номер: индекс ищется по адресу кадра на сцене. Номер
   * при вставке картинки выше по документу указал бы на соседнюю — человек листал бы не то, на
   * что смотрел. Исчез сам кадр — остаёмся на его номере (это ближайший сосед), а опустевший ряд
   * закрывает просмотрщик: пустая сцена неотличима от сломанной.
   */
  const rebuild = useCallback(() => {
    setRow((prev) => {
      if (!prev) return prev;
      const { items } = collect();
      if (!items.length) return null;
      const at = onStage.current ? items.findIndex((i) => i.src === onStage.current) : -1;
      const index = at >= 0 ? at : Math.min(prev.index, items.length - 1);
      onStage.current = items[index]?.src ?? null;
      return { items, index };
    });
  }, [collect]);

  const register = useCallback(
    (key: string, entry: GalleryEntry | null) => {
      if (entry) registry.current.set(key, entry);
      else registry.current.delete(key);
      // Пересборка только пока просмотрщик открыт. Иначе монтаж полусотни плиток на входе в
      // карточку дал бы полсотни лишних отрисовок провайдера ради ряда, который никто не смотрит.
      if (onStage.current !== null) rebuild();
    },
    [rebuild],
  );

  const openAt = useCallback(
    (key: string, offset = 0) => {
      const { items, before } = collect(key);
      if (before < 0 || !items.length) return;
      const index = Math.min(Math.max(before + offset, 0), items.length - 1);
      onStage.current = items[index]?.src ?? null;
      setRow({ items, index });
    },
    [collect],
  );

  /* ── ДВЕРЬ J-13: ПОПРАВЛЕННЫЙ СНИМОК СТАНОВИТСЯ НОВОЙ КАРТИНКОЙ ──────────────────────────────
   *
   * Просмотрщик отдаёт БАЙТЫ и КАДР; всё остальное — работа хозяина, и она здесь.
   *
   * РОД НАСЛЕДУЕТСЯ ОТ ИСХОДНОЙ КАРТИНКИ (флэт остаётся флэтом, рендер — рендером). Искать её
   * приходится ПО МЕДИА: `MediaViewerItem` ссылки на картинку полосы не несёт вовсе.
   *
   * ТРИ ОТКАЗА ПРОГОВАРИВАЮТСЯ СЛОВАМИ, А НЕ МОЛЧАНИЕМ:
   *   · кадра нет в полосе (плитка ткани, снимок из чужого ряда) — рода не существует;
   *   · род `pattern` — `RegisterDesignUpload` принимает flat | render | threed, и завести
   *     повторяющуюся плитку «флэтом» значит сделать её выбираемой в слот верстака, то есть
   *     объявить квадрат ткани передом изделия;
   *   · `colorway_id` НЕ НАСЛЕДУЕТСЯ и уходит нулём: на строке картинки его нет, а брать его у
   *     прогона — отдельное решение владельца, а не догадка здесь. Рендер заводится
   *     неатрибутированным, ровно как всякий рендер, загруженный руками.
   */
  const { showMessage } = useSnackBarStore();
  const writes = useDesignWrites(techCardId);
  const { registerUpload } = writes;

  const kindOfMedia = useCallback(
    (mediaId: number): string | null => {
      if (!band || !mediaId) return null;
      const pools = [
        ...(band.runs ?? []).map((r) => r.pictures ?? []),
        ...(band.batches ?? []).map((b) => b.pictures ?? []),
      ];
      for (const pictures of pools) {
        for (const p of pictures) {
          if ((p.media?.id ?? 0) === mediaId) return p.kind || 'flat';
        }
      }
      return null;
    },
    [band],
  );

  const saveAsPicture = useCallback(
    async (dataUrl: string, item: MediaViewerItem) => {
      const mediaId = item.meta?.id ?? 0;
      const kind = kindOfMedia(mediaId);
      if (!kind) {
        showMessage(
          'this frame is not a picture of the band, so there is no kind to give the copy. Open it from a bench, reference or output tile.',
          'error',
        );
        return;
      }
      if (kind === 'pattern') {
        showMessage(
          'a pattern tile cannot be filed as a new picture: the band takes flat, render and 3d only, and filing a repeating tile as a flat would make it pickable as the front of the garment.',
          'error',
        );
        return;
      }
      const media = await uploadRaster(dataUrl);
      await registerUpload.mutateAsync({
        clientRequestId: newClientRequestId(),
        items: [{ mediaId: media.id ?? 0, ghostView: '', kind, colorwayId: 0 }],
      });
      showMessage('the corrected copy is in the band', 'success');
    },
    [kindOfMedia, registerUpload, showMessage],
  );

  const api = useMemo<GalleryApi>(() => ({ register, openAt }), [register, openAt]);

  return (
    <GalleryContext.Provider value={api}>
      {children}
      <MediaViewer
        items={row?.items ?? []}
        index={row?.index ?? 0}
        open={!!row}
        onOpenChange={(open) => {
          if (open) return;
          onStage.current = null;
          setRow(null);
        }}
        onIndexChange={(index) =>
          setRow((prev) => {
            if (!prev) return prev;
            onStage.current = prev.items[index]?.src ?? null;
            return { ...prev, index };
          })
        }
        /* Дверь ставится ТОЛЬКО когда есть куда писать. Без `techCardId` или без полосы кнопки
           «save as a new picture» не будет вовсе — это честнее, чем кнопка, которая отказывает. */
        onSaveAsPicture={techCardId && band ? saveAsPicture : undefined}
      />
    </GalleryContext.Provider>
  );
}

/**
 * ГРУППА КАДРОВ — ряд, который НЕ ЗАВИСИТ ОТ ТОГО, СКОЛЬКО ПЛИТОК СЕЙЧАС НА ЭКРАНЕ.
 *
 * Плитка кладёт в ряд себя, и этого достаточно там, где показано всё. В истории прогонов
 * показано НЕ ВСЁ: T-17 просил окно по три генерации с пагинацией, и ряд, собранный из
 * смонтированных плиток, кончался на краю страницы — то есть T-17 отнимал ровно то, что давал
 * T-8 («по всем картинкам из всех генераций»). Два требования одного письма не могут отменять
 * друг друга; значит ряд обязан жить отдельно от окна.
 *
 * Группа регистрирует ВЕСЬ загруженный список на ОДНОМ узле-якоре: место группы в порядке
 * документа определяет якорь, а порядок внутри — сам список. Плитки внутри группы своих кадров
 * не регистрируют (иначе картинка стояла бы в ряду дважды) и открывают группу по смещению —
 * см. `galleryGroup` у `PictureTile`.
 */
export function useGalleryGroup(items: MediaViewerItem[]): {
  key: string;
  anchorRef: React.RefObject<HTMLDivElement | null>;
} {
  const key = useId();
  const ctx = useContext(GalleryContext);
  const anchorRef = useRef<HTMLDivElement>(null);
  const shape = items.map((i) => i.src).join('|');
  useEffect(() => {
    const node = anchorRef.current;
    if (!ctx || !node || !items.length) return;
    ctx.register(key, { node, items });
    return () => ctx.register(key, null);
  }, [ctx, key, shape]); // eslint-disable-line react-hooks/exhaustive-deps
  return { key, anchorRef };
}

/* ── ПЛИТКА ─────────────────────────────────────────────────────────────────────────────────── */

export interface PictureTileAction {
  onClick: () => void;
  /** Обязательна: тихий орган без имени нечем объявить читалке экрана. */
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  /** Показывает своё слово вместо обычного и держит орган видимым, пока идёт запись. */
  pending?: boolean;
}

export interface PictureTileProps {
  /** Адрес картинки. Пусто — рисуется кадр-заглушка со словом, а не молчаливая дыра. */
  url?: string;
  alt: string;
  /** Ярлык в левом верхнем углу. Не кнопка и прозрачен для указателя. */
  badge?: ReactNode;
  /** Кадр плитки. `4/5` — чертёж, `1/1` — референс. */
  aspect?: string;
  fit?: 'cover' | 'contain';
  /** Обводка кадра. `true` подсвечивает выбранную плитку толстой чёрной. */
  selected?: boolean;
  /**
   * ПРИГЛУШИТЬ СНИМОК — И ТОЛЬКО ЕГО. «Эту картинку нигде не предлагают» — утверждение о КАРТИНКЕ,
   * а не о дверях, которые с ней работают.
   *
   * ЗАМЕРЕНО, И ИМЕННО ПОЭТОМУ ПРОП ЕСТЬ. Вызывающий гасил всю плитку классом `opacity-40` на
   * `className`, и до K-6 это было безобидно: у скрытой плитки органов почти не было. Теперь на
   * ней стоит `edit`, а прозрачность НАСЛЕДУЕТСЯ и ребёнком не отменяется — кнопка выходила
   * `#666` при 40% над белым, то есть около 1.6:1 при пороге 4.5:1. Дверь, которую не прочесть,
   * — не дверь.
   *
   * Состояние при этом не теряется: его несёт слово («hidden» пилюлей), а не одна лишь заливка.
   */
  dim?: boolean;
  className?: string;
  /**
   * Кадр для общего просмотрщика. Есть — вся поверхность открывает зум и в верхнем правом углу
   * появляется тихая кнопка `zoom`; нет — плитка не листается и зума не обещает.
   */
  gallery?: MediaViewerItem;
  /**
   * Плитка принадлежит ГРУППЕ (`useGalleryGroup`) и своего кадра в ряд не кладёт: ряд группы
   * полон и без неё. Зум открывает группу на этом смещении. Задан вместе с `gallery` — `gallery`
   * проигрывает: две записи об одной картинке дали бы её в ряду дважды.
   */
  galleryGroup?: { key: string; index: number };
  /**
   * ПОВЕРХНОСТЬ ОТКРЫВАЕТ НЕ ЗУМ, А ЭТО (J-2).
   *
   * Владелец, дословно: «что бы оно расколапсилось при клике на плитку … надо что бы клик на
   * карточку тамбнейл уже открывал зум а первый клик анколапсил». То есть у СВЁРНУТОЙ колоды
   * поверхность листа принадлежит не просмотрщику, а раскрытию: первое нажатие разворачивает,
   * и только у развёрнутой карточки поверхность снова открывает зум.
   *
   * ⚠ ЭТО РОЛЬ ПРИМИТИВА, А НЕ КЛАСС СНАРУЖИ, И ПРИЧИНА ТА ЖЕ, ЧТО У ЗАКОНА УГЛОВ. Вызывающий,
   * накрывающий плитку своей прозрачной кнопкой, обязан угадать её z-слой: поверхность-зум лежит
   * на z-10, углы — на z-20, и накрытие «сверху» отняло бы у человека и сплит, и правку, и ✕.
   * Здесь же подмена происходит ТАМ ЖЕ, где нарисована поверхность, поэтому углы физически не
   * могут быть перекрыты.
   *
   * ЗУМ ПРИ ЭТОМ НЕ ТЕРЯЕТСЯ, А ПЕРЕЕЗЖАЕТ: угловая кнопка `zoom` (верх справа) продолжает
   * открывать просмотрщик, и она же — единственный объявленный орган зума (поверхность и раньше
   * была `aria-hidden`, жестом мыши). Значит клавиатура и читалка экрана этой правки не замечают
   * вовсе, а мышь получает ровно то различие, которое просил владелец.
   */
  onOpen?: () => void;
  onSplit?: PictureTileAction;
  /**
   * КРОПНУТЬ ЭТУ ЖЕ КАРТИНКУ (J-8). Стоит РЯДОМ со `split`, в том же нижнем левом кластере: оба
   * органа режут один предмет, и разносить их по разным углам значило бы заводить второй словарь
   * мест для одного жеста. Роль без обработчика не рисуется, как и все остальные.
   */
  onCrop?: PictureTileAction;
  onEdit?: PictureTileAction;
  onRemove?: PictureTileAction;
  /** Слово нижней левой роли. По умолчанию `split` — иных значений почти не бывает. */
  splitLabel?: string;
  /** Слово роли кропа. По умолчанию `crop`. */
  cropLabel?: string;
  /** Слово нижней правой роли. По умолчанию `edit`. */
  editLabel?: string;
  /** Всё, что рисуется ПОВЕРХ кадра вызывающим (например, слой указаний). */
  children?: ReactNode;
}

function Corner({
  action,
  label,
  pendingLabel,
  className,
}: {
  action: PictureTileAction;
  label: string;
  pendingLabel?: string;
  className: string;
}) {
  return (
    <button
      type='button'
      aria-label={action.ariaLabel}
      title={action.title}
      aria-busy={action.pending || undefined}
      disabled={action.disabled || action.pending}
      onClick={action.onClick}
      className={cn('z-20 py-0.5 leading-none', TILE_CORNER, TILE_QUIET, className, action.pending && 'opacity-100')}
    >
      {action.pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}

export function PictureTile({
  url,
  alt,
  badge,
  aspect = '4/5',
  fit = 'contain',
  selected,
  dim,
  className,
  gallery,
  galleryGroup,
  onOpen,
  onSplit,
  onCrop,
  onEdit,
  onRemove,
  splitLabel = 'split',
  cropLabel = 'crop',
  editLabel = 'edit',
  children,
}: PictureTileProps) {
  const key = useId();
  const ctx = useContext(GalleryContext);
  const hostRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);

  /**
   * ═══ ЭТОТ АДРЕС — НЕ КАРТИНКА, А ФАЙЛ МОДЕЛИ ══════════════════════════════════════════════
   *
   * ЗАЧЕМ ЭТО ЗНАЕТ ПРИМИТИВ, А НЕ ЭКРАН. Прогон 3D заводит ДВЕ строки — сам `.glb` и растровую
   * миниатюру, — и обе приезжают с одним родом `threed`. Значит `.glb` попадает в `url` не в
   * одном месте, а всюду, где полоса рисует выход прогона: в историю генераций, в полосу
   * результатов, в верстак. До этой ветки каждое из тех мест отдавало модель в `<img>`, браузер
   * получал файл там, где ждал картинку, и человек видел битый кадр — то есть ЛОЖЬ: кадр читается
   * как «сервер не справился», хотя сервер отработал и деньги за модель списаны.
   *
   * Чинить это у каждого вызывающего значит чинить наполовину — ровно тот дефект, ради которого
   * этот примитив и заведён (см. закон углов выше). Тип файла решает КАК его рисовать, а «как
   * рисовать» — решение примитива.
   *
   * ⚠ СНАЧАЛА ЧЕСТНОСТЬ, ПОТОМ КРАСОТА. Плитка называет себя моделью и даёт забрать файл ДО
   * всякого просмотрщика и независимо от него: WebGL может быть выключен, разбор может упасть, а
   * файл, за который заплачено, человеку нужен всё равно.
   */
  const model = isModelUrl(url);

  // Регистрация переигрывается на смене адреса кадра, иначе просмотрщик листал бы вчерашние
  // ссылки: строка истории переезжает с картинки на картинку, не размонтируясь.
  useEffect(() => {
    const node = hostRef.current;
    // Кадр БЕЗ адреса в ряд не встаёт. Иначе «дальше» приводило бы человека к пустой сцене, и
    // выглядело бы это как сломанный просмотрщик, а не как отсутствующая картинка.
    // Модель в ряд не встаёт ПО ТОЙ ЖЕ ПРИЧИНЕ: общий просмотрщик — это `<img>`, и `.glb` в ряду
    // дал бы человеку пустую сцену посреди листания, ничем не объяснённую.
    if (!ctx || galleryGroup || !gallery?.src || isModelUrl(gallery.src) || !node) return;
    ctx.register(key, { node, items: [gallery] });
    return () => ctx.register(key, null);
  }, [ctx, key, galleryGroup?.key, gallery?.src, gallery?.thumbnail, gallery?.alt]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomable = !!ctx && !!url && !model && (!!galleryGroup || !!gallery);
  const openZoom = useCallback(() => {
    if (galleryGroup) ctx?.openAt(galleryGroup.key, galleryGroup.index);
    else ctx?.openAt(key);
  }, [ctx, key, galleryGroup?.key, galleryGroup?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={hostRef}
      className={cn(
        'group relative border',
        selected ? 'border-2 border-textColor' : 'border-textInactiveColor',
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      {/* ОБЁРТКА НЕСЁТ ТОЛЬКО ПРИГЛУШЕНИЕ И НИЧЕГО БОЛЬШЕ. `h-full w-full` в потоке — ровно те
          же коробка и место, что были у самого `MediaComponent` (его контейнер при
          `aspectRatio='auto'` таков же), поэтому кадр не сдвигается ни на пиксель. */}
      <div className={cn('h-full w-full', dim && 'opacity-40')}>
        {model && url ? (
          <div className='flex h-full w-full flex-col items-center justify-center gap-1.5 bg-bgSecondary px-1 text-center'>
            <Text size='nano' variant='uppercase' component='span'>
              3d model
            </Text>
            <div className='flex flex-wrap items-center justify-center gap-1'>
              <button
                type='button'
                onClick={() => setModelOpen(true)}
                title='open the model in the viewer'
                className={cn(TILE_CORNER, 'py-0.5 leading-none')}
              >
                open
              </button>
              {/* ССЫЛКА, А НЕ КНОПКА: забрать файл человек обязан мочь и тогда, когда сцена не
                  завелась, и тогда, когда JS этой страницы уже упал. */}
              <a
                href={url}
                target='_blank'
                rel='noopener noreferrer'
                download
                title='download the .glb file'
                className={cn(TILE_CORNER, 'py-0.5 leading-none')}
              >
                download
              </a>
            </div>
          </div>
        ) : url ? (
          <MediaComponent src={url} alt={alt} aspectRatio='auto' fit={fit} />
        ) : (
          // Пустой адрес — не повод для молчаливой дыры: человек обязан отличить «картинки нет»
          // от «картинка не загрузилась».
          <div className='flex h-full w-full items-center justify-center bg-bgSecondary'>
            <Text size='nano' variant='label' component='span' className='uppercase'>
              no image
            </Text>
          </div>
        )}
      </div>

      {/* Поверхность-зум лежит НИЖЕ углов (z-10 против z-20): иначе клик по сплиту уходил бы в
          просмотрщик. Это ровно тот дефект, из-за которого углы обязаны жить в примитиве. */}
      {/* ПОВЕРХНОСТЬ-ЗУМ НЕ УЧАСТВУЕТ НИ В ТАБЕ, НИ В ЧТЕНИИ ЭКРАНА, и это не упущение.
          Зум у плитки один, а органов было два: полноразмерная поверхность и угловая кнопка.
          Клавиатура проходила одно действие ДВАЖДЫ на каждой плитке, и читалка объявляла его
          дважды — на сетке из двадцати картинок это сорок остановок вместо двадцати. Поверхность
          остаётся жестом мыши («ткнуть в картинку»), а именем, фокусом и объявлением владеет
          угловая кнопка: одно действие — один орган. Ниже углов по z-index, иначе клик по сплиту
          уходил бы в просмотрщик. */}
      {/* ⚠ `onOpen` ЗАБИРАЕТ ПОВЕРХНОСТЬ ЦЕЛИКОМ, А НЕ «ЕСЛИ ЗУМА НЕТ» (J-2). Поверхность — один
          жест, и второе прочтение («открывает то или это, смотря по данным») было бы ровно тем
          «везде по разному», против которого написан этот файл. Плитка без зума, но с `onOpen`,
          поверхность всё равно получает: свёрнутая колода обязана раскрываться нажатием в лист,
          есть у листа адрес картинки или нет. */}
      {(zoomable || onOpen) && (
        <button
          type='button'
          tabIndex={-1}
          aria-hidden='true'
          onClick={onOpen ?? openZoom}
          className={cn('absolute inset-0 z-10', onOpen ? 'cursor-pointer' : 'cursor-zoom-in')}
        />
      )}

      {children}

      {badge && (
        <div className='pointer-events-none absolute left-1 top-1 z-20 max-w-[calc(100%-64px)]'>
          <span className='inline-block bg-textColor px-1.5 py-0.5'>
            <Text size='nano' variant='uppercase' component='span' className='!text-bgColor break-words'>
              {badge}
            </Text>
          </span>
        </div>
      )}

      {/* Верх справа — РЯД, а не угол: зум и ✕ обязаны стоять рядом, не наезжая. */}
      {(zoomable || onRemove) && (
        <div className='absolute right-1 top-1 z-20 flex items-start gap-1'>
          {zoomable && (
            <Corner
              action={{ onClick: openZoom, ariaLabel: `zoom ${alt}`, title: 'zoom — open the viewer' }}
              label='zoom'
              className=''
            />
          )}
          {onRemove && <Corner action={onRemove} label='✕' pendingLabel='…' className='' />}
        </div>
      )}

      {/* НИЗ СЛЕВА — КЛАСТЕР, А НЕ ОДИН ОРГАН, по той же причине, по которой верх справа стал рядом:
          «сплит» и «кроп» режут одну картинку, стоят рядом и не наезжают. Единственный орган
          рисуется ровно там, где рисовался всегда (первый в ряду, отступ 4px от края), поэтому
          плитка с одним лишь `split` выглядит побайтово как прежде. */}
      {(onSplit || onCrop) && (
        <div className='absolute bottom-1 left-1 z-20 flex items-end gap-1'>
          {onSplit && <Corner action={onSplit} label={splitLabel} className='' />}
          {onCrop && <Corner action={onCrop} label={cropLabel} className='' />}
        </div>
      )}
      {onEdit && <Corner action={onEdit} label={editLabel} className='absolute bottom-1 right-1' />}

      {/* Окно монтируется только открытым: `three` грузится динамически, но и сама оболочка не
          обязана стоять по одной на каждую плитку сетки из двадцати. */}
      {modelOpen && url && (
        <ThreedModelModal url={url} title={alt || '3d model'} onClose={() => setModelOpen(false)} />
      )}
    </div>
  );
}
