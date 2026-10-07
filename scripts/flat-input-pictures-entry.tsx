// DOM-стенд `flat-input-pictures-probe.mjs` (M13, владелец 07.10): НАСТОЯЩИЕ `FlatInputPictures` и
// `FlatRunRow`, сшитые так же, как в `ReferencesSection` (ряд говорит, на чём стоит target ▾), над
// настоящим `useDesignBand`; сеть подменена одним слоем (`api/api` → `window.__api[метод]`, вызовы —
// в `window.__calls`). Автосейв — управляемый стендом (`window.__autosave`): flush отвечает `nothing`,
// GENERATE доходит до превью и StartDesignRun; «сохранение» — новый `lastSavedAt`.
//
// Карточка 38 по образу беты: стороны FRONT/BACK/SIDE L/SIDE R заполнены (плиты 955–958), детали
// `Crossed racerback straps` (92, пуста, в target ▾), `Crossed back straps` (125, нарисована, без фото)
// и `Layered neckline` (126, нарисована, фото 211). На доске: 124 front, 126 back, 125 side L, 300
// front (старше двух свежих), 211 деталь, 916 mood. Превью отвечает по params, как сервер.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  PreviewDesignRunInputsRequest,
  PreviewDesignRunInputsResponse,
} from 'api/proto-http/admin';
import {
  AutosaveContext,
  type AutosaveApi,
} from 'components/managers/tech-card/components/design/autosave-contract';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { patchFlatInput } from 'components/managers/tech-card/components/design/flat-input';
import { FlatInputPictures } from 'components/managers/tech-card/components/design/flat-input-pictures';
import { flatWordsSent } from 'components/managers/tech-card/components/design/flat-route';
import {
  FlatWordsField,
  useFlatWords,
} from 'components/managers/tech-card/components/design/flat-words-field';
import {
  FlatRunRow,
  type FlatSelection,
} from 'components/managers/tech-card/components/design/flat-run-row';
import { useDesignBand } from 'components/managers/tech-card/components/design/use-design-band';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from 'ui/components/tooltip';

declare global {
  interface Window {
    __api: Record<string, (body: unknown) => unknown>;
    __picturesForm: UseFormReturn<Record<string, unknown>>;
    /** The SAVED card as the server reads it: 300's purpose (the stand's one board edit). */
    __server: { mood300: boolean };
    /** Autosave as the card reports it: a save lands → status `saved`, a new `lastSavedAt`. */
    __autosave: (next: { status: AutosaveApi['status']; lastSavedAt?: number }) => void;
    /** Mount / unmount the input's pictures (the step switch to MOODBOARD and back). */
    __mountPictures: (on: boolean) => void;
    __previewAnswer: (req: PreviewDesignRunInputsRequest) => PreviewDesignRunInputsResponse;
    /** M14: what the stubbed `+ picture` slot hands over on its next click. */
    __pick: { id: number }[];
    __img: typeof img;
    /** M14: the saved board as the server reads it — pictures added through the input. */
    __added: { views: number[]; held: Record<number, string>; detail: number[] };
    __patchFlatInput: typeof patchFlatInput;
    __flatWordsSent: typeof flatWordsSent;
    /** M14: the card cannot be written — the input shows no add slot. */
    __disablePictures: (on: boolean) => void;
  }
}

const CARD = 38;
const img = (id: number, w = 600, h = 800) => ({
  id,
  media: {
    fullSize: { mediaUrl: `http://probe.local/img/${id}.svg`, width: w, height: h },
    compressed: { mediaUrl: `http://probe.local/img/${id}.svg`, width: w, height: h },
    thumbnail: { mediaUrl: `http://probe.local/img/${id}.svg`, width: w, height: h },
  },
});
const SIDES = ['front', 'back', 'side_l', 'side_r'];

