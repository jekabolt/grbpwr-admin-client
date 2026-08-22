import { useMutation } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_TechCardButtonholeOrientation,
  common_TechCardButtonholeStyle,
  common_TechCardMachineType,
  common_TechCardOperation,
  common_TechCardOperationType,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { useParams, useSearchParams } from 'react-router-dom';
import { Accordion } from 'ui/components/accordion';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { Combobox, type ComboboxGroup } from 'ui/components/combobox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row, RowTotal } from 'ui/components/row';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { ViewSwitch, type ViewSwitchOption } from 'ui/components/view-switch';
import { FormField, FormItem, FormLabel, FormMessage } from 'ui/form';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { fieldErrorSummary, revealField } from 'utils/field-errors';
import {
  // ВИДЫ ОПЕРАЦИЙ (0324): подписи пятнадцати новых словарей берутся ТАМ ЖЕ, где их берёт печатный
  // лист. Второй набор слов здесь означал бы, что экран и бумага могут разойтись в названии одного
  // и того же токена, — а расходятся они молча и обнаруживаются в цеху.
  BUTTON_ATTACH_PATTERN_LABELS,
  BINDING_STYLE_LABELS,
  HOLE_PREP_LABELS,
  LABEL_ATTACH_STITCH_LABELS,
  PEEL_MODE_LABELS,
  PRESS_ACTION_LABELS,
  PRESS_TOWARD_LABELS,
  REINFORCEMENT_LABELS,
  SEAM_SECURING_LABELS,
  ZIPPER_APPLICATION_LABELS,
  // Обязательный вопрос глагола и пикер по любому из этих словарей — оттуда же и по той же
  // причине: их спрашивает не только сетка открытого шага, но и диалог создания.
  STEP_DISCRIMINATORS,
  OPERATION_TYPE_LABELS,
  type OperationFormStringField,
  attachmentKindLabel,
  attachmentOptions,
  // ПОДПИСИ ДЛЯ ПОЛОСЫ ОСТАТКОВ — ТЕ ЖЕ, ЧТО У ПЕЧАТНОГО ЛИСТА. Второй набор слов означал бы,
  // что строка остатка и бумага могут разойтись в названии одного токена.
  bindingStyleLabel,
  buttonAttachPatternLabel,
  cleaningKindLabel,
  hardwareAttachMethodLabel,
  holePrepLabel,
  inspectCoverageLabel,
  labelAttachStitchLabel,
  peelModeLabel,
  pressActionLabel,
  pressTowardLabel,
  printMethodLabel,
  reinforcementLabel,
  trimActionLabel,
  wetProcessKindLabel,
  zipperApplicationLabel,
  canonicalReinforcement,
  effectiveMachineSettings,
  effectivePressSettings,
  operationHeading,
  operationTypeOptionsFor,
  seamAllowanceText,
  seamClassLabel,
  seamClassOptions,
  seamSecuringLabel,
  stepEnumOptions,
  stitchLengthMm,
  topstitchBlankMeans,
  topstitchModeOptionsFor,
  topstitchModeTakesWidth,
  topstitchWidthLabel,
  zoneOptions,
} from './operation-options';
// ВИД ОПЕРАЦИИ — ОДИН СПИСОК ПОВЕРХ ДВУХ ОСЕЙ (см. operation-kinds.ts). Здесь он спрашивается
// дважды: пикером в открытом шаге и — через диалог создания — на рождении шага.
import {
  KIND_BY_WORK_TOKEN,
  KIND_PROPERTY_FIELDS,
  OPERATION_KIND_BY_ID,
  kindClears,
  kindLabelOf,
  kindOf,
  kindWrites,
  type OperationKind,
  type OperationKindStep,
} from './operation-kinds';
// КАТАЛОГ РАБОТ — СЕРВЕРНЫЕ ДАННЫЕ (0329). Пикер работ, синонимный поиск и дефолты берутся отсюда;
// в бандле остаётся только снимок-фолбэк, чтобы список никогда не был пустым.
import {
  SLIT_OVERCAST_WORK,
  columnToFormField,
  cutLengthNoun,
  formValueToWorkDefault,
  groupWorks,
  machineTokenToEnum,
  resolveStepDefaults,
  searchWorks,
  workDefaultsForForm,
  workNaming,
  workWrites,
  type StepDefaultFill,
  type WorkCatalog,
  type WorkItem,
} from './operation-work';
import { useOperationWorkCatalog } from './useOperationWorkCatalog';
import { AdoptMachineIntoProfile, AdoptPressIntoProfile } from './equipment-park';
import {
  isMachineStepType,
  isPressStepType,
  isWeldMachineType,
  machineProfileName,
  machineTypeLabel,
  machineTypeOptionsFor,
  needleTypeLabel,
  needleTypeOptions,
  pressClothLabel,
  pressClothOptions,
  pressEquipmentLabel,
  pressEquipmentOptions,
  pressProcessShort,
  pressProfileFitsStep,
  pressProfileName,
  resolveMachineProfile,
  resolvePressProfile,
  stepTypeOwnsBlock,
  threadTensionLabel,
  threadTensionOptions,
} from './equipment-options';
import { kindLabel, preferredBomKinds } from './bom-kind';
// ВЫВОДИМОСТЬ — ЧИСТЫЕ ФУНКЦИИ ЖИВУТ ОТДЕЛЬНО, И ЭТО НЕ СТИЛЬ. Правило «ровно один кандидат или
// молчим» проверяется пробой на фикстурах, а не глазами по редактору на семь тысяч строк;
// подстановка же — жест интерфейса, и она вся здесь: значение в поле + видимая метка.
import {
  inferStep,
  zoneIsUnset,
  type InferenceAlias,
  type InferenceCard,
  type InferencePress,
  type InferenceStep,
  type StepInference,
} from './operation-inference';
import { ResidueStrip, type ResidueErrorRow, type ResidueRow } from './residue-strip';
import { cardHasDxf } from './nesting/card-has-dxf';
import { type FoundPiece } from './nesting/dxf-geometry';
import { pieceRefKey } from './piece-block-refs';
import type { PieceCloth } from './piece-cloth';
import {
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyResult,
} from './assembly-frontier';
import { assemblyBlocks, type AssemblyBlock } from './assembly-blocks';
import { drawnTailSteps, processedPieceOf } from './assembly-layout';
import type { AssemblyStep as AssemblyStepShape } from './assembly-frontier';
import { AssemblyCreateDialog, type CreatePrefill, type CreateResult } from './assembly-create-dialog';
import { suggestUnitCode } from './assembly-suggest';
import {
  planUnitRename,
  renamePosEdits,
  unitKeyLengthRefusal,
  unitRenameAct,
  type UnitKeyRow,
  type UnitRenameNotice,
} from './assembly-rename';
import {
  appendLabel,
  canRedo,
  canUndo,
  dissolveLabel,
  dropForm,
  dropMove,
  dropRedoTop,
  emptyHistory,
  insertLabel,
  moveLabel,
  peekRedo,
  peekUndo,
  pushUndo,
  record,
  redoStep,
  redoTitle,
  renameLabel,
  resolvePending,
  undoStep,
  undoTitle,
  type History,
  type PendingAppend,
  type RenameInputSite,
  type RenameOutputSite,
} from './last-mutation';
import { AssemblyFullscreen, FROZEN_REFUSAL, restoreScreenFocus } from './assembly-fullscreen';
import { AssemblySchematic } from './assembly-schematic';
import { SequenceRail } from './sequence-rail';
import { OperationMediaStrip } from './operation-media-strip';
import { type SchematicMode, useSchematicPrefs } from './use-schematic-prefs';
import { PieceAddChip, PieceRef, PieceSinglePicker, useFormPieces } from './piece-picker';
import { PieceTile, TILE_BOX } from './piece-silhouette';
import { TechCardFormData } from './schema';
import type { PieceShapeMap } from './use-piece-shapes';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';

/** Стабильная пустая карта: `new Map()` в пропе рождал бы новую ссылку на каждый рендер. */
const EMPTY_MEDIA_URLS: Map<number, string> = new Map();

const NONE_OP_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';
const NONE_ZONE = 'TECH_CARD_GARMENT_ZONE_UNKNOWN';
const NONE_SEAM_CLASS = 'TECH_CARD_SEAM_CLASS_UNKNOWN';
const NONE_ATTACHMENT = 'TECH_CARD_ATTACHMENT_KIND_UNKNOWN';
const NONE_TOPSTITCH = 'TECH_CARD_TOPSTITCH_MODE_UNKNOWN';
// The unset member of each equipment vocabulary. In this feature UNSET NEVER MEANS ZERO — it means
// «inherit», and the placeholder beside the control says what would be inherited and from where.
const NONE_MACHINE = 'TECH_CARD_MACHINE_TYPE_UNKNOWN';
const NONE_PRESS_EQUIPMENT = 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN';
const NONE_NEEDLE = 'TECH_CARD_NEEDLE_TYPE_UNKNOWN';
const NONE_TENSION = 'TECH_CARD_THREAD_TENSION_UNKNOWN';
const NONE_PRESS_CLOTH = 'TECH_CARD_PRESS_CLOTH_UNKNOWN';

// ВИДЫ ОПЕРАЦИЙ (0324): незаданный член пятнадцати новых словарей. UNSET ЗДЕСЬ — «НЕ УКАЗАНО», И
// ЭТО НЕ «НЕТ»: явное «нет» у семи из них есть отдельным ответом (`NONE` — «без закрепки», «нет
// носителя», «отверстие не готовят»), и стереть его в UNKNOWN значило бы стереть инструкцию.
// Наследования у этих полей нет ни от профиля, ни от карточки — пусто здесь означает ровно
// «никто не сказал».
const NONE_SEAM_SECURING = 'TECH_CARD_SEAM_SECURING_UNKNOWN';
const NONE_BINDING_STYLE = 'TECH_CARD_BINDING_STYLE_UNKNOWN';
const NONE_LABEL_ATTACH = 'TECH_CARD_LABEL_ATTACH_STITCH_UNKNOWN';
const NONE_ATTACH_METHOD = 'TECH_CARD_HARDWARE_ATTACH_METHOD_UNKNOWN';
const NONE_HOLE_PREP = 'TECH_CARD_HOLE_PREP_UNKNOWN';
const NONE_REINFORCEMENT = 'TECH_CARD_REINFORCEMENT_UNKNOWN';
const NONE_PRINT_METHOD = 'TECH_CARD_PRINT_METHOD_UNKNOWN';
const NONE_PEEL_MODE = 'TECH_CARD_PEEL_MODE_UNKNOWN';
const NONE_TRIM_ACTION = 'TECH_CARD_TRIM_ACTION_UNKNOWN';
const NONE_CLEANING_KIND = 'TECH_CARD_CLEANING_KIND_UNKNOWN';
const NONE_COVERAGE_MODE = 'TECH_CARD_INSPECT_COVERAGE_UNKNOWN';
const NONE_WET_PROCESS = 'TECH_CARD_WET_PROCESS_KIND_UNKNOWN';
const NONE_BUTTONHOLE_STYLE = 'TECH_CARD_BUTTONHOLE_STYLE_UNKNOWN';
const NONE_BUTTONHOLE_ORIENTATION = 'TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN';
const NONE_ATTACH_PATTERN = 'TECH_CARD_BUTTON_ATTACH_PATTERN_UNKNOWN';
const NONE_ZIPPER_APPLICATION = 'TECH_CARD_ZIPPER_APPLICATION_UNKNOWN';
// ВТО (0325). `UNKNOWN` у под-глагола — законный ответ на ЛЮБОМ ВТО-шаге, а не недозаполненность:
// строка PRESS, записанная до этой волны, его и несёт.
const NONE_PRESS_ACTION = 'TECH_CARD_PRESS_ACTION_UNKNOWN';
const NONE_PRESS_TOWARD = 'TECH_CARD_PRESS_TOWARD_UNKNOWN';
const PRESS_TO_ONE_SIDE = 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE';

// The machine types that make a WELD rather than a stitch — the same pair isWeldMachineType names,
// split apart here because only one of them blows hot air: an ultrasonic horn heats the material
// itself and has no air temperature to state.
const SEAM_TAPING = 'TECH_CARD_MACHINE_TYPE_SEAM_TAPING';
// Цикловые автоматы: у петли, пуговицы и закрепки есть отверстие, усилитель и программа цикла — но
// нет «способа крепления» и нет стропы. Тот же список, что в маппере записи.
const CYCLE_MACHINES = [
  'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
  'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
  'TECH_CARD_MACHINE_TYPE_BARTACK',
];
const BUTTONHOLE_MACHINE = 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE';
const BARTACK_MACHINE = 'TECH_CARD_MACHINE_TYPE_BARTACK';
const BUTTON_ATTACH_MACHINE = 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH';
const ZIPPER_MACHINE = 'TECH_CARD_MACHINE_TYPE_ZIPPER_SETTING';
// КЛАСС ШВА «ОКАНТОВОЧНЫЙ» — ВЕДУЩЕЕ ПОЛЕ ОКАНТОВКИ (0328). Окантовочная машинка говорит «это
// окантовка» во второй раз и обязательным спутником не является: кант притачивают и на
// прямострочке, и до F22 такая окантовка своё исполнение назвать не могла.
const BOUND_SEAM_CLASS = 'TECH_CARD_SEAM_CLASS_BS_BOUND';
const LASER_ENGRAVE = 'TECH_CARD_PRINT_METHOD_LASER_ENGRAVE';
const THREADED_HARDWARE = 'TECH_CARD_HARDWARE_ATTACH_METHOD_THREADED';

// ТРИ ДИСЦИПЛИНЫ ПУСТОТЫ — ТРИ СПИСКА ИМЁН, а не один: у enum'а пусто это токен `*_UNKNOWN`, у
// целого — 0, у децимала — пустая строка (на проводе `inputToDecimal('')` вернёт undefined, ключ
// выпадет, колонка останется NULL). Очистка скрытого ходит по ним типизированно, чтобы поле,
// переехавшее из одной дисциплины в другую, роняло сборку здесь, а не записывало '' в int.
type StepEnumField =
  | 'machineType'
  | 'needleType'
  | 'threadTension'
  | 'pressEquipment'
  | 'pressCloth'
  | 'topstitchMode'
  | 'seamClass'
  | 'attachmentKind'
  | 'seamSecuring'
  | 'bindingStyle'
  | 'labelAttachStitch'
  | 'attachMethod'
  | 'holePrep'
  | 'reinforcement'
  | 'printMethod'
  | 'peelMode'
  | 'trimAction'
  | 'cleaningKind'
  | 'coverageMode'
  | 'wetProcessKind'
  | 'buttonholeStyle'
  | 'buttonholeOrientation'
  | 'attachPattern'
  | 'zipperApplication'
  | 'pressAction'
  | 'pressToward';
type StepTextField =
  | 'machineProfileKey'
  | 'threadTensionNote'
  | 'stitchWidthMm'
  | 'pressProfileKey'
  | 'pressPressureNCm2'
  | 'topstitchWidthMm'
  | 'attachmentSizeMm'
  | 'stitchesPerCm'
  | 'seamAllowanceMm'
  | 'needleGaugeMm'
  | 'rowSpacingMm'
  | 'fullnessRatio'
  | 'pitchMm'
  | 'foldbackMm'
  | 'feedSpeedMMin'
  | 'residualAllowanceMm'
  | 'residualTailMaxMm'
  | 'cutLengthMm'
  | 'bartackLengthMm';
type StepIntField =
  | 'threadCount'
  | 'needleSizeNm'
  | 'pressTemperatureC'
  | 'pressDwellSec'
  | 'topstitchRows'
  | 'needleCount'
  | 'placementCount'
  | 'cycleStitchCount'
  | 'secondPressSec'
  | 'airTemperatureC';

// СОСТОЯНИЕ ОДНОГО ПОЛЯ ШАГА: показан ли его контрол и заполнено ли значение. Из одного списка
// таких состояний выводятся ОБА потребителя — пилюля «сколько названо» и полоса остатков, — потому
// что два списка полей разъехались бы молча ровно на новом поле следующей волны.
//
// `kind` — входит ли поле в ЗОНУ СВОЙСТВ ВИДА (её пилюля). НЕ ПИШЕТСЯ РУКОЙ: членство выводится
// из `KIND_PROPERTY_FIELDS` — того же списка, которым `CORE_STEP_FIELDS` решает, раскрывать ли
// створку. Полсотни рукописных флажков были бы полусотней мест, где он молча разойдётся со
// списком. Оборудование и шесть дискриминаторов глагола в пилюлю не входят — они стоят в других
// местах экрана, — но остатками бывают ровно так же, поэтому в таблице они есть.
type StepFieldState = {
  label: string;
  shown: boolean;
  filled: boolean;
  text: string;
  kind: boolean;
} & (
  | { discipline: 'enum'; field: StepEnumField; none: string }
  | { discipline: 'text'; field: StepTextField }
  | { discipline: 'int'; field: StepIntField }
  | { discipline: 'bool'; field: 'pressSteam' }
);

// ПОДПИСЬ ПЕРЕДАЁТСЯ ФУНКЦИЕЙ, А НЕ ГОТОВЫМ ТЕКСТОМ, и это не экономия символов. Готовым текстом
// значение и его словарь были бы ДВУМЯ независимыми аргументами — то есть строку `needleType`
// можно было бы подписать словарём натяжения нити, и ничто бы не возразило. Здесь словарь
// применяется К ТОМУ ЖЕ значению внутри, и такая пара невыразима.
const enumState = (
  field: StepEnumField,
  label: string,
  value: string,
  none: string,
  labelOf: (v: string) => string,
  shown: boolean,
): StepFieldState => ({
  discipline: 'enum',
  field,
  none,
  label,
  shown,
  kind: KIND_PROPERTY_FIELDS.includes(field),
  filled: !!value && value !== none,
  // Токен новее этого бандла подписи не имеет — тогда показывается он сам. Пустая строка вместо
  // значения читалась бы как «поле пустое», то есть как ровно обратное тому, что происходит.
  text: labelOf(value) || value,
});
const textState = (
  field: StepTextField,
  label: string,
  value: string,
  shown: boolean,
): StepFieldState => ({
  discipline: 'text',
  field,
  label,
  shown,
  kind: KIND_PROPERTY_FIELDS.includes(field),
  filled: value.trim() !== '',
  text: value.trim(),
});
const intState = (
  field: StepIntField,
  label: string,
  value: number,
  shown: boolean,
): StepFieldState => ({
  discipline: 'int',
  field,
  label,
  shown,
  kind: KIND_PROPERTY_FIELDS.includes(field),
  filled: value > 0,
  text: String(value),
});
// Ключ профиля — ULID, и целиком он не читается ничем. Показывается тем же хвостом, каким его
// показывает пикер профиля, когда профиль не найден: человек сверяет строку с пикером глазами.
const keyState = (
  field: StepTextField,
  label: string,
  value: string,
  shown: boolean,
): StepFieldState => ({
  discipline: 'text',
  field,
  label,
  shown,
  kind: KIND_PROPERTY_FIELDS.includes(field),
  filled: value.trim() !== '',
  text: value.trim() ? `#${value.trim().slice(-6)}` : '',
});
// Пар — ТРЁХЗНАЧНЫЙ: `false` это ответ «прижать сухим», а не пустота. Поэтому и заполненность
// у него своя, и текст называет обе стороны словами.
const steamState = (value: boolean | undefined, shown: boolean): StepFieldState => ({
  discipline: 'bool',
  field: 'pressSteam',
  label: 'steam',
  shown,
  kind: KIND_PROPERTY_FIELDS.includes('pressSteam'),
  filled: value !== undefined,
  text: value ? 'with steam' : 'no steam — press dry',
});
// ДВЕ ПРИВАТНЫЕ КАРТЫ ПЕТЛИ читаются так же, как остальные пятнадцать словарей — с фолбэком на
// сам токен: подпись есть у всех, кроме члена НОВЕЕ этого бандла, и он обязан назваться собой.
const itemLabel =
  (labels: Record<string, string>) =>
  (value: string): string =>
    labels[value] || value;

// Подпись режима отстрочки берётся у ТОГО ЖЕ списка, что рисует селект: словарь тотален над
// контрактом, и режим новее бандла обязан назваться токеном, а не пустотой.
const topstitchModeText = (mode: string): string =>
  topstitchModeOptionsFor(mode).find((o) => o.value === mode)?.label ?? mode;

// Подпись класса шва — у ТОГО ЖЕ списка, что рисует селект «seam class»; класс новее бандла
// называется собственным токеном, а не пустотой.
const seamClassText = (v: string): string =>
  seamClassOptions.find((o) => o.value === v)?.label ?? v;

// FA1 / FA5 — ЕДИНСТВЕННЫЕ ДВЕ ПОДПИСИ, ЖИВУЩИЕ ЗДЕСЬ, А НЕ В ОБЩЕМ СЛОВАРЕ, и причина в форме
// слова: на листе форма и направление петли печатаются ОДНОЙ вещью («horizontal round-end
// buttonhole»), поэтому там они заведены прилагательными и приватны. Селекту нужен самостоятельный
// пункт с существительным, иначе список читается «straight / eyelet / round-end» без ответа на
// вопрос «чего». Тотальный `Record` — тот же диффчек контракта, что у остальных карт.
const BUTTONHOLE_STYLE_ITEMS: Record<common_TechCardButtonholeStyle, string> = {
  TECH_CARD_BUTTONHOLE_STYLE_UNKNOWN: '',
  TECH_CARD_BUTTONHOLE_STYLE_STRAIGHT: 'straight buttonhole',
  TECH_CARD_BUTTONHOLE_STYLE_EYELET: 'eyelet buttonhole',
  TECH_CARD_BUTTONHOLE_STYLE_ROUND_END: 'round-end buttonhole',
  TECH_CARD_BUTTONHOLE_STYLE_OTHER: 'other shape (see note)',
};
const BUTTONHOLE_ORIENTATION_ITEMS: Record<common_TechCardButtonholeOrientation, string> = {
  TECH_CARD_BUTTONHOLE_ORIENTATION_UNKNOWN: '',
  TECH_CARD_BUTTONHOLE_ORIENTATION_HORIZONTAL: 'horizontal',
  TECH_CARD_BUTTONHOLE_ORIENTATION_VERTICAL: 'vertical',
  TECH_CARD_BUTTONHOLE_ORIENTATION_ANGLED: 'angled',
};

// WHICH OF THE TWO EQUIPMENT BLOCKS A STEP OWNS. One step type answers «machine», three answer
// «ВТО», the rest own neither — and the server refuses a field from the wrong block BY NAME, so
// these two predicates decide what is rendered, what is cleared and what is counted as an override.
// They live in equipment-options because CARD DEFAULTS counts profile references through the same
// question, and a second copy of «which types are ВТО» would go stale on the day a fourth is added.
const isMachineType = isMachineStepType;
const isPressType = isPressStepType;

// The fields of the core grid — the ones that are on screen whatever the fold is doing. Everything
// else lives inside «differs from standard», which has to open itself when one of those fails.
export const CORE_STEP_FIELDS = new Set([
  'operationType',
  // РАБОТА СТОИТ В ЯДРЕ СЕТКИ — пикер работ первый контрол шага. Серверный отказ по имени
  // `work` («такой работы нет», «глагол не совпал», «не та машинка») обязан лечь на него, а не
  // раскрывать створку переопределений, в которой этого контрола нет.
  'work',
  'machineType',
  'pressEquipment',
  'zone',
  'smv',
  'calloutNumber',
  'note',
  'inputKeys',
  'bomLineKeys',
  // Блок «produces» стоит в ядре редактора, а не в фолде переопределений: серверный отказ на
  // этих полях не должен раскрывать фолд, в котором нужного контрола нет.
  'outputUnitKey',
  'outputUnitName',
  // ШЕСТЬ ДИСКРИМИНАТОРОВ ВОЛНЫ 0324 — по одному на глагол, и все шестеро REQUIRED. Они стоят в
  // ядре сетки (STEP_DISCRIMINATORS), значит и здесь: попади любой из них в этот фолд, его
  // серверный или зодовский отказ раскрывал бы аккордеон, в котором контрола нет вовсе.
  'attachMethod',
  'printMethod',
  'trimAction',
  'cleaningKind',
  'coverageMode',
  'wetProcessKind',
  // ЗОНА СВОЙСТВ ВИДА — ТРИДЦАТЬ ОДНО ИМЯ, УЕХАВШЕЕ ИЗ СТВОРКИ НА ВИД. Список берётся ОДИН, из
  // `operation-kinds`, потому что у него два потребителя (это множество и предзаполнение с
  // последнего шага того же вида), и разъехались бы они молча. Ловушка, ради которой это здесь:
  // поле, переехавшее в открытую зону и НЕ попавшее в это множество, заставит серверный отказ
  // РАСКРЫВАТЬ СТВОРКУ, в которой контрола уже нет, — ровно тот дефект, от которого множество и
  // защищает.
  ...KIND_PROPERTY_FIELDS,
]);

// What a step INHERITS, written the way it is shown: «4 (оверлок у окна)», «4 (card)», «not set».
// The value alone is not enough — a technologist reading «4» in grey has to know whether clearing
// the field would keep it (a card default that applies to every step) or change it (a profile that
// applies to this machine), and the source is the whole difference.
const NOT_SET = 'not set';
const inheritedText = (value: string, source: string) => (value ? `${value} (${source})` : NOT_SET);

// The label a picker shows on its «inherit» option, so an enum override states its inherited value
// the same way a text field states it in the placeholder. Radix renders the option list from the
// items array, so the option itself carries the sentence — there is no placeholder to put it in.
function withInheritLabel<T extends { value: string; label: string }>(
  options: T[],
  unset: string,
  inherited: string,
): T[] {
  if (!inherited || inherited === NOT_SET) return options;
  return options.map((o) => (o.value === unset ? { ...o, label: `inherit: ${inherited}` } : o));
}

// Drag payload for the piece tray. A private MIME type so a stray text drop from elsewhere can
// never be mistaken for a piece reference; the plain-text mirror (prefixed) is only a fallback for
// browsers that drop custom types, and every drop is validated against the declared pieces anyway.
const PIECE_DND_TYPE = 'application/x-grbpwr-piece';
const PIECE_DND_PREFIX = 'grbpwr-piece:';

// Keep a Radix select from ballooning when its selected option is long: clip the value span (the
// trigger's first child) with an ellipsis instead of letting the text wrap the control taller/wider.
const selectNoGrow = '[&>span:first-child]:min-w-0 [&>span:first-child]:truncate';

// 1..4 rows of topstitching; 0 = unset. Past four it is decoration nobody sews and, more to the
// point, a typo that reaches the printed sheet as an instruction.
const TOPSTITCH_ROW_OPTIONS = [
  { value: 0, label: '— rows —' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
];

// The BOM sections an operation can CONSUME, in picker order. The rule is «чем соединяют», not
// «что соединяют»: roll goods (fabric / lining / insulation) reach a step through inputKeys —
// they ARE the parts being joined — and packaging never reaches the sewing floor, it rides
// packaging_recipe. Interlining is the deliberate exception on the roll-goods side: fusing is
// consumed AT a fusing step.
//
// The store has NEVER filtered this — tech_card_operation_bom (0200) accepts any BOM line of the
// card, resolveBomRef checks nothing but the key, and the CONSTRUCTION digest already hashes
// bomLineKeys. The old thread+interlining pair was a client-side scope, and it was the only reason
// фурнитура / тесьма / декор / этикетки could not be attached to the step that consumes them.
const OPERATION_LINKABLE_SECTIONS = [
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_LABEL',
];
const LINKABLE_SECTION_INDEX = new Map(OPERATION_LINKABLE_SECTIONS.map((s, i) => [s, i]));

// The lines that SHOULD end up on some step — the picker's set minus labels. A label reaches the
// garment through tech_card_label / the style assembly bill, so a label line attached to no
// operation is normal rather than an omission, and flagging it would train people to ignore the
// whole check.
export const OPERATION_EXPECTED_SECTIONS = new Set(
  OPERATION_LINKABLE_SECTIONS.filter((s) => s !== 'TECH_CARD_BOM_SECTION_LABEL'),
);

// A step whose verb names a material it does not link is almost always an omission. Kept to the two
// unambiguous verbs: a button-attach machine consumes a fastener, a fusing step consumes fusible.
// Buttonholing is deliberately absent — it consumes thread, which nearly every step does, so the
// check would fire as noise and stop being read.
//
// TWO MAPS BECAUSE THERE ARE TWO AXES NOW (0306). «Fusing» is still a step TYPE; «button attach» is
// a MACHINE, and its token left the type enum entirely — keyed on the type this whole check went
// silently dead, which a `Record<string, …>` cannot notice. `Partial<Record<Enum, …>>` is the shape
// that can: a key outside the contract stops the build, an absent key is a legitimate «no opinion».
type ExpectedMaterial = { section: string; what: string };
const OPERATION_TYPE_EXPECTS: Partial<Record<common_TechCardOperationType, ExpectedMaterial>> = {
  TECH_CARD_OPERATION_TYPE_FUSING: {
    section: 'TECH_CARD_BOM_SECTION_INTERLINING',
    what: 'fusing',
  },
};
const MACHINE_TYPE_EXPECTS: Partial<Record<common_TechCardMachineType, ExpectedMaterial>> = {
  TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH: {
    section: 'TECH_CARD_BOM_SECTION_HARDWARE',
    what: 'hardware',
  },
};

// Short captions for the grouped picker. techCardBomSectionOptions carries the long disambiguating
// form («hardware (пуговицы / молнии / кнопки)») — right for a select, far too wide for a caption
// sitting above a row of chips.
const LINKABLE_SECTION_LABEL: Record<string, string> = {
  TECH_CARD_BOM_SECTION_HARDWARE: 'hardware',
  TECH_CARD_BOM_SECTION_THREAD: 'thread',
  TECH_CARD_BOM_SECTION_INTERLINING: 'fusing',
  TECH_CARD_BOM_SECTION_TRIM: 'trim / elastic',
  TECH_CARD_BOM_SECTION_DECORATION: 'decoration',
  TECH_CARD_BOM_SECTION_LABEL: 'labels',
};

// A new step starts EMPTY on every override. Nothing is pre-filled from a preset any more: the
// moment a default is written into the row, «the technologist chose 4 st/cm» becomes
// indistinguishable from «it defaulted to 4», and the card stops being able to say which steps
// genuinely differ.
export const emptyOperation = {
  operationNumber: 0,
  operationType: NONE_OP_TYPE,
  // РАБОТА (0330) — пустая строка, и это ЗАКОННОЕ состояние, а не заготовка. Новый шаг вида не
  // несёт, пока человек его не назвал; до тех пор шаг живёт по старой деривации (`kindOf`).
  work: '',
  zone: NONE_ZONE,
  calloutNumber: 0, // 0 = no sketch pin linked
  smv: '',
  seamClass: NONE_SEAM_CLASS,
  stitchesPerCm: '',
  seamAllowanceMm: '',
  topstitchMode: NONE_TOPSTITCH,
  topstitchWidthMm: '',
  topstitchRows: 0,
  attachmentKind: NONE_ATTACHMENT,
  attachmentSizeMm: '',
  // Both equipment blocks start unset — «inherit», not «zero» (0306). They are listed here rather
  // than left to the zod defaults because this object is spread straight into the field array:
  // a key missing here is a field RHF never registers, and the first render of the control would
  // read `undefined` off a row the schema believes is complete.
  machineType: NONE_MACHINE,
  machineProfileKey: '',
  threadCount: 0,
  needleType: NONE_NEEDLE,
  needleSizeNm: 0,
  threadTension: NONE_TENSION,
  threadTensionNote: '',
  stitchWidthMm: '',
  pressEquipment: NONE_PRESS_EQUIPMENT,
  pressProfileKey: '',
  pressTemperatureC: 0,
  pressDwellSec: 0,
  pressPressureNCm2: '',
  // NOT `false`: three-valued (absent = inherit, false = «press it dry», true = «with steam»), and
  // a default of false would state the instruction «dry» on every step nobody has answered.
  pressSteam: undefined as boolean | undefined,
  pressCloth: NONE_PRESS_CLOTH,
  // ВИДЫ ОПЕРАЦИЙ (0324): ТРИДЦАТЬ ДВА КЛЮЧА, И НИ ОДНОГО НЕЛЬЗЯ ОПУСТИТЬ. Довод — тот же, что у
  // блоков оборудования выше, и он сильнее всего именно здесь: объект расстилается прямо в строку
  // массива полей, и ключ, которого тут нет, RHF НЕ РЕГИСТРИРУЕТ ВОВСЕ. Контрол такого поля читает
  // с формы `undefined`, а круг «загрузил → сохранил» теряет значение молча — увидеть потерю
  // нечем, потому что терять нечего: поля в форме не существовало.
  //
  // Дисциплина пустоты — ровно как в схеме: enum → `*_UNKNOWN`, int32 → `0`, decimal → `''`.
  // Порядок — канон плана (S → PL → H → P → W → T → F → C → Q → WP, затем дельта), тот же, что у
  // схемы, маппера и колонок стора: разъезд порядка между четырьмя списками и есть тот дефект шва,
  // ради которого канон назначен.
  needleCount: 0,
  needleGaugeMm: '',
  seamSecuring: NONE_SEAM_SECURING,
  rowSpacingMm: '',
  fullnessRatio: '',
  placementCount: 0,
  pitchMm: '',
  attachMethod: NONE_ATTACH_METHOD,
  holePrep: NONE_HOLE_PREP,
  reinforcement: NONE_REINFORCEMENT,
  foldbackMm: '',
  cycleStitchCount: 0,
  printMethod: NONE_PRINT_METHOD,
  peelMode: NONE_PEEL_MODE,
  secondPressSec: 0,
  airTemperatureC: 0,
  feedSpeedMMin: '',
  trimAction: NONE_TRIM_ACTION,
  residualAllowanceMm: '',
  residualTailMaxMm: '',
  pressAction: NONE_PRESS_ACTION,
  pressToward: NONE_PRESS_TOWARD,
  cleaningKind: NONE_CLEANING_KIND,
  coverageMode: NONE_COVERAGE_MODE,
  wetProcessKind: NONE_WET_PROCESS,
  buttonholeStyle: NONE_BUTTONHOLE_STYLE,
  cutLengthMm: '',
  buttonholeOrientation: NONE_BUTTONHOLE_ORIENTATION,
  bartackLengthMm: '',
  attachPattern: NONE_ATTACH_PATTERN,
  zipperApplication: NONE_ZIPPER_APPLICATION,
  bindingStyle: NONE_BINDING_STYLE,
  labelAttachStitch: NONE_LABEL_ATTACH,
  note: '',
  inputKeys: [] as string[],
  outputUnitKey: '',
  outputUnitName: '',
  bomLineKeys: [] as string[],
  // Снимки шага — по тому же доводу, что и блоки оборудования выше: ключ, отсутствующий здесь,
  // RHF не регистрирует вовсе. Пустой список у НОВОГО шага ничего не теряет, зато делает форму
  // однородной: всякий читатель `operations.N.media` получает массив, а не `undefined`.
  media: [] as OperationFormValue['media'],
};

type OperationFormValue = NonNullable<TechCardFormData['operations']>[number];
// One row of the card's equipment park, as the form holds it (decimals as strings). The step editor
// reads the park to resolve what a blank field would inherit; CARD DEFAULTS owns editing it.
type EquipmentDefaultsForm = NonNullable<TechCardFormData['construction']['equipmentDefaults']>;
type MachineProfileRow = NonNullable<EquipmentDefaultsForm['machines']>[number];
type PressProfileRow = NonNullable<EquipmentDefaultsForm['presses']>[number];

// #66: AI generation is unavailable when the backend has no OPENROUTER_API_KEY configured — the
// RPC reports this as FailedPrecondition (grpc-gateway → HTTP 412, same convention as
// useSamples.ts / useProductionRuns.ts). Shown verbatim so a technologist knows this is an admin
// setup gap, not something wrong with their description.
const AI_NOT_CONFIGURED_MESSAGE =
  "AI generation isn't configured yet — ask an admin to set OPENROUTER_API_KEY";

// Maps one AI-drafted operation (GenerateTechCardOperations, #66) into this field array's row
// shape — the same fields the manual «+ операция» row starts from (emptyOperation). Only stages
// the row into the form; operationNumber stays positional (recomputed on save like every other
// row, never trusted from the model) and nothing here is persisted until the technologist accepts
// the draft and saves the card through the normal flow.
function mapGeneratedOperationToForm(o: common_TechCardOperation): OperationFormValue {
  return {
    operationNumber: 0,
    operationType: o.operationType || NONE_OP_TYPE,
    // Работа едет и в черновике — тем же сырым токеном. Генератор её сегодня не заполняет вовсе;
    // ключ стоит здесь заранее по тому же доводу, что и узловые входы ниже: научившийся работам
    // генератор иначе молча ронял бы её, а RHF не зарегистрировал бы поля вовсе.
    work: (o.work ?? '').trim(),
    zone: o.zone || NONE_ZONE,
    bomLineKeys: (o.bomLineKeys ?? []).filter(Boolean),
    // TODO(T-26): генератор узлов пока не существует — aiOperationToPb на бэке не заполняет ни
    // 21, ни 46, так что черновик приходит вовсе без привязок. Фолбэк написан заранее: без него
    // научившийся узлам генератор молча выбрасывал бы узловые входы, и tsc это не поймал бы.
    inputKeys: (o.inputKeys?.length ? o.inputKeys : (o.pieceLineKeys ?? [])).filter(Boolean),
    outputUnitKey: o.outputUnitKey ?? '',
    outputUnitName: o.outputUnitName ?? '',
    calloutNumber: o.calloutNumber || 0,
    smv: decimalToInput(o.smv),
    seamClass: o.seamClass || NONE_SEAM_CLASS,
    stitchesPerCm: decimalToInput(o.stitchesPerCm),
    seamAllowanceMm: decimalToInput(o.seamAllowanceMm),
    topstitchMode: o.topstitch?.mode || NONE_TOPSTITCH,
    topstitchWidthMm: decimalToInput(o.topstitch?.widthMm),
    topstitchRows: o.topstitch?.rows || 0,
    attachmentKind: o.attachmentKind || NONE_ATTACHMENT,
    attachmentSizeMm: decimalToInput(o.attachmentSizeMm),
    // The equipment blocks ride the draft too. The model is asked for a machine on every machine
    // step and for the ВТО mode on every press step (the prompt carries both vocabularies), so
    // dropping them here would quietly hand the technologist a list of steps that all fail the
    // «pick the machine» check — the one field the draft was best placed to answer.
    machineType: o.machineType || NONE_MACHINE,
    machineProfileKey: o.machineProfileKey ?? '',
    threadCount: o.threadCount || 0,
    needleType: o.needleType || NONE_NEEDLE,
    needleSizeNm: o.needleSizeNm || 0,
    threadTension: o.threadTension || NONE_TENSION,
    threadTensionNote: o.threadTensionNote?.trim() || '',
    stitchWidthMm: decimalToInput(o.stitchWidthMm),
    pressEquipment: o.pressEquipment || NONE_PRESS_EQUIPMENT,
    pressProfileKey: o.pressProfileKey ?? '',
    pressTemperatureC: o.pressTemperatureC || 0,
    pressDwellSec: o.pressDwellSec || 0,
    pressPressureNCm2: decimalToInput(o.pressPressureNCm2),
    // Verbatim, undefined included — see emptyOperation.
    pressSteam: o.pressSteam,
    pressCloth: o.pressCloth || NONE_PRESS_CLOTH,
    // ВИДЫ ОПЕРАЦИЙ (0324): ВТОРОЙ КОНСТРУКТОР СТРОКИ ШАГА, И ОН РАСХОДИТСЯ С ПЕРВЫМ МОЛЧА. Ключ,
    // забытый здесь, у AI-черновика просто отсутствует — RHF его не регистрирует, поле пустует, и
    // ничто в типах об этом не скажет (возвращаемый тип — строка формы, а у неё все новые ключи
    // необязательны на входе).
    //
    // ЧИТАЕТСЯ ЧЕРЕЗ `?.`, как и в techCardToForm: незаполненное блок-сообщение приходит с провода
    // ЯВНЫМ `null` (EmitUnpopulated), а не отсутствующим ключом, поэтому `o.stitching.needleCount`
    // упал бы на первом же шаге без строчки. Модель сегодня не заполняет ни одного из этих блоков
    // (aiOperationToPb их не строит) — фолбэки написаны заранее, ровно как у узловых входов выше:
    // научившийся им генератор иначе молча ронял бы половину шага.
    needleCount: o.stitching?.needleCount || 0,
    needleGaugeMm: decimalToInput(o.stitching?.needleGaugeMm),
    seamSecuring: o.stitching?.seamSecuring || NONE_SEAM_SECURING,
    rowSpacingMm: decimalToInput(o.stitching?.rowSpacingMm),
    fullnessRatio: decimalToInput(o.stitching?.fullnessRatio),
    // Имя поля на проводе — `placementLayout`: «placement» занято reserved-именем легаси-поля
    // свободного текста, снять его нельзя (на JSON-ключах легаси держится разбор архивных
    // релизных снапшотов). Колонки при этом остались placement_count / pitch_mm.
    placementCount: o.placementLayout?.count || 0,
    pitchMm: decimalToInput(o.placementLayout?.pitchMm),
    attachMethod: o.hardware?.attachMethod || NONE_ATTACH_METHOD,
    holePrep: o.hardware?.holePrep || NONE_HOLE_PREP,
    // 0328 — ПЕРЕНОС: `fusible_patch` и `fabric_stay` читаются как `patch`, иначе редактор
    // показал бы «— not stated —» там, где ответ есть, и стёр бы его первым же сохранением.
    reinforcement: canonicalReinforcement(o.hardware?.reinforcement) || NONE_REINFORCEMENT,
    foldbackMm: decimalToInput(o.hardware?.foldbackMm),
    cycleStitchCount: o.hardware?.cycleStitchCount || 0,
    printMethod: o.printMethod || NONE_PRINT_METHOD,
    peelMode: o.print?.peelMode || NONE_PEEL_MODE,
    secondPressSec: o.print?.secondPressSec || 0,
    airTemperatureC: o.weld?.airTemperatureC || 0,
    feedSpeedMMin: decimalToInput(o.weld?.feedSpeedMMin),
    trimAction: o.trim?.action || NONE_TRIM_ACTION,
    residualAllowanceMm: decimalToInput(o.trim?.residualAllowanceMm),
    residualTailMaxMm: decimalToInput(o.threadTrim?.residualTailMaxMm),
    pressAction: o.press?.action || NONE_PRESS_ACTION,
    pressToward: o.press?.toward || NONE_PRESS_TOWARD,
    cleaningKind: o.clean?.kind || NONE_CLEANING_KIND,
    coverageMode: o.inspect?.coverageMode || NONE_COVERAGE_MODE,
    wetProcessKind: o.wetProcessKind || NONE_WET_PROCESS,
    buttonholeStyle: o.fastening?.buttonholeStyle || NONE_BUTTONHOLE_STYLE,
    cutLengthMm: decimalToInput(o.fastening?.cutLengthMm),
    buttonholeOrientation: o.fastening?.buttonholeOrientation || NONE_BUTTONHOLE_ORIENTATION,
    bartackLengthMm: decimalToInput(o.fastening?.bartackLengthMm),
    attachPattern: o.fastening?.attachPattern || NONE_ATTACH_PATTERN,
    zipperApplication: o.fastening?.zipperApplication || NONE_ZIPPER_APPLICATION,
    bindingStyle: o.stitching?.bindingStyle || NONE_BINDING_STYLE,
    labelAttachStitch: o.stitching?.labelAttachStitch || NONE_LABEL_ATTACH,
    note: o.note?.trim() || '',
  };
}

type PickerOption = { value: number; label: string };
// materialId is the SLOT DEFAULT article. It is read from the form (not from the card read) so an
// article picked on the BOM tab and not yet saved still resolves here.
type BomLine = {
  lineKey?: string;
  name?: string;
  section?: string;
  materialId?: number;
  kind?: string;
};

// What each colourway actually takes for a slot. The operation links the SLOT («основная молния»);
// the article is per colourway, so this is the read-side join that makes «в разных колорвеях разная
// фурнитура» visible on the step instead of only on the colorways tab.
export type ColorwayArticles = {
  // one entry per live colourway, in card order
  colorways: {
    label: string;
    // BOM line_key → the pins on that colourway's usages of the slot (0 / absent = inherit the
    // slot default). A key MISSING from the map means this colourway's recipe does not use the
    // slot at all — a different statement from «uses it with no article», and shown as such.
    pinsByLineKey: Map<string, number[]>;
  }[];
  materialNameById: Map<number, string>;
};

// Из чего кроится каждая деталь — по колорвеям, в порядке карточки.
//
// СОСЕД `ColorwayArticles`, А НЕ ЕГО ЧАСТЬ, и это не дробление: тот отвечает на вопрос ШАГА («какой
// артикул этот колорвей берёт на слот, который операция потребляет»), этот — на вопрос ДЕТАЛИ («из
// какой ткани её кроят»). Ключи у них разные (line_key СЛОТА против line_key ДЕТАЛИ), и склеенные
// в один тип они заставили бы каждого читателя разбираться, какой из двух ключей ему нужен.
//
// Карта КЛЮЧУЕТСЯ СЫРЫМ lineKey ДЕТАЛИ — не `pieceRefKey(lineKey)`, которым ключуются контуры
// чертежа: это два разных пространства ключей на одном экране, и перепутать их значит получить
// пустую карту при живом рецепте, ничего при этом не сломав на глаз.
export type ColorwayCloth = {
  /** Слово оператора: цвет из кода колорвея, иначе базовый SKU, иначе `#id`. */
  label: string;
  /** lineKey ДЕТАЛИ → её ткань. Ключа нет = рецепт про эту деталь молчит (`unbound`). */
  map: Map<string, PieceCloth>;
};

// Mirrors the server's entity.EffectiveMaterialId (internal/entity/techcard.go): the colourway pin
// wins, else the slot default, else 0 = no article at all. Same rule as colorway-recipe.tsx's
// effectiveMaterialId, which resolves it over that file's own draft/slot types — deliberately not
// shared, because importing the recipe editor's types into the construction tab would couple a
// read-only display to an editor's staging model. If one of the two changes, both must.
function effectiveArticleId(pin: number, slotDefault: number): number {
  return pin > 0 ? pin : slotDefault > 0 ? slotDefault : 0;
}

// One colourway's answer for a slot, as it reads on the step. A colourway can carry BOTH a resolved
// article and a hole (two usages of the same slot, one pinned and one with no article anywhere), so
// the two are printed together rather than the hole hiding the article or the reverse.
function colorwayArticleText(c: {
  inRecipe: boolean;
  missing: boolean;
  articles: string[];
}): string {
  if (!c.inRecipe) return 'not in the recipe';
  if (!c.missing) return c.articles.join(' / ');
  return c.articles.length > 0 ? `${c.articles.join(' / ')} + no article` : 'no article';
}

// Reads a drag payload back as a piece lineKey — the private MIME type first, the prefixed
// text/plain mirror as the fallback. Returns '' for anything that isn't ours.
function readPieceDrag(dt: DataTransfer): string {
  const raw = dt.getData(PIECE_DND_TYPE) || dt.getData('text/plain');
  if (!raw) return '';
  return raw.startsWith(PIECE_DND_PREFIX) ? raw.slice(PIECE_DND_PREFIX.length) : raw;
}

// ── derived-state leaves ─────────────────────────────────────────────────────────────────────
// Both of these watch the WHOLE operations array, which changes on every keystroke anywhere in the
// section. They render nothing (or one line), so the re-render stops at them instead of running
// through the rail and the editor — the same discipline readReplaceImpact uses.

// PlacementSync lived here and is gone with the column it fed. It derived `placement` from the
// linked piece names and WROTE IT INTO THE ROW — a computed value stored as a fact, hashed into a
// signed digest, and printed beside the very pieces it was derived from. The zone dictionary now
// answers «where», and the piece chips answer «on what».

function RailTotal() {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as OperationFormValue[];
  // ONE total, because there is one time column. The rail used to sum SAM and SMV separately and
  // then explain, under both, that they legitimately differ — an explanation only needed because
  // the form asked for the same fact twice.
  const total = operations.reduce((acc, o) => {
    const n = parseDecimalNumber(o?.smv);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return (
    <RowTotal
      label={
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          total · {operations.length}
        </Text>
      }
      value={
        <Text size='micro' component='span' title='sum of SMV across the assembly order'>
          {`${total.toFixed(1)} min`}
        </Text>
      }
    />
  );
}

// СКОЛЬКО ШАГОВ ЕЩЁ НЕ НАЗВАНЫ — ОДНОЙ СТРОКОЙ НАД РЕЛЬСОМ, А НЕ ВОСКЛИЦАНИЕМ НА КАЖДОМ ШАГЕ.
//
// Масштаб был виден только запросом к базе: после 0331 на проде 111 строк из 126 не несут работы,
// и по клиенту это состояние не искалось ничем — ни счётчиком, ни значком. Владелец правил
// карточку, не зная, сколько в ней шагов зовут себя старым выводом, а не своим именем.
//
// ФОРМУЛИРОВКА НЕ УПРЁК И НЕ ТРЕБОВАНИЕ. Шаг без работы — ЗАКОННОЕ и долгоживущее состояние (см.
// `operationSchema.work`): такой шаг сохраняется, печатается и называет себя прежним выводом
// `kindOf`. Поэтому здесь не «нужен вид» и не «не заполнено», а «имя ещё не дали» — факт с
// масштабом, а не задача. Кнопки рядом нет намеренно: лист массового назначения (R7) ждёт своего
// предусловия, а орган, обещающий действие, которого нет, хуже молчания.
//
// МОЛЧИТ, КОГДА СЧИТАТЬ НЕЧЕГО. Ноль неназванных — строки НЕТ ВОВСЕ, а не «0 steps not named yet»:
// счётчик нуля это шум над экраном, у которого всё в порядке, и он же учит глаз пролистывать то
// место, где однажды появится настоящее число. Тот же приём, что у строки-слова про ткань.
//
// ЛИСТ СО СВОЕЙ ПОДПИСКОЙ, как RailTotal рядом: она следит за ВСЕМ массивом операций, который
// меняется на каждое нажатие клавиши в секции, — перерисовка обязана останавливаться здесь, а не
// проходить через рельс и редактор.
function RailUnnamedWord() {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as OperationFormValue[];
  const total = operations.length;
  // ПУСТАЯ СТРОКА — ЕДИНСТВЕННОЕ «НЕ НАЗВАНО»: `work` приходит с провода и из схемы уже строкой
  // (`(o.work ?? '').trim()`), UNKNOWN-члена у него нет вовсе — это серверный словарь, а не
  // перечисление. Считать что-то ещё значит считать не то.
  const unnamed = operations.reduce(
    (n, o) => n + (((o?.work ?? '') as string).trim() ? 0 : 1),
    0,
  );
  if (!unnamed) return null;
  return (
    <ChipRow className='mb-1.5'>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='tabular-nums'
        data-unnamed-steps={unnamed}
        title='these steps still save and still print — they simply name themselves the old way'
      >
        kind — {unnamed} of {total} {total === 1 ? 'step' : 'steps'} not named yet
      </Text>
    </ChipRow>
  );
}

// ── фронтир ──────────────────────────────────────────────────────────────────────────────────
// Что реально лежит на столе перед шагом k: детали, ещё не съеденные джойнами, плюс узлы,
// произведённые раньше и ещё не съеденные.
//
// СЧИТАЕТСЯ В ЛИСТЕ. Подписка на весь массив `operations` из корня OperationsField
// перерисовывала бы всё поле на каждое нажатие клавиши в любом шаге — дисциплина этого файла
// прямо требует держать кросс-операционные вычисления в листьях или в getValues на событии.
//
// Правила — из общего с сервером порта (assembly-frontier), а не из собственных представлений:
// пикер обязан предлагать РОВНО то, что примет запись.
type AssemblyView = {
  res: AssemblyResult;
  /** что шаг index имеет право взять входом */
  availableBefore: (index: number) => Set<string>;
  /** живые узлы на фронтире шага (в порядке появления) */
  liveUnitsBefore: (index: number) => string[];
  /** ключ детали → узел, внутри которого она теперь лежит */
  eatenInto: Map<string, string>;
};

function useAssemblyView(pieces: PieceRef[]): AssemblyView {
  const ops = useWatch({ name: 'operations' }) as
    | Array<{ inputKeys?: string[]; outputUnitKey?: string; outputUnitName?: string }>
    | undefined;
  return useMemo(() => {
    const sweepPieces = pieces.map((p) => ({ lineKey: p.lineKey, name: p.name }));
    const pieceKeys = new Set(sweepPieces.map((p) => p.lineKey));
    const steps = (ops ?? []).map((o) => ({
      inputs: classifyAssemblyInputs(pieceKeys, (o?.inputKeys ?? []).filter(Boolean)),
      outputUnitKey: (o?.outputUnitKey ?? '').trim(),
      outputUnitName: (o?.outputUnitName ?? '').trim(),
    }));
    const res = assemblySweep(sweepPieces, steps);
    const eatenInto = new Map<string, string>();
    res.consumedBy.forEach((stepIdx, key) => {
      const into = steps[stepIdx]?.outputUnitKey;
      if (into) eatenInto.set(key, into);
    });
    const before = (index: number) => new Set(res.frontierBefore[index] ?? res.frontier);
    return {
      res,
      availableBefore: before,
      liveUnitsBefore: (index: number) =>
        (res.frontierBefore[index] ?? res.frontier).filter((k) => res.units.has(k)),
      eatenInto,
    };
  }, [ops, pieces]);
}

type RailGrouping = {
  broken: Set<number>;
  /** Блоки и шаги для схемы — тот же свип, второй раз считать незачем. */
  schematicBlocks: AssemblyBlock[];
  schematicSteps: AssemblyStepShape[];
  res: ReturnType<typeof assemblySweep>;
  /** Индекс шага → шапка блока, которую надо врезать ПЕРЕД ним. */
  headerBefore: Map<number, { block: AssemblyBlock; smv: string; terminal: boolean }>;
  /** Размечена ли карточка: без узлов досье вырождается в сегодняшний плоский рельс. */
  marked: boolean;
  /** Σ SMV блока по его ключу ('' — хвостовой). Считается тем же `sumSmv`, что и в рельсе. */
  smvOfBlock: Map<string, string>;
  /**
   * Σ SMV ХВОСТОВОГО БОКСА ПОЛОТНА — по тем шагам, которые он РИСУЕТ, и это другое множество,
   * чем `smvOfBlock.get('')`.
   *
   * Два числа потому, что вопросов два, а не потому, что кто-то не убрал дубль. Рельс печатает
   * под заголовком «◌ outside units» ВСЕ шаги вне узлов, и его Σ обязана считать их все. Бокс
   * полотна рисует только те, которым не досталось плитки (обработка одной детали уехала к своей
   * детали), и его Σ обязана считать ровно нарисованное. Одно число на оба вопроса — это и был
   * дефект: коробка с надписью «1 step» печатала рядом сумму двух.
   */
  tailSmv: string;
};

// useRailGrouping — досье: тот же рельс, но с врезанными заголовками подсборок.
//
// Считает ОДИН свип на обе задачи (маркеры сломанных шагов и группировку), потому что второй
// свип на тех же данных был бы чистой платой за раздельность хуков.
//
// Заголовок врезается ПЕРЕД первым шагом блока — то есть блок это диапазон в последовательности,
// а не контейнер. Порядок остаётся за технологом, перетаскивание глобальное; если он утащит шаг
// в чужой блок, заголовки просто перестроятся, а не запретят жест.
function useRailGrouping(pieces: PieceRef[], smvOf: (i: number) => string): RailGrouping {
  const ops = useWatch({ name: 'operations' }) as
    | Array<{ inputKeys?: string[]; outputUnitKey?: string; outputUnitName?: string }>
    | undefined;
  return useMemo(() => {
    const sweepPieces = pieces.map((p) => ({ lineKey: p.lineKey, name: p.name }));
    const pieceKeys = new Set(sweepPieces.map((p) => p.lineKey));
    const steps = (ops ?? []).map((o) => ({
      inputs: classifyAssemblyInputs(pieceKeys, (o?.inputKeys ?? []).filter(Boolean)),
      outputUnitKey: (o?.outputUnitKey ?? '').trim(),
      outputUnitName: (o?.outputUnitName ?? '').trim(),
    }));
    const res = assemblySweep(sweepPieces, steps);

    const broken = new Set<number>();
    for (const v of res.violations) if (v.step >= 0) broken.add(v.step);

    const grouped = assemblyBlocks(steps, res);
    const liveUnits = res.frontier.filter((k) => res.units.has(k));
    const headerBefore = new Map<number, { block: AssemblyBlock; smv: string; terminal: boolean }>();

    const sumSmv = (idx: number[]) => {
      let total = 0;
      let any = false;
      for (const i of idx) {
        const n = Number((smvOf(i) ?? '').replace(',', '.'));
        if (Number.isFinite(n) && n > 0) {
          total += n;
          any = true;
        }
      }
      return any ? String(Math.round(total * 100) / 100) : '';
    };

    const smvOfBlock = new Map<string, string>();
    for (const b of [...grouped.blocks, grouped.loose]) {
      if (b.steps.length === 0) continue;
      const first = Math.min(...b.steps);
      const smv = sumSmv(b.steps);
      smvOfBlock.set(b.key, smv);
      headerBefore.set(first, {
        block: b,
        smv,
        terminal: liveUnits.length === 1 && liveUnits[0] === b.key,
      });
    }
    // Σ ХВОСТОВОГО БОКСА — ПО НАРИСОВАННЫМ СТРОКАМ, тем же `sumSmv`, что и всё остальное.
    //
    // РЕШЕНИЕ, СЛОВАМИ: коробка отвечает на вопрос «что здесь лежит», а обработка, уехавшая на
    // плитку своей детали, здесь не лежит — её строка нарисована в другом месте экрана. Второй
    // смысл («сколько работы скатывается сюда») у этой коробки быть не может: она не узел, в неё
    // ничего не скатывается, и именно за притворство узлом её и переписывали. Множество берётся
    // у `drawnTailSteps` — у того же правила, по которому раскладка отмеряет коробке высоту.
    const tailSmv = sumSmv(drawnTailSteps(grouped.loose.steps, steps));
    return {
      broken,
      headerBefore,
      smvOfBlock,
      tailSmv,
      marked: grouped.blocks.length > 0,
      schematicBlocks: [...grouped.blocks, grouped.loose],
      schematicSteps: steps,
      res,
    };
  }, [ops, pieces, smvOf]);
}

// AssemblyTray — лоток, который перестал врать.
//
// ЛИСТ, и это не стилистика: он подписан на весь массив operations (фронтир иначе не посчитать),
// и будь эта подписка в корне OperationsField, всё поле перерисовывалось бы на каждое нажатие
// клавиши в любом шаге.
//
// Съеденные детали НЕ рисуются стеной зачёркнутых: на позднем шаге съедено почти всё, и такая
// стена сообщала бы только о том, что работа идёт. Вместо неё — свёрнутый счётчик, который
// называет узел, куда деталь ушла. Решение прототипа, а не изобретение.
function AssemblyTray({
  pieces,
  pieceShapes,
  cloth,
  tiled,
  highlighted,
  stepIndex,
  onAdd,
}: {
  pieces: PieceRef[];
  pieceShapes: PieceShapeMap;
  /** Ткань деталей ПЕРВОГО колорвея. Лоток — не место выбирать колорвей: он приедет с полкой. */
  cloth?: Map<string, PieceCloth> | null;
  tiled: boolean;
  highlighted: boolean;
  stepIndex: number;
  onAdd: (key: string) => void;
}) {
  const view = useAssemblyView(pieces);
  const [consumedOpen, setConsumedOpen] = useState(false);

  const available = view.availableBefore(stepIndex);
  const units = view.liveUnitsBefore(stepIndex);
  const onTable = pieces.filter((p) => available.has(p.lineKey));
  const eaten = pieces.filter((p) => !available.has(p.lineKey));

  return (
    <>
      {units.map((key) => {
        const unit = view.res.units.get(key);
        const title = unit?.name ? `${key} — ${unit.name}` : key;
        return (
          <Chip
            key={`unit:${key}`}
            onClick={() => onAdd(key)}
            title={`${title}: a unit of ${unit?.leaves.length ?? 0} pieces — click to add it to the open step`}
          >
            ▣ {key}
          </Chip>
        );
      })}
      {onTable.map((p) => (
        <TrayChip
          key={p.lineKey}
          piece={p}
          shape={pieceShapes?.get(pieceRefKey(p.lineKey)) ?? null}
          cloth={cloth?.get(p.lineKey) ?? null}
          tiled={tiled}
          highlighted={highlighted}
          onAdd={() => onAdd(p.lineKey)}
        />
      ))}
      {eaten.length > 0 && (
        <>
          <Chip
            dashed
            onClick={() => setConsumedOpen((v) => !v)}
            title='pieces that have already gone into units: they cannot be taken again — a piece row is consumed by exactly one join'
          >
            already in units · {eaten.length}
          </Chip>
          {consumedOpen &&
            eaten.map((p) => {
              const into = view.eatenInto.get(p.lineKey);
              return (
                <Text key={`eaten:${p.lineKey}`} size='micro' variant='label' component='span'>
                  {p.name}
                  {into ? ` ∈ ${into}` : ''}
                </Text>
              );
            })}
        </>
      )}
    </>
  );
}

// ── piece tray ───────────────────────────────────────────────────────────────────────────────
// Wiring 14 operations to their pieces used to mean opening 14 popovers. The tray puts every
// DECLARED piece on one strip: drag a chip onto a step in the rail, or — the keyboard and touch
// path, which is not optional — click it and it lands on the step currently open in the editor.
function TrayChip({
  piece,
  shape,
  cloth,
  tiled,
  onAdd,
  highlighted = false,
}: {
  piece: PieceRef;
  /** Контур детали из общего разбора; null — привязки нет, кэш холодный или разбор не заказан. */
  shape: FoundPiece | null;
  /** Ткань детали; null — рецепт про неё молчит, и плитка остаётся ровно такой, какой была. */
  cloth?: PieceCloth | null;
  /** Карточка показывает детали плитками (у неё есть хоть один контур), а не чипами. */
  tiled: boolean;
  onAdd: () => void;
  highlighted?: boolean;
}) {
  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(PIECE_DND_TYPE, piece.lineKey);
      e.dataTransfer.setData('text/plain', `${PIECE_DND_PREFIX}${piece.lineKey}`);
      e.dataTransfer.effectAllowed = 'copy';
    },
  };
  const hint = `${piece.name} — click to add it to the open step, or drag it onto any step`;

  // ПЛИТКА — это КНОПКА с плиткой внутри, а не чип с картинкой. Чип меряется строкой текста, и
  // 56-пиксельный квадрат внутри него растянул бы чип по вертикали, оставив канту чипа роль рамки
  // вокруг рамки — то самое box-in-box, которое DESIGN.md запрещает первым пунктом.
  if (tiled) {
    return (
      <button
        type='button'
        onClick={onAdd}
        title={hint}
        aria-label={`add piece ${piece.name} to the open step`}
        {...dragProps}
        className={cn(
          'cursor-grab border border-borderColor bg-bgColor transition-colors active:cursor-grabbing',
          'hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
          highlighted && 'motion-safe:animate-pulse border-textColor',
        )}
      >
        <PieceTile found={shape} name={piece.name} cloth={cloth} />
      </button>
    );
  }

  return (
    <Chip
      onClick={onAdd}
      title={hint}
      aria-label={`add piece ${piece.name} to the open step`}
      {...dragProps}
      className={cn(
        'cursor-grab active:cursor-grabbing',
        // flashed by the editor's «＋ piece» — pull the eye to the chips now clickable. The border
        // and fill carry the state on their own, so the pulse is pure decoration and is dropped for
        // anyone who asked for less motion.
        highlighted && 'motion-safe:animate-pulse border-textColor bg-bgZebra text-textColor',
      )}
    >
      {piece.name}
    </Chip>
  );
}


// ── produces: что шаг собирает ───────────────────────────────────────────────────────────────
// Узел — не поле «опишите шаг», а РЕЗУЛЬТАТ шага, на который ссылаются входы следующих шагов.
// Именно поэтому он необязателен: пустой ключ значит «шаг ничего не собирает», это обработка, и
// её входы остаются на столе. Ровно этим он отличается от свободнотекстового `node`, который
// был обязательным и который действующий конструктор заполнить не смог (0289).
//
// ПОГЛОЩЕНИЯ КАК ОТДЕЛЬНОЙ МЕХАНИКИ ЗДЕСЬ НЕТ, и это не упущение: «GARMENT + HEM → GARMENT»
// выражается тем, что автор берёт узел входом и пишет его же ключ выходом. Движок узнаёт
// поглощение сам; отдельная кнопка «поглотить» была бы вторым способом сказать то же самое.

/**
 * Ответ мутатора переименования полю.
 *
 * ОТКАЗ ВОЗВРАЩАЕТСЯ, А НЕ ТОЛЬКО ПРОИЗНОСИТСЯ. Снекбар гаснет через несколько секунд, а поле с
 * набранным, но не применённым кодом остаётся на экране — и без причины под ним читалось бы как
 * «переименовал». Слова у обоих одни и те же, движковые.
 */
type RenameOutcome = { ok: true } | { ok: false; why: string };

/**
 * КОД УЗЛА — ПОДТВЕРЖДАЕМЫЙ АКТ, А НЕ ЖИВОЕ ПОЛЕ ФОРМЫ.
 *
 * Раньше здесь стоял `InputField`, писавший в форму на каждый символ. Переписыватель ссылок,
 * работающий так же, переписал бы потребителей сначала на `S`, потом на `SH`, потом на `SHE` — и
 * цепочка рвалась бы на каждом нажатии, а свип на каждом нажатии заливал бы экран красным везде,
 * КРОМЕ места правки. Поэтому набор живёт в локальном черновике, а в форму уходит ОДНА атомарная
 * перезапись — по Enter или по уходу фокуса.
 *
 * ЧЕРНОВИК МИМО RHF, и это не мелочь: новое поле формы протухало бы черновик карточки (zod-дефолт
 * стирает отсутствующие поля при восстановлении). Незаписанный черновик умирает вместе с
 * редактором — человек, ушедший со страницы посреди набора, НЕ получает половину переименования;
 * ровно поэтому строка под полем всё время набора говорит, что жест ещё не применён.
 *
 * ESC ВОЗВРАЩАЕТ ПРЕЖНИЙ КОД и НЕ уносит со слоя: Esc — верхняя ступень лестницы фулскрина
 * (палитра, шпаргалка, выделение), и живой набор стоит выше неё, как драг ноды и маркиза.
 *
 * ДВА КУСКА, А НЕ ОДИН, И РАЗМЕЩАЕТ ИХ ВЫЗЫВАЮЩИЙ. Поле стоит в строке с именем узла и чипом
 * растворения, а слова про цену — ПОД строкой: верни их одним фрагментом, и они встали бы между
 * кодом и именем, разорвав строку надвое (замерено скриншотом стенда). Владелец акта при этом
 * остаётся один — этот хук.
 */
function useUnitCodeAct({
  index,
  outputKey,
  onRename,
}: {
  index: number;
  /** Ключ, как он стоит В ФОРМЕ. Черновик его не трогает до подтверждения. */
  outputKey: string;
  /** Единственный мутатор переименования (живёт в `OperationsField`, R3). */
  onRename: (index: number, next: string) => RenameOutcome;
}): { field: ReactNode; note: ReactNode } {
  const { getValues } = useFormContext<TechCardFormData>();
  const [draft, setDraft] = useState<string | null>(null);
  /** Отказ движка стоит под полем, пока набранное не изменили: снекбар гаснет, а вопрос — нет. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const id = `op-${index}-unit-code`;
  const pending = draft !== null && draft !== outputKey;
  // ЦЕНА СЧИТАЕТСЯ ТЕМ ЖЕ ПЛАНИРОВЩИКОМ, КОТОРЫЙ ЕЁ И ОПЛАТИТ. Второй счёт «сколько шагов
  // затронет» разошёлся бы с первым молча — и баннер обещал бы не то, что произошло.
  // Через `getValues`, а не подпиской: редактор и так перерисовывается на каждую правку операций
  // (его `useAssemblyView` подписан на весь массив), а вторая подписка ничего к этому не добавит.
  const plan = pending ? planUnitRename((getValues('operations') ?? []) as UnitKeyRow[], outputKey) : null;
  // ТОТ ЖЕ КЛЮЧ, КОТОРЫЙ ЛЯЖЕТ В ФОРМУ: вердикт нормализует набранное (подрезает), и подсказка
  // обязана называть результат, а не черновик. Хвостовой пробел невидим — подсказка, печатающая
  // «→ BODY⎵», читается как «→ BODY», то есть обещает не то, что произойдёт.
  const typed = (draft ?? '').trim();
  const dissolving = pending && typed === '';
  // ДЛИНА ГОВОРИТСЯ ПРЯМО ВО ВРЕМЯ НАБОРА, а не после Enter: тем же счётом, каким её посчитает
  // мутатор, — второй счёт разошёлся бы с первым молча. Отказ мутатора при этом остаётся: слова
  // под полем гаснут вместе с черновиком, а жест обязан отказать и мимо этого поля.
  const tooLong = pending && !dissolving ? unitKeyLengthRefusal(typed) : null;

  // ЖИВОЙ НАБОР ВЫШЕ ВСЕЙ ESC-ЛЕСТНИЦЫ ЭКРАНА — как драг ноды, маркиза и драг плитки с полки, и
  // слушатель по той же причине window-капчурный. Radix ловит Escape на ДОКУМЕНТЕ в фазе
  // перехвата, то есть раньше, чем событие вообще дойдёт до поля: `stopPropagation` в
  // React-обработчике опаздывает навсегда, и Esc, которым отменяют набор, уносил бы со ВСЕГО
  // экрана (замерено стендом — фулскрин закрывался).
  //
  // ФОКУС СПРАШИВАЕТСЯ В САМОМ ОБРАБОТЧИКЕ: отклонённый черновик переживает уход фокуса (набранное
  // не выбрасывается в ответ на «так нельзя»), и слушатель, судящий только по его наличию, глотал
  // бы Esc всего экрана, пока человек смотрит совсем в другое место.
  useEffect(() => {
    if (draft === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.activeElement !== ref.current) return;
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
      setRefusal(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [draft]);

  const commit = () => {
    if (draft === null) return;
    if (draft === outputKey) {
      setDraft(null); // набрали ровно то же самое — жеста не было
      return;
    }
    if (refusal !== null) return; // отказ уже произнесён и стоит под полем; молча повторять его незачем
    const outcome = onRename(index, draft);
    if (outcome.ok) {
      // Применилось: поле возвращается к значению ФОРМЫ, а там уже новый ключ.
      setDraft(null);
      return;
    }
    // ОТКАЗ ОСТАВЛЯЕТ НАБРАННОЕ В ПОЛЕ. Стереть его значило бы выбросить работу человека в ответ
    // на «так нельзя»; вернуть прежний код он может Esc'ом.
    setRefusal(outcome.why);
  };

  const field = (
    <div className='space-y-px' data-field={`operations.${index}.outputUnitKey`}>
      <label htmlFor={id} className='block leading-none'>
        <Text size='micro' variant='label' tracking='label' className='leading-none uppercase'>
          unit code
        </Text>
      </label>
      {/* Голый `Input`, а не `InputField`: связь с формой здесь и есть то, что убрано. Значение в
          форму кладёт мутатор одной записью.

          `maxLength` СНЯТ НАМЕРЕННО. Он считает единицы UTF-16, а сервер — БАЙТЫ
          (`assemblyUnitKeyMaxLen`): на кириллице потолок расходился вдвое, и поле сначала молча
          обрезало набранное на 64-м символе, а потом сервер всё равно отвечал `too_long` на 128
          байт. Обрезка посреди набора — худший из двух отказов: она не называет правила и портит
          работу молча. Теперь длину считает `unitKeyLengthRefusal` — словами, до отправки, и тем
          же счётом, что у мутатора. */}
      <Input
        name={id}
        ref={ref}
        value={draft ?? outputKey}
        placeholder='SHELL'
        title='rename the unit: type a new code and press Enter — every step that references it is rewritten in one act'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setDraft(e.target.value);
          if (refusal !== null) setRefusal(null); // набрали другое — вопрос снят, можно пробовать снова
        }}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            // `preventDefault` обязателен: у карточки настоящая <form>, и Enter в поле иначе
            // отправляет её целиком — то есть переименование превращалось бы в сохранение.
            e.preventDefault();
            commit();
            return;
          }
          // Esc здесь НЕ разбирается: до этого обработчика он не доходит — его снимает
          // window-капчурный слушатель выше, и снимает потому, что иначе его первым увидит
          // Radix и закроет весь экран.
        }}
        onBlur={commit}
      />
    </div>
  );

  const note = (
    <>
      {refusal !== null && (
        <Text size='micro' variant='label' className='mt-1'>
          not renamed: {refusal}
        </Text>
      )}
      {refusal === null && tooLong !== null && (
        <Text size='micro' variant='label' className='mt-1'>
          too long: {tooLong}
        </Text>
      )}
      {refusal === null && tooLong === null && dissolving && (
        <Text size='micro' variant='label' className='mt-1'>
          press Enter to clear the code: ▣ {outputKey} dissolves and its inputs go back on the table
          for the next steps
        </Text>
      )}
      {/* `typed !== outputKey` — набрали тот же код, только с пробелами: вердикт ответит `noop`,
          и обещать «переписано в N шагах» было бы обещанием жеста, которого не будет. */}
      {refusal === null && tooLong === null && pending && !dissolving && typed !== outputKey && (
        <>
          <Text size='micro' variant='label' className='mt-1'>
            press Enter: ▣ {outputKey} → {typed} is rewritten in {plan?.steps ?? 0}{' '}
            {plan?.steps === 1 ? 'step' : 'steps'} at once — until then nothing has moved
          </Text>
          {/* НЕПЕРЕПИСЫВАЕМОЕ НАЗЫВАЕТСЯ ДО ПОДТВЕРЖДЕНИЯ, а не после. Код узла печатается на
              бумаге, а сам он входит в подпись раздела CONSTRUCTION (`assemblyInputTail` хеширует
              и выход шага, и ключи входов) — значит уже выданные в цех комплекты после
              переименования врут, и подпись протухает. Это по дизайну; человек обязан узнать это
              от интерфейса, а не от технолога в цеху.

              ПРО QR ЗДЕСЬ НЕ ГОВОРИТСЯ, и это правка ревью: QR наряда ведёт на `/r/:token`, а тот
              читает наряд ЖИВЫМ запросом (`GetRunPack`) — открытый по старой бумаге, он покажет уже
              новый код. Старым остаётся ровно бумага. Предупреждение, обещающее лишнее, — дефект
              того же рода, что чинит весь этот раунд, просто в безопасную сторону. */}
          <Text size='micro' variant='label'>
            printed packets already in the workshop keep “{outputKey}”, and the CONSTRUCTION
            signature goes stale
          </Text>
        </>
      )}
    </>
  );

  return { field, note };
}

function ProducesBlock({
  index,
  inputKeys,
  pieces,
  assembly,
  onRename,
  onDissolve,
  onEdit,
}: {
  index: number;
  inputKeys: string[];
  pieces: PieceRef[];
  assembly: AssemblyView;
  /** Мутатор переименования узла — один на все точки входа (R3), живёт в `OperationsField`. */
  onRename: (index: number, next: string) => RenameOutcome;
  /**
   * Мутатор растворения — ТОТ ЖЕ, что зовут полотно и схема. Свой `setValue` здесь стоял и делал
   * ровно то же самое, только мимо истории: растворение чипом отменить было нельзя, а
   * растворение с полотна — можно, хотя это один и тот же поступок.
   */
  onDissolve: (index: number) => void;
  /**
   * Шаг ИЗМЕНЁН кнопкой этого блока — гасит формовую историю отмены.
   *
   * Восьмая точка сброса — `focusin` на доке, то есть прикрытие РАЗМЕТКОЙ, а не контракт. В Chrome
   * оно случайно работает: `mousedown` фокусирует кнопку, и `focusin` успевает до `click`. **В
   * Safari нативная кнопка по клику фокуса не получает вовсе**, и сценарий «создал шаг → нажал
   * здесь „make it a unit“ → ⌘Z» снёс бы шаг вместе со свежей разметкой. Тот же довод, которым
   * это чинили у писателей полосы снимков: писатель объявляет правку сам.
   */
  onEdit?: () => void;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const outputKey = (useWatch({ name: `operations.${index}.outputUnitKey` }) ?? '') as string;
  const outputName = (useWatch({ name: `operations.${index}.outputUnitName` }) ?? '') as string;

  const byKey = useMemo(() => new Map(pieces.map((p) => [p.lineKey, p])), [pieces]);
  const usable = inputKeys.filter((k) => byKey.has(k) || assembly.res.units.has(k));
  // Акт переименования: поле встаёт в строку, слова про цену — под неё (см. шапку хука).
  const rename = useUnitCodeAct({ index, outputKey, onRename });

  // СПРЯТАЛ КОНТРОЛ — ОЧИСТИ ЗНАЧЕНИЕ. Ключ можно стереть бэкспейсом, а не только «растворить»:
  // ветка переключается на чип «сделать узлом», оба инпута размонтируются, и оставшееся имя
  // становится теневым значением — сервер откажет всей записи гигиеной (shadow-name), а контрола,
  // чтобы это исправить, на экране уже нет. То же правило, что у ширины отстрочки ниже.
  useEffect(() => {
    if (!outputKey && outputName) {
      setValue(`operations.${index}.outputUnitName`, '', { shouldDirty: true });
    }
  }, [outputKey, outputName, index, setValue]);
  const absorbs = !!outputKey && inputKeys.includes(outputKey) && assembly.res.units.has(outputKey);

  // Код предлагается по зоне шага, а не по именам деталей: имена длинные и меняются, а код
  // печатается на бумаге и в QR. Совпадение с существующим узлом — не беда: это и есть
  // поглощение, если тот же узел взят входом.
  const suggest = () => {
    const zone = (getValues(`operations.${index}.zone`) ?? '') as string;
    // Занято — это и узлы, И КЛЮЧИ ДЕТАЛЕЙ: пространство имён одно (правило 6), и предлагать
    // код, совпавший с деталью, значит предлагать заведомый отказ.
    const taken = new Set<string>([
      ...((getValues('operations') ?? []) as Array<{ outputUnitKey?: string }>)
        .map((o) => (o?.outputUnitKey ?? '').trim())
        .filter(Boolean),
      ...pieces.map((p) => p.lineKey),
    ]);
    return suggestUnitCode(zone, taken);
  };

  const declare = () => {
    if (usable.length < 2) {
      showMessage(
        'a unit made of a single input is processing, not a unit: take at least two inputs into the step',
        'error',
      );
      return;
    }
    const code = suggest();
    if (byKey.has(code)) {
      showMessage(`the key “${code}” is taken by a piece — pieces and units share one namespace`, 'error');
      return;
    }
    setValue(`operations.${index}.outputUnitKey`, code, { shouldDirty: true });
    // Разметка появилась снова — намерение «снять разметку» отменено. Без этого сценарий
    // «снял → передумал → объявил заново» уходил бы в отказ «снял и одновременно прислал узлы»,
    // а снять флаг руками нечем.
    setValue('assemblyCleared', false, { shouldDirty: true });
    onEdit?.();
  };

  return (
    <>
      <GroupLabel>produces</GroupLabel>
      {!outputKey ? (
        <ChipRow>
          <Chip dashed onClick={declare} title='declare that this step assembles a unit'>
            ▣ make it a unit
          </Chip>
          <Text size='micro' variant='label' component='span'>
            the step assembles nothing — its inputs stay available to the next steps
          </Text>
        </ChipRow>
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-2'>
            {/* КОД — ЧЕРЕЗ АКТ, ИМЯ — ЖИВЫМ ПОЛЕМ, и разница не в аккуратности. На ключ ссылаются
                входы других шагов, он и есть идентичность узла; имя не адресует ничего, поэтому
                живая запись имени не рвёт ни одной ссылки. maxLength у имени — по колонке сервера
                (VARCHAR(255)). */}
            {rename.field}
            <InputField
              name={`operations.${index}.outputUnitName`}
              label='unit name'
              placeholder='body'
              maxLength={255}
            />
            {/* ТОТ ЖЕ МУТАТОР, ЧТО У ПОЛОТНА. Свой `setValue` здесь гасил историю вместо того,
                чтобы класть в неё запись, — и один и тот же поступок отменялся с полотна и не
                отменялся из редактора. */}
            <Chip
              dashed
              onClick={() => onDissolve(index)}
              title='the step stops assembling the unit; its inputs return to the table for the next steps'
            >
              dissolve
            </Chip>
          </div>
          {rename.note}
          {absorbs && (
            <Text size='micro' variant='label' className='mt-1'>
              absorption: unit {outputKey} keeps its identity and gains the contents of this step
            </Text>
          )}
          {!outputName && (
            <Text size='micro' variant='label' className='mt-1'>
              the name is optional, but in print and on the floor people read it, not the code
            </Text>
          )}
          {/* Узел должен быть произведён ИМЕННО ЭТИМ шагом (или им поглощён). Предыдущий гейт
              спрашивал только «узел с таким ключом существует» — а он мог состояться ДРУГИМ
              шагом: у второго производителя джойн отвергнут, входы НЕ съедены, и кнопка
              заменяла бы в поздних шагах ЖИВЫЕ ЗАКОННЫЕ ссылки, выбрасывая их состав. Починка,
              которая ломает — ровно то, от чего предостерегал комментарий, пока предикат был не
              тот. */}
          <BootstrapEatenRefs
            index={index}
            outputKey={outputKey}
            assembly={assembly}
          />
        </>
      )}
    </>
  );
}

// BootstrapEatenRefs — «заменить съеденные ссылки узлом».
//
// БЕЗ ЭТОЙ КНОПКИ ФИЧУ НЕЛЬЗЯ ПРИМЕНИТЬ К ЖИВОЙ КАРТОЧКЕ. Сегодняшние карты законно ссылаются
// на одну деталь из многих шагов: стачали, отстрочили, приутюжили — все три несут рукав. Стоит
// объявить первый узел, и каждый поздний шаг, ссылающийся на съеденную деталь, начинает
// нарушать правило 1 — а правило 1 отказывает ВСЕЙ записи. Руками это часы правок под жёсткими
// отказами; здесь — одно действие.
function BootstrapEatenRefs({
  index,
  outputKey,
  assembly,
}: {
  index: number;
  outputKey: string;
  assembly: AssemblyView;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const ops = (useWatch({ name: 'operations' }) ?? []) as Array<{ inputKeys?: string[] }>;

  // Узел должен быть произведён ЭТИМ шагом — или им поглощён. Иначе кнопки быть не должно вовсе.
  const unit = assembly.res.units.get(outputKey);
  const mineIsReal = !!unit && (unit.producedAt === index || unit.absorbedAt.includes(index));

  // Съеденным считается только то, что съел ИМЕННО ЭТОТ шаг, по свидетельству движка, а не по
  // списку входов. Список входов — это заявка; съедено ли по ней что-нибудь, знает проход:
  // у отвергнутого джойна входы остаются на столе, и «замена» превратила бы законные ссылки в
  // висячие.
  const mine = new Set<string>();
  assembly.res.consumedBy.forEach((eater, key) => {
    if (eater === index && key !== outputKey) mine.add(key);
  });
  // Кандидаты — только ПОЗЖЕ этого шага: шаг раньше него деталь ещё не потерял.
  const affected: number[] = [];
  ops.forEach((o, i) => {
    if (i <= index) return;
    if ((o?.inputKeys ?? []).some((k) => mine.has(k))) affected.push(i);
  });
  if (!mineIsReal || affected.length === 0) return null;

  const apply = () => {
    const all = (getValues('operations') ?? []) as Array<{ inputKeys?: string[] }>;
    affected.forEach((i) => {
      const cur = (all[i]?.inputKeys ?? []).filter(Boolean);
      // Узел встаёт НА МЕСТО первого заменённого входа, а не в начало списка: порядок входов —
      // авторский, он несёт интерлив «деталь между узлами» и попадает в подпись секции. Сдвигать
      // его молча значило бы протухать подпись за автора.
      const next: string[] = [];
      let placed = false;
      for (const k of cur) {
        if (mine.has(k)) {
          if (!placed && !cur.includes(outputKey)) {
            next.push(outputKey);
            placed = true;
          }
          continue;
        }
        next.push(k);
      }
      if (!placed && !next.includes(outputKey)) next.unshift(outputKey);
      setValue(`operations.${i}.inputKeys`, next, { shouldDirty: true });
    });
    setValue('assemblyCleared', false, { shouldDirty: true });
    showMessage(`references to consumed pieces replaced with unit ${outputKey} in ${affected.length} steps`, 'success');
  };

  return (
    <ChipRow className='mt-1'>
      <Chip
        dashed
        onClick={apply}
        title={`the steps below reference pieces this unit consumes; the replacement is mandatory — otherwise the server refuses the whole card`}
      >
        replace the consumed references with the unit · {affected.length}
      </Chip>
    </ChipRow>
  );
}


// ClearAssemblyButton — «снять разметку узлов».
//
// ДВЕ ПОЛОВИНЫ, И ОНИ НЕДЕЛИМЫ. Распаковка без флага упрётся в контентный бекстоп сервера
// («запись не несёт ни одного узла против карточки, которая их несёт»); флаг без распаковки — в
// «противоречие: снял и одновременно прислал узлы». Поэтому кнопка делает обе вещи разом и
// оставляет форму в состоянии, которое сервер принимает строкой «cleared=true» своей таблицы.
//
// РАСПАКОВКА ПО ЗАМЫКАНИЮ, а не отбрасыванием: шаг со входами [SHELL, SL] после наивного
// удаления узла остался бы с одним рукавом, а полочка и спинка, жившие внутри SHELL, к нему не
// вернулись бы — карточка врала бы о том, что этот шаг сшивает.
/**
 * «Снять фотографии шагов» — путь отступления для операционных снимков.
 *
 * Он обязателен, а не удобен. Операции пишутся полной заменой, поэтому сервер отклоняет
 * осведомлённую запись без снимков против карточки, у которой они есть, — иначе отставшая вкладка
 * стирала бы десятки выносок молча. Значит убрать ПОСЛЕДНИЙ снимок руками, без объявленного
 * намерения, было бы невозможно: сохранение упиралось бы в бекстоп.
 *
 * Кнопка видна и когда форма уже пуста, а сохранённая карточка ещё несёт снимки: ровно тот же
 * довод, что у кнопки снятия разметки узлов — отказ, из которого нет выхода, хуже отказа.
 */
function ClearOperationMediaButton({
  storedHasMedia,
  frozen = false,
}: {
  storedHasMedia: boolean;
  frozen?: boolean;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const [confirming, setConfirming] = useState(false);

  // Диалог рисуется ПОРТАЛОМ в body, куда внешний `<fieldset disabled>` не достаёт: карточку
  // могли выпустить, пока он открыт. Гейт поэтому в самом мутаторе, а диалог закрывается сам.
  useEffect(() => {
    if (frozen) setConfirming(false);
  }, [frozen]);

  const ops = (useWatch({ name: 'operations' }) ?? []) as Array<{ media?: unknown[] }>;
  const inForm = ops.reduce((n, o) => n + (o?.media?.length ?? 0), 0);
  if (frozen) return null;
  if (inForm === 0 && !storedHasMedia) return null;

  const clear = () => {
    if (frozen) return;
    const list = (getValues('operations') ?? []) as Array<Record<string, unknown>>;
    list.forEach((_, i) => setValue(`operations.${i}.media`, [], { shouldDirty: true }));
    // Намерение живёт ровно одно сохранение: маппер записи гасит его сам, а черновик не хранит.
    setValue('mediaCleared', true, { shouldDirty: true });
    setConfirming(false);
    showMessage('the step photos are cleared — save the card', 'success');
  };

  return (
    <>
      <Chip dashed onClick={() => setConfirming(true)} title='remove every photo from every step'>
        clear the step photos
      </Chip>
      <ConfirmationModal
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={clear}
        title='clear the step photos'
        confirmLabel='clear'
        cancelLabel='keep'
        width='sm'
        // Тот же щит, что у остальных модалок тех-карты: после портала фокус возвращается экрану,
        // когда экран в DOM есть. Сегодня из-под открытого фулскрина до этой кнопки не дотянуться
        // и возврат — no-op, но правило едет с модалкой, а не с сегодняшней раскладкой страницы.
        onCloseAutoFocus={restoreScreenFocus}
      >
        <Text size='micro'>
          {inForm > 0
            ? `photos (${inForm}) will be removed from every step, along with the callouts on them.`
            : "there are no photos in the form any more; the button declares to the server the intent to clear them from the saved card."}{' '}
          the files themselves stay in the library.
        </Text>
      </ConfirmationModal>
    </>
  );
}

function ClearAssemblyButton({
  pieces,
  storedHasUnits,
  frozen = false,
}: {
  pieces: PieceRef[];
  /** Размечена ли СОХРАНЁННАЯ карточка. Не то же самое, что размечена форма. */
  storedHasUnits: boolean;
  /** Выпущенная карточка: намерение снять разметку объявлять не из чего и незачем. */
  frozen?: boolean;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const view = useAssemblyView(pieces);
  const [confirming, setConfirming] = useState(false);

  // Кнопка видна и когда форма УЖЕ не размечена, а сохранённая карточка ещё размечена.
  //
  // Без этого путь отступления не работал: восстановленный черновик (или любой другой источник
  // распакованных входов) даёт форму без узлов, кнопка исчезает, сохранение упирается в бекстоп
  // с текстом «нажмите „снять разметку узлов“» — а нажимать нечего, и единственный выход
  // перезагрузка с потерей правок. Отказ, из которого нет выхода, хуже отказа.
  const inForm = view.res.units.size;
  if (inForm === 0 && !storedHasUnits) return null;
  // Модалка подтверждения портальная, то есть рендерится ВНЕ `<fieldset disabled>` карточки и
  // остаётся живой; без явного флага диалог, открытый до выпуска, взводил бы намерение уже на
  // замороженной карточке (близнец гасится тем же способом).
  if (frozen) return null;

  const clear = () => {
    const ops = (getValues('operations') ?? []) as Array<{
      inputKeys?: string[];
      outputUnitKey?: string;
    }>;
    const pieceKeys = new Set(pieces.map((p) => p.lineKey));
    const sweepPieces = pieces.map((p) => ({ lineKey: p.lineKey, name: p.name }));
    const allSteps = ops.map((o) => ({
      inputs: classifyAssemblyInputs(pieceKeys, (o?.inputKeys ?? []).filter(Boolean)),
      outputUnitKey: (o?.outputUnitKey ?? '').trim(),
      outputUnitName: '',
    }));
    // Состав узла берётся НА МОМЕНТ ШАГА, а не финальный. Разница не косметическая: при
    // «A+B→GARMENT, обработка [GARMENT], GARMENT+C→GARMENT» финальное замыкание вернуло бы
    // обработке и деталь C, которой на её шаге ещё не существовало. Сервер такое примет —
    // последовательность останется валидной, — и карточка соврёт о том, что этот шаг делает.
    //
    // Префиксный проход: n ≤ 60 шагов, стоимость незаметна, а альтернатива — хранить снимки
    // замыканий в движке ради одной кнопки.
    const unitsBefore = (i: number) => assemblySweep(sweepPieces, allSteps.slice(0, i)).units;
    let droppedDangling = 0;
    ops.forEach((o, i) => {
      const seen = new Set<string>();
      const expanded: string[] = [];
      const asOfStep = unitsBefore(i);
      for (const k of o?.inputKeys ?? []) {
        const unit = asOfStep.get(k) ?? view.res.units.get(k);
        // Оборванный ключ (не деталь И не узел — обычно удалённый шаг-производитель или легаси
        // «piece deleted») при распаковке ОТБРАСЫВАЕТСЯ. Оставь его — и запись со снятой
        // разметкой всё равно «несёт узлы» с точки зрения сервера, то есть кнопка ломала бы
        // собственный контракт: обещает состояние, которое сервер примет, а отдаёт отказ.
        if (!unit && !pieceKeys.has(k)) {
          droppedDangling++;
          continue;
        }
        for (const leaf of unit ? unit.leaves : [k]) {
          if (!seen.has(leaf)) {
            seen.add(leaf);
            expanded.push(leaf);
          }
        }
      }
      setValue(`operations.${i}.inputKeys`, expanded, { shouldDirty: true });
      setValue(`operations.${i}.outputUnitKey`, '', { shouldDirty: true });
      setValue(`operations.${i}.outputUnitName`, '', { shouldDirty: true });
    });
    // Намерение объявляется ровно на это сохранение.
    setValue('assemblyCleared', true, { shouldDirty: true });
    setConfirming(false);
    showMessage(
      droppedDangling > 0
        ? `the unit markup is cleared; dangling references dropped: ${droppedDangling} — save the card`
        : 'the unit markup is cleared — save the card for it to apply',
      'success',
    );
  };

  return (
    <>
      <Chip
        dashed
        onClick={() => setConfirming(true)}
        title='clear the unit markup across the whole card: unit inputs go back to pieces by their contents'
      >
        clear the unit markup{inForm > 0 ? ` · ${inForm}` : ''}
      </Chip>
      <ConfirmationModal
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={clear}
        title='clear the unit markup?'
        confirmLabel='clear'
        // Тот же щит, что у соседа выше и у модалки генератора: правило «после портала фокус
        // возвращается экрану» едет с модалкой, а no-op вне фулскрина обеспечивает сам возврат.
        onCloseAutoFocus={restoreScreenFocus}
      >
        <Text size='micro'>
          {inForm > 0
            ? `units on the card: ${inForm}.`
            : 'there are no units in the form any more, but the saved card is marked up — clearing confirms that to the server.'}{' '}
          unit inputs go back to pieces by their contents, and the output keys are cleared. the
          CONSTRUCTION sign-off becomes “changed after the sign-off” — that is the truth, not a
          defect: the content really did change.
        </Text>
      </ConfirmationModal>
    </>
  );
}


// StepNumberDrift — предупреждение о переезде номеров шагов.
//
// Номер операции сервер присваивает САМ как (position+1)*10, и делал это ещё до узлов сборки.
// Значит номера двигает не разметка, а изменение ПОРЯДКА — и вот тут расходятся две вещи,
// которые легко счесть одной:
//
//   - ссылки дефектов на номера шагов переезжают автоматически (remapIssues) — это машина;
//   - НАПЕЧАТАННЫЕ номера в обращающихся тех-паках и в головах цеха не переезжают никак.
//
// Первичная разметка карточки в узлы обычно и означает перестановку шагов, поэтому баннер
// появляется ровно там, где переезд реален, и называет его до сохранения, а не после.
//
// Баннер, а не модалка: модалка выстреливала бы на каждом сохранении после любой перестановки и
// быстро стала бы кнопкой «ок, не читая».
function StepNumberDrift() {
  const ops = (useWatch({ name: 'operations' }) ?? []) as Array<{ operationNumber?: number }>;
  const moves = ops
    .map((o, i) => ({ from: o?.operationNumber ?? 0, to: (i + 1) * 10 }))
    .filter((m) => m.from > 0 && m.from !== m.to);
  if (moves.length === 0) return null;
  return (
    <CalloutBox tone='error'>
      <Text size='micro'>
        the step numbers will move on save:{' '}
        <b>{moves.map((m) => `${m.from}→${m.to}`).join(', ')}</b>. defect references move with the
        steps automatically, but the numbers already printed in issued tech packs do not.
      </Text>
    </CalloutBox>
  );
}

const SEQUENCE_VIEWS = [
  {
    value: 'schematic',
    label: 'schematic',
    hint: 'units and what feeds them, laid out on a canvas',
  },
  { value: 'list', label: 'list', hint: 'the steps in order, one line each' },
] as const satisfies readonly ViewSwitchOption<SchematicMode>[];

/**
 * Переключатель вида последовательности: схема сборки или список шагов.
 *
 * НАЗЫВАЕТ ПОЛОЖЕНИЕ, А НЕ ЦЕЛЬ. До этого здесь стоял один чип с подписью «as a list» / «as a
 * schematic» — то есть подписью следующего вида, а не текущего. С открытой схемой он читался
 * «список», и понять, где ты находишься, можно было только по полотну под ним. Оба вида на виду
 * сразу: вопрос «где я» отвечен подписью, а не догадкой.
 *
 * ОБА СЕГМЕНТА ВСЕГДА НАРИСОВАНЫ, поэтому ширина полосы не зависит от выбора. Подпись «as a
 * schematic» была на пять знаков длиннее «as a list», и орган ёрзал даже там, где контейнер стоял
 * на месте.
 *
 * Виды правят ОДНИ И ТЕ ЖЕ данные, поэтому это переключатель вида, а не две вкладки с разным
 * содержимым; подсказки сегментов говорят, что показывает каждый.
 */
function SequenceViewSwitch({
  mode,
  onMode,
}: {
  mode: SchematicMode;
  onMode: (next: SchematicMode) => void;
}) {
  return (
    <ViewSwitch<SchematicMode>
      label='sequence view'
      value={mode}
      onChange={onMode}
      options={SEQUENCE_VIEWS}
    />
  );
}

// ── two controls the field library has no shape for ──────────────────────────────────────────
//
// Both exist because a Radix select can only hold a NON-EMPTY STRING, and two of this feature's
// values are legitimately neither: «no profile named» is the empty string, and «steam not stated»
// is `undefined`. Encoding them at the control instead of in the form is deliberate — the moment
// the sentinel reaches the form it also reaches the save mapper, and «__inherit__» would travel to
// the server as a profile key.
const PROFILE_INHERIT = '__inherit__';

function EncodedSelectField<T>({
  name,
  label,
  items,
  encode,
  decode,
  className,
}: {
  name: `operations.${number}.${'machineProfileKey' | 'pressProfileKey' | 'pressSteam'}`;
  label: string;
  items: { value: string; label: string }[];
  encode: (value: T) => string;
  decode: (option: string) => T;
  className?: string;
}) {
  const { control } = useFormContext<TechCardFormData>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            name={name}
            items={items}
            placeholder={label}
            value={encode(field.value as T)}
            onValueChange={(v?: string) => field.onChange(decode(v ?? ''))}
            invalid={!!fieldState.error}
            className={className}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// A NUMBER WHOSE ZERO MEANS «NOT STATED», and therefore a box that has to be EMPTY at zero.
// InputField renders `field.value ?? ''`, so an unset thread count would sit in the control as a
// literal `0` — which is both a wrong reading (there is no zero-thread machine) and the end of the
// placeholder mechanism, because a box with a value in it never shows its placeholder and the
// inherited value would stop being visible anywhere. The `value` prop lands after the spread inside
// InputField, so passing it here overrides that default while onChange still goes to RHF.
//
// AND `step='any'` WITH NO `min` / `max`, which is the less obvious half. The card's <form> does not
// carry noValidate, so the browser runs native constraint validation on submit — and a number input
// has an IMPLICIT step of 1, so a mistyped «92.5» is a stepMismatch that aborts the submit with a
// native bubble before RHF ever runs. These controls live inside an accordion that is CLOSED on any
// step that inherits everything, so the save button would simply stop working, pointing at a field
// nobody can see. `step='any'` switches the native check off; the bands are enforced in the schema
// instead, where the message lands on the field and the editor walks to the failing step.
function InheritableNumberField({
  name,
  label,
  value,
  placeholder,
}: {
  name: `operations.${number}.${
    | 'threadCount'
    | 'needleSizeNm'
    | 'pressTemperatureC'
    | 'pressDwellSec'
    // ВИДЫ ОПЕРАЦИЙ (0324). Пятеро новых пришли за ОБОИМИ доводами выше — ноль обязан читаться
    // пустой коробкой, а `step='any'` обязан снять нативную проверку шага, — и НЕ пришли за
    // третьим: наследовать им неоткуда, лестницы у этих полей нет. Плейсхолдер у них поэтому
    // ПРИМЕР («1..12»), а не обещание, и на месте он стоит только потому, что коробка пуста.
    | 'needleCount'
    | 'placementCount'
    | 'cycleStitchCount'
    | 'secondPressSec'
    | 'airTemperatureC'}`;
  label: string;
  value: number;
  placeholder: string;
}) {
  return (
    <InputField
      name={name}
      type='number'
      step='any'
      valueAsNumber
      label={label}
      placeholder={placeholder}
      value={value || ''}
    />
  );
}

// ONE VALUE IN TWO UNITS, and only one of them is stored. The card records stitches per cm; the
// length in mm is `10 / density` and is written into no field at all — a second column would be a
// second truth, and the two would disagree the first time somebody edited one of them.
//
// So this input is a MIRROR: it shows the length the stored density works out to, and typing a
// length writes the density back. While it has focus it shows exactly what was typed (the local
// draft) rather than the round-trip of it — without that, typing «3» would set density 3.33, which
// renders back as «3.0» and moves the cursor out from under the next keystroke.
function StitchLengthMirror({
  index,
  density,
  placeholder,
}: {
  index: number;
  density: string;
  /** What the density would be inherited as, already in millimetres — «2.5 (card)». */
  placeholder: string;
}) {
  const { setValue } = useFormContext<TechCardFormData>();
  const [draft, setDraft] = useState<string | null>(null);
  // The division lives in operation-options (stitchLengthMm) because the printed sheet shows the
  // same pair — two copies of `10 / density` are two roundings of one number.
  const derived = stitchLengthMm(density);
  const onChange = (raw: string) => {
    const text = sanitizeDecimal(raw, 1);
    setDraft(text);
    if (!text.trim()) {
      // Clearing the length clears the density: they are the same fact, and leaving the density
      // behind would put a value back in the box the moment focus left it.
      setValue(`operations.${index}.stitchesPerCm`, '', { shouldDirty: true });
      return;
    }
    const mm = parseDecimalNumber(text);
    if (!Number.isFinite(mm) || mm <= 0) return;
    setValue(`operations.${index}.stitchesPerCm`, String(Math.round((10 / mm) * 100) / 100), {
      shouldDirty: true,
    });
  };
  return (
    <div className='space-y-px'>
      <label htmlFor={`op-${index}-stitch-length`} className='block leading-none'>
        <Text size='micro' variant='label' tracking='label' className='leading-none uppercase'>
          = stitch length, mm
        </Text>
      </label>
      <Input
        name={`op-${index}-stitch-length`}
        inputMode='decimal'
        placeholder={placeholder}
        title='the same setting as stitches / cm — typing here writes the density'
        value={draft ?? derived}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

/**
 * СЛОВА ПРО ТО, ОТКУДА В ШАГ КЛАДУТ ДЕТАЛЬ — на ИНЛАЙНОВОЙ вкладке. Ровно те, что стояли в
 * редакторе намертво.
 *
 * Теперь их приносит ПОВЕРХНОСТЬ, потому что механизм у поверхностей разный: здесь лоток прямо над
 * списком (клик по чипу кладёт деталь) и нативный DnD (чип можно бросить в редактор), а в
 * фулскрине лоток не рендерится вовсе и источника нативного драга нет — там полка и режим добора.
 * Одни и те же слова на обеих поверхностях означали бы, что на одной из них они врут; выбирать,
 * на какой именно, не пришлось: врали в фулскрине, и человек шёл кликать полку.
 */
const TRAY_PIECE_SOURCE = {
  groupHint: 'click a piece in the tray to add it',
  chipTitle: 'pick a piece from the tray above the list',
  emptyNote: 'not linked to any piece — click one in the tray above, or drag it here',
};

// ── ВЫВОДИМОСТЬ: ЧТО КАРТОЧКА ЗНАЕТ ПРО ШАГ САМА ───────────────────────────────────────────────
//
// ТРИ ПРАВИЛА ПОДСТАНОВКИ, И ОНИ ЖЕ — ГРАНИЦА ЭТОГО КУСКА:
//
//  1. ТОЛЬКО В ПУСТОЕ. Заполненное не трогается никогда — ни своё, ни чужое. Ответ человека
//     старше любого вывода.
//  2. ТОЛЬКО ВИДИМО И ТОЛЬКО С МЕТКОЙ. Значение стоит в том же контроле, что и ответ человека, и
//     рядом с ним — метка «suggested». Жёсткой записи (в обход экрана, на сохранении, на сервер)
//     нет ни одной: зона входит в подпись карточки, и написать её за человека нельзя.
//  3. ПОДСТАВЛЕННОЕ СНИМАЕТСЯ И ОТЗЫВАЕТСЯ. Касание метки убирает значение и гасит подсказку
//     навсегда для этого шага; правка контрола гасит метку, а значение оставляет человеку. И
//     наоборот: пока метка стоит, значение — наше, поэтому исчезнувшее основание (добавили вторую
//     деталь, кандидатов стало два) ОТЗЫВАЕТ подстановку. Оставить её значило бы, что карточка
//     утверждает то, чего уже не выводит.
//
// ФОРМА НЕ ПАЧКАЕТСЯ ПОДСТАНОВКОЙ (`shouldDirty: false`). Открыть карточку и закрыть — не правка,
// и синий значок «есть несохранённое» от простого просмотра приучил бы не смотреть на него вовсе.
// Дальше значение живёт как всякое другое: сохранится вместе с первой настоящей правкой шага,
// на глазах и с меткой.

/** Поля, у которых бывает метка «подставлено». Ключи локального состояния редактора. */
type SuggestedField = 'zone' | 'press' | 'thread';

/**
 * Снимок карточки для вывода. Собирается из ТЕХ ЖЕ подписок, что уже держит редактор: список
 * операций он читает через `useAssemblyView`, парк прессов и строки BOM — своими, и вторая
 * подписка на то же имя стоит здесь только новой памяткой, а не новой перерисовкой.
 */
function useStepInference(
  index: number,
  pieces: PieceRef[],
  bomLines: BomLine[],
  parkPresses: InferencePress[],
  // Что на этом шаге написали МЫ. Вычитается из снимка перед выводом — см. довод у вызова: вывод,
  // читающий собственную догадку как факт, замыкается сам на себя.
  own: { zone: boolean; thread?: string; press: boolean },
): StepInference {
  const ops = useWatch({ name: 'operations' }) as InferenceStep[] | undefined;
  const aliases = (useWatch({ name: 'pieceDxfAliases' }) ?? []) as InferenceAlias[];
  const { zone: ownZone, thread: ownThread, press: ownPress } = own;
  return useMemo(() => {
    const steps = (ops ?? []).map((o, i) => {
      if (i !== index) return o;
      const stripped: InferenceStep = { ...o };
      if (ownZone) stripped.zone = '';
      if (ownThread) {
        stripped.bomLineKeys = (stripped.bomLineKeys ?? []).filter((k) => k !== ownThread);
      }
      if (ownPress) {
        stripped.pressEquipment = '';
        stripped.pressProfileKey = '';
      }
      return stripped;
    });
    const card: InferenceCard = {
      pieces: pieces.map((p) => ({ lineKey: p.lineKey, name: p.name })),
      bomLines,
      aliases,
      presses: parkPresses,
      steps,
    };
    // ТОЛЬКО ОТКРЫТЫЙ ШАГ, а не вся карточка: редактор смонтирован в единственном экземпляре, а
    // сто двадцать шесть выводов на каждое нажатие клавиши — это не подсказка, а тормоз.
    return inferStep(card, index);
  }, [ops, aliases, pieces, bomLines, parkPresses, index, ownZone, ownThread, ownPress]);
}

/**
 * ОТКУДА ВЗЯЛАСЬ ПОДСКАЗКА — СЛОВАМИ, а не «система решила». Источник называется в подсказке
 * метки, потому что проверять вывод человек будет ровно там, откуда он взялся: назначение строки
 * BOM правится на вкладке материалов, имя детали — в чертеже, вид — пикером двумя контролами выше.
 */
const INFERENCE_SOURCE_WORDS: Record<'fabric' | 'piece-name' | 'work', string> = {
  fabric: 'the purpose of the cloth these pieces are cut from',
  'piece-name': 'the names of the pieces this step takes',
  work: 'the kind of work this step is',
};

function zoneSuggestedWhy(sources: { id: 'fabric' | 'piece-name' | 'work' }[]): string {
  const words = sources.map((s) => INFERENCE_SOURCE_WORDS[s.id]);
  return words.length === 0 ? 'inferred from the card' : `inferred from ${words.join(' and ')}`;
}

/**
 * МЕТКА «ПОДСТАВЛЕНО» — КНОПКА, А НЕ НАДПИСЬ, и это часть контракта: подставленное обязано
 * сниматься одним касанием там же, где оно показано. Надпись оставила бы человеку только путь
 * «выбрать в селекте другое значение», то есть заменить наш ответ своим — а он мог хотеть
 * пустоты.
 */
function SuggestedMark({
  field,
  what,
  why,
  onDismiss,
}: {
  field: SuggestedField;
  what: string;
  why: string;
  onDismiss: () => void;
}) {
  return (
    <button
      type='button'
      data-suggested={field}
      onClick={onDismiss}
      title={`${why} — click to drop it and answer yourself`}
      className='mt-px inline-flex max-w-full items-center gap-1 border border-warning px-[7px] py-px text-micro uppercase tracking-pill text-warning'
    >
      <span className='truncate'>suggested · {what}</span>
      <span aria-hidden>✕</span>
    </button>
  );
}

// ── the step editor ──────────────────────────────────────────────────────────────────────────
// The whole sewing spec for ONE step. Remounted (keyed on the field id) whenever the selection
// moves, so the "skip the first run" guards below start clean and selecting a step never dirties
// the form.
function OperationEditor({
  index,
  bomLines,
  pieces,
  pieceShapes,
  cloth,
  tiled,
  pinOptions,
  colorwayArticles,
  onInsertAfter,
  onRemove,
  onFlashPieces,
  pieceSource,
  onActiveBomChange,
  onDropPiece,
  onRenameUnit,
  onDissolveUnit,
  mediaUrls,
  onEdit,
  frozen = false,
}: {
  index: number;
  bomLines: BomLine[];
  pieces: PieceRef[];
  /** Контуры деталей карточки — та же карта, что у рельса и у тарелки. */
  pieceShapes: PieceShapeMap;
  /**
   * Ткань деталей ПЕРВОГО колорвея — та же карта, что у лотка и у полотна схемы. Здесь она ЧИТАЕТСЯ
   * плиткой состава шага и больше ничем: редактор пишет в форму шаг, а не рецепт.
   */
  cloth?: Map<string, PieceCloth> | null;
  /** Детали показываются плитками — решает вкладка, одинаково для тарелки и состава шага. */
  tiled: boolean;
  pinOptions: PickerOption[];
  colorwayArticles?: ColorwayArticles;
  onInsertAfter: () => void;
  onRemove: () => void;
  onFlashPieces: () => void;
  /**
   * ТРИ НАДПИСИ ПРО ИСТОЧНИК ДЕТАЛЕЙ — ОТ ПОВЕРХНОСТИ, а не намертво в редакторе. Редактор один на
   * две поверхности, а орган, которым в шаг кладут деталь, у них разный: инлайн — лоток над
   * списком, фулскрин — полка и режим добора. Обработчик «＋ piece» поверхность решала и раньше
   * (`onFlashPieces`), а слова оставались инлайновыми — и в фулскрине звали к лотку, которого там
   * нет. Слова и механизм ездят вместе: разъехаться они могут только молча.
   */
  pieceSource: { groupHint: string; chipTitle: string; emptyNote: string };
  onActiveBomChange?: (k: string | null) => void;
  onDropPiece: (index: number, lineKey: string) => void;
  /**
   * ПЕРЕИМЕНОВАНИЕ УЗЛА — ОДИН МУТАТОР НА ВСЕ ТОЧКИ ВХОДА. Поле кода живёт в редакторе шага, а
   * когда появится редактор узла (Т6) — и в нём; обе поверхности обязаны звать ЭТОТ колбэк, иначе
   * «переименовать» на одном экране и на другом разойдутся в мелочах, и разойдутся молча (R3).
   */
  onRenameUnit: (index: number, next: string) => RenameOutcome;
  /** Растворение — тот же мутатор, что зовут полотно и схема. */
  onDissolveUnit: (index: number) => void;
  /** Адреса операционных снимков; форма возит только media_id. */
  mediaUrls?: Map<number, string>;
  /**
   * Шаг ИЗМЕНЁН редактором. Сегодня зовут только писатели полосы снимков: их приёмная модалка и
   * холст выносок живут в порталах, и сброс записи отмены по `focusin` секции дока их не видит.
   * Остальные поля редактора — обычные инпуты внутри дока, фокус в них есть, но прикрытие
   * разметкой не контракт: новый писатель, ушедший в портал, обязан позвать это же.
   */
  onEdit?: () => void;
  /** Карточка выпущена: снимки и выноски читаются, но не правятся. */
  frozen?: boolean;
}) {
  const form = useFormContext<TechCardFormData>();
  const { control, getValues, setValue } = form;
  const opNumber = (index + 1) * 10;
  const opType = (useWatch({ control, name: `operations.${index}.operationType` }) ?? '') as string;
  const calloutNumber = (useWatch({ control, name: `operations.${index}.calloutNumber` }) ??
    0) as number;
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [over, setOver] = useState(false);

  // The overrides fold. Open when the step already differs — a folded panel hiding a value the
  // operator set is worse than an open one showing nothing.
  const zoneValue = (useWatch({ control, name: `operations.${index}.zone` }) ?? '') as string;
  const noteValue = (useWatch({ control, name: `operations.${index}.note` }) ?? '') as string;
  const seamClass = (useWatch({ control, name: `operations.${index}.seamClass` }) ??
    NONE_SEAM_CLASS) as string;
  const seamAllowanceMm = (useWatch({ control, name: `operations.${index}.seamAllowanceMm` }) ??
    '') as string;
  const stitchesPerCm = (useWatch({ control, name: `operations.${index}.stitchesPerCm` }) ??
    '') as string;
  const topstitchMode = (useWatch({ control, name: `operations.${index}.topstitchMode` }) ??
    NONE_TOPSTITCH) as string;
  // Отступ и число рядов ЧИТАЮТСЯ, а не только пишутся: они уехали в зону свойств вида, а её
  // счётчик и гейт показа обязаны видеть заполненное значение — иначе шаг с шестью миллиметрами
  // отстрочки отрисовался бы как «ничего не названо».
  const topstitchWidthMm = (useWatch({ control, name: `operations.${index}.topstitchWidthMm` }) ??
    '') as string;
  const topstitchRows = (useWatch({ control, name: `operations.${index}.topstitchRows` }) ??
    0) as number;
  const attachmentKind = (useWatch({ control, name: `operations.${index}.attachmentKind` }) ??
    NONE_ATTACHMENT) as string;
  // Watched, not merely written: «set as card profile» has to know whether a size is pinned to the
  // foot before it may move the foot into the park (see machineTakes — clearing the kind out from
  // under a size would trip the effect below and silently delete the number).
  const attachmentSizeMm = (useWatch({ control, name: `operations.${index}.attachmentSizeMm` }) ??
    '') as string;

  // --- the two equipment axes (0306) --------------------------------------------------------
  // «На чём» the step is done. machineType / pressEquipment are REQUIRED by their step type and sit
  // in the core grid beside the type; everything else below is an override whose blank means
  // «inherit», and lives in the fold with the rest of the overrides.
  const machineType = (useWatch({ control, name: `operations.${index}.machineType` }) ??
    NONE_MACHINE) as string;
  const machineProfileKey = (useWatch({ control, name: `operations.${index}.machineProfileKey` }) ??
    '') as string;
  const threadCount = (useWatch({ control, name: `operations.${index}.threadCount` }) ??
    0) as number;
  const needleType = (useWatch({ control, name: `operations.${index}.needleType` }) ??
    NONE_NEEDLE) as string;
  const needleSizeNm = (useWatch({ control, name: `operations.${index}.needleSizeNm` }) ??
    0) as number;
  const threadTension = (useWatch({ control, name: `operations.${index}.threadTension` }) ??
    NONE_TENSION) as string;
  const threadTensionNote = (useWatch({ control, name: `operations.${index}.threadTensionNote` }) ??
    '') as string;
  const stitchWidthMm = (useWatch({ control, name: `operations.${index}.stitchWidthMm` }) ??
    '') as string;
  const pressEquipment = (useWatch({ control, name: `operations.${index}.pressEquipment` }) ??
    NONE_PRESS_EQUIPMENT) as string;
  const pressProfileKey = (useWatch({ control, name: `operations.${index}.pressProfileKey` }) ??
    '') as string;
  const pressTemperatureC = (useWatch({ control, name: `operations.${index}.pressTemperatureC` }) ??
    0) as number;
  const pressDwellSec = (useWatch({ control, name: `operations.${index}.pressDwellSec` }) ??
    0) as number;
  const pressPressureNCm2 = (useWatch({
    control,
    name: `operations.${index}.pressPressureNCm2`,
  }) ?? '') as string;
  // `undefined` is a VALUE here, not a missing read — see the tri-state control below.
  const pressSteam = useWatch({ control, name: `operations.${index}.pressSteam` }) as
    | boolean
    | undefined;
  const pressCloth = (useWatch({ control, name: `operations.${index}.pressCloth` }) ??
    NONE_PRESS_CLOTH) as string;

  // --- ВИДЫ ОПЕРАЦИЙ (0324): тридцать два факта девяти новых глаголов -------------------------
  // По одному `useWatch` на поле, как и у двух осей выше. Не «на всякий случай»: каждое из этих
  // значений читают счётчик фолда (пилюля решает, ОТКРЫТЬ ли аккордеон на монтировании — заполненный
  // факт за закрытой створкой равносилен потерянному) и правила показа соседей.
  const needleCount = (useWatch({ control, name: `operations.${index}.needleCount` }) ??
    0) as number;
  const needleGaugeMm = (useWatch({ control, name: `operations.${index}.needleGaugeMm` }) ??
    '') as string;
  const seamSecuring = (useWatch({ control, name: `operations.${index}.seamSecuring` }) ??
    NONE_SEAM_SECURING) as string;
  const rowSpacingMm = (useWatch({ control, name: `operations.${index}.rowSpacingMm` }) ??
    '') as string;
  const fullnessRatio = (useWatch({ control, name: `operations.${index}.fullnessRatio` }) ??
    '') as string;
  const placementCount = (useWatch({ control, name: `operations.${index}.placementCount` }) ??
    0) as number;
  const pitchMm = (useWatch({ control, name: `operations.${index}.pitchMm` }) ?? '') as string;
  const attachMethod = (useWatch({ control, name: `operations.${index}.attachMethod` }) ??
    NONE_ATTACH_METHOD) as string;
  const holePrep = (useWatch({ control, name: `operations.${index}.holePrep` }) ??
    NONE_HOLE_PREP) as string;
  const reinforcement = (useWatch({ control, name: `operations.${index}.reinforcement` }) ??
    NONE_REINFORCEMENT) as string;
  const foldbackMm = (useWatch({ control, name: `operations.${index}.foldbackMm` }) ?? '') as string;
  const cycleStitchCount = (useWatch({ control, name: `operations.${index}.cycleStitchCount` }) ??
    0) as number;
  const printMethod = (useWatch({ control, name: `operations.${index}.printMethod` }) ??
    NONE_PRINT_METHOD) as string;
  const peelMode = (useWatch({ control, name: `operations.${index}.peelMode` }) ??
    NONE_PEEL_MODE) as string;
  const secondPressSec = (useWatch({ control, name: `operations.${index}.secondPressSec` }) ??
    0) as number;
  const airTemperatureC = (useWatch({ control, name: `operations.${index}.airTemperatureC` }) ??
    0) as number;
  const feedSpeedMMin = (useWatch({ control, name: `operations.${index}.feedSpeedMMin` }) ??
    '') as string;
  const trimAction = (useWatch({ control, name: `operations.${index}.trimAction` }) ??
    NONE_TRIM_ACTION) as string;
  const residualAllowanceMm = (useWatch({
    control,
    name: `operations.${index}.residualAllowanceMm`,
  }) ?? '') as string;
  const residualTailMaxMm = (useWatch({
    control,
    name: `operations.${index}.residualTailMaxMm`,
  }) ?? '') as string;
  const pressAction = (useWatch({ control, name: `operations.${index}.pressAction` }) ??
    NONE_PRESS_ACTION) as string;
  const pressToward = (useWatch({ control, name: `operations.${index}.pressToward` }) ??
    NONE_PRESS_TOWARD) as string;
  const cleaningKind = (useWatch({ control, name: `operations.${index}.cleaningKind` }) ??
    NONE_CLEANING_KIND) as string;
  const coverageMode = (useWatch({ control, name: `operations.${index}.coverageMode` }) ??
    NONE_COVERAGE_MODE) as string;
  const wetProcessKind = (useWatch({ control, name: `operations.${index}.wetProcessKind` }) ??
    NONE_WET_PROCESS) as string;
  const buttonholeStyle = (useWatch({ control, name: `operations.${index}.buttonholeStyle` }) ??
    NONE_BUTTONHOLE_STYLE) as string;
  const cutLengthMm = (useWatch({ control, name: `operations.${index}.cutLengthMm` }) ??
    '') as string;
  const buttonholeOrientation = (useWatch({
    control,
    name: `operations.${index}.buttonholeOrientation`,
  }) ?? NONE_BUTTONHOLE_ORIENTATION) as string;
  const bartackLengthMm = (useWatch({ control, name: `operations.${index}.bartackLengthMm` }) ??
    '') as string;
  const attachPattern = (useWatch({ control, name: `operations.${index}.attachPattern` }) ??
    NONE_ATTACH_PATTERN) as string;
  const zipperApplication = (useWatch({ control, name: `operations.${index}.zipperApplication` }) ??
    NONE_ZIPPER_APPLICATION) as string;
  const bindingStyle = (useWatch({ control, name: `operations.${index}.bindingStyle` }) ??
    NONE_BINDING_STYLE) as string;
  const labelAttachStitch = (useWatch({ control, name: `operations.${index}.labelAttachStitch` }) ??
    NONE_LABEL_ATTACH) as string;

  // --- ОСЬ «РАБОТА» ШАГА, ПРОЧИТАННАЯ ДО ГЕЙТОВ ------------------------------------------------
  //
  // ЧИТАЕТСЯ ЗДЕСЬ, А НЕ У ПИКЕРА (он ниже, и до 0331 значение жило там), ПОТОМУ ЧТО ЕЁ СПРАШИВАЮТ
  // ГЕЙТЫ ПОЛЕЙ. Работа отвечает на вопрос «несёт ли шаг это поле» наравне с машинкой: длина
  // прорези законна на зигзаге ровно потому, что работа названа. Гейт, который работы не видит,
  // прячет поле, которое сервер ТРЕБУЕТ, — и владелец получает отказ на контроле, которого нет на
  // экране. Второго чтения нет и быть не может: `const` ниже по телу компилятор бы и не отдал.
  const workValue = ((useWatch({ control, name: `operations.${index}.work` }) ?? '') as string).trim();
  // КАТАЛОГ ЧИТАЕТСЯ ТУТ ЖЕ, И РОВНО ПО ТОМУ ЖЕ ДОВОДУ, ЧТО СТРОКОЙ ВЫШЕ. До R8 он жил у пикера
  // (ниже по телу), но ЯРЛЫК длины прорези спрашивает не только сам токен, а и то, знаком ли он
  // каталогу: работа новее бандла — это не петля, и назвать её петлёй значит соврать. Пикер берёт
  // ту же переменную там, где стоял его собственный вызов, — второго обращения к сети нет, ключ
  // запроса один на приложение.
  const { catalog: workCatalog, live: catalogLive, refresh: refreshCatalog } =
    useOperationWorkCatalog();

  const isMachineStep = isMachineType(opType);
  const isPressStep = isPressType(opType);

  // --- ЧТО ЭТОТ ГЛАГОЛ ВООБЩЕ НЕСЁТ (0324) ---------------------------------------------------
  //
  // ДВА РАЗНЫХ ВОПРОСА, И ИХ НЕЛЬЗЯ ПУТАТЬ. `isPressStep` отвечает «шаг ЕСТЬ ВТО», из чего следует
  // ОБЯЗАТЕЛЬНОСТЬ пикера оборудования, — и печать в этот список намеренно не входит.
  // `ownsBlock('pressSettings')` отвечает «шагу МОЖНО дать настройки пресса»: термотрансфер
  // прижимают температурой, выдержкой и силиконовой бумагой, не будучи ВТО-шагом. Ниже стоит
  // второй — и стоит ВЕЗДЕ, где спрашивают про ВТО-поля: рендер блока «pressing mode», счётчик
  // створки и очистка скрытого. Разойдись хоть один — и получится либо факт печатного шага,
  // стёртый при первом же открытии, либо контрол, чьё значение выбрасывает маппер.
  //
  // ГРАВИРОВКА В ЭТОТ ГЕЙТ НЕ ДОПИСАНА, И ЭТО РЕШЕНИЕ, А НЕ ЗАБЫВЧИВОСТЬ. Схема отвергает все
  // семь ВТО-полей при `laser_engrave` — у лазера нет ни носителя, ни плиты, — но отказ она ставит
  // НА КАЖДОЕ ПОЛЕ ОТДЕЛЬНО и предлагает два равных выхода: «очисти настройки прижима ИЛИ выбери
  // другой метод печати». Оба требуют, чтобы числа были на экране. Соседний `showPrint` при
  // гравировке гаснет — но гаснет ВМЕСТЕ СО СВОЕЙ ОЧИСТКОЙ, а очистка ВТО-полей стоит на
  // `ownsPressSettings` без метода: погасив здесь один рендер, мы получили бы живые невидимые
  // значения и отказ на контроле, которого нет на экране. Дописать же метод и в очистку значит
  // молча стирать 160 °C, ключ профиля и силиконовую бумагу от одного промаха в селекте метода —
  // после чего второй выход, «верни метод», уже ничего не вернёт. Печать берёт пресс взаймы: она
  // не обязана терять его настройки, пока идёт спор о том, чем наносят.
  const ownsBlock = (b: Parameters<typeof stepTypeOwnsBlock>[1]) => stepTypeOwnsBlock(opType, b);
  const ownsPressSettings = ownsBlock('pressSettings');
  // ЯВНЫЙ тип машины — тот, что назван НА ШАГЕ. Разрешённый через профиль не засчитывается ни
  // здесь, ни в маппере, ни на сервере: профиль можно перенаправить на другую машинку, не тронув
  // ни одного шага, и правило, стоящее на разрешённой лестнице, поменяло бы смысл сохранённых
  // карточек задним числом.
  const onMachine = (...tokens: string[]) => isMachineStep && tokens.includes(machineType);
  const isHardwareStep = opType === 'TECH_CARD_OPERATION_TYPE_HARDWARE_SET';
  const onCycleMachine = onMachine(...CYCLE_MACHINES);
  const isWeldStep = isMachineStep && isWeldMachineType(machineType);
  const isLaserPrint = printMethod === LASER_ENGRAVE;
  // Семейства ровно в том виде, в каком их принимает сервер: гейт глагола И, где он есть, гейт
  // явной машинки. Ими гейтится ВСЁ — рендер, очистка скрытого и счётчик фолда, — потому что три
  // разных ответа на «несёт ли шаг это поле» и есть тот дефект, от которого карточка отказывается
  // сохраняться, показывая ошибку на контроле, которого нет на экране.
  const showStitching = ownsBlock('stitching');
  // ИГЛА И РЯДЫ СТРОЧКИ — НЕ У СВАРОЧНОЙ МАШИНЫ. Собственный гейт S-блока — «это машинный шаг», а
  // сварочная машина машинная; без этой строки открытая зона рисовала на ультразвуке число игл,
  // калибр, закрепку и шаг между рядами — четыре контрола, значения которых уезжают на провод, а
  // сервер отвергает их ПО ИМЕНИ («у сварочной машины нет ни иглы, ни нитки»), отказывая вместе с
  // ними ВСЕЙ карточкой. Дефект был и до пикера, но пикер довёл до него в один клик.
  //
  // ПОСАДКА (`fullnessRatio`) ОСТАЁТСЯ, И ЭТО НЕ НЕДОСМОТР: сервер разрешает её на сварке
  // СОЗНАТЕЛЬНО — посадка есть соотношение длин слоёв при ПОДАЧЕ, свойство подачи, а не иглы, и
  // сварочная машина слои подаёт (у неё на то и `feed_speed_m_min`). Шов этикетки тоже остаётся:
  // машинного гейта у него нет вовсе.
  const showNeedleFacts = showStitching && !isWeldStep;
  const showPlacement = ownsBlock('placement');
  const showHardware = ownsBlock('hardware') && (isHardwareStep || onCycleMachine);
  const showPrint = ownsBlock('print') && !isLaserPrint;
  const showWeld = ownsBlock('weld') && isWeldStep;
  const showTrim = ownsBlock('trim');
  const showThreadTrim = ownsBlock('threadTrim');
  // G — ПОД-ГЛАГОЛ ВТО. Гейт СВОЙ, а не `ownsPressSettings`: тот отвечает «шагу можно дать
  // настройки пресса» и включает дублирование и печать, а под-глагол сервер на них отвергает по
  // имени. И НЕ `isPressStep`: разутюжка — глагол `PRESS_OPEN`, который сам и есть ответ, а
  // второй его записью (`PRESS_OPEN` + `open`) форма родила бы два написания одного факта — два
  // разных кортежа в проекции дайджеста секции. Дублирование сюда не входит по контракту.
  const showPressAction = opType === 'TECH_CARD_OPERATION_TYPE_PRESS';
  // НАПРАВЛЕНИЕ — ТОЛЬКО У «ЗАУТЮЖИТЬ». При остальных приёмах припуск никуда не укладывается:
  // контрол там не «необязателен», он бессмыслен, и сервер отвергает поле по имени.
  const showPressToward = showPressAction && pressAction === PRESS_TO_ONE_SIDE;
  // ПРОРЕЗЬ ОБМЁТЫВАЕТ НЕ ТОЛЬКО ПЕТЕЛЬНЫЙ АВТОМАТ (0331), И СПРАШИВАТЬ ОБ ЭТОМ ОБЯЗАНЫ ОБА ЭТАЖА
  // ГЕЙТА. Владелец просил «прорезь под пояс, обмётанную зигзагом»; 0331 завела такую работу, и на
  // зигзаге ЛОЖЕН был внешний гейт тоже — блока не было вовсе, так что чинить один внутренний
  // `showCutLength` значило бы чинить половину. Список четырёх машинок при этом не тронут: у
  // закрепки, пуговицы и молнии второго входа нет, и расширить их заодно значило бы показать
  // контрол, который сервер отвергает по имени.
  const isSlitOvercast = workValue === SLIT_OVERCAST_WORK;
  const showFastening =
    ownsBlock('fastening') &&
    (isSlitOvercast ||
      onMachine(BUTTONHOLE_MACHINE, BARTACK_MACHINE, BUTTON_ATTACH_MACHINE, ZIPPER_MACHINE));
  // ВТОРОЙ ЭТАЖ ТЕХ ЖЕ ГЕЙТОВ — правила ВНУТРИ семейства, у которых свой контрол. До Ф4 они
  // стояли переписанными в трёх местах (рендер, очистка скрытого, счётчик), и разъезд любых двух
  // давал либо невидимое значение, либо стёртое. Теперь они названы ОДИН раз и читаются всеми:
  // рендером, полосой остатков и счётчиками.
  const showTopstitch =
    isMachineStep ||
    topstitchMode !== NONE_TOPSTITCH ||
    topstitchWidthMm.trim() !== '' ||
    topstitchRows > 0;
  const showTopstitchWidth = showTopstitch && topstitchModeTakesWidth(topstitchMode);
  const showNeedleGauge = showNeedleFacts && needleCount >= 2;
  const showBindingStyle = showStitching && seamClass === BOUND_SEAM_CLASS;
  const showPitch = showPlacement && placementCount >= 2;
  const showFoldback = showHardware && isHardwareStep && attachMethod === THREADED_HARDWARE;
  const showAirTemperature = showWeld && onMachine(SEAM_TAPING);
  const showButtonhole = showFastening && onMachine(BUTTONHOLE_MACHINE);
  // ДЛИНА ПРОРЕЗИ — ЕДИНСТВЕННОЕ ПОЛЕ СЕМЕЙСТВА С ДВУМЯ ВХОДАМИ, и потому у неё СВОЙ гейт, а не
  // общий `showButtonhole`. Дословное зеркало сервера (`workAcceptsCutLength` рядом с
  // `machineIsOneOf(machineButtonhole)`): стиль петли и её направление остаются фактами ПЕТЕЛЬНОЙ
  // МАШИНЫ — сервер отвергает их по имени на любой другой, — а длина описывает саму РАБОТУ, и
  // работа называет её на зигзаге тоже.
  const showCutLength = showFastening && (isSlitOvercast || onMachine(BUTTONHOLE_MACHINE));
  // ЯРЛЫК НАЗЫВАЕТ ТО, ЧТО РЕЖУТ, И ПОЭТОМУ ОН НЕ ОДИН. На шаге прорези «buttonhole cut» — ложь:
  // петли там нет, есть разрез под пояс. У каждого входа своё имя, и общего слова у них не
  // нашлось: «cut length» не говорит НИ ЧЕГО о том, что режут, а поле именно об этом. Подпись
  // читается ещё и полосой остатков — там она обязана быть той же самой, иначе человек ищет на
  // экране слово, которого на нём нет.
  //
  // САМО СЛОВО СЧИТАЕТ `cutLengthNoun`, И СЧИТАЕТ ЕГО ОДИН РАЗ НА КЛИЕНТ. Тернарник, стоявший
  // здесь литералами, был ПЕРВОЙ из двух копий: вторая жила в составителе фраз печатного листа и
  // говорила «buttonhole» всегда, — экран после 0331 звал поле «slit cut», а в цех продолжала
  // уезжать бумага со словом «петля». Общая лестница ещё и добавляет ступень, которой у тернарника
  // быть не могло: работу, КАТАЛОГУ НЕЗНАКОМУЮ (токен новее бандла — обычное состояние между
  // выкаткой бэка и клиента), она называет токеном вместо того, чтобы выдать за петлю.
  const cutLengthLabel = `${cutLengthNoun(workCatalog, workValue)} cut, mm`;
  const showBartack = showFastening && onMachine(BUTTONHOLE_MACHINE, BARTACK_MACHINE);
  const showAttachPattern = showFastening && onMachine(BUTTON_ATTACH_MACHINE);
  const showZipper = showFastening && onMachine(ZIPPER_MACHINE);
  // Обязательный вопрос глагола — один на глагол, и его текущее значение нужно пикеру, чтобы
  // токен новее этого бандла не превратился в пустой триггер (см. stepEnumOptions).
  const stepDiscriminator = STEP_DISCRIMINATORS[opType as common_TechCardOperationType];
  const discriminatorValue = stepDiscriminator
    ? ((
        {
          attachMethod,
          printMethod,
          trimAction,
          cleaningKind,
          coverageMode,
          wetProcessKind,
        } as Record<string, string>
      )[stepDiscriminator.field] ?? '')
    : '';

  // The sewing overrides, counted apart from the equipment ones: a ВТО step has no seam class and
  // no stitch density, so on those steps this half of the fold is hidden — but ONLY while it is
  // empty. A value that exists is shown wherever it is, because a hidden number still prints on the
  // tech pack and still moves the section digest, and the operator is the one who decides it goes.
  //
  // ОТСТРОЧКИ ЗДЕСЬ БОЛЬШЕ НЕТ, И ЭТО НЕ ПОТЕРЯ. Режим, отступ и число рядов уехали в ЗОНУ СВОЙСТВ
  // ВИДА — они стоят на виду, — а эта пилюля считает то, что створка ПРЯЧЕТ, и обязана считать
  // ровно это: «differs from standard: 1» над створкой, в которой нечего смотреть, учит не читать
  // счётчик вовсе.
  const sewingOverrideCount = [
    seamClass !== NONE_SEAM_CLASS,
    seamAllowanceMm.trim() !== '',
    stitchesPerCm.trim() !== '',
    attachmentKind !== NONE_ATTACHMENT,
  ].filter(Boolean).length;
  const equipmentOverrideCount = [
    isMachineStep && !!machineProfileKey.trim(),
    isMachineStep && threadCount > 0,
    isMachineStep && needleType !== NONE_NEEDLE,
    isMachineStep && needleSizeNm > 0,
    isMachineStep && threadTension !== NONE_TENSION,
    isMachineStep && stitchWidthMm.trim() !== '',
    // ВТО-половина — по `ownsPressSettings`, ровно как рендер блока и очистка скрытого: у
    // печатного шага 160 °C и силиконовая бумага лежат в той же створке и прячутся тем же фолдом.
    // Со списком трёх ВТО-глаголов редактор открывал бы печатный шаг с шестью заполненными
    // фактами, показывая «inherits everything» над закрытой створкой, — то же самое, что потерять.
    ownsPressSettings && !!pressProfileKey.trim(),
    ownsPressSettings && pressTemperatureC > 0,
    ownsPressSettings && pressDwellSec > 0,
    ownsPressSettings && pressPressureNCm2.trim() !== '',
    ownsPressSettings && pressSteam !== undefined,
    ownsPressSettings && pressCloth !== NONE_PRESS_CLOTH,
  ].filter(Boolean).length;
  // Шов и плотность прячутся у ВТО-шага — но ТОЛЬКО пока он их не несёт: значение, которое ЕСТЬ,
  // показывается там, где оно есть. Тот же ответ, что у полосы остатков, и потому предикат один.
  const showSewingOverrides = !isPressStep || sewingOverrideCount > 0;
  const showAttachmentSize =
    showSewingOverrides &&
    attachmentKind !== NONE_ATTACHMENT &&
    attachmentKind !== 'TECH_CARD_ATTACHMENT_KIND_NONE';
  // Дискриминатор глагола рисуется РОВНО ОДИН на шаг — тот, что назвала таблица STEP_DISCRIMINATORS.
  // Значит и «показан ли контрол» у всех шести — это один вопрос к ней, а не шесть сравнений
  // глагола, разложенных по коду.
  const showsDiscriminator = (field: string) => stepDiscriminator?.field === field;

  // --- ОДНА ТАБЛИЦА СОСТОЯНИЙ ПОЛЕЙ ШАГА ------------------------------------------------------
  //
  // Каждая строка отвечает на два вопроса сразу: ПОКАЗАН ЛИ контрол этого поля (тот же предикат,
  // что рисует блок) и ЗАПОЛНЕНО ЛИ значение. Из одной таблицы выводятся ОБА потребителя:
  //   • пилюля зоны свойств — сколько фактов вида НАЗВАНО (показано И заполнено);
  //   • полоса остатков — что заполнено, но НЕ показано.
  // Второй список полей здесь был бы пятой копией правил и разъехался бы с первым молча — ровно
  // на новом поле следующей волны, которое допишут в одно место из двух.
  //
  // ТРИ ДИСЦИПЛИНЫ ПУСТОТЫ НЕ СМЕШИВАЮТСЯ (`discipline`): у enum'а пусто это токен `*_UNKNOWN`, у
  // целого — 0, у децимала — пустая строка. Различающий тег нужен не для красоты: по нему
  // `clearResidueField` выбирает, ЧЕМ стереть поле, и поле, переехавшее из одной дисциплины в
  // другую, роняет сборку здесь, а не пишет '' в int.
  //
  // ШЕСТЬ ДИСКРИМИНАТОРОВ ГЛАГОЛА (`kind: false`) в пилюлю не входят — они стоят в ядре сетки
  // рядом с пикером вида, — но в таблице ЕСТЬ: на чужом глаголе они такие же остатки, как всё
  // прочее, и полоса обязана их показывать.
  const stepFields: StepFieldState[] = [
    enumState('machineType', 'machine', machineType, NONE_MACHINE, machineTypeLabel, isMachineStep),
    keyState('machineProfileKey', 'machine profile', machineProfileKey, isMachineStep),
    intState('threadCount', 'threads', threadCount, isMachineStep),
    enumState('needleType', 'needle point', needleType, NONE_NEEDLE, needleTypeLabel, isMachineStep),
    intState('needleSizeNm', 'needle size, Nm', needleSizeNm, isMachineStep),
    enumState(
      'threadTension',
      'thread tension',
      threadTension,
      NONE_TENSION,
      threadTensionLabel,
      isMachineStep,
    ),
    textState('threadTensionNote', 'tension note', threadTensionNote, isMachineStep),
    textState('stitchWidthMm', 'stitch width, mm', stitchWidthMm, isMachineStep),
    // ПИКЕР ОБОРУДОВАНИЯ СТОИТ НА `isPressStep`, А БЛОК НАСТРОЕК — НА `ownsPressSettings`: у
    // печати настройки пресса есть, а пикера нет (она берёт термопресс взаймы). Здесь стоят оба
    // предиката, каждый на своём поле, — сложить их значило бы либо спрятать чужое, либо
    // объявить остатком то, что человек прямо сейчас редактирует.
    enumState(
      'pressEquipment',
      'equipment',
      pressEquipment,
      NONE_PRESS_EQUIPMENT,
      pressEquipmentLabel,
      isPressStep,
    ),
    keyState('pressProfileKey', 'press profile', pressProfileKey, ownsPressSettings),
    intState('pressTemperatureC', 'temperature, °C', pressTemperatureC, ownsPressSettings),
    intState('pressDwellSec', 'dwell, sec', pressDwellSec, ownsPressSettings),
    textState('pressPressureNCm2', 'pressure, N/cm²', pressPressureNCm2, ownsPressSettings),
    steamState(pressSteam, ownsPressSettings),
    enumState(
      'pressCloth',
      'press cloth',
      pressCloth,
      NONE_PRESS_CLOTH,
      pressClothLabel,
      ownsPressSettings,
    ),
    textState('attachmentSizeMm', 'attachment size, mm', attachmentSizeMm, showAttachmentSize),
    // ШОВ И ПЛОТНОСТЬ (ревью шва Ф4+Ф5+Ф7). Четвёрка «seam & stitch» прячется у ВТО-шага, пока он
    // её не несёт, — но отказ сервера бывает и на ПУСТОМ её поле: пара Ф3 «режим отстрочки ↔ класс
    // шва» отвечает `seam_class: required` на шаг, где режим остался, а класс не назван. Вне этой
    // таблицы такой отказ был невидим: контрола нет, остатка нет (поле пустое), а створке его
    // чинить нечем. Строкой ОСТАТКА четвёрка не бывает по построению — любое её заполненное
    // значение само открывает секцию (`showSewingOverrides`), — поэтому здесь она даёт только
    // catch-строки.
    enumState('seamClass', 'seam class', seamClass, NONE_SEAM_CLASS, seamClassText, showSewingOverrides),
    textState('seamAllowanceMm', 'seam allowance, mm', seamAllowanceMm, showSewingOverrides),
    textState('stitchesPerCm', 'stitches / cm', stitchesPerCm, showSewingOverrides),
    enumState(
      'attachmentKind',
      'attachment',
      attachmentKind,
      NONE_ATTACHMENT,
      attachmentKindLabel,
      showSewingOverrides,
    ),
    // отстрочка
    enumState(
      'topstitchMode',
      'topstitch',
      topstitchMode,
      NONE_TOPSTITCH,
      topstitchModeText,
      showTopstitch,
    ),
    textState(
      'topstitchWidthMm',
      topstitchWidthLabel(topstitchMode),
      topstitchWidthMm,
      showTopstitchWidth,
    ),
    intState('topstitchRows', 'rows of topstitching', topstitchRows, showTopstitchWidth),
    // S — строчка
    intState('needleCount', 'needles', needleCount, showNeedleFacts),
    textState('needleGaugeMm', 'gauge between needles, mm', needleGaugeMm, showNeedleGauge),
    enumState(
      'seamSecuring',
      'securing',
      seamSecuring,
      NONE_SEAM_SECURING,
      seamSecuringLabel,
      showNeedleFacts,
    ),
    textState('rowSpacingMm', 'spacing between stitch rows, mm', rowSpacingMm, showNeedleFacts),
    textState('fullnessRatio', 'ease / gathering, ratio', fullnessRatio, showStitching),
    enumState(
      'bindingStyle',
      'binding fold',
      bindingStyle,
      NONE_BINDING_STYLE,
      bindingStyleLabel,
      showBindingStyle,
    ),
    enumState(
      'labelAttachStitch',
      'label stitched',
      labelAttachStitch,
      NONE_LABEL_ATTACH,
      labelAttachStitchLabel,
      showStitching,
    ),
    // PL — повторы
    intState('placementCount', 'repeats', placementCount, showPlacement),
    textState('pitchMm', 'pitch, mm', pitchMm, showPitch),
    // H — фурнитура
    enumState(
      'attachMethod',
      'held on by',
      attachMethod,
      NONE_ATTACH_METHOD,
      hardwareAttachMethodLabel,
      showsDiscriminator('attachMethod'),
    ),
    enumState('holePrep', 'hole prep', holePrep, NONE_HOLE_PREP, holePrepLabel, showHardware),
    enumState(
      'reinforcement',
      'reinforcement',
      reinforcement,
      NONE_REINFORCEMENT,
      reinforcementLabel,
      showHardware,
    ),
    intState('cycleStitchCount', 'cycle stitches', cycleStitchCount, showHardware),
    textState('foldbackMm', 'webbing foldback, mm', foldbackMm, showFoldback),
    // P — печать
    enumState(
      'printMethod',
      'print method',
      printMethod,
      NONE_PRINT_METHOD,
      printMethodLabel,
      showsDiscriminator('printMethod'),
    ),
    enumState('peelMode', 'peel', peelMode, NONE_PEEL_MODE, peelModeLabel, showPrint),
    intState('secondPressSec', 'second press, sec', secondPressSec, showPrint),
    // W — сварка
    intState('airTemperatureC', 'hot air, °C', airTemperatureC, showAirTemperature),
    textState('feedSpeedMMin', 'feed speed, m/min', feedSpeedMMin, showWeld),
    // T / F / C / Q / WP
    enumState(
      'trimAction',
      'cut',
      trimAction,
      NONE_TRIM_ACTION,
      trimActionLabel,
      showsDiscriminator('trimAction'),
    ),
    textState('residualAllowanceMm', 'allowance left, mm', residualAllowanceMm, showTrim),
    textState('residualTailMaxMm', 'longest tail, mm', residualTailMaxMm, showThreadTrim),
    enumState(
      'cleaningKind',
      'clean off',
      cleaningKind,
      NONE_CLEANING_KIND,
      cleaningKindLabel,
      showsDiscriminator('cleaningKind'),
    ),
    enumState(
      'coverageMode',
      'coverage',
      coverageMode,
      NONE_COVERAGE_MODE,
      inspectCoverageLabel,
      showsDiscriminator('coverageMode'),
    ),
    enumState(
      'wetProcessKind',
      'bath',
      wetProcessKind,
      NONE_WET_PROCESS,
      wetProcessKindLabel,
      showsDiscriminator('wetProcessKind'),
    ),
    // FA — петли, закрепки, пуговицы, молнии
    enumState(
      'buttonholeStyle',
      'buttonhole shape',
      buttonholeStyle,
      NONE_BUTTONHOLE_STYLE,
      itemLabel(BUTTONHOLE_STYLE_ITEMS),
      showButtonhole,
    ),
    textState('cutLengthMm', cutLengthLabel, cutLengthMm, showCutLength),
    enumState(
      'buttonholeOrientation',
      'buttonhole direction',
      buttonholeOrientation,
      NONE_BUTTONHOLE_ORIENTATION,
      itemLabel(BUTTONHOLE_ORIENTATION_ITEMS),
      showButtonhole,
    ),
    textState('bartackLengthMm', 'bartack length, mm', bartackLengthMm, showBartack),
    enumState(
      'attachPattern',
      'button pattern',
      attachPattern,
      NONE_ATTACH_PATTERN,
      buttonAttachPatternLabel,
      showAttachPattern,
    ),
    enumState(
      'zipperApplication',
      'zip application',
      zipperApplication,
      NONE_ZIPPER_APPLICATION,
      zipperApplicationLabel,
      showZipper,
    ),
    // G — ВТО
    enumState(
      'pressAction',
      'press action',
      pressAction,
      NONE_PRESS_ACTION,
      pressActionLabel,
      showPressAction,
    ),
    enumState(
      'pressToward',
      'allowance goes',
      pressToward,
      NONE_PRESS_TOWARD,
      pressTowardLabel,
      showPressToward,
    ),
  ];
  // СКОЛЬКО СВОЙСТВ ВИДА УЖЕ НАЗВАНО — пилюля ЗОНЫ СВОЙСТВ, а не створки. До пикера эти факты
  // лежали в створке и накручивали её счётчик; теперь они стоят на виду, и складывать их с
  // «differs from standard» значило бы обещать во створке то, чего в ней нет.
  //
  // ШЕСТЬ ДИСКРИМИНАТОРОВ СЮДА НЕ ВХОДЯТ: они стоят в ядре сетки, рядом с пикером вида.
  //
  // Гейт — те же `show*`, что у рендера: непоказанный факт чужого семейства не имеет права
  // считаться. Он не исчезает — он переезжает в полосу остатков строкой ниже.
  const kindFactCount = stepFields.filter((f) => f.kind && f.shown && f.filled).length;
  // ЧТО ИЗ ЭТОГО СЕЙЧАС НА ЭКРАНЕ. Поля, которых в таблице нет вовсе, — ядро сетки (глагол, зона,
  // время, выноска, note) и ссылки: они на экране всегда, и их отказ ложится на свой контрол.
  const mountedByTable = new Map(stepFields.map((f) => [f.field as string, f.shown]));
  const overrideCount = sewingOverrideCount + equipmentOverrideCount;
  // ЕСТЬ ЛИ У ЗОНЫ СВОЙСТВ ЧТО ПОКАЗАТЬ. Считается по ТЕМ ЖЕ предикатам, что рисуют блоки: список
  // блоков пункта на этот вопрос не ответит — у чистки и контроля он не пуст, а единственное их
  // поле стоит в ядре сетки рядом с пикером, и «ничего не названо» над пустым местом было бы
  // неправдой в обе стороны сразу.
  const kindHasControls =
    showTopstitch ||
    showStitching ||
    showPlacement ||
    showHardware ||
    showPrint ||
    showWeld ||
    showTrim ||
    showThreadTrim ||
    showPressAction;
  const [overridesOpen, setOverridesOpen] = useState(overrideCount > 0);

  // AND IT OPENS ITSELF ON AN ERROR. Nearly every field in the fold can now fail a check — a thread
  // count out of band, a tension note without its scale, a density that would not fit the column —
  // and a blocking error behind a closed disclosure is a save button that stops working with
  // nothing on screen to fix: the error router focuses a control that is not rendered. The core
  // grid's own fields are always visible, so they are excluded and the panel stays shut for them.
  const { errors: formErrors } = useFormState({ control, name: `operations.${index}` });
  const stepErrors = (
    formErrors.operations as unknown as Array<Record<string, unknown> | undefined> | undefined
  )?.[index];
  // СТВОРКА РАСКРЫВАЕТСЯ НА ОШИБКЕ — но только на такой, которую в ней МОЖНО ПОЧИНИТЬ. Отказ на
  // поле, чей контрол не смонтирован вовсе, живёт в полосе остатков; раскрыв ради него створку,
  // редактор показал бы пустую красную панель и увёл человека от единственного места, где у него
  // есть [clear].
  const hasFoldedError =
    !!stepErrors &&
    Object.keys(stepErrors).some(
      (field) => !CORE_STEP_FIELDS.has(field) && mountedByTable.get(field) !== false,
    );
  const errorAt = (field: string): string | undefined => {
    const node = (stepErrors as Record<string, { message?: unknown }> | undefined)?.[field];
    const message = node?.message;
    return typeof message === 'string' ? message : node ? '' : undefined;
  };

  // --- ПОЛОСА ОСТАТКОВ: ЗАПОЛНЕННОЕ, КОТОРОГО ЭТОТ ШАГ НЕ НЕСЁТ ------------------------------
  //
  // Инверсия таблицы состояний, и ничего сверх неё: строка = заполнено И контрол не показан.
  // Второй таблицы полей здесь нет и быть не должно — она разъехалась бы с первой молча.
  const residueRows: ResidueRow[] = stepFields
    .filter((f) => f.filled && !f.shown)
    .map((f) => ({
      field: f.field,
      path: `operations.${index}.${f.field}`,
      label: f.label,
      value: f.text,
      error: errorAt(f.field),
    }));

  // ВТОРОЙ РОД СТРОК — ОТКАЗ БЕЗ ЗНАЧЕНИЯ И БЕЗ КОНТРОЛА, и без него полоса не закрывает дыру.
  // Случай приносит строгий разбор отстрочки на сервере: ширина задана, режим — нет, сервер
  // отвечает `topstitch_mode: required`. Остатка нет (поле пустое), контрола может не быть — и
  // отказ снова оказался бы невидимым, то есть карточка снова перестала бы сохраняться молча.
  //
  // ПОЛЯ, КОТОРЫХ НЕТ В ТАБЛИЦЕ, СЧИТАЮТСЯ СМОНТИРОВАННЫМИ: это ядро сетки (глагол, зона, время,
  // выноска, note) и ссылки — они на экране всегда, и их отказ ложится на собственный контрол.
  const residueErrorRows: ResidueErrorRow[] = Object.keys(stepErrors ?? {})
    .filter((field) => mountedByTable.get(field) === false)
    .filter((field) => !residueRows.some((r) => r.field === field))
    .map((field) => ({
      field,
      path: `operations.${index}.${field}`,
      label: stepFields.find((f) => f.field === field)?.label ?? field,
      // Отказ без слов — редкость (и zod, и сервер всегда присылают текст), но строка обязана
      // остаться видимой: отказ, о котором нечего сказать, всё равно блокирует сохранение.
      error: errorAt(field) || 'this field was refused',
    }));

  // [CLEAR] — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ФОРМА СТИРАЕТ ЗНАЧЕНИЕ ШАГА, и жест здесь человеческий.
  // Три дисциплины пустоты разведены тегом, а не одним `as never`: поле, переехавшее из одной
  // дисциплины в другую, обязано ронять сборку здесь, а не писать '' в int.
  const clearResidueField = (field: string) => {
    const row = stepFields.find((f) => f.field === field);
    if (!row) return;
    const p = `operations.${index}` as const;
    if (row.discipline === 'enum') setValue(`${p}.${row.field}`, row.none, { shouldDirty: true });
    else if (row.discipline === 'text') setValue(`${p}.${row.field}`, '', { shouldDirty: true });
    else if (row.discipline === 'int') setValue(`${p}.${row.field}`, 0, { shouldDirty: true });
    else setValue(`${p}.${row.field}`, undefined, { shouldDirty: true });
  };

  // ЗДЕСЬ СТОЯЛИ ЧЕТЫРЕ ЭФФЕКТА ОЧИСТКИ, И ИХ БОЛЬШЕ НЕТ.
  //
  // Они писали пустоту в поля чужого семейства с `shouldDirty` — на МОНТИРОВАНИИ, то есть от
  // одного открытия карточки, до всякого человеческого жеста. Довод у них был верный («сервер
  // отвергает поле чужого семейства по имени, а контрола на экране уже нет»), а лечение —
  // обратное: вместо того чтобы ПОКАЗАТЬ значение, они его СТИРАЛИ. Технолог переключал глагол
  // шага и терял тридцать шесть возможных фактов, не увидев ни одного из них ни разу.
  //
  // Их предикаты никуда не делись — они и были правильной половиной. Все до одного стоят выше,
  // в таблице `stepFields`, и решают ровно один вопрос: показать поле контролом ИЛИ строкой
  // остатка. Стирает теперь только человек, и только через [clear].

  // --- the card's equipment park, and what this step inherits from it ---------------------------
  const parkMachines = (useWatch({
    control,
    name: 'construction.equipmentDefaults.machines',
  }) ?? []) as MachineProfileRow[];
  const parkPresses = (useWatch({
    control,
    name: 'construction.equipmentDefaults.presses',
  }) ?? []) as PressProfileRow[];

  // ССЫЛКА НА ПРОФИЛЬ ЧУЖОГО ТИПА ТОЖЕ БОЛЬШЕ НЕ СНИМАЕТСЯ САМА, и это та же порода, что четыре
  // эффекта выше. Комментарий, стоявший здесь, сам называл довод: «профиль неверного типа сервер
  // ОТВЕРГАЕТ». Отвергает — значит скажет об этом ИМЕНЕМ поля, а пикер профиля на своём шаге
  // рендерится всегда, то есть отказу есть куда лечь. Путь достижим с провода без единой правки:
  // карточка сохранена → тип профиля поменяли в парке → открытие карточки стирало ссылку с
  // `shouldDirty` ещё до того, как кто-нибудь её увидел.
  //
  // ЦЕНА НАЗВАНА ВСЛУХ: сменив тип машинки руками, устаревшую ссылку теперь снимает человек — сам
  // или по подсказке серверного отказа. Это ровно тот обмен, ради которого делалась вся фаза:
  // лишний жест вместо молчаливой потери.

  // WHAT THIS STEP WOULD INHERIT, and from where — shown as a placeholder, stored nowhere. The
  // card's own standard wins over the workshop's, exactly as the server resolves it.
  const cardAllowanceMm = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? '') as string;
  const cardStitchDensity = (useWatch({ control, name: 'construction.defaultStitchesPerCm' }) ??
    '') as string;
  const { data: workshop } = useWorkshopSettings();
  const shopAllowanceMm = decimalToInput(workshop?.settings?.defaultSeamAllowanceMm).trim();

  // The profile this step resolves to, by the ladder in §3 (key → the single profile of its type →
  // nothing). `machineProfile` is what every machine placeholder quotes, and the ONE thing that
  // makes a blank field readable: «4 (оверлок у окна)» says the step will be sewn with four threads
  // and where that four came from, where an empty box says only that nobody typed anything.
  const machineProfile = isMachineStep
    ? resolveMachineProfile(parkMachines, machineType, machineProfileKey)
    : undefined;
  // И ЗДЕСЬ ТОТ ЖЕ ВОПРОС, ЧТО У ПЕЧАТНОГО ЛИСТА (`ownsPress` в tech-pack-document): шаг, которому
  // МОЖНО дать настройки пресса, наследует их по той же лестнице. Со списком трёх ВТО-глаголов
  // печатный шаг, пришедший с ВТО (глагол переключили, оборудование и ключ остались), показывал бы
  // выбранный профиль в пикере, «no profile» в заголовке над ним и пустые плейсхолдеры — при том
  // что бумага печатала бы унаследованные 160 °C. Процесс профиля лестницу по-прежнему сужает:
  // профиль, написанный для дублирования, печати не отвечает, универсальный — отвечает.
  const pressProfile = ownsPressSettings
    ? resolvePressProfile(parkPresses, pressEquipment, pressProfileKey, opType)
    : undefined;
  const machineSource = machineProfile ? machineProfileName(machineProfile) : '';
  const pressSource = pressProfile ? pressProfileName(pressProfile) : '';
  const fromMachine = (v: string | number | undefined) =>
    machineProfile && v !== undefined && v !== '' && v !== 0
      ? inheritedText(String(v), machineSource)
      : '';
  const fromPress = (v: string | number | undefined) =>
    pressProfile && v !== undefined && v !== '' && v !== 0
      ? inheritedText(String(v), pressSource)
      : '';

  // The density is the one setting with a rung on BOTH ladders: the machine's profile answers it
  // first (it belongs to the machine this step runs on), the card default answers for everything
  // with no machine of its own. Resolved once, as a number and a source, because it is shown twice —
  // once as st/cm and once as the length in mm, and the two must agree about where they came from.
  const inheritedDensity = machineProfile?.stitchesPerCm?.trim()
    ? { value: machineProfile.stitchesPerCm.trim(), source: machineSource }
    : cardStitchDensity.trim()
      ? { value: cardStitchDensity.trim(), source: 'card' }
      : { value: '', source: '' };
  const inheritedDensityLengthMm = stitchLengthMm(inheritedDensity.value);

  const inherited = {
    seamAllowance: cardAllowanceMm.trim()
      ? `${cardAllowanceMm.trim()} (card)`
      : shopAllowanceMm
        ? `${shopAllowanceMm} (workshop)`
        : NOT_SET,
    stitchDensity: inheritedDensity.value
      ? inheritedText(inheritedDensity.value, inheritedDensity.source)
      : NOT_SET,
    // The same inherited fact in the other unit. Computed, never stored — see StitchLengthMirror.
    stitchLength: inheritedDensityLengthMm
      ? inheritedText(inheritedDensityLengthMm, inheritedDensity.source)
      : NOT_SET,
    threadCount: fromMachine(machineProfile?.threadCount) || NOT_SET,
    needleType: fromMachine(needleTypeLabel(machineProfile?.needleType)) || NOT_SET,
    needleSizeNm: fromMachine(machineProfile?.needleSizeNm) || NOT_SET,
    threadTension: fromMachine(threadTensionLabel(machineProfile?.threadTension)) || NOT_SET,
    stitchWidthMm: fromMachine(machineProfile?.stitchWidthMm?.trim()) || NOT_SET,
    attachment: fromMachine(attachmentKindLabel(machineProfile?.attachmentKind)) || NOT_SET,
    pressTemperatureC: fromPress(pressProfile?.pressTemperatureC) || NOT_SET,
    pressDwellSec: fromPress(pressProfile?.pressDwellSec) || NOT_SET,
    pressPressureNCm2: fromPress(pressProfile?.pressPressureNCm2?.trim()) || NOT_SET,
    // A tri-state read as a sentence: `false` is «press it dry», an answer, and printing it as
    // «not set» would hide the one instruction the profile was written to give.
    pressSteam:
      pressProfile && pressProfile.pressSteam !== undefined
        ? inheritedText(pressProfile.pressSteam ? 'with steam' : 'dry', pressSource)
        : NOT_SET,
    pressCloth: fromPress(pressClothLabel(pressProfile?.pressCloth)) || NOT_SET,
  };

  // The off-part materials this operation consumes. Multi, because one operation genuinely joins
  // several — «втачать молнию» takes the zip AND the thread. Scoped to the sections that can be
  // consumed BY a step (see OPERATION_LINKABLE_SECTIONS), sorted into that same order so фурнитура
  // leads and the list reads as a spec rather than as the BOM's own ordering.
  const selectedBomKeys = (useWatch({
    control,
    name: `operations.${index}.bomLineKeys`,
  }) ?? []) as string[];
  const linkableBoms = useMemo(
    () =>
      bomLines
        .filter((b) => LINKABLE_SECTION_INDEX.has(b.section ?? ''))
        .sort(
          (a, b) =>
            (LINKABLE_SECTION_INDEX.get(a.section ?? '') ?? 0) -
            (LINKABLE_SECTION_INDEX.get(b.section ?? '') ?? 0),
        ),
    [bomLines],
  );
  // The BOM thread list that used to live here fed a «нитки (артикул)» combo. Both are gone: the
  // thread an operation consumes IS the material chip, and the combo was a second answer that the
  // printed sheet then had to subtract from the first.
  const toggleBom = (key: string) => {
    const next = selectedBomKeys.includes(key)
      ? selectedBomKeys.filter((k) => k !== key)
      : [...selectedBomKeys, key];
    setValue(`operations.${index}.bomLineKeys`, next, { shouldDirty: true });
  };

  // --- ВИД ОПЕРАЦИИ: ОДИН СПИСОК ВМЕСТО ДВУХ ОСЕЙ -----------------------------------------------
  //
  // ВИД НИГДЕ НЕ ХРАНИТСЯ, И ЭТО ГЛАВНОЕ. Он ВЫЧИСЛЯЕТСЯ из тех же сохранённых полей (`kindOf`), а
  // выбор пункта пишет ровно эти поля. Колонка «вид» на шаге стала бы теневым значением к паре
  // осей, и первая же правка машинки рассинхронизировала бы их молча.
  //
  // ВИДЫ СТРОК BOM НУЖНЫ РЕЗОЛВУ: у кнопки, хольнитена и люверса ОДИН глагол и ОДИН метод
  // (`HARDWARE_SET` + `press_set`), различает их «что ставим» — то есть `kind` привязанной строки.
  const stepBomKinds = useMemo(
    () =>
      selectedBomKeys
        .map((k) => bomLines.find((b) => b.lineKey === k)?.kind ?? '')
        .filter(Boolean),
    [selectedBomKeys, bomLines],
  );
  const resolvedKind = kindOf({
    operationType: opType,
    machineType,
    seamClass,
    attachMethod,
    coverageMode,
    labelAttachStitch,
    // ПОД-ГЛАГОЛ ВТО — ЧАСТЬ ЗАПИСИ, ПО КОТОРОЙ ОПОЗНАЁТСЯ ПУНКТ (0325). Без него семь ВТО-пунктов
    // читались бы одним «Press flat»: выбрал «Steam» — заголовок сказал бы «приутюжить».
    pressAction,
    bomKinds: stepBomKinds,
  });

  // ПАМЯТЬ О ВЫБРАННОМ ПУНКТЕ — НА ОДИН СЕАНС РЕДАКТОРА И ТОЛЬКО ДО ОБЩЕГО РОДИТЕЛЯ.
  //
  // У четырёх пунктов запись сама по себе их не опознаёт: кнопку от хольнитена отличает `kind`
  // привязанной строки BOM, «пришить этикетку» от «стачать» — заполненный шов этикетки. Пока
  // различающий факт не назван, резолв честно отвечает общим пунктом (`pendingResolve`) — сказать
  // «Snap» ему неоткуда. Показывать в этот момент общий пункт вместо только что выбранного значило
  // бы переигрывать выбор человека у него на глазах. Память гаснет, как только состояние перестаёт
  // соответствовать и пункту, и его родителю: дальше правит уже не пикер, а данные.
  const [pickedKindId, setPickedKindId] = useState('');
  // ЧТО ПОДСТАВИЛ ВЫБОР РАБОТЫ — СПИСКОМ, ДЛЯ МЕТКИ ПОД ПИКЕРОМ. Держится на один сеанс редактора:
  // значения записаны человеческим жестом и живут дальше сами, метка лишь объясняет их
  // происхождение и даёт снять. Этим она и отличается от подстановки выводимости ниже, которая
  // ВЛАДЕЕТ значением и отзывает его на размонтировании.
  const [prefilled, setPrefilled] = useState<
    Array<StepDefaultFill & { fromStep: number; workLabel: string }>
  >([]);
  const pickedKind = pickedKindId ? OPERATION_KIND_BY_ID.get(pickedKindId) : undefined;
  const derivedKind =
    pickedKind &&
    resolvedKind &&
    (pickedKind.id === resolvedKind.id || pickedKind.pendingResolve === resolvedKind.id)
      ? pickedKind
      : resolvedKind;

  // --- ОСЬ «РАБОТА»: ХРАНИМАЯ, СТРОКОЙ-ТОКЕНОМ (0330) ------------------------------------------
  //
  // ДВОЕКОДЬЕ ПЕРЕХОДНОГО ПЕРИОДА, И ОНО ЗДЕСЬ ЯВНОЕ. Строка, у которой работа НАЗВАНА, живёт по
  // ней; строка без работы — по прежней деривации из пары (глагол, машинка), как жила годы. Сто
  // прод-строк свалки размечает человек, автоматического переписывания нет ни на одной стороне,
  // поэтому оба пути обязаны работать одновременно — и будут, пока владелец не доразметит.
  //
  // САМО ЗНАЧЕНИЕ (`workValue`) И КАТАЛОГ (`workCatalog`) ПРОЧИТАНЫ ВЫШЕ, в кластере `useWatch`:
  // с 0331 токен спрашивают гейты полей, а с R8 каталог спрашивает ещё и ЯРЛЫК длины прорези, —
  // и то и другое стоит раньше по телу компонента. Здесь остаётся только то, что нужно ПИКЕРУ.
  const activeWork = workValue ? workCatalog.byToken.get(workValue) : undefined;
  // ПУНКТ, ОТВЕЧАЮЩИЙ ЭТОЙ РАБОТЕ, — только для ПРЕДСТАВЛЕНИЯ: суженный список «на чём», порядок
  // материалов, указатель «где факты живут на самом деле». У четырёх работ 0331 пункта нет вовсе
  // (их личность — глагол с машинкой, и она уже записана), и тогда представление берётся у старой
  // деривации: она отвечает по той же записи и потому не может противоречить ей.
  const workKind = workValue ? KIND_BY_WORK_TOKEN.get(workValue) : undefined;
  const activeKind = workKind ?? derivedKind;

  /**
   * ЧТО СТОИТ В ПИКЕРЕ. Три состояния, и все три — правда о записи:
   *   * работа названа и каталог её знает — ЕЁ ярлык (каталог авторитетен, не бандл);
   *   * работа названа, а каталога с ней нет (токен новее бандла, отказ сети) — САМ ТОКЕН, с
   *     припиской. Пустой триггер читался бы как «вид не назван», то есть как враньё о записи, —
   *     та же защитная форма, что у машинки и глагола;
   *   * работы нет — имя, выведенное из записи по-старому, и подпись под пикером говорит, что оно
   *     выведено, а не сохранено.
   *
   * РЕШЕНИЕ БЕРЁТСЯ У `workNaming`, А НЕ ПОВТОРЯЕТСЯ ЗДЕСЬ (R8): ту же лестницу спрашивает
   * `operationHeading`, и разойтись им нечем. Своё у триггера ровно одно — ПРИПИСКА к незнакомому
   * токену: заголовок печатает голый токен (в цеху приписке не место), а пикер обязан назвать
   * причину. Разное оформление одного решения, а не второе решение.
   */
  const workNamed = workNaming(workCatalog, workValue);
  const workLabel =
    workNamed.kind === 'catalog'
      ? workNamed.text
      : workNamed.kind === 'token'
        ? `${workNamed.text} — ${workNamed.live ? 'unknown to this app version' : 'not named yet'}`
        : derivedKind
          ? kindLabelOf(derivedKind)
          : '';

  /**
   * СУЖЕННЫЙ СПИСОК «НА ЧЁМ» — ИЗ КАТАЛОГА, КОГДА РАБОТА НАЗВАНА, и из пункта бандла, когда нет.
   *
   * Порядок именно такой: у работы, которой этот бандл не знает (0331 завела `slit_overcast` на
   * зигзаге ИЛИ петельном), суженного списка в бандле нет вовсе, а вопрос «на чём» она задаёт.
   * Пустой ответ каталога — не «список не сужен», а «сужать нечем»: тогда показывается полный
   * список, и это шире, а не у́же, — потерять ответ человека такое сужение не может.
   */
  const askedMachines: string[] | undefined = activeWork
    ? activeWork.machineMode === 'ask'
      ? activeWork.machines.map(machineTokenToEnum)
      : undefined
    : activeKind?.askMachine
      ? (activeKind.askMachine as readonly string[]).slice()
      : undefined;

  /**
   * СТРОКИ ПИКЕРА — ОТ КАТАЛОГА, ГРУППАМИ, С ПОИСКОМ ПО СИНОНИМАМ.
   *
   * Промах поиска ≠ пустота: фильтр отдаёт группы, примитив рисует строку «nothing matches …».
   * Снятая (retired) работа не предлагается — но если она СТОИТ на шаге, её ярлык всё равно виден
   * в триггере: строка, уже размеченная этим токеном, обязана открываться своим именем.
   */
  const filterWorks = useCallback(
    (query: string): ComboboxGroup[] => {
      const groups = groupWorks(searchWorks(workCatalog, query)).map((g) => ({
        key: g.key,
        label: g.label,
        // СТРОКА НЕСЁТ ТОЛЬКО ИМЯ РАБОТЫ. Приписка «спросит машинку» стояла здесь и была снята:
        // ответ на «на чём» и так стоит соседним контролом раскрытым, а лишнее слово в строке
        // делает имя работы неточным и к поиску глазами, и к сравнению текстом.
        options: g.items.map((w) => ({ value: w.token, label: w.label })),
      }));
      // «Снять вид» стоит ПЕРВОЙ строкой и только тогда, когда снимать есть что. На осведомлённой
      // записи пустая работа — человеческий жест, исполняемый буквально; поэтому жест обязан
      // существовать на экране, а не только в контракте.
      if (workValue && !query.trim()) {
        return [
          { key: '__unset__', label: 'this step', options: [{ value: '', label: '— no kind —' }] },
          ...groups,
        ];
      }
      return groups;
    },
    [workCatalog, workValue],
  );

  /**
   * ВЫБОР ПУНКТА — ЗАПИСЬ, А НЕ НАСЛЕДОВАНИЕ, и различие это принципиально. Глагол, машинка, класс
   * шва у отстрочки и дискриминатор — это ВЫБОР ТЕХНОЛОГА, сделанный одним кликом, и он уезжает в
   * строку шага. Значения, которые пришли бы из парка или карточных дефолтов, не пишутся никогда:
   * иначе «технолог выбрал 4 ст/см» перестанет отличаться от «так вышло».
   *
   * СМЕНА ВИДА НИЧЕГО НЕ СТИРАЕТ — то же правило, что у смены глагола. Промах мышью по списку не
   * должен стоить заполненного шага; лишнее уберёт та же очистка скрытого, что и раньше, и уберёт
   * ровно по гейту сервера, а не по короткому списку пункта.
   *
   * ЕДИНСТВЕННОЕ ИСКЛЮЧЕНИЕ — ЯКОРЬ, КОТОРЫЙ ПИКЕР САМ И ПОСТАВИЛ (`kindClears`, ниже по телу).
   * Без него правило оборачивалось против себя: оставшийся `seam_class` перехватывал резолв, и
   * пять пунктов не брались ВОВСЕ — то есть выбор человека стирался целиком ради поля, которое
   * человек не заполнял.
   */
  const applyWork = (token: string) => {
    const p = `operations.${index}` as const;
    // «СНЯТЬ ВИД» — ОДНА ЗАПИСЬ И БОЛЬШЕ НИЧЕГО. Ни глагол, ни машинка, ни одно свойство не
    // трогаются: человек сказал «эта работа названа неправильно», а не «этот шаг стал другим».
    // Строка немедленно возвращается на прежнюю деривацию — то самое двоекодье.
    if (!token) {
      setPickedKindId('');
      setPrefilled([]);
      setValue(`${p}.work`, '', { shouldDirty: true });
      return;
    }
    const item = workCatalog.byToken.get(token);
    if (!item) return;
    const k = KIND_BY_WORK_TOKEN.get(token);
    setPickedKindId(k?.id ?? '');

    // РАБОТА ПИШЕТСЯ ПЕРВОЙ И ВСЕГДА — даже когда пункта у неё нет вовсе (0331). Это идентичность
    // шага, ради которой фаза и заведена: без неё сто lockstitch-строк снова становятся
    // неотличимыми, а сервер снова не может повесить на работу ни одного правила.
    setValue(`${p}.work`, token, { shouldDirty: true });

    // «НА ЧЁМ», КОГДА РАБОТА ЖИВЁТ НА НЕСКОЛЬКИХ МАШИНКАХ. Машинку шаг MACHINE обязан нести —
    // сервер отвергает MACHINE без неё, — поэтому работа её ставит, но не угадывает молча:
    // стоящая на шаге и подходящая важнее всего (смена вида не переставляет шаг на другую
    // машину), затем единственная подходящая в парке, затем дефолт работы. Список допустимых —
    // ИЗ КАТАЛОГА: у работы, которой этот бандл не знает, суженного списка в бандле и нет.
    let machineFromPark = '';
    if (item.machineMode === 'ask') {
      const narrowed = item.machines.map(machineTokenToEnum);
      const fits = parkMachines.filter(
        (m) => narrowed.includes(m.machineType ?? '') && (m.profileKey ?? '').trim(),
      );
      if (fits.length === 1) machineFromPark = fits[0].machineType ?? '';
    }

    const written = workWrites(item, k, machineType, machineFromPark, pressEquipment, kindWrites);
    const writes = Object.entries(written) as Array<[OperationFormStringField, string]>;
    for (const [field, value] of writes) {
      // ИМЯ, КОТОРОГО В СТРОКЕ ФОРМЫ НЕТ, ПРОПУСКАЕТСЯ МОЛЧА. Так `press_action` и дождался
      // своего контракта (0325) — не написав ни разу и не сломав ни одного шага; теперь имя в
      // `emptyOperation` есть, и под-глагол ВТО едет отсюда, без единой правки в этом цикле.
      // Щит остаётся: следующее поле пикера войдёт тем же путём.
      if (!(field in emptyOperation)) continue;
      setValue(`${p}.${field}`, value, { shouldDirty: true });
    }

    // ЯКОРЬ ЧУЖОГО ПУНКТА, ОСТАВШИЙСЯ В ЗАПИСИ, ПЕРЕИГРЫВАЛ ВЫБОР ЧЕЛОВЕКА. Замерено: на шаге
    // `{MACHINE, LOCKSTITCH, seam_class = OS_TOPSTITCH}` пункты «Join — lockstitch», «Coverstitch»,
    // «Chainstitch», «AMF» и «Attach label» не брались вовсе — запись писалась, но резолв снова
    // отвечал «Topstitch» по классу шва, и пикер откатывался. Вид нигде не хранится, поэтому
    // откатывался не только пикер: `kindHeadingVerb` продолжал звать шаг отстрочкой в заголовке,
    // на карте примерки, в подписанном релизе и на печатном листе.
    //
    // Что именно снять, решает `kindClears` — она СПРАШИВАЕТ резолв, а не повторяет его правила, и
    // снимает ровно тот якорь, который пикер сам и пишет как личность другого пункта. Порядок:
    // ПОСЛЕ записи (снятие считается по уже применённому набору) и ДО пресета, который в пустое
    // пишет.
    const after: OperationKindStep = {
      operationType: written.operationType ?? opType,
      machineType: written.machineType ?? machineType,
      seamClass: written.seamClass ?? seamClass,
      attachMethod: written.attachMethod ?? attachMethod,
      coverageMode: written.coverageMode ?? coverageMode,
      labelAttachStitch: written.labelAttachStitch ?? labelAttachStitch,
      pressAction: written.pressAction ?? pressAction,
      bomKinds: stepBomKinds,
    };
    // У РАБОТЫ БЕЗ ПУНКТА СНИМАТЬ НЕЧЕГО — И ЭТО НЕ ПРОБЕЛ. `kindClears` снимает ровно тот якорь,
    // который САМ ПИКЕР пишет как личность ДРУГОГО пункта; работа, у которой пункта в этом бандле
    // нет, ни одного якоря не писала, и снимать чужой факт «на всякий случай» было бы ровно тем
    // стиранием, которого фаза «перестать терять» не допускает.
    const cleared = k
      ? (Object.entries(kindClears(k, after)) as Array<[OperationFormStringField, string]>)
      : [];
    for (const [field, value] of cleared) {
      if (!(field in emptyOperation)) continue;
      setValue(`${p}.${field}`, value, { shouldDirty: true });
    }

    // СВЯЗЬ С ПРОФИЛЕМ ПАРКА ПИШЕТСЯ КЛЮЧОМ, ЯВНО — единственное, что вообще подтягивается при
    // выборе пункта, и подтягивается оно СВЯЗЬЮ, а не значениями.
    //
    // Почему явно: пустой ключ сервер сохраняет как «не задано» (обещанного «пустой ключ = профиль
    // этого типа, если он единственный» на ЗАПИСИ нет), а тип, разрешённый через профиль,
    // применимости полей не открывает — отказ придёт примерно на восемнадцати полях.
    //
    // Почему только в пустой ключ: уже стоящая ссылка — это решение технолога, и перебивать её
    // выбором вида значило бы молча переставить шаг на другой станок.
    //
    // И ни одного ЧИСЛА в строку шага: унаследованное значение, записанное сюда, стёрло бы разницу
    // между «технолог выбрал 4 ст/см» и «так вышло по умолчанию».
    const targetMachine = written.machineType ?? '';
    if (targetMachine && !machineProfileKey.trim()) {
      const fits = parkMachines.filter(
        (m) => m.machineType === targetMachine && (m.profileKey ?? '').trim(),
      );
      if (fits.length === 1) {
        setValue(`${p}.machineProfileKey`, (fits[0].profileKey ?? '').trim(), { shouldDirty: true });
      }
    }
    const targetPress = written.pressEquipment ?? '';
    if (targetPress && !pressProfileKey.trim()) {
      // Процесс сужает лестницу и здесь: профиль, написанный для дублирования, разутюжке не
      // отвечает. Предикат берётся существующий — второго такого не заводится.
      const stepVerb = (written.operationType ?? opType) as common_TechCardOperationType;
      const fits = parkPresses.filter(
        (pr) =>
          pr.pressEquipment === targetPress &&
          (pr.profileKey ?? '').trim() &&
          pressProfileFitsStep(pr, stepVerb),
      );
      if (fits.length === 1) {
        setValue(`${p}.pressProfileKey`, (fits[0].profileKey ?? '').trim(), { shouldDirty: true });
      }
    }
    prefillForWork(item, k);
  };

  /**
   * ПОДСТАНОВКА ПРИ ВЫБОРЕ РАБОТЫ — ДВЕ СТУПЕНИ И ОДИН ПОРЯДОК.
   *
   * ПРИОРИТЕТ: последний такой же шаг НА ЭТОЙ КАРТОЧКЕ > глобальный дефолт работы > пусто.
   * Карточка — контекст ближе: поставил на ЭТОМ изделии отстрочку 4 мм, хотя «вообще» у тебя 6, —
   * следующая отстрочка этого изделия обязана прийти четвёркой. Обратный порядок молча переписывал
   * бы решение, принятое пять минут назад, решением, принятым полгода назад.
   *
   * САМ ПОРЯДОК ЖИВЁТ В ЧИСТОЙ ФУНКЦИИ (`resolveStepDefaults`), а не здесь, ровно затем, чтобы
   * проба могла его ПЕРЕВЕРНУТЬ и потребовать красноты. Правило, размазанное по телу компонента,
   * мутации не поддаётся, а значит и не проверено.
   *
   * ПЕРЕНОСЯТСЯ ТОЛЬКО СВОЙСТВА ВИДА и НИЧЕГО ИЗ СТВОРКИ: у полей створки есть ступень выше
   * (профиль парка, карточные дефолты), они НАСЛЕДУЮТСЯ, а наследование не пишет никогда. Список
   * глобальных дефолтов приходит СЕРВЕРНЫМ реестром (`catalog.defaultFields`) — тем же, который
   * их и принимает; карточная ступень идёт по `KIND_PROPERTY_FIELDS`, потому что она ничего
   * серверу не шлёт и живёт целиком в форме.
   *
   * ЧТО ПОДСТАВЛЕНО — ВИДНО. Записанное складывается в `prefilled`, и под пикером встаёт строка,
   * называющая каждое значение и его источник («from step 12», «default for topstitch»). Это
   * ЗАПИСЬ по человеческому жесту (`shouldDirty: true`), а не догадка системы: метка объясняет
   * происхождение и даёт снять значение, но не владеет им — в отличие от подстановки выводимости
   * (зона, нитка, утюг), которая живёт ровно пока стоит её метка.
   */
  function prefillForWork(item: WorkItem, k: OperationKind | undefined) {
    const rows = (getValues('operations') ?? []) as OperationFormValue[];
    const empty = emptyOperation as Record<string, unknown>;

    // СТУПЕНЬ 1 — ПОСЛЕДНИЙ ТАКОЙ ЖЕ ШАГ ЭТОЙ КАРТОЧКИ. «Такой же» читается ДВОЕКОДЬЕМ: строка с
    // работой сравнивается по токену, строка без работы — по старой деривации. Иначе первая же
    // размеченная строка перестала бы видеть своих неразмеченных предшественниц, и обещание
    // «поставил шесть — следующий приходит с шестью» сломалось бы ровно в день выкатки.
    let source: Record<string, unknown> | undefined;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (i === index) continue;
      const r = rows[i] as unknown as Record<string, unknown>;
      const rowWork = ((r.work ?? '') as string).trim();
      if (rowWork) {
        if (rowWork === item.token) {
          source = r;
          break;
        }
        continue;
      }
      if (!k) continue;
      const bomKeys = (r.bomLineKeys ?? []) as string[];
      const rk = kindOf({
        operationType: r.operationType as string,
        machineType: r.machineType as string,
        seamClass: r.seamClass as string,
        attachMethod: r.attachMethod as string,
        coverageMode: r.coverageMode as string,
        labelAttachStitch: r.labelAttachStitch as string,
        pressAction: r.pressAction as string,
        bomKinds: bomKeys
          .map((key) => bomLines.find((b) => b.lineKey === key)?.kind ?? '')
          .filter(Boolean),
      });
      if (rk?.id === k.id) {
        source = r;
        break;
      }
    }
    const sourceIndex = source ? rows.indexOf(source as unknown as OperationFormValue) : -1;
    const fromCard: Record<string, string | number> = {};
    if (source) {
      for (const field of KIND_PROPERTY_FIELDS) {
        const from = source[field];
        if (typeof from === 'string' || typeof from === 'number') fromCard[field] = from;
      }
    }

    // СТУПЕНЬ 2 — ГЛОБАЛЬНЫЙ ДЕФОЛТ РАБОТЫ, по серверному реестру полей.
    const fromGlobal: Record<string, string | number> = {};
    for (const d of workDefaultsForForm(workCatalog, item.token, empty)) {
      fromGlobal[d.field] = d.value;
    }

    // ТЕКУЩЕЕ СОСТОЯНИЕ ШАГА ЧИТАЕТСЯ ПОСЛЕ ЗАПИСИ ЛИЧНОСТИ, и это не мелочь порядка: личность
    // (класс шва, под-глагол ВТО, метод крепления) уже в форме, и поле, которое она только что
    // заполнила, дефолт перебивать не имеет права — иначе выбор работы спорил бы сам с собой.
    const p = `operations.${index}` as const;
    const current: Record<string, unknown> = {};
    const fields = [...new Set([...Object.keys(fromCard), ...Object.keys(fromGlobal)])];
    for (const field of fields) {
      current[field] = getValues(`${p}.${field}` as `operations.${number}.note`) as unknown;
    }
    const fills = resolveStepDefaults(fields, empty, current, fromCard, fromGlobal);
    for (const f of fills) {
      setValue(`${p}.${f.field}` as `operations.${number}.note`, f.value as never, {
        shouldDirty: true,
      });
    }
    setPrefilled(
      fills.map((f) => ({
        ...f,
        // Номер шага-источника — то, что человек ищет глазами, когда проверяет подстановку.
        fromStep: f.source === 'card' && sourceIndex >= 0 ? (sourceIndex + 1) * 10 : 0,
        workLabel: item.label,
      })),
    );
  }

  // --- МЕТКА «ПОДСТАВЛЕНО» И ЖЕСТ «ЗАПОМНИТЬ КАК ДЕФОЛТ» --------------------------------------
  //
  // МЕТКА ЖИВЁТ ДО КАСАНИЯ ПОЛЯ ИЛИ ДО СОХРАНЕНИЯ, и оба условия ВЫЧИСЛЯЮТСЯ, а не хранятся
  // третьим флажком: «человек ответил своё» это значение, разошедшееся с нашим, а «сохранено» —
  // значение, совпавшее с БАЗОЙ формы (после успешной записи база = сервер). Флажок рядом с этими
  // двумя фактами был бы третьим мнением о них и разошёлся бы с обоими молча.
  // ПОДПИСКА — НА СТРОКУ ЦЕЛИКОМ, А НЕ НА СПИСОК ИМЁН, И ЭТО ПОЧИНКА, А НЕ СТИЛЬ. `useWatch` с
  // МАССИВОМ имён берёт начальное значение ОДИН РАЗ, на монтировании, и дальше обновляет его
  // только по подписке; список же имён рождается вместе с подстановкой — то есть ПОСЛЕ последней
  // записи. Значение оставалось от прежнего имени, метка не появлялась ни разу, и выглядело это
  // как «дефолты не работают», хотя поле было заполнено. Имя строки не меняется никогда.
  const stepNow = (useWatch({ control, name: `operations.${index}` }) ?? {}) as Record<
    string,
    unknown
  >;
  const prefillBase = (form.formState.defaultValues?.operations?.[index] ?? {}) as Record<
    string,
    unknown
  >;
  const prefillNotice = prefilled.filter((f) => {
    // Человек поправил поле — значение разошлось с нашим, и оно теперь его.
    if (stepNow[f.field] !== f.value) return false;
    // Карточка сохранилась — база формы стала сервером, и подстановка стала утверждением.
    return prefillBase[f.field] !== f.value;
  });
  /** Снять подставленное: значение уходит в пустоту, метка гаснет. Жест человеческий — и грязный. */
  const dropPrefilled = (field: string) => {
    const blank = (emptyOperation as Record<string, unknown>)[field];
    setValue(`operations.${index}.${field}` as `operations.${number}.note`, blank as never, {
      shouldDirty: true,
    });
    setPrefilled((prev) => prev.filter((f) => f.field !== field));
  };

  const showMessage = useSnackBarStore((st) => st.showMessage);
  const rememberDefault = useMutation({
    mutationFn: (v: { workToken: string; field: string; value: string }) =>
      adminService.RememberOperationWorkDefault({
        workToken: v.workToken,
        field: v.field,
        value: v.value,
        clear: false,
      }),
    onSuccess: () => {
      // Каталог перечитывается: дефолт, только что записанный, обязан подставиться на следующем
      // же шаге, а не через перезагрузку страницы.
      refreshCatalog();
      showMessage('remembered as your default for this kind of work', 'success');
    },
    onError: (e: unknown) => {
      // ОТКАЗ ПОКАЗЫВАЕТСЯ ДОСЛОВНО. Сервер отвечает ИМЕНЕМ поля («у этой настройки своя лестница
      // наследования»), и переписывать это своими словами значило бы прятать единственное
      // объяснение, которое у человека есть.
      showMessage(e instanceof Error ? e.message : 'could not remember that default', 'error');
    },
  });

  /**
   * ЧТО МОЖНО ЗАПОМНИТЬ КАК ДЕФОЛТ — ПО СЕРВЕРНОМУ РЕЕСТРУ, И ТОЛЬКО ПО НЕМУ.
   *
   * Список полей приходит в ответе каталога (`default_fields`) — тем же срезом, которым RPC
   * проверяет присланное имя. Клиентский `KIND_PROPERTY_FIELDS` для этого негоден: он отвечает на
   * ДРУГИЕ вопросы (что переносится с прошлого шага, что обязано стоять в `CORE_STEP_FIELDS`),
   * живёт своей жизнью и уже носил колонку, снятую миграцией. Кнопка, нарисованная по нему,
   * стояла бы на поле, которое сервер отвергает по имени, — то есть обещала бы жест, всегда
   * отвечающий отказом.
   *
   * Предлагается только ЗАПОЛНЕННОЕ и только ПОКАЗАННОЕ: запоминать пустоту нечего, а «запомни то,
   * чего не видно» — жест вслепую. Состояние поля берётся из той же таблицы `stepFields`, из
   * которой считается пилюля и строится полоса остатков; второй такой таблицы здесь нет.
   */
  const rememberableDefaults = (() => {
    if (!activeWork || workCatalog.defaultFields.length === 0) return [];
    const byField = new Map(stepFields.map((f) => [f.field as string, f]));
    const stored = workCatalog.defaults.get(activeWork.token);
    const out: Array<{
      column: string;
      label: string;
      text: string;
      value: string;
      already: boolean;
    }> = [];
    for (const column of workCatalog.defaultFields) {
      const field = columnToFormField(column);
      if (!(field in emptyOperation)) continue;
      const state = byField.get(field);
      if (!state || !state.filled || !state.shown) continue;
      const raw = getValues(`operations.${index}.${field}` as `operations.${number}.note`);
      const value = formValueToWorkDefault((emptyOperation as Record<string, unknown>)[field], raw);
      if (!value) continue;
      out.push({
        column,
        label: state.label,
        text: state.text,
        value,
        already: stored?.get(column) === value,
      });
    }
    return out;
  })();

  const selectedPieceKeys = (useWatch({
    control,
    name: `operations.${index}.inputKeys`,
  }) ?? []) as string[];
  const byKey = useMemo(() => new Map(pieces.map((p) => [p.lineKey, p])), [pieces]);
  const chosenPieces = selectedPieceKeys.filter((k) => byKey.has(k));
  // Фронтир нужен редактору дважды: чтобы отличить вход-УЗЕЛ от оборванной ссылки на деталь и
  // чтобы предложить замену съеденных ссылок при объявлении узла. Подписка здесь одна на всю
  // форму, а не по строке рельса: редактор смонтирован в единственном экземпляре.
  const assembly = useAssemblyView(pieces);
  // Нарушения ИМЕННО ЭТОГО шага. Карточные (правило 4) сюда не попадают — они про сборку
  // целиком и место им на релизном гейте, а не в строке шага.
  const stepViolations = assembly.res.violations.filter((v) => v.step === index);
  const chosenUnits = selectedPieceKeys.filter((k) => !byKey.has(k) && assembly.res.units.has(k));
  // The same composed heading the rail shows, so the open step and its row in the list are named
  // identically — they used to differ, because the rail fell back to the type while the editor
  // header printed only the type and the row printed `node`.
  const editorHeading =
    operationHeading({
      operationType: opType as Parameters<typeof operationHeading>[0]['operationType'],
      machineType: machineType as common_TechCardMachineType,
      // ЯКОРЬ ВИДА едет в композитор: без него отстрочка на одноигольной называлась бы «join»
      // здесь и «Topstitch» в пикере на два сантиметра выше.
      seamClass,
      // ...А НАЗВАННАЯ РАБОТА БЬЁТ И ЕГО (R8). Именно здесь оставался остаток R6: шаг с классом шва
      // отстрочки, которому назначили работу без пункта, звался отстрочкой во всех заголовках,
      // пока пикер на два сантиметра выше называл его выбранной работой.
      work: workValue,
      workCatalog,
      zone: zoneValue as Parameters<typeof operationHeading>[0]['zone'],
      pieceNames: selectedPieceKeys.map((k) => byKey.get(k)?.name ?? `▣ ${k}`),
      note: noteValue,
    }) || 'new step';
  // A key that no longer resolves (its piece was deleted on the PATTERNS tab, or an older card
  // invented one through the removed picker) is SURFACED, not silently dropped — the save would
  // unlink it and nobody would know which operation lost a part.
  // Оборванная ссылка — это ключ, который НЕ деталь И НЕ узел. Без второй половины проверки
  // каждый вход-узел отрисовался бы красным «piece deleted»: узла нет в списке деталей по
  // определению, он не деталь.
  const danglingPieces = selectedPieceKeys.filter(
    (k) => !byKey.has(k) && !assembly.res.units.has(k),
  );
  const removePieceKey = (lineKey: string) => {
    const next = selectedPieceKeys.filter((k) => k !== lineKey);
    setValue(`operations.${index}.inputKeys`, next, { shouldDirty: true });
  };

  // ── ВЫВОДИМОСТЬ ЭТОГО ШАГА ─────────────────────────────────────────────────────────────────────
  //
  // ВЫВОД СЧИТАЕТСЯ ПО ДАННЫМ ЧЕЛОВЕКА, А НЕ ПО СВОИМ СОБСТВЕННЫМ. Подставленное вычитается из
  // снимка ПЕРЕД выводом, и без этого вышла бы петля с обратной связью: привязали нитку — источник
  // видит «нитка уже привязана» — подсказка гаснет — подстановка отзывается — источник снова видит
  // пустое. Экран мигал бы, а причина сидела бы в том, что система читает как факт собственную
  // догадку.
  const [applied, setApplied] = useState<{
    zone?: string;
    thread?: string;
    press?: { equipment: string; profileKey: string };
  }>({});
  const [dismissed, setDismissed] = useState<Set<SuggestedField>>(() => new Set());

  // ЧТО НАПИСАЛИ МЫ — В РЕФЕ, ЗАПИСЫВАЕТСЯ СИНХРОННО С `setValue`. Состояние `applied` рисует
  // метку и приезжает следующим рендером, а решение «это наша запись или ответ человека»
  // принимается в тот же миг, когда подписка приносит новое значение поля. Разница в один рендер
  // тут не мелочь: между записью и её отражением в состоянии наша же подстановка выглядела бы
  // ответом человека — и метка не появилась бы никогда.
  const wroteRef = useRef<{
    zone?: string;
    thread?: string;
    press?: { equipment: string; profileKey: string };
  }>({});

  // «ЧЕЛОВЕК ОЧИСТИЛ ПОЛЕ» РАСПОЗНАЁТСЯ ФОКУСОМ, А НЕ ЗНАЧЕНИЕМ, и это не вкус, а замер. Пустота
  // в поле при живой подстановке случается ДВАЖДЫ: регистрация контрола после монтирования формы
  // сбрасывает поле к дефолту (та самая ловушка «значение до монтирования» — видна на живом
  // бандле), и человек выбирает «—…—» пикером. По значению они неразличимы: маппер чтения кладёт
  // в пустую зону ЯВНЫЙ `UNKNOWN` (`schema.ts`, `o.zone || UNKNOWN`), то есть сброс и жест пишут
  // одну и ту же строку. Различает их фокус: сброс регистрации не фокусирует ничего, человек —
  // всегда. До касания контрола пустота лечится ПОВТОРНОЙ подстановкой (как и было), после —
  // принимается ответом: пустота тоже ответ, и подставлять обратно под курсором нельзя, иначе
  // селект выглядит сломанным, а единственным работающим жестом снятия остаётся метка.
  const zoneTouchedRef = useRef(false);
  const pressTouchedRef = useRef(false);

  const inference = useStepInference(index, pieces, bomLines, parkPresses, {
    zone: wroteRef.current.zone !== undefined,
    thread: wroteRef.current.thread,
    press: !!wroteRef.current.press,
  });

  const zoneSuggested = inference.zone.value;
  const threadSuggested = inference.thread.lineKey;
  const pressSuggested = inference.press.pressEquipment;
  const pressProfileSuggested = inference.press.profileKey;

  /** Человек ответил сам — поле его. Больше не предлагаем на этом шаге. */
  const dismiss = useCallback((field: SuggestedField) => {
    delete wroteRef.current[field];
    setDismissed((prev) => (prev.has(field) ? prev : new Set(prev).add(field)));
    setApplied((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // ЗОНА. Подставляется только в незаполненное; исчезло основание — подстановка ОТЗЫВАЕТСЯ, потому
  // что пока метка стоит, значение наше, а не человека. Зона входит в подпись карточки, и оставить
  // на ней утверждение, которого система уже не выводит, — это ровно тот тихий дефект, ради
  // которого весь этот кусок сделан видимым.
  //
  // СОСТОЯНИЕ ПОЛЯ БЕРЁТСЯ ИЗ ПОДПИСКИ, А НЕ ИЗ `getValues`, И ЭТО НЕ СТИЛЬ. Эффекты ребёнка
  // выполняются РАНЬШЕ эффекта монтирования формы, а до него `getValues` отвечает из
  // `_defaultValues`: подстановка читала «пусто» там, где значение уже стояло, и не видела, что
  // её собственная запись не доехала. Подписка отвечает одинаково в любой момент жизни формы.
  //
  // «ЧЕЛОВЕК ТРОНУЛ КОНТРОЛ» ОПРЕДЕЛЯЕТСЯ ЗДЕСЬ, А НЕ КОЛБЭКОМ СЕЛЕКТА, И ЭТО ПОЧИНКА, А НЕ ВКУС.
  // `onValueChange` у Radix срабатывает и на ВНЕШНЕЕ изменение управляемого значения — то есть на
  // нашу же подстановку. Повешенное на него снятие метки гасило подсказку в тот же кадр, в
  // котором она появлялась, и выглядело это как «вывод не работает».
  useEffect(() => {
    if (frozen || dismissed.has('zone')) return;
    const ours = wroteRef.current.zone;
    if (ours !== undefined && !zoneIsUnset(zoneValue) && zoneValue !== ours) {
      dismiss('zone'); // человек выбрал своё поверх подставленного — значение остаётся ему
      return;
    }
    // ЧЕЛОВЕК ОЧИСТИЛ ПОЛЕ ПИКЕРОМ («— zone —») ПОВЕРХ ПОДСТАВЛЕННОГО. Пустота — тоже его ответ.
    // Жест распознаётся фокусом (см. довод у `zoneTouchedRef`): сброс регистрации контрола пишет
    // ту же пустоту, но без фокуса, — и лечится повторной подстановкой ветками ниже.
    if (ours !== undefined && zoneIsUnset(zoneValue) && zoneTouchedRef.current) {
      dismiss('zone');
      return;
    }
    if (ours === undefined && !zoneIsUnset(zoneValue)) return; // чужой ответ не трогаем никогда
    if (zoneSuggested) {
      wroteRef.current.zone = zoneSuggested;
      if (zoneValue !== zoneSuggested) {
        setValue(`operations.${index}.zone`, zoneSuggested, { shouldDirty: false });
      }
      if (applied.zone !== zoneSuggested) setApplied((prev) => ({ ...prev, zone: zoneSuggested }));
      return;
    }
    if (ours === undefined) return;
    delete wroteRef.current.zone;
    if (!zoneIsUnset(zoneValue)) {
      setValue(`operations.${index}.zone`, NONE_ZONE, { shouldDirty: false });
    }
    setApplied((prev) => {
      const { zone: _dropped, ...rest } = prev;
      return rest;
    });
  }, [zoneSuggested, zoneValue, applied.zone, frozen, dismissed, index, setValue, dismiss]);

  // НИТКА. Привязка — это добавление ключа в тот же список, куда его кладёт человек, поэтому
  // отзыв обязан снимать РОВНО наш ключ и не трогать соседние.
  useEffect(() => {
    if (frozen || dismissed.has('thread')) return;
    const ours = wroteRef.current.thread;
    if (threadSuggested) {
      if (ours === threadSuggested && selectedBomKeys.includes(threadSuggested)) return;
      wroteRef.current.thread = threadSuggested;
      const others = selectedBomKeys.filter((k) => k !== ours && k !== threadSuggested);
      setValue(`operations.${index}.bomLineKeys`, [...others, threadSuggested], {
        shouldDirty: false,
      });
      if (applied.thread !== threadSuggested) {
        setApplied((prev) => ({ ...prev, thread: threadSuggested }));
      }
      return;
    }
    if (ours === undefined) return;
    delete wroteRef.current.thread;
    if (selectedBomKeys.includes(ours)) {
      setValue(
        `operations.${index}.bomLineKeys`,
        selectedBomKeys.filter((k) => k !== ours),
        { shouldDirty: false },
      );
    }
    setApplied((prev) => {
      const { thread: _dropped, ...rest } = prev;
      return rest;
    });
  }, [threadSuggested, selectedBomKeys, applied.thread, frozen, dismissed, index, setValue]);

  // УТЮГ. Оборудование и ключ профиля едут ПАРОЙ: ключ без оборудования сервер отвергает, а
  // оборудование без ключа на карточке с одним профилем — половина ответа, которую человеку
  // пришлось бы дописывать вторым жестом.
  useEffect(() => {
    if (frozen || dismissed.has('press')) return;
    const ours = wroteRef.current.press;
    const eqSet = !!pressEquipment && pressEquipment !== NONE_PRESS_EQUIPMENT;
    if (ours && eqSet && pressEquipment !== ours.equipment) {
      dismiss('press');
      return;
    }
    // Человек очистил оборудование пикером («— equipment —») поверх подставленного — тот же жест,
    // что у зоны: пустота — его ответ, обратно не подставляем. Фокус отличает жест от сброса
    // регистрации контрола (см. `pressTouchedRef`).
    if (ours && !eqSet && pressTouchedRef.current) {
      dismiss('press');
      return;
    }
    if (!ours && eqSet) return;
    if (pressSuggested) {
      wroteRef.current.press = { equipment: pressSuggested, profileKey: pressProfileSuggested };
      if (pressEquipment !== pressSuggested) {
        setValue(`operations.${index}.pressEquipment`, pressSuggested, { shouldDirty: false });
      }
      if (pressProfileSuggested && pressProfileKey !== pressProfileSuggested) {
        setValue(`operations.${index}.pressProfileKey`, pressProfileSuggested, {
          shouldDirty: false,
        });
      }
      if (applied.press?.equipment !== pressSuggested) {
        setApplied((prev) => ({
          ...prev,
          press: { equipment: pressSuggested, profileKey: pressProfileSuggested },
        }));
      }
      return;
    }
    if (!ours) return;
    delete wroteRef.current.press;
    if (eqSet) {
      setValue(`operations.${index}.pressEquipment`, NONE_PRESS_EQUIPMENT, { shouldDirty: false });
    }
    if (ours.profileKey && pressProfileKey) {
      setValue(`operations.${index}.pressProfileKey`, '', { shouldDirty: false });
    }
    setApplied((prev) => {
      const { press: _dropped, ...rest } = prev;
      return rest;
    });
  }, [
    pressSuggested,
    pressProfileSuggested,
    pressEquipment,
    pressProfileKey,
    applied.press?.equipment,
    frozen,
    dismissed,
    index,
    setValue,
    dismiss,
  ]);

  // ПОДСТАВЛЕННОЕ НЕ ЖИВЁТ ДОЛЬШЕ СВОЕЙ МЕТКИ. Редактор размонтируется при смене выбранного шага,
  // и `wroteRef`/`applied` умирают вместе с ним — а значение, написанное нами, оставалось в форме
  // БЕЗ метки, при следующем открытии шага сходило за ответ человека («чужой ответ не трогаем») и
  // уезжало с сохранением немаркированным фактом. Хуже всего это нитке: её чип неотличим от
  // привязанного руками. Поэтому при размонтировании неснятая подстановка ОТЗЫВАЕТСЯ; заново
  // открытый шаг предложит её снова — уже с меткой. Сохранение при ОТКРЫТОМ шаге значение увозит —
  // но там метка стоит на экране, это и есть контракт «на глазах и с меткой».
  //
  // ДВЕ ЗАЩИТЫ ВНУТРИ: (а) отзывается только значение, всё ещё РАВНОЕ нашему, — ответ человека
  // поверх и сдвиг индексов при удалении шага не трогаются; (б) значение, совпадающее с БАЗОЙ
  // формы (defaultValues), не трогается вовсе: после сохранения база = сервер, и «отозвать» его —
  // значит молча разъехаться с сохранённым, то есть подготовить стирание следующим сохранением.
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    return () => {
      const wrote = wroteRef.current;
      // Локальный `index` НАРОЧНО затеняет проп значением на момент размонтирования: сдвиг
      // индексов при удалении шага не должен отзывать значение чужого шага, а путь записи обязан
      // читаться разметочной проверкой роундтрипа тем же паттерном, что у остальных эффектов.
      const index = indexRef.current;
      const base = (form.formState.defaultValues?.operations?.[index] ?? {}) as {
        zone?: string;
        bomLineKeys?: string[];
        pressEquipment?: string;
        pressProfileKey?: string;
      };
      if (wrote.zone !== undefined) {
        const cur = getValues(`operations.${index}.zone`);
        if (cur === wrote.zone && base.zone !== wrote.zone) {
          setValue(`operations.${index}.zone`, NONE_ZONE, { shouldDirty: false });
        }
      }
      if (wrote.thread) {
        const keys = (getValues(`operations.${index}.bomLineKeys`) ?? []) as string[];
        if (keys.includes(wrote.thread) && !(base.bomLineKeys ?? []).includes(wrote.thread)) {
          setValue(
            `operations.${index}.bomLineKeys`,
            keys.filter((k) => k !== wrote.thread),
            { shouldDirty: false },
          );
        }
      }
      if (wrote.press) {
        const eq = getValues(`operations.${index}.pressEquipment`);
        if (eq === wrote.press.equipment && base.pressEquipment !== wrote.press.equipment) {
          setValue(`operations.${index}.pressEquipment`, NONE_PRESS_EQUIPMENT, { shouldDirty: false });
          if (
            wrote.press.profileKey &&
            getValues(`operations.${index}.pressProfileKey`) === wrote.press.profileKey &&
            base.pressProfileKey !== wrote.press.profileKey
          ) {
            setValue(`operations.${index}.pressProfileKey`, '', { shouldDirty: false });
          }
        }
      }
      wroteRef.current = {};
    };
    // Пустые зависимости НАРОЧНО: отзыв — только на настоящем размонтировании. Пересборка эффекта
    // на смене index отзывала бы по СТАРОМУ индексу значение уже другого шага.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Снять подставленное касанием: значение уходит, подсказка на этом шаге гаснет. */
  const dropSuggested = (field: SuggestedField) => {
    const wrote = wroteRef.current;
    if (field === 'zone') setValue(`operations.${index}.zone`, NONE_ZONE, { shouldDirty: false });
    if (field === 'thread') {
      setValue(
        `operations.${index}.bomLineKeys`,
        selectedBomKeys.filter((k) => k !== wrote.thread),
        { shouldDirty: false },
      );
    }
    if (field === 'press') {
      setValue(`operations.${index}.pressEquipment`, NONE_PRESS_EQUIPMENT, { shouldDirty: false });
      if (wrote.press?.profileKey)
        setValue(`operations.${index}.pressProfileKey`, '', { shouldDirty: false });
    }
    dismiss(field);
  };

  /**
   * ПОДСКАЗКА НОРМЫ ВРЕМЕНИ — ГОУСТ, НИКОГДА НЕ ЗНАЧЕНИЕ. Считается здесь, потому что у неё две
   * ступени из РАЗНЫХ источников: карточная (модуль выводимости, R5) и каталожная (`smv_hints`,
   * R3). Карточная сильнее; каталожная работает только у строки с названной работой.
   *
   * Норма времени в дефолты НЕ входит и входить не будет: она зависит от изделия, а не только от
   * работы, — поэтому серверный реестр `default_fields` её и не содержит.
   */
  const cardSmv = inference.smv.smv;
  const catalogSmv = activeWork ? workCatalog.smvHints.get(activeWork.token) : undefined;
  const smvHint: { text: string; why: string } | undefined = cardSmv
    ? {
        text: cardSmv,
        why: `the same kind of step took ${cardSmv} min at step ${inference.smv.fromStep} of this card — a hint, not a value`,
      }
    : catalogSmv
      ? {
          text: catalogSmv.smv,
          why: `the last “${activeWork?.label}” step took ${catalogSmv.smv} min${
            catalogSmv.cardName ? ` on ${catalogSmv.cardName}` : ''
          } — a hint, not a value`,
        }
      : undefined;

  // The chip row IS the material link. The legacy single `bomLineKey` went with the break — it
  // asked the same question with room for one answer, and an operation genuinely takes several.
  const linkedMaterials = selectedBomKeys
    .map((k) => bomLines.find((b) => b.lineKey === k))
    .filter(Boolean) as BomLine[];
  const bomOutOfRange = selectedBomKeys.length > linkedMaterials.length;
  const unlinkedBoms = linkableBoms.filter((b) => !selectedBomKeys.includes(b.lineKey ?? ''));
  // Grouped for the reveal: six sections in one flat pile would read as undifferentiated, and
  // «нитки основных швов» sitting next to «основная молния» invites the wrong pick. linkableBoms is
  // already sorted into section order, so a Map keeps the groups in that order too. Not memoised on
  // purpose — unlinkedBoms is a fresh array every render, so a useMemo over it would recompute
  // anyway while costing a dependency that lies about being stable.
  //
  // Within that, ЧТО ЭТО ЗА ПОЗИЦИЯ (0278) does the actual suggesting: a button-attach step offers
  // buttons and snaps before the rest of the фурнитура, and the group holding them leads. This only
  // ever REORDERS — never filters — so a step that genuinely takes something unexpected is one
  // glance further down rather than unreachable, and a card whose lines carry no kind yet reads
  // exactly as it did before. Since 0306 the hunch comes off the MACHINE for every sewing step —
  // the step type stopped naming one.
  // ВИД ДОБАВЛЯЕТ СВОИ ВИДЫ МАТЕРИАЛА К ПОДСКАЗКЕ, А НЕ ФИЛЬТРУЕТ СПИСОК. Кнопка, хольнитен и
  // люверс различаются ТОЛЬКО строкой BOM, поэтому пункт обязан поднять нужные виды наверх; но
  // отфильтровать остальные он права не имеет — шаг, законно берущий что-то неожиданное, должен
  // остаться в одном взгляде отсюда, а не стать недостижимым (тот же довод, что у
  // `preferredBomKinds`: это эвристика показа, а не правило хранения).
  const preferredKinds = new Set<string>([
    ...preferredBomKinds(opType, machineType),
    ...(activeKind?.bomKinds ?? []),
  ]);
  const isPreferred = (b: BomLine) => !!b.kind && preferredKinds.has(b.kind);
  const unlinkedBySection = (() => {
    const groups = new Map<string, BomLine[]>();
    for (const b of unlinkedBoms) {
      const section = b.section ?? '';
      const bucket = groups.get(section);
      if (bucket) bucket.push(b);
      else groups.set(section, [b]);
    }
    for (const lines of groups.values()) {
      lines.sort((a, b) => Number(isPreferred(b)) - Number(isPreferred(a)));
    }
    return Array.from(groups.entries()).sort(
      ([, a], [, b]) => Number(b.some(isPreferred)) - Number(a.some(isPreferred)),
    );
  })();

  // Which article each colourway actually takes for the slots this step consumes. THE reason the
  // link is worth having: the operation names the role and stays colourway-agnostic, so without
  // this a technologist reading the step cannot tell that BLK takes an antique-brass zip where
  // BONE takes silver. Resolution mirrors the server (pin → slot default → none).
  //
  // Not memoised, for the same reason as unlinkedBySection above: linkedMaterials is rebuilt on
  // every render, so a useMemo keyed on it would recompute anyway while claiming a stability it
  // does not have.
  // «Пришить кнопки», у которых не привязана ни одна кнопка. Checked against the LINKED lines, so
  // it clears the moment the operator picks one. Both axes have an opinion: the step type answers
  // for fusing, the machine for the button-attach automat.
  const expects =
    OPERATION_TYPE_EXPECTS[opType as common_TechCardOperationType] ??
    (isMachineStep ? MACHINE_TYPE_EXPECTS[machineType as common_TechCardMachineType] : undefined);
  const expectsMaterial =
    expects && !linkedMaterials.some((b) => b.section === expects.section) ? expects : null;

  const colorways = colorwayArticles?.colorways ?? [];
  // No usage on ANY colourway means there is no recipe to report — not that every slot is unused.
  // A card read that is still refetching looks exactly like this, and printing «не используется ни
  // в одном рецепте» from it would be a confident negative asserted from missing data.
  const hasRecipeData = colorways.some((cw) => cw.pinsByLineKey.size > 0);
  const slotArticles = !hasRecipeData
    ? []
    : linkedMaterials.map((line) => {
        const key = line.lineKey ?? '';
        const slotDefault = line.materialId ?? 0;
        const articleName = (id: number) => colorwayArticles?.materialNameById.get(id) ?? `#${id}`;
        const perColorway = colorways.map((cw) => {
          const pins = cw.pinsByLineKey.get(key);
          // No usage at all ≠ a usage with no article. The first says this colourway's recipe never
          // asks for the slot, the second is a production blocker; conflating them would either
          // invent a missing article or hide a real one.
          if (!pins) {
            return { label: cw.label, ids: [] as number[], inRecipe: false, missing: false };
          }
          const ids = Array.from(new Set(pins.map((pin) => effectiveArticleId(pin, slotDefault))));
          return {
            label: cw.label,
            ids: ids.filter((id) => id > 0),
            inRecipe: true,
            missing: ids.some((id) => id === 0),
          };
        });
        const inRecipe = perColorway.filter((c) => c.inRecipe);
        // Compared by ID, never by name: two catalog articles can legitimately share a name (the
        // same zip stocked from two suppliers), and folding them together would assert that two
        // colourways take the same physical article when they do not.
        const distinctIds = new Set(inRecipe.flatMap((c) => c.ids));
        return {
          lineKey: key,
          name: line.name?.trim() || 'unnamed',
          perColorway: perColorway.map((c) => ({ ...c, articles: c.ids.map(articleName) })),
          usedAnywhere: inRecipe.length > 0,
          // «Same everywhere» has to mean EVERY colourway, not merely every colourway that happens
          // to carry the slot. A zip that exists only in BLK's recipe is the single most important
          // thing this line can say, and collapsing it to «основная молния → YKK» says the opposite
          // — that all three colourways take it — while nothing is bought for the other two.
          uniform:
            inRecipe.length === colorways.length &&
            distinctIds.size === 1 &&
            !inRecipe.some((c) => c.missing),
          uniformArticle: distinctIds.size === 1 ? articleName(Array.from(distinctIds)[0]) : '',
        };
      });

  // A pin that no longer resolves (its callout was deleted on the sketch tab) keeps a visible,
  // re-selectable option instead of reading as «— пин —» — the same defensive fallback the issues
  // list uses for a removed operation.
  const rowPinOptions = useMemo(() => {
    if (!calloutNumber || pinOptions.some((o) => o.value === calloutNumber)) return pinOptions;
    return [
      ...pinOptions,
      { value: calloutNumber, label: `#${calloutNumber} — not found (removed?)` },
    ];
  }, [pinOptions, calloutNumber]);

  // WHICH PROFILE OF THE PARK THIS STEP POINTS AT. Narrowed to the machine the step runs on,
  // because a profile of another type is a FieldViolation on save, not a preference — and the
  // «inherit» option says what leaving it blank would actually do, which depends entirely on how
  // many profiles of that machine the card holds: one is inherited by type, two are ambiguous and
  // inherit nothing at all (§3). A dangling key keeps a visible option, like the sketch pin above:
  // the save detaches it silently, so the picker is the only place that can still say so.
  const machineProfileOptions = useMemo(() => {
    const ofType = parkMachines.filter(
      (m) => m.machineType === machineType && (m.profileKey ?? '').trim(),
    );
    const inheritLabel =
      ofType.length === 1
        ? `inherit: ${machineProfileName(ofType[0])}`
        : ofType.length === 0
          ? 'no profile for this machine'
          : `— pick one of ${ofType.length} —`;
    const opts = [
      { value: PROFILE_INHERIT, label: inheritLabel },
      ...ofType.map((m) => ({ value: m.profileKey ?? '', label: machineProfileName(m) })),
    ];
    const key = machineProfileKey.trim();
    if (key && !opts.some((o) => o.value === key)) {
      opts.push({ value: key, label: `#${key.slice(-6)} — profile not found (removed?)` });
    }
    return opts;
  }, [parkMachines, machineType, machineProfileKey]);

  // The ВТО twin, with one extra narrowing the machines have no equivalent of: a press profile
  // declares WHICH PROCESS it is for, so a fusing profile is not offered on a разутюжка. It is not
  // a courtesy — the process is half of what a press profile MEANS, and the ladder now refuses a
  // mismatch at both rungs, the named one included (resolvePressProfile). What the picker still
  // does not do is HIDE a mismatch that is already chosen: the reference survives the save (the
  // server checks only the equipment on the key), so a profile whose process was changed on the
  // defaults tab has to stay listed, or the step would hold a pointer the operator cannot see or
  // remove — and the settings would simply be gone from the step's placeholders with nothing on
  // screen saying why.
  const pressProfileOptions = useMemo(() => {
    const usable = parkPresses.filter(
      (p) =>
        p.pressEquipment === pressEquipment &&
        (p.profileKey ?? '').trim() &&
        (pressProfileFitsStep(p, opType) || p.profileKey === pressProfileKey),
    );
    // Counted over what would ACTUALLY be inherited (the strict predicate), so the option cannot
    // say «pick one of 2» because of a mismatched profile that is only listed to stay removable.
    const inheritable = usable.filter((p) => pressProfileFitsStep(p, opType));
    const inheritLabel =
      inheritable.length === 1
        ? `inherit: ${pressProfileName(inheritable[0])}`
        : inheritable.length === 0
          ? 'no profile for this equipment'
          : `— pick one of ${inheritable.length} —`;
    const opts = [
      { value: PROFILE_INHERIT, label: inheritLabel },
      // THE MISMATCH IS LISTED AND SAID OUT LOUD. Listing it silently would be the worse half of
      // both worlds: the step reads as pointing at a mode whose temperature is nowhere on screen,
      // and the sheet prints «not set» beside a profile the picker shows as chosen. The label
      // names the process it IS for, because that is what has to change for it to answer here —
      // either the profile's process on the defaults tab, or this step's own pick.
      ...usable.map((p) => ({
        value: p.profileKey ?? '',
        label: pressProfileFitsStep(p, opType)
          ? pressProfileName(p)
          : `${pressProfileName(p)} — ${pressProcessShort(p.operationType) || 'another process'} only, nothing inherited`,
      })),
    ];
    const key = pressProfileKey.trim();
    if (key && !opts.some((o) => o.value === key)) {
      opts.push({ value: key, label: `#${key.slice(-6)} — profile not found (removed?)` });
    }
    return opts;
  }, [parkPresses, pressEquipment, pressProfileKey, opType]);

  // --- СВОДКИ ЗОНЫ СВОЙСТВ: ЧТО ШАГ ГОВОРИТ, СЛОЖИВ СВОЁ И УНАСЛЕДОВАННОЕ -----------------------
  //
  // Считает это ТОТ ЖЕ композитор, что и печатный лист (`effectiveMachineSettings` /
  // `effectivePressSettings`): сводка, написанная здесь вторым разом, разошлась бы с бумагой ровно
  // там, где бумагу никто не сверяет. `overridden` тут не нужен — это одна строка для чтения, а
  // не колонка настроек, и правится она в створке.
  const machineSummaryText = isMachineStep
    ? effectiveMachineSettings(
        {
          threadCount,
          needleType,
          needleSizeNm,
          threadTension,
          threadTensionNote,
          attachmentKind,
          attachmentSizeMm,
          stitchesPerCm,
          stitchWidthMm,
        },
        machineProfile,
        cardStitchDensity,
      )
        .map((x) => x.text)
        .join(' · ')
    : '';
  const pressSummaryText = ownsPressSettings
    ? effectivePressSettings(
        { pressTemperatureC, pressDwellSec, pressPressureNCm2, pressSteam, pressCloth },
        pressProfile,
      )
        .map((x) => x.text)
        .join(' · ')
    : '';
  // ШОВ — три факта, и припуск читается ПО ЛЕСТНИЦЕ: собственный, иначе карточный / цеховой. Иначе
  // строка сказала бы «припуск не указан» на шаге, который его исправно наследует.
  //
  // ЛЕСТНИЦУ И СЛОВА ДЕРЖИТ ОБЩИЙ СОСТАВИТЕЛЬ, А НЕ ЭТА СТРОКА. Здесь стояла ручная сборка, и её
  // не было на второй поверхности: карта примерки печатала «SA 10 mm» и умела назвать ТОЛЬКО
  // собственное значение, так что исправно унаследованный припуск был виден в редакторе и не был
  // виден на карте. Ступени по-прежнему собирает редактор (`inherited` ниже читает те же два
  // источника для плейсхолдера поля), а ПОРЯДОК ступеней и слова их источников — общие.
  //
  // ЗАОДНО ВЕРНУЛИСЬ МИЛЛИМЕТРЫ: ручная сборка писала «allowance 10 mm» у собственного значения и
  // «allowance 10 (card)» у унаследованного, потому что источник склеивался со ступенью раньше,
  // чем к числу успевала пристать единица. Плейсхолдер поля так и печатает — и правильно, единицу
  // там называет подпись поля, — а в бегущей строке рядом с «6 mm from the edge» голое число
  // читается в тех единицах, в которых читатель работает.
  const seamSummaryText = [
    seamClassLabel(seamClass),
    seamAllowanceText({
      own: seamAllowanceMm,
      card: cardAllowanceMm,
      workshop: shopAllowanceMm,
      operationType: opType,
      seamClass,
    }),
    seamSecuringLabel(seamSecuring),
  ]
    .filter(Boolean)
    .join(' · ');
  // Сводка шва — там, где шов есть. У подрезки, чистки и упаковки строка «seam · припуск 10 мм
  // (карточка)» верна и бессмысленна: она называет карточный стандарт, а не факт этого шага, — и
  // три таких строки подряд учат не читать сводки вовсе.
  const showSeamSummary =
    showSewingOverrides &&
    (isMachineStep || seamClass !== NONE_SEAM_CLASS || seamAllowanceMm.trim() !== '');

  // THE PRESET EFFECT AND THE THREAD AUTO-FILL BOTH LIVED HERE, and both are gone: nothing is
  // pre-filled from the step type any more. What replaces them is the PLACEHOLDER — the inherited
  // value is shown with its source and stored nowhere, which is the whole difference between «the
  // technologist chose 4 threads» and «it defaulted to 4».

  return (
    <div
      onDragEnter={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const key = readPieceDrag(e.dataTransfer);
        if (key) onDropPiece(index, key);
      }}
      className={cn(
        'min-w-0 flex-1 border bg-bgColor p-3 transition-colors',
        over ? 'border-textColor' : 'border-borderColor',
      )}
    >
      <div className='mb-2.5 flex flex-wrap items-center gap-2 border-b border-borderColor pb-1'>
        <Text size='default' component='h4' className='font-bold tabular-nums'>
          {opNumber}
        </Text>
        <Text
          size='control'
          variant='uppercase'
          tracking='label'
          component='span'
          data-editor-heading={index}
        >
          {editorHeading}
        </Text>
        <div className='ml-auto flex shrink-0 items-center gap-1.5'>
          <Button type='button' variant='secondary' size='xs' onClick={onInsertAfter}>
            ＋ step below
          </Button>
          <Button type='button' variant='secondary' size='xs' onClick={onRemove}>
            remove step
          </Button>
        </div>
      </div>

      {/* THE CORE, and it is all of it: what the step does, ON WHAT, where, and how long it takes.
          The pieces and materials below are the other half of «with what»; everything else is an
          override that stays folded away until it differs.

          THE SECOND CONTROL IS THE SECOND AXIS (0306). «Machine» is not an instruction on its own —
          it says a machine is involved and nothing about which of the twenty-five — so the machine
          picker sits beside the type and is required by it, exactly like the zone. Press, press open
          and fusing ask the same question about the equipment: an iron, a fusing press and a steamer
          are three different instructions to the floor. Neither is an override, and neither belongs
          in the fold: a required field behind a closed accordion is a save that fails at a control
          nobody can see. */}
      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
        {/* ПИКЕР РАБОТЫ — ПЕРВЫЙ КОНТРОЛ ШАГА, И ВЫБИРАЮТ В НЁМ ПОИСКОМ, А НЕ ГЛАЗАМИ.
            Технолог называет работу ОДНИМ СВОИМ СЛОВОМ («московский», «моско»), а форма
            спрашивала глагол и машинку по отдельности — этого слова не было ни в одном из двух
            списков, а с 0329 их полсотни с лишним и сканировать список стало дороже, чем печатать.
            Список и синонимы приходят С СЕРВЕРА; в бандле остаётся снимок, чтобы пикер никогда не
            был пустым, — и подпись под ним честно говорит, на чём он сейчас живёт.
            ВЫБОР ПИШЕТ РАБОТУ (`work`, хранимую) И ЛИЧНОСТЬ: глагол с машинкой из каталога, класс
            шва / метод крепления / под-глагол — из пункта, если он у работы есть. Обе оси ниже
            остаются на экране и редактируемыми: шаг, собранный руками мимо всех работ, продолжает
            открываться и сохраняться, а работа у него просто не названа. */}
        <div className='space-y-px' data-kind-picker={index} data-step-work={workValue || undefined}>
          <Text size='micro' variant='label' tracking='label' className='leading-none uppercase'>
            kind of operation
          </Text>
          <Combobox
            name={`operationWork-${index}`}
            placeholder='kind of operation'
            searchPlaceholder='type the work — Russian or English'
            valueLabel={workLabel}
            filter={filterWorks}
            onSelect={applyWork}
            readOnly={frozen}
            footer={
              catalogLive ? undefined : (
                // ДЕГРАДАЦИЯ НАЗЫВАЕТСЯ ВСЛУХ. Молчаливый фолбэк здесь худший из возможных:
                // человек печатает русское слово, ничего не находит и решает, что такой работы
                // нет вовсе.
                <Text size='micro' variant='label' component='span' data-work-fallback='1'>
                  offline list — the catalogue did not load, so most jobs search by English name
                  only
                </Text>
              )
            }
          />
          {/* ВЫВЕДЕНО, А НЕ СОХРАНЕНО — И ЭТО СКАЗАНО. Строка без работы живёт по старой
              деривации из пары (глагол, машинка): имя в триггере настоящее, но в базе его нет, и
              сервер про эту строку по-прежнему ничего не знает. Молчать об этом значило бы выдать
              двоекодье за разметку. */}
          {!workValue && derivedKind && (
            <Text size='micro' variant='label' component='p' data-work-derived={index}>
              derived from what is recorded — no kind stored on this step yet
            </Text>
          )}
          {/* ДВА РАЗНЫХ НЕЗНАНИЯ, И ПУТАТЬ ИХ НЕЛЬЗЯ. «Каталог приехал, а токена в нём нет» это
              работа НОВЕЕ бандла. «Каталог не приехал» это ничего не говорит о самой работе — и
              сказать «новее бандла» в этом случае значило бы соврать про запись из-за сбоя сети.
              Обе ветки одинаковы в главном: токен цел и уедет обратно тем же. */}
          {workValue &&
            !activeWork &&
            (catalogLive ? (
              <Text size='micro' variant='label' component='p' data-work-unknown={workValue}>
                this kind came from a newer version of the app — it is kept exactly as it is
              </Text>
            ) : (
              <Text size='micro' variant='label' component='p' data-work-unnamed={workValue}>
                the catalogue did not load, so this kind cannot be named — it is kept as it is
              </Text>
            ))}
        </div>
        <SelectField
          name={`operations.${index}.operationType`}
          label='operation *'
          items={operationTypeOptionsFor(opType)}
          className={selectNoGrow}
        />
        {/* «НА ЧЁМ» — СУЖЕННЫЙ СПИСОК И ДРУГОЕ СЛОВО НАД НИМ, когда вид якорится не машинкой.
            У отстрочки якорь — класс шва (`OS_TOPSTITCH`), а машинку шаг MACHINE обязан нести:
            сервер отвергает MACHINE без неё. Поэтому пункт машинку ставит, но не угадывает молча —
            вопрос стоит здесь, на виду, раскрытым. И смена машинки внутри списка вид НЕ меняет:
            переставил одноигольную на двухигольную — `seam_class` не тронулся, вид прежний. */}
        {isMachineStep && (
          <SelectField
            name={`operations.${index}.machineType`}
            label={askedMachines ? 'on what *' : 'machine *'}
            items={
              askedMachines
                ? machineTypeOptionsFor(machineType).filter(
                    (o) => askedMachines.includes(o.value) || o.value === machineType,
                  )
                : machineTypeOptionsFor(machineType)
            }
            className={selectNoGrow}
          />
        )}
        {isPressStep && (
          // Фокус-капчер — датчик «человек коснулся контрола» для распознавания очистки пикером;
          // сброс регистрации формы фокуса не имеет (довод у `pressTouchedRef`).
          <div
            className='space-y-px'
            onFocusCapture={() => {
              pressTouchedRef.current = true;
            }}
          >
            <SelectField
              name={`operations.${index}.pressEquipment`}
              label='equipment *'
              items={pressEquipmentOptions}
              className={selectNoGrow}
            />
            {applied.press && (
              <SuggestedMark
                field='press'
                what={pressEquipmentLabel(applied.press.equipment)}
                why='the card park holds exactly one press profile for this process'
                onDismiss={() => dropSuggested('press')}
              />
            )}
          </div>
        )}
        {/* ДИСКРИМИНАТОР ГЛАГОЛА — та же вторая ось, что машинка у «machine» и оборудование у ВТО,
            и стоит она здесь по тому же доводу: сервер требует её БЕЗУСЛОВНО, а обязательное поле
            за закрытым аккордеоном — это сохранение, падающее на контроле, которого нет на экране.
            У каждого из шести глаголов ровно один такой вопрос, поэтому в сетке всегда не больше
            одного лишнего селекта. */}
        {stepDiscriminator && (
          <SelectField
            name={`operations.${index}.${stepDiscriminator.field}`}
            label={stepDiscriminator.label}
            items={stepEnumOptions(
              stepDiscriminator.labels,
              stepDiscriminator.unset,
              discriminatorValue,
            )}
            className={selectNoGrow}
          />
        )}
        {/* ЗОНА — ЕДИНСТВЕННОЕ ПОДСТАВЛЯЕМОЕ ПОЛЕ, ВХОДЯЩЕЕ В ПОДПИСЬ КАРТОЧКИ, и поэтому метка
            рядом с ней обязательна, а не желательна: подписывают то, что видят. Фокус-капчер —
            датчик «человек коснулся контрола» (довод у `zoneTouchedRef`). */}
        <div
          className='space-y-px'
          onFocusCapture={() => {
            zoneTouchedRef.current = true;
          }}
        >
          <SelectField
            name={`operations.${index}.zone`}
            label='zone *'
            items={zoneOptions}
            className={selectNoGrow}
          />
          {applied.zone && (
            <SuggestedMark
              field='zone'
              what={zoneOptions.find((o) => o.value === applied.zone)?.label ?? applied.zone}
              why={zoneSuggestedWhy(inference.zone.sources)}
              onDismiss={() => dropSuggested('zone')}
            />
          )}
        </div>
        <DecimalField
          name={`operations.${index}.smv`}
          label='time, min'
          // ГОУСТ, А НЕ ЗНАЧЕНИЕ. Норма времени зависит от изделия, поэтому её не подставляют ни
          // при каком совпадении — её ПОКАЗЫВАЮТ в пустом поле и убирают, как только человек
          // набрал своё. Место занято тем же плейсхолдером, что и раньше, когда сказать нечего.
          //
          // ДВЕ СТУПЕНИ ПОДСКАЗКИ, И БЛИЖНЯЯ СИЛЬНЕЕ: сначала такой же шаг ЭТОЙ карточки (его
          // считает модуль выводимости), и только если такого нет — «в прошлый раз было
          // столько-то» с ЧУЖОЙ карточки, из каталога работ. Порядок тот же, что у дефолтов, и по
          // тому же доводу: контекст ближе весомее. Каталожная ступень существует только у строки
          // с НАЗВАННОЙ работой — по паре осей такую подсказку не собрать, и это честно.
          placeholder={smvHint ? `last: ${smvHint.text}` : '1.8'}
          title={smvHint?.why}
          data-smv-hint={smvHint?.text || undefined}
          min={0}
        />
        <SelectField
          name={`operations.${index}.calloutNumber`}
          label='sketch pin'
          items={rowPinOptions}
          valueAsNumber
          className={selectNoGrow}
        />
      </div>

      {/* ── ЗОНА СВОЙСТВ ВИДА — ВСЕГДА РАСКРЫТА, СТВОРКИ У НЕЁ НЕТ ─────────────────────────────
          ЧТО ЗДЕСЬ ЛЕЖИТ И ПОЧЕМУ ИМЕННО ЭТО. Правило одно и проверяемое: в створке — то, у чего
          ПУСТОЕ ПОЛЕ ЗНАЧИТ «НАСЛЕДУЙ»; здесь — то, у чего пустое значит «НИКТО НЕ СКАЗАЛ». Оно
          совпадает с тем, как поля устроены в контракте, поэтому его не придётся помнить:
          наследуются только те, у кого есть источник выше (профиль парка или карточные дефолты), а
          у тридцати двух колонок волны источника выше нет ни одного.
          ЭТО И ЕСТЬ ГЛАВНАЯ ПОЧИНКА. Раньше всё содержательное лежало в свёрнутой створке, чьё имя
          и было дефектом: «differs from standard» читается как «сюда только исключения», — а
          свойства вида не исключения, они и есть вид. Владелец открыл шаг, прочитал «inherits
          everything» и закрыл. */}
      <GroupLabel
        action={
          kindFactCount > 0 ? (
            <Pill tone='attention'>{kindFactCount}</Pill>
          ) : kindHasControls ? (
            <Text size='micro' variant='label' component='span'>
              nothing stated yet
            </Text>
          ) : undefined
        }
      >
        {/* ИМЯ РАБОТЫ БЕРЁТСЯ ИЗ КАТАЛОГА, когда работа названа: он авторитетен, а не бандл. */}
        {workLabel ? `${workLabel} — how it is done` : 'how it is done'}
      </GroupLabel>

      {/* ЧТО ПОДСТАВИЛ ВЫБОР РАБОТЫ — НАЗВАНО ПОИМЁННО И СНИМАЕТСЯ КАСАНИЕМ.
          Подстановка это ЗАПИСЬ по человеческому жесту (выбрал работу), поэтому значение живёт
          дальше само; метка не владеет им, а объясняет происхождение — «с шага 120 этой карточки»
          или «твой дефолт для этой работы» — и даёт стереть, если оно не к месту. Метка гаснет
          сама: человек поправил поле (значение разошлось с нашим) или карточка сохранилась
          (значение стало базой формы). Обоих условий здесь не хранится флажком — они считаются. */}
      {prefillNotice.length > 0 && (
        <div className='mb-1 flex flex-wrap items-center gap-1' data-work-prefill={index}>
          <Text size='micro' variant='label' component='span'>
            prefilled ·
          </Text>
          {prefillNotice.map((f) => (
            <button
              key={f.field}
              type='button'
              data-prefill-field={f.field}
              data-prefill-source={f.source}
              onClick={() => dropPrefilled(f.field)}
              title={
                f.source === 'card'
                  ? `carried from step ${f.fromStep} of this card — click to clear it`
                  : `your saved default for “${f.workLabel}” — click to clear it`
              }
              className='inline-flex max-w-full items-center gap-1 border border-warning px-[7px] py-px text-micro uppercase tracking-pill text-warning'
            >
              <span className='truncate'>
                {stepFields.find((sf) => (sf.field as string) === f.field)?.label ?? f.field} ·{' '}
                {f.source === 'card' ? `from step ${f.fromStep}` : 'your default'}
              </span>
              <span aria-hidden>✕</span>
            </button>
          ))}
        </div>
      )}

      {/* «У МЕНЯ ЭТА РАБОТА ВСЕГДА ТАКАЯ» — ЖЕСТ, НАРИСОВАННЫЙ ПО СЕРВЕРНОМУ РЕЕСТРУ.
          Список полей приходит в ответе каталога и есть тот же срез, которым RPC проверяет
          присланное имя: машинные и ВТО-настройки в него не входят вовсе (у них своя лестница
          наследования 0306), и кнопки над ними не появится. Свой, клиентский список здесь
          разошёлся бы с принимающим молча — и человек жал бы кнопку, всегда отвечающую отказом. */}
      {activeWork && rememberableDefaults.length > 0 && (
        <div className='mb-1 flex flex-wrap items-center gap-1' data-work-defaults={activeWork.token}>
          <Text size='micro' variant='label' component='span'>
            remember for “{activeWork.label}” ·
          </Text>
          {rememberableDefaults.map((r) => (
            <button
              key={r.column}
              type='button'
              data-remember-field={r.column}
              disabled={r.already || rememberDefault.isPending || frozen}
              onClick={() =>
                rememberDefault.mutate({
                  workToken: activeWork.token,
                  field: r.column,
                  value: r.value,
                })
              }
              title={
                r.already
                  ? `${r.label} = ${r.text} is already your default for this work`
                  : `save ${r.label} = ${r.text} as the default for every “${activeWork.label}” step`
              }
              className='inline-flex max-w-full items-center gap-1 border border-borderColor px-[7px] py-px text-micro uppercase tracking-pill disabled:opacity-40'
            >
              <span className='truncate'>
                {r.label} = {r.text}
                {r.already ? ' ✓' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* НЕСТАНДАРТНАЯ КОМБИНАЦИЯ — НАЗЫВАЕТСЯ СЛОВАМИ, А НЕ ПОДМЕНЯЕТСЯ БЛИЖАЙШИМ ПУНКТОМ.
          Пара, не соответствующая ни одному виду, законна: ручная комбинация, токен новее этого
          бандла, недозаполненный шаг. Выдумать здесь «похожий» вид значило бы соврать о шаге, а
          что-нибудь почистить — потерять чужую работу. Показываются имя из самих осей и обе оси
          контролами выше, которые никуда не делись. */}
      {!activeKind && opType !== NONE_OP_TYPE && (
        <Text size='micro' variant='label' className='mb-1'>
          non-standard combination — {OPERATION_TYPE_LABELS[opType as common_TechCardOperationType] ?? opType}
          {isMachineStep && machineType !== NONE_MACHINE ? ` · ${machineTypeLabel(machineType)}` : ''} — the
          two axes above stay editable and nothing has been changed
        </Text>
      )}

      {/* ШАГ БЕЗ ОБОРУДОВАНИЯ — ФРАЗА-СОСТОЯНИЕ И УКАЗАТЕЛЬ, А НЕ ПУСТОЕ МЕСТО. У складывания и
          упаковки сервер отвергает все пятнадцать полей оборудования и все тридцать две колонки
          видов, и это ВЫВОД, а не упущение: волна спросила, что нужно сказать шагу складывания, и
          ответ был «где он в последовательности и сколько занимает». Пустое место читается как
          «что-то не загрузилось», поэтому вместо него стоят слова. */}
      {activeKind && !kindHasControls && (
        <Text size='micro' variant='label' className='mb-1'>
          nothing further to set here — this step is described by the fields above
        </Text>
      )}
      {activeKind?.pointer && (
        <Text size='micro' variant='label' className='mb-1'>
          → {activeKind.pointer}
        </Text>
      )}

      {/* ПОЛОСА ОСТАТКОВ — НАД БЛОКАМИ СЕМЕЙСТВ. Здесь, а не в конце: заполненное, которого шаг
          не несёт, — это первое, что надо прочитать, открыв зону свойств, потому что именно оно не
          даст карточке сохраниться. Слово об этом — в самой полосе. */}
      <ResidueStrip
        rows={residueRows}
        errorRows={residueErrorRows}
        caption='set on this step, but its current kind shows no control for it — the values below are still sent on save, and any refusal lands here'
        onClear={clearResidueField}
      />

      {/* ОТСТРОЧКА — ТРИ ПОЛЯ, ПОДНЯТЫЕ ИЗ СТВОРКИ. Наследовать им неоткуда (ни профиль машинки, ни
          карточные дефолты про отступ и число рядов не говорят), значит по правилу раздела им
          место здесь. Показываются на машинном шаге — и на любом другом, где значение уже стоит:
          спрятанное число всё равно печатается на листе и всё равно двигает дайджест секции. */}
      {showTopstitch && (
        <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
        {/* Список — с оглядкой на то, что в шаге уже лежит: словарь режимов ТОТАЛЕН над
            контрактом, поэтому токен вне списка означает режим НОВЕЕ этого бандла (обычное
            состояние между выкаткой бэка и выкаткой клиента), а Radix рисует такое значение
            ПУСТЫМ триггером — и технолог читает «отстрочки нет» на шаге, где она есть. */}
        <SelectField
          name={`operations.${index}.topstitchMode`}
          label='topstitch'
          items={topstitchModeOptionsFor(topstitchMode)}
          className={selectNoGrow}
        />
        {/* Поле отступа стоит у режимов, которые число ПРИНИМАЮТ, и больше нигде: «in the ditch»
            меряет расстояние ноль по определению, и сервер число там отвергает по имени. У «at the
            edge» оно теперь есть и НЕОБЯЗАТЕЛЬНО — пустое значит «вплотную», — и это ровно то, чего
            в списке не хватало: пункт «at width from the edge» был этим же приёмом с числом.
            Классификация — в TOPSTITCH_MODES; режим, который бандл классифицировать не может, поля
            не показывает — безобидная половина сделки (значение при этом продолжает ездить). */}
        {showTopstitchWidth && (
          <>
            {/* ПОДПИСЬ НАЗЫВАЕТ ЛИНИЮ, ОТ КОТОРОЙ МЕРЯЮТ, И МЕНЯЕТСЯ ВМЕСТЕ С РЕЖИМОМ. Владелец —
                практикующий технолог — спросил «у нас есть row spacing, но нет отступа от края»,
                глядя ровно на это поле: подпись «topstitch width, mm» называла величину и молчала
                о том, от чего она отсчитывается. Молчать здесь нельзя вдвойне — одно и то же поле
                при `at the edge` меряется ОТ КРАЯ ДЕТАЛИ, а при `parallel to the seam` ОТ ЛИНИИ
                ШВА, и на настрочном или запошивочном шве это разные линии. Слова берутся из
                TOPSTITCH_MODES, откуда их берёт и печатный лист: второй копии не заводится, иначе
                технолог наберёт число под одной линией, а швея прочитает другую. */}
            <div className='flex flex-col gap-0.5'>
              <DecimalField
                name={`operations.${index}.topstitchWidthMm`}
                label={topstitchWidthLabel(topstitchMode)}
                maxDecimals={1}
                placeholder='6'
              />
              {/* ПУСТОЕ ПОЛЕ ЗДЕСЬ — ОТВЕТ, А НЕ ПРОПУСК, и сказать это обязано оно само. Пока «по
                  краю» и «на столько-то от края» были ДВУМЯ пунктами списка, пустоте нечего было
                  значить, и её никто не оставлял; теперь пункт один, и незаполненное числовое поле
                  само по себе читается как «забыли», а не как «вплотную». Слова — из той же карты,
                  что подпись выше: линию они называют одну. Строка снимается, как только число
                  набрано, — при заполненном поле она сообщала бы про состояние, которого нет. */}
              {topstitchWidthMm.trim() === '' && topstitchBlankMeans(topstitchMode) && (
                <Text size='micro' variant='label'>
                  {topstitchBlankMeans(topstitchMode)}
                </Text>
              )}
            </div>
            {/* РЯДЫ ЧЕГО. Голое «rows» — счётчик без предмета, а предмет тут спорный: рядами в
                этой же карточке зовутся и строчки отстрочки (здесь), и соседние строчки, между
                которыми меряется «spacing between stitch rows» в игольном блоке ниже. Это те же
                самые ряды, но живут они в двух разных блоках, и связать их обязана подпись. */}
            <SelectField
              name={`operations.${index}.topstitchRows`}
              label='rows of topstitching'
              items={TOPSTITCH_ROW_OPTIONS}
              valueAsNumber
              className={selectNoGrow}
            />
          </>
        )}
        </div>
      )}
      {/* ЛОВУШКА САМОГО КОНТРАКТА: нулевой член `TechCardTopstitchMode` значит НЕ «не указано», а
          «отстрочки нет», — то есть шаг-отстрочка с незаполненным режимом читается как «не
          отстрочка». Отказывать нельзя: шаг законно чертится раньше, чем известен отступ. Поэтому
          мягкое предупреждение, а не ошибка. */}
      {activeKind?.id === 'A2' && topstitchMode === NONE_TOPSTITCH && (
        <Text size='micro' variant='label' className='mb-1'>
          this is a topstitch step but the mode is not picked — on paper an unset mode reads as “no
          topstitching”
        </Text>
      )}

      {/* ── ВИДЫ ОПЕРАЦИЙ (0324): по блоку на семейство ───────────────────────────────────────
          Каждый показан РОВНО СВОЕМУ глаголу (и, где правило про машинку, — своей машинке), теми
          же предикатами, которыми маппер решает, что уедет на провод. Пусто здесь не значит ноль
          и не значит «нет»: явное «нет» у семи словарей есть отдельным ответом. Наследовать этим
          полям неоткуда — лестницы у них нет, — поэтому плейсхолдер числовых полей ПРИМЕР, а не
          обещание. */}

      {/* S — как ложится строчка. Только MACHINE, при любой машинке. */}
      {showStitching && (
        <>
          <GroupLabel>stitch detail</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            {/* ЧЕТЫРЕ ИГОЛЬНЫХ КОНТРОЛА — НЕ НА СВАРОЧНОЙ МАШИНЕ. Ни иглы, ни нитки у неё нет, и
                сервер отвергает всю четвёрку по имени, отказывая вместе с ней всей карточкой:
                нарисовать их значило бы предложить заполнить поле, которое сохранение не
                переживёт. Посадка и шов этикетки ниже остаются — они не про иглу. */}
            {showNeedleFacts && (
              <>
                <InheritableNumberField
                  name={`operations.${index}.needleCount`}
                  label='needles'
                  value={needleCount}
                  placeholder='1'
                />
                {/* КАЛИБР МЕРЯЕТ РАССТОЯНИЕ МЕЖДУ ИГЛАМИ, поэтому на одной игле он измеряет ничто —
                    сервер такую пару отвергает, а очистка выше стирает число, оставшееся от двух.
                    И ПОДПИСЬ ГОВОРИТ «МЕЖДУ ИГЛАМИ» ВСЛУХ: «needle gauge» в цехе означает и зазор
                    между иглами, и ТОЛЩИНУ иглы, а толщина у шага уже есть — «needle size, Nm» в
                    блоке машинки. Два разных измерения про иглу на одном экране под похожими
                    словами — ровно тот случай, ради которого подпись и переписывается. */}
                {showNeedleGauge && (
                  <DecimalField
                    name={`operations.${index}.needleGaugeMm`}
                    label='gauge between needles, mm'
                    maxDecimals={1}
                    placeholder='6.4'
                  />
                )}
                <SelectField
                  name={`operations.${index}.seamSecuring`}
                  label='securing'
                  items={stepEnumOptions(SEAM_SECURING_LABELS, '— not stated —', seamSecuring)}
                  className={selectNoGrow}
                />
                {/* Между РЯДАМИ строчек. Не путать с калибром выше: тот — между иглами одного ряда.
                    Контракт различает их явно («не путать с needle_gauge_mm»), а подпись «row
                    spacing, mm» этого не передавала: она называла величину, но не говорила, между
                    чем меряется, — и владелец прочитал в ней отступ от края. */}
                <DecimalField
                  name={`operations.${index}.rowSpacingMm`}
                  label='spacing between stitch rows, mm'
                  maxDecimals={1}
                  placeholder='6'
                />
              </>
            )}
            {/* ОТНОШЕНИЕ, а не проценты: 1.0 — слои идут один в один, 2.0 — присборить вдвое. */}
            <DecimalField
              name={`operations.${index}.fullnessRatio`}
              label='ease / gathering, ratio'
              maxDecimals={2}
              placeholder='1.0'
            />
            {showBindingStyle && (
              <SelectField
                name={`operations.${index}.bindingStyle`}
                label='binding fold'
                items={stepEnumOptions(BINDING_STYLE_LABELS, '— not stated —', bindingStyle)}
                className={selectNoGrow}
              />
            )}
            <SelectField
              name={`operations.${index}.labelAttachStitch`}
              label='label stitched'
              items={stepEnumOptions(
                LABEL_ATTACH_STITCH_LABELS,
                '— not stated —',
                labelAttachStitch,
              )}
              className={selectNoGrow}
            />
          </div>
        </>
      )}

      {/* FA — петли, закрепки, пуговицы, молнии. Каждое поле при СВОЁМ явном типе машины: это
          факт о машинке, а не о глаголе, и тип, разрешённый через профиль, не засчитывается. */}
      {showFastening && (
        <>
          <GroupLabel>fastening detail</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            {/* ТРИ УСЛОВИЯ ВМЕСТО ОДНОГО ФРАГМЕНТА: у длины прорези свой гейт (два входа), а
                форма и направление петли остаются при петельной машине. Порядок сохранён именно
                разбивкой — на петельном автомате человек по-прежнему читает «форма → длина →
                направление», а на зигзаге видит ровно одно поле, которое там законно. */}
            {showButtonhole && (
              <SelectField
                name={`operations.${index}.buttonholeStyle`}
                label='buttonhole shape'
                items={stepEnumOptions(BUTTONHOLE_STYLE_ITEMS, '— not stated —', buttonholeStyle)}
                className={selectNoGrow}
              />
            )}
            {showCutLength && (
              <DecimalField
                name={`operations.${index}.cutLengthMm`}
                label={cutLengthLabel}
                maxDecimals={1}
                placeholder='19'
              />
            )}
            {showButtonhole && (
              <SelectField
                name={`operations.${index}.buttonholeOrientation`}
                label='buttonhole direction'
                items={stepEnumOptions(
                  BUTTONHOLE_ORIENTATION_ITEMS,
                  '— not stated —',
                  buttonholeOrientation,
                )}
                className={selectNoGrow}
              />
            )}
            {/* Закрепка есть и у петлевой машины — ею закрепляют концы прорези. */}
            {showBartack && (
              <DecimalField
                name={`operations.${index}.bartackLengthMm`}
                label='bartack length, mm'
                maxDecimals={1}
                placeholder='7'
              />
            )}
            {showAttachPattern && (
              <SelectField
                name={`operations.${index}.attachPattern`}
                label='button pattern'
                items={stepEnumOptions(
                  BUTTON_ATTACH_PATTERN_LABELS,
                  '— not stated —',
                  attachPattern,
                )}
                className={selectNoGrow}
              />
            )}
            {showZipper && (
              <SelectField
                name={`operations.${index}.zipperApplication`}
                label='zip application'
                items={stepEnumOptions(
                  ZIPPER_APPLICATION_LABELS,
                  '— not stated —',
                  zipperApplication,
                )}
                className={selectNoGrow}
              />
            )}
          </div>
        </>
      )}

      {/* W — сварка и проклейка: две машинки, соединяющие теплом, а не ниткой. */}
      {showWeld && (
        <>
          <GroupLabel>welding</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            {/* Горячий воздух есть только у проклейки шва: ультразвуковой горн греет сам
                материал, воздуха у него нет вовсе — и сервер отвергает число по имени. */}
            {showAirTemperature && (
              <InheritableNumberField
                name={`operations.${index}.airTemperatureC`}
                label='hot air, °C'
                value={airTemperatureC}
                placeholder='450'
              />
            )}
            <DecimalField
              name={`operations.${index}.feedSpeedMMin`}
              label='feed speed, m/min'
              maxDecimals={1}
              placeholder='4.0'
            />
          </div>
        </>
      )}

      {/* PL — сколько раз шаг повторяется по изделию и с каким шагом. MACHINE | HARDWARE_SET |
          PRINT: три кнопки в ряд, четыре люверса по краю и два отпечатка — один вопрос. */}
      {showPlacement && (
        <>
          <GroupLabel>repeats</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            <InheritableNumberField
              name={`operations.${index}.placementCount`}
              label='repeats'
              value={placementCount}
              placeholder='1'
            />
            {/* Шаг меряет промежуток МЕЖДУ повторами: на одном повторе мерить нечего. */}
            {showPitch && (
              <DecimalField
                name={`operations.${index}.pitchMm`}
                label='pitch, mm'
                maxDecimals={1}
                placeholder='80'
              />
            )}
          </div>
        </>
      )}

      {/* H — установка фурнитуры. На цикловом автомате (петля / пуговица / закрепка) от блока
          остаётся ровно тройка «отверстие / усилитель / стежки цикла»: способа крепления и
          стропы, которую подгибают, у них нет, и сервер отвергает эти два поля по имени. */}
      {showHardware && (
        <>
          <GroupLabel>hardware detail</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            <SelectField
              name={`operations.${index}.holePrep`}
              label='hole prep'
              items={stepEnumOptions(HOLE_PREP_LABELS, '— not stated —', holePrep)}
              className={selectNoGrow}
            />
            {/* ЧЕМ усилено — строка BOM; здесь только КАК. */}
            <SelectField
              name={`operations.${index}.reinforcement`}
              label='reinforcement'
              items={stepEnumOptions(REINFORCEMENT_LABELS, '— not stated —', reinforcement)}
              className={selectNoGrow}
            />
            <InheritableNumberField
              name={`operations.${index}.cycleStitchCount`}
              label='cycle stitches'
              value={cycleStitchCount}
              placeholder='28'
            />
            {/* Подгиб стропы есть только у продеваемой фурнитуры — у пряжки и рамки. */}
            {showFoldback && (
              <DecimalField
                name={`operations.${index}.foldbackMm`}
                label='webbing foldback, mm'
                maxDecimals={1}
                placeholder='40'
              />
            )}
          </div>
        </>
      )}

      {/* P — что происходит с нанесением после прижима. Гравировки здесь нет вовсе: лазер снимает
          материал сам, носителя нет и прижимать нечем — при выборе метода блок исчезает, а
          очистка выше стирает то, что успели поставить.

          ТЕМПЕРАТУРА, ВЫДЕРЖКА И СИЛИКОНОВАЯ БУМАГА ЖИВУТ НЕ ЗДЕСЬ, а в блоке «pressing mode»
          выше: печать берёт их взаймы у термопресса, и это те же самые поля, что у ВТО-шага, а не
          третья их копия. Здесь — только то, что бывает ТОЛЬКО у нанесения: съём носителя, второй
          прижим и шкала манометра.

          И ПОТОМУ ДВА БЛОКА ОТВЕЧАЮТ НА ГРАВИРОВКУ ПО-РАЗНОМУ: этот гаснет и стирается, ВТО-блок
          выше остаётся стоять с отказом на каждом поле. Довод — у `ownsPressSettings`. */}
      {showPrint && (
        <>
          <GroupLabel>press &amp; peel</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            {/* Слово о температуре — вся инструкция: горячий пилинг, стянутый холодным, поднимает
                печать вместе с плёнкой. */}
            <SelectField
              name={`operations.${index}.peelMode`}
              label='peel'
              items={stepEnumOptions(PEEL_MODE_LABELS, '— not stated —', peelMode)}
              className={selectNoGrow}
            />
            <InheritableNumberField
              name={`operations.${index}.secondPressSec`}
              label='second press, sec'
              value={secondPressSec}
              placeholder='5'
            />
          </div>
        </>
      )}

      {/* T — сколько припуска ОСТАЁТСЯ после подрезки. Не тот, с каким кроили (seam allowance
          выше): это два разных числа об одном шве, и на листе они стоят рядом. */}
      {showTrim && (
        <>
          <GroupLabel>trim detail</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            <DecimalField
              name={`operations.${index}.residualAllowanceMm`}
              label='allowance left, mm'
              maxDecimals={1}
              placeholder='3'
            />
          </div>
        </>
      )}

      {/* F — самый длинный хвост нитки, который допускается оставить. Пусто = стандарт цеха. */}
      {showThreadTrim && (
        <>
          <GroupLabel>thread tails</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            <DecimalField
              name={`operations.${index}.residualTailMaxMm`}
              label='longest tail, mm'
              maxDecimals={1}
              placeholder='3'
            />
          </div>
        </>
      )}

      {/* G — ЧТО ИМЕННО ДЕЛАЕТ УТЮГ, И КУДА ЛЁГ ПРИПУСК (0325). До этой волны глагол PRESS был
          мешком из семи приёмов: подпись обещала «to one side / steam», а сказать это было нечем —
          разница уезжала в прозу note, которой нет ни в подписи карточки, ни на печатном листе.

          ЗДЕСЬ, А НЕ В СТВОРКЕ: у обоих полей пустое значит «никто не сказал», а не «наследуй», —
          ступени выше у них нет ни в профиле пресса, ни в карточных дефолтах.

          НАПРАВЛЕНИЕ ПОЯВЛЯЕТСЯ ТОЛЬКО ПРИ «ЗАУТЮЖИТЬ» И ТАМ ОБЯЗАТЕЛЬНО. При остальных приёмах
          припуск никуда не укладывается: контрол не «необязателен», он бессмыслен, и сервер
          отвергает поле по имени. Отказ за него ставит zod — на самом контроле, а не тостом после
          сохранения шести вкладок. */}
      {showPressAction && (
        <>
          <GroupLabel>press detail</GroupLabel>
          <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
            {/* Список — с оглядкой на то, что в шаге уже лежит: словарь ТОТАЛЕН над контрактом,
                поэтому токен вне списка означает приём НОВЕЕ этого бандла, а Radix нарисовал бы
                такое значение ПУСТЫМ триггером — и технолог прочитал бы «не указано» там, где
                указано. */}
            <SelectField
              name={`operations.${index}.pressAction`}
              label='press action'
              items={stepEnumOptions(PRESS_ACTION_LABELS, '— not stated —', pressAction)}
              className={selectNoGrow}
            />
            {showPressToward && (
              <SelectField
                name={`operations.${index}.pressToward`}
                label='allowance goes *'
                items={stepEnumOptions(PRESS_TOWARD_LABELS, '— which way —', pressToward)}
                className={selectNoGrow}
              />
            )}
          </div>
        </>
      )}

      {/* СВОДКИ ОДНОЙ СТРОКОЙ — ПО ТОМУ, ЧТО ОСТАЛОСЬ В СТВОРКЕ. Не перенос полей, а именно сводка:
          в открытом состоянии шаг обязан ГОВОРИТЬ ФАКТАМИ, а не показывать пустоту с надписью
          «inherits everything». Клик раскрывает створку — редактируется всё там же, где и раньше. */}
      {(isMachineStep || ownsPressSettings || showSeamSummary) && (
        <div className='mt-1.5 space-y-px'>
          {isMachineStep && (
            <button
              type='button'
              onClick={() => setOverridesOpen(true)}
              className='block w-full text-left'
            >
              <Text size='micro' variant='label' component='span'>
                machine · {machineSummaryText || 'no profile — nothing is inherited'}
              </Text>
            </button>
          )}
          {ownsPressSettings && (
            <button
              type='button'
              onClick={() => setOverridesOpen(true)}
              className='block w-full text-left'
            >
              <Text size='micro' variant='label' component='span'>
                pressing · {pressSummaryText || 'no press picked — no temperature stated'}
              </Text>
            </button>
          )}
          {showSeamSummary && (
            <button
              type='button'
              onClick={() => setOverridesOpen(true)}
              className='block w-full text-left'
            >
              <Text size='micro' variant='label' component='span'>
                seam · {seamSummaryText || 'nothing stated — the card’s own standard applies'}
              </Text>
            </button>
          )}
        </div>
      )}

      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span'>
            {pieceSource.groupHint}
          </Text>
        }
      >
        pieces this step joins
      </GroupLabel>
      <ChipRow>
        {chosenPieces.map((k) =>
          tiled ? (
            // Убрать — крестиком В УГЛУ плитки, а не кликом по ней самой: плитка достаточно
            // крупная, чтобы по ней хотелось нажать, и «нажал посмотреть — отвязал деталь» здесь
            // стоило бы молча потерянной связи шага с деталью.
            <span key={k} className='relative inline-flex border border-borderColor bg-bgColor'>
              {/* Ткань — той же картой, что у лотка прямо над этим списком: одна деталь не имеет
                  права быть заштрихованной в лотке и чистой здесь. Ключ СЫРОЙ (`chosenPieces`
                  отфильтрован по `byKey`, то есть это lineKey детали), не `pieceRefKey` — им
                  ключуются только контуры чертежа.
                  `pxBox` — ВНЕШНИЙ бокс плитки: обёртка размера не задаёт, плитка рисуется
                  собственным `size-14`, то есть ровно `TILE_BOX` 56×56. Передан явно, потому что
                  шаг решётки штриховки считается из него, и молчаливое совпадение с дефолтом —
                  не то же самое, что проверенное: сменят бокс здесь — увидят и это число. */}
              <PieceTile
                found={pieceShapes?.get(pieceRefKey(k)) ?? null}
                name={byKey.get(k)?.name ?? ''}
                cloth={cloth?.get(k) ?? null}
                pxBox={TILE_BOX}
              />
              <button
                type='button'
                aria-label={`remove piece ${byKey.get(k)?.name ?? ''}`}
                title='remove the piece from the step'
                onClick={() => removePieceKey(k)}
                className='absolute top-0 right-0 flex size-4 items-center justify-center bg-bgColor/80 text-nano leading-none text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              >
                ✕
              </button>
            </span>
          ) : (
            <Chip key={k} title={byKey.get(k)?.name} onRemove={() => removePieceKey(k)}>
              {byKey.get(k)?.name}
            </Chip>
          ),
        )}
        {/* Сирота (деталь удалили на PATTERNS) остаётся ТОЛЬКО красным чипом: рисовать ей силуэт
            значило бы показать живую форму у ссылки, которая на сохранении оборвётся. */}
        {danglingPieces.map((k) => (
          <Chip
            key={k}
            tone='error'
            title={`piece ${k} was deleted on the patterns tab — the link is lost on save`}
            onRemove={() => removePieceKey(k)}
          >
            {`#${k.slice(-6)} — piece deleted`}
          </Chip>
        ))}
        {/* Вход-УЗЕЛ. Отдельным видом чипа, а не в общей куче: узел — это уже сшитая подсборка, и
            путать его с деталью значило бы скрыть от автора, что шаг берёт со стола. */}
        {chosenUnits.map((k) => (
          <Chip
            key={`u:${k}`}
            title={`unit ${k}: ${assembly.res.units.get(k)?.leaves.length ?? 0} pieces inside`}
            onRemove={() => removePieceKey(k)}
          >
            ▣ {k}
          </Chip>
        ))}
        <Chip dashed onClick={onFlashPieces} title={pieceSource.chipTitle}>
          ＋ piece
        </Chip>
      </ChipRow>
      {chosenPieces.length === 0 && danglingPieces.length === 0 && chosenUnits.length === 0 && (
        <Text size='micro' variant='label' className='mt-1'>
          {pieceSource.emptyNote}
        </Text>
      )}

      {/* НАРУШЕНИЯ ЭТОГО ШАГА — ЗДЕСЬ, А НЕ ТОЛЬКО НА СОХРАНЕНИИ.
          Клиент считает фронтир на каждое изменение, но до сих пор молчал о результате: гарды
          стояли только на путях ДОБАВЛЕНИЯ (лоток, drop, объявление узла), а пути, ломающие уже
          собранный граф, свободны — перестановка шагов, удаление шага-производителя, снятие
          чипа входа, удаление детали на другой вкладке, замена деталей модалкой DXF.
          Первичная разметка карточки обычно И ЕСТЬ перестановка, так что это не экзотика.
          Сервер такую запись отвергает по пути operations[i].input_keys[j], а у этого пути нет
          ни FormItem, ни FormMessage — текст не рендерился нигде, и автор видел «!» в рельсе с
          тултипом про «незаполненное обязательное поле», то есть про другое.
          «Пикер предлагает ровно то, что примет запись» было выполнено наполовину: предлагал
          ровно, но молча позволял разрушить уже принятое. */}
      {stepViolations.length > 0 && (
        <CalloutBox tone='error'>
          <div className='flex flex-col gap-0.5'>
            {stepViolations.map((v, i) => (
              <Text key={`${v.rule}:${v.detail}:${i}`} size='micro'>
                {v.message}
              </Text>
            ))}
          </div>
        </CalloutBox>
      )}

      <ProducesBlock
        index={index}
        inputKeys={selectedPieceKeys}
        pieces={pieces}
        assembly={assembly}
        onRename={onRenameUnit}
        onDissolve={onDissolveUnit}
        onEdit={onEdit}
      />

      {/* ФОТО УЗЛА С УКАЗАНИЯМИ. Стоит рядом с материалами, а не в аккордеоне отклонений:
          «что тут делать» — вопрос того же порядка, что «из чего», и прятать ответ за разворот
          значило бы прятать половину инструкции. */}
      <OperationMediaStrip
        name={`operations.${index}.media`}
        urlById={mediaUrls ?? EMPTY_MEDIA_URLS}
        frozen={frozen}
        // ДЕТАЛЬ НА УКАЗАНИИ — тем же пикером и теми же силуэтами, что и состав шага рядом.
        // Второй способ выбрать деталь на одном экране означал бы, что одна и та же деталь
        // называется в двух местах по-разному.
        renderPiecePicker={({ selected, onPick }) => (
          <PieceAddChip
            pieces={pieces}
            selected={selected}
            onPick={onPick}
            shapeOf={(k) => pieceShapes?.get(pieceRefKey(k)) ?? null}
          />
        )}
        pieceLabel={(k) => pieces.find((p) => p.lineKey === k)?.name}
        onEdit={onEdit}
      />

      <GroupLabel>materials this step consumes</GroupLabel>
      {linkableBoms.length === 0 ? (
        <Text size='micro' variant='label'>
          the BOM has no materials a step could consume — add hardware, thread, fusing, tape, trim
          or labels on the BOM tab
        </Text>
      ) : (
        <>
          <ChipRow>
            {/* These are what IS linked, not a choice inside a set, so they read as plain chips
                with a remove — an ink fill here would claim a selection state nothing contrasts
                against. */}
            {linkedMaterials.map((b) => (
              <Chip
                key={b.lineKey}
                // The kind when the line carries one — «молния» says more than «фурнитура» — and the
                // section as the fallback for every line not classified yet.
                title={kindLabel(b.kind) ?? LINKABLE_SECTION_LABEL[b.section ?? ''] ?? undefined}
                onRemove={() => {
                  // Снятая руками привязка — ответ человека: подставлять её обратно нельзя, иначе
                  // чип возвращался бы под курсором.
                  if (b.lineKey && b.lineKey === applied.thread) dismiss('thread');
                  toggleBom(b.lineKey ?? '');
                }}
                onMouseEnter={() => onActiveBomChange?.(b.lineKey ?? null)}
                onMouseLeave={() => onActiveBomChange?.(null)}
              >
                {b.name?.trim() || 'unnamed'}
              </Chip>
            ))}
            {unlinkedBoms.length > 0 && (
              <Chip
                dashed
                pressed={addingMaterial}
                onClick={() => setAddingMaterial((v) => !v)}
                title='link a BOM material — hardware, thread, fusing, tape, trim, label'
              >
                {addingMaterial ? '✕ cancel' : '＋ material'}
              </Chip>
            )}
          </ChipRow>
          {/* НИТКА ПОДСТАВЛЕНА — И СКАЗАНО, ЧТО ЭТО ПОДСТАНОВКА. Чип выше выглядит ровно как
              привязанный руками, поэтому метка стоит отдельной строкой: без неё «оно само» было бы
              неотличимо от «я это выбрал», и первая же ошибка вывода списалась бы на человека. */}
          {applied.thread && (
            <SuggestedMark
              field='thread'
              what={
                bomLines.find((b) => b.lineKey === applied.thread)?.name?.trim() || 'thread'
              }
              why='it is the only thread line in this BOM that fits the step'
              onDismiss={() => dropSuggested('thread')}
            />
          )}
          {/* The article each colourway resolves the slot to. Printed under the chips rather than
              inside them: the chip is the ROLE (the durable thing the step links), and folding a
              per-colourway article into it would claim the operation itself is colourway-specific. */}
          {slotArticles.map((slot, i) => (
            // Indexed key: toggleBom dedupes, but the AI-accept path and the save mapper do not, so
            // a persisted duplicate line key would otherwise collide here.
            <Text key={`${slot.lineKey}:${i}`} size='micro' variant='label' className='mt-1'>
              {slot.name} →{' '}
              {!slot.usedAnywhere
                ? 'the slot is not used in any colourway recipe'
                : slot.uniform
                  ? slot.uniformArticle
                  : slot.perColorway
                      .map((c) => `${c.label}: ${colorwayArticleText(c)}`)
                      .join(' · ')}
            </Text>
          ))}
          {addingMaterial && unlinkedBySection.length > 0 && (
            <div className='mt-1.5 space-y-1.5'>
              {unlinkedBySection.map(([section, lines]) => (
                <div key={section}>
                  <Text size='micro' variant='label'>
                    {LINKABLE_SECTION_LABEL[section] ?? section}
                  </Text>
                  <ChipRow>
                    {lines.map((b) => (
                      <Chip
                        key={b.lineKey}
                        onClick={() => {
                          toggleBom(b.lineKey ?? '');
                          if (unlinkedBoms.length === 1) setAddingMaterial(false);
                        }}
                      >
                        {b.name?.trim() || 'unnamed'}
                      </Chip>
                    ))}
                  </ChipRow>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {bomOutOfRange && (
        <Text size='micro' variant='error' className='mt-1'>
          the material was removed or moved — pick it again
        </Text>
      )}
      {/* Advisory, never a form error: a step CAN legitimately be drafted before its material
          exists in the BOM, and blocking the save would make the check the operator's enemy. */}
      {expectsMaterial && (
        <Text size='micro' variant='label' className='mt-1'>
          a step like this usually consumes {expectsMaterial.what} — no line is linked
        </Text>
      )}

      {/* DIFFERS FROM STANDARD — folded away, and empty on most steps. Everything in here inherits
          from the card when left blank, and the placeholder states WHAT it would inherit and FROM
          WHERE. The inherited value is never written into the field: that is the whole difference
          between «the technologist chose 4 st/cm» and «it defaulted to 4», and the old preset
          effect destroyed it on every row it touched. */}
      <Accordion
        open={overridesOpen || hasFoldedError}
        onOpenChange={setOverridesOpen}
        tone={hasFoldedError ? 'error' : 'default'}
        title={
          <Text size='control' variant='uppercase' tracking='label' component='span'>
            differs from standard
          </Text>
        }
        meta={
          overrideCount > 0 ? (
            <Pill tone='attention'>{overrideCount}</Pill>
          ) : (
            <Text size='micro' variant='label' component='span'>
              inherits everything
            </Text>
          )
        }
      >
        {/* THE MACHINE'S OWN SETTINGS — every one of them an override of the profile named above.
            Blank inherits, and the placeholder (or the picker's first option) says what would be
            inherited and from which profile. Bed and automation are deliberately absent: those are
            machine IDENTITY, and a step that needs another bed is a step on another machine. */}
        {isMachineStep && (
          <>
            <GroupLabel
              flush
              action={
                <div className='flex flex-wrap items-center justify-end gap-2'>
                  <Text size='micro' variant='label' component='span'>
                    {machineProfile ? `inherits ${machineSource}` : 'no profile — blanks stay unset'}
                  </Text>
                  {/* «These are not this step's exception, they are the card's normal.» The values
                      MOVE into the park and leave the step blank — the button lives in
                      equipment-park.tsx because it writes into the array CARD DEFAULTS owns, and a
                      write that misses that owner's own methods leaves a mounted list stale. */}
                  <AdoptMachineIntoProfile
                    index={index}
                    step={{
                      machineType,
                      machineProfileKey,
                      threadCount,
                      needleType,
                      needleSizeNm,
                      threadTension,
                      threadTensionNote,
                      stitchWidthMm,
                      stitchesPerCm,
                      attachmentKind,
                      attachmentSizeMm,
                    }}
                  />
                </div>
              }
            >
              machine settings
            </GroupLabel>
            <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
              <EncodedSelectField<string>
                name={`operations.${index}.machineProfileKey`}
                label='machine profile'
                items={machineProfileOptions}
                encode={(v) => (v?.trim() ? v : PROFILE_INHERIT)}
                decode={(o) => (o === PROFILE_INHERIT ? '' : o)}
                className={selectNoGrow}
              />
              <InheritableNumberField
                name={`operations.${index}.threadCount`}
                label='threads'
                value={threadCount}
                placeholder={inherited.threadCount}
              />
              <SelectField
                name={`operations.${index}.needleType`}
                label='needle point'
                items={withInheritLabel(needleTypeOptions, NONE_NEEDLE, inherited.needleType)}
                className={selectNoGrow}
              />
              <InheritableNumberField
                name={`operations.${index}.needleSizeNm`}
                label='needle size, Nm'
                value={needleSizeNm}
                placeholder={inherited.needleSizeNm}
              />
              <SelectField
                name={`operations.${index}.threadTension`}
                label='thread tension'
                items={withInheritLabel(
                  threadTensionOptions,
                  NONE_TENSION,
                  inherited.threadTension,
                )}
                className={selectNoGrow}
              />
              {/* The note QUALIFIES the scale («на 0.5 туже») — on its own it describes no setting
                  the next machine can be set to, which is why the server refuses the pair and why
                  the box only appears once the scale is answered.
                  ...UNLESS A NOTE IS ALREADY THERE. Hiding it the moment the tension goes back to
                  «inherit» would strand the text behind its own validation error: the schema refuses
                  the pair, the message lands on a control that is no longer rendered, and the save
                  stops working with nothing on screen to fix. Same rule as the sewing block below —
                  a value that EXISTS is shown wherever it is, and the operator clears it. */}
              {(threadTension !== NONE_TENSION || threadTensionNote.trim() !== '') && (
                <InputField
                  name={`operations.${index}.threadTensionNote`}
                  label='tension note'
                  maxLength={64}
                  placeholder='0.5 tighter, dial 4'
                />
              )}
              {/* «stitch width» is the zigzag amplitude / the overlock bite — the width of the
                  STITCH ITSELF, which is what the dial on the machine is called, so the caption
                  keeps that name. NOT the topstitch distance, which is a gap between the stitch
                  line and the edge (or the seam line) and lives in the topstitch block above; that
                  one no longer says «width» at all, precisely so these two cannot read as one
                  setting where they print side by side on the tech pack. */}
              <DecimalField
                name={`operations.${index}.stitchWidthMm`}
                label='stitch width, mm'
                maxDecimals={1}
                placeholder={inherited.stitchWidthMm}
              />
            </div>
          </>
        )}

        {/* THE ВТО MODE — the press twin of the block above. Same rule throughout: blank inherits
            the profile, and the three-valued steam control keeps «not stated» apart from «press it
            dry», which is an instruction somebody gave.

            `ownsPressSettings`, А НЕ `isPressStep`: печать берёт термопресс взаймы, и температура,
            выдержка, давление, пар и силиконовая бумага — её законные факты, хотя ВТО и не является
            тем, ЧТО шаг делает. Обязательности пикера оборудования это не расширяет: она живёт на
            трёх ВТО-глаголах, пикер стоит выше, в ядре, и печати не показывается — `press_equipment`
            у неё опционален и попадает на шаг только вместе с переключённым глаголом. */}
        {ownsPressSettings && (
          <>
            <GroupLabel
              flush
              action={
                <div className='flex flex-wrap items-center justify-end gap-2'>
                  <Text size='micro' variant='label' component='span'>
                    {pressProfile ? `inherits ${pressSource}` : 'no profile — blanks stay unset'}
                  </Text>
                  {/* ПРОДВИЖЕНИЕ В КАРТОЧНЫЙ ПРОФИЛЬ — только у ВТО-глаголов, и это не половинчатость.
                      Новый профиль штампуется процессом ШАГА (`operationType: step.operationType`),
                      а пикер процесса в парке знает ровно «any» и три ВТО-глагола: продвинутый с
                      печати режим стал бы профилем «для печати», который парк не может ни показать,
                      ни отредактировать. Печатному шагу остаётся выбрать готовый режим — что и есть
                      «взять пресс взаймы». */}
                  {isPressStep && (
                    <AdoptPressIntoProfile
                      index={index}
                      step={{
                        operationType: opType,
                        pressEquipment,
                        pressProfileKey,
                        pressTemperatureC,
                        pressDwellSec,
                        pressPressureNCm2,
                        pressSteam,
                        pressCloth,
                      }}
                    />
                  )}
                </div>
              }
            >
              pressing mode
            </GroupLabel>
            <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
              <EncodedSelectField<string>
                name={`operations.${index}.pressProfileKey`}
                label='press profile'
                items={pressProfileOptions}
                encode={(v) => (v?.trim() ? v : PROFILE_INHERIT)}
                decode={(o) => (o === PROFILE_INHERIT ? '' : o)}
                className={selectNoGrow}
              />
              <InheritableNumberField
                name={`operations.${index}.pressTemperatureC`}
                label='temperature, °C'
                value={pressTemperatureC}
                placeholder={inherited.pressTemperatureC}
              />
              <InheritableNumberField
                name={`operations.${index}.pressDwellSec`}
                label='dwell, sec'
                value={pressDwellSec}
                placeholder={inherited.pressDwellSec}
              />
              {/* The unit is IN THE NAME on both sides of the wire: pressure on a press is quoted in
                  bar, in kg and in N/cm² depending on who is talking, and a bare «pressure» field
                  would be filled in three different units by three people. */}
              <DecimalField
                name={`operations.${index}.pressPressureNCm2`}
                label='pressure, N/cm²'
                maxDecimals={1}
                placeholder={inherited.pressPressureNCm2}
              />
              <EncodedSelectField<boolean | undefined>
                name={`operations.${index}.pressSteam`}
                label='steam'
                items={[
                  {
                    value: 'inherit',
                    label:
                      inherited.pressSteam === NOT_SET
                        ? '— inherit —'
                        : `inherit: ${inherited.pressSteam}`,
                  },
                  { value: 'yes', label: 'with steam' },
                  { value: 'no', label: 'no steam — press dry' },
                ]}
                encode={(v) => (v === undefined ? 'inherit' : v ? 'yes' : 'no')}
                decode={(o) => (o === 'inherit' ? undefined : o === 'yes')}
                className={selectNoGrow}
              />
              <SelectField
                name={`operations.${index}.pressCloth`}
                label='press cloth'
                items={withInheritLabel(pressClothOptions, NONE_PRESS_CLOTH, inherited.pressCloth)}
                className={selectNoGrow}
              />
            </div>
          </>
        )}

        {/* THE SEAM AND THE STITCH. Hidden on a ВТО step — there is no seam class to press and no
            density to iron — but only while the step actually holds none of them: a value that
            EXISTS is shown wherever it is, because a hidden number still prints on the tech pack
            and still moves the section digest, and clearing somebody's input on a type switch is
            not this form's decision to make. */}
        {showSewingOverrides && (
          <>
            {/* Not `flush`: this label follows a block, it does not open one. */}
            {(isMachineStep || isPressStep) && (
              <GroupLabel
                action={
                  isPressStep ? (
                    <Text size='micro' variant='label' component='span'>
                      set while this was a sewing step — clear what no longer applies
                    </Text>
                  ) : undefined
                }
              >
                seam &amp; stitch
              </GroupLabel>
            )}
            <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3'>
              <SelectField
                name={`operations.${index}.seamClass`}
                label='seam class'
                items={seamClassOptions}
                className={selectNoGrow}
              />
              <DecimalField
                name={`operations.${index}.seamAllowanceMm`}
                label='seam allowance, mm'
                maxDecimals={1}
                placeholder={inherited.seamAllowance}
              />
              <DecimalField
                name={`operations.${index}.stitchesPerCm`}
                label='stitches / cm'
                // Hundredths — the column's scale. The mirror below already rounds to two when it
                // converts a length back into a density.
                maxDecimals={2}
                placeholder={inherited.stitchDensity}
              />
              {/* The same setting in the other unit — see StitchLengthMirror. It is placed after the
                  density, not instead of it, because the density is what is stored and what the
                  card's own default is expressed in. */}
              <StitchLengthMirror
                index={index}
                density={stitchesPerCm}
                placeholder={inherited.stitchLength}
              />
              <SelectField
                name={`operations.${index}.attachmentKind`}
                label='attachment'
                items={withInheritLabel(attachmentOptions, NONE_ATTACHMENT, inherited.attachment)}
                className={selectNoGrow}
              />
              {showAttachmentSize && (
                <DecimalField
                  name={`operations.${index}.attachmentSizeMm`}
                  label='attachment size, mm'
                  maxDecimals={1}
                  placeholder='8'
                />
              )}
            </div>
          </>
        )}

      </Accordion>

      {/* ONE free-text box, not two. `description` and `note` used to sit side by side with no rule
          saying which was which, so two cards filled them the opposite way round. */}
      <div className='mt-2'>
        <TextareaField name={`operations.${index}.note`} label='note' rows={2} maxLength={1000} />
      </div>
    </div>
  );
}

type ReplaceImpact = {
  operations: number;
  sam: number;
  pieceLinks: number;
  units: number;
  photos: number;
  equipment: number;
};

// #66: draft assembly operations from a plain-language description — «мы описываем все операции
// словами (у нас есть знания о деталях/BOM), через OpenRouter генерируем структурированные
// операции, технолог проверит». Collapsed by default: an optional accelerant next to the manual
// «+ операция» flow, not a replacement for it. Never persists on its own — a successful generation
// only stages a DRAFT for review; the technologist explicitly appends or replaces it into the
// real (editable) operations list below, then saves through the normal tech-card save.
//
// «заменить весь список» now states its price before it is paid: the pick kept this panel, it did
// not ask to keep it dangerous.
function GenerateOperationsPanel({
  techCardId,
  hasExistingOperations,
  readReplaceImpact,
  onAccept,
  frozen = false,
  workCatalog,
}: {
  techCardId?: number;
  hasExistingOperations: boolean;
  /**
   * Каталог работ — ПРОПОМ, а не своим хуком: предпросмотр обязан называть шаг ровно тем же
   * словом, каким назовёт его список после вставки, и брать это слово из того же каталога.
   * Сегодня генератор поля `work` не заполняет, и все строки черновика идут выведенным именем;
   * начнёт заполнять — предпросмотр не соврёт задним числом.
   *
   * Обязателен тем же приёмом, что аргументы композитора: «предпросмотр без каталога» — решение
   * вызывателя, написанное `undefined` вслух, а не забытый проп.
   */
  workCatalog: WorkCatalog | undefined;
  // Counted at the moment the button is pressed rather than watched continuously — this panel does
  // not need to re-render on every keystroke in the 14 operations above it.
  readReplaceImpact: () => ReplaceImpact;
  onAccept: (operations: common_TechCardOperation[], mode: 'append' | 'replace') => void;
  /** Карточка выпущена: свои кнопки глушит внешний fieldset, но модалка replace — портал. */
  frozen?: boolean;
}) {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [impact, setImpact] = useState<ReplaceImpact | null>(null);
  const [draft, setDraft] = useState<{
    operations: common_TechCardOperation[];
    model?: string;
    notes?: string;
  } | null>(null);

  // Карточку выпустили, пока модалка «replace the whole list» открыта, — модалка обязана закрыться
  // сама: она живёт ПОРТАЛОМ в body, куда внешний `<fieldset disabled>` не достаёт (тот же приём,
  // что у кнопок «снять фотографии шагов» и «снять разметку узлов»). Гейт стоит и в самом
  // мутаторе `acceptGeneratedOperations`.
  useEffect(() => {
    if (frozen) setImpact(null);
  }, [frozen]);

  const generate = async () => {
    if (!techCardId || !description.trim() || generating) return;
    setGenerating(true);
    setError('');
    setDraft(null);
    try {
      const res = await adminService.GenerateTechCardOperations({
        techCardId,
        description: description.trim(),
      });
      const operations = res.operations ?? [];
      if (operations.length === 0) {
        setError('the AI returned no operations — refine the description and try again');
      } else {
        setDraft({ operations, model: res.model, notes: res.notes });
      }
    } catch (e) {
      const status = (e as { status?: number } | undefined)?.status;
      setError(
        status === 412
          ? AI_NOT_CONFIGURED_MESSAGE
          : fieldErrorSummary(e, "couldn't generate the operations"),
      );
    } finally {
      setGenerating(false);
    }
  };

  const accept = (mode: 'append' | 'replace') => {
    if (!draft) return;
    onAccept(draft.operations, mode);
    setDraft(null);
    setDescription('');
  };

  return (
    <>
      <Accordion
        title={
          <Text size='control' variant='uppercase' tracking='label' component='span'>
            generate operations from description (ai)
          </Text>
        }
        meta={
          draft ? (
            <Pill tone='attention'>{`draft: ${draft.operations.length}`}</Pill>
          ) : (
            <Text size='micro' variant='label' component='span'>
              draft
            </Text>
          )
        }
      >
        <div className='space-y-2'>
          <Text size='micro' variant='label'>
            describe the construction in your own words — units, pieces, materials, the order of
            assembly. the AI proposes structured operations from that description and the card's
            data (pieces, BOM) — this is a DRAFT, and the technologist must check it before saving.
          </Text>

          {!techCardId ? (
            <Text size='micro' variant='label'>
              save the tech card first — generation uses the already saved pieces and BOM as context
            </Text>
          ) : (
            <>
              <Textarea
                name='ai-operations-description'
                variant='secondary'
                placeholder='e.g.: set the sleeve into an open armhole, overlock the side seams with 4 threads, turn the hem up 2 cm and edge-stitch it…'
                className='mb-0 min-h-24 border border-borderColor'
                maxLength={4000}
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDescription(e.target.value)
                }
                disabled={generating}
              />
              <Button
                type='button'
                variant='main'
                size='sm'
                loading={generating}
                disabled={generating || !description.trim()}
                onClick={generate}
              >
                generate operations
              </Button>
            </>
          )}

          {error && (
            <Text size='micro' variant='error'>
              {error}
            </Text>
          )}

          {draft && (
            <div className='space-y-1.5 border-t border-hairline pt-2'>
              <GroupLabel
                action={
                  <Text size='micro' variant='label' component='span'>
                    operations: {draft.operations.length}
                    {draft.model ? ` · ${draft.model}` : ''}
                  </Text>
                }
              >
                ai draft — review before saving
              </GroupLabel>
              {draft.notes?.trim() && (
                <Text size='micro' variant='label'>
                  {draft.notes.trim()}
                </Text>
              )}
              <div className='max-h-64 overflow-y-auto'>
                {draft.operations.map((o, i) => (
                  <Row
                    key={i}
                    label={
                      <span>
                        <span className='text-labelColor tabular-nums'>{(i + 1) * 10}.</span>{' '}
                        {operationHeading({
                          operationType: o.operationType,
                          // The draft's own machine, so the preview reads «overlock · side seams»
                          // rather than fourteen lines of «machine».
                          machineType: o.machineType,
                          // ...и класс шва: у отстрочки якорь вида там, и предпросмотр обязан
                          // называть шаг тем же словом, каким назовёт его список после вставки.
                          seamClass: o.seamClass,
                          // ...и работа, если черновик её несёт: тем же счётом, что рельс (R8).
                          work: o.work,
                          workCatalog,
                          zone: o.zone,
                          pieceNames: [],
                          note: o.note,
                        })}
                      </span>
                    }
                    value={o.smv?.value ? `${o.smv.value} min` : '—'}
                  />
                ))}
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {hasExistingOperations && (
                  <Button type='button' variant='main' size='sm' onClick={() => accept('append')}>
                    append to the list
                  </Button>
                )}
                <Button
                  type='button'
                  variant={hasExistingOperations ? 'secondary' : 'main'}
                  size='sm'
                  onClick={() =>
                    hasExistingOperations ? setImpact(readReplaceImpact()) : accept('append')
                  }
                >
                  {hasExistingOperations ? 'replace the whole list' : 'accept into the list'}
                </Button>
                <Button type='button' variant='secondary' size='sm' onClick={() => setDraft(null)}>
                  discard the draft
                </Button>
              </div>
            </div>
          )}
        </div>
      </Accordion>

      <ConfirmationModal
        open={impact != null}
        onOpenChange={(next) => !next && setImpact(null)}
        title='replace the whole list of operations'
        width='sm'
        confirmLabel='replace'
        cancelLabel='cancel'
        onConfirm={() => accept('replace')}
        // ЩИТ ТОТ ЖЕ, ЧТО У ОСТАЛЬНЫХ МОДАЛОК ТЕХ-КАРТЫ, и сегодня он не срабатывает ни разу:
        // генератор живёт только в инлайне, а из-под открытого фулскрина до него не дотянуться —
        // оверлей гасит указатель и держит фокус. `restoreScreenFocus` это видит (экрана в DOM нет)
        // и не делает ничего. Оставлено сознательно: панель уже переезжала между видами, и правило
        // «после портала фокус возвращается экрану» должно ехать вместе с ней.
        onCloseAutoFocus={restoreScreenFocus}
      >
        <div className='space-y-1.5'>
          <CalloutBox tone='error'>
            <Text size='micro'>
              <b>{impact?.operations ?? 0}</b> operations will be deleted: the SAM on{' '}
              <b>{impact?.sam ?? 0}</b> of them and the piece links on <b>{impact?.pieceLinks ?? 0}</b>
              . defect references to operation numbers will be reset too.
            </Text>
          </CalloutBox>
          {(impact?.units ?? 0) > 0 && (
            <CalloutBox tone='error'>
              <Text size='micro'>
                and <b>{impact?.units}</b> assembly units: the draft does not carry them, so the
                markup disappears entirely. the server refuses such a write — the markup has to be
                cleared with the “clear the unit markup” button, not by replacing the list.
              </Text>
            </CalloutBox>
          )}
          {(impact?.photos ?? 0) > 0 && (
            <CalloutBox tone='error'>
              <Text size='micro'>
                and <b>{impact?.photos}</b> step photos along with every callout on them:
                measurements, captions, spans. the server refuses with a shield, and the only way out
                of that refusal is to agree to erase the photos for good.
              </Text>
            </CalloutBox>
          )}
          {(impact?.equipment ?? 0) > 0 && (
            <CalloutBox tone='error'>
              <Text size='micro'>
                and the machines and pressing modes on <b>{impact?.equipment}</b> steps. there is no
                shield here: the write goes through silently, and there will be nowhere to learn
                about the loss — the floor will simply start sewing with a different needle on a
                different machine.
              </Text>
            </CalloutBox>
          )}
          <Text size='micro' variant='label'>
            instead you can “append to the list” — the draft lands after the existing operations.
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}

// Per-node sewing operations (Sheet «Обработка», lower block). Operations are an ordered
// assembly sequence (№ 10, 20, 30…); the backend returns them sorted by number.
//
// Layout is a rail + editor, the same grammar the hero and archive block editors use: the whole
// sequence stays on one screen as 26px lines (which is what makes it read as an ORDER), and the
// step you are on opens beside it as a full sewing spec.
export function OperationsField({
  activePin = null,
  onActivePinChange,
  activeBom = null,
  onActiveBomChange,
  colorwayArticles,
  pieceClothByColorway,
  pieceShapes = null,
  addRequest = null,
  onAdded,
  storedHasUnits = false,
  storedHasMedia = false,
  frozen = false,
  operationMediaUrls,
  draftPending = false,
  onSave,
  saving = false,
  sketchNote,
}: {
  /** Несёт ли СОХРАНЁННАЯ карточка разметку — предикат тот же, что у маппера (§7.2 сервера). */
  storedHasUnits?: boolean;
  /** Несёт ли СОХРАНЁННАЯ карточка фотографии шагов — предикат тот же, что у серверного щита. */
  storedHasMedia?: boolean;
  /**
   * Карточка выпущена. Внешний `<fieldset disabled>` глушит кнопки, но НЕ pointer-обработчики на
   * div — а схема Ф7 стала жестовой. Поэтому гейт обязан быть явным, и он приезжает пропом.
   */
  frozen?: boolean;
  /** Адреса операционных снимков с чтения карточки: форма возит только media_id. */
  operationMediaUrls?: Map<number, string>;
  activePin?: number | null;
  onActivePinChange?: (n: number | null) => void;
  activeBom?: string | null;
  onActiveBomChange?: (k: string | null) => void;
  colorwayArticles?: ColorwayArticles;
  /**
   * Ткань деталей по колорвеям, в порядке карточки. Считается вкладкой (два источника — слоты из
   * формы, рецепт с чтения) и приезжает сюда готовой картой: собирать её здесь значило бы считать
   * заново на каждый введённый в шаг символ.
   *
   * ИНЛАЙН ВСЕГДА БЕРЁТ `[0]`, и переключателя колорвея тут нет: он приедет с полкой фулскрина.
   * Пока его нет, экран обязан НАЗЫВАТЬ показанный колорвей словом — иначе одноцветная штриховка
   * молча выдаёт первый колорвей за единственный.
   */
  pieceClothByColorway?: ColorwayCloth[];
  // Контуры деталей, посчитанные ОДИН раз на вкладке и стабильные по ссылке. Приходят пропом, а не
  // своим хуком: здесь их читают тарелка, каждый чип открытого шага и каждая строка рельса, а этот
  // компонент перерисовывается на каждый символ — считать карту заново на каждый рендер значило бы
  // обнулять memo у PieceShape во всех двадцати строках сразу.
  pieceShapes?: PieceShapeMap;
  // request from the construction panel to append an operation for a part (nonce dedupes)
  addRequest?: { placement: string; nonce: number } | null;
  onAdded?: () => void;
  /**
   * У карточки есть НЕВОССТАНОВЛЕННЫЙ черновик. Нужен ровно одному решению: подавить автооткрытие
   * фулскрина по `?fs=1`. Коллаут черновика живёт в корне карточки, под оверлеем его не видно, а
   * «restore», нажатый после выхода, затирает всё, что сделано в фулскрине.
   */
  draftPending?: boolean;
  /** Сохранение карточки — то же самое, что жмёт кнопка в шапке. Хром фулскрина зовёт его же. */
  onSave?: () => void;
  /** Сохранение идёт: кнопка фулскрина обязана знать это так же, как шапка. */
  saving?: boolean;
  /**
   * ЗАРЕЗЕРВИРОВАН под эскиз-заметку над полотном фулскрина (Ф6б). Принимается и прокидывается как
   * есть: этот файл о содержимом узла ничего не знает и знать не должен.
   */
  sketchNote?: ReactNode;
} = {}) {
  const { control, getValues, setValue, watch } = useFormContext<TechCardFormData>();
  const { fields, append, remove, replace, insert, move } = useFieldArray({
    control,
    name: 'operations',
  });
  // #66: the AI-generation RPC needs the card's numeric id for grounding context (its saved
  // pieces/BOM/type). This component isn't given one via props — read it off the route instead
  // (this field only ever renders under /tech-cards/:id or /add-tech-card, same as the `numId`
  // every sibling section derives in index.tsx). Undefined on an unsaved card — the panel below
  // shows a "save first" hint instead of the generator in that case.
  const { id: routeId } = useParams<{ id: string }>();
  const techCardId = routeId ? parseInt(routeId, 10) : undefined;
  const [params, setParams] = useSearchParams();
  // КАТАЛОГ РАБОТ НА ВЕСЬ РЕЛЬС — ОДНОЙ ПОДПИСКОЙ (R8). Имя шага теперь спрашивает работу, а
  // спрашивают его здесь три места сразу: строка рельса, схема сборки и предпросмотр черновика.
  // Ключ у запроса один на приложение, поэтому второго обращения к сети хук не делает; но
  // подписка на строку рельса означала бы сто двадцать шесть подписок на карточке свалки, и
  // каталог обязан приехать сюда, а не в каждую строку.
  const { catalog: workCatalog } = useOperationWorkCatalog();

  // Which step the editor is showing. Clamped rather than reset, so deleting the last step keeps
  // the editor on a real row instead of blanking.
  const [selected, setSelected] = useState(0);
  const selectedIndex = fields.length === 0 ? -1 : Math.min(selected, fields.length - 1);

  // Operation numbers are POSITIONAL — the mapper re-stamps (i+1)*10 on every save — so any edit
  // that moves a row renumbers the ones after it. issues[].operationNumber references operations BY
  // NUMBER, so the same edit has to remap them (same class as nf05-01, laundered through the
  // number) or an issue flagged on op 20 silently points at the WRONG operation on the factory
  // sheet. `mapIndex` returns the row's new index, or null when it is going away.
  // Always called BEFORE the array is edited, so getValues() still reports the pre-edit positions.
  const remapIssues = useCallback(
    (mapIndex: (oldIndex: number) => number | null) => {
      const issues = getValues('issues') ?? [];
      const count = (getValues('operations') ?? []).length;
      issues.forEach((iss, ii) => {
        const n = iss.operationNumber ?? 0;
        if (!n) return;
        // Only a reference this editor could have minted is positional: an exact multiple of ten
        // inside the current range. Anything else is ALREADY dangling, and shifting it would
        // launder it into a valid number pointing at an operation it was never about — a stray 15
        // becoming a clean 10 is worse than a stray 15.
        if (n % 10 !== 0) return;
        const oldIndex = n / 10 - 1;
        if (oldIndex < 0 || oldIndex >= count) return;
        const nextIndex = mapIndex(oldIndex);
        const next = nextIndex == null ? 0 : (nextIndex + 1) * 10;
        if (next !== n) setValue(`issues.${ii}.operationNumber`, next, { shouldDirty: true });
      });
    },
    [getValues, setValue],
  );

  // Every operation number in the card is about to become meaningless (AI replace). Unlinks
  // dangling references too, which remapIssues deliberately leaves alone.
  const clearIssueOperationRefs = useCallback(() => {
    const issues = getValues('issues') ?? [];
    issues.forEach((iss, ii) => {
      if ((iss.operationNumber ?? 0) > 0) {
        setValue(`issues.${ii}.operationNumber`, 0, { shouldDirty: true });
      }
    });
  }, [getValues, setValue]);

  // --- ИСТОРИЯ ЖЕСТОВ ---------------------------------------------------------------------------
  //
  // История живёт РЯДОМ С МУТАТОРАМИ, а не в фулскрине (R3): отменяет она их же, и разъехаться
  // записи с тем, что она отменяет, негде только здесь. Вся чистая арифметика — в
  // `last-mutation.ts` под пробой; тут остаётся дисциплина «кто пишет, кто сбрасывает, кто гейтит».
  //
  // ОДНА СТОПКА НА ОБА ХРАНИЛИЩА, И ЭТО НЕ КОМПРОМИСС. Позиции нод — презентация (localStorage),
  // последовательность — форма; но человек делает жесты В ОДНОМ ПОРЯДКЕ, и «создал шаг → подвигал
  // ноды → ⌘Z» обязано отменить ПЕРЕСТАНОВКУ. Две отдельные стопки этот порядок потеряли бы, и ⌘Z
  // молча снёс бы созданный шаг — ровно тот дефект, на который упёрся владелец. Смешанной записи
  // при этом не существует: род `move` не касается RHF ВООБЩЕ (иначе перетаскивание начнёт
  // взводить isDirty и пугать beforeunload), а формовые роды не трогают раскладку.
  //
  // REF — ИСТИНА, СОСТОЯНИЕ — ТОЛЬКО ДЛЯ ЧИПОВ. Ref нужен потому, что историю читают и пишут
  // обработчики, которым нельзя ждать следующего рендера; состояние — потому что чипы обязаны
  // гаснуть и зажигаться, а ref никого не перерисовывает. Оба пишутся ОДНОЙ функцией, чтобы
  // разойтись им было негде.
  type Hist = History<OperationFormValue>;
  const history = useRef<Hist>(emptyHistory<OperationFormValue>());
  const [histView, setHistView] = useState<Hist>(history.current);
  const pendingAppend = useRef<PendingAppend<OperationFormValue> | null>(null);
  // ИНВЕРСИЯ ИДЁТ ЧЕРЕЗ ТЕ ЖЕ МУТАТОРЫ, А ОНИ САМИ — ТОЧКИ СБРОСА. `removeOperation` гасит формовую
  // историю (массив поехал), и отмена создания, зовущая его, стёрла бы всю остальную историю
  // первым же ⌘Z. Флаг поднят ровно на синхронное время применения записи.
  const applying = useRef(false);

  /**
   * ФОКУС, ПОДТВЕРДИВШИЙ ЖЕСТ, НЕ ИМЕЕТ ПРАВА ЕГО ЖЕ И ЗАБЫТЬ.
   *
   * Переименование узла подтверждается уходом фокуса — и ровно этот уход дёргает восьмую точку
   * сброса (`focusin` на fieldset редактора), потому что фокус приземляется в соседнее поле того же
   * редактора. Порядок событий тут неумолим: `focusout` (жест состоялся, запись легла) → `focusin`
   * (запись умерла). Без этого щита подтверждение уходом фокуса рождало бы запись мёртвой, то есть
   * один из двух объявленных способов подтвердить жест был бы способом сделать его неотменяемым.
   *
   * ЩИТ ЖИВЁТ ДО БЛИЖАЙШЕГО ПЕРЕХОДА ФОКУСА, А НЕ ОДИН ТАКТ. Такта хватало ровно одному из двух
   * объявленных способов подтвердить жест. У подтверждения УХОДОМ ФОКУСА `focusout` и `focusin`
   * приходят синхронно, в одной задаче, и таймер на ноль их накрывал. У подтверждения ENTER'ОМ
   * фокус остаётся в поле: таймер снимал щит немедленно, а восьмая точка сброса приходила позже —
   * первым же переходом в СОСЕДНЕЕ ПОЛЕ того же редактора, то есть на самом естественном
   * продолжении жеста («переименовал код — дописываю имя»). Запись умирала молча, и ⌘Z не
   * возвращал ничего (замерено стендом `rev7.mjs`, сценарий A).
   *
   * Больше одного перехода щит не держит, и стоять ему не на чем: в поле кода фокус приходит
   * ИЗВНЕ, а этот приход сам дёргает восьмую точку — вся формовая история умирает ДО набора.
   * Пережить щит может только запись, легшая пока фокус был в поле, то есть само переименование.
   *
   * СЛУШАТЕЛЬ ПУЗЫРЬКОВЫЙ, А НЕ КАПЧУРНЫЙ: React вешает свои `onFocus` на корень приложения, то
   * есть ВНУТРИ документа, и капчурный слушатель окна снял бы щит РАНЬШЕ восьмой точки сброса —
   * то есть не сделал бы ничего. Всплытие доходит до window последним.
   *
   * Родня ему `applying`: инверсия тоже ходит через мутаторы, а те сами точки сброса.
   */
  const settling = useRef(false);
  const releaseSettle = useRef<(() => void) | null>(null);
  const settleGesture = () => {
    if (settling.current) return; // щит уже поднят: второй слушатель снял бы его первым переходом
    settling.current = true;
    const release = () => {
      settling.current = false;
      releaseSettle.current = null;
      window.removeEventListener('focusin', release);
    };
    releaseSettle.current = release;
    window.addEventListener('focusin', release);
  };
  // Экран закрыли посреди поднятого щита — слушатель обязан уйти вместе с ним.
  useEffect(() => () => releaseSettle.current?.(), []);

  const setHistory = useCallback((next: Hist) => {
    // Чистые функции отдают ТОТ ЖЕ объект, когда менять нечего, — и ре-рендера тогда не будет.
    if (next === history.current) return;
    history.current = next;
    setHistView(next);
  }, []);

  /**
   * ВСЕ ОДИННАДЦАТЬ ТОЧЕК СБРОСА — ЭТО ОНА. Формовые записи умирают, раскладочные живут: ни перестановка
   * строк, ни правка полей, ни выпуск карточки, ни закрытие фулскрина раскладку не трогают, и
   * хоронить вместе с формой возможность вернуть подвинутую ноду не за что.
   */
  const clearFormHistory = useCallback(() => {
    if (applying.current || settling.current) return;
    pendingAppend.current = null;
    setHistory(dropForm(history.current));
  }, [setHistory]);

  /**
   * (11/11) РЕСЕТ ФОРМЫ — ОДИННАДЦАТАЯ ТОЧКА, И ЕДИНСТВЕННАЯ, КОТОРУЮ НИКТО НЕ ЗВАЛ.
   *
   * Т5 постановила прямо: «после успешного save форма ресетится с новыми id строк, и формовые
   * записи ОБЯЗАНЫ умереть». Половина этого держалась щитом по `fieldId` — отмена после save
   * отказывала, потому что строки по адресу больше не те. ПОВТОРУ ЭТОТ ЩИТ НЕДОСТУПЕН ПО
   * ПОСТРОЕНИЮ: отменённой строки в форме нет, тождества спрашивать не у чего, и судить остаётся
   * по длине — а она после сохранения совпадает ровно. Отсюда «создал → ⌘Z → Save → ⇧⌘Z»:
   * шаг молча возвращался в ТОЛЬКО ЧТО СОХРАНЁННУЮ карточку и взводил isDirty, без единого слова.
   * Замерено стендом на ОБОИХ формовых родах — и у дописывания, и у вставки; дыра наследная и
   * симметричная, потому и закрывается одна на все рода сразу, а не в `canRedo` каждого.
   *
   * Второго щита ради этого не заводится: сброс формовых записей в системе один — `dropForm`, —
   * и здесь к нему просто подводится провод от события, которое до сих пор никто не слушал.
   *
   * СИГНАЛ — ПУСТОЕ `name` В ПОДПИСКЕ RHF. Именованное изменение это правка поля или мутация
   * массива (`useFieldArray` шлёт имя массива); безымянное бывает только у `reset()`. Чтение то
   * же, что у соседа по вкладке (`construction-tab.tsx`, отпечаток ткани), и это не совпадение:
   * другого способа увидеть ресет у потребителя формы нет.
   *
   * `watch(cb)` НЕ РЕНДЕРИТ — в отличие от `useWatch`. Подписка на всю форму через `useWatch`
   * означала бы ре-рендер корня поля на каждый символ в любом поле карточки.
   */
  useEffect(() => {
    const sub = watch((_, { name }) => {
      if (name) return;
      clearFormHistory();
    });
    return () => sub.unsubscribe();
  }, [watch, clearFormHistory]);

  // ВТОРОЙ ТАКТ ЗАПИСИ append. `append()` из RHF ничего не возвращает, а `fields` в замыкании
  // мутатора — снимок ДО вставки: `fields[at]?.id` там всегда `undefined`, и записанный синхронно
  // guard отказывал бы всегда. Поэтому мутатор пишет полузапись, а id дозаполняется здесь, когда
  // массив строк уже приехал. Не дозаполнилось — значит между тактами прошла чужая мутация, и
  // запись обязана умереть, а не дождаться следующего массива.
  useEffect(() => {
    const p = pendingAppend.current;
    if (!p) return;
    pendingAppend.current = null;
    const rec = resolvePending(p, fields);
    if (!rec) return;
    // ПОВТОР (⇧⌘Z) НЕ ГАСИТ СТОПКУ ВОЗВРАТА, новый жест — гасит. Иначе ⇧⌘Z, нажатое трижды,
    // вернуло бы ровно один жест и молча забыло два.
    setHistory(p.redone ? pushUndo(history.current, rec) : record(history.current, rec));
  }, [fields, setHistory]);

  // ГЕЙТ ЗАМОРОЗКИ ПЕРВОЙ СТРОКОЙ У КАЖДОГО МУТАТОРА, как у `appendStep` и `addInputToOperation`.
  // Сегодня все трое прикрыты косвенно: кнопки редактора и ручка перетаскивания — настоящие
  // <button> под внешним `<fieldset disabled>`, а док фулскрина обёрнут своим fieldset. Но
  // прикрытие разметкой — не контракт: `moveOperation` уже уезжает пропом в портал (потребитель
  // Ф6в), и первый вызыватель вне формы дописал бы перенумерацию в выпущенную карточку молча.
  const removeOperation = (index: number) => {
    if (frozen) return;
    clearFormHistory(); // (1/11) массив поехал — формовые записи протухли
    remapIssues((old) => (old === index ? null : old > index ? old - 1 : old));
    remove(index);
    // Clamp the STORED index, not just the rendered one: deleting the open last row leaves
    // `selected` past the end, and the next reorder would then compute the selection from a
    // position that no longer exists and open the wrong step.
    const lastAfter = Math.max(0, fields.length - 2);
    setSelected((s) => Math.min(s > index ? s - 1 : s, lastAfter));
  };

  const insertAfter = (index: number) => {
    if (frozen) return;
    clearFormHistory(); // (2/11)
    remapIssues((old) => (old > index ? old + 1 : old));
    insert(index + 1, { ...emptyOperation });
    setSelected(index + 1);
  };

  const moveOperation = (from: number, to: number) => {
    // ГЕЙТ С ОТКАЗОМ СЛОВАМИ, а не молчанием: ручка ⠿ рельса в СПИСКЕ ФУЛСКРИНА — настоящая
    // <button> в портале, вне обоих fieldset (внешнего карточки и докового), и на выпущенной
    // карточке жест перетаскивания честно начинается и доезжает досюда — строка прыгала бы
    // обратно без единого слова. Инлайновую ручку глушит внешний fieldset, снекбар не спамит.
    if (frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    if (from === to) return;
    // (3/11) САМАЯ ДОРОГАЯ ИЗ ОДИННАДЦАТИ: после перестановки `removeOperation(index)` удалил бы ЧУЖОЙ
    // шаг. Guard по `fieldId` это ловит и сам, но отказ словами лучше отказа по совпадению.
    clearFormHistory();
    remapIssues((old) => {
      if (old === from) return to;
      if (from < to) return old > from && old <= to ? old - 1 : old;
      return old >= to && old < from ? old + 1 : old;
    });
    move(from, to);
    setSelected((s) => {
      if (s === from) return to;
      if (from < s && s <= to) return s - 1;
      if (to <= s && s < from) return s + 1;
      return s;
    });
  };

  // append here (this field array owns the rendered list) when the panel requests it. The request
  // no longer carries a step title: there is no title to carry, and the two fields it used to
  // pre-fill (`node`, `placement`) were the same piece name written twice.
  useEffect(() => {
    if (!addRequest) return;
    clearFormHistory(); // (4/11) шаг дописала ПАНЕЛЬ, а не жест полотна
    append({ ...emptyOperation });
    setSelected(fields.length);
    onAdded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest?.nonce]);

  // Accept an AI-drafted batch (#66) into the real, editable field array — nothing above this
  // point has touched form state; the technologist still saves via the normal tech-card save.
  // Append leaves existing rows (and their operation numbers) untouched. Replace swaps the whole
  // list, so every old operation number an issue[].operationNumber pointed at is now meaningless —
  // unlink it rather than let it silently point at a DIFFERENT new operation that happens to land
  // on the same position (same discipline as removeOperation above).
  const acceptGeneratedOperations = (
    generated: common_TechCardOperation[],
    mode: 'append' | 'replace',
  ) => {
    // ГЕЙТ ЗАМОРОЗКИ ПЕРВОЙ СТРОКОЙ, как у остальных мутаторов массива. Кнопки панели — настоящие
    // <button> под внешним fieldset и на выпущенной карточке мертвы, но модалка «replace the whole
    // list» — ПОРТАЛ: карточку могли выпустить, пока она открыта (та же гонка Release, что у
    // `appendStep`), и «replace» переписал бы выпущенную карточку целиком. Отказ произносится:
    // жест начат на живом органе.
    if (frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    // (5/11) Черновик генератора переписывает список целиком или дописывает пачку: ни то, ни
    // другое жестовым ⌘Z не отменяется, а адрес записи после `replace` указывает на другой шаг.
    clearFormHistory();
    const mapped = generated.map(mapGeneratedOperationToForm);
    if (mode === 'replace') {
      clearIssueOperationRefs();
      replace(mapped);
      setSelected(0);
    } else {
      setSelected(fields.length);
      append(mapped);
    }
  };

  // What «заменить весь список» would destroy, read at press time off form state — watching the
  // whole operations array here would re-render every row on every keystroke.
  const readReplaceImpact = (): ReplaceImpact => {
    const ops = (getValues('operations') ?? []) as OperationFormValue[];
    return {
      operations: ops.length,
      sam: ops.filter((o) => (o.smv ?? '').trim()).length,
      pieceLinks: ops.filter((o) => (o.inputKeys ?? []).length > 0).length,
      // СНИМКИ ШАГА С УКАЗАНИЯМИ. Черновик генератора их не несёт (`mapGeneratedOperationToForm`
      // строит шаг с нуля), поэтому «заменить весь список» уносит каждую фотографию и каждую
      // выноску на ней. Сервер потом откажет щитом медиа, но к этому моменту работа в форме уже
      // потеряна, а единственный выход из отказа — согласиться стереть снимки НАВСЕГДА. Цена
      // обязана читаться ДО нажатия.
      photos: ops.reduce((n, o) => n + (o.media ?? []).length, 0),
      // Машинные факты и режимы ВТО. У них щита с бекстопом нет вовсе, так что их пропажу вообще
      // никто не окликнет: ни отказа, ни сообщения — просто в следующий раз шаг шьётся на другой
      // машине другой иглой.
      equipment: ops.filter(
        (o) =>
          (o.machineType && o.machineType !== NONE_MACHINE) ||
          (o.machineProfileKey ?? '').trim() ||
          (o.pressEquipment && o.pressEquipment !== NONE_PRESS_EQUIPMENT) ||
          (o.pressProfileKey ?? '').trim(),
      ).length,
      // РАЗМЕТКА УЗЛОВ — самый дорогой ручной ввод на карточке, и черновик сносит её целиком
      // вместе со списком. Сервер откажет бекстопом («запись не несёт узлов против карточки,
      // которая их несёт»), но узнать об этом на сохранении, уже потеряв работу в форме, —
      // не то же самое, что прочитать цену до нажатия.
      units: ops.filter((o) => ((o as { outputUnitKey?: string }).outputUnitKey ?? '').trim())
        .length,
    };
  };

  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLine[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as Array<{
    number?: number;
    part?: string;
  }>;
  // Only DECLARED pieces reach the tray. Inventing a piece from inside an operation is what
  // produced dangling codes in the first place, so that path is gone: «+ new piece» walks to the
  // PATTERNS tab, where a piece also gets its cut data instead of just a name.
  const pieces = useFormPieces();
  const showMessage = useSnackBarStore((st) => st.showMessage);

  // Чем именно заканчивается «+ new piece», решает наличие чертежа: пока его нет, деталь заводят
  // руками на вкладке деталей; как только к карточке привязан первый DXF, единственным автором
  // деталей становится модалка «↔ детали кроя», а ручная кнопка исчезает — вести к её якорю
  // значило бы отправить оператора в пустоту.
  const patterns = useWatch({ control, name: 'patterns' });
  const hasDxf = cardHasDxf(patterns);

  // ПЛИТКАМИ ИЛИ ЧИПАМИ — решается ОДИН раз на весь блок, по наличию хоть одного контура.
  //
  // Не «у этой детали контур есть» построчно: смешанная полоса из квадратов и коротких чипов
  // читается как сломанная вёрстка, а не как разница в данных. И не «карточка вообще с
  // выкройками»: пока разбор не заказан или ещё идёт, форм нет ни у кого, и сетка пустых квадратов
  // с именами была бы хуже сегодняшних чипов — тот же список, только втрое выше.
  const tiled = useMemo(
    () => !!pieceShapes && [...pieceShapes.values()].some(Boolean),
    [pieceShapes],
  );

  // Инлайновые поверхности (полотно схемы и лоток) показывают ПЕРВЫЙ колорвей карточки. Выбирать
  // колорвей здесь нечем и не нужно: орган выбора приедет с полкой фулскрина, а до тех пор экран
  // отвечает за то, чтобы показанный колорвей был НАЗВАН.
  const inlineCloth = pieceClothByColorway?.[0] ?? null;

  // СТРОКА-СЛОВО (M8). Штриховка — текстура, а текстура одна не имеет права нести состояние:
  // «полосатая» не читается как «основная ткань» без легенды, а полки с легендой на инлайне ещё
  // нет. Поэтому над схемой стоит строка, называющая колорвей и то, о чём рецепт промолчал.
  //
  // Молчит, когда сказать нечего: один колорвей и все детали разложены — строка была бы шумом над
  // экраном, который и так весь про сборку. Это ТЕКСТ, а не орган: нажимать здесь не на что.
  const clothWord = useMemo(() => {
    if (pieces.length === 0) return '';
    // Колорвеев нет вовсе — рецепта не существует, вся штриховка `unbound`. Счётчик «12 без ткани»
    // здесь был бы претензией к технологу вместо факта: считать нечего, пока считать не из чего.
    if (!inlineCloth) return 'cloth — no recipe yet';
    let unbound = 0;
    let unsorted = 0;
    for (const p of pieces) {
      const state = inlineCloth.map.get(p.lineKey)?.state ?? 'unbound';
      if (state === 'unbound') unbound += 1;
      else if (state === 'unsorted') unsorted += 1;
    }
    const many = (pieceClothByColorway?.length ?? 0) > 1;
    if (!unbound && !unsorted && !many) return '';
    const parts = [inlineCloth.label];
    if (unbound) parts.push(`${unbound} without cloth`);
    if (unsorted) parts.push(`${unsorted} unsorted`);
    return `cloth — ${parts.join(' · ')}`;
  }, [pieces, inlineCloth, pieceClothByColorway]);

  const pinOptions = useMemo<PickerOption[]>(
    () => [
      { value: 0, label: '— pin —' },
      ...callouts
        .filter((c) => (c.number ?? 0) > 0)
        .map((c) => ({
          value: c.number as number,
          label: `#${c.number}${c.part?.trim() ? ` ${c.part}` : ''}`,
        })),
    ],
    [callouts],
  );

  // A blocking error must never hide behind a step that isn't open (`node` is required), and only
  // ONE step is mounted now, so the editor has to walk to the failing one itself.
  const { errors, submitCount } = useFormState({ control });
  const opErrors = errors.operations as unknown as (unknown | undefined)[] | undefined;
  const errorIndices = useMemo(() => {
    const set = new Set<number>();
    if (Array.isArray(opErrors)) {
      opErrors.forEach((e, i) => {
        if (e) set.add(i);
      });
    }
    return set;
  }, [opErrors]);
  const firstErrorIndex = errorIndices.size ? Math.min(...errorIndices) : -1;
  // Шаги, ломающие сборку. Считается ЗДЕСЬ, потому что рельс живёт в корне и другого места нет.
  // ЦЕНА ВЫШЕ, ЧЕМ ОБЕЩАЛА ЭТА СТРОКА РАНЬШЕ, — ЗАМЕРЕНО: `useWatch('operations')` срабатывает и
  // на правку note/SMV ВНУТРИ шага (матчер RHF сверяет имена по префиксу, значения приходят
  // КЛОНОМ — ссылка массива новая на каждое уведомление), так что корень поля перерисовывается на
  // каждый символ, а useMemo свипа промахивается вместе с ним. Долг ДО этой ветки: тот же хук
  // стоял в корне и на базе. Лечение — опция `compute` у useWatch с проекцией на
  // inputKeys/outputUnitKey/smv (она bail-out'ит по deep-equal), отдельной фазой, не попутно.
  // ДЕФОЛТ РЕЖИМА ВЫВОДИТСЯ, А НЕ КОНСТАНТА. На неразмеченной карточке — а сегодня это каждая —
  // досье вырождается в один заголовок «вне узлов» над всем списком, то есть в шум. Поэтому
  // группировка включается ровно тогда, когда есть что группировать, и переключатель появляется
  // тогда же.
  const smvOf = useCallback(
    (i: number) => (getValues(`operations.${i}.smv`) ?? '') as string,
    [getValues],
  );
  const grouping = useRailGrouping(pieces, smvOf);
  const brokenSteps = grouping.broken;
  // ДЕФОЛТ ВЫВОДИТСЯ, А НЕ КОНСТАНТА. План объявлял схему режимом по умолчанию — и на любой
  // сегодняшней карточке это дало бы пустое полотно на первом же открытии, то есть экран,
  // который читается как «сломалось». Схема становится дефолтом ровно там, где есть что
  // рисовать; пользовательский выбор живёт в сессии и уступает, когда узлов нет.
  //
  // Ф7: выбор пережил перезагрузку — он лёг в предпочтения карточки рядом с ручными позициями.
  // Вывод остался фолбэком, когда предпочтения нет; замечание §10.3 («сохранённая схема на
  // карточке без узлов = пустое полотно») сняла сама Ф7 — полотно без узлов теперь показывает
  // детали.
  const schematicNodeKeys = useCallback(() => {
    const live = new Set<string>(['']); // '' — хвостовой бокс, он тоже нода
    for (const p of pieces) live.add(p.lineKey);
    for (const k of grouping.res.units.keys()) live.add(k);
    return live;
  }, [pieces, grouping.res]);
  const prefs = useSchematicPrefs(techCardId, schematicNodeKeys);
  const mode = prefs.mode;
  const setMode = prefs.setMode;
  // Незавершённый жест создания: что уже назначено входами и не предлагается ли поглощение.
  // Живёт здесь, а не в схеме, потому что пишет в форму тоже отсюда.
  const [pendingCreate, setPendingCreate] = useState<CreatePrefill | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // Карточку выпустили, пока диалог открыт — диалог обязан закрыться сам: он живёт порталом, и
  // никакая заморозка разметки его не гасит.
  useEffect(() => {
    if (!frozen) return;
    setPendingCreate(null);
    // (9/11) ГОНКА RELEASE. Карточку выпустили, пока фулскрин открыт: жест, сделанный секунду
    // назад, отменять уже нельзя — правка выпущенной карточки запрещена целиком (R10). Гейт на
    // самом ⌘Z стоит тоже, но записи обязаны умереть, а не ждать, пока в них упрутся.
    //
    // УМИРАЮТ ТОЛЬКО ФОРМОВЫЕ, и это ровно то, ради чего сброс стал по-родовым: раскладка на
    // выпущенной карточке ЗАКОННА (R10), значит и отмена перестановки обязана её пережить.
    clearFormHistory();
  }, [frozen, clearFormHistory]);
  // ЯВНЫЙ ВЫБОР ПОЛЬЗОВАТЕЛЯ СИЛЬНЕЕ ВЫВОДА — иначе получается замкнутый круг, в который я и
  // попал: схема была доступна только на размеченной карточке, а разметить первый узел можно было
  // только в списке. Схема, на которой сборку собирают с нуля, обязана быть достижима с нуля.
  //
  // Вывод остаётся дефолтом: неразмеченная карточка открывается списком (пустое полотно на первом
  // открытии читается как «сломалось»), размеченная — схемой. Но переключиться можно всегда.
  const effectiveMode = mode ?? (grouping.marked ? 'schematic' : 'list');
  const grouped = grouping.marked && effectiveMode === 'list';
  // Заголовок рельса называет режим, чтобы «схемой» не читалось как «что-то ещё».
  const prevSubmit = useRef(submitCount);
  const prevErrorCount = useRef(errorIndices.size);
  useEffect(() => {
    const submitted = submitCount !== prevSubmit.current;
    const appeared = errorIndices.size > prevErrorCount.current;
    prevSubmit.current = submitCount;
    prevErrorCount.current = errorIndices.size;
    if (firstErrorIndex < 0) return;
    // A save attempt ALWAYS lands on the first failing step, because that is the one the tech-card
    // error router focuses and calls revealField() on — its field has to be mounted for the reveal
    // to find it, and revealField retries for a few frames, which is exactly long enough.
    //
    // Between saves (a server-pinned violation) only move when a NEW error appeared and the open
    // step is clean: reordering rows shifts which index is "first" without anything having gone
    // wrong, and that must not yank the editor out from under a drag.
    if (submitted || (appeared && !errorIndices.has(selectedIndex))) setSelected(firstErrorIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount, errorIndices]);

  // The sketch cross-highlight stays a HOVER preview on both sides. Lighting the open step's pin
  // permanently was tried and reverted: the pin fills error-red while it is the active one, so the
  // step you are editing read as the step that is broken.

  // Clicking «＋ piece» in the editor briefly flashes the tray, so the eye is pulled to the chips
  // now clickable. A short pulse, not a persisted mode — the chips stay clickable regardless.
  const [highlightPieces, setHighlightPieces] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const flashPieces = () => {
    trayRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setHighlightPieces(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setHighlightPieces(false), 2600);
  };
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // Вход шага — деталь ИЛИ узел, поэтому проверка «существует ли такая деталь» снята: ключ узла
  // деталью не является по определению.
  //
  // ФРОНТИР СВЕРЯЕТСЯ ПО ЦЕЛЕВОМУ ШАГУ, а не по открытому. Лоток фильтрован фронтиром выбранного
  // шага, но перетащить чип можно на ЛЮБОЙ шаг рельса — и деталь, свободная на шаге 8, на шаге 3
  // может быть ещё не съедена, а на шаге 12 уже съедена. Без этой сверки drop молча создавал бы
  // последовательность, которую сервер отвергнет целиком, и автор узнал бы об этом на сохранении.
  //
  // Считается через getValues НА СОБЫТИИ, а не подпиской: подписка на весь массив operations в
  // корне поля перерисовывала бы всё на каждое нажатие клавиши.
  const addInputToOperation = (index: number, key: string) => {
    // ГЕЙТ ЗАМОРОЗКИ ПЕРВОЙ СТРОКОЙ, как у `appendStep` и `dissolveUnit`. Внешний
    // `<fieldset disabled>` карточки глушит клик и фокус, но НЕ pointer/DnD-жест на div — а
    // единственный настоящий вызыватель этого мутатора и есть дроп чипа детали на строку рельса
    // (`onDropPiece`). То есть на ВЫПУЩЕННОЙ карточке дроп правил форму, взводя isDirty, и никакая
    // разметка этого не останавливала. Тем более он не остановит фулскрин: тот живёт порталом в
    // body, куда fieldset не достаёт вовсе.
    if (frozen) return;
    if (index < 0 || !key) return;
    const cur = (getValues(`operations.${index}.inputKeys`) ?? []) as string[];
    if (cur.includes(key)) return;

    const formOps = (getValues('operations') ?? []) as Array<{
      inputKeys?: string[];
      outputUnitKey?: string;
      outputUnitName?: string;
    }>;
    const sweepPieces = pieces.map((p) => ({ lineKey: p.lineKey, name: p.name }));
    const pieceKeys = new Set(sweepPieces.map((p) => p.lineKey));
    const steps = formOps.map((o) => ({
      inputs: classifyAssemblyInputs(pieceKeys, (o?.inputKeys ?? []).filter(Boolean)),
      outputUnitKey: (o?.outputUnitKey ?? '').trim(),
      outputUnitName: (o?.outputUnitName ?? '').trim(),
    }));
    const res = assemblySweep(sweepPieces, steps);
    const available = res.frontierBefore[index] ?? res.frontier;
    if (!available.includes(key)) {
      const eater = res.consumedBy.get(key);
      const into = eater !== undefined ? steps[eater]?.outputUnitKey : '';
      showMessage(
        into
          ? `“${key}” is already inside unit ${into} at this step — it cannot be taken again`
          : `“${key}” is not on the table yet at this step`,
        'error',
      );
      return;
    }
    // (7/11) НЕ СТРУКТУРНАЯ, НО ШАГ ИЗМЕНЁН — и сброс стоит здесь, ПОСЛЕ отказа фронтира: жест,
    // который движок отклонил, ничего не менял и гасить чужую отмену не вправе. Массив при
    // добавлении входа тот же, `fieldId` на месте — guard пропустил бы, — а устаревший ⌘Z снёс бы
    // шаг ВМЕСТЕ с только что добавленной деталью.
    clearFormHistory();
    setValue(`operations.${index}.inputKeys`, [...cur, key], { shouldDirty: true });
  };

  // Cut pieces are a section of the PATTERNS tab (they used to have their own, then sat on
  // colorways). One target for every card shape — an auxiliary card has no colorways tab.
  const goToPiecesTab = () => {
    const next = new URLSearchParams(params);
    next.set('tab', 'patterns');
    setParams(next, { replace: true });
    // that tab is a sibling `hidden` panel, so it is already mounted — one frame is enough
    // Обе цели живут на ОДНОЙ вкладке (детали кроя — секция PATTERNS), различается только якорь.
    // На карточке с чертежом кнопка сопоставления рендерится ТОЛЬКО внутри выбранной плитки
    // материала и только когда у той есть файлы: оператор, оставивший выбранным пустой материал,
    // «без материала» или PDF, пришёл бы на вкладку, где подсвечивать нечего. Поэтому переход
    // отступает на полку материалов — она стоит всегда и объясняет следующий шаг.
    window.setTimeout(() => {
      if (!hasDxf) {
        revealField('pieces.add');
        return;
      }
      if (!revealField('patterns.match')) revealField('patterns.shelf');
    }, 120);
  };

  /**
   * «+ operation» ВКЛАДКИ: пустой шаг и редактор под ним.
   *
   * ТОЛЬКО ЭТА ПОВЕРХНОСТЬ. Фулскрин ту же надпись носил, но там пустой шаг оказывался тупиком:
   * лотка нет, состав набрать нечем, и владелец, нажавший единственную подписанную кнопку, не мог
   * сшить несколько деталей вовсе — его «+ new operation» теперь открывает диалог создания.
   * Здесь пустой шаг тупиком не является: лоток стоит прямо над списком, клик по чипу кладёт
   * деталь в открытый шаг, а редактор — тут же под рельсом.
   */
  const addOperation = () => {
    // Тот же гейт и по той же причине: сегодня кнопку «+ operation» душит внешний fieldset, но
    // мутатор про заморозку не знает, а вызыватель ВНЕ формы дописал бы шаг в выпущенную
    // карточку. Гейт стоит у мутатора, а не у каждой кнопки.
    if (frozen) return;
    // (6/11) Пустой шаг — не жест полотна: отменять его ⌘Z нечего, а старая запись после него
    // указывала бы на шаг, стоящий уже не там.
    clearFormHistory();
    setSelected(fields.length);
    append({ ...emptyOperation });
  };

  // --- авторинг, общий для СПИСКА и СХЕМЫ -------------------------------------------------------
  //
  // Мутаторы живут ЗДЕСЬ и в одном экземпляре, а схема их только вызывает. Два вида, редактирующих
  // одни данные, опасны не тем, что их два, — источник истины и так один, это форма, — а тем, что
  // каждый легко обзаводится СВОЕЙ логикой мутаций, и через полгода «сшить» в списке и «сшить» на
  // схеме начинают расходиться в мелочах. Поэтому общий обработчик, а не два похожих.

  /**
   * ВСТАВИТЬ ЗАПОЛНЕННЫЙ ШАГ НА ПОЗИЦИЮ `at` — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ СХЕМА ПИШЕТ В ФОРМУ. Диалог
   * только собирает аргументы; вся запись — здесь, в одном экземпляре, ровно как договаривались в
   * T-23 про мутаторы.
   *
   * До Ф7 эту роль делили `joinIntoUnit` и `addStepIntoUnit`, и оба создавали шаг из
   * `emptyOperation` — с типом и зоной в UNKNOWN, то есть заведомо невалидный. Технолог получал
   * строку с «!» и долг вместо результата. Теперь минимум валидности собран ДО записи.
   *
   * ПОЗИЦИЯ — АРГУМЕНТ, А НЕ ВТОРОЙ МУТАТОР (Т6). Дописывание в конец есть частный случай вставки
   * (`at === fields.length`), и разводить их на две функции значило бы завести двух писателей
   * одного рода: гейт заморозки, ремап ссылок дефектов и запись отмены пришлось бы держать
   * синхронными в обеих, а расходятся такие пары молча. Отличается только род записи истории —
   * там разница настоящая, см. ниже.
   *
   * Соседи: `insertAfter` вставляет ПУСТУЮ строку-долг (жест рельса, своя история), `addOperation`
   * дописывает пустую в конец (кнопка вкладки). Этот — единственный, кто кладёт ЗАПОЛНЕННЫЙ шаг.
   */
  const insertStepAt = (at: number, r: CreateResult) => {
    // ЗАМОРОЗКА ПРОВЕРЯЕТСЯ ЗДЕСЬ, а не только в разметке. Диалог рисуется порталом в body —
    // внешний `<fieldset disabled>` карточки до него не достаёт вовсе. Гонка настоящая: нажали
    // Release, пока запрос летит открыли создание, ответ перевёл карточку в RELEASED — и
    // «создать» дописал бы шаг в выпущенную карточку, взведя isDirty.
    if (frozen) return;
    // СТРОКА СОБИРАЕТСЯ ОТДЕЛЬНОЙ ПЕРЕМЕННОЙ, потому что её берёт себе запись истории: ⇧⌘Z
    // дописывает ЕЁ ЖЕ, а не пустой шаг. Собрать её второй раз в повторе значило бы завести второе
    // определение того, что такое «созданный этим жестом шаг».
    const row = {
      ...emptyOperation,
      inputKeys: r.inputKeys,
      outputUnitKey: r.outputUnitKey,
      outputUnitName: r.outputUnitName,
      operationType: r.operationType as typeof emptyOperation.operationType,
      zone: r.zone as typeof emptyOperation.zone,
      ...(r.machineType ? { machineType: r.machineType as typeof emptyOperation.machineType } : {}),
      ...(r.pressEquipment
        ? { pressEquipment: r.pressEquipment as typeof emptyOperation.pressEquipment }
        : {}),
      // ОБЯЗАТЕЛЬНЫЙ ВОПРОС ГЛАГОЛА — ПАРОЙ «ПОЛЕ + ЗНАЧЕНИЕ». Какое из шести полей несёт ответ,
      // решает `STEP_DISCRIMINATORS` в диалоге; здесь ключ подставляется по имени, потому что
      // второй разбор «у какого глагола какое поле» разошёлся бы с таблицей молча — и шаг уехал
      // бы в форму с `*_UNKNOWN` там, где сервер требует значение безусловно.
      ...(r.discriminatorField && r.discriminatorValue
        ? ({ [r.discriminatorField]: r.discriminatorValue } as Partial<typeof emptyOperation>)
        : {}),
      // ОСТАЛЬНОЕ, ЧТО ПРОСТАВИЛ ПУНКТ ПИКЕРА: класс шва у отстрочки, под-глагол у ВТО (0325).
      // Имена, которых в `emptyOperation` нет, отбрасываются ЗДЕСЬ, а не молча ниже: строка
      // расстилается прямо в массив полей, и ключ, которого RHF не регистрировал, поехал бы в
      // форму мусором. Щит остаётся и после 0325 — следующее поле пикера войдёт тем же путём.
      ...(Object.fromEntries(
        Object.entries(r.kindWrites ?? {}).filter(([k]) => k in emptyOperation),
      ) as Partial<typeof emptyOperation>),
    };
    // ССЫЛКИ ДЕФЕКТОВ ЕДУТ ВНИЗ ВМЕСТЕ СО СВОИМИ ШАГАМИ, и считается это ДО правки массива:
    // `remapIssues` читает позиции через getValues. При вставке хвостом (`at === fields.length`)
    // формула не двигает ничего — сдвигать нечего, — поэтому она одна на оба случая, а не две.
    remapIssues((old) => (old >= at ? old + 1 : old));
    // ПОЛУЗАПИСЬ ИСТОРИИ — до самой вставки, чтобы эффект на `[fields]` застал её уже стоящей.
    // Прежние записи здесь НЕ гасятся: в этом вся история — жест ложится ПОВЕРХ предыдущих.
    //
    // РОД ЗАПИСИ ВЫБИРАЕТ ПОЗИЦИЯ, И ЭТО НЕ УДВОЕНИЕ. Отличаются два рода ровно тем, чем
    // отличаются два жеста для человека: «дописал в конец» и «вставил между» — разные поступки, и
    // чип отмены обязан называть каждый своим словом. Щиты повтора у них тоже разные по числу и
    // СОВПАДАЮТ на хвосте (`lengthAfter - 1 === index`), так что граница проходит там же, где
    // проходит смысл, и ни один случай не остаётся без щита.
    const tail = at === fields.length;
    pendingAppend.current = {
      kind: tail ? 'append' : 'insert',
      index: at,
      expectedLength: fields.length + 1,
      row,
      label: tail ? appendLabel(at) : insertLabel(at),
      // Жест с узлом ниже перезапишет `assemblyCleared` — снимаем значение ДО жеста, чтобы
      // инверсия вернула и его: «снял разметку → сшил → ⌘Z» без отката флага молча теряло
      // намерение снятия, и следующее сохранение не доносило его до сервера.
      ...(r.outputUnitKey ? { clearedBefore: !!getValues('assemblyCleared') } : {}),
    };
    // `insert(at, row)` при `at === fields.length` делает ровно то же, что `append`: строка
    // ложится последней. Второй мутатор ради этого случая был бы вторым писателем одного рода.
    insert(at, row);
    // Разметка появилась — намерение «снять разметку» отменено. Сегодняшний `joinIntoUnit` этого
    // НЕ делал (в отличие от `declare()`), и сценарий «снял → передумал → сшил заново» уходил в
    // отказ «снял и одновременно прислал узлы». Починка попутная и намеренная.
    if (r.outputUnitKey) setValue('assemblyCleared', false, { shouldDirty: true });
    setSelected(at);
    setPendingCreate(null);
    // Шаг создан — редактор обязан оказаться перед глазами, иначе жест кончается там же, где
    // начался, и результат приходится искать.
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };

  /**
   * ЧТО ЛЕЖИТ НА СТОЛЕ ТАМ, КУДА МЕТИТ ОТКРЫТЫЙ ДИАЛОГ. Без позиции — конец последовательности
   * (прежнее поведение), с позицией — фронтир ПЕРЕД целевым шагом.
   *
   * Адрес из намерения может оказаться числом из прошлого (последовательность изменилась, пока
   * диалог открыт) — тогда `frontierBefore` по нему пуст, и отступать надо к конечному фронтиру, а
   * не к пустому списку: пустой означал бы «на столе нет ничего», и диалог отказал бы даже тому
   * составу, который жест уже назначил.
   */
  const frontierForCreate =
    pendingCreate?.at === undefined
      ? grouping.res.frontier
      : (grouping.res.frontierBefore[pendingCreate.at] ?? grouping.res.frontier);

  /**
   * В КАКОЙ УЗЕЛ ПОПАДЁТ ШАГ С ТАКИМ СОСТАВОМ НА ЭТОЙ ПОЗИЦИИ — ОТВЕТОМ ДВИЖКА, а не пересказом.
   *
   * Принадлежность шага узлу нигде не хранится: `assembly-blocks.ts` выводит её транзитивно из
   * входов и пересчитывает на каждое изменение. Значит единственный честный способ ответить на
   * «попадёт ли это в COLLAR» — собрать последовательность С ВСТАВЛЕННЫМ кандидатом и спросить у
   * той же проекции, которая потом и нарисует блоки. Правило «блок решает первый вход, ведущий к
   * узлу» переписанное здесь второй раз, разошлось бы с оригиналом молча.
   *
   * Прогон стоит один проход по шагам и живёт ровно пока открыт диалог.
   */
  const unitOfPlanned = useCallback(
    (draft: { inputKeys: string[]; outputUnitKey: string }) => {
      const at = pendingCreate?.at;
      if (at === undefined) return '';
      const sweepPieces = pieces.map((p) => ({ lineKey: p.lineKey, name: p.name }));
      const pieceKeys = new Set(sweepPieces.map((p) => p.lineKey));
      const steps = [...grouping.schematicSteps];
      const clamped = Math.min(Math.max(at, 0), steps.length);
      steps.splice(clamped, 0, {
        inputs: classifyAssemblyInputs(pieceKeys, draft.inputKeys.filter(Boolean)),
        outputUnitKey: draft.outputUnitKey.trim(),
        outputUnitName: '',
      });
      const res = assemblySweep(sweepPieces, steps);
      return assemblyBlocks(steps, res).blockOfStep.get(clamped) ?? '';
    },
    [pendingCreate?.at, pieces, grouping.schematicSteps],
  );

  /**
   * НА ЧЬЕЙ ПЛИТКЕ ПОЯВИТСЯ ШАГ С ТАКИМ СОСТАВОМ — ТЕМ ЖЕ ПРАВИЛОМ, ПО КОТОРОМУ СТРОКА РИСУЕТСЯ.
   *
   * Щит диалога до сих пор спрашивал вопрос СЛАБЕЕ дела: «остался ли этот вход в составе». Строка
   * же появляется на плитке только у шага, у которого вход ОДИН РАЗЛИЧНЫЙ и это та самая деталь, и
   * который ничего не собирает. Добавь человек второй вход или переключи результат на новый узел —
   * строка не появится, а щит молчал: обещание жеста «строка будет НА ЭТОЙ плитке» переставало
   * держаться, и диалог об этом не говорил.
   *
   * Правило не переписано здесь второй раз, а взято `processedPieceOf` — оттуда, где оно живёт и
   * откуда его читает раскладка. Позиция не спрашивается вовсе: принадлежность плитке от места в
   * последовательности не зависит (в отличие от принадлежности узлу), и вводить сюда `at` значило
   * бы завести зависимость, которой у правила нет.
   */
  const pieceOfPlanned = useCallback(
    (draft: { inputKeys: string[]; outputUnitKey: string }) => {
      const pieceKeys = new Set(pieces.map((p) => p.lineKey));
      return processedPieceOf({
        inputs: classifyAssemblyInputs(pieceKeys, draft.inputKeys.filter(Boolean)),
        outputUnitKey: draft.outputUnitKey.trim(),
        outputUnitName: '',
      });
    },
    [pieces],
  );

  /**
   * ДИАЛОГ СОЗДАНИЯ ЗАКОНЧИЛСЯ «CREATE». Позицию несёт САМО НАМЕРЕНИЕ, а не второй колбэк: жест,
   * начавшийся точкой вставки внутри узла, и жест, начавшийся «+ new operation», приходят сюда
   * одной дорогой и расходятся ровно одним числом. Второй путь означал бы, что однажды они
   * разойдутся и поведением.
   *
   * АДРЕС КЛАМПИТСЯ: пока диалог открыт, последовательность могла измениться (соседний жест,
   * отмена, ресет формы после save), и `at` из намерения — число из прошлого. За концом массива
   * `insert` из RHF молча кладёт строку в конец; клампом это делается явно и одинаково для всех.
   */
  const appendStep = (r: CreateResult) => {
    const at = pendingCreate?.at;
    insertStepAt(at === undefined ? fields.length : Math.min(Math.max(at, 0), fields.length), r);
  };

  /** Растворить узел: шаг перестаёт собирать, его входы возвращаются на стол следующим. */
  const dissolveUnit = (stepIndex: number) => {
    if (frozen) return; // тот же гейт: растворение — мутация, и разметке она не подотчётна
    // ЗНАЧЕНИЯ ЧИТАЮТСЯ ДО ОБНУЛЕНИЯ — возвращать отмене больше неоткуда. `fieldId` здесь доступен
    // синхронно (строка существует, массив не двигался), и второй такт не нужен.
    const unitKey = ((getValues(`operations.${stepIndex}.outputUnitKey`) as string) ?? '').trim();
    const unitName = ((getValues(`operations.${stepIndex}.outputUnitName`) as string) ?? '').trim();
    const fieldId = fields[stepIndex]?.id;
    setValue(`operations.${stepIndex}.outputUnitKey`, '', { shouldDirty: true });
    setValue(`operations.${stepIndex}.outputUnitName`, '', { shouldDirty: true });
    if (!fieldId || !unitKey) return; // растворять было нечего — и отменять нечего
    setHistory(
      record(history.current, {
        kind: 'dissolve',
        index: stepIndex,
        fieldId,
        unitKey,
        unitName,
        label: dissolveLabel(unitKey),
      }),
    );
  };

  /**
   * ПЕРЕЗАПИСЬ КЛЮЧА ПО СПИСКУ МЕСТ — одна на жест и на обе его инверсии.
   *
   * Второй экземпляр этой арифметики (свой в мутаторе, свой в ⌘Z) означал бы, что отмена
   * переименования однажды перестанет попадать ровно в те места, которые переписал жест, — и
   * разойдутся они молча, на карточке, где ключ стоит в десятке мест.
   */
  const rewriteUnitKeySites = (
    sites: { outputs: RenameOutputSite[]; inputs: RenameInputSite[] },
    key: string,
  ) => {
    for (const s of sites.outputs) {
      setValue(`operations.${s.index}.outputUnitKey`, key, { shouldDirty: true });
    }
    for (const s of sites.inputs) {
      // Читается ЗАНОВО на каждой записи: у одного шага ключ может стоять несколькими входами
      // (законной такая строка не будет, но переписать её обязаны все, а не первый), и снимок,
      // взятый один раз, потерял бы предыдущую правку.
      const cur = [...(((getValues(`operations.${s.index}.inputKeys`) as string[]) ?? []) as string[])];
      cur[s.at] = key;
      setValue(`operations.${s.index}.inputKeys`, cur, { shouldDirty: true });
    }
  };

  /**
   * ПЕРЕИМЕНОВАНИЕ УЗЛА — АТОМАРНАЯ ПЕРЕЗАПИСЬ ПОТРЕБИТЕЛЕЙ. Недостающая половина того, что
   * задумано схемой: шапка `0307_assembly_units.sql` дословно обещает «переименование кода —
   * атомарная перезапись потребителей в том же сохранении, поэтому внешней durable-идентичности
   * узлу не нужно». Идентичность узла и есть его код, и переписыватель — единственное, что делает
   * это решение верным.
   *
   * ЖЕСТ ОДИН, ЗАПИСЬ ОДНА, СЛОВО ОДНО. Три вида мест (см. `planUnitRename`) переписываются
   * вместе; в историю ложится ОДНА запись, инвертирующая все три разом — человек сделал один
   * поступок, и ⌘Z обязано вернуть его целиком, а не третями.
   */
  const renameUnit = (stepIndex: number, next: string): RenameOutcome => {
    if (frozen) return { ok: false, why: FROZEN_REFUSAL }; // гейт первой строкой, как у всех мутаторов
    const formOps = ((getValues('operations') ?? []) as UnitKeyRow[]) ?? [];
    // ВЕСЬ РАЗБОР — В ЧИСТОМ МОДУЛЕ, а здесь только его исполнение. Пока лестница условий жила
    // тут, удостоверяла её лишь копия, написанная в пробе истории, — и копия успела разойтись с
    // оригиналом на две ветки. `unitRenameAct` покрыт `scripts/assembly-rename-probe.mjs`.
    const act = unitRenameAct(formOps, stepIndex, next, pieces);
    if (act.kind === 'noop') return { ok: true }; // побайтно то же самое: жеста не было
    if (act.kind === 'refuse') {
      // ОТКАЗ — СЛОВАМИ ДВИЖКА И БЕЗ ЕДИНОЙ ЗАПИСИ, причём и в снекбар, и возвратом: снекбар
      // гаснет, а поле с набранным, но не применённым кодом остаётся на экране.
      showMessage(act.why, 'error');
      return { ok: false, why: act.why };
    }
    if (act.kind === 'dissolve') {
      // ПУСТОЙ КЛЮЧ — ЭТО НЕ ПЕРЕИМЕНОВАНИЕ, А РАСТВОРЕНИЕ, и ведёт оно в СУЩЕСТВУЮЩИЙ мутатор.
      // Второй растворитель рядом с первым разошёлся бы с ним ровно так же, как разошёлся чип
      // редактора: тот писал в форму сам и не клал записи в историю.
      dissolveUnit(stepIndex);
      return { ok: true };
    }
    // `to`, А НЕ `next`: вердикт отдаёт ключ НОРМАЛИЗОВАННЫМ (подрезанным), потому что подрезанным
    // он и уедет на провод. Записать сюда набранное значило бы развести тождество ключа на экране
    // и тождество ключа на сервере — см. `unitRenameAct`.
    const { from, to, plan } = act;
    // АДРЕСА СВЕРЯЮТСЯ ДО ПЕРВОЙ ЗАПИСИ. Без `fieldId` записи истории нет, а жест без отмены
    // хуже отказа: пусть лучше не состоится ничего, чем состоится неотменяемое.
    const outputs: RenameOutputSite[] = [];
    const inputs: RenameInputSite[] = [];
    for (const i of plan.outputs) {
      const id = fields[i]?.id;
      if (!id) return { ok: false, why: 'the sequence has changed — reopen the step and try again' };
      outputs.push({ index: i, fieldId: id });
    }
    for (const s of plan.inputs) {
      const id = fields[s.index]?.id;
      if (!id) return { ok: false, why: 'the sequence has changed — reopen the step and try again' };
      for (const at of s.at) inputs.push({ index: s.index, fieldId: id, at });
    }

    rewriteUnitKeySites({ outputs, inputs }, to);
    // РУЧНАЯ ПОЗИЦИЯ НОДЫ ЕДЕТ ВМЕСТЕ С КЛЮЧОМ, и едет ДО записи истории: `restore` отдаёт
    // обратную пачку по своему синхронному снимку оверрайдов, и другой возможности узнать «где
    // нода стояла до жеста» у записи нет. По тому же снимку (`peek`, а не `pos` из рендера)
    // считается и прямая пачка — иначе половины разошлись бы на кадр. Пустая пачка законна: ноду
    // могли ни разу не двигать, и выдумывать ей позицию значит приколотить её навсегда.
    const posForward = renamePosEdits(prefs.peek(), from, to);
    const posBack = prefs.restore(posForward);
    setHistory(
      record(history.current, {
        kind: 'rename',
        index: stepIndex,
        fieldId: fields[stepIndex]?.id ?? '',
        from,
        to,
        outputs,
        inputs,
        posBack,
        posForward,
        label: renameLabel(from, to),
      }),
    );
    setRenamedUnit({ from, to });
    // Жест подтверждён уходом фокуса — и этот же уход сейчас дёрнет восьмую точку сброса. Щит
    // ровно на один такт: иначе запись, только что легшая, умрёт до первого ⌘Z.
    settleGesture();
    // УСПЕХ ПРОИЗНОСИТСЯ, и число в нём считает ВСЕ ТРИ ВИДА МЕСТ: перенумерация шагов не молчит
    // (R9), а переименование, переписавшее полкарточки, — тем более.
    showMessage(
      `renamed ${from} → ${to} in ${plan.steps} ${plan.steps === 1 ? 'step' : 'steps'}`,
      'success',
    );
    return { ok: true };
  };

  /**
   * ПЕРЕЕЗД НОД — ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ РАСКЛАДКИ НА ЭТОМ ЭКРАНЕ, и он же кладёт запись в историю.
   *
   * ПОЧЕМУ ЗДЕСЬ, А НЕ В ПОЛОТНЕ И НЕ В ФУЛСКРИНЕ. Стопка одна на оба хранилища (иначе теряется
   * порядок жестов, и «создал → подвигал → ⌘Z» сносит созданное), а формовые мутаторы живут только
   * здесь (R3). Значит и раскладочная запись обязана рождаться здесь.
   *
   * НИ ОДНОГО `setValue`. Перемещение ноды не взводит `isDirty` — инвариант с Ф3: раскладка это
   * презентация, и «подвинул блок» не имеет права попросить сохранение и разбудить beforeunload.
   * Отмена перемещения — по той же причине — тоже идёт мимо формы, одним `prefs.restore`.
   *
   * «Позицию до жеста» изобретать не приходится: `restore` возвращает обратную пачку, посчитанную
   * по своему СИНХРОННОМУ снимку оверрайдов. Ноды, которую не двигали, в снимке нет — и обратная
   * правка честно говорит «снять оверрайд», то есть вернуть ноду авто-раскладке.
   */
  const moveNodes = useCallback(
    (moves: { key: string; at: { x: number; y: number } }[]) => {
      if (moves.length === 0) return;
      const back = prefs.restore(moves);
      setHistory(
        record(history.current, {
          kind: 'move',
          back,
          forward: moves.map((m) => ({ key: m.key, at: m.at })),
          label: moveLabel(moves.length),
        }),
      );
    },
    [prefs, setHistory],
  );

  /**
   * ВЕСТЬ О СОСТОЯВШЕМСЯ ПЕРЕИМЕНОВАНИИ — чтобы выделение не слетало молча.
   *
   * Ключи узлов держит у себя ВЫДЕЛЕНИЕ, и живёт оно в двух местах: у инлайновой схемы и у
   * фулскрина. Оба чистят выбор от ключей, которых больше нет на полотне, — и переименованный
   * узел выглядит для этой чистки исчезнувшим, хотя не делся никуда.
   *
   * ЛИБО ОБА ВИДА, ЛИБО НИ ОДНОГО: один вид, помнящий выделение, и второй, теряющий, хуже двух
   * теряющих — человек перестаёт понимать правило. Поэтому весть уходит обоим одним пропом.
   *
   * НЕ ПОДНИМАЕМ САМО ВЫДЕЛЕНИЕ СЮДА: это состояние ЖЕСТА, а не данных, у видов оно разное
   * (инлайн режет фронтиром, полотно берёт маркизой что угодно), и общее хранилище связало бы два
   * экрана, которым знать о выборе друг друга незачем.
   *
   * НОВЫЙ ОБЪЕКТ НА КАЖДЫЙ ЖЕСТ, включая ⌘Z и ⇧⌘Z: тождеством и распознаётся «весть новая», иначе
   * цикл «A → B → A» дошёл бы до вида один раз.
   */
  const [renamedUnit, setRenamedUnit] = useState<UnitRenameNotice | null>(null);

  /**
   * СБРОС РАСКЛАДКИ уносит и раскладочную историю. «Расставь заново» — подтверждённый жест (R8), и
   * после него отмена одного давнего перетаскивания вернула бы ОДНУ ноду в место, которого на
   * экране больше нигде нет: это не «отменил», а «поломал заново». Формовые записи он не трогает —
   * последовательность шагов сбросом раскладки не менялась.
   */
  const resetPositions = useCallback(() => {
    setHistory(dropMove(history.current));
    prefs.reset();
  }, [prefs, setHistory]);

  /** Выход шага, как его читает движок сборки: щит растворения сверяется с ним же. */
  const outputUnitKeyOf = (i: number) =>
    (getValues(`operations.${i}.outputUnitKey`) as string) ?? '';

  /**
   * Входы шага — второй читатель щита, нужный ПЕРЕИМЕНОВАНИЮ: его инверсия правит не только
   * выходы, и «переписанное место всё ещё носит мой ключ» надо спрашивать у обоих видов мест.
   */
  const inputKeysOf = (i: number) =>
    ((getValues(`operations.${i}.inputKeys`) as string[]) ?? []) as string[];

  /** Применить формовую половину инверсии, не дав мутаторам погасить остальную историю. */
  const applyToForm = (fn: () => void) => {
    applying.current = true;
    try {
      fn();
    } finally {
      applying.current = false;
    }
  };

  /**
   * ⌘Z и чип отмены — ЕДИНСТВЕННЫЕ вызыватели инверсии (⇧⌘Z — её зеркало ниже).
   *
   * ГЕЙТ ЗАМОРОЗКИ — ПО-РОДОВОЙ. На выпущенной карточке (R10) раскладывать можно, править нельзя:
   * значит отмена перестановки обязана РАБОТАТЬ, а формовая — отказать словами. Прежний общий гейт
   * резал оба рода скопом, и подвинутый на выпущенной карточке блок нельзя было вернуть вовсе.
   * Формовых записей на замороженной карточке к этому моменту и так нет — эффект заморозки (9/11)
   * их гасит, — но щит стоит поясом и подтяжками: гонка Release живёт в этом файле не первый раз.
   *
   * ПУСТАЯ ИСТОРИЯ — ТИХИЙ `return`, ни звука. Прямое требование владельца, и оно отменяет решение
   * ревью Ф4 («молчание на ⌘Z хуже»). Провалившийся guard молчанием НЕ покрывается: там запись
   * БЫЛА, и молчание читалось бы как «отменил», хотя не отменено ничего.
   */
  const undoGesture = () => {
    const rec = peekUndo(history.current);
    if (!rec) return; // тишина: отменять нечего, и говорить не о чем
    if (rec.kind !== 'move' && frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    if (!canUndo(rec, fields, outputUnitKeyOf, inputKeysOf)) {
      // Ряд строк уехал (чаще всего — ресет формы после save). Умирает ВСЯ формовая половина
      // истории, а не одна запись: они все из той же, уже несуществующей эпохи. Раскладочные живут.
      setHistory(dropForm(history.current));
      showMessage('the sequence has changed — nothing to undo', 'error');
      return;
    }
    if (rec.kind === 'move') {
      prefs.restore(rec.back);
    } else if (rec.kind === 'append' || rec.kind === 'insert') {
      // ОДНА ИНВЕРСИЯ НА ОБА РОДА: удалить строку по адресу. Дописывание и вставка расходятся
      // только в повторе — там надо знать, куда возвращать, — а обратно они идут одинаково.
      applyToForm(() => {
        // Ремап ссылок дефектов уже внутри мутатора — своего удаления заводить нельзя (R3).
        removeOperation(rec.index);
        // Жест перезаписал `assemblyCleared` — инверсия возвращает и его.
        if (rec.clearedBefore !== undefined) {
          setValue('assemblyCleared', rec.clearedBefore, { shouldDirty: true });
        }
      });
    } else if (rec.kind === 'rename') {
      // ОДНО НАЖАТИЕ ВОЗВРАЩАЕТ ВСЕ ТРИ ВИДА МЕСТ. Тем же переписывателем, что их и правил, — по
      // адресам, записанным жестом, а не по повторному скану: шаг, дописавший ссылку на НОВЫЙ ключ
      // уже после переименования, эту ссылку сделал сам, и отмена чужой работы не касается.
      applyToForm(() => rewriteUnitKeySites(rec, rec.from));
      // И РАСКЛАДКУ — ТЕМ ЖЕ НАЖАТИЕМ. Вернуть ссылки, оставив ноду под новым кодом, значит
      // оставить её в авто-раскладке: жест был один, и половин у него нет.
      prefs.restore(rec.posBack);
      // …и выделение: инверсия переименования — тоже переименование, только в другую сторону.
      setRenamedUnit({ from: rec.to, to: rec.from });
    } else {
      applyToForm(() => {
        setValue(`operations.${rec.index}.outputUnitKey`, rec.unitKey, { shouldDirty: true });
        setValue(`operations.${rec.index}.outputUnitName`, rec.unitName, { shouldDirty: true });
      });
    }
    setHistory(undoStep(history.current));
  };

  const redoGesture = () => {
    const rec = peekRedo(history.current);
    if (!rec) return; // та же тишина: возвращать нечего
    if (rec.kind !== 'move' && frozen) {
      showMessage(FROZEN_REFUSAL, 'error');
      return;
    }
    if (!canRedo(rec, fields, outputUnitKeyOf, inputKeysOf)) {
      setHistory(dropForm(history.current));
      showMessage('the sequence has changed — nothing to redo', 'error');
      return;
    }
    if (rec.kind === 'move') {
      prefs.restore(rec.forward);
      setHistory(redoStep(history.current));
      return;
    }
    if (rec.kind === 'append') {
      // ПОВТОР СОЗДАНИЯ ИДЁТ ЧЕРЕЗ ТОТ ЖЕ ДВУХТАКТНЫЙ ЗАХВАТ: RHF выдаёт новой строке НОВЫЙ id, и
      // запись, вернувшаяся в стопку отмены со старым, отказала бы на первом же ⌘Z. Поэтому запись
      // снимается со стопки возврата здесь, а в стопку отмены её кладёт эффект `[fields]`.
      setHistory(dropRedoTop(history.current));
      pendingAppend.current = {
        kind: 'append',
        index: rec.index,
        expectedLength: rec.index + 1,
        row: rec.row,
        label: rec.label,
        redone: true,
        ...(rec.clearedBefore !== undefined ? { clearedBefore: rec.clearedBefore } : {}),
      };
      applyToForm(() => {
        append({ ...rec.row });
        if (rec.clearedBefore !== undefined) {
          setValue('assemblyCleared', false, { shouldDirty: true });
        }
      });
      setSelected(rec.index);
      return;
    }
    if (rec.kind === 'insert') {
      // ТОТ ЖЕ ДВУХТАКТНЫЙ ЗАХВАТ, ЧТО У СОЗДАНИЯ, и по той же причине: RHF выдаёт вернувшейся
      // строке НОВЫЙ id. Отличие ровно одно — позиция берётся ИЗ ЗАПИСИ: повтор обязан вернуть шаг
      // туда, откуда его сняли, иначе ⇧⌘Z молча превращал бы вставку в дописывание.
      setHistory(dropRedoTop(history.current));
      pendingAppend.current = {
        kind: 'insert',
        index: rec.index,
        expectedLength: fields.length + 1,
        row: rec.row,
        label: rec.label,
        redone: true,
        ...(rec.clearedBefore !== undefined ? { clearedBefore: rec.clearedBefore } : {}),
      };
      applyToForm(() => {
        // Ремап ссылок дефектов — как у прямого жеста: строки ниже адреса снова едут вниз.
        remapIssues((old) => (old >= rec.index ? old + 1 : old));
        insert(rec.index, { ...rec.row });
        if (rec.clearedBefore !== undefined) {
          setValue('assemblyCleared', false, { shouldDirty: true });
        }
      });
      setSelected(rec.index);
      return;
    }
    if (rec.kind === 'rename') {
      applyToForm(() => rewriteUnitKeySites(rec, rec.to));
      prefs.restore(rec.posForward); // зеркало отмены: раскладка возвращается тем же нажатием
      setRenamedUnit({ from: rec.from, to: rec.to });
      setHistory(redoStep(history.current));
      return;
    }
    applyToForm(() => {
      setValue(`operations.${rec.index}.outputUnitKey`, '', { shouldDirty: true });
      setValue(`operations.${rec.index}.outputUnitName`, '', { shouldDirty: true });
    });
    setHistory(redoStep(history.current));
  };

  // --- общее для ВСЕХ ТРЁХ видов ----------------------------------------------------------------
  //
  // Подпись шага и имя детали считаются в одном экземпляре по той же причине, по которой в одном
  // экземпляре живут мутаторы: разойдутся — разойдутся молча, и «шаг 30» на схеме перестанет
  // совпадать с «шагом 30» в фулскрине.

  /**
   * Короткая подпись шага — ТА ЖЕ, ЧТО НА ОСТАЛЬНЫХ ЭКРАНАХ: один вызов композитора и ни одной
   * своей ступени поверх него.
   *
   * ЗАМЕТКА ЕДЕТ ВНУТРЬ, А НЕ ВПЕРЁД. Здесь она стояла ПЕРЕД вызовом и потому била даже названную
   * работу: шаг с работой `moscow_hem` и непустой заметкой рельс звал «Hem — rolled (Moscow) ·
   * front», а схема сборки и фулскрин — текстом заметки. Одна строка формы, два имени на двух
   * экранах, и на схеме — ровно то слово, которое композитор считает ПОСЛЕДНЕЙ ступенью: у него
   * заметка это аварийный выход для шага, который формулой не описывается («work» не названа,
   * глагол вырождается в «step», зоны нет), а не заголовок по умолчанию.
   *
   * ФОЛБЭК ПРИ ЭТОМ ЦЕЛ, и это не оговорка: композитор приходит к первой строке заметки САМ, в той
   * же точке, где приходил, — просто теперь он единственный, кто решает, когда до неё дошло.
   */
  const labelOfStep = (i: number) =>
    operationHeading({
      operationType: getValues(`operations.${i}.operationType`) as Parameters<
        typeof operationHeading
      >[0]['operationType'],
      machineType: getValues(`operations.${i}.machineType`) as common_TechCardMachineType,
      seamClass: getValues(`operations.${i}.seamClass`) as string,
      // Схема сборки называет шаг тем же словом, что рельс: работа названа — её подпись (R8).
      work: getValues(`operations.${i}.work`) as string,
      workCatalog,
      zone: getValues(`operations.${i}.zone`) as Parameters<typeof operationHeading>[0]['zone'],
      pieceNames: [],
      note: getValues(`operations.${i}.note`) as string,
    }) || 'step';

  const pieceNameOf = (k: string) => pieces.find((p) => p.lineKey === k)?.name ?? k;

  const pickStepInline = (i: number) => {
    setSelected(i);
    // Схема отправила к шагу — редактор обязан оказаться перед глазами, иначе «открыть шаг»
    // открывает его за пределами экрана.
    requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
  };

  // --- фулскрин: ТРЕТИЙ ВИД ---------------------------------------------------------------------
  //
  // Открытость живёт в URL: F5 возвращает туда же, ссылкой можно поделиться, Back работает. Правил
  // у записи два, и оба неочевидны. ФУНКЦИОНАЛЬНЫЙ апдейтер — потому что снимок `params` в замыкании
  // затирает всё, что успели поставить соседи (открытый ящик задач, вкладка); `{ replace: true }` —
  // потому что вход и выход из вида не событие истории: без него Back начинает возить по фулскрину
  // вместо того, чтобы уводить со страницы.
  const fsOpen = params.get('fs') === '1';
  const fsChipRef = useRef<HTMLElement>(null);
  /** Автооткрытие — это `?fs=1`, ПРИШЕДШИЙ С АДРЕСОМ, а не поставленный рукой. */
  const fsFromUrl = useRef(params.get('fs') === '1');
  const fsAutoResolved = useRef(false);

  const setFullscreen = useCallback(
    (on: boolean) => {
      if (on) fsAutoResolved.current = true; // ручной вход подавлению больше не подлежит
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (on) {
            p.set('fs', '1');
            // Фулскрин — вид ВКЛАДКИ СБОРКИ. Пришедший по ссылке без `tab` иначе открывал бы
            // оверлей над заголовком карточки, а по выходу оставлял бы человека не там, где он
            // только что работал.
            p.set('tab', 'construction');
          } else {
            p.delete('fs');
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // ЧЕРНОВИК СИЛЬНЕЕ АДРЕСА. Восстановленный черновик объявляет себя коллаутом в корне карточки —
  // под оверлеем его не видно, а «restore», нажатый после выхода, затёр бы всю работу, сделанную в
  // фулскрине. Поэтому автооткрытие по адресу подавляется; ручной вход позже работает как обычно.
  //
  // Не «эффект на маунт»: `draft.pending` вычисляется эффектом РОДИТЕЛЯ, а детские эффекты бегут
  // раньше родительских — на маунте здесь всегда false.
  useEffect(() => {
    if (fsAutoResolved.current || !fsFromUrl.current || !draftPending) return;
    fsAutoResolved.current = true;
    setFullscreen(false);
  }, [draftPending, setFullscreen]);

  // ВКЛАДКА ДОПИСЫВАЕТСЯ И ПРИШЕДШЕМУ ПО ССЫЛКЕ `?fs=1`, а не только ручному входу. Вкладки
  // смонтированы все сразу, поэтому оверлей открывается и поверх заголовка карточки — а по выходу
  // человек оказывается не там, где только что работал.
  //
  // ОДНА ЗАМЕНА АДРЕСА НА ВИЗИТ — РЕФОМ, А НЕ ОБЕЩАНИЕМ В КОММЕНТАРИИ. Безусловный энфорсер
  // спорит с любым другим писателем `tab` до бесконечности: ревью Ф3 поймало ровно такую петлю с
  // фолбэком `navTo('header')` на IDEA-карточке, где вкладки CONSTRUCTION нет вовсе. Петля
  // разорвана в `index.tsx` (там `?fs=1` снимается первым), но лечить надо и сторону, которая
  // спорит: энфорсер пишет один раз за визит и уступает. Уступить здесь правильно всегда — свою
  // вкладку он уже назвал, а всякий, кто перебил его после этого, знает о видимости вкладок
  // больше, чем поле операций.
  const tabParam = params.get('tab');
  const tabEnforced = useRef(false);
  useEffect(() => {
    if (!fsOpen) {
      tabEnforced.current = false;
      return;
    }
    if (tabEnforced.current || tabParam === 'construction') return;
    tabEnforced.current = true;
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', 'construction');
        return p;
      },
      { replace: true },
    );
  }, [fsOpen, tabParam, setParams]);

  // ФОКУС ВОЗВРАЩАЕТСЯ НА ЧИП ВХОДА РУКАМИ. Radix возвращает его на элемент, который был активным
  // при открытии, но чип живёт внутри блока, который на время фулскрина не рендерится вовсе — то
  // есть возвращать Radix некуда, и фокус уходит на body.
  const wasFsOpen = useRef(fsOpen);
  useEffect(() => {
    const closed = wasFsOpen.current && !fsOpen;
    wasFsOpen.current = fsOpen;
    if (!closed) return;
    requestAnimationFrame(() => fsChipRef.current?.focus());
  }, [fsOpen]);

  // И ЗЕРКАЛЬНО — ФОКУС ПОСЛЕ ДИАЛОГА СОЗДАНИЯ, СНАРУЖИ ВНУТРЬ. Через этот диалог проходит КАЖДОЕ
  // создание шага, и он единственная модалка фулскрина, которая живёт СНАРУЖИ него: диалог нужен
  // обоим видам и потому смонтирован всегда, вне блока `sequence`. Значит `Dialog.Content` экрана
  // отсюда не достать ни `closest`, ни ref-ом — экран находит себя сам, по своему признаку, и это
  // делает `restoreScreenFocus`, отданная диалогу пропом `onCloseAutoFocus` (у его монтирования
  // ниже).
  //
  // ИМЕННО ПРОПОМ, А НЕ ЭФФЕКТОМ НА ЗАКРЫТИИ `pendingCreate`. Эффект здесь стоял и был обязан
  // ждать кадр — не из осторожности, а по замеру: он бежит РАНЬШЕ, чем `Presence` снимает портал,
  // и на тот момент кнопка «cancel» ещё жива и держит фокус (стенд: возврат звался на 643.4мс,
  // `focusout … to null` приходил на 643.8) — guard видел живого владельца и не делал ничего.
  // Возврат, зависящий от такта рендера, однажды перестаёт попадать: достаточно чужой правки в
  // порядке эффектов или смены версии Radix. Radix зовёт проп ровно тогда, когда сам готов отдать
  // фокус, — такт ждать не нужно.

  // ДЕСЯТАЯ ТОЧКА СБРОСА (ревью Ф4) — ГРАНИЦА ВИЗИТА ФУЛСКРИНА, обе стороны. Девять точек стерегут
  // массив и правки внутри фулскрина, но ⌘Z и чипы живут ТОЛЬКО в нём, а история — здесь, и она
  // переживала закрытие оверлея. Снаружи же шаг правится мимо всех девяти: редактор списка не имеет
  // focusin-сброса, «make it a unit» и «clear the unit markup» пишут в форму напрямую. Сценарий
  // «create в фулскрине → закрыл → дописал заметку в списке → открыл → ⌘Z» сносил шаг ВМЕСТЕ с
  // заметкой — ровно то, от чего точка 7 стережёт добор детали. Отмена обещает «ой» сразу после
  // жеста; жест из прошлого визита — уже не «сразу».
  useEffect(() => {
    clearFormHistory();
  }, [fsOpen, clearFormHistory]);

  return (
    <div className='space-y-2.5'>
      <Text size='micro' variant='label'>
        assembly steps in order — the whole sequence on the left, the open step in full on the
        right. the numbers (10/20/30) follow the position: drag <b>⠿</b> to change the order. the
        step type says WHAT is done, the machine or the pressing equipment — ON WHAT; an empty field
        in the settings means “inherit”, and its placeholder names both the value and the source.
      </Text>

      <StepNumberDrift />

      {/* ПУТЬ ОТСТУПЛЕНИЯ ЖИВЁТ СНАРУЖИ ЛОТКА. Лоток прячется при нуле операций, а именно там
          отказ щита и настигает: у сохранённой карточки снимки есть, в форме шагов не осталось,
          сервер требует объявить намерение — и кнопка, которой это делают, оказалась бы за
          `hidden`. Отказ, из которого нет выхода, хуже отказа. */}
      {/* Без внешнего условия: компонент сам решает, показываться ли, и знает про ОБА источника —
          снимки в форме и снимки сохранённой карточки. Внешнее условие про второй источник
          прятало кнопку там, где снимки добавили, но ещё не сохранили. */}
      <ChipRow>
        <ClearOperationMediaButton storedHasMedia={storedHasMedia} frozen={frozen} />
        {/* ТА ЖЕ ПРИЧИНА, ЧТО У СОСЕДА СЛЕВА, и её пришлось усвоить дважды: кнопка снятия
            разметки узлов жила ВНУТРИ лотка деталей, а лоток прячется при нуле операций. Сценарий
            отказа ровно такой: у сохранённой карточки узлы есть, технолог удалил все шаги, чтобы
            пересобрать последовательность, сервер требует объявить намерение — и кнопка, которой
            это делают, оказалась за `hidden`. Починку применили к одному щиту из двух. */}
        <ClearAssemblyButton pieces={pieces} storedHasUnits={storedHasUnits} frozen={frozen} />
      </ChipRow>

      {/* piece tray — click a chip to add it to the open step, or drag it onto any step. Hidden
          while the sequence is empty: with nothing to attach a piece TO, every chip in it is a
          dead end and the strip only reports «нет операций». */}
      <div ref={trayRef} className={cn(fields.length === 0 && 'hidden')}>
        <Toolbar sticky>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            pieces:
          </Text>
          {pieces.length === 0 ? (
            <Text size='micro' variant='label' component='span'>
              no pieces yet
            </Text>
          ) : (
            <AssemblyTray
              pieces={pieces}
              pieceShapes={pieceShapes}
              cloth={inlineCloth?.map ?? null}
              tiled={tiled}
              highlighted={highlightPieces}
              stepIndex={selectedIndex}
              onAdd={(key) => addInputToOperation(selectedIndex, key)}
            />
          )}
          {/* Чип называет ДЕЙСТВИЕ, которое оператор увидит по приезде, а не абстрактное
              «добавить»: с чертежом это модалка сопоставления, без чертежа — ручная кнопка. */}
          <Chip
            dashed
            onClick={goToPiecesTab}
            title={
              hasDxf
                ? 'pieces are created from a DXF — “↔ cut pieces” on the patterns tab'
                : 'create a piece on the PATTERNS tab'
            }
          >
            {hasDxf ? '↔ cut pieces' : '+ new piece'}
          </Chip>
          <ToolbarSpacer />
          <Text
            size='micro'
            variant='label'
            component='span'
            className={cn(highlightPieces && 'font-bold text-textColor')}
          >
            {highlightPieces
              ? `click a piece → step ${(selectedIndex + 1) * 10}`
              : `click → step ${(selectedIndex + 1) * 10}`}
          </Text>
        </Toolbar>
      </div>

      {/* Заглушка пустой последовательности уступает схеме, как только схему попросили. Карточка с
          деталями и нулём шагов — ПЕРВОЕ состояние любой тех-карты, и именно с него сборку и
          начинают; закрывать его заглушкой значило бы не пустить на схему ровно там, где она
          нужнее всего. */}
      {/* ПОКА ФУЛСКРИН ОТКРЫТ, БЛОК «SEQUENCE» НЕ РЕНДЕРИТСЯ ВОВСЕ — и накрыт условием ровно он.
          Два смонтированных `OperationEditor` на одни имена полей дали бы каждому полю двух
          писателей; а `AssemblyCreateDialog` и корневой `StepNumberDrift` живут СНАРУЖИ этого
          блока и остаются смонтированными всегда: диалог создания нужен фулскрину так же, как
          инлайну. */}
      {fsOpen ? null : fields.length === 0 && effectiveMode !== 'schematic' ? (
        <div className='flex flex-col items-center gap-2 border border-dashed border-borderColor px-3 py-8 text-center'>
          <Text size='micro' variant='label'>
            the assembly sequence is empty so far. add the first step — or describe the construction
            in words and generate a draft below.
          </Text>
          <div className='flex items-center gap-2'>
            <Button type='button' variant='main' size='sm' onClick={addOperation}>
              + operation
            </Button>
            {pieces.length > 0 && (
              <Chip
                nonForm
                dashed
                onClick={() => setMode('schematic')}
                title='lay the pieces out and assemble units by gestures'
              >
                assemble on the schematic
              </Chip>
            )}
          </div>
        </div>
      ) : (
        // ОБЁРТКА, А НЕ ФРАГМЕНТ. Родитель — `space-y-2.5`, то есть 10px между СВОИМИ детьми;
        // фрагмент своих детей в него и высыпает, и заголовок отъезжал от размеченного им
        // содержимого на 4px (`mb-1`) + 10px вместо положенных 4px. Подпись группы обязана
        // сидеть вплотную к тому, что подписывает, — иначе линейка читается как разделитель
        // между двумя разными вещами.
        <div>
          {/* ЗАГОЛОВОК ГРУППЫ ВЫНЕСЕН ИЗ КОЛОНКИ, КОТОРАЯ МЕНЯЕТ ШИРИНУ. Он жил внутри неё, а
              переключатель вида сидел в правом слоте — то есть был прижат к правому краю
              контейнера шириной то 320px (список), то во всю секцию (схема). Одно нажатие
              перебрасывало орган через полэкрана, и второе приходилось искать глазами. Здесь же
              он был `sticky` только в списке: у прокрученной страницы переключение роняло
              заголовок с прилипшей строки обратно в поток, то есть двигало его и по вертикали.

              Полоса заголовка одинакова в обоих режимах и не прилипает ни в одном, поэтому
              переключатель стоит на месте при любом состоянии прокрутки. Прилипание осталось у
              рельса списка: прилипающая полоса поверх полотна схемы мешала бы таскать узлы.

              Подсказка «⠿ drag» отсюда убрана. Она повторяла вводный абзац секции слово в слово
              («drag ⠿ to change the order») и вдобавок висела над схемой, где никакого ⠿ нет. */}
          {/* Отбивка снизу шире дефолтных 4px и равна 10px — шагу `stack`, на котором стоит вся
              секция (`space-y-2.5` у родителя). Дефолт рассчитан на заголовок из ОДНОГО текста;
              этот держит ещё и орган, стал вдвое выше, и линейка под ним прижималась к первой
              строке содержимого. Правка местная: у прочих заголовков в приложении в слоте ничего
              не стоит, и трогать их ритм не за что. */}
          <GroupLabel
            flush
            className='mb-2.5'
            lead={
              <div className='flex items-center gap-2'>
                <SequenceViewSwitch mode={effectiveMode} onMode={setMode} />
                {/* `nonForm` — ОБЯЗАТЕЛЬНО: на выпущенной карточке всё это живёт под внешним
                    `<fieldset disabled>`, а он глушит настоящую кнопку насмерть. Смотреть и
                    раскладывать разрешено и там (R10), значит и вход обязан работать. */}
                <Chip
                  ref={fsChipRef}
                  nonForm
                  dashed
                  onClick={() => setFullscreen(true)}
                  title='open the assembly on a full-screen canvas'
                >
                  fullscreen ⤢
                </Chip>
              </div>
            }
          >
            sequence
          </GroupLabel>
          <div
            className={cn(
              'flex flex-col gap-3',
              effectiveMode === 'list' && 'lg:flex-row lg:items-start',
            )}
          >
            <div
              className={cn(
                'w-full',
                effectiveMode === 'list' && 'lg:sticky lg:top-36 lg:w-[320px] lg:shrink-0',
              )}
            >
              {/* СЧЁТЧИК НЕНАЗВАННЫХ ВЫШЕ СТРОКИ ПРО ТКАНЬ, и порядок здесь не вкусовой: строка
                  про ткань подписывает штриховку ПОЛОТНА и обязана стоять к нему вплотную, а
                  счётчик говорит про весь рельс. Обе — над ОБОИМИ режимами: список это дефолт
                  карточки, то есть самое частое состояние экрана. */}
              <RailUnnamedWord />
              {/* Строка-слово живёт ЗДЕСЬ, а не внутри схемы рядом с «layout: manual»: та полоса
                  появляется только у карточки с ручными позициями, и строка про ткань, написанная
                  в ней, исчезала бы вместе с ней — то есть ровно на карточке, которую никто не
                  двигал руками, и молчала бы про весь неразложенный рецепт.

                  И НАД ОБОИМИ РЕЖИМАМИ, а не только над схемой. Лоток деталей штрихуется в списке
                  ровно так же, как на полотне, а список — дефолт карточки без узлов, то есть самое
                  частое состояние экрана. Строка, живущая только в ветке схемы, оставляла бы это
                  состояние с одной текстурой и без единого слова: колорвей не назван, «без ткани» и
                  «не разложено» не посчитаны, — а состояние не имеет права нестись одной текстурой.

                  ТЕКСТ ПРЕДЛОЖЕНИЕМ, а не капслоком: строка бывает длиннее четырёх слов («cloth —
                  BLK · 3 without cloth · 2 unsorted»), а капслок в этом приложении носят только
                  вещи в четыре слова и короче. Подсказка идёт цветом label и остаётся подсказкой. */}
              {clothWord && (
                <ChipRow className='mb-1.5'>
                  <Text size='micro' variant='label' component='span'>
                    {clothWord}
                  </Text>
                </ChipRow>
              )}
              {effectiveMode === 'schematic' ? (
                <AssemblySchematic
                  blocks={grouping.schematicBlocks}
                  steps={grouping.schematicSteps}
                  res={grouping.res}
                  labelOf={labelOfStep}
                  pieceNameOf={pieceNameOf}
                  onPickStep={pickStepInline}
                  onCreate={setPendingCreate}
                  pieceShapes={pieceShapes}
                  cloth={inlineCloth?.map ?? null}
                  smvOfBlock={grouping.smvOfBlock}
                  tailSmv={grouping.tailSmv}
                  onDissolve={dissolveUnit}
                  positions={prefs.pos}
                  // ИНЛАЙНОВАЯ СХЕМА ПИШЕТ В ТУ ЖЕ ИСТОРИЮ, хотя ⌘Z в ней нет. Иначе жест,
                  // сделанный здесь, оказался бы невидим для истории, и первое же ⌘Z в фулскрине
                  // отменило бы что-то ДРУГОЕ — жест старше последнего. Сигнатура у инлайна
                  // одиночная (`key, at`), поэтому пачка из одной правки.
                  onMove={(key, at) => moveNodes([{ key, at }])}
                  onResetPositions={resetPositions}
                  // ВЕСТЬ ИДЁТ ОБОИМ ВИДАМ, а не одному: полуразведённый проп — ровно тот дефект,
                  // который этот раунд вычищал.
                  renamedUnit={renamedUnit}
                  frozen={frozen}
                />
              ) : (
              <div className='lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto'>
                <SequenceRail
                  fields={fields}
                  grouped={grouped}
                  headerBefore={grouping.headerBefore}
                  selectedIndex={selectedIndex}
                  onSelect={(index) => setSelected(index)}
                  errorIndices={errorIndices}
                  brokenSteps={brokenSteps}
                  activePin={activePin}
                  activeBom={activeBom}
                  pieceShapes={pieceShapes}
                  onHoverPin={(n) => onActivePinChange?.(n)}
                  onDropPiece={addInputToOperation}
                  // Перестановка остаётся МУТАТОРОМ ЭТОГО ФАЙЛА: гейт `frozen`, ремап
                  // issues[].operationNumber и сброс формовой истории (3/11) стоят у него.
                  onMoveOperation={moveOperation}
                  readPieceDrag={readPieceDrag}
                  // Каталог работ — ОДНОЙ подпиской на весь рельс: имя строки спрашивает работу.
                  workCatalog={workCatalog}
                />
              </div>
              )}
              <button
                type='button'
                onClick={addOperation}
                className='mt-0.5 w-full border border-dashed border-borderColor py-1 text-labelColor transition-colors hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              >
                <Text size='control' variant='uppercase' tracking='label' component='span'>
                  + operation
                </Text>
              </button>
              <RailTotal />
            </div>

            {selectedIndex >= 0 && (
              <div ref={editorRef}>
              <OperationEditor
                // Keyed on the row's identity AND its position: both of the editor's "skip the first
                // run" guards are keyed to a mount, and their effects depend on `index`. Reordering
                // the open step changes the index without remounting, which would fire the
                // operation-type preset and the thread-from-BOM fill as if the user had just picked
                // them — quietly writing into blank machine / stitch / thread fields on a drag.
                key={`${fields[selectedIndex]?.id ?? 'op'}:${selectedIndex}`}
                index={selectedIndex}
                bomLines={bomItems}
                pieces={pieces}
                pieceShapes={pieceShapes}
                cloth={inlineCloth?.map ?? null}
                tiled={tiled}
                pinOptions={pinOptions}
                colorwayArticles={colorwayArticles}
                onInsertAfter={() => insertAfter(selectedIndex)}
                onRemove={() => removeOperation(selectedIndex)}
                onFlashPieces={flashPieces}
                // Слова про источник деталей — ИНЛАЙНОВЫЕ: лоток стоит прямо над списком, и
                // «click a piece in the tray» здесь правда.
                pieceSource={TRAY_PIECE_SOURCE}
                onActiveBomChange={onActiveBomChange}
                onEdit={clearFormHistory}
                onDropPiece={addInputToOperation}
                // ОДИН МУТАТОР НА ОБЕ ПОВЕРХНОСТИ: тот же экземпляр, что уезжает в док фулскрина
                // ниже. Второй «переименовать», написанный для второго экрана, разошёлся бы с
                // первым молча — ровно то, от чего стережёт R3.
                onRenameUnit={renameUnit}
                onDissolveUnit={dissolveUnit}
                mediaUrls={operationMediaUrls}
                frozen={frozen}
              />
              </div>
            )}
          </div>
        </div>
      )}

      {fsOpen && (
        <AssemblyFullscreen
          blocks={grouping.schematicBlocks}
          steps={grouping.schematicSteps}
          res={grouping.res}
          pieces={pieces}
          pieceNameOf={pieceNameOf}
          labelOf={labelOfStep}
          pieceShapes={pieceShapes}
          smvOfBlock={grouping.smvOfBlock}
          tailSmv={grouping.tailSmv}
          // ЦЕЛИКОМ, а не разложенный на positions/onMove/…: после Ф5б в объекте появятся ось и её
          // писатель, и они обязаны дойти до потребителя без правки этого файла.
          //
          // `reset` ПОДМЕНЁН ОБЁРТКОЙ, потому что сброс раскладки обязан унести и раскладочную
          // историю — иначе ⌘Z после «reset layout» вернул бы ОДНУ ноду в место, которого на
          // экране больше нет. Подменой, а не новым пропом: писатель раскладки у экрана один, и
          // второй канал к нему означал бы, что однажды позовут не тот.
          prefs={{ ...prefs, reset: resetPositions }}
          renamedUnit={renamedUnit}
          selectedIndex={selectedIndex}
          onPickStep={pickStepInline}
          setPendingCreate={setPendingCreate}
          dissolveUnit={dissolveUnit}
          addInputToOperation={addInputToOperation}
          // `addOperation` ФУЛСКРИНУ БОЛЬШЕ НЕ ОТДАЁТСЯ. Его «+ new operation» ведёт в диалог
          // создания (`setPendingCreate`), а не дописывает пустой шаг: там нет ни лотка, ни
          // способа набрать состав руками, и пустой шаг с нулём входов оказывался тупиком. Здесь,
          // на вкладке, кнопка остаётся прежней — лоток стоит прямо над списком.
          moveOperation={moveOperation}
          // РЕЛЬС РЕЖИМА СПИСКА (Ф6в) — ТЕ ЖЕ ДАННЫЕ И ТЕ ЖЕ КОЛБЭКИ, ЧТО У ИНЛАЙНОВОГО ниже, и
          // приезжают они пропами по той же причине, что и всё остальное: `useFieldArray` живёт в
          // единственном экземпляре здесь, второй с ним не синхронизируется. Сам `SequenceRail`
          // фулскрин импортирует сам — модуль ОДИН на оба вида.
          railFields={fields}
          railMarked={grouping.marked}
          railHeaderBefore={grouping.headerBefore}
          railErrorIndices={errorIndices}
          railBrokenSteps={brokenSteps}
          activePin={activePin}
          activeBom={activeBom}
          onHoverPin={(n) => onActivePinChange?.(n)}
          readPieceDrag={readPieceDrag}
          onMoveNodes={moveNodes}
          onUndo={undoGesture}
          undoTitle={undoTitle(peekUndo(histView))}
          canUndo={peekUndo(histView) !== null}
          onRedo={redoGesture}
          redoTitle={redoTitle(peekRedo(histView))}
          canRedo={peekRedo(histView) !== null}
          // ВОСЬМАЯ ИЗ ОДИННАДЦАТИ ТОЧЕК СБРОСА, и listener у неё ОДИН — на контейнере дока (вешает
          // его фулскрин, потому что док — его орган). Правки ПОЛЕЙ после create жестовым ⌘Z не
          // отменяются: возражение «undo возвращает больше, чем жест» живёт внутри выбранного
          // варианта, и снять его можно только так — перестав обещать отмену, как только начали
          // печатать. У поля есть СВОЯ, родная отмена ввода, и перехватывать ⌘Z в поле нельзя:
          // ровно поэтому правки полей в историю не попадают вовсе, а не «попадают позже».
          onDockEdit={clearFormHistory}
          // БИЛДЕР, А НЕ ГОТОВЫЙ ЭЛЕМЕНТ. `OperationEditor` — приватная функция этого файла с
          // полутора десятками пропов; вытаскивать её наружу ради фулскрина значило бы затеять
          // незапланированный рефакторинг там, где он опаснее всего. Билдер замыкает её со всеми
          // пропами прямо здесь, а ОРГАН ДОБОРА решает ФУЛСКРИН и передаёт аргументом: в Ф3 это
          // была снекбар-заглушка, в Ф5в — арм режима добора, и этот файл не тронулся. Теперь тем
          // же аргументом приезжают и СЛОВА про этот орган: инлайновые звали к лотку, которого в
          // фулскрине нет вовсе.
          renderDockEditor={(addPiece) =>
            selectedIndex >= 0 ? (
              <OperationEditor
                // ТОТ ЖЕ KEY-КОНТРАКТ, что у инлайна, и упрощать его нельзя: оба «пропусти первый
                // прогон» сторожа редактора привязаны к монтированию, а их эффекты зависят от
                // `index`. Пере-сортировка открытого шага меняет индекс без ремаунта — и пресет
                // типа операции с заполнением нитки из BOM отрабатывают так, будто их только что
                // выбрали, тихо записывая в пустые поля машины и нитки.
                key={`${fields[selectedIndex]?.id ?? 'op'}:${selectedIndex}`}
                index={selectedIndex}
                bomLines={bomItems}
                pieces={pieces}
                pieceShapes={pieceShapes}
                cloth={inlineCloth?.map ?? null}
                tiled={tiled}
                pinOptions={pinOptions}
                colorwayArticles={colorwayArticles}
                onInsertAfter={() => insertAfter(selectedIndex)}
                onRemove={() => removeOperation(selectedIndex)}
                onFlashPieces={addPiece.onArm}
                // Слова — ОТТУДА ЖЕ, ОТКУДА ОБРАБОТЧИК. Иначе редактор фулскрина продолжал бы
                // звать к лотку, а вооружал бы полку.
                pieceSource={addPiece}
                onActiveBomChange={onActiveBomChange}
                onEdit={clearFormHistory}
                onDropPiece={addInputToOperation}
                // ТЕ ЖЕ ЭКЗЕМПЛЯРЫ, что у инлайнового редактора выше, и это весь смысл R3: поле
                // кода узла стоит на двух поверхностях, а переписыватель ссылок — один.
                onRenameUnit={renameUnit}
                onDissolveUnit={dissolveUnit}
                mediaUrls={operationMediaUrls}
                frozen={frozen}
              />
            ) : null
          }
          // Второй экземпляр: корневой остался под оверлеем, а удалить шаг можно прямо из дока.
          // Компонент самодостаточен — форму он читает через контекст, а контекст в порталы
          // проникает.
          dockChrome={<StepNumberDrift />}
          // Готовым узлом, как `dockChrome`: `RailTotal` — приватный компонент этого файла без
          // пропов, и вытаскивать его наружу ради фулскрина значило бы затевать рефакторинг там,
          // где он не нужен.
          railTotal={<RailTotal />}
          frozen={frozen}
          onSave={() => onSave?.()}
          saving={saving}
          pieceClothByColorway={pieceClothByColorway ?? []}
          sketchNote={sketchNote}
          onExit={() => setFullscreen(false)}
        />
      )}

      <AssemblyCreateDialog
        prefill={pendingCreate}
        onClose={() => setPendingCreate(null)}
        onCreate={appendStep}
        // ФРОНТИР ЦЕЛЕВОЙ ПОЗИЦИИ, А НЕ КОНЦА ЛИСТА. У жеста без позиции это одно и то же, у
        // вставки — нет: `frontierBefore[at]` считает, что лежало на столе ПЕРЕД шагом `at`, а
        // конечный фронтир предложил бы входы, которые к этой позиции ещё не произведены или уже
        // съедены, то есть заведомо отвергаемый движком состав. Вставка ничего не меняет в
        // префиксе `0..at-1`, поэтому фронтир СТАРОГО массива на этом адресе и есть фронтир нового.
        frontier={frontierForCreate}
        unitKeys={new Set(grouping.res.units.keys())}
        pieceKeys={new Set(pieces.map((p) => p.lineKey))}
        labelOf={(k) => pieces.find((p) => p.lineKey === k)?.name ?? k}
        unitOfPlanned={unitOfPlanned}
        pieceOfPlanned={pieceOfPlanned}
        onCloseAutoFocus={restoreScreenFocus}
      />

      <GenerateOperationsPanel
        techCardId={techCardId}
        hasExistingOperations={fields.length > 0}
        readReplaceImpact={readReplaceImpact}
        onAccept={acceptGeneratedOperations}
        frozen={frozen}
        workCatalog={workCatalog}
      />
    </div>
  );
}
