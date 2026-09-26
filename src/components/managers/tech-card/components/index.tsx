              {/* «concept & construction description» ПЕРЕЕХАЛ В STUDIO ЦЕЛИКОМ.
                  Он ушёл туда не ради симметрии с прототипом, а потому что там из выносок карточки
                  выводятся строки описания — то есть там единственное место, где пометка на эскизе
                  превращается в текст для фабрики. Держать здесь второй набор тех же полей значило
                  бы два `register` на одно имя формы: значение одно, а на экране два поля, из
                  которых одно молча отстаёт. Редактор аспектов уехал вместе с ними и передаётся
                  в студию узлом — печатный порядок concept → aspects → notes сохранён. */}

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_TechCard,
  common_TechCardInsert,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  techCardKeys,
  useCreateTechCard,
  useTechCardReadiness,
  useUpdateTechCard,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  formatTechCardDate,
  techCardErrorMessage,
} from 'components/managers/tech-cards/components/utils';
import { MaterialModal } from 'components/managers/materials/components/material-modal';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { techCardStageOptions } from 'constants/filter';
import { ROUTES, SECTION } from 'constants/routes';
import {
  applyServerFieldErrors,
  errorRootKey,
  flattenFieldErrors,
  revealField,
  transportRefusal,
} from 'utils/field-errors';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch, type FieldErrors, type UseFormReturn } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Section, SectionStack } from 'ui/components/section';
import { SectionHeader } from 'ui/components/section-header';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import { CalloutBox } from 'ui/components/callout-box';
import { Drawer } from 'ui/components/drawer';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { TechCardImportBanner } from '../import/import-banner';
import { ReleaseBlocker, ReleaseBlockersModal } from './release-blockers-modal';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import { BomField } from './bom-field';
import { ColorwayRecipes } from './colorway-recipe';
import { CompositionEntries } from './composition-entries';
import { ConstructionTab } from './construction-tab';
import { CostEstimateField } from './cost-estimate-field';
import { CostingField } from './costing-field';
import { DetailsEditor } from './details-editor';
import { IssuesField } from './issues-field';
import { AssemblyField } from './assembly-field';
import { LabelsField } from './labels-field';
import { MoneyPanel } from './money-panel';
import { PackagingRecipeField } from './packaging-recipe-field';
import { StyleProjects } from './style-projects';
import { TechCardTasksPanel } from './tech-card-tasks-panel';
import {
  activeVariantCount,
  AdoptLegacyOutputButton,
  OutputVariantsPanel,
  seedColourVariants,
} from './output-variants-field';
import { PackagingField } from './packaging-field';
import { PatternsField } from './patterns-field';
import { MarkersSection } from './nesting/markers-section';
import { PiecesTab } from './pieces-tab';
import { DevExpensesField } from './dev-expenses-field';
import { ReleasesField } from './releases-field';
import { RevisionsField } from './revisions-field';
import { SignoffsField } from './signoffs-field';
import { useEditHistory } from 'ui/components/annotation/history';
import { gateTechCardPayload, isDesignOnlyMediaKind } from './design/payload-gate';
import { useDesignBand } from './design/use-design-band';
import { CardDetails } from './design/card-details';
import { ArtifactsTab, StudioTab } from './design/studio-tab';
import {
  TechCardFormData,
  mapFormToTechCardInsert,
  mapTechCardToForm,
  techCardDefaultData,
  techCardSchema,
  toPurposeEnum,
  wireInt,
} from './schema';
import { useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
import { ProductionTab } from './production-tab';
import { SamplesTab } from './samples-tab';
import { SizeIdsField } from './size-ids-field';
import { SizeChartField } from './size-chart-field';
import { StyleFactsField } from './style-facts-field';
import { STYLE_FACT_KEYS } from './tech-card-options';
import { TechCardFittings } from './tech-card-fittings';
import { useTechCardDraft, type DraftStamp } from './useTechCardDraft';
import {
  auditOperationPresence,
  contradictsScreen,
  hasPresenceLoss,
  type PresenceAudit,
} from './operations-presence';
import {
  PresenceLossBanner,
  VersionSkewBanner,
  type VersionSkew,
} from './save-audit-banners';
import { useTechCardStagingRequired, type CommitOutcome } from './useTechCardStaging';
import {
  AutosaveContext,
  flushRefusalSentence,
  type AutosaveApi,
} from './design/autosave-contract';
import {
  bodyFingerprint,
  bodyMoved,
  bodyOnTheWire,
  bodyWorkOf,
  deepEqual,
  formOnTheWire,
  hasHttpStatus,
  isConflictError,
  settleFormAfterSave,
  useTechCardAutosaveController,
  watchOwnFailure,
  type GestureProps,
  type SaveMode,
  type SaveOutcome,
  type SaveResult,
} from './useTechCardAutosave';
import {
  restoreTextSections,
  textSnapshotOf,
  TEXT_SECTION_LABEL,
  useSaveHistory,
  type HistoryEntry,
} from './save-history';
import { formatSavedAt, SaveStatusChip } from './save-status-chip';
import { decideAutoStage, StageProgress, stageLabel, type FormErrorRow } from './stage-progress';

// U-2 / C-5: the fit select and its `FIT_OPTIONS` import left this file with the classification FKs
// — they render in GENERAL INFORMATION on CONSTRUCTION now (construction-general-info.tsx, which
// takes the same exported copy from `design/render/model.ts`).

const TABS = [
  { id: 'studio', label: 'studio' },
  { id: 'artifacts', label: 'artifacts' },
  // `sketch` И `moodboard` УДАЛЕНЫ ОТСЮДА ЦЕЛИКОМ, а не оставлены «на всякий случай».
  //
  // Обе свёрнуты в STUDIO (FOLDED_TABS), то есть `?tab=sketch` и `?tab=moodboard` резолвятся ДО
  // сверки с этим списком и никогда не становятся activeTab. Пока их id стояли здесь, под ними
  // жили две панели, которых не мог открыть ни рейл, ни ссылка, ни закладка, — мёртвый код с
  // комментарием, утверждавшим обратное. Ссылки при этом не сломаны: свёртка их и обслуживает.
  { id: 'patterns', label: 'patterns' },
  { id: 'samples', label: 'samples' },
  { id: 'bom', label: 'BOM' },
  { id: 'colorways', label: 'colorways' },
  { id: 'construction', label: 'construction' },
  { id: 'labels', label: 'labels & pkg' },
  { id: 'costing', label: 'costing' },
  { id: 'production', label: 'production' },
  { id: 'issues', label: 'issues' },
  { id: 'signoff', label: 'sign-off' },
  { id: 'history', label: 'history' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Tabs grouped into lifecycle bands so the rail reads at a glance (R-2): DESIGN what it is,
// DEVELOP how it's made, SPEC what ships. History stands alone.
const TAB_GROUPS: { band: string; tabs: TabId[] }[] = [
  // В DESIGN РОВНО ДВЕ ВКЛАДКИ, и это рейл самого прототипа (`40-organs.js`, константа `RAIL`:
  // `{ band: 'design', tabs: [['studio', 1], ['artifacts', 1]] }`). STUDIO — где на стиль смотрят:
  // доска настроения, референсы, эскизы, верстак. ARTIFACTS — во что эта работа заморожена. Вдвоём
  // они заменили пару moodboard/sketch, которая делила ОДНУ поверхность на два входа рейла; порядок
  // остался порядком работы: сначала смотрят, потом морозят.
  { band: 'design', tabs: ['studio', 'artifacts'] },
  // Patterns OPENS develop rather than closing design: nothing on it describes what the style is.
  // The size range, the measurement chart, the DXF sheets and the раскладки are the first artefacts
  // MADE from the sketch, and the sheets are filed by BOM material — «how it's made» throughout. It
  // leads the band because everything under it is downstream of a pattern: a sample is cut from
  // these sheets, and the marker on this tab is what the BOM's fabric consumption is measured from.
  //
  // Cut pieces live HERE too, directly under the DXF sheets. A piece is a property of the PATTERN,
  // not of a colour — every colourway cuts the same pieces — and they are literally created from
  // the sheets above them by «↔ детали кроя». They used to sit on colorways, so the dialog that
  // makes them and the list they land in were on different tabs. What stays on colorways is the
  // per-colourway fabric map: which article each piece is cut from IN THAT COLOUR.
  //
  // BOM sits directly under patterns, ahead of samples: the выкройки panel files its DXF sheets BY
  // BOM material line and names every rollgoods line with no sheet as a hole, so the tab that
  // DEFINES those lines belongs next to the tab that reads them — two entries apart it read as an
  // unrelated stop. Samples follow both, which is also the order the work happens in: you cannot
  // cut a sample before there is a pattern and a fabric to cut it from.
  { band: 'develop', tabs: ['patterns', 'bom', 'samples', 'colorways', 'construction'] },
  { band: 'spec', tabs: ['labels', 'costing', 'issues', 'signoff'] },
  // Production is its own band: it is what happens AFTER the spec is settled, and folding it into
  // `spec` would break the rail's lifecycle reading — the bands are the story of the card, in order.
  { band: 'produce', tabs: ['production'] },
  { band: '', tabs: ['history'] },
];

// Tabs that were folded into another one keep their deep links working: ?tab=dev became a costing
// section, ?tab=pieces a section of patterns (it lived on colorways in between). A shared link or a
// bookmark still lands on the right place, and the address bar is rewritten to match what is
// rendered. Both targets exist on every card, auxiliary included — which is why no alias needs
// re-resolving per card any more.
//
// TWO tabs fold into STUDIO, not one. `sketch` and `moodboard` were two independent entries here
// and in the rail — they rendered the SAME component in two modes, but a link, a bookmark and a
// toast could each name either one. Folding only `sketch` would leave every `?tab=moodboard` link
// landing on the header with no explanation.
const FOLDED_TABS: Record<string, TabId> = {
  dev: 'costing',
  pieces: 'patterns',
  // ОБЕ СТАРЫЕ ВКЛАДКИ СВЁРНУТЫ, и свёрнуты только теперь, когда за каждую отнятую способность
  // отвечает названное место. Мудборд студия заменила сразу: её доска пишет `moodboardMedia` и
  // указания на них. С техническим эскизом было три долга, и вот чем каждый закрыт.
  //
  // ЗАВЕСТИ ЭСКИЗ. Путь целиком: полка загрузок → слот верстака → лист на ARTIFACTS. Пока этой
  // вкладки не было, довод «свернём потом» был верен, и он держал `sketch` на рейле честно.
  //
  // (Здесь стояло, что плиты верстака вкладывает в `technicalMedia` документа СЕРВЕР, в транзакции
  // минта. Минта больше нет — версии листа снесены целиком, вместе с бэкендом, — и вкладывать
  // плиты в документ этим путём некому. Долг закрыт не этой транзакцией, а тем, что у эскиза
  // появилось НАЗВАННОЕ МЕСТО: верстак заводит плиту, лист её показывает. Оставить прежний текст
  // значило бы отправить читателя за доводом в файл, которого нет.)
  //
  // СНЯТЬ ЭСКИЗ. Раньше умел только `removeMedia` свёрнутой вкладки; теперь плиту откалывает от
  // документа ARTIFACTS, тем же правилом — выноски откалываются, их ТЕКСТ остаётся.
  //
  // НАРИСОВАТЬ УКАЗАНИЕ. Редактор не переписан и не потерян: он ТОТ ЖЕ САМЫЙ компонент, только
  // открывается модалкой над ARTIFACTS — над плитами, которые перечисляет документ, — а не
  // отдельной вкладкой. Не путать с векторным редактором из `proto-15-modal-vector.png`: тот
  // рисует ШТРИХИ по самому чертежу, слоями, с растром-калькой снизу, и он действительно
  // следующей волной; дверь `edit ▸` в верстаке ведёт именно к нему и остаётся инертной честно.
  //
  // Свернуть раньше, чем закрыт хоть один из трёх, значило бы выдать потерю за переезд.
  moodboard: 'studio',
  sketch: 'studio',
  // `header` тоже свёрнут: его блоки стали шапкой студии, как в прототипе.
  header: 'studio',
};

// Maps a form-error root key to the tab that owns it; unmapped keys are header fields.
const ERROR_TAB: Record<string, TabId> = {
  // All three moved with the surface that renders them: the moodboard grid, the technical sketch
  // grid and every callout on either of them now live on STUDIO. A row left pointing at a retired
  // tab does not fall back quietly — it routes the failed save to a tab the rail no longer draws,
  // and the toast then names a field nobody can see.
  moodboardMedia: 'studio',
  // `technicalMedia` ВЕДЁТ В `artifacts`, А НЕ В `studio` — потому что отказ обязан приводить туда,
  // где его можно ИСПРАВИТЬ. Список плит перечислен и правится на ARTIFACTS: там его открепляют,
  // там же открывается редактор указаний. Студия этот список не пишет вовсе — её верстак работает
  // со слотами полосы, а в документ они попадают минтом.
  technicalMedia: 'artifacts',
  callouts: 'studio',
  patterns: 'patterns',
  sizeIds: 'patterns',
  bomItems: 'bom',
  // Cut pieces (and their DXF block aliases) render on PATTERNS. A `pieces.N.*` violation routed
  // anywhere else raises a toast naming a field nobody can see.
  pieces: 'patterns',
  pieceDxfAliases: 'patterns',
  details: 'studio',
  construction: 'construction',
  // A CARD-level field (it deliberately does not live inside `construction` — see schema.ts), but it
  // RENDERS on the construction tab next to the free-text seam-allowance note it disambiguates.
  // Without this row it would fall through to the header default and the toast would name a field
  // that tab does not contain.
  requiredSeamAllowanceMm: 'construction',
  // C-5 (круг 19) → ⚠ ИСПРАВЛЕНО В КРУГЕ 20. Эти четыре строки указывали на `construction` и после
  // круга 20 стали ЛОЖЬЮ — ровно тем видом лжи, от которого предостерегает комментарий выше:
  // нарушение сервера приводило на вкладку, которая этого поля больше не показывает.
  //   · `fit` и `categoryId` живут в GENERAL INFORMATION (`construction-general-info.tsx`), а он
  //     смонтирован РОВНО ОДИН раз — `design/studio-tab.tsx:290`. Значит вкладка — STUDIO.
  //   · `baseModelId` и `baseSampleSizeId` ушли в СВОЙ блок шапки (B-27, `BaseModelFields` ниже в
  //     этом же файле), а шапка с Ф1 уезжает слотом `cardDetails` в `StudioTab`, который смонтирован
  //     ТОЛЬКО при `activeTab === 'studio'` (до Ф1 — `<SectionStack hidden={activeTab !== 'studio'}>`,
  //     тот же ответ). Значит `studio` здесь не «сойдёт любая», а
  //     единственное верное значение, ровно как и у первых двух. Строки оставлены, а не удалены:
  //     молчаливое падение в фолбэк выглядело бы как «про эти поля никто не думал».
  //     ⚠ ЗДЕСЬ РАНЬШЕ СТОЯЛ ЛОЖНЫЙ ДОВОД: «шапка стоит вне условия вкладки, поэтому годится
  //     любая». Значение он давал правильное СЛУЧАЙНО, и следующий переезд шапки на нём бы и
  //     сломался. Довод, который приводит к верному ответу по неверной причине, опаснее явной
  //     ошибки: его не проверяют.
  // Урок на следующий переезд: ERROR_TAB обязан обходиться вместе с монтажами, иначе он тихо
  // протухает — сломать его нельзя ни типом, ни сборкой, он врёт только в тосте у пользователя.
  fit: 'studio',
  categoryId: 'studio',
  baseModelId: 'studio',
  baseSampleSizeId: 'studio',
  operations: 'construction',
  labels: 'labels',
  packaging: 'labels',
  costing: 'costing',
  issues: 'issues',
  signoffs: 'signoff',
  revisions: 'history',
};

// Where each server release requirement (GetTechCardReadiness `key`) is fixed. The backend names and
// judges the condition; which tab clears it is this admin's navigation and cannot come over the
// wire. An unmapped key falls back to the header tab — a requirement added server-side later is
// still shown and still leads somewhere, rather than being silently dropped from the gate.
//
// Walked key by key when STUDIO/ARTIFACTS replaced moodboard/sketch: not one row here pointed at
// either of them, so the map is unchanged. Recorded rather than left implicit — the next tab move
// has to walk this map too, and «nothing to do» is only worth knowing if someone checked.
//
// Волна 25.09 (G2): `costing_computes` и `construction_graph` сюда не доходили и падали в фолбэк
// `studio` — блокер «себестоимость не считается» вёл на доску настроения. Теперь каждый ведёт туда,
// где его чинят.
const RELEASE_BLOCKER_TAB: Record<string, TabId> = {
  style_number: 'studio',
  size_range: 'patterns',
  bom_fabric: 'bom',
  bom_linked: 'bom',
  costing: 'costing',
  costing_computes: 'costing',
  construction_graph: 'construction',
  colorway_linked: 'colorways',
  lab_dip: 'colorways',
  signoffs: 'signoff',
};

const RELEASED = 'TECH_CARD_APPROVAL_STATE_RELEASED';
const DRAFT = 'TECH_CARD_APPROVAL_STATE_DRAFT';
const SIGNOFF_APPROVED = 'TECH_CARD_SIGNOFF_STATE_APPROVED';

/**
 * АВТО-СТЕЙДЖ (D-14, волна 25.09). Одна константа, которой он выключается целиком: селекта стейджа
 * больше нет, и `false` здесь оставляет стейдж там, где он сохранён, — до следующей волны.
 */
const AUTO_STAGE = true;
/** D-14': каскад не длиннее пяти шагов за жизнь страницы (IDEA → PROD — ровно пять). */
const AUTO_STAGE_MAX_STEPS = 5;

/** What one write of the card did (see writeTechCard). */
type WriteResult = { bodySaved: boolean; ok: boolean; outcome: SaveOutcome; message?: string };

/**
 * What a read of the card means for this page (M-3): `same` — nothing newer than the card it stands on;
 * `adopted` — the version moved and the body did not (a panel, a roll-up); `rebased` — another editor
 * moved the body and this form, pristine, now stands on theirs; `conflict` — they moved it under this
 * page's unsaved work.
 */
type ReadVerdict = 'same' | 'adopted' | 'rebased' | 'conflict';

/**
 * A deep copy of the form values, or null when the values cannot be cloned (then the caller skips
 * whatever needed the copy — never a reason to fail a save). RHF writes nested values IN PLACE, so
 * «what the form held at time T» needs a real copy, not `getValues()`'s shallow one.
 */
function cloneFormValues(v: TechCardFormData): TechCardFormData | null {
  try {
    return structuredClone(v);
  } catch {
    return null;
  }
}

/** M-02: what the quiet check found, one row per field (a field can fail several rules at once). */
function quietIssues(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Array<{ path: string; message: string }> {
  const byPath = new Map<string, { path: string; message: string }>();
  for (const i of error.issues) {
    const path = i.path.map(String).join('.');
    if (!byPath.has(path)) byPath.set(path, { path, message: i.message });
  }
  return [...byPath.values()];
}

/**
 * The page's two providers as ONE element: the form, and the one autosave the header chip and the
 * studio's organs share (design/autosave-contract.ts). One element on purpose: nesting a second
 * provider inline would re-indent the ~900 lines of the page body for no change in behaviour.
 */
function FormWithAutosave({
  form,
  autosave,
  gestures,
  children,
}: {
  form: UseFormReturn<TechCardFormData>;
  autosave: AutosaveApi;
  /** m5: the operator's gestures, heard on the page's own root (portals of the page included). */
  gestures: GestureProps;
  children: React.ReactNode;
}) {
  return (
    <Form {...form}>
      <AutosaveContext.Provider value={autosave}>
        {/* `contents`: an element for the capture handlers, no box — the page's layout is unchanged. */}
        <div className='contents' {...gestures}>
          {children}
        </div>
      </AutosaveContext.Provider>
    </Form>
  );
}

function PreSaveTile({ label }: { label: string }) {
  return (
    <div className='flex aspect-square flex-col items-center justify-center gap-1 border border-dashed border-textInactiveColor p-2 text-center'>
      <Text variant='inactive' size='small'>
        {label}
      </Text>
    </div>
  );
}

// Shown on the LABELS & PKG tab for a brand-new (unsaved) card: the assembly bill, packaging recipe
// and dust-bag option are per-style and need a saved card id (their own RPCs, not the main insert),
// so instead of silently hiding them we say so and offer Save — which lands the user right back
// here on the saved card (see doSubmit's create branch).
function PreSavePrompt({
  canWrite,
  saving,
  onSave,
}: {
  canWrite: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className='flex flex-col items-start gap-4 border border-textInactiveColor bg-textColor/5 p-4'>
      <div className='space-y-1'>
        <Text variant='uppercase'>save the tech card first</Text>
        <Text variant='inactive' size='small'>
          on-garment items (labels / tags), the packaging recipe and the “goes in a dust bag” option
          are stored per style — they need a saved card to attach to. Save now and they unlock right
          here.
        </Text>
      </div>
      <div className='grid w-full max-w-md grid-cols-3 gap-2'>
        <PreSaveTile label='on-garment items' />
        <PreSaveTile label='packaging recipe' />
        <PreSaveTile label='dust bag' />
      </div>
      {canWrite && (
        <Button
          type='button'
          variant='main'
          size='lg'
          className='uppercase'
          loading={saving}
          onClick={onSave}
        >
          save tech card
        </Button>
      )}
    </div>
  );
}

export function TechCardForm({
  isEditMode,
  id,
  techCard,
}: {
  isEditMode: boolean;
  id?: string;
  techCard?: common_TechCard;
}) {
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const createTechCard = useCreateTechCard();
  const updateTechCard = useUpdateTechCard();
  const { canWrite, canReadCosting, canWriteCosting } = usePermissions();
  // Одно чтение полосы на страницу: студия и артефакты читают тот же ключ React Query, поэтому
  // лишнего запроса здесь не появляется — только ответ на вопрос «можно ли слать поля полосы».
  const { serverSpeaks: bandAnswered } = useDesignBand(
    id ? parseInt(id, 10) || undefined : undefined,
  );
  // И ЕЩЁ ОДИН СВИДЕТЕЛЬ, БЕЗ КОТОРОГО ГЕЙТ ТЕРЯЕТ ДАННЫЕ В ОКНЕ ЗАГРУЗКИ.
  //
  // `serverSpeaks` ложен, пока чтение полосы ещё идёт. Сохранение в это окно прошло бы через ветку
  // «сервер не знает полосу», а она не только снимает `mood_note` — она СВОРАЧИВАЕТ новые виды
  // медиа к старым. То есть живая карточка на бете, сохранённая через две секунды после открытия,
  // потеряла бы вид своих картинок молча.
  //
  // Ответ берётся не из тайминга, а из самой карточки: если сервер уже отдал нам поле полосы, этот
  // сервер про полосу знает — свидетельство, а не догадка. Карточке без единого такого факта
  // терять нечего, и для неё окно загрузки безвредно.
  const cardCarriesDesignFacts = useMemo(() => {
    // Читается через ту же форму записи, что и `mapTechCardToForm`: на проводе оба списка живут
    // на `TechCardInsert`, а прочитанная карточка отдаётся той же формой. Каст здесь — тот же
    // приём, которым `splitSketchMedia` достаёт легаси-список.
    const tc = techCard?.techCard as
      | (common_TechCardInsert & { moodNote?: string })
      | undefined;
    if (!tc) return false;
    if ((tc.moodNote ?? '').trim()) return true;
    const media = [...(tc.moodboardMedia ?? []), ...(tc.technicalMedia ?? [])];
    return media.some((m) => isDesignOnlyMediaKind(m?.kind));
  }, [techCard]);
  const designBandSpeaks = bandAnswered || cardCarriesDesignFacts;
  const queryClient = useQueryClient();
  // Sub-panels stage their mutation here instead of firing it; the header's one save commits the
  // card body and then this queue (phase 19).
  const staging = useTechCardStagingRequired();
  // A partial failure is a fact about a save that already half-happened, so it stays on screen
  // until the next save rather than passing through a toast.
  const [stagingError, setStagingError] = useState<string | null>(null);
  // РАСХОЖДЕНИЕ ВЕРСИЙ (Ф5): сервер не узнал того, что видно на экране. Это не ошибка поля и не
  // ошибка человека, поэтому живёт баннером, а не краснотой у контрола.
  const [versionSkew, setVersionSkew] = useState<VersionSkew | null>(null);
  // АУДИТ ПРИСУТСТВИЯ (Ф7): сохранение прошло, а часть отправленных фактов не вернулась. Держится
  // на странице как `stagingError` — это факт о записи, и он требует решения, а не уведомления.
  const [presenceLoss, setPresenceLoss] = useState<PresenceAudit | null>(null);

  const numId = id ? parseInt(id, 10) : undefined;

  // URL-driven state. ?stage=… seeds a freshly-created card's stage ([new idea] → IDEA); ?tab=…
  // and ?sample=/?fits= make the open section / sample / fittings-filter deep-linkable (R-1).
  // Both params are validated — a mistyped shared link must not seed a garbage enum into the
  // form (the backend would 400 with no field pointer) or park the page on a blank tab.
  const [params, setParams] = useSearchParams();
  const stageParam = params.get('stage');
  const initialStage = techCardStageOptions.some((o) => o.value === stageParam)
    ? (stageParam as TechCardFormData['stage'])
    : undefined;

  const form = useForm<TechCardFormData>({
    resolver: zodResolver(techCardSchema),
    defaultValues: techCard
      ? mapTechCardToForm(techCard)
      : initialStage
        ? { ...techCardDefaultData, stage: initialStage }
        : techCardDefaultData,
    mode: 'onSubmit',
  });

  // NF-07 auxiliary items: an aux card produces a packaging material, links no products, and needs
  // an output material set before its first run. Read HERE, above the tab plumbing, because which
  // tabs exist depends on it — the folded-alias resolution and isTabVisible both branch on isAux.
  const purpose = toPurposeEnum(
    useWatch({ control: form.control, name: 'purpose' }) as string | undefined,
  );
  const isAux = purpose === 'TECH_CARD_PURPOSE_AUXILIARY';

  // Switching tabs drops a stale ?sample= / ?fits=; extra params (a sample to open, a fittings
  // filter) can be set in the same navigation (spine deep links).
  const rawTab = params.get('tab');
  // A folded alias has to resolve to a tab that EXISTS on this card. Both fold targets (costing,
  // patterns) do on every card, including an auxiliary one — ?tab=pieces used to fold onto
  // colorways, which an aux card does not have, and that needed a per-card rewrite here. Since the
  // cut-piece table moved to PATTERNS the alias is unconditional.
  const tabParam = rawTab ? FOLDED_TABS[rawTab] ?? rawTab : rawTab;
  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'studio';
  // Whether this page is still on screen — for the side effects of a write that outlives it (R-13).
  // m6: true from the first render — a child's mount effect runs BEFORE this one, and a tab it asks
  // for on mount must not be dropped as «the page is gone».
  const pageMounted = useRef(true);
  useEffect(() => {
    pageMounted.current = true;
    return () => {
      pageMounted.current = false;
    };
  }, []);
  // R-13: a write that outlives the page (the create's panels, the autosave's unmount flush) must not
  // move the operator: react-router's navigate does not die with the page, and a replace-navigation
  // from here would pull them back to this card — or to a blank create form — from wherever they went.
  const navTo = (id: TabId, extra?: Record<string, string>) => {
    if (!pageMounted.current) return;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', id);
        if (id !== 'samples') p.delete('sample');
        p.delete('fits');
        for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
        return p;
      },
      { replace: true },
    );
  };
  const setActiveTab = (id: TabId) => navTo(id);
  /**
   * УСПЕХ ОСТАВЛЯЕТ ФУЛСКРИН ОТКРЫТЫМ, ЛЮБОЙ НЕУСПЕХ ЗАКРЫВАЕТ. Правило одно, и механика его живёт
   * ЗДЕСЬ, а не в фулскрине: об исходе сохранения знает только эта страница.
   *
   * Почему закрывает. Всё, чем отказ объясняется и лечится, стоит ПОД оверлеем: переключение на
   * вкладку с ошибочным полем и его пульс (`revealField`), баннер частично сохранённых панелей,
   * модалка конфликта версий, кнопка «снять разметку узлов» — единственный выход из серверного
   * щита. Оставить фулскрин открытым значит показать тост и спрятать от человека ответ на него.
   * Тост при этом виден в обоих случаях: `--z-toast` (70) выше `--z-modal` (50).
   *
   * Функциональный апдейтер и `replace` — по той же причине, что у `navTo`: снимок параметров в
   * замыкании затирает соседей, а push засоряет Back.
   */
  //
  // R-13: never after the page is gone (see navTo) — react-router 7.2 never resets its activeRef, so
  // its navigate outlives the page.
  const leaveFullscreen = () => {
    if (!pageMounted.current) return;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('fs');
        return p;
      },
      { replace: true },
    );
  };
  const [conflict, setConflict] = useState(false);
  // ревью MJ-3: a restore over a card that moved since the draft waits for this answer.
  const [restoreAsk, setRestoreAsk] = useState<{
    id: string | undefined;
    from: number | null;
    to: number;
  } | null>(null);
  // ревью mn-5: the conflict decision is PENDING from the moment it opens until «keep mine» answers it
  // (the modal's own close only hides it; the chip shows it again). While it is pending nothing is
  // written — a write that was already on its way to the wire (the check before it awaited) included.
  const conflictOpen = useRef(false);
  const openConflict = () => {
    conflictOpen.current = true;
    setConflict(true);
  };
  // A sellable→auxiliary save held back until the operator answers for the live colourways it has to
  // retire first (NF-07 purpose lock). Carries the validated payload so «archive & switch» re-runs
  // exactly the save that was intercepted, not whatever the form holds a few seconds later.
  const [convert, setConvert] = useState<{
    data: TechCardFormData;
    colorways: common_AdminColorwayRef[];
  } | null>(null);
  const [converting, setConverting] = useState(false);
  // What a half-finished convert left behind. Like stagingError this is a fact about a write that
  // already partly happened, so it stays on screen instead of passing through a toast.
  const [convertReport, setConvertReport] = useState<string | null>(null);
  // 0252: offer to carry the colours over. The colourways being archived ARE the card's colour
  // range, and re-picking them one by one afterwards is the same list typed twice. Opt-out rather
  // than opt-in — the operator who converts a multi-colour style almost always wants the buckets —
  // but it runs strictly AFTER the flip has landed, so a declined or failed flip seeds nothing.
  const [seedColours, setSeedColours] = useState(true);
  // Colourways THIS page archived, which the `techCard` prop does not know about yet. Without it the
  // window between the archive loop and the refetch landing is a trap: a save that 409s, answered
  // with «keep mine & overwrite», re-enters doSubmit against the stale prop, re-opens the convert
  // dialog and re-archives already-ARCHIVED colourways — and archive is not idempotent (ARCHIVED has
  // no outgoing archive edge), so the retry hard-fails and the report lies about where it stopped.
  const archivedIds = useRef(new Set<number>());
  // The set holds ONLY "archived by us, not yet confirmed by a read": each id drops out the moment
  // the server's own copy says ARCHIVED. Without this it would outlive the fact — a colourway
  // restored from its own page would stay invisible here for the rest of the session.
  useEffect(() => {
    if (archivedIds.current.size === 0) return;
    for (const c of techCard?.colorways ?? []) {
      if (c.status === 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED')
        archivedIds.current.delete(c.colorwayId ?? 0);
    }
  }, [techCard?.colorways]);
  // The version the NEXT body save must claim. Null = the loaded card's, the normal case. A 409 that
  // the operator answered with «keep mine & overwrite» parks the server's CURRENT version here: the
  // techCard prop stays stale after a failed save (nothing invalidates it, and the query neither
  // refetches on focus nor remounts), so without this the retry resent the same rejected version and
  // 409'd forever — the modal's overwrite affordance could never do what it said. A ref, not state:
  // the handler re-runs the save immediately after setting it.
  const lockOverride = useRef<number | null>(null);
  const [blockersOpen, setBlockersOpen] = useState(false);
  // Экспорт архива: держим только «идёт запрос», чтобы не выпустить второй по двойному клику.
  // Ссылку НЕ храним — она presigned и живёт 10 минут, а хранимая ссылка молча протухает в руках.
  const [exportingArchive, setExportingArchive] = useState(false);
  // Drawer state lives in the URL so it survives a refresh and can be linked to.
  const tasksOpen = params.get('tasks') === '1';
  // The field a failed save should walk the user to. `nonce` re-arms the effect when the SAME field
  // fails twice in a row (a second Save without fixing anything must pulse again, not sit silent).
  const [focusTarget, setFocusTarget] = useState<{ path: string; nonce: number } | null>(null);
  // bump to jump to the BOM tab and pulse the empty composition fields (from labels care-gen)
  const [bomHighlight, setBomHighlight] = useState(0);
  const goToBomComposition = () => {
    setActiveTab('bom');
    setBomHighlight((n) => n + 1);
  };

  // The loaded card's server state freezes the body; the user's in-form approval value
  // drives the Release gate.
  const frozen = techCard?.techCard?.approvalState === RELEASED;
  const styleNumber = useWatch({ control: form.control, name: 'styleNumber' });

  // ИСТОРИЯ ОТКАТА УКАЗАНИЙ — ОДНА НА ФОРМУ, а не на вкладку.
  //
  // Эскиз и мудборд смонтированы ОДНОВРЕМЕННО (переключение вкладок — это `hidden`) и пишут ОДИН
  // массив `callouts`. Две истории над одним массивом означали, что откат на эскизе возвращает
  // снимок, снятый ДО правок мудборда, — и три заметки, поставленные на другой вкладке, исчезают
  // молча, потому что их не видно.
  const calloutValues = (useWatch({ control: form.control, name: 'callouts' }) ?? []) as never[];
  const calloutHistory = useEditHistory(calloutValues, (prev) =>
    form.setValue('callouts', prev, { shouldDirty: true }),
  );
  const name = useWatch({ control: form.control, name: 'name' });
  const issues = (useWatch({ control: form.control, name: 'issues' }) ?? []) as Array<{
    status?: string;
  }>;
  const openIssues = issues.filter((i) => i.status === 'TECH_CARD_ISSUE_STATUS_OPEN').length;
  const signoffs = (useWatch({ control: form.control, name: 'signoffs' }) ?? []) as Array<{
    state?: string;
  }>;
  // Every present sign-off must be APPROVED (a REJECTED / PENDING row blocks release) and at least
  // one must exist — so a card can no longer be released with zero sign-offs (M10).
  const signoffsApproved =
    signoffs.length > 0 && signoffs.every((s) => s.state === SIGNOFF_APPROVED);

  // Lifecycle spine inputs: current stage/approval drive the stepper.
  const stage = (useWatch({ control: form.control, name: 'stage' }) ?? '') as string;
  const isIdea = stage === 'TECH_CARD_STAGE_IDEA';
  // The server's readiness checklist. The lifecycle strip reads the SAME cached query for its stage
  // rows; this call is here for `releaseRequirements`, which is a second, independent list.
  const {
    data: readiness,
    isPending: readinessPending,
    isError: readinessError,
  } = useTechCardReadiness(isEditMode ? numId : undefined);
  // The style's batches. Read here as well as inside the production tab so the rail's completion
  // glyph knows whether the tab has content — React Query serves both from ONE cached list, keyed by
  // the same arguments, so this is not a second request.
  const { data: productionRunsData } = useProductionRuns(
    numId ?? 0,
    '',
    0,
    false,
    isEditMode && !!numId,
  );
  const productionRunCount = productionRunsData?.runs?.length ?? 0;
  // Release freezes the card as the factory-facing spec, so what it takes is stated once, below.
  // The old M8/M3 gap note is gone with the guesswork it described: colourway lab-dip approval could
  // never be gated here (the read model exposes no labDipStatus — the field lives only on the
  // write-only ColorwayDevelopmentInsert), and the readiness RPC now scores it server-side.
  const bomItemsW = (useWatch({ control: form.control, name: 'bomItems' }) ?? []) as Array<{
    materialId?: number;
    id?: number;
    lineKey?: string;
  }>;
  // ONE release-blocker list, rendered three ways (the header's release organ, the blockers
  // modal, the ReleasesField gate). Its spine is now the SERVER's release checklist —
  // `releaseRequirements` from GetTechCardReadiness — which knows things this screen never could
  // (costing currency, an unapproved lab dip, an empty size range) and phrases each failure as a
  // fact.
  // Server rows are scored against SAVED data, so a fix made in the form counts once it is saved.
  // That is the right reading here: release freezes the saved spec as the factory-facing document.
  // Each blocker still carries the tab that fixes it, so every rendering navigates identically.
  const serverReleaseRows = (readiness?.releaseRequirements ?? []).filter(
    // The one fact the readiness RPC cannot know (same filter, same reason as stage-progress.tsx:
    // the facts query has no notion of `purpose`): an NF-07 auxiliary card produces a packaging
    // material and links no products BY DESIGN, so `colorway_linked` — and the `lab_dip` row that
    // only exists to score those colourways — would sit permanently unmet. Worse than merely wrong
    // since the colourways tab became aux-hidden: both chips route to RELEASE_BLOCKER_TAB
    // 'colorways', which for an aux card bounces straight back to header, i.e. a dead control that
    // states an unfixable requirement. Dropped, not failed.
    (r) => !(isAux && (r.key === 'colorway_linked' || r.key === 'lab_dip')),
  );
  const releaseBlockers: (ReleaseBlocker & { tab: TabId })[] = serverReleaseRows
    .filter((r) => !r.met)
    .map((r) => ({
      label: r.label ?? 'a release requirement is unmet',
      detail: r.detail,
      tab: RELEASE_BLOCKER_TAB[r.key ?? ''] ?? 'studio',
    }));
  // The two facts no readiness row answers: the stage is a live form value the server has not been
  // handed yet, and issues are not part of the readiness facts at all.
  if (isIdea)
    releaseBlockers.push({
      label: 'advance the stage (an IDEA draft can’t be released)',
      tab: 'studio',
    });
  if (openIssues > 0)
    releaseBlockers.push({
      label: `resolve ${openIssues} open issue${openIssues > 1 ? 's' : ''}`,
      tab: 'issues',
    });
  // #64 under slots: a slot needs an ARTICLE to be releasable — its own default, or a pin in EVERY
  // live (non-archived) colourway. Mirrors the server's bom_linked rule word-for-word; that rule
  // sits on the PP stage checklist, not on release, so this stays a client rule and no duplicate.
  // The old blanket "link a material on every line" wrongly blocked a role-only slot that every
  // colourway pins — under the slot model that slot is fully specified.
  // The style's LIVE colourways — archived ones are retired work. The single source for both the
  // release gate below and the purpose lock warning on the header tab: the server's purpose lock
  // counts `product.lifecycle_status <> archived` too, so a card whose colourways are all archived
  // is free to flip and must not be told otherwise.
  const liveColorways = (techCard?.colorways ?? []).filter(
    (c) =>
      c.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED' &&
      !archivedIds.current.has(c.colorwayId ?? 0),
  );
  const slotCovered = (b: { materialId?: number; id?: number; lineKey?: string }) => {
    if ((b.materialId ?? 0) > 0) return true;
    if (liveColorways.length === 0) return false;
    return liveColorways.every((c) =>
      (c.usages ?? []).some(
        (u) =>
          ((wireInt(u.bomItemId) > 0 && wireInt(u.bomItemId) === wireInt(b.id)) ||
            (!!b.lineKey && u.bomLineKey === b.lineKey)) &&
          wireInt(u.materialId) > 0,
      ),
    );
  };
  if (bomItemsW.some((b) => !slotCovered(b)))
    releaseBlockers.push({
      label: 'every BOM slot needs an article — a default, or a pin in every live colourway',
      tab: 'bom',
    });
  // Sign-offs are the one rule both sides know, and the server states it better ("2 of 5 sign-offs
  // are not approved"). The form-derived check survives ONLY as the fallback for a checklist that
  // has not arrived (in flight, or the call failed): an advisory RPC must never WIDEN the gate.
  // Tested against the RAW rows, not the aux-filtered ones — "the checklist has not arrived" and
  // "every row in it was dropped as inapplicable" are different states, and only the first one
  // justifies falling back to the weaker client-side rule.
  if ((readiness?.releaseRequirements?.length ?? 0) === 0 && !signoffsApproved)
    releaseBlockers.push({
      label:
        signoffs.length === 0
          ? 'sign off every required section first'
          : 'every sign-off section must be APPROVED',
      tab: 'signoff',
    });
  const canRelease = releaseBlockers.length === 0;
  // `purpose` / `isAux` are read further up — the tab plumbing branches on them.
  const outputMaterialId = (useWatch({ control: form.control, name: 'outputMaterialId' }) ??
    0) as number;
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  // 0252 colour variants. Read off the CARD, never the form: they are written by their own RPCs
  // (a variant owns warehouse stock, so the full-replace save must not be able to re-mint or drop
  // one), which also means they are already saved — there is nothing here for Save to carry.
  const outputVariants = techCard?.outputVariants ?? [];
  // ANY variant — active or retired — pins the auxiliary purpose. Only the ACTIVE ones ENABLE a
  // run: each owns the warehouse bucket its output is booked into, so a card whose colours are all
  // retired is back to needing the single output material before anything can be planned.
  const liveVariants = activeVariantCount(outputVariants);

  // Autosave the working draft to localStorage (Q9b): leaving the route (to /materials, /fitting,
  // the product manager) or a hard refresh no longer loses unsaved edits — restore on return.
  const draftKey = isEditMode ? `edit.${numId ?? id ?? '0'}` : 'new';
  // Only the two staging functions, pinned: `staging` itself is a fresh object every render (it
  // carries the live `changes` array), and handing that straight to the hook restarted its debounced
  // autosave timer on every render — a card being edited could keep re-arming the timer and never
  // actually persist the staged snapshots the restore banner then promises.
  const stagingIO = useMemo(
    () => ({ serialize: staging.serialize, hydrate: staging.hydrate }),
    [staging.serialize, staging.hydrate],
  );
  const draft = useTechCardDraft(
    form,
    draftKey,
    canWrite(SECTION.techCards) && !frozen,
    staging.changes.length > 0,
    stagingIO,
    // Every movement of the staged queue re-writes the draft, not only the first (B-04).
    staging.revision,
    {
      // mn-3: on a saved card the work worth a draft is the body's (and the queue's); a new card's
      // create writes the style facts too, so all of its dirt counts.
      formWork: isEditMode ? () => bodyWorkOf(form) : undefined,
      // MJ-3: the card under the work — its version and body fingerprint (computed once per card).
      stamp: isEditMode && numId ? () => draftStamp() : undefined,
    },
  );

  // Section-completion progress (Q9): a visible "how filled is this card" signal, per tab + overall.
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const moodboardMedia = useWatch({ control: form.control, name: 'moodboardMedia' });
  const technicalMedia = useWatch({ control: form.control, name: 'technicalMedia' });
  const sizeIdsW = useWatch({ control: form.control, name: 'sizeIds' });
  // Watched for the patterns glyph only. Cheap in practice: a rename commits on blur/Enter and a
  // rebind on select, so this re-renders the form on an upload or a deliberate edit — not per
  // keystroke (the inline rename holds its draft in the panel's own state).
  const patternsW = useWatch({ control: form.control, name: 'patterns' });
  const operationsW = useWatch({ control: form.control, name: 'operations' });
  const labelsW = useWatch({ control: form.control, name: 'labels' });
  // Which tabs count toward "the card's core spec is filled", and whether each currently has content.
  const sectionFilled: Partial<Record<TabId, boolean>> = {

    // STUDIO holds both grids now, so it is ticked by either: a card with a moodboard and no flat
    // has started the work this tab is for. ARTIFACTS is deliberately left UNSET rather than
    // `false` — nothing is minted yet in this wave, and claiming an outstanding section that
    // cannot be filled would peg every card below done for no reason a human could act on.
    // ЛИЧНОСТЬ КАРТОЧКИ И ЕЁ КАРТИНКИ — ОДНА ГАЛОЧКА, потому что теперь это одна вкладка.
    // Прежде их было две: `header` тикался по имени и номеру стиля, `studio` — по любой картинке.
    // Слить их через ИЛИ значило бы объявить вкладку заполненной по половине её содержимого.
    studio:
      !!name?.trim() &&
      (stage === 'TECH_CARD_STAGE_IDEA' || !!styleNumber?.trim()) &&
      (len(technicalMedia) > 0 || len(moodboardMedia) > 0),
    // A size range alone stopped answering for this tab. The выкройки panel below it files DXF
    // sheets BY MATERIAL and names every fabric line with no sheet as a hole, so a card carrying a
    // full size range and not one pattern was ticked done while the tab itself said otherwise.
    // The truthful rule is the panel's own — every rollgoods BOM line carries at least one DXF —
    // but that rule is ROLE_OF_SECTION in patterns-field.tsx, and restating it here would be a
    // second implementation to keep in step (and would peg a card whose sheets are still on paper
    // below done for good). This is the cheap, strictly-less-wrong half: the range AND a sheet.
    patterns: len(sizeIdsW) > 0 && len(patternsW) > 0,
    bom: len(bomItemsW) > 0,
    // colourways are products, read from techCard.colorways (the RHF `colorways` array is always []).
    // Cut pieces are deliberately NOT part of any tab's test (they answer for `patterns` now): no
    // release gate requires them, so a style that genuinely has none (an accessory) would be pegged
    // below 100% for good. Its own half-empty table says so on the tab.
    // Left UNSET for an auxiliary card: it can never have a colourway, its tab is hidden
    // (isTabVisible), and stating `false` for a section that cannot exist would be a claim about
    // work that is not outstanding.
    colorways: isAux ? undefined : (techCard?.colorways?.length ?? 0) > 0,
    construction: len(operationsW) > 0,
    labels: len(labelsW) > 0,
    // "filled" = actually signed off, not merely present — 7 REJECTED rows must not read as done (M10).
    signoff: signoffsApproved,
    // A style has "production" once at least one batch of it exists. Read off the runs query rather
    // than the form — runs are not part of the tech-card payload.
    production: productionRunCount > 0,
  };
  const isFilled = (t: TabId) => sectionFilled[t] === true;

  // Every lookup goes through here so the rail's error dot, the failed-save tab switch and the
  // walk-to-the-field routine all land on the tab that actually renders the field. The map is now
  // purely static: it used to re-route `pieces` (colorways → construction for an auxiliary card,
  // which has no colourways), and that special case died with the move of the cut-piece table onto
  // PATTERNS — a tab every card has. Nothing in ERROR_TAB points at `colorways` any more, which is
  // what lets isTabVisible hide it for an aux card with no error escape.
  const errorTabFor = (rootKey: string): TabId => ERROR_TAB[rootKey] ?? 'studio';

  // Full dotted paths, not root keys: `bomItems.3.name` used to collapse to `bomItems`, so the rail
  // could only ever say "something on the BOM tab is wrong" and the count was always 1 per tab.
  const flatErrors = flattenFieldErrors(form.formState.errors as FieldErrors);
  const errorCountByTab = new Map<TabId, number>();
  for (const e of flatErrors) {
    const tab = errorTabFor(errorRootKey(e.path));
    errorCountByTab.set(tab, (errorCountByTab.get(tab) ?? 0) + 1);
  }
  const errorTabs = new Set(errorCountByTab.keys());

  // IDEA is a "light" card (screen E): only the concept-relevant tabs show; the rest reappear when
  // the stage advances, their echoed fields untouched. Not disabled — hidden. A tab carrying a
  // validation error stays visible even at IDEA, or the error dot would point at an invisible tab.
  const IDEA_TABS: TabId[] = ['studio', 'artifacts', 'samples', 'history'];
  // Costing is field-shaped: hidden entirely without costing:read (server nulls the cost block; an
  // empty tab would read as "zero cost"). R&D dev-expenses now live as a section inside it. Samples
  // need a saved card (id).
  const isTabVisible = (t: TabId) => {
    // An auxiliary card produces a MATERIAL, not products: it has no colourways (CreateColorway
    // refuses an aux style), so the whole tab — the colourway recipes, the lab dips, the SKU-shaped
    // machinery — is furniture for a thing that cannot exist. Nothing else shares the tab any more:
    // the cut-piece editor (a кофр is cut and sewn like any garment) lives on PATTERNS, which every
    // card has, so hiding this one takes nothing an aux card needs with it.
    // No error escape here, unlike the IDEA rule below: no ERROR_TAB row points at `colorways` any
    // more, so nothing can be filed against this tab while it is invisible.
    if (t === 'colorways' && isAux) return false;
    if (isIdea && !IDEA_TABS.includes(t)) return errorTabs.has(t);
    if (t === 'costing' && !canReadCosting) return false;
    if (t === 'samples' && !isEditMode) return false;
    // Production needs a saved card (the runs query is keyed by its id). Deliberately NOT gated on
    // costing:read, unlike costing above: the server strips money out of a run payload but keeps the
    // quantities and the defect rate, so a warehouse role gets a coherent view rather than an empty
    // tab — and receiving stock is precisely that role's job.
    if (t === 'production' && !isEditMode) return false;
    return true;
  };
  // Rewrite a legacy ?tab=dev / ?tab=pieces to the tab that absorbed it, so the URL matches what is
  // rendered (the alias above already resolves it; this cleans the address bar / a bookmark).
  useEffect(() => {
    const folded = rawTab ? FOLDED_TABS[rawTab] : undefined;
    if (folded) navTo(folded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab]);
  // If the open tab becomes hidden (switching a card to IDEA while on the BOM tab, or permissions
  // resolving and taking the costing tab away), fall back to header so the body isn't blank.
  useEffect(() => {
    if (!isTabVisible(activeTab)) navTo('studio');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isIdea, canReadCosting, isEditMode, isAux]);
  // Фулскрин сборки (`?fs=1`) — вид вкладки CONSTRUCTION. Там, где эта вкладка невидима (IDEA
  // без поданных на неё ошибок), параметр снимается ЗДЕСЬ и первым: иначе энфорсер
  // `tab=construction` в OperationsField и фолбэк `navTo('studio')` выше зациклились бы,
  // бесконечно переписывая адрес друг за другом — каждый прав в своём правиле, и уступить некому.
  useEffect(() => {
    if (params.get('fs') === '1' && !isTabVisible('construction')) leaveFullscreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, isIdea, canReadCosting, isEditMode, isAux]);

  // Walk the user to the field a failed save flagged. This has to run AFTER the tab switch commits
  // (it's a router param update) and after any collapsed container that owns the field expands
  // itself — a BomTile opens on its own error, one render later — so the target simply may not
  // exist yet. Retry a few frames before giving up; the toast already names the path either way.
  useEffect(() => {
    if (!focusTarget) return;
    const { path } = focusTarget;
    let cancelled = false;
    let timer = 0;
    const attempt = (attemptsLeft: number) => {
      if (cancelled) return;
      try {
        form.setFocus(path as Parameters<typeof form.setFocus>[0]);
      } catch {
        // Registered through a wrapper that keeps no focusable ref (Radix select, media picker).
        // Not fatal: revealField still scrolls and pulses the row via its [data-field] anchor.
      }
      if (revealField(path) || attemptsLeft <= 0) return;
      timer = window.setTimeout(() => attempt(attemptsLeft - 1), 80);
    };
    const raf = requestAnimationFrame(() => attempt(4));
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  // ═══ АВТОСЕЙВ — ОБВЯЗКА СТРАНИЦЫ (волна 25.09 · T21 · D-16/D-16') ═════════════════════════════
  // Only a SAVED card that this account may write and that is not frozen saves itself. A new card
  // keeps its `add` button (the create IS the save), a released one its «re-open to draft».
  const autosaveEnabled = isEditMode && !!numId && canWrite(SECTION.techCards) && !frozen;
  // ═══ THE CARD THIS FORM STANDS ON (ревью M-3) ═════════════════════════════════════════════════
  // `version` is what the next body write claims; `card` is the server's card at that version (null
  // when this page does not know it). Both move only with this page's own writes, with an explicit
  // adoption (keep mine, the auto-stage's quiet re-read, the rebase of a pristine form) and with a read
  // whose BODY is the one `card` already has — a panel's lock bump, a roll-up, a colourway: the version
  // moved, nothing a body write carries did (see bodyMoved). A read that moved the body is another
  // editor's write and is never adopted in silence: a pristine form is rebased onto it, a dirty one
  // stops at the conflict decision. The cache used to be the claim — every refetch that picked up
  // someone else's write handed THEIR version to this page's next PUT, which then wrote this page's
  // stale fields straight over theirs with nothing to refuse it.
  const base = useRef<{
    version: number;
    card: common_TechCard | null;
    // ревью mn-1: with no card at this version (the read after this page's own write failed, or brought a
    // newer one), the body this page SENT under it — a later reading whose body is that is not a move.
    sent?: { body: Record<string, unknown>; echo: common_TechCardInsert | undefined };
  }>({
    version: techCard?.lockVersion ?? 0,
    card: techCard ?? null,
  });
  const claimVersion = () => lockOverride.current ?? base.current.version;
  // ревью MJ-3: the card a draft is typed on — its version, and its body's fingerprint when this page
  // holds the card (once per card: every draft write asks).
  const stampCache = useRef<{ card: common_TechCard | null; body?: string }>({ card: null });
  function draftStamp(): DraftStamp {
    const cur = base.current;
    if (cur.card && stampCache.current.card !== cur.card) {
      stampCache.current = { card: cur.card, body: bodyFingerprint(cur.card, canWriteCosting) };
    }
    return {
      version: cur.version,
      body: cur.card ? stampCache.current.body : undefined,
      updatedAt: (cur.card ?? techCard)?.updatedAt,
    };
  }
  const adopt = (card: common_TechCard) => {
    base.current = { version: card.lockVersion ?? 0, card };
  };
  // A write chain of this page is on the wire: its own reads settle `base`; a background read waits.
  const writing = useRef(0);
  // m1: a read this page needed after its own write did not come back — the next body write reads first.
  const needsRead = useRef(false);
  // The stored card the same way: the cache first — every re-read of this page writes it before the
  // render that turns it into the `techCard` prop (R-2b).
  const storedCard = (): common_TechCard | undefined =>
    (numId ? queryClient.getQueryData<common_TechCard>(techCardKeys.detail(numId)) : undefined) ??
    techCard;
  // R-1 backstop: the body this page last wrote, and the version the server holds it under.
  const lastBody = useRef<{ payload: string; lock: number } | null>(null);
  // G1: the approval door's own question — did a body write that CARRIED the requested approval
  // land? Marked inside writeTechCard, so a concurrent autosave that did not carry it cannot answer.
  const approvalAttempt = useRef<{ next: string; landed: boolean } | null>(null);
  // B-08: set by the write that lands RELEASED — to the version it left — and cleared by the one that
  // lands anything else. The autosave reads it through `halted`: a frozen card stops saving at that
  // write, not a render later. R-4: a LATER read that is not released lifts it too (another editor's
  // re-open, refetched here); a read no newer than the release itself cannot.
  const haltedRef = useRef<number | null>(null);
  // M-02: what the autosave's quiet check found — counted on the chip and listed in the warnings
  // organ, but NOT on the fields until the operator asks for it.
  const [silentIssues, setSilentIssues] = useState<Array<{ path: string; message: string }>>([]);
  // A7 (Codex B-07): the id CreateTechCard answered with. State for the render that hands it to
  // StyleFactsField; a ref for the retry path, which must finish THIS card rather than mint another.
  const [createdId, setCreatedId] = useState<number | undefined>(undefined);
  const createdIdRef = useRef<number | undefined>(undefined);
  // Auto-stage bookkeeping (see the effect under the autosave controller).
  const autoStageInFlight = useRef(false);
  const autoStageSteps = useRef(0);
  // M-01: the form exactly as the auto-stage left it after raising the stage. If nothing has moved
  // since, a 409 on that write is the other tab's business and a quiet re-read is the whole answer.
  const autoStageBaseline = useRef<TechCardFormData | null>(null);
  const autoStageUntouched = () =>
    !!autoStageBaseline.current &&
    staging.peek().length === 0 &&
    deepEqual(form.getValues(), autoStageBaseline.current);
  // THE TWO DOOR-OWNED FACTS FOLLOW EVERY FRESH READ (R-4). Approval and stage move only through their
  // doors, and every body write carries them — so a value this form holds from BEFORE another editor
  // moved one (re-opened the card this page released, or raised its stage) went back out with the next
  // autosave: lifting the halt alone re-released, from this page, a card someone had just re-opened.
  // Taken from the card whenever the form's own value is untouched and no door of this page is moving
  // it right now; the field's baseline moves with it, so nothing reads as an edit. (Not `resetField`:
  // neither field has a registered control, and for such a field RHF's resetField does nothing — the
  // baseline goes where resetField would put it, and `setValue` re-derives the flags against it.)
  useEffect(() => {
    if (!techCard) return;
    const at = haltedRef.current;
    if (at !== null) {
      // The halt first (R-4): lifted only by a read NEWER than the release and not released.
      if (techCard.techCard?.approvalState === RELEASED || (techCard.lockVersion ?? 0) <= at)
        return;
      haltedRef.current = null;
    }
    // M-2 / M-3: a read the page did not make for itself is judged before anything is taken from it —
    // the re-open that lifted the halt above included: this page resumes on THEIR card, or at the
    // conflict decision, never by writing its release-time form over their work.
    reconcileLatest();
    if (approvalAttempt.current || autoStageInFlight.current) return;
    // A read OLDER than the card this page stands on (a refetch that lost the race to a newer read)
    // says nothing of the milestones now: taken from it, a release someone lifted since would go back
    // out with the next write (ревью CL-A r4, backlog 1).
    if ((techCard.lockVersion ?? 0) < base.current.version) return;
    const stored = mapTechCardToForm(techCard);
    const baseline = form.control._defaultValues as Partial<TechCardFormData>;
    for (const key of ['approvalState', 'stage'] as const) {
      const server = stored[key];
      if (baseline[key] === server || form.getValues(key) !== baseline[key]) continue;
      (baseline as Record<string, unknown>)[key] = server;
      form.setValue(key, server, { shouldDirty: true });
    }
    // `form` is stable for the page's life; the trigger is a new read of the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techCard]);
  // THE JUDGE OF A READ (M-3). Newer than the card this form stands on, with the same body → taken (the
  // version moved under a panel, a roll-up, a colourway — nothing a body write carries). With a moved
  // body — another editor's write — a PRISTINE form is rebased onto it (the same merge as after a
  // save: minimal writes, no row re-keyed); a form with unsaved work stops at the conflict decision.
  function reconcileRead(fresh: common_TechCard): ReadVerdict {
    const v = fresh.lockVersion ?? 0;
    const cur = base.current;
    if (v < cur.version) return 'same';
    if (v === cur.version) {
      // The card at this page's own version, when the read that should have brought it failed.
      if (!cur.card) adopt(fresh);
      return 'same';
    }
    // The body did not move since the card this page stands on — or, when that card was never read back,
    // since the body this page SENT under its version (mn-1): a panel's bump, a roll-up. Taken.
    const unmoved = cur.card
      ? !bodyMoved(cur.card, fresh, canWriteCosting)
      : !!cur.sent &&
        deepEqual(bodyOnTheWire(fresh, cur.sent.echo, canWriteCosting), cur.sent.body);
    if (unmoved) {
      adopt(fresh);
      return 'adopted';
    }
    // MJ-1: only unsaved work of the BODY stops at the decision. Work outside it — a staged panel, a style
    // fact, dirt nobody can write (mn-3) — is not what their write moved: the body is rebased onto
    // theirs and the queue is kept.
    if (bodyWorkOf(form)) return 'conflict';
    rebaseOnto(fresh);
    adopt(fresh);
    lastBody.current = null;
    calloutHistory.reset();
    return 'rebased';
  }
  // THEIR CARD UNDER THIS FORM (ревью MJ-1). Every key the operator has not changed against the baseline
  // takes theirs, value and baseline; a changed key stays the operator's — dirty against their card, so
  // the next write carries it; the style facts are the style panel's and are not moved at all (M2).
  // Without it, a form that stood on the old body kept showing it after the page took their version,
  // and the next unrelated edit's full-replace write put the old body back over theirs, unrefused.
  function rebaseOnto(fresh: common_TechCard) {
    // The baseline object is not written by the merge (setValue writes the values), so it serves as
    // the comparison when it cannot be cloned.
    const baseline =
      cloneFormValues(form.control._defaultValues as TechCardFormData) ??
      (form.control._defaultValues as TechCardFormData);
    const values = form.getValues();
    const server = mapTechCardToForm(fresh);
    for (const k of STYLE_FACT_KEYS) (server as Record<string, unknown>)[k] = values[k];
    settleAfterBodySave(baseline, { values: server, server }, undefined, STYLE_FACT_KEYS);
  }
  // A read that arrived by itself (a refetch after someone's invalidation, a reconnect): judged when no
  // write chain of this page is on the wire — a chain settles `base` with its own reads, and this runs
  // again when it ends.
  function reconcileLatest() {
    if (!numId || writing.current > 0 || lockOverride.current != null) return;
    const fresh = storedCard();
    if (!fresh) return;
    if (reconcileRead(fresh) !== 'conflict') return;
    leaveFullscreen();
    openConflict();
    autosave.settleExternal(
      { outcome: 'conflict', message: 'another editor saved this card meanwhile' },
      'read',
    );
  }
  // The quiet answer to a 409 on the auto-stage's own write: take the card the other save left, and
  // let the next readiness answer decide the stage again. `before` is the form as the auto-stage
  // wrote it. Returns whether the card was re-read.
  async function quietReload(
    before: TechCardFormData | null,
  ): Promise<'reread' | 'failed' | 'typed'> {
    if (!numId) return 'failed';
    lockOverride.current = null;
    let fresh: common_TechCard | undefined;
    try {
      fresh = (await adminService.GetTechCard({ id: numId, vatCountryCode: undefined })).techCard;
    } catch {
      return 'failed';
    }
    if (!fresh) return 'failed';
    // ревью mn-2: typed while the read was on the wire — the merge below would keep each typed key
    // WHOLE, with their card as its baseline, and the next write would put that key back over theirs
    // (another row of the same list). Nothing about that is quiet: the decision.
    if (!autoStageUntouched()) {
      queryClient.setQueryData(techCardKeys.detail(numId), fresh);
      return 'typed';
    }
    // The card this form stands on from here (M-3): the merge below takes it everywhere untouched.
    adopt(fresh);
    lastBody.current = null;
    queryClient.setQueryData(techCardKeys.detail(numId), fresh);
    const server = mapTechCardToForm(fresh);
    // B-07: applied against what the form holds NOW, not what it held when the 409 came back. The
    // old full reset erased every keystroke typed while this read was on the wire; the same merge as
    // after a body save keeps them the operator's — dirty against the server's card, written by the
    // next cycle — and takes the server's value everywhere else, the stage included.
    settleAfterBodySave(before, { values: server, server });
    calloutHistory.reset();
    void queryClient.invalidateQueries({ queryKey: techCardKeys.readiness(numId) });
    return 'reread';
  }

  // HISTORY of saved TEXT (save-history.ts, D-17'). «as opened» is the text this page opened with —
  // without it the first autosave of a session could not be undone at all.
  const [openedText] = useState(() =>
    techCard
      ? {
          values: textSnapshotOf(form.getValues()),
          lockVersion: techCard.lockVersion ?? 0,
          at: Date.parse(techCard.updatedAt ?? '') || Date.now(),
        }
      : null,
  );
  const history = useSaveHistory(isEditMode ? numId : undefined, openedText);
  // The QUIET complete (B-03 / B-04): everything on screen is on the server. History records the text
  // that is there now; the draft, the unload copy of unsaved work, has nothing left to guard — THIS
  // session's copy. A draft found on open and not yet answered is not touched (R-11).
  function afterQuiescentSave() {
    draft.clearOwn();
    if (numId) history.push(textSnapshotOf(form.getValues()), base.current.version);
  }

  // After a body save the server owns values this form cannot compute, and `data` — the payload
  // that just went over the wire — still carries the pre-save placeholder for each of them.
  // Resetting the form to it leaves the card lying about itself, and for ONE of those fields the lie
  // is destructive: «approve» blanks a sign-off's signedDigest precisely because an EMPTY digest on
  // the wire MEANS "approve this now". Left blank in form state it is re-sent by every LATER save in
  // the same page session, silently re-blessing the section against whatever it has become since —
  // approve the BOM once and every subsequent save re-approves it against the new content.
  //
  // Deliberately a MERGE into what was sent rather than a wholesale reset to mapTechCardToForm(fresh):
  // the staged sub-panels commit AFTER this (styleFacts writes fit / brand / collection / season via
  // UpdateStyle, order 10), so their form fields are still unsaved at this point and a wholesale
  // reset would revert them to the server's pre-commit values — losing exactly the edits the staged
  // queue is about to write. Only the three server-assigned lists are taken. Cut pieces have nothing
  // to re-seed: their identity is the client-minted lineKey, not a server id.
  //
  // ЗДЕСЬ ЖЕ СТОИТ АУДИТ ПРИСУТСТВИЯ (Ф7), и стоит он именно здесь потому, что повторное чтение
  // УЖЕ СДЕЛАНО — своё второе `GetTechCard` заводить не пришлось. Сверяется отправленное с
  // прочитанным в координатах формы, ПРИСУТСТВИЕ против присутствия. `audit === null` означает
  // «чтения не было» (новая карточка, сбой рефетча) — сравнивать не с чем, и молчание здесь
  // честнее ложной тревоги.
  // The three server-assigned lists, merged onto whatever form values are handed in. Split out of
  // withServerAssignedValues (волна 25.09) because it now has TWO callers: the values that were sent,
  // and the edits typed while that save was on the wire (see reapplyEditsMadeDuringSave) — a BOM row
  // added by this very save must not go out again with id 0 just because the operator kept typing.
  function assignServerLists(sent: TechCardFormData, server: TechCardFormData) {
    // Sign-off digests, by section. A section normally holds one row; a duplicate ("other entries")
    // takes the NEXT server row for that section rather than a copy of the first.
    const serverDigests = new Map<string, string[]>();
    for (const s of server.signoffs ?? []) {
      const sec = s.section ?? '';
      serverDigests.set(sec, [...(serverDigests.get(sec) ?? []), s.signedDigest ?? '']);
    }
    const seenSection = new Map<string, number>();
    const signoffs = (sent.signoffs ?? []).map((s) => {
      const sec = s.section ?? '';
      const nth = seenSection.get(sec) ?? 0;
      seenSection.set(sec, nth + 1);
      const digest = serverDigests.get(sec)?.[nth];
      return digest === undefined ? s : { ...s, signedDigest: digest };
    });

    // Pattern revisions: a freshly uploaded sheet goes out as version 0 and the server assigns
    // MAX+1 for its size, so the form would otherwise keep asking for a new number on every save.
    // uploadedAt is server-owned as well (never sent, only displayed).
    const patternKey = (p: { sizeId?: number; url?: string }) =>
      `${p.sizeId ?? 0}|${(p.url ?? '').trim()}`;
    const serverPatterns = new Map((server.patterns ?? []).map((p) => [patternKey(p), p]));
    const patterns = (sent.patterns ?? []).map((p) => {
      const sp = serverPatterns.get(patternKey(p));
      return sp ? { ...p, version: sp.version ?? 0, uploadedAt: sp.uploadedAt ?? '' } : p;
    });

    // BOM primary keys, matched on the durable line_key: a row added in this session went out with
    // id 0 and comes back with the PK the insert assigned.
    const serverBomIds = new Map((server.bomItems ?? []).map((b) => [b.lineKey ?? '', b.id ?? 0]));
    const bomItems = (sent.bomItems ?? []).map((b) => {
      const id = serverBomIds.get(b.lineKey ?? '');
      return id === undefined ? b : { ...b, id };
    });
    return { signoffs, patterns, bomItems };
  }

  async function withServerAssignedValues(
    sent: TechCardFormData,
    // The version this page's body write claimed and got: the server holds `expected + 1` now (M-3).
    expected?: number,
    // The stored fields that write echoed (the mapper's `original`) — for the body it put on the wire (mn-1).
    echo?: common_TechCardInsert,
  ): Promise<{
    values: TechCardFormData;
    audit: PresenceAudit | null;
    /** The server's card in form coordinates — null when there was no read to take it from. */
    server: TechCardFormData | null;
  }> {
    // Намерение «снял разметку» гасится НА ВСЕХ ветках возврата, включая ранние. PUT к этому
    // моменту уже прошёл — намерение исполнено, и оставить флаг взведённым из-за транзиентного
    // сбоя рефетча значило бы отправить следующее сохранение в отказ «cleared против карточки без
    // разметки», из которого пользователю не выбраться иначе как перезагрузкой с потерей правок.
    // ОБА намерения гасятся здесь. Забыть второе — значит отправить следующее сохранение в
    // тупик: маппер увидит взведённый mediaCleared против карточки, у которой снимки уже есть,
    // и пришлёт «снял» вместе с фотографиями — серверный гейт отвергнет это как противоречие, а
    // жеста, снимающего флаг, в интерфейсе нет.
    // Аудит по умолчанию — null: ранние ветки возврата не читали карточку, и сравнивать им не с
    // чем. Ветка catch рефетча (:«Not fatal») тоже молчит НАМЕРЕННО: чтения не было, а «поле не
    // вернулось» про непрочитанную карточку — ложная тревога, которая учит не читать баннер.
    const done = (
      v: TechCardFormData,
      audit: PresenceAudit | null = null,
      server: TechCardFormData | null = null,
    ) => ({
      values: {
        ...v,
        assemblyCleared: false,
        mediaCleared: false,
      },
      audit,
      server,
    });
    if (!numId) return done(sent);
    // M-3: the write landed under `expected + 1` — that version is this page's, whatever the read says.
    // mn-1: and until its card is read, the body it sent is what this page knows of it.
    if (expected !== undefined) {
      base.current = {
        version: expected + 1,
        card: null,
        sent: { body: formOnTheWire(sent, echo, canWriteCosting), echo },
      };
    }
    let fresh: common_TechCard | undefined;
    try {
      const res = await adminService.GetTechCard({ id: numId, vatCountryCode: undefined });
      fresh = res.techCard;
    } catch {
      // Not fatal — the save itself landed. Fall back to what was sent; useUpdateTechCard's own
      // invalidation still refetches the card, and a reload re-seeds the form from the server. The
      // card at our version is unknown until then: the next body write reads it first (m1).
      needsRead.current = true;
      return done(sent);
    }
    if (!fresh) return done(sent);
    // M-3: exactly this write's version is this write's card. Anything newer landed in the moment
    // between the write and this read: not adopted — the next write claims ours and hears the 409.
    if (expected !== undefined && (fresh.lockVersion ?? 0) === expected + 1) adopt(fresh);
    // Prime the cache with the read we already paid for (the prop follows a render later).
    queryClient.setQueryData(techCardKeys.detail(numId), fresh);
    const server = mapTechCardToForm(fresh);
    const { signoffs, patterns, bomItems } = assignServerLists(sent, server);

    // CONSTRUCTION IS TAKEN WHOLE FROM THE SERVER, not merged field by field, and it is the one
    // section where that is the honest answer. Its equipment park (0306) is a keyed list the write
    // mapper EDITS on the way out: a profile row that never got a machine picked is dropped rather
    // than refused (mapEquipmentDefaultsOut — a half-added row must not block a save carrying nine
    // other tabs' work), and a row with no key gets one minted. Reset to what was SENT, such a row
    // comes back as a pristine, clean row of a card that does not contain it: no unsaved-changes
    // guard, no draft, and it disappears at the next navigation without anything having said so.
    // The section carries nothing else the form owns and the server does not round-trip, so taking
    // the server's copy costs nothing and makes «saved» mean saved.
    // assemblyCleared — НАМЕРЕНИЕ ОДНОГО СОХРАНЕНИЯ, а не свойство карточки, и после успешной
    // записи оно обязано погаснуть. Оставь флаг взведённым — и следующее же сохранение сервер
    // отвергнет: осведомлённая запись с cleared против карточки, у которой разметки уже нет, это
    // теневое намерение, и гейт на него отвечает отказом. Кнопка «снять разметку» взводит флаг
    // ровно один раз, здесь он снимается.
    // АУДИТ ПРИСУТСТВИЯ. Сверяется то, что ушло из формы, с тем, что вернулось с сервера, —
    // ПРИСУТСТВИЕ против присутствия, по списку полей из самой zod-схемы шага. Утверждение
    // баннера «ваши значения всё ещё в форме» истинно по построению: строки операций берутся из
    // `sent` (сброс — МЕРДЖ в отправленное, серверные значения идут только в три списка выше).
    const audit = auditOperationPresence(
      (sent.operations ?? []) as unknown as Record<string, unknown>[],
      (server.operations ?? []) as unknown as Record<string, unknown>[],
    );
    return done(
      { ...sent, signoffs, patterns, bomItems, construction: server.construction },
      audit,
      server,
    );
  }

  // ═══ ОДНА ЗАПИСЬ КАРТОЧКИ — ТЕЛО, ПОТОМ ОЧЕРЕДЬ ПАНЕЛЕЙ ════════════════════════════════════════
  // The actual write: card body first (it carries the lock version), then the staged sub-panels.
  //
  // Two answers, not one, because "did it all land" and "is the card's PURPOSE now auxiliary" are
  // different questions with different consequences. A staged panel can fail AFTER the body PUT has
  // already committed the flip — at which point the convert flow must NOT tell the operator the card
  // is still sellable and their colourways are restorable, because an auxiliary style refuses every
  // un-archive edge (checkOwningStyleSellable). `bodySaved` is the honest half of that answer.
  //
  // ВОЛНА 25.09 (автосейв): и ТРЕТИЙ ответ — `outcome`. Автосейв решает по нему, что сказать и что
  // делать дальше, и «saved» он вправе сказать ТОЛЬКО на `complete` (Codex B-03): `restaged` значит,
  // что новые значения панели всё ещё в очереди, `partial` — что панель отказала. `ok` остался
  // прежним («ничего не сломалось») ради управляемого перевода в auxiliary, который по нему сеет цвета.
  //
  // `mode: 'silent'` — запись автосейва: ни тоста об успехе, ни переключения вкладки на поле с
  // ошибкой, ни выхода из фулскрина из-за сетевой ошибки, от которой человеку нечего делать, — обо
  // всём этом говорит чип статуса. Баннеры (частичное сохранение, расхождение версий, аудит
  // присутствия) и модалка конфликта остаются в обоих режимах: это решения, а не уведомления.
  async function writeTechCard(
    data: TechCardFormData,
    opts: { mode: SaveMode; autoStage?: boolean; keepPurpose?: string } = { mode: 'explicit' },
  ): Promise<WriteResult> {
    writing.current += 1;
    try {
      // mn-5: the decision is pending — nothing goes out but its answer («keep mine» closes it first).
      if (conflictOpen.current) {
        return {
          bodySaved: false,
          ok: false,
          outcome: 'conflict',
          message: 'this card moved on without you — decide first',
        };
      }
      // m1: the read this page needed after its last write never came back — the card it stands on is
      // unknown, so nothing is built on it until it is read.
      if (isEditMode && numId && needsRead.current) {
        const r = await readInChain();
        if (r === 'error') {
          return {
            bodySaved: false,
            ok: false,
            outcome: 'error',
            message: 'the card could not be re-read — nothing was saved',
          };
        }
        if (r === 'conflict') {
          const message = 'another editor saved this card meanwhile';
          leaveFullscreen();
          openConflict();
          if (opts.mode !== 'silent') showMessage(message, 'error');
          return { bodySaved: false, ok: false, outcome: 'conflict', message };
        }
        // Rebased onto another editor's card: `data` is the form from before it — the next pass
        // builds from the form as it is now.
        if (r === 'rebased') return { bodySaved: false, ok: true, outcome: 'nothing' };
      }
      return await writeTechCardPass(data, opts);
    } finally {
      writing.current -= 1;
      // A read that came in while this chain ran waited for it (M-3): judged now, against the card the
      // chain left this page standing on.
      if (writing.current === 0) queueMicrotask(reconcileLatest);
    }
  }

  // THE READ THIS PAGE MAKES FOR ITSELF, INSIDE A WRITE CHAIN (M-3 / m1): after its panels moved the
  // shared version, or before a write when the last such read failed. Errors are not swallowed — a
  // version nobody read is not a version to claim.
  async function readInChain(): Promise<ReadVerdict | 'error'> {
    if (!numId) return 'same';
    let fresh: common_TechCard | undefined;
    try {
      fresh = (await adminService.GetTechCard({ id: numId, vatCountryCode: undefined })).techCard;
    } catch {
      fresh = undefined;
    }
    if (!fresh) {
      needsRead.current = true;
      return 'error';
    }
    needsRead.current = false;
    const verdict = reconcileRead(fresh);
    // After `base` moved: the prop this makes a render later reads as nothing new.
    queryClient.setQueryData(techCardKeys.detail(numId), fresh);
    return verdict;
  }

  async function writeTechCardPass(
    data: TechCardFormData,
    opts: { mode: SaveMode; autoStage?: boolean; keepPurpose?: string },
  ): Promise<WriteResult> {
    const silent = opts.mode === 'silent';
    setStagingError(null);
    // Оба баннера — факты о ПРЕДЫДУЩЕЙ попытке. Новая попытка начинается с чистого экрана,
    // иначе «карточка не сохранена» продолжало бы стоять над уже сохранённой карточкой.
    setVersionSkew(null);
    setPresenceLoss(null);
    // ГЕЙТ ВОЗМОЖНОСТЕЙ СТОИТ МЕЖДУ СБОРЩИКОМ И ПРОВОДОМ, и он здесь не ради полосы DESIGN, а ради
    // ВСЕХ тех-карт. Гейтвей собран с `DiscardUnknown: false` (`internal/api/http/http.go`), поэтому
    // незнакомое поле от нового бандла — это 400 на ВЕСЬ документ, а не деградация одной вкладки:
    // админы перестали бы сохранять любые карточки разом. Гейт снимает поля полосы ровно тогда,
    // когда сервер про неё не знает, и «отсутствие» на этих полях означает «сохрани хранимое».
    //
    // Ответ берётся из чтения полосы этой же карточки: `serverSpeaks` ложен и пока чтение идёт, и
    // если оно провалилось. Направление отказа выбрано в эту сторону сознательно — цена ошибки
    // «не сохранили записку мудборда» несравнима с ценой «не сохранили ни одной карточки».
    //
    // `original` — the fields this form does not own and sends back as stored (the season, the costing
    // of an editor without costing:write) — is the FRESHEST stored card, the cache, not the render's
    // prop (R-2b): a pass chained right after a re-read runs before the render that brings the prop
    // up to date, and would put the other editor's fields back the way they were — under a fresh
    // version, so nothing would refuse it.
    const original = (base.current.card ?? storedCard())?.techCard;
    const { payload: techCardInsert } = gateTechCardPayload(
      mapFormToTechCardInsert(data, original, canWriteCosting),
      { serverSpeaksDesign: designBandSpeaks },
    );
    let bodySaved = false;
    try {
      if (isEditMode) {
        // Count what this run intends to write BEFORE anything moves, so a partial-failure banner
        // can say "2 of 4" and mean it. The LIVE dirty flag, not the render snapshot: the auto-stage
        // and the approval doors set a value and save in the same tick (see liveIsDirty). The style
        // facts are not the body's work (M2): the body never writes them.
        const bodyDirty = bodyWorkOf(form);
        const planned = (bodyDirty ? 1 : 0) + staging.peek().length;

        // B-08: an approval is the LAST write, never one of several. A release that went out beside a
        // staged panel could freeze the card and then watch that panel fail, its work stranded in a
        // browser that no longer saves. submitWithApproval flushes everything else first; a panel
        // staged in the moment between the two is refused here, before anything is sent.
        const carriesApproval =
          !!approvalAttempt.current && data.approvalState === approvalAttempt.current.next;
        if (carriesApproval && staging.peek().length > 0) {
          const message =
            'a panel changed while the approval was being saved; nothing was released, try again';
          if (!silent) showMessage(message, 'error');
          return { bodySaved: false, ok: false, outcome: 'error', message };
        }

        // The style facts are written by their own panel (StyleFactsField → UpdateStyle), which
        // commits AFTER the body — the body never writes them at all. A body save therefore never
        // moves their baseline (CL-C re-review M2): moved while the panel was staged, it made the panel
        // read its fields as clean and unstage itself mid-commit; moved while it was NOT staged (the
        // care mirror, a drafted fit, an account without products:write), a fact read «saved» that the
        // server never got. The panel's own settle is the only mover of those baselines.
        // R-1 BACKSTOP. The same body this page last wrote, against the version that write — and this
        // page's own panels after it — left, is on the server already. A form «dirty» over it is not an
        // edit but a difference RHF counts and the wire does not carry (a key present as undefined on
        // one side, absent on the other). Nothing is sent, the form takes what it holds as its
        // baseline, and the autosave does not re-send the same card every two seconds.
        const bodyKey = bodyDirty ? JSON.stringify(techCardInsert) : '';
        const phantomBody =
          bodyDirty &&
          !carriesApproval &&
          lockOverride.current == null &&
          lastBody.current?.payload === bodyKey &&
          lastBody.current.lock === claimVersion();
        if (phantomBody) {
          settleAfterBodySave(
            cloneFormValues(form.getValues()),
            { values: data, server: null },
            opts.keepPurpose,
            STYLE_FACT_KEYS,
          );
        }
        // The card body goes FIRST: it carries expectedLockVersion, so a 409 here must abort before
        // any child panel writes. Committing a recipe against a card body someone else has already
        // moved is how orphan references are made (19.4). The catch below handles that.
        if (bodyDirty && !phantomBody) {
          // What the form held when this write started — DEEP-copied, because RHF writes nested
          // values in place (`set(_formValues, 'bomItems.3.name', …)` mutates the row object), and a
          // shallow copy would already «contain» the edits typed while the request is in flight.
          const before = cloneFormValues(form.getValues());
          // The version this form stands on (M-3); after «keep mine & overwrite» the version read back
          // from the server, so that choice actually overwrites (see keepMineAndOverwrite).
          const expected = claimVersion();
          await updateTechCard.mutateAsync({
            id: parseInt(id || '0', 10),
            techCard: techCardInsert,
            expectedLockVersion: expected,
          });
          // The body is committed server-side from here on — anything that fails below leaves the
          // card carrying the values this PUT just wrote (see the return type's comment).
          bodySaved = true;
          if (carriesApproval && approvalAttempt.current) {
            approvalAttempt.current.landed = true;
            // A released card is frozen from this very write: the autosave stops now, not one render
            // later when the prop catches up (a follow-up flush pass would otherwise write into it).
            // Held as the version the release left, so only a LATER read can lift it (R-4).
            haltedRef.current = data.approvalState === RELEASED ? expected + 1 : null;
          }
          // Spent: the write moved the server's version on, and useUpdateTechCard's invalidation
          // brings the new one back. Holding it would 409 the save after next.
          lockOverride.current = null;
          // Reset to what the SERVER now holds, not to what we sent — above all so a sign-off that
          // was just approved carries its stamped digest instead of the blank that MEANS "approve
          // now" (see withServerAssignedValues).
          const settled = await withServerAssignedValues(data, expected, original);
          // What the server holds as the body now, and the version it holds it under — the backstop
          // above compares the next body against it.
          lastBody.current = { payload: bodyKey, lock: base.current.version };
          // M-03: the silent write carried the STORED purpose; the operator's pending switch to
          // auxiliary goes back into the form, still dirty, still waiting for its confirmation.
          settleAfterBodySave(before, settled, opts.keepPurpose, STYLE_FACT_KEYS);
          // Ф7: сохранение прошло, но часть отправленных фактов не вернулась — молчать об этом
          // значит отдать человеку карточку, которая узнает о потере через неделю пустым полем.
          if (settled.audit && hasPresenceLoss(settled.audit)) setPresenceLoss(settled.audit);
          // ИСТОРИЯ ОТКАТА ЗАБЫВАЕТСЯ ВМЕСТЕ С СОХРАНЕНИЕМ. Она помнит массивы ДО отправки, а форма
          // теперь несёт то, что вернул сервер: ⌘Z воскресил бы пред-сейвовое состояние поверх
          // серверных значений — правку, которой никто не делал, поверх той, что уже уехала.
          calloutHistory.reset();
        }
        // Then the staged sub-panels, in commit order. These are separate RPCs — there is NO
        // transaction, and the banner below deliberately does not pretend otherwise.
        //
        // B-06: a 409 from a PANEL is the same fact as one from the body — someone else moved what this
        // write read — and gets the same answer: the modal, the autosave paused. Filed as `partial`
        // it was retried at 5 / 15 / 45 s, and the panels that re-read their version right before
        // writing (recipe, lab dip, sample) would have written over the other editor on the first
        // retry, with nobody asked. Those three re-throw with their own sentence and drop the HTTP
        // status on the way, so the status is also read off the mutation that failed during this run
        // (TanStack keeps the original error).
        //
        // R-5 / m2: but only the FAILING panel's own mutation — the one failing in the very task its
        // rethrow comes from (watchOwnFailure), not another mutation of the page that failed while the
        // commit ran, and nothing at all when the panel failed before sending one. An error that still
        // carries its HTTP status speaks for itself.
        const ownFailure = watchOwnFailure(queryClient.getMutationCache());
        let outcome: CommitOutcome;
        let failedOwn: { conflict: boolean } | null = null;
        try {
          outcome = await staging.commitAll();
          failedOwn = ownFailure.current();
        } finally {
          ownFailure.stop();
        }
        // R-2a / R-3: a committed panel moves the SHARED tech_card.lock_version (UpdateStyle and
        // UpdateStyleSizeChart both do). The next write — a chained flush pass, the approval right
        // after the pre-flush — is built in this same chain, before any render, so the version it
        // claims is read back HERE: left to a background refetch, the release 409'd against this
        // page's own style write. A «keep mine» override is spent with it: its version is behind now.
        //
        // M-3 / m1: read back HERE, explicitly, and judged: a panel moves the version and not the body,
        // so a read whose body moved is another editor's write that landed while this run went on —
        // the conflict decision, not a version to take. A read that fails is not swallowed: this run
        // says so, and the next body write reads first.
        let reread: ReadVerdict | 'error' | null = null;
        if (numId && outcome.committed.length > 0) {
          lockOverride.current = null;
          reread = await readInChain();
          void queryClient.invalidateQueries({ queryKey: techCardKeys.readiness(numId) });
          // The body the server holds is unchanged by a panel; only its version moved, and it was
          // this page that moved it.
          if (lastBody.current && (reread === 'same' || reread === 'adopted'))
            lastBody.current = { ...lastBody.current, lock: base.current.version };
        }
        if (reread === 'conflict') {
          const message = 'another editor saved this card while it was being saved';
          leaveFullscreen();
          openConflict();
          if (!silent) showMessage(message, 'error');
          return { bodySaved, ok: false, outcome: 'conflict', message };
        }
        if (outcome.failed) {
          const { change, error } = outcome.failed;
          const own = hasHttpStatus(error) ? null : failedOwn;
          if (isConflictError(error) || !!own?.conflict) {
            const message = `«${change.label}» was changed by someone else meanwhile`;
            leaveFullscreen();
            openConflict();
            if (!silent) showMessage(message, 'error');
            return { bodySaved, ok: false, outcome: 'conflict', message };
          }
          const done = (bodyDirty ? 1 : 0) + outcome.committed.length;
          const why = techCardErrorMessage(error, 'unknown error');
          setStagingError(
            `saved ${done} of ${planned} — «${change.label}» failed: ${why}. Everything not yet saved is still staged.`,
          );
          if (!silent) showMessage(`«${change.label}» failed — the rest is still staged`, 'error');
          // Баннер «сохранено 2 из 4» стоит на странице, то есть под оверлеем фулскрина.
          leaveFullscreen();
          return { bodySaved, ok: false, outcome: 'partial', message: `«${change.label}»: ${why}` };
        }
        if (reread === 'error') {
          return {
            bodySaved,
            ok: false,
            outcome: 'error',
            message: 'saved — but the card could not be re-read; the next save reads it first',
          };
        }
        // No success toast for an autosave: the chip says «saved 18:42», and a toast every two
        // seconds of typing would be noise the operator learns to ignore — errors included.
        if (!silent) {
          showMessage(planned > 1 ? `saved ${planned} changes` : 'tech card updated', 'success');
        }
        // A panel edited WHILE its own commit was in flight wrote the older values and kept the newer
        // ones staged (see commitAll); a panel staged for the first time meanwhile is queued too. With
        // the autosave on, the next cycle carries both without a word from anyone; the banner that
        // says «Press Save again» stays only where no autosave runs. The draft stays too: it is the
        // only copy of that work until it is written.
        const stillStaged = [...(outcome.restaged ?? []), ...(outcome.pending ?? [])];
        if (stillStaged.length > 0 && !autosaveEnabled) {
          setStagingError(
            `«${stillStaged.map((c) => c.label).join('», «')}» changed while the save was running — the newer values are still staged. Press Save again.`,
          );
        }
        // R-9: only a TRUE re-stage — a panel this run committed, moved again — is `restaged`, the one
        // outcome the autosave counts toward its cap. New work staged meanwhile is ordinary work: the
        // write is `complete`, and the autosave's own «work left» check (B-03) carries it next cycle.
        if (outcome.restaged?.length) return { bodySaved, ok: true, outcome: 'restaged' };
        // B-03 / B-04: history and the draft cleanup belong to a QUIET card, and the autosave decides
        // that — its onComplete runs only when nothing is left to write (an edit typed while this
        // write was on the wire is still only in the draft). The one edit-mode write WITHOUT the
        // autosave is a frozen card's «re-open to draft», and it clears nothing: a draft present then
        // was left by edits typed while the card was being released, and the banner offers it once
        // the card is open again.
        return { bodySaved, ok: true, outcome: 'complete' };
      }

      // ── CREATE ────────────────────────────────────────────────────────────────────────────────
      // A7 (Codex B-07): the card's style facts (fit, brand, collection, season, gender) are written
      // by StyleFactsField through its own UpdateStyle, which needs the card's id — and a new card had
      // none, so those fields were silently dropped by «add». Now: create, hand the new id to the
      // panel, commit its staged write, and only THEN leave. A failure keeps the operator here with
      // the «saved X of Y» banner; `createdIdRef` makes the retry finish THIS card instead of minting
      // a second one.
      let newId = createdIdRef.current;
      if (newId) {
        // B-09: the card already exists — a panel failed after «add» created it. The retry goes
        // through the UPDATE pipeline for THAT card before the panels: fields edited while the
        // operator was sorting out the failure are part of the card too, and «add» used to skip
        // straight to the panels and drop them on the way to the list.
        const current = await adminService.GetTechCard({ id: newId, vatCountryCode: undefined });
        const { payload } = gateTechCardPayload(
          mapFormToTechCardInsert(data, current.techCard?.techCard, canWriteCosting),
          { serverSpeaksDesign: designBandSpeaks },
        );
        await updateTechCard.mutateAsync({
          id: newId,
          techCard: payload,
          // The version read a moment ago. This card is seconds old and only this page knows it; a
          // version remembered from the create would 409 against the panels written since.
          expectedLockVersion: current.techCard?.lockVersion ?? 0,
        });
        bodySaved = true;
      } else {
        const created = await createTechCard.mutateAsync(techCardInsert);
        bodySaved = true;
        newId = created?.id ?? undefined;
        if (newId) {
          createdIdRef.current = newId;
          // A SYNC render: React flushes a sync render's passive effects before flushSync returns,
          // so StyleFactsField's staging effect has already run against the new id by the next line
          // (and useTechCardStaging writes its queue ref eagerly for exactly this reader).
          const minted = newId;
          flushSync(() => setCreatedId(minted));
        }
      }
      if (newId) {
        const planned = 1 + staging.peek().length;
        const outcome = await staging.commitAll();
        if (outcome.failed && !pageMounted.current) {
          // R-13: the operator left while the panels ran (a panel of a page that is gone refuses at
          // once, by name). Nothing here is theirs to look at any more — no banner, no params, no
          // navigation — and nothing is «still staged»: the queue went with the page. One sentence
          // says what is missing — the refused panel and every one queued after it — and where to put
          // it back. This session's copy of the create form goes too: the card exists, and «restore»
          // on the next new card would «add» it a second time (a draft found on open and not answered
          // is not this session's, and stays — R-11).
          const queued = staging.peek();
          const missing = queued.length > 0 ? queued : [outcome.failed.change];
          showMessage(
            missing.every((c) => c.key === 'styleFacts')
              ? 'created without its style facts — open the card to retry'
              : `created without «${missing.map((c) => c.label).join('», «')}» — open the card to retry`,
            'error',
          );
          draft.clearOwn();
          return { bodySaved: true, ok: false, outcome: 'partial' };
        }
        if (outcome.failed) {
          const { change, error } = outcome.failed;
          setStagingError(
            `the card is created, saved ${1 + outcome.committed.length} of ${planned}. «${change.label}» failed: ${techCardErrorMessage(error, 'unknown error')}. Press add again to retry the rest.`,
          );
          showMessage(
            `«${change.label}» failed. The card is created, the rest is still staged`,
            'error',
          );
          leaveFullscreen();
          return { bodySaved: true, ok: false, outcome: 'partial' };
        }
      }
      showMessage('tech card created', 'success');
      // This session's copy only: a found «new» draft nobody answered is the operator's earlier work (R-11).
      draft.clearOwn();
      // R-13: landed after the operator left — they are somewhere else now, and stay there.
      if (!pageMounted.current) return { bodySaved: true, ok: true, outcome: 'complete' };
      // If they were working on labels & pkg, land on the saved card's labels tab so the
      // per-style assembly / packaging-recipe / dust-bag editors (which need the new id) are
      // right there — instead of bouncing to the list and losing the thread (see PreSavePrompt).
      if (newId && activeTab === 'labels') {
        navigate(`${ROUTES.techCards}/${newId}?tab=labels`);
      } else {
        navigate(ROUTES.techCards);
      }
      return { bodySaved: true, ok: true, outcome: 'complete' };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      // M-01: a 409 on the AUTO-STAGE's own write, with nothing else of the operator's in flight,
      // is not a conflict anyone has to decide — the other tab already moved the card. Re-read it
      // quietly and let the next readiness answer decide again.
      if (status === 409 && opts.autoStage && autoStageUntouched()) {
        const reread = await quietReload(autoStageBaseline.current);
        if (reread === 'reread') {
          return { bodySaved, ok: false, outcome: 'nothing' };
        }
        // B-07: nothing re-read, nothing to reconcile against. The raised stage goes back to what is
        // saved (it did not land), and the chip says the save failed instead of «saved» over a form
        // that still carries it. The cached version is left as it was: pairing a fresher lock with
        // this page's stale values is how a write would silently overwrite the other editor.
        const saved = (form.control._defaultValues as Partial<TechCardFormData>).stage ?? '';
        form.setValue('stage', saved, { shouldDirty: true });
        // mn-2: typed during the read — their card moved under the typing; the decision, not a merge.
        if (reread === 'typed') {
          const message = 'another editor saved this card while you were typing';
          leaveFullscreen();
          openConflict();
          return { bodySaved, ok: false, outcome: 'conflict', message };
        }
        return {
          bodySaved,
          ok: false,
          outcome: 'error',
          message: 'another save moved this card, and re-reading it failed',
        };
      }
      // Серверный отказ: и модалка конфликта, и пришпиленные к полям нарушения, и — главное —
      // `ClearAssemblyButton`, единственный выход из щита «карточка несёт узлы», живут под
      // оверлеем. Фулскрин уходит раньше, чем что-либо из этого показывается.
      if (!silent || status === 409) leaveFullscreen();
      if (status === 409) openConflict();
      // ОТКАЗ ТРАНСПОРТА РАСПОЗНАЁТСЯ ПЕРВЫМ. Строгий маршалер (Ф2) отвечает на незнакомое поле
      // или незнакомое имя члена словаря 400 без единого поимённого нарушения: RPC не звали,
      // карточка не тронута. Показывать это «голым сообщением» значит показать человеку
      // `proto: (line 1:145)` и оставить его с ним наедине.
      const transport = transportRefusal(error);
      // Pin server field-violations (google.rpc.BadRequest) onto the exact inputs, then surface the
      // owning tab so the error dot + focus land where the user can act (Q1/S24).
      const { applied, unmapped, contradictions } = applyServerFieldErrors(error, form.setError, {
        stripPrefixes: ['tech_card'],
        // ОТКАЗ, ПРОТИВОРЕЧАЩИЙ ЭКРАНУ. `required` / `unknown_value` про поле, которое форма
        // держит ЗАПОЛНЕННЫМ, означает не «человек не заполнил», а «сервер не узнал значения» —
        // бэкенд старше приложения и выбросил незнакомый член словаря по дороге. Предикат тот же
        // самый, что проверяет проба: он объявлен ОДИН раз рядом с `isPresent`, потому что
        // отвечает на тот же вопрос, что аудит присутствия.
        contradicts: contradictsScreen((path) => form.getValues(path as never)),
      });
      // An autosave never yanks the operator to another tab: the chip says «N errors» and its click
      // is the walk to the field.
      if (applied.length > 0 && !silent) {
        const root = applied[0].split('.')[0];
        setActiveTab(errorTabFor(root));
      }
      if (transport || contradictions.length > 0) {
        if (silent) leaveFullscreen();
        setVersionSkew({
          quote: transport ?? undefined,
          fields: contradictions.map((c) => ({
            path: c.path,
            description: c.violation.description,
          })),
        });
      }
      // Непришпиленное нарушение дописывается к тосту В ЛЮБОЙ ветке, включая баннерную:
      // отказ, который никуда не встал — ни на контрол, ни в баннер, ни в тост, — и есть та
      // самая невидимая потеря, ради которой затевалась фаза. (У автосейва тоста нет — то же
      // предложение уезжает в поповер чипа через `message`.)
      const base =
        transport || contradictions.length > 0
          ? 'the backend did not recognise part of this card — see the banner on the card'
          : techCardErrorMessage(error, 'Failed to submit tech card');
      const message = unmapped.length
        ? `${base} — ${unmapped.map((u) => u.description).join('; ')}`
        : base;
      if (!silent) showMessage(message, 'error');
      console.error('Failed to submit tech card', error);
      const outcome: SaveOutcome =
        status === 409 ? 'conflict' : applied.length > 0 ? 'invalid' : 'error';
      return { bodySaved, ok: false, outcome, message };
    }
  }

  // ═══ ПОСЛЕ ЗАПИСИ ТЕЛА: БАЗА ПЕРЕЕЗЖАЕТ, ЗНАЧЕНИЯ ОСТАЮТСЯ НА МЕСТЕ (волна 25.09) ═══════════════
  // До автосейва здесь стоял `form.reset(settled.values)`. Он честен о значениях, но с автосейвом
  // два его побочных действия стали бедой:
  //   · полный reset шлёт событие в array-подписку RHF, и КАЖДЫЙ useFieldArray чеканит новые ключи
  //     строк: строки BOM, операций, выносок размонтируются, фокус и каретка уходят из поля, раскрытые
  //     плитки сворачиваются. Раньше — раз на нажатие Save; с автосейвом — после каждой паузы в наборе;
  //   · он ставит форму в то, что УШЛО, и стирает нажатия, сделанные, пока летели PUT и повторное
  //     чтение.
  // Теперь это два разных шага. ЗНАЧЕНИЯ правятся точечно — лист за листом, где они разошлись с тем,
  // что теперь хранит сервер (лист никогда не пересоздаёт ключей массива; в корень массива пишется
  // только смена его ДЛИНЫ — строки и правда поменялись, и useFieldArray обязан это услышать). Поле,
  // которое человек успел изменить, пока запись летела, остаётся ЕГО значением (трём спискам с
  // серверными значениями — подписи, выкройки, BOM — серверное доливается и в него: строка BOM,
  // добавленная этим сохранением, не должна уйти следующим снова с id 0). БАЗА переезжает отдельно:
  // `reset(…, { keepValues: true })` меняет только то, с чем сравнивается «грязно».
  function settleAfterBodySave(
    before: TechCardFormData | null,
    settled: { values: TechCardFormData; server: TechCardFormData | null },
    // M-03: the purpose the write deliberately did NOT carry (a sellable→auxiliary switch waiting
    // for its dialog); it goes back into the form, still dirty against the new baseline.
    keepPurpose?: string,
    // Fields whose baseline this write must NOT move: they are written by a panel that commits after
    // the body and settles them itself once its own write lands.
    keepBaseline: readonly (keyof TechCardFormData)[] = [],
  ) {
    // The merge, the baseline key by key (R-1) and the sparse dirty map (R-8) live beside the machine
    // (useTechCardAutosave.ts), where the probe runs them on a real RHF form.
    settleFormAfterSave(form, before, settled, {
      keepPurpose,
      keepBaseline,
      serverLists: assignServerLists,
    });
  }

  // NF-07 guided convert. The server's purpose lock counts LIVE colourways, and the client already
  // knows them — so the flip is intercepted BEFORE the request instead of coming back as a refusal
  // the operator can do nothing with. The lock's OTHER arms (non-cancelled runs, sold colourways,
  // assembly usage — and the registry grows) are invisible from here and stay the server's refusal;
  // archiving cannot clear those, which is why the dialog promises only the colourway arm.
  const flipsToAuxiliary = (data: TechCardFormData) =>
    isEditMode &&
    toPurposeEnum(data.purpose) === 'TECH_CARD_PURPOSE_AUXILIARY' &&
    toPurposeEnum(storedCard()?.techCard?.purpose) !== 'TECH_CARD_PURPOSE_AUXILIARY';

  const colorwayLabel = (c: { colorwayId?: number; colorCode?: string; baseSku?: string }) =>
    c.baseSku?.trim() || c.colorCode?.trim() || `#${c.colorwayId ?? 0}`;

  // Which colours a convert can seed. A colour is unique per card server-side, so two colourways
  // sharing one code would make the second a guaranteed refusal — dedup here rather than report a
  // "failure" the operator can do nothing about. UPPERCASED because the server uppercases before
  // its own duplicate check: 'blk' and 'BLK' are one colour there, so they must collapse into one
  // here too or the second is sent only to be refused. A colourway with no colour code is skipped
  // outright: there is nothing to register it under.
  const colourCodesOf = (colorways: common_AdminColorwayRef[]) => {
    const seen = new Set<string>();
    for (const c of colorways) {
      const code = c.colorCode?.trim().toUpperCase();
      if (code) seen.add(code);
    }
    return [...seen];
  };
  // Every colour this convert has ever queued, across retries. The archive loop is resumable and
  // `liveColorways` shrinks as it succeeds — so attempt 2's queue no longer contains the colours
  // attempt 1 already archived, and seeding from that queue alone would silently drop them while
  // reporting success. Accumulated BEFORE the loop runs, drained only by a colour that actually
  // landed.
  const seedCodes = useRef(new Set<string>());
  // What the dialog's checkbox promises — the union of what is queued now and what an earlier
  // attempt already archived, so the list names exactly what will be sent. Reading the ref here is
  // safe: it is written before the dialog can re-open, and re-opening is what changes `convert`.
  const seedableCodes = useMemo(
    () => [...new Set([...seedCodes.current, ...colourCodesOf(convert?.colorways ?? [])])],
    [convert],
  );

  async function doSubmit(data: TechCardFormData): Promise<SaveResult> {
    // handleSubmit validated the whole form: whatever the quiet check listed is answered.
    setSilentIssues([]);
    if (flipsToAuxiliary(data) && liveColorways.length > 0) {
      setConvertReport(null);
      setConvert({ data, colorways: liveColorways });
      return { outcome: 'needs-confirm' };
    }
    const r = await writeTechCard(data, { mode: 'explicit' });
    return { outcome: r.outcome, message: r.message };
  }

  // «archive & switch»: retire every live colourway, then run the same save again. Client-guided and
  // NOT atomic — there is no server RPC that does both — so every exit says exactly what happened.
  // Archiving a colourway touches `product` only (it does not bump tech_card.lock_version), so the
  // save that follows still claims the version this page loaded; a genuine 409 here is a real
  // concurrent edit and falls through to the existing conflict modal.
  async function confirmConvert() {
    if (!convert || converting) return;
    const queue = convert.colorways;
    const data = convert.data;
    const archived: string[] = [];
    // Banked BEFORE anything can fail: whatever this attempt archives stops being a live colourway,
    // so a later retry would never see these codes again.
    for (const code of colourCodesOf(queue)) seedCodes.current.add(code);
    // Held across the archive loop AND the save that follows: this path bypasses form.handleSubmit,
    // so `isSubmitting` never rises and the header's Save button would otherwise stay live while the
    // flip PUT is in flight. `converting` is what disables it (see the Save button).
    setConverting(true);
    try {
      try {
        for (const c of queue) {
          // expectedVersion is echoed per the RPC contract; the server enforces the transition on the
          // colourway's own lifecycle_status, so a sequential loop needs no re-read between calls.
          await adminService.ArchiveColorwayByID({
            colorwayId: c.colorwayId,
            expectedVersion: c.lockVersion ?? 0,
          });
          // Remembered before the label: this is what keeps a retry from re-archiving it.
          archivedIds.current.add(c.colorwayId ?? 0);
          archived.push(colorwayLabel(c));
        }
      } catch (error) {
        const failed = queue[archived.length];
        setConvert(null);
        setConvertReport(
          `archived ${archived.length} of ${queue.length}${
            archived.length ? ` (${archived.join(', ')})` : ''
          } — «${colorwayLabel(failed ?? {})}» failed: ${
            // Deliberately NOT techCardErrorMessage: this is a COLOURWAY transition, and that helper's
            // copy talks about the tech card ("re-open it to Draft"), which would misdirect.
            error instanceof Error ? error.message : 'unknown error'
          }. ` +
            'The card is STILL SELLABLE and nothing was flipped — restore each archived colourway ' +
            'from its own page while it stays sellable, or press save again to retry the rest.',
        );
        // Тот же неуспех и тот же довод: отчёт о наполовину состоявшемся переводе — баннер на
        // странице, и под оверлеем его никто не прочтёт.
        leaveFullscreen();
        showMessage('convert stopped — the card is still sellable', 'error');
        return;
      }
      // The card's colourway list drives the lock warning and the release gate; it is stale the
      // moment the loop finishes. Refetch (don't await — the save below reads the form, not the
      // query, and archivedIds already covers the gap).
      if (numId) queryClient.invalidateQueries({ queryKey: techCardKeys.detail(numId) });
      setConvert(null);
      const { bodySaved, ok, outcome, message } = await writeTechCard(data);
      // R-7: the autosave handed this write to the dialog and does not run it, so it hears the outcome
      // here — its status ends where the write did (no «unsaved · save now» over a card that is saved),
      // and a quiet card gets the same bookkeeping as after its own cycle (draft, history).
      autosave.settleExternal({ outcome, message }, 'convert');
      if (ok) {
        // Only now: the card has to BE auxiliary before a colour variant is allowed on it (the
        // server refuses one on a sellable card), so seeding is a follow-up to the flip, not part
        // of it. Nothing here can un-flip the card — a failed colour is a retry from «output
        // material», which is exactly what the report says.
        // Every colour banked across ALL attempts, not just this queue: a resumed convert must
        // still seed what the earlier attempt archived.
        const codes = [...seedCodes.current];
        if (seedColours && codes.length > 0 && numId) {
          showMessage(`registering ${codes.length} colour(s)…`, 'success');
          const { created, failed } = await seedColourVariants(numId, codes);
          // Drain only what landed. A colour that failed stays banked so the next attempt retries
          // exactly it, and one already created is never re-sent (that would refuse as a duplicate).
          for (const code of created) seedCodes.current.delete(code);
          // The save's own invalidation already fired BEFORE these writes existed, so the seed has
          // to repeat it — same three keys the variants panel uses.
          queryClient.invalidateQueries({ queryKey: techCardKeys.detail(numId) });
          queryClient.invalidateQueries({ queryKey: techCardKeys.lists() });
          queryClient.invalidateQueries({ queryKey: techCardKeys.pipeline() });
          if (failed.length > 0) {
            setConvertReport(
              `the card IS auxiliary now and ${created.length} of ${codes.length} colour ` +
                `variant(s) were registered. Not registered: ${failed
                  .map((f) => `${f.code} — ${f.message}`)
                  .join('; ')}. ` +
                'Nothing else is pending — retry each one from «output material» on the header tab.',
            );
            // Неуспех ПОСЛЕ состоявшегося сохранения — но и отчёт с перечнем незарегистрированных
            // цветов, и путь к повтору («output material» на вкладке шапки) стоят под оверлеем:
            // правило «любой неуспех закрывает» покрывает и хвост управляемого перевода.
            leaveFullscreen();
            showMessage('switched to auxiliary — some colours were not registered', 'error');
          } else {
            showMessage(
              `switched to auxiliary · ${created.length} colour variant(s) registered`,
              'success',
            );
          }
        }
        return;
      }
      // Two different truths, and telling them apart is the whole point of bodySaved. If the body
      // PUT landed, the card IS auxiliary now and those colourways can no longer be restored —
      // promising otherwise would send the operator to a page whose restore button refuses.
      setConvertReport(
        bodySaved
          ? `archived ${archived.length} colourway(s) (${archived.join(', ')}) and the switch to ` +
              'AUXILIARY DID save — but a staged panel did not (see the banner above; what failed is ' +
              'still staged, press Save again). The archived colourways can no longer be restored: ' +
              'the card is auxiliary now and un-archiving is refused for an auxiliary style.'
          : `archived ${archived.length} colourway(s) (${archived.join(', ')}) but the switch to ` +
              'auxiliary did NOT save — see the error above. The card is still SELLABLE, so every one ' +
              'of them can still be restored from its own page; after a successful flip that stops ' +
              'working (an auxiliary style refuses to un-archive a colourway).',
      );
    } finally {
      setConverting(false);
    }
  }

  // Surface validation failures — otherwise clicking Save with an invalid field (e.g. a tab the
  // user can't see) does nothing and looks like a broken button. Every errored field renders red on
  // its own (aria-invalid, styled once in ui/form + ui/components/input); this routine additionally
  // walks the user to the FIRST one: switch to its tab, focus it, scroll it into view, pulse it.
  const onInvalid = (errors: FieldErrors<TechCardFormData>) => {
    const flat = flattenFieldErrors(errors as FieldErrors);
    if (flat.length === 0) {
      // Тот же закон «любой неуспех закрывает», что и ниже: отвести к полю нечем, но красные
      // рамки, которые тост просит проверить, стоят под оверлеем — совет смотреть на то, чего
      // не видно, хуже, чем просто показать страницу.
      leaveFullscreen();
      showMessage('check the fields with errors', 'error');
      return;
    }
    const first = flat[0];
    const tab = errorTabFor(errorRootKey(first.path));
    // Фулскрин уходит ПЕРВЫМ: и переключение вкладки, и пульс поля ниже происходят под оверлеем,
    // и без этого «save» из полноэкранной схемы кончался бы одним тостом над неизменившимся
    // экраном.
    leaveFullscreen();
    setActiveTab(tab);
    setFocusTarget((prev) => ({ path: first.path, nonce: (prev?.nonce ?? 0) + 1 }));
    // The toast ALWAYS carries the concrete dotted path AND the message — never just a tab name.
    // If the path has no reachable input (a container we forgot to open, a field behind a
    // permission, a schema key with no control), this line is the safety net that keeps the error
    // diagnosable instead of a dead end where Save silently does nothing.
    const tabLabel = TABS.find((t) => t.id === tab)?.label ?? tab;
    const more = flat.length > 1 ? ` (+${flat.length - 1})` : '';
    showMessage(`${tabLabel} → ${first.path} — ${first.message || 'invalid'}${more}`, 'error');
  };
  // THE EXPLICIT SAVE as one promise with a verdict: validation with the walk to the first error,
  // the convert dialog for a sellable→auxiliary flip, the success toast. On a saved card it runs
  // through the autosave's queue (⌘S, «save now», «retry», «keep mine»), so there is never a second
  // write in flight beside an autosave cycle.
  const explicitSave = () =>
    new Promise<SaveResult>((resolve) => {
      form
        .handleSubmit(
          async (data) => resolve(await doSubmit(data)),
          (errors) => {
            onInvalid(errors);
            resolve({ outcome: 'invalid' });
          },
        )()
        .catch((error) =>
          resolve({ outcome: 'error', message: techCardErrorMessage(error, 'save failed') }),
        );
    });
  // Every «save» door of the page. A new card has no autosave: `add` IS the save.
  const save = () => (autosaveEnabled ? autosave.saveNow('button') : explicitSave());

  // THE AUTOSAVE'S WRITE (mode 'silent'). The controller has already validated QUIETLY (the schema's
  // own parse, nothing published onto the fields — Codex M-02); here the values are parsed exactly as
  // handleSubmit would hand them to doSubmit (zod OUTPUT, defaults and all).
  //
  // M-03: a sellable→auxiliary flip never opens its dialog on its own. The write carries the STORED
  // purpose so every other edit still lands, the flip goes back into the form afterwards, and the
  // status says `needs-confirm` until an explicit save (⌘S / «save now») runs the dialog.
  async function silentSave(): Promise<SaveResult> {
    const parsed = await techCardSchema.safeParseAsync(form.getValues());
    if (!parsed.success) {
      const issues = quietIssues(parsed.error);
      setSilentIssues(issues);
      return { outcome: 'invalid', errorsCount: issues.length };
    }
    let data = parsed.data as TechCardFormData;
    let keepPurpose: string | undefined;
    if (flipsToAuxiliary(data)) {
      const stored = form.control._defaultValues as Partial<TechCardFormData>;
      const withoutFlip = (v: Partial<TechCardFormData>) => ({
        ...v,
        purpose: undefined,
        auxSubtype: undefined,
      });
      if (
        staging.peek().length === 0 &&
        deepEqual(withoutFlip(form.getValues()), withoutFlip(stored))
      ) {
        return { outcome: 'needs-confirm' };
      }
      keepPurpose = data.purpose;
      data = { ...data, purpose: stored.purpose ?? 'TECH_CARD_PURPOSE_SELLABLE' };
    }
    const r = await writeTechCard(data, {
      mode: 'silent',
      autoStage: autoStageInFlight.current,
      keepPurpose,
    });
    return {
      outcome: r.outcome,
      message: r.message,
      pendingConfirm: keepPurpose !== undefined && r.outcome === 'complete',
    };
  }

  // «keep mine & overwrite» — the conflict modal's other exit. Read the card's CURRENT version off
  // the server, then re-run the same save carrying it: the form's values are untouched, so the
  // operator's edits land on top of the other editor's, which is exactly what the button offers. The
  // old handler only closed the modal, leaving the stale version in place — every retry 409'd again
  // and the only way out was «reload theirs», discarding the work.
  const keepMineAndOverwrite = async () => {
    if (!numId) return;
    try {
      const res = await adminService.GetTechCard({ id: numId, vatCountryCode: undefined });
      lockOverride.current = res.techCard?.lockVersion ?? 0;
      // The operator's own choice (M-3): this page stands on their card from here, and the write below
      // claims its version. MJ-1: what the operator did NOT change takes their card first — «keep mine»
      // keeps the operator's changes, not the body the conflict found under them; left as it was, that
      // body went out with this write (or, with no body work, with the next unrelated edit's write,
      // under their version, unrefused).
      if (res.techCard) {
        rebaseOnto(res.techCard);
        adopt(res.techCard);
      }
      // И САМУ КАРТОЧКУ, А НЕ ТОЛЬКО НОМЕР ВЕРСИИ. Прочитанное здесь — это то, ЧТО лежит на
      // сервере сейчас, и от него зависит не только замок: маппер записи спреадит `original`
      // (поля, которых форма не ведёт), а щиты совместимости решают по нему, объявлять ли
      // намерение снять узлы и снимки. Взяв одну версию и оставив в кэше вчерашнюю карточку, мы
      // получали ровно тот отказ, от которого эта кнопка спасает: соседняя вкладка добавила узлы,
      // наша карточка о них не знает, `assemblyCleared` зажат в false «потому что узлов нет» —
      // и сервер отвергает запись, а кнопка «не потеряй работу» упирается в «перезагрузи и потеряй».
      // `res.techCard`, NOT `res` (волна 25.09): the detail key holds the CARD, as useTechCard and
      // withServerAssignedValues write it. The whole response here turned the `techCard` prop into
      // `{ techCard: <card> }` — harmless only while the retry below ran through a closure from the
      // render BEFORE this write; the autosave runs the LATEST closure, which would have mapped the
      // wrapper as the card.
      queryClient.setQueryData(techCardKeys.detail(numId), res.techCard);
    } catch (error) {
      showMessage(
        techCardErrorMessage(error, 'could not read the server’s version — try saving again'),
        'error',
      );
      return;
    }
    // Through the autosave's queue as an EXPLICIT save. The operator's own choice is what lifts the
    // pause on a conflict — the ONLY thing that does, ⌘S included (M-01; B-02: the autosave never
    // picks «keep mine» by itself) — and it is lifted only now, with the current version in hand.
    // Answered (mn-5): writes may go out again — this one first.
    conflictOpen.current = false;
    setConflict(false);
    autosave.resolveConflict();
    void save();
  };
  // G1 (волна 25.09): the approval travels as a FORM VALUE, set dirty before the save. It used to be
  // passed only into the validated payload — and on a pristine form writeTechCard skips the body
  // (`bodyDirty` false), so «release ▸» and «re-open to draft» wrote nothing. The old worry — a failed
  // validation leaving the card in an ungated state that a later plain save would persist — is
  // answered by putting the SAVED value back whenever a write carrying this approval did not land:
  // otherwise the autosave would ship RELEASED with the next unrelated edit, past the gate the
  // operator was shown.
  //
  // B-08: and the approval is the LAST write. Everything else is flushed first, to a quiet card: a
  // release that shared its write with the ordinary work could freeze the card with a panel failed
  // or an edit still in flight — and a released card no longer saves, so that work would be stranded.
  // If the ordinary flush does not end quiet, nothing is released: the chip, the modal or the walk to
  // the field already says why.
  const submitWithApproval = async (next: string) => {
    if (autosaveEnabled) {
      const before = await autosave.saveNow(`before:${next}`);
      if (before !== 'ok' && before !== 'nothing') {
        // R-10: nothing moved, and the door says why. A conflict has opened its decision already, and
        // an invalid card whose errors are on the fields was just walked to the first of them; every
        // other refusal used to leave the button doing nothing at all.
        const published =
          flattenFieldErrors(form.control._formState.errors as FieldErrors).length > 0;
        if (before === 'conflict' || (before === 'invalid' && published)) return;
        const why =
          before === 'off'
            ? 'this card is not saving right now — reload it'
            : flushRefusalSentence(before, autosave.errorsCount);
        showMessage(
          `${next === RELEASED ? 'not released' : 'not moved back to draft'}: ${why}`,
          'error',
        );
        return;
      }
    }
    approvalAttempt.current = { next, landed: false };
    form.setValue('approvalState', next, { shouldDirty: true });
    let landed = false;
    try {
      if (autosaveEnabled) await autosave.saveNow(`approval:${next}`);
      else await explicitSave();
    } finally {
      landed = approvalAttempt.current?.landed ?? false;
      approvalAttempt.current = null;
      // m3: back to the approval this page stands on NOW — the baseline, which a re-read during the
      // pre-flush may have moved — not the one read before it: that stale value would go out with the
      // next autosave and undo another editor's approval change.
      if (!landed) {
        const standing =
          ((form.control._defaultValues as Partial<TechCardFormData>).approvalState as
            | string
            | undefined) || DRAFT;
        form.setValue('approvalState', standing, { shouldDirty: true });
      }
    }
    // Typed while the release was on the wire: the card is frozen now and saves nothing more. The
    // draft keeps it (it is cleared only by a quiet save) for the next «re-open to draft».
    if (landed && next === RELEASED && (bodyWorkOf(form) || staging.peek().length > 0)) {
      showMessage(
        'released. Edits made while it was being released were not saved; they wait in the draft for the next re-open',
        'error',
      );
    }
  };

  // M-02: the autosave's check — the schema's own parse over the live values, nothing published onto
  // the fields. What it finds is counted on the chip and listed in the warnings organ; a field turns
  // red when the operator asks: ⌘S, the chip, its popover, a warnings row.
  const quietValidate = async () => {
    const parsed = await techCardSchema.safeParseAsync(form.getValues());
    const issues = parsed.success ? [] : quietIssues(parsed.error);
    setSilentIssues(issues);
    return { ok: parsed.success, errors: issues.length };
  };

  const autosave = useTechCardAutosaveController({
    enabled: autosaveEnabled,
    halted: () => haltedRef.current !== null,
    // The convert dialog owns the write it intercepted (confirmConvert re-runs it).
    paused: !!convert || converting,
    form,
    stagingRevision: staging.revision,
    hasStaged: () => staging.peek().length > 0,
    save: (mode) => (mode === 'explicit' ? explicitSave() : silentSave()),
    validate: quietValidate,
    // LIVE errors (the published ones: an explicit save, a server violation), before any re-render.
    countErrors: () => flattenFieldErrors(form.control._formState.errors as FieldErrors).length,
    onComplete: afterQuiescentSave,
    // R-11: organs read it off the contract (the WORDS seed waits while it is true).
    draftPending: !!draft.pending,
    // M2: a style fact is work only through the style panel's queue — the body never writes it.
    bodyWork: () => bodyWorkOf(form),
  });

  // THE DRAFT BANNER'S DOORS. A restore over a card whose body moved since the draft asks first (ревью
  // MJ-3); restored work is unsaved work — the autosave hears it at once (B-1).
  function doRestore(id: string | undefined) {
    setRestoreAsk(null);
    draft.restore(id);
    autosave.request('restore');
  }
  function askRestore(id: string | undefined) {
    const moved = draft.movedSince(id);
    if (moved) setRestoreAsk({ id, ...moved });
    else doRestore(id);
  }
  function discardDrafts() {
    setRestoreAsk(null);
    draft.clear();
  }

  const saving = form.formState.isSubmitting || autosave.status === 'saving';
  // A card at rest has nothing to answer for: the quiet check's list goes with the work it was about
  // (a revert of the only invalid edit ends here without another check).
  useEffect(() => {
    if (autosave.status === 'saved' || autosave.status === 'idle') setSilentIssues([]);
  }, [autosave.status]);

  // ═══ АВТО-СТЕЙДЖ (D-14 / D-14' · Codex B-01, M-01) ════════════════════════════════════════════
  // STAGE IS A MILESTONE — monotonic. It marks how far the card has GOT; it is raised one step at a
  // time when the server's readiness says the next stage is reached, and it is never lowered here
  // (the server guards regressions besides). `decideAutoStage` holds the rules: fresh readiness, one
  // step, no `unknown` row. This effect adds the page's side: only on a settled card (nothing typed,
  // nothing staged — so a 409 on this write can be answered with a quiet re-read, M-01), at most five
  // steps per page life, each step its own save and its own «stage → …».
  const savedStage = techCard?.techCard?.stage;
  const draftPending = !!draft.pending;
  useEffect(() => {
    if (!AUTO_STAGE || !autosaveEnabled || autoStageInFlight.current) return;
    // R-11: a found draft still waiting for its answer holds the stage too — the raise would dirty the
    // form and go out with a quiet save before the operator has said what to do with that work.
    if (draftPending) return;
    if (autosave.status !== 'idle' && autosave.status !== 'saved') return;
    if (bodyWorkOf(form) || staging.peek().length > 0) return;
    if (autoStageSteps.current >= AUTO_STAGE_MAX_STEPS) return;
    const next = decideAutoStage({
      readiness,
      savedStage,
      formStage: form.getValues('stage'),
      isAux,
    });
    if (!next) return;
    autoStageSteps.current += 1;
    autoStageInFlight.current = true;
    form.setValue('stage', next, { shouldDirty: true });
    autoStageBaseline.current = cloneFormValues(form.getValues());
    void autosave.flush('stage').then((r) => {
      autoStageInFlight.current = false;
      autoStageBaseline.current = null;
      // «ok» can also mean «the quiet re-read after a 409, then the operator's own edits» (B-07): the
      // stage is announced only if the saved card now carries it.
      const landedStage = (form.control._defaultValues as Partial<TechCardFormData>).stage;
      if (r === 'ok' && landedStage === next) showMessage(`stage → ${stageLabel(next)}`, 'success');
    });
    // `form` and `staging` are read live inside; the triggers are the readiness answer, the saved
    // stage, the form's stage and the autosave settling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness, savedStage, stage, autosave.status, autosaveEnabled, isAux, draftPending]);

  // ROLLBACK (D-17'): text sections only, everything else stays as it is now; then save.
  const restoreHistory = (entry: HistoryEntry) => {
    const { next, changed } = restoreTextSections(form.getValues(), entry.values);
    if (changed.length === 0) return;
    for (const key of changed) form.setValue(key, next[key] as never, { shouldDirty: true });
    showMessage(
      `restored ${changed.map((k) => TEXT_SECTION_LABEL[k]).join(', ')} from ${formatSavedAt(entry.at)}`,
      'success',
    );
    void autosave.flush('history');
  };

  // A form error named in the warnings organ walks to its field — the same walk onInvalid takes.
  const revealError = (path: string) => {
    // M-02: the quiet check publishes nothing; walking to a field is the moment its error shows.
    void form.trigger(path as never);
    leaveFullscreen();
    setActiveTab(errorTabFor(errorRootKey(path)));
    setFocusTarget((prev) => ({ path, nonce: (prev?.nonce ?? 0) + 1 }));
  };
  // Published errors (an explicit save, a server violation) first, then what the quiet check found
  // and nobody has asked to see yet — the warnings organ counts both (M-02).
  const publishedPaths = new Set(flatErrors.map((e) => e.path));
  const formErrorRows: FormErrorRow[] = [
    ...flatErrors,
    ...silentIssues.filter((i) => !publishedPaths.has(i.path)),
  ].map((e) => {
    const tab = errorTabFor(errorRootKey(e.path));
    return { path: e.path, message: e.message, tab: TABS.find((t) => t.id === tab)?.label ?? tab };
  });

  /**
   * ЭКСПОРТ АРХИВА КАРТОЧКИ. Сервер кладёт zip в бакет и отдаёт presigned-ссылку; скачивает её
   * БРАУЗЕР, а не мы — не fetch с blob'ом: файл может весить сотни мегабайт, и тянуть его в
   * память вкладки, чтобы тут же отдать на диск, незачем.
   *
   * НО НЕ `window.open`. Ссылку выдаёт сервер, то есть открытие происходит ПОСЛЕ `await`, а
   * пользовательская активация вкладки к тому моменту может уже погаснуть — замерено, что
   * `navigator.userActivation.isActive` гаснет где-то между 4.9 и 5.2 секундами после клика, а
   * упаковка карты с медиа и выкройками эту секунду переживает не всегда. Погасший клик — это
   * блокировщик попапов, то есть экспорт, который «ничего не сделал».
   *
   * Клик по созданному `<a>` под блокировщик не попадает вовсе — тот же приём, что в
   * `accounting/reports/components/xml-export-button.tsx`. Атрибут `download` здесь только
   * заявление о намерении: ссылка ведёт на чужой origin (бакет), и там браузер его игнорирует —
   * и имя файла, и само «скачать, а не открыть» приезжают из `response-content-disposition`,
   * который presign проставляет всегда (`bucket/archive.go`, `download=true`).
   *
   * Ссылка живёт 10 минут и нигде не запоминается: протухшую повторяют новым экспортом.
   */
  async function handleExportArchive() {
    if (!numId || exportingArchive) return;
    setExportingArchive(true);
    try {
      const res = await adminService.ExportTechCardArchive({ techCardId: numId });
      // url приезжает с провода как `string | undefined`, но при EmitUnpopulated незаполненное
      // поле — ЯВНЫЙ null. Проверка на falsy покрывает оба, `=== undefined` не покрыло бы.
      if (!res.url) {
        showMessage('export produced no link — try again', 'error');
        return;
      }
      const link = document.createElement('a');
      link.href = res.url;
      link.download = '';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Дыры архива (пропавшее медиа, нечитаемая выкройка) экспорт НЕ роняют — сервер перечисляет
      // их в манифесте. Молчать о них здесь значило бы отдать неполный архив как полный.
      const holes = res.manifest?.holes?.length ?? 0;
      showMessage(
        holes > 0
          ? `archive exported — ${holes} item(s) could not be included`
          : 'archive exported',
        holes > 0 ? 'error' : 'success',
      );
    } catch (error) {
      showMessage(techCardErrorMessage(error, 'export failed'), 'error');
    } finally {
      setExportingArchive(false);
    }
  }

  // ═══ CARD DETAILS — STEP 0 OF THE CHAIN, HANDED TO THE STUDIO AS A SLOT (WAVE2 p.1) ═══════════
  // The header's blocks are drawn FIRST in the studio's stack, above the moodboard, by `StudioTab`
  // (`design/studio-tab.tsx`, prop `cardDetails`) — in all three of its return branches, so a card
  // that is not saved yet still shows the fields it is created with. The JSX is the header's own,
  // moved, not rewritten. `StyleFactsField` does NOT ride along: it is the one writer of brand /
  // collection / season / targetGender and stays mounted unconditionally below.
  const cardDetails = (
    <>
    {/* ═══ ONE BLOCK, NOT FOUR (studio v3, step 0 «как в референсе») ════════════════════════════
        The prototype's `cardBlock()`: a single CARD DETAILS block with a `N of 10 fields` counter
        in its rule and the groups as rules inside it — IDENTIFICATION, CLASSIFICATION, BASE MODEL
        & SAMPLE SIZE, then RESPONSIBLE ROLES | LINKED PRODUCTS side by side. The composition lives
        in `design/card-details.tsx`; every field is the SAME RHF field it was, and the roles keep
        writing through their own RPCs the instant they change. What this file still decides is
        what only it knows: whether the card is saved (`numId`), its stage, its purpose, who may
        write, and the one door out (`navTo('colorways')` — the address has ONE writer).
        `StyleFactsField` does NOT ride along: it is the one writer of brand / collection / season /
        targetGender and stays mounted unconditionally below. */}
    <CardDetails
      techCardId={isEditMode ? numId : undefined}
      isIdea={isIdea}
      isAux={isAux}
      canEdit={canWrite(SECTION.techCards) && !frozen}
      outputMaterialId={outputMaterialId}
      roleAssignments={techCard?.roleAssignments}
      colorways={techCard?.colorways}
      /* K-19 · the consequence of changing the season, spoken on «pick» — the field's one writer.
         Undefined on a new card: there is nothing to re-issue yet, and the sentence would be a
         lie about colourways that do not exist. */
      seasonPickHint={
        isEditMode
          ? 'changing the season re-issues the SKU of every colourway — the save is rejected if one of them is already frozen (orders placed, or labels printed)'
          : undefined
      }
      onGoColourways={() => navTo('colorways')}
    />

    {isAux && (
      <Section title='output material'>
        {/* 0252: once a colour is registered the card produces one bucket PER COLOUR, and
            the single picker below stops being the answer — showing both would offer two
            contradictory places to say where the goods land. The variants are their own
            immediate RPC writes, so this branch needs a SAVED card; an unsaved one has no
            id to write against and only ever sees the legacy picker. */}
        {isEditMode && numId && outputVariants.length > 0 ? (
          <OutputVariantsPanel
            techCardId={numId}
            variants={outputVariants}
            canEdit={canWrite(SECTION.techCards)}
          />
        ) : (
          <>
            <Text variant='inactive' size='small'>
              runs of this card receipt into material stock, not product stock. Pick the
              packaging material this card produces (required before its first run).
            </Text>
            <div className='max-w-md'>
              <MaterialPicker
                value={outputMaterialId}
                onChange={(mid) =>
                  form.setValue('outputMaterialId', mid, { shouldDirty: true })
                }
                section='TECH_CARD_BOM_SECTION_PACKAGING'
                disabled={!canWrite(SECTION.techCards)}
                placeholder='search packaging material'
              />
            </div>
            {canWrite(SECTION.techCards) && (
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => setMaterialModalOpen(true)}
              >
                + create material
              </Button>
            )}
            {/* The way INTO per-colour mode without stranding the balance already on the
                books: adopt this very material as the first colour rather than minting a
                second bucket beside it. Hidden until there is something to adopt, and
                until the card exists to hang it on. */}
            {isEditMode && numId ? (
              <AdoptLegacyOutputButton
                techCardId={numId}
                materialId={outputMaterialId}
                canEdit={canWrite(SECTION.techCards)}
              />
            ) : null}
          </>
        )}
      </Section>
    )}
    </>
  );

  return (
    <FormWithAutosave form={form} autosave={autosave} gestures={autosave.gestureProps}>
      {/* ONE AUTOSAVE FOR THE WHOLE PAGE. The studio's organs read it through `useTechCardAutosave()`
          (design/autosave-contract.ts): the construction draft asks for a save after its autoFill,
          GENERATE awaits `flush()` before a paid run. The provider wraps the header too, so the chip
          and the organs can never disagree about what «saved» means. */}
      {/* THE HEADER — two rows, not sticky (волна 25.09 · T16/T19: minimum space, one control per
          action). Row 1 is identity and the page's own actions. Row 2 is where the card IS (the
          stage bar) and what it still needs (next stage · release · warnings) — the old stage and
          approval selects, the lifecycle strip and its «to reach …» checklist all folded into it.
          Gone from the header, reachable elsewhere (D-13): `tasks` (the drawer still opens on
          ?tasks=1 and from the tasks section), `pdf…` (print scopes live on the print page's URL and
          on the runs screen), `+ project` (the file library links projects; the StyleProjects block
          under the header stays whenever a link exists). */}
      <div className='-mx-2.5 border-b border-borderColor bg-bgColor'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 py-2'>
          <Button asChild variant='secondary' size='sm'>
            <Link to={ROUTES.techCards} aria-label='back to tech cards'>
              ←
            </Link>
          </Button>
          <div className='min-w-0'>
            <Text variant='uppercase' className='truncate font-bold'>
              {styleNumber || (isEditMode ? 'tech card' : 'new tech card')}
              {name ? ` · ${name}` : ''}
            </Text>
            <Text size='micro' variant='label' className='truncate'>
              {isEditMode && techCard
                ? `v${techCard.lockVersion ?? 0} · ${formatTechCardDate(techCard.updatedAt)}`
                : 'not saved yet'}
            </Text>
          </div>

          <div className='ml-auto flex flex-wrap items-center gap-3'>
            {/* The save state, in the place the save button used to stand. A released card has no
                autosave — its state is the freeze, said in words. */}
            {isEditMode && frozen ? (
              <Pill tone='ok'>released · frozen</Pill>
            ) : autosaveEnabled ? (
              <SaveStatusChip
                status={autosave.status}
                lastSavedAt={autosave.lastSavedAt}
                errorsCount={autosave.errorsCount}
                message={autosave.message}
                retrying={autosave.retrying}
                // mn-3: dirt nobody can write is not «waiting» (read after the subscription).
                bodyDirty={form.formState.isDirty && bodyWorkOf(form)}
                staged={staging.changes}
                history={history.entries}
                currentText={textSnapshotOf(form.getValues())}
                canRestore={!saving && !converting}
                // M-02: the explicit save is what publishes the errors and walks to the first one.
                onJumpToError={() => void autosave.saveNow('chip')}
                onOpenDetails={() => {
                  if (autosave.status === 'invalid') void form.trigger();
                }}
                onSaveNow={() => void autosave.saveNow('chip')}
                onOpenConflict={() => setConflict(true)}
                onRestore={restoreHistory}
              />
            ) : null}
            {isEditMode && numId && (
              <>
                <Button asChild variant='underline' size='sm'>
                  <Link to={`/tech-cards/${numId}/print`} target='_blank' rel='noopener'>
                    pdf
                  </Link>
                </Button>
                {/* Гейт — ПРАВО ЗАПИСИ, тот же `canWrite(SECTION.techCards)`, что у соседних
                    пишущих действий шапки, а не право чтения карточки: архив уносит приватные
                    выкройки и паспорта материалов за пределы панели одним файлом, и сервер
                    классифицировал вызов как wr(tech_cards). Читатель карточки его не увидит. */}
                {canWrite(SECTION.techCards) && (
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    loading={exportingArchive}
                    onClick={handleExportArchive}
                  >
                    export archive
                  </Button>
                )}
              </>
            )}
            {canWrite(SECTION.techCards) && isEditMode && frozen && (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                loading={saving}
                onClick={() => void submitWithApproval(DRAFT)}
              >
                re-open to draft
              </Button>
            )}
            {canWrite(SECTION.techCards) && !isEditMode && (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                // `converting` as well as `saving`: the guided convert drives its re-save WITHOUT
                // form.handleSubmit, so isSubmitting stays false for the whole archive→flip
                // sequence and this button would otherwise stay live through it.
                disabled={saving || converting}
                loading={saving || converting}
                onClick={() => void save()}
              >
                add
              </Button>
            )}
          </div>
        </div>

        {isEditMode && numId && !frozen ? (
          <StageProgress
            techCardId={numId}
            stage={stage}
            readiness={readiness}
            readinessPending={readinessPending}
            readinessError={readinessError}
            isAux={isAux}
            canEdit={canWrite(SECTION.techCards)}
            // An auxiliary run needs somewhere to BOOK its output, and there are two ways to have
            // one: the single output material, or at least one live colour variant (each colour
            // owns its own bucket). Only a card with neither cannot be planned.
            planRunDisabled={isAux && !outputMaterialId && liveVariants === 0}
            planRunDisabledReason='set an output material or register a colour variant before planning an auxiliary run'
            blockers={releaseBlockers}
            canRelease={canRelease}
            releasing={saving || converting}
            // Enabled even when blocked: pressing it explains WHY, which is the one moment the
            // reasons are actually wanted.
            onRelease={() =>
              canRelease ? void submitWithApproval(RELEASED) : setBlockersOpen(true)
            }
            approvalState={techCard?.techCard?.approvalState}
            onBackToDraft={() => void submitWithApproval(DRAFT)}
            formErrors={formErrorRows}
            onRevealError={revealError}
            onGoTab={(t) => navTo(t as TabId)}
            onAddSample={() => navTo('samples', { sample: 'new' })}
            onGoFittings={(unresolvedOnly) =>
              navTo('history', unresolvedOnly ? { fits: 'unresolved' } : undefined)
            }
          />
        ) : null}
      </div>

      {/* ОТКУДА ЭТА КАРТОЧКА ВЗЯЛАСЬ. Стоит В ШАПКЕ и ВНЕ `fieldset disabled={frozen}`: отчёт
          импорта читают и на замороженной, выпущенной карте — заморозка гасит редактирование, а
          не право узнать, что при импорте потерялось. Карточка без импорта не рисует ничего. */}
      {isEditMode && numId ? <TechCardImportBanner techCardId={numId} /> : null}

      {/* Ф3: «в каких проектах библиотеки упомянута эта вещь». Стоит В ШАПКЕ, а не во вкладке и
          не внутри `fieldset disabled={frozen}`: вопрос «каким .zprj это сшито» задают на любой
          вкладке, и чаще всего — как раз про ЗАМОРОЖЕННУЮ, выпущенную карточку, у которой
          fieldset погасил бы и переход в файлы. Пусто — блока нет вовсе. */}
      {isEditMode && numId ? <StyleProjects techCardId={numId} /> : null}

      {/* Tasks as a drawer, deep-linkable via ?tasks=1 (the header button is gone — D-13). */}
      {isEditMode && numId ? (
        <Drawer
          open={tasksOpen}
          onOpenChange={(o) =>
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                if (o) p.set('tasks', '1');
                else p.delete('tasks');
                return p;
              },
              { replace: true },
            )
          }
          title={`tasks · ${styleNumber || 'tech card'}`}
        >
          <TechCardTasksPanel techCardId={numId} />
        </Drawer>
      ) : null}

      {/* Why release is greyed out, on demand. Reuses the SAME blocker list the header
          chips render — one source, two views — and is the only one of the two with room
          for each row's `detail`, the server's factual reason it failed. */}
      <ReleaseBlockersModal
        blockers={releaseBlockers}
        open={blockersOpen}
        onOpenChange={setBlockersOpen}
        onGoToTab={(tab) => setActiveTab(tab as TabId)}
      />

      {/* A version conflict is not a banner — it is a decision, and continuing to edit a
          card someone else has moved only compounds the problem. Stop the page. */}
      <ConfirmationModal
        open={conflict}
        onOpenChange={setConflict}
        title='this card moved on without you'
        width='sm'
        cancelLabel='keep mine & overwrite'
        confirmLabel='reload theirs'
        onCancel={keepMineAndOverwrite}
        onConfirm={() => window.location.reload()}
      >
        <Row label='your version' value={`v${base.current.version} · edited here`} />
        <Row label='on the server' value='newer' />
        <Text size='micro' variant='label' className='mt-2'>
          Someone saved this card while you were editing. Reloading fetches their version and
          discards your unsaved changes; keeping yours re-reads their version number and saves your
          values straight over theirs.
        </Text>
      </ConfirmationModal>

      {/* NF-07 guided convert. Intercepts the flip BEFORE the request — the 412 it would otherwise
          come back as names the obstacle but offers no way past it. closeOnConfirm=false: the
          handler closes this itself, after the archive loop has either finished or reported. */}
      <ConfirmationModal
        open={!!convert}
        onOpenChange={(open) => !open && !converting && setConvert(null)}
        title='switch to auxiliary?'
        width='sm'
        confirmLabel={converting ? 'archiving…' : 'archive & switch'}
        cancelLabel='cancel'
        confirmDisabled={converting}
        closeOnConfirm={false}
        onConfirm={confirmConvert}
      >
        <Row label='live colourways' value={convert?.colorways.length ?? 0} />
        {(convert?.colorways ?? []).map((c) => (
          <Row key={c.colorwayId} label={colorwayLabel(c)} value='→ archive' />
        ))}
        {/* 0252: the colours survive the flip even though the colourways do not — as warehouse
            buckets rather than sellable articles. Offered here because this is the one moment the
            card's colour range is still on screen. */}
        {seedableCodes.length > 0 && (
          <label className='mt-2 flex items-start gap-1.5'>
            <input
              type='checkbox'
              checked={seedColours}
              disabled={converting}
              onChange={(e) => setSeedColours(e.target.checked)}
            />
            <Text size='micro' variant='label' component='span'>
              register each archived colourway’s colour as a colour variant (auto-creates materials)
              — {seedableCodes.join(', ')}
            </Text>
          </label>
        )}
        <Text size='micro' variant='label' className='mt-2'>
          An auxiliary card produces a material, not products — it cannot own colourways, so all{' '}
          {convert?.colorways.length ?? 0} are archived first, one by one, and then the card is
          saved as auxiliary. Archiving is not deletion: the SKU stays frozen and readable and order
          history is untouched.
        </Text>
        <Text size='micro' variant='label' className='mt-2'>
          Restoring an archived colourway works while this card is still SELLABLE — after the flip
          lands it is one-way. If a step fails, nothing is rolled back and you are told exactly
          where it stopped.
        </Text>
        <Text size='micro' variant='label' className='mt-2'>
          Live colourways are only one of the things that pin the purpose — runs, sold colourways,
          assembly usage and anything else the card is registered in do too. Archiving clears none
          of those; the server refuses them on its own and names what it found.
        </Text>
      </ConfirmationModal>

      {/* Half a convert is a fact the operator has to act on — which colourways are archived, and
          that the card did NOT flip. Stays until dismissed. */}
      {convertReport && (
        <CalloutBox tone='error' className='mt-2.5 flex flex-wrap items-center gap-2'>
          <Text size='micro'>{convertReport}</Text>
          <div className='ml-auto'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setConvertReport(null)}
            >
              dismiss
            </Button>
          </div>
        </CalloutBox>
      )}

      {/* A partial save is not a toast: some of it landed, some of it did not, and the operator has
          to decide what to do about the half that failed. It stays until the next save attempt. */}
      {stagingError && (
        <CalloutBox tone='error' className='mt-2.5 flex flex-wrap items-center gap-2'>
          <Text size='micro'>{stagingError}</Text>
          <div className='ml-auto'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => setStagingError(null)}
            >
              dismiss
            </Button>
          </div>
        </CalloutBox>
      )}

      {/* Расхождение версий — не ошибка поля: ни один контрол не краснеет, зато сказано, ЧТО
          сервер не узнал и что карточка не сохранена. Стоит рядом с «сохранено 2 из 4» — оба
          про то, чем кончилась запись. */}
      {versionSkew && (
        <VersionSkewBanner skew={versionSkew} onDismiss={() => setVersionSkew(null)} />
      )}

      {/* Сохранение прошло, а факты не вернулись. Единственная сеть под двумя окнами, где
          гейтвей ещё глотает молча: прод до ручного деплоя и откат DO на старый бинарь. */}
      {presenceLoss && (
        <PresenceLossBanner audit={presenceLoss} onDismiss={() => setPresenceLoss(null)} />
      )}

      {/* Draft and frozen stay inline — they are context, not decisions. */}
      {draft.pending && (
        <CalloutBox tone='warning' className='mt-2.5 flex flex-col gap-2'>
          {draft.drafts.length <= 1 ? (
            <div className='flex flex-wrap items-center gap-2'>
              <Text size='micro'>
                an unsaved draft was found
                {draft.pending.savedAt
                  ? ` from ${new Date(draft.pending.savedAt).toLocaleString('en-US')}`
                  : ''}{' '}
                — restore it or discard it?
              </Text>
              <div className='ml-auto flex gap-1.5'>
                <Button
                  type='button'
                  variant='main'
                  size='sm'
                  onClick={() => askRestore(draft.drafts[0]?.id)}
                >
                  restore
                </Button>
                <Button type='button' variant='secondary' size='sm' onClick={discardDrafts}>
                  discard
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* MJ-2: every visit that left work beside an unanswered draft left a draft of its own —
                  all of them are here, the newest first, until one is restored or all are discarded. */}
              <div className='flex flex-wrap items-center gap-2'>
                <Text size='micro'>
                  unsaved work was found — {draft.drafts.length} drafts, the newest first: restore
                  one (the others are discarded) or discard all?
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  className='ml-auto'
                  onClick={discardDrafts}
                >
                  discard all
                </Button>
              </div>
              {draft.drafts.map((d, i) => (
                <div key={d.id} className='flex flex-wrap items-center gap-2'>
                  <Text size='micro'>
                    {i === 0 ? 'the newest' : `draft ${i + 1}`}
                    {d.savedAt ? ` · ${new Date(d.savedAt).toLocaleString('en-US')}` : ''}
                  </Text>
                  <Button
                    type='button'
                    variant={i === 0 ? 'main' : 'secondary'}
                    size='sm'
                    className='ml-auto'
                    onClick={() => askRestore(d.id)}
                  >
                    {i === 0 ? 'restore the newest' : `restore draft ${i + 1}`}
                  </Button>
                </div>
              ))}
            </>
          )}
          {/* MJ-3: the draft is the WHOLE card as it was typed; over a card whose body moved since, a
              restore puts back what the other editor changed — said before it happens. */}
          {restoreAsk && (
            <div className='flex flex-wrap items-center gap-2' data-draft-moved=''>
              <Text size='micro'>
                the card changed (
                {restoreAsk.from !== null
                  ? `v${restoreAsk.from} → v${restoreAsk.to}`
                  : `now v${restoreAsk.to}`}
                ) since this draft; restoring overwrites those changes
              </Text>
              <div className='ml-auto flex gap-1.5'>
                <Button
                  type='button'
                  variant='main'
                  size='sm'
                  onClick={() => doRestore(restoreAsk.id)}
                >
                  restore anyway
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => setRestoreAsk(null)}
                >
                  cancel
                </Button>
              </div>
            </div>
          )}
        </CalloutBox>
      )}

      {frozen && (
        <CalloutBox tone='note' className='mt-2.5'>
          <Text size='micro'>
            Released and frozen — the factory spec is locked. Use “Re-open to draft” to edit.
          </Text>
        </CalloutBox>
      )}

      {/* LEFT SIDEBAR RAIL + content. All 14 sections are visible at once on a laptop
          instead of scrolling sideways; the checkbox column doubles as the completion
          signal, so the old separate progress bar is gone. Below lg the rail becomes a
          horizontal scroll strip — the sidebar is a desktop affordance and the
          fitting-room phone use is real. */}
      <div className='grid gap-2.5 pt-3 lg:grid-cols-[150px_1fr]'>
        {/* `min-w-0` IS WHAT LETS THE STRIP BELOW `lg` ACTUALLY SCROLL. The rail is a grid item,
            and a grid item's automatic minimum size is its MIN-CONTENT, not zero — so without this
            the track was forced to the full width of all 14 section entries laid end to end (942px
            measured), the inner `overflow-x-auto` never got to scroll, and the whole PAGE moved
            sideways instead (92px at a 860px window, D-4). The horizontal strip promised in the
            comment above only exists once the item is allowed to be narrower than its contents. */}
        <aside
          aria-label='Tech card sections'
          className='top-16 min-w-0 self-start lg:sticky lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto'
        >
          <div className='flex gap-1 overflow-x-auto lg:block lg:overflow-visible'>
            {TAB_GROUPS.map((group, gi) => {
              const groupTabs = group.tabs
                .map((id) => TABS.find((t) => t.id === id)!)
                .filter((t) => isTabVisible(t.id));
              if (groupTabs.length === 0) return null;
              return (
                <div key={gi} className='flex shrink-0 items-center gap-1 lg:block'>
                  {group.band && (
                    <div className='hidden lg:block'>
                      <GroupLabel flush={gi === 0}>{group.band}</GroupLabel>
                    </div>
                  )}
                  {groupTabs.map((tab) => {
                    const active = activeTab === tab.id;
                    const errorCount = errorCountByTab.get(tab.id) ?? 0;
                    const filled = isFilled(tab.id);
                    return (
                      <button
                        key={tab.id}
                        type='button'
                        onClick={() => setActiveTab(tab.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`flex w-full items-center gap-1.5 border-b-2 px-2 py-1 text-left text-control whitespace-nowrap uppercase transition-colors lg:border-b-0 lg:px-0 ${
                          active
                            ? 'border-textColor font-bold text-textColor'
                            : 'border-transparent text-labelColor hover:text-textColor'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`hidden size-3.5 shrink-0 items-center justify-center border border-textColor text-nano leading-none lg:inline-flex ${
                            filled ? 'bg-textColor text-bgColor' : ''
                          }`}
                        >
                          {filled ? '✓' : ''}
                        </span>
                        <span className='min-w-0 flex-1 truncate'>{tab.label}</span>
                        {tab.id === 'issues' && openIssues > 0 && (
                          <Pill tone='mut'>{openIssues}</Pill>
                        )}
                        {errorCount > 0 && (
                          <Pill
                            tone='warn'
                            title={`${errorCount} field${errorCount > 1 ? 's' : ''} blocking save`}
                          >
                            {errorCount}
                          </Pill>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* An implicit submit (Enter in a field, a stray untyped button) goes through the same door as
            every other save — on a saved card that is the autosave's queue, never a second write
            beside a running autosave cycle. */}
        <form
          className='min-w-0 pb-24'
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={frozen} className='m-0 min-w-0 border-0 p-0'>
            {/* ШАПКА СТУДИИ — `topRowHtml` прототипа (`proto.html:3172`).
                Прототип не даёт карточной шапке вкладки вовсе: identification, classification,
                responsible roles, базовая модель и связанные продукты стоят ПЕРВЫМ блочным рядом
                СТУДИИ. С Ф1 это буквально так: блоки собраны в `cardDetails` (выше, перед
                `return`) и уезжают СЛОТОМ в `StudioTab`, который рисует их нулевым шагом рельса —
                над мудбордом и в каждой из своих трёх веток возврата. Здесь, вне условия вкладки,
                остаётся только то, что обязано быть смонтированным ВСЕГДА — `StyleFactsField`. */}
            {/* U-2 · CARE SYMBOLS И CARE GUIDE УБРАНЫ ИЗ ПОЛОСЫ — прямое указание владельца.
              Убран ТОЛЬКО экран: care хранится один раз, на care-ярлыке, и редактируется на
              вкладке LABELS — это буквально то же поле, поэтому способность не потеряна.
              ПАНЕЛЬ ПРИ ЭТОМ ОСТАЁТСЯ СМОНТИРОВАННОЙ, и это условие корректности, а не
              осторожность: `StyleFactsField` — единственный писатель
              brand / collection / season / targetGender / fit. Их редактируют выше, в шапке, а
              `UpdateTechCard` их намеренно не пишет (R4/§14.7, «ни один факт не пишется двумя
              путями»). Сняв её с монтажа, мы получили бы «saved» и молчаливый откат значения
              после перезагрузки. `hideFitCare` возвращает null ПОСЛЕ всех хуков
              (style-facts-field.tsx:473) — невидимая панель пишет ровно то же, что видимая. */}
            <StyleFactsField
              // A7: on a NEW card the id arrives after CreateTechCard answers, and the facts it
              // staged are committed against it before the page navigates away.
              styleId={numId ?? createdId}
              canEdit={canWrite(SECTION.techCards) && !frozen}
              careEntries={techCard?.careEntries}
              hideFitCare
            />

            {/* U-9 · ВТОРОГО РЕДАКТОРА `concept` ЗДЕСЬ БОЛЬШЕ НЕТ. Тут стоял второй блок
              «concept & construction description» со своим `TextareaField name='concept'`, и он
              был смонтирован ВСЕГДА — этот `SectionStack` прячется атрибутом `hidden`, то есть
              display:none, а не размонтированием. Над одним полем формы жили два редактора: этот
              и `design/concept-section.tsx`, открывавшийся в студии (сам этот файл потом снесён по
              V-16, а поле переехало в записку доски); тот же дубль был и у
              `DetailsEditor` (два экземпляра со своими локальными наборами показанных аспектов).
              Вместе с блоком ушёл подблок `notes` («internal · not sent to the factory · outside
              the DESIGN signature») — прямое указание владельца.
              ПОЛЕ `notes` ИЗ СХЕМЫ НЕ УДАЛЕНО: уже написанные заметки продолжают круговой рейс
              GET → defaultValues → full-replace UPSERT и сохранением не стираются.
              `DetailsEditor` не потерялся — он стоит блоком «construction» ниже в этой же
              шапке (V-17), и экземпляр по-прежнему ровно один.
              U-8 (блок «TECH PACK · DESCRIPTION SHEET») в этом файле не рождался и не вернулся —
              его носителем был `design/concept-section.tsx`, УДАЛЁННЫЙ С ДИСКА вместе с самим
              блоком; описание живёт теперь одной запиской доски (`design/mood-board.tsx`). */}

            {/* K-8 · «помести карточку CONSTRUCTION под мудборд».
                Круг 9 переставляет её ещё раз, и это ТРЕТЬЕ её место: сначала она стояла
                последним органом студии, ниже пяти экранов генерации; по V-17 поднялась в конец
                шапки, вплотную НАД мудбордом; теперь владелец просит её ПОД мудбордом. Смежность
                та же, сторона другая — и решает это тот, кто ходит по экрану каждый день.
                ЭКЗЕМПЛЯР ПО-ПРЕЖНЕМУ ОДИН. Он уезжает пропом в студию, и здесь его больше нет:
                два всегда-смонтированных DetailsEditor расходились локальными наборами
                показанных аспектов — это дефект U-9, и он вернулся бы в тот же день.
                `Section`-обёртка уехала вместе с ним: DetailsEditor рисует голый div и без блока
                стоял бы прямо на сером грунте, просвечивая землёй сквозь рамки аспектов. */}

            {/* STUDIO — полоса DESIGN, где на стиль смотрят.

                МОНТИРУЕТСЯ УСЛОВНО, и это по-прежнему весь довод о безопасности. `callouts` — один
                массив на форму, и `useFieldArray` над ним в дереве студии ровно один
                (`design/mood-callouts.tsx`). Редактор геометрии держит свой; в RHF 7.62 два
                экземпляра над одним именем не синхронизируются мутаторами, и второй молча теряет
                строки первого. Поэтому редактор открывается модалкой над ARTIFACTS, где
                `useFieldArray` над `callouts` нет вовсе, а сами вкладки монтируются по активной:
                «никогда не два писателя» верно по построению, а не по дисциплине. `hidden` не
                размонтирует и такой гарантии не даёт.

                Размонтирование ничего не стоит: форма не ставит `shouldUnregister`, и уход со
                вкладки сохраняет её значения. */}
            {/* V-17: `constructionAspects` больше не передаётся — аспекты поднялись в шапку,
                последним блоком над мудбордом (см. блок construction выше). Проп в StudioTab
                опционален и без значения не рисует ничего; сам слот может снять владелец
                studio-tab.tsx. */}
            {activeTab === 'studio' && (
              <StudioTab
                techCardId={numId}
                disabled={frozen}
                cardDetails={cardDetails}
                constructionAspects={<DetailsEditor techCard={techCard} />}
                /* ОДИН ПИСАТЕЛЬ АДРЕСА НА ВСЮ СТРАНИЦУ. Студия держала СВОЮ копию этой записи
                   (`?tab=` + чистка `sample`/`fits` + `replace`) — не по выбору, а потому что
                   волне, писавшей блоки CONSTRUCTION, было запрещено трогать этот файл. Читатель
                   у копии и оригинала один и тот же (`activeTab` берётся из `?tab=`), поэтому
                   двум писателям оставалось только разойтись. Довод целиком — у пропа в
                   `studio-tab.tsx`. */
                navTo={(t, extra) => navTo(t as TabId, extra)}
              />
            )}

            {/* ARTIFACTS — лист, на котором собрана композиция. Тот же условный монтаж и по той же
                причине: он правит те же `callouts`.

                ЗДЕСЬ СТОЯЛ `DesignSaveHostProvider` — на обеих вкладках. Он существовал ради ОДНОЙ
                вещи: минт версии листа писал ДОКУМЕНТ в той же транзакции, и потому обязан был
                «осадить» форму через здешний `withServerAssignedValues` — замыкание над этой формой
                и её очередью, которое нельзя импортировать. Без него минт отказывал словами, а не
                минтил неосаженное: пустой `signedDigest` в состоянии формы ЗНАЧИТ «одобрить
                сейчас», и неосаженный минт молча переодобрил бы все подписи следующим сохранением.

                Минт снесён целиком, вместе с бэкендом, — а с ним и единственный читатель хоста.
                Провайдер снят, а не оставлен «на будущее»: контекст без потребителя — это приглашение
                следующему органу начать писать документ мимо обычного сохранения, то есть ровно та
                вторая дверь, от которой хост и стерёг. Обычное сохранение карточки как ходило через
                `withServerAssignedValues`, так и ходит. */}
            {/* КАРТОЧКА И ИСТОРИЯ ОТКАТА ИДУТ ВНИЗ ОТСЮДА, потому что редактор указаний
                открывается модалкой над этой вкладкой, а история отката — ОДНА НА ФОРМУ.
                Своя история у редактора означала бы, что откат в модалке возвращает снимок,
                снятый до правок доски настроения, и они исчезают молча. */}
            {activeTab === 'artifacts' && (
              <ArtifactsTab
                techCardId={numId}
                disabled={frozen}
                techCard={techCard}
                calloutHistory={calloutHistory}
              />
            )}

            {/* PATTERNS (size range + DXF выкройки по материалам) */}
            <SectionStack hidden={activeTab !== 'patterns'}>
              <Section title='size range'>
                {/* The colourways AS READ: their recipes grade per-size consumption, and that is
                    what makes removing a size destructive beyond this form. */}
                {/* Здесь стоял «size run (order qty)» — типовой калькуляционный тираж карты.
                    Он удалён вместе с size_quantities: себестоимость стиля считается по норме
                    БАЗОВОГО размера, а реальный тираж живёт на прогоне (production_run), у
                    которого своя сетка колорвей × размер. Выдуманный микс размеров не влиял ни
                    на одну цифру и только притворялся планом — не возвращать его сюда. */}
                <SizeIdsField colorways={techCard?.colorways} />
              </Section>
              <Section title='size chart (measurements) — shared by every colourway of the style'>
                <SizeChartField styleId={numId} canEdit={canWrite(SECTION.techCards) && !frozen} />
              </Section>
              <Section title='patterns (DXF) — by material'>
                <PatternsField
                  techCardId={numId || undefined}
                  // Разбор DXF стартует сам, но только на ОТКРЫТОЙ вкладке: этот SectionStack
                  // смонтирован всегда и прячется через `hidden`, так что без явного ответа
                  // карточка качала бы все выкройки всякому, кто зашёл править BOM.
                  active={activeTab === 'patterns'}
                  canEdit={canWrite(SECTION.techCards) && !frozen}
                  // БЕЗ `&& !frozen`, и это не описка: индекс размеров описывает ФАЙЛЫ, а не
                  // редактируемое содержимое карточки, и нужен он именно на замороженной — с неё
                  // запускают прогоны, её и судит гейт готовности.
                  canPublishIndex={canWrite(SECTION.techCards)}
                  savedSizeIds={techCard?.techCard?.sizeIds ?? undefined}
                />
              </Section>
              {/* Cut pieces sit directly under the sheets they come out of: «↔ детали кроя» on the
                  panel above creates them, and until now it wrote into a table on another tab. Its
                  own block, not a nested one — a block never contains a block (DESIGN.md). Mounted
                  ONCE for every card shape, so there is exactly one useFieldArray('pieces') and one
                  set of [data-field] anchors for revealField to walk to. */}
              <PiecesTab techCard={techCard} active={activeTab === 'patterns'} />
              <Section title='markers — fabric consumption by size'>
                <MarkersSection
                  techCard={techCard}
                  techCardId={numId || 0}
                  canEdit={canWrite(SECTION.techCards) && !frozen}
                />
              </Section>
            </SectionStack>

            {/* BOM */}
            <div hidden={activeTab !== 'bom'}>
              <Section title='bill of materials — the article reference'>
                {/* Structured style fibre composition (S17/M1) — typed composition_entries, read-only. */}
                {(techCard?.compositionEntries?.length ?? 0) > 0 && (
                  <div className='border-b border-textInactiveColor pb-3'>
                    <CompositionEntries
                      entries={techCard?.compositionEntries}
                      label='style fibre composition'
                    />
                  </div>
                )}
                {/* The colourways as READ: their recipes are the one reference to a BOM article
                    this form cannot clear itself, so the delete has to check them first.
                    Раскладки — тоже как READ: лестница у поля процента раскроя говорит «снимите
                    норму с раскладки» только когда раскладка этого слота правда существует. */}
                <BomField
                  highlightComposition={bomHighlight}
                  colorways={techCard?.colorways}
                  markers={techCard?.markers}
                />
              </Section>
            </div>

            {/* COLORWAYS — per colourway, which article each piece is cut from, in what colour and
                at what consumption. The pieces THEMSELVES are on the patterns tab: a piece belongs
                to the pattern, not to a colour, and every colourway cuts the same ones. What is
                genuinely per-colourway is this map, and the recipe editor's placement picker offers
                exactly the pieces defined there. */}
            {/* CONDITIONAL, not merely hidden: SectionStack's `hidden` is a display:none attribute
                and every child stays MOUNTED. Left as a hidden-only branch for an aux card this
                would keep ColorwayRecipes alive fetching the whole material catalogue for a card
                that can never have a colourway. */}
            <SectionStack hidden={activeTab !== 'colorways' || isAux}>
              {!isAux && (
                <div>
                  {isEditMode && numId ? (
                    <ColorwayRecipes
                      techCard={techCard}
                      techCardId={numId}
                      canEdit={canWrite(SECTION.techCards) && !frozen}
                    />
                  ) : (
                    <Text variant='inactive' size='small'>
                      save the card first — colourways are products; their material recipes are
                      edited here once the style exists.
                    </Text>
                  )}
                </div>
              )}
            </SectionStack>

            {/* CONSTRUCTION — how it's made: the assembly map and the operations. The cut list used
                to close this tab; it moved to PATTERNS, next to the cut pieces it is derived from. */}
            <SectionStack hidden={activeTab !== 'construction'}>
              {/* No PiecesTab branch here any more. It used to be mounted for an AUXILIARY card,
                  whose colourways tab (the pieces' old home) does not exist — two conditional mounts
                  of one field array, which is exactly the shape that made a piece created from the
                  DXF dialog land in the copy nobody was looking at. Cut pieces are on PATTERNS now,
                  a tab every card has, so the whole special case is gone. */}
              {/* `active` — не украшение: вкладки этой формы СМОНТИРОВАНЫ ВСЕ СРАЗУ и лишь
                  спрятаны, а разбор выкроек на вкладке заказывается автоматически. Без флага
                  каждое открытие любой тех-карты качало бы её DXF — включая правку одного поля в
                  шапке. */}
              <ConstructionTab
                techCard={techCard}
                active={activeTab === 'construction'}
                // Прокладка до хрома фулскрина: его кнопка save обязана быть той же самой, что в
                // шапке карточки, — второй путь сохранения разошёлся бы с первым.
                onSave={() => void save()}
                // `converting` наравне с `isSubmitting`: управляемый перевод в aux гоняет свою
                // пере-запись МИМО handleSubmit, и без него кнопка фулскрина оставалась бы живой
                // всё время, пока летит переворот. `saving` несёт и цикл автосейва.
                saving={saving || converting}
                draftPending={Boolean(draft.pending)}
                // Якоря находок аудита («op:460», «piece:SL_INS_L») ведут по карточке. Прокладка
                // та же, что у ленты жизненного цикла: имя вкладки приходит строкой, а `TabId`,
                // свёрнутые псевдонимы и видимость вкладок остаются знанием этой страницы.
                onGoTab={(t, extra) => navTo(t as TabId, extra)}
              />
            </SectionStack>

            {/* LABELS & PACKAGING */}
            <SectionStack hidden={activeTab !== 'labels'}>
              <SectionStack row>
                <Section title='labels' className='w-full lg:w-1/2'>
                  <LabelsField onMissingComposition={goToBomComposition} />
                </Section>
                <Section title='packaging' className='w-full lg:w-1/2'>
                  <PackagingField />
                </Section>
              </SectionStack>
              {/* Assembly bill + packaging recipe are per-style, managed via their own RPCs — they
                need a saved card id. For a brand-new card, prompt to Save (which lands back here)
                instead of silently hiding them, so the user is never left wondering. */}
              {isEditMode && numId ? (
                <>
                  <Section title='assembly — on-garment items (labels / tags)'>
                    <AssemblyField
                      styleId={numId}
                      sizeIds={(sizeIdsW as number[] | undefined) ?? []}
                      canEdit={canWrite(SECTION.techCards) && !frozen}
                    />
                  </Section>
                  <Section title='packaging recipe'>
                    <PackagingRecipeField
                      techCardId={numId}
                      canEdit={canWrite(SECTION.techCards) && !frozen}
                    />
                  </Section>
                </>
              ) : (
                <Section title='on-garment items, packaging & the dust bag'>
                  <PreSavePrompt
                    canWrite={canWrite(SECTION.techCards)}
                    saving={saving}
                    onSave={() => void save()}
                  />
                </Section>
              )}
            </SectionStack>

            {/* COSTING — вынесена ЗА этот fieldset, см. блок под его закрывающим тегом. */}

            {/* ISSUES */}
            <div hidden={activeTab !== 'issues'}>
              <div>
                <IssuesField />
              </div>
            </div>

            {/* SIGN-OFF */}
            <div hidden={activeTab !== 'signoff'}>
              <div>
                <SignoffsField />
              </div>
            </div>

            {/* HISTORY */}
            <SectionStack hidden={activeTab !== 'history'}>
              <div>
                {isEditMode && numId ? (
                  <TechCardFittings techCardId={numId} />
                ) : (
                  <Text variant='inactive' size='small'>
                    save this tech card first, then you can link fittings to it
                  </Text>
                )}
              </div>
              <div>
                <RevisionsField revisions={techCard?.revisions} />
              </div>
              <div>
                {isEditMode && numId ? (
                  // `create release` moved INTO ReleasesField's own header via the `gate`
                  // prop, so the button sits with the list it appends to and shares one
                  // blockers modal with the page header instead of a second `title` tooltip.
                  <ReleasesField
                    techCardId={numId}
                    // `active` — не украшение: вкладки этой формы СМОНТИРОВАНЫ ВСЕ СРАЗУ и лишь
                    // спрятаны, а архив релиза теперь рисует снимки шагов. Без флага открытие
                    // любой карточки грузило бы десятки полноразмерных фотографий из вкладки,
                    // которую никто не открывал.
                    active={activeTab === 'history'}
                    gate={
                      canWrite(SECTION.techCards) && !frozen
                        ? {
                            blockers: releaseBlockers,
                            onRelease: () => submitWithApproval(RELEASED),
                            onGoToTab: (tab: string) => setActiveTab(tab as TabId),
                            saving,
                          }
                        : undefined
                    }
                  />
                ) : (
                  <Text variant='inactive' size='small'>
                    a frozen Rev.N snapshot is created when the card is saved as “released”
                  </Text>
                )}
              </div>
            </SectionStack>
          </fieldset>

          {/* COSTING — mounted only with costing:read (field-shaped).
            OUTSIDE the frozen fieldset, by the same argument that moved SAMPLES and PRODUCTION out,
            and it took a shipped feature to notice: `<fieldset disabled>` kills every native control
            beneath it, and the costing tab had grown one that a RELEASED card must keep — the
            переключатель «стиль / партия» and the состав партии beside it. A released card is
            EXACTLY when batches are planned, so freezing the batch affordance froze the feature on
            the only cards that need it. A nested fieldset cannot undo it either (HTML disables every
            descendant of a disabled fieldset except its first legend), so the block has to live out
            here — and what the freeze really governs, the card's own costing articles, is now gated
            explicitly: CostingField wraps its own inputs, and the two sections below take a fieldset
            of their own.

            Three sections, three KINDS OF MONEY. They used to be titled `costing` /
            `cost estimate (per colourway — plan vs actual)` / `R&D development cost`, which named
            the feature and not the figure — so nothing on screen said that «plan 48.60» in the
            second block is the same number as «unit cost 48.60» in the first, or that R&D is in
            neither. The `question` clause is the whole fix. */}
          {canReadCosting && (
            <SectionStack hidden={activeTab !== 'costing'}>
              <Section
                title='style plan'
                question='— what the garment should cost by BOM and by line items'
              >
                {/* Costing gap at the point of action. The tech-card payload only carries the plan
                  costing rollup (not each colorway's product cost_price), so this is a style-level
                  signal; per-colorway precision lives on each product's detail page. */}
                {!(
                  techCard?.techCard?.costing?.unitCost?.value ||
                  techCard?.techCard?.costing?.materialsPerUnit?.value ||
                  (techCard?.techCard?.costing?.colorwayCosts?.length ?? 0) > 0 ||
                  (techCard?.techCard?.costing?.materialsTotal?.length ?? 0) > 0
                ) && (
                  <CalloutBox tone='warning' className='mb-2.5'>
                    <Text size='micro'>
                      this style has no cost set — there is nothing to compute the margin, the
                      payback and the economics of its colourways from, and goods sold are counted in
                      analytics as “without a cost” and drag the shop's coverage down. add materials
                      to the BOM or write a line item below.
                    </Text>
                  </CalloutBox>
                )}
                <CostingField techCard={techCard} frozen={frozen} />
              </Section>
              {/* Эти две секции — СОДЕРЖИМОЕ КАРТОЧКИ (статьи разработки, расчёт по колорвею), и
                заморозку релиза они несут по-прежнему; свой fieldset заменяет им внешний, из-под
                которого выехал весь блок. */}
              <fieldset disabled={frozen} className='m-0 min-w-0 border-0 p-0'>
                {isEditMode && numId && (
                  <Section
                    title='estimate by colourway'
                    question='— the same calculation line by line, with the actual from the runs next to the plan'
                  >
                    {/* `active` gates the per-colourway fan-out. Every tab of this form is MOUNTED
                      at once and merely CSS-hidden, so without this the matrix would fire one
                      GetStyleCostEstimate per colourway on every tech-card open, on every tab. */}
                    <CostEstimateField
                      techCardId={numId}
                      techCard={techCard}
                      active={activeTab === 'costing'}
                    />
                  </Section>
                )}
                {/* R&D / development spend — folded in from its own tab: a section OF costing, not a
                  separate rail entry. Placed after the unit-cost blocks because it is amortised
                  style dev cost, deliberately NOT part of the product COGS. Edit-mode only (its own
                  RPC needs a saved card id). */}
                <Section
                  title='R&D'
                  question="— the style's period money: never part of the unit cost or of COGS"
                >
                  {isEditMode && numId ? (
                    <DevExpensesField techCardId={numId} />
                  ) : (
                    <Text variant='inactive' size='small'>
                      save the tech card first — then development expenses can be written here
                    </Text>
                  )}
                </Section>
              </fieldset>
            </SectionStack>
          )}

          {/* SAMPLES — edit-mode only (needs a saved card id). OUTSIDE the frozen fieldset: a
            released card must still allow reading — paging the material ledger, opening/closing
            sample rows — so editing is gated explicitly instead of by the disabled fieldset
            (which killed every native button, read paths included). */}
          {isEditMode && numId ? (
            <div hidden={activeTab !== 'samples'}>
              <div>
                <SamplesTab
                  techCardId={numId}
                  techCard={techCard}
                  canEdit={canWrite(SECTION.techCards) && !frozen}
                  canReadCosting={canReadCosting}
                />
              </div>
            </div>
          ) : null}

          {/* PRODUCTION — outside the frozen fieldset for the same reason samples is: a RELEASED
            card is exactly when batches get planned, and the disabled fieldset would kill the
            create-run link along with every other native control. The one field here that the
            server's freeze really does govern (the drop date) is gated explicitly instead. */}
          {isEditMode && numId ? (
            <div hidden={activeTab !== 'production'}>
              <ProductionTab
                techCardId={numId}
                techCard={techCard}
                canEdit={canWrite(SECTION.techCards)}
                canReadCosting={canReadCosting}
                frozen={frozen}
              />
            </div>
          ) : null}
        </form>
      </div>

      {/* ПОЛОСА СЕБЕСТОИМОСТИ — НА КАЖДОЙ ВКЛАДКЕ. «Нам надо оптимально всё организовать, чтобы не
          прыгать с вкладки на вкладку»: сегодня ответ на вопрос «сколько стоит изделие» размазан
          по BOM → колорвеям → костингу → производству.

          СТОИТ ЗДЕСЬ, А НЕ ВНУТРИ ВКЛАДКИ И НЕ ВНУТРИ `<fieldset disabled={frozen}>`, по двум
          отдельным причинам:
           • вкладки все смонтированы и лишь скрыты CSS'ом, так что полоса внутри любой из них
             исчезала бы на остальных тринадцати;
           • disabled-fieldset гасит ЛЮБОЙ вложенный нативный контрол, а переключатель полосы —
             это <button>: на RELEASED-карточке он умер бы вместе с самой полосой. Ровно из-за
             этого отсюда уже выехали SAMPLES, PRODUCTION и костинг.
          Сама полоса position:fixed, поэтому её место в разметке на раскладку не влияет — оно
          влияет только на контекст формы (она внутри <Form>, ей нужно dirty-состояние статей) и
          на порядок табуляции, где дополнительной панели место после формы.

          ГЕЙТ ТОТ ЖЕ, ЧТО У ВКЛАДКИ КОСТИНГА: деньги не должны появиться у аккаунта, которому их
          видеть нельзя. И только на сохранённой карточке — до первого сохранения серверного
          расчёта не существует, а показывать вместо него нули полоса не имеет права. */}
      {canReadCosting && isEditMode && numId && techCard ? (
        <MoneyPanel techCard={techCard} />
      ) : null}

      {/* Create a packaging material inline for the aux output picker (prefilled section). The
          created material is selected straight into the field the button sits under — without
          onCreated the operator filled a whole material form and landed back on an empty picker,
          then had to search for the thing they had just made. shouldDirty so Save lights up: the
          selection is a change to the CARD, which the material's own create did not persist.
          `defaultSection` is only a DEFAULT — the modal's class/section controls stay live, so the
          operator can create a fabric here. Auto-selecting that would pin an id the picker beside it
          (filtered to packaging) cannot even render, leaving the field looking empty while holding a
          value; so the selection is gated on what was actually created, and says why when it isn't. */}
      <MaterialModal
        open={materialModalOpen}
        onOpenChange={setMaterialModalOpen}
        defaultSection='TECH_CARD_BOM_SECTION_PACKAGING'
        onCreated={(newId, material) => {
          if (material.section !== 'TECH_CARD_BOM_SECTION_PACKAGING') {
            showMessage(
              `«${material.name || 'material'}» created, but an aux card outputs a PACKAGING material — not selected`,
              'error',
            );
            return;
          }
          form.setValue('outputMaterialId', newId, { shouldDirty: true });
        }}
      />
    </FormWithAutosave>
  );
}
