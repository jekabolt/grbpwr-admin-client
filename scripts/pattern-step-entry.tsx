// Точка входа пробы-скриншота шага 3 PATTERN (студия тех-карты, 2026-09-26).
//
// ЗАЧЕМ. Новый экран шага (колорвеи × слоты ткани, IMAGE TO FABRIC, карусель LAST FABRICS с
// `use for ▸`) собран из десятка органов, и `tsc` зелен при любой их встрече на экране. Этот стенд
// монтирует НАСТОЯЩИЙ `PatternStudio` так, как его монтирует композитор (`studio-tab.tsx`), и даёт
// пробе (`pattern-step-probe.mjs`) снять его в браузере: ошибки исполнения и картинки для UX-разбора.
//
// ЧТО НАСТОЯЩЕЕ, ЧТО ПОДМЕНЕНО:
//   · компоненты, хуки, провайдеры — из репозитория, без правок;
//   · СЛОТЫ читаются тем же приёмом, что у композитора: одна форма `bomItems` и один
//     `useWatch({ compute: clothSlots })` — несохранённая строка считается, а не рисуется, ровно так же;
//   · ПОЛОСА читается настоящим `useDesignBand` — значит запись (`SetDesignAssetBinding`,
//     `StartDesignRun`…) инвалидирует ключ и экран перечитывает полосу, как в жизни;
//   · ПОДМЕНЁН ОДИН СЛОЙ — сетевой (`api/api`): сборка пробы кладёт вместо него прокси, который зовёт
//     `window.__patternApi[метод]` отсюда. Ни одного запроса в сеть: ткани — PNG, нарисованные канвой.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignAssetBinding,
  common_DesignRun,
  common_DesignRunParams,
  common_MediaFull,
  common_TechCardColorwayUsage,
} from 'api/proto-http/admin';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import {
  PatternStudio,
  clothSlots,
  type BomLineLike,
} from 'components/managers/tech-card/components/design/pattern';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { createRoot, type Root } from 'react-dom/client';
import type { JSX } from 'react';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { MemoryRouter } from 'react-router-dom';
import { SectionStack } from 'ui/components/section';
import { SnackBar } from 'ui/components/snackbar';

export type ScenarioId = 'empty' | 'no-slots' | 'full' | 'gate';

type ApiHandler = (req: Record<string, unknown>) => unknown;

type Probe = {
  mount: (scenario: ScenarioId) => void;
  /** Состояние, которое видит заглушённый сервер, — проба сверяет записи по нему. */
  band: () => GetDesignBandResponse | null;
  calls: { method: string; req: unknown }[];
  /** Экран на кадре: `goTab` / `goStep` не уходят никуда, а только пишутся сюда. */
  navigations: string[];
};

declare global {
  interface Window {
    __pattern: Probe;
    __patternApi: Record<string, ApiHandler>;
  }
}

const TECH_CARD_ID = 42;
const ROSSO = 11;
const OLIVE = 12;

/* ─────────────────────────── ткани: PNG из канвы, без сети ─────────────────────────── */

/**
 * Бесшовная плитка 96×96: период каждого рисунка делит сторону нацело, поэтому 2×2-лицо
 * (`TiledFace`) стыкуется без шва — иначе разбор принял бы шов стенда за дефект экрана.
 */
function fabricPng(kind: 'twill' | 'check' | 'rib', base: string, ink: string): string {
  const s = 96;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  if (!g) return '';
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  if (kind === 'twill') {
    g.strokeStyle = ink;
    g.lineWidth = 2.5;
    for (let i = -s; i <= 2 * s; i += 8) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + s, s);
      g.stroke();
    }
  } else if (kind === 'check') {
    g.globalAlpha = 0.45;
    g.fillStyle = ink;
    for (let i = 0; i < s; i += 24) {
      g.fillRect(i, 0, 12, s);
      g.fillRect(0, i, s, 12);
    }
  } else {
    g.fillStyle = ink;
    for (let x = 0; x < s; x += 6) g.fillRect(x, 0, 2, s);
  }
  return c.toDataURL('image/png');
}

function media(id: number, url: string): common_MediaFull {
  const info = { mediaUrl: url, width: 96, height: 96 };
  return {
    id,
    createdAt: '2026-09-20T10:00:00Z',
    contentHash: undefined,
    media: { fullSize: info, thumbnail: info, compressed: info, blurhash: undefined },
  };
}

/** Проводные типы требуют КАЖДЫЙ ключ; стенду нужны единицы — остальное «не прислано». */
const wire = <T,>(x: Partial<T>): T => x as T;

