import { normalizeDecimalInput } from 'utils/decimal';

// ЭТАЛОННЫЙ ПРИПУСК — the standard a раскладка's recorded allowance is judged against (Ф3.2).
// Two controls in this admin write it, and they are the same number with different scope:
//
//   workshop settings → default_seam_allowance_cm   (the shop's fallback)
//   tech card         → required_seam_allowance_cm  (this style's override)
//
// The band is the server's, verbatim (entity.Min/MaxSeamAllowanceCm, repeated by the named CHECKs
// chk_workshop_settings_seam_allowance and chk_tc_required_seam_allowance in migration 0277). It is
// mirrored here so a mistyped number comes back as a sentence in the operator's own screen instead
// of as a bare constraint refusal from the driver.
export const SEAM_ALLOWANCE_MIN_CM = 0;
export const SEAM_ALLOWANCE_MAX_CM = 10;

// THE FLOOR IS ZERO AND THAT IS THE POINT. Unlike the cutting-table length — where 0 is nonsense and
// the server rejects it — a 0 cm required allowance is a REAL setting: «наши выкройки несут линию
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
    return 'припуск задаётся числом в сантиметрах — например 1 или 0.5; чтобы снять эталон, очистите поле';
  }
  // The column is DECIMAL(6,2): a third digit would be dropped on the way in, silently changing the
  // standard everything downstream is compared against.
  const decimals = v.includes('.') ? v.split('.')[1].length : 0;
  if (decimals > 2) {
    return 'не больше двух знаков после запятой — колонка хранит сотые, остальное потерялось бы молча';
  }
  if (n < SEAM_ALLOWANCE_MIN_CM) {
    return 'припуск не бывает отрицательным: 0 и больше; чтобы записать «эталон не задан», очистите поле, а не ставьте минус';
  }
  if (n > SEAM_ALLOWANCE_MAX_CM) {
    return `значение в САНТИМЕТРАХ, а самый широкий реальный припуск — подгиб низа 4-5 см; потолок ${SEAM_ALLOWANCE_MAX_CM}. Похоже на миллиметры или лишний ноль`;
  }
  return null;
}
