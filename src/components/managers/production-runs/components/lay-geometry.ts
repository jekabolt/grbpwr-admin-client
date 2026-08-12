import type { common_TechCardMarkerSummary } from 'api/proto-http/admin';

// ГЕОМЕТРИЯ НАСТИЛА (§7.1) — ОДИН ЭКЗЕМПЛЯР ФОРМУЛЫ НА ВЕСЬ КЛИЕНТ.
//
//   ткань      = Σ (длина раскладки × слоёв секции)
//   концевые   = 2 × концевые на один конец одного слоя × Σ слоёв
//   план       = ткань + концевые
//
// Формула жила инлайном в `lay-editor.tsx`, и пока настил собирали только там, одного экземпляра
// хватало. Очередь раскроя партии предлагает настил из уже снятой раскладки и обязана показать
// ТЕ ЖЕ ЧЕТЫРЕ ЧИСЛА до открытия формы — то есть вторая копия здесь была бы вторым ответом на
// вопрос «сколько ткани съест настил». Разошлись бы они молча: обе стороны печатают метры, обе
// правдоподобны, а сервер посчитает своё третье.
//
// СЕРВЕР СЧИТАЕТ ЭТО ЖЕ И ОСТАЁТСЯ ВЛАДЕЛЬЦЕМ ЧИСЛА (`planned_length_cm` приезжает с настила).
// Здесь оно нужно ДО записи — по тем значениям, которые человек видит на экране прямо сейчас, —
// и расходиться им не на чем, кроме высоты стопки: толщина ткани живёт на артикуле и по проводу
// сюда не едет вовсе.
export type LayGeometrySection = {
  markerId: number;
  /** Слоёв в секции. Уже число: строку из формы разбирает вызывающий (`sectionPlies`). */
  plies: number;
};

export type LayGeometry = {
  totalPlies: number;
  clothCm: number;
  endLossTotalCm: number;
  plannedCm: number;
};

export function layGeometry(args: {
  sections: readonly LayGeometrySection[];
  /**
   * Концевые потери, см на ОДИН конец ОДНОГО слоя — сырыми, как их держит поле формы. Пустая
   * строка даёт 0: незаполненное поле означает «потерь не назвали», и выдумывать за оператора
   * здесь нечего — умолчание подставляет форма, а не формула.
   */
  endLossCm: string | number;
  /**
   * Раскладки, среди которых ищется длина секции. Длина берётся ТОЛЬКО отсюда: у секции своей
   * длины нет, она ссылается на раскладку по id, и раскладка, которой в списке нет, даёт ноль —
   * то есть «этой секцией ткань не мерена», а не «ткани нужно ноль».
   */
  markers: readonly common_TechCardMarkerSummary[];
}): LayGeometry {
  let totalPlies = 0;
  let clothCm = 0;
  for (const s of args.sections) {
    const plies = Number.isFinite(s.plies) && s.plies > 0 ? s.plies : 0;
    totalPlies += plies;
    const m = args.markers.find((mm) => (mm.id ?? 0) === s.markerId);
    const len = Number(m?.usedLengthCm?.value);
    if (Number.isFinite(len)) clothCm += len * plies;
  }
  const endLossNum = Number(args.endLossCm);
  const endLossTotalCm = Number.isFinite(endLossNum) ? 2 * endLossNum * totalPlies : 0;
  return { totalPlies, clothCm, endLossTotalCm, plannedCm: clothCm + endLossTotalCm };
}
