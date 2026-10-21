import type { common_TechCard } from 'api/proto-http/admin';
import {
  alphaKey,
  bomRefs,
  clean,
  colorwayHex,
  colorwayName,
  enumLabel,
  materialForPiece,
  materialRole,
  resolveBomRef,
  rollGoods,
} from './derive-shared';

const OMIT_SECTIONS = new Set(['TECH_CARD_BOM_SECTION_LABEL', 'TECH_CARD_BOM_SECTION_PACKAGING']);

export type ColourwaysModel = ReturnType<typeof deriveColourways>;

export function deriveColourways(techCard: common_TechCard) {
  const refs = bomRefs(techCard);
  const pieces = techCard.techCard?.pieces ?? [];
  const colorways = techCard.colorways ?? [];
  const matrixRefs = refs.filter((ref) => !OMIT_SECTIONS.has(ref.item.section ?? ''));
  const partGroups = [
    ...matrixRefs
      .reduce((groups, ref) => {
        const label = rollGoods(ref)
          ? materialRole(ref)
          : enumLabel(ref.item.kind) || clean(ref.item.name) || enumLabel(ref.item.section);
        const key = label || ref.key;
        const group = groups.get(key) ?? { key, label, refs: [] };
        group.refs.push(ref);
        groups.set(key, group);
        return groups;
      }, new Map<string, { key: string; label: string; refs: typeof matrixRefs }>())
      .values(),
  ];
  const columns = partGroups.map((group) => ({
    key: group.key,
    label: group.label,
    name: group.refs
      .map((ref) => clean(ref.item.name))
      .filter(Boolean)
      .join(' · '),
  }));
  const rows = colorways.map((colorway, index) => ({
    key: String(colorway.colorwayId ?? index),
    name: colorwayName(colorway, index),
    swatch: colorwayHex(colorway),
    cells: partGroups.map((group) => {
      const refKeys = new Set(group.refs.map((ref) => ref.key));
      const usages = (colorway.usages ?? []).filter((usage) => {
        const ref = resolveBomRef(refs, usage);
        return ref ? refKeys.has(ref.key) : false;
      });
      const colours = [
        ...new Set(
          usages.flatMap((usage) => [clean(usage.color), clean(usage.pantone)]).filter(Boolean),
        ),
      ];
      const defaults = group.refs
        .flatMap((ref) => [clean(ref.item.color), clean(ref.item.name)])
        .filter(Boolean);
      return {
        key: group.key,
        value: colours.join(' · ') || defaults.join(' · '),
        sub: colours.length
          ? group.refs
              .map((ref) => clean(ref.item.name))
              .filter(Boolean)
              .join(' · ')
          : '',
        swatch: usages.length || group.refs.some(rollGoods) ? colorwayHex(colorway) : '',
        missing: !usages.length,
      };
    }),
  }));
  const fabricRows = refs.filter(rollGoods).map((ref, index) => ({
    key: ref.key,
    label: alphaKey(index),
    role: materialRole(ref),
    cells: colorways.map((colorway, colorwayIndex) => {
      const assigned = pieces.filter(
        (piece, pieceIndex) => materialForPiece(refs, colorway, piece, pieceIndex)?.key === ref.key,
      );
      const usages = (colorway.usages ?? []).filter(
        (usage) => resolveBomRef(refs, usage)?.key === ref.key,
      );
      const colours = [
        ...new Set(
          usages.flatMap((usage) => [clean(usage.color), clean(usage.pantone)]).filter(Boolean),
        ),
      ];
      return {
        key: `${colorway.colorwayId ?? colorwayIndex}-${ref.key}`,
        colorway: colorwayName(colorway, colorwayIndex),
        pieces: assigned.map((piece) => clean(piece.name)).filter(Boolean),
        material: clean(ref.item.name),
        colour: colours.join(' · ') || clean(ref.item.color),
        swatch: colorwayHex(colorway),
        missing: assigned.length === 0,
      };
    }),
  }));

  return { columns, rows, fabricRows };
}
