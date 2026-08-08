import { PrintDegradedNotice } from 'components/managers/print/degraded-notice';
import { buildPrintScope, parsePrintQuery } from 'components/managers/print/scope';
import { useProductionRun } from 'components/managers/production-runs/components/useProductionRuns';
import {
  depStatus,
  usePrintReady,
  type PrintDep,
} from 'components/managers/print/use-print-ready';
import { useTechCardPrint } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TechPackDocument } from './components/tech-pack-document';
import { usePackagingRecipe, useStyleAssembly } from './components/useAssemblyPacking';

// This page renders OUTSIDE the app Layout (see ProtectedBare in index.tsx), so the tech
// pack is plain top-level content in normal flow. Printing then needs no isolation tricks
// (no portal / absolute / #root hiding — those print blank in Safari): we just hide the
// toolbar and let the document paginate. The doc's own max-width/padding is dropped in
// print so it fills the @page content box.
// @page (размер, поля и margin boxes колонтитула) объявлен ОДИН раз — в print/page-furniture.tsx,
// который рендерит сам документ. Два объявления @page в одном документе разрешались бы порядком
// подключения, а не смыслом.
const PRINT_CSS = `
@media print {
  html, body { background: #fff !important; }
  .techpack-toolbar { display: none !important; }
  .techpack-doc { border: 0 !important; box-shadow: none !important; }
  .techpack-doc > * { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export function TechCardPrint() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  // Скоуп печати приезжает query-параметрами: ?run=&colorway=&sizes=&profile=&booklets=&release=.
  // Без них печать неотличима от прежней — это осознанное свойство, а не переходный период:
  // внутренний тех-пак обо всём сразу остаётся валидным документом.
  const [searchParams] = useSearchParams();
  const query = useMemo(() => parsePrintQuery(searchParams), [searchParams.toString()]);
  // useTechCardPrint, not useTechCard: печать also needs the response-level pattern_viewer_token
  // (the per-scope QR codes of the patterns section), which the editor's hook deliberately drops.
  const { data: printData, isLoading, isError } = useTechCardPrint(numId);
  const techCard = printData?.techCard;
  // #71 root cause: the on-garment assembly bill (labels/tags) and the packaging recipe each
  // live behind their own per-style RPC — GetTechCard alone (above) never returns them, so the
  // printed pack had nothing to render for either section no matter what TechPackDocument did
  // with the data. Fetch both here, alongside the tech card, and hand them down.
  const {
    data: assemblyData,
    isLoading: assemblyLoading,
    isError: assemblyError,
  } = useStyleAssembly(numId ?? 0);
  const {
    data: packagingRecipeData,
    isLoading: recipeLoading,
    isError: recipeError,
  } = usePackagingRecipe();

  // Прогон — только когда он запрошен. Скоуп на партию даёт документу тираж, размеры и
  // (в Ф5) ревизию, по которой партия кроится.
  const {
    data: runData,
    isLoading: runLoading,
    isError: runError,
  } = useProductionRun(query.runId, query.runId > 0);

  const scope = useMemo(
    () =>
      techCard
        ? buildPrintScope({
            techCard,
            query,
            run: runData?.run,
            runPackToken: runData?.runPackToken,
          })
        : undefined,
    [techCard, query, runData?.run, runData?.runPackToken],
  );

  // Статусы запросов, которые документ делает САМ (размерная таблица, материалы, релизы, модели,
  // медиа, словарь ухода). Гейт печати обязан их ждать — именно они рисуют прочерки вместо мерок
  // и пустую колонку цвета при раннем клике. Документ отдаёт их наверх одним колбэком; setState
  // из useState стабилен, поэтому цикла рендеров это не создаёт.
  const [docDeps, setDocDeps] = useState<PrintDep[]>([]);

  const { ready, degraded } = usePrintReady([
    { label: 'тех-карта', status: depStatus(isLoading, isError) },
    { label: 'сборка на изделии', status: depStatus(assemblyLoading, assemblyError) },
    { label: 'рецепт упаковки', status: depStatus(recipeLoading, recipeError) },
    // Прогон попадает в гейт только когда он вообще запрошен: незапрошенный запрос вечно
    // «не загружается», и без этого условия кнопка ждала бы то, чего никто не звал.
    ...(query.runId > 0
      ? [{ label: 'прогон', status: depStatus(runLoading, runError) }]
      : []),
    ...docDeps,
  ]);

  return (
    <div className='mx-auto flex max-w-[230mm] flex-col gap-4 p-4 pb-10'>
      <style>{PRINT_CSS}</style>

      <div className='techpack-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='secondary' size='lg'>
            <Link to={id ? `/tech-cards/${id}` : ROUTES.techCards}>← back</Link>
          </Button>
          <Text variant='uppercase' size='large'>
            tech pack — pdf
          </Text>
        </div>
        <div className='flex items-center gap-3'>
          <Text variant='inactive' size='small'>
            choose “save as PDF” as the destination · колонтитул и номера страниц печатает только
            Chrome
          </Text>
          <Button
            variant='main'
            size='lg'
            className='uppercase'
            // Не «пришла ли карта», а «готов ли весь лист»: данные, шрифты и картинки. По
            // таймауту гейт отпускает кнопку сам и называет недостающее плашкой на бумаге.
            disabled={!techCard || !ready}
            onClick={() => window.print()}
          >
            save as pdf
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading tech card…
          </Text>
        </div>
      ) : isError || !techCard ? (
        <div className='flex flex-col items-center gap-4 py-20'>
          <Text variant='inactive' className='uppercase'>
            tech card not found
          </Text>
          <Button asChild variant='main' size='lg' className='uppercase'>
            <Link to={ROUTES.techCards}>← back to tech cards</Link>
          </Button>
        </div>
      ) : (
        <div className='techpack-doc border border-textInactiveColor shadow-sm'>
          {/* Обёртка не косметика: PRINT_CSS снимает padding с ПРЯМЫХ детей .techpack-doc, и
              плашка без неё напечаталась бы текстом впритык к рамке. */}
          <div className='px-8 pt-6'>
            <PrintDegradedNotice items={degraded} />
          </div>
          {scope?.colorwayMissing || scope?.runMissing ? (
            <div className='px-8'>
              <p className='mb-4 break-inside-avoid border-2 border-black px-2 py-1.5 text-control font-semibold uppercase'>
                {scope.colorwayMissing
                  ? `колорвей #${query.colorwayId} не найден на этой карте — документ напечатан по всем колорвеям`
                  : `прогон #${query.runId} не получен — документ напечатан без привязки к партии`}
              </p>
            </div>
          ) : null}
          <TechPackDocument
            techCard={techCard}
            scope={scope}
            assembly={assemblyData?.items ?? []}
            packagingRecipe={packagingRecipeData?.items ?? []}
            patternViewerToken={printData?.patternViewerToken ?? ''}
            onDataStatus={setDocDeps}
          />
        </div>
      )}
    </div>
  );
}