function asset(
  id: number,
  name: string,
  url: string,
  colour: { code?: string; hex?: string } = {},
): common_DesignAsset {
  return wire<common_DesignAsset>({
    id,
    techCardId: TECH_CARD_ID,
    kind: 'pattern',
    name,
    mediaId: 500 + id,
    media: media(500 + id, url),
    colourCode: colour.code ?? '',
    colourHex: colour.hex ?? '',
    note: '',
    derivedFromAssetId: 0,
    repeatMm: 0,
    rotationDeg: 0,
    ordinal: 0,
    createdBy: 'probe',
    createdAt: '2026-09-20T10:00:00Z',
    colorwayId: 0,
  });
}

function binding(id: number, colorwayId: number, bomItemId: number, assetId: number) {
  return wire<common_DesignAssetBinding>({
    id,
    techCardId: TECH_CARD_ID,
    colorwayId,
    bomItemId,
    assetId,
    setBy: 'probe',
    setAt: '2026-09-21T10:00:00Z',
  });
}

function runParams(colorwayId: number, bomItemId: number, name: string): common_DesignRunParams {
  return wire<common_DesignRunParams>({
    views: [],
    layout: '',
    colour: undefined,
    extraInputMediaIds: [],
    colorwayId,
    pattern: { repeatMm: 0, name, sourceAssetId: 0, mode: 'swatch', bomItemId },
  });
}

function liveRun(id: number, colorwayId: number, bomItemId: number, name: string, ago: number) {
  const at = new Date(Date.now() - ago * 1000).toISOString();
  return wire<common_DesignRun>({
    id,
    techCardId: TECH_CARD_ID,
    kind: 'pattern',
    status: 'running',
    clientRequestId: `probe-${id}`,
    ask: '',
    params: runParams(colorwayId, bomItemId, name),
    attempts: [],
    pictures: [],
    createdAt: at,
    startedAt: at,
  });
}

/* ─────────────────────────── колорвеи и строки BOM ─────────────────────────── */

function usage(bomItemId: number, lineKey: string, pantone: string, color: string) {
  return wire<common_TechCardColorwayUsage>({
    placement: '',
    color,
    pantone,
    bomLineKey: lineKey,
    bomItemId,
    pieceLineKey: '',
    pieceId: 0,
  });
}

function colourway(
  colorwayId: number,
  devName: string,
  devHex: string,
  pantone: string,
  usages: common_TechCardColorwayUsage[],
): common_AdminColorwayRef {
  return wire<common_AdminColorwayRef>({
    colorwayId,
    baseSku: `GRB-TC${TECH_CARD_ID}`,
    colorCode: devName.slice(0, 3).toUpperCase(),
    status: 'COLORWAY_LIFECYCLE_STATUS_ACTIVE',
    usages,
    devCode: `D${colorwayId}`,
    devName,
    devComment: '',
    pantone,
    pantoneSystem: pantone ? 'TCX' : '',
    devHex,
  });
}

/**
 * ДВА КОЛОРВЕЯ, И ОНИ РАЗНЫЕ ПО ТОМУ, ОТКУДА ЦВЕТ У ПАРЫ:
 *   · ROSSO — пантон колорвея (18-1664) и ДРУГОЙ пантон рецепта на основной ткани (19-1664):
 *     секция «from this card» пикера получает оба предложения, а не одно склеенное; подкладка —
 *     без своего пантона (падает на пантон колорвея), контраст — без строки рецепта вовсе;
 *   · OLIVE — пантона колорвея нет, есть только экранный `devHex` и один пантон рецепта на
 *     основной: ряды без пантона показывают запасной путь (свотч hex на месте пикера).
 */
const COLOURWAYS: common_AdminColorwayRef[] = [
  colourway(ROSSO, 'ROSSO', '#b0282f', '18-1664 TCX', [
    usage(1, 'bom-outer', '19-1664 TCX', 'true red'),
    usage(2, 'bom-lining', '', ''),
  ]),
  colourway(OLIVE, 'OLIVE', '#5b6236', '', [usage(1, 'bom-outer', '18-0426 TCX', 'olive')]),
];

/** Три сохранённые строки рулонного товара (ids 1..3) и одна несохранённая (без `id`). */
const CLOTH_LINES: BomLineLike[] = [
  {
    id: 1,
    lineKey: 'bom-outer',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    name: 'outer',
    composition: '100% cotton',
    spec: 'twill · 300 gsm',
  },
  {
    id: 2,
    lineKey: 'bom-lining',
    section: 'TECH_CARD_BOM_SECTION_LINING',
    purpose: 'TECH_CARD_BOM_PURPOSE_LINING',
    name: 'inner',
    composition: '100% cupro',
    spec: 'habotai · 75 gsm',
  },
  {
    id: 3,
    lineKey: 'bom-contrast',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    purpose: 'TECH_CARD_BOM_PURPOSE_CONTRAST',
    name: '',
    composition: '',
    spec: '',
  },
  {
    lineKey: 'bom-new-pocketing',
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    purpose: 'TECH_CARD_BOM_PURPOSE_POCKETING',
    name: 'pocket bag',
    composition: '65% polyester 35% cotton',
    spec: '',
  },
];

