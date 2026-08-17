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
import type { PieceDTO } from 'lib/nesting/types';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import { defaultContourLayer, layerOptions } from './contour-layer';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { PieceSheet } from './piece-sheet';
import { dedupeUniPieces } from './piece-selection';
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

  // ЧТО ЛЕЖИТ НА ЛИСТЕ КАЖДОГО РАЗМЕРА — ОДИН РАСЧЁТ НА КНОПКИ, ЧЕРТЁЖ И СЧЁТЧИК.
  //
  // Три числа обязаны сходиться: подсказка кнопки, нарисованное и строка «деталей в размере». Пока
  // каждое считалось своим выражением, они расходились по двум причинам сразу, и обе видны только
  // если знать, что искать:
  //
  //   • ГРУППА '' И UNI-ДЕТАЛИ — РАЗНЫЕ ВЕЩИ. Помеченная деталь входит в комплект КАЖДОГО размера,
  //     поэтому при живых размерных группах она не заводит отдельной кнопки, а едет на лист каждого
  //     размера. Остаток группы '' — это НЕПОМЕЧЕННЫЕ безразмерные детали, у которых размер,
  //     возможно, просто не опознан: их кнопка остаётся, показать их больше негде. Значит и клик по
  //     ней обязан показывать РОВНО их, а не все безразмерные подряд.
  //   • ДЕДУП UNI-КОПИЙ — ТОТ ЖЕ, ЧТО У НАСТИЛА (dedupeUniPieces). Склеенный CLO приносит один
  //     карман под двумя именами; раскладка и очередь раскроя кроят его ОДИН раз, а просмотр рисовал
  //     оба и считал два — то есть лист спорил с тем, что уедет в цех. Конфликт (разная площадь
  //     копий, градуированная копия рядом с uni) хелпер решает отказом и не исключает ничего: путь
  //     настила в этом случае встанет с объяснением, а просмотру честнее показать обе копии, чем
  //     молча выбрать одну.
  const view = useMemo(() => {
    const excluded = dedupeUniPieces(allPieces, split.codeById, contourLayer).excludedIds;
    const bySize = new Map<string, PieceDTO[]>();
    const uni: PieceDTO[] = [];
    const unclassified: PieceDTO[] = [];
    for (const p of onLayer) {
      if (excluded.has(p.id)) continue;
      const code = split.codeById.get(p.id);
      const s = code?.size ?? '';
      if (s) {
        bySize.set(s, [...(bySize.get(s) ?? []), p]);
        continue;
      }
      (code?.uni ? uni : unclassified).push(p);
    }
    const graded = bySize.size > 0;
    const opts = [...bySize.entries()].map(([size, list]) => ({
      size,
      // Счётчик размера ВКЛЮЧАЕТ помеченные детали — ровно те, что видны на его листе.
      count: list.length + uni.length,
      uni: false,
    }));
    // Файл из одних uni: кнопка всё-таки нужна — иначе смотреть было бы не на что, — и подписана
    // она тем, что есть на самом деле.
    const rest = graded ? unclassified : [...uni, ...unclassified];
    if (rest.length > 0) {
      opts.push({ size: '', count: rest.length, uni: !graded && unclassified.length === 0 });
    }
    opts.sort(
      (a, b) => (split.orderOfSize.get(a.size) ?? 1e6) - (split.orderOfSize.get(b.size) ?? 1e6),
    );
    const piecesOfSize = (size: string): PieceDTO[] =>
      size ? [...(bySize.get(size) ?? []), ...uni] : rest;
    return { sizeOpts: opts, piecesOfSize };
  }, [allPieces, onLayer, split, contourLayer]);
  const sizeOpts = view.sizeOpts;
  const [activeSize, setActiveSize] = useState<string | null>(null);
  // Крупнейшая группа по умолчанию: группа «без размера» это остаток, а не размер.
  const shownSize = sizeOpts.some((o) => o.size === activeSize)
    ? (activeSize as string)
    : (sizeOpts.reduce<{ size: string; count: number } | null>(
        (best, o) => (!best || o.count > best.count ? o : best),
        null,
      )?.size ?? '');
  const shown = useMemo(() => view.piecesOfSize(shownSize), [view, shownSize]);

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
          parsing DXF…
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
                  size:
                </Text>
                {sizeOpts.map((o) => (
                  <Button
                    key={o.size || '(none)'}
                    type='button'
                    variant={o.size === shownSize ? 'main' : 'secondary'}
                    size={pillSize}
                    className={pillClass}
                    title={`${o.count} pieces`}
                    onClick={() => setActiveSize(o.size)}
                  >
                    {o.size || (o.uni ? 'UNI · in all sizes' : 'no size')}
                  </Button>
                ))}
              </div>
            )}
            {layerOpts.length > 1 && (
              <div className='flex flex-wrap items-center gap-1'>
                <Text size='nano' variant='label' component='span'>
                  contour:
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
                        ? `layer ${o.layer}: ${o.pieces} contours`
                        : `layer ${o.layer}: graded on ${o.graded} of ${o.checked} pieces`
                    }
                    onClick={() => setActiveLayer(o.layer)}
                  >
                    layer {o.layer || '—'}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {innerNames.length > 0 && (
            <div className='flex flex-wrap items-center gap-2'>
              <Text size='nano' variant='label' component='span'>
                drawing layers:
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
            pieces in this size: {shown.length}
            {sizeOpts.length > 1 ? ` · sizes in the file: ${sizeOpts.filter((o) => o.size).length}` : ''}
          </Text>
        </>
      )}
    </div>
  );
}
