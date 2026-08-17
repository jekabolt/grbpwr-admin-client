import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { LoginBlock } from 'components/login/login';
import ProtectedRoute from 'components/login/protectedRoute';
import { Archive } from 'components/managers/archive';
import { Archives } from 'components/managers/archives';
import { CustomerPage } from 'components/managers/customer-support';
import { Shipping } from 'components/managers/shipping';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { ContextProvider } from 'context';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { lazy, StrictMode, Suspense, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';
import { Layout } from 'ui/layout';
import './global.css';

// A deploy replaces every hashed chunk, so a tab that was already open asks for a file that is no
// longer there. vercel.json rewrites anything unmatched to /index.html, so the 404 comes back as
// HTML and the browser refuses it: "'text/html' is not a valid JavaScript MIME type". Nothing is
// broken — the tab is stale, and it only surfaces on a route that had not been visited yet, which
// is why it reads as "this page is broken" rather than "reload me".
//
// The error boundary could not fix it either: resetErrorBoundary re-renders and asks for the SAME
// dead URL, so "Try again" fails identically every time.
const RELOAD_STAMP = 'chunk-reload-at';

// Reload once to pick up the new manifest. A timestamp rather than a flag: a tab left open across
// two separate deploys deserves its one reload each time, but a chunk error that repeats within
// seconds of a reload is a real failure and belongs in the boundary, not in a reload loop.
// The constraint mirrors React.lazy's own (ComponentType<any>) rather than narrowing it: anything
// tighter is not assignable to what lazy() accepts, and narrowing here would only re-type the 44
// routes this wraps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRoute<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      // Storage is behind try/catch on purpose: this is the recovery path, and a sessionStorage
      // that throws (locked-down privacy mode) must not be what turns a stale chunk into a crash.
      // Unreadable storage means "no reload recorded", so the one reload still happens.
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_STAMP) ?? 0);
      } catch {
        /* storage unavailable */
      }
      if (isStaleChunkError(err) && Date.now() - last > 10_000) {
        try {
          sessionStorage.setItem(RELOAD_STAMP, String(Date.now()));
        } catch {
          /* storage unavailable — the reload below still happens, just unguarded */
        }
        window.location.reload();
        // Never resolves — the reload takes over before React can render anything from it.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }),
  );
}

// The same failure is worded differently by every engine, and none of them use an error code.
function isStaleChunkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|MIME type|module script failed|Loading chunk|error loading/i.test(
    msg,
  );
}

