import { common_ProductionRunCostKind, common_ProductionRunStatus } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';

// Path to a run's detail page. Lives here (not on the detail module) so the create/edit modal can
// navigate to it without importing its parent page — that would be a cycle.
export const runDetailPath = (id: number) => ROUTES.productionRun.replace(':id', String(id));

// Путь к НАРЯДУ НА ПАРТИЮ (печатный документ прогона). Стоит рядом с runDetailPath по той же
// причине: ссылку на него ставит шапка прогона, и импортировать ради неё страницу-родителя значило
// бы завести цикл.
export const runPackPath = (id: number) => ROUTES.productionRunPrint.replace(':id', String(id));

// Lifecycle statuses. RECEIVED is reached only through ReceiveProductionRun (which posts
// stock) — never offered as a manual edit; UNKNOWN is never surfaced.
//
// ЧЕРНОВИК СТОИТ ПЕРВЫМ, потому что он предшествует плану и ничего цеху не обещает: черновик не
// резервирует материал, не проходит гейт готовности при создании и не порождает наряд. Все три
// обязательства навешиваются на переходе draft → planned — а значит и создавать черновик, и
// повышать его до плана надо уметь с производственных экранов, а не только из костинга, где он
// заводится. Статус, которого нет в этом списке, нельзя ни выбрать, ни снять.
export const runStatusOptions: { value: common_ProductionRunStatus; label: string }[] = [
  { value: 'PRODUCTION_RUN_STATUS_DRAFT', label: 'черновик' },
  { value: 'PRODUCTION_RUN_STATUS_PLANNED', label: 'planned' },
  { value: 'PRODUCTION_RUN_STATUS_IN_PROGRESS', label: 'in progress' },
  { value: 'PRODUCTION_RUN_STATUS_CLOSED', label: 'closed' },
  { value: 'PRODUCTION_RUN_STATUS_CANCELLED', label: 'cancelled' },
];

export const runStatusLabel = (s?: common_ProductionRunStatus | string): string => {
  switch (s) {
    // Без этой ветки статус проваливался в default и печатался прочерком — то есть партия
    // существующего статуса читалась как партия без статуса. Дороже всего это было ровно там, где
    // черновик и заводится: кнопки базы расчёта на вкладке костинга подписывались «партия #12 · —».
    case 'PRODUCTION_RUN_STATUS_DRAFT':
      return 'черновик';
    case 'PRODUCTION_RUN_STATUS_PLANNED':
      return 'planned';
    case 'PRODUCTION_RUN_STATUS_IN_PROGRESS':
      return 'in progress';
    case 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED':
      return 'partially received';
    case 'PRODUCTION_RUN_STATUS_RECEIVED':
      return 'received';
    case 'PRODUCTION_RUN_STATUS_CLOSED':
      return 'closed';
    case 'PRODUCTION_RUN_STATUS_CANCELLED':
      return 'cancelled';
    default:
      return '—';
  }
};

// Status → badge tone (Tailwind classes on the app's semantic tokens), shared by the run list
// card and the detail header so a status reads the same colour everywhere: nothing-yet stays
// plain, in-flight is the app's "in progress, keep an eye on it" blue, received/closed are the
// two "done, stock is posted" milestones (green while still open to cost true-up, solid once
// closed for good), cancelled is the app's red "dead" tone.
export const runStatusTone = (s?: common_ProductionRunStatus | string): string => {
  switch (s) {
    case 'PRODUCTION_RUN_STATUS_IN_PROGRESS':
      return 'border-warning text-warning bg-warning/10';
    // Between in-flight and done: deliveries are landing but the series is still open — the
    // "keep an eye on it" tone, not the done-green.
    case 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED':
      return 'border-warning text-warning bg-warning/10';
    case 'PRODUCTION_RUN_STATUS_RECEIVED':
      return 'border-success text-success bg-success/10';
    case 'PRODUCTION_RUN_STATUS_CLOSED':
      return 'border-textColor bg-textColor text-bgColor';
    case 'PRODUCTION_RUN_STATUS_CANCELLED':
      return 'border-error text-error bg-error/10';
    // ЧЕРНОВИК — самый тихий бейдж на странице, и это выбор, а не совпадение с default'ом.
    // Синий в этой системе значит «в полёте, нужен человек», зелёный — «сделано», сплошная плашка
    // ink — «закрытая запись». Черновик не является ни одним из трёх: он ничего не занял и никому
    // ничего не обещал, поэтому берёт нейтральный серый — тот же, что у planned. Различает их
    // СЛОВО («черновик» против «planned»), а не цвет: DESIGN.md прямо запрещает нести состояние
    // одним лишь цветом, и здесь это правило работает в обе стороны — два соседних некритичных
    // состояния не обязаны красить страницу в два разных оттенка, чтобы отличаться.
    case 'PRODUCTION_RUN_STATUS_DRAFT':
    case 'PRODUCTION_RUN_STATUS_PLANNED':
    default:
      // labelColor (#666, ~5.7:1), NOT textInactiveColor (#ccc, ~1.6:1): DESIGN.md reserves #ccc for
      // borders, placeholders and disabled states, and «planned» is the most common state in a run
      // list — the one badge that must not be the least readable thing on the page.
      return 'border-borderColor text-labelColor';
  }
};

