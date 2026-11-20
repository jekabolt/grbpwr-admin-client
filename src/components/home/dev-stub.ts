// DEV ONLY: canned answers for the team home («my work»), reached through
// `components/auth/dev-stub` under `VITE_AUTH_STUB=1`. A production build never imports it.
// localStorage `stub.home = 'empty'` answers every list empty.

const DAY = 86_400_000;

function at(days: number, h = 0, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return new Date(d.getTime() + days * DAY).toISOString();
}

const CARDS: Record<number, [string, string]> = {
  2701: ['ml-2701', 'boxy shirt'],
  2702: ['ml-2702', 'wide trouser'],
  2704: ['ml-2704', 'field jacket'],
  2705: ['ml-2705', 'knit polo'],
  2609: ['ml-2609', 'overshirt'],
  2611: ['ml-2611', 'wool coat'],
  2614: ['ml-2614', 'pleat trouser'],
};
const MODELS: Record<number, string> = { 1: 'anna', 2: 'leo' };

const task = (id: number, title: string, status: string, techCardId: number, due?: string) => ({
  id,
  status,
  boardId: 1,
  task: { title, assignees: ['mira.kolesnikova'], dueDate: due, techCardId },
});

const fitting = (id: number, date: string, techCardId: number, round: number, modelId: number) => ({
  id,
  fitting: {
    fittingDate: date,
    techCardId,
    roundNumber: round,
    modelId,
    status: 'FITTING_STATUS_PLANNED',
  },
});

const run = (id: number, techCardId: number, status: string, qty: number, promised: string) => ({
  id,
  run: { techCardId, status, promisedAt: promised, lines: [] },
  actuals: { plannedQtyTotal: qty },
});

function empty(): boolean {
  try {
    return localStorage.getItem('stub.home') === 'empty';
  } catch {
    return false;
  }
}

/** `path` is the request path: a GET carries its id and filters there, not in a body. */
export function homeStubAnswer(method: string, body: string | null, path = ''): unknown {
  const req = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
  const [route, query = ''] = path.split('?');
  const id = Number(route.split('/').pop());
  const overdueOnly = req.overdueOnly || new URLSearchParams(query).get('overdueOnly') === 'true';
  const none = empty();
  switch (method) {
    case 'ListTasks':
      return {
        tasks: none
          ? []
          : [
              task(1, 'fix sleeve pitch', 'TASK_STATUS_IN_PROGRESS', 2701, at(0, 18)),
              task(2, 'grade field jacket to xl', 'TASK_STATUS_TODO', 2704, at(1, 12)),
              task(3, 'approve wool swatch', 'TASK_STATUS_REVIEW', 0, at(-1, 12)),
              task(4, 'trouser pattern to factory', 'TASK_STATUS_TODO', 2702, at(6, 12)),
              task(5, 'lookbook shot list', 'TASK_STATUS_BACKLOG', 0),
              task(6, 'old fix', 'TASK_STATUS_DONE', 2701, at(-5)),
            ],
        total: none ? 0 : 6,
      };
    case 'ListTaskBoards':
      return { boards: [{ id: 1, name: 'development', position: 1 }] };
    case 'ListFittings':
      return {
        fittings: none
          ? []
          : [
              fitting(11, at(0, 11), 2701, 3, 1),
              fitting(12, at(1, 14, 30), 2704, 2, 2),
              fitting(13, at(5), 2705, 1, 1),
              fitting(14, at(-9, 10), 2702, 1, 2),
            ],
      };
    case 'ListProductionRuns':
      if (none) return { runs: [] };
      return overdueOnly
        ? { runs: [run(21, 2609, 'PRODUCTION_RUN_STATUS_IN_PROGRESS', 60, at(-4))] }
        : {
            runs: [
              run(21, 2609, 'PRODUCTION_RUN_STATUS_IN_PROGRESS', 60, at(-4)),
              run(22, 2614, 'PRODUCTION_RUN_STATUS_IN_PROGRESS', 80, at(9)),
              run(23, 2611, 'PRODUCTION_RUN_STATUS_IN_PROGRESS', 120, at(15)),
            ],
          };
    case 'ListLibraryFiles':
      return {
        files: none
          ? []
          : [
              {
                id: 31,
                fileName: 'ss27 line sheet v4.pdf',
                uploadedBy: 'anna',
                createdAt: at(0, new Date().getHours() - 2),
              },
              {
                id: 32,
                fileName: 'field jacket r2.dxf',
                uploadedBy: 'mira.kolesnikova',
                createdAt: at(-1, 10),
              },
              {
                id: 33,
                fileName: 'wool lot 3 swatch.jpg',
                uploadedBy: 'ivan',
                createdAt: at(-1, 9),
              },
              {
                id: 34,
                fileName: 'fw26 cost sheet.xlsx',
                uploadedBy: 'mira',
                createdAt: at(-3, 9),
              },
            ],
      };
    case 'GetTechCard': {
      const c = CARDS[id];
      return c ? { techCard: { id, techCard: { styleNumber: c[0], name: c[1] } } } : {};
    }
    case 'GetModel': {
      const n = MODELS[id];
      return n ? { model: { id, model: { name: n } } } : {};
    }
    default:
      return undefined;
  }
}
