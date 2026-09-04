// Точка входа пробы «цветовой план»: НАСТОЯЩИЕ модули полосы, а не их копии.
//
// Здесь не переписано ничего из проверяемого. Стенд даёт четыре рукоятки — «собрать палитру»,
// «собрать рецепт прогона», «спросить ворота» и «построить полосу» — и все, кроме последней, ходят
// прямо в `design/colour-plan/model.ts`. Копия сборщика в пробе доказывала бы только то, что копия
// согласна сама с собой (приём взят у `step-roundtrip-entry` и `bom-pantone-entry`).
import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
} from 'api/proto-http/admin';
import {
  colourPlanGate,
  exactPalette,
  planColours,
  planFabrics,
  planRecipe,
  readColourPlan,
  sendableMaps,
  type ColourPlanDoc,
  type PlanMap,
} from 'components/managers/tech-card/components/design/colour-plan/model';

export {
  colourPlanGate,
  exactPalette,
  planColours,
  planFabrics,
  planRecipe,
  readColourPlan,
  sendableMaps,
};
export type { ColourPlanDoc, PlanMap };

/** Пустой рецепт прогона — то, поверх чего `planRecipe` кладёт покраску. */
export const baseRecipe = (): common_DesignColourRecipe => ({
  source: '',
  code: '',
  hex: '',
  words: 'fine rib jersey',
  fabricMediaId: 0,
  fabrics: [],
  colourMaps: [],
});

export type Side = { view: string; pictureId: number; mediaId: number; w?: number; h?: number };
export type Asset = { id: number; name: string; mediaId: number; colourHex?: string; note?: string };

/**
 * ПОЛОСА-ФИКСТУРА. Ровно те поля, которые читают `benchSides`, `renderSheetViews`, `assetById` и
 * `readColourPlan`; всё остальное отсутствует НАРОЧНО — чтение полосы обязано переживать
 * незаполненное поле, и стенд, доливший в неё ключей «на всякий случай», прятал бы это.
 */
export function makeBand(input: {
  sides: Side[];
  assets?: Asset[];
  references?: number[];
  plan?: { rev: number; maps: unknown[]; cloths: unknown[] } | null | undefined;
}): GetDesignBandResponse {
  return {
    bench: input.sides.map((s) => ({
      viewKey: s.view,
      kind: 'flat',
      colorwayId: 0,
      slotRev: 1,
      picture: {
        id: s.pictureId,
        kind: 'flat',
        media: {
          id: s.mediaId,
          media: {
            fullSize: {
              mediaUrl: `https://example.test/${s.mediaId}.png`,
              width: s.w ?? 1000,
              height: s.h ?? 1250,
            },
            thumbnail: { mediaUrl: `https://example.test/${s.mediaId}-t.png` },
          },
        },
      },
    })),
    assets: (input.assets ?? []).map((a) => ({
      id: a.id,
      kind: 'fabric',
      name: a.name,
      mediaId: a.mediaId,
      colourHex: a.colourHex ?? '',
      note: a.note ?? '',
      repeatMm: 0,
    })),
    references: (input.references ?? []).map((mediaId) => ({ mediaId, role: 'front' })),
    colourPlan: input.plan,
  } as unknown as GetDesignBandResponse;
}

/** Документ плана, прочитанный ТОЙ ЖЕ дверью, что читает экран. */
export function readPlan(band: GetDesignBandResponse): ColourPlanDoc | undefined {
  return readColourPlan(band);
}

/**
 * ХОЛСТ КАРТЫ В ПАМЯТИ: белая бумага, чёрные линии, две залитых области, антиалиасинговый ободок
 * и полупрозрачный край. Ровно то, что производит настоящий редактор, — и ровно то, на чём скан
 * по ОТКРЫТОМУ множеству выдумал бы цвета, которых никто не выбирал.
 */
export function paintedDoc(opts: {
  w: number;
  h: number;
  fills: { hex: string; px: number }[];
  /** Сколько пикселей потратить на промежуточные оттенки края (каждый свой цвет). */
  rimPx: number;
  /** Сколько пикселей залить ЗАПИСАННЫМ цветом, но с неполной альфой. */
  softPx: number;
}): Uint8ClampedArray {
  const px = new Uint8ClampedArray(opts.w * opts.h * 4);
  // бумага
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = 255;
  }
  let at = 0;
  const put = (r: number, g: number, b: number, a: number) => {
    const i = at * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
    at += 1;
  };
  // чёрные линии чертежа — 500 пикселей
  for (let n = 0; n < 500; n += 1) put(0, 0, 0, 255);
  const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  for (const f of opts.fills) {
    const [r, g, b] = rgb(f.hex);
    for (let n = 0; n < f.px; n += 1) put(r, g, b, 255);
  }
  // ободок: смеси первой заливки с бумагой, КАЖДАЯ своего оттенка
  if (opts.fills[0]) {
    const [r, g, b] = rgb(opts.fills[0].hex);
    for (let n = 0; n < opts.rimPx; n += 1) {
      /* ⚠ ДОЛЯ НИКОГДА НЕ 0 И НИКОГДА НЕ 1. Ободок обязан состоять ИЗ ПРОМЕЖУТОЧНЫХ оттенков: с
         нулём он подмешивал бы в счёт чистую заливку, и «ровно 4000» стало бы 4004 — стенд врал
         бы про цифру, которую сам и портит. */
      const k = ((n % 198) + 1) / 200;
      put(
        Math.round(r + (255 - r) * k),
        Math.round(g + (255 - g) * k),
        Math.round(b + (255 - b) * k),
        255,
      );
    }
    for (let n = 0; n < opts.softPx; n += 1) put(r, g, b, 200);
  }
  return px;
}
