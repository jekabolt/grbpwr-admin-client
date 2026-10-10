// ПИКТОГРАММЫ УЗЛОВ КАРТОЧКИ — кто их считает и для кого.
//
// Два читателя, одна арифметика (`lib/assembly-skeleton`: граф швов A3 → узлы B → второй проход
// A4 → `unitPictures`):
//   • панель каркаса рисует узлы ПРЕДЛОЖЕНИЯ — граф приезжает в самом предложении
//     (`proposal.graph`), пересчитывать нечего (`proposalUnitPictures`);
//   • поверхности сборки (схема, фулскрин, рельс, полка) и печать рисуют узлы, которые УЖЕ лежат в
//     карточке: `CardUnitPicturesProvider` читает форму (детали, BOM, шаги), строит граф по
//     контурам деталей и кладёт карту «ключ узла → пиктограмма» в контекст `UnitPicturesProvider`.
//
// ТОЛЬКО ПРИ DXF И УЗЛАХ. Нет контуров или ни один шаг не объявил узел — граф не читается вовсе,
// провайдер отдаёт null, и каждая поверхность рисуется байт-в-байт как вчера.
//
// ГРАФ — НЕ РЕНДЕРНАЯ РАБОТА. Чтение выкройки стоит 46 мс (25 деталей) … 100 мс (46), а форма
// пересобирает массивы на КАЖДЫЙ символ любого поля, и карта контуров `usePieceShapes` меняет
// ссылку на каждую правку BOM. Поэтому: (1) ключ — ПОДПИСЬ СОДЕРЖИМОГО (ключ детали + личность
// её контура, имя, симметрия, ткань, строки BOM, что решают за граф), а не ссылки на карты;
// (2) подпись отстаивается (набор имени детали не читает граф на каждую букву); (3) сам расчёт —
// в простое браузера, вне кадра набора; (4) больше CAP_PIECES деталей — пиктограмм нет, молча.
// Правка шагов пересчитывает одни раскладки узлов, граф не трогает.
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type { SeamGraph, SkeletonProposal } from 'lib/assembly-skeleton/types';
import { unitPictures, type UnionPicture } from 'lib/assembly-skeleton/union';
import type { PieceDTO } from 'lib/nesting/types';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWatch } from 'react-hook-form';

import { cardSeamDecisions, useCardSeamsSig } from './assembly-seams/seams-store';
import { buildSkeletonFacts, skeletonCategoryOf, skeletonLined } from './assembly-skeleton-source';
import { pieceRefKey } from './piece-block-refs';
import type { PieceCloth } from './piece-cloth';
import type { TechCardFormData } from './schema';
import { UnitPicturesProvider, UnitTile } from './unit-silhouette';
import type { PieceShapeMap } from './use-piece-shapes';

const cache = new WeakMap<SkeletonProposal, Map<string, UnionPicture>>();

/** Пиктограммы узлов предложения каркаса, по одной на предложение (кэш живёт, пока живёт оно). */
export function proposalUnitPictures(proposal: SkeletonProposal): Map<string, UnionPicture> {
  const hit = cache.get(proposal);
  if (hit) return hit;
  // Append mode: the card's own units (taken as inputs) are drawn from the same graph.
  const before = (proposal.existing ?? []).map((s) => ({
    inputs: s.inputs.map((i) => i.key),
    outputUnitKey: s.outputUnitKey,
  }));
  const map = proposal.graph
    ? unitPictures(proposal.graph, [
        ...before,
        ...proposal.steps.map((s) => ({ inputs: s.inputs, outputUnitKey: s.outputUnitKey })),
      ])
    : new Map<string, UnionPicture>();
  cache.set(proposal, map);
  return map;
}

