import { PrintDegradedNotice } from 'components/managers/print/degraded-notice';
import {
  depStatus,
  usePrintReady,
  type PrintDep,
} from 'components/managers/print/use-print-ready';
import { parsePrintQuery } from 'components/managers/print/scope';
import { ROUTES } from 'constants/routes';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { RunPackDocument } from './components/run-pack-document';
import { runDetailPath } from './components/options';
import { useProductionRun, useRunCutPlan } from './components/useProductionRuns';

// Страница печати НАРЯДА НА ПАРТИЮ. Механика — дословно тех-паковская (tech-card/print-page.tsx):
// страница рендерится ВНЕ Layout (ProtectedBare в index.tsx), поэтому документ лежит в обычном
// потоке и печатать его можно без трюков изоляции — никаких порталов, absolute и скрытия #root,
// которые в Safari печатаются пустой страницей. В печати прячется только тулбар, а собственные
// max-width/padding документа снимаются, чтобы он занял контентную коробку @page.
// @page (размер, поля и margin boxes колонтитула) объявлен ОДИН раз — в print/page-furniture.tsx,
// который рендерит сам документ.
const PRINT_CSS = `
@media print {
  html, body { background: #fff !important; }
  .runpack-toolbar { display: none !important; }
  .runpack-doc { border: 0 !important; box-shadow: none !important; }
  .runpack-doc > * { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export function RunPackPrint() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : 0;
  const runId = Number.isFinite(numId) ? numId : 0;
  // Наряду из скоупа нужен колорвей: партия на нескольких цветах уезжает в цех по одному цвету.
  const [searchParams] = useSearchParams();
  const printQuery = useMemo(() => parsePrintQuery(searchParams), [searchParams.toString()]);

  const { data: runData, isLoading, isError } = useProductionRun(runId, runId > 0);
  const run = runData?.run;
  // Кат-лист тянется ЗДЕСЬ, а не внутри документа: его ответ несёт ревизию наряда (lock_version
  // прогона + generated_at), то есть отвечает на вопрос «по чему кроим», а не только «что кроим».
  // isError отдаётся документу отдельным флагом: «сервер отказал» и «кроить нечего» — разные
  // новости, и напечатать первую как вторую значило бы выдать пустой лист за полный.
  const {
    data: cutPlan,
    isError: cutPlanError,
    isLoading: cutPlanLoading,
  } = useRunCutPlan(runId, runId > 0);

  // Статусы запросов, которые документ делает САМ (настилы, материальный план, тех-карта, релизы).
  // Гейт печати обязан их ждать: без них лист печатается с пустыми таблицами, неотличимыми от
  // «настилов нет». Отказ при этом кнопку НЕ блокирует — см. правило 1 в use-print-ready.ts.
  const [docDeps, setDocDeps] = useState<PrintDep[]>([]);

  const { ready, degraded } = usePrintReady([
    { label: 'прогон', status: depStatus(isLoading, isError) },
    // Кат-лист сознательно НЕ обязателен: наряд остаётся документом партии и без него.
    { label: 'кат-лист', status: depStatus(cutPlanLoading, cutPlanError) },
    ...docDeps,
  ]);

  return (
    <div className='mx-auto flex max-w-[230mm] flex-col gap-4 p-4 pb-10'>
      <style>{PRINT_CSS}</style>

      <div className='runpack-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='secondary' size='lg'>
            <Link to={runId > 0 ? runDetailPath(runId) : ROUTES.productionRuns}>← back</Link>
          </Button>
          <Text variant='uppercase' size='large'>
            наряд на партию — pdf
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
            // Печатать разрешено и без кат-листа: наряд остаётся документом партии (линии,
            // настилы, материалы, короба), а отсутствие кат-листа он называет вслух. Блокировать
            // кнопку значило бы выдать не приехавший RPC за отсутствие наряда.
            disabled={!run || !ready}
            onClick={() => window.print()}
          >
            save as pdf
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading production run…
          </Text>
        </div>
      ) : isError || !run ? (
        <div className='flex flex-col items-center gap-4 py-20'>
          <Text variant='inactive' className='uppercase'>
            production run not found
          </Text>
          <Button asChild variant='main' size='lg' className='uppercase'>
            <Link to={ROUTES.productionRuns}>← back to production runs</Link>
          </Button>
        </div>
      ) : (
        <div className='runpack-doc border border-textInactiveColor shadow-sm'>
          {/* Обёртка не косметика: PRINT_CSS снимает padding с ПРЯМЫХ детей .runpack-doc. */}
          <div className='px-8 pt-6'>
            <PrintDegradedNotice items={degraded} />
          </div>
          {/* Данные отказавшего запроса НЕ передаются: React Query держит последний успешный ответ
              и после провалившегося перезапроса, а документ штампуется версией прогона, прочитанной
              ОТДЕЛЬНЫМ запросом. Отдай он удержанный кат-лист — на бумаге оказались бы старые
              количества под свежей ревизией, то есть подпись под чужими цифрами. */}
          <RunPackDocument
            run={run}
            cutPlan={cutPlanError ? undefined : cutPlan}
            cutPlanUnavailable={cutPlanError}
            // Токен публичного наряда живёт на ОТВЕТЕ чтения прогона, а не на самом прогоне
            // (common.ProductionRun ложится в сохраняемые снапшоты, а токену доступа в снапшоте не
            // место). Пусто = сервис наряда не подключён на этом контуре — документ печатается без
            // QR, и это единственное последствие.
            runPackToken={runData?.runPackToken}
            onDataStatus={setDocDeps}
            printQuery={printQuery}
          />
        </div>
      )}
    </div>
  );
}
