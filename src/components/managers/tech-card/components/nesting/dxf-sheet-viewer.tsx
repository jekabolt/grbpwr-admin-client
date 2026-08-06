// Просмотр DXF НАШИМ листом: с выбором размера, контурного слоя и слоёв чертежа.
//
// WebGL-вьювер (dxf-quick-view-modal) рисует файл целиком и не знает ни про детали, ни про
// размеры: на градуированном чертеже это каша из пяти размеров сразу, в которой ничего не
// разобрать. Здесь та же геометрия, по которой считается раскладка и заводятся детали кроя, —
// значит увиденное и посчитанное не могут разойтись.
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { defaultContourLayer, layerOptions } from './contour-layer';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { PieceSheet } from './piece-sheet';
import { splitPiecesBySize, useDictionarySizeTokens } from './use-block-sizes';
import { useNesting, type NestingFile } from './use-nesting';

export function DxfSheetViewer({
  files,
  title,
  onClose,
}: {
  files: NestingFile[] | null; // null = закрыт
  title?: string;
  onClose: () => void;
}) {
  const { parse } = useNesting(files);
  const dictTokens = useDictionarySizeTokens();
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

  const sizeOpts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of onLayer) {
      const s = split.codeById.get(p.id)?.size ?? '';
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    return [...seen.entries()]
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => (split.orderOfSize.get(a.size) ?? 1e6) - (split.orderOfSize.get(b.size) ?? 1e6));
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
    () => onLayer.filter((p) => (split.codeById.get(p.id)?.size ?? '') === shownSize),
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

  return (
    <ConfirmationModal
      open={files != null}
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={title || 'выкройка (DXF)'}
      width='lg'
      hideActions
    >
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
                      size='xs'
                      title={`${o.count} деталей`}
                      onClick={() => setActiveSize(o.size)}
                    >
                      {o.size || 'без размера'}
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
                      size='xs'
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
                  <label key={layer} className='flex cursor-pointer items-center gap-1'>
                    <input
                      type='checkbox'
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
    </ConfirmationModal>
  );
}
