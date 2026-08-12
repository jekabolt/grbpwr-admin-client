import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardColorwayUsage } from 'api/proto-http/admin';
import { warehouseKeys } from 'components/managers/materials/components/useWarehouse';
import { productionRunKeys } from 'components/managers/production-runs/components/useProductionRuns';
import { stockChangeHistoryKeys } from 'components/managers/product/components/stock/useStockChangeHistory';
import { tasksKeys } from 'components/managers/tasks/hooks/useTasks';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { waitlistKeys } from 'components/managers/waitlist/components/useWaitlist';
import { sampleKeys } from './useSamples';
import { styleReadViewKeys } from './useStyleReadViews';

// Colourway-owned recipe write (H1/§2.3): UpdateColorwayRecipe FULL-REPLACES a colourway's usages,
// keyed by bom_line_key, under the shared tech_card.lock_version. Invalidate the tech-card detail so
// the read model (colorways[].usages) refreshes. A stale expected_colorway_version → Aborted (409).
export function useUpdateColorwayRecipe(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      colorwayId,
      expectedColorwayVersion,
      usages,
    }: {
      colorwayId: number;
      expectedColorwayVersion: number;
      usages: common_TechCardColorwayUsage[];
    }) => adminService.UpdateColorwayRecipe({ colorwayId, expectedColorwayVersion, usages }),
    onSuccess: (_data, variables) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
        qc.invalidateQueries({
          queryKey: styleReadViewKeys.costEstimate(techCardId, variables.colorwayId),
        }),
        // Run detail carries colourway cost actuals; material plans are nested beneath the same
        // productionRuns root key, so one prefix invalidation refreshes both projections.
        qc.invalidateQueries({ queryKey: productionRunKeys.all }),
      ]),
  });
}

export function recipeSaveErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409)
    return 'This style changed since you loaded it — reload and re-apply the recipe.';
  return e instanceof Error ? e.message : 'Failed to save recipe';
}

// Minimal inline colourway creation (§35): normally a colourway (product) is created from the
// product manager, which forces a ping-pong away from the tech card just to add a colour before
// its recipe can be edited. This spins up a bare DRAFT — colour identity only, everything else
// (media/prices/tags/translations) is filled in later from the product manager — so the recipe
// editor list below refreshes with the new colourway immediately. Field shape mirrors
// buildColorwayWrite (product/components/utils): every CreateColorwayRequest key must be present
// (even if undefined) to satisfy the generated type; colorCode is the sole required value.
export function useCreateColorway(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (colorCode: string) =>
      adminService.CreateColorway({
        styleId: techCardId,
        merchandising: {
          preorder: '0001-01-01T00:00:00Z',
          colorHexOverride: undefined,
          salePercentage: undefined,
          minTier: 0,
          colorCode,
          dictionaryColor: undefined,
          countryCode: undefined,
        },
        development: undefined,
        thumbnailMediaId: undefined,
        secondaryThumbnailMediaId: undefined,
        mediaIds: undefined,
        tags: undefined,
        prices: undefined,
        translations: undefined,
        costPrice: undefined,
        countryCode: undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
  });
}

export function createColorwayErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 400 || status === 409)
    return 'Could not create the colourway — it may already exist for this colour.';
  return e instanceof Error ? e.message : 'Failed to create colourway';
}

// ─── УДАЛЕНИЕ КОЛОРВЕЯ = УДАЛЕНИЕ ПРОДУКТА ───────────────────────────────────────────────────────
//
// Узкая дырка в правиле «архивируем, не удаляем»: колорвей, который НИКОГДА не продавался и НИКОГДА
// не производился, — это опечатка, а не запись. Границу держит сервер (не продан И не в партии,
// включая ЧЕРНОВУЮ, И не в настиле И без остатка); клиент её не повторяет и не угадывает — он
// СПРАШИВАЕТ. Отсюда два хука вместо одного.
//
// expectedVersion уезжает, но НЕ проверяется — так же, как на ArchiveColorwayByID. Версия колорвея
// это tech_card.lock_version, и ни один факт, решающий удаляемость (продажа, строка партии, настил,
// остаток), её не двигает: проверка не закрыла бы ни одной настоящей гонки, зато отказывала бы на
// правке рецепта СОСЕДНЕГО колорвея той же карточки. Гонку закрывает пере-проверка фактов ВНУТРИ
// транзакции удаления — поэтому здесь нет пляски readColorwayVersion, которую делают записи рецепта.

