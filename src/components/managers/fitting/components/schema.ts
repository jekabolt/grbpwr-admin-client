import { clampPatternName } from 'utils/pattern';
import {
  common_Fitting,
  common_FittingInsert,
  common_FittingStatus,
  common_FittingVerdict,
} from 'api/proto-http/admin';
import { ZERO_TIMESTAMP } from 'components/managers/fittings/components/utils';
import {
  ANNOTATION_COLOR_KEYS,
  ANNOTATION_KIND_KEYS,
  annotationColorFromWire,
  annotationColorToWire,
  annotationKindFromWire,
  annotationKindToWire,
} from 'ui/components/annotation/wire';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import { z } from 'zod';
import { normalizeFittingZone } from './zone-options';

// The per-size fit-note UI is gone; sizes is derived from the linked sample (see
// mapFormToFittingInsert) and carries only its sizeId. fitNote lives on the proto
// (common_FittingSizeInsert) but is set once at the wire boundary, not in the form.
const fittingSizeSchema = z.object({
  sizeId: z.number().int().min(1, 'Pick a size'),
});

// The iteration выкройка actually tried on in this fitting (a snapshot, independent of the
// card's final pattern), PDF or DXF by url extension. sizeId is optional here: 0 = not
// tied to a specific size.
const fittingPatternSchema = z.object({
  sizeId: z.number().int().optional().default(0),
  url: z.string().optional().default(''),
  filename: z.string().optional().default(''),
  // Display name; '' = unnamed. Sent explicitly on save (see the tech-card patternSchema).
  name: z.string().optional().default(''),
  sizeBytes: z.number().optional().default(0),
});

// Якорь фигуры — доли кадра 0..1, СТРОКОЙ: тот же decimal, что на проводе и в колонке, круговой
// рейс без округлений. То же правило, что у выносок тех-карты.
const fittingAnnotationPointSchema = z.object({
  x: z.string().default('0'),
  y: z.string().default('0'),
});

// A numbered marker pinned onto a fitting photo, flagging what is wrong with the
// fit at a point on the image. posX/posY are normalised (0..1) strings while in
// the form (like the tech-card callouts) — converted to Decimal at the boundary.
const fittingCalloutSchema = z.object({
  number: z.number().int().optional().default(0),
  note: z.string().optional().default(''),
  mediaId: z.number().int().optional().default(0), // FK media(id); 0 = unanchored
  posX: z.string().optional().default(''),
  posY: z.string().optional().default(''),
  // ГЕОМЕТРИЯ УКАЗАНИЯ (0319) — ТОТ ЖЕ реестр видов, что у эскиза, потому что ремесло одно:
  // мерка между двумя точками, скобка над участком, обведённая зона заломов. `posX/posY`
  // сохраняют смысл «где стоит нумерованный маркер» (на него ссылается номером замечание), а
  // `points` держит якоря фигуры и у пина пуст.
  kind: z.enum(ANNOTATION_KIND_KEYS).optional().default('pin'),
  points: z.array(fittingAnnotationPointSchema).optional().default([]),
  color: z.enum(ANNOTATION_COLOR_KEYS).optional().default(''),
  // Пунктир и штриховка входят в АТОМАРНУЮ группу присутствия вместе с `kind`: бандл,
  // промолчавший про вид, молчит про всю фигуру, и сервер несёт хранимую дальше целиком.
  dashed: z.boolean().optional().default(false),
  filled: z.boolean().optional().default(false),
});

// The structured "what to change" work list a fitting produces (S26). target is the change CATEGORY;
// zone + pieceIds are the structured LOCATION; status (open|resolved) replaces the legacy boolean;
// carriedFromId links an item to the one in the previous round it continues.
const fittingChangeRequestSchema = z.object({
  id: z.number().int().optional().default(0),
  target: z.string().optional().default(''),
  note: z.string().optional().default(''),
  calloutNumber: z.number().int().optional().default(0),
  zone: z.string().optional().default(''),
  pieceIds: z.array(z.number().int()).optional().default([]),
  status: z.string().optional().default('open'),
  carriedFromId: z.number().int().optional().default(0),
});

// The pieces a stored remark points at. pieceIds is authoritative; the deprecated single pieceId is
// read as a one-element fallback so rows served by a backend older than migration 0256 (or fetched
// from a cache primed before it) still show their pin.
export function crPieceIds(cr: { pieceIds?: number[]; pieceId?: number }): number[] {
  if (cr.pieceIds?.length) return cr.pieceIds.filter((id) => id > 0);
  return cr.pieceId ? [cr.pieceId] : [];
}