const band = {
  bench: [
    ...SIDES.map((viewKey, i) => ({
      id: i + 1,
      viewKey,
      kind: 'flat',
      pictureId: 955 + i,
      picture: { id: 955 + i, runId: 189, kind: 'flat', media: img(955 + i, 700, 700) },
      slotRev: 3,
    })),
    {
      id: 92,
      viewKey: 'detail',
      detailName: 'Crossed racerback straps',
      kind: 'flat',
      pictureId: 0,
      slotRev: 1,
    },
    {
      id: 125,
      viewKey: 'detail',
      detailName: 'Crossed back straps',
      kind: 'flat',
      pictureId: 334,
      picture: { id: 334, runId: 150, kind: 'flat', media: img(334, 700, 700) },
      slotRev: 2,
    },
    {
      id: 126,
      viewKey: 'detail',
      detailName: 'Layered neckline',
      kind: 'flat',
      pictureId: 455,
      picture: { id: 455, runId: 188, kind: 'flat', media: img(455, 700, 700) },
      slotRev: 2,
    },
  ],
  references: [
    {
      techCardId: CARD,
      mediaId: 124,
      role: 'front',
      ordinal: 4,
      labelState: 'ok',
      labelSource: 'model_cheap',
    },
    {
      techCardId: CARD,
      mediaId: 126,
      role: 'back',
      ordinal: 2,
      labelState: 'ok',
      labelSource: 'model_cheap',
    },
    {
      techCardId: CARD,
      mediaId: 125,
      role: 'side_l',
      ordinal: 3,
      labelState: 'ok',
      labelSource: 'model_cheap',
    },
    {
      techCardId: CARD,
      mediaId: 300,
      role: 'front',
      ordinal: 5,
      labelState: 'ok',
      labelSource: 'person',
    },
    {
      techCardId: CARD,
      mediaId: 301,
      role: 'front',
      ordinal: 6,
      labelState: 'ok',
      labelSource: 'person',
    },
    {
      techCardId: CARD,
      mediaId: 211,
      role: 'detail',
      detailSlotId: 126,
      ordinal: 1,
      labelState: 'ok',
      labelSource: 'model_strong',
    },
  ],
  runs: [],
  totalRuns: 0,
} as unknown as GetDesignBandResponse;

/* THE SERVER'S RULE, AS THE STAND KNOWS IT: a views press — the two newest of each view (front 301
   and 300 beat 124), back, side L; the detail photo and the mood picture stay home. A detail press —
   its photos, then the accepted BACK and FRONT plates, then the asked slot with no picture. */
const ref = (mediaId: number, role: string) => ({ mediaId, role, media: img(mediaId) });
window.__server = { mood300: false };
window.__added = { views: [], held: {}, detail: [] };
window.__previewAnswer = (req) => {
  const ids = req.params?.detailSlotIds ?? [];
  if (!ids.length) {
    // 300 saved as mood: the two newest fronts are 301 and 124.
    const fronts = window.__server.mood300 ? [301, 124] : [301, 300];
    return {
      inputs: {
        refs: [
          ...fronts.map((id) => ref(id, 'front')),
          ref(126, 'back'),
          ref(125, 'side_l'),
          ...window.__added.views.map((id) => ref(id, 'side_r')),
        ],
        slots: [],
      },
      held: [
        { mediaId: 124, reason: 'older', role: 'front' },
        { mediaId: 211, reason: 'detail', role: 'detail' },
        { mediaId: 916, reason: 'mood', role: '' },
        ...Object.entries(window.__added.held).map(([id, reason]) => ({
          mediaId: Number(id),
          reason,
          role: '',
        })),
      ],
    } as unknown as PreviewDesignRunInputsResponse;
  }
  const slot = ids[0];
  const detail = band.bench?.find((b) => b.id === slot);
  return {
    inputs: {
      refs:
        slot === 126
          ? [ref(211, 'detail'), ...window.__added.detail.map((id) => ref(id, 'detail'))]
          : [],
      slots: [
        { viewKey: 'back', slotId: 0, mediaId: 956, media: img(956, 700, 700) },
        { viewKey: 'front', slotId: 0, mediaId: 955, media: img(955, 700, 700) },
        { viewKey: 'detail', slotId: slot, mediaId: 0, detailName: detail?.detailName ?? '' },
      ],
    },
    held: [{ mediaId: 916, reason: 'mood', role: '' }],
  } as unknown as PreviewDesignRunInputsResponse;
};

