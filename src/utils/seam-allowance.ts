import { normalizeDecimalInput } from 'utils/decimal';

// ЭТАЛОННЫЙ ПРИПУСК — the standard a раскладка's recorded allowance is judged against (Ф3.2).
// Two controls in this admin write it, and they are the same number with different scope:
//
//   workshop settings → default_seam_allowance_mm   (the shop's fallback)
//   tech card         → required_seam_allowance_mm  (this style's override)
//
// MILLIMETRES since 0290 — one unit for the whole allowance chain (shop → card → sewing step), so
// nothing converts between a standard and the step that must honour it.
//
// The band is the server's, verbatim (entity.Min/MaxSeamAllowanceMm, repeated by the named CHECKs
// chk_workshop_settings_seam_allowance_mm and chk_tc_required_seam_allowance_mm). It is
// mirrored here so a mistyped number comes back as a sentence in the operator's own screen instead
// of as a bare constraint refusal from the driver.
export const SEAM_ALLOWANCE_MIN_MM = 0;
export const SEAM_ALLOWANCE_MAX_MM = 100;
// Below this a SET value is almost certainly centimetres. Zero is exempt — it is a real setting.
export const SEAM_ALLOWANCE_SUSPICIOUSLY_SMALL_MM = 1;

// THE FLOOR IS ZERO AND THAT IS THE POINT. Unlike the cutting-table length — where 0 is nonsense and
// the server rejects it — a 0 mm required allowance is a REAL setting: «наши выкройки несут линию
// кроя, офсет не нужен». «Не настроено» is expressed by an EMPTY field, never by 0, and the two must
// stay distinguishable all the way to the column: blank omits the field (NULL), '0' sends a zero.
//
// Returns a sentence to show the operator, or null when the value is acceptable. A blank value is
// acceptable everywhere: clearing the standard is legal, only a value being SET has to be plausible.
export function validateSeamAllowanceStandard(raw?: string): string | null {
  const v = normalizeDecimalInput(raw);
  if (!v) return null;

  const n = Number(v);
  if (!Number.isFinite(n)) {
    return 'припуск задаётся числом в миллиметрах — например 10 или 7; чтобы снять эталон, очистите поле';
  }
  // The column is DECIMAL(6,1): a second digit would be dropped on the way in, silently changing the
  // standard everything downstream is compared against.
  const decimals = v.includes('.') ? v.split('.')[1].length : 0;
  if (decimals > 1) {
    return 'не больше одного знака после запятой — колонка хранит десятые миллиметра, остальное потерялось бы молча';
  }
  if (n < SEAM_ALLOWANCE_MIN_MM) {
    return 'припуск не бывает отрицательным: 0 и больше; чтобы записать «эталон не задан», очистите поле, а не ставьте минус';
  }
  if (n > SEAM_ALLOWANCE_MAX_MM) {
    return `значение в МИЛЛИМЕТРАХ, а самый широкий реальный припуск — подгиб низа 40-50 мм; потолок ${SEAM_ALLOWANCE_MAX_MM}. Похоже на лишний ноль`;
  }
  // Ловит ОБРАТНУЮ ошибку: «1» от человека, думающего в сантиметрах, — это десятая доля того, что он
  // имел в виду, и число совершенно правдоподобное. Ноль исключён: он настройка, а не опечатка.
  if (n > 0 && n < SEAM_ALLOWANCE_SUSPICIOUSLY_SMALL_MM) {
    return 'значение в МИЛЛИМЕТРАХ — меньше 1 мм похоже на сантиметры в миллиметровом поле (10, а не 1); поставьте 0, если выкройки действительно несут линию кроя';
  }
  return null;
}