export const fittingSchema = z
  .object({
    // A fitting anchors to the tech card (style) and its sample — a fitting tries a SAMPLE, not a
    // catalogue product. productId is a legacy anchor kept for old records; new fittings require a
    // tech card and link the sample tried on.
    productId: z.number().int().optional().default(0), // 0 = unset (legacy; not surfaced in the editor)
    techCardId: z.number().int().optional().default(0), // optional link to the tech card (style)
    sampleId: z.number().int().optional().default(0), // optional link to the specific sample tried on
    modelId: z.number().int().optional().default(0),
    fittingDate: z.string().optional().default(''), // YYYY-MM-DD in the UI
    comment: z.string().optional().default(''),
    status: z.string().optional().default('FITTING_STATUS_PLANNED'),
    verdict: z.string().optional().default('FITTING_VERDICT_PENDING'),
    recordedBy: z.string().optional().default(''),
    sizes: z.array(fittingSizeSchema).default([]),
    patterns: z.array(fittingPatternSchema).default([]),
    mediaIds: z.array(z.number()).default([]),
    callouts: z.array(fittingCalloutSchema).default([]),
    // §4 round tracking: sequence number (0 = server auto-assigns per tech card), structured
    // outcome ('undecided' sentinel in the form ↔ '' on the wire), and the change-request work list.
    roundNumber: z.number().int().optional().default(0),
    outcome: z.string().optional().default('undecided'),
    changeRequests: z.array(fittingChangeRequestSchema).default([]),
  })
  .refine((data) => !!data.techCardId, {
    message: 'Укажите тех карту (примерка делается по её сэмплу)',
    path: ['techCardId'],
  })
  // A fitting measures a SAMPLE — there is nothing to try on without one, so both the tech card and
  // the sample are required (the sample is picked once a tech card is chosen).
  .refine((data) => !!data.sampleId, {
    message: 'Выберите сэмпл — примерка делается на конкретном сэмпле',
    path: ['sampleId'],
  });

export type FittingFormData = z.input<typeof fittingSchema>;

export const fittingDefaultData: FittingFormData = {
  productId: 0,
  techCardId: 0,
  sampleId: 0,
  modelId: 0,
  fittingDate: '',
  comment: '',
  status: 'FITTING_STATUS_PLANNED',
  verdict: 'FITTING_VERDICT_PENDING',
  recordedBy: '',
  sizes: [],
  patterns: [],
  mediaIds: [],
  callouts: [],
  roundNumber: 0,
  outcome: 'undecided',
  changeRequests: [],
};

