// ПАЧКА DXF КАРТОЧКИ — одно вычисление на все панели вкладки.
//
// Ключ кэша разбора (dxf-geometry.tsx) считается ПО СОДЕРЖИМОМУ пачки: `${scopeKey}|${url}` по
// каждому листу, в порядке списка. Значит «панель выкроек и панель деталей кроя делят один разбор»
// — это не намерение, а буквальное равенство двух массивов, и держалось оно на том, что две панели
// собирали список отдельно, но одинаково. Разошлись бы они хоть порядком, хоть фильтром — и одни и
// те же файлы качались бы дважды, молча: каждая панель видела бы свой кэш заполненным.
//
// Раньше они и были разными: панель деталей кроя брала только те ткани, у которых есть связи
// блок→деталь («не качать подкладку ради деталей верха»). Пока разбор включался кнопкой на каждой
// панели по отдельности, это была экономия. Теперь обе панели живут на одной вкладке и стартуют
// сами, поэтому пачка одна на карточку, и собирается она ЗДЕСЬ.
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { isDxfUrl } from 'utils/pattern';
import { fabricScopes, isRollGoodsSection, scopeKeyOfBinding } from '../bom-purpose';
import type { TechCardFormData } from '../schema';
import type { ScopedDxfFile } from './dxf-geometry';

type BomRow = { lineKey?: string; section?: string; purpose?: string; name?: string };
type PatternRow = {
  url?: string;
  name?: string;
  filename?: string;
  bomLineKey?: string;
  fabricPurpose?: string;
};

/**
 * Все DXF карточки со своими РАЗРЕШЁННЫМИ скоупами ткани, в порядке строк формы.
 *
 * Скоуп разрешается через сегодняшний BOM (`scopeKeyOfBinding`), а не берётся сырым полем: лист,
 * привязанный к строке, которую потом разложили в назначение, принадлежит теперь назначению. Лист,
 * чья строка BOM удалена, получает пустой скоуп и ОСТАЁТСЯ в пачке — он всё равно скачивается и
 * разбирается (панель выкроек показывает его в «без материала»), просто ни одна деталь кроя не
 * найдёт в нём себя, потому что искать её не в чем.
 */
export function useCardDxfPack(): ScopedDxfFile[] {
  const { control } = useFormContext<TechCardFormData>();
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomRow[];
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as PatternRow[];

  const scopes = useMemo(
    () =>
      fabricScopes(
        bomItems
          .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
          .map((b) => ({
            lineKey: b.lineKey!,
            purpose: b.purpose,
            name: b.name,
            section: b.section,
          })),
      ),
    [bomItems],
  );

  return useMemo(
    () =>
      patterns
        .filter((p) => !!p.url && isDxfUrl(p.url))
        .map((p) => ({
          scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, scopes),
          name: p.name || p.filename || 'выкройка.dxf',
          url: p.url!,
        })),
    [patterns, scopes],
  );
}