// Lazy load routes for code splitting
const Hero = lazyRoute(() =>
  import('components/managers/hero/components').then((m) => ({ default: m.Hero })),
);
const EmailManager = lazyRoute(() =>
  import('components/managers/email/email-manager').then((m) => ({ default: m.EmailManager })),
);
const CampaignBuilder = lazyRoute(() =>
  import('components/managers/email/components').then((m) => ({ default: m.CampaignBuilder })),
);
const SegmentEditor = lazyRoute(() =>
  import('components/managers/email/components/segment-builder/segment-editor').then((m) => ({
    default: m.SegmentEditor,
  })),
);
const MediaManager = lazyRoute(() =>
  import('components/managers/media').then((m) => ({ default: m.MediaManager })),
);
const OrderDetails = lazyRoute(() =>
  import('components/managers/order/page').then((m) => ({ default: m.OrderDetails })),
);
const OrdersCatalog = lazyRoute(() =>
  import('components/managers/orders-catalog/page').then((m) => ({ default: m.OrdersCatalog })),
);
const CustomOrders = lazyRoute(() =>
  import('components/managers/custom-orders').then((m) => ({ default: m.CustomOrders })),
);
const Analitic = lazyRoute(() =>
  import('components/managers/page/index').then((m) => ({ default: m.Analitic })),
);
const Product = lazyRoute(() =>
  import('components/managers/product/page').then((m) => ({ default: m.Product })),
);
const ProductsCatalog = lazyRoute(() => import('components/managers/products-catalog/page'));
const Waitlist = lazyRoute(() =>
  import('components/managers/waitlist/page').then((m) => ({ default: m.Waitlist })),
);
const Promo = lazyRoute(() =>
  import('components/managers/promo').then((m) => ({ default: m.Promo })),
);
const Settings = lazyRoute(() =>
  import('components/managers/settings').then((m) => ({ default: m.Settings })),
);
const Dictionaries = lazyRoute(() =>
  import('components/managers/dictionaries/page').then((m) => ({ default: m.Dictionaries })),
);
const Members = lazyRoute(() =>
  import('components/managers/membership/members/page').then((m) => ({ default: m.Members })),
);
const MemberDetails = lazyRoute(() =>
  import('components/managers/membership/member-details/page').then((m) => ({
    default: m.MemberDetails,
  })),
);
const TierConfig = lazyRoute(() =>
  import('components/managers/membership/tier-config/page').then((m) => ({
    default: m.TierConfig,
  })),
);
const HackerManager = lazyRoute(() =>
  import('components/managers/membership/hacker/page').then((m) => ({ default: m.HackerManager })),
);
const TierAudit = lazyRoute(() =>
  import('components/managers/membership/audit/page').then((m) => ({ default: m.TierAudit })),
);
const Models = lazyRoute(() =>
  import('components/managers/models').then((m) => ({ default: m.Models })),
);
const Model = lazyRoute(() =>
  import('components/managers/model/page').then((m) => ({ default: m.Model })),
);
const Fittings = lazyRoute(() =>
  import('components/managers/fittings').then((m) => ({ default: m.Fittings })),
);
const Fitting = lazyRoute(() =>
  import('components/managers/fitting/page').then((m) => ({ default: m.Fitting })),
);
const TechCards = lazyRoute(() =>
  import('components/managers/tech-cards').then((m) => ({ default: m.TechCards })),
);
const TechCard = lazyRoute(() =>
  import('components/managers/tech-card/page').then((m) => ({ default: m.TechCard })),
);
const TechCardPrint = lazyRoute(() =>
  import('components/managers/tech-card/print-page').then((m) => ({ default: m.TechCardPrint })),
);
const OrderInvoicePrint = lazyRoute(() =>
  import('components/managers/order/invoice-page').then((m) => ({ default: m.OrderInvoicePrint })),
);
const Materials = lazyRoute(() =>
  import('components/managers/materials').then((m) => ({ default: m.Materials })),
);
const WorkshopSettingsPage = lazyRoute(() =>
  import('components/managers/workshop/page').then((m) => ({ default: m.WorkshopSettingsPage })),
);
const ProductionRuns = lazyRoute(() =>
  import('components/managers/production-runs').then((m) => ({ default: m.ProductionRuns })),
);
const ProductionRunDetail = lazyRoute(() =>
  import('components/managers/production-runs/detail-page').then((m) => ({
    default: m.ProductionRunDetail,
  })),
);
const RunPackPrint = lazyRoute(() =>
  import('components/managers/production-runs/print-page').then((m) => ({
    default: m.RunPackPrint,
  })),
);
const Accounts = lazyRoute(() =>
  import('components/managers/accounts').then((m) => ({ default: m.Accounts })),
);
// Прямым путём, а НЕ через баррель `components/managers/accounts`: баррель тянет `page.tsx`,
// а с ним таблицу аккаунтов и модалки прав. Профиль открыт любому вошедшему, и его чанк не
// должен содержать управление чужими учётками даже мёртвым кодом.
const MyProfile = lazyRoute(() =>
  import('components/managers/accounts/profile-page').then((m) => ({ default: m.MyProfile })),
);
const FilesLibrary = lazyRoute(() => import('components/managers/files/page'));
const FileTopics = lazyRoute(() => import('components/managers/files/topics/topics-page'));
const FilesShared = lazyRoute(() => import('components/managers/files/shared/shared-page'));

