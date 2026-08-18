// ОСНОВА ПЕРЕВОДА ДЛИНЫ В ВЕС (Ф3): откуда берутся полная ширина рулона и плотность для кг-слота.
//
// ОДНА ФУНКЦИЯ НА ВСЕХ ВЫЗЫВАЮЩИХ — И ЭТО НЕСУЩЕЕ, А НЕ УДОБСТВО. У строки BOM есть СВОЯ
// плотность (`bomItems[].fabricWeightGsm`) — снимок спецификации, под которую рисовали карточку;
// на сервере у неё нет ни одного потребителя, и смешивать её с артикульной запрещено прямо в
// комментарии entity.EffectiveFabricWeightGsm. Она лежит в форме прямо под рукой — тем опаснее:
// каждый вызывающий, резолвящий основу сам, однажды возьмёт её. Поэтому выбор чисел живёт здесь
// один раз, а ошибка ширины или плотности входит в вес ЛИНЕЙНО и не видна ни в одном числе —
// никаких номиналов «150 см» и «200 г/м²» здесь нет и быть не может.
//
// Main-thread-safe: типы API, лёгкая утилита разбора десятичных и тип из marker-io — файл можно
// импортировать и из чанка рецепта, и из bom-field, не таща геометрию.
import type { common_Material } from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';
import type { FabricWeightBasis } from './marker-io';

// Ширина/плотность артикула: типизированный атрибут CTI с фолбэком в плоское легаси-поле.
// Перенесены сюда из bom-field.tsx (он импортирует их отсюда): формула одна на снапшот строки,
// плашку артикула и основу веса — три места, которые обязаны сходиться в одном числе.
export function materialFabricWidth(m?: common_Material): string | undefined {
  return m?.fabricAttrs?.widthCm?.value || m?.fabricWidth?.value;
}
export function materialFabricWeight(m?: common_Material): string | undefined {
  return m?.fabricAttrs?.weightGsm?.value || m?.fabricWeightGsm?.value;
}

export type WeightBasisMissing = 'width' | 'gsm' | 'both';

export type WeightBasisResolution =
  | { ok: true; basis: FabricWeightBasis }
  // `pinned` едет с отказом, потому что отказ обязан говорить правду о том, ГДЕ искали ширину:
  // в пиновой ветке она берётся с пинованного артикула, и «не заполнена ни на строке BOM, ни у
  // артикула» было бы ложью — на строке ширина может стоять, просто она про другую ткань.
  | { ok: false; missing: WeightBasisMissing; pinned: boolean };

/**
 * ПОЛНАЯ ширина рулона строки BOM/рецепта — ОДИН экспортируемый резолвер на длину И на вес,
 * и это несущее, а не удобство. Длина делится на РАСКРОЙНУЮ ширину (рулон − 2×кромка,
 * cuttingWidthOf в colorway-recipe — он берёт рулон отсюда и лишь вычитает кромку), вес
 * умножается на ПОЛНУЮ (weightBasisOf ниже). Разные величины — но ОДИН рулон: если два места
 * разойдутся в том, КАКОЙ рулон они описывают, они разойдутся молча, и ошибка уйдёт в норму и в
 * вес линейно, не видная ни в одном числе.
 *
 * Порядок: пин на ДРУГОЙ артикул → ширина этого артикула (обе величины с него — ширина пина со
 * снимком чужой строки описывала бы рулон, которого не существует); иначе → СВОЁ поле строки
 * `fabricWidth` (ЖИВОЕ состояние формы) → read-time обогащение `effectiveFabricWidthCm` →
 * ширина артикула.
 *
 * ПОЧЕМУ ЖИВОЕ ПОЛЕ СТРОКИ РАНЬШЕ ОБОГАЩЕНИЯ — и почему перестановка безопасна.
 * `effectiveFabricWidthCm` — это серверный COALESCE(ширина строки, ширина артикула) ВРЕМЕНИ
 * ЧТЕНИЯ (0259): всегда, когда поле строки заполнено, оно РАВНО ему. Значит порядок меняет
 * поведение ровно в одном состоянии — поле только что отредактировали в форме и ещё не
 * сохранили. Прежний порядок (обогащение первым) в этом состоянии молча считал по старой
 * ширине И глушил проверку «ширина раскладки против ширины артикула»: обе стороны сравнения
 * брались из одного устаревшего числа и видели согласие там, где его нет.
 * Артикул — последним звеном: у строки, у которой пусты оба поля, отказ без него называл бы
 * незаполненным поле, которое заполнено (в карточке материала).
 */
