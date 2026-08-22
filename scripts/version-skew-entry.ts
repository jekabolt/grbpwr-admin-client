// Точка входа пробы «отказ, противоречащий экрану»: НАСТОЯЩИЙ роутер серверных ошибок и
// НАСТОЯЩИЙ классификатор карточки, не их копии.
//
// Здесь не переписано ничего из проверяемого. `applyServerFieldErrors` — тот самый, что стоит в
// catch тех-карты; `contradictsScreen` — тот самый предикат, который карточка ему передаёт;
// `transportRefusal` — тот самый распознаватель строгого маршалера. Копия любого из трёх
// доказывала бы только то, что копия согласна сама с собой.
//
// Рукоятка `getValue` в пробе своя — и это ровно её роль на карточке: там подставляется
// `form.getValues`. Предикат по контракту берёт ЧИТАТЕЛЯ значения, а не форму.
import { contradictsScreen } from 'components/managers/tech-card/components/operations-presence';
import {
  applyServerFieldErrors,
  extractFieldViolations,
  transportRefusal,
  violationReason,
} from 'utils/field-errors';

export {
  applyServerFieldErrors,
  contradictsScreen,
  extractFieldViolations,
  transportRefusal,
  violationReason,
};
