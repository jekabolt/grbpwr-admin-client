// ОДИН разбор DXF на всю вкладку выкроек — и его результат в двух картинках.
//
// Раньше одни и те же файлы карточки скачивались и разбирались ТРИЖДЫ, без единого общего кэша:
// «⌕ размеры в файлах» на панели выкроек (ради токенов размера), «⌕ деталь в чертеже» на панели
// деталей кроя (ради контура под курсором) и сама раскладка. Каждый из них платил десятками
// мегабайт с CDN за свой кусочек одного и того же ответа, и оператор, прошедший по вкладке сверху
// вниз, платил трижды.
//
// Здесь это сведено к одному запросу в React Query, ключуемому СОДЕРЖИМЫМ пачки (скоуп + url).
// Второй читатель той же пачки получает готовую геометрию мгновенно, а `staleTime: Infinity`
// означает буквальное «файл по этому url не меняется»: перезалитая выкройка приезжает с новым
// url, то есть с новым ключом, — инвалидировать нечего.
//
// Разбор по-прежнему НЕ стартует сам: `enabled` держит его выключенным, пока экран не скажет, что
// картинки нужны. Открытие вкладки не должно тянуть файлы — это правило, ради которого превью
// сидело за кнопкой, и общий кэш его не отменяет, а делает дешевле: заплатив один раз, оператор
// получает и покрытие размеров, и формы деталей, и миниатюры листов.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { NEST_DEFAULTS, type PieceDTO } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useMemo } from 'react';
import { normBlock } from './block-code';
import { defaultContourLayer, layerOptions } from './contour-layer';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { aliasIdentity, splitPiecesBySize, useDictionarySizeTokens, type BlockSplit } from './use-block-sizes';

/** Лист выкройки вместе с РАЗРЕШЁННЫМ скоупом ткани, в котором он лежит. */
export type ScopedDxfFile = { scopeKey: string; name: string; url: string };

/** Связь «деталь кроя → блок», как её видит таблица: имя блока и скоуп, в котором оно значит. */
export type PieceBlockRef = { scopeKey: string; block: string };

export type DxfBundle = {
  pieces: PieceDTO[];
  // Индекс файла в РАЗОБРАННОЙ пачке → скоуп. Не в исходной: недокачанные файлы из пачки
  // выпадают, и индексы после них сдвигаются — сопоставлять их с исходным списком напрямую
  // значит приписать деталям чужую ткань, то есть ровно ту ошибку, от которой скоуп и спасает.
  scopeByFile: Map<number, string>;
  warnings: string[];
};

/** Ключ кэша = СОДЕРЖИМОЕ пачки. Родитель пересобирает массив на каждый рендер формы. */
export function filesSignature(files: readonly ScopedDxfFile[]): string {
  return files.map((f) => `${f.scopeKey}|${f.url}`).join('\n');
}

/**
 * Скачать и разобрать пачку выкроек. Один запрос на пачку, общий для всех читателей.
 *
 * `enabled=false` — разбор не стартует и уже лежащий в кэше ответ не трогается: экран, который
 * ещё не просили показывать формы, не должен ни качать, ни выгружать чужое.
 */
