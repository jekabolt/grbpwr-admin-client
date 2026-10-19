// Раскладка (nesting) modal: DXF выкройки одного размера → детали → авто-раскладка на
// полосе ткани в web worker'е. Расчётный инструмент, который теперь умеет ПЕРСИСТИТЬ
// результат: «сохранить раскладку» пишет маркер (tech_card_marker) с самодостаточной
// геометрией, и костинг читает расход на единицу. `view` открывает сохранённый маркер без
// воркера и без DXF. Файл лениво импортируется из patterns-field, так что
// dxf-parser/clipper2-js/воркер живут только в чанке раскладки.
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_TechCardMarker, googletype_Decimal } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { extractFieldViolations } from 'utils/field-errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CheckboxCommon,
  ConfirmationModal,
  Input,
  Pill,
  Selector,
  Text,
  HeaderWarnings,
  type HeaderWarning,
  type HeaderWarningAction,
  GenericPopover,
  Progress,
  EmptyCell,
} from 'ui';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { ROUTES, SECTION } from 'constants/routes';
import {
  CLEAR_SETTING,
  useUpdateWorkshopSettings,
  useWorkshopSettings,
} from 'components/managers/workshop/useWorkshopSettings';
import {
  autoPlies,
  estimateGarmentsPerPly,
  extraWithinTolerance,
  overCutOf,
  perPlyQuantities,
  spreadFigures,
  type SpreadMode,
} from 'lib/nesting/spread';
import type {
  FabricDirection,
  NestConfig,
  NestResult,
  Placement,
  PieceDTO,
  Unit,
} from 'lib/nesting/types';
import { NEST_DEFAULTS, allowsFlip } from 'lib/nesting/types';
import {
  STORED_LAYOUT_TOLERANCE,
  checkLayout,
  measureLayout,
  type Violation,
} from 'lib/nesting/geom/clearance';
// БЮДЖЕТ ДО ЗАПУСКА (Ф2.3). Та же модель, что решает внутри движка, какой точности контуры он
// потянет: экран зовёт ровно её, а не свою копию.
import { estimateJob, estimateRun } from 'lib/nesting/nest/estimate';
import { renderLayoutDxf } from 'lib/nesting/render/dxf';
import { renderLayoutSvg } from 'lib/nesting/render/svg';
import { drawingFromMarker } from 'lib/pattern-export/drawing';
import { plotFromMarker } from 'lib/pattern-export/plot-drawing';
import { PatternExportItems } from '../pattern-export/export-menu';
import { CANVAS_ICON_BTN, LayoutEditor } from './layout-editor';
import { isFetchFailure } from './dxf-warnings';
import { slotCutWidth as slotCutWidthOf, type MarkerColorway } from './colorway-widths';
import {
  buildMarkerLayout,
  compositionLabel,
  compositionOf,
  dec,
  decNum,
  exportFileName,
  legacyPairOf,
  markerToView,
  isDraftMarker,
  refusalWord,
  scalarNormRefusal,
  spreadToWire,
  storedSpreadOf,
  type MarkerBomLine,
  type MarkerCompositionEntry,
} from './marker-io';
import { markerScopeLines, strictestDirection } from '../bom-purpose';
import {
  blocksMissingOnLayer,
  clampSeamAllowanceMm,
  defaultContourLayer,
  layerOptions,
  seamAllowancePrefill,
  contourIsCutLine as contourCarriesCutLine,
} from './contour-layer';
import {
  allowanceUnknownText,
  buildAllowanceIndex,
  type ContourAllowance,
} from './contour-allowance';
import {
  describeRebuildError,
  rebuildMarkerDrawing,
  type PatternSource,
  type RebuildError,
} from './marker-rebuild';
import { isDxfUrl } from 'utils/pattern';
import { orientToGrain } from 'lib/nesting/geom/grain-orient';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import { engineCmToMm, mmToEngineCm } from './allowance-units';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { uniConflictReason } from './block-code';
import {
  dedupeUniPieces,
  markerUnits,
  pieceLineKeysByPieceId,
  selectMarkerPieces,
  unitsOfPieces,
} from './piece-selection';
import { splitPiecesBySize, useDictionarySizeTokens } from './use-block-sizes';
import { useNesting, type NestingFile } from './use-nesting';
import {
  FACT_ROW,
  Fact,
  FactLabel,
  FactList,
  MarkerQuiz,
  QuizSummary,
  useMarkerQuiz,
  type QuizRow,
  type QuizWarning,
} from './marker-quiz/marker-quiz';
import { useQuizDone } from './marker-quiz/use-quiz-done';
import { useLayMode } from './use-lay-mode';
import { useGoToBomLineField } from './go-to-card-field';

// Units are asked by a dialog at upload: the parse's note about them is not repeated here.
const UNITS_NOT_SET = /units are not set in the file/;
// Перенос надсечек с базового размера — служебная заметка разбора, не дело оператора раскладки.
// ТОЛЬКО легаси-заметка об УСПЕШНОМ переносе («— N carried …»). Отказ переноса («could not be
// carried … those sizes have no notches») — настоящая потеря надсечек и остаётся видимым.
const NOTCH_CARRY = /^notches are drawn only in the sample size — \d+ carried/;
// Упрощение контуров под бюджет — не дело оператора: движок компенсирует его зазором (gap + 2·eps)
// и проверяет зазоры по НЕупрощённым контурам, рез безопасен. Скрыто и в прогоне, и в блобах.
const SIMPLIFIED_NOTE = /contours are simplified to .* so the search can finish in time/;
// ЗАМЕТКИ, КОТОРЫЕ ЭТА МОДАЛКА НЕ ПОКАЗЫВАЕТ НИГДЕ — ни из свежего разбора, ни из блоба сохранённой
// раскладки (туда разбор пишет их вместе с остальными). Фильтр стоит в одном месте — на сборке шапки.
const isHiddenNote = (w: string): boolean =>
  UNITS_NOT_SET.test(w) || NOTCH_CARRY.test(w) || SIMPLIFIED_NOTE.test(w);
// Записи о припуске в блобе — протокол съёмки, а не предупреждение: вердикт о недоборе модалка
// выносит сама, по полям раскладки (см. storedNoAllowance), а не по тексту, который раньше писался
// «SEAM LINE was nested» на ЛЮБОМ нуле, в том числе на линии кроя.
const SEAM_NOTE_PREFIX = 'seam allowance:';
// ЗАПИСЬ О СТОЛЕ В БЛОБЕ — ЛЕГАСИ, только на ЧТЕНИЕ. Новые маркеры несут настил своим полем
// layout.spread (слои, запас, режим, физическая длина стола), а targetLengthCm — снова честная цель
// прогона. Маркеры, снятые до этого поля, хранили полезную U в params.targetLengthCm и признак этого
// протоколом в warnings: есть запись — targetLengthCm читается концом стола; нет — старой целью (до
// ae74b7da поле писалось из ручной «целевой длины»). Оба чтения живы, пока живы такие блобы.
const TABLE_NOTE_PREFIX = 'cutting table:';
const NO_ALLOWANCE_TEXT = 'nested without seam allowance · consumption too low';

// Направление ворса не задано на строке BOM (вкладка BOM карточки), см. directionUnset.
const DIRECTION_UNSET_TEXT = 'fabric direction not set on the BOM line';
const articleUrl = (materialId: number) => `${ROUTES.materials}?tab=catalog&material=${materialId}`;

// ОДНА КОРОБКА НА ВЕСЬ РЯД ТУЛБАРА: поле ввода, селект, переключатель и дверь деталей — одной
// ширины (FIELD), одной высоты и одной рамки (владелец: ряд полей ввода = один размер плиток).
const BOX =
  'flex h-6 w-full min-w-0 items-center rounded-none border border-borderColor bg-bgColor px-[7px] text-textBaseSize tabular-nums transition-colors hover:border-textColor focus:border-textColor focus:outline-none disabled:bg-pageBg disabled:text-labelColor';
const BOX_LABEL = 'block h-[14px] truncate uppercase leading-[14px]';

// Prior manual-edit notes are replaced, not stacked, on each re-save of a marker.
//
// ПОМЕТКА — СОХРАНЁННОЕ ЗНАЧЕНИЕ, а не только текст: она уезжает в warnings блоба (:1828) и
// оттуда же ЧИТАЕТСЯ ОБРАТНО, чтобы прежнюю пометку отбросить (:1730). Значит у пометки, как и у
// фолбэка имени листа в `sheet-name.ts`, есть легаси-написание, лежащее в блобах, снятых до
// перехода админки на английский. Отбирать надо по ОБОИМ: иначе на легаси-маркере старая пометка
// не отбрасывается никогда и каждое пересохранение подкладывает к ней ещё одну.
const MANUAL_NOTE_PREFIX = 'manual edit:';
const LEGACY_MANUAL_NOTE_PREFIX = 'ручная правка:';

/** Это пометка о ручной правке — в сегодняшнем написании либо в легаси? */
const isManualNote = (w: string): boolean =>
  w.startsWith(MANUAL_NOTE_PREFIX) || w.startsWith(LEGACY_MANUAL_NOTE_PREFIX);

// Терминальная причина отказа сохранения — «прогон ещё не завершён» во всех его видах. Когда
// она ЕДИНСТВЕННАЯ (обычное состояние до первого прогона), красный список не рендерится —
// error-бокс при только что открытой модалке девальвировал бы тон, — а причина уезжает в
// тултип кнопки. Константа, потому что это сравнение по идентичности строки.
const TERMINAL_SAVE_REASON = 'run a complete marker first';

// Нарушение словами. У кромочного (otherIndex отсутствует) required — это отступ, и при
// отступе 0 «0.00 см < 0.00 см» звучало бы бессмыслицей: деталь просто вышла за полотно.
/** Блокеры и предупреждения одной группы настроек: что кроим (1), как кладём (2), детали (3). */
type RailSectionStatus = {
  blockers: string[];
  warnings: string[];
};

/** Одна ширина на все поля тулбара (правило владельца: поля в ряд одного размера). */
const FIELD = 'w-[84px] shrink-0';
// Число без рамки в строке ведомости шага «run» (ширина полотна): линия снизу — только под курсором.
const CELL_INPUT =
  'w-16 min-w-0 border-b border-transparent bg-transparent p-0 text-right text-textBaseSize tabular-nums hover:border-hairline focus:border-textColor focus:outline-none disabled:text-labelColor';
// Строка ведомости — триггер поповера: та же строка плюс кольцо фокуса с клавиатуры.
const FACT_TRIGGER = `${FACT_ROW} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:text-labelColor`;

function violationText(v: Violation): string {
  if (v.otherIndex == null) {
    return v.required > 0
      ? `piece outside the cloth (margin ${v.required.toFixed(2)} cm)`
      : 'piece outside the cloth';
  }
  return `gap ${v.clearance.toFixed(2)} cm < ${v.required.toFixed(2)} cm`;
}

type PieceSel = Record<number, { checked: boolean; qty: number }>;

// Запас на конец настила с каждой стороны, см (как LAY_END_LOSS_DEFAULT_CM формы настила).
const END_LOSS_DEFAULT_CM = 2;
// «fit to the table»: пробные прогоны коротким бюджетом, не больше стольких попыток.
const FIT_PROBE_BUDGET_MS = 4000;
const FIT_MAX_ATTEMPTS = 6;

// СНИМОК ТОГО, С ЧЕМ ЗАПУЩЕН ПРОГОН. Сохранение и холст читают его, а не текущие поля: настройки
// цеха и артикул догружаются асинхронно и могли сменить припуск или ширину посреди прогона, и
// маркер записал бы не те числа, по которым движок укладывал.
type RunSnap = {
  config: NestConfig;
  pieces: PieceDTO[];
  composition: MarkerCompositionEntry[];
  allowanceMm: number;
  widthCm: number;
  gapCm: number;
  marginCm: number;
  crossGrain: boolean;
  // Стол прогона: полезная U (null = стол не задан), сам стол и запас — на момент СТАРТА. Сохраняется
  // именно это, а не сегодняшнее значение поля: правка стола после прогона результат не меняет.
  usableCm: number | null;
  tableCm: number | null;
  endLossCm: number;
  // Прогон шёл в режиме стола (настил слоями): только такой маркер записывает layout.spread.
  // Одиночный настил стола не знает — настил не пишется вовсе.
  layTable: boolean;
  // Режим настила на старте — часть идентичности прогона: переключение table↔single после
  // прогона меняет, пишется ли layout.spread, поэтому такой снимок устарел.
  layMode: 'single' | 'table';
};

// Заголовок без авто-хвоста: сохранённое имя вида «XS×9 · main fabric main fabric · 140 cm» — это
// подпись по умолчанию, не имя от человека; показывается «xs ×9 · main fabric». Своё имя — как есть.
const AUTO_NAME_TAIL = /\s·\s\d+(?:[.,]\d+)?\s?cm$/;
function cleanMarkerTitle(name: string): string {
  if (!AUTO_NAME_TAIL.test(name)) return name;
  return name
    .replace(AUTO_NAME_TAIL, '')
    .split(' · ')
    .map((part) => {
      const w = part.trim().split(/\s+/);
      if (w.length % 2 === 0) {
        const h = w.length / 2;
        const a = w.slice(0, h).join(' ');
        if (a.toLowerCase() === w.slice(h).join(' ').toLowerCase()) part = a;
      }
      return part.replace(/(\S+)×(\d+)/g, (_m, s: string, q: string) => `${s.toLowerCase()} ×${q}`);
    })
    .filter(Boolean)
    .join(' · ');
}

function PieceThumb({ piece }: { piece: PieceDTO }) {
  const path = useMemo(() => {
    const s = 30 / Math.max(piece.bboxW, piece.bboxH, 1e-6);
    return piece.poly.map((p) => `${(p.x * s).toFixed(1)},${(30 - p.y * s).toFixed(1)}`).join(' ');
  }, [piece]);
  return (
    <svg viewBox='-1 -1 32 32' className='h-8 w-8 shrink-0 border border-borderColor bg-bgColor'>
      <polygon points={path} fill='none' stroke='currentColor' strokeWidth='1' />
    </svg>
  );
}

