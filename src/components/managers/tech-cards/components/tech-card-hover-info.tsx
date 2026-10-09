import { common_AdminColorwayRef, common_TechCard } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import Text from 'ui/components/text';
import { useTechCard } from './useTechCardQuery';

// Ховер плитки в гриде (как в Zedonk): основная ткань и свотчи живых колорвеев. Листинг этого не
// несёт, поэтому карточка дочитывается ЛЕНИВО — только у той плитки, на которой задержали курсор, и
// тем же ключом, что у страницы тех-карты: открыть её после ховера — уже из кеша.

const MAX_SWATCHES = 8;

/** Основная ткань: строка BOM с назначением MAIN, иначе первая строка секции FABRIC. */
function mainFabric(card?: common_TechCard): string {
  const bom = card?.techCard?.bomItems ?? [];
  const line =
    bom.find((b) => b.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN') ??
    bom.find((b) => b.section === 'TECH_CARD_BOM_SECTION_FABRIC');
  return (line?.name ?? '').trim();
}

// Тот же порядок, что у свотча колорвея на вкладке колорвеев: экранный hex пантона, затем главный
// цвет палитры (T45), затем словарное семейство.
function swatchHex(cw: common_AdminColorwayRef, dictHex?: string): string | undefined {
  const dev = (cw.devHex ?? '').trim();
  if (/^#?[0-9a-f]{6}$/i.test(dev)) return dev.startsWith('#') ? dev : `#${dev}`;
  return (cw.colours?.[0]?.hex ?? '').trim() || dictHex || undefined;
}

export function TechCardHoverInfo({
  id,
  enabled,
  visible,
}: {
  id: number;
  enabled: boolean;
  visible: boolean;
}) {
  const { data: card } = useTechCard(enabled ? id : undefined);
  const { dictionary } = useDictionary();

  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);

  if (!card || !visible) return null;
  const fabric = mainFabric(card);
  const colorways = (card.colorways ?? []).filter(
    (cw) => cw.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED',
  );
  if (!fabric && colorways.length === 0) return null;
  const extra = colorways.length - MAX_SWATCHES;

  return (
    <div className='pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 border-t border-borderColor bg-bgColor px-1.5 py-1 text-left'>
      {fabric && (
        <Text size='nano' variant='uppercase' className='truncate'>
          {fabric}
        </Text>
      )}
      {colorways.length > 0 && (
        <span className='flex items-center gap-1'>
          {colorways.slice(0, MAX_SWATCHES).map((cw) => {
            const hex = swatchHex(cw, hexByCode.get(cw.colorCode ?? ''));
            return (
              <span
                key={cw.colorwayId}
                className={`size-3 shrink-0 border ${hex ? 'border-textColor' : 'border-dashed border-borderColor'}`}
                style={hex ? { backgroundColor: hex } : undefined}
              />
            );
          })}
          {extra > 0 && (
            <Text size='nano' variant='label' component='span'>
              +{extra}
            </Text>
          )}
        </span>
      )}
    </div>
  );
}
