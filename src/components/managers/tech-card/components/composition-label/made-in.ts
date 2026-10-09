// MADE IN — СТРАНА КОЛОРВЕЯ, ПОСТАВЛЕННАЯ ПРЯМО НА СОСТАВНИКЕ (R-03, D-02, MAJOR FIX M-01).
//
// Страна — факт колорвея (`product.country_code`, её же читает доставка), а не составника: здесь
// её не хранят, а ПИШУТ в колорвей. UpdateColorway поднимает ТОТ ЖЕ `tech_card.lock_version`, под
// которым сохраняется тело карточки, поэтому запись не бывает немедленной и самостоятельной:
// следующий автосейв получил бы 409 «modified concurrently». Она ставится в ОДНО сохранение
// карточки — ровно как lab-dip и рецепт (`colorway-recipe.tsx`): тело карточки первым, затем по
// записи на колорвей, и версия каждой читается В МОМЕНТ КОММИТА (`readColorwayVersion`), а не при
// рендере — к этому месту тело карточки её уже сдвинуло.
//
// Маска ровно `country_code`: сервер (I-06) пишет страну одну и не трогает мерчендайзинг.
import { adminService } from 'api/api';
import type { UpdateColorwayRequest } from 'api/proto-http/admin';
import { readColorwayVersion } from '../colorway-version';
import { COMMIT_ORDER, type StagedChange } from '../useTechCardStaging';

export const COUNTRY_MASK = 'country_code';

export const countryStagingKey = (colorwayId: number) => `colourway:${colorwayId}:country`;

/** Запрос одной страны: всё, кроме id, версии, маски и кода, — пусто (маска их не трогает). */
export function countryRequest(
  colorwayId: number,
  countryCode: string,
  expectedColorwayVersion: number,
): UpdateColorwayRequest {
  return {
    colorwayId,
    expectedColorwayVersion,
    updateMask: COUNTRY_MASK,
    countryCode,
    merchandising: undefined,
    development: undefined,
    mediaIds: undefined,
    tags: undefined,
    prices: undefined,
    thumbnailMediaId: undefined,
    secondaryThumbnailMediaId: undefined,
    costPrice: undefined,
    translations: undefined,
  };
}

/** Выбор оператора, ещё не записанный: колорвей → код страны словаря. */
export type CountryPicks = ReadonlyMap<number, string>;

export type CountryStagingDeps = {
  stage: (change: StagedChange) => void;
  unstage: (key: string) => void;
};

/**
 * По записи в очередь на каждый выбранный колорвей; снятые выборы — из очереди вон. `lockVersion` —
 * только запасной вариант на случай, если чтение не нашло колорвей: настоящая версия читается в
 * `commit`. `onCommitted` — инвалидация чтений; `settle` — снять выбор, записанный успешно.
 */
export function stageCountryWrites({
  staging,
  picks,
  previous,
  techCardId,
  lockVersion,
  titleOf,
  countryNameOf,
  onCommitted,
  settle,
}: {
  staging: CountryStagingDeps;
  picks: CountryPicks;
  /** Колорвеи, стоявшие в очереди прошлым вызовом: чьего выбора больше нет — снимаются. */
  previous: readonly number[];
  techCardId: number;
  lockVersion: number;
  titleOf: (colorwayId: number) => string;
  countryNameOf: (code: string) => string;
  onCommitted?: (colorwayId: number) => Promise<unknown> | void;
  settle: (colorwayId: number) => void;
}): number[] {
  for (const id of previous) if (!picks.has(id)) staging.unstage(countryStagingKey(id));
  const staged: number[] = [];
  for (const [colorwayId, code] of picks) {
    staging.stage({
      key: countryStagingKey(colorwayId),
      label: `colourway ${titleOf(colorwayId)} · made in ${countryNameOf(code)}`,
      order: COMMIT_ORDER.colorwayCountry,
      commit: async () => {
        const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);
        await adminService.UpdateColorway(countryRequest(colorwayId, code, expected));
        await onCommitted?.(colorwayId);
      },
      settle: () => settle(colorwayId),
      snapshot: { colorwayId, code },
    });
    staged.push(colorwayId);
  }
  return staged;
}
