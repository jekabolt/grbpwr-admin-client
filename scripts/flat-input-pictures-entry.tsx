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
import {
  flatWordsSent,
  runFlatWords,
} from 'components/managers/tech-card/components/design/flat-route';
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
    /** M15: the server's label on a picture (null — no row), then the band is read again. */
    __label: (mediaId: number, patch: Record<string, unknown> | null) => Promise<void>;
    /** M15: a slot the model minted. */
    __mint: (slot: Record<string, unknown>) => void;
    __qc: QueryClient;
    __runFlatWords: typeof runFlatWords;
    /** M15: the next hold write fails (the tile must come back). */
    __holdFails: boolean;
    /** M15: the press's autosave flushes (a proposal applied while GENERATE reads). */
    __flushes: number;
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
  // M15: a render of this card (its picture is never a flat's input) and a cutout (it may be).
  runs: [
    {
      id: 640,
      kind: 'render',
      status: 'succeeded',
      pictures: [{ id: 6401, runId: 640, kind: 'render', media: img(804) }],
    },
    {
      id: 641,
      kind: 'cutout',
      status: 'succeeded',
      pictures: [{ id: 6411, runId: 641, kind: 'cutout', media: img(807) }],
    },
  ],
  totalRuns: 2,
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
    const roleOf = (id: number) =>
      (band.references ?? []).find((r) => r.mediaId === id)?.role || 'side_r';
    const isHeld = (id: number) =>
      (band.references ?? []).some((r) => r.mediaId === id && r.labelState === 'held');
    return {
      inputs: {
        refs: [
          ...fronts.map((id) => ref(id, 'front')),
          ref(126, 'back'),
          ref(125, 'side_l'),
          ...window.__added.views
            .filter((id) => roleOf(id) !== 'detail')
            .map((id) => ref(id, roleOf(id))),
        ].filter((r) => !isHeld(r.mediaId)),
        slots: [],
      },
      held: [
        ...(band.references ?? [])
          .filter((r) => r.labelState === 'held')
          .map((r) => ({ mediaId: r.mediaId, reason: 'held', role: r.role })),
        // A picture just dropped and not yet labelled: the server is still reading it (or it has no
        // purpose yet).
        ...(
          (window.__picturesForm?.getValues('moodboardMedia') ?? []) as {
            mediaId: number;
            role?: string;
          }[]
        )
          .filter(
            (row) =>
              row.mediaId >= 800 && !(band.references ?? []).some((r) => r.mediaId === row.mediaId),
          )
          .map((row) => ({
            mediaId: row.mediaId,
            reason: row.role ? 'pending' : 'unmarked',
            role: '',
          })),
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
  const heldNow = (id: number) =>
    (band.references ?? []).some((r) => r.mediaId === id && r.labelState === 'held');
  return {
    inputs: {
      refs:
        slot === 126
          ? [ref(211, 'detail'), ...window.__added.detail.map((id) => ref(id, 'detail'))]
          : (band.references ?? [])
              .filter(
                (r) =>
                  r.role === 'detail' &&
                  r.detailSlotId === slot &&
                  r.labelState === 'ok' &&
                  window.__added.views.concat(window.__added.detail).includes(r.mediaId ?? 0),
              )
              .map((r) => ref(r.mediaId ?? 0, 'detail'))
              .filter((r) => !heldNow(r.mediaId)),
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
window.__runFlatWords = runFlatWords;
window.__mint = (slot) => {
  (band.bench as unknown[]).push({
    kind: 'flat',
    viewKey: 'detail',
    pictureId: 0,
    slotRev: 1,
    ...slot,
  });
};
window.__label = async (mediaId, patch) => {
  const refs = (band.references ?? []) as Record<string, unknown>[];
  const at = refs.findIndex((r) => r.mediaId === mediaId);
  if (patch === null) {
    if (at >= 0) refs.splice(at, 1);
  } else if (at >= 0) refs[at] = { ...refs[at], ...patch };
  else refs.push({ techCardId: CARD, mediaId, ordinal: 20, ...patch });
  await window.__qc.invalidateQueries();
};
/* The server's two label writes, as the store answers them (109 §4): a role is a person's (human,
   ok — lifts a hold); a hold moves only the state. */
const setRef = (req: Record<string, unknown>) => {
  const refs = (band.references ?? []) as Record<string, unknown>[];
  const at = refs.findIndex((r) => r.mediaId === req.mediaId);
  const prev = at >= 0 ? refs[at] : { techCardId: CARD, mediaId: req.mediaId };
  const next = { ...prev, ...req };
  if (at >= 0) refs[at] = next;
  else refs.push(next);
  return next;
};
window.__patchFlatInput = patchFlatInput;
window.__flatWordsSent = flatWordsSent;
window.__api = {
  // M14: card 38's server keeps the flat words; card 39's (an older binary) does not know the field.
  GetTechCard: (req) =>
    (req as { id?: number }).id === 38
      ? { techCard: { id: 38, techCard: { flatWords: '' } } }
      : { techCard: { id: 39, techCard: {} } },
  SetDesignReferenceRole: (req) => {
    const r = req as { mediaId: number; role: string; detailSlotId?: number; ordinal?: number };
    return {
      reference: setRef({
        mediaId: r.mediaId,
        role: r.role,
        detailSlotId: r.role === 'detail' ? r.detailSlotId : 0,
        labelSource: 'human',
        labelState: 'ok',
      }),
    };
  },
  SetDesignReferenceHeld: (req) => {
    const r = req as { mediaId: number; held: boolean };
    if (window.__holdFails) throw new Error('nothing_to_hold');
    return { reference: setRef({ mediaId: r.mediaId, labelState: r.held ? 'held' : 'ok' }) };
  },
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
    flush: async () => {
      window.__flushes = (window.__flushes ?? 0) + 1;
      return 'nothing';
    },
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
  defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: 0 } },
});
window.__qc = qc;
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
