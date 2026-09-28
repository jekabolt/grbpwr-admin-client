// ВРЕМЕННЫЕ ПОЛЯ ПРОВОДА — до регена клиента (задача B3). Снимается в S1b: там эти типы заменяются
// сгенерированными (`common_TechCardBomLabelPart`, `common_FiberLabelTranslation`), а файл удаляется.
//
// Почему шим, а не ожидание регена: экран и адаптер пишутся параллельно с бэком. Поля объявлены
// НЕОБЯЗАТЕЛЬНЫМИ — провод без них (бэк до B1/B2) читается как «части нет / переводов нет», то есть
// честно даёт дыры, а не падает. После регена сгенерированный тип станет пересечением без конфликта:
// там `translations: … | undefined`, здесь `translations?: …`.
import type { common_Fiber, common_TechCardBomItem } from 'api/proto-http/admin';

/** `common.FiberLabelTranslation` (dict.proto, B2): имя волокна на одном языке ленты. */
export type WireFiberLabelTranslation = {
  labelLang: string | undefined;
  name: string | undefined;
};

/** `common.Fiber` + поля B2: переводы на 10 языков ленты и флаг «животное не-текстильное». */
export type WireFiber = common_Fiber & {
  translations?: WireFiberLabelTranslation[];
  animalNonTextile?: boolean;
};

/**
 * `common.TechCardBomItem` + поле B1: часть этикетки строкой энума
 * (`TECH_CARD_BOM_LABEL_PART_SHELL`, …). Нет на проводе / `…_UNSPECIFIED` = «авто» (§5.2).
 */
export type WireBomItem = common_TechCardBomItem & {
  labelPart?: string;
};
