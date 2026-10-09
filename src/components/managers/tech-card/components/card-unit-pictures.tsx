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
// ТОЛЬКО ПРИ DXF. Нет контуров — провайдер отдаёт null, и каждая поверхность рисуется байт-в-байт
// как вчера (`useUnitPicture` → null → глифа нет). Граф пересчитывается только при смене
// контуров, деталей или BOM; правка шагов пересчитывает одни раскладки узлов.
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type { SeamGraph, SkeletonProposal } from 'lib/assembly-skeleton/types';
import { unitPictures, type UnionPicture } from 'lib/assembly-skeleton/union';
import { useMemo, type ReactNode } from 'react';
import { useWatch } from 'react-hook-form';

import { buildSkeletonFacts, skeletonCategoryOf } from './assembly-skeleton-source';
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

  // Подписи, а не ссылки: форма пересобирает массивы на каждую правку любого поля.
  const pieceSig = pieces
    .map((p) => [p.lineKey, p.name, p.cutSymmetry, p.piecesPerGarment].join('|'))
    .join('~');
  const bomSig = (bomItems ?? []).map((l) => [l.lineKey, l.kind, l.purpose].join('|')).join('~');
  const unitSig = operations
    .map((o) => `${(o.outputUnitKey ?? '').trim()}<${(o.inputKeys ?? []).join(',')}`)
    .join('~');
  const catSig = (categoryNames ?? []).join('|');

  const graph = useMemo<SeamGraph | null>(() => {
    if (!shapes || ![...shapes.values()].some(Boolean)) return null;
    const hasLining = [...(cloth?.values() ?? [])].some((c) => c.state === 'lining');
    const { facts } = buildSkeletonFacts({
      pieces,
      shapes,
      cloth,
      bomLines: (bomItems ?? []) as Parameters<typeof buildSkeletonFacts>[0]['bomLines'],
      category: skeletonCategoryOf(categoryNames ?? [], hasLining),
      defaultMachineType: null,
    });
    if (facts.pieces.length === 0) return null;
    try {
      return readSeamGraph(facts);
    } catch {
      // Пиктограмма — подсказка, не данные: сбой чтения выкройки не должен ронять вкладку.
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, cloth, pieceSig, bomSig, catSig]);

  const pictures = useMemo(() => {
    if (!graph) return null;
    const map = unitPictures(
      graph,
      operations.map((o) => ({
        inputs: (o.inputKeys ?? []).filter(Boolean),
        outputUnitKey: (o.outputUnitKey ?? '').trim(),
      })),
    );
    return map.size > 0 ? map : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, unitSig]);

  return <UnitPicturesProvider pictures={pictures}>{children}</UnitPicturesProvider>;
}
