import type { common_AdminColorwayRef, common_TechCard } from 'api/proto-http/admin';
import {
  alphaKey,
  bomColourwayName,
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

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export type ColourwaysModel = ReturnType<typeof deriveColourways>;

/**
 * The recipe matrix. A card without colourways prints one colourway made of its BOM colours
 * (`fromBom`), so the workshop still reads which colour goes where.
 */
export function deriveColourways(techCard: common_TechCard) {
  const refs = bomRefs(techCard);
  const pieces = techCard.techCard?.pieces ?? [];
  const colorways = techCard.colorways ?? [];
  const bomName = colorways.length ? '' : bomColourwayName(techCard);
  // `undefined` = the BOM-colour colourway: no usages, the BOM line's own colour
  const sources: Array<common_AdminColorwayRef | undefined> = colorways.length
    ? colorways
    : bomName
      ? [undefined]
      : [];
  const sourceName = (colorway: common_AdminColorwayRef | undefined, index: number) =>
    colorway ? colorwayName(colorway, index) : bomName;
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
  const columns = partGroups.map((group) => ({ key: group.key, label: group.label }));
  const rows = sources.map((colorway, index) => ({
    key: colorway ? String(colorway.colorwayId ?? index) : 'bom',
    name: sourceName(colorway, index),
    swatch: colorwayHex(colorway),
    cells: partGroups.map((group) => {
      const refKeys = new Set(group.refs.map((ref) => ref.key));
      const usages = (colorway?.usages ?? []).filter((usage) => {
        const ref = resolveBomRef(refs, usage);
        return ref ? refKeys.has(ref.key) : false;
      });
      const usageColours = unique(
        usages.flatMap((usage) => [clean(usage.color), clean(usage.pantone)]),
      );
      const bomColours = unique(group.refs.map((ref) => clean(ref.item.color)));
      const names = unique(group.refs.map((ref) => clean(ref.item.name)));
      const colours = usageColours.length ? usageColours : bomColours;
      return {
        key: group.key,
        value: colours.join(' · ') || names.join(' · '),
        sub: colours.length ? names.join(' · ') : '',
        swatch: usages.length || group.refs.some(rollGoods) ? colorwayHex(colorway) : '',
        missing: !!colorway && !usages.length,
      };
    }),
  }));
  const fabricRows = refs.filter(rollGoods).map((ref, index) => {
    const cells = sources.map((colorway, colorwayIndex) => {
      const assigned = pieces.filter(
        (piece, pieceIndex) => materialForPiece(refs, colorway, piece, pieceIndex)?.key === ref.key,
      );
      const usages = (colorway?.usages ?? []).filter(
        (usage) => resolveBomRef(refs, usage)?.key === ref.key,
      );
      const colours = unique(usages.flatMap((usage) => [clean(usage.color), clean(usage.pantone)]));
      return {
        key: `${colorway?.colorwayId ?? colorwayIndex}-${ref.key}`,
        pieces: assigned.map((piece) => clean(piece.name)).filter(Boolean),
        material: clean(ref.item.name),
        colour: colours.join(' · ') || clean(ref.item.color),
        swatch: colorwayHex(colorway),
      };
    });
    const first = cells[0]?.pieces ?? [];
    return {
      key: ref.key,
      label: alphaKey(index),
      role: materialRole(ref),
      // the pieces column reads the first colourway; a colourway that cuts other pieces says so
      pieces: first,
      cells: cells.map((cell) => ({
        ...cell,
        differs: cell.pieces.join('|') !== first.join('|'),
      })),
    };
  });

  return { columns, rows, fabricRows, fromBom: !colorways.length && !!bomName };
}
