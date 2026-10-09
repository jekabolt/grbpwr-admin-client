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
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useWatch } from 'react-hook-form';

import { buildSkeletonFacts, skeletonCategoryOf } from './assembly-skeleton-source';
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
  const map = proposal.graph
    ? unitPictures(
        proposal.graph,
        proposal.steps.map((s) => ({ inputs: s.inputs, outputUnitKey: s.outputUnitKey })),
      )
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

  // (а) Нет ни одного объявленного узла — рисовать нечего, граф не нужен.
  const hasUnits = operations.some((o) => (o?.outputUnitKey ?? '').trim() !== '');

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
  const bomSig = (bomItems ?? []).map((l) => [l.kind, l.purpose].join('|')).join('~');
  const catSig = (categoryNames ?? []).join('|');
  const factsSig =
    hasUnits && shapes && contoured > 0 && contoured <= CAP_PIECES
      ? `${pieceSig}#${bomSig}#${catSig}`
      : '';

  // (в) Подпись отстаивается, граф читается в простое — вне кадра, в котором набирают.
  const [graph, setGraph] = useState<{ sig: string; graph: SeamGraph | null } | null>(null);
  const live = useLatest({ pieces, bomItems, shapes, cloth, categoryNames });
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
        const hasLining = [...(v.cloth?.values() ?? [])].some((c) => c.state === 'lining');
        const { facts } = buildSkeletonFacts({
          pieces: v.pieces,
          shapes: v.shapes,
          cloth: v.cloth,
          bomLines: (v.bomItems ?? []) as Parameters<typeof buildSkeletonFacts>[0]['bomLines'],
          category: skeletonCategoryOf(v.categoryNames ?? [], hasLining),
          defaultMachineType: null,
        });
        let g: SeamGraph | null = null;
        if (facts.pieces.length > 0) {
          try {
            g = readSeamGraph(facts);
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
  // Пока новая подпись отстаивается, рисуется граф прошлой: детали те же, сдвинулось имя.
  const current = factsSig ? graph?.graph ?? null : null;
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

  return <UnitPicturesProvider pictures={pictures}>{children}</UnitPicturesProvider>;
}

/** The latest render's values, readable from a deferred callback without re-arming it. */
function useLatest<T>(value: T): { readonly current: T } {
  const [box] = useState(() => ({ current: value }));
  box.current = value;
  return box;
}