/**
 * СУХОЙ ПРОГОН: тот же RPC с dry_run = true. Ничего не меняет — это ЧТЕНИЕ вердикта, и ровно его
 * печатает диалог подтверждения вместо того, чтобы предлагать оператору поверить глаголу.
 *
 * useMutation, а не useQuery, и это выбор, а не привычка. Вердикт НЕЛЬЗЯ кэшировать: между двумя
 * открытиями диалога кто-то мог запланировать партию, и показанный из кэша «удаляемо» был бы враньём
 * ровно в том месте, где врать дороже всего. Мутация ходит на сервер каждое открытие. Вдобавок у
 * useQuery с `enabled: false` в react-query v5 `isPending` висит true вечно — диалог, который
 * открывается по событию, на этом рисовал бы вечный спиннер.
 */
export function useColorwayDeletionPreview() {
  return useMutation({
    mutationFn: ({
      colorwayId,
      expectedVersion,
    }: {
      colorwayId: number;
      expectedVersion: number;
    }) => adminService.DeleteColorwayByID({ colorwayId, expectedVersion, dryRun: true }),
  });
}

/**
 * НАСТОЯЩЕЕ УДАЛЕНИЕ. Сервер пере-проверяет тот же предикат внутри транзакции, поэтому «сухой
 * прогон сказал да» — не гарантия: между двумя вызовами мир мог измениться, и тогда прилетит
 * FailedPrecondition с одним field violation НА КАЖДЫЙ блокер. Разбирает их вызывающий (диалог
 * показывает свежие блокеры), здесь мы только чистим кэш.
 *
 * ЧТО ИНВАЛИДИРУЕМ И ПОЧЕМУ — по словарю самого сервера (cascade / orphans), а не «на всякий
 * случай»: каждый ключ ниже отвечает конкретному коду вердикта.
 */
export function useDeleteColorway(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      colorwayId,
      expectedVersion,
    }: {
      colorwayId: number;
      expectedVersion: number;
    }) => adminService.DeleteColorwayByID({ colorwayId, expectedVersion, dryRun: false }),
    onSuccess: () =>
      Promise.all([
        // Сама карточка: из неё исчезает колорвей целиком — плитка, его строки рецепта
        // (recipe_usage/size_consumption/piece_material), и раскладки в techCard.markers теряют
        // ссылку на него (orphan_marker: замер остаётся, артикул из него исчезает).
        qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
        // Списки и пайплайн карточек несут на строке сведения о колорвеях стиля.
        qc.invalidateQueries({ queryKey: techCardKeys.lists() }),
        qc.invalidateQueries({ queryKey: techCardKeys.pipeline() }),
        // Матрица костинга — проекция ПО КОЛОРВЕЯМ, у неё пропадает целая колонка. Инвалидируем
        // префикс всех оценок карточки, а не одну: соседние считаются на общих данных стиля.
        qc.invalidateQueries({ queryKey: styleReadViewKeys.costEstimates(techCardId) }),
        // Партии удаляемый колорвей не держат по определению (production_run — блокер), но планы
        // материалов и факты прогонов лежат под общим корнем и адресуют продукты.
        qc.invalidateQueries({ queryKey: productionRunKeys.all }),
        // orphan_sample: образцы ПЕРЕЖИВУТ удаление и потеряют колорвей.
        qc.invalidateQueries({ queryKey: sampleKeys.all }),
        // orphan_task: задачи тоже переживут и потеряют ссылку.
        qc.invalidateQueries({ queryKey: tasksKeys.all }),
        // orphan_material_movement: движения по складу остаются без продукта.
        qc.invalidateQueries({ queryKey: warehouseKeys.all }),
        // Каскад stock_history: история остатков продукта умирает ВМЕСТЕ с ним. Ключ адресован
        // productId, а productId колорвея — это и есть colorwayId (ROUTES.singleProduct открывают
        // им же), поэтому чистим весь корень: точечный ключ несёт ещё и фильтры.
        qc.invalidateQueries({ queryKey: stockChangeHistoryKeys.all }),
        // Каскад waitlist: подписки на этот продукт уходят с ним.
        qc.invalidateQueries({ queryKey: waitlistKeys.all }),
      ]),
  });
}
