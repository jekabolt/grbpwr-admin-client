// Adapters between the nesting run (lib/nesting/types) and the persisted tech-card marker
// (common_TechCardMarker*). Main-thread-safe: imports only types.ts and generated API types,
// so it may live in the lazy nesting chunk AND be imported by costing/recipe code without
// dragging dxf-parser/clipper into the main bundle.
import type {
  common_TechCardMarker,
  common_TechCardMarkerLayout,
  common_TechCardMarkerSummary,
  googletype_Decimal,
} from 'api/proto-http/admin';
import type { NestConfig, NestResult, PieceDTO, RotationDeg, Unit } from 'lib/nesting/types';

// The BOM fabric line as the marker features need it — a projection of the card form's
// bomItems rows (strings exactly as the form holds them). `id` is the server PK: 0 means
// the row was added in the UI but the card was never saved — the backend cannot resolve
// its line_key yet, so a marker must not link to it.
export type MarkerBomLine = {
  id: number;
  lineKey: string;
  name: string;
  unit: string;
  fabricWidth: string;
  wastagePercent: string;
  // READ-ONLY enrichment from the card read (0259). effectiveFabricWidthCm is the FULL roll
  // width to prefill; selvedgeCm is the кромка per edge, snapshotted onto the marker so the
  // waste decomposition stays auditable after the material changes. '' = unknown.
  effectiveFabricWidthCm: string;
  selvedgeCm: string;
  // The BOM family this line belongs to, as a word the operator reads («подкладка»). '' when the
  // caller does not classify. Load-bearing rather than decorative: since a раскладка binds to any
  // roll-goods line, one card can hold «Cupro 90» as lining AND as pocket-bag cloth, and a select
  // showing the article name alone offers two identical options — while THIS select is the one
  // that decides which BOM line the measured length lands on.
  role?: string;
  // Что нужно, чтобы ответить «какое полотно судит раскладку на ЭТОЙ строке» — то есть чтобы
  // позвать markerScopeDirection (bom-purpose.ts, копия серверного MarkerFabricScope). Направление
  // нельзя взять с одной строки: назначение владеет несколькими артикулами и строгое побеждает, а
  // семпловая ярдажа в скоуп не входит вовсе. Раньше эти три поля в модалку не доезжали, и она
  // показывала направление, посчитанное ОДИН РАЗ на старте по группе DXF, — тогда как сохранить
  // оператор может на любую тканевую строку карточки, и скоуп у неё другой.
  purpose?: string;
  fabricDirection?: string;
  isSample?: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Newest-first comparator shared by every «latest marker» pick — one clock, one rule
// (whole-second RFC3339 strings compare fine lexicographically; localeCompare keeps
// same-second ties deterministic).
export function newerMarker(
  a: common_TechCardMarkerSummary,
  b: common_TechCardMarkerSummary,
): number {
  return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
}

// Meaningful download name: SEASON-STYLE-размер-ткань-маркер.ext, empty segments omitted,
// path-hostile characters replaced. Cyrillic is kept as-is (владелец: не транслитерировать).
export function exportFileName(parts: Array<string | undefined>, ext: string): string {
  const clean = parts
    .map((p) => (p ?? '').trim().replace(/\.(dxf|pdf|svg)$/i, ''))
    .filter(Boolean)
    .map((p) => p.replace(/[\\/:*?"<>|#%\s]+/g, ' ').trim().replace(/\s+/g, '_'));
  return `${clean.join('-') || 'раскладка'}.${ext}`;
}

// google.type.Decimal encode/decode for marker figures (2 decimals is the storage scale).
export function dec(n: number): googletype_Decimal {
  return { value: String(r2(n)) };
}
export function decNum(d?: googletype_Decimal): number {
  const n = Number(d?.value ?? '');
  return Number.isFinite(n) ? n : 0;
}

// Fabric per ONE garment, cm — prefers the server-derived figure, falls back to the raw
// division so an optimistic row (not yet refetched) still shows a number.
export function consumptionCm(s: common_TechCardMarkerSummary): number {
  const derived = decNum(s.consumptionPerUnitCm);
  if (derived > 0) return derived;
  const sets = Math.max(1, s.sets ?? 1);
  return r2(decNum(s.usedLengthCm) / sets);
}

// Marker cm → the BOM line's unit. The unit is free text — convert ONLY what is
// unambiguous (design §3: не угадывать). null = the line's unit cannot take a layout.
export function toBomUnit(cm: number, unit?: string): { value: number; unit: string } | null {
  const u = (unit ?? '').trim().toLowerCase();
  // 3 decimals: tech_card_colorway_usage.consumption is DECIMAL(10,3) — r2 on metres
  // throws away a digit the column holds (4+ m lost per 1000 units).
  if (u === 'м' || u === 'm') return { value: r3(cm / 100), unit: u };
  if (u === 'см' || u === 'cm') return { value: r2(cm), unit: u };
  return null;
}

// Waste decomposition of a marker-measured norm, in percent OF THE PIECE AREA (0261) — the
// scale the wire and the costing display use. Both components are explanation, never a
// multiplier: the marker's own length already paid for them.
//
//   piece area   = efficiency × W × L        (W = cutting width, L = used length)
//   inter-piece  = W×L − piece area          → 1/efficiency − 1
//   кромка       = 2×selvedge × L            → 2×selvedge / (efficiency × W)
//
// null when the marker records no efficiency (a hand-built or imported layout): the norm is
// still marker-sourced — costing must still skip the gross-up — we just cannot say how the
// length splits, and inventing a split would be worse than leaving it blank.
export function markerWasteDecomposition(
  m: common_TechCardMarkerSummary,
): { selvedgePct: number; cutPct: number } | null {
  const eff = decNum(m.efficiencyPct) / 100;
  const w = decNum(m.fabricWidthCm);
  if (!(eff > 0) || !(w > 0)) return null;
  const selvedge = decNum(m.selvedgeCm);
  // Both components legitimately exceed 100% — the cut component is 1/efficiency − 1, so any
  // раскладка under 50% wastes more cloth than it turns into pieces. The server's ceiling is
  // 1000% (0263) and it REJECTS the whole recipe save above it, so clamp here rather than let a
  // nonsense width take the operator's save down with it.
  const clamp = (v: number) => (v < 0 ? 0 : v > 1000 ? 1000 : r2(v));
  return {
    selvedgePct: clamp(((2 * selvedge) / (eff * w)) * 100),
    cutPct: clamp((1 / eff - 1) * 100),
  };
}

export function markersForLine(
  markers: common_TechCardMarkerSummary[] | undefined,
  lineKey: string,
): common_TechCardMarkerSummary[] {
  if (!lineKey) return [];
  return (markers ?? []).filter((m) => (m.bomLineKey ?? '') === lineKey);
}

// Раскладки, относящиеся к ОДНОМУ колорвею: его собственные плюс общие.
//
// Раскладка меряется на КОНКРЕТНОМ полотне — колорвей называет артикул, у артикула своя ширина, —
// и длина, снятая на 140 см, к артикулу 150 см просто не относится. Предложить её всё равно
// значит выдать правдоподобное неверное число, а такие глазом не ловятся. Маркеры с colorway_id 0
// (унаследованные и те, где ширина у всех одна) остаются общими: отбросить их значило бы спрятать
// всё, что снято до 0264.
//
// Фильтр живёт ЗДЕСЬ и применяется на входе в редактор рецепта конкретного колорвея. Полоса
// расхода на вкладке костинга — карточная, не колорвейная, и фильтровать её этим нельзя.
export function markersOfColorway(
  markers: common_TechCardMarkerSummary[] | undefined,
  colorwayId: number,
): common_TechCardMarkerSummary[] {
  if (!colorwayId) return markers ?? [];
  return (markers ?? []).filter((m) => {
    const own = Number(m.colorwayId ?? 0);
    return own === 0 || own === colorwayId;
  });
}

// Какой из двух маркеров ЛУЧШЕ для данного колорвея: сперва принадлежность, потом дата.
//
// Одной фильтрации мало. Отобрав «свои плюс общие», выбирать между ними по updatedAt значит
// разрешить свежему ОБЩЕМУ маркеру перебить собственный маркер колорвея — а общий снят на
// дефолтной ширине слота, тогда как собственный снят на артикуле, который этот колорвей реально
// закупает. Именно эту подмену колонка colorway_id и заводилась предотвращать, и заметить её
// нечем: длина отличается ровно настолько, насколько отличаются ширины.
export function betterMarker(colorwayId: number) {
  const own = (m: common_TechCardMarkerSummary) =>
    colorwayId && Number(m.colorwayId ?? 0) === colorwayId ? 0 : 1;
  return (a: common_TechCardMarkerSummary, b: common_TechCardMarkerSummary): number =>
    own(a) - own(b) || newerMarker(a, b);
}

// Лучший маркер на каждый размер для одной строки BOM — источник для применения по размерам.
export function latestPerSize(
  markers: common_TechCardMarkerSummary[],
  colorwayId = 0,
): Map<number, common_TechCardMarkerSummary> {
  const better = betterMarker(colorwayId);
  const bySize = new Map<number, common_TechCardMarkerSummary>();
  for (const m of markers) {
    const sid = m.sizeId ?? 0;
    if (!sid) continue;
    const prev = bySize.get(sid);
    if (!prev || better(m, prev) < 0) bySize.set(sid, m);
  }
  return bySize;
}

// ── run → layout ────────────────────────────────────────────────────────────────────────

export function buildMarkerLayout(args: {
  pieces: PieceDTO[];
  // per-set quantity per piece id (the modal's sel state, WITHOUT the sets multiplier).
  perSetQty: Map<number, number>;
  // uploaded-file url by source label, provenance only.
  urlBySource: Map<string, string>;
  result: NestResult;
  unit: Exclude<Unit, 'auto'>;
  config: Pick<NestConfig, 'targetLengthCm' | 'rdpEpsCm' | 'timeBudgetMs'>;
  tol: number;
  tolChain: number;
  // Parse-time warnings (failed fetches, unit overrides, dropped loops) — they describe
  // the data the marker was BUILT from, so they must survive into the blob (a marker that
  // silently omits «файл не скачался» reads as a clean complete norm).
  parseWarnings?: string[];
  // Cut-piece identity per parsed piece id (schema v2): the resolved TechCardPiece.line_key,
  // so the marker survives a piece rename. Absent/'' = unresolved, and the reader falls back
  // to the block name saved on the piece.
  pieceLineKeyById?: Map<number, string>;
}): common_TechCardMarkerLayout {
  const { pieces, perSetQty, urlBySource, result, unit, config } = args;
  const used = new Set(result.placements.map((p) => p.pieceId));
  // v2 said "pieces carry block_name AND/OR piece_line_key" — never which — and was claimed only
  // when the blob really carried one of the two. That conditional claim is gone with v3, and the
  // reason it can go is the rule it always rested on: a READER BRANCHES ON THE FIELD IT NEEDS,
  // NEVER ON THE NUMBER. Markers written before the matching dialog existed carry block_name only,
  // and resolving them through an empty piece_line_key would lose the name they did save — so no
  // reader was ever entitled to infer a field's presence from the version, and none does.
  // v3 = the writer KNOWS THE FLIP POLICY: it derives its rotation set from the cloth's
  // направление (lib/nesting/types.ts allowedRotations), so it never lays a piece upside down on
  // cloth that forbids it, and its placements can express a mirror (`flipped`).
  //
  // ЧТО ВЕРСИЯ НА САМОМ ДЕЛЕ РЕШАЕТ НА СЕРВЕРЕ — и это НЕ то, что здесь было написано раньше.
  // Тут стояло «сервер судит повороты только начиная с v3» и «клиент, продолжающий писать v2,
  // оставил бы всю защиту мёртвой». Обе фразы неверны для развёрнутого бэкенда, и обе опасны: они
  // подсказывают следующему читателю, что номером версии можно управлять политикой.
  //
  //   • Правило про 180°/зеркало (ValidateMarkerFabricDirection) НЕ СМОТРИТ на версию пэйлоада
  //     вовсе. Оно отказывает по направлению ткани одинаково любому блобу.
  //   • Дедовщина (grandfathering) для старых раскладок ключуется НЕ пэйлоадом, а колонкой
  //     layout_schema_version уже лежащей в базе строки, и колонка эта — ПОКОЛЕНИЕ ПОЛИТИКИ,
  //     серверная константа, а не копия того, что прислал клиент. Ровно затем: копирование
  //     пэйлоада делало освобождение подделываемым в один запрос (создать чистый маркер с v1,
  //     следующим апдейтом дописать в него 180°).
  //   • Версия load-bearing РОВНО ДЛЯ ОДНОГО: FlipPredatesSchema. Зеркало в блобе, заявившем
  //     версию младше 3, — это невозможный пэйлоад (поля тогда не существовало), и он отвергается
  //     для КАЖДОГО маркера, привязанного к ткани или нет.
  //
  // Заявлять 3 безусловно всё равно правильно: этот писатель действительно умеет зеркало, и
  // именно это версия и означает. Просто цена ошибки тут не «защита умерла», а «зеркало не
  // сохранить».
  //
  // The version ladder stays cumulative and the identity rule above is unchanged: a reader still
  // branches on the FIELD it needs, never on the number.
  return {
    schemaVersion: 3,
    params: {
      unit,
      tolCm: args.tol,
      tolChainCm: args.tolChain,
      rdpEpsCm: config.rdpEpsCm,
      targetLengthCm: config.targetLengthCm ?? 0,
      timeBudgetS: Math.round(config.timeBudgetMs / 1000),
    },
    pieces: pieces
      .filter((p) => used.has(p.id))
      .map((p) => ({
        pieceId: p.id,
        name: p.name,
        source: p.source,
        sourceUrl: urlBySource.get(p.source) ?? '',
        quantity: Math.max(1, perSetQty.get(p.id) ?? 1),
        poly: p.poly.map((pt) => ({ xCm: r2(pt.x), yCm: r2(pt.y) })),
        bboxWCm: r2(p.bboxW),
        bboxHCm: r2(p.bboxH),
        areaCm2: r2(p.areaCm2),
        // v2 identity: the DXF block name as the file spells it, and the cut-piece it resolved
        // to. Both may be '' — a marker whose pieces are unresolved is still a valid norm, it
        // just displays by the name it saved.
        blockName: p.blockName ?? '',
        pieceLineKey: args.pieceLineKeyById?.get(p.id) ?? '',
      })),
    placements: result.placements.map((pl) => ({
      pieceId: pl.pieceId,
      instance: pl.instance,
      rotDeg: pl.rot,
      xCm: r2(pl.x),
      yCm: r2(pl.y),
      // ЗЕРКАЛО, схема 3. Договор целиком живёт в lib/nesting/types.ts:
      //   placed(p) = R(rot) · M^flipped · p + (x, y),  M: (x, y) ↦ (−x, y)
      // Здесь переезжает только БУЛЕВО ЗНАЧЕНИЕ — ни координаты, ни поворот от зеркала не
      // зависят, потому что отражение применяется ДО поворота и в собственной системе детали.
      //
      // Пишется ВСЕГДА, а не только когда true. Блоб — единственная запись раскладки, и `false`
      // в нём значит «клиент знал про зеркало и эта деталь не отражена», тогда как отсутствие
      // ключа значит «писал клиент, который про зеркало не знал». Различать их нужно ровно
      // потому, что версия 3 заявлена безусловно (см. выше): читатель ветвится по ПОЛЮ, а не по
      // номеру, и молчаливый пропуск здесь превратил бы каждую зеркальную деталь в обычную при
      // первом же переоткрытии — тот самый брак, ради которого поле и заводили.
      flipped: pl.flipped === true,
    })),
    warnings: [...(args.parseWarnings ?? []), ...result.warnings],
  };
}

// ── stored marker → view model ──────────────────────────────────────────────────────────

const ROTS: RotationDeg[] = [0, 90, 180, 270];

export function markerToView(marker: common_TechCardMarker): {
  pieces: PieceDTO[];
  result: NestResult;
  widthCm: number;
  targetCm?: number;
} {
  // Generated types spell every key as required-but-undefined, so a bare {} does not
  // assign; the cast is safe because every property is `| undefined`.
  const s = (marker.summary ?? {}) as common_TechCardMarkerSummary;
  const l = (marker.layout ?? {}) as common_TechCardMarkerLayout;
  const pieces: PieceDTO[] = (l.pieces ?? []).map((p) => ({
    id: p.pieceId ?? 0,
    name: p.name || `деталь ${p.pieceId ?? 0}`,
    // v1 blobs have no block_name; '' keeps the round-trip honest instead of re-deriving one
    // from the display name (which may already be the synthetic «деталь N»).
    blockName: p.blockName || '',
    source: p.source || '',
    poly: (p.poly ?? []).map((pt) => ({ x: pt.xCm ?? 0, y: pt.yCm ?? 0 })),
    bboxW: p.bboxWCm ?? 0,
    bboxH: p.bboxHCm ?? 0,
    areaCm2: p.areaCm2 ?? 0,
  }));
  const result: NestResult = {
    placements: (l.placements ?? []).map((pl) => ({
      pieceId: pl.pieceId ?? 0,
      instance: pl.instance ?? 0,
      rot: (ROTS.includes((pl.rotDeg ?? 0) as RotationDeg) ? pl.rotDeg ?? 0 : 0) as RotationDeg,
      x: pl.xCm ?? 0,
      y: pl.yCm ?? 0,
      // Обратная сторона записи выше. Отсутствие ключа (блоб схемы 1/2, сохранённый до Ф1) —
      // это ОТВЕТ «не отражено», а не пробел: зеркала тогда не существовало, выразить его было
      // нечем. Поэтому `=== true`, а не `??`-цепочка к какому-нибудь умолчанию: единственный
      // источник зеркальности — этот флаг, и выводить её из чего-то ещё (из чётности instance,
      // из имени детали) запрещено договором в types.ts.
      flipped: pl.flipped === true,
    })),
    usedLengthCm: decNum(s.usedLengthCm),
    efficiency: decNum(s.efficiencyPct) / 100,
    placedCount: s.placedCount ?? (l.placements ?? []).length,
    totalCount: s.totalCount ?? (l.placements ?? []).length,
    // A STORED marker is a layout, not a run: nothing about it is unplaced (a marker whose
    // pieces did not all fit was never savable — the save gate требует placed === total),
    // nobody cancelled it, and it carries no telemetry. Stating that here rather than
    // leaving the fields optional keeps the reader from having to ask which case it holds.
    unplaced: [],
    generation: 0,
    elapsedMs: 0,
    cancelled: false,
    warnings: l.warnings ?? [],
  };
  const target = l.params?.targetLengthCm ?? 0;
  return {
    pieces,
    result,
    widthCm: decNum(s.fabricWidthCm) || 140,
    targetCm: target > 0 ? target : undefined,
  };
}