export function useDxfGeometry(
  files: readonly ScopedDxfFile[],
  enabled: boolean,
): UseQueryResult<DxfBundle, Error> {
  const sig = filesSignature(files);
  return useQuery<DxfBundle, Error>({
    queryKey: ['dxf-geometry', sig],
    enabled: enabled && files.length > 0,
    staleTime: Infinity,
    // Геометрия целой карточки — это мегабайты в куче. Пять минут после того, как её перестали
    // показывать, — достаточный запас, чтобы переход между вкладками не платил повторно, и
    // достаточно короткий, чтобы вкладка, оставленная открытой на день, не держала их вечно.
    gcTime: 5 * 60_000,
    // Ретрай тут вреден: недоступный CDN — это ответ («не удалось скачать»), с которым экран
    // умеет жить, а повтор стоит второго скачивания всего, что скачалось.
    retry: false,
    queryFn: async ({ signal }) => {
      const client = new NestingWorkerClient();
      const abort = () => client.terminate();
      signal.addEventListener('abort', abort);
      try {
        // allSettled: одна недоступная ссылка не должна отменять файлы, которые скачались.
        const settled = await Promise.allSettled(
          files.map(async (f) => new File([await fetchMediaBlob(f.url)], f.name)),
        );
        const fetched: File[] = [];
        const scopeByFile = new Map<number, string>();
        const warnings: string[] = [];
        settled.forEach((s, i) => {
          if (s.status === 'fulfilled') {
            scopeByFile.set(fetched.length, files[i].scopeKey);
            fetched.push(s.value);
          } else {
            warnings.push(`${files[i].name}: не удалось скачать`);
          }
        });
        if (fetched.length === 0) throw new Error('не удалось скачать ни один DXF с CDN');
        const out = await client.parse(fetched, {
          unit: 'auto',
          tol: NEST_DEFAULTS.tol,
          tolChain: NEST_DEFAULTS.tolChain,
        });
        return { pieces: out.pieces, scopeByFile, warnings: [...warnings, ...out.warnings] };
      } finally {
        // Контуры уже уехали на главный поток вместе с ответом — держать воркер (а в нём всю
        // разобранную геометрию) до перезагрузки страницы незачем.
        signal.removeEventListener('abort', abort);
        client.terminate();
      }
    },
  });
}

export type DxfIndex = {
  split: BlockSplit;
  contourLayer: string;
  grainLayer: string;
  /** `{скоуп}|{идентичность блока в нижнем регистре}` → размер → контуры. */
  byKey: Map<string, Map<string, PieceDTO[]>>;
  /** Индексы файлов разобранной пачки, лежащие в этом скоупе. */
  filesOfScope: Map<string, number[]>;
};

/**
 * Контуры, разложенные по (скоуп, деталь чертежа, размер).
 *
 * Слой контура ПРЕДПОЧИТАЕТСЯ тот же, что в диалоге сопоставления: настоящая деталь ГРАДУИРУЕТСЯ,
 * а линия шва и справочный контур базового размера — нет, и показать линию шва вместо линии кроя
 * значит показать габарит без припуска. Но фильтровать по нему НАСМЕРТЬ нельзя: слой выбирается
 * один на всю пачку, а файл подклада законно чертит на другом — и деталь, которая в чертеже есть,
 * объявлялась бы ненайденной. Поэтому кладём всё, а выбираем при показе.
 */
export function useDxfIndex(bundle: DxfBundle | undefined): DxfIndex | null {
  const dictTokens = useDictionarySizeTokens();
  return useMemo(() => {
    if (!bundle) return null;
    const split = splitPiecesBySize(bundle.pieces, dictTokens);
    const contourLayer = defaultContourLayer(layerOptions(bundle.pieces, split.codeById));
    const grainLayer = defaultGrainLayer(grainLayerOptions(bundle.pieces));
    const byKey = new Map<string, Map<string, PieceDTO[]>>();
    const filesOfScope = new Map<string, number[]>();
    for (const [fileIndex, scope] of bundle.scopeByFile) {
      filesOfScope.set(scope, [...(filesOfScope.get(scope) ?? []), fileIndex]);
    }
    for (const p of bundle.pieces) {
      const code = split.codeById.get(p.id);
      const identity = normBlock(code?.identity ?? p.blockName ?? '');
      if (!identity) continue; // безымянный контур ни к какой детали кроя не привязан
      const scope = bundle.scopeByFile.get(p.fileIndex ?? -1) ?? '';
      const key = `${scope}|${identity.toLowerCase()}`;
      const bySize = byKey.get(key) ?? new Map<string, PieceDTO[]>();
      const size = code?.size ?? '';
      bySize.set(size, [...(bySize.get(size) ?? []), p]);
      byKey.set(key, bySize);
    }
    return { split, contourLayer, grainLayer, byKey, filesOfScope };
  }, [bundle, dictTokens]);
}

export type FoundPiece = {
  piece: PieceDTO;
  block: string;
  size: string;
  instances: number;
  layer: string;
  sizes: string[];
};

/**
 * Найти в чертеже деталь по её привязкам. Первая привязка, которая нашлась, и выигрывает —
 * порядок задаёт вызывающий.
 */