const Tasks = lazyRoute(() =>
  import('components/managers/tasks').then((m) => ({ default: m.Tasks })),
);
const Opex = lazyRoute(() =>
  import('components/managers/opex/page').then((m) => ({ default: m.OpexPage })),
);
const AcctJournal = lazyRoute(() =>
  import('components/managers/accounting/journal/page').then((m) => ({
    default: m.AcctJournalPage,
  })),
);
const AcctAccounts = lazyRoute(() =>
  import('components/managers/accounting/accounts/page').then((m) => ({
    default: m.AcctAccountsPage,
  })),
);
const AcctReports = lazyRoute(() =>
  import('components/managers/accounting/reports/page').then((m) => ({
    default: m.AcctReportsPage,
  })),
);
const AcctBank = lazyRoute(() =>
  import('components/managers/accounting/bank/page').then((m) => ({
    default: m.AcctBankPage,
  })),
);
const AcctSubledgers = lazyRoute(() =>
  import('components/managers/accounting/subledgers/page').then((m) => ({
    default: m.AcctSubledgersPage,
  })),
);
const AcctPeriods = lazyRoute(() =>
  import('components/managers/accounting/periods/page').then((m) => ({
    default: m.AcctPeriodsPage,
  })),
);
const AcctEvents = lazyRoute(() =>
  import('components/managers/accounting/events/page').then((m) => ({
    default: m.AcctEventsPage,
  })),
);
const Employees = lazyRoute(() =>
  import('components/managers/employees').then((m) => ({ default: m.Employees })),
);
const TaskDetail = lazyRoute(() =>
  import('components/managers/tasks/task-detail/page').then((m) => ({ default: m.TaskDetail })),
);
const Fulfillment = lazyRoute(() =>
  import('components/managers/fulfillment').then((m) => ({ default: m.Fulfillment })),
);
const FulfillmentCardDetail = lazyRoute(() =>
  import('components/managers/fulfillment/card-detail/page').then((m) => ({
    default: m.FulfillmentCardDetail,
  })),
);
const PatternViewerPage = lazyRoute(() =>
  import('components/pattern-viewer/page').then((m) => ({ default: m.PatternViewerPage })),
);
const RunPackViewerPage = lazyRoute(() =>
  import('components/run-pack-viewer/page').then((m) => ({ default: m.RunPackViewerPage })),
);
const FileShareViewerPage = lazyRoute(() =>
  import('components/file-share-viewer/page').then((m) => ({ default: m.FileShareViewerPage })),
);
// Стенд печати: обе бумаги на синтетических данных, без бэкенда и без логина. Существует потому,
// что между «код компилируется» и «компонент выполняется» лежит целый класс ошибок — печать уже
// роняли TDZ-ошибкой, которую пропустили и tsc, и четыре прохода ревью, а поймал бы один рендер.
// Лениво и только в дев-сборке: в прод-бандл фикстура не попадает.
const PrintSmokePage = lazyRoute(() =>
  import('components/managers/print/print-smoke').then((m) => ({ default: m.PrintSmokePage })),
);

// Configure QueryClient with best practices
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Error fallback component. A stale chunk gets its own wording and its own button: retrying the
// render asks for the same missing file, so "Try again" is the one thing that cannot work here.
const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const stale = isStaleChunkError(error);
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      {/* Explicit size: this screen is inline-styled on purpose (it must render when everything
          else is broken), and the body is 12px — an unsized heading would come out as body copy. */}
      <h2 style={{ fontSize: '18px' }}>
        {stale ? 'This tab is running an old version' : 'Something went wrong'}
      </h2>
      <pre style={{ color: 'red', marginTop: '1rem' }}>
        {stale
          ? 'The app was updated while this tab was open. Reload to get the current version.'
          : error instanceof Error
            ? error.message
            : String(error)}
      </pre>
      <button
        onClick={stale ? () => window.location.reload() : resetErrorBoundary}
        style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
      >
        {stale ? 'Reload' : 'Try again'}
      </button>
    </div>
  );
};

// Loading fallback
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    Loading...
  </div>
);

// The /main landing is analytics. Scoped accounts without analytics access are
// redirected to the first section they can open, instead of a permission error.
const AnalyticsHome = () => {
  const { canRead, homeRoute, isLoading } = usePermissions();
  if (isLoading) return <LoadingFallback />;
  if (canRead(SECTION.analytics)) return <Analitic />;
  if (homeRoute && homeRoute !== ROUTES.main) return <Navigate to={homeRoute} replace />;
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      No sections are available for your account. Ask a super admin to grant access.
    </div>
  );
};

const ProtectedLayout = () => (
  <ProtectedRoute>
    {/* Mounted inside the auth gate so the dictionary is fetched only once a
        valid token exists (after login), not at app boot before login. */}
    <DictionaryProvider>
      <Layout>
        <Suspense fallback={<LoadingFallback />}>
          <Outlet />
        </Suspense>
      </Layout>
    </DictionaryProvider>
  </ProtectedRoute>
);

// Authed + dictionary, but WITHOUT the Layout chrome — for full-page surfaces like the
// printable tech pack that must render in clean normal flow.
const ProtectedBare = () => (
  <ProtectedRoute>
    <DictionaryProvider>
      <Suspense fallback={<LoadingFallback />}>
        <Outlet />
      </Suspense>
    </DictionaryProvider>
  </ProtectedRoute>
);

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);

