// ДАННЫЕ ЭКРАНА → ЗАДАНИЕ ПЕЧАТИ (`PrintJob` страниц E7) и полный план для превью и дыр раскладки.
//
// Два плана из одних и тех же данных:
//  - ПОЛНЫЙ (`planAll`) — каждый колорвей × каждый размер по одной копии. Из него превью берёт стороны
//    выбранного варианта, а готовность — дыры раскладки (глифы, перелив, символы …) ещё до того, как
//    введены количества: оператор видит блок сразу, а не после «download».
//  - АРХИВНЫЙ (`buildPrintJob` с настоящими копиями) — только колорвеи в ZIP; ячейка 0 файла не даёт
//    (`planPrint` пропускает размер без копий и колорвей без размеров).
// Ссылка QR каждого варианта — `qrLink` (тот же `renderTemplate`, что считает дыры QR в готовности).
import { variantSku, type CareLabelData } from './adapter';
import { resolveColorwayComposition, type PartComposition } from './composition-resolver';
import { hole, isGlobalHole, type Hole } from './holes';
import type { PrintMode } from './layout';
import { fileSlug, planPrint, type PrintJob, type PrintSet } from './pages';
import type { Shaper } from './text-outline';
import { qrLink, type CareLabelPrefs } from './use-care-label-prefs';

export type QrPrefs = Pick<CareLabelPrefs, 'qrPreset' | 'qrTemplate'>;

/** Папка колорвея в архиве: `<base_sku>-<colour-slug>` (план §9.6). */
export const colorwayFolder = (baseSku: string, colour: string, colorwayId: number): string =>
  [baseSku.trim().replace(/[^A-Za-z0-9-]+/g, '-') || `colourway-${colorwayId}`, fileSlug(colour)]
    .filter(Boolean)
    .join('-');

/** Состав колорвеев — тот же вызов резолвера, что в готовности. */
export function compositionsOf(data: CareLabelData): Map<number, PartComposition[]> {
  return new Map(
    data.colorways.map((cw) => [
      cw.id,
      resolveColorwayComposition({
        colorwayId: cw.id,
        bom: data.bom,
        usages: cw.usages,
        materials: data.materials,
        fibers: data.fibers,
      }).parts,
    ]),
  );
}

export type PrintJobInput = {
  data: CareLabelData;
  compositions: ReadonlyMap<number, PartComposition[]>;
  mode: PrintMode;
  qr: QrPrefs;
  /** Колорвеи задания в порядке карточки. */
  colorwayIds: readonly number[];
  /** Копий этикетки A варианта (ячейка сетки с запасом); 0 — размер не печатается. */
  copies: (colorwayId: number, sizeId: number) => number;
};

export function buildPrintJob(input: PrintJobInput): PrintJob {
  const { data, mode, qr } = input;
  const want = new Set(input.colorwayIds);
  return {
    mode,
    care: data.care,
    colorways: data.colorways
      .filter((cw) => want.has(cw.id))
      .map((cw) => ({
        colorwayId: cw.id,
        folder: colorwayFolder(cw.baseSku, cw.colourName, cw.id),
        colour: cw.colourName,
        country: cw.countryName,
        parts: input.compositions.get(cw.id) ?? [],
        sizes: data.sizes.map((s) => {
          const sku = cw.baseSku && s.skuOrd != null ? variantSku(cw.baseSku, s.skuOrd) : '';
          return {
            sizeId: s.id,
            label: s.label,
            skuOrd: s.skuOrd,
            sku: sku || cw.baseSku,
            copies: Math.max(0, Math.floor(input.copies(cw.id, s.id) || 0)),
            qrUrl: qrLink(qr, {
              base_sku: cw.baseSku,
              sku,
              size: s.name,
              colorway_id: cw.id,
              style: data.styleNumber,
            }),
          };
        }),
      })),
  };
}

export type FullPlan = {
  /** План по колорвею (все размеры × 1 копия); колорвей, чья вёрстка упала, — без плана. */
  sets: Map<number, PrintSet>;
  /** Дыры раскладки по колорвею для `collectReadiness({ layoutHoles })`. Общие (QR) — не здесь:
   *  готовность считает их сама по каждому варианту, и колорвейный адрес сузил бы их область. */
  layoutHoles: Map<number, Hole[]>;
};

/** Полный план: по колорвею отдельно — ошибка вёрстки одного не гасит превью остальных. */
export function planAll(
  sh: Shaper,
  data: CareLabelData,
  compositions: ReadonlyMap<number, PartComposition[]>,
  mode: PrintMode,
  qr: QrPrefs,
): FullPlan {
  const sets = new Map<number, PrintSet>();
  const layoutHoles = new Map<number, Hole[]>();
  for (const cw of data.colorways) {
    const job = buildPrintJob({
      data,
      compositions,
      mode,
      qr,
      colorwayIds: [cw.id],
      copies: () => 1,
    });
    try {
      const set = planPrint(sh, job);
      sets.set(cw.id, set);
      layoutHoles.set(
        cw.id,
        set.holes.filter((h) => !isGlobalHole(h)),
      );
    } catch (e) {
      // Раскладка сама превращает нехватку глифа в дыру; сюда доходит только непредвиденное —
      // блоком с адресом колорвея, а не белым экраном.
      layoutHoles.set(cw.id, [
        hole(
          'glyph-missing',
          `${cw.baseSku || `colourway #${cw.id}`}: the label could not be typeset — ${
            e instanceof Error ? e.message : String(e)
          }`,
          { colorwayId: cw.id },
        ),
      ]);
    }
  }
  return { sets, layoutHoles };
}