export function fullRollWidthOf(
  material: common_Material | undefined,
  slot: { effectiveFabricWidthCm?: string; fabricWidth?: string } | undefined,
  pinned = false,
): string {
  if (pinned) return materialFabricWidth(material) ?? '';
  return slot?.fabricWidth || slot?.effectiveFabricWidthCm || materialFabricWidth(material) || '';
}

/**
 * Основа веса для строки рецепта/BOM: полная ширина рулона (С КРОМКОЙ) и плотность артикула.
 *
 * ПЛОТНОСТЬ — ТОЛЬКО АРТИКУЛА (materialFabricWeight), никогда снимок строки — см. простыню выше.
 *
 * ШИРИНА — из fullRollWidthOf, ОБЩЕГО с cuttingWidthOf резолвера (см. его простыню: один рулон
 * на длину и на вес). Сервер в материальном плане берёт для веса артикульную ширину —
 * расхождение с той веткой ОСОЗНАННОЕ: переопределение ширины на строке описывает тот рулон,
 * который реально кроят, и вес считается для него. В обычном случае (переопределения нет) это
 * то же число, что у артикула, так что расхождения не возникает; при переопределении наш ответ
 * вернее.
 */
export function weightBasisOf(
  material: common_Material | undefined,
  slot: { effectiveFabricWidthCm?: string; fabricWidth?: string } | undefined,
  pinned = false,
): WeightBasisResolution {
  const gsm = parseDecimalNumber(materialFabricWeight(material) ?? '');
  const width = parseDecimalNumber(fullRollWidthOf(material, slot, pinned));
  // Обе величины обязаны быть ПОЛОЖИТЕЛЬНЫМИ И КОНЕЧНЫМИ. Ноль — это не измерение, а
  // незаполненное поле (серверный тест держит ровно это: width = 0 → ответа НЕТ, не ноль и не
  // догадка). Бесконечность — тоже не измерение: parseDecimalNumber на строке из сотен цифр
  // честно даёт Infinity, а голое `> 0` её ПРОПУСКАЕТ — и применение записало бы в норму
  // строку "Infinity".
  const noWidth = !(Number.isFinite(width) && width > 0);
  const noGsm = !(Number.isFinite(gsm) && gsm > 0);
  if (noWidth || noGsm) {
    return { ok: false, missing: noWidth && noGsm ? 'both' : noWidth ? 'width' : 'gsm', pinned };
  }
  return { ok: true, basis: { fullWidthCm: width, gsm } };
}