/** Плитка узла предложения — слот `renderUnit` панели каркаса; без пиктограммы — ничего. */
export function renderProposalUnit(
  unitKey: string,
  name: string,
  proposal: SkeletonProposal,
): ReactNode {
  const picture = proposalUnitPictures(proposal).get(unitKey);
  if (!picture) return null;
  const names = new Map(proposal.graph?.pieces.map((p) => [p.pieceKey, p.name]) ?? []);
  return <UnitTile picture={picture} name={name} nameOf={(k) => names.get(k) ?? k} />;
}

type FormPiece = TechCardFormData['pieces'][number];
type FormOp = NonNullable<TechCardFormData['operations']>[number];

/** Above this many pieces with a contour the card draws no unit pictograms (and says nothing). */
const CAP_PIECES = 80;
/** How long a facts signature must stand still before the graph is read for it. */
const SETTLE_MS = 400;

/** A contour by what it is, not by which Map holds it: file, block, id, size of the ring. */
const contourSig = (p: PieceDTO) =>
  `${p.source}:${p.id}:${p.blockName ?? ''}:${p.poly?.length ?? 0}:${p.areaCm2 ?? 0}`;

/**
 * Карта пиктограмм узлов, которые уже есть в карточке, — над поверхностями сборки и печатью.
 * `shapes` — та же карта контуров, что рисует плитки деталей; null (нет DXF / ещё не разобрано)
 * значит «пиктограмм нет», и дети рисуются как без провайдера.
 */
