// ГОТОВНОСТЬ К ЭКСПОРТУ — сбор дыр со всех источников и гейт кнопки `download zip` (план §9.5).
//
// Источники: адаптер (данные стиля и колорвеев), резолвер состава (по колорвею), раскладка (E6,
// по колорвею — полный план `print-job.ts`), QR (ссылка каждого варианта), количества (S2).
//
// ОБЛАСТЬ БЛОКА. Блок с адресом колорвея держит только этот колорвей: снял чекбокс — архив без него
// разрешён. Блок без колорвея (общие `GLOBAL_HOLE_CODES`, а также дыры стиля: нет колорвеев, размер
// без номера) держит весь экспорт. Уровень дыры — из её кода (`holes.ts`), здесь не решается.
//
// Исключённый колорвей не несёт своих дыр в отчёт: его ленты не печатаются, и блок в нём ничего не
// портит. Он оставляет одно предупреждение `colorway-excluded` — в README видно, что его нет.
import { ROUTES } from 'constants/routes';
import type { CareLabelData } from './adapter';
import { variantSku } from './adapter';
import { resolveColorwayComposition, type ResolvedComposition } from './composition-resolver';
import { hole, isBlocking, type Hole, type HoleCode } from './holes';
import { qrPrims } from './qr';
import { qrLink, type CareLabelPrefs } from './use-care-label-prefs';

export type ColorwayReadiness = {
  colorwayId: number;
  included: boolean;
  composition: ResolvedComposition;
  /** Все дыры колорвея: данные + состав + раскладка. */
  holes: Hole[];
  /** Есть блок — колорвей в архив не пойдёт, пока его не снимут или не починят. */
  blocked: boolean;
};

export type Readiness = {
  colorways: ColorwayReadiness[];
  /** Дыры без колорвея: общие + стиля. */
  global: Hole[];
  /** Что показывает панель: общие + дыры включённых колорвеев + пометки исключённых. */
  shown: Hole[];
  /** Блоки, закрывающие кнопку, в порядке показа. */
  blockers: Hole[];
  /** Предупреждения для README (раздел WARNINGS) — только то, что попадёт в архив. */
  warnings: Hole[];
  canExport: boolean;
};

export type ReadinessInput = {
  data: CareLabelData;
  /** Колорвеи, снятые чекбоксом «в ZIP». */
  excluded: readonly number[];
  prefs: Pick<CareLabelPrefs, 'qrPreset' | 'qrTemplate'>;
  /** Дыры раскладки по колорвею (E6, `planAll`); нет — шрифты ещё грузятся. */
  layoutHoles?: ReadonlyMap<number, readonly Hole[]>;
  /** Дыры количеств (S2): `nothing-to-export`, `run-stale`, `colorway-excluded` и т. п. */
  quantityHoles?: readonly Hole[];
  /** Колорвеи с нулевой строкой количеств — в архив не идут (S2). Нет — все с количеством. */
  zeroColorways?: ReadonlySet<number>;
  /** Шрифты не загрузились (E2) — общий блок `fonts-failed`. */
  fontsFailed?: boolean;
};

const key = (h: Hole) => `${h.code}|${h.message}`;

function dedupe(holes: Hole[]): Hole[] {
  const seen = new Set<string>();
  return holes.filter((h) => (seen.has(key(h)) ? false : (seen.add(key(h)), true)));
}

const LEVEL_ORDER = { block: 0, warn: 1, info: 2 } as const;