/** Строки, которые НЕ ткань: нитки и фурнитура слотом не становятся. */
const NON_CLOTH_LINES: BomLineLike[] = [
  { id: 7, lineKey: 'bom-thread', section: 'TECH_CARD_BOM_SECTION_THREAD', name: 'thread' },
  { id: 8, lineKey: 'bom-zip', section: 'TECH_CARD_BOM_SECTION_HARDWARE', name: 'zip' },
];

/* ─────────────────────────── полоса ─────────────────────────── */

function band(parts: Partial<GetDesignBandResponse>): GetDesignBandResponse {
  return {
    bench: [],
    budget: undefined,
    references: [],
    layers: [],
    totalRuns: (parts.runs ?? []).length,
    archivedRuns: 0,
    maxRrev: 0,
    colourRecipes: [],
    hiddenByRun: {},
    hiddenByBatch: {},
    runs: [],
    batches: [],
    nextPageToken: '',
    hasFabricRender: undefined,
    renderBenchColorwayIds: undefined,
    assets: [],
    assetPlacements: [],
    outputs: undefined,
    outputsTotal: undefined,
    outputsTotalByColorway: undefined,
    colourPlan: undefined,
    benchAdoptsUnattributed: undefined,
    freeformPresets: undefined,
    assetBindings: [],
    ...parts,
  };
}

function threeFabrics(): common_DesignAsset[] {
  return [
    asset(101, 'ROSSO · outer', fabricPng('twill', '#b3262c', '#7d151a'), {
      code: '19-1664 TCX',
      hex: '#BF1932',
    }),
    asset(102, 'OLIVE · outer', fabricPng('twill', '#656344', '#3f3e29'), {
      code: '18-0426 TCX',
      hex: '#656344',
    }),
    asset(103, 'fabric 1', fabricPng('check', '#e9e4d8', '#1d3f73')),
  ];
}

type Scenario = {
  colourways: common_AdminColorwayRef[];
  bomItems: BomLineLike[];
  band: GetDesignBandResponse;
};

function scenario(id: ScenarioId): Scenario {
  switch (id) {
    // (1) НИ ОДНОГО КОЛОРВЕЯ: слоты есть, полка пуста, привязок нет (сервер их знает).
    case 'empty':
      return { colourways: [], bomItems: CLOTH_LINES, band: band({ assetBindings: [] }) };
    // (2) КОЛОРВЕИ ЕСТЬ, ТКАНЕЙ В BOM НЕТ: только нитки и фурнитура. На полке — три ткани.
    case 'no-slots':
      return {
        colourways: COLOURWAYS,
        bomItems: NON_CLOTH_LINES,
        band: band({ assets: threeFabrics(), assetBindings: [] }),
      };
    // (3) ПОЛНЫЙ: 2 колорвея × 3 слота, две надетые ткани, один живой прогон пары ROSSO × inner.
    case 'full':
      return {
        colourways: COLOURWAYS,
        bomItems: [...CLOTH_LINES, ...NON_CLOTH_LINES],
        band: band({
          assets: threeFabrics(),
          assetBindings: [binding(1, ROSSO, 1, 101), binding(2, OLIVE, 1, 102)],
          runs: [liveRun(900, ROSSO, 2, 'ROSSO · inner', 14)],
        }),
      };
    // (4) ВОРОТА ВОЗМОЖНОСТИ: бинарь старше привязок — `assetBindings` НЕ ПРИСЛАН (≠ пусто).
    case 'gate':
      return {
        colourways: COLOURWAYS,
        bomItems: CLOTH_LINES,
        band: band({ assets: threeFabrics(), assetBindings: undefined }),
      };
  }
}

/* ─────────────────────────── заглушённый сервер ─────────────────────────── */

const probe: Probe = {
  mount: () => undefined,
  band: () => null,
  calls: [],
  navigations: [],
};
window.__pattern = probe;

/** Полоса «на сервере». Каждое чтение отдаёт КОПИЮ: react-query обязан увидеть новый объект. */
let served: GetDesignBandResponse | null = null;
probe.band = () => served;
let nextId = 2000;

const num = (v: unknown): number => Number(v ?? 0) || 0;

