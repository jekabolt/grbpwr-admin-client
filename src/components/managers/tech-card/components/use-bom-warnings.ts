import { common_AdminColorwayRef, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { ROUTES } from 'constants/routes';
import { useFormContext, useFormState, useWatch, type FieldErrors } from 'react-hook-form';
import type { HeaderWarning, HeaderWarningAction } from 'ui';
import { flattenFieldErrors } from 'utils/field-errors';
import { slotNormRows } from './bom-norm';
import { catalogPrice, resolveBomPrice } from './bom-price';
import { UNSET_PURPOSE, isRollGoodsSection } from './bom-purpose';
import { looksLikeArticleName, normalizeRole } from './bom-roles';
import { markersForLine } from './nesting/marker-io';
import { TechCardFormData, wireInt } from './schema';

// ВСЕ ПРОБЛЕМЫ BOM — В ШАПКЕ БЛОКА (BOM-LITE B1, урок L6 с PATTERNS). Плитки больше не несут плашек:
// у плитки остаётся только тон (красная рамка / метка), а СЛОВА и ДВЕРЬ к исправлению живут здесь,
// одним списком на вкладку. Каждый пункт открывает свою строку в панели справа и, где поле
// известно, фокусирует его.

export type BomLineTone = 'error' | 'warning';

type WatchedLine = {
  id?: number | string;
  lineKey?: string;
  name?: string;
  section?: string;
  purpose?: string;
  materialId?: number;
  unitPrice?: string;
  currency?: string;
  unit?: string;
  fabricDirection?: string;
};

const RELEASED_STATE = 'TECH_CARD_APPROVAL_STATE_RELEASED';

export function useBomWarnings({
  colorways,
  markers,
  canEdit,
  onOpenLine,
  onOpenColorways,
}: {
  colorways?: common_AdminColorwayRef[];
  markers?: common_TechCardMarkerSummary[];
  /** Карточка не выпущена и пользователь вправе её править: только тогда двери, которые ПИШУТ. */
  canEdit: boolean;
  /** Выбрать строку в панели; `field` — фокус на это поле строки. */
  onOpenLine: (index: number, field?: string) => void;
  onOpenColorways: () => void;
}): { items: HeaderWarning[]; tones: Map<number, BomLineTone> } {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { canReadCosting, canWriteCosting } = usePermissions();
  const lines = (useWatch({ control, name: 'bomItems' }) ?? []) as WatchedLine[];
  const frozen = useWatch({ control, name: 'approvalState' }) === RELEASED_STATE;
  const { errors } = useFormState({ control, name: 'bomItems' });
  // Тот же кеш, что у плиток и панели (архивные включены: ищем УЖЕ привязанный артикул).
  const { data } = useMaterials('', true);
  const materials = data?.materials ?? [];

  const items: HeaderWarning[] = [];
  const tones = new Map<number, BomLineTone>();
  const mark = (i: number, tone: BomLineTone) => {
    if (tones.get(i) !== 'error') tones.set(i, tone);
  };

  const roleCounts = new Map<string, number>();
  lines.forEach((b) => {
    const n = normalizeRole(b.name);
    if (n) roleCounts.set(n, (roleCounts.get(n) ?? 0) + 1);
  });

  const open = (i: number, field?: string) => ({
    label: 'open the line',
    onClick: () => onOpenLine(i, field),
  });

  const labelOf = (i: number, materialName?: string) =>
    lines[i]?.name?.trim() || materialName?.trim() || `line ${i + 1}`;

  // Ошибки схемы по строкам: красные, первыми, с дверью прямо в поле.
  const flat = flattenFieldErrors({ bomItems: errors.bomItems } as FieldErrors);
  flat.forEach((e) => {
    const m = /^bomItems\.(\d+)\.(.+)$/.exec(e.path);
    if (!m) {
      items.push({ text: `bom: ${e.message || 'invalid'}`, error: true });
      return;
    }
    const i = Number(m[1]);
    const materialId = wireInt(lines[i]?.materialId);
    const material = materialId ? materials.find((x) => wireInt(x.id) === materialId) : undefined;
    mark(i, 'error');
    items.push({
      text: `${labelOf(i, material?.name)}: ${e.message || `${m[2]} invalid`}`,
      error: true,
      action: open(i, m[2]),
    });
  });

  lines.forEach((line, i) => {
    const materialId = wireInt(line.materialId);
    const linked = materialId > 0;
    const material = linked ? materials.find((x) => wireInt(x.id) === materialId) : undefined;
    const role = labelOf(i, material?.name);
    const roll = isRollGoodsSection(line.section);
    const warn = (text: string, action?: HeaderWarningAction) => {
      mark(i, 'warning');
      items.push({ text: `${role}: ${text}`, action });
    };

    if (!linked) {
      warn('link a material', open(i, 'materialId'));
    }
    if (!line.name?.trim() || (linked && looksLikeArticleName(line.name, material?.name))) {
      warn('role not set', open(i, 'name'));
    }
    if ((roleCounts.get(normalizeRole(line.name)) ?? 0) > 1) {
      warn('duplicate role', open(i, 'name'));
    }
    if (roll && (!line.purpose || line.purpose === UNSET_PURPOSE)) {
      warn('no purpose', open(i, 'purpose'));
    }
    if (
      roll &&
      (!line.fabricDirection || line.fabricDirection === 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN')
    ) {
      warn('fabric direction not set', open(i, 'fabricDirection'));
    }

    // Деньги: только тому, кто их видит (latest_price и цена строки вырезаются без costing:read,
    // и без права любая строка выглядела бы «без цены»).
    if (linked && canReadCosting) {
      const price = resolveBomPrice(line, material);
      if (price.source === 'none') {
        warn('no price', {
          label: 'open article',
          href: `${ROUTES.materials}?tab=catalog&material=${materialId}`,
        });
      } else if (price.source === 'catalog' || price.drift) {
        const catalog = catalogPrice(material);
        const lineUnit = line.unit?.trim() ?? '';
        // Единица — часть цены: «95 / kg» в строку «за метр» не переносится молча.
        const unitClash = !!lineUnit && !!catalog.unit && lineUnit !== catalog.unit;
        const take =
          canWriteCosting && canEdit && !frozen
            ? unitClash
              ? { label: `units differ: ${lineUnit} vs ${catalog.unit}`, disabled: true }
              : {
                  label: 'take catalog price',
                  onClick: () => {
                    setValue(`bomItems.${i}.unitPrice`, catalog.value, { shouldDirty: true });
                    setValue(`bomItems.${i}.currency`, catalog.currency, { shouldDirty: true });
                    if (!lineUnit && catalog.unit) {
                      setValue(`bomItems.${i}.unit`, catalog.unit, { shouldDirty: true });
                    }
                  },
                }
            : undefined;
        warn(
          price.source === 'catalog' ? 'catalog price not taken' : 'catalog price changed',
          take,
        );
      }
    }

    // Норма слота с раскладки: раскладка есть, а в рецепт норму с неё не сняли. Надбавки раскроя в
    // BOM больше нет (владелец: она задаётся в раскладке), поэтому «нет надбавки» здесь не звучит.
    if (roll) {
      const normRows = slotNormRows(colorways, wireInt(line.id), line.lineKey ?? '');
      const countedOnly = normRows.length > 0 && !normRows.some((r) => r.measured);
      const measured = normRows.some((r) => r.marker && r.measured);
      if (!countedOnly && !measured) {
        if (markersForLine(markers, line.lineKey ?? '').length > 0) {
          warn(
            'norm not captured from the marker',
            !frozen ? { label: 'to the colourway recipe', onClick: onOpenColorways } : undefined,
          );
        }
      }
    }
  });

  return { items, tones };
}