function numOr(v: string, fallback: number): number {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

// ЧИСЛОВОЕ ПОЛЕ ТУЛБАРА. Пока поле в фокусе, в нём живёт СТРОКА: стёртый ноль остаётся пустым, а
// не прыгает обратно в «0» (иначе ввод «1» давал «01»). Число уходит наружу на каждом валидном
// вводе (или только на blur — `commitOnBlur`), пустое поле становится `emptyAs` на blur (без него
// — откат к прежнему значению). Фокус выделяет всё: набор заменяет число, а не дописывается к нему.
// type=text + inputMode — без нативных стрелок, которые ломали ряд одинаковых коробок.
function NumBox({
  name,
  value,
  onCommit,
  decimal = false,
  emptyAs,
  commitOnBlur = false,
  disabled,
  onClear,
  className = BOX,
  arrowStep = false,
}: {
  name: string;
  // null = не задано: пустая коробка, а не ноль.
  value: number | null;
  onCommit: (n: number) => void;
  decimal?: boolean;
  emptyAs?: number;
  commitOnBlur?: boolean;
  disabled?: boolean;
  // Пустое поле без emptyAs — «очистить» (стол, предел стопки).
  onClear?: () => void;
  className?: string;
  // ↑/↓ меняют целое на 1 (ячейки состава настила).
  arrowStep?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const parse = (raw: string): number | null => {
    const t = raw.trim().replace(',', '.');
    if (t === '' || t === '.' || !(decimal ? /^\d*\.?\d*$/ : /^\d+$/).test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  return (
    <input
      id={name}
      name={name}
      type='text'
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete='off'
      className={className}
      value={draft ?? (value == null ? '' : String(value))}
      onKeyDown={
        arrowStep
          ? (e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
              e.preventDefault();
              const cur = parse(draft ?? '') ?? value ?? 0;
              const next = Math.max(0, cur + (e.key === 'ArrowUp' ? 1 : -1));
              setDraft(String(next));
              onCommit(next);
            }
          : undefined
      }
      disabled={disabled}
      onFocus={(e) => {
        setDraft(value == null ? '' : String(value));
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (commitOnBlur) return;
        const n = parse(raw);
        if (n != null) onCommit(n);
      }}
      onBlur={() => {
        const raw = draft ?? '';
        setDraft(null);
        const n = parse(raw);
        if (n != null) {
          if (commitOnBlur) onCommit(n);
        } else if (raw.trim() === '' && emptyAs != null) {
          onCommit(emptyAs);
        } else if (raw.trim() === '' && onClear) {
          onClear();
        }
      }}
    />
  );
}

// ПЕРЕСОБРАННЫЙ ЧЕРТЁЖ ДЕТАЛИ (Ф3.5) — состояние, а не булево. Четыре ответа, и каждый решает
// судьбу кнопок экспорта по-своему: 'off' — пересобирать нечего (режим расчёта, где чертёж и так
// на руках, либо деградированный блоб, у которого нет и контуров); 'running' — ответа ЕЩЁ нет, и
// выпускать файл до него нельзя; 'ok' — чертёж восстановлен и уезжает в экспорт; 'error' — не
// восстановлен, и это ВИДИМАЯ новость, а не тихо неполный файл.
type DrawingState =
  | { phase: 'off' }
  | { phase: 'running' }
  | { phase: 'ok'; pieces: PieceDTO[]; warnings: string[] }
  | { phase: 'error'; error: RebuildError };

export function NestingModal({
  files,
  sizeLabel,
  onClose,
  techCardId,
  sizeId,
  sizeIdByToken,
  bomLines,
  colorways,
  lockedBomLineKey,
  fabricDirection = 'unknown',
  view,
  canEdit = true,
  savedSizeIds,
  season,
  styleNumber,
  pieceAliases,
  requiredSeamAllowanceMm,
  workshopDefaultSeamAllowanceMm,
  productionRunId = 0,
  autoRun = false,
  initialColorwayId,
}: {
  files: NestingFile[] | null; // null = closed (nest mode)
  sizeLabel?: string;
  onClose: () => void;
  // Server context for «сохранить раскладку». Absent = compute-only (the save button hides).
  techCardId?: number;
  sizeId?: number;
  // Размерный токен из имён блоков → id размера карточки. Один DXF несёт весь ряд, поэтому
  // маркер обязан сохраняться на ВЫБРАННЫЙ внутри размер, а не на тот, в чей слот файл
  // когда-то положили: иначе он молча запишется не туда, и костинг возьмёт чужую длину.
  sizeIdByToken?: Map<string, number>;
  // The card's roll-goods BOM lines (slot select of the save dialog) — fabric, lining,
  // interlining and insulation, each carrying the word for its role.
  bomLines?: MarkerBomLine[];
  // The card's colourways with the cutting width each one's PINNED article gives per slot. The
  // раскладка is measured on a concrete cloth, and which cloth that is comes from the colourway,
  // not from the slot: the slot is the role («подкладка»), the colourway names the article.
  colorways?: MarkerColorway[];
  // The fabric these DXFs are bound to (0260). When set, the раскладка IS that cloth: the slot
  // is fixed, the width comes from it, and the save dialog shows the slot rather than asking.
  lockedBomLineKey?: string;
  // НАПРАВЛЕНИЕ ткани этой раскладки, уже сведённое по скоупу (строгое побеждает — см.
  // bom-purpose.ts). Решает ровно один вопрос: можно ли переворачивать деталь на 180°.
  // 'unknown' — не «можно», а «никто не ответил»: поиск в этом случае работает как раньше,
  // а сохранение НОРМЫ сервер не примет, потому что норма без ответа про ворс — это норма,
  // которую нельзя воспроизвести на ткани.
  fabricDirection?: FabricDirection;
  // A stored marker to DISPLAY: no worker, no DXF fetch — geometry comes from the blob.
  // Editing a stored layout is Ф5; this mode is view + export.
  view?: common_TechCardMarker | null;
  // Mirrors MarkersSection's delete gate: RBAC write + not released. Default true keeps
  // compute-only embeddings working.
  canEdit?: boolean;
  // The sizes the SERVER knows (a size added to the form but never saved cannot take a
  // marker — the backend validates against the stored range).
  savedSizeIds?: number[];
  // Filename context: осмысленные имена экспортов (SEASON-STYLE-размер-…).
  season?: string;
  styleNumber?: string;
  // Сопоставление «блок DXF → деталь кроя», как оно записано на карточке, УЖЕ отфильтрованное по
  // скоупу этих листов (это знает вызывающий: у одного имени блока на подкладе и на верхе разные
  // детали кроя). Нужно ровно для одного: проставить в блоб маркера piece_line_key, чтобы
  // сохранённая раскладка пережила переименование детали. Пусто/не передано — маркер сохранится
  // с пустыми ключами, как и раньше: это законное «неизвестно», а не «такой детали нет».
  pieceAliases?: readonly { blockName?: string; pieceLineKey?: string }[];
  // «ТРЕБУЕМЫЙ ПРИПУСК» карточки, мм (Ф3.2). Это ЭТАЛОН, а не факт: он предзаполняет поле, но
  // никогда не переписывает то, что оператор ввёл руками, и не участвует в отказах — сравнение
  // «не хуже» делает гейт готовности (Ф6), а не путь сохранения. `null`/не передано = карточка
  // эталона не задала, и подставлять ноль ЗАПРЕЩЕНО: ноль здесь — законная настройка («наши
  // выкройки несут линию кроя»), и спутать её с «не настроено» значит объявить каждую раскладку с
  // припуском нарушающей эталон, которого никто не задавал.
  requiredSeamAllowanceMm?: number | null;
  // Deep link (colourways → `?marker=<lineKey>&auto=1`): press «run» once by itself as soon as the
  // parse is ready and nothing blocks the run. Blocked = nothing happens; the header says why.
  autoRun?: boolean;
  // Колорвей, выбранный при открытии (deep link из COLOURWAYS). Только начальное значение.
  initialColorwayId?: number;
  // Припуск цеха по умолчанию, мм (admin.WorkshopSettings.default_seam_allowance_mm). Тот же
  // договор: `null` = не настроено, и это НЕ ноль.
  workshopDefaultSeamAllowanceMm?: number | null;
  // ПРОГОН, ПОД КОТОРЫЙ СНИМАЕТСЯ РАСКРОЙНЫЙ МАРКЕР (Ф4.2). 0 = карточный — все сегодняшние
  // раскладки и норма. Модалка про настилы не знает ничего и знать не должна: она только
  // проставляет владельца, а секции настила собирает редактор на странице прогона.
  //
  // Поле НЕИЗМЕНЯЕМО после создания (см. комментарий у TechCardMarkerInsert.production_run_id):
  // перевод карточного маркера в прогонный переносит право на его жизнь — раскройный умирает
  // вместе с прогоном по FK CASCADE. Поэтому оно едет как ПРОП, а не как контрол на экране.
  productionRunId?: number;
}) {
  // В РЕЖИМЕ ПРОСМОТРА ФАЙЛЫ НЕ РАЗБИРАЮТСЯ ЭТИМ ХУКОМ, и это не экономия, а устранение второго
  // разбора. С §7.5 вызывающий передаёт в `files` сегодняшние выкройки ткани — но нужны они
  // ПЕРЕСБОРКЕ (ниже), которая разбирает их с параметрами ИЗ БЛОБА (unit/tol/tolChain), а не
  // сегодняшними умолчаниями. Отдать те же файлы ещё и сюда значило бы скачать их дважды и
  // дважды разобрать в двух воркерах — ради `allPieces`, которых в этом режиме не читает никто:
  // геометрию даёт блоб, левая колонка скрыта, прогон недоступен.
  const { parse, run, start, stop, resetRun, reparse, unitOverride, probe, cancelProbe } =
    useNesting(view ? null : files);
  const viewData = useMemo(() => (view ? markerToView(view) : null), [view]);
  // Отказ выдать скалярную норму у ОТКРЫТОГО маркера — слово сервера, если он его сказал.
  // Показывается вместо числа: «средняя по составу» и настоящая норма выглядят одинаково.
  const viewRefusal = view?.summary ? scalarNormRefusal(view.summary) : '';

  // The CUTTING width the layout runs on — roll width minus the кромка on both edges. The
  // selvedge is real consumed cloth, so it is not laid on and not forgotten either: it rides
  // the marker as selvedge_cm and shows up as its own component of the waste decomposition.
  const [widthCm, setWidthCm] = useState<number>(NEST_DEFAULTS.fabricWidthCm);
  // Raw keystrokes; the min-clamp lands on BLUR (clamping per keystroke makes 90 unreachable
  // — typing «9» snaps to 10).
  const [widthRaw, setWidthRaw] = useState<string | null>(null);
  // Ширины нет НИГДЕ (ни у пина колорвея, ни у строки BOM): коробка пустая, прогон закрыт, в шапке
  // дверь туда, где её задают. 140 по умолчанию здесь была бы правдоподобной и неверной длиной.
  const [widthUnset, setWidthUnset] = useState(false);
  // Целевая длина движком не используется (только SVG/вердикт) — поле скрыто, состояние осталось.
  const [targetCm] = useState<number | ''>('');
  const [gapCm, setGapCm] = useState<number>(NEST_DEFAULTS.gapCm);
  const [marginCm, setMarginCm] = useState<number>(NEST_DEFAULTS.edgeMarginCm);
  // Припуск на шов: контур из DXF — линия ШВА, а кроят по линии КРОЯ. Это вход алгоритма, а не
  // подпись к результату (см. lib/nesting/geom/seam-allowance.ts).
  // МИЛЛИМЕТРЫ — это поле оператора и то, что уезжает на провод (0290). Движок остаётся в
  // сантиметрах, и перевод делают ровно две функции из allowance-units.ts, на двух вызовах ниже.
  const [allowanceMm, setAllowanceMm] = useState<number>(
    engineCmToMm(NEST_DEFAULTS.seamAllowanceCm),
  );
  const [crossGrain, setCrossGrain] = useState<boolean>(NEST_DEFAULTS.allowCrossGrain);
  // Бюджет поиска — дефолт (селектор убран, patterns-lite).
  const [budgetS] = useState<number>(NEST_DEFAULTS.timeBudgetMs / 1000);
  const [sel, setSel] = useState<PieceSel>({});
  // СОСТАВ РАСКЛАДКИ (Ф2): размерный ТОКЕН файла → сколько ИЗДЕЛИЙ этого размера кроит настил.
  //
  // Здесь стоял скаляр `setsN` («комплектов»), и он умел выразить ровно одно — N одинаковых
  // изделий одного размера. Настоящий настил кроят смешанным: мелкие детали одного размера
  // садятся в межлекальные выпады другого, и такая раскладка КОРОЧЕ суммы однородных. Скаляром
  // это не записывается вовсе, поэтому каждая снятая до сегодня норма мерялась на настиле,
  // которого в цехе не бывает.
  //
  // Ключ — токен ФАЙЛА, а не id размера карточки: разбор деталей идёт в токенах (splitPiecesBySize),
  // и токен может не резолвиться в размер карточки — такую раскладку разрешено СЧИТАТЬ (оператор
  // смотрит), но не сохранять. Ключ '' — файл без размерных хвостов: тогда состав ровно один,
  // размер берётся из слота, а поле подписано «изделий» и ведёт себя ровно как прежние комплекты.
  const [qtyByToken, setQtyByToken] = useState<Record<string, number>>({});

  // Один DXF несёт ВЕСЬ размерный ряд, а блок несёт контур на нескольких слоях (линия шва и
  // линия кроя). Раскладывать надо ровно один размер по ровно одному контуру: иначе на полосу
  // ложится вся градация сразу и меряется длина, которая не относится ни к одному размеру.
  const allPieces = useMemo(() => (parse.phase === 'ready' ? parse.pieces : []), [parse]);
  const dictTokens = useDictionarySizeTokens();
  const split = useMemo(() => splitPiecesBySize(allPieces, dictTokens), [allPieces, dictTokens]);
  // ЗАМЕР ПРИПУСКА, УЖЕ ЛЕЖАЩЕГО В КОНТУРЕ (Ф3.3) — по ПОЛНОМУ разбору и ровно один раз.
  //
  // `allPieces`, а не `selectedPieces` и не `pieces`: улика — это ВТОРОЙ контур того же блока, то
  // есть ровно то, что фильтр по слою из набора и выбрасывает. Померить на отфильтрованном наборе
  // значит гарантированно получить 'unknown' на каждом слое и назвать это «файл такой».
  //
  // Индекс общий для списка слоёв и для выбранного слоя: пара контуров внутри блока ОДНА, и
  // считать её по разу на слой (3–13 мс за проход) незачем. В режиме просмотра не строится вовсе
  // — там нет ни файла, ни выбора слоя, а у деталей из блоба нет места в чертеже.
  const allowanceIndex = useMemo(
    () => (viewData || allPieces.length === 0 ? null : buildAllowanceIndex(allPieces)),
    [viewData, allPieces],
  );
  const layerOpts = useMemo(
    () => layerOptions(allPieces, split.codeById, allowanceIndex ?? undefined),
    [allPieces, split, allowanceIndex],
  );
  // Деталь кроя за каждой разобранной деталью — ключ, который едет в блоб маркера (схема 2).
  //
  // Поле в блобе существует с самой схемы 2, а заполнялось всё это время пустой строкой: вызов
  // buildMarkerLayout просто не передавал карту, и «идентичность детали в блобе» была мертва с
  // рождения. Видно это только в маркере, открытом ПОСЛЕ переименования детали кроя, — то есть
  // тогда, когда ответ уже не восстановить.
  //
  // Считается ИЗ ДВУХ ПОЛОВИН, и обе приходят снаружи этой функции: скоуп алиасов знает
  // вызывающий (у одного имени блока на подкладе и на верхе разные детали кроя), идентичность
  // блока знает разбор. Само правило живёт в piece-selection.ts — ту же карту собирает очередь
  // раскроя партии, у которой этой модалки нет вовсе, и вторая копия правила разъехалась бы
  // молча: в блоб попала бы «случайная из двух спорящих» деталь вместо пустого «неизвестно».
  const pieceLineKeyById = useMemo(
    () => pieceLineKeysByPieceId(allPieces, split, pieceAliases),
    [pieceAliases, allPieces, split],
  );
  // Выбор контурного слоя убран из UI (patterns-lite): всегда defaultContourLayer.
  const [activeLayer] = useState<string | null>(null);
  const contourLayer = layerOpts.some((o) => o.layer === activeLayer)
    ? (activeLayer as string)
    : defaultContourLayer(layerOpts);
  // ЧТО ЛЕЖИТ НА ВЫБРАННОМ СЛОЕ — линия кроя или линия шва. Берётся из уже посчитанного списка
  // слоёв, а не меряется повторно: это тот же самый замер, и второй его экземпляр был бы местом,
  // где два числа однажды разойдутся.
  //
  // Считается и на слое ПО УМОЛЧАНИЮ, а не только после ручного перебора. Спека §1.4 замечает,
  // что правило «по градации» обычно само ставит линию шва первой, — но `blazer.dxf` несёт ЧЕТЫРЕ
  // полных контурных слоя (две линии кроя и две линии шва), и «обычно» на нём не выполняется.
  // Проверка, которая включается только после ручного клика, пропустила бы ровно тот файл, ради
  // которого писалась.
  const contourMeasure: ContourAllowance | null =
    layerOpts.find((o) => o.layer === contourLayer)?.allowance ?? null;
  // Слой, на котором ЗАМЕРЕНА линия шва, — второй из двух выходов, которые обязан назвать отказ.
  // UNI-ДУБЛИ: одна неградуируемая деталь, приехавшая из по-размерных выгрузок несколькими
  // именами, кроится ОДИН раз. Считается ДО списка размеров и до отбора деталей, потому что
  // исключённые копии не должны попадать НИ В ОДИН счёт: увидев «6 деталей без размера» вместо
  // трёх, оператор поверит числу, а не раскладке.
  const uniDedupe = useMemo(
    () => dedupeUniPieces(allPieces, split.codeById, contourLayer),
    [allPieces, split, contourLayer],
  );
  // Конфликт — ОТКАЗ, а не выбор: см. dedupeUniPieces. Прогон и сохранение с ним не идут.
  const uniRefusal = uniDedupe.conflicts.length > 0 ? uniConflictReason(uniDedupe.conflicts) : null;
  const sizeOpts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of allPieces) {
      if ((p.layer ?? '') !== contourLayer) continue;
      if (uniDedupe.excludedIds.has(p.id)) continue;
      const s = split.codeById.get(p.id)?.size ?? '';
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    return [...seen.entries()]
      .map(([size, count]) => ({ size, count }))
      .sort(
        (a, b) => (split.orderOfSize.get(a.size) ?? 1e6) - (split.orderOfSize.get(b.size) ?? 1e6),
      );
  }, [allPieces, split, contourLayer, uniDedupe]);
  const missingOnLayer = useMemo(
    () => blocksMissingOnLayer(allPieces, contourLayer),
    [allPieces, contourLayer],
  );
  // Градуированные размеры файла — строки состава. Группа '' сюда НЕ входит и размером не
  // является: это детали без размерного хвоста, и по формуле блоба они кроятся по одной на
  // КАЖДОЕ изделие состава, а не «вместо» размера. Пока состав был одним размером, '' выглядела
  // как ещё один вариант в переключателе — и выбрав размер M, оператор терял неградуируемые
  // детали из раскладки молча.
  const gradedOpts = useMemo(() => sizeOpts.filter((o) => o.size !== ''), [sizeOpts]);
  const ungradedCount = sizeOpts.find((o) => o.size === '')?.count ?? 0;
  // ВСЕ безразмерные детали настила помечены токеном UNI — тогда «без размера в имени блока» про
  // них неправда: автор ЗАЯВИЛ, что деталь одна на весь ряд, и разбор ничего не терял. Условие
  // полное намеренно: одна непомеченная деталь в группе — и подпись возвращается к прежней, потому
  // что именно у неё размер, возможно, просто не опознан. Считается по тем же деталям, что и
  // счётчик: слой контура и исключённые uni-копии, иначе число и слова разойдутся.
  const ungradedAllUni = useMemo(() => {
    let any = false;
    for (const p of allPieces) {
      if ((p.layer ?? '') !== contourLayer) continue;
      if (uniDedupe.excludedIds.has(p.id)) continue;
      const code = split.codeById.get(p.id);
      if ((code?.size ?? '') !== '') continue;
      if (!code?.uni) return false;
      any = true;
    }
    return any;
  }, [allPieces, split, contourLayer, uniDedupe]);
  // СТРОКА СОСТАВА — ЭТО РАЗМЕР КАРТОЧКИ, А НЕ НАПИСАНИЕ ТОКЕНА. Реальные файлы пишут один
  // размер несколькими графиками: BP_M и SL_R_m, скобочный базовый BP_<S> рядом с FP_S, буква и
  // число одного ряда. Пока строки ключевались сырым хвостом, такие написания давали ДВЕ строки
  // на один size_id — и у файла не оставалось корректного ввода вовсе: заполнить обе значило
  // получить отказ сервера («lists size N twice») ПОСЛЕ оплаченного прогона, занулить одну —
  // молча выкроить настил без деталей второй графики. Поэтому написания сливаются здесь, на
  // входе: одна строка, сумма деталей, одно количество — а сырые токены остаются подписью.
  //
  // Ключ строки стабилен к переразбору: резолвнутый размер — '#id', нерезолвнутый токен — сам
  // токен с префиксом (два нерезолвнутых написания сливать нельзя — может статься, это РАЗНЫЕ
  // отсутствующие размеры, и слив спрятал бы один из них из списка «добавьте в карточку»).
  const foldedRows = useMemo(() => {
    const rows = new Map<
      string,
      { key: string; tokens: string[]; count: number; sizeId: number; resolvable: boolean }
    >();
    for (const o of gradedOpts) {
      const bare = o.size.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
      const sizeId = (bare ? sizeIdByToken?.get(bare) : undefined) ?? 0;
      const resolvable = !bare || sizeIdByToken == null || sizeIdByToken.has(bare);
      const key = sizeId > 0 ? `#${sizeId}` : `?${o.size}`;
      const prev = rows.get(key);
      if (prev) {
        prev.tokens.push(o.size);
        prev.count += o.count;
      } else {
        rows.set(key, { key, tokens: [o.size], count: o.count, sizeId, resolvable });
      }
    }
    return [...rows.values()];
  }, [gradedOpts, sizeIdByToken]);
  // Затравка состава: крупнейшая строка — 1 изделие, остальные 0. Ровно то же умолчание, что
  // было у прежнего «показать самый большой размер», и то же число, что стояло в «комплектов».
  // Пересевается, когда меняется НАБОР строк (смена контурного слоя, новый разбор). Разделитель —
  // NUL как escape-последовательность: литеральный байт в исходнике превращал файл в «бинарный»
  // для grep/diff, а видимый разделитель мог бы встретиться в токене.
  const tokensKey = foldedRows.map((r) => r.key).join('\u0000');
  useEffect(() => {
    const largest = foldedRows.reduce<{ key: string; count: number } | null>(
      (best, r) => (!best || r.count > best.count ? r : best),
      null,
    );
    setQtyByToken(largest ? { [largest.key]: 1 } : { '': 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensKey]);

  // Строки состава с количеством. sizeId 0 = токен не резолвится: считать такую раскладку
  // можно, сохранить — нет (тот же отказ, что был у одиночного размера, только построчно).
  //
  // ЯЧЕЙКИ ≠ СОСТАВ МАРКЕРА В РЕЖИМЕ СТОЛА. В «single lay» ячейка — сколько изделий лежит в маркере.
  // В «table» ячейка — сколько изделий КРОИТЬ всего, а маркер — ОДИН слой настила: его состав
  // q_s = ⌈total_s / plies⌉ (слои режут стопкой). XS 10 при 10 слоях — один XS на столе, а не
  // десять. compRows/activeRows/ungradedUnits ниже — всегда состав МАРКЕРА (то, что нестит движок
  // и что сохраняется); cellRows/cellUngraded — то, что в ячейках.
  const cellRows = useMemo(
    () =>
      foldedRows.map((r) => ({
        ...r,
        label: r.tokens.join(' / '),
        qty: Math.max(0, Math.round(qtyByToken[r.key] ?? 0)),
      })),
    [foldedRows, qtyByToken],
  );
  // Файл без градации: одно число «изделий», размер даёт слот. Прежнее поведение целиком.
  const cellUngraded = Math.max(1, Math.round(qtyByToken[''] ?? 1));
  const graded = cellRows.length > 0;
  // Слои: null = авто (НОД итогов под пределом стопки, см. autoPlies); число — своё значение
  // оператора, пока он не вернёт «auto».
  const [pliesEdit, setPlies] = useState<number | null>(null);
  const [spreadMode, setSpreadMode] = useState<SpreadMode>('face_up');
  // РЕЖИМ НАСТИЛА (раунд 6): «single lay» — один настил без стола, граница стола в движок не
  // уходит; «table» — настил слоями под стол. Режим помнит браузер.
  const [layMode, setLayMode] = useLayMode();
  const tableMode = layMode === 'table';
  // Предел стопки в СЛОЯХ считается ниже (толщина живёт у слота ткани) и зеркалится сюда эффектом.
  const [stackCapPlies, setStackCapPlies] = useState<number | null>(null);
  const cutTotals = useMemo(
    () => (graded ? cellRows.map((r) => r.qty) : [cellUngraded]),
    [graded, cellRows, cellUngraded],
  );
  const autoPliesN = useMemo(
    () => autoPlies(cutTotals, stackCapPlies, spreadMode === 'face_to_face'),
    [cutTotals, stackCapPlies, spreadMode],
  );
  const plies = pliesEdit ?? autoPliesN;
  const pliesAuto = pliesEdit == null;
  // Лицом к лицу слои идут парами: нечётное число закрывает прогон и сохранение.
  const pliesParityBad = tableMode && spreadMode === 'face_to_face' && plies % 2 === 1;
  const perPly = useMemo(
    () => (tableMode ? perPlyQuantities(cutTotals, plies) : cutTotals),
    [tableMode, cutTotals, plies],
  );
  // Перекрой по размерам: plies·q − total (только в режиме стола).
  const overCut = useMemo(
    () => (tableMode ? overCutOf(cutTotals, plies) : cutTotals.map(() => 0)),
    [tableMode, cutTotals, plies],
  );
  const compRows = useMemo(
    () => (graded ? cellRows.map((r, i) => ({ ...r, qty: perPly[i] ?? 0 })) : cellRows),
    [graded, cellRows, perPly],
  );
  const activeRows = useMemo(() => compRows.filter((r) => r.qty >= 1), [compRows]);
  const ungradedUnits = graded ? cellUngraded : Math.max(1, perPly[0] ?? 1);
  // ТИРАЖ НАСТИЛА И ФОРМУЛА БЛОБА — из общего модуля (piece-selection.ts), а не выражением здесь.
  // Ту же формулу собирает очередь раскроя партии на вкладке костинга, БЕЗ этой модалки, и вторая
  // её копия была бы вторым ответом на вопрос «сколько экземпляров этой детали кроят».
  const units = useMemo(
    () => markerUnits({ graded, rows: activeRows, ungradedUnits }),
    [graded, activeRows, ungradedUnits],
  );
  // Сколько ИЗДЕЛИЙ кроит настил — делитель расхода и множитель неградуируемых деталей.
  const unitsTotal = units.unitsTotal;
  const unitsOfPiece = useMemo(
    () => unitsOfPieces(allPieces, (id) => split.codeById.get(id)?.size ?? '', units),
    [allPieces, split, units],
  );
  // В раскладку идут детали ВСЕХ размеров состава плюс неградуируемые. Размер с количеством 0 —
  // это «не кроим», и его детали не попадают ни в поиск, ни в блоб.
  const selectedPieces = useMemo(
    () =>
      selectMarkerPieces(allPieces, contourLayer, unitsOfPiece).filter(
        (p) => !uniDedupe.excludedIds.has(p.id),
      ),
    [allPieces, contourLayer, unitsOfPiece, uniDedupe],
  );
  // СОСТАВ, КОТОРЫЙ УЕДЕТ НА СЕРВЕР — в id размеров карточки и отсортированный по ним (тот же
  // порядок канонизирует сервер, и он часть байтов блоба). Токены, не резолвящиеся в размер,
  // сюда не попадают — и ровно поэтому ниже стоит отдельный запрет на сохранение: молча
  // сохранить состав, из которого выпал размер, значит записать норму, которой не мерялось.
  const composition: MarkerCompositionEntry[] = useMemo(() => {
    if (graded) {
      return activeRows
        .filter((r) => r.sizeId > 0)
        .map((r) => ({ sizeId: r.sizeId, quantity: r.qty }))
        .sort((a, b) => a.sizeId - b.sizeId);
    }
    // Файл без градации: размер даёт слот (проп), количество — поле «изделий».
    return sizeId ? [{ sizeId, quantity: ungradedUnits }] : [];
  }, [graded, activeRows, sizeId, ungradedUnits]);
  const mixed = composition.length > 1;
  // Имя размера по id — токеном ФАЙЛА, как он написан в имени блока. Словарь размеров сюда не
  // доезжает (в модалку передают только карту токен→id), а токен оператор и так видит в таблице
  // состава — подписывать состав вторым написанием того же размера значило бы завести разночтение.
  const sizeNameOfId = (id: number) =>
    compRows.find((r) => r.sizeId === id)?.tokens[0] || sizeLabel || `#${id}`;
  // Размер из файла, которого в карточке нет, сохранить нельзя — сервер проверяет ряд, и
  // молча записать раскладку «куда-нибудь» хуже, чем отказать с объяснением. Теперь ПОСТРОЧНО:
  // нест разрешён (оператор смотрит), сохранение — нет.
  const unresolvedTokens = activeRows
    .filter((r) => !r.resolvable || r.sizeId <= 0)
    .map((r) => r.label);
  const sizeUnresolved = unresolvedTokens.length > 0 || (!graded && !sizeId);
  // Размер градации каждой детали — в блоб (схема 4). Только резолвящиеся: 0 означало бы
  // «деталь не градуируется», а это другой факт и другая ветка формулы.
  const sizeIdByPieceId = useMemo(() => {
    const byToken = new Map<string, number>();
    for (const r of compRows) for (const t of r.tokens) byToken.set(t, r.sizeId);
    const m = new Map<number, number>();
    for (const p of allPieces) {
      const sid = byToken.get(split.codeById.get(p.id)?.size ?? '') ?? 0;
      if (sid > 0) m.set(p.id, sid);
    }
    return m;
  }, [allPieces, split, compRows]);

  // Ориентация по долевой. Движок считает, что деталь нарисована долевой вдоль полосы, — в
  // реальных файлах это не так, и деталь, выкроенная поперёк долевой, тянется и садится не
  // туда. Поворачиваем ПОДЕТАЛЬНО: в одном файле все детали под 90°, в другом половина под 0°,
  // половина под 90°, так что общий поворот листа починил бы один и сломал другой.
  const grainLayers = useMemo(() => grainLayerOptions(allPieces), [allPieces]);
  const autoGrainLayer = useMemo(() => defaultGrainLayer(grainLayers), [grainLayers]);
  // null = следовать автоопределению; '' = не разворачивать. Слой можно и ПЕРЕБРАТЬ, а не
  // только выключить: опознание — эвристика, и молча ошибиться она может в обе стороны.
  // Выбор слоя долевой убран из UI (patterns-lite): всегда авто.
  const [grainPick] = useState<string | null>(null);
  const grainLayer =
    grainPick === null
      ? autoGrainLayer
      : grainLayers.some((o) => o.layer === grainPick)
        ? grainPick
        : '';
  const oriented = useMemo(
    () => orientToGrain(selectedPieces, grainLayer),
    [selectedPieces, grainLayer],
  );
  // Припуск раздувает контур ЗДЕСЬ и той же чистой функцией, что зовёт воркер на тех же деталях
  // с тем же числом. Само число едет в NestConfig — геометрия через границу воркера не ходит, и
  // припуск, применённый только тут, до движка бы не доехал (ровно так однажды уехал в прод
  // разворот по долевой: экран показывал одно, укладывалось другое).
  const seam = useMemo(
    () => applySeamAllowance(oriented.pieces, mmToEngineCm(allowanceMm)),
    [oriented, allowanceMm],
  );
  const pieces = seam.pieces;
  const usable = widthCm - 2 * marginCm;

  // ── ДВОЙНОЙ ПРИПУСК И ОТКУДА БЕРЁТСЯ ЧИСЛО В ПОЛЕ (Ф3.2, спека §5.3–§5.5) ─────────────────
  //
  // Вопрос ровно один: «в контуре, который мы раскладываем, припуск УЖЕ есть?» Если да (замерена
  // ЛИНИЯ КРОЯ) и оператор при этом просит офсет — припуск ляжет ДВАЖДЫ, и маркер выйдет длиннее
  // настоящего по периметру каждой детали. Заметить это на картинке нечем: раскладка выглядит
  // правильной, просто ткани в ней больше.
  //
  // ЗДЕСЬ ЭТО ЛОВИТСЯ ДО ПРОГОНА, а сервер ловит на сохранении (§5.3). Не вторая политика: правило
  // одно и то же, и клиентская проверка нужна затем, чтобы отказ не приходил ПОСЛЕ оплаченного
  // бюджета — на прогон уходят десятки секунд, и узнать в конце, что норму не примут, значит
  // выбросить их.
  const contourIsCutLine = contourCarriesCutLine(contourMeasure);
  const doubleAllowanceRefusal =
    !viewData && contourIsCutLine && allowanceMm > 0 && contourMeasure
      ? `double allowance: contour already has ${(engineCmToMm(contourMeasure.allowanceCm) ?? 0).toFixed(1)} mm, set allowance to 0`
      : null;
  // УЛИК НЕТ — И ЭТО НЕ ПОВОД ЗАПРЕЩАТЬ (§5.4). Улики отсутствуют ЗАКОНОМЕРНО: у блока один
  // замкнутый контур, второй контур пересекает первый, блоков меньше трёх. Такая раскладка
  // сохраняется, `contour_allowance_cm` уезжает NULL, и маркер честно помечен «припуск не
  // подтверждён файлом» — а не «двойной припуск».
  const allowanceUnconfirmed =
    !viewData &&
    parse.phase === 'ready' &&
    allowanceMm > 0 &&
    contourMeasure?.verdict === 'unknown';

  // ПРЕДЗАПОЛНЕНИЕ ПОЛЯ «ПРИПУСК» (§5.5). Порядок источников НЕ ПЕРЕСТАВЛЯТЬ, и последний из них —
  // не эталон, а признание: `NEST_DEFAULTS.seamAllowanceCm` перестал быть источником истины и
  // остался последним фолбэком, у которого в подписи так и сказано, что его никто не задавал.
  const [allowanceTouched, setAllowanceTouched] = useState(false);
  // Дверь в артикул открыта в другой вкладке → на возврате перечитать материалы (см. ниже).
  const articleOpenedRef = useRef(false);
  const qcEarly = useQueryClient();
  const qcRef = useRef(qcEarly);
  qcRef.current = qcEarly;
  // ПРИПУСК ЦЕХА — прямо из настроек, если вызывающий его не передал. Раньше ни одна точка входа
  // его не передавала, и предзаполнение модалки шло мимо цеха, тогда как планировщик
  // (batch-marker-plan) брал его всегда: две раскладки одной ткани мерили разные контуры.
  // Читается всегда: кроме припуска отсюда же длина стола и предел стопки (ряд «table»).
  const workshopQuery = useWorkshopSettings();
  const updateWorkshop = useUpdateWorkshopSettings();
  const { canWrite } = usePermissions();
  const canWriteWorkshop = canWrite(SECTION.production);
  const settingCm = (d?: googletype_Decimal): number | null => {
    const n = parseDecimalNumber(decimalToInput(d));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const wsTableCm = settingCm(workshopQuery.data?.settings?.cuttingTableLengthCm);
  const wsStackCm = settingCm(workshopQuery.data?.settings?.maxStackHeightCm);
  // Ширина стола (0413): рисуется на пиктограмме в масштабе; не задана — вердикта по ширине нет.
  const wsTableWidthCm = settingCm(workshopQuery.data?.settings?.cuttingTableWidthCm);
  // undefined = следовать цеху; null = очищено здесь; число = своё значение до «save for the workshop».
  const [tableEdit, setTableEdit] = useState<number | null | undefined>(undefined);
  const [stackEdit, setStackEdit] = useState<number | null | undefined>(undefined);
  const [tableWidthEdit, setTableWidthEdit] = useState<number | null | undefined>(undefined);
  const tableCm = tableEdit === undefined ? wsTableCm : tableEdit;
  const tableWidthCm = tableWidthEdit === undefined ? wsTableWidthCm : tableWidthEdit;
  const stackLimitCm = stackEdit === undefined ? wsStackCm : stackEdit;
  const [endLossCm, setEndLossCm] = useState<number>(END_LOSS_DEFAULT_CM);
  // null = по умолчанию: укладывать в стол, когда длина стола задана.
  const [keepOnTableEdit, setKeepOnTable] = useState<boolean | null>(null);
  // Полезная длина стола U = стол − 2·запас.
  const usableCm =
    tableCm != null && tableCm - 2 * endLossCm > 0
      ? Math.round((tableCm - 2 * endLossCm) * 100) / 100
      : null;
  const keepOnTable = tableMode && usableCm != null && (keepOnTableEdit ?? true);
  const workshopDirty =
    (tableEdit !== undefined && tableEdit !== wsTableCm) ||
    (tableWidthEdit !== undefined && tableWidthEdit !== wsTableWidthCm) ||
    (stackEdit !== undefined && stackEdit !== wsStackCm);
  const [savingWorkshop, setSavingWorkshop] = useState(false);
  const saveForWorkshop = async (): Promise<boolean> => {
    if (!workshopDirty) return true;
    if (!canWriteWorkshop || savingWorkshop) return false;
    const asSetting = (v: number | null): googletype_Decimal =>
      v == null ? CLEAR_SETTING : { value: String(Math.round(v * 100) / 100) };
    setSavingWorkshop(true);
    try {
      await updateWorkshop.mutateAsync({
        cuttingTableLengthCm:
          tableEdit !== undefined && tableEdit !== wsTableCm ? asSetting(tableEdit) : undefined,
        maxStackHeightCm:
          stackEdit !== undefined && stackEdit !== wsStackCm ? asSetting(stackEdit) : undefined,
        cuttingTableWidthCm:
          tableWidthEdit !== undefined && tableWidthEdit !== wsTableWidthCm
            ? asSetting(tableWidthEdit)
            : undefined,
        defaultSeamAllowanceMm: undefined,
      });
      setTableEdit(undefined);
      setTableWidthEdit(undefined);
      setStackEdit(undefined);
      showMessage('saved for the workshop', 'success');
      return true;
    } catch (e) {
      showMessage(failMessage(e, "couldn't save for the workshop"), 'error');
      return false;
    } finally {
      setSavingWorkshop(false);
    }
  };
  const workshopSeamMm = (() => {
    if (workshopDefaultSeamAllowanceMm != null) return workshopDefaultSeamAllowanceMm;
    const n = parseDecimalNumber(
      decimalToInput(workshopQuery.data?.settings?.defaultSeamAllowanceMm),
    );
    return Number.isFinite(n) ? n : null;
  })();
  // Чем чинить «без припуска»: эталон карточки → цех → умолчание движка; первое НЕНУЛЕВОЕ.
  const fixAllowanceMm = (() => {
    for (const v of [
      requiredSeamAllowanceMm,
      workshopSeamMm,
      engineCmToMm(NEST_DEFAULTS.seamAllowanceCm),
    ]) {
      if (v != null && Number.isFinite(v) && v > 0) return clampSeamAllowanceMm(v);
    }
    return 0;
  })();
  const allowancePrefill = useMemo(() => {
    // Пока файл не разобран, подставлять нечего: замера ещё нет, а без него порядок §5.5 отвечал
    // бы эталоном на вопрос, на который сперва обязан ответить файл.
    if (viewData || parse.phase !== 'ready') return null;
    return seamAllowancePrefill({
      measured: contourMeasure,
      cardRequiredMm: requiredSeamAllowanceMm,
      workshopDefaultMm: workshopSeamMm,
      fallbackMm: engineCmToMm(NEST_DEFAULTS.seamAllowanceCm),
    });
  }, [viewData, parse.phase, contourMeasure, requiredSeamAllowanceMm, workshopSeamMm]);
  useEffect(() => {
    // Введённое руками не перебивается НИКОГДА — ровно как ширина полотна рядом. Свой номер
    // оператор ставит осознанно, и подставить поверх него «правильный» значит спорить с
    // единственным участником, который держал в руках лекало.
    if (!allowancePrefill || allowanceTouched) return;
    setAllowanceMm((prev) => (prev === allowancePrefill.value ? prev : allowancePrefill.value));
  }, [allowancePrefill, allowanceTouched]);
  // Подпись под полем: КАКОЙ факт про выбранный контур мы знаем. Три ветки, и ни одна не имеет
  // права звучать как «ноль»: «не измерено» — это отсутствие улик, а не измеренное отсутствие
  // припуска.
  const allowanceSourceText = (() => {
    const m = contourMeasure;
    if (!m || parse.phase !== 'ready')
      return 'the DXF contour is the seam line; the cut line is what gets laid';
    if (m.verdict === 'cut' && m.source === 'manifest') {
      return `layer ${m.layer}: FINAL CUT LINE — declared by the converter's manifest, the ${(engineCmToMm(m.allowanceCm) ?? 0).toFixed(1)} mm allowance is already in the contour`;
    }
    if (m.verdict === 'cut') {
      return `layer ${m.layer}: CUT LINE — the ${(engineCmToMm(m.allowanceCm) ?? 0).toFixed(1)} mm allowance is already in the contour (measured on ${m.stats.accepted} blocks)`;
    }
    if (m.verdict === 'seam') {
      return `layer ${m.layer}: seam line — the cut line is drawn ${(engineCmToMm(m.gapCm) ?? 0).toFixed(1)} mm outside (measured on ${m.stats.accepted} blocks)`;
    }
    return `cut or seam — the file can't tell: ${allowanceUnknownText(m)}`;
  })();

  // Cross-strip span in the allowed rotations; a piece that fits nowhere is auto-unchecked.
  const fitsWidth = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const p of pieces) {
      const spans = crossGrain ? [p.bboxH, p.bboxW] : [p.bboxH];
      m.set(p.id, Math.min(...spans) <= usable + 1e-9);
    }
    return m;
  }, [pieces, usable, crossGrain]);

  // (Re)seed the selection whenever a parse lands.
  useEffect(() => {
    if (parse.phase !== 'ready') return;
    const next: PieceSel = {};
    for (const p of parse.pieces) next[p.id] = { checked: true, qty: 1 };
    setSel(next);
  }, [parse]);

  const running = run.phase === 'running';
  const stopping = running && run.stopping;
  const result: NestResult | null =
    run.phase === 'done' ? run.result : run.phase === 'running' ? run.best : null;
  const [snap, setSnap] = useState<RunSnap | null>(null);
  // Подбор под стол идёт пробными прогонами мимо run-состояния — отдельный признак занятости.
  const [fitting, setFitting] = useState<{ attempt: number } | null>(null);
  const fitAbort = useRef(false);
  // Слои, которые выставил «fit to the table» в режиме стола: если их больше предела стопки,
  // итоги одним настилом не закрыть — шапка говорит «needs N lays», а не «set plies to max».
  const [fitPlies, setFitPlies] = useState<number | null>(null);
  const busy = running || fitting != null;
  // Результат прогона рисуется и сохраняется по СНИМКУ его входов.
  const runView = !viewData && result && snap ? snap : null;

  // ── ручная доводка (Ф5) ────────────────────────────────────────────────────────────────
  // manual = hand-edited placements overriding the engine/blob result; null = untouched.
  const [manual, setManual] = useState<Placement[] | null>(null);
  // View mode starts read-only; «редактировать» switches the stored layout into the editor.
  const [editView, setEditView] = useState(false);
  const [runConfirm, setRunConfirm] = useState(false);
  // Everything that would DESTROY manual edits — closing, changing a run parameter,
  // re-running — asks first. wipeConfirm holds the deferred action; without it a stray
  // keystroke in «зазор» or an Esc silently threw away hand work.
  const [wipeConfirm, setWipeConfirm] = useState<{
    kind: 'close' | 'params';
    apply: () => void;
  } | null>(null);
  const guardManual = (apply: () => void, kind: 'close' | 'params' = 'params') => {
    if (manual) setWipeConfirm({ kind, apply });
    else apply();
  };
  const requestClose = () => guardManual(onClose, 'close');

  // A result computed for other parameters is stale — drop it the moment they change
  // (inputs are disabled while running, so this can only fire against a done run). Manual
  // edits reached here only through guardManual, which clears them first; this stays as the
  // safety net for any programmatic parameter change (e.g. a re-parse reseeding `sel`).
  // Слой контура, размер и слой долевой меняют САМУ ГЕОМЕТРИЮ, которую укладывают, поэтому
  // держать после них готовый результат нельзя: размещения остались бы от прежних деталей.
  // Перебор слоя долевой при готовом прогоне разворачивал детали на экране, оставляя чужие
  // размещения, — и такой маркер спокойно сохранялся, потому что «размещено 9/9» продолжало
  // быть правдой. Смена слоя или размера ещё и меняет идентификаторы, так что полоса
  // оказывалась пустой при бодрой статистике.
  useEffect(() => {
    resetRun();
    setManual(null);
  }, [
    widthCm,
    gapCm,
    marginCm,
    crossGrain,
    sel,
    // Состав — параметр прогона наравне с шириной: он решает, какие детали и в скольких
    // экземплярах ложатся на полосу. Готовый результат после его правки описывал бы другой настил.
    qtyByToken,
    // Ширина «не задана» — результат на прежней ширине больше ничего не описывает.
    widthUnset,
    contourLayer,
    grainLayer,
    allowanceMm,
    resetRun,
  ]);

  const target = targetCm === '' ? undefined : targetCm;

  // ── ПЕРЕСБОРКА ЧЕРТЕЖА ДЕТАЛИ ПРИ ЭКСПОРТЕ (Ф3.5, спека §7.2/§7.4) ─────────────────────────
  //
  // Блоб маркера хранит внешние контуры и размещения — и всё. Чертёж детали (линия шва, надсечки,
  // свёрла, вытачки) живёт в `PieceDTO.inner`, в блоб не пишется и полем прото не выражен: он
  // ПРОИЗВОДНЫЙ от выкройки и условий съёмки, а производное в блобе с капом на 300 деталей — плата
  // без выигрыша. Значит переоткрытый маркер приходит БЕЗ чертежа, и экспорт из него выдаёт файл,
  // у которого линии шва нет вовсе. Раскройщик читает это как «у изделия её нет».
  //
  // Поэтому: перед экспортом чертёж ПЕРЕСОБИРАЕТСЯ по сегодняшним выкройкам теми же чистыми
  // функциями и с условиями со строки, а совпадение контура с сохранённым ДОКАЗЫВАЕТСЯ сверкой.
  // Не доказано — экспорт с чертежом выключается и об этом сказано словами (§7.4), а плоттерный
  // файл остаётся доступен отдельной кнопкой (решение Р4).
  //
  // A degraded marker (unreadable blob → summary only) has no geometry to export: the buttons
  // would emit a STRIP-rectangle-only file that a plotter would happily cut. Пересобирать там тоже
  // нечего — сверять пересобранное не с чем.
  const viewDegraded =
    viewData != null && (viewData.pieces.length === 0 || viewData.result.placements.length === 0);
  // ОТКУДА БЕРУТСЯ ФАЙЛЫ ДЛЯ ПЕРЕСБОРКИ — из `files`, и отобраны они ВЫЗЫВАЮЩИМ.
  //
  // Отбор («какие листы относятся к ткани ЭТОЙ раскладки») требует строк BOM карточки: с 0267
  // лист привязывается не только к строке, но и к НАЗНАЧЕНИЮ, и назначение резолвится первым —
  // лист «основного материала» обслуживает все строки этого назначения и своего bomLineKey не
  // несёт вовсе. BOM есть у `markers-section`, а не у модалки, и правило отбора там уже позвано
  // (`patternSourcesForMarker` + резолвер по `fabricScopes`). Позвать его ВТОРОЙ РАЗ здесь, со
  // своим, более бедным резолвером, значило бы завести два ответа на один вопрос: пока они
  // совпадают — это дубль, как только разойдутся — это два разных набора выкроек под одним
  // экраном, и который из них пересобирал чертёж, будет уже не сказать.
  //
  // Поэтому модалка принимает готовый список и ничего в нём не решает. Пустой список — законный
  // ответ «пересобирать не из чего», и он проговаривается словами (`no-patterns`), а не
  // превращается в тихо неполный файл.
  const patternSources: PatternSource[] = useMemo(
    () =>
      view?.summary
        ? // PDF — устаревший формат листа; разбирать его нечем, и попытка дала бы отказ разбора
          // вместо честного «этой ткани выкроек нет».
          (files ?? []).filter((f) => isDxfUrl(f.url)).map((f) => ({ name: f.name, url: f.url }))
        : [],
    [view, files],
  );
  const [drawing, setDrawing] = useState<DrawingState>({ phase: 'off' });
  // Ключ вместо массива в зависимостях: `patternRows` приезжает из `useWatch` формы карточки и
  // пересобирается новым массивом на каждый рендер родителя. Держать пересборку на идентичности
  // такого пропса значит скачивать выкройки заново на каждое нажатие клавиши в соседнем поле.
  const sourcesKey = patternSources.map((s) => `${s.name} ${s.url}`).join('');
  useEffect(() => {
    if (!view || viewDegraded) {
      setDrawing({ phase: 'off' });
      return;
    }
    let dead = false;
    setDrawing({ phase: 'running' });
    (async () => {
      try {
        const out = await rebuildMarkerDrawing({ marker: view, sources: patternSources });
        if (dead) return;
        setDrawing(
          out.ok
            ? { phase: 'ok', pieces: out.pieces, warnings: out.warnings }
            : { phase: 'error', error: out.error },
        );
      } catch {
        // Пересборка своих исключений не бросает (разбор обёрнут внутри), но динамический импорт
        // воркера — это сеть, и упасть она может. Диагноз тот же и лечится тем же действием.
        if (!dead) {
          setDrawing({
            phase: 'error',
            error: { kind: 'fetch-failed', names: patternSources.map((s) => s.name) },
          });
        }
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, viewDegraded, sourcesKey]);
  // Пересобранный чертёж НЕ ДОКАЗАН, пока пересборка не ответила: 'running' держит экспорт
  // закрытым ровно так же, как 'error'. Выпустить файл «пока считается» значит выпустить тот
  // самый файл без линии шва, только теперь по таймингу.
  const drawingBlocked =
    viewData != null && (drawing.phase === 'error' || drawing.phase === 'running');
  const rebuildText = drawing.phase === 'error' ? describeRebuildError(drawing.error) : '';

  // What the right pane shows: the live run in nest mode, the stored geometry in view mode.
  //
  // ПЕРЕСОБРАННЫЕ детали побеждают сохранённые, как только пересборка удалась, и это чинит сразу
  // три места одним движением: у экспортного DXF появляются слои INNER и SEAM, у SVG — те же
  // линии, а редактор перестаёт рисовать переоткрытый маркер без надсечек. Контур при этом берётся
  // тоже пересобранный: сохранённый округлён до сотых, а линия шва рядом с ним — полной точности,
  // и пара линий из разных поколений подорвала бы ровно то обещание, ради которого слой SEAM
  // заводился («зазор между линиями и есть припуск»). Сверка уже доказала, что они совпадают.
  const displayPieces =
    drawing.phase === 'ok' && drawing.pieces.length > 0
      ? drawing.pieces
      : viewData
        ? viewData.pieces
        : runView
          ? runView.pieces
          : pieces;
  const displayResult = viewData ? viewData.result : result;
  const displayWidth = viewData ? viewData.widthCm : runView ? runView.widthCm : widthCm;
  const displayTarget = viewData ? viewData.targetCm : target;
  // Validation parameters follow the layout's own params in view mode.
  const displayGap = viewData ? decNum(view?.summary?.gapCm) : runView ? runView.gapCm : gapCm;
  const displayMargin = viewData
    ? decNum(view?.summary?.edgeMarginCm)
    : runView
      ? runView.marginCm
      : marginCm;
  const displayCross = viewData
    ? !!view?.summary?.allowCrossGrain
    : runView
      ? runView.crossGrain
      : crossGrain;

  // The effective layout: manual placements override, length/efficiency re-measured from
  // true contours; untouched layouts keep the engine's own accounting verbatim.
  const effective: NestResult | null = useMemo(() => {
    if (!displayResult) return null;
    if (!manual) return displayResult;
    const m = measureLayout({
      pieces: displayPieces,
      placements: manual,
      widthCm: displayWidth,
      marginCm: displayMargin,
    });
    return {
      ...displayResult,
      placements: manual,
      usedLengthCm: m.usedLengthCm,
      efficiency: m.efficiency,
    };
  }, [displayResult, manual, displayPieces, displayWidth, displayMargin]);

  // Clearance validation: once per drop/rotate (placements identity), never per drag frame
  // and never while the GA is streaming previews.
  const violations = useMemo(() => {
    if (!effective || running) return [];
    return checkLayout({
      pieces: displayPieces,
      placements: effective.placements,
      widthCm: displayWidth,
      gapCm: displayGap,
      marginCm: displayMargin,
      ...(viewData ? STORED_LAYOUT_TOLERANCE : {}),
    });
  }, [effective, running, displayPieces, displayWidth, displayGap, displayMargin, viewData]);
  const violatingIdx = useMemo(() => new Set(violations.map((v) => v.index)), [violations]);
  const worstViolation = violations.length
    ? violations.reduce((a, b) => (a.clearance <= b.clearance ? a : b))
    : null;
  // «show» в шапке: худшая деталь ЗА КРАЕМ полотна (её и видно красной), иначе худший зазор.
  const outsideViolations = violations.filter((v) => v.otherIndex == null);
  const showViolation = outsideViolations.length
    ? outsideViolations.reduce((a, b) => (a.clearance <= b.clearance ? a : b))
    : worstViolation;
  const outsideCount = new Set(outsideViolations.map((v) => v.index)).size;
  const tooCloseCount = new Set(
    violations.filter((v) => v.otherIndex != null).flatMap((v) => [v.index, v.otherIndex!]),
  ).size;
  const [focusReq, setFocusReq] = useState<{ index: number; nonce: number } | null>(null);

  // НЕДОБОР ПРИПУСКА У СОХРАНЁННОЙ РАСКЛАДКИ — по полям раскладки, а не по тексту блоба: тот на
  // любом нуле писал «SEAM LINE was nested», в том числе когда уложен был контур КРОЯ. Тревога
  // только когда припуск записан нулём И ни одно из свидетельств не говорит «контур — линия кроя»:
  // замер в записи (contour_allowance_mm > 0), новая заметка блоба или сегодняшний замер того же
  // слоя по выкройкам этой ткани. Незаписанный припуск (легаси) — не ноль, тревоги нет.
  const storedNoAllowance = useMemo(() => {
    const sm = view?.summary;
    if (!viewData || !sm) return false;
    const seamMm = parseDecimalNumber(decimalToInput(sm.seamAllowanceMm));
    if (!Number.isFinite(seamMm) || seamMm > 0) return false;
    const contourMm = parseDecimalNumber(decimalToInput(sm.contourAllowanceMm));
    if (Number.isFinite(contourMm) && contourMm > 0) return false;
    const note = (view?.layout?.warnings ?? []).find((w) => w.startsWith(SEAM_NOTE_PREFIX)) ?? '';
    if (/the contour is the CUT line/.test(note)) return false;
    const layer = sm.contourLayer ?? '';
    if (layer && allPieces.length > 0) {
      const opt = layerOptions(allPieces, split.codeById, buildAllowanceIndex(allPieces)).find(
        (o) => o.layer === layer,
      );
      if (contourCarriesCutLine(opt?.allowance)) return false;
    }
    return true;
  }, [view, viewData, allPieces, split]);

  // Вернулись из карточки артикула — перечитать материалы: ширина и толщина пина колорвея идут
  // из каталога. Только если дверь в артикул открывали: фокус окна случается постоянно.
  useEffect(() => {
    const onFocus = () => {
      if (!articleOpenedRef.current) return;
      articleOpenedRef.current = false;
      void qcRef.current.invalidateQueries({ queryKey: ['materials'] });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  const manualNote =
    manual && violations.length && worstViolation
      ? `${MANUAL_NOTE_PREFIX} ${violations.length} ${violations.length === 1 ? 'violation' : 'violations'} (worst — ${violationText(worstViolation)})`
      : null;
  // Overlapping by hand shrinks the used length, so the naive ratio can exceed 100% —
  // and efficiency_pct is a 0..100 column. Clamp once, use everywhere.
  const effPct = effective ? Math.min(100, effective.efficiency * 100) : 0;

  // ═══ ЧАСТИЧНАЯ ГЕОМЕТРИЯ НЕ ВЫПУСКАЕТСЯ В ЦЕХ ══════════════════════════════════════════════
  //
  // Раскладка, у которой легла ЧАСТЬ деталей, — это ЧЕРНОВИК (0299): она законно хранится, её
  // законно видно и её законно пересчитывают. Чего с ней делать НЕЛЬЗЯ — так это отдавать в
  // производство: SVG на печать и DXF на плоттер описывают изделие, у которого не хватает деталей,
  // и по этим файлам режут ткань. Ошибка при этом не выглядит ошибкой — файл открывается, контуры
  // на месте, слои те же; недостающих деталей в нём просто НЕТ.
  //
  // Предикат один на два случая, и это намеренно: сохранённый черновик (счётчики приезжают со
  // сводки) и НЕДОСЧИТАННЫЙ ЖИВОЙ ПРОГОН в этом же окне (счётчики от движка) — одна и та же
  // частичная геометрия, и запрет обязан быть одинаков. Модалка и раньше не давала СОХРАНИТЬ
  // такую раскладку, но экспорт оставался открытым — то есть закрытой была дверь в базу, а не в
  // цех.
  const partialGeometry =
    !!effective && effective.totalCount > 0 && effective.placedCount !== effective.totalCount;
  const viewIsDraft = isDraftMarker(view?.summary);
  const partialExportRefusal = partialGeometry
    ? `${viewIsDraft ? 'draft: ' : ''}${effective?.placedCount ?? 0} of ${effective?.totalCount ?? 0} placed, export off`
    : '';
  // РЕЖИМ СТОЛА: прогон шёл с maxLengthCm (обычный прогон с «within table» или финал «fit to the
  // table»), и легли НЕ ВСЕ детали — по любой причине, не только 'table-full'. Это ОДНА ошибка в
  // шапке (дверь — «fit to the table»), она же причина выключенного «save marker»; строки «did not
  // fit» и «… placed, export off» в этом режиме не дублируют её.
  const tableRun = !viewData && runView?.config.maxLengthCm != null;
  const tableShortText =
    tableRun && !running && !!effective && effective.placedCount < effective.totalCount
      ? `${effective.totalCount - effective.placedCount} of ${effective.totalCount} ${
          effective.totalCount === 1 ? "piece doesn't" : "pieces don't"
        } fit on the table`
      : '';

  // «НЕ ВЛЕЗЛО» — a different fact from «нарушения», and the panel has to keep them apart.
  //
  // A violation is a marker the engine BUILT whose clearances a human may still accept: the
  // note says so and blocks nothing. An unplaced piece is the opposite — the engine could
  // not seat it at all, so it is NOT on the fabric, and the layout on screen is short of a
  // piece the order needs. Saving is already impossible (canSave требует placed === total),
  // but until Ф0 the only sign of it was the «размещено» counter reading 44/45, which reads
  // like an accounting detail rather than «эта деталь никуда не легла».
  // Rare BY DESIGN, and that is not a reason to drop it. The piece list disables anything wider
  // than the fabric before the run and says «шире полотна» on the row, so the operator learns it in
  // a glance instead of after a 20-second search — which is the better place to say it. What
  // survives here is the engine's own guarantee: whatever reaches the placer and does not land is
  // named. The two are not redundant, they are the pre-flight and the black box.
  // 'table-full' — отдельный вердикт стола (с действием), не «did not fit».
  const unplaced = (!running ? displayResult?.unplaced ?? [] : []).filter(
    (u) => u.reason !== 'table-full',
  );
  const unplacedText = useMemo(() => {
    if (unplaced.length === 0) return '';
    const nameOf = (id: number) => displayPieces.find((p) => p.id === id)?.name || `piece ${id}`;
    const byReason = new Map<string, Set<string>>();
    for (const u of unplaced) {
      const set = byReason.get(u.reason) ?? new Set<string>();
      set.add(nameOf(u.pieceId));
      byReason.set(u.reason, set);
    }
    const word: Record<string, string> = {
      width: 'wider than the strip in every rotation',
      'no-space': 'no room was found on the strip',
      missing: 'the piece is not in the parsed files',
      // Зеркало заказано, а ткань его не терпит. Слово тут — не украшение: без него панель
      // печатала сырой токен «mirror», и оператор видел причину, по которой ничего сделать
      // нельзя. Действий ровно два, и оба названы.
      // Какой ИМЕННО факт запретил переворот — ворс или непроставленное направление — называет
      // предупреждение движка (nest/index.ts), оно показывается рядом и точнее этой строки.
      // Здесь достаточно сказать, что делать: оба случая чинятся на вкладке BOM.
      mirror:
        'the fabric allows no flipping — there is nothing to lay the mirrored instance with: set or fix the direction on the fabric line on the BOM tab (paired pieces on a nap are cut in two plies face to face — that is a different marker)',
    };
    return [...byReason.entries()]
      .map(([reason, names]) => `${[...names].join(', ')} — ${word[reason] ?? reason}`)
      .join('; ');
  }, [unplaced, displayPieces]);

  // «Поиск не начинался». generation 0 means the GA never completed a generation, so the
  // marker on screen is the seed order — big-piece-first greedy — and nothing was searched.
  // The word «оптимизировано» over that number was the screen's own lie: the operator waited
  // the full budget and got the layout the engine would have produced in one pass.
  // Guarded on FOUR things, because generation===0 alone describes three different runs and
  // this callout is only true of one of them. A run the operator STOPPED also has generation
  // 0, and telling them «поиск не начинался, дайте больше времени» blames the budget for their
  // own click — the exact species of lie this change exists to remove. A run with nothing
  // placed has no greedy layout to describe either. And the hard-stop path (use-nesting.ts)
  // resolves to the last progress frame, whose `cancelled` is false because progress frames
  // are built before anyone cancelled — so `run.stopped` is the only reliable «this was
  // stopped» signal, and both are checked.
  const greedyOnly =
    !viewData &&
    !running &&
    displayResult != null &&
    displayResult.generation === 0 &&
    displayResult.placements.length > 0 &&
    !displayResult.cancelled &&
    !(run.phase === 'done' && run.stopped);
  const simplified =
    displayResult?.telemetry &&
    displayResult.telemetry.rdpEpsCm > displayResult.telemetry.requestedRdpEpsCm
      ? displayResult.telemetry
      : null;

  const editingActive =
    !running &&
    canEdit &&
    ((viewData != null && editView) || (viewData == null && run.phase === 'done'));

  // The GA's streaming preview keeps the cheap string-SVG path (simplified contours,
  // innerHTML); a finished/stored layout renders through the interactive editor instead.
  // «скачать SVG» always exports the EFFECTIVE layout (manual edits included), exact.
  const liveSvg = useMemo(
    () =>
      running && displayResult
        ? renderLayoutSvg(displayResult, displayPieces, displayWidth, displayTarget, 0.05)
        : null,
    [running, displayResult, displayPieces, displayWidth, displayTarget],
  );
  const exportSvg = () =>
    effective ? renderLayoutSvg(effective, displayPieces, displayWidth, displayTarget, 0) : null;

  const checkedCount = pieces.filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id)).length;
  // Потолки СЕРВЕРА на сохраняемый маркер (internal/apisrv/admin/techcard_markers.go). Они
  // проверяются на сохранении, то есть ПОСЛЕ прогона: набрать 400 деталей, подождать бюджет и
  // только тогда узнать, что норму не примут, — это потерянное время и никакой подсказки о том,
  // сколько лишнего. Числа продублированы здесь сознательно и подписаны источником: спросить их у
  // сервера нечем, а молчать до отказа хуже, чем держать копию, у которой видно, чья она.
  const MAX_MARKER_PIECES = 300;
  const MAX_MARKER_PLACEMENTS = 5000;
  // Экземпляров на полосе: Σ по выбранным деталям qty × множитель СОСТАВА (см. unitsOfPiece).
  // Потолок в 5000 упирается именно сюда — не в число размеров, а в количества.
  const instanceCount = pieces
    .filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id))
    .reduce(
      (s, p) => s + Math.max(1, Math.round(sel[p.id]?.qty ?? 1)) * (unitsOfPiece.get(p.id) ?? 0),
      0,
    );
  // Сверх потолка сервера прогон не ЗАПУСКАЕТСЯ, а не «предупреждается»: раскладка, которую
  // гарантированно не примут, — это оплаченный бюджет и двадцать минут ожидания перед отказом.
  // Число размеров (entity.MaxMarkerCompositionSizes) проверяется на сохранении: оно не делает
  // прогон дороже, а состав можно ужать и после него.
  const overCap = checkedCount > MAX_MARKER_PIECES || instanceCount > MAX_MARKER_PLACEMENTS;
  const MAX_MARKER_COMPOSITION_SIZES = 32;

  const downloadTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (downloadTimer.current != null) window.clearTimeout(downloadTimer.current);
    },
    [],
  );
  // Осмысленное имя файла: SEASON-STYLE-размер-ткань-маркер (пустые части опускаются).
  const fileParts = (): Array<string | undefined> => {
    if (viewData) {
      return [season, styleNumber, sizeLabel, view?.summary?.bomItemName, view?.summary?.name];
    }
    const fabric = slot?.name || ((files ?? []).length === 1 ? (files ?? [])[0].name : undefined);
    return [season, styleNumber, sizeLabel, fabric];
  };
  const download = (content: string, mime: string, ext: string, extra?: string[]) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // ПРЕФИКС ПРОГОНА (Ф4.7, §10). Имя собирается из карточки — сезон, стиль, размер, слот, имя
    // маркера, — и у двух раскройных раскладок разных прогонов эти части совпадают побуквенно.
    // `productionRunId` здесь тот же, что уезжает во владельца маркера, поэтому имя файла и
    // владелец не могут разойтись. 0 (карточный экспорт) ⇒ префикса нет, имя прежнее.
    a.download = exportFileName([...fileParts(), ...(extra ?? [])], ext, productionRunId);
    a.click();
    // Deferred: Safari/Firefox may not have started the download when click() returns.
    downloadTimer.current = window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const downloadSvg = () => {
    const s = exportSvg();
    // У SVG нет таблицы слоёв, поэтому приём «не объявлять пустое», которым честен DXF, ему
    // недоступен: чертежа в нём просто не окажется, и сказать об этом внутри файла нечем. Значит
    // его честность — только этот гейт. Без него починка DXF просто переносит ложь в соседнюю
    // кнопку (спека §7.4, дефект D).
    if (s && !viewDegraded && !running && !drawingBlocked && !partialGeometry)
      download(s, 'image/svg+xml', 'svg');
  };
  // Plotter export: R12 DXF of the finished layout, true contours, cm — the EFFECTIVE
  // placements, so a hand-adjusted marker cuts exactly what the operator sees.
  const dxfReady =
    !partialGeometry &&
    ((viewData != null && !viewDegraded && !drawingBlocked) || run.phase === 'done');
  // Одна короткая причина выключенного экспорта — тултип у ссылок SVG/DXF.
  const exportBlockReason =
    partialExportRefusal ||
    (viewDegraded
      ? 'geometry unreadable'
      : drawing.phase === 'running'
        ? 'restoring the drawing…'
        : drawing.phase === 'error'
          ? `drawing not restored: ${rebuildText}`
          : '');
  const downloadDxf = () => {
    if (!dxfReady || !effective) return;
    download(renderLayoutDxf(effective, displayPieces, displayWidth), 'application/dxf', 'dxf');
  };
  // ЭКСПОРТ БЕЗ ЧЕРТЕЖА — ЯВНОЙ ВТОРОЙ КНОПКОЙ (решение Р4). Она делает ровно то, что система
  // делала до Ф3.5, но теперь это ВЫБОР, а не молчание: оператору сказано, чего именно не хватает,
  // и он решает сам. Убрать эту возможность нельзя — контурный DXF остаётся рабочим плоттерным
  // файлом, и лишить цех его из-за недоступной выкройки значит чинить ложь поломкой.
  //
  // Имя файла НЕСЁТ ПРИЗНАК. Файл переживает вкладку, в которой его скачали, и на диске «маркер
  // без чертежа» ничем не отличается от полного, если не назвать его иначе.
  const downloadContoursOnly = () => {
    if (!effective || viewDegraded || running) return;
    download(renderLayoutDxf(effective, displayPieces, displayWidth), 'application/dxf', 'dxf', [
      'contour only',
    ]);
  };

  const verdict =
    effective && displayTarget != null
      ? effective.usedLengthCm <= displayTarget && effective.placedCount === effective.totalCount
        ? {
            ok: true,
            text: `fits · spare ${(displayTarget - effective.usedLengthCm).toFixed(1)} cm`,
          }
        : { ok: false, text: `doesn't fit · needs ${effective.usedLengthCm.toFixed(1)} cm` }
      : null;

  // ── «сохранить раскладку» (Ф4б) ────────────────────────────────────────────────────────
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [saveOpen, setSaveOpen] = useState(false);
  const [markerName, setMarkerName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [slotKey, setSlotKey] = useState('');
  const [saving, setSaving] = useState(false);
  // Колорвей, ПОД КОТОРЫЙ считается раскладка. 0 = общая, «ширина у всех одинаковая». Он выбран
  // до запуска, а не при сохранении: от него зависит ширина полотна, а ширина — это вход
  // алгоритма, а не подпись к результату.
  const [colorwayId, setColorwayId] = useState<number>(initialColorwayId ?? 0);

  // A slot added in the UI but never saved (id 0) cannot be linked — the server resolves
  // bom_line_key against SAVED rows and would reject the whole marker after a paid nest.
  const fabricLines = (bomLines ?? []).filter((b) => b.id > 0);
  const cwOptions = colorways ?? [];
  const chosenColorway = cwOptions.find((c) => c.colorwayId === colorwayId);
  // Роль + артикул. Роль обязательна: раскладка привязывается к любой рулонной строке, поэтому
  // «Cupro 90» может стоять и подкладкой, и карманкой, и по имени они неразличимы — а именно этот
  // список решает, на какую строку BOM ляжет измеренный расход.
  const slotLabel = (b: MarkerBomLine) =>
    [b.role, b.name?.trim() || 'unnamed'].filter(Boolean).join(' · ') +
    (b.unit ? ` · ${b.unit}` : '');
  const unsavedSlots = (bomLines ?? []).length - fabricLines.length;
  const slot = fabricLines.find((b) => b.lineKey === slotKey);
  // The prefill follows the chosen slot until the operator edits the name by hand.
  // Имя — единственное, что различает два маркера: уникальность в БД это (карточка, размер, имя),
  // и она НЕ расширена колорвеем (в MySQL повторные NULL в UNIQUE разрешены, так что нулевая
  // колонка молча сняла бы гарантию с общих маркеров). Поэтому в подпись входит и роль, и
  // колорвей: без них подкладка и карманка одного артикула на одном размере столкнулись бы на
  // constraint сырой ошибкой драйвера — уже ПОСЛЕ оплаченного прогона.
  //
  // Ширина входит в подпись всегда: имя детерминировано, а путь прогона всегда шлёт id 0, поэтому
  // повторная раскладка того же колорвея на том же слоте и размере упирается в уникальность
  // (карточка, размер, имя). Отказ читаемый, но приходит ПОСЛЕ прогона; ширина — ровно то, чем
  // две такие раскладки и различаются.
  const defaultName = [
    // Состав, а не размер: имя — единственное, чем два маркера на одной карточке различаются, и
    // у раскладки с составом уникальность сузилась до (карточка, имя). Два смешанных настила на
    // одном слоте и одной ширине, названные одинаково, столкнулись бы на constraint уже ПОСЛЕ
    // оплаченного прогона.
    //
    // ТОЛЬКО НА ГРАДУИРОВАННОМ файле. У неградуированного состав — одна строка с размером слота,
    // имени для которого модалка не знает (sizeLabel на создании всегда пуст), и подпись состава
    // впечатала бы в ПЕРСИСТЕНТНОЕ имя маркера сырой id хранения («#42 · подкладка …»).
    // У неградуированного файла размера в имени нет (модалка его не знает — sizeLabel на создании
    // всегда пуст, а сырой id хранения в ПЕРСИСТЕНТНОЕ имя писать нельзя), но ТИРАЖ остаться
    // обязан. Уникальность имени у легаси-строки — (карточка, size_key, имя), и у такого маркера
    // size_key заполнен: без множителя настил на 2 изделия и настил на 4 получают ОДНО имя, и
    // второе сохранение падает на constraint уже ПОСЛЕ оплаченного прогона. Сравнить 2-up с 4-up
    // на том же полотне — ровно то, ради чего поле тиража и существует.
    graded
      ? compositionLabel(composition, sizeNameOfId)
      : sizeLabel || (ungradedUnits > 1 ? `${ungradedUnits} garments` : ''),
    (slot ? [slot.role, slot.name?.trim()].filter(Boolean).join(' ') : '') || 'marker',
    chosenColorway?.label ?? '',
    `${widthCm} cm`,
  ]
    .filter(Boolean)
    .join(' · ');
  const nameValue = nameTouched ? markerName : [...defaultName].slice(0, 191).join('');
  // Раскройная ширина артикула слота: рулон − 2×кромка (0259). Сравниваем раскладку именно с
  // ней — с полной шириной рулона расхождение было бы ложным на каждой ткани с кромкой.
  //
  // ПИН КОЛОРВЕЯ ГЛАВНЕЕ ДЕФОЛТА СЛОТА. Слот — это роль («подкладка»), а колорвей называет
  // артикул, из которого её реально кроят, и у артикула своя ширина. Ширина слота — то, чем эта
  // роль кроится «вообще»; ширина пина — то, на чём кроится ЭТОТ колорвей. Раскладка меряет
  // второе. Рулон и кромка берутся из одного источника: ширина пина с кромкой слота описала бы
  // рулон, которого не существует.
  // Половина «от слота» живёт в colorway-widths рядом с половиной «от пина»: очередь раскроя
  // партии считает ту же ширину без этой модалки, и вторая копия формулы разошлась бы молча ровно
  // на кромку.
  const slotCutWidth = (b?: MarkerBomLine): number => {
    if (!b) return NaN;
    // Пин колорвея АВТОРИТЕТЕН: приколотый артикул без ширины — это «ширина не задана» (NaN),
    // а не повод тихо взять ширину строки BOM — та описывает другое полотно.
    const pin = chosenColorway?.widthByLine.get(b.lineKey);
    if (pin) return pin.cutCm;
    return slotCutWidthOf(b).cutCm;
  };
  const slotSelvedge = (b?: MarkerBomLine): number => {
    const pin = b ? chosenColorway?.widthByLine.get(b.lineKey) : undefined;
    if (pin) return pin.selvedgeCm;
    return b ? slotCutWidthOf(b).selvedgeCm : 0;
  };
  const slotWidth = slotCutWidth(slot);
  const widthMismatch =
    Number.isFinite(slotWidth) && slotWidth > 0 && Math.abs(slotWidth - widthCm) > 0.5;

  // Prefill (Ф9.1): a card with exactly ONE fabric slot has an unambiguous cutting width, so
  // the раскладка starts on the real article instead of the 140 cm default. Fires once per
  // open and only in nest mode — a later edit by the operator is never overridden, and with
  // two or more fabrics the modal does not guess (that binding is chosen per DXF file).
  // Under the width input: where the number came from, so «140» is never mistaken for the
  // article's real cutting width. With several fabrics the modal does not guess a width, but it
  // still names what each slot would give — the operator holds the same data it does and should
  // not have to work out roll − 2×кромка by hand.
  const widthSource = (() => {
    if (viewData || fabricLines.length === 0) return '';
    const describe = (b: MarkerBomLine) => {
      const roll = parseDecimalNumber(b.effectiveFabricWidthCm || b.fabricWidth);
      if (!Number.isFinite(roll) || roll <= 0) return '';
      const sv = slotSelvedge(b);
      return sv > 0 ? `roll ${roll} − selvedge 2×${sv}` : `roll ${roll}, selvedge not set`;
    };
    if (fabricLines.length === 1) return describe(fabricLines[0]);
    const each = fabricLines
      .map((b) => {
        const cut = slotCutWidth(b);
        const name = [b.role, b.name?.trim()].filter(Boolean).join(' ') || 'material';
        return Number.isFinite(cut) ? `${name} ${Math.round(cut * 10) / 10}` : '';
      })
      .filter(Boolean);
    return each.length ? `cutting width by slot, cm: ${each.join(' · ')}` : '';
  })();

  // A binding can go stale while the card is open — the slot is deleted on the BOM tab, or its
  // section stops being FABRIC. The lock then has nothing to lock ONTO, and pretending otherwise
  // saved a marker at the 140 cm default with no slot while the dialog said the fabric came from
  // the DXF binding. Fall back to the selector and say the binding is dangling.
  const lockedSlot = lockedBomLineKey
    ? fabricLines.find((b) => b.lineKey === lockedBomLineKey)
    : undefined;
  // Two different reasons a lock fails to resolve, and they need opposite advice. The slot may be
  // GONE from the card — pick another. Or it may exist but be UNSAVED: a sheet can be bound to a
  // BOM line added a moment ago (the card save reconciles the BOM before patterns), while a marker
  // is a separate RPC that can only reference a stored line. Telling the operator that a fabric
  // they just created «is no longer a fabric line» would be simply false.
  const lockedUnsaved =
    !!lockedBomLineKey &&
    !lockedSlot &&
    (bomLines ?? []).some((b) => b.lineKey === lockedBomLineKey);
  const lockDangling = !!lockedBomLineKey && !lockedSlot && !lockedUnsaved;

  // НАПРАВЛЕНИЕ ТОГО ПОЛОТНА, НА КОТОРОЕ РЕАЛЬНО СОХРАНЯТ — а не того, по которому запускали.
  //
  // Проп `fabricDirection` вычисляется ОДИН РАЗ, на клике «⌗ раскладка», по скоупу группы DXF. Но
  // слот запирается только когда назначение владеет ровно одной строкой; иначе диалог сохранения
  // предлагает ВСЕ тканевые строки карточки, а скоуп сервер резолвит по той, которую прислали. То
  // есть два расхождения, оба молчаливые: запустили на `any`, сохранили на one_way — отказ после
  // всего прогона; запустили на one_way, сохранили на `any` — маркер без нужды длиннее, и понять
  // это не по чему.
  //
  // Пересчёт по ВЫБРАННОМУ слоту убирает оба. Пустой резолв (ключа нет в списке — незасейвленная
  // строка, повисшая привязка) откатывается на стартовый ответ: он всё ещё лучшее, что известно.
  const effectiveDirection: FabricDirection = useMemo(() => {
    // Просмотр сохранённого маркера: скоуп его собственной строки разрешает MarkersSection —
    // у неё под рукой BOM карточки, а сюда доезжает уже ответ.
    if (viewData) return fabricDirection;
    const key = lockedSlot?.lineKey || slotKey;
    if (!key) return fabricDirection;
    const scope = markerScopeLines(key, bomLines ?? []);
    return scope.length > 0 ? strictestDirection(scope) : fabricDirection;
  }, [viewData, fabricDirection, lockedSlot, slotKey, bomLines]);
  // ЛИЦОМ К ЛИЦУ НЕЛЬЗЯ: нечётные слои (пары не сложатся) ИЛИ полотно, которое нельзя
  // переворачивать (ворс одного направления или направление не задано, allowsFlip). Один предикат
  // на fit, прогон и сохранение — схема красит ту же строку ограничений.
  const ftfNoFlip =
    !viewData && tableMode && spreadMode === 'face_to_face' && !allowsFlip(effectiveDirection);
  const faceToFaceInvalid = pliesParityBad || ftfNoFlip;
  // ПОЛОТНО ШИРЕ СТОЛА: рулон (раскройная ширина + 2 кромки) против ширины стола. Ширина стола
  // не задана — вердикта нет (не ошибка), пиктограмма рисует только длину. Только режим стола.
  const clothRollCm = Math.round((widthCm + 2 * slotSelvedge(lockedSlot ?? slot)) * 10) / 10;
  const clothWiderThanTable =
    !viewData &&
    tableMode &&
    !widthUnset &&
    tableWidthCm != null &&
    clothRollCm > tableWidthCm + 0.05;

  // ЗАДАНИЕ ПРОГОНА — собирается ОДИН РАЗ и уезжает в две стороны: в воркер, который его считает,
  // и в оценку, которая говорит его цену ДО запуска (Ф2.3). Раньше конфиг строился внутри
  // startRun, и предсказать по нему что-либо было нечем: единственный способ узнать цену прогона —
  // оплатить прогон. Собрать для экрана ВТОРОЙ, «примерно такой же» конфиг было бы хуже, чем не
  // предсказывать вовсе: прогноз относился бы к заданию, которого никто не запускает.
  const runConfig: NestConfig = useMemo(
    () => ({
      pieces: pieces
        .filter((p) => sel[p.id]?.checked && fitsWidth.get(p.id))
        .map((p) => ({
          pieceId: p.id,
          quantity: Math.max(1, Math.round(sel[p.id]?.qty ?? 1)) * (unitsOfPiece.get(p.id) ?? 0),
          // РАЗМЕР КАК ГРУППА — вход засева склейкой (Ф2.6). Движок в метку не заглядывает, ему
          // нужно только равенство: детали одного размера ложатся подряд, и стартовая популяция
          // получает решение «уложи один размер, потом следующий». Оно допустимо и доступно даром,
          // а замер показал, что без него поиск ему проигрывал до 3.8 % длины.
          //
          // Размеронезависимая деталь получает ПУСТУЮ метку и тем самым образует свою группу —
          // одну на всех. Так и правильно: она кроится на каждое изделие состава, к конкретному
          // размеру не относится, и приписать её к чужому блоку значило бы соврать о том, с чем
          // она на настиле соседствует. Место этой группы среди прочих движок определит сам.
          groupKey: split.codeById.get(p.id)?.size ?? '',
        })),
      fabricWidthCm: widthCm,
      targetLengthCm: target,
      // Длина стола — граница укладки ТОЛЬКО при «within table» (или из «fit to the table»).
      maxLengthCm: keepOnTable && usableCm != null ? usableCm : undefined,
      gapCm,
      edgeMarginCm: marginCm,
      allowCrossGrain: crossGrain,
      // Едет ЗНАЧЕНИЕ, а набор поворотов выводит воркер той же чистой функцией
      // (allowedRotations) — политика, применённая только на главном потоке, до поиска не
      // доезжает, и это уже было прод-багом с разворотом по долевой.
      //
      // Именно effectiveDirection, а не проп: искать надо под политикой ТОГО полотна, на которое
      // маркер ляжет, иначе прогон честно оптимизирует под ткань, которую никто не выбирал.
      fabricDirection: effectiveDirection,
      // Едет ИМЯ СЛОЯ, а не повёрнутая геометрия: через эту границу геометрия не ходит вовсе,
      // и воркер разворачивает свою копию той же чистой функцией на том же входе. Так экран и
      // движок гарантированно смотрят на одни детали.
      grainLayer,
      // Едет ЧИСЛО, а раздувает контуры воркер той же чистой функцией на тех же деталях.
      // САНТИМЕТРЫ: это вход движка, а его система координат единицу не меняла.
      seamAllowanceCm: mmToEngineCm(allowanceMm),
      timeBudgetMs: budgetS * 1000,
      rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    }),
    [
      pieces,
      sel,
      fitsWidth,
      unitsOfPiece,
      split,
      widthCm,
      target,
      gapCm,
      marginCm,
      crossGrain,
      effectiveDirection,
      grainLayer,
      allowanceMm,
      budgetS,
      keepOnTable,
      usableCm,
    ],
  );

  // ЦЕНА ПРОГОНА ДО ПРОГОНА. Та же функция, которую зовёт движок внутри себя (nest/estimate.ts):
  // разойтись экрану и движку нечем, потому что модель одна.
  //
  // Считается на ГЛАВНОМ ПОТОКЕ — через границу воркера ходят только числа и идентификаторы, и
  // просить у него прогноз значило бы завести четвёртый тип сообщения ради 25 мс. Замер: 45–46
  // деталей реального файла — 23–25 мс, то есть один кадр.
  //
  // Сверх потолка сервера не считается вовсе: прогон там ЗАПРЕЩЁН (кнопка выключена), а задание из
  // трёхсот деталей — единственное, на котором цена самой оценки заметна. Предсказывать прогон,
  // которого не будет, — это платить за ответ на незаданный вопрос.
  const forecast = useMemo(() => {
    if (viewData || parse.phase !== 'ready' || overCap || runConfig.pieces.length === 0)
      return null;
    const job = estimateJob(pieces, runConfig);
    if (job.length === 0) return null;
    return estimateRun(job, runConfig);
  }, [viewData, parse.phase, overCap, pieces, runConfig]);

  // Ручные правки живут поверх конкретного результата — новый запуск их сносит; спросим.
  const requestRun = () => {
    if (manual) setRunConfirm(true);
    else startRun();
  };
  const launch = (
    config: NestConfig,
    comp: MarkerCompositionEntry[],
    // Полезная длина, под которую прогон стартует; «fit to the table» передаёт свою U явно.
    runUsableCm: number | null = usableCm,
  ) => {
    if (parse.phase !== 'ready' || widthUnset || faceToFaceInvalid || clothWiderThanTable) return;
    setManual(null);
    setRunConfirm(false);
    setSaveError(null);
    setSnap({
      config,
      pieces,
      composition: comp,
      allowanceMm,
      widthCm,
      gapCm,
      marginCm,
      crossGrain,
      usableCm: runUsableCm,
      tableCm,
      endLossCm,
      layTable: runUsableCm != null || layMode === 'table',
      layMode: layMode === 'table' ? 'table' : 'single',
    });
    start(parse.parseId, config);
  };
  // Один настил (single lay) стола не знает: ни капа, ни отметки стола в сохранённом маркере.
  const startRun = () => launch(runConfig, composition, layMode === 'table' ? usableCm : null);

  // ── «fit to the table» ─────────────────────────────────────────────────────────────────
  // Целые изделия, пропорции размеров сохраняются: k изделий раскладываются по долям текущего
  // состава (наибольший остаток), минимум одно изделие.
  const qtyMapForK = (k: number): Record<string, number> | null => {
    const want = Math.max(1, Math.round(k));
    if (!graded) return { ...qtyByToken, '': want };
    const total = activeRows.reduce((s, r) => s + r.qty, 0);
    if (total <= 0) return null;
    const parts = activeRows.map((r) => {
      const exact = (r.qty * want) / total;
      return { key: r.key, qty: r.qty, n: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let left = want - parts.reduce((s, p) => s + p.n, 0);
    for (const p of [...parts].sort((a, b) => b.frac - a.frac || b.qty - a.qty)) {
      if (left <= 0) break;
      p.n += 1;
      left -= 1;
    }
    const next = { ...qtyByToken };
    for (const p of parts) next[p.key] = p.n;
    return next;
  };
  // Минус одно изделие — у самого многочисленного размера.
  const minusOneGarment = (m: Record<string, number>): Record<string, number> | null => {
    const keys = graded ? activeRows.map((r) => r.key) : [''];
    let best: string | null = null;
    for (const k of keys) {
      if ((m[k] ?? 0) >= 1 && (best == null || (m[k] ?? 0) > (m[best] ?? 0))) best = k;
    }
    if (best == null) return null;
    const next = { ...m, [best]: (m[best] ?? 0) - 1 };
    return keys.reduce((s, k) => s + (next[k] ?? 0), 0) >= 1 ? next : null;
  };
  // Конфиг и состав для гипотетических количеств — та же формула, что у runConfig/composition.
  const derivedFor = (m: Record<string, number>) => {
    const rows = compRows
      .map((r) => ({ ...r, qty: Math.max(0, Math.round(m[r.key] ?? 0)) }))
      .filter((r) => r.qty >= 1);
    const ung = Math.max(1, Math.round(m[''] ?? 1));
    const u = markerUnits({ graded, rows, ungradedUnits: ung });
    const uop = unitsOfPieces(allPieces, (id) => split.codeById.get(id)?.size ?? '', u);
    const comp: MarkerCompositionEntry[] = graded
      ? rows
          .filter((r) => r.sizeId > 0)
          .map((r) => ({ sizeId: r.sizeId, quantity: r.qty }))
          .sort((a, b) => a.sizeId - b.sizeId)
      : sizeId
        ? [{ sizeId, quantity: ung }]
        : [];
    const config: NestConfig = {
      ...runConfig,
      pieces: runConfig.pieces
        .map((c) => ({
          ...c,
          quantity: Math.max(1, Math.round(sel[c.pieceId]?.qty ?? 1)) * (uop.get(c.pieceId) ?? 0),
        }))
        .filter((c) => c.quantity > 0),
    };
    return { config, comp };
  };
  async function fitToTable() {
    if (parse.phase !== 'ready' || usableCm == null || busy) return;
    const parseId = parse.parseId;
    const U = usableCm;
    const areaById = new Map(pieces.map((p) => [p.id, p.areaCm2]));
    const totalArea = runConfig.pieces.reduce(
      (s, c) => s + (areaById.get(c.pieceId) ?? 0) * c.quantity,
      0,
    );
    const garments = Math.max(1, unitsTotal);
    let k = estimateGarmentsPerPly({
      garmentAreaCm2: totalArea / garments,
      fabricWidthCm: widthCm - 2 * marginCm,
      usableLengthCm: U,
    });
    const perGarment = instanceCount / garments;
    if (perGarment > 0)
      k = Math.max(1, Math.min(k, Math.floor(MAX_MARKER_PLACEMENTS / perGarment)));
    if (tableMode) {
      await fitPliesToTable(parseId, U, k);
      return;
    }
    let m = qtyMapForK(k);
    if (!m) return;
    fitAbort.current = false;
    let fitted: Record<string, number> | null = null;
    let lastTried: Record<string, number> = m;
    try {
      for (let attempt = 1; attempt <= FIT_MAX_ATTEMPTS && m; attempt++) {
        setFitting({ attempt });
        lastTried = m;
        const { config } = derivedFor(m);
        if (config.pieces.length === 0) break;
        const res = await probe(parseId, {
          ...config,
          maxLengthCm: U,
          timeBudgetMs: Math.min(FIT_PROBE_BUDGET_MS, config.timeBudgetMs),
        });
        if (fitAbort.current) return;
        if (!res.unplaced.some((u) => u.reason === 'table-full')) {
          fitted = m;
          break;
        }
        m = minusOneGarment(m);
      }
    } catch {
      return;
    } finally {
      setFitting(null);
    }
    // Не влезло за все попытки — финальный прогон берёт следующее меньшее (или последнее
    // испробованное): полный бюджет укладывает плотнее пробы, а остаток покажет вердикт.
    const final = fitted ?? m ?? lastTried;
    const { config, comp } = derivedFor(final);
    if (config.pieces.length === 0) return;
    setQtyByToken(final);
    setKeepOnTable(true);
    launch({ ...config, maxLengthCm: U }, comp, U);
  }
  // РЕЖИМ СТОЛА: итоги неприкосновенны, ужимается СЛОЙ. Состав слоя — функция слоёв
  // (⌈total/plies⌉), поэтому перебираются слои: от текущих вверх, каждый раз до наименьшего N,
  // при котором слой становится меньше. Наименьшее такое N — наименьший перекрой при том же слое.
  // Укрупнять слой «fit» не берётся: он подгоняет под стол, а не заполняет стол.
  async function fitPliesToTable(parseId: number, U: number, estimate: number) {
    const sumAt = (n: number) => perPlyQuantities(cutTotals, n).reduce((s, q) => s + q, 0);
    const mapAt = (n: number): Record<string, number> => {
      const q = perPlyQuantities(cutTotals, n);
      return graded
        ? Object.fromEntries(cellRows.map((r, i) => [r.key, q[i] ?? 0]))
        : { '': Math.max(1, q[0] ?? 1) };
    };
    // Лицом к лицу — только чётные N (слои парами).
    const step = spreadMode === 'face_to_face' ? 2 : 1;
    const evenUp = (n: number) => (step === 2 && n % 2 === 1 ? n + 1 : n);
    const pMax = evenUp(Math.max(1, ...cutTotals));
    // Следующее N, при котором слой строго меньше; null — меньше некуда (по одному изделию).
    // Шаг по N, а не по слою: сумма слоя ступенчатая, и первое N новой ступени — наименьший
    // перекрой при этом слое. Предел перебора pMax ≤ max итог: дальше слой уже по одному.
    const nextSmaller = (n: number): number | null => {
      const cur = sumAt(n);
      let x = n;
      while (x < pMax && sumAt(x) >= cur) x += step;
      return sumAt(x) < cur ? x : null;
    };
    let p: number | null = evenUp(plies);
    while (p != null && sumAt(p) > estimate) p = nextSmaller(p);
    if (p == null) p = pMax;
    fitAbort.current = false;
    let fitted: number | null = null;
    let lastTried = p;
    try {
      for (let attempt = 1; attempt <= FIT_MAX_ATTEMPTS && p != null; attempt++) {
        setFitting({ attempt });
        lastTried = p;
        const { config } = derivedFor(mapAt(p));
        if (config.pieces.length === 0) break;
        const res = await probe(parseId, {
          ...config,
          maxLengthCm: U,
          timeBudgetMs: Math.min(FIT_PROBE_BUDGET_MS, config.timeBudgetMs),
        });
        if (fitAbort.current) return;
        if (!res.unplaced.some((u) => u.reason === 'table-full')) {
          fitted = p;
          break;
        }
        p = nextSmaller(p);
      }
    } catch {
      return;
    } finally {
      setFitting(null);
    }
    const finalP = evenUp(fitted ?? p ?? lastTried);
    const { config, comp } = derivedFor(mapAt(finalP));
    if (config.pieces.length === 0) return;
    setPlies(finalP);
    setFitPlies(finalP);
    setKeepOnTable(true);
    launch({ ...config, maxLengthCm: U }, comp, U);
  }
  const stopFit = () => {
    fitAbort.current = true;
    cancelProbe();
  };

  // Какой именно артикул подставил колорвей — иначе «ширина взялась откуда-то» и проверить нечем.
  const pinArticle = (() => {
    const key = lockedSlot?.lineKey || slotKey;
    const pin = key ? chosenColorway?.widthByLine.get(key) : undefined;
    if (!pin || !Number.isFinite(pin.cutCm)) return '';
    return `${pin.articleName || 'unnamed'} · cutting ${pin.cutCm} cm`;
  })();
  // Карточка предлагает рулонные строки, а слот не выбран. Раньше это молча сохраняло маркер с
  // пустой привязкой: длина измерена, костинг её не видит, и понять это можно только по тому, что
  // норма не появилась. Пока строк не было вовсе (примерки, черновая карточка) привязывать нечего
  // и запрет был бы ложным.
  //
  // lockedUnsaved ИСКЛЮЧЁН намеренно. Там ткань известна — она пришла из привязки DXF, — но
  // сослаться на неё маркер не может: RPC резолвит только сохранённые строки. Выбирать в списке
  // нечего (в нём лежат ЧУЖИЕ слоты), правильный совет другой — «сохраните карточку», — и
  // блокировать здесь значило бы запретить то, что раньше сохранялось, показав при этом
  // невыполнимое требование.
  const noSlotChosen =
    !viewData && fabricLines.length > 0 && !lockedSlot && !lockedUnsaved && !slotKey;
  // Колорвей выбран, но АРТИКУЛ на этот слот он не назначил. Ширина тогда молча падает на
  // дефолт строки, а маркер сохраняется подписанным этим колорвеем — то есть утверждает про его
  // полотно то, что снято не с него. Это ровно та фикция, ради устранения которой заводился
  // colorway_id, поэтому про неё надо сказать вслух.
  const colorwayNoPin =
    !viewData && !!chosenColorway && !!(lockedSlot?.lineKey || slotKey) && !pinArticle;

  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || viewData) return;
    // The bound fabric wins over the "sole slot" guess: the sheets themselves say which cloth they
    // are cut from (0260), and that is a fact, not an inference.
    //
    // The guess is deliberately narrow — exactly ONE roll-goods line on the whole card. It used to
    // read as «the only fabric», which was the same thing while only fabric lines could be offered;
    // now that lining, interlining and insulation are offered too, a lined garment has two or more
    // candidates and there is nothing to infer from. Guessing the fabric there would bind a lining
    // раскладка to the shell half the time, and the mistake is invisible: the layout is correct,
    // the length is real, and it lands on the wrong BOM line. Instead the modal asks — noSlotChosen
    // below makes the unanswered question block the save rather than pass silently.
    const bound = lockedBomLineKey
      ? lockedSlot
      : fabricLines.length === 1
        ? fabricLines[0]
        : undefined;
    // A lock on a not-yet-saved line cannot set the SLOT (the marker RPC only takes stored
    // lines), but the cloth is known and its width is right there — so take the width anyway.
    // Leaving 140 in place would make the operator re-enter a number the modal is holding.
    const widthOnly =
      !bound && lockedUnsaved
        ? (bomLines ?? []).find((b) => b.lineKey === lockedBomLineKey)
        : undefined;
    if (!bound && !widthOnly) return;
    prefilled.current = true;
    if (bound) setSlotKey(bound.lineKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricLines.length, viewData, lockedBomLineKey, lockedSlot, lockedUnsaved, bomLines]);

  // Ширина следует за выбранной парой (колорвей, слот) — до тех пор, пока оператор не введёт её
  // руками. Это не удобство: ширина есть ВХОД алгоритма, и раскладка, посчитанная на 140 по
  // умолчанию вместо реальных 148, даёт правдоподобную и неверную длину. Ручной ввод больше не
  // перебивается — свой номер оператор ставит осознанно, и подставлять поверх него было бы хуже,
  // чем не подставлять вовсе.
  const [widthTouched, setWidthTouched] = useState(false);
  const resolvedSlot = fabricLines.find((b) => b.lineKey === slotKey);
  const widthSrcLine =
    resolvedSlot ??
    (lockedUnsaved ? (bomLines ?? []).find((b) => b.lineKey === lockedBomLineKey) : undefined);
  const widthPin = widthSrcLine ? chosenColorway?.widthByLine.get(widthSrcLine.lineKey) : undefined;
  // Владелец: выбор колорвея (и слота) ВСЕГДА заново берёт ширину из BOM — ручное число живёт
  // только до следующего выбора. Смена источника и ширины — ОДНО действие под guardManual: отказ
  // выбросить ручные правки оставляет и прежний источник, и прежнюю ширину; согласие сразу кладёт
  // новую ширину (или «не задана») и сбрасывает готовый результат.
  const chooseSource = (next: { colorwayId?: number; slotKey?: string }) => {
    const cw = next.colorwayId ?? colorwayId;
    const key = next.slotKey ?? slotKey;
    const line =
      fabricLines.find((b) => b.lineKey === key) ??
      (lockedUnsaved ? (bomLines ?? []).find((b) => b.lineKey === lockedBomLineKey) : undefined);
    const pin = line
      ? cwOptions.find((c) => c.colorwayId === cw)?.widthByLine.get(line.lineKey)
      : undefined;
    const w = line ? (pin ? pin.cutCm : slotCutWidthOf(line).cutCm) : null;
    guardManual(() => {
      setColorwayId(cw);
      setSlotKey(key);
      setWidthTouched(false);
      setWidthRaw(null);
      if (w == null) {
        setWidthUnset(false);
      } else if (!Number.isFinite(w) || w < 10) {
        setWidthUnset(true);
      } else {
        setWidthUnset(false);
        setWidthCm(Math.round(w * 10) / 10);
      }
      resetRun();
    });
  };
  useEffect(() => {
    if (viewData || widthTouched) return;
    const src = widthSrcLine;
    if (!src) {
      setWidthUnset(false);
      return;
    }
    const w = slotCutWidth(src);
    if (!Number.isFinite(w) || w < 10) {
      setWidthUnset(true);
      return;
    }
    setWidthUnset(false);
    const next = Math.round(w * 10) / 10;
    // Ширина — параметр прогона: её смена сбрасывает результат и стирает ручные правки
    // размещений. Поэтому, во-первых, ставим только если число реально другое (иначе любая
    // пересборка bomLines из useWatch дёргала бы сброс на ровном месте), во-вторых — через
    // guardManual, который спросит, прежде чем выбросить ручную работу. Прямой setWidthCm здесь
    // означал бы: выбрал колорвей после сорокасекундного прогона и двух подвинутых деталей —
    // правая панель молча опустела.
    if (Math.abs(next - widthCm) < 0.05) return;
    guardManual(() => setWidthCm(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slotKey,
    colorwayId,
    colorways,
    viewData,
    widthTouched,
    lockedUnsaved,
    lockedBomLineKey,
    bomLines,
  ]);

  // A failed source fetch means the run nested a SUBSET: placed==total holds (the missing
  // pieces never parsed), but the marker would read as a clean complete norm. Block save.
  const fetchFailed = parse.phase === 'ready' && parse.warnings.some(isFetchFailure);
  // Размер, НА КОТОРЫЙ пишется маркер, — тот, что выбран в диалоге, а не тот, в чей слот файл
  // когда-то положили. Один DXF несёт весь ряд, и раскладка размера XS, записанная как маркер
  // размера M, испортила бы костинг молча: длина есть, размер не тот.
  const unsavedSizes = useMemo(
    () => (savedSizeIds == null ? [] : composition.filter((c) => !savedSizeIds.includes(c.sizeId))),
    [savedSizeIds, composition],
  );
  const sizeUnsaved = unsavedSizes.length > 0;
  // РАЗМЕР СОСТАВА, НА КОТОРЫЙ НЕ ЛОЖИТСЯ НИ ОДНОЙ ДЕТАЛИ. Сервер такое отвергает («состав
  // кроит размер N, а деталей на него не разложено»), и он прав: total_units считает изделия
  // этого размера, а геометрия не кроит ни одного — длина настила делится на изделия, которых в
  // нём нет, и любая норма с него занижена. Ловим ДО прогона, а не после.
  const tokensWithPieces = useMemo(() => {
    const s = new Set<string>();
    for (const p of pieces) {
      if (sel[p.id]?.checked && fitsWidth.get(p.id)) s.add(split.codeById.get(p.id)?.size ?? '');
    }
    return s;
  }, [pieces, sel, fitsWidth, split]);
  // БЕЗ ГЕЙТА НА mixed — проверка верна для состава ЛЮБОЙ длины, и однородный случай даже
  // опаснее смешанного: у однородного блоба нет размеров на деталях, так что серверная половина
  // этой проверки (гейтится hasPieceSize) его не видит вовсе. Состав {M×1}, у которого детали M
  // сняты галочками или не влезли в ширину, сохранял бы норму, измеренную на одних карманах, —
  // заниженную и неотличимую от честной.
  const sizesWithoutPieces = activeRows
    .filter((r) => r.sizeId > 0 && !r.tokens.some((t) => tokensWithPieces.has(t)))
    .map((r) => r.label);
  // ПРАВИЛО СЕРВЕРА, ПРОВЕРЕННОЕ ДО ОТПРАВКИ (entity.ValidateMarkerFabricDirection). Не вторая
  // политика: единственный источник запрета — allowsFlip, отсюда и до движка. Здесь только
  // проверяется, что ГОТОВАЯ раскладка ему не противоречит.
  //
  // Нужно это потому, что раскладку и слот выбирают в разное время. Прогон идёт под направлением,
  // известным на момент запуска; слот оператор может сменить после — и тогда геометрия, законная
  // для одной ткани, отправляется на другую. Сервер такое отвергает, но узнаёт об этом оператор
  // последним: после прогона, после «сохранить», с потерянным результатом.
  //
  // Проверяется ЭФФЕКТИВНАЯ раскладка (с ручными правками), а не результат прогона: рука кладёт
  // деталь туда, куда движок бы не положил.
  //
  // Только на СОЗДАНИИ. Правка уже лежащего маркера (updateViewMarker) идёт другим путём: там у
  // строки может быть помилование по поколению политики, и сервер её примет — блокировать здесь
  // значило бы запретить переименование легаси-раскладки, которое разрешено.
  const layoutFlipsPiece =
    !!effective &&
    (effective.placements.some((p) => p.rot === 180) ||
      effective.placements.some((p) => p.flipped === true));
  const directionRefusal =
    !viewData && layoutFlipsPiece && !allowsFlip(effectiveDirection)
      ? effectiveDirection === 'unknown'
        ? 'a piece is flipped, fabric direction not set on the BOM line'
        : 'a piece is flipped on a one-way fabric'
      : null;
  // ИДЕНТИЧНОСТЬ ПРОГОНА ДЛЯ СОХРАНЕНИЯ: режим настила и состав слоя на старте должны совпадать
  // с текущими — иначе сохранение записало бы layout.spread не того настила (или не записало
  // бы вовсе) при составе, который движок не укладывал.
  const compKey = (c: readonly MarkerCompositionEntry[]) =>
    c.map((e) => `${e.sizeId}:${e.quantity}`).join(',');
  const spreadStale =
    !viewData &&
    run.phase === 'done' &&
    snap != null &&
    (snap.layMode !== layMode || compKey(snap.composition) !== compKey(composition));
  const canSave =
    !viewData &&
    !widthUnset &&
    !spreadStale &&
    !faceToFaceInvalid &&
    !clothWiderThanTable &&
    canEdit &&
    !fetchFailed &&
    !noSlotChosen &&
    !directionRefusal &&
    // Двойной припуск сервер отвергает полевым нарушением (§5.3). Прогон с ним не запускается, и
    // смена слоя или припуска сбрасывает готовый результат, — то есть сюда это состояние сегодня
    // не доходит. Запрет всё равно стоит: «сохранить» — последняя дверь перед сервером, и держать
    // её открытой для пэйлоада, который гарантированно отвергнут, значит обещать отказ вместо
    // сохранения. Инвариант держится этим файлом, а не порядком сбросов в соседнем эффекте.
    !doubleAllowanceRefusal &&
    !uniRefusal &&
    !sizeUnsaved &&
    !sizeUnresolved &&
    sizesWithoutPieces.length === 0 &&
    composition.length > 0 &&
    composition.length <= MAX_MARKER_COMPOSITION_SIZES &&
    run.phase === 'done' &&
    run.result.placedCount === run.result.totalCount &&
    run.result.placements.length > 0 &&
    !!techCardId;

  // ОТКАЗ СОХРАНЕНИЯ — МАССИВОМ ПРИЧИН, а не первой из цепочки. Прежний тултип кнопки был
  // цепочкой из девяти веток и показывал одну причину за раз: остальные открывались по мере
  // починки, по одной на визит. Теперь ВСЕ активные причины рендерятся разом видимым списком
  // под правой панелью. Порядок — от прежней цепочки, с тремя сознательными правками:
  // направление и двойной припуск идут ОТДЕЛЬНЫМИ пунктами и короткими строками (их полные
  // тексты стоят в секциях рейла — второй экземпляр абзаца на том же экране был бы дублем),
  // а noSlotChosen добавлен — в цепочке его не было вовсе, он молча падал в терминальную ветку.
  // Инвариант: массив пуст ⇔ canSave, то есть кнопка выключена ровно по прежнему условию.
  const saveRefusals: string[] = (() => {
    if (viewData || canSave) return [];
    const out: string[] = [];
    if (!canEdit) out.push('no rights to edit the card');
    if (widthUnset) out.push('cloth width not set');
    if (spreadStale) out.push('lay or plies changed after the run: run again');
    if (pliesParityBad) out.push('face to face needs an even number of plies');
    if (ftfNoFlip) out.push('face to face needs a fabric that can be flipped');
    if (clothWiderThanTable) out.push('cloth wider than the table');
    if (fetchFailed) out.push("some DXF files didn't download");
    if (directionRefusal) out.push(directionRefusal);
    if (doubleAllowanceRefusal) out.push(doubleAllowanceRefusal);
    // Полный текст стоит в секции «1 · что кроим», у состава: там же лежат счётчики, которые
    // этот конфликт делает недостоверными. Второй экземпляр абзаца на том же экране был бы дублем.
    if (uniRefusal) out.push('copies of an ungraded piece disagree');
    // Не было в цепочке вовсе: отказ по невыбранной ткани блокировал сохранение молча, а тултип
    // падал в терминальную ветку про «завершённую раскладку». Формулировка — та же, что в рейле.
    if (noSlotChosen) out.push('pick a fabric');
    if (sizeUnresolved)
      out.push(
        unresolvedTokens.length > 0
          ? `sizes not on the card: ${unresolvedTokens.join(', ')}`
          : 'size unknown',
      );
    if (sizeUnsaved) out.push('save the card first: new size');
    if (sizesWithoutPieces.length > 0)
      out.push(`no pieces picked for: ${sizesWithoutPieces.join(', ')}`);
    if (composition.length > MAX_MARKER_COMPOSITION_SIZES)
      out.push(`${composition.length} sizes, cap ${MAX_MARKER_COMPOSITION_SIZES}`);
    if (tableShortText) out.push(tableShortText);
    // Терминальная ветка прежней цепочки — она же покрывает незавершённый прогон, пустой
    // состав и отсутствие серверного контекста (compute-only).
    if (
      run.phase !== 'done' ||
      run.result.placedCount !== run.result.totalCount ||
      run.result.placements.length === 0 ||
      composition.length === 0 ||
      !techCardId
    )
      out.push(TERMINAL_SAVE_REASON);
    return out;
  })();
  // Обычное состояние до первого прогона: единственная причина — терминальная. Красный список
  // при только что открытой модалке не рендерится (см. TERMINAL_SAVE_REASON), причина остаётся
  // в тултипе кнопки. Инвариант «массив непуст ⇔ disabled» это не трогает.
  const onlyTerminal = saveRefusals.length === 1 && saveRefusals[0] === TERMINAL_SAVE_REASON;

  // Отказ сохранения, разобранный по полям (Ф1.8). Сервер отвергает норму, у ткани которой не
  // задано направление, и делает это ПОЛЕВЫМ нарушением с описанием, называющим строку BOM. Тост
  // такой текст съедает: он длинный, он исчезает, и в нём сказано, что чинить, — а чинится это на
  // другой вкладке. Поэтому отказ оседает на панели, рядом с кнопкой, пока его не устранят.
  //
  // Диплинка на вкладку BOM тут быть не может: маркер живёт в модалке НАД формой карточки, и
  // увести оператора на другую вкладку значит закрыть модалку вместе с посчитанной раскладкой.
  // Поэтому — точный адрес словами: какая строка и какое поле.
  const [saveError, setSaveError] = useState<string | null>(null);
  const failMessage = (e: unknown, fallback: string): string => {
    const vs = extractFieldViolations(e);
    if (vs.length > 0) return vs.map((v) => v.description).join('; ');
    return e instanceof Error && e.message ? e.message : fallback;
  };

  async function saveMarker() {
    if (
      !canSave ||
      run.phase !== 'done' ||
      parse.phase !== 'ready' ||
      !techCardId ||
      composition.length === 0
    )
      return;
    if (!effective || !snap) return;
    const name = nameValue.trim();
    if (!name) return;
    // Отказ прошлой попытки снимается ЗДЕСЬ, на входе в новую. Он держится на панели намеренно
    // (тост его съедает), но пока чистил его только startRun — а сохраняют не только после
    // прогона: отказ на слоте А оставался красным на экране, когда сохранение на слот Б уже
    // прошло и рядом всплыл зелёный тост. Две взаимоисключающие новости об одном действии.
    setSaveError(null);
    setSaving(true);
    try {
      const perSetQty = new Map<number, number>();
      for (const p of snap.pieces) {
        const s = sel[p.id];
        if (s?.checked) perSetQty.set(p.id, Math.max(1, Math.round(s.qty)));
      }
      const urlBySource = new Map((files ?? []).map((f) => [f.name, f.url]));
      // The EFFECTIVE layout is saved: hand-adjusted placements, re-measured length, and an
      // explicit warning when the operator accepted clearance violations (cutter's call —
      // never blocked, always on the record).
      const layout = buildMarkerLayout({
        pieces: snap.pieces,
        perSetQty,
        pieceLineKeyById,
        urlBySource,
        result: {
          ...effective,
          // Припуск попадает в ЗАПИСЬ маркера. В блобе лежит геометрия линии КРОЯ, а в
          // summary для припуска колонки нет — без этой строки открытый через полгода маркер
          // не отвечает на вопрос «по какой линии это мерялось», хотя от ответа зависит
          // каждый сантиметр записанного расхода.
          warnings: [
            ...effective.warnings,
            snap.allowanceMm > 0
              ? `seam allowance: ${snap.allowanceMm.toFixed(1)} mm — the CUT contour was saved, the seam line lies on a separate SEAM layer. ASSUMPTION: the allowance is taken even around the whole contour, whereas along the hem it is usually wider`
              : contourIsCutLine
                ? `seam allowance: 0 — the contour is the CUT line (layer ${contourLayer || '—'}), its allowance is already in it`
                : 'seam allowance: 0 — the SEAM LINE was nested, consumption is understated against the cut',
            ...(manualNote ? [manualNote] : []),
          ],
        },
        unit: unitOverride === 'auto' ? parse.detectedUnit : unitOverride,
        config: {
          // ЦЕЛЬ ПРОГОНА как она была — не стол. Стол едет своим полем layout.spread (ниже); до
          // него сюда писалась полезная U с записью TABLE_NOTE_PREFIX, и такие блобы читаются.
          targetLengthCm: snap.config.targetLengthCm,
          // The eps the run ACTUALLY used, not the one it asked for. The engine raises it when
          // the job is too big to precompute at the requested fidelity (Ф0), and storing the
          // request would make params.rdpEpsCm a lie — read by exactly the person trying to
          // reproduce this marker, who would reproduce a different one.
          rdpEpsCm: effective?.telemetry?.rdpEpsCm ?? NEST_DEFAULTS.rdpEpsCm,
          timeBudgetMs: snap.config.timeBudgetMs,
        },
        tol: NEST_DEFAULTS.tol,
        tolChain: NEST_DEFAULTS.tolChain,
        parseWarnings: parse.warnings,
        // Состав и размеры деталей. buildMarkerLayout сам решает, писать ли их в блоб: на
        // однородной раскладке состав выражается легаси-парой ниже, и блоб остаётся байт в байт
        // прежним — иначе каждый пересохранённый старый маркер «дрожал» бы без единого отличия.
        composition: snap.composition,
        sizeIdByPieceId,
        // НАСТИЛ. Стол и запас — из СНИМКА прогона: результат и вердикт «за столом» считались под
        // них (правка после прогона помечает его устаревшим). Слои и режим — из полей на момент
        // сохранения: на укладку они не влияют, и сохраняется то, что оператор видит в строке цифр.
        spread: snap.layTable
          ? spreadToWire({
              plies,
              endLossCm: snap.endLossCm,
              mode: spreadMode,
              tableCm: snap.tableCm,
            })
          : undefined,
      });
      await adminService.SaveTechCardMarker({
        id: 0,
        techCardId,
        marker: {
          productionRunId,
          // СОГЛАСИЕ СОХРАНИТЬ НЕПОЛНУЮ УКЛАДКУ — здесь всегда false: эта кнопка гасится, пока
          // placed !== total (canSave), то есть неполную раскладку модалка не предлагает вовсе.
          // Черновики — предмет очереди раскроя партии, где «не уложилось» нормальный исход.
          isDraft: false,
          // ЛЕГАСИ-ПАРА ИЛИ СОСТАВ — ровно одно из двух, и это правило сервера
          // (dto.markerCompositionOfInsert), а не вкусовщина: состав приезжает ТОЛЬКО блобом,
          // отдельного поля на вставке нет намеренно — две копии на проводе подняли бы вопрос
          // «какая победит, если они разойдутся», у которого нет бесплатного ответа.
          //
          // Смешанная раскладка шлёт нули: сервер увидит состав в блобе и запишет size_id/sets
          // как NULL. Однородная шлёт пару — и сохраняется ровно так же, как до Ф2. Решение
          // живёт в legacyPairOf (marker-io), а не выражением здесь, — чтобы его проверял зонд.
          sizeId: legacyPairOf(snap.composition).sizeId,
          name,
          source: manual ? 'manual' : 'auto',
          bomLineKey: slotKey,
          // Колорвей, под чей артикул мерялась раскладка (0264). 0 = общая. Без него две
          // раскладки одного слота на разных ширинах неразличимы, и «применить маркер» в рецепте
          // предложит длину, снятую на чужом полотне.
          colorwayId,
          fabricWidthCm: dec(snap.widthCm),
          gapCm: dec(snap.gapCm),
          edgeMarginCm: dec(snap.marginCm),
          // Снимок кромки эффективного артикула на момент сохранения: разложение отходов
          // (кромка / межлекальные выпады) должно оставаться проверяемым и после того, как
          // материал слота отредактируют.
          selvedgeCm: dec(slotSelvedge(slot)),
          allowCrossGrain: snap.crossGrain,
          // ПРИПУСК, КОТОРЫМ РАЗДУВАЛИ КОНТУРЫ ЭТОГО ПРОГОНА. Это вход алгоритма, а не подпись:
          // длина снята по линии кроя, и без числа её не воспроизвести.
          seamAllowanceMm: dec(snap.allowanceMm),
          // ПРИПУСК, УЖЕ ЗАЛОЖЕННЫЙ В КОНТУР ФАЙЛА, — это ИЗМЕРЕНИЕ (Ф3.3), и оно уезжает ровно
          // тогда, когда состоялось. `undefined` едет как NULL, то есть «не мерялось»; ноль
          // значит «померили, и его нет» — контур был линией шва. Спутать их нельзя ни в одну
          // сторону: на выдуманном нуле костинг посчитал бы расход по контуру, который на самом
          // деле уже раздут, а на выдуманном числе — отказал бы за двойной припуск раскладке, в
          // которой его нет.
          //
          // Сервер судит по ЭТОМУ числу (§5.3): contour > 0 вместе с seam > 0 — отказ. До него
          // такое сочетание не доезжает, потому что прогон с ним не запускается (см.
          // doubleAllowanceRefusal), но правило живёт на сервере, а не здесь.
          // ЗАМЕР В САНТИМЕТРАХ (геометрия файла) → НА ПРОВОД В МИЛЛИМЕТРАХ, той же единственной
          // функцией. `undefined` проходит насквозь: «не мерялось» это не ноль.
          contourAllowanceMm:
            contourMeasure && contourMeasure.allowanceCm != null
              ? dec(engineCmToMm(contourMeasure.allowanceCm))
              : undefined,
          // СЛОИ — ЧТОБЫ ЧЕРТЁЖ МОЖНО БЫЛО ПЕРЕСОБРАТЬ (Ф3.5). Без них переоткрытый маркер
          // восстанавливается «тем слоем, который ранжируется первым СЕГОДНЯ», а ранжирование
          // зависит от файла: перезалили лист — и пересборка молча взяла другой контур.
          //
          // Пустая строка у долевой ЗНАЧИМА и значит «не разворачивать»: оператор мог отключить
          // разворот сознательно. Схлопнуть её в NULL значит при пересборке развернуть детали,
          // которые разворачивать запретили, — отсюда `optional string` в прото и отправка ''
          // как значения, а не как пропуска.
          contourLayer,
          grainLayer,
          // ПОЛИТИКА ПЕРЕВОРОТА, ПОД КОТОРОЙ ШЁЛ ПОИСК, — а не направление ткани сегодня.
          // Направление у полотна меняется, а маркер судят по условиям, при которых он снят.
          // Вывести это из геометрии нельзя: «ни одна деталь не перевёрнута» не значит «переворот
          // был запрещён», и такой вывод завысил бы строгость.
          allowFlip: allowsFlip(snap.config.fabricDirection ?? effectiveDirection),
          sets: legacyPairOf(snap.composition).sets,
          usedLengthCm: dec(effective.usedLengthCm),
          efficiencyPct: dec(effPct),
          placedCount: effective.placedCount,
          totalCount: effective.totalCount,
          layout,
        },
      });
      showMessage('marker saved', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      // marker_count rides the list rows too.
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      setSaveOpen(false);
      setNameTouched(false);
      setMarkerName('');
      // Back to the prefilled slot, not to «не привязывать»: on a single-fabric card the next
      // save in this session would otherwise silently offer an unlinked marker.
      // Only a RESOLVABLE lock is restored: re-arming a dead key would send a bom_line_key the
      // server cannot resolve on the next save in the same session.
      setSlotKey(lockedSlot?.lineKey || (fabricLines.length === 1 ? fabricLines[0].lineKey : ''));
    } catch (e) {
      const msg = failMessage(e, "couldn't save the marker");
      setSaveError(msg);
      showMessage(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Сохранение правок ОТКРЫТОГО маркера: id round-trip, метаданные проезжают из summary
  // как есть (Decimal-объекты не перекодируются), геометрия — из оригинального блоба с
  // новыми placements; прежние «ручная правка» заметки замещаются свежей.
  const canSaveView =
    viewData != null &&
    editView &&
    manual != null &&
    canEdit &&
    !viewDegraded &&
    !!techCardId &&
    !!view?.summary?.id;
  async function updateViewMarker() {
    if (!canSaveView || !view?.summary || !effective || !techCardId) return;
    const s = view.summary;
    setSaveError(null); // см. saveMarker: отказ прошлой попытки не должен пережить удачную
    setSaving(true);
    try {
      const keptWarnings = (view.layout?.warnings ?? []).filter((w) => !isManualNote(w));
      // ВЕРСИЯ СХЕМЫ БЛОБА: сохранённая — пока в раскладке нет зеркала, ровно 3 — как только есть.
      //
      // Сохранять чужую версию правильно: она делает легаси-маркер переименовываемым, а штамп 3 на
      // легаси-геометрии это свойство отнял бы. Но зеркало в блобе, заявившем версию младше 3, —
      // невозможный пэйлоад: поля тогда не существовало, и сервер отвергает такой блоб для КАЖДОГО
      // маркера, привязанного к ткани или нет (entity.FlipPredatesSchema). То есть выбора между
      // «сохранить версию» и «сохранить зеркало» нет: сохранив версию, мы бы потеряли и зеркало, и
      // всю правку вместе с ним.
      //
      // Сегодня ветка недостижима — редактор не умеет НАВОДИТЬ зеркало, а прочитать его можно
      // только из блоба, который уже v3. Она стоит здесь затем, чтобы инвариант держался этим
      // файлом, а не отсутствием кнопки в соседнем.
      const storedSchema = view.layout?.schemaVersion ?? 1;
      const hasFlip = effective.placements.some((p) => p.flipped === true);
      // …И ТО ЖЕ САМОЕ ПРО СОСТАВ. Блоб, который несёт состав или размер на детали под версией
      // младше 4, сервер отвергает как невозможный пэйлоад (entity.CompositionPredatesSchema) —
      // и правку вместе с ним. Сегодня такого блоба взяться неоткуда (состав пишется только
      // вместе с версией 4), но инвариант обязан держаться этим файлом, а не тем, что соседний
      // пока не умеет иначе.
      const hasComposition =
        (view.layout?.composition ?? []).length > 0 ||
        (view.layout?.pieces ?? []).some((p) => Number(p.sizeId ?? 0) > 0);
      const schemaVersion = Math.max(storedSchema, hasComposition ? 4 : 0, hasFlip ? 3 : 0);
      await adminService.SaveTechCardMarker({
        id: s.id ?? 0,
        techCardId,
        marker: {
          productionRunId,
          // Пересохранение уже сохранённой раскладки: неполной она быть не могла (её бы не приняли),
          // а согласие на черновик — это про НОВЫЙ результат, которого здесь нет.
          isDraft: false,
          sizeId: s.sizeId ?? 0,
          name: s.name ?? '',
          source: 'manual',
          bomLineKey: s.bomLineKey ?? '',
          // Правка геометрии сохранённого маркера НЕ переназначает колорвей — она правит
          // раскладку, а не то, чьё полотно мерялось. Взять здесь выбранный в модалке колорвей
          // значило бы молча переприписать чужой замер.
          colorwayId: s.colorwayId ?? 0,
          fabricWidthCm: s.fabricWidthCm,
          gapCm: s.gapCm,
          edgeMarginCm: s.edgeMarginCm,
          // Правка геометрии не пересчитывает кромку: она снимок момента сохранения.
          selvedgeCm: s.selvedgeCm,
          allowCrossGrain: !!s.allowCrossGrain,
          // УСЛОВИЯ СЪЁМКИ — ЭХОМ, как ширина и кромка выше, и это не то же самое, что undefined.
          //
          // Правка одного размещения не перемеряет ни припуск, ни контур: маркер уже снят, и
          // подставить сюда состояние ПОЛЕЙ МОДАЛКИ значило бы приписать чужому замеру условия
          // текущей формы. Но и стереть их нельзя: по контракту (proto) ОТСУТСТВИЕ припуска
          // означает «СТАРАЯ НОРМА» — никто не записал, по какой линии мерялось, — и костинг
          // после этого не отличит раскладку по линии шва от раскладки по линии кроя. Послать
          // undefined на маркере, у которого припуск записан, значит РАЗЖАЛОВАТЬ его в легаси
          // одним движением детали, и заметить это будет не по чему.
          //
          // ЭХОМ ИДУТ ВСЕ ПЯТЬ, а не два. Слои и политика переворота — такие же условия съёмки,
          // как припуск: маркер, у которого правкой одного размещения стёрли contour_layer,
          // перестаёт быть пересобираемым (Ф3.5 нечем повторить выбор контура), а стёртый
          // allow_flip делает норму несравнимой для гейта. Пропустить их здесь — тот же класс
          // дефекта, что и пропущенный `flipped` в размещениях этого же метода.
          seamAllowanceMm: s.seamAllowanceMm,
          contourAllowanceMm: s.contourAllowanceMm,
          contourLayer: s.contourLayer,
          grainLayer: s.grainLayer,
          allowFlip: s.allowFlip,
          // Легаси-пара проезжает КАК ЛЕЖИТ и только вместе. Прежнее `s.sets ?? 1` подставляло
          // единицу маркеру с составом (proto3 роняет умолчание, и в сводке там ноль) — то есть
          // на правку одного размещения отправляло «этот настил кроит одно изделие». Пару спасал
          // только приоритет состава в блобе на сервере; полагаться на это нельзя — состав в
          // блобе есть лишь у смешанной раскладки.
          sets: s.sets ?? 0,
          usedLengthCm: dec(effective.usedLengthCm),
          efficiencyPct: dec(effPct),
          placedCount: s.placedCount ?? effective.placedCount,
          totalCount: s.totalCount ?? effective.totalCount,
          layout: {
            schemaVersion,
            params: view.layout?.params,
            // Состав раскладки (Ф2) эхом, как params и pieces рядом: правка ОДНОГО размещения не
            // должна ронять состав чужого маркера. У легаси-блоба его нет — тогда здесь undefined,
            // ключ в JSON не появляется, и блоб остаётся ровно прежним.
            composition: view.layout?.composition,
            pieces: view.layout?.pieces ?? [],
            placements: effective.placements.map((pl) => ({
              pieceId: pl.pieceId,
              instance: pl.instance,
              rotDeg: pl.rot,
              xCm: Math.round(pl.x * 100) / 100,
              yCm: Math.round(pl.y * 100) / 100,
              // ТРЕТИЙ путь записи размещений (buildMarkerLayout — первый, saveMarker зовёт его).
              // Он молча ронял зеркало: открыть зеркальный маркер, подвинуть ОДНУ деталь, сохранить
              // правки — и все зеркальные экземпляры возвращались обычными. Никакого признака: и
              // тот и другой контур на экране выглядят одинаково, длина не меняется, счётчики
              // сходятся. Сорок четыре левые полочки и ни одной правой.
              flipped: pl.flipped === true,
            })),
            warnings: [...keptWarnings, ...(manualNote ? [manualNote] : [])],
            // Настил эхом, как params: правка размещения не должна стирать, под какой стол снято.
            spread: view.layout?.spread,
          },
        },
      });
      showMessage('marker edits saved', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      onClose();
    } catch (e) {
      const msg = failMessage(e, "couldn't save the edits");
      setSaveError(msg);
      showMessage(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── ЛЕВЫЙ РЕЙЛ: ЧЕТЫРЕ СЕКЦИИ-АККОРДЕОНА ──────────────────────────────────────────────────
  //
  // Статус секции считается ЗДЕСЬ, из тех же значений, что рисуют её содержимое: шапка отвечает
  // за свёрнутую секцию, а второй набор условий рядом с первым однажды разошёлся бы. Блокирующие
  // отказы (прогон или сохранение не пойдут) держатся отдельно от предупреждений: Pill в шапке
  // несёт их разным тоном, а перечисление причин едет в title — парой к слову-глифу.
  //
  // `sel` засеивается эффектом ПОСЛЕ отрисовки разбора, а до готовности разбора `graded` ложно
  // пуст. Блокеры, зависящие от выбора деталей или от состава, до этого момента не считаются —
  // иначе каждый (пере)разбор мигал бы ложными отказами о непрочитанном файле и дёргал
  // авто-открытие секций (до трёх прыжков за один разбор).
  const selSeeded = parse.phase === 'ready' && pieces.some((p) => sel[p.id] != null);
  const unfitCount = pieces.filter((p) => !fitsWidth.get(p.id)).length;
  const sizeUnknown = selSeeded && !graded && !sizeId;
  // ДВЕРЬ В АРТИКУЛ. Направление, кромка и ширина — поля АРТИКУЛА (карточка материала), и чинятся
  // они там; ссылка открывает его карточку в НОВОЙ вкладке, чтобы раскладка с ручными правками
  // осталась жить. Артикул ширины — пин колорвея, если он дал ширину, иначе артикул слота.
  const activeSlot = lockedSlot ?? slot;
  const widthArticleId = (() => {
    const pin = activeSlot ? chosenColorway?.widthByLine.get(activeSlot.lineKey) : undefined;
    if (pin && Number.isFinite(pin.cutCm)) return pin.materialId;
    return activeSlot?.materialId;
  })();
  const goToBomLineField = useGoToBomLineField();
  // Направление — поле СТРОКИ BOM (ворс: any / one way / two way), не артикула: туда и ведём.
  const directionFix = (): HeaderWarningAction | undefined => {
    const run = goToBomLineField(activeSlot?.lineKey, 'fabricDirection', onClose);
    return run ? { label: 'set on the BOM line', onClick: run } : undefined;
  };
  const openArticle = (materialId: number | undefined): HeaderWarningAction | undefined =>
    materialId && materialId > 0
      ? {
          label: 'set on the article',
          href: articleUrl(materialId),
          onClick: () => {
            articleOpenedRef.current = true;
          },
        }
      : undefined;
  // НАПРАВЛЕНИЕ — поле СТРОКИ BOM (tech_card_bom_item.fabric_direction: any/one_way/two_way), а не
  // артикула: у артикула своё fabricAttrs.fabricDirection — это ДОЛЕВАЯ (lengthwise/crosswise/any),
  // про ворс оно ничего не говорит, и сервер судит маркер только по строке
  // (ValidateMarkerFabricDirection). Поэтому дверь в артикул здесь не ставится: там это не чинится.
  const directionUnset = effectiveDirection === 'unknown';

  // ── настил под раскроечный стол: толщина, цифры, вердикты ───────────────────────────────
  const thicknessSlot = viewData
    ? fabricLines.find((b) => b.lineKey === view?.summary?.bomLineKey)
    : activeSlot;
  const thicknessPin = thicknessSlot
    ? (viewData
        ? cwOptions.find((c) => c.colorwayId === (view?.summary?.colorwayId ?? 0))
        : chosenColorway
      )?.widthByLine.get(thicknessSlot.lineKey)
    : undefined;
  const thicknessFromPin = !!thicknessPin && Number.isFinite(thicknessPin.cutCm);
  const bomThicknessMm =
    (thicknessFromPin ? thicknessPin?.fabricThicknessMm : thicknessSlot?.fabricThicknessMm) ?? null;
  // Толщины нет ни у пина, ни у слота — её спрашивает шаг «layers» квиза. Только на эту сессию:
  // толщина — поле артикула, и писать её отсюда значило бы завести вторую дверь в материал.
  const [thicknessEdit, setThicknessEdit] = useState<number | null>(null);
  const thicknessMm = bomThicknessMm ?? (viewData ? null : thicknessEdit);
  // Предел стопки в слоях — вход авто-слоёв, которые считаются выше (до слота ткани): зеркало.
  const stackCapNow = viewData
    ? null
    : spreadFigures({ plies: 1, thicknessMm, stackLimitCm, mode: spreadMode }).maxPlies;
  useEffect(() => {
    setStackCapPlies(stackCapNow);
  }, [stackCapNow]);
  // Конец стола на холсте: в прогоне — U из ряда table; у сохранённого — U из блоба.
  // У сохранённого — только если блоб несёт запись о столе: без неё targetLengthCm — старая ручная
  // цель (до ae74b7da), она рисуется нейтральной пунктирной целью и вердиктом «за столом» не служит.
  // У готового прогона — стол из его снимка (как ширина): результат считался под него.
  // Новый маркер: настил своим полем (layout.spread), конец стола = стол − 2·запас.
  const storedSpread = viewData ? storedSpreadOf(view?.layout) : null;
  // «norm from a 1·2·2·1 lay × 10 plies» — у маркера, снятого под настил больше одного слоя.
  const storedNormLabel =
    storedSpread && storedSpread.plies > 1 && view?.summary
      ? `norm from a ${compositionOf(view.summary)
          .map((c) => c.quantity)
          .join('·')} lay × ${storedSpread.plies} plies`
      : '';
  const storedUsableCm =
    storedSpread?.tableCm != null && storedSpread.tableCm - 2 * storedSpread.endLossCm > 0
      ? Math.round((storedSpread.tableCm - 2 * storedSpread.endLossCm) * 100) / 100
      : null;
  // Старый маркер (до layout.spread): U в targetLengthCm + запись TABLE_NOTE_PREFIX.
  const storedTableEnd =
    !!viewData &&
    !storedSpread &&
    (view?.layout?.warnings ?? []).some((w) => w.startsWith(TABLE_NOTE_PREFIX));
  const tableEndCm = viewData
    ? storedSpread
      ? storedUsableCm
      : storedTableEnd
        ? viewData.targetCm ?? null
        : null
    : runView
      ? // Стол на холсте — у прогона со столом или в режиме стола; одиночный настил стола не знает.
        runView.config.maxLengthCm != null || tableMode
        ? runView.usableCm
        : null
      : tableMode
        ? usableCm
        : null;
  const spread = spreadFigures({
    // У сохранённого — слои из layout.spread; у старого маркера их нет — всё, что от них
    // зависит, прочерк.
    plies: viewData ? storedSpread?.plies ?? NaN : plies,
    thicknessMm,
    stackLimitCm,
    compositionTotal: viewData ? viewData.totalUnits || 1 : unitsTotal,
    markerLengthCm: effective?.usedLengthCm ?? null,
    endLossCm: viewData && storedSpread ? storedSpread.endLossCm : endLossCm,
    mode: viewData && storedSpread ? storedSpread.mode : spreadMode,
  });
  const overTableCm =
    effective && tableEndCm != null && !running ? effective.usedLengthCm - tableEndCm : 0;
  const tableFullCount =
    !viewData && !running
      ? (displayResult?.unplaced ?? []).filter((u) => u.reason === 'table-full').length
      : 0;
  const fitAvailable =
    !viewData &&
    canEdit &&
    parse.phase === 'ready' &&
    usableCm != null &&
    checkedCount > 0 &&
    !overCap &&
    !doubleAllowanceRefusal &&
    !uniRefusal &&
    !widthUnset &&
    !ftfNoFlip &&
    !clothWiderThanTable;
  const fitAction: HeaderWarningAction | undefined = fitAvailable
    ? {
        label: 'fit to the table',
        onClick: () => guardManual(() => void fitToTable()),
        disabled: busy,
      }
    : undefined;
  // ── КВИЗ РАСКЛАДКИ: вопросы по одному вместо прежней шапки. Своих чисел у квиза нет — ответы
  // пишут в состояние выше, «Run» зовёт тот же requestRun, что и прежняя кнопка.
  const [quizDone, markQuizDone] = useQuizDone(techCardId, lockedSlot?.lineKey || slotKey);
  const quiz = useMarkerQuiz({
    slotKey: lockedSlot?.lineKey || slotKey,
    mode: layMode,
    // Стол цеха сохранён целиком — его подтверждают, а не вводят.
    tableSaved: wsTableCm != null && wsTableWidthCm != null && wsStackCm != null,
    // Квиз уже пройден для этой ткани или открыт сохранённый маркер — сразу шаг «run».
    startAtRun: !!viewData || quizDone,
    busy,
  });
  const spreadWarnings: HeaderWarning[] = [];
  if (clothWiderThanTable && tableWidthCm != null) {
    spreadWarnings.push({
      text: `cloth ${clothRollCm} cm wider than the table ${tableWidthCm} cm`,
      error: true,
      action: { label: 'table size', onClick: () => quiz.open('size') },
    });
  }
  if (overTableCm > 0.05) {
    spreadWarnings.push({
      text: `longer than the table by ${overTableCm.toFixed(1)} cm`,
      error: true,
      action: fitAction,
    });
  }
  if (tableShortText) {
    spreadWarnings.push({
      // Прочие причины (шире полотна, зеркало…) дописываются в ту же строку: дверь стола их не
      // чинит, и молча проглотить их нельзя.
      text: unplaced.length > 0 ? `${tableShortText} · ${unplacedText}` : tableShortText,
      error: true,
      action: fitAction,
    });
  } else if (tableFullCount > 0) {
    spreadWarnings.push({
      text: `${tableFullCount} ${tableFullCount === 1 ? "piece doesn't" : "pieces don't"} fit on the table`,
      error: true,
      action: fitAction,
    });
  }
  // «fit to the table» поднял слои выше стопки: маркер тот же, просто настилов несколько.
  const needsLays =
    !viewData && tableMode && spread.overStack && spread.maxPlies != null && spread.maxPlies >= 1
      ? fitPlies === plies
        ? Math.ceil(plies / spread.maxPlies)
        : 0
      : 0;
  if (needsLays > 1) {
    spreadWarnings.push({ text: `needs ${needsLays} lays: stack limit`, error: true });
  } else if (!viewData && tableMode && spread.overStack && spread.maxPlies != null) {
    const max = spread.maxPlies;
    spreadWarnings.push({
      text: `${plies} plies over the stack limit, max ${max}`,
      error: true,
      action: {
        label: 'max layers',
        onClick: () => guardManual(() => setPlies(Math.max(1, max))),
      },
    });
  }
  if (ftfNoFlip) {
    spreadWarnings.push(
      effectiveDirection === 'unknown'
        ? {
            text: 'face to face: fabric direction not set on the BOM line',
            error: true,
            action: directionFix(),
          }
        : {
            text: 'face to face on a one-way fabric',
            error: true,
            action: {
              label: 'face up',
              onClick: () => guardManual(() => setSpreadMode('face_up')),
            },
          },
    );
  }
  if (!viewData && tableMode && spread.oddFaceToFace) {
    spreadWarnings.push({
      text: 'face to face needs an even number of plies',
      error: true,
      action: {
        label: 'make even',
        onClick: () =>
          guardManual(() =>
            setPlies(
              spread.maxPlies != null && plies + 1 > spread.maxPlies
                ? Math.max(2, plies - 1)
                : plies + 1,
            ),
          ),
      },
    });
  }
  if (!viewData && tableMode && parse.phase === 'ready' && tableCm == null) {
    spreadWarnings.push({
      text: 'table length not set',
      action: { label: 'set', onClick: () => quiz.open('size') },
    });
  }
  // Перекрой: в допуске (≤ +1 на размер или ≤ 10 % итога) молчит; сверх — строка с дверью
  // «fit plies» (вернуть авто-слои), если слои свои; у авто дверь ничего бы не поменяла.
  const extraTotal = overCut.reduce((a, v) => a + v, 0);
  const cutTotal = cutTotals.reduce((a, v) => a + v, 0);
  const extraDetail = cutTotals
    .map((t, i) => ({
      t,
      o: overCut[i] ?? 0,
      label: graded ? cellRows[i]?.label ?? '' : sizeLabel || 'garments',
    }))
    .filter((x) => x.o > 0)
    .map((x) => `${x.label.toLowerCase()}: cuts ${x.t + x.o} for ${x.t} (+${x.o})`)
    .join(' · ');
  if (
    !viewData &&
    tableMode &&
    extraTotal > 0 &&
    cutTotal > 0 &&
    !extraWithinTolerance(cutTotals, plies)
  ) {
    spreadWarnings.push({
      text: `+${extraTotal} extra (${Math.round((extraTotal / cutTotal) * 100)} %) · ${extraDetail}`,
      action:
        !pliesAuto && plies !== autoPliesN
          ? { label: 'fit plies', onClick: () => guardManual(() => setPlies(null)) }
          : undefined,
    });
  }
  if (!viewData && tableMode && thicknessSlot && thicknessMm == null) {
    spreadWarnings.push({
      text: 'max plies unknown: thickness not set',
      action: { label: 'set', onClick: () => quiz.open('layers') },
    });
  }
  // Припуск/ширина сменились (догрузка цеха или артикула) уже после старта прогона.
  const snapStale =
    !viewData &&
    run.phase === 'done' &&
    snap != null &&
    (snap.allowanceMm !== allowanceMm ||
      snap.widthCm !== widthCm ||
      snap.gapCm !== gapCm ||
      snap.marginCm !== marginCm ||
      snap.crossGrain !== crossGrain ||
      // Стол и запас (через полезную U): вердикт «за столом» и сохраняемый стол — от прогона.
      snap.usableCm !== (tableMode ? usableCm : null) ||
      spreadStale);
  const figure = (v: number | null, digits = 0) =>
    v == null ? '—' : digits > 0 ? String(Math.round(v * 10 ** digits) / 10 ** digits) : String(v);
  const railS1: RailSectionStatus = {
    blockers: [
      noSlotChosen ? 'pick a fabric' : '',
      unresolvedTokens.length > 0 ? `sizes not on the card: ${unresolvedTokens.join(', ')}` : '',
      sizeUnknown ? 'size unknown' : '',
      sizeUnsaved ? 'save the card first: new size' : '',
      selSeeded && sizesWithoutPieces.length > 0
        ? `no pieces picked for: ${sizesWithoutPieces.join(', ')}`
        : '',
      composition.length > MAX_MARKER_COMPOSITION_SIZES
        ? `${composition.length} sizes, cap ${MAX_MARKER_COMPOSITION_SIZES}`
        : '',
      uniRefusal ? 'copies of an ungraded piece disagree' : '',
    ].filter(Boolean),
    warnings: [
      colorwayNoPin
        ? `colourway ${chosenColorway?.label ?? ''} has no article for this fabric`
        : '',
      mixed ? 'mixed composition: no per-unit consumption' : '',
    ].filter(Boolean),
  };
  const railS2: RailSectionStatus = {
    blockers: [directionRefusal ?? '', doubleAllowanceRefusal ?? ''].filter(Boolean),
    warnings: [
      allowanceMm === 0 && !contourIsCutLine ? NO_ALLOWANCE_TEXT : '',
      allowanceUnconfirmed ? 'allowance not confirmed by the file' : '',
      seam.hulled.length > 0 ? `defective contour on ${seam.hulled.length} pieces` : '',
      !viewData && effectiveDirection === 'unknown' ? DIRECTION_UNSET_TEXT : '',
    ].filter(Boolean),
  };
  const railS3: RailSectionStatus = {
    blockers: [
      overCap
        ? `over the cap: ${MAX_MARKER_PIECES} pieces / ${MAX_MARKER_PLACEMENTS} placements`
        : '',
      // Только после засева `sel` (см. selSeeded) — иначе секция мигала бы открытой после разбора.
      selSeeded && checkedCount === 0
        ? pieces.length > 0 && unfitCount === pieces.length
          ? 'no piece fits the width'
          : 'no piece picked'
        : '',
    ].filter(Boolean),
    warnings: [unfitCount > 0 ? `too wide: ${unfitCount} pieces` : ''].filter(Boolean),
  };
  // Двери «show» у блокеров: поле, которое чинит отказ, получает фокус; детали открывают поповер.
  const [piecesOpen, setPiecesOpen] = useState(false);
  // Поле тихого ряда шага «run» (ткань): открыть квиз там и поставить фокус после рендера.
  const focusOnRun = (id: string) => {
    quiz.open('run');
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      const target = el?.matches('input, button, select')
        ? el
        : el?.querySelector<HTMLElement>('button, input, select');
      target?.focus();
    });
  };
  // Дверь у блокера: детали — поповер шага «run», ткань — её поле там же, состав — шаг «what».
  const showFix = (section: number, text: string): HeaderWarningAction | undefined => {
    if (section === 3) {
      return {
        label: 'show',
        onClick: () => {
          quiz.open('run');
          setPiecesOpen(true);
        },
      };
    }
    if (section === 1) {
      return noSlotChosen && text === 'pick a fabric'
        ? { label: 'show', onClick: () => focusOnRun('nest-fabric') }
        : { label: 'show', onClick: () => quiz.open('what') };
    }
    return undefined;
  };

  // ПРЕДУПРЕЖДЕНИЯ И ОТКАЗЫ — В ШАПКЕ МОДАЛКИ (patterns-lite, п. 11). Чтение файла (единицы,
  // контур, долевая, файлы) идёт по умолчаниям; всё, что из него пошло не так, — здесь.
  const setAllowanceZero = () =>
    guardManual(() => {
      setAllowanceTouched(true);
      setAllowanceMm(0);
    });
  // The article's cutting width, back in the field; the width follows the article again.
  const applyArticleWidth = () => {
    if (!Number.isFinite(slotWidth) || slotWidth < 10) return;
    setSaveOpen(false);
    guardManual(() => {
      setWidthTouched(false);
      setWidthUnset(false);
      setWidthRaw(null);
      setWidthCm(Math.round(slotWidth * 10) / 10);
    });
  };
  const topWarningsRaw: Array<HeaderWarning | HeaderWarning[] | ''> = [
    ...(parse.phase === 'error' ? [{ text: parse.message, error: true }] : []),
    ...(parse.phase === 'ready'
      ? parse.warnings
          .filter((w) => !isHiddenNote(w))
          .map((w) =>
            isFetchFailure(w)
              ? {
                  text: w,
                  error: true,
                  action: { label: 'retry', onClick: () => guardManual(reparse) },
                }
              : w,
          )
      : []),
    ...(!viewData
      ? [
          missingOnLayer.length > 0
            ? `no contour on layer ${contourLayer || '—'} for ${missingOnLayer.length} blocks`
            : '',
          grainLayer !== '' && oriented.missing.length > 0
            ? `grainline unclear on ${oriented.missing.length} pieces`
            : '',
          parse.phase === 'ready' && grainLayer === '' ? 'no grainline: pieces lie as drawn' : '',
        ]
      : []),
    // Статусы рейла — только в режиме расчёта: у сохранённого маркера рейл скрыт.
    ...(viewData
      ? []
      : [
          // A blocker's fix lives in a toolbar field: «show» focuses it (pieces open their
          // popover). Double allowance has a direct fix.
          ...[railS1, railS2, railS3].flatMap((sec, i) =>
            sec.blockers.map(
              (text): HeaderWarning => ({
                text,
                error: true,
                action:
                  text === doubleAllowanceRefusal
                    ? { label: 'set allowance to 0', onClick: setAllowanceZero }
                    : text === directionRefusal && directionUnset
                      ? directionFix()
                      : showFix(i + 1, text),
              }),
            ),
          ),
          ...railS1.warnings,
          ...railS2.warnings.map((text): HeaderWarning => {
            if (text === NO_ALLOWANCE_TEXT && fixAllowanceMm > 0) {
              return {
                text,
                action: {
                  label: `set allowance to ${fixAllowanceMm} mm`,
                  onClick: () =>
                    guardManual(() => {
                      setAllowanceTouched(true);
                      setAllowanceMm(fixAllowanceMm);
                    }),
                },
              };
            }
            return text;
          }),
          ...railS3.warnings.map(
            (text): HeaderWarning =>
              text === DIRECTION_UNSET_TEXT ? { text, action: directionFix() } : text,
          ),
        ]),
    !viewData && !running && saveRefusals.length > 0 && !onlyTerminal
      ? saveRefusals
          .filter((r) => r !== TERMINAL_SAVE_REASON && r !== tableShortText)
          .map((text) => ({
            text,
            error: true,
          }))
      : [],
    ...spreadWarnings,
    snapStale
      ? {
          text: 'settings changed after the run',
          action: { label: 'run again', onClick: requestRun },
        }
      : '',
    forecast?.outlook === 'starved' && !running ? 'geometry too heavy for the time budget' : '',
    unplaced.length > 0 && !tableShortText
      ? { text: `did not fit: ${unplaced.length} · ${unplacedText}`, error: true }
      : '',
    partialGeometry && !tableShortText ? { text: partialExportRefusal, error: true } : '',
    drawing.phase === 'error' ? { text: `drawing not restored: ${rebuildText}`, error: true } : '',
    ...(drawing.phase === 'ok' ? drawing.warnings : []),
    !running && displayResult?.cancelled && displayResult.placements.length === 0
      ? 'stopped before the first result'
      : '',
    violations.length > 0 && !running
      ? {
          text: [
            outsideCount > 0
              ? `${outsideCount} ${outsideCount === 1 ? 'piece' : 'pieces'} outside the cloth`
              : '',
            tooCloseCount > 0 ? `${tooCloseCount} pieces closer than the gap` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          error: true,
          action: showViolation
            ? {
                label: 'show',
                onClick: () => setFocusReq({ index: showViolation.index, nonce: Date.now() }),
              }
            : undefined,
        }
      : '',
    // Ручные правки откатываются из шапки: красные детали почти всегда — результат перетаскивания.
    violations.length > 0 && !running && manual
      ? {
          text: 'pieces moved by hand',
          action: { label: 'reset edits', onClick: () => setManual(null) },
        }
      : '',
    viewData && storedNoAllowance
      ? `${NO_ALLOWANCE_TEXT} — re-run the marker from the patterns with an allowance`
      : '',
    greedyOnly ? 'no search ran: greedy placement' : '',
    ...(displayResult ? displayResult.warnings : []),
    saveError ? { text: `saving failed: ${saveError}`, error: true } : '',
    !viewData && widthUnset
      ? {
          text: chosenColorway
            ? `cloth width not set for ${chosenColorway.label}`
            : 'cloth width not set',
          error: true,
          // Пин колорвея есть — ширину чинят в его артикуле; нет — на строке BOM (её артикул).
          action: widthPin?.materialId
            ? openArticle(widthPin.materialId)
            : (() => {
                const run = goToBomLineField(widthSrcLine?.lineKey, 'materialId', onClose);
                return run
                  ? { label: 'set on the BOM line', onClick: run }
                  : openArticle(widthSrcLine?.materialId);
              })(),
        }
      : '',
  ];
  const runBlocked =
    (!viewData && (widthUnset || faceToFaceInvalid || clothWiderThanTable)) ||
    parse.phase !== 'ready' ||
    checkedCount === 0 ||
    overCap ||
    !!doubleAllowanceRefusal ||
    !!uniRefusal ||
    fitting != null;
  // autoRun: the same `startRun` the «run» button calls, at most once. It is decided ONE task after
  // the parse settles (ready or error), so the prefill effects (slot → width) of that commit land
  // first; the gate is re-read from the LATEST render through a ref. Blocked at that moment = the
  // offer lapses for good — fixing the width later does not start a run behind the user's back.
  const autoRunFired = useRef(false);
  const autoRunLatest = useRef({ startRun, runBlocked, running, fitting, effective, manual });
  autoRunLatest.current = { startRun, runBlocked, running, fitting, effective, manual };
  const parseSettled = parse.phase === 'ready' || parse.phase === 'error';
  useEffect(() => {
    if (!autoRun || autoRunFired.current || viewData || !parseSettled) return;
    const t = window.setTimeout(() => {
      const l = autoRunLatest.current;
      if (autoRunFired.current) return;
      autoRunFired.current = true;
      if (l.runBlocked || l.running || l.fitting || l.effective || l.manual) return;
      l.startRun();
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoRun, viewData, parseSettled, runBlocked, widthCm, widthUnset]);
  // ЕДИНСТВЕННОЕ МЕСТО, где собирается шапка: служебные заметки разбора, протокол припуска и
  // прежняя заметка о ручной правке (её заменяет живая проверка выше) отсюда не выходят — ни из
  // свежего разбора, ни из блоба сохранённой раскладки.
  const topWarnings = topWarningsRaw
    .flat()
    .filter((w): w is HeaderWarning => w !== '')
    .filter((w) => {
      const t = typeof w === 'string' ? w : w.text;
      return (
        !isHiddenNote(t) &&
        !t.startsWith(SEAM_NOTE_PREFIX) &&
        !t.startsWith(TABLE_NOTE_PREFIX) &&
        !isManualNote(t)
      );
    });
  const titleFabric = (lockedSlot ?? slot)?.name?.trim();
  // Выгрузка: та же кнопка 28×28, что «по ширине» и «весь маркер», в той же группе угла холста.
  const downloadButton =
    effective && !running ? (
      <GenericPopover
        noTail
        className='w-[190px]'
        contentProps={{ align: 'end', side: 'top', sideOffset: 4 }}
        triggerProps={{
          'aria-label': 'download',
          className: CANVAS_ICON_BTN,
        }}
        openElement={
          <svg width='14' height='14' viewBox='0 0 14 14' aria-hidden fill='none'>
            <path
              d='M7 1.5v8M3.5 6 7 9.5 10.5 6M2 12.5h10'
              stroke='currentColor'
              strokeWidth='1.2'
            />
          </svg>
        }
      >
        <div className='flex flex-col items-start gap-1'>
          <Button
            type='button'
            variant='underline'
            disabled={viewDegraded || drawingBlocked || partialGeometry}
            title={exportBlockReason || undefined}
            onClick={downloadSvg}
          >
            SVG
          </Button>
          <Button
            type='button'
            variant='underline'
            disabled={!dxfReady}
            title={exportBlockReason || undefined}
            onClick={downloadDxf}
          >
            DXF
          </Button>
          {/* The marker at 1:1 on paper (one sheet / tiles) — the EFFECTIVE placements, as DXF. */}
          <PatternExportItems
            disabled={!dxfReady}
            title={exportBlockReason || undefined}
            drawing={() =>
              drawingFromMarker(
                effective,
                displayPieces,
                displayWidth,
                fileParts()
                  .filter((x): x is string => !!x && !!x.trim())
                  .join('-') || 'marker',
              )
            }
            plot={async () => ({
              plot: plotFromMarker(effective, displayPieces, { fabricWidthCm: displayWidth }),
              title:
                fileParts()
                  .filter((x): x is string => !!x && !!x.trim())
                  .join('-') || 'marker',
            })}
          />
          {/* Плоттерный выход без чертежа — только когда чертёж не восстановлен (решение Р4). */}
          {drawing.phase === 'error' && !viewDegraded && (
            <Button
              type='button'
              variant='underline'
              disabled={partialGeometry}
              title={partialExportRefusal || undefined}
              onClick={downloadContoursOnly}
            >
              DXF contours
            </Button>
          )}
        </div>
      </GenericPopover>
    ) : null;

  // ── оценка до прогона и входы квиза ──────────────────────────────────────────────────────
  // Оценка длины по площади: Σ площадь·тираж / (ширина · 0.8) — картинка и цифры шага «run».
  const areaOfPiece = new Map(pieces.map((p) => [p.id, p.areaCm2]));
  let areaTotal = 0;
  for (const c of runConfig.pieces) areaTotal += (areaOfPiece.get(c.pieceId) ?? 0) * c.quantity;
  const estLengthCm = areaTotal > 0 && widthCm > 0 ? areaTotal / (widthCm * 0.8) : null;
  // Цифры настила квиза и сводки: до прогона — по оценке длины, после — по маркеру. Один настил
  // (single) — один слой без запаса на концы: шага «ends» у него нет.
  const layFigures = spreadFigures({
    plies: tableMode ? plies : 1,
    thicknessMm,
    stackLimitCm,
    compositionTotal: unitsTotal,
    markerLengthCm: effective?.usedLengthCm ?? estLengthCm,
    endLossCm: tableMode ? endLossCm : 0,
    mode: spreadMode,
  });
  const quizRows: QuizRow[] = graded
    ? cellRows.map((r) => ({
        key: r.key,
        label: r.label,
        qty: r.qty,
        bad: (!r.resolvable || r.sizeId <= 0) && r.qty >= 1,
        min: 0,
      }))
    : [{ key: '', label: sizeLabel || 'garments', qty: cellUngraded, bad: sizeUnknown, min: 1 }];
  // Те же предупреждения, что в шапке: строкой на шаге «run», ошибки первыми, без повторов.
  const quizWarnings: QuizWarning[] = topWarnings
    .map((w) =>
      typeof w === 'string'
        ? { text: w, error: false }
        : { text: w.text, error: !!w.error, fix: w.action },
    )
    .filter((w, k, all) => all.findIndex((o) => o.text === w.text) === k)
    .sort((a, b) => Number(b.error) - Number(a.error));
  // Квиз на экране, пока результата нет (или его открыли «edit»); прогон и подбор — холст.
  const quizOpen = !viewData && !running && fitting == null && (quiz.reopened || !effective);
  const metres = (cm: number | null) => (cm == null ? '—' : `${(cm / 100).toFixed(2)} m`);
  // Свёрнутый квиз: в строке над холстом — норма сохранённого маркера, «edit» и предупреждения;
  // факты настила и итог прогона — одной ведомостью под холстом (та же грамматика, что шаг «run»).
  const summaryFacts: Array<[string, React.ReactNode]> = [];
  type LayFact = { label: string; value: React.ReactNode; error?: boolean };
  const layFacts: LayFact[] = [];
  if (viewData) {
    if (storedNormLabel) summaryFacts.push(['', storedNormLabel]);
    if (storedSpread) {
      layFacts.push(
        { label: 'layers', value: storedSpread.plies },
        { label: 'face', value: storedSpread.mode === 'face_up' ? 'up' : 'to face' },
        { label: 'table', value: `${figure(storedSpread.tableCm, 1)} cm` },
        { label: 'stack', value: `${figure(spread.stackCm, 1)} cm` },
        { label: 'fabric', value: metres(spread.fabricCm) },
      );
    } else if (tableEndCm != null) {
      layFacts.push({ label: 'on table', value: `${figure(tableEndCm, 1)} cm` });
    }
  } else {
    layFacts.push({
      label: 'garments',
      value: extraTotal > 0 ? `${cutTotal} +${extraTotal}` : cutTotal,
    });
    if (tableMode) {
      layFacts.push(
        { label: 'layers', value: plies },
        {
          label: 'stack',
          value: `${figure(layFigures.stackCm, 1)} / ${figure(stackLimitCm, 1)} cm`,
          error: layFigures.overStack,
        },
      );
    }
    layFacts.push({ label: 'fabric', value: metres(layFigures.fabricCm) });
  }
  // ТИХИЙ РЯД ШАГА «run»: выбор ткани и настройки раскладки — прежние поля и поповеры шапки как
  // есть; панель раскладки стала поповером «nesting». Ширина полотна и детали — ячейки полосы.
  const quizExtras = !lockedSlot && fabricLines.length > 0 && (
    <div className='flex items-end gap-1'>
      {
        <div
          id='nest-fabric'
          className={`${FIELD} relative`}
          title={[slot ? slotLabel(slot) : 'not picked', pinArticle ? `article: ${pinArticle}` : '']
            .filter(Boolean)
            .join(' · ')}
        >
          <select
            name='nest-fabric-select'
            className={`${BOX} cursor-pointer appearance-none truncate pr-5 ${
              noSlotChosen ? 'text-error' : ''
            }`}
            disabled={busy}
            value={slotKey}
            onChange={(e) => chooseSource({ slotKey: e.target.value })}
          >
            <option value=''>not picked</option>
            {fabricLines.map((b) => (
              <option key={b.lineKey} value={b.lineKey}>
                {slotLabel(b)}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className='pointer-events-none absolute top-1/2 right-[7px] -translate-y-1/2 text-labelColor'
          >
            ▾
          </span>
        </div>
      }
    </div>
  );
  // Настройки раскладки одной строкой: «auto», пока всё по умолчанию, иначе только изменённое.
  const nestingShort =
    [
      gapCm !== NEST_DEFAULTS.gapCm && `gap ${gapCm}`,
      marginCm !== NEST_DEFAULTS.edgeMarginCm && `margin ${marginCm}`,
      allowanceTouched && `allowance ${allowanceMm} mm`,
      crossGrain !== NEST_DEFAULTS.allowCrossGrain && `rotate ${crossGrain ? 'on' : 'off'}`,
    ]
      .filter(Boolean)
      .join(' · ') || 'auto';
  const quizNesting = (
    <GenericPopover
      contentProps={{ align: 'end' }}
      triggerProps={{
        name: 'nest-lay',
        title: `gap ${gapCm} · margin ${marginCm} · allowance ${allowanceMm} mm · rotate ${crossGrain ? 'on' : 'off'}`,
        className: FACT_TRIGGER,
      }}
      openElement={(isOpen) => (
        <>
          <FactLabel error={!!doubleAllowanceRefusal}>nesting</FactLabel>
          <span className='min-w-0 truncate'>
            {nestingShort}
            <span aria-hidden className='text-labelColor'>
              {isOpen ? ' ▴' : ' ▾'}
            </span>
          </span>
        </>
      )}
    >
      <div id='nest-lay-panel' className='grid grid-cols-2 gap-x-2 gap-y-1.5 p-2'>
        <label className={`${FIELD} space-y-0.5`}>
          <Text size='micro' variant='label' component='span' className={BOX_LABEL}>
            gap cm
          </Text>
          <NumBox
            name='nest-gap'
            decimal
            value={gapCm}
            emptyAs={0}
            onCommit={(n) => {
              const next = Math.max(0, n);
              if (next !== gapCm) guardManual(() => setGapCm(next));
            }}
            disabled={busy}
          />
        </label>
        <label className={`${FIELD} space-y-0.5`}>
          <Text size='micro' variant='label' component='span' className={BOX_LABEL}>
            margin cm
          </Text>
          <NumBox
            name='nest-margin'
            decimal
            value={marginCm}
            emptyAs={0}
            onCommit={(n) => {
              const next = Math.max(0, n);
              if (next !== marginCm) guardManual(() => setMarginCm(next));
            }}
            disabled={busy}
          />
        </label>
        {/* Припуск на шов — ВХОД алгоритма: раздувает контур до линии кроя до укладки. */}
        <label
          className={`${FIELD} space-y-0.5`}
          title={
            [
              allowanceSourceText,
              !allowanceTouched && allowancePrefill ? `prefilled: ${allowancePrefill.why}` : '',
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        >
          <Text
            size='micro'
            variant={doubleAllowanceRefusal ? undefined : 'label'}
            component='span'
            className={doubleAllowanceRefusal ? `${BOX_LABEL} text-error` : BOX_LABEL}
          >
            allowance mm
          </Text>
          <NumBox
            name='nest-allowance'
            decimal
            value={allowanceMm}
            emptyAs={0}
            onCommit={(n) => {
              // Потолок (MAX_SEAM_ALLOWANCE_MM) живёт в contour-layer.ts рядом с предзаполнением.
              const next = clampSeamAllowanceMm(n);
              if (next !== allowanceMm) {
                // Флаг «ввели руками» — ВНУТРИ apply, как у ширины.
                guardManual(() => {
                  setAllowanceTouched(true);
                  setAllowanceMm(next);
                });
              }
            }}
            disabled={busy}
          />
        </label>
        <div className={`${FIELD} space-y-0.5`}>
          <Text size='micro' variant='label' component='span' className={BOX_LABEL}>
            rotate 90°
          </Text>
          {/* Переключатель той же коробкой, что и поля: нажатое состояние — заливка чернилом. */}
          <button
            type='button'
            id='nest-crossgrain'
            name='nest-crossgrain'
            aria-pressed={crossGrain}
            disabled={busy}
            onClick={() => guardManual(() => setCrossGrain(!crossGrain))}
            className={`${BOX} justify-center uppercase ${
              crossGrain ? 'border-textColor bg-textColor text-bgColor hover:opacity-80' : ''
            }`}
          >
            {crossGrain ? 'on' : 'off'}
          </button>
        </div>
      </div>
    </GenericPopover>
  );
  const quizCloth = (
    <label className={FACT_ROW} title={widthSource || 'cloth width'}>
      <FactLabel error={noSlotChosen}>cloth</FactLabel>
      <span className='flex items-center gap-1'>
        <NumBox
          name='nest-width'
          className={CELL_INPUT}
          decimal
          value={widthUnset ? null : widthCm}
          // Ширина уходит на blur: каждая промежуточная цифра («1», «14») иначе стирала бы
          // ручные правки и пересчитывала бы раскладку на ткани шириной в сантиметр.
          commitOnBlur
          onCommit={(n) => {
            const next = Math.max(10, n);
            // Флаг «ввели руками» ставится ВНУТРИ apply: отказ выбросить ручные правки
            // не должен молча выключать автоподстановку ширины по колорвею.
            if (next !== widthCm || widthUnset) {
              guardManual(() => {
                setWidthTouched(true);
                setWidthUnset(false);
                setWidthRaw(null);
                setWidthCm(next);
              });
            }
          }}
          disabled={busy}
        />
        cm
      </span>
    </label>
  );
  const piecesError = railS3.blockers.length > 0;
  const quizPieces = (
    <GenericPopover
      open={piecesOpen}
      onOpenChange={setPiecesOpen}
      className='w-[320px]'
      contentProps={{ align: 'end' }}
      triggerProps={{
        className: FACT_TRIGGER,
        disabled: parse.phase !== 'ready' || pieces.length === 0,
      }}
      openElement={(isOpen) => (
        <>
          <FactLabel error={piecesError}>pieces</FactLabel>
          <span className={piecesError ? 'text-error' : undefined}>
            {parse.phase === 'ready' ? `${checkedCount} / ${pieces.length}` : <EmptyCell />}
            <span aria-hidden className='text-labelColor'>
              {isOpen ? ' ▴' : ' ▾'}
            </span>
          </span>
        </>
      )}
    >
      <div className='max-h-[46vh] space-y-1 overflow-y-auto'>
        <div className='flex items-center justify-between gap-2'>
          <Text size='micro' variant='label' component='span'>
            {checkedCount}/{pieces.length}
            {instanceCount !== checkedCount ? ` · placements ${instanceCount}` : ''}
            {graded && ungradedCount > 0
              ? ` · ${ungradedAllUni ? 'UNI' : 'no size'} ${ungradedCount}`
              : ''}
          </Text>
          <button
            type='button'
            className='text-micro uppercase underline hover:opacity-70'
            disabled={busy}
            onClick={() =>
              guardManual(() => {
                // Слитно, а не заменой: замена стёрла бы выбор деталей других размеров.
                const next: PieceSel = { ...sel };
                for (const p of pieces) {
                  next[p.id] = {
                    checked: !!fitsWidth.get(p.id),
                    qty: sel[p.id]?.qty ?? 1,
                  };
                }
                setSel(next);
              })
            }
          >
            select all
          </button>
        </div>
        {pieces.map((p) => {
          const fits = fitsWidth.get(p.id) ?? false;
          const s = sel[p.id] ?? { checked: false, qty: 1 };
          return (
            <div key={p.id} className='flex items-center gap-1.5'>
              <CheckboxCommon
                name={`nest-piece-${p.id}`}
                checked={s.checked && fits}
                disabled={!fits || busy}
                onChange={(c: boolean) =>
                  guardManual(() => setSel((m) => ({ ...m, [p.id]: { ...s, checked: c } })))
                }
              />
              <PieceThumb piece={p} />
              <div className='min-w-0 flex-1'>
                <Text size='micro' component='p' className='truncate'>
                  {p.name}
                </Text>
                {/* Размер детали и её тираж в этом настиле: в списке лежат детали
                            нескольких размеров, у которых имена различаются одним хвостом. */}
                <Text size='nano' variant='label' component='p'>
                  {p.bboxW.toFixed(1)} × {p.bboxH.toFixed(1)} cm
                  {graded
                    ? // У помеченной детали размера нет ПО ЗАЯВЛЕНИЮ автора, и «без
                      // размера» читалось бы про неё как недостача.
                      ` · ${
                        split.codeById.get(p.id)?.size ||
                        (split.codeById.get(p.id)?.uni ? 'UNI' : 'no size')
                      } · ×${Math.max(1, Math.round(s.qty)) * (unitsOfPiece.get(p.id) ?? 0)}`
                    : ''}
                </Text>
              </div>
              {!fits && <Pill tone='warn'>too wide</Pill>}
              <Input
                name={`nest-qty-${p.id}`}
                type='number'
                value={s.qty}
                min={1}
                disabled={!fits || busy}
                className='w-12 shrink-0'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSel((m) => ({
                    ...m,
                    [p.id]: {
                      ...s,
                      qty: Math.max(1, Math.round(numOr(e.target.value, 1))),
                    },
                  }))
                }
              />
            </div>
          );
        })}
      </div>
    </GenericPopover>
  );
  return (
    <ConfirmationModal
      open={files != null || view != null}
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
      onConfirm={requestClose}
      title={
        viewData
          ? `marker · ${cleanMarkerTitle(view?.summary?.name ?? '')}`
          : [
              'marker',
              graded
                ? composition
                    .map((c) => `${sizeNameOfId(c.sizeId).toLowerCase()} ×${c.quantity}`)
                    .join(' ')
                : sizeLabel || (ungradedUnits > 1 ? `×${ungradedUnits}` : ''),
              titleFabric,
            ]
              .filter(Boolean)
              .join(' · ')
      }
      width='lg'
      hideActions
    >
      {quizOpen ? (
        <MarkerQuiz
          quiz={quiz}
          busy={busy}
          layMode={layMode}
          onLayMode={(m) => {
            if (m === layMode) quiz.afterSpread(m);
            else
              guardManual(() => {
                setLayMode(m);
                quiz.afterSpread(m);
              });
          }}
          tableCm={tableCm}
          tableWidthCm={tableWidthCm}
          stackLimitCm={stackLimitCm}
          onTableCm={setTableEdit}
          onTableWidthCm={setTableWidthEdit}
          onStackCm={(v) => {
            if (v !== stackLimitCm) guardManual(() => setStackEdit(v));
          }}
          onSaveTable={saveForWorkshop}
          savingTable={savingWorkshop}
          colourways={cwOptions.map((c) => ({ id: c.colorwayId, label: c.label }))}
          colourwayId={colorwayId}
          onColourway={(id) => chooseSource({ colorwayId: id })}
          rows={quizRows}
          onQty={(key, n) => guardManual(() => setQtyByToken((m) => ({ ...m, [key]: n })))}
          spreadMode={spreadMode}
          onSpreadMode={(m) => guardManual(() => setSpreadMode(m))}
          plies={plies}
          pliesAuto={pliesAuto}
          onPlies={(n) => guardManual(() => setPlies(n))}
          perPly={perPly}
          thicknessMm={thicknessMm}
          thicknessFromBom={bomThicknessMm != null}
          onThickness={setThicknessEdit}
          cutTotal={cutTotal}
          extraTotal={extraTotal}
          stackCm={layFigures.stackCm}
          stackOk={!layFigures.overStack}
          endLossCm={endLossCm}
          onEndLoss={setEndLossCm}
          clothWidthCm={clothRollCm}
          markerLengthCm={effective?.usedLengthCm ?? estLengthCm ?? 0}
          markerEstimate={!effective}
          cloth={quizCloth}
          pieces={quizPieces}
          nesting={quizNesting}
          fabricCm={layFigures.fabricCm}
          warnings={quizWarnings}
          extras={quizExtras}
          runDisabled={runBlocked}
          onRun={() => {
            markQuizDone();
            quiz.close();
            requestRun();
          }}
          onShowResult={effective ? quiz.close : undefined}
        />
      ) : (
        <QuizSummary
          facts={summaryFacts}
          onEdit={viewData ? undefined : () => quiz.open('run')}
          editDisabled={busy}
          aside={topWarnings.length > 0 ? <HeaderWarnings items={topWarnings} /> : undefined}
        />
      )}

      {/* Холст на всю ширину модалки. Готовая/сохранённая раскладка идёт через интерактивный
          редактор; потоковое превью GA остаётся дешёвым строковым SVG. */}
      {!quizOpen && (
        <div className='space-y-2'>
          <div className='relative'>
            {running && liveSvg ? (
              <div
                // Потоковое превью: ширина ткани = высота холста, длина — горизонтальный скролл.
                className='h-[60vh] min-h-[320px] w-full overflow-x-auto overflow-y-hidden border border-borderColor bg-bgColor [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-none'
                dangerouslySetInnerHTML={{ __html: liveSvg }}
              />
            ) : effective && !running ? (
              <LayoutEditor
                pieces={displayPieces}
                placements={effective.placements}
                widthCm={displayWidth}
                usedLengthCm={effective.usedLengthCm}
                targetCm={viewData && storedTableEnd ? undefined : displayTarget}
                tableEndCm={tableEndCm ?? undefined}
                marginCm={displayMargin}
                allowCrossGrain={displayCross}
                // НАСТОЯЩЕЕ направление ткани — и в режиме просмотра тоже.
                //
                // Здесь стояло 'unknown' для сохранённого маркера, «чтобы не перечёркивать снятое до
                // Ф1». Перечёркивать оно и не могло: rotsFor всегда оставляет ТЕКУЩИЙ поворот детали
                // в цикле, так что лежащие в блобе 180° никуда не деваются. Зато вместе с прежним
                // allowsFlip (где unknown разрешал переворот) оно ПРЕДЛАГАЛО оператору поставить
                // деталь на 180° на ворсовой ткани — и такая правка старого маркера УХОДИЛА В БАЗУ:
                // сервер милует строки с поколением политики младше 3, и поколение это остаётся
                // прежним, так что строка остаётся помилованной навсегда. То есть ровно там, где
                // помилование должно было защищать старые замеры, оно молча узаконивало новый брак.
                fabricDirection={effectiveDirection}
                editable={editingActive}
                violating={violatingIdx}
                focus={focusReq}
                onChange={(next) => setManual(next)}
                corner={downloadButton}
              />
            ) : (
              <div className='flex h-[40vh] items-center justify-center border border-borderColor bg-bgColor'>
                <Text size='micro' variant='label'>
                  {running ? (
                    'computing…'
                  ) : fitting ? (
                    `fitting to the table… attempt ${fitting.attempt}`
                  ) : (
                    <EmptyCell />
                  )}
                </Text>
              </div>
            )}
          </div>
          {running && (
            <Progress
              className='h-px'
              value={
                run.nfp
                  ? (run.nfp.done / Math.max(1, run.nfp.total)) * 100
                  : run.best
                    ? (run.best.elapsedMs / Math.max(1, budgetS * 1000)) * 100
                    : 0
              }
            />
          )}

          {(layFacts.length > 0 || effective) && (
            <FactList wide>
              {layFacts.map((f) => (
                <Fact key={f.label} label={f.label} error={f.error}>
                  {f.value}
                </Fact>
              ))}
              {effective && (
                <>
                  <Fact label='used'>
                    {effective.usedLengthCm.toFixed(1)} cm
                    {manual && <span className='text-labelColor'> · edited</span>}
                  </Fact>
                  <Fact label='efficiency'>{effPct.toFixed(1)} %</Fact>
                  <Fact label='placed' error={effective.placedCount !== effective.totalCount}>
                    {effective.placedCount} / {effective.totalCount}
                  </Fact>
                  <Fact label='cloth'>{displayWidth} cm</Fact>
                </>
              )}
              {effective && viewData && view?.summary && (
                // РАСХОД НА ИЗДЕЛИЕ ДЕЛИТСЯ НА ИЗДЕЛИЯ, А НЕ НА КОМПЛЕКТЫ. Здесь стояло
                // usedLength / max(1, sets), и на маркере с составом sets приезжает нулём
                // (proto3 роняет умолчание) — то есть весь настил показывался как норма одного
                // изделия. Смешанному составу число не показывается вовсе: у него нормы нет.
                // Причина ИЗ ОДНОГО СЛОВАРЯ (refusalWord): черновик, смешанный состав либо
                // нечитаемый состав — это три РАЗНЫХ отказа, и назвать один другим значит
                // отправить оператора чинить не то. Читается ТЕМ ЖЕ источником, что и сам
                // отказ, — сводкой строки.
                <Fact
                  label='per unit'
                  title={viewRefusal ? undefined : `garments: ${viewData.totalUnits || 1}`}
                >
                  {viewRefusal ? (
                    <>
                      —<span className='text-labelColor'> · {refusalWord(view.summary)}</span>
                    </>
                  ) : (
                    `${(effective.usedLengthCm / Math.max(1, viewData.totalUnits)).toFixed(1)} cm`
                  )}
                </Fact>
              )}
              {effective && verdict && (
                <Fact label='verdict' error={!verdict.ok} title={verdict.text}>
                  {verdict.ok ? 'fits' : 'does not fit'}
                </Fact>
              )}
              {effective && running && displayResult && (
                <Fact label='generation'>
                  {displayResult.generation}
                  <span className='text-labelColor'>
                    {' '}
                    · {(displayResult.elapsedMs / 1000).toFixed(1)} s
                  </span>
                </Fact>
              )}
            </FactList>
          )}

          {/* Одно главное действие: run → stop → save marker; остальное тихо рядом. */}
          <div className='flex flex-wrap items-center justify-end gap-3'>
            {manual && !running && (
              <Button type='button' variant='underline' onClick={() => setManual(null)}>
                reset edits
              </Button>
            )}
            {viewData && !viewDegraded && canEdit && !editView && (
              <Button type='button' variant='secondary' size='sm' onClick={() => setEditView(true)}>
                edit
              </Button>
            )}
            {viewData && editView && (
              <Button
                type='button'
                variant='main'
                size='sm'
                disabled={!canSaveView || saving}
                onClick={updateViewMarker}
              >
                {saving ? 'saving…' : 'save edits'}
              </Button>
            )}
            {!viewData &&
              (running ? (
                <Button type='button' variant='main' size='sm' disabled={stopping} onClick={stop}>
                  {stopping ? 'stopping…' : 'stop'}
                </Button>
              ) : fitting ? (
                <Button type='button' variant='main' size='sm' onClick={stopFit}>
                  stop
                </Button>
              ) : effective ? (
                <>
                  <Button
                    type='button'
                    variant='underline'
                    disabled={runBlocked}
                    onClick={requestRun}
                  >
                    run again
                  </Button>
                  <Button
                    type='button'
                    variant='main'
                    size='sm'
                    disabled={!canSave}
                    title={
                      !canSave
                        ? tableShortText || (onlyTerminal ? TERMINAL_SAVE_REASON : undefined)
                        : undefined
                    }
                    onClick={() => setSaveOpen(true)}
                  >
                    save marker
                  </Button>
                </>
              ) : (
                <Button
                  type='button'
                  variant='main'
                  size='sm'
                  disabled={runBlocked}
                  onClick={requestRun}
                >
                  run
                </Button>
              ))}
          </div>
        </div>
      )}

      {/* Save dialog: name + BOM fabric slot. Nested Radix dialogs portal independently. */}
      <ConfirmationModal
        open={saveOpen}
        onOpenChange={(o) => {
          if (!o && !saving) setSaveOpen(false);
        }}
        onConfirm={saveMarker}
        onCancel={() => {
          if (!saving) setSaveOpen(false);
        }}
        title='save marker'
        confirmLabel={saving ? 'saving…' : 'save'}
        confirmDisabled={saving || !nameValue.trim()}
        closeOnConfirm={false}
      >
        <div className='space-y-2'>
          <HeaderWarnings
            className='block text-right'
            items={[
              lockDangling ? 'bound fabric is no longer on the BOM' : '',
              lockedUnsaved ? 'fabric not saved on the card yet' : '',
              widthMismatch
                ? {
                    text: `width ${widthCm} cm differs from the article (${slotWidth} cm)`,
                    action:
                      viewData || slotWidth < 10
                        ? undefined
                        : { label: 'use article width', onClick: applyArticleWidth },
                  }
                : '',
              // Вторая дверь того же расхождения: неверна может быть и сама ширина артикула.
              widthMismatch && !viewData && widthArticleId
                ? { text: 'or the article width is wrong', action: openArticle(widthArticleId) }
                : '',
              slot && slotSelvedge(slot) === 0
                ? { text: 'selvedge not set on the article', action: openArticle(widthArticleId) }
                : '',
              ...(parse.phase === 'ready'
                ? parse.warnings
                    .filter((w) => !isHiddenNote(w))
                    .map((w) =>
                      isFetchFailure(w)
                        ? {
                            text: w,
                            error: true,
                            action: {
                              label: 'retry',
                              onClick: () => {
                                setSaveOpen(false);
                                guardManual(reparse);
                              },
                            },
                          }
                        : w,
                    )
                : []),
              manual && violations.length ? manualNote ?? '' : '',
              mixed ? 'mixed composition: no per-unit consumption' : '',
            ]}
          />
          <label className='block space-y-0.5'>
            <Text size='nano' variant='label' component='span'>
              name
            </Text>
            <Input
              name='marker-name'
              value={nameValue}
              maxLength={191}
              autoComplete='off'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setNameTouched(true);
                setMarkerName(e.target.value);
              }}
            />
          </label>
          {lockedSlot ? (
            <div className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                fabric
              </Text>
              <Text size='micro' component='p'>
                {slotLabel(lockedSlot)}
              </Text>
            </div>
          ) : (
            <label className='block space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                fabric
              </Text>
              <Selector
                label=''
                value={slotKey}
                options={[
                  { value: '', label: 'not picked' },
                  ...fabricLines.map((b) => ({ value: b.lineKey, label: slotLabel(b) })),
                ]}
                onChange={(v: string | number) => chooseSource({ slotKey: String(v) })}
              />
            </label>
          )}
          <Text size='nano' variant='label' component='p'>
            {graded
              ? compositionLabel(composition, (id) => sizeNameOfId(id))
              : sizeLabel || 'one size'}{' '}
            · {unitsTotal} garments · per unit:{' '}
            {mixed ? (
              <EmptyCell />
            ) : effective ? (
              `${(effective.usedLengthCm / Math.max(1, unitsTotal)).toFixed(1)} cm`
            ) : (
              <EmptyCell />
            )}
          </Text>
        </div>
      </ConfirmationModal>

      {/* Новый запуск сносит ручные правки — подтверждение, а не молчаливая потеря. */}
      <ConfirmationModal
        open={runConfirm}
        onOpenChange={(o) => {
          if (!o) setRunConfirm(false);
        }}
        onConfirm={startRun}
        onCancel={() => setRunConfirm(false)}
        title='run again?'
        confirmLabel='restart'
      >
        <Text size='micro' component='p'>
          manual edits will be lost
        </Text>
      </ConfirmationModal>

      {/* Закрытие и смена параметров тоже сносят правки — то же подтверждение. */}
      <ConfirmationModal
        open={wipeConfirm != null}
        onOpenChange={(o) => {
          if (!o) setWipeConfirm(null);
        }}
        onConfirm={() => {
          const pending = wipeConfirm;
          setWipeConfirm(null);
          setManual(null);
          pending?.apply();
        }}
        onCancel={() => setWipeConfirm(null)}
        title={wipeConfirm?.kind === 'close' ? 'close without saving?' : 'reset manual edits?'}
        confirmLabel={wipeConfirm?.kind === 'close' ? 'close' : 'reset'}
      >
        <Text size='micro' component='p'>
          manual edits will be lost
        </Text>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
