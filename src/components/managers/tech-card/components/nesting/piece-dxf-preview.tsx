// Форма детали кроя — из того самого DXF, к которому она привязана (0262).
//
// Бейдж «блок DXF привязан» в таблице деталей говорит, что деталь нарисована в файле, но не
// показывает ЧТО нарисовано. Имя блока формы не несёт вовсе («BP_1», «PERED_S» — это то, что
// придумал экспортёр), а именно форма отвечает на вопрос «та ли это деталь»: сопоставление блока
// с деталью кроя делает человек, и ошибка в нём означает, что полочку выкроят из подкладки.
// Поэтому наведение на строку рисует здесь контур, который реально лежит в файле, — и заодно его
// габарит в сантиметрах, которого в карточке нет больше нигде.
//
// Геометрия берётся ТЕМ ЖЕ разбором, что и раскладка (общий воркер), так что показанное и
// посчитанное разойтись не могут — по той же причине, по которой лист сопоставления рисует свои
// контуры, а не файл через WebGL-вьювер.
//
// Разбор стоит скачивания десятков мегабайт с CDN, поэтому он сидит ЗА КНОПКОЙ: открытие вкладки
// не должно тянуть файлы (то же правило, что у «⌕ размеры в файлах» на панели выкроек). Панель
// монтируется только после нажатия и размонтируется по «×» — разобранная геометрия живёт в её
// состоянии и уходит вместе с ней.
import { fetchMediaBlob } from 'lib/features/media-blob';
import { NEST_DEFAULTS, type PieceDTO } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { normBlock, splitBlockSize } from './block-code';
import { defaultContourLayer, layerOptions } from './contour-layer';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { splitPiecesBySize, useDictionarySizeTokens } from './use-block-sizes';

/** Лист выкройки вместе с РАЗРЕШЁННЫМ скоупом ткани, в котором он лежит. */
export type ScopedDxfFile = { scopeKey: string; name: string; url: string };

/** Связь «деталь кроя → блок», как её видит таблица: имя блока и скоуп, в котором оно значит. */
export type PieceBlockRef = { scopeKey: string; block: string };

type ParseState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      pieces: PieceDTO[];
      // Индекс файла в РАЗОБРАННОЙ пачке → скоуп. Не в исходной: недокачанные файлы из пачки
      // выпадают, и индексы после них сдвигаются — сопоставлять их с исходным списком напрямую
      // значит приписать деталям чужую ткань, то есть ровно ту ошибку, от которой скоуп и спасает.
      scopeByFile: Map<number, string>;
      warnings: string[];
    };

// Чертёжные координаты → экранные: DXF считает Y вверх, SVG — вниз. Инвертируем в числах, как и
// лист сопоставления, а не групповым transform — под ним зеркалились бы подписи.
const vy = (y: number) => -y;

const fmt = (cm: number) => (cm >= 100 ? cm.toFixed(0) : cm.toFixed(1));

/**
 * Одна деталь в СВОИХ координатах: контур, внутренняя геометрия (линия шва, надсечки, свёрла) и
 * долевая. `poly` и `inner` уже нормализованы к габариту детали, `grain` — нет: он приходит в
 * абсолютных координатах чертежа, поэтому сдвигается на origin детали.
 */
