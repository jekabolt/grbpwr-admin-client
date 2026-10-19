import type { common_Material, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import type { HeaderWarning } from 'ui';
import { markerNormStaleness } from './nesting/marker-io';
import {
  hasValue,
  measured,
  resolveSlotArticle,
  slotDraft,
  type AutoPlan,
  type BomLine,
  type SlotRows,
} from './use-colourway-auto';

// ═══ ПРЕДУПРЕЖДЕНИЯ КОЛОРВЕЯ — В ШАПКУ ВКЛАДКИ, КАЖДОЕ С ДВЕРЬЮ (COLOURWAYS-LITE D6) ═══════════
//
// Пилюль в теле матрицы нет: ячейка красная, шапка называет проблему и ведёт к починке. Текст
// начинается с имени колорвея — HeaderWarnings схлопывает одинаковые строки, а у двух колорвеев
// одна и та же беда на одном слоте — это две беды.

const LAB_DIP_SUBMITTED = 'TECH_CARD_LAB_DIP_STATUS_SUBMITTED';

function tsMillis(ts?: string): number | null {
  if (!ts || ts.startsWith('0001-01-01')) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

export const slotLabel = (s: BomLine) => s.name?.trim() || s.lineKey || 'slot';

export type ColumnWarningsArgs = {
  name: string;
  cardSlots: BomLine[];
  rowsBySlot: Map<string, SlotRows>;
  materials: common_Material[];
  markers?: common_TechCardMarkerSummary[];
  plan: AutoPlan;
  labDipStatus: string;
  strayCount: number;
  orphanCount: number;
  openPicker: (key: string) => void;
  openNorm: (key: string) => void;
  openLabDip: () => void;
  cleanUp: (what: 'stray' | 'orphan') => void;
  /** Снять легаси-нормы деталей (строки с pieceLineKey). Без него предупреждение — без двери. */
  clearPieceNorms?: () => void;
  canEdit: boolean;
};

export function columnWarnings({
  name,
  cardSlots,
  rowsBySlot,
  materials,
  markers,
  plan,
  labDipStatus,
  strayCount,
  orphanCount,
  openPicker,
  openNorm,
  openLabDip,
  cleanUp,
  clearPieceNorms,
  canEdit,
}: ColumnWarningsArgs): HeaderWarning[] {
  const out: HeaderWarning[] = [];
  const door = (label: string, onClick: () => void) => ({
    label,
    onClick,
    disabled: !canEdit,
  });
  for (const slot of cardSlots) {
    const key = slot.lineKey ?? '';
    if (!key) continue;
    const draft = slotDraft(rowsBySlot.get(key), key);
    const { materialId, articleWidth } = resolveSlotArticle(draft, slot, materials);
    const where = `${name} · ${slotLabel(slot)}`;
    if (materialId === 0) {
      out.push({
        text: `${where}: pick a material`,
        error: true,
        action: door('pick a material', () => openPicker(key)),
      });
      continue;
    }
    if (measured(slot.section) && !hasValue(draft)) {
      out.push({
        text: `${where}: no norm`,
        error: true,
        action: door('set the norm', () => openNorm(key)),
      });
    }
    if (draft.consumptionSource === 'marker' && (draft.normMarkerId ?? 0) > 0) {
      const marker = markers?.find((m) => (m.id ?? 0) === draft.normMarkerId);
      const applied = tsMillis(draft.normAppliedAt);
      const moved = tsMillis(marker?.updatedAt);
      const drifted = applied != null && moved != null && moved > applied;
      if (drifted || markerNormStaleness(marker, articleWidth).stale) {
        out.push({
          text: `${where}: marker changed, re-apply`,
          action: door('re-apply the norm', () => openNorm(key)),
        });
      }
    }
  }
  for (const { key, count } of plan.ambiguous) {
    const slot = cardSlots.find((s) => s.lineKey === key);
    if (!slot) continue;
    out.push({
      text: `${name} · ${slotLabel(slot)}: pick one of ${count}`,
      action: door('pick a material', () => openPicker(key)),
    });
  }
  if (labDipStatus === LAB_DIP_SUBMITTED) {
    out.push({
      text: `${name}: lab dip waiting`,
      action: { label: 'open the lab dip', onClick: openLabDip },
    });
  }
  if (strayCount > 0) {
    out.push({
      text: `${name}: ${strayCount} ${strayCount === 1 ? 'line' : 'lines'} without a slot · clean up`,
      error: true,
      action: door('clean up', () => cleanUp('stray')),
    });
  }
  if (orphanCount > 0) {
    out.push({
      text: `${name}: ${orphanCount} ${orphanCount === 1 ? 'line' : 'lines'} of removed pieces · clean up`,
      error: true,
      action: door('clean up', () => cleanUp('orphan')),
    });
  }
  // Легаси: нормы и пины на строках деталей. Матрица их не показывает (ячейка = слот), а костинг
  // их считает — значит человек должен их увидеть и снять.
  let pieceNorms = 0;
  for (const rows of rowsBySlot.values()) {
    for (const { draft } of rows.pieces) {
      if (hasValue(draft) || draft.materialId > 0) pieceNorms += 1;
    }
  }
  if (pieceNorms > 0) {
    out.push({
      text: `${name}: ${pieceNorms} piece-level ${pieceNorms === 1 ? 'norm' : 'norms'}`,
      action: clearPieceNorms ? door('clear piece norms', clearPieceNorms) : undefined,
    });
  }
  return out;
}
