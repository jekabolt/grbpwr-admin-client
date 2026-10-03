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
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import MediaComponent from 'ui/components/media';
import {
  FILE_MISSING_TITLE,
  FILE_MISSING_WORDS,
  MediaViewer,
  ViewerAction,
  type MediaViewerItem,
} from 'ui/components/media-viewer';
import GenericPopover from 'ui/components/popover';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { TILE_CORNER, TILE_QUIET } from 'ui/components/tile-skin';

import { PICKER_BLEED, PICKER_ROW } from './core/two-step-picker';
import { uploadRaster } from './modals/use-edit-layer';
import { newClientRequestId, useDesignWrites } from './use-design-band';

import { ThreedModelModal } from './threed/model-modal';
import { isModelUrl } from './threed/media';
import { isVideoUrl } from './video-media';
import { ThreedModelIndexContext, threedModelIndex, useModelBehind } from './threed/model-index';

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * ОТКАТ НА МИНИАТЮРУ — КАДР, У КОТОРОГО НЕ ГРУЗИТСЯ КРУПНЫЙ ВАРИАНТ, ПОКАЗЫВАЕТ THUMB (D-7).
 *
 * Владелец: «сплит картинки не грузятся в зуме и в артефактах» — со снимком RENDERS OF THIS CARD,
 * где три карточки NOT ON THE CARD стоят с битой иконкой картинки.
 *
 * ЗАМЕРЕНО НА БЕТЕ: из 28 кадров-кропов три отдают 403 на `og` и на `compressed`, но 200 на
 * `thumb`. `AccessDenied` — это ответ S3 на ОТСУТСТВУЮЩИЙ ключ, когда у клиента нет права
 * ListBucket, то есть «403» здесь читается как «файла нет». Причина починена на сервере (имя файла
 * кропа было детерминированным, повторный разрез перезаписывал соседа), но уже загруженные битые
 * кадры на бете останутся битыми: сервер чинит будущее, не прошлое. Значит клиентская половина —
 * показать то, что есть.
 *
 * ГДЕ ЭТО ЖИВЁТ И ПОЧЕМУ ЗДЕСЬ. Ряд просмотрщика собирает ЭТОТ файл (`PictureGalleryProvider`), и
 * только он: плитки кладут в реестр свой кадр, провайдер отдаёт ряд `MediaViewer`. Сам просмотрщик
 * — примитив `ui`, который об источниках знает ровно `src` и `thumbnail`, и подменять ему кадр
 * «снизу» некому, кроме того, кто ряд составил. Поэтому факт «крупный вариант этого адреса не
 * загрузился» держится ЗДЕСЬ, на уровне полосы, и ряд пересобирается с миниатюрой на месте
 * битого кадра — тем же `rebuild`, которым он и так живёт, пока открыт.
 *
 * ⚠ ЛОВУШКА `onError`, ВСЛУХ. У `<img>` ошибка стреляет один раз на источник; подставить тот же
 * адрес — молчаливый цикл, подставить пустой — ещё одна ошибка. Здесь адрес пробуется ОТДЕЛЬНЫМ
 * `Image()` ровно один раз на строку (`PROBES`), провалившийся ложится в `FALLEN` навсегда, и
 * замена делается только на ДРУГОЙ непустой адрес. Миниатюра, которая тоже не грузится, ложится в
 * тот же список и больше ничем не заменяется: кадр остаётся битым, но ЧЕСТНО битым, а число
 * запросов к каждому адресу ограничено — измерено пробой (`d18r-probe.mjs`, C3).
 *
 * `useLoadableSrc` — ТА ЖЕ ПАМЯТЬ ДЛЯ ОРГАНОВ, КОТОРЫЕ РИСУЮТ `<img>` САМИ: лицо плитки здесь и
 * плита ARTIFACTS (`artifacts-panel.tsx`, `plateUrl` предпочитает полный размер — вторая половина
 * жалобы владельца). Один список битых адресов на всю полосу: кадр, не загрузившийся в зуме, не
 * будет пробоваться заново на плите.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

/** Адреса, чей крупный файл не загрузился. Факт о бакете, а не об экземпляре экрана. */
const FALLEN = new Set<string>();
/** Одна проба на адрес, сколько бы читателей её ни спросили. */
const PROBES = new Map<string, Promise<boolean>>();

/** Грузится ли картинка по адресу. Ответ кэшируется навсегда: бакет не оживляет ключ сам. */
export function probeImage(src: string): Promise<boolean> {
  const known = PROBES.get(src);
  if (known) return known;
  const probe = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
  PROBES.set(src, probe);
  return probe;
}

/** Адрес, который стоит пробовать: непустой, не data-URL (байты страницы не бьются) и ещё не павший. */
function worthProbing(src: string): boolean {
  return !!src && !/^(data|blob):/i.test(src) && !FALLEN.has(src);
}

/**
 * Адрес для `<img>`: `src`, пока он грузится; `fallback`, как только известно, что не грузится.
 * Оба адреса одинаковы или запасного нет — возвращается `src` без единой пробы.
 */
export function useLoadableSrc(src?: string | null, fallback?: string | null): string {
  const want = src ?? '';
  const alt = fallback ?? '';
  const [, fell] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!alt || alt === want || !worthProbing(want)) return;
    let live = true;
    void probeImage(want).then((loaded) => {
      if (loaded || !live) return;
      FALLEN.add(want);
      fell();
    });
    return () => {
      live = false;
    };
  }, [want, alt]);
  return alt && FALLEN.has(want) ? alt : want;
}

/** Кадр ряда с миниатюрой на месте павшего крупного адреса; целый кадр возвращается как есть. */
function withFallback(item: MediaViewerItem): MediaViewerItem {
  if (!FALLEN.has(item.src) || !item.thumbnail || item.thumbnail === item.src) return item;
  return { ...item, src: item.thumbnail };
}

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

/* Кожа углов живёт в `ui/components/tile-skin.ts` (её берут и примитивы `ui/`); отсюда она
   реэкспортируется, чтобы прежние импорты из этого файла не менялись. */
export { TILE_CORNER, TILE_QUIET };

/* ── ЦЕЛЬ СНИМКА МОДЕЛИ ─────────────────────────────────────────────────────────────────────── */

/**
 * ═══ ПОД КАКОЙ КОЛОРВЕЙ ЛЯЖЕТ СНИМОК, СДЕЛАННЫЙ ИЗ ЭТОГО ОКНА (r3f) ═══════════════════════════
 *
 * ЗАЧЕМ ЭТО КОНТЕКСТ, А НЕ ПРОП. Окно модели поднимает САМА плитка (`surfaceToModel` ниже, J-29),
 * и между разделом, который знает цель, и плиткой стоит чужой примитив — ячейка полосы
 * (`render/strip-cell.tsx`), у которой своего мнения о колорвее нет и быть не должно. Проп пришлось
 * бы протащить сквозь неё, то есть заставить транзитный узел пересказывать утверждение, которого он
 * не делает; следующий такой узел вернулся бы забывшим его — молча, потому что забытый проп даёт
 * `undefined`, а `undefined` здесь читается как «семпл» и выглядит правдоподобно.
 *
 * Тот же приём и та же причина, что у `ThreedModelIndexContext` соседней строкой: «какой файл
 * стоит за этим растром» плитка тоже не спрашивает у вызывающего.
 *
 * ⚠ ОБЛАСТЬ ОБЪЯВЛЯЕТ ТОТ, КТО СУЖЕН ЦЕЛЬЮ. Полка 3D показывает ровно один колорвей
 * (`outputsOfKind(band, 'threed', scope)`), и потому она же его и называет. Экран, который цели не
 * держит, провайдера не ставит — и его окно честно говорит `sample`, потому что нулём оно и файлит.
 */