export function findPiece(index: DxfIndex | null, refs: readonly PieceBlockRef[]): FoundPiece | null {
  if (!index || refs.length === 0) return null;
  for (const r of refs) {
    // Сохранённый алиас может нести размер прямо в имени («BP_1_XS») — сворачиваем к идентичности
    // тем же правилом, что и диалог сопоставления, иначе ключи разойдутся. Правило спрашивает
    // ФАЙЛ: «FP_L» — это левая полочка целиком, и срезать у неё «L» только потому, что в ряду есть
    // размер L, значит искать деталь под именем, которого в чертеже нет (см. aliasIdentity).
    const identity = aliasIdentity(r.block, index.split);
    const bySize = index.byKey.get(`${r.scopeKey}|${identity.toLowerCase()}`);
    if (!bySize || bySize.size === 0) continue;
    // Один чертёж несёт всю градацию. Показываем СРЕДИННЫЙ размер: силуэт у всех один, а базовый
    // размер — то, как деталь представляют себе в лекальном цеху.
    const sizes = [...bySize.keys()].sort(
      (a, b) => (index.split.orderOfSize.get(a) ?? 1e6) - (index.split.orderOfSize.get(b) ?? 1e6),
    );
    const size = sizes[Math.floor((sizes.length - 1) / 2)];
    const list = bySize.get(size)!;
    // Линия кроя, если она у этой детали есть; иначе то, что в файле нарисовано вообще — показать
    // не тот слой честнее, чем сказать «детали нет».
    const onLayer = list.filter((p) => (p.layer ?? '') === index.contourLayer);
    const drawn = onLayer.length > 0 ? onLayer : list;
    // Сколько раз деталь лежит в ОДНОМ листе, а не сумма по листам: два листа одной ткани и одного
    // размера — это обычно две РЕВИЗИИ одного чертежа, и сложенные они прочитались бы как «деталь
    // идёт по две на изделие». Тот же максимум-по-файлам, что считает диалог сопоставления.
    const perFile = new Map<number, number>();
    for (const p of drawn) {
      const fi = p.fileIndex ?? -1;
      perFile.set(fi, (perFile.get(fi) ?? 0) + 1);
    }
    return {
      piece: drawn[0],
      block: identity,
      size,
      instances: Math.max(...perFile.values()),
      layer: drawn[0].layer ?? '',
      sizes,
    };
  }
  return null;
}

// Чертёжные координаты → экранные: DXF считает Y вверх, SVG — вниз. Инвертируем в числах, как и
// лист сопоставления, а не групповым transform — под ним зеркалились бы подписи.
const vy = (y: number) => -y;

/** Габарит в сантиметрах, как его печатают рядом с контуром. */
export const fmtCm = (cm: number) => (cm >= 100 ? cm.toFixed(0) : cm.toFixed(1));

/**
 * Одна деталь в СВОИХ координатах: контур, внутренняя геометрия (линия шва, надсечки, свёрла) и
 * долевая. `poly` и `inner` уже нормализованы к габариту детали, `grain` — нет: он приходит в
 * абсолютных координатах чертежа, поэтому сдвигается на origin детали.
 */
export function PieceShape({
  piece,
  grainLayer,
  className,
}: {
  piece: PieceDTO;
  grainLayer: string;
  className?: string;
}) {
  const pad = Math.max(piece.bboxW, piece.bboxH, 1) * 0.06;
  const box = {
    x: -pad,
    y: -piece.bboxH - pad,
    w: piece.bboxW + 2 * pad,
    h: piece.bboxH + 2 * pad,
  };
  const points = piece.poly.map((pt) => `${pt.x},${vy(pt.y)}`).join(' ');
  const inner = (piece.inner ?? []).filter((c) => c.layer !== grainLayer);
  // Долевую можно положить на место только зная, где деталь лежала в чертеже. У детали без origin
  // её просто не рисуем — нарисованная от нуля, она ушла бы мимо контура.
  const grain =
    grainLayer && piece.originX != null && piece.originY != null
      ? (piece.grain ?? []).filter((g) => g.layer === grainLayer)
      : [];
  const ox = piece.originX ?? 0;
  const oy = piece.originY ?? 0;

  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      className={className ?? 'block h-full w-full'}
      role='img'
      aria-label={`контур детали ${piece.blockName ?? piece.name}`}
    >
      <polygon
        points={points}
        fill='#f2f2f2'
        stroke='#111111'
        strokeWidth={box.w / 120 || 0.01}
        strokeLinejoin='round'
      />
      {inner.length > 0 && (
        <g fill='none' stroke='#8a8a8a' strokeWidth={box.w / 300 || 0.01}>
          {inner.map((c, i) => {
            const pts = c.pts.map((pt) => `${pt.x},${vy(pt.y)}`).join(' ');
            return c.closed ? <polygon key={i} points={pts} /> : <polyline key={i} points={pts} />;
          })}
        </g>
      )}
      {/* Ровно один отрезок = то, что ориентация считает долевой (см. grain.ts). Несколько —
          значит слой несёт не только её, и показывать «долевую» было бы выдумкой. */}
      {grain.length === 1 && (
        <line
          x1={grain[0].a.x - ox}
          y1={vy(grain[0].a.y - oy)}
          x2={grain[0].b.x - ox}
          y2={vy(grain[0].b.y - oy)}
          stroke='#c22222'
          strokeWidth={box.w / 160 || 0.01}
        />
      )}
    </svg>
  );
}