// Отказ на кг-слоте обязан называть, ЧЕГО не хватает — ширины или плотности, — и НИКОГДА не
// «единица слота не принимает длину»: последнее отправляет оператора менять единицу вместо того,
// чтобы заполнить артикул. Одна формулировка на все поверхности.
//
// `pinned` меняет слова про ШИРИНУ. В пиновой ветке она берётся с пинованного артикула, и «не
// заполнена ни на строке BOM, ни у артикула» было бы ложью: на строке ширина может стоять —
// просто она описывает ДРУГУЮ ткань (артикул слота), а не ту, которую этот колорвей закупает.
export function weightRefusalText(missing: WeightBasisMissing, pinned = false): string {
  if (missing === 'both') {
    return pinned
      ? "the slot is in kilograms, and the colourway is pinned to a different article — the weight basis is taken from that one, and it has neither a full roll width nor a density (g/m²) filled in. there is nothing to convert length into weight with; fill both in on the pinned material's card"
      : "the slot is in kilograms, but neither the full roll width nor the article's density (g/m²) is filled in — there is nothing to convert length into weight with. fill both in on the material's card";
  }
  if (missing === 'width') {
    return pinned
      ? "the slot is in kilograms, and the colourway is pinned to a different article — the width is taken from that one, and it isn't filled in there. the BOM line may carry a width, but it describes a different fabric (the slot's article). fill in the width of the pinned article"
      : "the slot is in kilograms, but the full roll width is unknown (filled in neither on the BOM line nor on the article) — there is nothing to convert length into weight with. fill in the article's width";
  }
  return pinned
    ? "the slot is in kilograms, and the colourway is pinned to a different article — that one has no density (g/m²) filled in. there is nothing to convert length into weight with; fill the density in on the pinned material's card"
    : "the slot is in kilograms, but the article has no density (g/m²) filled in — there is nothing to convert length into weight with. fill the density in on the material's card";
}

/** Короткая подпись основы — рядом с килограммовым числом. */
export function weightBasisLabel(b: FabricWeightBasis): string {
  return `full width ${b.fullWidthCm} cm (with selvedge) × ${b.gsm} g/m²`;
}

/** Короткое имя нехватки — в пилюлю; полная причина (weightRefusalText) идёт в title/колаут. */
export function weightMissingShort(missing: WeightBasisMissing): string {
  if (missing === 'both') return 'kg: no width and no density';
  if (missing === 'width') return 'kg: no roll width';
  return 'kg: no article density';
}

// Полная фраза честности — там, где килограммовое число применяется. Ширина названа ПОЛНОЙ с
// оговоркой про кромку вслух: это единственное место расчёта, где берётся не раскройная ширина,
// и без оговорки она читается как ошибка. ИСТОЧНИК каждой величины назван честно: плотность —
// всегда артикула, а ширина — строки BOM, когда та её переопределяет (fullRollWidthOf);
// «ошибка ширины артикула» отправила бы оператора проверять не то поле.
//
// КРОМКА ВХОДИТ В ВЕС РОВНО ОДИН РАЗ, И ПРОЦЕНТ РАСКРОЯ ЕЁ НЕ ДОБАВЛЯЕТ — фраза стоит в тексте,
// потому что противоположное утверждение уже уехало на бету (тексты «по выкройкам» называли
// кромку среди покрываемого процентом). Арифметика: netto-длина = площадь ÷ РАСКРОЙНАЯ ширина
// (рулон − 2×кромка) — купив 1 м рулона 150 см при раскройной 144, получаешь 15000 см² полотна,
// из которых 14400 идут в дело: 600 см² кромки уже куплены и уже сидят в netto-длине, учтённые
// самим делением. kg = netto-длина × ПОЛНАЯ ширина × плотность — масса покупаемого полотна
// вместе с кромкой, один раз. Процент раскроя слота покрывает межлекальные выпады и концевые
// потери настила — кромку НЕТ: заложить её туда значит посчитать дважды. Усадку и обход пороков
// он тоже НЕ покрывает: за них платит коэффициент раскроя артикула, отдельным множителем (0303).
export function weightBasisNote(b: FabricWeightBasis): string {
  return `kilograms are computed through length: metres × full roll width ${b.fullWidthCm} cm × density ${b.gsm} g/m² ÷ 100000. the width is the full one, selvedge included: it is bought and it weighs — and it enters here EXACTLY ONCE: the net length comes from dividing the area by the cutting width (roll − 2×selvedge), the selvedge is accounted for by that division, and the slot's cutting percent does NOT add it again (that percent covers the waste between pieces and the lay ends; shrinkage and faults are paid by the article's coefficient). the density is always the article's; the width is the BOM line's when that line overrides it, otherwise the article's (when the colourway is pinned to a different article, both come from that one). an error in either enters the weight linearly and is invisible in every single number`;
}