export type ModelSnapshotTarget = {
  /** Колорвей, под которым снимок ляжет на карточку. `0` — верстак семпла. */
  colorwayId: number;
  /** Как этот колорвей зовётся на экране. Пусто у оси 0: окно называет её `sample` само. */
  label: string;
};

const SnapshotTargetContext = createContext<ModelSnapshotTarget | null>(null);

/** Объявить цель снимка для всех плиток внутри. Разбор — у `ModelSnapshotTarget` выше. */
export function ModelSnapshotScope({
  target,
  children,
}: {
  target: ModelSnapshotTarget;
  children: ReactNode;
}) {
  return <SnapshotTargetContext.Provider value={target}>{children}</SnapshotTargetContext.Provider>;
}

/* ── ГАЛЕРЕЯ ────────────────────────────────────────────────────────────────────────────────── */

type MaskDoor = () => void;

interface GalleryEntry {
  node: HTMLElement;
  /** Кадры этой записи, в порядке показа. У плитки один; у ГРУППЫ — сколько угодно. */
  items: MediaViewerItem[];
  /**
   * THE MASK OF THIS PICTURE (C-11): the tile's own `onMask`, offered in the viewer while its frame
   * is on stage. Absent = no Mask in the viewer for it. A group registers none.
   */
  mask?: MaskDoor;
}

interface GalleryApi {
  register: (key: string, entry: GalleryEntry | null) => void;
  /** `mediaId` — the clicked frame's identity; the offset is only the fallback (see `openAt`). */
  openAt: (key: string, offset?: number, mediaId?: number) => void;
}

const GalleryContext = createContext<GalleryApi | null>(null);

/**
 * ОТКРЫТ ЛИ ПРОСМОТРЩИК — ОТДЕЛЬНЫЙ КОНТЕКСТ, ТОЛЬКО ДЛЯ ЧТЕНИЯ (26.09, O-53 review). Его читает
 * верстак последней генерации: пока человек листает, прогон на верстаке не меняется — иначе ряд
 * пересобрался бы без кадра на сцене и показал бы соседний. Отдельно от `GalleryContext`, чтобы
 * открытие просмотрщика не перерисовывало каждую плитку полосы.
 */
const GalleryOpenContext = createContext(false);

export function useGalleryViewerOpen(): boolean {
  return useContext(GalleryOpenContext);
}

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
  const [row, setRow] = useState<{
    items: MediaViewerItem[];
    index: number;
    masks: (MaskDoor | undefined)[];
  } | null>(null);
  /** Адрес кадра, стоящего на сцене. Держит место человека при пересборке ряда. */
  const onStage = useRef<string | null>(null);

  /** Весь ряд в порядке документа, плюс начало и длина записи `key`, если она нужна. */
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
    let count = 0;
    const items: MediaViewerItem[] = [];
    const masks: (MaskDoor | undefined)[] = [];
    for (const [k, e] of entries) {
      if (k === key) {
        before = items.length;
        count = e.items.length;
      }
      // Павший крупный адрес подменяется миниатюрой ЗДЕСЬ, при сборке ряда, — и только здесь:
      // плитки регистрируют кадр как есть, а «что показывать вместо битого» решает ряд (D-7).
      items.push(...e.items.map(withFallback));
      masks.push(...e.items.map(() => e.mask));
    }
    return { items, before, count, masks };
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
      const { items, masks } = collect();
      if (!items.length) return null;
      const at = onStage.current ? items.findIndex((i) => i.src === onStage.current) : -1;
      const index = at >= 0 ? at : Math.min(prev.index, items.length - 1);
      onStage.current = items[index]?.src ?? null;
      return { items, index, masks };
    });
  }, [collect]);

  /**
   * КАДР НА СЦЕНЕ ПРОБУЕТСЯ, И ПАВШИЙ УХОДИТ В МИНИАТЮРУ (D-7). Проба идёт параллельно с
   * собственным `<img>` просмотрщика по тому же адресу — второй запрос браузер склеивает с
   * первым или берёт из кэша, — и как только известно, что крупного файла нет, ряд пересобирается
   * тем же `rebuild`: кадр на месте, зум и перетаскивание сбрасываются (просмотрщик держит их по
   * адресу кадра), человек видит миниатюру вместо битой иконки. Целый кадр не трогается ничем.
   * Павший адрес второй раз не пробуется (`worthProbing`), поэтому миниатюра, которая тоже бита,
   * останавливает откат, а не зацикливает его.
   */
  useEffect(() => {
    const src = row?.items[row.index]?.src ?? '';
    if (!worthProbing(src)) return;
    let live = true;
    void probeImage(src).then((loaded) => {
      if (loaded || !live) return;
      FALLEN.add(src);
      rebuild();
    });
    return () => {
      live = false;
    };
  }, [row, rebuild]);

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

  /**
   * ═══ ОТКРЫВАЕТСЯ КАДР, НА КОТОРЫЙ НАЖАЛИ, — ПО ЕГО МЕДИА, А НЕ ПО СМЕЩЕНИЮ (26.09, O-53 review) ═══
   * Смещение `before + offset` верно, только пока запись группы и номер у плитки посчитаны по одному
   * и тому же списку, и пока якорь группы в документе. Codex на ревью верстака: две группы с одной и
   * той же картинкой — и ряд держал её дважды. Корень убран там (прогон на верстаке в истории без
   * плиток), а здесь страховка: плитка группы называет свой медиа (`galleryGroup.mediaId`), и ряд
   * открывается на нём — сперва внутри своей записи (листание идёт дальше оттуда, где нажали), потом
   * где угодно в ряду (якорь группы выпал из документа — кадр всё равно открывается). Смещение
   * остаётся запасным ходом для кадра без медиа.
   */
  const openAt = useCallback(
    (key: string, offset = 0, mediaId?: number) => {
      const { items, before, count, masks } = collect(key);
      if (!items.length) return;
      let index = -1;
      if (mediaId) {
        const find = (from: number, to: number) => {
          for (let i = Math.max(from, 0); i < Math.min(to, items.length); i++) {
            if ((items[i]?.meta?.id ?? 0) === mediaId) return i;
          }
          return -1;
        };
        if (before >= 0) index = find(before, before + count);
        if (index < 0) index = find(0, items.length);
      }
      if (index < 0) {
        if (before < 0) return;
        index = Math.min(Math.max(before + offset, 0), items.length - 1);
      }
      onStage.current = items[index]?.src ?? null;
      setRow({ items, index, masks });
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

  /** Картинка полосы, стоящая за медиа, — или `null`: кадр не из полосы. */
  const pictureOfMedia = useCallback(
    (mediaId: number) => {
      if (!band || !mediaId) return null;
      const pools = [
        ...(band.runs ?? []).map((r) => r.pictures ?? []),
        ...(band.batches ?? []).map((b) => b.pictures ?? []),
      ];
      for (const pictures of pools) {
        for (const p of pictures) {
          if ((p.media?.id ?? 0) === mediaId) return p;
        }
      }
      return null;
    },
    [band],
  );

  const saveAsPicture = useCallback(
    async (dataUrl: string, item: MediaViewerItem) => {
      const mediaId = item.meta?.id ?? 0;
      const source = pictureOfMedia(mediaId);
      const kind = source ? source.kind || 'flat' : null;
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
        items: [
          {
            mediaId: media.id ?? 0,
            ghostView: '',
            kind,
            colorwayId: 0,
            // A CORRECTED COPY OF A MULTI-VIEW SHEET IS STILL A MULTI-VIEW SHEET: the views glued
            // into it did not change with the brightness. Filing it without them would make it
            // pickable into a single side — «the front of the garment» being four views at once.
            compositeViews: source?.compositeViews ?? [],
            // Not display-only: a copy baked from a band picture is a picture of the band, and the
            // flag is a statement about a file a person brought in from outside (D-24).
            displayOnly: false,
          },
        ],
      });
      showMessage('the corrected copy is in the band', 'success');
    },
    [pictureOfMedia, registerUpload, showMessage],
  );

  const api = useMemo<GalleryApi>(() => ({ register, openAt }), [register, openAt]);

  /**
   * ═══ КАКОЙ РАСТР ЗАМЕЩАЕТ КАКУЮ МОДЕЛЬ — СЧИТАЕТСЯ ЗДЕСЬ, ОДИН РАЗ НА ПОЛОСУ (J-29) ═══════
   *
   * ЗДЕСЬ, А НЕ У ЯЧЕЙКИ, ПО ТОЙ ЖЕ ПРИЧИНЕ, ПО КОТОРОЙ ЗДЕСЬ ЖИВЁТ РЯД ПРОСМОТРЩИКА: факт
   * «эта миниатюра стоит вместо той модели» — свойство ПОЛОСЫ, а не ячейки, и вывести его из
   * одной строки нельзя (контракт родства не несёт — довод в `threed/media.ts`). Провайдер уже
   * держит полосу; второй читатель рядом разошёлся бы с первым молча.
   *
   * ПРОВАЙДЕР БЕЗ ПОЛОСЫ ОТДАЁТ ПУСТУЮ КАРТУ, И ЭТО ПРАВДА, А НЕ ЗАГЛУШКА: экран, которому
   * полосу не дали, о 3D-прогонах карточки не знает ничего, и плитка ведёт себя как картинка.
   */
  const modelIndex = useMemo(() => threedModelIndex(band), [band]);

  return (
    <GalleryContext.Provider value={api}>
      <GalleryOpenContext.Provider value={!!row}>
        <ThreedModelIndexContext.Provider value={modelIndex}>
          {children}
        </ThreedModelIndexContext.Provider>
      </GalleryOpenContext.Provider>
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
        /* THE MASK OF THE FRAME ON STAGE (C-11) — only a frame whose tile offers one. The viewer
           closes first: the mask is its own full-screen surface, not a layer over this one. */
        actions={(_item, index) => {
          const mask = row?.masks[index];
          if (!mask) return null;
          return (
            <ViewerAction
              title='paint a zone of this picture and say what should be there'
              onClick={() => {
                onStage.current = null;
                setRow(null);
                mask();
              }}
            >
              mask
            </ViewerAction>
          );
        }}
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

/**
 * ═══ МЕНЮ В УГЛУ — «КУДА / ЧЕМ ЭТА КАРТИНКА» (T17, спека §3) ═════════════════════════════════
 *
 * Владелец: «кнопки unmark или селектор должны быть внутри плитки по принципу как это сделано в
 * flat slots». Все глаголы о картинке уже жили в кадре углами; не хватало одного рода органа —
 * ВЫБОРА. Это он: тихий угол `label ▾` первым в нижнем правом кластере (перед `edit`, который
 * поэтому не сдвигается), по нажатию — список, прикреплённый к углу.
 *
 * ВЫБОР И ЕСТЬ ДЕЙСТВИЕ. Это не поле формы: значения меню не держит, `onPick` зовётся ровно раз
 * на нажатие строки и закрывает список. Текущее значение (если оно есть) несут слово на углу и
 * отметка `current` в списке.
 */
export interface PictureTileMenuItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Отмечено в списке (`aria-selected`, точка). Значение, которое у картинки уже стоит. */
  current?: boolean;
  /** `danger` — необратимое (`delete…`), красным. */
  tone?: 'default' | 'danger';
  title?: string;
}