window.__pick = [];
window.__img = img;
window.__patchFlatInput = patchFlatInput;
window.__flatWordsSent = flatWordsSent;
window.__api = {
  // M14: card 38's server keeps the flat words; card 39's (an older binary) does not know the field.
  GetTechCard: (req) =>
    (req as { id?: number }).id === 38
      ? { techCard: { id: 38, techCard: { flatWords: '' } } }
      : { techCard: { id: 39, techCard: {} } },
  SetDesignReferenceRole: (req) => ({ reference: req }),
  GetDesignBand: () => structuredClone(band),
  PreviewDesignRunInputs: (req) => window.__previewAnswer(req as PreviewDesignRunInputsRequest),
  StartDesignRun: (req) => ({
    run: { id: 900, kind: 'flat', status: 'pending', params: (req as { params?: unknown }).params },
  }),
};

/** The INPUT's two halves, wired the way `ReferencesSection` wires them. */
function Input() {
  const { band: current, serverSpeaks, isLoading } = useDesignBand(CARD);
  const [selection, setSelection] = useState<FlatSelection | null>(null);
  const [mounted, setMounted] = useState(true);
  window.__mountPictures = setMounted;
  const [off, setOff] = useState(false);
  window.__disablePictures = setOff;
  const [saving, setSaving] = useState<{ status: AutosaveApi['status']; lastSavedAt?: number }>({
    status: 'saved',
    lastSavedAt: 1,
  });
  window.__autosave = setSaving;
  const autosave: AutosaveApi = {
    ...saving,
    request: () => {},
    flush: async () => 'nothing',
  };
  return (
    <AutosaveContext.Provider value={autosave}>
      <DesignCapabilityProvider value={serverSpeaks}>
        <div data-probe-state={isLoading ? 'loading' : 'ready'} className='space-y-4'>
          {mounted && (
            <FlatInputPictures
              techCardId={CARD}
              band={current}
              selection={selection}
              disabled={off}
            />
          )}
          <div data-probe-words='38'>
            <FlatWordsField techCardId={CARD} />
          </div>
          <div data-probe-words='39'>
            <FlatWordsField techCardId={39} />
          </div>
          <Sent />
          <FlatRunRow band={current} techCardId={CARD} onSelection={setSelection} />
        </div>
      </DesignCapabilityProvider>
    </AutosaveContext.Provider>
  );
}

/** What the flat sends in words, as «what the model gets» reads it (the same hook). */
function Sent() {
  const { sent } = useFlatWords(CARD, false);
  return <pre data-probe-sent={sent} />;
}

const board = (mediaId: number, role: string) => ({
  mediaId,
  kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
  caption: '',
  role,
});

function CardForm() {
  const form = useForm<Record<string, unknown>>({
    defaultValues: {
      concept: 'a two-layer tank',
      categoryId: 1,
      garmentDescription:
        'garment: tank top\nfit: slim\nTwo-layer sleeveless top, slim body-hugging silhouette.',
      flatWords: '',
      technicalMedia: [{ mediaId: 990, kind: 'TECH_CARD_MEDIA_KIND_FRONT', caption: '' }],
      moodboardMedia: [
        board(211, 'detail'),
        board(126, 'target'),
        board(125, 'target'),
        board(124, 'target'),
        board(300, 'target'),
        board(301, 'target'),
        board(916, 'mood'),
      ],
    },
  });
  window.__picturesForm = form;
  return (
    <FormProvider {...form}>
      <Input />
    </FormProvider>
  );
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: 1 } },
});
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <BrowserRouter>
      <DictionaryProvider>
        <TooltipProvider>
          <div style={{ width: 1100, padding: 24, background: '#fff' }}>
            <CardForm />
          </div>
        </TooltipProvider>
      </DictionaryProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
