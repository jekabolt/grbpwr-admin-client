import type { common_TechCardBomSection } from 'api/proto-http/admin';
import {
  FIBER_SEPARATOR,
  resolveColorwayComposition,
  type ColorwayCompositionInput,
  type PartComposition,
} from 'components/managers/tech-card/care-labels/composition-resolver';
import type { Hole } from 'components/managers/tech-card/care-labels/holes';
import { LABEL_PART_NAME } from 'components/managers/tech-card/care-labels/label-parts';

// Thread carries no fibre composition of the garment (D-44, O-47): it sews the garment together,
// it is not what the garment is made of. D-50: this is the ONE rule every AGGREGATE of the
// garment's composition applies — the care label and «is composition set» below, a colourway's
// derived composition (colorway-recipe.tsx), the labels → BOM handoff (bom-field.tsx). Per-line
// views (a BOM row, a release's frozen BOM, the draft's inventory) keep printing a thread's own
// composition: that is a fact about the article, not the garment. A linked thread article keeps
// its catalog snapshot on the line; the aggregates simply never read it.
const THREAD_SECTION: common_TechCardBomSection = 'TECH_CARD_BOM_SECTION_THREAD';
export function carriesGarmentComposition(line: { section?: string }): boolean {
  return line.section !== THREAD_SECTION;
}

// The care line is NOT built here. `careInstructions` is a comma-joined ISO-3758 code string
// ("MW30,DNB,DNTD"), and the wording for each code — plus its print order — is dictionary data
// served by the backend, not a table the client maintains. Read it through
// `useCareVocabulary().prose(value)`; that is the same wording the storefront renders, so the
// preview on the header tab and the printed tag can never word the same symbols differently.

// True if at least one article other than thread carries a non-blank composition string (used to
// tell apart "nothing filled" from "filled but not parseable").
export function hasAnyComposition(
  bomItems: Array<{ section?: string; composition?: string }>,
): boolean {
  return (bomItems ?? []).some((b) => carriesGarmentComposition(b) && !!b.composition?.trim());
}

// ОДИН ГЕНЕРАТОР СОСТАВА В СИСТЕМЕ (план §5.4). Здесь жил второй: строка на СЕКЦИЮ BOM
// (таблица «секция → Shell / Lining / …»), свой парсер ячейки и своя таблица имён пикера. Он
// разошёлся с лентой в трёх местах сразу: брал первую строку секции вместо слияния по расходу,
// печатал имя пикера вместо имени словаря волокон и не знал ни части этикетки (две подкладки —
// две колонки), ни колорвея (пин артикула меняет состав). Теперь это форматтер над тем же
// `resolveColorwayComposition`, по которому печатается лента, — EN-строки одного колорвея:
//
//   SHELL: 55% COTTON, 35% LINEN, 10% POLYAMIDE
//   BODY LINING: 100% COTTON
//   Made in Poland
//
// Колорвей выбирает вызывающий (`defaultCareColorway`); без колорвеев — пустые usages: веса 1,
// материал слота (резолвер так и определяет «без колорвея»).
export type CareLabelInput = ColorwayCompositionInput & {
  /** Страна как текст («Poland»); пусто — строки `Made in` нет. */
  originCountry?: string;
};

export type CareLabelText = {
  /** Строки через `\n`; '' — ни одна часть не собралась. */
  text: string;
  parts: PartComposition[];
  /** Дыры резолвера, относящиеся к EN-тексту (переводы на прочие 9 языков — дело экрана ленты). */
  holes: Hole[];
};

export function generateCareLabel(input: CareLabelInput): CareLabelText {
  const { parts, holes } = resolveColorwayComposition(input);
  const lines = parts.map((p) =>
    // NOTE — фраза ст. 12 целиком, у неё нет долей; прочие части — заголовок колонки ленты и те же
    // EN-ячейки, что на ленте, только через запятую (строка, а не колонка).
    p.part === 'NOTE'
      ? p.rows.en
      : `${LABEL_PART_NAME[p.part]}: ${p.rows.en.split(FIBER_SEPARATOR).join(', ')}`,
  );
  const origin = input.originCountry?.trim();
  if (lines.length && origin) lines.push(`Made in ${origin}`);
  return {
    text: lines.join('\n'),
    parts,
    holes: holes.filter((h) => !h.ref.lang || h.ref.lang === 'en'),
  };
}

/** Колорвей старого генератора и превью (§5.4): первый ACTIVE, иначе первый; нет — undefined. */
export function defaultCareColorway<T extends { status?: string }>(
  colorways: readonly T[] | undefined,
): T | undefined {
  return colorways?.find((c) => c.status === 'COLORWAY_LIFECYCLE_STATUS_ACTIVE') ?? colorways?.[0];
}