export interface PictureTileMenu {
  /** Слово угла в покое: `slot` · `front` · `role` · `not sent`. Треугольник дорисует плитка. */
  label: string;
  /** Обязательна: тихий орган без имени нечем объявить читалке экрана. */
  ariaLabel: string;
  title?: string;
  items: PictureTileMenuItem[];
  onPick: (value: string) => void;
  disabled?: boolean;
  /** Держит угол видимым и пишет `label…`, пока идёт запись. */
  pending?: boolean;
  /** Якорь проб: `slot:123`, `role:456`. Ложится на триггер как `data-menu`. */
  'data-menu'?: string;
}

/**
 * ФЛАГ — СОСТОЯНИЕ, КОТОРОГО КАДР НЕ ПОКАЗЫВАЕТ: `proposed` · `hidden` · `in the input` ·
 * `replaced`. Факт, а не глагол: виден всегда, прозрачен для указателя, стоит под ярлыком.
 */
export interface PictureTileFlag {
  word: string;
  tone: 'attention' | 'mut' | 'ink' | 'warn';
  title?: string;
}

export interface PictureTileProps {
  /** Состояние под ярлыком (верх слева). Разбор у `PictureTileFlag`. */
  flag?: PictureTileFlag;
  /** Угол выбора, первый в нижнем правом кластере. Разбор у `PictureTileMenu`. */
  menu?: PictureTileMenu;
  /** Адрес картинки. Пусто — рисуется кадр-заглушка со словом, а не молчаливая дыра. */
  url?: string;
  alt: string;
  /** Ярлык в левом верхнем углу. Не кнопка и прозрачен для указателя. */
  badge?: ReactNode;
  /** Кадр плитки. `4/5` — чертёж, `1/1` — референс. */
  aspect?: string;
  fit?: 'cover' | 'contain';
  /**
   * ГРУНТ ПОД КАДРОМ. `neutral` подкладывает под картинку панельный тон (`bgSecondary`) — тот же,
   * которым в этой плитке уже нарисованы «3d model» и «no image», то есть подложка здесь не
   * новая, а та же самая.
   *
   * Нужен он ровно вырезанным снимкам: у PNG с альфой фон не белый, а ПУСТОЙ, и на белом блоке
   * такая картинка читается не как вещь на светлом, а как дыра — граница предмета пропадает
   * вместе с кадром. Шахматки при этом НЕТ намеренно: клетчатый фон — язык редактора, а не
   * витрины, и в монохромной админке он спорил бы с самим снимком.
   *
   * Работает только при `fit='contain'`: у `cover` картинка закрывает кадр целиком, грунта не
   * видно, и обещать его там значило бы обещать невидимое.
   */
  ground?: 'neutral';
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
   * Кадр для общего просмотрщика. Есть — вся поверхность открывает зум (углового `zoom` нет,
   * T12); нет — плитка не листается и зума не обещает.
   */
  gallery?: MediaViewerItem;
  /**
   * Плитка принадлежит ГРУППЕ (`useGalleryGroup`) и своего кадра в ряд не кладёт: ряд группы
   * полон и без неё. Зум открывает группу на кадре с этим `mediaId` (id медиа картинки — тот же,
   * что `meta.id` кадра в ряду), а без него — на этом смещении (разбор у `openAt`). Задан вместе с
   * `gallery` — `gallery` проигрывает: две записи об одной картинке дали бы её в ряду дважды.
   */
  galleryGroup?: { key: string; index: number; mediaId?: number };
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
   * ЗУМ ПРИ ЭТОМ НЕ ТЕРЯЕТСЯ, А ПЕРЕЕЗЖАЕТ НА ДВОЙНОЙ КЛИК по той же поверхности: угловой
   * кнопки `zoom` больше нет нигде (T12, «кнопку зум на ховер нигде показывать не нужно»), а
   * раскрытая колода снимает `onOpen`, и её поверхность снова открывает зум одиночным кликом.
   */
  onOpen?: () => void;
  /**
   * ═══ ПЛИТКА СООБЩАЕТ, ЧТО ОНА ТОЛЬКО ЧТО УВЕЛА РЯД В ПРОСМОТРЩИК (E-4) ════════════════════
   *
   * ⚠ ЭТО ИЗВЕЩЕНИЕ, А НЕ ДВЕРЬ. Зум плитка открывает САМА и по-прежнему одна; `onZoom`
   * вызывается ПОСЛЕ `openAt` и ничего не решает. Экран, у которого от зума что-то зависит,
   * узнаёт факт — и не обязан ради этого отнимать у плитки её собственный жест.
   *
   * Заведено ради одной просьбы: «после экспанда спличеных карточек при зуме любой другой они
   * должны обратно колапсится». «Любой другой» — сравнение ДВУХ картинок, и знает его лента, а не
   * плитка: у плитки на руках нет ни своего id полосы, ни адреса открытой колоды. Поэтому решение
   * («сложить или оставить») принимает хозяин колоды, а плитка отдаёт ему ровно один факт.
   *
   * Срабатывает на любой путь в зум — клик или двойной клик по поверхности, — потому что оба
   * зовут один и тот же `openZoom`. Плитка без ряда (`zoomable === false`) не сообщает ничего: зума не было.
   */
  onZoom?: () => void;
  /**
   * ═══ РЕЗАТЬ — И КОГДА ЭТУ РОЛЬ ВООБЩЕ ПОЗВОЛЕНО ОБЪЯВЛЯТЬ (F-8, F-18) ═════════════════════
   *
   * Владелец, дословно: «везде где картинка не мультивью флет или рендер там не должно на ховер
   * показываться сплит» и «на уже заспличеных картинках на ховер сплит писать не нужно так же
   * как и на не мультивью картинках».
   *
   * ⚠ ПРАВИЛО ПРИНАДЛЕЖИТ ВЫЗЫВАЮЩЕМУ, И ЭТО НЕ ЛЕНЬ ПРИМИТИВА. Плитка знает АДРЕС ФАЙЛА и
   * больше ничего: ни `composite_views`, ни родства кропов, ни того, резали ли уже этот лист.
   * Ответить на «мультивью ли это и не разрезано ли оно» может только экран, у которого на руках
   * `common_DesignPicture` и карта родства.
   *
   * ⚠ НО ПРОЗЫ ЗДЕСЬ БОЛЬШЕ НЕ ХВАТИЛО, И ЭТО ЗАМЕР, А НЕ ОПАСЕНИЕ. Правило было написано в этом
   * комментарии и ПЕРЕПИСАНО на каждом месте вызова — четырьмя разными выражениями. Одно из
   * четырёх (плитка референса) не проверяло НИ ОДНОГО из двух членов: `!readOnly && url`, то есть
   * угол предъявлялся любому снимку, принесённому в референсы руками. Слова носителем правила не
   * бывают; носитель теперь — функция:
   *
   *   `pictureOffersSplit(picture, alreadyCut)` — `render/model.ts`. Роль `onSplit` объявляется
   *   ТОЛЬКО когда она сказала «да». Одиночный флэт, одиночный рендер, кусок чужого разреза и уже
   *   разрезанный лист роли не получают — не гашёной, а НЕ ОБЪЯВЛЕННОЙ: угол это тихий орган,
   *   и погашенный он читается как «сломалось», а не как «здесь нечего резать».
   *
   * Хозяев угла на сегодня четверо, И ВСЕ ЧЕТВЕРО ЗОВУТ ПРЕДИКАТ: полоса выходов
   * (`render/outputs.tsx`), вход 3D (`render/threed-input-strip.tsx`), плитка референсов
   * (`references-section.tsx`) и вход рендеров (`render/render-input-strip.tsx`) — последний на
   * обоих своих углах. Прежняя редакция этой записки называла четвёртого исключением, «пишущим то
   * же правило литералом (`disabled || cut || !composite`)» и ждущим перевода «следующей волной»;
   * волна прошла, литерала там нет, и записка описывала код, которого больше не существует.
   * (Что этот экран ДОБАВЛЯЕТ к предикату — свой довод и своя шапка; правило родства он у себя не
   * переписывает.) Пятый, лента генераций (`generation/generation-history.tsx`), намеренно вне
   * предиката: это единственная дверь, где ЧЕЛОВЕК ОБЪЯВЛЯЕТ принесённый руками лист многовидовым,
   * и довод стоит там же, у самого угла.
   */
  onSplit?: PictureTileAction;
  /**
   * КРОПНУТЬ ЭТУ ЖЕ КАРТИНКУ (J-8). Стоит РЯДОМ со `split`, в том же нижнем левом кластере: оба
   * органа режут один предмет, и разносить их по разным углам значило бы заводить второй словарь
   * мест для одного жеста. Роль без обработчика не рисуется, как и все остальные.
   */
  onCrop?: PictureTileAction;
  onEdit?: PictureTileAction;
  /**
   * ═══ MASK — PAINT A ZONE OF THIS PICTURE AND RETOUCH IT (C-11, tile 10) ═══════════════════
   *
   * The ONE Mask door of a picture: a corner in the lower-left cluster (it acts on a region of THIS
   * picture, like split and crop), and the same handler in the viewer while this frame is on stage
   * — the viewer reads it from the gallery entry, the screen does not pass it twice. Absent = no
   * Mask anywhere for this picture: the screen decides (the server offers `retouch_zone`, the
   * picture is a raster of the playground).
   */
  onMask?: PictureTileAction;
  /**
   * ═══ «ЭТА — ТА САМАЯ» (E-25) ══════════════════════════════════════════════════════════════
   *
   * Владелец, дословно: «в 3D MODELS OF THIS CARD кнопки OPEN DOWNLOAD SELECT должны появляться
   * на ховер на карточку а не кнопками снизу».
   *
   * ⚠ РОЛЬ ЗАВЕДЕНА В ПРИМИТИВЕ, А НЕ НАРИСОВАНА В ЯЧЕЙКЕ, И ЭТО ТОТ ЖЕ ЗАКОН УГЛОВ. Пометка
   * стоит на плитках ДВУХ экранов (выходы 3D и перекрас), и угол, нарисованный каждым из них
   * самостоятельно, разошёлся бы местом на первой же правке — ровно то «везде по разному», из-за
   * которого этот файл и написан.
   *
   * ГДЕ ОНА СТОИТ И ПОЧЕМУ ИМЕННО ТАМ. Низ справа, В КЛАСТЕРЕ ПЕРЕД `edit`, — по тому же доводу,
   * по которому низ слева стал кластером «сплит + кроп»: два органа одного края обязаны стоять
   * рядом и не наезжать. Верх справа не подошёл ЗАМЕРОМ, а не вкусом: ячейка полосы шириной
   * 132px, ярлык слева занимает всё, кроме 64px, и `open 3d` + `un-select` в этот остаток не
   * помещаются. Плитка, у которой есть только `edit`, при этом рисуется побайтово как прежде:
   * ряд прижат к правому краю, и единственный ребёнок стоит там же, где стоял одиночный угол.
   */
  onSelect?: PictureTileAction;
  onRemove?: PictureTileAction;
  /** Слово нижней левой роли. По умолчанию `split` — иных значений почти не бывает. */
  splitLabel?: string;
  /** Слово роли кропа. По умолчанию `crop`. */
  cropLabel?: string;
  /** Слово нижней правой роли. По умолчанию `edit`. */
  editLabel?: string;
  /** Слово роли пометки. Вызывающий шлёт `select` / `un-select` — состояние знает он, не плитка. */
  selectLabel?: string;
  /** Всё, что рисуется ПОВЕРХ кадра вызывающим (например, слой указаний). */
  children?: ReactNode;
  /**
   * ═══ ЛИЦО КАДРА, НАРИСОВАННОЕ ВЫЗЫВАЮЩИМ (J-12) ═══════════════════════════════════════════
   *
   * Заменяет ТОЛЬКО поверхность — не углы, не регистрацию в общем ряду просмотрщика, не зум.
   * Заведено ради одного случая, и он не про оформление: карточка паттерна показывает плитку
   * ЗАМОЩЁННОЙ 2×2, потому что вопрос к ней — «стык виден?», а на одном экземпляре у этого
   * вопроса нет ответа вовсе. Замощение — это `background-repeat` по тому же адресу, что и
   * `url`; `<img>` его нарисовать не может.
   *
   * ⚠ `url` ПРИ ЭТОМ ВСЁ РАВНО ОБЯЗАТЕЛЕН И ЗНАЧИМ: по нему решается, есть ли зум вообще
   * (`zoomable`), и он же адресует `.glb`-ветку. Лицо — это КАК рисовать, а не ЧТО показывать.
   */
  face?: ReactNode;
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
      className={cn(
        'z-20 py-0.5 leading-none',
        TILE_CORNER,
        TILE_QUIET,
        className,
        action.pending && 'opacity-100',
      )}
    >
      {action.pending ? pendingLabel ?? `${label}…` : label}
    </button>
  );
}