/**
 * Миниатюра ЛИСТА: все детали одного скоупа в координатах чертежа, только внешние контуры.
 *
 * Это не превью для чтения, а опознавательный знак материала на плитке: по силуэтам сразу видно,
 * лежит ли под «подкладкой» подкладка или туда по ошибке привязали корпус. Поэтому ни линии шва,
 * ни долевой, ни подписей — только очертания, тонкой линией.
 */
export function SheetThumb({
  index,
  scopeKey,
  className,
  limit = 24,
}: {
  index: DxfIndex;
  scopeKey: string;
  className?: string;
  limit?: number;
}) {
  const shapes = useMemo(() => {
    // Один размер на миниатюру, иначе градация нарисует один и тот же силуэт пять раз внахлёст.
    // Берём срединный — тот же выбор, что у контура детали.
    const picked: PieceDTO[] = [];
    for (const [key, bySize] of index.byKey) {
      if (!key.startsWith(`${scopeKey}|`)) continue;
      const sizes = [...bySize.keys()].sort(
        (a, b) => (index.split.orderOfSize.get(a) ?? 1e6) - (index.split.orderOfSize.get(b) ?? 1e6),
      );
      const list = bySize.get(sizes[Math.floor((sizes.length - 1) / 2)]) ?? [];
      const onLayer = list.filter((p) => (p.layer ?? '') === index.contourLayer);
      const drawn = (onLayer.length > 0 ? onLayer : list)[0];
      if (drawn) picked.push(drawn);
    }
    return picked.slice(0, limit);
  }, [index, scopeKey, limit]);

  if (shapes.length === 0) return null;

  // Детали ставятся В РЯД по их собственным габаритам, а не берутся с их местами в чертеже: в
  // файле они могут лежать сколь угодно далеко друг от друга (и лежат — конструктор раскладывает
  // их по листам как ему удобно), и общий bbox чертежа сжал бы силуэты в точки. Ряд — это уже не
  // «как в файле», но это и не заявка на раскладку: миниатюра отвечает только на «что это за
  // детали», и низы у них выровнены ровно затем, чтобы масштаб читался.
  //
  // Контур приходит нормализованным к собственному bbox (poly: origin в углу bbox детали), так
  // что сдвиг по X — это и есть всё размещение, а vy() кладёт деталь на нулевую линию снизу.
  const gap = Math.max(...shapes.map((s) => s.bboxW)) * 0.12;
  const height = Math.max(...shapes.map((s) => s.bboxH), 1);
  let x = 0;
  const placed = shapes.map((p) => {
    const at = x;
    x += p.bboxW + gap;
    return { p, at };
  });
  const total = Math.max(x - gap, 1);

  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`0 ${-height} ${total} ${height}`}
      preserveAspectRatio='xMidYMid meet'
      className={className}
      role='img'
      aria-label={`силуэты деталей: ${shapes.length}`}
    >
      {placed.map(({ p, at }, i) => (
        <polygon
          key={i}
          points={p.poly.map((pt) => `${pt.x + at},${vy(pt.y)}`).join(' ')}
          fill='none'
          stroke='#111111'
          strokeWidth={total / 260 || 0.01}
          strokeLinejoin='round'
        />
      ))}
    </svg>
  );
}