export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function timestampToDateInput(timestamp?: string): string {
  if (!timestamp || timestamp === ZERO_TIMESTAMP) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function dateInputToTimestamp(value?: string): string {
  if (!value) return ZERO_TIMESTAMP;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return ZERO_TIMESTAMP;
  return date.toISOString();
}

// outcomeToVerdict derives the wire verdict from the structured round outcome (they encoded the same
// decision; the UI now asks only outcome). undecided→pending, approved→approved, new round→needs
// rework, dropped→rejected.
function outcomeToVerdict(outcome?: string): common_FittingVerdict {
  switch (outcome) {
    case 'approved':
      return 'FITTING_VERDICT_APPROVED';
    case 'new_round':
      return 'FITTING_VERDICT_NEEDS_REWORK';
    case 'dropped':
      return 'FITTING_VERDICT_REJECTED';
    default:
      return 'FITTING_VERDICT_PENDING';
  }
}

export function mapFittingToForm(fitting: common_Fitting): FittingFormData {
  const insert = fitting.fitting;
  return {
    productId: insert?.productId || 0,
    techCardId: insert?.techCardId || 0,
    sampleId: insert?.sampleId || 0,
    modelId: insert?.modelId || 0,
    fittingDate: timestampToDateInput(insert?.fittingDate),
    comment: insert?.comment || '',
    status:
      insert?.status && insert.status !== 'FITTING_STATUS_UNKNOWN'
        ? insert.status
        : 'FITTING_STATUS_PLANNED',
    verdict:
      insert?.verdict && insert.verdict !== 'FITTING_VERDICT_UNKNOWN'
        ? insert.verdict
        : 'FITTING_VERDICT_PENDING',
    recordedBy: insert?.recordedBy || '',
    sizes: (insert?.sizes ?? []).map((s) => ({
      sizeId: s.sizeId || 0,
    })),
    patterns: (insert?.patterns ?? []).map((p) => ({
      sizeId: p.sizeId || 0,
      url: p.url || '',
      filename: p.filename || '',
      name: p.name ?? '',
      // int64 → string from grpc-gateway; coerce so z.number() doesn't block save
      sizeBytes: Number(p.sizeBytes) || 0,
    })),
    // СОСТАВ СНИМКОВ — ОБЪЕДИНЕНИЕ ОБОИХ ИСТОЧНИКОВ, а не «первый непустой».
    //
    // Здесь стояло `fitting.media?.map(...) ?? insert?.mediaIds ?? []`, и `??` на МАССИВЕ падает
    // только на null/undefined: пришедший с провода `"media": []` (grpc-gateway отдаёт пустые
    // списки явно, EmitUnpopulated) — это уже массив, поэтому `insert.mediaIds` не читался
    // никогда. Форма получала пустой состав, а следующее сохранение отправляло его на сервер,
    // то есть ОТВЯЗЫВАЛО фотографии совсем. Разойтись эти два поля на чтении сегодня не могут
    // (сервер строит их одним проходом), но цена ошибки здесь — потерянные снимки, а цена
    // страховки — три строки.
    mediaIds: [
      ...new Set([
        ...(insert?.mediaIds ?? []),
        ...(fitting.media ?? []).map((m) => m.id).filter((id): id is number => id != null),
      ]),
    ],
    callouts: (insert?.callouts ?? []).map((c) => ({
      number: c.number || 0,
      note: c.note || '',
      mediaId: c.mediaId || 0,
      posX: decimalToInput(c.posX),
      posY: decimalToInput(c.posY),
      // Вид приезжает ВСЕГДА (сервер отдаёт присутствующее поле), но `annotationKindFromWire`
      // всё равно падает в пин на неизвестном значении: примерка, записанная до 0319, обязана
      // прочитаться тем, чем была.
      kind: annotationKindFromWire(c.kind),
      points: (c.points ?? []).map((pt) => ({
        x: decimalToInput(pt.x) || '0',
        y: decimalToInput(pt.y) || '0',
      })),
      color: annotationColorFromWire(c.color),
      dashed: !!c.dashed,
      filled: !!c.filled,
    })),
    roundNumber: insert?.roundNumber || 0,
    // '' on the wire → the non-empty 'undecided' sentinel the Select needs
    outcome: insert?.outcome || 'undecided',
    changeRequests: (insert?.changeRequests ?? []).map((cr) => ({
      id: cr.id || 0,
      target: cr.target || '',
      note: cr.note || '',
      calloutNumber: cr.calloutNumber || 0,
      zone: normalizeFittingZone(cr.zone),
      pieceIds: crPieceIds(cr),
      // status (open|resolved) is authoritative; fall back to the legacy boolean for old rows.
      status: cr.status || (cr.resolved ? 'resolved' : 'open'),
      carriedFromId: cr.carriedFromId || 0,
    })),
  };
}

export function mapFormToFittingInsert(
  data: FittingFormData,
  original?: common_FittingInsert,
  // The single size actually tried on, resolved from the linked sample (task 2). A fitting
  // tries ONE sample and that sample already carries its own sizeId — the old UI let you pick
  // a separate multi-size list that could disagree with it, so sizes is now always derived
  // from the sample instead of read from the (no-longer-editable) form field. 0/undefined =
  // sample has no size set → sizes saves empty, which the contract allows.
  sampleSizeId?: number,
): common_FittingInsert {
  return {
    // Spread the loaded insert first so fields not yet managed by the form survive
    // the full-replace save (mirrors mapFormToTechCardInsert).
    ...original,
    sampleId: data.sampleId || 0, // new-flow sample link (form-managed, W3.4)
    productId: data.productId || 0,
    techCardId: data.techCardId || 0,
    modelId: data.modelId || 0,
    fittingDate: dateInputToTimestamp(data.fittingDate),
    comment: data.comment?.trim() || '',
    status: (data.status || 'FITTING_STATUS_UNKNOWN') as common_FittingStatus,
    // verdict is no longer a separate field — it was the same decision as `outcome` asked twice and
    // could contradict. It is derived from the structured outcome so the wire contract still carries it.
    verdict: outcomeToVerdict(data.outcome),
    recordedBy: data.recordedBy?.trim() || '',
    // common_FittingSizeInsert requires the fitNote key (proto: `fitNote: string | undefined`),
    // so send it once here at the wire boundary — always '' now that the per-size fit-note UI is
    // gone — rather than carrying a dead, hard-coded field through the form schema.
    sizes: sampleSizeId ? [{ sizeId: sampleSizeId, fitNote: '' }] : [],
    patterns: (data.patterns ?? [])
      .filter((p) => p.url?.trim())
      .map((p) => ({
        sizeId: p.sizeId || 0,
        url: p.url?.trim() || '',
        filename: p.filename?.trim() || '',
        // Explicit even when '' — absence is the stale-client signal (server keeps the old name).
        name: clampPatternName(p.name ?? ''),
        sizeBytes: p.sizeBytes || 0,
        // OUTPUT-ONLY токенизированные ссылки чтения (Ф7): сервер их отдаёт и на записи
        // ИГНОРИРУЕТ. Ключ существует только потому, что генератор объявляет его обязательным;
        // undefined не сериализуется, и до провода не доедет ничего.
        viewUrl: undefined,
        downloadUrl: undefined,
      })),
    mediaIds: data.mediaIds ?? [],
    // УЕЗЖАЮТ ВСЕ УКАЗАНИЯ, ВКЛЮЧАЯ БЕЗЫМЯННЫЕ. Здесь стоял фильтр `.filter(c => c.note?.trim())`:
    // сервер требовал записку у КАЖДОЙ выноски, и обойти отказ, роняющий сохранение всей примерки,
    // можно было только выбросив безымянную. Ценой того, что человек обводит зону заломов,
    // сохраняет — и зоны нет: молчаливая потеря нарисованного руками.
    //
    // Правило сервера теперь другое: записка обязательна ТОЛЬКО У ПИНА, потому что у пина текст и
    // есть всё содержание, а у фигуры содержание — сама фигура. Требовать подпись к обведённой зоне
    // значит требовать подпись к предложению. Отсеивать здесь больше нечего и незачем.
    //
    // ИНДЕКС ПОСЫЛКИ ТЕПЕРЬ РАВЕН ИНДЕКСУ ФОРМЫ, и на это опирается разбор отказа: сервер называет
    // поле как `callouts[3].note`, и форма сажает ошибку на `callouts.3.note` (см. index.tsx).
    // Вернуть сюда любой фильтр — значит сдвинуть нумерацию и посадить отказ на ЧУЖУЮ заметку.
    callouts: (data.callouts ?? [])
      .map((c, i) => ({
        number: c.number || i + 1,
        // Пусто — значит ПУСТО, а не строка из пробелов: `«   »` прошло бы клиентскую проверку
        // «текст есть» и приехало бы на сервер записью, которую не видно и не найти поиском.
        note: c.note?.trim() || '',
        mediaId: c.mediaId || 0,
        posX: inputToDecimal(c.posX),
        posY: inputToDecimal(c.posY),
        // ВИД ШЛЁТСЯ ВСЕГДА, круговым рейсом прочитанного. Присутствие поля и есть заявление «этот
        // бандл про геометрию знает»: сервер, увидев молчание, несёт хранимую геометрию дальше — и
        // переносит её по номеру + снимку + ОБЕИМ координатам маркера, поэтому промолчать здесь
        // означало бы заморозить чужие фигуры навсегда. Группа атомарна: вместе с видом уезжают
        // якоря, цвет, пунктир и штриховка — вид без якорей достался бы точками прошлой правки.
        kind: annotationKindToWire(c.kind),
        points: (c.points ?? []).map((pt) => ({
          x: inputToDecimal(pt.x),
          y: inputToDecimal(pt.y),
        })),
        color: annotationColorToWire(c.color),
        dashed: !!c.dashed,
        filled: !!c.filled,
      })),
    // §4 round tracking (form-managed). roundNumber 0 = server auto-assigns per tech card;
    // the 'undecided' sentinel maps back to '' on the wire.
    roundNumber: data.roundNumber || 0,
    outcome: data.outcome === 'undecided' ? '' : data.outcome?.trim() || '',
    // Change requests (S26): CREATE sends the form's structured initial batch. On EDIT they are
    // create-only on the wire — managed individually via Add/Update/DeleteFittingChangeRequest
    // (the change-requests-fields.tsx editor uses those RPCs, so nothing is lost). UpdateFitting
    // REJECTS any change_requests payload, so omit the key entirely: `undefined` overrides the
    // `...original` spread above and JSON.stringify drops it, so the backend never sees a
    // change_requests field (a JSON `[]` would unmarshal to a non-nil empty slice in Go).
    changeRequests: original
      ? undefined
      : (data.changeRequests ?? [])
          .filter((cr) => cr.note?.trim() || cr.target?.trim())
          .map((cr) => {
            const status = cr.status || 'open';
            return {
              id: cr.id || 0,
              target: cr.target?.trim() || '',
              note: cr.note?.trim() || '',
              calloutNumber: cr.calloutNumber || 0,
              resolved: status === 'resolved',
              zone: normalizeFittingZone(cr.zone),
              pieceIds: cr.pieceIds ?? [],
              pieceId: 0, // deprecated on the wire; pieceIds is authoritative
              status,
              carriedFromId: cr.carriedFromId || 0,
              createdBy: '',
              fittingId: 0,
              roundNumber: 0,
            };
          }),
  };
}