/**
 * УГОЛ-МЕНЮ. Оболочка — та же, что у `TwoStepPicker` (`GenericPopover`, строки `PICKER_ROW`), а
 * триггер — кожа угла (`TILE_CORNER + TILE_QUIET`), так что в покое он неотличим от `edit` рядом.
 * Список открывается ВВЕРХ и к правому краю (`side='top' align='end'`): угол стоит внизу кадра, и
 * вниз панель накрыла бы соседнюю плитку. Портал — значит `overflow-hidden` ячейки его не режет.
 */
function CornerMenu({ menu }: { menu: PictureTileMenu }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const rows = (): HTMLElement[] =>
    Array.from(panel.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? []).filter(
      (n) => !n.hasAttribute('disabled'),
    );
  const focusAt = (index: number) => {
    const list = rows();
    if (!list.length) return;
    list[((index % list.length) + list.length) % list.length]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = rows();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === 'ArrowDown'
        ? at + 1
        : e.key === 'ArrowUp'
          ? at < 0
            ? list.length - 1
            : at - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? list.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    focusAt(to);
  };
  const busy = !!menu.pending;
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      noTail
      triggerProps={{
        disabled: menu.disabled || busy,
        title: menu.title,
        'aria-label': menu.ariaLabel,
        'aria-haspopup': 'listbox',
        'aria-busy': busy || undefined,
        ...(menu['data-menu'] ? { 'data-menu': menu['data-menu'] } : {}),
        className: cn('z-20 py-0.5 leading-none', TILE_CORNER, TILE_QUIET, busy && 'opacity-100'),
      }}
      openElement={busy ? `${menu.label}…` : `${menu.label} ▾`}
      className='w-auto min-w-[136px] max-w-[240px]'
      contentProps={{
        side: 'top',
        align: 'end',
        sideOffset: 4,
        onOpenAutoFocus: (e: Event) => {
          // Фокус — на текущее значение, иначе на первую живую строку, а не на саму панель.
          e.preventDefault();
          window.requestAnimationFrame(() => {
            const list = rows();
            (list.find((n) => n.getAttribute('aria-selected') === 'true') ?? list[0])?.focus();
          });
        },
      }}
    >
      <div
        ref={panel}
        role='listbox'
        aria-label={menu.ariaLabel}
        className={PICKER_BLEED}
        onKeyDown={onKeyDown}
      >
        {menu.items.map((item) => (
          <button
            key={item.value}
            type='button'
            role='option'
            aria-selected={!!item.current}
            data-menu-item={item.value}
            data-current={item.current || undefined}
            tabIndex={-1}
            title={item.title}
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              menu.onPick(item.value);
            }}
            className={cn(
              PICKER_ROW,
              'disabled:pointer-events-none disabled:opacity-30',
              item.tone === 'danger' && 'text-error',
            )}
          >
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='span'
              className={cn('min-w-0 flex-1 truncate', item.tone === 'danger' && '!text-error')}
            >
              {item.label}
            </Text>
            {item.current ? (
              <span aria-hidden className='shrink-0 text-nano leading-none'>
                ●
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </GenericPopover>
  );
}

/**
 * ═══ ОДНО ОКНО ЖЕСТА: ОДИН КЛИК ИЛИ ДВА (HX2, починка гонки — Codex r2) ═══════════════════════
 *
 * Было: одиночный клик ждал 220 мс, а зум открывал РОДНОЙ `dblclick`. Порог двойного клика у ОС
 * свой (до 500 мс), и медленный двойной клик проходил оба пути сразу: таймер успевал позвать
 * `onOpen` (переключатель щёлкал), а потом `dblclick` открывал зум. Два арбитра, два порога.
 *
 * Стало: арбитр один — это окно. Второй клик, пришедший ВНУТРИ окна, и есть двойной: таймер
 * снимается, открывается зум. Окно кончилось без второго клика — срабатывает одиночное действие.
 * `e.detail` и `dblclick` не читаются вовсе, поэтому настройка ОС ни на что не влияет. Клики,
 * пришедшие ещё в окне после открытого зума (тройной клик), глотаются до его конца.
 */
const CLICK_WINDOW_MS = 350;

export function PictureTile({
  url,
  alt,
  badge,
  aspect = '4/5',
  fit = 'contain',
  ground,
  selected,
  dim,
  className,
  gallery,
  galleryGroup,
  onOpen,
  onZoom,
  onSplit,
  onCrop,
  onEdit,
  onMask,
  onSelect,
  onRemove,
  splitLabel = 'split',
  cropLabel = 'crop',
  editLabel = 'edit',
  selectLabel = 'select',
  children,
  face,
  flag,
  menu,
}: PictureTileProps) {
  const key = useId();
  const ctx = useContext(GalleryContext);
  const hostRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  /** Цель снимка, объявленная разделом вокруг. Нет — окно файлит нулём и говорит `sample`. */
  const snapshotTarget = useContext(SnapshotTargetContext);

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
   * ⚠ ФАЙЛ БОЛЬШЕ НЕ ЗАБИРАЮТ С САМОЙ ПЛИТКИ (E-25). Владелец, дословно: «кнопки OPEN DOWNLOAD
   * SELECT должны появляться на ховер на карточку а не кнопками снизу а кнопки DOWNLOAD быть не
   * должно она только во вьере».
   *
   * ЗДЕСЬ СТОЯЛО «СНАЧАЛА ЧЕСТНОСТЬ, ПОТОМ КРАСОТА»: плитка держала СВОИ `open` и `download`
   * посреди кадра, потому что «WebGL может быть выключен, а файл, за который заплачено, человеку
   * нужен всё равно». Довод не выброшен — он ПРОВЕРЕН и остался верным на один этаж глубже:
   * ссылка на файл в окне модели (`threed/model-modal.tsx`) стоит НАД сценой и от неё не зависит
   * — её собственная шапка это и объявляет, — поэтому упавший разбор `.glb` уносит картинку, но
   * не ссылку. Файл стал на одно нажатие дальше и не стал недостижимым.
   *
   * ЧТО ОТ ЭТОГО МЕНЯЕТСЯ У САМОЙ ПЛИТКИ. Лицо модели перестало быть коробкой С ОРГАНАМИ и стало
   * тем же, чем лицо всякой другой плитки, — кадром со словом. Значит поверхность больше не
   * обязана его обходить (см. `surfaceToModel` ниже), и обе плитки 3D — сам `.glb` и растр,
   * который стоит вместо него, — ведут себя ОДИНАКОВО: вся поверхность открывает просмотрщик
   * модели, а объявленный орган `open 3d` появляется в углу по наведению. Ровно то «на ховер, а
   * не кнопками» и ровно тот закон углов, ради которого этот файл написан.
   */
  const model = isModelUrl(url);
  /**
   * ═══ BEHIND THIS ADDRESS IS A CLIP (B-32) ══════════════════════════════════════════════════════
   *
   * A video run's .mp4 reaches `url` wherever the band draws a run's output — the room's results,
   * the history, the picker — for the same reason the `.glb` does (its media row has the clip in
   * every slot, no still). An `<img>` given an .mp4 is the broken frame that reads as «the server
   * failed» while the clip is paid for and there. So the primitive decides HOW to draw it: the
   * face is the clip itself, playing (`controls playsInline muted loop` — the owner's words), and
   * the zoom surface stays OFF it, else the surface would cover the player's controls; the zoom
   * corner still opens the viewer, which plays a video of its own.
   */
  const clip = !model && isVideoUrl(url);

  /**
   * ═══ ЗА ЭТОЙ КАРТИНКОЙ СТОИТ ФАЙЛ МОДЕЛИ (J-29) ═══════════════════════════════════════════
   *
   * Владелец: «в 3D MODELS OF THIS CARD на клик должен открываться просмотр 3д модели а сейчас
   * открывает в медиа просмотре и там это не работает».
   *
   * ⚠ ВЕТКА ВЫШЕ ЗАКРЫВАЛА ТОЛЬКО ПОЛОВИНУ СЛУЧАЯ. `isModelUrl(url)` ловит прогон, у которого
   * миниатюры НЕ ПРИШЛО, — там в `url` сам `.glb`. А обычный прогон 3D присылает и модель, и
   * растр, и в списке рисуется РАСТР: адрес у него картиночный, признак не срабатывал, и
   * единственная видимая плитка прогона вела в `<img>`-просмотрщик. Владелец кликает именно её.
   *
   * ОТВЕЧАЕТ ИНДЕКС ПОЛОСЫ, А НЕ ПРОП ЭКРАНА, и это то же решение, что закон углов десятью
   * строками выше: плитку 3D-прогона рисуют четыре разных места, и проп, который надо вспомнить
   * в каждом, возвращается забытым ровно в одном — то есть незаметно. Довод целиком в
   * `./threed/model-index.ts`.
   */
  const behind = useModelBehind(url);
  /** Адрес модели этой плитки: сам кадр, если он `.glb`, иначе модель, чей растр он замещает. */
  const modelHref = model ? url : behind;
  /**
   * ЛИЦО ПЛИТКИ — ТОЖЕ С ОТКАТОМ (D-7). Почти всякий вызывающий даёт сюда миниатюру, и тогда
   * запасного адреса нет и пробы не будет; но плитка, которой дали крупный файл (`url` равен
   * `gallery.src`), после его 403 показывает тот же thumb, что и ряд просмотрщика, — из той же
   * памяти павших адресов. Признак модели и индекс за плиткой читают ИСХОДНЫЙ `url`: подмена —
   * про то, КАК нарисовать, а не про то, что за этим адресом стоит.
   */
  const faceSrc = useLoadableSrc(url, gallery?.thumbnail);
  /**
   * ═══ АДРЕС ЕСТЬ, ФАЙЛА НЕТ — ЛИЦО ГОВОРИТ ЭТО СЛОВОМ (O-55) ═══════════════════════════════
   *
   * Бета: у части кропов бакет отдаёт 403 на КАЖДЫЙ вариант, миниатюру тоже, — откату D-7 выше
   * подставлять нечего, и плитка стояла с браузерной иконкой битой картинки без единого слова.
   * Теперь лицо, чей `<img>` не загрузился, становится кадром со словом «file missing» — тем же
   * кадром, каким здесь уже нарисованы «no image» и «3d model».
   *
   * ⚠ ОШИБКУ СЛЫШИТ ОБЁРТКА ЛИЦА, А НЕ САМ `<img>`, И ЭТО НЕ ОБХОД. `<img>` рисует примитив
   * `MediaComponent` (`ui/components/media`), и наружу он его событий не отдаёт. Синтетические
   * события React всплывают по дереву компонентов — все, кроме `onScroll`, `onError` картинки в
   * том числе, — поэтому `onError` на обёртке ловит ошибку её `<img>`, и общий примитив остаётся
   * нетронутым. Слушает обёртка ТОЛЬКО в ветке `MediaComponent`: лицо вызывающего (`face`) и лицо
   * модели не её, и их ошибки не её дело.
   *
   * Помнится АДРЕС, который не загрузился, а не флаг: откат D-7 на миниатюру и новый `url` дают
   * другой адрес, и он пробуется честно, один раз; павший же не запрашивается снова — `<img>`
   * снят, повторять нечего. Двери плитки (углы, подвал вызывающего) от этого не меняются: слово
   * заменяет ТОЛЬКО картинку.
   */
  const [faceFailed, setFaceFailed] = useState<string | null>(null);
  const hearsFace = !model && !clip && !face && !!url;
  const faceBroken = hearsFace && !!faceSrc && faceFailed === faceSrc;
  const opensModel = !!modelHref;
  /**
   * ⚠ ПОВЕРХНОСТЬ ЕСТЬ У ОБЕИХ ПЛИТОК 3D, И ЭТО ПРАВКА, А НЕ УПРОЩЕНИЕ (E-25).
   *
   * Здесь стояло `opensModel && !model` с доводом: «у плитки, чей `url` — сам `.glb`, поверхности
   * нет, потому что её лицо — коробка с ДВУМЯ СОБСТВЕННЫМИ органами (`open` и, главное,
   * `download`), и слой `absolute inset-0 z-10` накрыл бы их обоих». Довод был верен ровно до
   * той минуты, пока органы у лица были: владелец их снял (`download` — насовсем, `open` —
   * переехал в угол по наведению). Накрывать стало нечего, и исключение вместе с причиной ушло.
   *
   * ⚠ И ЭТО НЕ ОТКАТ ЗАМЕРА, А ЕГО ВТОРАЯ ПОЛОВИНА. Проба P11 («open на плитке поднимает сцену»)
   * покраснела когда-то потому, что поверхность отняла нажатие у кнопки лица. Кнопки лица больше
   * нет; сцену теперь поднимают поверхность и угловой `open 3d`, и оба здесь же.
   */
  const surfaceToModel = opensModel;

  /** The Mask door of this tile, current (the viewer calls it through the gallery entry). */
  const maskRef = useRef(onMask);
  maskRef.current = onMask;
  const masks = !!onMask && !onMask.disabled;
  // Регистрация переигрывается на смене адреса кадра, иначе просмотрщик листал бы вчерашние
  // ссылки: строка истории переезжает с картинки на картинку, не размонтируясь.
  useEffect(() => {
    const node = hostRef.current;
    // Кадр БЕЗ адреса в ряд не встаёт. Иначе «дальше» приводило бы человека к пустой сцене, и
    // выглядело бы это как сломанный просмотрщик, а не как отсутствующая картинка.
    // Модель в ряд не встаёт ПО ТОЙ ЖЕ ПРИЧИНЕ: общий просмотрщик — это `<img>`, и `.glb` в ряду
    // дал бы человеку пустую сцену посреди листания, ничем не объяснённую.
    //
    // ⚠ И ПОСТЕР МОДЕЛИ ТОЖЕ НЕ ВСТАЁТ (J-29). Он картинка, листать его технически можно — но
    // тогда у него было бы ДВА клика с разным смыслом (поверхность открывает модель, стрелка
    // «дальше» приводит сюда же плоским кадром), и человек, дошедший до него листанием, увидел
    // бы PNG вместо предмета, за который заплачено. Ряд обязан состоять из того, что в нём
    // показывается одинаково.
    if (!ctx || galleryGroup || !gallery?.src || isModelUrl(gallery.src) || opensModel || !node)
      return;
    ctx.register(key, {
      node,
      items: [gallery],
      // Through the ref: the screen hands a fresh handler every render, the entry stays one.
      mask: masks ? () => maskRef.current?.onClick() : undefined,
    });
    return () => ctx.register(key, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ctx,
    key,
    galleryGroup?.key,
    gallery?.src,
    gallery?.thumbnail,
    gallery?.alt,
    opensModel,
    masks,
  ]);

  const zoomable = !!ctx && !!url && !opensModel && (!!galleryGroup || !!gallery);
  /* ⚠ ИЗВЕЩЕНИЕ ИДЁТ ПОСЛЕ ОТКРЫТИЯ, И ПОРЯДОК НЕСУЩИЙ. `openAt` собирает ряд ПО ТЕКУЩЕМУ
     ДОКУМЕНТУ и берёт смещение, посчитанное в этой же отрисовке; слушатель же обычно складывает
     колоду, то есть уносит из документа её куски. Сообщи мы раньше — ряд собрался бы уже без них,
     а смещение осталось бы прежним, и человек увидел бы на сцене СОСЕДНИЙ кадр. После открытия
     провайдер пересобирает ряд сам и держит место по АДРЕСУ кадра, а не по номеру. */
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const openZoom = useCallback(() => {
    if (galleryGroup) ctx?.openAt(galleryGroup.key, galleryGroup.index, galleryGroup.mediaId);
    else ctx?.openAt(key);
    onZoomRef.current?.();
  }, [ctx, key, galleryGroup?.key, galleryGroup?.index, galleryGroup?.mediaId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══ ОДИН КЛИК ИЛИ ДВА — РЕШАЕТ ОДНО ОКНО (HX2; разбор у `CLICK_WINDOW_MS`) ═══════════════
     Где одиночный клик занят `onOpen` (выбор, раскрытие колоды, пипетка), а двойной открывает
     зум. Клик с клавиатуры (`detail === 0`) не ждёт ничего. Плитка, где одиночный клик сам
     открывает просмотрщик, окна не держит — там спорить не о чем. */
  const arbitrates = !!onOpen && zoomable && !clip;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  /** Окно жеста: открыто первым кликом; `double` — второй клик в нём уже открыл зум. */
  const gesture = useRef<{ timer: number; double: boolean } | null>(null);
  const closeGesture = useCallback(() => {
    if (gesture.current) window.clearTimeout(gesture.current.timer);
    gesture.current = null;
  }, []);
  useEffect(() => closeGesture, [closeGesture]);
  const arbitratedClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.detail === 0) {
        closeGesture();
        onOpenRef.current?.();
        return;
      }
      const open = gesture.current;
      if (open) {
        if (open.double) return;
        open.double = true;
        openZoom();
        return;
      }
      const timer = window.setTimeout(() => {
        const ended = gesture.current;
        gesture.current = null;
        if (ended && !ended.double) onOpenRef.current?.();
      }, CLICK_WINDOW_MS);
      gesture.current = { timer, double: false };
    },
    [closeGesture, openZoom],
  );

  return (
    <div
      ref={hostRef}
      /* ОБЪЯВЛЕННЫЙ ЯКОРЬ КАДРА. Раньше единственным способом ткнуть в поверхность плитки был её
         css-класс — то есть проба держалась за оформление и пережила бы правку смысла. */
      data-picture-tile=''
      /* И ОБЪЯВЛЕННОЕ СОСТОЯНИЕ: «мой клик ведёт в модель, а не в просмотрщик картинок» (J-29).
         Флаг не заменяет пробу последствия — он даёт ей чем прицелиться. */
      data-opens-model={opensModel || undefined}
      /* B-32: the face is a playing clip, and the zoom surface is off it (its controls are live). */
      data-clip={clip || undefined}
      /* ═══ ГРУНТ ЖИВЁТ НА САМОЙ ПЛИТКЕ, А ПРИГЛУШЕНИЕ — НА ОБЁРТКЕ КАРТИНКИ ══════════════════
         Стояли они на ОДНОМ узле, и `opacity-40` гасила их вместе: у выключенной плитки бледнела
         не только картинка, а и подложка под ней — то есть исчезала ровно та граница предмета,
         ради которой грунт и появился. Слоя два, значит и узла должно быть два.
         Внешним взят САМ хозяин плитки, а не новая обёртка: коробка у них одна и та же (обёртка
         и так `h-full w-full` на всю плитку), фон под непрозрачной рамкой не виден, — то есть
         лишний узел не дал бы ни пикселя разницы, зато сдвинул бы приглушённую обёртку на ярус
         вглубь. Геометрия и глубина дерева не трогаются вовсе. */
      data-ground={ground === 'neutral' && fit === 'contain' ? 'neutral' : undefined}
      /* O-55: объявленное состояние «файла нет» и подсказка к нему. Подсказка на ХОЗЯИНЕ, а не на
         слове: поверхность-зум накрывает лицо целиком, и `title` слова наведением не достать. */
      data-thumb-broken={faceBroken ? '' : undefined}
      title={faceBroken ? FILE_MISSING_TITLE : undefined}
      className={cn(
        'group relative border',
        selected ? 'border-2 border-textColor' : 'border-textInactiveColor',
        /* Грунт стоит ПОД кадром, а не на самой картинке: при `contain` кадр не заполнен, и тон
           обязан лежать и в полях над снимком, и за его прозрачными точками — иначе у вырезанного
           предмета остаётся половина фона. `className` идёт следом намеренно: тон, заданный
           вызывающим, обязан перебивать грунт, а не наоборот. */
        ground === 'neutral' && fit === 'contain' && 'bg-bgSecondary',
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      {/* ОБЁРТКА НЕСЁТ ТОЛЬКО ПРИГЛУШЕНИЕ И НИЧЕГО БОЛЬШЕ — грунт с неё съехал на хозяина плитки
          (см. выше), и гасить ей теперь нечего, кроме самой картинки. `h-full w-full` в потоке —
          ровно те же коробка и место, что были у самого `MediaComponent` (его контейнер при
          `aspectRatio='auto'` таков же), поэтому кадр не сдвигается ни на пиксель. */}
      <div
        className={cn('h-full w-full', dim && 'opacity-40')}
        onError={
          hearsFace
            ? (e) => {
                const img = e.target;
                if (img instanceof HTMLImageElement) setFaceFailed(img.getAttribute('src'));
              }
            : undefined
        }
      >
        {model && url ? (
          /* ЛИЦО МОДЕЛИ — КАДР СО СЛОВОМ, И БОЛЬШЕ НИЧЕГО (E-25). Здесь стояли `open` и
             `download` — два органа посреди картинки, то есть ровно «кнопками», против которых
             написан пункт владельца. Оба ушли: открыть модель теперь можно поверхностью и
             угловым `open 3d` (как у любой другой плитки 3D), а забрать файл — в самом окне
             модели, где ссылка стоит над сценой и от неё не зависит.
             Слово остаётся обязательным: `.glb` нечем нарисовать, и молчаливый серый прямоугольник
             человек прочёл бы как «сервер не справился», хотя за модель заплачено и она есть. */
          <div className='flex h-full w-full flex-col items-center justify-center gap-1.5 bg-bgSecondary px-1 text-center'>
            <Text size='nano' variant='uppercase' component='span'>
              3d model
            </Text>
          </div>
        ) : clip && url ? (
          /* THE FACE OF A CLIP IS THE CLIP (B-32): muted and looping so it plays where it stands,
             with the browser's own controls (the sound is the person's to switch on). `preload`
             metadata: a grid of twenty tiles must not pull twenty files at once. */
          <video
            src={url}
            controls
            playsInline
            muted
            loop
            preload='metadata'
            aria-label={alt}
            className='h-full w-full object-contain'
            style={{ objectFit: fit }}
          />
        ) : face ? (
          face
        ) : faceBroken ? (
          <div className='flex h-full w-full items-center justify-center bg-bgSecondary px-1 text-center'>
            <Text size='nano' variant='label' component='span' className='uppercase'>
              {FILE_MISSING_WORDS}
            </Text>
          </div>
        ) : url ? (
          <MediaComponent src={faceSrc} alt={alt} aspectRatio='auto' fit={fit} />
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
      {/* ⚠ ПОРЯДОК ТРЁХ СМЫСЛОВ ПОВЕРХНОСТИ — ЭТО ДОВОД, А НЕ ПОРЯДОК НАПИСАНИЯ. `onOpen`
          (раскрытие колоды) старше всего: пока лист свёрнут, за ним стоит не один предмет, и
          открывать «его» нечего. Дальше — МОДЕЛЬ: если за кадром файл модели, поверхность ведёт
          туда, потому что предмет здесь модель, а картинка — только её изображение (J-29). Зум
          остаётся тем, чем был, для всего остального. */}
      {/* ═══ УГЛОВОЙ `zoom` СНЯТ (T12: «кнопку зум на ховер нигде показывать не нужно») ═══════
          Поверхность стала ЕДИНСТВЕННЫМ органом зума, поэтому, когда она зум и открывает, она
          больше не `aria-hidden`: имя, фокус и объявление читалке переехали на неё с угла — одно
          действие по-прежнему один орган. Там, где одиночный клик занят `onOpen` (раскрыть колоду,
          выбрать, отправить на верстак), зум открывает ДВОЙНОЙ клик по той же поверхности. */}
      {(onOpen || (!clip && (zoomable || surfaceToModel))) &&
        (() => {
          const zoomSurface = !onOpen && !surfaceToModel;
          return (
            <button
              type='button'
              tabIndex={zoomSurface ? undefined : -1}
              aria-hidden={zoomSurface ? undefined : 'true'}
              aria-label={zoomSurface ? `zoom ${alt}` : undefined}
              onClick={
                arbitrates
                  ? arbitratedClick
                  : onOpen ?? (surfaceToModel ? () => setModelOpen(true) : openZoom)
              }
              className={cn(
                'absolute inset-0 z-10',
                zoomSurface
                  ? 'cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                  : 'cursor-pointer',
              )}
            />
          );
        })()}

      {children}

      {/* ВЕРХ СЛЕВА — ФАКТЫ, СТОЛБИКОМ: ярлык (что это), под ним флаг (в каком оно состоянии).
          Оба видны всегда и прозрачны для указателя. Флаг стоит на непрозрачной подложке: пилюля
          прозрачна, а под ней снимок. Без ярлыка флаг поднимается в сам угол. */}
      {(badge || flag) && (
        <div className='pointer-events-none absolute left-1 top-1 z-20 flex max-w-[calc(100%-64px)] flex-col items-start gap-0.5'>
          {badge && (
            <span className='inline-block bg-textColor px-1.5 py-0.5'>
              <Text
                size='nano'
                variant='uppercase'
                component='span'
                className='!text-bgColor break-words'
              >
                {badge}
              </Text>
            </span>
          )}
          {flag && (
            <span className='inline-block max-w-full bg-bgColor' data-flag={flag.word}>
              <Pill tone={flag.tone} title={flag.title} className='max-w-full truncate'>
                {flag.word}
              </Pill>
            </span>
          )}
        </div>
      )}

      {/* Верх справа — РЯД, а не угол: `open 3d` и ✕ обязаны стоять рядом, не наезжая. */}
      {(surfaceToModel || onRemove) && (
        <div className='absolute right-1 top-1 z-20 flex items-start gap-1'>
          {/* ОБЪЯВЛЕННЫЙ ОРГАН — УГЛОВАЯ КНОПКА, А НЕ ПОВЕРХНОСТЬ: у плитки модели поверхность
              `aria-hidden` и живёт только для мыши, а имя, фокус и объявление читалке принадлежат
              кнопке. Слово другое, потому что и предмет другой:
              «zoom» обещает ту же картинку крупнее, а здесь открывается модель.

              ⚠ ТЕПЕРЬ ОНА ЕСТЬ И У ПЛИТКИ, ЧЕЙ `url` — САМ `.glb` (E-25). Здесь стояло
              исключение с доводом «её лицо уже несёт собственные `open` и `download`, и второй
              орган того же действия был бы вторым способом сделать одно». Органов у лица больше
              нет, значит этот — ПЕРВЫЙ и единственный, и без него `.glb`-плитка осталась бы с
              одной мышиной поверхностью: ни имени, ни фокуса, ни объявления читалке. */}
          {surfaceToModel && (
            <Corner
              action={{
                onClick: () => setModelOpen(true),
                ariaLabel: `open the 3D model of ${alt}`,
                title: 'open the 3D model — orbit, zoom, download',
              }}
              label='open 3d'
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
      {(onSplit || onCrop || onMask) && (
        <div className='absolute bottom-1 left-1 z-20 flex items-end gap-1'>
          {onSplit && <Corner action={onSplit} label={splitLabel} className='' />}
          {onCrop && <Corner action={onCrop} label={cropLabel} className='' />}
          {onMask && <Corner action={onMask} label='mask' className='' />}
        </div>
      )}
      {/* НИЗ СПРАВА — ТОЖЕ КЛАСТЕР (E-25), и по той же причине, что низ слева: у плитки выходов
          3D рядом с правкой встала пометка, а два органа в одном углу — это либо наезд, либо
          кнопка под кнопкой. Ряд прижат к правому краю, поэтому `edit` остаётся ПОСЛЕДНИМ и стоит
          ровно там, где стоял всегда: плитка без пометки не сдвигается ни на пиксель. */}
      {/* `menu` — ПЕРВЫМ (T17): выбор «куда» встаёт левее, и `edit` по-прежнему последний. */}
      {(menu || onSelect || onEdit) && (
        <div className='absolute bottom-1 right-1 z-20 flex items-end gap-1'>
          {menu && <CornerMenu menu={menu} />}
          {onSelect && <Corner action={onSelect} label={selectLabel} className='' />}
          {onEdit && <Corner action={onEdit} label={editLabel} className='' />}
        </div>
      )}

      {/* Окно монтируется только открытым: `three` грузится динамически, но и сама оболочка не
          обязана стоять по одной на каждую плитку сетки из двадцати. */}
      {modelOpen && modelHref && (
        <ThreedModelModal
          url={modelHref}
          title={alt || '3d model'}
          /* ЦЕЛЬ СНИМКА — ОТ РАЗДЕЛА, А НЕ ОТ ПЛИТКИ: разбор у `ModelSnapshotTarget` выше.
             Без объявленной области это ноль — ровно то, чем окно файлило всегда. */
          colorwayId={snapshotTarget?.colorwayId ?? 0}
          colorwayLabel={snapshotTarget?.label ?? ''}
          onClose={() => setModelOpen(false)}
        />
      )}
    </div>
  );
}