export function CardUnitPicturesProvider({
  shapes,
  cloth,
  categoryNames,
  children,
}: {
  shapes: PieceShapeMap;
  cloth: ReadonlyMap<string, PieceCloth> | null;
  categoryNames?: ReadonlyArray<string>;
  children: ReactNode;
}) {
  const pieces = (useWatch<TechCardFormData>({ name: 'pieces' }) ?? []) as FormPiece[];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const operations = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOp[];
  const aliases = (useWatch<TechCardFormData>({ name: 'pieceDxfAliases' }) ??
    []) as TechCardFormData['pieceDxfAliases'];
  const patterns = (useWatch<TechCardFormData>({ name: 'patterns' }) ??
    []) as TechCardFormData['patterns'];

  // (а) Нет ни одного шага, который что-то соединяет или объявляет узел, — граф не нужен никому:
  // ни пиктограммам (им нужны узлы), ни карте сборки (ей нужны входы шагов).
  const hasUnits = operations.some(
    (o) => (o?.outputUnitKey ?? '').trim() !== '' || (o?.inputKeys ?? []).length > 1,
  );

  // (б) Подписи, а не ссылки: форма пересобирает массивы на каждую правку любого поля, а карта
  // контуров меняет ссылку на каждую правку BOM. В подпись входит ровно то, что читает граф.
  let contoured = 0;
  const pieceSig = pieces
    .map((p) => {
      const key = (p.lineKey ?? '').trim();
      const found = key ? shapes?.get(pieceRefKey(key)) : null;
      if (found) contoured += 1;
      const contour = found
        ? [found.piece, ...(found.layers ?? [])].map(contourSig).join(',')
        : '-';
      return [key, p.name, p.cutSymmetry, p.piecesPerGarment, cloth?.get(key)?.state, contour].join(
        '|',
      );
    })
    .join('~');
  const bomSig = (bomItems ?? []).map((l) => [l.kind, l.purpose, l.lineKey].join('|')).join('~');
  // Lining is read from the block links and pattern files too (skeletonLined): they are facts.
  const linkSig = [
    ...(aliases ?? []).map((a) => [a.pieceLineKey, a.bomLineKey, a.fabricPurpose].join('|')),
    ...(patterns ?? []).map((p) => [p.bomLineKey, p.fabricPurpose].join('|')),
  ].join('~');
  const catSig = (categoryNames ?? []).join('|');
  const seamsSig = useCardSeamsSig(); // SEAMS Need A: a decision re-reads the graph
  const factsSig =
    hasUnits && shapes && contoured > 0 && contoured <= CAP_PIECES
      ? `${pieceSig}#${bomSig}#${catSig}#${linkSig}#${seamsSig}`
      : '';

  // (в) Подпись отстаивается, граф читается в простое — вне кадра, в котором набирают.
  const [graph, setGraph] = useState<{ sig: string; graph: SeamGraph | null } | null>(null);
  const live = useLatest({ pieces, bomItems, shapes, cloth, categoryNames, aliases, patterns });
  useEffect(() => {
    if (!factsSig) {
      setGraph(null);
      return;
    }
    let cancelled = false;
    let idle: number | null = null;
    const timer = window.setTimeout(() => {
      const read = () => {
        if (cancelled) return;
        const v = live.current;
        const bomLines = (v.bomItems ?? []) as Parameters<typeof buildSkeletonFacts>[0]['bomLines'];
        // The panel's own reading of category and lining — one graph for the proposal, the
        // assembly surfaces and the print sheet.
        const lined = skeletonLined({
          cloth: v.cloth,
          pieces: v.pieces,
          aliases: v.aliases ?? [],
          patterns: v.patterns ?? [],
          bomLines,
        });
        const { facts } = buildSkeletonFacts({
          pieces: v.pieces,
          shapes: v.shapes,
          cloth: v.cloth,
          bomLines,
          category: skeletonCategoryOf(v.categoryNames ?? [], lined),
          defaultMachineType: null,
          aliases: v.aliases ?? [],
        });
        let g: SeamGraph | null = null;
        if (facts.pieces.length > 0) {
          try {
            g = readSeamGraph(facts, undefined, {}, cardSeamDecisions(facts));
          } catch {
            // Пиктограмма — подсказка, не данные: сбой чтения выкройки не должен ронять вкладку.
            g = null;
          }
        }
        if (!cancelled) setGraph({ sig: factsSig, graph: g });
      };
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (ric) idle = ric(read, { timeout: 2000 });
      else read();
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const cic = (window as Window & { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback;
      if (idle != null && cic) cic(idle);
    };
  }, [factsSig, live]);

  const unitSig = operations
    .map((o) => `${(o.outputUnitKey ?? '').trim()}<${(o.inputKeys ?? []).join(',')}`)
    .join('~');
  // Только граф ТЕКУЩЕЙ подписи: пока новая отстаивается, пиктограмм нет — старый граф мог быть
  // прочитан с других деталей (другая карточка, перепривязанный дублерин) при тех же кодах узлов.
  const current = factsSig && graph?.sig === factsSig ? graph.graph : null;
  const pictures = useMemo(() => {
    if (!current) return null;
    const map = unitPictures(
      current,
      operations.map((o) => ({
        inputs: (o.inputKeys ?? []).filter(Boolean),
        outputUnitKey: (o.outputUnitKey ?? '').trim(),
      })),
    );
    return map.size > 0 ? map : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, unitSig]);

  // Граф — и карте сборки: она читает ТОТ ЖЕ экземпляр, второго чтения выкройки нет (§4 «Data»).
  // `settling` — новая подпись ещё отстаивается: карта держит прежнюю картинку, а не мигает.
  const seam = useMemo<CardSeamGraph>(
    () => ({ graph: current, settling: !!factsSig && graph?.sig !== factsSig }),
    [current, factsSig, graph?.sig],
  );
  return (
    <SeamGraphContext.Provider value={seam}>
      <UnitPicturesProvider pictures={pictures}>{children}</UnitPicturesProvider>
    </SeamGraphContext.Provider>
  );
}

export type CardSeamGraph = { graph: SeamGraph | null; settling: boolean };
const SeamGraphContext = createContext<CardSeamGraph>({ graph: null, settling: false });

/** Граф швов карточки, прочитанный провайдером пиктограмм; null — DXF нет / деталей больше CAP. */
export function useCardSeamGraph(): CardSeamGraph {
  return useContext(SeamGraphContext);
}

/** The latest render's values, readable from a deferred callback without re-arming it. */
function useLatest<T>(value: T): { readonly current: T } {
  const [box] = useState(() => ({ current: value }));
  box.current = value;
  return box;
}
