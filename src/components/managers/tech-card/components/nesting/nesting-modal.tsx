// Раскладка (nesting) modal: DXF выкройки одного размера → детали → авто-раскладка на
// полосе ткани в web worker'е. Расчётный инструмент, который теперь умеет ПЕРСИСТИТЬ
// результат: «сохранить раскладку» пишет маркер (tech_card_marker) с самодостаточной
// геометрией, и костинг читает расход на единицу. `view` открывает сохранённый маркер без
// воркера и без DXF. Файл лениво импортируется из patterns-field, так что
// dxf-parser/clipper2-js/воркер живут только в чанке раскладки.
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_TechCardMarker } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { extractFieldViolations } from 'utils/field-errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import type {
  FabricDirection,
  NestConfig,
  NestResult,
  Placement,
  PieceDTO,
  Unit,
} from 'lib/nesting/types';
import { NEST_DEFAULTS, allowsFlip } from 'lib/nesting/types';
import { checkLayout, measureLayout, type Violation } from 'lib/nesting/geom/clearance';
// БЮДЖЕТ ДО ЗАПУСКА (Ф2.3). Та же модель, что решает внутри движка, какой точности контуры он
// потянет: экран зовёт ровно её, а не свою копию.
import { estimateJob, estimateRun } from 'lib/nesting/nest/estimate';
import { renderLayoutDxf } from 'lib/nesting/render/dxf';
import { renderLayoutSvg } from 'lib/nesting/render/svg';
import { LayoutEditor } from './layout-editor';
import type { MarkerColorway } from './colorway-widths';
import {
  buildMarkerLayout,
  compositionLabel,
  compositionOf,
  dec,
  decNum,
  exportFileName,
  legacyPairOf,
  markerToView,
  scalarNormRefusal,
  type MarkerBomLine,
  type MarkerCompositionEntry,
} from './marker-io';
import { markerScopeLines, strictestDirection } from '../bom-purpose';
import {
  MAX_SEAM_ALLOWANCE_CM,
  blocksMissingOnLayer,
  clampSeamAllowance,
  defaultContourLayer,
  layerAllowanceLabel,
  layerOptions,
  seamAllowancePrefill,
  seamLineLayer,
} from './contour-layer';
import {
  allowanceLabel,
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
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { normBlock, splitBlockSize } from './block-code';
import { splitPiecesBySize, useDictionarySizeTokens } from './use-block-sizes';
import { useNesting, type NestingFile } from './use-nesting';

// Prior «ручная правка» notes are replaced, not stacked, on each re-save of a marker.
const MANUAL_NOTE_PREFIX = 'ручная правка:';

// Нарушение словами. У кромочного (otherIndex отсутствует) required — это отступ, и при
// отступе 0 «0.00 см < 0.00 см» звучало бы бессмыслицей: деталь просто вышла за полотно.
function violationText(v: Violation): string {
  if (v.otherIndex == null) {
    return v.required > 0
      ? `деталь за пределами полотна (отступ ${v.required.toFixed(2)} см)`
      : 'деталь за пределами полотна';
  }
  return `зазор ${v.clearance.toFixed(2)} см < ${v.required.toFixed(2)} см`;
}

type PieceSel = Record<number, { checked: boolean; qty: number }>;

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
  requiredSeamAllowanceCm,
  workshopDefaultSeamAllowanceCm,
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
  // «ТРЕБУЕМЫЙ ПРИПУСК» карточки, см (Ф3.2). Это ЭТАЛОН, а не факт: он предзаполняет поле, но
  // никогда не переписывает то, что оператор ввёл руками, и не участвует в отказах — сравнение
  // «не хуже» делает гейт готовности (Ф6), а не путь сохранения. `null`/не передано = карточка
  // эталона не задала, и подставлять ноль ЗАПРЕЩЕНО: ноль здесь — законная настройка («наши
  // выкройки несут линию кроя»), и спутать её с «не настроено» значит объявить каждую раскладку с
  // припуском нарушающей эталон, которого никто не задавал.
  requiredSeamAllowanceCm?: number | null;
  // Припуск цеха по умолчанию, см (admin.WorkshopSettings.default_seam_allowance_cm). Тот же
  // договор: `null` = не настроено, и это НЕ ноль.
  workshopDefaultSeamAllowanceCm?: number | null;
}) {
  // В РЕЖИМЕ ПРОСМОТРА ФАЙЛЫ НЕ РАЗБИРАЮТСЯ ЭТИМ ХУКОМ, и это не экономия, а устранение второго
  // разбора. С §7.5 вызывающий передаёт в `files` сегодняшние выкройки ткани — но нужны они
  // ПЕРЕСБОРКЕ (ниже), которая разбирает их с параметрами ИЗ БЛОБА (unit/tol/tolChain), а не
  // сегодняшними умолчаниями. Отдать те же файлы ещё и сюда значило бы скачать их дважды и
  // дважды разобрать в двух воркерах — ради `allPieces`, которых в этом режиме не читает никто:
  // геометрию даёт блоб, левая колонка скрыта, прогон недоступен.
  const { parse, run, start, stop, resetRun, unitOverride, setUnitOverride } = useNesting(
    view ? null : files,
  );
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
  const [targetCm, setTargetCm] = useState<number | ''>('');
  const [gapCm, setGapCm] = useState<number>(NEST_DEFAULTS.gapCm);
  const [marginCm, setMarginCm] = useState<number>(NEST_DEFAULTS.edgeMarginCm);
  // Припуск на шов: контур из DXF — линия ШВА, а кроят по линии КРОЯ. Это вход алгоритма, а не
  // подпись к результату (см. lib/nesting/geom/seam-allowance.ts).
  const [allowanceCm, setAllowanceCm] = useState<number>(NEST_DEFAULTS.seamAllowanceCm);
  const [crossGrain, setCrossGrain] = useState<boolean>(NEST_DEFAULTS.allowCrossGrain);
  const [budgetS, setBudgetS] = useState<number>(NEST_DEFAULTS.timeBudgetMs / 1000);
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
  // Считается ЗДЕСЬ, а не у вызывающего, по той же причине, по которой алиасы фильтруются ТАМ:
  // идентичность блока (имя без размерного хвоста) знает только тот, кто видит разбор — хвост
  // опознаётся по размерному ряду словаря, а не по имени. Вызывающий знает скоуп, эта модалка
  // знает файл; ключ собирается из двух половин ровно один раз.
  const pieceLineKeyById = useMemo(() => {
    // Алиас пишется под ИДЕНТИЧНОСТЬЮ блока (диалог сопоставления складывает туда имя без
    // размерного хвоста), но встречаются и старые записи, где размер остался в имени. Поэтому
    // индекс двухслойный: сначала имя как записано, следом — оно же, свёрнутое к идентичности.
    // Свёртка НИКОГДА не перекрывает прямое совпадение и снимается вовсе при неоднозначности:
    // «FP_L» и «FP_XL» сворачиваются в одно «FP», и подставить в блоб наугад одну из двух
    // деталей кроя хуже, чем оставить поле пустым — пустое читается как «неизвестно», а
    // неверное читается как ответ.
    // Неоднозначность ОТКАЗЫВАЕТ на обоих слоях, а не только на свёрнутом. Два алиаса,
    // привязанных к РАЗНЫМ строкам BOM одного назначения, — законная запись: карточка её прямо
    // разрешает и запрещает только противоречие внутри одного скоупа. Сюда же они приезжают
    // отфильтрованными по скоупу, то есть одинаковыми ключами с разными деталями кроя, и
    // «последний победил» подставил бы в блоб ту, что оказалась позже в массиве, — то есть
    // случайную. Пусто читается как «неизвестно», неверное читается как ответ.
    const byBlock = new Map<string, string | null>();
    const folded = new Map<string, string | null>();
    const put = (m: Map<string, string | null>, k: string, v: string) => {
      m.set(k, m.has(k) && m.get(k) !== v ? null : v);
    };
    for (const a of pieceAliases ?? []) {
      const raw = normBlock(a.blockName ?? '');
      const val = (a.pieceLineKey ?? '').trim();
      if (!raw || !val) continue;
      put(byBlock, raw.toLowerCase(), val);
      const ident = normBlock(splitBlockSize(raw, split.sizeTokenSet).identity).toLowerCase();
      if (!ident || ident === raw.toLowerCase()) continue;
      put(folded, ident, val);
    }
    const out = new Map<number, string>();
    if (byBlock.size === 0) return out;
    for (const p of allPieces) {
      const key = normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '').toLowerCase();
      if (!key) continue;
      // `null` — это «две детали спорят», и он ОБЯЗАН гасить ключ, а не проваливаться на
      // свёрнутый слой: ?? пропускает только undefined, поэтому спор на прямом слое не
      // подменяется догадкой со свёрнутого.
      const direct = byBlock.get(key);
      const val = (direct === undefined ? folded.get(key) : direct) ?? '';
      if (val) out.set(p.id, val);
    }
    return out;
  }, [pieceAliases, allPieces, split]);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
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
  const seamLayerPick = useMemo(() => seamLineLayer(layerOpts), [layerOpts]);
  const sizeOpts = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of allPieces) {
      if ((p.layer ?? '') !== contourLayer) continue;
      const s = split.codeById.get(p.id)?.size ?? '';
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    return [...seen.entries()]
      .map(([size, count]) => ({ size, count }))
      .sort(
        (a, b) => (split.orderOfSize.get(a.size) ?? 1e6) - (split.orderOfSize.get(b.size) ?? 1e6),
      );
  }, [allPieces, split, contourLayer]);
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
  const compRows = useMemo(
    () =>
      foldedRows.map((r) => ({
        ...r,
        label: r.tokens.join(' / '),
        qty: Math.max(0, Math.round(qtyByToken[r.key] ?? 0)),
      })),
    [foldedRows, qtyByToken],
  );
  const activeRows = useMemo(() => compRows.filter((r) => r.qty >= 1), [compRows]);
  // Файл без градации: одно число «изделий», размер даёт слот. Прежнее поведение целиком.
  const ungradedUnits = Math.max(1, Math.round(qtyByToken[''] ?? 1));
  const graded = compRows.length > 0;
  // Сколько ИЗДЕЛИЙ кроит настил — делитель расхода и множитель неградуируемых деталей.
  const unitsTotal = graded ? activeRows.reduce((s, r) => s + r.qty, 0) : ungradedUnits;
  // Количество — на КАЖДОЕ написание строки: свёрнутая строка «M / m» раздаёт свой тираж и
  // деталям с хвостом M, и деталям с хвостом m — это детали одного изделия.
  const unitsByToken = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of activeRows) for (const t of r.tokens) m.set(t, r.qty);
    return m;
  }, [activeRows]);
  // ФОРМУЛА БЛОБА, одна на весь экран: экземпляров детали = qty × (размер детали в составе ?
  // количество этого размера : всего изделий). Деталь без размерного хвоста кроится на каждое
  // изделие состава — потому и умножается на итог, а не на чью-то отдельную строку.
  const unitsOfPiece = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of allPieces) {
      const tok = split.codeById.get(p.id)?.size ?? '';
      m.set(p.id, tok === '' ? unitsTotal : unitsByToken.get(tok) ?? 0);
    }
    return m;
  }, [allPieces, split, unitsTotal, unitsByToken]);
  // В раскладку идут детали ВСЕХ размеров состава плюс неградуируемые. Размер с количеством 0 —
  // это «не кроим», и его детали не попадают ни в поиск, ни в блоб.
  const selectedPieces = useMemo(
    () =>
      allPieces.filter(
        (p) => (p.layer ?? '') === contourLayer && (unitsOfPiece.get(p.id) ?? 0) >= 1,
      ),
    [allPieces, contourLayer, unitsOfPiece],
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
  const [grainPick, setGrainPick] = useState<string | null>(null);
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
    () => applySeamAllowance(oriented.pieces, allowanceCm),
    [oriented, allowanceCm],
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
  const contourIsCutLine =
    contourMeasure?.verdict === 'cut' && (contourMeasure.allowanceCm ?? 0) > 0;
  const doubleAllowanceRefusal =
    !viewData && contourIsCutLine && allowanceCm > 0 && contourMeasure
      ? `слой ${contourMeasure.layer || '—'} — это ЛИНИЯ КРОЯ: замерено, что он лежит на ${(contourMeasure.allowanceCm ?? 0).toFixed(2)} см снаружи линии шва (совпало на ${contourMeasure.stats.accepted} блоках). Раскладка добавит ещё ${allowanceCm.toFixed(2)} см офсета — припуск будет посчитан ДВАЖДЫ, и длина завышена примерно на ${allowanceCm.toFixed(2)} см по периметру каждой детали. Выходов два: поставить припуск 0 (контур уже с припуском) либо ${
          seamLayerPick
            ? `выбрать контурный слой ${seamLayerPick} — на нём замерена линия шва`
            : 'выбрать контурный слой с линией шва'
        }.`
      : null;
  // УЛИК НЕТ — И ЭТО НЕ ПОВОД ЗАПРЕЩАТЬ (§5.4). Улики отсутствуют ЗАКОНОМЕРНО: у блока один
  // замкнутый контур, второй контур пересекает первый, блоков меньше трёх. Такая раскладка
  // сохраняется, `contour_allowance_cm` уезжает NULL, и маркер честно помечен «припуск не
  // подтверждён файлом» — а не «двойной припуск».
  const allowanceUnconfirmed =
    !viewData && parse.phase === 'ready' && allowanceCm > 0 && contourMeasure?.verdict === 'unknown';

  // ПРЕДЗАПОЛНЕНИЕ ПОЛЯ «ПРИПУСК» (§5.5). Порядок источников НЕ ПЕРЕСТАВЛЯТЬ, и последний из них —
  // не эталон, а признание: `NEST_DEFAULTS.seamAllowanceCm` перестал быть источником истины и
  // остался последним фолбэком, у которого в подписи так и сказано, что его никто не задавал.
  const [allowanceTouched, setAllowanceTouched] = useState(false);
  const allowancePrefill = useMemo(() => {
    // Пока файл не разобран, подставлять нечего: замера ещё нет, а без него порядок §5.5 отвечал
    // бы эталоном на вопрос, на который сперва обязан ответить файл.
    if (viewData || parse.phase !== 'ready') return null;
    return seamAllowancePrefill({
      measured: contourMeasure,
      cardRequiredCm: requiredSeamAllowanceCm,
      workshopDefaultCm: workshopDefaultSeamAllowanceCm,
      fallbackCm: NEST_DEFAULTS.seamAllowanceCm,
    });
  }, [
    viewData,
    parse.phase,
    contourMeasure,
    requiredSeamAllowanceCm,
    workshopDefaultSeamAllowanceCm,
  ]);
  useEffect(() => {
    // Введённое руками не перебивается НИКОГДА — ровно как ширина полотна рядом. Свой номер
    // оператор ставит осознанно, и подставить поверх него «правильный» значит спорить с
    // единственным участником, который держал в руках лекало.
    if (!allowancePrefill || allowanceTouched) return;
    setAllowanceCm((prev) => (prev === allowancePrefill.value ? prev : allowancePrefill.value));
  }, [allowancePrefill, allowanceTouched]);
  // Подпись под полем: КАКОЙ факт про выбранный контур мы знаем. Три ветки, и ни одна не имеет
  // права звучать как «ноль»: «не измерено» — это отсутствие улик, а не измеренное отсутствие
  // припуска.
  const allowanceSourceText = (() => {
    const m = contourMeasure;
    if (!m || parse.phase !== 'ready') return 'контур DXF — линия шва; кладётся линия кроя';
    if (m.verdict === 'cut') {
      return `слой ${m.layer}: ЛИНИЯ КРОЯ — припуск ${(m.allowanceCm ?? 0).toFixed(2)} см уже в контуре (замерено на ${m.stats.accepted} блоках)`;
    }
    if (m.verdict === 'seam') {
      return `слой ${m.layer}: линия шва — линия кроя нарисована в ${(m.gapCm ?? 0).toFixed(2)} см снаружи (замерено на ${m.stats.accepted} блоках)`;
    }
    return `крой или шов — по файлу не определить: ${allowanceUnknownText(m)}`;
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
    contourLayer,
    grainLayer,
    allowanceCm,
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
  const drawingBlocked = viewData != null && (drawing.phase === 'error' || drawing.phase === 'running');
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
        : pieces;
  const displayResult = viewData ? viewData.result : result;
  const displayWidth = viewData ? viewData.widthCm : widthCm;
  const displayTarget = viewData ? viewData.targetCm : target;
  // Validation parameters follow the layout's own params in view mode.
  const displayGap = viewData ? decNum(view?.summary?.gapCm) : gapCm;
  const displayMargin = viewData ? decNum(view?.summary?.edgeMarginCm) : marginCm;
  const displayCross = viewData ? !!view?.summary?.allowCrossGrain : crossGrain;

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
    });
  }, [effective, running, displayPieces, displayWidth, displayGap, displayMargin]);
  const violatingIdx = useMemo(() => new Set(violations.map((v) => v.index)), [violations]);
  const worstViolation = violations.length
    ? violations.reduce((a, b) => (a.clearance <= b.clearance ? a : b))
    : null;
  const manualNote =
    manual && violations.length && worstViolation
      ? `${MANUAL_NOTE_PREFIX} ${violations.length} нарушений (худшее — ${violationText(worstViolation)})`
      : null;
  // Overlapping by hand shrinks the used length, so the naive ratio can exceed 100% —
  // and efficiency_pct is a 0..100 column. Clamp once, use everywhere.
  const effPct = effective ? Math.min(100, effective.efficiency * 100) : 0;

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
  const unplaced = !running ? displayResult?.unplaced ?? [] : [];
  const unplacedText = useMemo(() => {
    if (unplaced.length === 0) return '';
    const nameOf = (id: number) => displayPieces.find((p) => p.id === id)?.name || `деталь ${id}`;
    const byReason = new Map<string, Set<string>>();
    for (const u of unplaced) {
      const set = byReason.get(u.reason) ?? new Set<string>();
      set.add(nameOf(u.pieceId));
      byReason.set(u.reason, set);
    }
    const word: Record<string, string> = {
      width: 'шире полосы ни в одном повороте',
      'no-space': 'не нашлось места на полосе',
      missing: 'детали нет в разобранных файлах',
      // Зеркало заказано, а ткань его не терпит. Слово тут — не украшение: без него панель
      // печатала сырой токен «mirror», и оператор видел причину, по которой ничего сделать
      // нельзя. Действий ровно два, и оба названы.
      // Какой ИМЕННО факт запретил переворот — ворс или непроставленное направление — называет
      // предупреждение движка (nest/index.ts), оно показывается рядом и точнее этой строки.
      // Здесь достаточно сказать, что делать: оба случая чинятся на вкладке BOM.
      mirror:
        'ткань переворота не допускает — зеркальный экземпляр класть нечем: проставьте или исправьте направление у строки ткани на вкладке BOM (парные детали на ворсе кроят в два слоя лицом к лицу — это другой маркер)',
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

  // Source-file groups for the per-fabric one-click filter (each fabric is its own DXF).
  const sources = useMemo(() => {
    const m = new Map<string, PieceDTO[]>();
    for (const p of pieces) {
      if (!m.has(p.source)) m.set(p.source, []);
      m.get(p.source)!.push(p);
    }
    return [...m.entries()];
  }, [pieces]);

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
    a.download = exportFileName([...fileParts(), ...(extra ?? [])], ext);
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
    if (s && !viewDegraded && !running && !drawingBlocked) download(s, 'image/svg+xml', 'svg');
  };
  // Plotter export: R12 DXF of the finished layout, true contours, cm — the EFFECTIVE
  // placements, so a hand-adjusted marker cuts exactly what the operator sees.
  const dxfReady = (viewData != null && !viewDegraded && !drawingBlocked) || run.phase === 'done';
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
      'только контур',
    ]);
  };

  const verdict =
    effective && displayTarget != null
      ? effective.usedLengthCm <= displayTarget && effective.placedCount === effective.totalCount
        ? {
            ok: true,
            text: `влезает · запас ${(displayTarget - effective.usedLengthCm).toFixed(1)} см`,
          }
        : { ok: false, text: `не влезает · нужно ${effective.usedLengthCm.toFixed(1)} см` }
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
  const [colorwayId, setColorwayId] = useState<number>(0);

  // A slot added in the UI but never saved (id 0) cannot be linked — the server resolves
  // bom_line_key against SAVED rows and would reject the whole marker after a paid nest.
  const fabricLines = (bomLines ?? []).filter((b) => b.id > 0);
  const cwOptions = colorways ?? [];
  const chosenColorway = cwOptions.find((c) => c.colorwayId === colorwayId);
  // Роль + артикул. Роль обязательна: раскладка привязывается к любой рулонной строке, поэтому
  // «Cupro 90» может стоять и подкладкой, и карманкой, и по имени они неразличимы — а именно этот
  // список решает, на какую строку BOM ляжет измеренный расход.
  const slotLabel = (b: MarkerBomLine) =>
    [b.role, b.name?.trim() || 'без названия'].filter(Boolean).join(' · ') +
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
      : sizeLabel || (ungradedUnits > 1 ? `${ungradedUnits} изд.` : ''),
    (slot ? [slot.role, slot.name?.trim()].filter(Boolean).join(' ') : '') || 'раскладка',
    chosenColorway?.label ?? '',
    `${widthCm} см`,
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
  const slotCutWidth = (b?: MarkerBomLine): number => {
    if (!b) return NaN;
    const pin = chosenColorway?.widthByLine.get(b.lineKey);
    if (pin && Number.isFinite(pin.cutCm)) return pin.cutCm;
    const roll = parseDecimalNumber(b.effectiveFabricWidthCm || b.fabricWidth);
    if (!Number.isFinite(roll) || roll <= 0) return NaN;
    const sel = parseDecimalNumber(b.selvedgeCm);
    const cut = roll - 2 * (Number.isFinite(sel) && sel > 0 ? sel : 0);
    return cut > 0 ? cut : NaN;
  };
  const slotSelvedge = (b?: MarkerBomLine): number => {
    const pin = b ? chosenColorway?.widthByLine.get(b.lineKey) : undefined;
    if (pin && Number.isFinite(pin.cutCm)) return pin.selvedgeCm;
    const s = b ? parseDecimalNumber(b.selvedgeCm) : NaN;
    return Number.isFinite(s) && s > 0 ? s : 0;
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
      return sv > 0 ? `рулон ${roll} − кромка 2×${sv}` : `рулон ${roll}, кромка не задана`;
    };
    if (fabricLines.length === 1) return describe(fabricLines[0]);
    const each = fabricLines
      .map((b) => {
        const cut = slotCutWidth(b);
        const name = [b.role, b.name?.trim()].filter(Boolean).join(' ') || 'материал';
        return Number.isFinite(cut) ? `${name} ${Math.round(cut * 10) / 10}` : '';
      })
      .filter(Boolean);
    return each.length ? `раскрой по слотам, см: ${each.join(' · ')}` : '';
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
        })),
      fabricWidthCm: widthCm,
      targetLengthCm: target,
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
      seamAllowanceCm: allowanceCm,
      timeBudgetMs: budgetS * 1000,
      rdpEpsCm: NEST_DEFAULTS.rdpEpsCm,
    }),
    [
      pieces,
      sel,
      fitsWidth,
      unitsOfPiece,
      widthCm,
      target,
      gapCm,
      marginCm,
      crossGrain,
      effectiveDirection,
      grainLayer,
      allowanceCm,
      budgetS,
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
  const startRun = () => {
    if (parse.phase !== 'ready') return;
    setManual(null);
    setRunConfirm(false);
    setSaveError(null);
    start(parse.parseId, runConfig);
  };

  // Какой именно артикул подставил колорвей — иначе «ширина взялась откуда-то» и проверить нечем.
  const pinArticle = (() => {
    const key = lockedSlot?.lineKey || slotKey;
    const pin = key ? chosenColorway?.widthByLine.get(key) : undefined;
    if (!pin || !Number.isFinite(pin.cutCm)) return '';
    return `${pin.articleName || 'без названия'} · раскрой ${pin.cutCm} см`;
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
  useEffect(() => {
    if (viewData || widthTouched) return;
    const src =
      resolvedSlot ??
      (lockedUnsaved ? (bomLines ?? []).find((b) => b.lineKey === lockedBomLineKey) : undefined);
    if (!src) return;
    const w = slotCutWidth(src);
    if (!Number.isFinite(w) || w < 10) return;
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
  const fetchFailed =
    parse.phase === 'ready' && parse.warnings.some((w) => w.includes('не удалось скачать'));
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
        ? 'раскладка кладёт деталь вверх ногами (180° или зеркало), а направление ткани у выбранного слота не проставлено — сервер такую норму не примет: проставьте направление у строки ткани на вкладке BOM либо пересоберите раскладку без переворотов'
        : 'раскладка кладёт деталь вверх ногами (180° или зеркало), а выбранная ткань помечена one-way — на ворсовой так класть нельзя: смените слот, пересоберите раскладку без переворотов либо исправьте направление ткани, если она на самом деле не ворсовая'
      : null;
  const canSave =
    !viewData &&
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
    !sizeUnsaved &&
    !sizeUnresolved &&
    sizesWithoutPieces.length === 0 &&
    composition.length > 0 &&
    composition.length <= MAX_MARKER_COMPOSITION_SIZES &&
    run.phase === 'done' &&
    run.result.placedCount === run.result.totalCount &&
    run.result.placements.length > 0 &&
    !!techCardId;

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
    if (!effective) return;
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
      for (const p of pieces) {
        const s = sel[p.id];
        if (s?.checked) perSetQty.set(p.id, Math.max(1, Math.round(s.qty)));
      }
      const urlBySource = new Map((files ?? []).map((f) => [f.name, f.url]));
      // The EFFECTIVE layout is saved: hand-adjusted placements, re-measured length, and an
      // explicit warning when the operator accepted clearance violations (cutter's call —
      // never blocked, always on the record).
      const layout = buildMarkerLayout({
        pieces,
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
            allowanceCm > 0
              ? `припуск на шов: ${allowanceCm.toFixed(2)} см — сохранён контур КРОЯ, линия шва лежит на отдельном слое SEAM. ДОПУЩЕНИЕ: припуск взят ровным по всему контуру, тогда как по низу изделия он обычно шире`
              : 'припуск на шов: 0 — раскладывалась ЛИНИЯ ШВА, расход занижен относительно кроя',
            ...(manualNote ? [manualNote] : []),
          ],
        },
        unit: unitOverride === 'auto' ? parse.detectedUnit : unitOverride,
        config: {
          targetLengthCm: target,
          // The eps the run ACTUALLY used, not the one it asked for. The engine raises it when
          // the job is too big to precompute at the requested fidelity (Ф0), and storing the
          // request would make params.rdpEpsCm a lie — read by exactly the person trying to
          // reproduce this marker, who would reproduce a different one.
          rdpEpsCm: effective?.telemetry?.rdpEpsCm ?? NEST_DEFAULTS.rdpEpsCm,
          timeBudgetMs: budgetS * 1000,
        },
        tol: NEST_DEFAULTS.tol,
        tolChain: NEST_DEFAULTS.tolChain,
        parseWarnings: parse.warnings,
        // Состав и размеры деталей. buildMarkerLayout сам решает, писать ли их в блоб: на
        // однородной раскладке состав выражается легаси-парой ниже, и блоб остаётся байт в байт
        // прежним — иначе каждый пересохранённый старый маркер «дрожал» бы без единого отличия.
        composition,
        sizeIdByPieceId,
      });
      await adminService.SaveTechCardMarker({
        id: 0,
        techCardId,
        marker: {
          // ЛЕГАСИ-ПАРА ИЛИ СОСТАВ — ровно одно из двух, и это правило сервера
          // (dto.markerCompositionOfInsert), а не вкусовщина: состав приезжает ТОЛЬКО блобом,
          // отдельного поля на вставке нет намеренно — две копии на проводе подняли бы вопрос
          // «какая победит, если они разойдутся», у которого нет бесплатного ответа.
          //
          // Смешанная раскладка шлёт нули: сервер увидит состав в блобе и запишет size_id/sets
          // как NULL. Однородная шлёт пару — и сохраняется ровно так же, как до Ф2. Решение
          // живёт в legacyPairOf (marker-io), а не выражением здесь, — чтобы его проверял зонд.
          sizeId: legacyPairOf(composition).sizeId,
          name,
          source: manual ? 'manual' : 'auto',
          bomLineKey: slotKey,
          // Колорвей, под чей артикул мерялась раскладка (0264). 0 = общая. Без него две
          // раскладки одного слота на разных ширинах неразличимы, и «применить маркер» в рецепте
          // предложит длину, снятую на чужом полотне.
          colorwayId,
          fabricWidthCm: dec(widthCm),
          gapCm: dec(gapCm),
          edgeMarginCm: dec(marginCm),
          // Снимок кромки эффективного артикула на момент сохранения: разложение отходов
          // (кромка / межлекальные выпады) должно оставаться проверяемым и после того, как
          // материал слота отредактируют.
          selvedgeCm: dec(slotSelvedge(slot)),
          allowCrossGrain: crossGrain,
          // ПРИПУСК, КОТОРЫМ РАЗДУВАЛИ КОНТУРЫ ЭТОГО ПРОГОНА. Это вход алгоритма, а не подпись:
          // длина снята по линии кроя, и без числа её не воспроизвести.
          seamAllowanceCm: dec(allowanceCm),
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
          contourAllowanceCm:
            contourMeasure && contourMeasure.allowanceCm != null
              ? dec(contourMeasure.allowanceCm)
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
          allowFlip: allowsFlip(effectiveDirection),
          sets: legacyPairOf(composition).sets,
          usedLengthCm: dec(effective.usedLengthCm),
          efficiencyPct: dec(effPct),
          placedCount: effective.placedCount,
          totalCount: effective.totalCount,
          layout,
        },
      });
      showMessage('маркер сохранён — расход виден в костинге', 'success');
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
      const msg = failMessage(e, 'не удалось сохранить маркер');
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
      const keptWarnings = (view.layout?.warnings ?? []).filter(
        (w) => !w.startsWith(MANUAL_NOTE_PREFIX),
      );
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
          seamAllowanceCm: s.seamAllowanceCm,
          contourAllowanceCm: s.contourAllowanceCm,
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
          },
        },
      });
      showMessage('правки маркера сохранены', 'success');
      qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      qc.invalidateQueries({ queryKey: techCardKeys.lists() });
      onClose();
    } catch (e) {
      const msg = failMessage(e, 'не удалось сохранить правки');
      setSaveError(msg);
      showMessage(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfirmationModal
      open={files != null || view != null}
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
      onConfirm={requestClose}
      title={
        viewData
          ? `маркер — ${view?.summary?.name ?? ''}`
          : `раскладка DXF${sizeLabel ? ` — ${sizeLabel}` : ''}`
      }
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-2.5 lg:flex-row'>
        {/* Left rail: material + run parameters, then the recognized piece list.
            A stored marker has nothing to configure — the rail collapses to its piece list. */}
        <div className={viewData ? 'hidden' : 'w-full shrink-0 space-y-2.5 lg:w-[300px]'}>
          {/* ИЗ ЧЕГО КРОИМ — до параметров прогона, потому что от этой пары берётся ширина, а
              ширина есть вход алгоритма. Колорвей называет артикул, слот называет роль; вместе они
              дают полотно, на котором раскладка меряется. */}
          {(cwOptions.length > 0 || fabricLines.length > 0) && (
            <div className='space-y-1.5 border border-hairline p-1.5'>
              {cwOptions.length > 0 && (
                <label className='block space-y-0.5'>
                  <Text size='nano' variant='label' component='span'>
                    колорвей — чей артикул кроим
                  </Text>
                  <Selector
                    label=''
                    value={String(colorwayId)}
                    options={[
                      { value: '0', label: 'общая — ширина у всех одинаковая' },
                      ...cwOptions.map((c) => ({
                        value: String(c.colorwayId),
                        label: c.label,
                      })),
                    ]}
                    onChange={(v: string | number) => setColorwayId(Number(v) || 0)}
                  />
                </label>
              )}
              {!lockedSlot && fabricLines.length > 0 && (
                <label className='block space-y-0.5'>
                  <Text size='nano' variant='label' component='span'>
                    ткань — куда пойдёт расход
                  </Text>
                  <Selector
                    label=''
                    value={slotKey}
                    options={[
                      { value: '', label: 'не выбрана' },
                      ...fabricLines.map((b) => ({ value: b.lineKey, label: slotLabel(b) })),
                    ]}
                    onChange={(v: string | number) => setSlotKey(String(v))}
                  />
                </label>
              )}
              {lockedSlot && (
                <Text size='nano' variant='label' component='p'>
                  ткань: {slotLabel(lockedSlot)} — из привязки DXF
                </Text>
              )}
              {pinArticle && (
                <Text size='nano' variant='label' component='p'>
                  артикул колорвея: {pinArticle}
                </Text>
              )}
              {noSlotChosen && (
                <Text size='nano' component='p' className='text-error'>
                  выберите ткань — иначе маркер сохранится без привязки и расход не попадёт в
                  костинг
                </Text>
              )}
              {colorwayNoPin && (
                <Text size='nano' component='p' className='text-error'>
                  колорвей «{chosenColorway?.label}» не назначил артикул на эту ткань — ширина взята
                  по умолчанию у строки BOM, и раскладка не будет описывать его полотно
                </Text>
              )}
            </div>
          )}
          <div className='grid grid-cols-2 gap-1.5'>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                ширина раскроя, см
              </Text>
              <Input
                name='nest-width'
                type='number'
                value={widthRaw ?? String(widthCm)}
                min={10}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWidthRaw(e.target.value)}
                onBlur={() => {
                  const next = Math.max(10, numOr(widthRaw ?? '', widthCm));
                  setWidthRaw(null);
                  // Флаг «ввели руками» ставится ВНУТРИ apply: если оператор откажется выбрасывать
                  // ручные правки, ширина не изменилась — и считать её введённой руками нельзя,
                  // иначе автоподстановка по колорвею молча выключится навсегда.
                  if (next !== widthCm) {
                    guardManual(() => {
                      setWidthTouched(true);
                      setWidthCm(next);
                    });
                  }
                }}
                disabled={running}
              />
              {widthSource && (
                <Text size='nano' variant='label' component='span'>
                  {widthSource}
                </Text>
              )}
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                целевая длина, см
              </Text>
              <Input
                name='nest-target'
                type='number'
                value={targetCm}
                placeholder='без цели'
                min={0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.trim();
                  setTargetCm(v === '' ? '' : Math.max(0, numOr(v, 0)));
                }}
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                зазор, см
              </Text>
              <Input
                name='nest-gap'
                type='number'
                value={gapCm}
                min={0}
                step={0.1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const next = Math.max(0, numOr(e.target.value, gapCm));
                  if (next !== gapCm) guardManual(() => setGapCm(next));
                }}
                disabled={running}
              />
            </label>
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                отступ от кромки, см
              </Text>
              <Input
                name='nest-margin'
                type='number'
                value={marginCm}
                min={0}
                step={0.5}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const next = Math.max(0, numOr(e.target.value, marginCm));
                  if (next !== marginCm) guardManual(() => setMarginCm(next));
                }}
                disabled={running}
              />
            </label>
            {/* Припуск на шов — ВХОД алгоритма, а не подпись к результату: он раздувает контур
                до линии кроя ещё до укладки, поэтому и длина, и SVG, и плоттерный DXF описывают
                то, что цех действительно вырежет. */}
            <label className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                припуск на шов, см
              </Text>
              <Input
                name='nest-allowance'
                type='number'
                value={allowanceCm}
                min={0}
                max={MAX_SEAM_ALLOWANCE_CM}
                step={0.1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  // Потолок 10 см — не физика, а защита от промаха по точке: «11» вместо «1.1»
                  // даёт совершенно правдоподобный маркер, просто вчетверо длиннее, и заметить
                  // это можно только по счёту от поставщика. Число живёт в contour-layer.ts, где
                  // его применяет и предзаполнение: два потолка на одно поле однажды разойдутся.
                  const next = clampSeamAllowance(numOr(e.target.value, allowanceCm));
                  if (next !== allowanceCm) {
                    // Флаг «ввели руками» ставится ВНУТРИ apply — ровно как у ширины: если
                    // оператор откажется выбрасывать ручные правки, припуск не изменился, и
                    // считать его введённым руками нельзя, иначе предзаполнение по замеру и по
                    // эталону карточки молча выключится навсегда.
                    guardManual(() => {
                      setAllowanceTouched(true);
                      setAllowanceCm(next);
                    });
                  }
                }}
                disabled={running}
              />
              {/* ЧТО ЛЕЖИТ НА ВЫБРАННОМ СЛОЕ — замером, а не утверждением. Здесь стояло «контур
                  DXF — линия шва; кладётся линия кроя», и это правда ровно до тех пор, пока слой
                  выбран правильно: на файле с четырьмя контурными слоями та же строка спокойно
                  стоит над линией КРОЯ и подтверждает оператору, что офсет нужен. */}
              <Text size='nano' variant='label' component='span'>
                {allowanceSourceText}
              </Text>
              {!allowanceTouched && allowancePrefill && (
                <Text size='nano' variant='label' component='span'>
                  подставлено: {allowancePrefill.why}
                </Text>
              )}
            </label>
            {/* Поле «комплектов» жило здесь и умело выразить только N одинаковых изделий одного
                размера. Его заменила таблица состава ниже — там же, где выбирается, что кроим. */}
          </div>

          {/* Допущение проговаривается вслух: число одно на весь комплект и кладётся РОВНЫМ по
              всему контуру, а настоящий подгиб низа шире. Молчаливое допущение здесь стоило бы
              метров ткани, а увидеть его на картинке нельзя. */}
          {allowanceCm > 0 ? (
            <CalloutBox tone='note'>
              <Text size='nano' component='p'>
                припуск {allowanceCm.toFixed(2)} см отложен РОВНО по всему контуру каждой детали и
                одинаков для всего комплекта. Подгиб низа в жизни шире, горловина уже — раскладка
                этого не знает. Линия шва остаётся нарисованной внутри линии кроя.
              </Text>
              {/* ЧЕСТНАЯ ВЕТКА «УЛИК НЕТ» (§5.4). Замер не удался — и это законно, а не
                  недосмотр: у блока один замкнутый контур, второй контур пересекает первый,
                  принятых блоков меньше трёх. Сохранение не блокируется, но и молчать нельзя:
                  маркер уедет с contour_allowance_cm = NULL, то есть «припуск не подтверждён
                  файлом», и гейт готовности прочитает это как непроверенное происхождение
                  факта — не как двойной припуск. */}
              {allowanceUnconfirmed && (
                <Text size='nano' component='p'>
                  по файлу НЕ ПОДТВЕРЖДЕНО, что в контуре припуска нет: {''}
                  {contourMeasure ? allowanceUnknownText(contourMeasure) : ''}. Раскладка считается,
                  маркер сохраняется — он будет помечен «припуск не подтверждён файлом».
                </Text>
              )}
            </CalloutBox>
          ) : contourIsCutLine ? (
            // Ноль ЗДЕСЬ ПРАВИЛЬНЫЙ, и прежний безусловный красный текст ниже утверждал обратное.
            // На слое с линией кроя припуск уже в контуре: добавить его значит посчитать дважды.
            <CalloutBox tone='note'>
              <Text size='nano' component='p'>
                припуск 0 — и это верно для выбранного слоя: на нём ЛИНИЯ КРОЯ, припуск{' '}
                {(contourMeasure?.allowanceCm ?? 0).toFixed(2)} см уже заложен в контур. Раскладка
                кладёт его как есть.
              </Text>
            </CalloutBox>
          ) : (
            <CalloutBox tone='error'>
              <Text size='nano' component='p'>
                припуск 0 — раскладывается ЛИНИЯ ШВА, а цех кроит шире. Расход будет занижен.
              </Text>
            </CalloutBox>
          )}
          {seam.hulled.length > 0 && (
            <Text size='nano' component='p' className='text-error'>
              контур с дефектом у {seam.hulled.length} деталей — припуск посчитан по выпуклой
              оболочке (с запасом): {seam.hulled.slice(0, 6).join(', ')}
              {seam.hulled.length > 6 ? '…' : ''}
            </Text>
          )}

          {/* НАПРАВЛЕНИЕ ТКАНИ. Не настройка раскладки, а факт про полотно — поэтому показывается,
              а не спрашивается: правится оно на вкладке BOM, у строки материала. Единственное, что
              оно решает здесь, — переворот детали на 180°: на ворсовой ткани перевёрнутая деталь
              ложится ворсом против соседки, и готовое изделие выходит двухцветным под лампами.
              Заметить это на раскладке нечем — контур перевёрнутой детали выглядит ровно так же. */}
          {!viewData && (
            <Text size='nano' variant='label' component='p'>
              направление ткани:{' '}
              {effectiveDirection === 'one_way'
                ? 'ворсовая (one-way) — переворот на 180° запрещён'
                : effectiveDirection === 'two_way'
                  ? 'two-way — переворот разрешён'
                  : effectiveDirection === 'any'
                    ? 'без ворса — переворот разрешён'
                    : 'НЕ ЗАДАНО'}
              {/* Прежний текст здесь обещал безусловный отказ: «сохранить нельзя, пока направление
                  не проставлено». Сервер строже НЕ настолько — он отказывает только раскладке,
                  которая реально кладёт деталь вверх ногами (180° или зеркало), а раскладку без
                  переворотов принимает при любом направлении, включая непроставленное. Обещание
                  отказа, которого не будет, стоит того же, что и умолчание о настоящем: оператор
                  перестаёт верить плашке. Поэтому теперь тут сказано, что делает КЛИЕНТ — он
                  считает без 180°, — и почему это не блокирует сохранение. */}
              {effectiveDirection === 'unknown'
                ? ' — пока никто не ответил, раскладка считается БЕЗ переворота на 180°: такая норма принимается на любой ткани. Проставьте направление у строки ткани на вкладке BOM, и на ненаправленной ткани раскладка станет плотнее'
                : ''}
            </Text>
          )}

          <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
            <label className='flex cursor-pointer items-center gap-1.5'>
              <CheckboxCommon
                name='nest-crossgrain'
                checked={crossGrain}
                onChange={(c: boolean) => guardManual(() => setCrossGrain(c))}
                disabled={running}
              />
              <Text size='micro' component='span'>
                разрешить поворот 90°
              </Text>
            </label>
            <Selector
              label='время'
              compact
              value={budgetS}
              options={[
                { value: 5, label: '5 с' },
                { value: 20, label: '20 с' },
                { value: 60, label: '60 с' },
              ]}
              onChange={(v: string | number) => setBudgetS(Number(v))}
              disabled={running}
            />
            <Selector
              label='юниты DXF'
              compact
              value={unitOverride}
              options={[
                {
                  value: 'auto',
                  // The detected unit stays visible even on 'авто' — a file whose header
                  // lies about units is caught by the operator seeing «авто (см)» on a
                  // sleeve that should be in mm.
                  label:
                    parse.phase === 'ready'
                      ? `авто (${parse.detectedUnit === 'mm' ? 'мм' : parse.detectedUnit === 'cm' ? 'см' : 'дюймы'})`
                      : 'авто',
                },
                { value: 'mm', label: 'мм' },
                { value: 'cm', label: 'см' },
                { value: 'in', label: 'дюймы' },
              ]}
              onChange={(v: string | number) =>
                guardManual(() => setUnitOverride(String(v) as Unit))
              }
              disabled={running || parse.phase === 'loading'}
            />
          </div>

          {parse.phase === 'ready' &&
            unitOverride !== 'auto' &&
            unitOverride !== parse.detectedUnit && (
              <Text size='nano' variant='label'>
                файл заявляет{' '}
                {parse.detectedUnit === 'mm' ? 'мм' : parse.detectedUnit === 'cm' ? 'см' : 'дюймы'}{' '}
                — выбран ручной override
              </Text>
            )}

          {parse.phase === 'loading' && (
            <Text size='micro' variant='label'>
              загрузка и разбор DXF…
            </Text>
          )}
          {parse.phase === 'error' && <CalloutBox tone='error'>{parse.message}</CalloutBox>}
          {parse.phase === 'ready' && parse.warnings.length > 0 && (
            <CalloutBox tone='note' className='max-h-24 space-y-0.5 overflow-y-auto'>
              {parse.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}

          {/* One chip per source DXF: each fabric is its own file, so «выбрать одну ткань»
              must be one click, not fifteen. Indeterminate = partially selected. */}
          {sources.length > 1 && (
            <div className='space-y-1'>
              {sources.map(([source, ps]) => {
                const fitting = ps.filter((p) => fitsWidth.get(p.id));
                const checkedN = fitting.filter((p) => sel[p.id]?.checked).length;
                const state: boolean | 'indeterminate' =
                  fitting.length > 0 && checkedN === fitting.length
                    ? true
                    : checkedN > 0
                      ? 'indeterminate'
                      : false;
                return (
                  <label key={source} className='flex cursor-pointer items-center gap-1.5'>
                    <CheckboxCommon
                      name={`nest-src-${source}`}
                      checked={state}
                      disabled={running || fitting.length === 0}
                      className='[&>span[data-state=indeterminate]]:opacity-40'
                      onChange={(c: boolean) =>
                        guardManual(() =>
                          setSel((m) => {
                            const next = { ...m };
                            for (const p of fitting) {
                              next[p.id] = { checked: c, qty: m[p.id]?.qty ?? 1 };
                            }
                            return next;
                          }),
                        )
                      }
                    />
                    <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                      файл: {source}
                    </Text>
                    <Text size='nano' variant='label' component='span' className='shrink-0'>
                      {checkedN}/{ps.length} дет.
                    </Text>
                  </label>
                );
              })}
            </div>
          )}

          {/* Что именно раскладываем: какой контур и какой размер. Один DXF несёт всю градацию,
              а блок — контур на нескольких слоях, поэтому без этого выбора на полосу легла бы
              вся градация разом, а длина маркера не относилась бы ни к одному размеру.
              Слой по умолчанию — тот, что ГРАДУИРУЕТСЯ: контур, одинаковый во всех размерах,
              это справочная линия, а не деталь. */}
          {(layerOpts.length > 1 || missingOnLayer.length > 0) && (
            <div className='space-y-1 border border-borderColor p-1.5'>
              {layerOpts.length > 1 && (
                <div className='flex flex-wrap items-center gap-1'>
                  <Text size='nano' variant='label' component='span'>
                    контур:
                  </Text>
                  {layerOpts.map((o) => {
                    // Замер — В САМОЙ КНОПКЕ, а не только в подсказке. Вопрос «крой или шов»
                    // решает, нужен ли офсет вообще, и держать ответ на него под наведением мыши
                    // значит прятать половину выбора от того, кто его делает.
                    const measured = layerAllowanceLabel(o);
                    return (
                      <Button
                        key={o.layer || '(none)'}
                        type='button'
                        variant={o.layer === contourLayer ? 'main' : 'secondary'}
                        size='xs'
                        disabled={running}
                        title={[
                          o.checked === 0
                            ? `слой ${o.layer}: ${o.pieces} контуров, сравнить размеры не с чем`
                            : `слой ${o.layer}: ${o.pieces} контуров, градуируется у ${o.graded} из ${o.checked} деталей`,
                          o.allowance ? allowanceLabel(o.allowance) : '',
                          o.allowance?.verdict === 'unknown'
                            ? allowanceUnknownText(o.allowance)
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        onClick={() => guardManual(() => setActiveLayer(o.layer))}
                      >
                        слой {o.layer || '—'}
                        {o.checked > 0 && o.graded === 0 ? ' (не градуируется)' : ''}
                        {measured ? ` · ${measured}` : ''}
                      </Button>
                    );
                  })}
                </div>
              )}
              {missingOnLayer.length > 0 && (
                <Text size='nano' component='p' className='text-error'>
                  на слое {contourLayer || '—'} нет контура у {missingOnLayer.length} блоков — они
                  не попадут в раскладку: {missingOnLayer.slice(0, 6).join(', ')}
                  {missingOnLayer.length > 6 ? '…' : ''}
                </Text>
              )}
            </div>
          )}

          {/* СОСТАВ НАСТИЛА — то, чем раскладка теперь описывается вместо «размер + комплекты».
              Смешанный настил ложится плотнее однородного, и пока состав был скаляром, снять
              такую норму было нечем. Таблица заменила и переключатель размеров, и поле
              «комплектов»: размер с количеством 0 просто не кроится. */}
          {!viewData && (
            <div className='space-y-1 border border-borderColor p-1.5'>
              <Text size='nano' variant='label' component='p'>
                состав настила — сколько изделий каждого размера кроим за один раз
              </Text>
              {graded ? (
                compRows.map((r) => {
                  const bad = !r.resolvable || r.sizeId <= 0;
                  return (
                    <div key={r.key} className='flex items-center gap-1.5'>
                      {/* Подпись — ВСЕ написания размера из файла («M / m»): строка их слила,
                          и оператор должен видеть, что обе графики кроятся одним тиражом. */}
                      <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                        {r.label}
                      </Text>
                      <Text size='nano' variant='label' component='span'>
                        {r.count} дет.
                      </Text>
                      {bad && r.qty >= 1 && <Pill tone='warn'>нет в карточке</Pill>}
                      <Input
                        name={`nest-comp-${r.key}`}
                        type='number'
                        value={r.qty}
                        min={0}
                        disabled={running}
                        className='w-14 shrink-0 px-1 py-0 text-micro'
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const next = Math.max(0, Math.round(numOr(e.target.value, r.qty)));
                          if (next !== r.qty) {
                            guardManual(() => setQtyByToken((m) => ({ ...m, [r.key]: next })));
                          }
                        }}
                      />
                    </div>
                  );
                })
              ) : (
                <label className='flex items-center gap-1.5'>
                  <Text size='micro' component='span' className='min-w-0 flex-1'>
                    изделий, шт{sizeLabel ? ` · размер ${sizeLabel}` : ''}
                  </Text>
                  <Input
                    name='nest-units'
                    type='number'
                    value={ungradedUnits}
                    min={1}
                    disabled={running}
                    className='w-14 shrink-0 px-1 py-0 text-micro'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const next = Math.max(1, Math.round(numOr(e.target.value, ungradedUnits)));
                      if (next !== ungradedUnits) {
                        guardManual(() => setQtyByToken((m) => ({ ...m, '': next })));
                      }
                    }}
                  />
                </label>
              )}
              {graded && ungradedCount > 0 && (
                <Text size='nano' variant='label' component='p'>
                  {ungradedCount} деталей без размера в имени блока — они кроятся на КАЖДОЕ изделие
                  состава, то есть по {unitsTotal} шт
                </Text>
              )}
              <Text size='nano' variant='label' component='p'>
                итог: {unitsTotal} изделий · {checkedCount} уникальных деталей · {instanceCount}{' '}
                экземпляров
              </Text>
              {mixed && (
                <Text size='nano' component='p' className='text-warning'>
                  смешанный состав: расход НА ИЗДЕЛИЕ у такой раскладки — среднее по составу (мелкие
                  размеры завышает, крупные занижает), и в рецепт он не пишется. Сама длина настила
                  и потребность по нему верны; пер-размерный расход придёт с Ф2.4
                </Text>
              )}
              {unresolvedTokens.length > 0 && (
                <Text size='nano' component='p' className='text-error'>
                  размеров нет в размерном ряду карточки: {unresolvedTokens.join(', ')} — посчитать
                  раскладку можно, сохранить нельзя: добавьте размер в карточку либо снимите его из
                  состава (количество 0)
                </Text>
              )}
              {sizesWithoutPieces.length > 0 && (
                <Text size='nano' component='p' className='text-error'>
                  в состав взяты размеры, у которых не выбрано ни одной детали:{' '}
                  {sizesWithoutPieces.join(', ')} — длина настила делилась бы на изделия, которых он
                  не кроит
                </Text>
              )}
              {!graded && !sizeId && (
                <Text size='nano' component='p' className='text-error'>
                  в именах блоков нет размеров, и размер слота неизвестен — сохранить такую
                  раскладку нечем
                </Text>
              )}
            </div>
          )}

          {/* Долевая — СВОЯ панель, а не часть выбора слоя и размера. Пока она жила внутри той,
              на файле с одним контурным слоем и одним размером панель не рендерилась вовсе:
              выключатель, счётчик повёрнутых и список деталей без долевой исчезали, а разворот
              всё равно происходил — то есть обе обещанные страховки пропадали ровно там, где
              проверить было нечем. */}
          <div className='space-y-1 border border-borderColor p-1.5'>
            <div className='flex flex-wrap items-center gap-1'>
              <Text size='nano' variant='label' component='span'>
                долевая:
              </Text>
              {grainLayers.map((o) => (
                <Button
                  key={o.layer}
                  type='button'
                  variant={o.layer === grainLayer ? 'main' : 'secondary'}
                  size='xs'
                  disabled={running}
                  title={`слой ${o.layer}: ровно один отрезок у ${o.exactlyOne} из ${o.seen} деталей, типичная длина ${o.medianLengthCm.toFixed(1)} см`}
                  onClick={() => guardManual(() => setGrainPick(o.layer))}
                >
                  слой {o.layer}
                </Button>
              ))}
              <Button
                type='button'
                variant={grainLayer === '' ? 'main' : 'secondary'}
                size='xs'
                disabled={running}
                title='класть детали так, как они нарисованы'
                onClick={() => guardManual(() => setGrainPick(''))}
              >
                не разворачивать
              </Button>
              {grainLayer !== '' && (
                <Text size='nano' variant='label' component='span'>
                  повёрнуто: {oriented.rotated} из {pieces.length}
                </Text>
              )}
            </div>
            {grainLayer !== '' && oriented.missing.length > 0 && (
              <Text size='nano' component='p' className='text-error'>
                долевая не определена однозначно у {oriented.missing.length} деталей — они лягут
                так, как нарисованы: {oriented.missing.slice(0, 6).join(', ')}
                {oriented.missing.length > 6 ? '…' : ''}
              </Text>
            )}
            {grainLayer === '' && (
              <Text size='nano' component='p' className='text-error'>
                детали лягут так, как нарисованы в файле, — это может оказаться поперёк долевой
              </Text>
            )}
          </div>

          {/* Piece list: checkbox · thumb · name · размеры · qty. */}
          {pieces.length > 0 && (
            <div className='max-h-[46vh] space-y-1 overflow-y-auto border border-borderColor p-1.5'>
              <div className='flex items-center justify-between'>
                <Text size='nano' variant='label'>
                  детали: {pieces.length} · выбрано {checkedCount}
                  {instanceCount !== checkedCount ? ` · к раскладке: ${instanceCount}` : ''}
                  {checkedCount > MAX_MARKER_PIECES || instanceCount > MAX_MARKER_PLACEMENTS
                    ? ` · СВЕРХ ПОТОЛКА (${MAX_MARKER_PIECES} деталей / ${MAX_MARKER_PLACEMENTS} размещений) — такую раскладку сервер не сохранит`
                    : ''}
                </Text>
                <button
                  type='button'
                  className='text-nano uppercase underline hover:opacity-70'
                  onClick={() =>
                    guardManual(() => {
                      // Слитно, а не заменой: замена стёрла бы выбор деталей ДРУГИХ размеров
                      // и слоёв, и переключение размера показало бы всё снятым.
                      const next: PieceSel = { ...sel };
                      for (const p of pieces) {
                        next[p.id] = { checked: !!fitsWidth.get(p.id), qty: sel[p.id]?.qty ?? 1 };
                      }
                      setSel(next);
                    })
                  }
                >
                  выбрать все
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
                      disabled={!fits || running}
                      onChange={(c: boolean) =>
                        guardManual(() => setSel((m) => ({ ...m, [p.id]: { ...s, checked: c } })))
                      }
                    />
                    <PieceThumb piece={p} />
                    <div className='min-w-0 flex-1'>
                      <Text size='micro' component='p' className='truncate'>
                        {p.name}
                      </Text>
                      {/* Размер детали и её тираж в этом настиле. До состава список показывал
                          ровно один размер, и подпись была бы шумом; теперь в нём лежат детали
                          нескольких размеров, у которых имена различаются одним хвостом. */}
                      <Text size='nano' variant='label' component='p'>
                        {p.bboxW.toFixed(1)} × {p.bboxH.toFixed(1)} см
                        {graded
                          ? ` · ${split.codeById.get(p.id)?.size || 'без размера'} · ×${
                              Math.max(1, Math.round(s.qty)) * (unitsOfPiece.get(p.id) ?? 0)
                            }`
                          : ''}
                      </Text>
                    </div>
                    {!fits && <Pill tone='warn'>шире полотна</Pill>}
                    <Input
                      name={`nest-qty-${p.id}`}
                      type='number'
                      value={s.qty}
                      min={1}
                      disabled={!fits || running}
                      className='w-12 shrink-0 px-1 py-0 text-micro'
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSel((m) => ({
                          ...m,
                          [p.id]: { ...s, qty: Math.max(1, Math.round(numOr(e.target.value, 1))) },
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right pane: the strip to scale + stats. Finished/stored layouts render through
            the interactive editor (drag/rotate when editing is allowed); the GA's streaming
            preview keeps the cheap string-SVG path. */}
        <div className='min-w-0 flex-1 space-y-2'>
          {running && liveSvg ? (
            <div
              className='max-h-[56vh] w-full overflow-auto border border-borderColor bg-bgColor [&_svg]:h-auto [&_svg]:w-full'
              dangerouslySetInnerHTML={{ __html: liveSvg }}
            />
          ) : effective && !running ? (
            <LayoutEditor
              pieces={displayPieces}
              placements={effective.placements}
              widthCm={displayWidth}
              usedLengthCm={effective.usedLengthCm}
              targetCm={displayTarget}
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
              onChange={(next) => setManual(next)}
            />
          ) : (
            <div className='flex h-[40vh] items-center justify-center border border-borderColor bg-bgColor'>
              <Text size='micro' variant='label'>
                {running
                  ? 'считаем раскладку…'
                  : pieces.length > 0
                    ? 'выберите детали и нажмите «запустить»'
                    : '—'}
              </Text>
            </div>
          )}
          {!running && displayResult?.cancelled && displayResult.placements.length === 0 && (
            <CalloutBox tone='warning'>
              остановлено до первой готовой раскладки — показывать нечего. Прежде тут появлялась
              раскладка, досчитанная уже ПОСЛЕ «стопа»: её никто не ждал, и длина у неё была
              настоящая, поэтому отличить её от результата было нельзя.
            </CalloutBox>
          )}
          {saveError && <CalloutBox tone='error'>сохранить не удалось: {saveError}</CalloutBox>}
          {/* Тот же отказ, что вынес бы сервер, но ДО отправки и рядом с раскладкой, которую он
              касается. Слот и прогон разнесены во времени, поэтому расхождение появляется уже
              после того, как ждать перестали. */}
          {directionRefusal && (
            <CalloutBox tone='error'>сохранить нельзя: {directionRefusal}</CalloutBox>
          )}
          {/* ДВОЙНОЙ ПРИПУСК — ДО ПРОГОНА, а не после. Панель, а не тост: тост исчезает, а чинится
              это двумя кликами здесь же — в поле припуска или в списке слоёв. */}
          {doubleAllowanceRefusal && (
            <CalloutBox tone='error'>
              двойной припуск — прогон не запускается: {doubleAllowanceRefusal}
            </CalloutBox>
          )}
          {/* ПЕРЕСБОРКА ЧЕРТЕЖА НЕ УДАЛАСЬ (§7.4). Панель, потому что чинить это надо на другой
              вкладке — перезалить выкройку, — а тост до туда не доживёт. */}
          {drawing.phase === 'error' && (
            <CalloutBox tone='error'>
              <Text size='nano' component='p'>
                чертёж детали не восстановлен: {rebuildText}
              </Text>
              <Text size='nano' component='p'>
                «скачать DXF» и «скачать SVG» выключены: файл без линии шва и надсечек цех читает
                как «у изделия их нет». Плоттерный экспорт остался — кнопкой «DXF: только контуры»,
                и имя файла это называет.
              </Text>
            </CalloutBox>
          )}
          {drawing.phase === 'running' && (
            <Text size='nano' variant='label' component='p'>
              восстанавливаем чертёж детали по выкройкам карточки — экспорт откроется, когда контур
              пересобранной детали сойдётся с сохранённым
            </Text>
          )}
          {drawing.phase === 'ok' && drawing.warnings.length > 0 && (
            <CalloutBox tone='note'>
              {drawing.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  пересборка чертежа: {w}
                </Text>
              ))}
            </CalloutBox>
          )}
          {unplaced.length > 0 && (
            <CalloutBox tone='error'>
              не влезло: {unplaced.length} — {unplacedText}. Этих деталей на раскладке НЕТ, длина
              посчитана без них; сохранить норму нельзя, пока каждая деталь не легла.
            </CalloutBox>
          )}
          {violations.length > 0 && !running && (
            <CalloutBox tone='warning'>
              нарушения: {violations.length}
              {worstViolation ? ` · худшее — ${violationText(worstViolation)}` : ''} — экспорт и
              сохранение не блокируются, решение за раскройщиком
            </CalloutBox>
          )}

          {effective && (
            <StatGrid min={120}>
              <Stat
                label='использовано'
                value={`${effective.usedLengthCm.toFixed(1)} см`}
                sub={manual ? 'с ручной правкой' : undefined}
              />
              <Stat
                label='эффективность'
                value={`${effPct.toFixed(1)} %`}
                sub={`ткань ${displayWidth} см`}
              />
              <Stat
                label='размещено'
                value={`${effective.placedCount}/${effective.totalCount}`}
                tone={effective.placedCount === effective.totalCount ? undefined : 'down'}
              />
              {viewData && view?.summary && (
                // РАСХОД НА ИЗДЕЛИЕ ДЕЛИТСЯ НА ИЗДЕЛИЯ, А НЕ НА КОМПЛЕКТЫ. Здесь стояло
                // usedLength / max(1, sets), и на маркере с составом sets приезжает нулём
                // (proto3 роняет умолчание) — то есть весь настил показывался как норма одного
                // изделия. Смешанному составу число не показывается вовсе: у него нормы нет.
                <Stat
                  label='расход / ед'
                  value={
                    viewRefusal
                      ? '—'
                      : `${(effective.usedLengthCm / Math.max(1, viewData.totalUnits)).toFixed(1)} см`
                  }
                  sub={
                    viewRefusal
                      ? // Причина ИЗ СОСТАВА, а не одна на всё: нечитаемый состав (испорченная
                        // строка, частичный рестор) — другой отказ, и звать его «смешанным»
                        // значит отправить оператора чинить не то.
                        //
                        // Читается ТЕМ ЖЕ источником, что и сам отказ, — сводкой строки. viewData
                        // берёт состав из БЛОБА в первую очередь, и у маркера, чья проекция
                        // размеров потеряна, а блоб цел, диагноз разошёлся бы с отказом: сервер
                        // говорит «не читается», подпись — «смешанный».
                        compositionOf(view.summary).length > 1
                        ? 'смешанный состав — нормы нет'
                        : 'состав не читается — нормы нет'
                      : `изделий: ${viewData.totalUnits || 1}`
                  }
                />
              )}
              {verdict && (
                <Stat
                  label='вердикт'
                  value={
                    <Pill tone={verdict.ok ? 'ok' : 'warn'}>
                      {verdict.ok ? 'влезает' : 'не влезает'}
                    </Pill>
                  }
                  sub={verdict.text}
                />
              )}
              {!viewData && displayResult && (
                <Stat
                  label='поколение'
                  value={
                    displayResult.generation === 0 ? (
                      <Pill tone='warn'>поиска не было</Pill>
                    ) : (
                      String(displayResult.generation)
                    )
                  }
                  sub={`${(displayResult.elapsedMs / 1000).toFixed(1)} с${run.phase === 'done' && run.stopped ? ' · остановлено' : ''}`}
                />
              )}
            </StatGrid>
          )}
          {/* Готовность мерится ПОКОЛЕНИЯМИ, а не секундами: бюджет говорит, сколько мы ждали,
              и ничего — сколько успели. Ноль поколений значит, что на экране лежит затравка. */}
          {greedyOnly && (
            <CalloutBox tone='warning'>
              поиск не начинался — это жадная укладка «крупные детали вперёд», а не оптимум.
              {displayResult?.telemetry
                ? ` Подготовка геометрии съела ${(displayResult.telemetry.prepassMs / 1000).toFixed(1)} с из бюджета (${displayResult.telemetry.nfpDone}/${displayResult.telemetry.nfpTotal} пар).`
                : ''}{' '}
              Дайте больше времени или снимите раскладку меньшим составом.
            </CalloutBox>
          )}
          {simplified && (
            <Text size='nano' variant='label' component='p'>
              контуры упрощены до {simplified.rdpEpsCm} см вместо {simplified.requestedRdpEpsCm} см
              — иначе подготовка геометрии не уложилась бы в бюджет и поиск не начался бы вовсе.
              Детали от этого лежат чуть свободнее.
            </Text>
          )}
          {displayResult && displayResult.warnings.length > 0 && (
            <CalloutBox tone='note'>
              {displayResult.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}

          {/* БЮДЖЕТ ДО ЗАПУСКА (Ф2.3) — рядом с кнопкой, до того как за прогон заплачено.
              Оператор до сих пор узнавал цену только постфактум: жал «запустить», ждал весь
              бюджет и читал в телеметрии, что предрасчёт съел его целиком, а поиска не было.
              Здесь то же самое сказано ЗАРАНЕЕ и той же моделью, которой движок будет считать.
              Потолки сервера стоят тут же: бюджет и потолки — два ответа на один вопрос «пойдёт
              ли этот прогон вообще», и разносить их по разным углам экрана значит заставлять
              оператора складывать их в голове.

              Строки идут ПЛОСКО, соседями остальных заметок этой панели: рамка вокруг них была
              бы блоком внутри блока (DESIGN.md), а единственная рамка здесь принадлежит той
              новости, ради которой блок и заведён, — «поиска не будет». */}
          {!viewData && !running && parse.phase === 'ready' && checkedCount > 0 && (
            <>
              <Text size='nano' variant='label' component='p'>
                до запуска: {checkedCount} уникальных · {instanceCount} размещений · потолок сервера{' '}
                {MAX_MARKER_PIECES} / {MAX_MARKER_PLACEMENTS}
                {forecast
                  ? ` · предрасчёт геометрии ~${(forecast.predictedPrepassMs / 1000).toFixed(1)} с при потолке ${(
                      forecast.prepassCapMs / 1000
                    ).toFixed(
                      1,
                    )} с из бюджета ${(forecast.timeBudgetMs / 1000).toFixed(0)} с · пар NFP ${forecast.nfpRecords}`
                  : ''}
              </Text>
              {overCap && (
                <Text size='nano' component='p' className='text-error'>
                  сверх потолка сервера — прогон не запускается, потому что такую раскладку не
                  сохранить:
                  {checkedCount > MAX_MARKER_PIECES
                    ? ` уберите ${checkedCount - MAX_MARKER_PIECES} деталей`
                    : ''}
                  {checkedCount > MAX_MARKER_PIECES && instanceCount > MAX_MARKER_PLACEMENTS
                    ? ' и'
                    : ''}
                  {instanceCount > MAX_MARKER_PLACEMENTS
                    ? ` уменьшите состав на ${instanceCount - MAX_MARKER_PLACEMENTS} размещений`
                    : ''}
                </Text>
              )}
              {forecast?.coarsened && (
                <Text size='nano' variant='label' component='p'>
                  контуры упростятся до {forecast.effectiveEps} см вместо {forecast.requestedEps} —
                  {forecast.mirrorPairs
                    ? ' парные детали удваивают предрасчёт'
                    : ` деталей много (${forecast.uniquePieces})`}
                  , иначе поиску не осталось бы времени; раскладка от этого чуть свободнее
                </Text>
              )}
              {/* Три исхода, и путать их нельзя: у первых двух поиск идёт, у третьего его
                  практически нет. СКОЛЬКО ПОКОЛЕНИЙ успеет поиск — не печатается ни в одном из
                  них: измеренной цены поколения у движка нет (см. expectedGenerations в
                  nest/estimate.ts), а выдуманное число хуже отсутствующего — по нему принимают
                  решения. Экран говорит то, что модель знает: сколько секунд достанется поиску. */}
              {forecast?.outlook === 'starved' ? (
                <CalloutBox tone='error'>
                  <Text size='nano' component='p'>
                    <b>предрасчёт не уложится в бюджет</b> — ~
                    {(forecast.predictedPrepassMs / 1000).toFixed(1)} с против{' '}
                    {(forecast.timeBudgetMs / 1000).toFixed(0)} с. Его оборвут по времени, поиск
                    получит недосчитанную геометрию и аварийные 2 с: это ровно тот прогон, который
                    возвращает НОЛЬ ПОКОЛЕНИЙ и жадную укладку. Ждать придётся дольше бюджета, и
                    насколько — сказать нечем: недостающую геометрию поиск досчитывает внутри себя,
                    а прерваться умеет только между особями (в замеренном случае бюджет 20 с
                    обернулся 51 секундой).
                  </Text>
                  <Text size='nano' component='p'>
                    что делать: поставить бюджет от {Math.ceil(forecast.budgetToFitMs / 1000)} с
                    {forecast.effectiveEps >= 0.9
                      ? ' (упрощать контуры дальше движку уже некуда — он на самой грубой ступени)'
                      : ''}
                    , либо убрать самые сложные детали
                    {forecast.heaviest.length > 0
                      ? ` (дороже всех: ${forecast.heaviest
                          .map(
                            (h) =>
                              `${pieces.find((p) => p.id === h.id)?.name ?? h.id} — ${h.parts} выпуклых частей`,
                          )
                          .join(', ')})`
                      : ''}
                    , либо уменьшить состав.
                  </Text>
                </CalloutBox>
              ) : forecast?.outlook === 'squeezed' ? (
                <Text size='nano' component='p' className='text-warning'>
                  предрасчёт съест больше своей доли — поиску останется всего ~
                  {(forecast.searchMsLeft / 1000).toFixed(1)} с из{' '}
                  {(forecast.timeBudgetMs / 1000).toFixed(0)}. Бюджета от{' '}
                  {Math.ceil(forecast.budgetToFitMs / 1000)} с хватило бы на полный предрасчёт.
                </Text>
              ) : forecast ? (
                <Text size='nano' variant='label' component='p'>
                  поиску останется ~{(forecast.searchMsLeft / 1000).toFixed(1)} с из{' '}
                  {(forecast.timeBudgetMs / 1000).toFixed(0)} — сколько это выйдет поколений,
                  зависит от числа экземпляров и от машины, и наперёд этого не мерил никто
                </Text>
              ) : null}
              {/* ПРОГНОЗ ПРОТИВ ФАКТА, когда факт уже есть. Правка любого параметра прогона
                  сбрасывает результат (эффект выше), поэтому телеметрия здесь всегда от ТОГО ЖЕ
                  задания — сравнение честное. Модель, которую видно рядом с её же промахом, —
                  единственная, которую можно поймать на вранье. */}
              {forecast && displayResult?.telemetry && (
                <Text size='nano' variant='label' component='p'>
                  прошлый прогон: предрасчёт {(displayResult.telemetry.prepassMs / 1000).toFixed(1)}{' '}
                  с при прогнозе ~{(displayResult.telemetry.predictedPrepassMs / 1000).toFixed(1)} с
                  · поколений {displayResult.generation}
                </Text>
              )}
            </>
          )}

          {/* Footer: own actions (the shell's are hidden). */}
          <div className='flex flex-wrap items-center justify-end gap-1.5 border-t border-hairline pt-2'>
            {running && run.nfp && (
              <Text size='nano' variant='label' className='mr-auto'>
                подготовка геометрии {run.nfp.done}/{run.nfp.total}
              </Text>
            )}
            {running && !run.nfp && run.best && (
              <Text size='nano' variant='label' className='mr-auto'>
                поколение {run.generation} · лучшая длина {run.best.usedLengthCm.toFixed(1)} см
              </Text>
            )}
            {manual && !running && (
              <Button
                type='button'
                variant='secondary'
                title='вернуть раскладку к исходному результату'
                onClick={() => setManual(null)}
              >
                сбросить правки
              </Button>
            )}
            {viewData && !viewDegraded && canEdit && !editView && (
              <Button type='button' variant='secondary' onClick={() => setEditView(true)}>
                редактировать
              </Button>
            )}
            {viewData && editView && (
              <Button
                type='button'
                variant='main'
                disabled={!canSaveView || saving}
                title={
                  canSaveView
                    ? 'перезаписать маркер с ручными правками (source: manual)'
                    : 'подвиньте или поверните деталь — сохранение включится'
                }
                onClick={updateViewMarker}
              >
                {saving ? 'сохраняем…' : 'сохранить правки'}
              </Button>
            )}
            {!viewData && (
              <>
                <Button
                  type='button'
                  variant='main'
                  disabled={
                    parse.phase !== 'ready' ||
                    checkedCount === 0 ||
                    running ||
                    overCap ||
                    !!doubleAllowanceRefusal
                  }
                  title={
                    doubleAllowanceRefusal
                      ? doubleAllowanceRefusal
                      : overCap
                        ? `сверх потолка сервера (${MAX_MARKER_PIECES} деталей / ${MAX_MARKER_PLACEMENTS} размещений) — такую раскладку не сохранить: уберите детали или уменьшите состав`
                        : undefined
                  }
                  onClick={requestRun}
                >
                  запустить
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={!running || stopping}
                  onClick={stop}
                >
                  {stopping ? 'останавливаем…' : 'стоп'}
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  disabled={!canSave}
                  title={
                    canSave
                      ? 'сохранить маркер в тех-карту — расход уйдёт в костинг'
                      : !canEdit
                        ? 'нет прав на изменение карточки, либо она released'
                        : fetchFailed
                          ? 'часть DXF не скачалась — раскладка неполная, такой маркер занизил бы расход'
                          : directionRefusal || doubleAllowanceRefusal
                            ? directionRefusal || doubleAllowanceRefusal
                            : sizeUnresolved
                              ? unresolvedTokens.length > 0
                                ? `размеров нет в размерном ряду карточки: ${unresolvedTokens.join(', ')} — добавьте их в карточку либо уберите из состава`
                                : 'размер раскладки неизвестен — в именах блоков нет размеров, и слот его не называет'
                              : sizeUnsaved
                                ? 'размер добавлен, но карточка не сохранена — сначала сохраните карточку'
                                : sizesWithoutPieces.length > 0
                                  ? `в состав взяты размеры без единой выбранной детали: ${sizesWithoutPieces.join(', ')}`
                                  : composition.length > MAX_MARKER_COMPOSITION_SIZES
                                    ? `в составе ${composition.length} размеров, потолок сервера — ${MAX_MARKER_COMPOSITION_SIZES}`
                                    : 'сохранить можно завершённую раскладку, в которую поместились все детали'
                  }
                  onClick={() => setSaveOpen(true)}
                >
                  сохранить раскладку
                </Button>
              </>
            )}
            <Button
              type='button'
              variant='secondary'
              disabled={!effective || running || viewDegraded || drawingBlocked}
              title={
                viewDegraded
                  ? 'геометрия маркера нечитаема — доступна только сводка'
                  : drawing.phase === 'running'
                    ? 'восстанавливаем чертёж детали по выкройкам…'
                    : drawing.phase === 'error'
                      ? `чертёж не восстановлен: ${rebuildText}`
                      : undefined
              }
              onClick={downloadSvg}
            >
              скачать SVG
            </Button>
            <Button
              type='button'
              variant='secondary'
              disabled={!dxfReady}
              title={
                viewDegraded
                  ? 'геометрия маркера нечитаема — доступна только сводка'
                  : drawing.phase === 'running'
                    ? 'восстанавливаем чертёж детали по выкройкам…'
                    : drawing.phase === 'error'
                      ? `чертёж не восстановлен: ${rebuildText}`
                      : 'DXF R12 для реза — контуры на слое CUT, чертёж INNER/SEAM, кромка STRIP, подписи LABELS'
              }
              onClick={downloadDxf}
            >
              скачать DXF
            </Button>
            {/* ЯВНАЯ ВТОРАЯ КНОПКА (решение Р4) — и появляется она ТОЛЬКО когда чертежа нет.
                Постоянная кнопка «без чертежа» рядом с полной была бы приглашением выбрать
                неправильную из двух одинаково доступных; здесь же она — единственный оставшийся
                выход, и рядом сказано, из-за чего. */}
            {drawing.phase === 'error' && !viewDegraded && (
              <Button
                type='button'
                variant='secondary'
                disabled={!effective || running}
                title={`то же, что система выдавала до починки: контуры и кромка, БЕЗ линии шва и надсечек. Причина: ${rebuildText}`}
                onClick={downloadContoursOnly}
              >
                DXF: только контуры
              </Button>
            )}
            <Button type='button' variant='secondary' onClick={requestClose}>
              закрыть
            </Button>
          </div>
        </div>
      </div>

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
        title='сохранить раскладку как маркер'
        confirmLabel={saving ? 'сохраняем…' : 'сохранить'}
        confirmDisabled={saving || !nameValue.trim()}
        closeOnConfirm={false}
      >
        <div className='space-y-2'>
          <label className='block space-y-0.5'>
            <Text size='nano' variant='label' component='span'>
              название маркера
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
            // The sheets carry their fabric, so there is nothing to choose — asking again would
            // invite a marker linked to a cloth its own DXFs are not cut from.
            <div className='space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                слот BOM (ткань) — куда пойдёт расход
              </Text>
              <Text size='micro' component='p'>
                {lockedSlot ? slotLabel(lockedSlot) : 'ткань'} — из привязки DXF
              </Text>
            </div>
          ) : (
            <label className='block space-y-0.5'>
              <Text size='nano' variant='label' component='span'>
                слот BOM (ткань) — куда пойдёт расход
              </Text>
              <Selector
                label=''
                value={slotKey}
                options={[
                  { value: '', label: 'не выбрана' },
                  ...fabricLines.map((b) => ({ value: b.lineKey, label: slotLabel(b) })),
                ]}
                onChange={(v: string | number) => setSlotKey(String(v))}
              />
            </label>
          )}
          {lockDangling && (
            <CalloutBox tone='warning'>
              ткань, к которой привязаны эти DXF, больше не является тканевой строкой BOM карточки —
              выберите слот вручную, иначе маркер сохранится без привязки и расход не попадёт в
              костинг
            </CalloutBox>
          )}
          {lockedUnsaved && (
            <CalloutBox tone='note'>
              ткань этих DXF ещё не сохранена в карточке — сохраните карточку, тогда маркер
              привяжется к ней; сейчас он уйдёт без привязки
            </CalloutBox>
          )}
          {unsavedSlots > 0 && !lockedSlot && !lockedUnsaved && (
            <Text size='nano' variant='label' component='p'>
              новые слоты BOM появятся здесь после сохранения карточки
            </Text>
          )}
          {widthMismatch && (
            <CalloutBox tone='warning'>
              ширина раскроя ({widthCm} см) отличается от раскройной ширины артикула слота (
              {slotWidth} см
              {slotSelvedge(slot) > 0 ? `, кромка 2×${slotSelvedge(slot)} см уже вычтена` : ''}) —
              расход будет применим только к этой ширине
            </CalloutBox>
          )}
          {slot && slotSelvedge(slot) === 0 && (
            <CalloutBox tone='note'>
              у артикула слота не задана кромка — отходы кромки посчитаются как ноль; задайте её в
              карточке материала, чтобы разложение отходов было полным
            </CalloutBox>
          )}
          {parse.phase === 'ready' && parse.warnings.length > 0 && (
            <CalloutBox tone='note' className='max-h-20 space-y-0.5 overflow-y-auto'>
              <Text size='nano' component='p'>
                предупреждения парсинга сохранятся вместе с маркером:
              </Text>
              {parse.warnings.map((w, i) => (
                <Text key={i} size='nano' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
          )}
          {manual && (
            <CalloutBox tone={violations.length ? 'warning' : 'note'}>
              {violations.length
                ? `раскладка правлена вручную — ${manualNote?.replace(MANUAL_NOTE_PREFIX, 'в ней').trim()}; предупреждение сохранится в маркере`
                : 'раскладка правлена вручную — маркер сохранится как source: manual'}
            </CalloutBox>
          )}
          {/* СОСТАВ И ЧТО ИЗ НЕГО СЛЕДУЕТ — последняя строка перед «сохранить», потому что
              именно она отвечает на вопрос «а какое число уедет в костинг». */}
          <Text size='nano' variant='label' component='p'>
            состав:{' '}
            {graded
              ? compositionLabel(composition, (id) => sizeNameOfId(id))
              : sizeLabel || 'один размер'}{' '}
            · всего {unitsTotal} изделий · расход на изделие:{' '}
            {mixed
              ? 'не выдаётся — среднее по составу'
              : effective
                ? `${(effective.usedLengthCm / Math.max(1, unitsTotal)).toFixed(1)} см`
                : '—'}
          </Text>
          {mixed && (
            <CalloutBox tone='note'>
              смешанная раскладка сохранится целиком — и длина, и состав, и размеры деталей. Не
              сохранится только расход НА ИЗДЕЛИЕ: у смешанного настила он средний по составу, а
              такое число, попав в рецепт, неотличимо от измеренного. Пер-размерный расход придёт с
              Ф2.4; до тех пор нормой служит однородная раскладка.
            </CalloutBox>
          )}
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
        title='перезапустить раскладку?'
        confirmLabel='перезапустить'
      >
        <Text size='micro' component='p'>
          В раскладке есть ручные правки — новый запуск их сотрёт. Экспортируйте или сохраните
          маркер, если правки нужны.
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
        title={
          wipeConfirm?.kind === 'close' ? 'закрыть без сохранения?' : 'сбросить ручные правки?'
        }
        confirmLabel={wipeConfirm?.kind === 'close' ? 'закрыть' : 'сбросить'}
      >
        <Text size='micro' component='p'>
          {wipeConfirm?.kind === 'close'
            ? 'В раскладке есть ручные правки — при закрытии они потеряются. Сохраните маркер или скачайте SVG/DXF, если правки нужны.'
            : 'Смена параметра пересчитает раскладку с нуля — ручные правки будут потеряны.'}
        </Text>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