export function collectReadiness(input: ReadinessInput): Readiness {
  const { data, excluded, prefs } = input;
  const out: ColorwayReadiness[] = [];

  for (const cw of data.colorways) {
    const composition = resolveColorwayComposition({
      colorwayId: cw.id,
      bom: data.bom,
      usages: cw.usages,
      materials: data.materials,
      fibers: data.fibers,
    });
    const holes = dedupe([
      ...cw.holes,
      ...composition.holes,
      ...(input.layoutHoles?.get(cw.id) ?? []),
    ]).map((h) =>
      h.ref.colorwayId === undefined ? { ...h, ref: { ...h.ref, colorwayId: cw.id } } : h,
    );
    const included = !excluded.includes(cw.id) && !input.zeroColorways?.has(cw.id);
    out.push({ colorwayId: cw.id, included, composition, holes, blocked: holes.some(isBlocking) });
  }

  // QR — по каждому варианту включённых колорвеев: ссылка своя у каждого (шаблон с {sku}/{size}),
  // значит и длина, и модуль. Дыры QR общие — одна строка на код.
  const qrHoles: Hole[] = [];
  const seenQr = new Set<HoleCode>();
  for (const cw of data.colorways) {
    if (!out.find((r) => r.colorwayId === cw.id)?.included) continue;
    for (const s of data.sizes) {
      const sku = cw.baseSku && s.skuOrd != null ? variantSku(cw.baseSku, s.skuOrd) : '';
      const link = qrLink(prefs, {
        base_sku: cw.baseSku,
        sku,
        size: s.name,
        colorway_id: cw.id,
        style: data.styleNumber,
      });
      for (const h of qrPrims(link, 0, 0).holes) {
        if (seenQr.has(h.code)) continue;
        seenQr.add(h.code);
        qrHoles.push(h);
      }
    }
  }

  const global = dedupe([
    ...(input.fontsFailed
      ? [hole('fonts-failed', 'the label fonts did not load — reload the page')]
      : []),
    ...data.holes,
    ...qrHoles,
    ...(input.quantityHoles ?? []).filter((h) => h.ref.colorwayId === undefined),
  ]);

  const includedRows = out.filter((r) => r.included);
  const excludedNotes = out
    .filter((r) => !r.included && excluded.includes(r.colorwayId))
    .map((r) => {
      const cw = data.colorways.find((c) => c.id === r.colorwayId);
      return hole(
        'colorway-excluded',
        `${cw?.baseSku || `colourway #${r.colorwayId}`}: excluded from the zip`,
        { colorwayId: r.colorwayId },
      );
    });
  const quantityPerColorway = (input.quantityHoles ?? []).filter(
    (h) => h.ref.colorwayId !== undefined,
  );

  const noneLeft =
    data.colorways.length > 0 &&
    includedRows.length === 0 &&
    !global.some((h) => h.code === 'nothing-to-export')
      ? [hole('nothing-to-export', 'no colourway is left in the zip — tick at least one')]
      : [];

  const shown = dedupe([
    ...global,
    ...noneLeft,
    ...includedRows.flatMap((r) => r.holes),
    ...quantityPerColorway,
    ...excludedNotes,
  ]).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  const blockers = shown.filter(isBlocking);
  return {
    colorways: out,
    global,
    shown,
    blockers,
    warnings: shown.filter((h) => h.level === 'warn'),
    canExport: blockers.length === 0,
  };
}

// ---------- двери ----------

export type HoleDoor = { label: string; href: string };

const DICTIONARY: ReadonlySet<string> = new Set([
  'fibre-no-translation',
  'fibre-unknown',
  'fibre-by-name',
  'en-fallback-name',
]);
const BOM: ReadonlySet<string> = new Set([
  'part-no-composition',
  'composition-empty',
  'fibre-blend-code',
  'pinned-material-no-composition',
  'part-not-100',
  'no-usage',
  'equal-weight',
  'mixed-units',
  'legacy-free-text-composition',
  'part-too-wide',
]);
const COLORWAYS: ReadonlySet<string> = new Set([
  'piece-pin-differs',
  'no-sku',
  'no-colour-name',
  'no-country',
  'country-unknown',
  'country-mismatch',
  'colorway-not-active',
]);
const LABELS: ReadonlySet<string> = new Set([
  'care-empty',
  'care-overflow',
  'care-too-many-symbols',
  'artwork-missing',
]);

/** Куда идти чинить дыру: словарь волокон, BOM, колорвеи или этикетки карточки. */
export function holeDoor(h: Hole, techCardId: number): HoleDoor | null {
  const card = `/tech-cards/${techCardId}`;
  if (DICTIONARY.has(h.code)) return { label: 'open dictionary', href: ROUTES.dictionaries };
  if (BOM.has(h.code)) return { label: 'open BOM', href: `${card}?tab=bom` };
  if (COLORWAYS.has(h.code)) return { label: 'open colourways', href: `${card}?tab=colorways` };
  if (LABELS.has(h.code)) return { label: 'open labels', href: `${card}?tab=labels` };
  return null;
}