function PieceShape({ piece, grainLayer }: { piece: PieceDTO; grainLayer: string }) {
  const pad = Math.max(piece.bboxW, piece.bboxH, 1) * 0.06;
  const box = {
    x: -pad,
    y: -piece.bboxH - pad,
    w: piece.bboxW + 2 * pad,
    h: piece.bboxH + 2 * pad,
  };
  const points = piece.poly.map((pt) => `${pt.x},${vy(pt.y)}`).join(' ');
  const inner = (piece.inner ?? []).filter((c) => c.layer !== grainLayer);
  // Долевую можно положить на место только зная, где деталь лежала в чертеже. У детали без
  // origin её просто не рисуем — нарисованная от нуля, она ушла бы мимо контура.
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
      className='block h-full w-full'
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

export function PieceDxfPreview({
  files,
  blocksByPiece,
  activePieceKey,
  activePieceName,
  onClose,
}: {
  files: ScopedDxfFile[];
  /** Ключ детали (lineKey, в нижнем регистре) → блоки, к которым она привязана. */
  blocksByPiece: ReadonlyMap<string, PieceBlockRef[]>;
  /** lineKey детали под курсором; null — курсор не на строке. */
  activePieceKey: string | null;
  activePieceName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<ParseState>({ phase: 'loading' });
  const [nonce, setNonce] = useState(0);
  const dictTokens = useDictionarySizeTokens();

  // Пачка файлов сравнивается по СОДЕРЖИМОМУ (скоуп + url), а не по идентичности массива:
  // родитель пересобирает его на каждый рендер формы, а разбор — это скачивание с CDN, и
  // повторять его из-за переименованной строки выкройки нельзя.
  const filesSig = files.map((f) => `${f.scopeKey}|${f.url}`).join('\n');

  useEffect(() => {
    let dead = false;
    const client = new NestingWorkerClient();
    setState({ phase: 'loading' });
    (async () => {
      try {
        // allSettled: одна недоступная ссылка не должна отменять файлы, которые скачались.
        const settled = await Promise.allSettled(
          files.map(async (f) => new File([await fetchMediaBlob(f.url)], f.name)),
        );
        if (dead) return;
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
        if (dead) return;
        setState({
          phase: 'ready',
          pieces: out.pieces,
          scopeByFile,
          warnings: [...warnings, ...out.warnings],
        });
      } catch (e) {
        if (!dead) {
          setState({
            phase: 'error',
            message: e instanceof Error ? e.message : 'не удалось разобрать файлы',
          });
        }
      } finally {
        // Контуры уже уехали на главный поток вместе с ответом — держать воркер (а в нём всю
        // разобранную геометрию) до перезагрузки страницы незачем.
        client.terminate();
      }
    })();
    return () => {
      dead = true;
      client.terminate();
    };
    // `files` участвует через filesSig: массив пересобирается родителем каждый рендер, а
    // содержимое меняется только при смене выкроек.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesSig, nonce]);

  // Контуры, разложенные по (скоуп, деталь чертежа, размер).
  //
  // Слой контура ПРЕДПОЧИТАЕТСЯ тот же, что в диалоге сопоставления: настоящая деталь
  // ГРАДУИРУЕТСЯ, а линия шва и справочный контур базового размера — нет, и показать линию шва
  // вместо линии кроя значит показать габарит без припуска. Но фильтровать по нему НАСМЕРТЬ
  // нельзя: слой выбирается один на всю пачку, а файл подклада законно чертит на другом — и
  // деталь, которая в чертеже есть, объявлялась бы ненайденной. Поэтому кладём всё, а выбираем
  // при показе.
  const index = useMemo(() => {
    if (state.phase !== 'ready') return null;
    const split = splitPiecesBySize(state.pieces, dictTokens);
    const contourLayer = defaultContourLayer(layerOptions(state.pieces, split.codeById));
    const grainLayer = defaultGrainLayer(grainLayerOptions(state.pieces));
    const byKey = new Map<string, Map<string, PieceDTO[]>>();
    for (const p of state.pieces) {
      const code = split.codeById.get(p.id);
      const identity = normBlock(code?.identity ?? p.blockName ?? '');
      if (!identity) continue; // безымянный контур ни к какой детали кроя не привязан
      const scope = state.scopeByFile.get(p.fileIndex ?? -1) ?? '';
      const key = `${scope}|${identity.toLowerCase()}`;
      const bySize = byKey.get(key) ?? new Map<string, PieceDTO[]>();
      const size = code?.size ?? '';
      bySize.set(size, [...(bySize.get(size) ?? []), p]);
      byKey.set(key, bySize);
    }
    return { split, contourLayer, grainLayer, byKey };
  }, [state, dictTokens]);

  const refs = activePieceKey ? blocksByPiece.get(activePieceKey.trim().toLowerCase()) ?? [] : [];

  const found = useMemo(() => {
    if (!index || refs.length === 0) return null;
    for (const r of refs) {
      // Сохранённый алиас может нести размер прямо в имени («BP_1_XS») — сворачиваем к
      // идентичности тем же правилом, что и диалог сопоставления, иначе ключи разойдутся.
      const identity = normBlock(
        splitBlockSize(normBlock(r.block), index.split.sizeTokenSet).identity,
      );
      const bySize = index.byKey.get(`${r.scopeKey}|${identity.toLowerCase()}`);
      if (!bySize || bySize.size === 0) continue;
      // Один чертёж несёт всю градацию. Показываем СРЕДИННЫЙ размер: силуэт у всех один, а
      // базовый размер — то, как деталь представляют себе в лекальном цеху.
      const sizes = [...bySize.keys()].sort(
        (a, b) => (index.split.orderOfSize.get(a) ?? 1e6) - (index.split.orderOfSize.get(b) ?? 1e6),
      );
      const size = sizes[Math.floor((sizes.length - 1) / 2)];
      const list = bySize.get(size)!;
      // Линия кроя, если она у этой детали есть; иначе то, что в файле нарисовано вообще —
      // показать не тот слой честнее, чем сказать «детали нет».
      const onLayer = list.filter((p) => (p.layer ?? '') === index.contourLayer);
      const drawn = onLayer.length > 0 ? onLayer : list;
      return {
        piece: drawn[0],
        block: identity,
        size,
        // Экземпляры считаются ПО ОДНОМУ слою: блок несёт контур и линией кроя, и линией шва, и
        // сложенные вместе они прочитались бы как «деталь в чертеже дважды».
        instances: drawn.length,
        layer: drawn[0].layer ?? '',
        sizes,
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, refs.map((r) => `${r.scopeKey}|${r.block}`).join(','), activePieceKey]);

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-1'>
        <Text size='nano' variant='label' component='span' className='min-w-0 flex-1 uppercase'>
          деталь в чертеже
        </Text>
        <Button
          type='button'
          variant='secondary'
          size='xs'
          aria-label='закрыть предпросмотр чертежа'
          title='выгрузить разобранную геометрию'
          onClick={onClose}
        >
          ✕
        </Button>
      </div>

      <div className='flex h-40 w-full items-center justify-center border border-borderColor bg-bgColor p-1'>
        {state.phase === 'loading' && (
          <Text size='nano' variant='label' component='span' className='px-1 text-center'>
            разбор DXF…
          </Text>
        )}
        {state.phase === 'error' && (
          <Text size='nano' component='span' className='px-1 text-center text-error'>
            {state.message}
          </Text>
        )}
        {state.phase === 'ready' &&
          (found ? (
            <PieceShape piece={found.piece} grainLayer={index?.grainLayer ?? ''} />
          ) : (
            <Text size='nano' variant='label' component='span' className='px-1 text-center'>
              {!activePieceKey
                ? 'наведите на строку детали'
                : refs.length === 0
                  ? 'у этой детали нет привязанного блока DXF'
                  : `блока «${refs[0].block}» в разобранных файлах нет — файл перезалили без него?`}
            </Text>
          ))}
      </div>

      {state.phase === 'ready' && found && (
        <>
          <Text size='nano' component='span' className='break-words uppercase'>
            {activePieceName || found.block}
          </Text>
          <Text size='nano' variant='label' component='span' className='break-words'>
            {found.block}
            {found.size
              ? ` · размер ${found.size}${found.sizes.length > 1 ? ` из ${found.sizes.length}` : ''}`
              : ''}
          </Text>
          {/* Единственное место в карточке, где виден РЕАЛЬНЫЙ габарит детали: он посчитан по
              контуру из файла, а не введён руками. */}
          <Text size='nano' variant='label' component='span'>
            {fmt(found.piece.bboxW)}×{fmt(found.piece.bboxH)} см
            {found.instances > 1 ? ` · ×${found.instances} в чертеже` : ''}
          </Text>
        </>
      )}

      {state.phase === 'ready' && (
        <Text size='nano' variant='label' component='span'>
          слой {(found ? found.layer : index?.contourLayer) || '—'}
          {index?.grainLayer ? `, долевая красным (слой ${index.grainLayer})` : ''}
        </Text>
      )}

      {/* Недокачанный лист — это молча пропавшие детали: их блоки просто «не найдены», что
          читается как отсутствие привязки. Поэтому о нём говорится вслух. */}
      {state.phase === 'ready' &&
        state.warnings.map((w, i) => (
          <Text key={i} size='nano' component='span' className='break-words text-error'>
            {w}
          </Text>
        ))}

      {state.phase === 'error' && (
        <Button type='button' variant='secondary' size='xs' onClick={() => setNonce((n) => n + 1)}>
          ещё раз
        </Button>
      )}
    </div>
  );
}