// received/closed are terminal facts (stock + cost_price posted): delete is rejected by the
// backend, so the UI hides/disables it for these.
//
// ЧЕРНОВИК СЮДА НЕ ВХОДИТ, и это самое сильное утверждение из трёх: черновик — самое редактируемое
// состояние, какое у партии бывает. Он не держит ни резерва ткани, ни наряда, ни квитанции, так
// что запретить у него правку или удаление значило бы запереть единственный статус, который для
// свободной правки и заведён.
export const isRunLocked = (s?: common_ProductionRunStatus | string): boolean =>
  s === 'PRODUCTION_RUN_STATUS_RECEIVED' || s === 'PRODUCTION_RUN_STATUS_CLOSED';

// ЧЕРНОВИК НЕ ПРИНИМАЕТСЯ: принять можно то, что шьют, а черновик ещё никому не заказан — ткань не
// занята, наряда нет. Кнопка «принять» на нём предлагала бы провести на склад партию, которой цех
// не видел.
export const isRunReceivable = (s?: common_ProductionRunStatus | string): boolean =>
  s === 'PRODUCTION_RUN_STATUS_PLANNED' ||
  s === 'PRODUCTION_RUN_STATUS_IN_PROGRESS' ||
  s === 'PRODUCTION_RUN_STATUS_PARTIALLY_RECEIVED';

// A run is OPEN while it is still expected to produce something. Same two statuses as receivable —
// named separately because "can I still receive it" and "is it still outstanding" are different
// questions that happen to share an answer, and the overdue rule below is about the second one.
//
// ЧЕРНОВИК НЕ ОТКРЫТ. «Открыта» значит «производство идёт и что-то должно приехать»; черновик не
// должен ничего и никому — это прикидка денег. Ответ «нет» здесь ГАСИТ ЕГО РОВНО ТАМ, ГДЕ НАДО:
// он не попадает ни в счётчик «в работе», ни в блок «требует действия», ни в опоздания (overdueDays
// ниже спрашивает именно этот предикат), ни в сверку партий с датой дропа на тех-карте. Черновик,
// у которого «прошла обещанная дата», был бы упрёком за невыполнение того, чего никто не обещал.
//
// ЦЕНА ЭТОГО ОТВЕТА — что `!isRunOpen` перестаёт означать «завершена»: см. список партий, где
// черновики выделены в СВОЙ раздел, а не свалены в «завершённые и отменённые».
export const isRunOpen = isRunReceivable;

// The proto zero instant. grpc-gateway serialises an unset google.protobuf.Timestamp as this rather
// than omitting it, so every date read here has to treat it as "no date" or the UI dates every
// unplanned run to the year 1.
const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

// A wire timestamp as a bare YYYY-MM-DD, or '' when unset. The backend stores these dates at UTC
// midnight, so slicing is exact — no local-timezone reinterpretation that could shift the day.
export const runDate = (ts?: string): string =>
  !ts || ts === ZERO_TIMESTAMP ? '' : ts.slice(0, 10);

// Whole days between a wire date and today, positive when the date is in the PAST. Both sides are
// reduced to a UTC calendar day first: comparing instants would make a run promised for today read
// as one day late from 00:01 local time onwards.
export function daysPast(ts?: string): number | undefined {
  const d = runDate(ts);
  if (!d) return undefined;
  const then = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(then)) return undefined;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - then) / 86_400_000);
}

// How many days late a run is: >0 only for an OPEN run whose promised date has passed. This is the
// client half of ListProductionRunsRequest.overdue_only — same predicate, so the badge and the
// server-side filter can never disagree about which runs are late. A run with no promised date was
// never promised anything and is therefore never late.
export function overdueDays(
  promisedAt?: string,
  status?: common_ProductionRunStatus | string,
): number {
  if (!isRunOpen(status)) return 0;
  const past = daysPast(promisedAt);
  return past != null && past > 0 ? past : 0;
}

export const runCostKindOptions: { value: common_ProductionRunCostKind; label: string }[] = [
  { value: 'PRODUCTION_RUN_COST_KIND_MATERIALS', label: 'materials' },
  { value: 'PRODUCTION_RUN_COST_KIND_CMT', label: 'CMT (cut-make-trim)' },
  { value: 'PRODUCTION_RUN_COST_KIND_HARDWARE', label: 'hardware' },
  { value: 'PRODUCTION_RUN_COST_KIND_PACKAGING', label: 'packaging' },
  { value: 'PRODUCTION_RUN_COST_KIND_LOGISTICS', label: 'logistics' },
  { value: 'PRODUCTION_RUN_COST_KIND_DUTY', label: 'duty' },
  { value: 'PRODUCTION_RUN_COST_KIND_OTHER', label: 'other' },
];

export const runCostKindLabel = (k?: common_ProductionRunCostKind | string): string =>
  runCostKindOptions.find((o) => o.value === k)?.label ?? 'other';

// The ListProductionRuns `status` filter is a plain string, and the backend stores the status
// as its lowercase short name (see production.proto: "Stored as its lowercase name in the DB").
// So the filter must be sent as e.g. `planned` / `in_progress`, NOT the enum constant — otherwise
// it matches nothing. The UI keeps the enum constant for display; convert only at the boundary.
export const runStatusToDbFilter = (status?: string): string | undefined =>
  status ? status.replace('PRODUCTION_RUN_STATUS_', '').toLowerCase() : undefined;