root.render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => (window.location.href = '/')}>
      <ContextProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path={ROUTES.login} element={<LoginBlock />} />
                <Route path='/' element={<ProtectedLayout />}>
                  <Route path={ROUTES.main} element={<AnalyticsHome />} />
                  {/* Без `disabled`: страница библиотеки — единственное место, где снимки можно
                      выбрать пачкой и удалить одним действием. Флаг глушил `toggleMedia`, то есть
                      выбор на ней был мёртв физически, и чистка после съёмки шла по одному кадру. */}
                  <Route path={ROUTES.media} element={<MediaManager />} />
                  <Route path={ROUTES.singleProduct} element={<Product />} />
                  <Route path={ROUTES.product} element={<ProductsCatalog />} />
                  <Route path={ROUTES.waitlist} element={<Waitlist />} />
                  <Route path={ROUTES.addProduct} element={<Product />} />
                  <Route path={ROUTES.hero} element={<Hero />} />
                  <Route path={ROUTES.promo} element={<Promo />} />
                  <Route path={ROUTES.emailCampaign} element={<CampaignBuilder />} />
                  <Route path={ROUTES.emailCampaigns} element={<EmailManager />} />
                  <Route path={ROUTES.emailSegment} element={<SegmentEditor />} />
                  <Route
                    path={ROUTES.emailSegments}
                    element={<Navigate to={`${ROUTES.emailCampaigns}?tab=segments`} replace />}
                  />
                  <Route path={ROUTES.settings} element={<Settings />} />
                  <Route path={ROUTES.dictionaries} element={<Dictionaries />} />
                  <Route path={ROUTES.shipping} element={<Shipping />} />
                  <Route path={ROUTES.orderDetails} element={<OrderDetails />} />
                  <Route path={ROUTES.customOrders} element={<CustomOrders />} />
                  <Route path={ROUTES.orders} element={<OrdersCatalog />} />
                  <Route path={ROUTES.fulfillmentCard} element={<FulfillmentCardDetail />} />
                  <Route path={ROUTES.fulfillment} element={<Fulfillment />} />
                  <Route path={ROUTES.singleArchive} element={<Archive />} />
                  <Route path={ROUTES.archives} element={<Archives />} />
                  <Route path={ROUTES.addArchive} element={<Archive />} />
                  <Route path={ROUTES.customerSupport} element={<CustomerPage />} />
                  <Route path={ROUTES.members} element={<Members />} />
                  <Route path={ROUTES.memberDetails} element={<MemberDetails />} />
                  <Route path={ROUTES.tierConfig} element={<TierConfig />} />
                  <Route path={ROUTES.hacker} element={<HackerManager />} />
                  <Route path={ROUTES.tierAudit} element={<TierAudit />} />
                  <Route path={ROUTES.models} element={<Models />} />
                  <Route path={ROUTES.addModel} element={<Model />} />
                  <Route path={ROUTES.singleModel} element={<Model />} />
                  <Route path={ROUTES.fittings} element={<Fittings />} />
                  <Route path={ROUTES.addFitting} element={<Fitting />} />
                  <Route path={ROUTES.singleFitting} element={<Fitting />} />
                  <Route path={ROUTES.techCards} element={<TechCards />} />
                  <Route path={ROUTES.addTechCard} element={<TechCard />} />
                  <Route path={ROUTES.singleTechCard} element={<TechCard />} />
                  <Route path={ROUTES.materials} element={<Materials />} />
                  <Route path={ROUTES.workshop} element={<WorkshopSettingsPage />} />
                  <Route path={ROUTES.productionRun} element={<ProductionRunDetail />} />
                  <Route path={ROUTES.productionRuns} element={<ProductionRuns />} />
                  <Route path={ROUTES.tasks} element={<Tasks />} />
                  {/* Один компонент на оба адреса: /files/:id — это тот же экран с открытой
                      карточкой поверх сетки, а не отдельная страница. */}
                  <Route path={ROUTES.files} element={<FilesLibrary />} />
                  {/* Объявлен раньше `/files/:id` для читаемости; порядок здесь ни на что не
                      влияет — статический сегмент выигрывает у динамического по рангу. */}
                  <Route path={ROUTES.fileTopics} element={<FileTopics />} />
                  {/* Витрина открытого. Статический сегмент, как и «topics», поэтому «shared»
                      никогда не разберётся как `/files/:id`. */}
                  <Route path={ROUTES.filesShared} element={<FilesShared />} />
                  <Route path={ROUTES.file} element={<FilesLibrary />} />
                  <Route path={ROUTES.opex} element={<Opex />} />
                  {/* All accounting screens share one TooltipProvider (the design in
                      ui/components/tooltip.tsx): <Tooltip> is raw Radix and throws without a
                      provider ancestor, and one shared provider also shares hover timing. */}
                  <Route
                    element={
                      <TooltipProvider delayDuration={200} skipDelayDuration={150}>
                        <Outlet />
                      </TooltipProvider>
                    }
                  >
                    <Route path={ROUTES.accounting} element={<AcctJournal />} />
                    <Route path={ROUTES.accountingAccounts} element={<AcctAccounts />} />
                    <Route path={ROUTES.accountingReports} element={<AcctReports />} />
                    <Route path={ROUTES.accountingBank} element={<AcctBank />} />
                    <Route path={ROUTES.accountingSubledgers} element={<AcctSubledgers />} />
                    <Route path={ROUTES.accountingPeriods} element={<AcctPeriods />} />
                    <Route path={ROUTES.accountingEvents} element={<AcctEvents />} />
                  </Route>
                  <Route path={ROUTES.employees} element={<Employees />} />
                  <Route path={ROUTES.taskDetails} element={<TaskDetail />} />
                  <Route path={ROUTES.accounts} element={<Accounts />} />
                  {/* Свой аккаунт открыт любому вошедшему и потому НЕ гейтится секцией —
                      в отличие от /accounts, который гейт закрывает и который уводит сюда
                      редиректом, когда accounts:read нет. */}
                  <Route path={ROUTES.me} element={<MyProfile />} />
                </Route>
                {/* Layout-less protected route: a standalone page so the browser print
                    engine (Safari especially) renders the document in normal flow, with
                    no app chrome to isolate via fragile print CSS. */}
                <Route path='/' element={<ProtectedBare />}>
                  <Route path={ROUTES.techCardPrint} element={<TechCardPrint />} />
                  {/* Наряд на партию — бумага ПРОГОНА, не стиля: тех-пак печатает устройство
                      изделия, наряд — тираж этой партии. Отсюда отдельный печатный роут. */}
                  <Route path={ROUTES.productionRunPrint} element={<RunPackPrint />} />
                  <Route path={ROUTES.orderInvoice} element={<OrderInvoicePrint />} />
                </Route>
                {/* PUBLIC pattern viewer — what a printed tech-pack QR opens on a factory
                    phone. Deliberately outside ProtectedRoute (no JWT), outside Layout (no
                    admin chrome) and outside DictionaryProvider (the dictionary is an authed
                    fetch; a page that needs it is not public). */}
                <Route path={ROUTES.patternViewer} element={<PatternViewerPage />} />
                {/* PUBLIC run-pack viewer — what a printed НАРЯД НА ПАРТИЮ QR opens on a cutting
                    floor phone. Same three exclusions as the pattern viewer above, for the same
                    reasons: no JWT, no admin chrome, no dictionary (all names ride in the
                    manifest). Its ?v= carries the run's lock version at print time, so the page
                    can tell the floor the paper in its hands is out of date. */}
                <Route path={ROUTES.runPackViewer} element={<RunPackViewerPage />} />
                {/* PUBLIC file-share landing — страница, которую открывает человек ВНЕ компании
                    по присланной ссылке. Те же три исключения, что у двух вьюеров выше, и по тем
                    же причинам: аккаунта у читателя нет (никакого JWT), навигация панели ему не
                    принадлежит (никакого Layout), словарь — авторизованный запрос (никакого
                    DictionaryProvider). Всё, что странице нужно, приезжает с публичного
                    `/api/f/{token}?mode=json`. */}
                <Route path={ROUTES.publicFile} element={<FileShareViewerPage />} />
                {/* Стенд печати. DictionaryProvider свой: без токена он ничего не запрашивает и
                    отдаёт пустой словарь — ровно то состояние, в котором документ обязан
                    печататься, называя недостающее, а не падать. */}
                {import.meta.env.DEV && (
                  <Route
                    path='/__print-smoke'
                    element={
                      <DictionaryProvider>
                        <PrintSmokePage />
                      </DictionaryProvider>
                    }
                  />
                )}
              </Routes>
            </Suspense>
          </BrowserRouter>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </ContextProvider>
    </ErrorBoundary>
  </StrictMode>,
);
