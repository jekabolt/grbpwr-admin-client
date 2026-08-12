// Тело просмотра DXF НАШИМ листом: выбор размера, контурного слоя и слоёв чертежа.
//
// Вынесено из dxf-sheet-viewer.tsx БЕЗ модалки и БЕЗ словаря: публичный вьюер выкроек
// (/p/:token) показывает те же градуированные листы швее без логина, и токены размеров там
// строятся из манифеста карты, а не из useDictionarySizeTokens (словарь — за авторизацией).
// Авторизованная модалка осталась тонкой обёрткой в dxf-sheet-viewer.tsx.
//
// WebGL-вьювер (dxf-quick-view-modal) рисует файл целиком и не знает ни про детали, ни про
// размеры: на градуированном чертеже это каша из пяти размеров сразу, в которой ничего не
// разобрать. Здесь та же геометрия, по которой считается раскладка и заводятся детали кроя, —
// значит увиденное и посчитанное не могут разойтись.
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import { defaultContourLayer, layerOptions } from './contour-layer';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { PieceSheet } from './piece-sheet';
import { splitPiecesBySize } from './split-pieces';
import { useNesting, type NestingFile } from './use-nesting';

export function DxfSheetView({
  files,
  dictTokens,
  touchTargets = false,
}: {
  files: NestingFile[] | null;
  // «Бывает ли такой токен размером» — модалке отвечает словарь (Map), публичной странице
  // Set из sizes[] манифеста. splitPiecesBySize большего и не спрашивает.
  dictTokens: { has(token: string): boolean };
  // Публичная страница смотрится с телефона: селекторы растут до тач-мишени ≥44px.
  // По умолчанию false — авторизованная модалка выглядит ровно как раньше.
  touchTargets?: boolean;
}) {
  const { parse } = useNesting(files);
  const allPieces = useMemo(() => (parse.phase === 'ready' ? parse.pieces : []), [parse]);
  const split = useMemo(() => splitPiecesBySize(allPieces, dictTokens), [allPieces, dictTokens]);

  const layerOpts = useMemo(() => layerOptions(allPieces, split.codeById), [allPieces, split]);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const contourLayer = layerOpts.some((o) => o.layer === activeLayer)
    ? (activeLayer as string)
    : defaultContourLayer(layerOpts);
  const onLayer = useMemo(
    () => allPieces.filter((p) => (p.layer ?? '') === contourLayer),
    [allPieces, contourLayer],
  );

  // ГРУППА «БЕЗ РАЗМЕРА» И UNI-ДЕТАЛИ — ЭТО РАЗНЫЕ ВЕЩИ, и переключатель обязан их различать.
  //
  // Помеченная деталь входит в комплект КАЖДОГО размера, поэтому при живых размерных группах она
  // не заводит отдельную опцию: карман виден на листе M вместе с деталями M (см. `shown`). Если бы
  // он остался отдельной кнопкой, оператор, выбрав M, смотрел бы на неполный комплект и не имел
  // способа это заметить. Остаток группы '' — это НЕПОМЕЧЕННЫЕ безразмерные детали, у которых
  // размер, возможно, просто не опознан: их опция остаётся, потому что показать их негде больше.
  const sizeOpts = useMemo(() => {
    const seen = new Map<string, number>();
    let sizeless = 0;
    let sizelessUni = 0;
    for (const p of onLayer) {
      const code = split.codeById.get(p.id);
      const s = code?.size ?? '';
      if (!s) {
        sizeless += 1;
        if (code?.uni) sizelessUni += 1;
        continue;
      }
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    const graded = seen.size > 0;
    // Счётчик размера ВКЛЮЧАЕТ помеченные детали — ровно те, что видны на его листе. Иначе
    // подсказка кнопки («N деталей») спорила бы со строкой под чертежом, считающей показанное.
    const opts = [...seen.entries()].map(([size, count]) => ({
      size,
      count: count + sizelessUni,
      uni: false,
    }));
    // Файл из одних uni: опция всё-таки нужна — иначе смотреть было бы не на что. Она и
    // подписывается тем, что есть на самом деле.
    const rest = graded ? sizeless - sizelessUni : sizeless;
    if (rest > 0) {
      const uni = !graded && sizelessUni === sizeless;
      opts.push({ size: '', count: rest, uni });
    }
    return opts.sort(
      (a, b) => (split.orderOfSize.get(a.size) ?? 1e6) - (split.orderOfSize.get(b.size) ?? 1e6),
    );
  }, [onLayer, split]);
  const [activeSize, setActiveSize] = useState<string | null>(null);
  // Крупнейшая группа по умолчанию: группа «без размера» это остаток, а не размер.
  const shownSize = sizeOpts.some((o) => o.size === activeSize)
    ? (activeSize as string)
    : (sizeOpts.reduce<{ size: string; count: number } | null>(
        (best, o) => (!best || o.count > best.count ? o : best),
        null,
      )?.size ?? '');
  const shown = useMemo(
    () =>
      onLayer.filter((p) => {
        const code = split.codeById.get(p.id);
        const s = code?.size ?? '';
        if (s === shownSize) return true;
        // Помеченная деталь идёт в комплект КАЖДОГО размера — значит и на лист каждого размера.
        // Без этого лист размера M показывал бы изделие без карманов, и ошибка была бы не видна
        // ни по одному признаку: контуры просто отсутствуют.
        return !!shownSize && !s && !!code?.uni;
      }),
    [onLayer, split, shownSize],
  );

  const grainLayer = useMemo(() => defaultGrainLayer(grainLayerOptions(allPieces)), [allPieces]);
  const innerNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of shown)
      for (const c of p.inner ?? []) {
        if (c.layer === grainLayer) continue;
        seen.set(c.layer, (seen.get(c.layer) ?? 0) + 1);
      }
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [shown, grainLayer]);
  const [hiddenInner, setHiddenInner] = useState<string[]>([]);
  const innerLayers = useMemo(
    () => new Set(innerNames.map(([l]) => l).filter((l) => !hiddenInner.includes(l))),
    [innerNames, hiddenInner],
  );

  const pillSize = touchTargets ? 'lg' : 'xs';
  const pillClass = touchTargets ? 'min-h-11' : undefined;

  return (
    <div className='space-y-2'>
      {parse.phase === 'loading' && (
        <Text size='micro' variant='label' component='p'>
          разбор DXF…
        </Text>
      )}
      {parse.phase === 'error' && <CalloutBox tone='error'>{parse.message}</CalloutBox>}
      {parse.phase === 'ready' && parse.warnings.length > 0 && (
        <CalloutBox tone='note'>
          {parse.warnings.map((w, i) => (
            <Text key={i} size='micro' component='p'>
              {w}
            </Text>
          ))}
        </CalloutBox>
      )}

      {parse.phase === 'ready' && (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            {sizeOpts.length > 1 && (
              <div className='flex flex-wrap items-center gap-1'>
                <Text size='nano' variant='label' component='span'>
                  размер:
                </Text>
                {sizeOpts.map((o) => (
                  <Button
                    key={o.size || '(none)'}
                    type='button'
                    variant={o.size === shownSize ? 'main' : 'secondary'}
                    size={pillSize}
                    className={pillClass}
                    title={`${o.count} деталей`}
                    onClick={() => setActiveSize(o.size)}
                  >
                    {o.size || (o.uni ? 'UNI · во всех размерах' : 'без размера')}
                  </Button>
                ))}
              </div>
            )}
            {layerOpts.length > 1 && (
              <div className='flex flex-wrap items-center gap-1'>
                <Text size='nano' variant='label' component='span'>
                  контур:
                </Text>
                {layerOpts.map((o) => (
                  <Button
                    key={o.layer || '(none)'}
                    type='button'
                    variant={o.layer === contourLayer ? 'main' : 'secondary'}
                    size={pillSize}
                    className={pillClass}
                    title={
                      o.checked === 0
                        ? `слой ${o.layer}: ${o.pieces} контуров`
                        : `слой ${o.layer}: градуируется у ${o.graded} из ${o.checked} деталей`
                    }
                    onClick={() => setActiveLayer(o.layer)}
                  >
                    слой {o.layer || '—'}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {innerNames.length > 0 && (
            <div className='flex flex-wrap items-center gap-2'>
              <Text size='nano' variant='label' component='span'>
                слои чертежа:
              </Text>
              {innerNames.map(([layer, n]) => (
                <label
                  key={layer}
                  className={
                    touchTargets
                      ? 'flex min-h-11 cursor-pointer items-center gap-1.5'
                      : 'flex cursor-pointer items-center gap-1'
                  }
                >
                  <input
                    type='checkbox'
                    className={touchTargets ? 'size-5' : undefined}
                    checked={!hiddenInner.includes(layer)}
                    onChange={(e) =>
                      setHiddenInner((prev) =>
                        e.target.checked ? prev.filter((l) => l !== layer) : [...prev, layer],
                      )
                    }
                  />
                  <Text size='nano' variant='label' component='span'>
                    {layer} ({n})
                  </Text>
                </label>
              ))}
            </div>
          )}

          <PieceSheet
            // Пересобираем при смене размера или слоя: зум и панорама живут внутри листа, и
            // без этого остался бы обзор от прежнего чертежа.
            key={`${contourLayer}|${shownSize}`}
            pieces={shown}
            grainLayer={grainLayer}
            innerLayers={innerLayers}
            keyOf={() => ''}
            markOf={() => 'mapped'}
            labelOf={(p) => split.codeById.get(p.id)?.identity ?? p.blockName ?? ''}
            selectedKey={null}
            onPick={() => {}}
          />

          <Text size='nano' variant='label' component='p'>
            деталей в размере: {shown.length}
            {sizeOpts.length > 1 ? ` · размеров в файле: ${sizeOpts.filter((o) => o.size).length}` : ''}
          </Text>
        </>
      )}
    </div>
  );
}