window.__patternApi = {
  GetDesignBand: () => {
    if (!served) throw new Error('probe: no band armed');
    return structuredClone(served);
  },
  SetDesignAssetBinding: (req) => {
    if (!served) throw new Error('probe: no band armed');
    const cw = num(req.colorwayId);
    const bom = num(req.bomItemId);
    const assetId = num(req.assetId);
    const rest = (served.assetBindings ?? []).filter(
      (b) => !(num(b.colorwayId) === cw && num(b.bomItemId) === bom),
    );
    served = {
      ...served,
      assetBindings: assetId > 0 ? [...rest, binding(nextId++, cw, bom, assetId)] : rest,
    };
    return {};
  },
  StartDesignRun: (req) => {
    if (!served) throw new Error('probe: no band armed');
    const params = (req.params ?? {}) as common_DesignRunParams;
    const run = wire<common_DesignRun>({
      ...liveRun(
        nextId++,
        num(params.colorwayId),
        num(params.pattern?.bomItemId),
        params.pattern?.name ?? '',
        0,
      ),
      params,
      status: 'pending',
    });
    served = { ...served, runs: [run, ...(served.runs ?? [])] };
    return { run };
  },
  UpsertDesignAsset: (req) => {
    if (!served) throw new Error('probe: no band armed');
    const id = num(req.assetId) || nextId++;
    const prev = (served.assets ?? []).find((a) => num(a.id) === id);
    const next = wire<common_DesignAsset>({
      ...(prev ?? asset(id, '', '')),
      name: String(req.name ?? ''),
      kind: String(req.kind ?? 'pattern'),
    });
    served = {
      ...served,
      assets: prev
        ? (served.assets ?? []).map((a) => (num(a.id) === id ? next : a))
        : [...(served.assets ?? []), next],
    };
    return { asset: next };
  },
  DeleteDesignAsset: (req) => {
    if (!served) throw new Error('probe: no band armed');
    const id = num(req.assetId);
    served = {
      ...served,
      assets: (served.assets ?? []).filter((a) => num(a.id) !== id),
      assetBindings: (served.assetBindings ?? []).filter((b) => num(b.assetId) !== id),
    };
    return {};
  },
};

/* ─────────────────────────── монтаж, как у композитора ─────────────────────────── */

type FormShape = { bomItems: BomLineLike[] };

/** Колорвеи сценария — ось композитора (`useColorwayChoice`) здесь заменена готовым списком. */
let shownColourways: common_AdminColorwayRef[] = [];

/** Форма карточки: её `bomItems` — единственный источник слотов, как у настоящей студии. */
function CardForm({ bomItems }: { bomItems: BomLineLike[] }): JSX.Element {
  const methods = useForm<FormShape>({ defaultValues: { bomItems } });
  return (
    <FormProvider {...methods}>
      <StepScreen />
    </FormProvider>
  );
}

/**
 * Экран шага под теми же провайдерами и тем же чтением, что в `studio-tab.tsx`: слоты — один
 * `useWatch({ compute })` по форме из контекста, полоса — `useDesignBand`, возможность сервера —
 * её `serverSpeaks`, просмотрщик — один `PictureGalleryProvider` на экран.
 */
function StepScreen(): JSX.Element {
  const { control } = useFormContext<FormShape>();
  const cloth = useWatch({
    control,
    name: 'bomItems',
    compute: (lines: BomLineLike[]) => clothSlots(lines),
  });
  const { band: current, isLoading, serverSpeaks, error } = useDesignBand(TECH_CARD_ID);

  if (isLoading) return <p data-probe-state='loading'>loading…</p>;
  if (error) return <p data-probe-state='error'>{String(error.message)}</p>;
  return (
    <DesignCapabilityProvider value={serverSpeaks}>
      <PictureGalleryProvider techCardId={TECH_CARD_ID} band={current}>
        <div data-probe-state='ready' className='contents'>
          <PatternStudio
            band={current}
            techCardId={TECH_CARD_ID}
            colorways={shownColourways}
            slots={cloth.slots}
            unsavedSlots={cloth.unsavedCount}
            onGoTab={(tab) => probe.navigations.push(`tab:${tab}`)}
            onGoStep={(step) => probe.navigations.push(`step:${step}`)}
          />
        </div>
      </PictureGalleryProvider>
    </DesignCapabilityProvider>
  );
}

let root: Root | null = null;

probe.mount = (id) => {
  const s = scenario(id);
  served = s.band;
  shownColourways = s.colourways;
  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, retry: false, refetchOnWindowFocus: false },
    },
  });
  const el = document.getElementById('root');
  if (!el) throw new Error('probe: no #root');
  root?.unmount();
  root = createRoot(el);
  root.render(
    <QueryClientProvider client={qc}>
      <DictionaryProvider>
        <MemoryRouter initialEntries={['/tech-cards/42?tab=studio&step=pattern']}>
          <div className='min-h-screen px-2.5 py-6' data-probe-scenario={id}>
            <SectionStack>
              <CardForm bomItems={s.bomItems} />
            </SectionStack>
          </div>
          <SnackBar />
        </MemoryRouter>
      </DictionaryProvider>
    </QueryClientProvider>,
  );
};
