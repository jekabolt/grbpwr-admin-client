import type { common_Material } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useSnackBarStore } from 'lib/stores/store';
import { Suspense, lazy, useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import {
  PatternUploadButton,
  PatternUploadModal,
  type UploadedPattern,
} from 'ui/components/pattern-upload-button';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import {
  MAX_PATTERN_NAME,
  clampPatternName,
  formatBytes,
  isDxfUrl,
  patternFileError,
} from 'utils/pattern';
import { ulid } from 'utils/ulid';
import {
  type FabricScope,
  type ScopeDirection,
  bindingForScope,
  bomPurposeLabel,
  fabricScopes,
  scopeKeyOfBinding,
  strictestDirection,
} from './bom-purpose';
import { sizeTokensOf } from './nesting/block-code';
import { markerColorways } from './nesting/colorway-widths';
import { splitPiecesBySize, useDictionarySizeTokens } from './nesting/use-block-sizes';
import type { NestingFile } from './nesting/use-nesting';
import { TechCardFormData } from './schema';

// The whole nesting feature (modal + worker + dxf/clipper deps) lives in a lazy chunk —
// nothing loads until someone actually opens a раскладка.
const NestingModal = lazy(() =>
  import('./nesting/nesting-modal').then((m) => ({ default: m.NestingModal })),
);
// Просмотр DXF нашим листом — из того же ленивого чанка: воркер и парсер общие.
const DxfSheetViewer = lazy(() =>
  import('./nesting/dxf-sheet-viewer').then((m) => ({ default: m.DxfSheetViewer })),
);
// Same lazy neighbourhood: the matching dialog parses DXF through the same worker.
const PieceMatchModal = lazy(() =>
  import('./nesting/piece-match-modal').then((m) => ({ default: m.PieceMatchModal })),
);

// Секции BOM, к которым МОЖНО привязать выкройку. Это ровно те же четыре «рулонные» семьи,
// что стор гросс-апит вейстеджем и что кладёт маркер (rollGoodsSections): подклад, бортовку и
// утеплитель тоже кроят из полотна по лекалу.
// Map, not a plain object: an object literal answers for 'constructor' and 'toString' too, so
// `ROLE[section]` used as a membership test would let those through as truthy inherited functions.
// Unreachable with today's proto enum, but the shape should not depend on that.
const ROLE_OF_SECTION = new Map<string, string>([
  ['TECH_CARD_BOM_SECTION_FABRIC', 'основная ткань'],
  ['TECH_CARD_BOM_SECTION_LINING', 'подкладка'],
  ['TECH_CARD_BOM_SECTION_INTERLINING', 'бортовка'],
  ['TECH_CARD_BOM_SECTION_INSULATION', 'утеплитель'],
]);
const SECTION_ORDER = [...ROLE_OF_SECTION.keys()];

type PatternRow = {
  sizeId?: number;
  url?: string;
  filename?: string;
  name?: string;
  sizeBytes?: number;
  version?: number;
  uploadedAt?: string;
  lineKey?: string;
  bomLineKey?: string;
  // НАЗНАЧЕНИЕ this sheet is cut from (0267). Resolved BEFORE bomLineKey everywhere — see
  // bom-purpose.ts for why both exist and why neither may be read alone.
  fabricPurpose?: string;
};
type Entry = { row: PatternRow; index: number };

// Одна рулонная строка BOM, как её видит панель выкроек: идентичность, роль по секции, назначение
// (0267) и read-only обогащение 0259, из которого раскладка берёт полезную ширину.
type FabricLine = {
  id: number;
  lineKey: string;
  name: string;
  section: string;
  purpose: string;
  role: string;
  unit: string;
  fabricWidth: string;
  wastagePercent: string;
  effectiveFabricWidthCm: string;
  selvedgeCm: string;
  fabricDirection: string;
  isSample: boolean;
  order: number;
};

// What the operator calls the sheet — the display name when given, else the filename.
function labelOf(row?: PatternRow): string {
  return row?.name || row?.filename || '(без имени)';
}

// Rev.N of this sheet, straight off the row — the server numbers a url it has not seen on this
// card and preserves the number for one it has. 0 is not revision zero, it is a row that was
// never numbered (a legacy upload), so it claims no revision rather than printing "v0".
function revisionOf(row: PatternRow): number | null {
  return row.version && row.version > 0 ? row.version : null;
}

// Сколько размеров карточки НЕТ в файлах материала — читается из самих файлов, по запросу.
//
// Сервер про содержимое DXF не знает ничего: у строки выкройки есть url, размер-артефакт и
// привязка к материалу, и всё. Значит единственный способ ответить «какого размера в файле нет»
// — скачать и разобрать. Это стоит загрузки с CDN и полного разбора геометрии, поэтому проверка
// сидит на кнопке, а не рисуется сама: открытие вкладки не должно тянуть десятки мегабайт.
//
// Разбор идёт ЧЕРЕЗ ТОТ ЖЕ воркер, что и раскладка. Дешёвый скан имён блоков на главном потоке
// написать легко, но это была бы вторая реализация того же правила, и в день, когда они
// разойдутся, панель будет уверенно врать — ровно тот класс ошибки, из-за которого этот текст
// вообще пишется.
async function parsePiecesOnce(files: NestingFile[]) {
  const client = new NestingWorkerClient();
  try {
    // allSettled: одна недоступная ссылка не должна отменять файлы, которые скачались.
    const settled = await Promise.allSettled(
      files.map(async (f) => new File([await fetchMediaBlob(f.url)], f.name)),
    );
    const fetched = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
    if (fetched.length === 0) throw new Error('не удалось скачать DXF с CDN');
    const out = await client.parse(fetched, {
      unit: 'auto',
      tol: NEST_DEFAULTS.tol,
      tolChain: NEST_DEFAULTS.tolChain,
    });
    return out.pieces;
  } finally {
    // Разобранная геометрия живёт ВНУТРИ воркера, и она тут больше не нужна: проверка разовая.
    // Панель остаётся смонтированной, пока открыты другие вкладки карточки, так что оставленный
    // воркер держал бы эти мегабайты до перезагрузки страницы.
    client.terminate();
  }
}

type SizeAudit =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  // Хранится РОВНО ТО, ЧТО СКАЗАЛИ ФАЙЛЫ, — набор найденных размерных токенов. Нехватка выводится
  // при отрисовке, потому что она зависит ещё и от размерного ряда карточки, а ряд правится на
  // этой же вкладке. Сохранённый ответ «все размеры на месте» пережил бы добавление XXL и
  // продолжал бы утверждать своё — то есть ровно ту ложь, ради устранения которой заменён счётчик
  // покрытия. Так несостоятельное состояние просто непредставимо.
  //
  // graded=false — в именах блоков размеров нет вовсе (не градуированный файл). Это НЕ «нет всех
  // размеров»: сказать так значило бы повторить ошибку счётчика с другой стороны.
  | { phase: 'ready'; found: Set<string> };

// Выкройки карточки (§2) — DXF, разложенные ПО МАТЕРИАЛАМ.
//
// Раньше панель рисовала плитку на каждый размер ряда и писала «N of M sizes have a pattern».
// Градуированный DXF несёт ВЕСЬ ряд в одном файле — размер записан в именах блоков, выбирается
// внутри просмотрщика и раскладки, а недостающие размеры карточка добирает из файла сама, — так
// что этот счётчик не просто лишний: он ВРЁТ. Один файл на пять размеров читался как «1 из 5».
//
// Организация теперь по материалу, потому что различает файлы именно материал: основная ткань,
// подкладка, бортовка, утеплитель — разные чертежи, и на один материал их может быть несколько
// (основная ткань и карманка — две строки BOM). Дыр, которые панель обязана показать, тоже две:
// материал без DXF и размер карточки, которого в файлах не нашлось.
//
// Строка размера в БД никуда не делась (tech_card_size_pattern.size_id NOT NULL), но это теперь
// артефакт хранения — см. storageSizeId.
export function PatternsField({
  techCardId,
  canEdit = true,
  savedSizeIds,
}: {
  techCardId?: number;
  // Gates «сохранить раскладку» (RBAC write + not released), mirroring MarkersSection.
  canEdit?: boolean;
  // Server-known size range: a form-added size cannot take a marker until the card saves.
  savedSizeIds?: number[];
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  // Live row values. `fields` is a snapshot that array actions refresh but setValue on a
  // nested path does NOT — rename writes via setValue (a useFieldArray.update would replace
  // the row and revert any sibling Controller-written field), so display must read live.
  const liveRows = (useWatch({ control, name: 'patterns' }) ?? []) as PatternRow[];
  // A save's form.reset() overwrites concurrent edits and un-dirties them — freeze renames
  // for its duration.
  const { isSubmitting } = useFormState({ control });
  // Осмысленные имена экспортов раскладки: SEASON-STYLE-размер-…
  const season = (useWatch({ control, name: 'season' }) ?? '') as string;
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) ?? '') as string;

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  const dictTokens = useDictionarySizeTokens();

  // Колорвеи карточки с шириной их ПИНОВ по каждому слоту — раскладка меряется на конкретном
  // артикуле, а называет его колорвей. Читается с сервера: рецепт пишется отдельным RPC
  // (UpdateColorwayRecipe), в форме карточки пинов нет. includeArchived — чтобы строка,
  // ссылающаяся на архивный артикул, всё равно разрешилась в ширину, а не молча упала на дефолт.
  const { data: cardRead } = useTechCard(techCardId);
  const { data: materialsData } = useMaterials('', true, !!techCardId);
  const colorwayOptions = useMemo(() => {
    const byId = new Map<number, common_Material>();
    for (const m of materialsData?.materials ?? []) {
      const id = Number(m.id ?? 0);
      if (id) byId.set(id, m);
    }
    return markerColorways(cardRead, byId);
  }, [cardRead?.techCard, materialsData?.materials]);

  // Материал, над которым сейчас висит перетаскиваемый файл ('' = ничей).
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Files dropped onto a material group, staged for the naming modal (click uploads stage inside
  // PatternUploadButton; drops land here because the modal must know which cloth was aimed at).
  const [droppedOn, setDroppedOn] = useState<{ scopeKey: string; files: File[] } | null>(null);
  // The pattern sheet open in the in-app viewer (null = closed). Legacy PDF and DXF rows share
  // this state and split into the two viewers at the bottom.
  const [viewing, setViewing] = useState<PatternRow | null>(null);
  // Inline rename in progress: which row and the draft value.
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  // Результаты проверки размеров, по ПОДПИСИ набора файлов (urls), а не по материалу: перезалили
  // файл — подпись сменилась, старый ответ сам перестал показываться, вместо того чтобы врать
  // про файл, которого уже нет.
  const [audits, setAudits] = useState<Record<string, SizeAudit>>({});
  // Раскладка modal: the DXF files of one fabric, pooled (null = closed).
  const [nesting, setNesting] = useState<{
    sizeId: number;
    files: NestingFile[];
    fabricDirection: ScopeDirection;
    // The concrete BOM LINE these sheets lay out on, which is a DIFFERENT question from what the
    // panel groups by. A раскладка measures cloth: its width and кромка come off the article the
    // colourway pins to ONE line, so a class («основной материал») does not determine it. Filled
    // only when the scope owns exactly one line; '' otherwise — for a назначение spanning two
    // articles, and for legacy unbound DXFs, the modal asks, exactly as it already did.
    bomLineKey: string;
  } | null>(null);
  // «сопоставить детали»: the same DXF set, opened against the cut-piece list instead of the
  // nesting engine (null = closed).
  const [matching, setMatching] = useState<{
    scope: FabricScope<FabricLine>;
    fabricName: string;
    files: NestingFile[];
  } | null>(null);

  // The card's fabric BOM lines, live from form state — the save-marker dialog's slot select.
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    name?: string;
    unit?: string;
    fabricWidth?: string;
    wastagePercent?: string;
    effectiveFabricWidthCm?: string;
    selvedgeCm?: string;
    lineKey?: string;
    purpose?: string;
    fabricDirection?: string;
    // Семпловая ярдажа (0265). Флаг РЯДОМ с назначением, а не его значение — и потому он
    // разбивает скоуп направления надвое: см. markerScopeLines в bom-purpose.ts.
    isSample?: boolean;
    id?: number;
  }>;
  const fabricBomLines = useMemo(
    () =>
      bomItems
        .filter((b) => ROLE_OF_SECTION.has(b.section ?? '') && b.lineKey)
        .map((b, i) => ({
          id: b.id ?? 0,
          lineKey: b.lineKey!,
          name: b.name ?? '',
          section: b.section ?? '',
          purpose: b.purpose ?? '',
          role: ROLE_OF_SECTION.get(b.section ?? '') ?? '',
          unit: b.unit ?? '',
          fabricWidth: b.fabricWidth ?? '',
          wastagePercent: b.wastagePercent ?? '',
          // read-only enrichment (0259) the card read filled; the раскладка prefills its
          // cutting width from these instead of the 140 cm default.
          effectiveFabricWidthCm: b.effectiveFabricWidthCm ?? '',
          selvedgeCm: b.selvedgeCm ?? '',
          // Направление ткани (0073). Существует с прошлого года, потребителем был только
          // дайджест MATERIALS — до движка оно не доезжало вовсе, и раскладка на ворсовой
          // ткани спокойно переворачивала детали на 180°.
          fabricDirection: b.fabricDirection ?? '',
          // Едет до модалки, потому что скоуп направления партиционируется по нему (0265): без
          // этого непроставленное направление на СЕМПЛОВОМ рулоне снимало бы 180° у
          // производственного маркера, который сервер бы принял.
          isSample: !!b.isSample,
          order: i,
        }))
        // Основная ткань первой, дальше подклад/бортовка/утеплитель — порядок ролей, а не
        // порядок строк BOM: в списке из восьми строк глаз ищет роль, а не позицию.
        .sort(
          (a, b) =>
            SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
            a.order - b.order,
        ),
    [bomItems],
  );
  // Скоупы — то, к чему выкройка привязывается с 0267: одна группа на НАЗНАЧЕНИЕ и одна на каждую
  // ещё не разложенную строку. У неразобранной карточки назначений нет вовсе, поэтому каждая
  // строка остаётся своей группой — то есть панель ведёт себя ровно как до 0267, без единого
  // действия оператора. Разложил BOM по назначениям — группы схлопнулись сами.
  //
  // Строки берутся из формы, сохранённые и нет. Сейв карточки апсертит BOM ДО того, как сверяет
  // выкройки и алиасы (techcard.go: bom :1185, aliases :1198, patterns :1223), так что строка,
  // заведённая на вкладке BOM минуту назад, резолвится к моменту использования ключа.
  const scopes = useMemo(() => fabricScopes(fabricBomLines), [fabricBomLines]);
  // Подпись скоупа. У назначения — само назначение и артикулы, которые в него разложены: «основной
  // материал · Твил 1, Твил 2». Одно назначение законно владеет несколькими строками, и оператору
  // всё ещё нужно видеть, какими именно. У неразобранной строки — «роль · название», как и было.
  const scopeLabel = (s: FabricScope<FabricLine>): string => {
    if (!s.byPurpose) {
      const l = s.lines[0];
      return [l?.role, l?.name.trim()].filter(Boolean).join(' · ') || 'без названия';
    }
    const names = s.lines
      .map((l) => l.name.trim())
      .filter(Boolean)
      .join(', ');
    return [bomPurposeLabel(s.key), names].filter(Boolean).join(' · ');
  };
  const uploadScopes = useMemo(
    () => scopes.map((s) => ({ key: s.key, label: scopeLabel(s) })),
    [scopes],
  );

  // Structure (order, ids) from the array snapshot; values from the live form state so
  // setValue-written fields (rename, rebind) show through.
  const entries: Entry[] = useMemo(
    () =>
      fields.map((f, index) => ({
        row: { ...(f as PatternRow & { id: string }), ...liveRows[index] },
        index,
      })),
    [fields, liveRows],
  );

  const inRange = useMemo(() => new Set(sizeIds), [sizeIds]);
  const nameOf = (id: number) =>
    id > 0 ? formatSizeName(sizeById.get(id) ?? `#${id}`) : 'без размера';

  // Куда ложится НОВАЯ строка выкройки. Класть надо во что-то: tech_card_size_pattern.size_id
  // объявлен NOT NULL, и сервер отвергает строку с размером вне ряда карточки. Берём наименьший
  // размер ряда — и это АРТЕФАКТ ХРАНЕНИЯ, а не смысл: файл несёт весь ряд, ни один потребитель
  // (просмотр, раскладка, сопоставление деталей, экспорт маркера) этот size_id не читает, размер
  // везде берётся из имён блоков. Любой другой размер ряда был бы ровно так же верен.
  const storageSizeId = orderSizes(sizeIds)[0] ?? 0;

  const dxfEntries = useMemo(() => entries.filter((e) => isDxfUrl(e.row.url)), [entries]);
  // Legacy PDF rows. Новые PDF не принимаются, но УЖЕ ЗАГРУЖЕННЫЕ обязаны и показываться, и
  // сохраняться: выкройки пишутся ПОЛНОЙ ЗАМЕНОЙ массива, так что строка, которую панель
  // перестала рисовать, исчезла бы с карточки при первом же сохранении — молча.
  const pdfEntries = useMemo(() => entries.filter((e) => !isDxfUrl(e.row.url)), [entries]);

  // Лист раскладывается по РАЗРЕШЁННОМУ скоупу, а не по тому, что записано в строке. Это и есть
  // место, которое ломается на полуразобранной карточке: лист привязан к строке L, L потом
  // разложили в назначение P — и если сопоставлять сырой ключ с ключами групп, лист вываливается в
  // «без материала» ровно в момент, когда оператор навёл порядок в BOM. scopeKeyOfBinding ведёт его
  // за своей строкой в группу назначения, поэтому разбор BOM ничего не теряет.
  const dxfByScope = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of dxfEntries) {
      const key = scopeKeyOfBinding(e.row.fabricPurpose, e.row.bomLineKey, scopes);
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return m;
  }, [dxfEntries, scopes]);

  // Один блок на скоуп. Скоуп без файлов остаётся в списке: пустая строка «нет DXF» — это и есть
  // дыра, а не повод не рисовать материал.
  const scopeGroups = useMemo(
    () => scopes.map((s) => ({ scope: s, entries: dxfByScope.get(s.key) ?? [] })),
    [scopes, dxfByScope],
  );
  // DXF без живой привязки: залитые до 0260 (ключа нет вовсе) и те, чью строку BOM удалили или
  // переклассифицировали. Раскладка для них — догадка, поэтому они собраны отдельно и с ошибкой.
  const looseDxf = useMemo(() => dxfByScope.get('') ?? [], [dxfByScope]);

  const filesOf = (list: Entry[]): NestingFile[] =>
    list.map(({ row }) => ({ name: row.name || row.filename || 'выкройка.dxf', url: row.url! }));
  const sigOf = (list: Entry[]) => list.map((e) => e.row.url ?? '').join('|');

  // Размерный токен из имён блоков → id размера карточки. Нужен раскладке: один DXF несёт весь
  // ряд, и маркер обязан лечь на ВЫБРАННЫЙ внутри размер, а не на тот, в чей слот файл положили.
  const sizeIdByToken = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of sizeIds) {
      for (const t of sizeTokensOf(sizeById.get(id))) if (!m.has(t)) m.set(t, id);
    }
    return m;
  }, [sizeIds, sizeById]);

  // Подпись скоупа по его ключу — чтобы подсказка «по другой ткани» в диалоге сопоставления могла
  // сказать, ПО КАКОЙ. Ключи здесь и в сохранённых алиасах могут не совпадать на полуразобранной
  // карточке (алиас лежит на строке, группа уже на назначении), поэтому в карту кладутся ОБА: ключ
  // скоупа и ключ каждой его строки. Иначе подсказка молча теряла бы имя и читалась бы как факт.
  const scopeLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of scopes) {
      const label = scopeLabel(s);
      m.set(s.key, label);
      for (const l of s.lines) if (!m.has(l.lineKey)) m.set(l.lineKey, label);
    }
    return m;
  }, [scopes]);

  // Размеры карточки, которых в разобранных файлах не оказалось. Считается КАЖДЫЙ РАЗ, а не
  // хранится: ряд правится на этой же вкладке, прямо над панелью.
  const missingIn = (a: SizeAudit | undefined): number[] =>
    a?.phase === 'ready' && a.found.size > 0
      ? sizeIds.filter((id) => !sizeTokensOf(sizeById.get(id)).some((t) => a.found.has(t)))
      : [];

  // ---- дыры, которые панель обязана назвать вместо счётчика покрытия ---------------------
  // Материал без DXF — дыра ТОЛЬКО у основной ткани. Подкладку, бортовку и утеплитель градалка
  // сплошь и рядом чертит внутри файла основной ткани, а строка выкройки несёт ровно один
  // bomLineKey, то есть один файл двум материалам служить не может. Красный флаг на подкладке был
  // бы неопровергаемым: снять его можно только залив тот же файл вторым объектом, что удваивает
  // скачивание и разводит скоуп алиасов. Заменять счётчик, который занижал, на индикатор, который
  // завышает, — не улучшение.
  // «Раскроить нечем» — красный флаг ТОЛЬКО у основного материала. У неразобранной строки это
  // по-прежнему section=fabric (ровно как до 0267), у разобранной — назначение «основной
  // материал». Это и есть выигрыш от разбора: карманка и контраст сегодня тоже section=fabric и
  // получают красный флаг, которого не заслуживают; разложи их — и флаг сам уйдёт туда, где ему
  // место, потому что назначение говорит роль, а секция — только вид товара.
  const isMainScope = (g: { scope: FabricScope<FabricLine> }) =>
    g.scope.byPurpose
      ? g.scope.key === 'TECH_CARD_BOM_PURPOSE_MAIN'
      : g.scope.lines[0]?.section === 'TECH_CARD_BOM_SECTION_FABRIC';
  const materialsWithoutDxf = scopeGroups.filter((g) => g.entries.length === 0 && isMainScope(g));
  const rollGoodsWithoutOwnDxf = scopeGroups.filter(
    (g) => g.entries.length === 0 && !isMainScope(g),
  );
  // Строки, чей size_id вне ряда карточки. Размер — артефакт хранения, но сервер всё равно
  // сверяет его с размерным рядом и отвергает такую строку, роняя ВЕСЬ сейв карточки.
  const outOfRange = entries.filter((e) => !inRange.has(e.row.sizeId ?? 0));
  const missingSizeNotes = scopeGroups.flatMap((g) => {
    if (g.entries.length === 0) return [];
    const missing = missingIn(audits[sigOf(g.entries)]);
    if (missing.length === 0) return [];
    return [`${scopeLabel(g.scope)} — нет ${missing.map(nameOf).join(', ')}`];
  });

  const canUpload = canEdit && uploadScopes.length > 0 && sizeIds.length > 0;

  // Drop path of the naming modal: pre-flight here (instant feedback, same guards the
  // server enforces), then stage the good files for naming + upload.
  function stageDrop(scopeKey: string, list: FileList | null) {
    // Array.from, not spread — FileList iteration needs lib dom.iterable, which tsconfig omits.
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const checked = files.map((f) => ({ f, err: patternFileError(f, { dxfOnly: true }) }));
    for (const x of checked) if (x.err) showMessage(`${x.f.name}: ${x.err}`, 'error');
    const good = checked.filter((x) => !x.err).map((x) => x.f);
    if (good.length > 0) setDroppedOn({ scopeKey, files: good });
  }

  async function runAudit(list: Entry[]) {
    const sig = sigOf(list);
    setAudits((a) => ({ ...a, [sig]: { phase: 'loading' } }));
    try {
      const pieces = await parsePiecesOnce(filesOf(list));
      // Токены, которые в ЭТИХ файлах оказались размерами — то же правило, по которому размер
      // отрезается от имени детали везде: хвост из словаря, меняющийся у своей основы.
      const found = splitPiecesBySize(pieces, dictTokens).sizeTokenSet;
      setAudits((a) => ({ ...a, [sig]: { phase: 'ready', found } }));
    } catch (e) {
      setAudits((a) => ({
        ...a,
        [sig]: {
          phase: 'error',
          message: e instanceof Error ? e.message : 'не удалось разобрать файлы',
        },
      }));
    }
  }

  // Загрузчик возвращает НЕПРОЗРАЧНЫЙ ключ скоупа: контрол живёт в ui/ и не обязан знать ни про
  // назначения, ни про строки BOM. Разворачивает его в два поля провода здесь — в одном месте, тем
  // же bindingForScope, которым пользуется и селект в строке.
  function toRow(p: UploadedPattern): Omit<UploadedPattern, 'scopeKey'> & {
    fabricPurpose: string;
    bomLineKey: string;
  } {
    const { scopeKey, ...rest } = p;
    const picked = scopes.find((x) => x.key === scopeKey);
    return { ...rest, ...(picked ? bindingForScope(picked) : { fabricPurpose: '', bomLineKey: '' }) };
  }

  function commitRename(index: number, value: string) {
    // '' is a legal committed value — it clears the name and the row falls back to the
    // filename (the save path still sends name explicitly, so the clear reaches the server).
    // setValue on the nested path, NOT useFieldArray.update: update() replaces the whole
    // row from the stale `fields` snapshot, reverting sibling fields written by other
    // controls, and remounts the row. Byte-clamped — the server counts UTF-8 bytes.
    setValue(`patterns.${index}.name`, clampPatternName(value), { shouldDirty: true });
    setEditing(null);
  }

  function renderRow({ row, index }: Entry) {
    const dxf = isDxfUrl(row.url);
    const rev = revisionOf(row);
    // When the file first landed, server-side and carried across saves. formatTechCardDate
    // answers '—' for the unset timestamp a just-uploaded row still carries; that dash reads as
    // data, so drop it instead.
    const uploaded = formatTechCardDate(row.uploadedAt);
    const uploadedOn = uploaded === '—' ? null : uploaded;
    const stray = !inRange.has(row.sizeId ?? 0);
    // Разрешённый скоуп строки: сначала назначение, иначе строка BOM — и с поправкой на то, что
    // строка могла с тех пор попасть в назначение. '' = ни к чему живому не ведёт.
    const rowScope = scopeKeyOfBinding(row.fabricPurpose, row.bomLineKey, scopes);

    return (
      <div key={row.lineKey || `row-${index}`} className='border-b border-hairline py-1'>
        {editing?.index === index ? (
          <Input
            name={`pattern-rename-${index}`}
            value={editing.value}
            placeholder={row.filename || 'название'}
            maxLength={MAX_PATTERN_NAME}
            autoFocus
            autoComplete='off'
            className='px-1 py-0 text-micro'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditing({ index, value: e.target.value })
            }
            onBlur={() => commitRename(index, editing.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename(index, editing.value);
              }
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        ) : (
          <div className='flex flex-wrap items-center gap-1.5'>
            <button
              type='button'
              onClick={() => setViewing(row)}
              title={`посмотреть ${labelOf(row)}`}
              className='min-w-0 flex-1 truncate text-left text-micro underline hover:opacity-70'
            >
              {labelOf(row)}
            </button>
            <span className='shrink-0 border border-textColor px-1 text-nano uppercase leading-snug tracking-label'>
              {dxf ? 'dxf' : 'pdf'}
            </span>
            {/* Уже загруженный PDF не ошибка и не поломка — он просто больше не тот формат, в
                котором заводят выкройки. Серый нейтральный тон, а не красный. */}
            {!dxf && <Pill tone='mut'>устаревший формат</Pill>}
            {stray && <Pill tone='warn'>размер вне ряда</Pill>}
            <Text size='nano' variant='label' component='span' className='shrink-0'>
              {[
                rev != null ? `v${rev}` : null,
                row.sizeBytes ? formatBytes(row.sizeBytes) : null,
                uploadedOn,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-label='rename pattern'
              title='переименовать'
              className='shrink-0'
              disabled={isSubmitting}
              onClick={() => setEditing({ index, value: row.name ?? '' })}
            >
              ✎
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-label='remove pattern'
              className='shrink-0'
              onClick={() => remove(index)}
            >
              ✕
            </Button>
          </div>
        )}
        {/* When a name is set the filename still matters (it is what the factory's CAD
            saved) — keep it readable underneath rather than only in a tooltip. */}
        {row.name && row.filename && editing?.index !== index && (
          <span className='block truncate text-nano text-labelColor'>{row.filename}</span>
        )}
        {stray && editing?.index !== index && (
          <div className='mt-0.5 flex flex-wrap items-center gap-1.5'>
            <Text size='nano' component='span' className='text-error'>
              размер этой строки не входит в ряд карточки — сервер отвергнет сохранение
            </Text>
            {canEdit && storageSizeId > 0 && (
              <Button
                type='button'
                variant='secondary'
                size='xs'
                title='перевесить строку на актуальный размер ряда (размер — только место хранения)'
                onClick={() =>
                  // Смена size_id — это keyed replacement: сервер перенумерует ревизию (MAX+1).
                  // Файл при этом тот же, и ни один потребитель размер строки не читает.
                  setValue(`patterns.${index}.sizeId`, storageSizeId, { shouldDirty: true })
                }
              >
                перевесить
              </Button>
            )}
          </div>
        )}
        {/* Cloth binding, editable in place. It has to be reachable after upload too: every DXF
            uploaded before 0260 has none, and without this the раскладка for those rows would stay
            a guess forever. Legacy PDFs are left alone — a sheet a human reads is not cut from
            anything.

            Пишутся ОБА поля разом, через bindingForScope: назначение — то, чем лист привязан, а
            строка едет рядом только когда назначение владеет ровно одной. Записать одно и оставить
            другое как было — это и есть способ получить лист, который в панели лежит в одной ткани,
            а на сервере разрешается в другую. */}
        {dxf && uploadScopes.length > 0 && editing?.index !== index && (
          <select
            className='mt-0.5 h-6 w-full border border-hairline bg-bgColor px-1 text-nano'
            aria-label={`материал для ${labelOf(row)}`}
            value={rowScope}
            disabled={isSubmitting || !canEdit}
            onChange={(e) => {
              const picked = scopes.find((x) => x.key === e.target.value);
              const b = picked ? bindingForScope(picked) : { fabricPurpose: '', bomLineKey: '' };
              setValue(`patterns.${index}.fabricPurpose`, b.fabricPurpose, { shouldDirty: true });
              setValue(`patterns.${index}.bomLineKey`, b.bomLineKey, { shouldDirty: true });
            }}
          >
            {/* ОДНА пустая опция, с разным текстом. Строка, чью привязку удалили или
                переклассифицировали, всё ещё несёт её в форме, и селект показывает пустое — но
                «материал не выбран» здесь читалось бы как «оператор не выбирал», а выбирал:
                выбор просто перестал на что-то указывать, и это разные новости. Две опции с одним
                value были бы хуже пустого текста — вторая недостижима, React берёт первую. */}
            <option value=''>
              {!rowScope && (!!row.bomLineKey || !!row.fabricPurpose)
                ? 'привязка потеряна — выберите заново'
                : 'материал не выбран'}
            </option>
            {uploadScopes.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  function renderAudit(list: Entry[]) {
    const sig = sigOf(list);
    const a = audits[sig];
    if (!a) {
      return (
        <Button
          type='button'
          variant='secondary'
          size='xs'
          title='скачать файлы и проверить, какие размеры карточки в них есть'
          onClick={() => runAudit(list)}
        >
          ⌕ размеры в файлах
        </Button>
      );
    }
    if (a.phase === 'loading') {
      return (
        <Text size='nano' variant='label' component='span'>
          разбор файлов…
        </Text>
      );
    }
    if (a.phase === 'error') {
      // Кнопка возвращается: одного сорвавшегося скачивания достаточно, чтобы проверка исчезла
      // навсегда для этого набора файлов, а причина обычно разовая.
      return (
        <span className='inline-flex items-center gap-1.5'>
          <Text size='nano' component='span' className='text-error'>
            проверка не удалась: {a.message}
          </Text>
          <Button type='button' variant='secondary' size='xs' onClick={() => runAudit(list)}>
            ещё раз
          </Button>
        </span>
      );
    }
    if (a.found.size === 0) {
      return (
        <Text size='nano' variant='label' component='span'>
          в именах блоков размеров нет — файл не градуирован
        </Text>
      );
    }
    const missing = missingIn(a);
    return missing.length === 0 ? (
      <Text size='nano' variant='label' component='span'>
        ✓ все размеры карточки есть в файлах
      </Text>
    ) : (
      <Text size='nano' component='span' className='text-error'>
        нет в файлах: {missing.map(nameOf).join(', ')}
      </Text>
    );
  }

  // Одна ткань: заголовок с назначением (или ролью нераспределённой строки), действия, строки
  // файлов. Вся зона — цель перетаскивания: вопрос «в какую ткань» единственный, который вообще
  // есть смысл задавать.
  function renderScope(g: (typeof scopeGroups)[number]) {
    const has = g.entries.length > 0;
    const key = g.scope.key;
    const label = scopeLabel(g.scope);
    const dragging = dragKey === key;
    // Раскладка мерит КОНКРЕТНЫЙ артикул: ширина и кромка приходят с пина колорвея на одну строку.
    // Поэтому запереть её на строку можно только когда назначение владеет ровно одной; иначе
    // модалка спрашивает сама — ровно как она уже делает для DXF без привязки.
    const soleLine = g.scope.lines.length === 1 ? g.scope.lines[0].lineKey : '';
    return (
      <div
        key={key}
        className={dragging ? 'outline outline-2 outline-textColor' : undefined}
        onDragOver={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragKey(key);
        }}
        onDragLeave={() => setDragKey((k) => (k === key ? null : k))}
        onDrop={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragKey(null);
          stageDrop(key, e.dataTransfer.files);
        }}
      >
        <GroupLabel
          action={
            <div className='flex flex-wrap items-center gap-1.5'>
              {has && renderAudit(g.entries)}
              {has && (
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  title={`авто-раскладка деталей «${label}» на полосе`}
                  onClick={() =>
                    setNesting({
                      // Размер тут ничего не решает: он выбирается внутри по именам блоков, и
                      // маркер сохраняется на выбранный. Это лишь запасной вариант для блока,
                      // чей хвост не опознался.
                      sizeId: g.entries[0]?.row.sizeId ?? storageSizeId,
                      files: filesOf(g.entries),
                      bomLineKey: soleLine,
                      // Направление СКОУПА, а не строки: назначение законно владеет несколькими
                      // артикулами, и согласованность их направлений никто не валидирует.
                      // Строгое побеждает — одна ворсовая в скоупе делает ворсовым весь скоуп,
                      // иначе маркер, законный для одной ткани, кладёт вторую ворсом к себе же.
                      //
                      // СЕМПЛОВЫЕ строки из ответа выброшены: сервер партиционирует скоуп по
                      // is_sample (0265, MarkerFabricScope), и непроставленное направление на
                      // семпловом рулоне иначе объявляло бы «НЕ ЗАДАНО» производственной
                      // раскладке, которую сервер принял бы. Если в скоупе ОДНА семпловая ярдажа
                      // и ничего больше — судим по ней, это и есть семпловая раскладка.
                      //
                      // Это ЗНАЧЕНИЕ НА СТАРТЕ: сохранить оператор может на любую тканевую строку
                      // карточки, и модалка пересчитывает направление по выбранному слоту сама.
                      fabricDirection: strictestDirection(
                        g.scope.lines.some((l) => !l.isSample)
                          ? g.scope.lines.filter((l) => !l.isSample)
                          : g.scope.lines,
                      ),
                    })
                  }
                >
                  ⌗ раскладка
                </Button>
              )}
              {/* Алиас пишется в скоуп ткани, и стор ОТКАЗЫВАЕТ паре (слот, блок), чей слот не
                  является живой тканевой строкой, — это уронило бы весь сейв карточки из-за
                  строки, до которой в интерфейсе не добраться. */}
              {has && canEdit && (
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  title={`сопоставить детали DXF с деталями кроя для «${label}»`}
                  onClick={() =>
                    setMatching({
                      scope: g.scope,
                      fabricName: label,
                      files: filesOf(g.entries),
                    })
                  }
                >
                  ↔ детали кроя
                </Button>
              )}
              {canUpload && (
                <PatternUploadButton
                  label='+ DXF'
                  dxfOnly
                  fabricScopes={uploadScopes}
                  defaultScopeKey={key}
                  onUploaded={(p) => append({ sizeId: storageSizeId, lineKey: ulid(), ...toRow(p) })}
                  // PatternUploadButton renders a page-sized Button; in a group header it has to
                  // sit at control density. It exposes no `size`, so density is applied here.
                  className='[&_button]:px-1.5 [&_button]:py-px [&_button]:text-nano [&_button]:tracking-label'
                />
              )}
            </div>
          }
        >
          {label}
        </GroupLabel>
        {has ? (
          g.entries.map(renderRow)
        ) : (
          <div className='space-y-0.5'>
            <Placeholder
              dashed
              tone={isMainScope(g) ? 'error' : undefined}
              label='нет dxf'
              className='py-3'
            />
            <Text
              size='nano'
              component='p'
              className={isMainScope(g) ? 'text-error' : 'text-labelColor'}
            >
              {isMainScope(g)
                ? 'раскроить этот материал нечем'
                : 'своего DXF нет — возможно, детали лежат в файле основной ткани'}
              {canUpload ? ' — перетащите DXF сюда или нажмите «+ DXF»' : ''}
            </Text>
          </div>
        )}
      </div>
    );
  }

  if (fields.length === 0 && sizeIds.length === 0 && fabricBomLines.length === 0) {
    return (
      <Text size='micro' variant='label'>
        задайте размерный ряд выше и строки ткани в BOM — выкройка привязывается к материалу, а
        размеры читаются из самого файла
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      <Text size='micro' variant='label'>
        выкройки — DXF, по МАТЕРИАЛАМ. Один чертёж несёт весь размерный ряд: размер записан в именах
        блоков, выбирается при просмотре и в раскладке, а недостающие размеры карточка добирает из
        файла сама. Поэтому файл привязывается к материалу — основная ткань, подкладка, бортовка,
        утеплитель, — и на один материал файлов может быть несколько (основная ткань и карманка это
        две разные строки BOM). Колорвей на файл не влияет — лекала общие, — но артикул и его ширину
        каждый колорвей подставляет свои.
      </Text>

      {/* Дыры вместо счётчика покрытия. «N из M размеров» мерило исчезнувшую сущность и
          показывало один файл на пять размеров как «1 из 5». */}
      {materialsWithoutDxf.length > 0 ||
      missingSizeNotes.length > 0 ||
      looseDxf.length > 0 ||
      outOfRange.length > 0 ? (
        <CalloutBox tone='error'>
          <div className='space-y-0.5'>
            {materialsWithoutDxf.length > 0 && (
              <Text size='micro' component='p'>
                <b>без DXF:</b> {materialsWithoutDxf.map((g) => scopeLabel(g.scope)).join('; ')}
              </Text>
            )}
            {rollGoodsWithoutOwnDxf.length > 0 && (
              <Text size='micro' variant='label' component='p'>
                своего DXF нет (возможно, в файле основной ткани):{' '}
                {rollGoodsWithoutOwnDxf.map((g) => scopeLabel(g.scope)).join('; ')}
              </Text>
            )}
            {missingSizeNotes.map((n) => (
              <Text key={n} size='micro' component='p'>
                <b>размеры:</b> {n}
              </Text>
            ))}
            {looseDxf.length > 0 && (
              <Text size='micro' component='p'>
                <b>без материала:</b> {looseDxf.length} DXF — раскладка и детали кроя для них
                недоступны
              </Text>
            )}
            {outOfRange.length > 0 && (
              <Text size='micro' component='p'>
                <b>вне размерного ряда:</b> {outOfRange.length} —{' '}
                {outOfRange.length === 1 ? 'строка отвергнет' : 'строки отвергнут'} сохранение
                карточки
              </Text>
            )}
          </div>
        </CalloutBox>
      ) : (
        fabricBomLines.length > 0 && (
          <Text size='micro' variant='label'>
            каждый материал карточки закрыт DXF. Размеры внутри файлов проверяются по кнопке — их
            знает только сам файл.
          </Text>
        )
      )}

      {fabricBomLines.length === 0 ? (
        <Text size='micro' variant='label'>
          в BOM нет строк ткани — выкройку не к чему привязать. Заведите основную ткань (и
          подкладку/бортовку/утеплитель, если они есть) на вкладке BOM.
        </Text>
      ) : (
        scopeGroups.map(renderScope)
      )}

      {sizeIds.length === 0 && fabricBomLines.length > 0 && (
        <Text size='micro' variant='label'>
          задайте размерный ряд выше, чтобы загружать выкройки: строка выкройки хранится с размером,
          и сервер сверяет его с рядом карточки
        </Text>
      )}

      {looseDxf.length > 0 && (
        <div>
          <GroupLabel>DXF без материала</GroupLabel>
          <Text size='nano' variant='label' className='mb-1'>
            залиты до появления привязки либо потеряли строку BOM. Выберите материал в строке — без
            него не считается ни ширина, ни кромка, и раскладка не знает, что меряет.
          </Text>
          {looseDxf.map(renderRow)}
        </div>
      )}

      {pdfEntries.length > 0 && (
        <div>
          <GroupLabel>PDF — устаревший формат</GroupLabel>
          <Text size='nano' variant='label' className='mb-1'>
            новые выкройки принимаются только в DXF: из PDF нельзя ни разложить детали, ни
            сопоставить их с деталями кроя, ни прочитать размер. Эти файлы остаются на карточке и
            сохраняются вместе с ней — их можно открыть и скачать; заменить их можно, загрузив DXF
            на нужный материал и удалив PDF.
          </Text>
          {pdfEntries.map(renderRow)}
        </div>
      )}

      {/* Naming modal for drops onto a material (click uploads carry their own inside the
          button). Размер не спрашивается: их в файле несколько. */}
      <PatternUploadModal
        files={droppedOn?.files ?? null}
        onClose={() => setDroppedOn(null)}
        onUploaded={(p) => append({ sizeId: storageSizeId, lineKey: ulid(), ...toRow(p) })}
        fabricScopes={uploadScopes}
        defaultScopeKey={droppedOn?.scopeKey}
        dxfOnly
      />

      {/* In-app PDF viewer, kept for the legacy rows: the browser renders the sheet inside the
          modal; a fallback link opens it in a new tab if the storage host refuses to be framed. */}
      <ConfirmationModal
        open={viewing != null && !isDxfUrl(viewing.url)}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        onConfirm={() => setViewing(null)}
        title={viewing ? labelOf(viewing) : 'выкройка'}
        width='lg'
        hideActions
      >
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label' component='span' className='min-w-0 flex-1 truncate'>
              {viewing?.filename}
              {viewing?.sizeBytes ? ` · ${formatBytes(viewing.sizeBytes)}` : ''}
            </Text>
            <Button asChild variant='secondary' size='xs'>
              <a href={viewing?.url || '#'} target='_blank' rel='noopener noreferrer'>
                open in new tab
              </a>
            </Button>
          </div>
          <iframe
            src={viewing?.url}
            title={viewing ? labelOf(viewing) : 'выкройка'}
            className='h-[75vh] w-full border border-borderColor bg-bgColor'
          />
        </div>
      </ConfirmationModal>

      {/* Просмотр DXF — НАШИМ листом, с выбором размера и слоёв. WebGL-вьювер рисовал файл
          целиком, а градуированный чертёж это пять размеров сразу: каша, в которой ничего не
          разобрать, и никакого способа посмотреть один размер. Здесь та же геометрия, по
          которой считается раскладка, так что увиденное и посчитанное не расходятся. */}
      {viewing && isDxfUrl(viewing.url) && (
        <Suspense fallback={null}>
          <DxfSheetViewer
            files={[{ name: labelOf(viewing), url: viewing.url! }]}
            title={labelOf(viewing)}
            onClose={() => setViewing(null)}
          />
        </Suspense>
      )}

      {/* Раскладка (nesting) — the whole feature is a lazy chunk; mounted only when open. */}
      {nesting && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля раскладки…
            </Text>
          }
        >
          <NestingModal
            files={nesting.files}
            sizeLabel=''
            sizeIdByToken={sizeIdByToken}
            techCardId={techCardId}
            sizeId={nesting.sizeId}
            bomLines={fabricBomLines}
            colorways={colorwayOptions}
            lockedBomLineKey={nesting.bomLineKey || undefined}
            fabricDirection={nesting.fabricDirection}
            canEdit={canEdit}
            savedSizeIds={savedSizeIds}
            season={season}
            styleNumber={styleNumber}
            onClose={() => setNesting(null)}
          />
        </Suspense>
      )}

      {/* Сопоставление блоков DXF с деталями кроя — тот же ленивый чанк (общий воркер разбора). */}
      {matching && (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              загрузка модуля разбора DXF…
            </Text>
          }
        >
          <PieceMatchModal
            files={matching.files}
            scope={matching.scope}
            fabricName={matching.fabricName}
            scopeLabelByKey={scopeLabelByKey}
            sizeLabel=''
            onClose={() => setMatching(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
